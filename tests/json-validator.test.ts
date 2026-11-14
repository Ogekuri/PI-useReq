import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  extractJsonParsePosition,
  renderJsonValidationMarkdown,
  runJsonValidator,
  summarizeJsonRoot,
  type JsonValidatorEntry,
} from "../src/core/json-validator.js";
import { ReqError } from "../src/core/errors.js";

/**
 * @brief Creates one deterministic temporary directory for file-based validation cases.
 * @details Delegates to `fs.mkdtempSync` under the OS temporary directory so tests never mutate the
 * repository tree. Runtime is O(1). Side effects include one directory creation.
 * @param[in] prefix {string} Temporary-directory name prefix.
 * @return {string} Absolute temporary directory path.
 */
function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @brief Verifies root summaries expose type plus structural counts for every root kind.
 * @details Probes scalar roots, object roots with nested containers, and array roots with nested
 * arrays, asserting top-level counts, recursive counts, and maximum nesting depths. Runtime is
 * O(1). No external state is mutated. No filesystem or network access occurs.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when a structural summary deviates from the parsed shape.
 * @satisfies REQ-704
 */
test("summarizeJsonRoot reports root types and structural counts", () => {
  assert.deepEqual(summarizeJsonRoot(null), { rootType: "null" });
  assert.deepEqual(summarizeJsonRoot(42), { rootType: "number" });
  assert.deepEqual(summarizeJsonRoot("text"), { rootType: "string" });
  assert.deepEqual(summarizeJsonRoot(true), { rootType: "boolean" });

  const objectSummary = summarizeJsonRoot({ alpha: 1, beta: { gamma: [1, 2] } });
  assert.equal(objectSummary.rootType, "object");
  assert.equal(objectSummary.keys, 2);
  assert.equal(objectSummary.totalKeys, 3);
  assert.equal(objectSummary.items, undefined);
  assert.equal(objectSummary.totalItems, undefined);
  assert.equal(objectSummary.depth, 3);

  const arraySummary = summarizeJsonRoot([1, [2, [3]]]);
  assert.equal(arraySummary.rootType, "array");
  assert.equal(arraySummary.items, 2);
  assert.equal(arraySummary.totalItems, 5);
  assert.equal(arraySummary.depth, 3);
});

/**
 * @brief Verifies parser position diagnostics resolve deterministically across message formats.
 * @details Probes the legacy `position N` fragment, the modern `position N (line X column Y)`
 * fragment, a message without position facts, and an out-of-range position, asserting one-based
 * line and column outputs or absent fields. Runtime is O(p) in prefix length. No external state is
 * mutated. No filesystem or network access occurs.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when line or column diagnostics deviate from the documented
 * resolution rules.
 * @satisfies REQ-705
 */
test("extractJsonParsePosition resolves line and column diagnostics deterministically", () => {
  const content = '{\n  "alpha": 1,\n}\n';

  const legacy = extractJsonParsePosition(content, "Unexpected token } in JSON at position 16");
  assert.equal(legacy.line, 3);
  assert.equal(legacy.column, 1);

  const modern = extractJsonParsePosition(
    content,
    "Expected double-quoted property name in JSON at position 16 (line 3 column 1)",
  );
  assert.equal(modern.line, 3);
  assert.equal(modern.column, 1);

  const absent = extractJsonParsePosition(content, "Unexpected end of JSON input");
  assert.equal(absent.line, undefined);
  assert.equal(absent.column, undefined);

  const outOfRange = extractJsonParsePosition("{}", "Unexpected token } in JSON at position 99");
  assert.equal(outOfRange.line, undefined);
  assert.equal(outOfRange.column, undefined);
});

/**
 * @brief Verifies runJsonValidator reports valid and invalid verdicts without throwing.
 * @details Executes the runner twice with one valid and one invalid inline payload, asserting exit
 * code 0 for both, the ordered record blocks, root type plus structural counts, the parser error
 * line and column diagnostics, and the aggregate validation summary. Runtime is O(n) in payload
 * size. No external state is mutated. No filesystem or network access occurs.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when a verdict record or the summary deviates from the contract.
 * @satisfies REQ-703, REQ-704, REQ-705
 */
test("runJsonValidator reports valid and invalid verdicts without throwing", () => {
  const valid = runJsonValidator({ content: '{"alpha": 1, "beta": [true, null]}' });
  assert.equal(valid.code, 0);
  assert.equal(valid.stderr, "");
  assert.match(valid.stdout, /^@@@ content \| JSON\n/);
  assert.match(valid.stdout, /> Result: valid/);
  assert.match(valid.stdout, /- @root-type object/);
  assert.match(valid.stdout, /- @keys 2/);
  assert.match(valid.stdout, /- @total-keys 2/);
  assert.match(valid.stdout, /- @depth 2/);
  assert.match(valid.stdout, /- @chars \d+/);
  assert.match(valid.stdout, /- @tokens \d+/);
  assert.match(valid.stdout, /## Validation Summary/);
  assert.match(valid.stdout, /- @requests 1/);
  assert.match(valid.stdout, /- @valid 1/);
  assert.match(valid.stdout, /- @invalid 0/);

  const invalid = runJsonValidator({ content: '{\n  "alpha": 1,\n}\n' });
  assert.equal(invalid.code, 0);
  assert.match(invalid.stdout, /> Result: invalid/);
  assert.match(invalid.stdout, /- @error /);
  assert.match(invalid.stdout, /- @line 3/);
  assert.match(invalid.stdout, /- @column 1/);
  assert.match(invalid.stdout, /- @invalid 1/);
});

/**
 * @brief Verifies file entries validate independently and read failures never abort the run.
 * @details Writes one valid and one invalid JSON file, executes the runner over them plus one
 * missing path, and asserts per-file records in caller order, array structural counts, invalid
 * records for the malformed and missing entries, and aggregate summary counts with exit code 0.
 * Runtime is O(n) in file size. Side effects include one temporary directory creation and removal.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when file records or failure isolation deviate from the contract.
 * @satisfies REQ-707
 */
test("runJsonValidator validates file entries and reports unreadable files without aborting", () => {
  const dir = createTempDir("pi-usereq-json-validator-");
  try {
    const validPath = path.join(dir, "valid.json");
    const invalidPath = path.join(dir, "invalid.json");
    fs.writeFileSync(validPath, "[1, 2, 3]", "utf8");
    fs.writeFileSync(invalidPath, "{oops}", "utf8");

    const result = runJsonValidator({
      files: [validPath, invalidPath, path.join(dir, "missing.json")],
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /@@@ [^\n]*valid\.json \| JSON/);
    assert.match(result.stdout, /- @root-type array/);
    assert.match(result.stdout, /- @items 3/);
    assert.match(result.stdout, /- @total-items 3/);
    assert.match(result.stdout, /- @depth 1/);
    assert.match(result.stdout, /@@@ [^\n]*invalid\.json \| JSON/);
    assert.match(result.stdout, /> Result: invalid/);
    assert.match(result.stdout, /- @error /);
    assert.match(result.stdout, /@@@ [^\n]*missing\.json \| JSON/);
    assert.match(result.stdout, /Unable to read file/);
    assert.match(result.stdout, /## Validation Summary/);
    assert.match(result.stdout, /- @requests 3/);
    assert.match(result.stdout, /- @valid 1/);
    assert.match(result.stdout, /- @invalid 2/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies malformed requests fail deterministically without producing verdict output.
 * @details Probes the empty request, non-string content, non-array files, blank file entries, and
 * the empty-content-plus-empty-files combination, asserting one ReqError with a deterministic
 * diagnostic for each. Runtime is O(1). No external state is mutated. No filesystem or network
 * access occurs.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when a malformed request does not fail with the documented
 * diagnostic.
 * @satisfies REQ-706, TST-231
 */
test("runJsonValidator rejects requests without content and files deterministically", () => {
  assert.throws(
    () => runJsonValidator({}),
    (error: unknown) =>
      error instanceof ReqError && /supply inline content or at least one file path/.test(error.message),
  );
  assert.throws(() => runJsonValidator({ content: 42 }), /content must be a string/);
  assert.throws(() => runJsonValidator({ files: "not-an-array" }), /files must be an array/);
  assert.throws(() => runJsonValidator({ files: ["", "  "] }), /files must be an array/);
  assert.throws(
    () => runJsonValidator({ content: "", files: [] }),
    /supply inline content or at least one file path/,
  );
});

/**
 * @brief Verifies the verdict renderer emits one deterministic monolithic document.
 * @details Renders the same record vector twice and asserts byte identity, the leading record
 * header, the summary footer carrying the invalid count, and that valid records omit error bullets
 * while invalid records omit structural bullets. Runtime is O(n) in rendered length. No external
 * state is mutated. No filesystem or network access occurs.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when the rendered document is non-deterministic or mis-shaped.
 * @satisfies REQ-703
 */
test("renderJsonValidationMarkdown emits one deterministic monolithic verdict document", () => {
  const entries: JsonValidatorEntry[] = [
    { label: "content", valid: true, rootType: "object", keys: 1, totalKeys: 1, depth: 1, chars: 12, tokens: 8 },
    { label: "broken.json", valid: false, chars: 9, tokens: 6, error: "Unexpected token", line: 1, column: 3 },
  ];

  const first = renderJsonValidationMarkdown(entries);
  const second = renderJsonValidationMarkdown(entries);
  assert.equal(first, second);
  assert.match(first, /^@@@ content \| JSON\n> Result: valid\n/);
  assert.match(first, /@@@ broken\.json \| JSON\n> Result: invalid\n/);
  assert.ok(first.includes("- @line 1\n- @column 3\n"));
  assert.ok(!first.includes("- @error Unexpected token\n- @root-type"));
  assert.ok(first.trimEnd().endsWith("- @invalid 1"));
});
