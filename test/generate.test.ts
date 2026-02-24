import { expect, test } from "vitest";
import { generate } from "../lib";

test("test generator", () => {
  const output = generate({ Section1: { Key1: ["Value1", "Value2"], Key2: ["Value"] }, Section2: { Key: ["Value"] } });
  expect(output).toBe("[Section1]\nKey1=Value1\nKey1=Value2\nKey2=Value\n\n[Section2]\nKey=Value\n");
});
