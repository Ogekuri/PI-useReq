/**
 * @file
 * @brief Implements the specialized `req-reset` slash-command workflow.
 * @details Performs non-agentic prompt-orchestration recovery by preserving the current execution-session transcript when available, restoring the original session-backed `base-path`, force-removing every generated sibling worktree and matching branch, and returning deterministic cleanup facts to the extension command handler. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, worktree deletion, branch deletion, and filesystem removal.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import {
  normalizeGitWorktreePrefix,
  type UseReqConfig,
} from "./config.js";
import { ReqError } from "./errors.js";
import {
  deletePromptWorktree,
  getPromptCommandErrorContext,
  preservePromptCommandExecutionTranscript,
  restorePromptCommandExecution,
  switchPromptCommandSession,
  type PromptCommandExecutionPlan,
} from "./prompt-command-runtime.js";
import {
  isSameOrAncestorPath,
  setRuntimeContextPath,
  setRuntimeWorktreePathState,
} from "./path-context.js";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";

/**
 * @brief Declares the fixed slash-command description for `req-reset`.
 * @details Preserves a deterministic human-facing label for the dedicated non-agentic recovery command while keeping the implementation independent from bundled prompt Markdown files. Access complexity is O(1).
 */
export const REQ_RESET_COMMAND_DESCRIPTION = "Reset req workflow state, restore base-path, and remove generated worktrees";

/**
 * @brief Describes the prepared execution facts for one `req-reset` run.
 * @details Stores the validated project base, resolved git root, sibling-worktree parent directory, generated-name matcher, and optional persisted prompt execution plan used for transcript preservation plus base-path restoration. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReqResetCommandPlan {
  basePath: string;
  gitPath: string;
  parentPath: string;
  worktreeNamePattern: RegExp;
  promptRequest: PromptCommandExecutionPlan | undefined;
}

/**
 * @brief Describes the outcome of one `req-reset` execution attempt.
 * @details Captures the last valid session-bound context, transcript-preservation and base-path-restoration facts, removed generated worktree and branch names, and one aggregated failure string when any recovery step fails. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReqResetCommandExecutionResult {
  activeContext: ReqResetCommandContext | undefined;
  transcriptPreserved: boolean;
  restoredBasePath: boolean;
  removedWorktreeDirs: string[];
  removedBranchNames: string[];
  errorMessage?: string;
}

/**
 * @brief Describes the session-bound context surface reused during `req-reset` recovery.
 * @details Reuses the session-switching contract already accepted by `restorePromptCommandExecution(...)` so the dedicated reset command can restore the original session without depending on concrete pi runtime classes. The alias is compile-time only and introduces no runtime cost.
 */
type ReqResetCommandContext = Parameters<typeof restorePromptCommandExecution>[1];

/**
 * @brief Executes one synchronous subprocess and captures UTF-8 output.
 * @details Delegates to `spawnSync(...)`, preserves the supplied working directory, and returns the raw result so callers can interpret git exit status plus diagnostics deterministically. Runtime is dominated by external process execution. Side effects include subprocess creation.
 * @param[in] command {string[]} Executable plus argument vector.
 * @param[in] cwd {string} Working directory for the subprocess.
 * @return {SpawnSyncReturns<string>} Captured subprocess result with UTF-8 stdout and stderr.
 */
function runCapture(command: string[], cwd: string): SpawnSyncReturns<string> {
  return spawnSync(command[0]!, command.slice(1), {
    cwd,
    encoding: "utf8",
  });
}

/**
 * @brief Escapes one literal string for safe JavaScript regular-expression reuse.
 * @details Prefixes every regular-expression metacharacter with `\\` so generated worktree-name patterns can embed persisted prefixes and repository basenames without introducing unintended matcher semantics. Runtime is O(n) in string length. No external state is mutated.
 * @param[in] text {string} Literal text fragment.
 * @return {string} Regular-expression-safe literal fragment.
 */
function escapeReqResetRegExpLiteral(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * @brief Builds the generated-worktree name matcher used by `req-reset` cleanup.
 * @details Reuses the configured worktree prefix plus repository basename, accepts any sanitized branch token between those fixed segments and the final execution identifier, and constrains the timestamp suffix to the documented `YYYYMMDDHHMMSS` shape. Runtime is O(p) in combined prefix and project-name length. No external state is mutated.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {RegExp} Matcher for generated prompt-command worktree and branch names.
 * @satisfies REQ-309, REQ-310, REQ-311
 */
function buildReqResetWorktreeNamePattern(gitRoot: string, config: UseReqConfig): RegExp {
  const worktreePrefix = normalizeGitWorktreePrefix(config.GIT_WORKTREE_PREFIX);
  const projectName = path.basename(gitRoot);
  return new RegExp(
    `^${escapeReqResetRegExpLiteral(worktreePrefix)}${escapeReqResetRegExpLiteral(projectName)}-.+-\\d{14}$`,
    "u",
  );
}

/**
 * @brief Lists every registered git worktree root for one repository.
 * @details Executes `git worktree list --porcelain`, extracts each `worktree <path>` record, resolves every listed path to an absolute form, and returns the ordered list used by generated-worktree cleanup. Runtime is dominated by one git subprocess plus O(n) parsing in listed worktree count. Side effects include subprocess creation.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @return {string[]} Absolute registered worktree-root paths.
 * @throws {ReqError} Throws when git worktree enumeration fails.
 */
function listReqResetRegisteredWorktreeRoots(gitRoot: string): string[] {
  const listResult = runCapture(["git", "worktree", "list", "--porcelain"], gitRoot);
  if (listResult.error || listResult.status !== 0) {
    throw new ReqError("ERROR: Unable to enumerate git worktrees for req-reset.", 1);
  }
  return listResult.stdout
    .split(/\r?\n/u)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)));
}

/**
 * @brief Lists sibling directories whose names match the generated-worktree contract.
 * @details Reads the repository parent directory, keeps only direct child directories whose basenames match the supplied generated-name pattern, and resolves each candidate to an absolute path so `req-reset` can remove unregistered leftover directories as well as registered git worktrees. Runtime is dominated by directory enumeration plus O(n) matcher cost. Side effects are limited to filesystem reads.
 * @param[in] parentPath {string} Absolute directory containing sibling worktree roots.
 * @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
 * @return {string[]} Absolute sibling directory paths whose basenames match the generated-name contract.
 * @throws {ReqError} Throws when directory enumeration fails.
 */
function listReqResetSiblingWorktreeRoots(
  parentPath: string,
  worktreeNamePattern: RegExp,
): string[] {
  const normalizedParentPath = path.resolve(parentPath);
  let siblingEntries: fs.Dirent[];
  try {
    siblingEntries = fs.readdirSync(normalizedParentPath, { withFileTypes: true });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ReqError(
      `ERROR: Unable to inspect sibling worktrees in ${normalizedParentPath}: ${errorMessage}.`,
      1,
    );
  }
  return siblingEntries
    .filter((entry) => entry.isDirectory() && worktreeNamePattern.test(entry.name))
    .map((entry) => path.join(normalizedParentPath, entry.name));
}

/**
 * @brief Lists every generated sibling worktree candidate targeted by `req-reset`.
 * @details Unions registered git-worktree roots with matching sibling directories so cleanup covers both registered worktrees and unregistered leftover directories, then sorts the canonical absolute paths for deterministic deletion order. Runtime is dominated by git worktree enumeration plus sibling-directory scanning. Side effects are limited to subprocess creation and filesystem reads.
 * @param[in] parentPath {string} Absolute directory containing sibling worktree roots.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
 * @return {string[]} Sorted absolute worktree-root paths targeted for deletion.
 * @throws {ReqError} Throws when git worktree or sibling-directory enumeration fails.
 */
function listReqResetMatchingWorktreeRoots(
  parentPath: string,
  gitRoot: string,
  worktreeNamePattern: RegExp,
): string[] {
  const matchingRoots = new Set<string>();
  for (const worktreeRootPath of listReqResetRegisteredWorktreeRoots(gitRoot)) {
    if (worktreeNamePattern.test(path.basename(worktreeRootPath))) {
      matchingRoots.add(path.resolve(worktreeRootPath));
    }
  }
  for (const siblingRootPath of listReqResetSiblingWorktreeRoots(parentPath, worktreeNamePattern)) {
    matchingRoots.add(path.resolve(siblingRootPath));
  }
  return [...matchingRoots].sort((left, right) => left.localeCompare(right));
}

/**
 * @brief Lists every matching generated branch targeted by `req-reset`.
 * @details Executes `git branch --list --format=%(refname:short)`, filters the local branch inventory through the generated-name matcher, and returns a sorted list so later forced branch deletion remains deterministic. Runtime is dominated by one git subprocess plus O(n) parsing in listed branch count. Side effects include subprocess creation.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
 * @return {string[]} Sorted local branch names targeted for deletion.
 * @throws {ReqError} Throws when local branch enumeration fails.
 */
function listReqResetMatchingBranchNames(
  gitRoot: string,
  worktreeNamePattern: RegExp,
): string[] {
  const branchResult = runCapture(["git", "branch", "--list", "--format=%(refname:short)"], gitRoot);
  if (branchResult.error || branchResult.status !== 0) {
    throw new ReqError("ERROR: Unable to enumerate git branches for req-reset.", 1);
  }
  return branchResult.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && worktreeNamePattern.test(line))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @brief Resolves the main repository worktree root for one git path.
 * @details Runs `git rev-parse --path-format=absolute --git-common-dir` from the supplied path, treats a common-directory result whose basename is `.git` as proof that its parent is the main repository worktree root, and falls back to the supplied root when git probing fails or the repository layout is non-standard. This keeps all `req-reset` cleanup probes anchored to the main repository even when the live pi session cwd is inside a linked worktree. Runtime is dominated by one git subprocess plus O(1) path math. Side effects include subprocess creation.
 * @param[in] gitRoot {string} Absolute git worktree root used as probing cwd.
 * @return {string} Absolute main repository worktree root.
 */
function resolveReqResetMainWorktreeRoot(gitRoot: string): string {
  const normalizedGitRoot = path.resolve(gitRoot);
  const commonDirResult = runCapture(
    ["git", "rev-parse", "--path-format=absolute", "--git-common-dir"],
    normalizedGitRoot,
  );
  if (commonDirResult.error || commonDirResult.status !== 0) {
    return normalizedGitRoot;
  }
  const commonDirPath = path.resolve(commonDirResult.stdout.trim());
  return path.basename(commonDirPath) === ".git"
    ? path.dirname(commonDirPath)
    : normalizedGitRoot;
}

/**
 * @brief Resolves the repository main branch name used by `req-reset` cleanup.
 * @details Prefers the local branch referenced by `refs/remotes/origin/HEAD` with the leading remote `origin/` prefix stripped, then conventional local `main`, then local `master`, and returns `undefined` when no candidate exists locally so callers skip branch switching without losing cleanup facts. Runtime is dominated by up to three git subprocesses. Side effects include subprocess creation.
 * @param[in] gitRoot {string} Absolute main repository worktree root.
 * @return {string | undefined} Local main branch name or `undefined` when unresolvable.
 */
function resolveReqResetMainBranchName(gitRoot: string): string | undefined {
  const symbolicHeadResult = runCapture(
    ["git", "symbolic-ref", "--short", "refs/remotes/origin/HEAD"],
    gitRoot,
  );
  const originCandidate = symbolicHeadResult.error || symbolicHeadResult.status !== 0
    ? undefined
    : symbolicHeadResult.stdout.trim();
  for (const candidate of [
    originCandidate?.startsWith("origin/") === true
      ? originCandidate.slice("origin/".length)
      : originCandidate,
    "main",
    "master",
  ]) {
    if (candidate === undefined || candidate === "" || candidate === "." || candidate === "..") {
      continue;
    }
    const verifyResult = runCapture(
      ["git", "show-ref", "--verify", "--quiet", `refs/heads/${candidate}`],
      gitRoot,
    );
    if (!verifyResult.error && verifyResult.status === 0) {
      return candidate;
    }
  }
  return undefined;
}

/**
 * @brief Ensures the main repository HEAD stays on the main branch before cleanup.
 * @details Reads the current local branch of the main repository; when HEAD is checked out on a generated prompt-command branch that matches the cleanup matcher, resolves the repository main branch and switches to it so later forced branch deletion cannot fail with git's checked-out-worktree guard. Normal branches, detached HEAD, unresolvable main branches, and probing failures skip the switch defensively. Runtime is dominated by up to two git subprocesses. Side effects include main-worktree branch switching.
 * @param[in] gitRoot {string} Absolute main repository worktree root.
 * @param[in] worktreeNamePattern {RegExp} Generated-worktree name matcher.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the main worktree cannot switch off one generated branch.
 * @satisfies REQ-309, REQ-310
 */
function ensureReqResetMainBranch(gitRoot: string, worktreeNamePattern: RegExp): void {
  const currentBranchResult = runCapture(["git", "branch", "--show-current"], gitRoot);
  if (currentBranchResult.error || currentBranchResult.status !== 0) {
    return;
  }
  const currentBranch = currentBranchResult.stdout.trim();
  if (currentBranch === "" || !worktreeNamePattern.test(currentBranch)) {
    return;
  }
  const mainBranchName = resolveReqResetMainBranchName(gitRoot);
  if (mainBranchName === undefined || mainBranchName === currentBranch) {
    return;
  }
  const switchResult = runCapture(["git", "switch", mainBranchName], gitRoot);
  if (switchResult.error || switchResult.status !== 0) {
    const diagnostic = switchResult.stderr.trim()
      || switchResult.stdout.trim()
      || switchResult.error?.message
      || `Unable to switch ${mainBranchName}.`;
    throw new ReqError(`ERROR: git switch failed for ${mainBranchName}: ${diagnostic}`, 1);
  }
}

/**
 * @brief Reads the persisted header record from one session file.
 * @details Parses the first non-empty JSONL line and returns its `cwd` plus `parentSession` fields when the file is readable and the header is a JSON object. Runtime is O(n) in header size. No external state is mutated.
 * @param[in] sessionFile {string} Absolute session-file path.
 * @return {{ cwd?: string; parentSession?: string } | undefined} Parsed header fields or `undefined` when unreadable.
 */
function readReqResetSessionHeader(sessionFile: string): { cwd?: string; parentSession?: string } | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(sessionFile, "utf8");
  } catch {
    return undefined;
  }
  const newlineIndex = raw.indexOf("\n");
  const firstLine = newlineIndex >= 0 ? raw.slice(0, newlineIndex) : raw;
  const trimmed = firstLine.trim();
  if (trimmed === "") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const header = parsed as { cwd?: unknown; parentSession?: unknown };
  const parsedCwd = typeof header.cwd === "string" ? header.cwd : undefined;
  const parentSession = typeof header.parentSession === "string" ? header.parentSession : undefined;
  return { cwd: parsedCwd, parentSession };
}

/**
 * @brief Resolves the original base-path session file from the active session header.
 * @details Reads the current session file exposed by the supplied command context, accepts only a persisted `parentSession` link whose own header `cwd` remains inside the main base path, and returns it so `req-reset` can switch the pi CLI back to the original session-backed base path. Runtime is O(n) in session-header size plus bounded filesystem probes. No external state is mutated.
 * @param[in] activeContext {ReqResetCommandContext | undefined} Session-bound command context whose current session file links the base-path session.
 * @param[in] basePath {string} Absolute main repository base path that must contain the parent session cwd.
 * @return {string | undefined} Original base-path session file or `undefined` when unavailable.
 */
function resolveReqResetParentSessionFile(
  activeContext: ReqResetCommandContext | undefined,
  basePath: string,
): string | undefined {
  let currentSessionFile: string | undefined;
  try {
    currentSessionFile = typeof activeContext?.sessionManager?.getSessionFile === "function"
      ? activeContext.sessionManager.getSessionFile()
      : undefined;
  } catch {
    return undefined;
  }
  if (typeof currentSessionFile !== "string" || currentSessionFile === "") {
    return undefined;
  }
  const header = readReqResetSessionHeader(path.resolve(currentSessionFile));
  if (header?.parentSession === undefined || !fs.existsSync(header.parentSession)) {
    return undefined;
  }
  const resolvedParentSession = path.resolve(header.parentSession);
  const parentHeader = readReqResetSessionHeader(resolvedParentSession);
  if (parentHeader?.cwd === undefined || !fs.existsSync(parentHeader.cwd)) {
    return undefined;
  }
  return isSameOrAncestorPath(path.resolve(basePath), path.resolve(parentHeader.cwd))
    ? resolvedParentSession
    : undefined;
}

/**
 * @brief Resolves the most recent persisted session file rooted at the main base path.
 * @details Uses the pi SDK default session discovery for the supplied cwd and returns the persisted session file only when it already exists on disk, so the pi CLI can resume the recent base-path session instead of being created a fresh one. Runtime is O(s) in session-directory listing cost. No external state is mutated.
 * @param[in] basePath {string} Absolute main repository base path.
 * @return {string | undefined} Most recent persisted base-path session file or `undefined` when none exists.
 */
function resolveReqResetMainSessionFile(basePath: string): string | undefined {
  try {
    const sessionManager = SessionManager.continueRecent(path.resolve(basePath));
    const sessionFile = sessionManager.getSessionFile();
    return typeof sessionFile === "string" && fs.existsSync(sessionFile)
      ? path.resolve(sessionFile)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @brief Tests whether one execution path must be re-anchored to the main base path before cleanup.
 * @details Returns `true` when the path does not exist anymore, or when it is anchored inside any generated worktree root targeted by `req-reset` and the base path is not an ancestor of it. Existing paths already inside the main base path never need a redirect. Runtime is O(r) in matched-worktree count plus bounded filesystem probes. No external state is mutated.
 * @param[in] executionPath {string | undefined} Live process or context execution path.
 * @param[in] basePath {string} Absolute main repository base path.
 * @param[in] matchingWorktreeRoots {string[]} Absolute generated worktree roots targeted for deletion.
 * @return {boolean} `true` when the execution path must be switched to the main base path first.
 */
function reqResetExecutionPathNeedsRedirect(
  executionPath: string | undefined,
  basePath: string,
  matchingWorktreeRoots: string[],
): boolean {
  if (typeof executionPath !== "string" || executionPath === "") {
    return false;
  }
  const normalizedExecutionPath = path.resolve(executionPath);
  const normalizedBasePath = path.resolve(basePath);
  if (isSameOrAncestorPath(normalizedBasePath, normalizedExecutionPath)) {
    return false;
  }
  if (!fs.existsSync(normalizedExecutionPath)) {
    return true;
  }
  return matchingWorktreeRoots.some((worktreeRootPath) => {
    const normalizedRoot = path.resolve(worktreeRootPath);
    return normalizedExecutionPath === normalizedRoot
      || normalizedExecutionPath.startsWith(`${normalizedRoot}${path.sep}`);
  });
}

/**
 * @brief Returns the pi CLI to the main base path before generated worktrees are removed.
 * @details When the host process cwd or the supplied context cwd is still anchored inside a generated worktree targeted for deletion or points at a deleted path, best-effort switches the active pi session back to the original or recent base-path session, re-anchors `process.cwd()` and the context `cwd` mirror onto the main base path, and clears the runtime worktree path state so no post-cleanup surface keeps probing the removed worktree directory. Session switching failures are swallowed because the process and context surfaces remain authoritative for cleanup; session switching is skipped entirely when no `switchSession(...)` hook is available or no base-path session exists. Runtime is dominated by one optional session switch plus bounded filesystem probes. Side effects include active-session replacement, host-process cwd mutation, and optional context mirror mutation.
 * @param[in] basePath {string} Absolute main repository base path.
 * @param[in,out] activeContext {ReqResetCommandContext | undefined} Mutated session context mirror and potential replacement-session context.
 * @param[in] matchingWorktreeRoots {string[]} Absolute generated worktree roots targeted for deletion.
 * @return {Promise<ReqResetCommandContext | undefined>} Replacement-session context when the runtime provides one; otherwise the caller-supplied context.
 * @satisfies REQ-257, REQ-307
 */
async function redirectReqResetExecutionToMainBranch(
  basePath: string,
  activeContext: ReqResetCommandContext | undefined,
  matchingWorktreeRoots: string[],
): Promise<ReqResetCommandContext | undefined> {
  const normalizedBasePath = path.resolve(basePath);
  let processCwd: string | undefined;
  try {
    processCwd = path.resolve(process.cwd());
  } catch {
    processCwd = undefined;
  }
  const contextCwd = typeof activeContext?.cwd === "string" ? activeContext.cwd : undefined;
  const processNeedsRedirect = reqResetExecutionPathNeedsRedirect(
    processCwd,
    normalizedBasePath,
    matchingWorktreeRoots,
  );
  const contextNeedsRedirect = reqResetExecutionPathNeedsRedirect(
    contextCwd,
    normalizedBasePath,
    matchingWorktreeRoots,
  );
  if (!processNeedsRedirect && !contextNeedsRedirect) {
    return activeContext;
  }
  if (typeof activeContext?.switchSession === "function") {
    const mainSessionFile = resolveReqResetParentSessionFile(activeContext, normalizedBasePath)
      ?? resolveReqResetMainSessionFile(normalizedBasePath);
    if (mainSessionFile !== undefined) {
      try {
        activeContext = await switchPromptCommandSession(mainSessionFile, activeContext);
      } catch {
        // Best-effort; host process and context surfaces below remain authoritative.
      }
    }
  }
  try {
    process.chdir(normalizedBasePath);
  } catch {
    // Best-effort; cleanup facts remain authoritative.
  }
  if (activeContext !== undefined) {
    try {
      if (path.resolve(activeContext.cwd ?? "") !== normalizedBasePath) {
        Reflect.set(activeContext, "cwd", normalizedBasePath);
      }
    } catch {
      // Best-effort context mirror mutation.
    }
  }
  setRuntimeContextPath(normalizedBasePath);
  setRuntimeWorktreePathState({});
  return activeContext;
}

/**
 * @brief Restores live process and context cwd surfaces after worktree removal.
 * @details Best-effort re-points `process.cwd()` and the supplied context `cwd` mirror to the main repository base path when the previously live cwd was removed by `req-reset` cleanup, so subsequent status rendering and notifications never probe deleted worktree paths. Runtime is O(1) plus bounded filesystem probes. Side effects include process cwd mutation and optional context mirror mutation.
 * @param[in] basePath {string} Absolute main repository base path.
 * @param[in,out] activeContext {ReqResetCommandContext | undefined} Mutated session context mirror.
 * @return {void} No return value.
 */
function restoreReqResetExecutionCwd(basePath: string, activeContext: ReqResetCommandContext | undefined): void {
  const normalizedBasePath = path.resolve(basePath);
  let processCwd = "";
  try {
    processCwd = path.resolve(process.cwd());
  } catch (error) {
    // Deleted process cwd after worktree removal.
  }
  if (processCwd === "" || !fs.existsSync(processCwd)) {
    try {
      process.chdir(normalizedBasePath);
    } catch (error) {
      // Best-effort; cleanup facts remain authoritative.
    }
  }
  if (activeContext === undefined) {
    return;
  }
  try {
    const contextCwd = typeof activeContext.cwd === "string" ? path.resolve(activeContext.cwd) : "";
    if (contextCwd !== normalizedBasePath && (contextCwd === "" || !fs.existsSync(contextCwd))) {
      Reflect.set(activeContext, "cwd", normalizedBasePath);
    }
  } catch (error) {
    // Best-effort context mirror mutation.
  }
}

/**
 * @brief Prepares the specialized `req-reset` execution plan.
 * @details Resolves the active project base into a runtime git root, normalizes that root to the main repository worktree so cleanup and branch checks never run from inside a linked worktree, derives the sibling-worktree parent directory and generated-name matcher from the same prefix plus repository-basename contract used by prompt-command worktree generation, and keeps only worktree-backed persisted prompt execution plans for transcript-preserving base-path restoration. Runtime is O(p) in path length plus one git subprocess. No external state is mutated.
 * @param[in] projectBase {string} Absolute project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] promptRequest {PromptCommandExecutionPlan | undefined} Pending or active prompt execution plan when available.
 * @return {ReqResetCommandPlan} Prepared recovery and cleanup plan.
 * @throws {ReqError} Throws when the repository root cannot be resolved.
 * @satisfies REQ-306, REQ-309, REQ-310, REQ-311
 */
export function prepareReqResetCommandExecution(
  projectBase: string,
  config: UseReqConfig,
  promptRequest?: PromptCommandExecutionPlan,
): ReqResetCommandPlan {
  const basePath = path.resolve(projectBase);
  const gitPath = resolveRuntimeGitPath(basePath);
  if (!gitPath) {
    throw new ReqError("ERROR: Unable to resolve git repository for req-reset.", 1);
  }
  const normalizedGitPath = path.resolve(gitPath);
  const mainGitPath = resolveReqResetMainWorktreeRoot(normalizedGitPath);
  const mainBasePath = path.join(mainGitPath, path.relative(normalizedGitPath, basePath));
  const resetPromptRequest = promptRequest?.worktreeDir
    && promptRequest.worktreeRootPath
    && promptRequest.worktreePath
    ? promptRequest
    : undefined;
  return {
    basePath: mainBasePath,
    gitPath: mainGitPath,
    parentPath: path.resolve(mainGitPath, ".."),
    worktreeNamePattern: buildReqResetWorktreeNamePattern(mainGitPath, config),
    promptRequest: resetPromptRequest,
  };
}

/**
 * @brief Executes the specialized `req-reset` recovery and cleanup workflow.
 * @details Preserves the execution-session transcript into the original session file when a worktree-backed prompt execution plan is still available, restores the original session-backed `base-path` through the shared prompt-command restoration helper, ensures the main repository HEAD is on the main branch so generated branch deletion cannot hit git's checked-out-worktree guard, enumerates every matching sibling worktree, returns the pi CLI execution surfaces to the main base path before any matching worktree directory is removed, force-removes every matching sibling worktree directory, force-removes every remaining matching local branch, restores deleted live cwd surfaces, and aggregates any failure diagnostics without rolling back successful cleanup steps. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, branch switching, worktree deletion, branch deletion, and filesystem reads.
 * @param[in] plan {ReqResetCommandPlan} Prepared recovery and cleanup plan.
 * @param[in] ctx {ReqResetCommandContext | undefined} Optional session-bound command context.
 * @return {Promise<ReqResetCommandExecutionResult>} Recovery and cleanup outcome facts.
 * @satisfies REQ-305, REQ-307, REQ-308, REQ-309, REQ-310, REQ-313
 */
export async function executeReqResetCommandExecution(
  plan: ReqResetCommandPlan,
  ctx?: ReqResetCommandContext,
): Promise<ReqResetCommandExecutionResult> {
  let activeContext = ctx;
  let transcriptPreserved = plan.promptRequest === undefined;
  let restoredBasePath = plan.promptRequest === undefined;
  const removedWorktreeDirs: string[] = [];
  const removedBranchNames: string[] = [];
  const errorMessages: string[] = [];

  if (plan.promptRequest !== undefined) {
    try {
      preservePromptCommandExecutionTranscript(plan.promptRequest);
      transcriptPreserved = true;
    } catch (error) {
      transcriptPreserved = false;
      errorMessages.push(error instanceof Error ? error.message : String(error));
    }
    try {
      activeContext = await restorePromptCommandExecution(plan.promptRequest, activeContext);
      restoredBasePath = true;
    } catch (error) {
      return {
        activeContext: (getPromptCommandErrorContext(error) ?? activeContext) as ReqResetCommandContext | undefined,
        transcriptPreserved,
        restoredBasePath: false,
        removedWorktreeDirs,
        removedBranchNames,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  try {
    ensureReqResetMainBranch(plan.gitPath, plan.worktreeNamePattern);
  } catch (error) {
    errorMessages.push(error instanceof Error ? error.message : String(error));
  }

  let matchingWorktreeRoots: string[] = [];
  try {
    matchingWorktreeRoots = listReqResetMatchingWorktreeRoots(
      plan.parentPath,
      plan.gitPath,
      plan.worktreeNamePattern,
    );
  } catch (error) {
    errorMessages.push(error instanceof Error ? error.message : String(error));
  }

  activeContext = await redirectReqResetExecutionToMainBranch(
    plan.basePath,
    activeContext,
    matchingWorktreeRoots,
  );

  for (const worktreeRootPath of matchingWorktreeRoots) {
    const worktreeDir = path.basename(worktreeRootPath);
    try {
      deletePromptWorktree(plan.basePath, worktreeDir, worktreeRootPath);
      removedWorktreeDirs.push(worktreeDir);
    } catch (error) {
      errorMessages.push(error instanceof Error ? error.message : String(error));
    }
  }

  try {
    const matchingBranchNames = listReqResetMatchingBranchNames(plan.gitPath, plan.worktreeNamePattern);
    for (const branchName of matchingBranchNames) {
      const deleteResult = runCapture(["git", "branch", "-D", branchName], plan.gitPath);
      if (deleteResult.error || deleteResult.status !== 0) {
        const diagnostic = deleteResult.stderr.trim()
          || deleteResult.stdout.trim()
          || deleteResult.error?.message
          || `Unable to remove branch ${branchName}.`;
        errorMessages.push(`ERROR: git branch -D failed for ${branchName}: ${diagnostic}`);
        continue;
      }
      removedBranchNames.push(branchName);
    }
  } catch (error) {
    errorMessages.push(error instanceof Error ? error.message : String(error));
  }

  restoreReqResetExecutionCwd(plan.basePath, activeContext);

  return {
    activeContext,
    transcriptPreserved,
    restoredBasePath,
    removedWorktreeDirs,
    removedBranchNames,
    errorMessage: errorMessages.length > 0
      ? errorMessages.join(" ")
      : undefined,
  };
}
