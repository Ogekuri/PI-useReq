/**
 * @file
 * @brief Derives runtime-only repository facts.
 * @details Centralizes git-repository probing, repository-root resolution, and active-branch lookup for extension status, tool execution, and CLI flows. Runtime is dominated by git subprocess execution plus path normalization. Side effects are limited to subprocess spawning.
 */

import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { isSameOrAncestorPath } from "./path-context.js";

/**
 * @brief Executes one git subprocess and captures UTF-8 output.
 * @details Delegates to `spawnSync`, keeps execution synchronous for deterministic command flows, and supports an optional working directory. Runtime is dominated by the spawned git process. Side effects include subprocess creation.
 * @param[in] command {string[]} Git executable plus argument vector.
 * @param[in] cwd {string | undefined} Optional working directory.
 * @return {ReturnType<typeof spawnSync>} Captured subprocess result.
 */
function runGitCapture(command: string[], cwd?: string): ReturnType<typeof spawnSync> {
  return spawnSync(command[0]!, command.slice(1), {
    cwd,
    encoding: "utf8",
  });
}

/**
 * @brief Tests whether one path is inside a git work tree.
 * @details Executes `git rev-parse --is-inside-work-tree` in the supplied directory and returns `true` only for a successful literal `true` response. Runtime is dominated by git execution. Side effects include subprocess creation.
 * @param[in] targetPath {string} Directory to probe.
 * @return {boolean} `true` when the directory belongs to a git work tree.
 * @satisfies REQ-145
 */
export function isInsideGitRepo(targetPath: string): boolean {
  const result = runGitCapture(["git", "rev-parse", "--is-inside-work-tree"], targetPath);
  return result.status === 0 && result.stdout.trim() === "true";
}

/**
 * @brief Resolves the repository root for one path inside a git work tree.
 * @details Executes `git rev-parse --show-toplevel`, normalizes the result to an absolute path, and rejects non-repository paths with `ReqError`. Runtime is dominated by git execution. Side effects include subprocess creation.
 * @param[in] targetPath {string} Directory inside the target repository.
 * @return {string} Absolute repository-root path.
 * @throws {ReqError} Throws when the path is not inside a git repository.
 * @satisfies REQ-145
 */
export function resolveGitRoot(targetPath: string): string {
  const result = runGitCapture(["git", "rev-parse", "--show-toplevel"], targetPath);
  if (result.error || result.status !== 0) {
    throw new ReqError(`Error: '${targetPath}' is not inside a git repository.`, 3);
  }
  return path.resolve(result.stdout.trim());
}

/**
 * @brief Resolves the runtime git root for one execution path.
 * @details Returns `undefined` when the path is outside a git repository. Otherwise resolves the repository root and rejects roots that are not identical to or ancestors of the execution path. Runtime is dominated by git execution. Side effects include subprocess creation.
 * @param[in] executionPath {string} Runtime execution path.
 * @return {string | undefined} Absolute repository-root path or `undefined` when unavailable.
 * @satisfies REQ-105, REQ-145
 */
export function resolveRuntimeGitPath(executionPath: string): string | undefined {
  const normalizedExecutionPath = path.resolve(executionPath);
  if (!isInsideGitRepo(normalizedExecutionPath)) {
    return undefined;
  }
  const gitRoot = resolveGitRoot(normalizedExecutionPath);
  return isSameOrAncestorPath(gitRoot, normalizedExecutionPath) ? gitRoot : undefined;
}

/**
 * @brief Resolves the active branch name for one runtime execution path.
 * @details Resolves the enclosing git work tree from the supplied execution path, reads `git branch --show-current`, and falls back to `unknown` when the path is outside git or HEAD has no branch name. Runtime is dominated by git execution. Side effects include subprocess creation.
 * @param[in] executionPath {string} Runtime execution path.
 * @return {string} Active branch name or `unknown` when unavailable.
 * @satisfies REQ-121, REQ-283
 */
export function resolveRuntimeGitBranchName(executionPath: string): string {
  const gitRoot = resolveRuntimeGitPath(executionPath);
  if (!gitRoot) {
    return "unknown";
  }
  const result = runGitCapture(["git", "branch", "--show-current"], gitRoot);
  if (result.error || result.status !== 0) {
    return "unknown";
  }
  const branchName = result.stdout.trim();
  return branchName === "" ? "unknown" : branchName;
}


