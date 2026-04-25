/**
 * @file
 * @brief Implements the specialized `req-reset` slash-command workflow.
 * @details Performs non-agentic prompt-orchestration recovery by preserving the current execution-session transcript when available, restoring the original session-backed `base-path`, force-removing every generated sibling worktree and matching branch, and returning deterministic cleanup facts to the extension command handler. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, worktree deletion, branch deletion, and filesystem removal.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
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
  type PromptCommandExecutionPlan,
} from "./prompt-command-runtime.js";
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
 * @return {ReturnType<typeof spawnSync>} Captured subprocess result.
 */
function runCapture(command: string[], cwd: string): ReturnType<typeof spawnSync> {
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
 * @brief Prepares the specialized `req-reset` execution plan.
 * @details Resolves the active project base into a runtime git root, derives the sibling-worktree parent directory and generated-name matcher from the same prefix plus repository-basename contract used by prompt-command worktree generation, and keeps only worktree-backed persisted prompt execution plans for transcript-preserving base-path restoration. Runtime is O(p) in path length. No external state is mutated.
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
  const resetPromptRequest = promptRequest?.worktreeDir
    && promptRequest.worktreeRootPath
    && promptRequest.worktreePath
    ? promptRequest
    : undefined;
  return {
    basePath,
    gitPath: normalizedGitPath,
    parentPath: path.resolve(normalizedGitPath, ".."),
    worktreeNamePattern: buildReqResetWorktreeNamePattern(normalizedGitPath, config),
    promptRequest: resetPromptRequest,
  };
}

/**
 * @brief Executes the specialized `req-reset` recovery and cleanup workflow.
 * @details Preserves the execution-session transcript into the original session file when a worktree-backed prompt execution plan is still available, restores the original session-backed `base-path` through the shared prompt-command restoration helper, force-removes every matching sibling worktree directory, force-removes every remaining matching local branch, and aggregates any failure diagnostics without rolling back successful cleanup steps. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file reads and writes, active-session replacement, host-process cwd mutation, worktree deletion, branch deletion, and filesystem reads.
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
