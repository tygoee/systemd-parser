/* Parser and grammar for systemd ini-style files

This is implementing most of the logic from config_parse() in
https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c
and is therefore also licensed with the LGPL-2.1

It's also mostly rewritten in go for podman, in Parse():
https://github.com/containers/podman/blob/main/pkg/systemd/parser/unitfile.go
*/

const maxLength = 1048576; // 1 MiB

// Only \t, \n, \r, and spaces
const trimWhitespaceStart = /^[ \t\n\r]+/;
const trimWhitespace = /^[ \t\n\r]+|[ \t\n\r]+$/g;

type WarnFunc = (message: string, lineNum: number) => { type: "none"; warn: [number, string] };

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
      warn?: [number, string];
    };

type ParseFunc = (section: string, key: string, value: string) => any;

// The generic is used to determine the return argument of func
type ParseOptions<F extends ParseFunc | void = void> = {
  // A function that executes upon successful assignment.
  // If it returns something (not void/undefined), it'll be used as value parser, changing the result
  func?: F;
  warnFunc?: () => void;

  logWarns?: boolean; // false
  strict?: boolean; // false
  // document?: boolean; // false, returns a markup-preserving document instead of simple key-value pairs
};

// If the return type contains/is void/undefined, the output can also be a string.
type ParsedValue<F> = F extends (section: string, key: string, value: string) => infer R
  ? R extends void | undefined
    ? Exclude<R, void | undefined> | string
    : R
  : string;

function parseLine(line: string, lineNum: number, warn: WarnFunc): ParsedLine {
  line = line.replace(trimWhitespace, "");
  if (!line) return { type: "none" };

  // Section
  if (line[0] === "[") {
    if (line[line.length - 1] !== "]") return warn(`Invalid section header, ignoring line.`, lineNum);

    const name = line.slice(1, -1);

    // The section name may not contain control chars, quotes or backslashes
    if (/[\x01-\x1f\x7f"'\\]/.test(name)) return warn(`Bad characters in section header, ignoring line.`, lineNum);

    // In the original it checks if the section is known and warns the user when it's unkown
    // It ignores when prefixed with X-. Known sections array has non-required sections prefixed with -
    // This is not done in here as it can be done post-parsing. Might be added later
    return { type: "section", name: name };
  }

  // Assignment (key=value)
  const equalsIndex = line.indexOf("=");
  if (equalsIndex === -1) return warn("Missing '=', ignoring line.", lineNum);
  if (equalsIndex === 0) return warn("Missing key name before '=', ignoring line.", lineNum);

  // In the original it now calls next_assignment, in which it looks up a parse-function map for values
  // This is not done in here as it can be done post-parsing. Might be added later
  return {
    type: "assignment",
    key: line.slice(0, equalsIndex).replace(trimWhitespace, ""),
    value: line.slice(equalsIndex + 1).replace(trimWhitespace, ""),
  };
}
function parse<F extends ParseFunc | void = void>(
  input: string,
  options: ParseOptions<F> = {},
): Record<string, Record<string, ParsedValue<F>[]>> {
  if (typeof input !== "string") throw TypeError("First function argument must be a string");
  if (typeof options !== "object") throw TypeError("Second function argument must be an object");

  const warn = (message: string, lineNum: number): { type: "none"; warn: [number, string] } => {
    if (options.logWarns) console.warn(`${lineNum}: ${message}`);
    if (options.strict) throw SyntaxError(`${lineNum}: ${message}`);

    return { type: "none", warn: [lineNum, message] };
  };

  // CRLF could be broken, but systemd works on Linux.
  // Also pretty memory inefficient but these files are usually really small
  const lines = input.split("\n");
  const output: Record<string, Record<string, ParsedValue<F>[]>> = {};

  let section = "";
  let continuation = "";
  const updateOutput = (line: string, lineNum: number) => {
    const parsed = parseLine(line, lineNum, warn);
    if (parsed.type === "section") section = parsed.name;
    else if (parsed.type === "assignment") {
      if (!section) return warn("Assignment outside of section. Ignoring.", lineNum);

      let result;
      if (typeof options.func === "function") result = options.func(section, parsed.key, parsed.value);

      output[section] ??= {};
      output[section]![parsed.key] ??= [];
      output[section]![parsed.key]?.push(result !== undefined ? result : parsed.value);
    }
  };

  for (let index = 0; index < lines.length; index++) {
    let line = lines[index]!;
    let lineNum = index + 1;
    if (line.length > maxLength) throw SyntaxError(`${lineNum}: Line too long`);

    // Temporarily trim leading whitespace to find comments. Inline comments don't exist in systemd
    // Don't stop on empty lines yet as they have to stop continuation
    const trimmed = line.replace(trimWhitespaceStart, "");
    if (trimmed[0] === "#" || trimmed[0] === ";") continue;

    if (continuation) {
      if (continuation.length + line.length > maxLength) throw SyntaxError(`${lineNum}: Continuation line too long`);
      continuation += line;
    }

    let logical = continuation || line;
    if (logical[logical.length - 1] === "\\") {
      // lines with backslash are called 'escaped'
      continuation = logical.slice(0, -1) + " ";
      continue;
    }

    updateOutput(logical, lineNum);
    continuation = "";
  }

  if (continuation) updateOutput(continuation, lines.length);
  return output;
}

export { parse };
