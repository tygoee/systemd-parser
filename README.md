# Systemd parser

Systemd configuration file parser preserving comments and structure. Windows files with CRLF line endings are not supported. Systemd ignores trailing whitespace so `\r` will not often be an issue, except with values spanning multiple lines, where every line must be escaped with a backslash **at the end**, which does not work if there's a carriage return before it.

This parser tries to use the same value parsing logic as used in the source code:

- It goes through all lines of the file, removing comments and joining lines that are continued with `\`. See `parse()`
- Then it passes that to a function which adds it to the document (`generateOutput()`). It does that by:
  - Parsing the line for assignments/sections. In here also checks if the keys exist in the section, when configured. See `parseLine()`
  - Adding it to the document. In the case of an assigment, it parses your value with `options.parseFunc()`, when it's defined.

# Usage and documentation

- `parse(input, options)`:

Parses the `input` string to return an object containing all sections with keys and values. `options` is an object with options shown in the example below.

```js
import { parse } from "systemd-parser"

const input = "[Section]\nKey=Value"
const output = parse(input, {
  // Function that parses input text values to any data type for the output.
  // When it doesn't return anything, values return like in the document
  // parser is the current parser object that's passed and can be used for e.g. warnings
  parseFunc: (section: string, key: string, value: string, parser?: Parser) => {};
  // Function that serializes those values back into text strings.
  // When it doesn't return anything, the parser tries to input the value as a string
  // These warnings can be accessed via doc.serializationWarnings and can be any array
  serializeFunc: (section: string, key: string, value: {}, warnings?: any[]) => string | undefined;

  warnFunc: (
    message: string,
    severity: Severity, // "hint" | "info" | "warning" | "error",
    location: [number, number, number] // line number (1-based), from char, to char
  ) => {}; // Ran on warnings

  logWarns: false;  // Log parsing warnings to the console
  strict: false;  // Make parsing fail on wrong syntax

  includePrefixed: false; // Include keys prefixed with X-
  allowedKeys: { Section: [ "Key1", "Key2" ] }; // Object of allowed sections and keys.
  includeDisallowed: false; // Include keys not allowed by allowedKeys, when allowedKeys is specified
})

// output: { "Section": { "Key": [ "Value" ] } }
```

- `generate(input)`:

Generates a systemd file from the input object containing all sections with keys and values.

```js
import { generate } from "systemd-parser";

const input = { Section: { Key: ["Value"] } };
const output = generate(input);
// [Section] Key=Value
```

- `parseDocument(input)`:

Parses the `input` string to return a modifiable `Document` class with metadata like parser warnings. `options` is an object with options shown in the example below.

The output containing all sections with keys and values is accessed with `doc.output`, the string containing the modified file is accessed with `doc.content`

- `doc.add(seection, key, value, index?)`: Add an assignment (key=value) to a section, optionally after the indexth assignment. When index is undefined or below 0, it's ignored
- `doc.set(section, key, value, index?)`: Replace assignment at index with different assignment. When index is undefined or below 0, it removes all existing assignments.
- `doc.remove(section, key, index?, strict=true)`: Remove assignment at index. When index is undefined or below 0, it removes all instances. When `strict` is set to false, it will not throw on indexes out of range

```js
import { parseDocument } from "systemd-parser";

const options = {}; // see the first example for all options
const doc = parseDocument("[Section]\nKey=Value", options);
// doc.output: { "Section": { "Key": [ "Value" ] } }

doc.add("Section", "Key", "ThirdValue");
doc.add("Section", "Key", "SecondValue", 1); // insert
// doc.content: [Section] Key=Value Key=SecondValue Key=ThirdValue

doc.set("Section", "Key", "OtherValue", 1);
// doc.content: [Section] Key=Value Key=OtherValue Key=ThirdValue

doc.remove("Section", "Key", 1);
// doc.content: [Section] Key=Value Key=ThirdValue

doc.set("Section", "Key", "Value"); // resets all instances
// doc.content: [Section] Key=Value

doc.remove("Setion", "Key", "Value"); // removes all instances
// doc.content: ""
```

The parser also lets you reuse a doc object for an interactive editor, by automatically reparsing upon setting `doc.content`. For example:

```js
import { parseDocument, generate } from "systemd-parser";

const doc = parseDocument(generate({ Section: { Key: ["Value1"] } }));
// doc.content: [Section] Key=Value1
// doc.output: { "Section": { "Key": [ "Value1" ] } }

doc.content = generate({ Section: { Key: ["Value2"] } });
// doc.content: [Section] Key=Value2
// doc.output: { "Section": { "Key": [ "Value2" ] } }
```

## Systemd ini format

Basics of the file format are listed at [systemd.syntax(7)](https://www.freedesktop.org/software/systemd/man/latest/systemd.syntax.html). For more, see the references below.

# References

- Syntax Docs, systemd.syntax(7): <https://www.freedesktop.org/software/systemd/man/latest/systemd.syntax.html>
- Unit docs, systemd.unit(5): <https://www.freedesktop.org/software/systemd/man/latest/systemd.unit.html>
- Source code: <https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c>
- Tests: <https://github.com/systemd/systemd/blob/main/src/test/test-conf-parser.c>

---

- Podman generator source code: <https://github.com/containers/podman/blob/main/cmd/quadlet/main.go>
- Podman parser source code: <https://github.com/containers/podman/blob/main/pkg/systemd/parser/unitfile.go>
- Tests: <https://github.com/containers/podman/tree/main/test/e2e/quadlet>

## License

This project uses the MIT license. It uses some of the logic from Red Hat for parsing systemd ini files, which is licensed under both LGPL-2.1+ [[1]](https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c) and Apache-2.0 [[2]](https://github.com/podman-container-tools/podman/blob/main/pkg/systemd/parser/unitfile.go). For more details, see [NOTICE](./NOTICE)
