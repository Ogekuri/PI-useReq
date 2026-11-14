/**
 * @file
 * @brief Implements JSON formatting validation for the `json-validator` agent tool.
 * @details Validates caller-supplied inline JSON text and explicit file paths through the native
 * `JSON.parse` runtime, computes deterministic parser error line and column diagnostics, summarizes
 * valid roots with structural counts plus character and `cl100k_base` token size facts, and renders
 * one monolithic machine-oriented markdown verdict document. Invalid JSON is reported as an invalid
 * verdict record and never throws. Runtime is O(n) in aggregate validated content size plus one
 * tokenizer encode per record. Side effects are limited to filesystem reads for file entries.
 * @satisfies DES-044, REQ-702, REQ-703, REQ-704, REQ-705, REQ-706, REQ-707
 */

import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import { countTextTokensAndChars } from "./token-counter.js";
import type { ToolResult } from "./tool-runner.js";

/**
 * @brief Represents one deterministic JSON parse-position diagnostic.
 * @details Carries the one-based error line and column resolved from a parser message; both fields
 * stay absent when the parser message exposes no position facts. The interface is compile-time only
 * and introduces no runtime cost.
 * @satisfies REQ-705
 */
export interface JsonParsePosition {
  /** @brief One-based error line; `undefined` when the parser message carries no position facts. */
  line?: number;
  /** @brief One-based error column; `undefined` when the parser message carries no position facts. */
  column?: number;
}

/**
 * @brief Describes one structured summary of a parsed JSON root value.
 * @details Stores the parsed root type plus the structural counts and maximum nesting depth; count
 * and depth fields stay absent for scalar roots because they carry no container structure. The
 * interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-704
 */
export interface JsonRootSummary {
  /** @brief Parsed root type: `object`, `array`, `string`, `number`, `boolean`, or `null`. */
  rootType: string;
  /** @brief Top-level object key count; defined only for object roots. */
  keys?: number;
  /** @brief Recursive object key count across every nesting level; object roots only. */
  totalKeys?: number;
  /** @brief Top-level array element count; defined only for array roots. */
  items?: number;
  /** @brief Recursive array element count across every nesting level; array roots only. */
  totalItems?: number;
  /** @brief Maximum container nesting depth; scalar roots report `undefined`. */
  depth?: number;
}

/**
 * @brief Describes one validation record inside the monolithic verdict document.
 * @details Pairs the caller-facing label with the valid or invalid verdict, the optional structural
 * summary of a parsed root, character and `cl100k_base` token size facts, and the optional parser
 * or read-error diagnostic with its computed line and column position. The interface is
 * compile-time only and introduces no runtime cost.
 * @satisfies REQ-703, REQ-704, REQ-705, REQ-707
 */
export interface JsonValidatorEntry {
  /** @brief Caller-facing record label: `content` for inline text or the supplied file path. */
  label: string;
  /** @brief Whether the entry parsed as valid JSON; unreadable file entries stay `false`. */
  valid: boolean;
  /** @brief Parsed root type; defined only for parsed entries. */
  rootType?: string;
  /** @brief Top-level object key count; object roots only. */
  keys?: number;
  /** @brief Recursive object key count; object roots only. */
  totalKeys?: number;
  /** @brief Top-level array element count; array roots only. */
  items?: number;
  /** @brief Recursive array element count; array roots only. */
  totalItems?: number;
  /** @brief Maximum container nesting depth; scalar roots stay `undefined`. */
  depth?: number;
  /** @brief Character count of the validated text; `0` for unreadable file entries. */
  chars: number;
  /** @brief `cl100k_base` token estimate of the validated text; `0` for unreadable file entries. */
  tokens: number;
  /** @brief Parser or read-error diagnostic; defined only for invalid entries. */
  error?: string;
  /** @brief One-based error line; defined when the parser diagnostic carries position facts. */
  line?: number;
  /** @brief One-based error column; defined when the parser diagnostic carries position facts. */
  column?: number;
}

/**
 * @brief Describes the accepted `json-validator` request parameters.
 * @details Mirrors the optional `content` string and optional `files` path array of the agent-tool
 * schema; unknown callers may forward loosely-typed payloads because runtime type validation is
 * performed by `runJsonValidator`. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-706
 */
export interface JsonValidatorRequest {
  /** @brief Raw JSON text to validate inline; omitted when file paths are supplied. */
  content?: unknown;
  /** @brief Explicit file paths read as UTF-8 text and validated as JSON, in caller order. */
  files?: unknown;
}

/**
 * @brief Extracts the one-based line and column diagnostics from one JSON parser message.
 * @details Prefers explicit `line X column Y` fragments emitted by modern V8 runtimes and otherwise
 * resolves the raw zero-based `position N` fragment into one-based line and column coordinates by
 * counting newline boundaries in the validated prefix. Returns an empty record when the message
 * carries no position facts or the resolved position falls outside the supplied content so callers
 * never render fabricated coordinates. Runtime is O(p) in prefix length. No external state is mutated.
 * @param[in] content {string} Exact text handed to the JSON parser.
 * @param[in] errorMessage {string} Parser error message carrying optional position facts.
 * @return {JsonParsePosition} One-based line and column diagnostics, or an empty record.
 * @satisfies REQ-705
 */
export function extractJsonParsePosition(content: string, errorMessage: string): JsonParsePosition {
  const explicitMatch = /line (\d+) column (\d+)/.exec(errorMessage);
  if (explicitMatch) {
    return {
      line: Number.parseInt(explicitMatch[1], 10),
      column: Number.parseInt(explicitMatch[2], 10),
    };
  }
  const positionMatch = /position (\d+)/.exec(errorMessage);
  if (!positionMatch) {
    return {};
  }
  const position = Number.parseInt(positionMatch[1], 10);
  if (!Number.isInteger(position) || position < 0 || position >= content.length) {
    return {};
  }
  const prefixLines = content.slice(0, position).split("\n");
  return {
    line: prefixLines.length,
    column: (prefixLines[prefixLines.length - 1]?.length ?? 0) + 1,
  };
}

/**
 * @brief Measures the maximum container nesting depth of one parsed JSON value.
 * @details Counts one level per object or array boundary so scalar roots report 0 and a root object
 * holding one scalar key reports 1. Cycles are impossible because parsed JSON values are acyclic.
 * Runtime is O(n) in parsed element count. No external state is mutated.
 * @param[in] value {unknown} Parsed JSON value.
 * @return {number} Maximum nesting depth in container levels.
 * @satisfies REQ-704
 */
function measureJsonDepth(value: unknown): number {
  if (Array.isArray(value)) {
    let maxChildDepth = 0;
    for (const item of value) {
      maxChildDepth = Math.max(maxChildDepth, measureJsonDepth(item));
    }
    return 1 + maxChildDepth;
  }
  if (value !== null && typeof value === "object") {
    let maxChildDepth = 0;
    for (const child of Object.values(value as Record<string, unknown>)) {
      maxChildDepth = Math.max(maxChildDepth, measureJsonDepth(child));
    }
    return 1 + maxChildDepth;
  }
  return 0;
}

/**
 * @brief Counts every object key across all nesting levels of one parsed JSON value.
 * @details Accumulates one count per object key while recursing into arrays and nested objects.
 * Runtime is O(n) in parsed element count. No external state is mutated.
 * @param[in] value {unknown} Parsed JSON value.
 * @return {number} Recursive object key count; `0` for scalar and array-only roots.
 * @satisfies REQ-704
 */
function countJsonKeys(value: unknown): number {
  if (value === null || typeof value !== "object") {
    return 0;
  }
  let total = Array.isArray(value) ? 0 : Object.keys(value as Record<string, unknown>).length;
  const children = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    total += countJsonKeys(child);
  }
  return total;
}

/**
 * @brief Counts every array element across all nesting levels of one parsed JSON value.
 * @details Accumulates one count per array element while recursing into object values and nested
 * arrays. Runtime is O(n) in parsed element count. No external state is mutated.
 * @param[in] value {unknown} Parsed JSON value.
 * @return {number} Recursive array element count; `0` for scalar and object-only roots.
 * @satisfies REQ-704
 */
function countJsonItems(value: unknown): number {
  if (value === null || typeof value !== "object") {
    return 0;
  }
  let total = Array.isArray(value) ? value.length : 0;
  const children = Array.isArray(value)
    ? value
    : Object.values(value as Record<string, unknown>);
  for (const child of children) {
    total += countJsonItems(child);
  }
  return total;
}

/**
 * @brief Summarizes one parsed JSON root into its type and structural counts.
 * @details Branches on the root container kind: object roots expose top-level plus recursive key
 * counts, array roots expose top-level plus recursive element counts, and every root exposes the
 * maximum nesting depth while scalar roots expose only the type. Runtime is O(n) in parsed element
 * count. No external state is mutated.
 * @param[in] value {unknown} Parsed JSON root value.
 * @return {JsonRootSummary} Root type with the applicable structural counts.
 * @satisfies REQ-704
 */
export function summarizeJsonRoot(value: unknown): JsonRootSummary {
  if (value === null) {
    return { rootType: "null" };
  }
  if (Array.isArray(value)) {
    return {
      rootType: "array",
      items: value.length,
      totalItems: countJsonItems(value),
      depth: measureJsonDepth(value),
    };
  }
  if (typeof value === "object") {
    return {
      rootType: "object",
      keys: Object.keys(value as Record<string, unknown>).length,
      totalKeys: countJsonKeys(value),
      depth: measureJsonDepth(value),
    };
  }
  return { rootType: typeof value };
}

/**
 * @brief Validates one text payload into one structured verdict record.
 * @details Counts characters and `cl100k_base` tokens through the shared tokenizer, parses the text
 * through the native `JSON.parse` runtime, summarizes valid roots through `summarizeJsonRoot`, and
 * converts parser failures into invalid records carrying the parser message plus computed line and
 * column diagnostics without throwing. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] label {string} Caller-facing record label.
 * @param[in] text {string} JSON text to validate.
 * @return {JsonValidatorEntry} Structured verdict record for the supplied text.
 * @throws {ReqError} Propagates the tokenizer dependency failure when `js-tiktoken` is unavailable.
 * @satisfies REQ-703, REQ-704, REQ-705
 */
function buildJsonValidatorEntry(label: string, text: string): JsonValidatorEntry {
  const { chars, tokens } = countTextTokensAndChars(text);
  try {
    const parsed: unknown = JSON.parse(text);
    return { label, valid: true, ...summarizeJsonRoot(parsed), chars, tokens };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label,
      valid: false,
      chars,
      tokens,
      error: message,
      ...extractJsonParsePosition(text, message),
    };
  }
}

/**
 * @brief Validates one file entry into one structured verdict record.
 * @details Resolves the supplied path against the current working directory, reads it as UTF-8 text,
 * and converts read failures into invalid records carrying the diagnostic without aborting the
 * remaining entries. Readable entries delegate to `buildJsonValidatorEntry`. Runtime is O(n) in file
 * size. Side effects are limited to filesystem reads.
 * @param[in] filePath {string} Caller-supplied relative or absolute file path.
 * @return {JsonValidatorEntry} Structured verdict record for the file content.
 * @throws {ReqError} Propagates the tokenizer dependency failure when `js-tiktoken` is unavailable.
 * @satisfies REQ-707
 */
function buildJsonValidatorFileEntry(filePath: string): JsonValidatorEntry {
  const resolvedPath = path.resolve(filePath);
  let text: string;
  try {
    text = fs.readFileSync(resolvedPath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      label: filePath,
      valid: false,
      chars: 0,
      tokens: 0,
      error: `Unable to read file: ${message}`,
    };
  }
  return buildJsonValidatorEntry(filePath, text);
}

/**
 * @brief Renders one verdict record as the `@@@ <label> | JSON` markdown block.
 * @details Emits the record header, the `Result:` metadata line, the ordered verdict bullets (root
 * type plus structural counts for valid records, error message plus line and column diagnostics for
 * invalid records), and the trailing character and token size facts. Runtime is O(n) in rendered
 * length. No external state is mutated.
 * @param[in] entry {JsonValidatorEntry} Verdict record to render.
 * @return {string[]} Rendered record lines without separators.
 * @satisfies REQ-703
 */
function renderJsonValidatorEntry(entry: JsonValidatorEntry): string[] {
  const lines: string[] = [];
  lines.push(`@@@ ${entry.label} | JSON`);
  lines.push(`> Result: ${entry.valid ? "valid" : "invalid"}`);
  if (entry.valid) {
    lines.push(`- @root-type ${entry.rootType}`);
    if (entry.rootType === "object") {
      lines.push(`- @keys ${entry.keys}`);
      lines.push(`- @total-keys ${entry.totalKeys}`);
    } else if (entry.rootType === "array") {
      lines.push(`- @items ${entry.items}`);
      lines.push(`- @total-items ${entry.totalItems}`);
    }
    if (typeof entry.depth === "number") {
      lines.push(`- @depth ${entry.depth}`);
    }
  } else {
    lines.push(`- @error ${entry.error ?? "JSON validation failed."}`);
    if (typeof entry.line === "number") {
      lines.push(`- @line ${entry.line}`);
    }
    if (typeof entry.column === "number") {
      lines.push(`- @column ${entry.column}`);
    }
  }
  lines.push(`- @chars ${entry.chars}`);
  lines.push(`- @tokens ${entry.tokens}`);
  return lines;
}

/**
 * @brief Renders the complete monolithic markdown verdict document for one validation run.
 * @details Emits one `@@@ <label> | JSON` block per record in request order, each terminated by one
 * newline and separated by one blank line, followed by the `## Validation Summary` section holding
 * the request, valid, and invalid counts. Runtime is O(n) in aggregate rendered length. No external
 * state is mutated.
 * @param[in] entries {readonly JsonValidatorEntry[]} Verdict records in request order.
 * @return {string} Complete monolithic verdict markdown document.
 * @satisfies REQ-703
 */
export function renderJsonValidationMarkdown(entries: readonly JsonValidatorEntry[]): string {
  const validCount = entries.filter((entry) => entry.valid).length;
  const blocks = entries.map((entry) => `${renderJsonValidatorEntry(entry).join("\n")}\n`);
  const summaryLines = [
    "## Validation Summary",
    `- @requests ${entries.length}`,
    `- @valid ${validCount}`,
    `- @invalid ${entries.length - validCount}`,
  ];
  return [...blocks, `${summaryLines.join("\n")}\n`].join("\n");
}

/**
 * @brief Executes one `json-validator` request and returns the monolithic verdict tool result.
 * @details Type-checks the loosely-typed parameters, rejects requests supplying neither non-blank
 * `content` nor non-empty `files` with one deterministic diagnostic, validates the inline content
 * record first followed by every file entry in caller order, renders the monolithic verdict
 * document, and returns exit code `0` for every well-formed request regardless of per-record
 * verdicts. Blank or whitespace-only `content` supplies no content and triggers the same rejection.
 * Runtime is O(n) in aggregate validated content size. Side effects are limited to filesystem
 * reads for file entries.
 * @param[in] params {JsonValidatorRequest} Loosely-typed tool parameters.
 * @return {ToolResult} Successful tool result carrying the monolithic verdict markdown on stdout.
 * @throws {ReqError} Throws for non-string `content`, non-string-array `files`, or requests
 * supplying neither parameter.
 * @satisfies REQ-702, REQ-703, REQ-705, REQ-706, REQ-707
 */
export function runJsonValidator(params: JsonValidatorRequest): ToolResult {
  const content = params?.content;
  const files = params?.files;
  if (content !== undefined && typeof content !== "string") {
    throw new ReqError("json-validator: content must be a string when supplied.");
  }
  if (
    files !== undefined &&
    (!Array.isArray(files) || !files.every((file) => typeof file === "string" && file.trim() !== ""))
  ) {
    throw new ReqError("json-validator: files must be an array of non-empty path strings when supplied.");
  }
  const contentText = typeof content === "string" && content.trim() !== "" ? content : undefined;
  const filePaths = Array.isArray(files) ? (files as string[]) : [];
  if (contentText === undefined && filePaths.length === 0) {
    throw new ReqError("json-validator: supply inline content or at least one file path to validate.");
  }
  const entries: JsonValidatorEntry[] = [];
  if (contentText !== undefined) {
    entries.push(buildJsonValidatorEntry("content", contentText));
  }
  for (const filePath of filePaths) {
    entries.push(buildJsonValidatorFileEntry(filePath));
  }
  return { stdout: renderJsonValidationMarkdown(entries), stderr: "", code: 0 };
}
