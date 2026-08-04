import type { Parser } from "./parser.js";

// Only \t, \n, \r, and spaces
export const trimWhitespaceStart = /^[ \t\n\r]+/;
export const trimWhitespace = /^[ \t\n\r]+|[ \t\n\r]+$/g;

// No control chars, quotes or backslashes
export const sectionValidator = /[\x01-\x1f\x7f"'\\]/;
export const trailingNewlines = /\n*$/;

export type Severity = "hint" | "info" | "warning" | "error";
export type Warning = [string, Severity, [number, number, number]];

export type ParsedOutput<V> = Record<string, Record<string, V[]>>;

export type ParseFunc = (section: string, key: string, value: string, parser: Parser<any>) => any;

/** The generic is used to determine the return argument of func */
export type ParseOptions<F extends ParseFunc | void = void> = {
  // Function that parses the text values from the input to any data type.
  // When it doesn't return anything, values return like in the document
  // parser is the current parser object that is optionally passed
  parseFunc?: F; /** (section: string, key: string, value: string) => ... */
  // Function that serializes those values back into text strings.
  // When it doesn't return anything, the parser tries to input the value as a string
  // These warnings can be accessed via doc.serializationWarnings and can be any array
  serializeFunc?: (section: string, key: string, value: ParsedValue<F>, warnings: any[]) => string;
  warnFunc?: (message: string, severity: Severity, location: [number, number, number]) => void; /** ran on warnings */

  logWarns?: boolean; /** default false, logs parsing warnings to the console */
  strict?: boolean; /** default false, makes parsing fail on wrong syntax */

  includePrefixed?: boolean; /** default false, include keys prefixed with X- */
  allowedKeys?: Record<string, string[]>; /** object of allowed sections and keys. */
  includeDisallowed?: boolean; // include keys not allowed by allowedKeys
};

/** If the return type contains/is void/undefined, the output can also be a string. */
export type ParsedValue<F> = F extends (section: string, key: string, value: string) => infer V
  ? V extends void | undefined
    ? Exclude<V, void | undefined> | string
    : V
  : string;

export type DeepReadonly<T> = {
  readonly [P in keyof T]: DeepReadonly<T[P]>;
};

type BaseNode = {
  fromLine?: number;
  toLine?: number;
};

type SectionNode = BaseNode & {
  type: "section";
  name: string;
};

type AssignmentNode<V> = BaseNode & {
  type: "assignment";
  key: string;
  /** Raw from file, incl. newlines */ rawValue: string;
  /** Joined backslashes/newlines */ joinedValue: string;
  /** Parsed value */ value: V;
};

type CommentNode = BaseNode & {
  type: "comment";
  content: string;
  delimiter: string;
};

type BlankNode = BaseNode & {
  type: "blank";
};

/** Invalid (skipped) lines */
type InvalidNode = BaseNode & {
  type: "invalid";
  content: string;
};

type NodeDocument<V> = Array<SectionNode | AssignmentNode<V> | CommentNode | BlankNode | InvalidNode>;

// Edit while preserving source formatting. This doesn't give much control but enough
export class Document<F extends ParseFunc | void = void> {
  /** Input passed to parse() */ protected content_mut: string;
  /** Options passed to parse() */ options: ParseOptions<F>;
  /** Mutable output from parse() */ protected output_mut: ParsedOutput<ParsedValue<F>>;
  /** Document containing all nodes */ doc: NodeDocument<ParsedValue<F>>;
  protected parserFunc: () => ParsedOutput<ParsedValue<F>>;
  protected generatorFunc: () => void;
  serializationWarnings: any[] = [];

  /** Read-only to prevent confusion with document not changing when adding/removing values */
  get output(): DeepReadonly<ParsedOutput<ParsedValue<F>>> {
    return this.output_mut;
  }

  get content(): string {
    return this.content_mut;
  }

  set content(value: string) {
    this.content_mut = value;
    this.parserFunc();
  }

  constructor(input: string, options: ParseOptions<F> = {}) {
    if (typeof input !== "string") throw new TypeError("Input must be a string");
    if (typeof options !== "object") throw new TypeError("Options must be an object");

    // always one trailing whitespace
    this.content_mut = input.replace(trailingNewlines, "\n");
    this.options = options;
    this.output_mut = {};
    this.doc = [];
    this.parserFunc = () => ({});
    this.generatorFunc = this.#generate;
  }

  /** Regenerates output and content */
  #generate() {
    this.output_mut = {};

    let lines: string[] = [];
    let lineNum = 1;

    let currentSection = "";
    for (const node of this.doc) {
      node.fromLine = lineNum;

      if (node.type === "assignment") {
        lines.push(`${node.key}=${node.rawValue}`);
        this.output_mut[currentSection] ??= {};
        this.output_mut[currentSection]![node.key] ??= [];
        this.output_mut[currentSection]![node.key]!.push(node.value);

        lineNum += node.rawValue.split("\n").length;
        node.toLine = lineNum;
        continue;
      }

      if (node.type === "section") {
        lines.push(`[${node.name}]`);
        currentSection = node.name;
        this.output_mut[node.name] ??= {};
      } else if (node.type === "comment") lines.push(`${node.delimiter}${node.content}`);
      else if (node.type === "blank") lines.push("");
      else if (node.type === "invalid") lines.push(`${node.content}`);

      lineNum++;
      node.toLine = lineNum;
    }

    let content = lines.join("\n");
    if (content[content.length - 1] !== "\n") content += "\n";

    this.content_mut = content;
  }

  #prepare(section: string, key: string, value: ParsedValue<F>): [string, string, string, ParsedValue<F>] {
    // validates section/key/value. assumes types are already tested
    if (sectionValidator.test(section)) throw new TypeError(`Bad characters in section header`);

    key = key.replace(trimWhitespace, "");
    if (!key) throw new TypeError("Key is empty");

    let joinedValue: string;
    if (typeof this.options.serializeFunc === "function")
      joinedValue = this.options.serializeFunc(section, key, value, this.serializationWarnings);
    else joinedValue = value;

    joinedValue = joinedValue.replace(trimWhitespace, "");
    const rawValue = joinedValue[joinedValue.length - 1] === "\\" ? joinedValue + " " : joinedValue; // escape the backslash

    return [key, rawValue, joinedValue, value];
  }

  #getAssignments(section: string): AssignmentNode<ParsedValue<F>>[] {
    const result: AssignmentNode<ParsedValue<F>>[] = [];
    let currentSection = "";
    for (const node of this.doc) {
      if (node.type === "section") currentSection = node.name;
      if (section !== currentSection || node.type !== "assignment") continue;

      result.push(node);
    }

    return result;
  }

  /** Get rid of assignment and its section header when empty */
  #clearAssignment(assignment: AssignmentNode<ParsedValue<F>>) {
    const lastSection = this.doc
      .slice(0, this.doc.indexOf(assignment))
      .reverse()
      .find((node) => node.type === "section");

    // Shouldn't be able to be undefined as keys without sections are ignored
    if (lastSection !== undefined) {
      /** All assignments only from this specific section header */
      const sectionAssignments: AssignmentNode<ParsedValue<F>>[] = [];
      for (const node of this.doc.slice(this.doc.indexOf(lastSection) + 1)) {
        if (node.type === "section") break;
        if (node.type !== "assignment") continue;

        sectionAssignments.push(node);
      }

      // The goal is to only remove headers from empty sections
      // check usability, maybe keep section in future when comments are in section
      if (sectionAssignments.length === 1) {
        // Remove single blank node, for auto generated blank lines
        const blankIndex = this.doc.indexOf(lastSection) - 1;
        if (this.doc[blankIndex]?.type === "blank") this.doc.splice(blankIndex, 1);
        this.doc.splice(this.doc.indexOf(lastSection), 1);
      }
    }

    this.doc.splice(this.doc.indexOf(assignment), 1);
  }

  /** Index will be ignored if it is undefined or negative */
  set(section: string, key: string, value: ParsedValue<F>, index?: number) {
    if (typeof section !== "string") throw new TypeError("Section must be of type string");
    if (typeof key !== "string") throw new TypeError("Key must be of type string");
    if (typeof value !== "string") throw new TypeError("Value must be of type string");
    if (index !== undefined && typeof index !== "number") throw new TypeError("Index must be a number");

    let rawValue: string, joinedValue: string;
    [key, rawValue, joinedValue, value] = this.#prepare(section, key, value);

    // New section
    const sections = this.doc.filter((node) => node.type === "section" && node.name === section);
    if (sections.length === 0) {
      if (this.doc[this.doc.length - 1]?.type !== "blank") this.doc.push({ type: "blank" });
      if (this.doc.every((node) => node.type === "blank")) this.doc = [];

      this.doc.push({ type: "section", name: section });
      this.doc.push({ type: "assignment", key, rawValue, joinedValue, value });
      return void this.generatorFunc();
    }

    const assignments = this.#getAssignments(section);

    // Empty section, new assignment
    if (assignments.length === 0) {
      const docIndex = this.doc.indexOf(sections[sections.length - 1]!) + 1;
      this.doc.splice(docIndex, 0, { type: "assignment", key, rawValue, joinedValue, value });
      return void this.generatorFunc();
    }

    if (index === undefined || index < 0) {
      const existing = assignments.filter((node) => node.key === key);
      if (existing.length === 0) {
        // Just add as always when there are no other keys in section
        const docIndex = this.doc.indexOf(assignments[assignments.length - 1]!) + 1;
        this.doc.splice(docIndex, 0, { type: "assignment", key, rawValue, joinedValue, value });
      } else {
        // Remove all assignments and remove duplicates
        // This doesn't take multiple section headers with the same title into account,
        // but those should only be able to have been added by users
        const firstIndex = this.doc.indexOf(existing[0]!);
        this.doc = this.doc.filter(
          (node) => node.type !== "assignment" || (node.type === "assignment" && node.key !== key),
        );

        this.doc.splice(firstIndex, 0, { type: "assignment", key, rawValue, joinedValue, value });
      }
    } else {
      const target = assignments[index] ?? assignments[assignments.length - 1]!;

      const docIndex = this.doc.indexOf(target);
      this.doc.splice(docIndex, 1, { type: "assignment", key, rawValue, joinedValue, value });
    }

    this.generatorFunc();
  }

  /** Index will be ignored if it is undefined or negative */
  add(section: string, key: string, value: ParsedValue<F>, index?: number) {
    if (typeof section !== "string") throw new TypeError("Section must be of type string");
    if (typeof key !== "string") throw new TypeError("Key must be of type string");
    if (typeof value !== "string") throw new TypeError("Value must be of type string");
    if (index !== undefined && typeof index !== "number") throw new TypeError("Index must be a number");

    let rawValue: string, joinedValue: string;
    [key, rawValue, joinedValue, value] = this.#prepare(section, key, value);

    // New section
    const sections = this.doc.filter((node) => node.type === "section" && node.name === section);
    if (sections.length === 0) {
      if (this.doc[this.doc.length - 1]?.type !== "blank") this.doc.push({ type: "blank" });
      if (this.doc.every((node) => node.type === "blank")) this.doc = [];

      this.doc.push({ type: "section", name: section });
      this.doc.push({ type: "assignment", key, rawValue, joinedValue, value });
      return void this.generatorFunc();
    }

    const assignments = this.#getAssignments(section);

    // Existing section
    if (index === undefined || index < 0) {
      const docIndex =
        Math.max(
          this.doc.indexOf(sections[sections.length - 1]!),
          this.doc.indexOf(assignments[assignments.length - 1]!),
        ) + 1;

      this.doc.splice(docIndex, 0, { type: "assignment", key, rawValue, joinedValue, value });
    } else {
      // Add after previous item if possible. Look at the tests for clarity
      let target = this.doc.indexOf(assignments[Math.max(index - 1, 0)]!);
      if (target === -1) target = this.doc.indexOf(assignments[assignments.length - 1]!);
      const docIndex = index === 0 ? target : target + 1;

      this.doc.splice(docIndex, 0, { type: "assignment", key, rawValue, joinedValue, value });
    }

    this.generatorFunc();
  }

  /** Index will be ignored if it is undefined or negative */
  remove(section: string, key: string, index?: number, strict: boolean = true) {
    if (typeof section !== "string") throw new TypeError("Section must be of type string");
    if (typeof key !== "string") throw new TypeError("Key must be of type string");
    if (index !== undefined && typeof index !== "number") throw new TypeError("Index must be a number");

    const sections = this.doc.filter((node) => node.type === "section" && node.name === section);
    if (sections.length === 0) {
      if (strict) throw new TypeError("Section does not exist");
      return;
    }

    const assignments = this.#getAssignments(section);

    if (assignments.length === 0) {
      if (strict) throw new TypeError("Key does not exist");
      return;
    }

    if (index !== undefined && index >= 0) {
      const assignment = assignments[index];

      if (assignment === undefined) {
        if (strict) throw new RangeError("Assignment index out of range");
        return;
      }

      this.#clearAssignment(assignment);

      return void this.generatorFunc();
    }

    for (const assignment of assignments.filter((node) => node.key === key)) {
      this.#clearAssignment(assignment);
    }

    this.generatorFunc();
  }
}
