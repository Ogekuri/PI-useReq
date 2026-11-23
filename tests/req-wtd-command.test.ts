import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  executeReqWtdCommandExecution,
  prepareReqWtdCommandExecution,
} from "../src/core/req-wtd-command.js";
import { getDefaultConfig } from "../src/core/config.js";
import { initFixtureRepo } from "./helpers.js";

/**
 * @brief Verifies `req-wtd` removes only the current worktree and keeps sibling generated worktrees and branches.
 * @details Prepares one fixture repository with one generated worktree plus branch anchored under the host process cwd and one sibling generated branch checked out in the main worktree, prepares and executes the `req-wtd` plan without any session context, and verifies the plan normalizes to the main repository so only the anchored worktree and its branch are force-removed while the sibling generated branch and the main-worktree HEAD stay untouched. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after target-scoping assertions complete.
 * @throws {AssertionError} Throws when the sibling generated branch is deleted, the main-worktree HEAD is switched, or the anchored worktree survives the disposal.
 * @satisfies REQ-309, REQ-310, REQ-822, TST-259
 */
test("req-wtd execution removes only the current worktree and keeps sibling generated branches", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const currentBranchName = `PI-useReq-${projectName}-master-20260923165510`;
  const siblingBranchName = `PI-useReq-${projectName}-master-20260923165520`;
  const worktreeRoot = path.join(parentPath, currentBranchName);
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", currentBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);
    const siblingBranchCreate = spawnSync("git", ["branch", siblingBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(siblingBranchCreate.status, 0, siblingBranchCreate.stderr);
    const siblingSwitch = spawnSync("git", ["switch", siblingBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(siblingSwitch.status, 0, siblingSwitch.stderr);
    process.chdir(worktreeRoot);

    const plan = prepareReqWtdCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqWtdCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [currentBranchName]);
    // deletePromptWorktree already removes the attached branch, so only the
    // residual-branch path reports into removedBranchNames.
    assert.deepEqual(result.removedBranchNames, []);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${currentBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${siblingBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(
      spawnSync("git", ["branch", "--show-current"], { cwd: projectBase, encoding: "utf8" }).stdout.trim(),
      siblingBranchName,
    );
    assert.equal(path.resolve(process.cwd()), path.resolve(projectBase));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `req-wtd` switches the main worktree off the resolved target branch before branch deletion.
 * @details Prepares one fixture repository whose main worktree HEAD is left checked out on a generated prompt-command branch while a detached registered worktree directory shares the same generated name, anchors the host process cwd inside that worktree, prepares and executes the `req-wtd` plan without any session context, and verifies the main worktree switches back to the repository main branch before the target branch is force-removed without git's checked-out-worktree rejection. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after main-branch recovery assertions complete.
 * @throws {AssertionError} Throws when the target branch cleanup stays blocked, the main worktree keeps the generated branch checked out, or the disposal reports a failure.
 * @satisfies REQ-819, REQ-309, REQ-310
 */
test("req-wtd execution switches the main worktree off the target branch before branch deletion", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const targetBranchName = `PI-useReq-${projectName}-master-20260923165530`;
  const targetWorktreeRoot = path.join(parentPath, targetBranchName);
  try {
    const branchCreate = spawnSync("git", ["branch", targetBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(branchCreate.status, 0, branchCreate.stderr);
    const headSwitch = spawnSync("git", ["switch", targetBranchName], { cwd: projectBase, encoding: "utf8" });
    assert.equal(headSwitch.status, 0, headSwitch.stderr);
    const detachedWorktreeAdd = spawnSync(
      "git",
      ["worktree", "add", "--detach", targetWorktreeRoot],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(detachedWorktreeAdd.status, 0, detachedWorktreeAdd.stderr);
    process.chdir(targetWorktreeRoot);

    const plan = prepareReqWtdCommandExecution(targetWorktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqWtdCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [targetBranchName]);
    // deletePromptWorktree already removes the attached branch, so only the
    // residual-branch path reports into removedBranchNames.
    assert.deepEqual(result.removedBranchNames, []);
    assert.equal(fs.existsSync(targetWorktreeRoot), false);
    assert.equal(
      spawnSync("git", ["branch", "--show-current"], { cwd: projectBase, encoding: "utf8" }).stdout.trim(),
      "master",
    );
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${targetBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(targetWorktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `req-wtd` plan normalization cleans leftover worktrees when invoked from inside one.
 * @details Prepares one fixture repository with one generated worktree plus branch, changes the host process cwd into that worktree, prepares and executes the `req-wtd` plan from the worktree base without any session context, and verifies the plan normalizes to the main repository so the generated worktree and branch are force-removed and the deleted live cwd is restored to the main base path. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after main-repository normalization assertions complete.
 * @throws {AssertionError} Throws when the plan leaves generated worktree artifacts behind or fails to restore the live cwd.
 * @satisfies REQ-309, REQ-310, TST-259
 */
test("req-wtd execution removes leftover worktrees when prepared from inside one", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const generatedBranchName = `PI-useReq-${projectName}-master-20260923165519`;
  const worktreeRoot = path.join(parentPath, generatedBranchName);
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", generatedBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);
    process.chdir(worktreeRoot);

    const plan = prepareReqWtdCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqWtdCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [generatedBranchName]);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${generatedBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: projectBase, encoding: "utf8" }).stdout
        .includes(path.resolve(worktreeRoot)),
      false,
    );
    assert.equal(path.resolve(process.cwd()), path.resolve(projectBase));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `req-wtd` force-removes generated worktrees containing active uncommitted changes.
 * @details Prepares one fixture repository with one generated worktree plus branch carrying an untracked file and one staged modification, changes the host process cwd into that worktree, prepares and executes the `req-wtd` plan without any session context, and verifies the dirty worktree plus branch are force-removed anyway so disposal works with or without active changes. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation and process cwd changes.
 * @return {Promise<void>} Promise resolved after dirty-worktree disposal assertions complete.
 * @throws {AssertionError} Throws when the dirty worktree survives the forced disposal or the branch remains listed.
 * @satisfies REQ-309, REQ-310, TST-261
 */
test("req-wtd execution force-removes dirty worktrees with active changes", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const generatedBranchName = `PI-useReq-${projectName}-master-20260923165523`;
  const worktreeRoot = path.join(parentPath, generatedBranchName);
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", generatedBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);
    const trackedSample = path.join(worktreeRoot, "README.md");
    if (!fs.existsSync(trackedSample)) {
      fs.writeFileSync(trackedSample, "sample\n", "utf8");
      assert.equal(spawnSync("git", ["add", "README.md"], { cwd: worktreeRoot, encoding: "utf8" }).status, 0);
      assert.equal(spawnSync("git", ["commit", "-m", "sample"], { cwd: worktreeRoot, encoding: "utf8" }).status, 0);
    }
    fs.writeFileSync(trackedSample, "dirty edit\n", "utf8");
    assert.equal(spawnSync("git", ["add", "README.md"], { cwd: worktreeRoot, encoding: "utf8" }).status, 0);
    fs.writeFileSync(path.join(worktreeRoot, "uncommitted.txt"), "dirty\n", "utf8");
    process.chdir(worktreeRoot);

    const plan = prepareReqWtdCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqWtdCommandExecution(plan);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [generatedBranchName]);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${generatedBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: projectBase, encoding: "utf8" }).stdout
        .includes(path.resolve(worktreeRoot)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
/**
 * @brief Reads the `cwd` header from one fake session file.
 * @details Parses the first JSONL line and returns its `cwd` field when available so the fake `switchSession(...)` can mirror pi session-path semantics without a live runtime. Runtime is O(n) in header size. No external state is mutated.
 * @param[in] sessionFile {string} Session-file path.
 * @param[in] fallbackCwd {string} Fallback cwd when the file cannot be parsed.
 * @return {string} Parsed session cwd or the fallback value.
 */
function readFakeReqWtdSessionCwd(sessionFile: string, fallbackCwd: string): string {
  try {
    const headerLine = fs.readFileSync(sessionFile, "utf8").split(/\r?\n/)[0] ?? "";
    const header = JSON.parse(headerLine) as { cwd?: unknown };
    return typeof header.cwd === "string" && header.cwd !== "" ? header.cwd : fallbackCwd;
  } catch {
    return fallbackCwd;
  }
}

/**
 * @brief Verifies `req-wtd` returns the pi CLI to the main branch path before removing a generated worktree without persisted prompt state.
 * @details Prepares one fixture repository with one generated worktree plus branch whose session file links the original base-path session as `parentSession`, anchors the host process cwd and a pi-like command context inside that worktree without any persisted prompt execution plan, and executes the `req-wtd` plan, verifying the command switches the active session back to the base-path session and re-anchors process plus context cwd surfaces onto the main base path BEFORE the worktree directory is removed. Runtime is dominated by temporary git setup plus cleanup. Side effects are limited to temporary repository mutation, session-file reads, process cwd changes, and fake session switching.
 * @return {Promise<void>} Promise resolved after pre-removal main-branch redirect assertions complete.
 * @throws {AssertionError} Throws when `req-wtd` removes the worktree while the pi CLI is still anchored inside it, fails to switch back to the base-path session, or reports a failed reset.
 * @satisfies REQ-257, REQ-818, REQ-308, REQ-309, TST-259
 */
test("req-wtd returns the pi CLI to the main branch path before removing a generated worktree without persisted prompt state", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const parentPath = path.resolve(projectBase, "..");
  const projectName = path.basename(projectBase);
  const generatedBranchName = `PI-useReq-${projectName}-master-20260923165522`;
  const worktreeRoot = path.join(parentPath, generatedBranchName);
  const sessionDir = path.join(os.tmpdir(), "pi-usereq-req-wtd-sessions");
  let baseSessionFile = "";
  let executionSessionFile = "";
  let switchSessionTarget: string | undefined;
  let worktreeExistedAtSwitchTime: boolean | undefined;
  try {
    const worktreeAdd = spawnSync(
      "git",
      ["worktree", "add", worktreeRoot, "-b", generatedBranchName],
      { cwd: projectBase, encoding: "utf8" },
    );
    assert.equal(worktreeAdd.status, 0, worktreeAdd.stderr);

    fs.mkdirSync(sessionDir, { recursive: true });
    baseSessionFile = path.join(sessionDir, `base-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
    fs.writeFileSync(
      baseSessionFile,
      `${JSON.stringify({
        type: "session",
        version: 3,
        id: path.basename(baseSessionFile, ".jsonl"),
        timestamp: new Date(0).toISOString(),
        cwd: projectBase,
      })}\n`,
      "utf8",
    );
    executionSessionFile = path.join(sessionDir, `exec-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
    fs.writeFileSync(
      executionSessionFile,
      `${JSON.stringify({
        type: "session",
        version: 3,
        id: path.basename(executionSessionFile, ".jsonl"),
        timestamp: new Date(0).toISOString(),
        cwd: worktreeRoot,
        parentSession: baseSessionFile,
      })}\n`,
      "utf8",
    );

    let contextCwd = worktreeRoot;
    const ctx = {
      cwd: worktreeRoot,
      sessionManager: {
        getBranch: () => [],
        getCwd: () => contextCwd,
        getSessionDir: () => sessionDir,
        getSessionFile: () => executionSessionFile,
      },
      switchSession: async (sessionPath: string) => {
        switchSessionTarget = sessionPath;
        worktreeExistedAtSwitchTime = fs.existsSync(worktreeRoot);
        contextCwd = readFakeReqWtdSessionCwd(sessionPath, contextCwd);
        process.chdir(contextCwd);
        return { cancelled: false };
      },
    };

    process.chdir(worktreeRoot);
    const plan = prepareReqWtdCommandExecution(worktreeRoot, getDefaultConfig(projectBase));
    const result = await executeReqWtdCommandExecution(plan, ctx);

    assert.equal(result.errorMessage, undefined);
    assert.deepEqual(result.removedWorktreeDirs, [generatedBranchName]);
    assert.equal(fs.existsSync(worktreeRoot), false);
    assert.equal(switchSessionTarget, path.resolve(baseSessionFile));
    assert.equal(worktreeExistedAtSwitchTime, true);
    assert.equal(path.resolve(process.cwd()), path.resolve(projectBase));
    assert.equal(path.resolve(ctx.cwd), path.resolve(projectBase));
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${generatedBranchName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      1,
    );
    assert.equal(
      spawnSync("git", ["worktree", "list", "--porcelain"], { cwd: projectBase, encoding: "utf8" }).stdout
        .includes(path.resolve(worktreeRoot)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(worktreeRoot, { recursive: true, force: true });
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});
