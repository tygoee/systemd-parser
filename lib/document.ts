// Only \t, \n, \r, and spaces
export const trimWhitespaceStart = /^[ \t\n\r]+/;
export const trimWhitespace = /^[ \t\n\r]+|[ \t\n\r]+$/g;

// No control chars, quotes or backslashes
export const sectionValidator = /[\x01-\x1f\x7f"'\\]/;
export const trailingNewlines = /\n*$/;

export type ParseFunc = (section: string, key: string, value: string) => any;

/** The generic is used to determine the return argument of func */
export type ParseOptions<F extends ParseFunc | void = void> = {
  /** A function that executes upon successful assignment.
   * If it returns something (not void/undefined),
   * it'll be used as value parser, changing the result */
  func?: F;
  warnFunc?: (message: string, lineNum: number, important: boolean) => void; /** ran on warnings */

  logWarns?: boolean; /** default false, logs parsing warnings to the console */
  strict?: boolean; /** default false, makes parsing fail on wrong syntax */
};

/** If the return type contains/is void/undefined, the output can also be a string. */
export type ParsedValue<F> = F extends (section: string, key: string, value: string) => infer R
  ? R extends void | undefined
    ? Exclude<R, void | undefined> | string
    : R
  : string;

export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

// Edit while preserving source formatting. This doesn't give much control but enough
export class Document<F extends ParseFunc | void = void> {
  protected content_mut: string; /** (modified) input. use internally for setting without reparsing */
  readonly options: ParseOptions<F>; /** options passed to parse() */
  protected output_mut: Record<string, Record<string, ParsedValue<F>[]>>; /** mutable output from parse() */
  protected parseFunc: () => typeof this.output_mut;
  protected lineNums: {
    sections: Record<string, number>; /** last line of section */
    assignments: Record<string, Record<string, number[]>> /** all assignment lines */;
  };

  get content() {
    return this.content_mut;
  }

  /** Changing this.content reparses content_mut. This is usually wanted, even internally */
  set content(value: string) {
    this.content_mut = value;
    this.parseFunc();
  }

  /** Read-only to prevent confusion with document not changing when adding/removing values */
  get output(): DeepReadonly<typeof this.output_mut> {
    return this.output_mut;
  }

  constructor(input: string, options: ParseOptions<F> = {}) {
    if (typeof input !== "string") throw TypeError("First argument must be a string");
    if (typeof options !== "object") throw TypeError("Second argument must be an object");

    // always one trailing whitespace;
    this.content_mut = input.replace(trailingNewlines, "\n");
    this.options = options;
    this.output_mut = {};
    this.parseFunc = () => {
      return {};
    };
    this.lineNums = {
      sections: {},
      assignments: {},
    };
  }

  #prepare(section: string, key: string, value: string): [string, string] {
    if (sectionValidator.test(section)) throw TypeError(`Bad characters in section header`);

    key = key.replace(trimWhitespace, "");
    value = value.replace(trimWhitespace, "");

    if (value[value.length - 1] === "\\") value += " "; // escape the backslash

    // remove the trailing space added when backslash is escaped
    return [key, value];
  }

  set(section: string, key: string, value: string) {
    if (typeof section !== "string" || typeof key !== "string" || typeof value !== "string")
      throw TypeError("First three function arguments must be of type string");

    [key, value] = this.#prepare(section, key, value);

    // New section
    if (!this.lineNums.sections[section]) {
      if (!this.content.replace(trimWhitespace, "")) this.content = `[${section}]\n${key}=${value}\n`;
      else this.content += `\n[${section}]\n${key}=${value}\n`;
      return;
    }

    const lines = this.content.split("\n");

    // Existing section, new assignment
    const assignments = this.lineNums.assignments[section]?.[key];
    if (!assignments || assignments.length === 0) {
      lines.splice(this.lineNums.sections[section], 0, `${key}=${value}`);
      this.content = lines.join("\n");
      return;
    }

    // Existing section, existing assignments
    const firstAssignment = assignments[0]!; // confirmed length !== 0
    let offset = -1; // Subtract 1 more every time an item gets removed
    for (const assignment of assignments) {
      lines.splice(assignment + offset, 1);
      offset--;
    }

    lines.splice(firstAssignment - 1, 0, `${key}=${value}`);
    this.content = lines.join("\n");
  }

  /** Index will be ignored if it is undefined or negative */
  add(section: string, key: string, value: string, index?: number) {
    if (typeof section !== "string" || typeof key !== "string" || typeof value !== "string")
      throw TypeError("First three function arguments must be of type string");

    if (index !== undefined && typeof index !== "number") throw TypeError("Fourth argument must be a number");

    [key, value] = this.#prepare(section, key, value);

    // New section
    if (!this.lineNums.sections[section]) {
      if (!this.content.replace(trimWhitespace, "")) this.content = `[${section}]\n${key}=${value}\n`;
      else this.content += `\n[${section}]\n${key}=${value}\n`;
      return;
    }

    const lines = this.content.split("\n");

    // Existing section
    if (index === undefined || index < 0) {
      lines.splice(this.lineNums.sections[section], 0, `${key}=${value}`);
    } else {
      // Add after previous item if possible, which is neater. Look at the tests for clarity
      const assignment = this.lineNums.assignments[section]?.[key]?.[Math.max(index - 1, 0)];
      if (assignment === undefined) throw RangeError("Assignment index out of range");
      lines.splice(index === 0 ? assignment - 1 : assignment, 0, `${key}=${value}`);
    }

    this.content = lines.join("\n");
  }

  /** Index will be ignored if it is undefined or negative */
  remove(section: string, key: string, index?: number, strict: boolean = true) {
    if (typeof section !== "string" || typeof key !== "string")
      throw TypeError("First two function arguments must be of type string");

    if (index !== undefined && typeof index !== "number") throw TypeError("Third argument has to be a number");

    if (this.lineNums.sections[section] === undefined) {
      if (strict) throw TypeError("Section does not exist");
      return;
    }

    const lines = this.content.split("\n");

    if (index !== undefined && index >= 0) {
      const assignments = this.lineNums.assignments[section]![key];
      if (assignments === undefined) {
        if (strict) throw TypeError("Key does not exist");
        return;
      }

      if (assignments?.[index] === undefined) {
        if (strict) throw RangeError("Assignment index out of range");
        return;
      }

      // The goal is to mainly remove logical and automated headers
      const line = assignments[index] - 1;
      if (
        assignments.length === 1 &&
        Object.keys(this.lineNums.assignments[section]!).length === 1 &&
        lines?.[line - 1]?.startsWith("[") &&
        !lines?.[line - 2]?.endsWith("\\")
      ) {
        // If this is the only instance of this key and the only key of the section
        lines.splice(line - 1, 2); // only remove header when right above the assignment
      } else {
        lines.splice(line, 1);
      }

      this.content = lines.join("\n").replace(trailingNewlines, "\n");
      return;
    }

    if (!this.lineNums.assignments[section]![key]) {
      if (strict) throw TypeError("Key does not exist");
      return;
    }

    let offset = -1;
    for (const assignment of this.lineNums.assignments[section]![key]) {
      const line = assignment + offset;
      if (
        Object.keys(this.lineNums.assignments[section]!).length === 1 &&
        lines?.[line - 1]?.startsWith("[") &&
        !lines?.[line - 2]?.endsWith("\\")
      ) {
        lines.splice(line - 1, 2); // only remove header when right above the assignment
        offset--;
      } else {
        lines.splice(line, 1);
      }

      offset--;
    }

    this.content = lines.join("\n").replace(trailingNewlines, "\n");
  }
}
