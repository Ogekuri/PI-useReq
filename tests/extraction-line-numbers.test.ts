/**
 * @file
 * @brief Verifies numbered compression and as-is construct extraction over known functions.
 * @details Creates deterministic temporary Python fixtures whose comments, blank lines, and function bodies occupy fixed line positions, executes the standalone and project CLI extraction commands, and asserts exact line-numbered outputs where every emitted line maps to its original source line number and comment lines reproduce source bytes verbatim. Runtime is dominated by subprocess execution. Side effects are limited to temporary directory creation and cleanup.
 * @satisfies TST-250, TST-251
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { initFixtureRepo, runNodeCli } from "./helpers.js";

/**
 * @brief Defines the deterministic extraction fixture file name.
 * @details The name keeps standalone CLI headers stable because explicit-file output paths render relative to the fixture directory. Access complexity is O(1).
 */
const EXTRACTION_FIXTURE_NAME = "sample_extract.py";

/**
 * @brief Defines the line-position-stable extraction fixture content.
 * @details Lines 1 and 4 carry comments, lines 2, 5, 9, and the trailing terminator carry blank lines, `extracted` spans lines 3-8, and `other` spans lines 10-11 so every numbering assertion binds to a fixed source coordinate. Access complexity is O(1).
 */
const EXTRACTION_FIXTURE_CONTENT = [
  "# module header comment",
  "",
  "def extracted(value):",
  "    # boundary guard comment",
  "",
  "    if value < 0:",
  "        return 0",
  "    return value + 1",
  "",
  "def other():",
  "    return 2",
  "",
].join("\n");

/**
 * @brief Defines the expected numbered compression excerpt for the extraction fixture.
 * @details Retained lines keep their original source line-number prefixes while comment and blank lines disappear, so prefixes jump from 3 to 6 and from 8 to 10 across removed lines. Access complexity is O(1).
 */
const EXPECTED_COMPRESSED_EXCERPT = [
  "3: def extracted(value):",
  "6:     if value < 0:",
  "7:         return 0",
  "8:     return value + 1",
  "10: def other():",
  "11:     return 2",
].join("\n");

/**
 * @brief Defines the expected as-is construct excerpt for the `extracted` function span 3-9.
 * @details The excerpt reproduces the comment line 4 and blank lines 5 and 9 verbatim, each prefixed by its absolute source line number. Access complexity is O(1).
 */
const EXPECTED_EXTRACTED_CONSTRUCT_EXCERPT = [
  "3: def extracted(value):",
  "4:     # boundary guard comment",
  "5: ",
  "6:     if value < 0:",
  "7:         return 0",
  "8:     return value + 1",
  "9: ",
].join("\n");

/**
 * @brief Creates one deterministic temporary extraction fixture.
 * @details Allocates a unique directory under the system temp root, writes the fixed extraction fixture content, and registers recursive cleanup on the test context. Runtime is O(n) in content size. Side effects include temporary directory creation.
 * @param[in] t {import("node:test").TestContext} Active test context receiving the cleanup hook.
 * @return {string} Absolute fixture file path.
 */
function createExtractionFixture(t: import("node:test").TestContext): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "usereq-extraction-"));
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const fixturePath = path.join(tempDir, EXTRACTION_FIXTURE_NAME);
  fs.writeFileSync(fixturePath, EXTRACTION_FIXTURE_CONTENT, "utf8");
  return fixturePath;
}

/**
 * @brief Verifies standalone `--files-compress` maps compressed function lines to original source line numbers.
 * @details Runs the standalone compression command over the line-position-stable fixture and asserts the exact numbered markdown block, including the `> Lines: 3-11` range and the 3-to-6 plus 8-to-10 prefix jumps over removed comment and blank lines. Runtime is dominated by subprocess execution. Side effects are limited to temporary fixture cleanup.
 * @satisfies REQ-012, REQ-083, TST-250
 */
test("standalone files-compress maps compressed function lines to original source line numbers", (t) => {
  const fixturePath = createExtractionFixture(t);
  const cwd = path.dirname(fixturePath);

  const result = runNodeCli(["--files-compress", EXTRACTION_FIXTURE_NAME], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, [
    `@@@ ${EXTRACTION_FIXTURE_NAME} | python`,
    "> Lines: 3-11",
    "```",
    EXPECTED_COMPRESSED_EXCERPT,
    "```",
    "",
  ].join("\n"));
});

/**
 * @brief Verifies project-scope `--compress` maps compressed function lines to original source line numbers.
 * @details Writes the extraction fixture into the configured `src-dir` of a fixture repository and asserts the exact numbered markdown block with the `src/`-relative output header. Runtime is dominated by subprocess execution. Side effects are limited to temporary repository creation and cleanup.
 * @satisfies REQ-012, REQ-015, REQ-083, TST-250
 */
test("project compress maps compressed function lines to original source line numbers", (t) => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  t.after(() => {
    fs.rmSync(projectBase, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(projectBase, "src", EXTRACTION_FIXTURE_NAME), EXTRACTION_FIXTURE_CONTENT, "utf8");

  const result = runNodeCli(["--compress"], projectBase);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, [
    "@@@ src/sample_extract.py | python",
    "> Lines: 3-11",
    "```",
    EXPECTED_COMPRESSED_EXCERPT,
    "```",
    "",
  ].join("\n"));
});

/**
 * @brief Verifies standalone `--files-find` reproduces extracted function source lines as-is with original line numbers.
 * @details Runs the standalone construct search for `extracted` and asserts the exact markdown block whose fenced excerpt retains the comment line 4 and blank lines 5 and 9 verbatim under their absolute source line-number prefixes. Runtime is dominated by subprocess execution. Side effects are limited to temporary fixture cleanup.
 * @satisfies REQ-013, REQ-092, TST-250, TST-251
 */
test("standalone files-find reproduces extracted function source lines as-is with original line numbers", (t) => {
  const fixturePath = createExtractionFixture(t);
  const cwd = path.dirname(fixturePath);

  const result = runNodeCli(["--files-find", "FUNCTION", "^extracted$", EXTRACTION_FIXTURE_NAME], cwd);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, [
    `@@@ ${EXTRACTION_FIXTURE_NAME} | python`,
    "",
    "### FUNCTION: `extracted`",
    "> Signature: `def extracted(value)`",
    "> Lines: 3-9",
    "```",
    EXPECTED_EXTRACTED_CONSTRUCT_EXCERPT,
    "```",
    "",
  ].join("\n"));
});

/**
 * @brief Verifies project-scope `--find` reproduces extracted function source lines as-is with original line numbers.
 * @details Runs the project construct search for `extracted` against the configured `src-dir` and asserts the exact markdown block whose fenced excerpt retains the comment line 4 and blank lines 5 and 9 verbatim under their absolute source line-number prefixes. Runtime is dominated by subprocess execution. Side effects are limited to temporary repository creation and cleanup.
 * @satisfies REQ-013, REQ-016, REQ-092, TST-250, TST-251
 */
test("project find reproduces extracted function source lines as-is with original line numbers", (t) => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  t.after(() => {
    fs.rmSync(projectBase, { recursive: true, force: true });
  });
  fs.writeFileSync(path.join(projectBase, "src", EXTRACTION_FIXTURE_NAME), EXTRACTION_FIXTURE_CONTENT, "utf8");

  const result = runNodeCli(["--find", "FUNCTION", "^extracted$"], projectBase);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout, [
    `@@@ ${path.join(projectBase, "src", EXTRACTION_FIXTURE_NAME)} | python`,
    "",
    "### FUNCTION: `extracted`",
    "> Signature: `def extracted(value)`",
    "> Lines: 3-9",
    "```",
    EXPECTED_EXTRACTED_CONSTRUCT_EXCERPT,
    "```",
    "",
  ].join("\n"));
});
