import { expect, test } from "vitest";
import { parse, generate, parseDocument } from "../lib/index.ts";

// Tests from https://github.com/systemd/systemd/blob/main/src/test/test-conf-parser.c
const tests = [
  `[Section]
setting1=1
`,

  /* no terminating newline */
  `[Section]
setting1=1`,

  /* some whitespace, no terminating newline */
  `\n\n\n\n[Section]\n\n
setting1=1`,

  /* repeated settings */
  `[Section]
[Section]
setting1=1
setting1=    2 \t
setting1=    1
`,

  /* empty line breaks continuation */
  /* repeated settings */
  `[Section]
[Section]
setting1=1
setting1=2\\
   \nsetting1=1
`,

  /* normal continuation */
  `[Section]
setting1=1\\
2\\
3
`,

  /* continuation is ignored in comment */
  /* normal continuation */
  `[Section]
#hogehoge\\
setting1=1\\
2\\
3
`,

  /* normal continuation */
  /* commented out line in continuation is ignored */
  `[Section]
setting1=1\\
#hogehoge\\
2\\
3
`,

  /* whitespaces before comments */
  /* whitespaces before key */
  `[Section]
   #hogehoge\\
   setting1=1\\
2\\
3
`,

  /* whitespaces before key */
  /* commented out line prefixed with whitespaces in continuation */
  `[Section]
   setting1=1\\
   #hogehoge\\
2\\
3
`,

  /* continuation with extra trailing backslash at the end */
  `[Section]
setting1=1\\
2\\
3\\
`,

  /* continuation with trailing escape symbols */
  /* note that C requires one level of escaping, so the
   * parser gets "…1 BS BS BS NL BS BS 2 NL", which
   * it translates into "…1 BS BS SP BS BS 2" */
  `[Section]
setting1=1\\\\\\
\\\\2
`,

  /* a line above LINE_MAX length */
  `\n[Section]\n
setting1=${"ABCD".repeat(1000)}
`,

  /* a line above LINE_MAX length, with continuation */
  `[Section]
setting1=${"ABCD".repeat(1000)}\\
foobar`,

  /* a line above LINE_MAX length, with continuation */
  /* and an extra trailing backslash */
  `[Section]
setting1=${"ABCD".repeat(1000)}\\
foobar\\
`,

  /* a line above the allowed limit: 9 + 1050000 + 1 */
  `[Section]
setting1=${`${"x".repeat(1000)}${"abcde".repeat(10)}`.repeat(1000)}
`,

  /* many continuation lines, together above the limit */
  `[Section]\n
setting1=${`${"x".repeat(1000)}${"abcde".repeat(10)}\\\n`.repeat(1000)}xxx`,

  `[Section]
setting1=2
[NoWarnSection]
setting1=3
[WarnSection]
setting1=3
[X-Section]
setting1=3
`,
];

const options = { logWarns: true };
test.each(tests.map((test, index) => [index, test]))(
  "Test %i from test-conf-parser.c",
  (index: number, test: string) => {
    switch (index) {
      case 1:
      case 2:
      case 3:
      case 4:
        expect(parse(test, options).Section?.setting1?.pop()).toBe("1");
        break;
      case 5:
      case 6:
      case 7:
      case 8:
      case 9:
      case 10:
        expect(parse(test, options).Section?.setting1?.pop()).toBe("1 2 3");
        break;
      case 11:
        expect(parse(test, options).Section?.setting1?.pop()).toBe("1\\\\ \\\\2");
        break;
      case 12:
        expect(parse(test, options).Section?.setting1?.pop()).toBe("ABCD".repeat(1000));
        break;
      case 13:
      case 14:
        expect(parse(test, options).Section?.setting1?.pop()).toBe(`${"ABCD".repeat(1000)} foobar`);
        break;
      case 15:
      case 16:
        expect(() => parse(test, options)).toThrow(SyntaxError);
        break;
      case 17:
        expect(parse(test, options).Section?.setting1?.pop()).toBe("2");
        break;
    }
  },
);

test("Test reparsing doc.content", () => {
  const doc = parseDocument(generate({ Section: { Key: ["Value1"] } }));
  expect(doc.content).toBe("[Section]\nKey=Value1\n");
  expect(doc.output.Section?.Key?.[0]).toBe("Value1");
  doc.content = generate({ Section: { Key: ["Value2"] } });
  expect(doc.content).toBe("[Section]\nKey=Value2\n");
  expect(doc.output.Section?.Key?.[0]).toBe("Value2");
});
