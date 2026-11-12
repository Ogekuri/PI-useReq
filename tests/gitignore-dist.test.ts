import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @brief Verifies the release gate script parses and skips `dist/` entries during generic removal.
 * @details Runs `bash -n` against `scripts/pre-release-check.sh` expecting exit status `0`, then asserts the generic removal case statement contains the `dist|dist/*` skip pattern. Runtime is dominated by one bash subprocess plus one file read. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-190, REQ-496, REQ-498, REQ-574
 */
test("pre-release gate passes bash syntax check and skips dist entries during generic removal", () => {
  // Arrange
  const scriptRelativePath = "scripts/pre-release-check.sh";

  // Act
  const syntax = spawnSync("bash", ["-n", scriptRelativePath], { cwd: process.cwd(), encoding: "utf8" });
  const script = fs.readFileSync(path.join(process.cwd(), scriptRelativePath), "utf8");

  // Assert
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(script.includes("dist|dist/*) continue ;;"), "generic removal must skip dist entries");
});
