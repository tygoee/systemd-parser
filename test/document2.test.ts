import { expect, test } from "vitest";
import { parseDocument } from "../lib";

const options = { logWarns: true };

test("test document setter/adder: new section (escaped)", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("[Section1]\nKey=Value\\\n", options);
    doc[method]("Section2", "Key", "Value");
    expect(doc.content).toBe("[Section1]\nKey=Value\\\n\n[Section2]\nKey=Value\n");
    expect(doc.output.Section1?.Key?.[0]).toBe("Value");
    expect(doc.output.Section2?.Key?.[0]).toBe("Value");
  }
});

test("test document setter: new section (escaped)", () => {
  const doc = parseDocument("[Section1]\nKey=Value\\\n\n[Section2]\nKey=Value", options);
  doc.set("Section3", "Key", "Value");
  expect(doc.content).toBe("[Section1]\nKey=Value\\\n\n[Section2]\nKey=Value\n\n[Section3]\nKey=Value\n");
  expect(doc.output.Section1?.Key?.[0]).toBe("Value");
  expect(doc.output.Section2?.Key?.[0]).toBe("Value");
});
