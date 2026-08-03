import { Document, sectionValidator, trimWhitespace, trimWhitespaceStart } from "./document.js";
import type { ParseFunc, ParseOptions, Severity } from "./document.js";

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

type Warning = [string, Severity, [number, number, number]];

export class Parser<F extends ParseFunc | void = void> extends Document<F> {
  /** message, severity, [line (1-based), from char, to char] */
  warnings: Warning[];
  #section: string;

  /** Current line, 1-based */ #lineNum: number;
  /** Start line of current node, 1-based */ #lineFrom: number;
  /** Array of line lengths by line, 1-based */ #lineLengths: number[];

  constructor(input: string, options: ParseOptions<F> = {}) {
    super(input, options);
    this.parserFunc = this.parse;
    this.warnings = this.#warningsProxy();
    this.#section = "";

    this.#lineNum = 1;
    this.#lineFrom = 1;
    this.#lineLengths = [0]; // 1 value already since it's 1-based
  }

  #getLineLength(): number {
    return this.#lineLengths.slice(this.#lineFrom, this.#lineNum + 1).reduce((sum, len) => sum + len, 0);
  }

  /** Don't pass a location to use the current one. Location: line number (1-based), from char, to char */
  warn(message: string, severity: Severity = "warning", location?: [number, number, number]): { type: "none" } {
    if (!location) location = [this.#lineFrom, 0, this.#getLineLength()];

    if (this.options.logWarns) console.warn(`${location[0]}:${location[1]}: ${message}`);
    if (this.options.strict && !["hint", "info"].includes(severity))
      throw new SyntaxError(`${location[0]}:${location[1]}: ${message}`);
    this.warnings.push([message, severity, location]);

    return { type: "none" };
  }

  #warningsProxy(): Warning[] {
    const self = this;
    return new Proxy([], {
      set(target: Warning[], prop: string | symbol, value: Warning): boolean {
        if (isNaN(Number(prop))) return true;
        if (typeof self.options.warnFunc === "function") self.options.warnFunc(...value);

        target[Number(prop)] = value;
        return true;
      },
    });
  }

  #parseLine(line: string): ParsedLine {
    if (!line) return { type: "none" };

    // Section
    if (line[0] === "[") {
      if (line[line.length - 1] !== "]") return this.warn(`Invalid section header, ignoring line.`);

      const name = line.slice(1, -1);

      // The section name may not contain control chars, quotes or backslashes
      if (sectionValidator.test(name)) return this.warn(`Invalid section header, ignoring line.`);

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

  #updateOutput(joinedLine: string, rawLine: string) {
    const parsed = this.#parseLine(joinedLine);

    if (parsed.type === "section") {
      // placed at the beginning because type=assignment needs it (don't skip with unknown section)
      this.#section = parsed.name;

      if (
        typeof this.options.allowedKeys === "object" &&
        !Object.keys(this.options.allowedKeys).includes(parsed.name)
      ) {
        this.warn("Unkown section. Ignoring.");
        if (!this.options.includeDisallowed) return;
      }

      this.doc.push({ type: "section", name: parsed.name, fromLine: this.#lineNum, toLine: this.#lineNum });
    } else if (parsed.type === "assignment") {
      if (!this.#section) return void this.warn("Assignment outside of section. Ignoring.");
      if (!this.options.includePrefixed && parsed.key.startsWith("X-")) return;

      const section = this.options.allowedKeys?.[this.#section];
      if (typeof this.options.allowedKeys === "object" && !section?.includes(parsed.key)) {
        this.warn("Unknown key. Ignoring", "warning", [this.#lineFrom, 0, rawLine.indexOf("=") - 1]);
        if (!this.options.includeDisallowed) return;
      }

      const result =
        typeof this.options.parseFunc === "function"
          ? this.options.parseFunc(this.#section, parsed.key, parsed.value)
          : parsed.value;

      const valueIndex = rawLine.indexOf("=") + 1;
      this.doc.push({
        type: "assignment",
        key: parsed.key,
        rawValue: rawLine.slice(valueIndex),
        joinedValue: joinedLine.slice(valueIndex),
        value: result,
        fromLine: this.#lineFrom,
        toLine: this.#lineNum,
      });
    } else {
      if (!rawLine.replace(trimWhitespace, "")) this.doc.push({ type: "blank" });
      else this.doc.push({ type: "invalid", content: rawLine });
    }
  }

  parse(): typeof this.output_mut {
    // CRLF could be broken, but systemd works on Linux. Could become a stream for efficiency
    // Adds a first value as line numbers count from 1 instead of 0
    const lines = ["", ...this.content_mut.split("\n")];
    let rawLine = "";
    let continuation = "";

    this.warnings = this.#warningsProxy();
    this.doc = [];

    this.#section = "";
    this.#lineFrom = 1;
    this.#lineLengths = [0]; // 1 value already since it's 1-based
    for (this.#lineNum = 1; this.#lineNum < lines.length; this.#lineNum++) {
      let line = lines[this.#lineNum]!;
      this.#lineLengths.push(line.length + 1); // include newline
      if (!continuation) this.#lineFrom = this.#lineNum;

      if (line.length > maxLength) throw new SyntaxError(`${this.#lineNum}: Line too long`);

      // Seperately trim leading whitespace to find comments. Inline comments don't exist in systemd
      // Don't stop on empty lines yet as they have to stop continuation
      const trimmed = line.replace(trimWhitespaceStart, "");
      if (trimmed[0] === "#" || trimmed[0] === ";") {
        this.doc.push({
          type: "comment",
          content: trimmed.slice(1),
          delimiter: trimmed[0],
          fromLine: this.#lineNum,
          toLine: this.#lineNum,
        });
        continue;
      }

      // The logic beneath differs from the original to preserve the raw line
      if (continuation) {
        if (continuation.length + line.length > maxLength)
          throw new SyntaxError(`${this.#lineNum}: Continuation line too long`);
        if (!trimmed) {
          this.warn("Continuation has been terminated by empty line", "info");

          this.#updateOutput(continuation, rawLine);
          continuation = "";
          rawLine = "";

          this.#updateOutput(line, line);
          continue;
        }

        continuation += line;
        rawLine += "\n" + line;
      }

      let logical = continuation || line;
      if (logical[logical.length - 1] === "\\") {
        // lines with backslash are called 'escaped'
        continuation = logical.slice(0, -1) + " ";
        if (!rawLine) rawLine = logical;
        continue;
      }

      this.#updateOutput(logical, rawLine || line);
      continuation = "";
      rawLine = "";
    }

    if (continuation) {
      this.#updateOutput(continuation, rawLine);
    }

    this.generatorFunc();
    return this.output_mut;
  }
}
