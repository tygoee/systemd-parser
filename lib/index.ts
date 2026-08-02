/* Parser and grammar for systemd ini-style files

This is implementing the workflow from config_parse() in
https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c

It's also mostly rewritten in go for podman, in Parse():
https://github.com/containers/podman/blob/main/pkg/systemd/parser/unitfile.go
*/

import { Parser } from "./parser.js";
import { sectionValidator, trailingNewlines, trimWhitespace } from "./document.js";
import type { ParsedOutput, ParsedValue, ParseFunc, ParseOptions, Severity } from "./document.js";

function parse<F extends ParseFunc | void = void>(
  input: string,
  options: ParseOptions<F> = {},
): ParsedOutput<ParsedValue<F>> {
  const parser = new Parser(input, options);
  return parser.parse();
}

function parseDocument<F extends ParseFunc | void = void>(input: string, options: ParseOptions<F> = {}): Parser<F> {
  const parser = new Parser(input, options);
  parser.parse();

  return parser;
}

function generate(input: ParsedOutput<string>) {
  const lines: string[] = [];

  for (const [section, assignments] of Object.entries(input)) {
    if (sectionValidator.test(section)) throw TypeError(`Bad characters in section header`);

    lines.push(`[${section}]`);
    for (let [key, values] of Object.entries(assignments)) {
      for (let value of values) {
        key = key.replace(trimWhitespace, "");
        value = value.replace(trimWhitespace, "");
        if (!key) throw TypeError("Key is empty");
        if (value[value.length - 1] === "\\") value += " "; // escape the backslash

        lines.push(`${key}=${value}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n").replace(trailingNewlines, "\n");
}

export { Parser, parse, parseDocument, generate };
export type { ParsedValue as ParsedValue, ParseFunc, ParseOptions, Severity };
