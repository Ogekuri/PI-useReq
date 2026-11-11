import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @brief Loads the repository-owned `.gitignore` as raw lines.
 * @details Resolves `.gitignore` from the current process working directory and splits the UTF-8 document on line terminators so include and exclude section assertions stay deterministic. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {string[]} Raw `.gitignore` lines.
 * @satisfies TST-189
 */
function readGitignoreLines(): string[] {
  return fs.readFileSync(path.join(process.cwd(), ".gitignore"), "utf8").split(/\r?\n/);
}

/**
 * @brief Resolves the include and exclude section header positions of `.gitignore`.
 * @details Locates the `Include specific files and directories` header and the first subsequent `Exlucde specific files and directories` header, asserting both exist in declaration order. Runtime is O(n) in line count. No side effects occur.
 * @param[in] lines {string[]} Raw `.gitignore` lines.
 * @return {{ includeStart: number; excludeStart: number }} Zero-based header line indexes.
 * @satisfies TST-189
 */
function locateGitignoreSections(lines: string[]): { includeStart: number; excludeStart: number } {
  const includeStart = lines.findIndex((line) => line.includes("Include specific files and directories"));
  const excludeStart = lines.findIndex(
    (line, index) => index > includeStart && line.includes("Exlucde specific files and directories"),
  );
  assert.ok(includeStart >= 0, "include section header must exist");
  assert.ok(excludeStart > includeStart, "exclude section header must follow the include section");
  return { includeStart, excludeStart };
}

/**
 * @brief Evaluates one repository path against the `.gitignore` rules alone.
 * @details Runs `git check-ignore --no-index --quiet` from the repository root so tracked status never masks the pattern verdict. Exit status `0` denotes an ignored path and `1` denotes a path that is not ignored. Runtime is dominated by one git subprocess. Side effects include process spawning.
 * @param[in] relativePath {string} Repository-relative path to evaluate.
 * @return {number | null} Raw git exit status.
 * @satisfies TST-189
 */
function gitCheckIgnoreStatus(relativePath: string): number | null {
  const result = spawnSync("git", ["check-ignore", "--no-index", "--quiet", "--", relativePath], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  return result.status;
}

/**
 * @brief Verifies that the include section re-includes the `dist/` directory and its contents.
 * @details Arranges the parsed section boundaries, extracts trimmed include-section rules, and asserts the exact `!dist/` and `!dist/**\/*` re-inclusion rules are declared. Runtime is O(n) in line count. No side effects occur.
 * @return {void} No return value.
 * @satisfies TST-189, REQ-575
 */
test("gitignore include section re-includes dist/ directory and contents", () => {
  // Arrange
  const lines = readGitignoreLines();
  const { includeStart, excludeStart } = locateGitignoreSections(lines);
  const includeRules = lines.slice(includeStart, excludeStart).map((line) => line.trim());

  // Act / Assert
  assert.ok(includeRules.includes("!dist/"), "include section must declare !dist/");
  assert.ok(includeRules.includes("!dist/**/*"), "include section must declare !dist/**/*");
});

/**
 * @brief Verifies that the exclude section declares no rule targeting `dist/` paths.
 * @details Arranges the exclude-section start index, extracts every non-comment non-empty rule below it, and asserts that no rule text references `dist`. Runtime is O(n) in line count. No side effects occur.
 * @return {void} No return value.
 * @satisfies TST-189, REQ-576
 */
test("gitignore exclude section declares no rule targeting dist paths", () => {
  // Arrange
  const lines = readGitignoreLines();
  const { excludeStart } = locateGitignoreSections(lines);
  const excludeRules = lines
    .slice(excludeStart + 1)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  // Act
  const distPathSegment = /(^|[/*!])dist(?=[/*]|$)/;
  const distRules = excludeRules.filter((rule) => distPathSegment.test(rule));

  // Assert
  assert.deepEqual(distRules, [], "exclude section must not reference dist paths");
});

/**
 * @brief Verifies that git keeps `dist/` release artifacts visible while unrelated files stay ignored.
 * @details Evaluates representative `dist/` artifact paths with `git check-ignore --no-index`, expecting exit status `1` (not ignored), and a control path outside `dist/` that the exclude-all rules must still ignore with exit status `0`. Runtime is dominated by git subprocesses. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-189, REQ-575, REQ-576
 */
test("git check-ignore reports dist/ release artifacts as not ignored", () => {
  // Arrange
  const distArtifacts = [
    "dist/pi-usereq-0.95.0.tgz",
    "dist/pi-usereq-0.95.0.tar.gz",
    "dist/nested/release-notes.txt",
  ];
  const controlPath = "unlisted-control-file.txt";

  // Act / Assert
  for (const artifact of distArtifacts) {
    assert.equal(gitCheckIgnoreStatus(artifact), 1, `${artifact} must not be ignored`);
  }
  assert.equal(gitCheckIgnoreStatus(controlPath), 0, "unlisted root file must remain ignored");
});

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
