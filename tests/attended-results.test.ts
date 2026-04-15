/**
 * @file
 * @brief Verifies archive-backed CLI outputs against committed expected-result fixtures.
 * @details Loads normalized expected results from `tests/fixtures_attended_results/`, asserts that every required fixture file exists, executes the TypeScript CLI across all attended scenarios, and compares exact exit code, stdout, and stderr payloads after shared normalization. Runtime is dominated by subprocess execution and temporary repository setup. Side effects are limited to temporary repositories, temporary worktrees, and fixture-file reads.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  ATTENDED_SCENARIOS,
  getArchiveFilePath,
  loadArchivedCliResult,
  runNodeAttendedScenario,
} from "./attended-results-scenarios.js";

/**
 * @brief Verifies that every archive-backed scenario has a committed expected-result fixture.
 * @details Iterates over the deterministic scenario catalog and fails fast when any archive file is missing so output comparisons never run with implicit expectations. Runtime is O(n) in scenario count. Side effects are limited to filesystem reads.
 */
test("archive-backed CLI scenarios have committed expected-result fixtures", () => {
  for (const scenario of ATTENDED_SCENARIOS) {
    assert.ok(fs.existsSync(getArchiveFilePath(scenario)), `missing archive fixture for ${scenario.id}`);
  }
});

/**
 * @brief Compares TypeScript CLI outputs against committed archive fixtures.
 * @details Executes every attended scenario as a subtest, loads the committed expected result, runs the TypeScript CLI, and asserts deep equality on normalized exit code, stdout, and stderr. Runtime is dominated by subprocess execution and temporary repository setup. Side effects are limited to temporary filesystem state managed by scenario helpers.
 */
test("TypeScript CLI outputs match committed attended-result fixtures", async (t) => {
  for (const scenario of ATTENDED_SCENARIOS) {
    await t.test(scenario.id, () => {
      const expected = loadArchivedCliResult(scenario);
      const actual = runNodeAttendedScenario(scenario);
      assert.deepEqual(actual, expected, `archive mismatch for ${scenario.id}`);
    });
  }
});
