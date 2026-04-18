/**
 * @file
 * @brief Implements the executable back-end for all pi-usereq CLI and extension tools.
 * @details Centralizes project discovery, git helpers, source-file collection, documentation generation, compression, construct lookup, static-check dispatch, and worktree lifecycle operations. Runtime depends on the selected command and may include filesystem reads, config writes, process spawning, and git mutations.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { loadConfig, saveConfig, type UseReqConfig } from "./config.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import {
  buildReferenceToolExecutionStderr,
  buildReferenceToolPayload,
} from "./reference-payload.js";
import { compressFiles } from "./compress-files.js";
import { findConstructsInFiles } from "./find-constructs.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";

/**
 * @brief Represents the normalized output contract for a tool invocation.
 * @details Every tool emits stdout, stderr, and a numeric exit code so CLI and extension front-ends can handle results uniformly. The interface is compile-time only and adds no runtime cost.
 */
export interface ToolResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * @brief Lists directory names excluded during source-file collection.
 * @details The set is currently empty but remains configurable as a centralized filter point for future exclusions. Membership checks are O(1).
 */
export const EXCLUDED_DIRS = new Set<string>();
/**
 * @brief Lists source-file extensions accepted by collection and tool workflows.
 * @details Derived from static-check language support so every collected source file can be mapped to a canonical language. Membership checks are O(1).
 */
export const SUPPORTED_EXTENSIONS = new Set(Object.keys(STATIC_CHECK_EXT_TO_LANG));

/**
 * @brief Creates a successful tool result payload.
 * @details Wraps stdout and stderr text with exit code `0`. Runtime is O(1). No side effects occur.
 * @param[in] stdout {string} Standard-output text.
 * @param[in] stderr {string} Standard-error text.
 * @return {ToolResult} Successful result object.
 */
function ok(stdout = "", stderr = ""): ToolResult {
  return { stdout, stderr, code: 0 };
}

/**
 * @brief Throws a `ReqError` populated with tool-result stream content.
 * @details Creates a structured failure object, attaches optional stdout and stderr payloads, and throws immediately. Runtime is O(1). Side effect: throws an exception.
 * @param[in] message {string} Primary failure message.
 * @param[in] code {number} Exit code to attach. Defaults to `1`.
 * @param[in] stdout {string} Optional stdout payload.
 * @param[in] stderr {string} Optional stderr payload. Defaults to `message` when omitted.
 * @return {never} This function never returns.
 * @throws {ReqError} Always throws.
 */
function fail(message: string, code = 1, stdout = "", stderr = ""): never {
  const error = new ReqError(message, code);
  (error as ReqError & { stdout?: string; stderr?: string }).stdout = stdout;
  (error as ReqError & { stdout?: string; stderr?: string }).stderr = stderr || message;
  throw error;
}

/**
 * @brief Executes a subprocess synchronously and captures its output.
 * @details Delegates to `spawnSync`, passes through an optional working directory, and forces UTF-8 decoding. Runtime is dominated by external process execution. Side effects include process spawning.
 * @param[in] command {string[]} Executable plus argument vector.
 * @param[in] options {{ cwd?: string }} Optional process-spawn settings.
 * @return {ReturnType<typeof spawnSync>} Captured subprocess result.
 */
function runCapture(command: string[], options: { cwd?: string } = {}) {
  return spawnSync(command[0]!, command.slice(1), {
    cwd: options.cwd,
    encoding: "utf8",
  });
}

/**
 * @brief Tests whether a path is inside a git work tree.
 * @details Runs `git rev-parse --is-inside-work-tree` in the target directory and returns `true` only for a successful `true` response. Runtime is dominated by git invocation. Side effects include process spawning.
 * @param[in] targetPath {string} Directory to test.
 * @return {boolean} `true` when the path is inside a git repository.
 */
export function isInsideGitRepo(targetPath: string): boolean {
  const result = runCapture(["git", "rev-parse", "--is-inside-work-tree"], { cwd: targetPath });
  return result.status === 0 && result.stdout.trim() === "true";
}

/**
 * @brief Resolves the git repository root for a target path.
 * @details Runs `git rev-parse --show-toplevel` and normalizes the result to an absolute path. Runtime is dominated by git invocation. Side effects include process spawning.
 * @param[in] targetPath {string} Directory inside the repository.
 * @return {string} Absolute git root path.
 * @throws {ReqError} Throws when the path is not inside a git repository.
 */
export function resolveGitRoot(targetPath: string): string {
  const result = runCapture(["git", "rev-parse", "--show-toplevel"], { cwd: targetPath });
  if (result.error || result.status !== 0) {
    fail(`Error: '${targetPath}' is not inside a git repository.`, 3);
  }
  return path.resolve(result.stdout.trim());
}

/**
 * @brief Rewrites a branch name into a filesystem-safe token.
 * @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No side effects occur.
 * @param[in] branch {string} Raw branch name.
 * @return {string} Sanitized token.
 */
export function sanitizeBranchName(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\x00-\x1f\s~^{}\[\]]/g, "-");
}

/**
 * @brief Validates a requested worktree or branch name.
 * @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No side effects occur.
 * @param[in] wtName {string} Candidate worktree name.
 * @return {boolean} `true` when the name is acceptable for worktree creation.
 */
export function validateWtName(wtName: string): boolean {
  if (!wtName || wtName === "." || wtName === "..") return false;
  return !/[<>:"/\\|?*\x00-\x1f\s]/.test(wtName);
}

/**
 * @brief Collects tracked and untracked source files from configured source directories.
 * @details Uses `git ls-files` to enumerate candidate files, filters them by configured source roots, excluded directories, and supported extensions, and returns sorted absolute paths. Runtime is O(n log n) in collected file count plus git execution cost. Side effects include process spawning.
 * @param[in] srcDirs {string[]} Configured source-directory roots.
 * @param[in] projectBase {string} Absolute project root.
 * @return {string[]} Sorted absolute source-file paths.
 * @throws {ReqError} Throws when `git ls-files` fails.
 */
export function collectSourceFiles(srcDirs: string[], projectBase: string): string[] {
  const result = runCapture(
    ["git", "-C", projectBase, "ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: projectBase },
  );
  if (result.error || result.status !== 0) {
    fail("Error: failed to collect source files with `git ls-files` in project root.", 1);
  }
  const normalizedSrcDirs = srcDirs.map((srcDir) => makeRelativeIfContainsProject(srcDir, projectBase).split(path.sep).join("/").replace(/^\.?\/?/, "").replace(/\/+$/, ""));
  const collected = new Set<string>();
  for (const relPathRaw of result.stdout.split(/\r?\n/)) {
    let relPath = relPathRaw.trim().replace(/^\.\//, "");
    if (!relPath) continue;
    if (
      !normalizedSrcDirs.some(
        (srcDir) => srcDir === "" || srcDir === "." || relPath === srcDir || relPath.startsWith(`${srcDir}/`),
      )
    ) {
      continue;
    }
    const relObj = relPath.split("/");
    if (relObj.slice(0, -1).some((part) => EXCLUDED_DIRS.has(part))) continue;
    const ext = path.extname(relPath).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
    collected.add(path.resolve(projectBase, relPath));
  }
  return [...collected].sort();
}

/**
 * @brief Builds an ASCII tree from relative file paths.
 * @details Materializes a nested object tree and renders it using box-drawing characters for markdown display. Runtime is O(n log n) in path count due to sorting. No side effects occur.
 * @param[in] paths {string[]} Relative POSIX-style file paths.
 * @return {string} Rendered ASCII tree.
 */
function buildAsciiTree(paths: string[]): string {
  const tree: Record<string, Record<string, unknown> | null> = {};
  for (const relPath of [...paths].sort()) {
    let node = tree;
    const parts = relPath.split("/");
    parts.forEach((part, index) => {
      const isLeaf = index === parts.length - 1;
      if (isLeaf) {
        node[part] ??= null;
      } else {
        node[part] = (node[part] as Record<string, unknown> | null) ?? {};
        node = node[part] as Record<string, Record<string, unknown> | null>;
      }
    });
  }
  const lines = ["."];
  const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") => {
    const entries = Object.entries(branch).sort(([a], [b]) => a.localeCompare(b));
    entries.forEach(([name, child], index) => {
      const last = index === entries.length - 1;
      lines.push(`${prefix}${last ? "└── " : "├── "}${name}`);
      if (child && Object.keys(child).length > 0) {
        emit(child as Record<string, Record<string, unknown> | null>, `${prefix}${last ? "    " : "│   "}`);
      }
    });
  };
  emit(tree);
  return lines.join("\n");
}

/**
 * @brief Formats the collected file structure as markdown.
 * @details Converts absolute file paths to project-relative POSIX paths, renders an ASCII tree, and wraps the result in a fenced markdown block. Runtime is O(n log n) in file count. No side effects occur.
 * @param[in] files {string[]} Absolute file paths.
 * @param[in] projectBase {string} Absolute project root.
 * @return {string} Markdown section describing the file structure.
 */
function formatFilesStructureMarkdown(files: string[], projectBase: string): string {
  const relativePaths = files.map((filePath) => path.relative(projectBase, filePath).split(path.sep).join("/"));
  return `# Files Structure\n\`\`\`\n${buildAsciiTree(relativePaths)}\n\`\`\``;
}

/**
 * @brief Resolves and validates the project base directory.
 * @details Uses the supplied path or the current working directory, normalizes it to an absolute path, and verifies that it exists. Runtime is O(1) plus one filesystem existence check. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string | undefined} Optional project-root override.
 * @return {string} Absolute validated project root.
 * @throws {ReqError} Throws when the resolved path does not exist.
 */
export function resolveProjectBase(projectBase?: string): string {
  const base = projectBase ? path.resolve(projectBase) : process.cwd();
  if (!fs.existsSync(base)) {
    fail(`Error: PROJECT_BASE '${base}' does not exist`, 2);
  }
  return base;
}

/**
 * @brief Resolves the project base and effective source-directory list.
 * @details Loads configuration when not supplied, validates that at least one source directory exists in config, and returns both the absolute base path and source-directory array. Runtime is O(s). Side effects are limited to config reads.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {[string, string[]]} Tuple of absolute project base and configured source directories.
 * @throws {ReqError} Throws when no source directories are configured.
 */
export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]] {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const srcDirs = effectiveConfig["src-dir"];
  if (!Array.isArray(srcDirs) || srcDirs.length === 0) {
    fail("Error: no source directories configured.", 1);
  }
  return [base, srcDirs];
}

/**
 * @brief Loads project configuration and refreshes derived path metadata.
 * @details Resolves the base path, loads config, updates `base-path`, refreshes `git-path` when inside a repository, saves the repaired config, and returns it. Runtime is dominated by config I/O and git detection. Side effects include config writes and git subprocess execution.
 * @param[in] projectBase {string} Candidate project root.
 * @return {UseReqConfig} Repaired effective configuration.
 */
export function loadAndRepairConfig(projectBase: string): UseReqConfig {
  const base = resolveProjectBase(projectBase);
  const config = loadConfig(base);
  config["base-path"] = base;
  if (isInsideGitRepo(base)) {
    config["git-path"] = resolveGitRoot(base);
  }
  saveConfig(base, config);
  return config;
}

/**
 * @brief Counts tokens and characters for explicit files.
 * @details Filters missing files into stderr warnings, counts metrics for valid files, and returns a formatted summary. Runtime is O(F + S). Side effects are limited to filesystem reads.
 * @param[in] files {string[]} Explicit file paths.
 * @return {ToolResult} Tool result containing the formatted summary and warnings.
 * @throws {ReqError} Throws when no valid files are provided.
 */
export function runFilesTokens(files: string[]): ToolResult {
  const validFiles: string[] = [];
  const stderrLines: string[] = [];
  files.forEach((filePath) => {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      stderrLines.push(`  Warning: skipping (not found): ${filePath}`);
    } else {
      validFiles.push(filePath);
    }
  });
  if (validFiles.length === 0) fail("Error: no valid files provided.", 1, "", stderrLines.join("\n"));
  return ok(`${formatPackSummary(countFilesMetrics(validFiles))}\n`, stderrLines.join("\n"));
}

/**
 * @brief Generates the structured references JSON payload for explicit files.
 * @details Builds the agent-oriented references payload in caller order, preserves skipped and failed inputs as structured file records, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] files {string[]} Explicit file paths.
 * @param[in] cwd {string} Base directory used for canonical path resolution. Defaults to `process.cwd()`.
 * @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing structured JSON.
 * @satisfies REQ-011, REQ-076, REQ-077, REQ-078, REQ-079
 */
export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult {
  const payload = buildReferenceToolPayload({
    toolName: "files-references",
    scope: "explicit-files",
    baseDir: cwd,
    requestedPaths: files,
    verbose,
  });
  const stderr = buildReferenceToolExecutionStderr(payload);
  if (payload.summary.processable_file_count === 0) {
    fail("Error: no valid source files provided.", 1, "", stderr);
  }
  if (payload.summary.analyzed_file_count === 0) {
    fail("Error: no valid source files processed.", 1, "", stderr);
  }
  return ok(`${JSON.stringify(payload, null, 2)}\n`, stderr);
}

/**
 * @brief Compresses explicit files into compact source excerpts.
 * @details Delegates to `compressFiles` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] files {string[]} Explicit file paths.
 * @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing compressed output.
 */
export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult {
  return ok(`${compressFiles(files, enableLineNumbers, verbose, cwd)}\n`);
}

/**
 * @brief Finds named constructs in explicit files.
 * @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `findConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
 * @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing construct markdown.
 * @throws {ReqError} Throws when required arguments are missing.
 */
export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult {
  if (argsList.length < 3) {
    fail("Error: --files-find requires at least TAG, PATTERN, and one FILE.", 1);
  }
  const [tagFilter, pattern, ...files] = argsList;
  return ok(`${findConstructsInFiles(files, tagFilter!, pattern!, enableLineNumbers, verbose)}\n`);
}

/**
 * @brief Generates the structured references JSON payload for configured source directories.
 * @details Resolves the project base, collects configured source files, builds the agent-oriented references payload, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing structured JSON.
 * @throws {ReqError} Throws when no source files are found or no file can be analyzed.
 * @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079
 */
export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  const payload = buildReferenceToolPayload({
    toolName: "references",
    scope: "configured-source-directories",
    baseDir: base,
    requestedPaths: files,
    sourceDirectoryPaths: srcDirs,
    verbose,
  });
  const stderr = buildReferenceToolExecutionStderr(payload);
  if (payload.summary.analyzed_file_count === 0) {
    fail("Error: no valid source files processed.", 1, "", stderr);
  }
  return ok(`${JSON.stringify(payload, null, 2)}\n`, stderr);
}

/**
 * @brief Compresses all source files from configured source directories.
 * @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing compressed output.
 * @throws {ReqError} Throws when no source files are found.
 */
export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  return ok(`${compressFiles(files, enableLineNumbers, verbose, base)}\n`);
}

/**
 * @brief Finds named constructs across configured project source files.
 * @details Resolves the project base, collects source files, delegates to `findConstructsInFiles`, and converts thrown search errors into structured `ReqError` failures. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] tagFilter {string} Pipe-delimited tag filter.
 * @param[in] pattern {string} Regular expression applied to construct names.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
 * @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing construct markdown.
 * @throws {ReqError} Throws when no source files are found or the search fails.
 */
export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  try {
    return ok(`${findConstructsInFiles(files, tagFilter, pattern, enableLineNumbers, verbose)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
}

/**
 * @brief Counts tokens for canonical documentation files.
 * @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Tool result containing documentation token metrics.
 * @throws {ReqError} Throws when no canonical docs files exist.
 */
export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const docsDir = effectiveConfig["docs-dir"].replace(/[/\\]+$/, "");
  const docsPath = path.join(base, docsDir);
  const canonicalNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"];
  const files = canonicalNames.map((name) => path.join(docsPath, name)).filter((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
  if (files.length === 0) fail("Error: no canonical docs files found in --docs-dir.", 1);
  return runFilesTokens(files);
}

/**
 * @brief Runs configured static checks for explicit files.
 * @details Loads the effective static-check config, groups checks by file extension language, captures checker stdout for each configured entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
 * @param[in] files {string[]} Explicit file paths.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Aggregated static-check result.
 */
export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const scConfig = effectiveConfig["static-check"] ?? {};
  let stderr = "";
  let overall = 0;
  let stdout = "";
  for (const rawPath of files) {
    if (!fs.existsSync(rawPath) || !fs.statSync(rawPath).isFile()) {
      stderr += `${stderr ? "\n" : ""}  Warning: skipping (not found or not a file): ${rawPath}`;
      continue;
    }
    const filePath = path.resolve(rawPath);
    const lang = STATIC_CHECK_EXT_TO_LANG[path.extname(filePath).toLowerCase()];
    if (!lang) continue;
    const langConfigs = scConfig[lang] ?? [];
    for (const langConfig of langConfigs) {
      const previousWrite = process.stdout.write.bind(process.stdout);
      let captured = "";
      (process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
        captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
        return true;
      }) as unknown as typeof process.stdout.write;
      try {
        const rc = dispatchStaticCheckForFile(filePath, langConfig, {
          failOnly: true,
          projectBase: base,
        });
        if (rc !== 0) overall = 1;
      } finally {
        process.stdout.write = previousWrite;
      }
      stdout += captured;
    }
  }
  return { stdout, stderr, code: overall };
}

/**
 * @brief Runs configured static checks for project source and test directories.
 * @details Collects source and test files, excludes fixture roots, and delegates to `runFilesStaticCheck`. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Aggregated static-check result.
 * @throws {ReqError} Throws when no source files are found.
 */
export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const selectionDirs = [...effectiveConfig["src-dir"], effectiveConfig["tests-dir"]];
  let files = collectSourceFiles(selectionDirs, base);
  const testsDirRel = makeRelativeIfContainsProject(effectiveConfig["tests-dir"], base).split(path.sep).join("/").replace(/^\.?\/?/, "").replace(/\/+$/, "");
  const fixtureRoots = new Set(["tests/fixtures", testsDirRel ? `${testsDirRel}/fixtures` : "fixtures"]);
  files = files.filter((filePath) => {
    const rel = path.relative(base, filePath).split(path.sep).join("/");
    return ![...fixtureRoots].some((fixtureRoot) => rel === fixtureRoot || rel.startsWith(`${fixtureRoot}/`));
  });
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  return runFilesStaticCheck(files, base, effectiveConfig);
}

/**
 * @brief Verifies that the configured repository is clean and has a valid HEAD.
 * @details Executes a shell pipeline that checks work-tree status, rejects uncommitted changes, and verifies either a symbolic ref or detached HEAD hash exists. Runtime is dominated by git execution. Side effects include process spawning.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful empty result when the repository state is valid.
 * @throws {ReqError} Throws when `git-path` is missing or repository status is unclear.
 */
export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const insideResult = runCapture(["git", "rev-parse", "--is-inside-work-tree"], { cwd: gitPath });
  if (insideResult.error || insideResult.status !== 0 || insideResult.stdout.trim() !== "true") {
    fail("ERROR: Git status unclear!", 1);
  }
  const statusResult = runCapture(["git", "status", "--porcelain"], { cwd: gitPath });
  if (statusResult.error || statusResult.status !== 0 || statusResult.stdout.trim() !== "") {
    fail("ERROR: Git status unclear!", 1);
  }
  const symbolicHead = runCapture(["git", "symbolic-ref", "-q", "HEAD"], { cwd: gitPath });
  if (symbolicHead.error || symbolicHead.status !== 0) {
    const detachedHead = runCapture(["git", "rev-parse", "--verify", "HEAD"], { cwd: gitPath });
    if (detachedHead.error || detachedHead.status !== 0) {
      fail("ERROR: Git status unclear!", 1);
    }
  }
  return ok();
}

/**
 * @brief Verifies that canonical documentation files exist.
 * @details Checks the configured docs directory for `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, and throws a guided error for the first missing file. Runtime is O(1) plus filesystem existence checks. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful empty result when all canonical docs exist.
 * @throws {ReqError} Throws when `git-path` metadata is invalid or a required doc file is missing.
 */
export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const docsDir = effectiveConfig["docs-dir"].replace(/[/\\]+$/, "");
  const basePath = effectiveConfig["base-path"] ?? base;
  const docPath = path.join(basePath, docsDir);
  for (const [filename, promptCmd] of [
    ["REQUIREMENTS.md", "/req-write"],
    ["WORKFLOW.md", "/req-workflow"],
    ["REFERENCES.md", "/req-references"],
  ] as const) {
    const fullPath = path.join(docPath, filename);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      const message = `ERROR: File ${docPath}/${filename} does not exist, generate it with the ${promptCmd} prompt!`;
      fail(message, 1, `${message}\n`, message);
    }
  }
  return ok();
}

/**
 * @brief Generates the standardized worktree name for the configured repository.
 * @details Combines the repository basename, sanitized current branch, and a timestamp-based execution identifier into a deterministic `useReq-...` name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful result containing the generated worktree name and trailing newline.
 * @throws {ReqError} Throws when `git-path` is missing or invalid.
 */
export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const projectName = path.basename(gitPath);
  const branchResult = runCapture(["git", "branch", "--show-current"], { cwd: gitPath });
  const branch = branchResult.error ? "unknown" : branchResult.stdout.trim();
  const sanitizedBranch = sanitizeBranchName(branch);
  const now = new Date();
  const executionId = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  return ok(`useReq-${projectName}-${sanitizedBranch}-${executionId}\n`);
}

/**
 * @brief Tests whether a git worktree exists at an exact filesystem path.
 * @details Parses `git worktree list --porcelain` output and compares normalized paths for exact equality. Runtime is O(n) in reported worktree count plus git execution cost. Side effects include process spawning.
 * @param[in] gitPath {string} Git root used to query worktrees.
 * @param[in] targetPath {string} Candidate worktree path.
 * @return {boolean} `true` when a worktree exists at the exact target path.
 * @throws {ReqError} Throws when the worktree list cannot be queried.
 */
function worktreePathExistsExact(gitPath: string, targetPath: string): boolean {
  const result = runCapture(["git", "worktree", "list", "--porcelain"], { cwd: gitPath });
  if (result.error || result.status !== 0) fail("Error: unable to query git worktree list.", 3);
  const normalizedTarget = path.resolve(targetPath);
  return result.stdout.split(/\r?\n/).some((line) => line.startsWith("worktree ") && path.resolve(line.slice("worktree ".length).trim()) === normalizedTarget);
}

/**
 * @brief Rolls back a partially created worktree and branch.
 * @details Forces worktree removal and branch deletion, then throws if either rollback action fails. Runtime is dominated by git execution. Side effects include destructive git mutations.
 * @param[in] gitPath {string} Git root path.
 * @param[in] wtPath {string} Worktree path to remove.
 * @param[in] wtName {string} Branch name to delete.
 * @return {void} No return value.
 * @throws {ReqError} Throws when rollback cannot be completed.
 */
function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void {
  const removeResult = runCapture(["git", "worktree", "remove", wtPath, "--force"], { cwd: gitPath });
  const branchResult = runCapture(["git", "branch", "-D", wtName], { cwd: gitPath });
  if (removeResult.error || branchResult.error || removeResult.status !== 0 || branchResult.status !== 0) {
    fail(`ERROR: Rollback failed for worktree or branch ${wtName}.`, 1);
  }
}

/**
 * @brief Creates a dedicated git worktree and copies pi-usereq metadata into it.
 * @details Validates the requested name, resolves base and git roots, creates the worktree and branch, then mirrors the `.pi/pi-usereq` directory into the corresponding path inside the new worktree. Runtime is dominated by git and filesystem operations. Side effects include worktree creation, branch creation, directory creation, and file copying.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] wtName {string} Requested worktree and branch name.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful empty result when creation completes.
 * @throws {ReqError} Throws for invalid names, missing git metadata, git failures, or copy finalization failures.
 */
export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult {
  if (!validateWtName(wtName)) {
    const message = `ERROR: Invalid worktree/branch name: ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  const basePath = effectiveConfig["base-path"] ?? base;
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const gitRoot = path.resolve(gitPath);
  const resolvedBasePath = path.resolve(basePath);
  const parentPath = path.dirname(gitRoot);
  const baseDir = (() => {
    const rel = path.relative(gitRoot, resolvedBasePath);
    return rel.startsWith("..") ? "." : rel;
  })();
  const wtDest = path.join(parentPath, wtName);
  const addResult = runCapture(["git", "worktree", "add", wtDest, "-b", wtName], { cwd: gitRoot });
  if (addResult.error || addResult.status !== 0) {
    fail(`Error: git worktree add failed: ${addResult.stderr.trim()}`, 1);
  }
  try {
    const wtBaseDir = path.join(wtDest, baseDir);
    const srcReq = path.join(resolvedBasePath, ".pi", "pi-usereq");
    const dstReq = path.join(wtBaseDir, ".pi", "pi-usereq");
    if (fs.existsSync(srcReq) && fs.statSync(srcReq).isDirectory() && !fs.existsSync(dstReq)) {
      fs.mkdirSync(path.dirname(dstReq), { recursive: true });
      fs.cpSync(srcReq, dstReq, { recursive: true });
    }
  } catch {
    rollbackWorktreeCreate(gitRoot, wtDest, wtName);
    fail(`ERROR: Unable to finalize worktree creation for ${wtName}.`, 1);
  }
  return ok();
}

/**
 * @brief Deletes a dedicated git worktree and its branch.
 * @details Verifies that either the worktree path or branch exists, removes the worktree when present, deletes the branch when present, and fails atomically when either delete step reports an error. Runtime is dominated by git execution. Side effects include destructive git mutations.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] wtName {string} Exact worktree and branch name.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful empty result when deletion completes.
 * @throws {ReqError} Throws when git metadata is missing, the target does not exist, or removal fails.
 */
export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  const gitPath = effectiveConfig["git-path"];
  const basePath = effectiveConfig["base-path"] ?? base;
  if (!gitPath || !fs.existsSync(gitPath) || !fs.statSync(gitPath).isDirectory()) {
    fail("Error: git-path not configured or does not exist.", 11);
  }
  const gitRoot = path.resolve(gitPath);
  const parentPath = path.dirname(gitRoot);
  const wtPath = path.join(parentPath, wtName);
  const branchExists = (() => {
    const result = runCapture(["git", "show-ref", "--verify", `refs/heads/${wtName}`], { cwd: gitRoot });
    return result.status === 0;
  })();
  const wtExists = worktreePathExistsExact(gitRoot, wtPath);
  if (!branchExists && !wtExists) {
    const message = `ERROR: Invalid worktree or branch name: ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  const deleteCwd = path.resolve(basePath);
  let errorOccurred = false;
  if (wtExists) {
    const result = runCapture(["git", "worktree", "remove", wtPath, "--force"], { cwd: deleteCwd });
    errorOccurred ||= !!result.error || result.status !== 0;
  }
  if (branchExists) {
    const result = runCapture(["git", "branch", "-D", wtName], { cwd: deleteCwd });
    errorOccurred ||= !!result.error || result.status !== 0;
  }
  if (errorOccurred) {
    const message = `ERROR: Unable to remove worktree or branch ${wtName}.`;
    fail(message, 1, `${message}\n`, message);
  }
  return ok();
}

/**
 * @brief Returns the configured git root path.
 * @details Resolves the effective configuration and writes the stored `git-path` followed by a newline. Runtime is O(1) plus config-load cost. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful result containing the configured git path or an empty line.
 */
export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  return ok(`${effectiveConfig["git-path"] ?? ""}\n`);
}

/**
 * @brief Returns the configured project base path.
 * @details Resolves the effective configuration and writes the stored `base-path`, falling back to the resolved base when absent. Runtime is O(1) plus config-load cost. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @return {ToolResult} Successful result containing the base path and trailing newline.
 */
export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult {
  const base = resolveProjectBase(projectBase);
  const effectiveConfig = config ?? loadConfig(base);
  return ok(`${effectiveConfig["base-path"] ?? base}\n`);
}
