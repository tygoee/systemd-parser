# Systemd parser

Systemd configuration file parser. This is not stable, don't use it in production.

Usage / documentation:

```js
import { SystemD } from "systemd-parser"

// Parsing from an input string
const input = "[Section]\nKey=Value"
SystemD.parse(input, {
  // A function that executes upon successful assignment.
  // If it returns something, it'll be used as value parser, changing the result
  func: (section: string, key: string, value: string) => {}

  logWarns: false  // Logs parsing warnings to the console
  strict: false  // Fails on wrong syntax
})
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

This project uses the LGPL-2.1+ license, as it copies a lot of the logic from systemd, of which the used parts are licensed under the same license.
