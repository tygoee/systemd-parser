import { expect, test } from "vitest";
import { parseDocument } from "../lib";
import { EmitFlags } from "typescript";

test("test document setter/adder: new section", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("[Section1]\nKey=Value\n");
    doc[method]("Section2", "Key", "Value");
    expect(doc.content).toBe("[Section1]\nKey=Value\n\n[Section2]\nKey=Value\n");
    expect(doc.output.Section1?.Key?.[0]).toBe("Value");
    expect(doc.output.Section2?.Key?.[0]).toBe("Value");
  }
});

test("test document setter/adder: no trailing newline", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("[Section1]\nKey1=Value1");
    doc[method]("Section2", "Key2", "Value2");
    expect(doc.content).toBe("[Section1]\nKey1=Value1\n\n[Section2]\nKey2=Value2\n");
    expect(doc.output.Section1?.Key1?.[0]).toBe("Value1");
    expect(doc.output.Section2?.Key2?.[0]).toBe("Value2");
  }
});

test("test document setter/adder: value with ending backslash", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("");
    doc[method]("Section", "Key", "Value\\");
    expect(doc.content).toBe("[Section]\nKey=Value\\ \n");
    expect(doc.output.Section?.Key?.[0]).toBe("Value\\");
  }
});

test("test document setter/adder: existing section with no values", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("[Section]");
    doc[method]("Section", "Key", "Value");
    expect(doc.content).toBe("[Section]\nKey=Value\n");
    expect(doc.output.Section?.Key?.[0]).toBe("Value");
  }
});

test("test document setter/adder: existing section with a value", () => {
  for (const method of <["set", "add"]>["set", "add"]) {
    const doc = parseDocument("[Section]\nKey1=Value1");
    doc[method]("Section", "Key2", "Value2");
    expect(doc.content).toBe("[Section]\nKey1=Value1\nKey2=Value2\n");
    expect(doc.output.Section?.Key1?.[0]).toBe("Value1");
    expect(doc.output.Section?.Key2?.[0]).toBe("Value2");
  }
});

test("test document setter: keep position", () => {
  const doc = parseDocument("[Section]\nKey1=Value1\nKey2=Value2");
  doc.set("Section", "Key1", "Value3");
  expect(doc.content).toBe("[Section]\nKey1=Value3\nKey2=Value2\n");
  expect(doc.output.Section?.Key1?.[0]).toBe("Value3");
  expect(doc.output.Section?.Key2?.[0]).toBe("Value2");
});

test("test document setter: single existing assignment", () => {
  const doc = parseDocument("[Section]\nKey=Value1");
  doc.set("Section", "Key", "Value2");
  expect(doc.content).toBe("[Section]\nKey=Value2\n");
  expect(doc.output.Section?.Key?.[0]).toBe("Value2");
});

test("test document setter: multiple existing assignments without meaningful index", () => {
  for (let index of [undefined, -1, -2]) {
    const doc = parseDocument("[Section]\nKey=Value1\nKey=Value2");
    doc.set("Section", "Key", "Value3", index);
    expect(doc.content).toBe("[Section]\nKey=Value3\n");
    expect(doc.output.Section?.Key?.[0]).toBe("Value3");
  }
});

test("test document setter: multiple existing assignments with index", () => {
  const doc = parseDocument("[Section]\nKey=Value1\nKey=Value2");
  doc.set("Section", "Key", "Value3", 0);
  expect(doc.content).toBe("[Section]\nKey=Value3\nKey=Value2\n");
  expect(doc.output.Section?.Key?.[0]).toBe("Value3");
  expect(doc.output.Section?.Key?.[1]).toBe("Value2");
});

test("test document adder: existing assignments without meaningful index", () => {
  for (let index of [undefined, 2, -1, -2]) {
    const doc = parseDocument("[Section]\nKey=Value1\nKey=Value2");
    doc.add("Section", "Key", "Value3", index);
    expect(doc.content).toBe("[Section]\nKey=Value1\nKey=Value2\nKey=Value3\n");
    expect(doc.output.Section?.Key?.[2]).toBe("Value3");
  }
});

test("test document adder: existing assignments with index", () => {
  const doc = parseDocument("[Section]\nKey=Value1\n\n[Section]\nKey=Value3");
  doc.add("Section", "Key", "Value2", 1);
  expect(doc.content).toBe("[Section]\nKey=Value1\nKey=Value2\n\n[Section]\nKey=Value3\n");
  expect(doc.output.Section?.Key?.[1]).toBe("Value2");
});

test("test document adder: existing assignments with index zero", () => {
  const doc = parseDocument("[Section]\nKey=Value2\n\n[Section]\nKey=Value3");
  doc.add("Section", "Key", "Value1", 0);
  expect(doc.content).toBe("[Section]\nKey=Value1\nKey=Value2\n\n[Section]\nKey=Value3\n");
  expect(doc.output.Section?.Key?.[0]).toBe("Value1");
});

test("test document adder: existing assignments with index out of range", () => {
  const doc = parseDocument("[Section]\nKey=Value1\nKey=Value2");
  expect(() => doc.add("Section", "Key", "Value3", 3)).toThrow(RangeError);
});

test("test document remover: single assignment removing header without meaningful index", () => {
  for (let index of [undefined, 0, -1, -2]) {
    const doc = parseDocument("[Section]\nKey=Value");
    doc.remove("Section", "Key", index);
    expect(doc.content).toBe("\n");
  }
});

test("test document remover: multiple assignments removing header", () => {
  const doc = parseDocument("[Section]\nKey=Value\nKey=Value\nKey=Value");
  doc.remove("Section", "Key");
  expect(doc.content).toBe("\n");
});

test("test document remover: multiple different assignments", () => {
  const doc = parseDocument("[Section]\nKey1=Value\nKey2=Value");
  doc.remove("Section", "Key2");
  expect(doc.content).toBe("[Section]\nKey1=Value\n");
});

test("test document remover: multiple assignments with same key", () => {
  const doc = parseDocument("[Section]\nKey1=Value\nKey1=Value\nKey2=Value");
  doc.remove("Section", "Key1");
  expect(doc.content).toBe("[Section]\nKey2=Value\n");
});

test("test document remover: multiple assignments with index", () => {
  const doc = parseDocument("[Section]\nKey=Value\nKey=Value\nKey=Value");
  doc.remove("Section", "Key", 1);
  expect(doc.content).toBe("[Section]\nKey=Value\nKey=Value\n");
});
