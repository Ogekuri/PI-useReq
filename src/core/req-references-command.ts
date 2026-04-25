/**
 * @file
 * @brief Implements the specialized `req-references` slash-command workflow.
 * @details Performs slash-command-owned git validation reuse, reference-file generation, targeted staging, fixed-message commit creation, and post-commit cleanliness verification without creating a worktree or starting an LLM session. Runtime is dominated by git subprocess execution plus source-summary generation and one documentation write. Side effects include filesystem writes and git index/history mutation.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import type { UseReqConfig } from "./config.js";
import { ReqError } from "./errors.js";
import { validatePromptGitState } from "./prompt-command-runtime.js";
import { runReferences } from "./tool-runner.js";

/**
 * @brief Declares the fixed slash-command description for `req-references`.
 * @details Preserves the legacy human-facing command label while the runtime implementation no longer depends on a bundled prompt Markdown file. Access complexity is O(1).
 */
export const REQ_REFERENCES_COMMAND_DESCRIPTION = "Write a REFERENCES.md using the project's source code";

/**
 * @brief Declares the fixed git commit message used by `req-references`.
 * @details Keeps the commit payload deterministic so downstream tooling and tests can assert the exact commit contract without parsing prompt templates. Access complexity is O(1).
 */
export const REQ_REFERENCES_COMMIT_MESSAGE = "docs(references): Update REFERENCES.md document. [useReq]";

/**
 * @brief Describes the prepared execution facts for one `req-references` run.
 * @details Stores the validated project base, resolved git root, target references path, and fixed commit message needed by the specialized direct-write workflow. The interface is compile-time only and introduces no runtime cost.
 */
export interface ReqReferencesCommandPlan {
  basePath: string;
  gitPath: string;
  referencesPath: string;
  commitMessage: string;
}

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
 * @brief Builds the set of git-status paths ignored for cleanliness checks.
 * @details Reuses the configured debug-log path exception already honored by prompt-command git validation so extension-owned debug artifacts do not block `req-references` execution or post-commit cleanliness verification. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Absolute project base path.
 * @param[in] gitRoot {string} Absolute git root path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {Set<string>} Slash-normalized relative paths ignored during git-status evaluation.
 */
function buildIgnoredGitStatusPaths(
  projectBase: string,
  gitRoot: string,
  config: UseReqConfig,
): Set<string> {
  const ignoredStatusPaths = new Set<string>();
  const configuredLogPath = path.isAbsolute(config.DEBUG_LOG_FILE)
    ? path.normalize(config.DEBUG_LOG_FILE)
    : path.resolve(projectBase, config.DEBUG_LOG_FILE);
  const relativeLogPath = path.relative(gitRoot, configuredLogPath);
  if (relativeLogPath !== "" && !relativeLogPath.startsWith("..") && !path.isAbsolute(relativeLogPath)) {
    ignoredStatusPaths.add(relativeLogPath.split(path.sep).join("/"));
  }
  return ignoredStatusPaths;
}

/**
 * @brief Lists residual git-status rows after ignored extension-owned paths are filtered out.
 * @details Executes `git status --porcelain`, drops the configured debug-log path when present inside the active repository, and returns all remaining staged or unstaged rows used for post-commit cleanliness verification. Runtime is dominated by one git subprocess plus O(n) parsing in status-line count. Side effects include subprocess creation.
 * @param[in] projectBase {string} Absolute project base path.
 * @param[in] gitRoot {string} Absolute git root path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string[]} Residual status rows after ignored paths are removed.
 * @throws {ReqError} Throws when git status cannot be inspected.
 */
function listResidualGitStatusLines(
  projectBase: string,
  gitRoot: string,
  config: UseReqConfig,
): string[] {
  const statusResult = runCapture(["git", "status", "--porcelain"], gitRoot);
  if (statusResult.error || statusResult.status !== 0) {
    throw new ReqError("ERROR: Unable to inspect git repository cleanliness after req-references commit.", 1);
  }
  const ignoredStatusPaths = buildIgnoredGitStatusPaths(projectBase, gitRoot, config);
  return statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .filter((line) => {
      const statusPath = line.slice(3).split(" -> ").at(-1)?.split(path.sep).join("/") ?? "";
      return !ignoredStatusPaths.has(statusPath);
    });
}

/**
 * @brief Converts one absolute repository path into the preferred git-add target syntax.
 * @details Emits a slash-normalized relative path when the target is inside the git root and falls back to the absolute path otherwise, preserving deterministic add semantics across nested project-base layouts. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] gitRoot {string} Absolute git root path.
 * @param[in] absolutePath {string} Absolute path to stage.
 * @return {string} Relative or absolute git-add target path.
 */
function getGitAddTargetPath(gitRoot: string, absolutePath: string): string {
  const relativePath = path.relative(gitRoot, absolutePath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return absolutePath;
  }
  return relativePath.split(path.sep).join("/");
}

/**
 * @brief Prepares the specialized `req-references` execution plan.
 * @details Reuses slash-command-owned git validation, resolves the configured references document path, and returns the fixed commit metadata consumed by the direct-write workflow. Runtime is dominated by git validation subprocesses. Side effects include subprocess creation delegated through `validatePromptGitState(...)`.
 * @param[in] projectBase {string} Absolute project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {ReqReferencesCommandPlan} Prepared execution plan for direct references regeneration.
 * @throws {ReqError} Throws when git validation fails.
 * @satisfies REQ-200, REQ-299
 */
export function prepareReqReferencesCommandExecution(
  projectBase: string,
  config: UseReqConfig,
): ReqReferencesCommandPlan {
  const basePath = path.resolve(projectBase);
  const gitPath = validatePromptGitState(basePath, config);
  const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
  return {
    basePath,
    gitPath,
    referencesPath: path.join(basePath, docsDir, "REFERENCES.md"),
    commitMessage: REQ_REFERENCES_COMMIT_MESSAGE,
  };
}

/**
 * @brief Executes the specialized `req-references` direct-write workflow.
 * @details Regenerates `REFERENCES.md` through the same source-summary path used by the `references` tool, stages only the target file, creates the fixed-message commit, and verifies that no residual git-status rows remain after ignored extension-owned debug artifacts are filtered out. Runtime is dominated by summary generation plus three git subprocesses. Side effects include documentation writes, index mutation, commit creation, and subprocess creation.
 * @param[in] plan {ReqReferencesCommandPlan} Prepared direct-write execution plan.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {void} No return value.
 * @throws {ReqError} Throws when reference generation, staging, commit creation, or cleanliness verification fails.
 * @satisfies REQ-300, REQ-301, REQ-302, REQ-303
 */
export function executeReqReferencesCommandExecution(
  plan: ReqReferencesCommandPlan,
  config: UseReqConfig,
): void {
  runReferences(plan.basePath, config);
  const addTargetPath = getGitAddTargetPath(plan.gitPath, plan.referencesPath);
  const addResult = runCapture(["git", "add", "--", addTargetPath], plan.gitPath);
  if (addResult.error || addResult.status !== 0) {
    const diagnostic = addResult.stderr.trim() || addResult.error?.message || "unknown error";
    throw new ReqError(`ERROR: git add failed for ${addTargetPath}: ${diagnostic}`, 1);
  }
  const commitResult = runCapture(["git", "commit", "-m", plan.commitMessage], plan.gitPath);
  if (commitResult.error || commitResult.status !== 0) {
    const diagnostic = commitResult.stderr.trim()
      || commitResult.stdout.trim()
      || commitResult.error?.message
      || "unknown error";
    throw new ReqError(`ERROR: git commit failed: ${diagnostic}`, 1);
  }
  const residualStatusLines = listResidualGitStatusLines(plan.basePath, plan.gitPath, config);
  if (residualStatusLines.length > 0) {
    throw new ReqError("ERROR: Git repository is not clean after req-references commit.", 1);
  }
}
