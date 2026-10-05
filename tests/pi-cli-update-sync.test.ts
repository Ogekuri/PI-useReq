import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UPDATER_SCRIPT_PATH = path.join(ROOT, "scripts", "pi-cli-update-src-docs.sh");
const HARNESS_ENTRY_SENTINEL = "trap cleanup EXIT";
const COMMITTED_CRLF_CONTENT = "alpha\r\nbeta\r\n";
const UPSTREAM_LF_CONTENT = "alpha\nbeta\n";
const MIRROR_RELATIVE_PATH = "mirror/sample.bat";
const UPSTREAM_CHANGED_LF_CONTENT = "alpha\nbeta\ngamma\n";
const EXPECTED_CLEAN_GIT_STATUS = "";

/**
 * @brief Describes one isolated `sync_directory` fixture layout.
 * @details Groups the fixture root, the committed git repository root, the upstream source directory, and the synchronization target directory created by `createSyncFixture`. Compile-time only and introduces no runtime cost.
 */
interface SyncFixture {
  fixtureRoot: string;
  repoRoot: string;
  sourceDir: string;
  targetDir: string;
}

/**
 * @brief Creates one isolated git fixture with a CRLF committed mirror and an LF upstream copy.
 * @details Allocates a unique temp fixture root, commits a CRLF mirror file in a fresh git repository, and stages the byte-equivalent LF file in the upstream source directory so `sync_directory` can be exercised offline. Runtime is dominated by git subprocess execution. Side effects include temp-directory creation and git subprocesses against the isolated fixture only.
 * @param[in] fixtureRootPrefix {string} Temp-directory prefix forwarded to `fs.mkdtempSync(...)`.
 * @return {SyncFixture} Fixture paths for harness and assertion use.
 */
function createSyncFixture(fixtureRootPrefix: string): SyncFixture {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), fixtureRootPrefix));
  const repoRoot = path.join(fixtureRoot, "repo");
  const targetDir = path.join(repoRoot, path.dirname(MIRROR_RELATIVE_PATH));
  const sourceDir = path.join(fixtureRoot, "upstream");
  fs.mkdirSync(targetDir, { recursive: true });
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.writeFileSync(path.join(repoRoot, MIRROR_RELATIVE_PATH), COMMITTED_CRLF_CONTENT);
  fs.writeFileSync(path.join(sourceDir, path.basename(MIRROR_RELATIVE_PATH)), UPSTREAM_LF_CONTENT);
  const git = (args: string[]): { status: number | null; stderr: string } =>
    spawnSync("git", args, { cwd: repoRoot, encoding: "utf8" });
  const init = git(["init", "-q"]);
  assert.equal(init.status, 0, init.stderr);
  const add = git(["add", MIRROR_RELATIVE_PATH]);
  assert.equal(add.status, 0, add.stderr);
  const commit = git([
    "-c", "user.email=pi-usereq-test@example.invalid",
    "-c", "user.name=pi-usereq-test",
    "-c", "commit.gpgsign=false",
    "commit", "-q", "-m", "fixture init",
  ]);
  assert.equal(commit.status, 0, commit.stderr);
  return { fixtureRoot, repoRoot, sourceDir, targetDir };
}

/**
 * @brief Builds the bash harness that exercises `sync_directory` from the updater script.
 * @details Splits the updater script at the `trap cleanup EXIT` entry sentinel so only the function definitions are sourced, overrides `REPO_ROOT` with the fixture repository root, and appends the requested number of sequential `sync_directory` invocations. Runtime is O(n) in updater script size. Side effects include harness file creation under the fixture root.
 * @param[in] fixtureRoot {string} Absolute fixture root directory that receives the harness file.
 * @param[in] sourceDir {string} Absolute upstream source directory forwarded to every sync call.
 * @param[in] targetDir {string} Absolute synchronization target directory forwarded to every sync call.
 * @param[in] callCount {number} Number of sequential `sync_directory` invocations appended to the harness.
 * @return {string} Absolute harness script path ready for `bash` execution.
 */
function writeSyncHarness(fixtureRoot: string, sourceDir: string, targetDir: string, callCount: number): string {
  assert.ok(!sourceDir.includes("'") && !targetDir.includes("'"), "fixture paths must not contain single quotes");
  const script = fs.readFileSync(UPDATER_SCRIPT_PATH, "utf8");
  const sentinelIndex = script.indexOf(`\n${HARNESS_ENTRY_SENTINEL}`);
  assert.ok(sentinelIndex >= 0, "updater script entry sentinel not found");
  const functionDefinitions = script.slice(0, sentinelIndex);
  const syncCalls = Array.from({ length: callCount }, () => `sync_directory '${sourceDir}' '${targetDir}'`);
  const harnessPath = path.join(fixtureRoot, "sync-harness.sh");
  const harness = [
    "set -euo pipefail",
    functionDefinitions,
    `REPO_ROOT='${path.join(fixtureRoot, "repo")}'`,
    'STAGING_DIR=""',
    ...syncCalls,
    "",
  ].join("\n");
  fs.writeFileSync(harnessPath, harness);
  return harnessPath;
}

/**
 * @brief Executes one harness script through bash.
 * @details Runs `bash <harnessPath>` and returns the captured subprocess result so tests can assert exit status plus stderr diagnostics. Runtime is dominated by child-process execution. Side effects are the filesystem and git effects performed by the exercised `sync_directory` calls inside the isolated fixture.
 * @param[in] harnessPath {string} Absolute harness script path.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured process result.
 */
function runSyncHarness(harnessPath: string) {
  return spawnSync("bash", [harnessPath], { encoding: "utf8" });
}

/**
 * @brief Reads the porcelain git status of one fixture repository.
 * @details Executes `git status --porcelain` inside the fixture repository and returns its stdout as the observable git-side update evidence. Runtime is dominated by one git subprocess. Side effects are limited to subprocess execution against the isolated fixture.
 * @param[in] repoRoot {string} Absolute fixture repository root.
 * @return {string} Porcelain status lines; the empty string marks a clean repository.
 */
function readGitStatus(repoRoot: string): string {
  const status = spawnSync("git", ["status", "--porcelain"], { cwd: repoRoot, encoding: "utf8" });
  assert.equal(status.status, 0, status.stderr);
  return status.stdout;
}

test("updater sync keeps the mirror git-clean across consecutive runs when upstream content differs only in line endings", () => {
  const expectedMirrorContent = COMMITTED_CRLF_CONTENT;
  const fixture = createSyncFixture("pi-usereq-sync-eol-");
  const harnessPath = writeSyncHarness(fixture.fixtureRoot, fixture.sourceDir, fixture.targetDir, 2);

  const result = runSyncHarness(harnessPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, "");
  assert.equal(readGitStatus(fixture.repoRoot), EXPECTED_CLEAN_GIT_STATUS);
  assert.equal(fs.readFileSync(path.join(fixture.repoRoot, MIRROR_RELATIVE_PATH), "utf8"), expectedMirrorContent);
});

test("updater sync applies real upstream content changes to the mirror", () => {
  const fixture = createSyncFixture("pi-usereq-sync-change-");
  fs.writeFileSync(path.join(fixture.sourceDir, path.basename(MIRROR_RELATIVE_PATH)), UPSTREAM_CHANGED_LF_CONTENT);
  const harnessPath = writeSyncHarness(fixture.fixtureRoot, fixture.sourceDir, fixture.targetDir, 1);

  const result = runSyncHarness(harnessPath);

  assert.equal(result.status, 0, result.stderr);
  assert.match(readGitStatus(fixture.repoRoot), /M mirror\/sample\.bat/);
  assert.equal(fs.readFileSync(path.join(fixture.repoRoot, MIRROR_RELATIVE_PATH), "utf8"), UPSTREAM_CHANGED_LF_CONTENT);
});

test("updater sync adds upstream entries missing from the mirror", () => {
  const expectedAddedContent = "extra\n";
  const fixture = createSyncFixture("pi-usereq-sync-add-");
  fs.writeFileSync(path.join(fixture.sourceDir, "extra.txt"), expectedAddedContent);
  const harnessPath = writeSyncHarness(fixture.fixtureRoot, fixture.sourceDir, fixture.targetDir, 1);

  const result = runSyncHarness(harnessPath);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(fixture.targetDir, "extra.txt"), "utf8"), expectedAddedContent);
});

test("updater sync fails when the upstream source directory is missing", () => {
  const expectedErrorMessage = "ERROR: Upstream directory not found";
  const fixture = createSyncFixture("pi-usereq-sync-missing-");
  const missingSourceDir = path.join(fixture.fixtureRoot, "missing");
  const harnessPath = writeSyncHarness(fixture.fixtureRoot, missingSourceDir, fixture.targetDir, 1);

  const result = runSyncHarness(harnessPath);

  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes(expectedErrorMessage), result.stderr);
});
