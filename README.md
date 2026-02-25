# Systemd parser

Round-trip systemd configuration file parser.

Usage / documentation:

- `parse(input, options)`:

```js
import { parse } from "systemd-parser"

const input = "[Section]\nKey=Value"
const output = parse(input, {
  // A function that executes upon successful assignment.
  // If it returns something, it'll be used as value parser, changing the result
  func: (section: string, key: string, value: string) => {};
  warnFunc: (message: string, lineNum: number, severity: "hint"|"info"|"warning"|"error") => {}; // Ran on warnings

  logWarns: false;  // Log parsing warnings to the console
  strict: false;  // Make parsing fail on wrong syntax

  includePrefixed: false; // default false, include keys prefixed with X-
  allowedKeys: { Section: [ "Key1", "Key2" ] }; // object of allowed sections and keys. Prefix '-' to ignore a key
  includeDisallowed: false; // include keys not allowed by allowedKeys
})

// output: { "Section": { "Key": [ "Value" ] } }
```

- `generate(input)`:

```js
import { generate } from "systemd-parser";

const input = { Section: { Key: ["Value"] } };
const output = generate(input);
// [Section] Key=Value
```

- `parseDocument(input)`:

```js
import { parseDocument } from "systemd-parser"

const doc = parseDocument("[Section]\nKey=Value")
// doc.output: { "Section": { "Key": [ "Value" ] } }

doc.add('Section', 'Key', 'ThirdValue')
doc.add('Section', 'Key', 'SecondValue', 1) // insert
// doc.content: [Section] Key=Value Key=SecondValue Key=ThirdValue

doc.set('Section', 'Key' 'OtherValue', 1)
// doc.content: [Section] Key=Value Key=OtherValue Key=ThirdValue

doc.remove('Section', 'Key', 1)
// doc.content: [Section] Key=Value Key=ThirdValue

doc.set('Section', 'Key', 'Value') // resets all instances
// doc.content: [Section] Key=Value

doc.remove('Setion', 'Key', 'Value') // removes all instances
// doc.content: ""
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

This project uses the MIT license. It uses some of the logic from Red Hat for parsing systemd ini files, which is licensed under both LGPL-2.1+ [[1]](https://github.com/systemd/systemd/blob/main/src/shared/conf-parser.c) and Apache-2.0 [[2]](https://github.com/containers/podman/blob/main/pkg/systemd/parser/unitfile.go). For more details, see [NOTICE](./NOTICE)
