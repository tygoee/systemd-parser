import { Document, sectionValidator, trimWhitespace, trimWhitespaceStart } from "./document.js";
import type { ParseFunc, ParseOptions } from "./document.js";

const maxLength = 1048576; // 1 MiB

type ParsedLine =
  | {
      type: "section";
      name: string;
    }
  | {
      type: "assignment";
      key: string;
      value: string;
    }
  | {
      type: "none";
    };

export class Parser<F extends ParseFunc | void = void> extends Document<F> {
  warnings: [string, number][]; /** message, line number */
  #section: string;
  #continuation: string;
  #lineNum: number;

  constructor(input: string, options: ParseOptions<F> = {}) {
    super(input, options);

    this.parseFunc = this.parse;
    this.warnings = [];
    this.#section = "";
    this.#continuation = "";
    this.#lineNum = 0;
  }

  warn(message: string, important: boolean = true): { type: "none" } {
    if (this.options.logWarns) console.warn(`${this.#lineNum}: ${message}`);
    if (this.options.strict && !important) throw SyntaxError(`${this.#lineNum}: ${message}`);
    this.warnings.push([message, this.#lineNum]);

    if (typeof this.options.warnFunc === "function") this.options.warnFunc(message, this.#lineNum, important);

    return { type: "none" };
  }

  #parseLine(line: string): ParsedLine {
    line = line.replace(trimWhitespace, "");
    if (!line) {
      if (this.#continuation) this.warn("Continuation terminated by empty line");
      return { type: "none" };
    }

    // Section
    if (line[0] === "[") {
      if (line[line.length - 1] !== "]") return this.warn(`Invalid section header, ignoring line.`);

      const name = line.slice(1, -1);

      // The section name may not contain control chars, quotes or backslashes
      if (sectionValidator.test(name)) return this.warn(`Bad characters in section header, ignoring line.`);

      // The checks done in the original are in updateOutput
      return { type: "section", name: name };
    }

    // Assignment (key=value)
    const equalsIndex = line.indexOf("=");
    if (equalsIndex === -1) return this.warn("Missing '=', ignoring line.");
    if (equalsIndex === 0) return this.warn("Missing key name before '=', ignoring line.");

    // The checks and functions from the original are in updateOutput
    return {
      type: "assignment",
      key: line.slice(0, equalsIndex).replace(trimWhitespace, ""),
      value: line.slice(equalsIndex + 1).replace(trimWhitespace, ""),
    };
  }

  #updateOutput(line: string) {
    const parsed = this.#parseLine(line);
    if (parsed.type === "section") {
      this.#section = parsed.name; // placed here because type=assignment needs it

      if (
        typeof this.options.allowedKeys === "object" &&
        !Object.keys(this.options.allowedKeys).includes(parsed.name)
      ) {
        this.warn("Unkown section. Ignoring.");
        if (!this.options.includeDisallowed) return;
      }

      this.lineNums.sections[parsed.name] = this.#lineNum;
      this.output_mut[parsed.name] ??= {};
    } else if (parsed.type === "assignment") {
      if (!this.#section) return void this.warn("Assignment outside of section. Ignoring.");
      if (!this.options.includePrefixed && parsed.key.startsWith("X-")) return;

      const section = this.options.allowedKeys?.[this.#section];
      if (typeof this.options.allowedKeys === "object" && !section?.includes(parsed.key)) {
        // allowedKeys prefixed with '-' are ignored without a warning
        if (section?.includes("-" + parsed.key)) return;

        this.warn("Unknown key. Ignoring");
        if (!this.options.includeDisallowed) return;
      }

      this.lineNums.sections[this.#section] = this.#lineNum;
      this.lineNums.assignments[this.#section] ??= {};
      this.lineNums.assignments[this.#section]![parsed.key] ??= [];
      this.lineNums.assignments[this.#section]![parsed.key]!.push(this.#lineNum);

      let result;
      if (typeof this.options.func === "function") result = this.options.func(this.#section, parsed.key, parsed.value);

      this.output_mut[this.#section] ??= {}; // to be sure, shouldn't be reachable
      this.output_mut[this.#section]![parsed.key] ??= [];
      this.output_mut[this.#section]![parsed.key]!.push(result !== undefined ? result : parsed.value);
    }
  }

  parse(): typeof this.output_mut {
    // CRLF could be broken, but systemd works on Linux. Could become a stream for efficiency
    // Adds a first value as line numbers count from 1 instead of 0
    const lines = ["", ...this.content.split("\n")];

    this.output_mut = {};
    this.lineNums = {
      sections: {},
      assignments: {},
    };
    this.warnings = [];

    this.#section = "";
    this.#continuation = "";
    for (this.#lineNum = 1; this.#lineNum < lines.length; this.#lineNum++) {
      let line = lines[this.#lineNum]!;

      if (line.length > maxLength) throw SyntaxError(`${this.#lineNum}: Line too long`);

      // Temporarily trim leading whitespace to find comments. Inline comments don't exist in systemd
      // Don't stop on empty lines yet as they have to stop continuation
      const trimmed = line.replace(trimWhitespaceStart, "");
      if (trimmed[0] === "#" || trimmed[0] === ";") continue;

      if (this.#continuation) {
        if (this.#continuation.length + line.length > maxLength)
          throw SyntaxError(`${this.#lineNum}: Continuation line too long`);
        this.#continuation += line;
      }

      let logical = this.#continuation || line;
      if (logical[logical.length - 1] === "\\") {
        // lines with backslash are called 'escaped'
        this.#continuation = logical.slice(0, -1) + " ";
        continue;
      }

      this.#updateOutput(logical);
      this.#continuation = "";
    }

    if (this.#continuation) this.#updateOutput(this.#continuation);

    return this.output_mut;
  }
}
