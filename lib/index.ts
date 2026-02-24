/* Parser and grammar for systemd ini-style files

This is implementing most of the logic from config_parse() in
https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c
and is therefore also licensed with the LGPL-2.1

It's also mostly rewritten in go for podman, in Parse():
https://github.com/containers/podman/blob/main/pkg/systemd/parser/unitfile.go
*/

import { Parser } from "./parser.js";
import type { ParsedValue, ParseFunc, ParseOptions } from "./document.js";

function parse<F extends ParseFunc | void = void>(
  input: string,
  options: ParseOptions<F> = {},
): Record<string, Record<string, ParsedValue<F>[]>> {
  const parser = new Parser(input, options);
  return parser.parse();
}

function parseDocument<F extends ParseFunc | void = void>(input: string, options: ParseOptions<F> = {}): Parser<F> {
  const parser = new Parser(input, options);
  parser.parse();

  return parser;
}

export { Parser, parse, parseDocument };
export type { ParsedValue, ParseFunc, ParseOptions };
