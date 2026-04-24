/**
 * @file
 * @brief Implements the executable back-end for pi-usereq CLI analysis and static-check commands.
 * @details Centralizes project discovery, git-backed source-file collection, documentation token generation, compression, construct lookup, and static-check dispatch. Runtime depends on the selected command and may include filesystem reads, config writes, and process spawning.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import {
  getActiveStaticCheckEntries,
  loadConfig,
  normalizeConfigPaths,
  saveConfig,
  type UseReqConfig,
} from "./config.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import { compressFiles } from "./compress-files.js";
import { searchConstructsInFiles } from "./find-constructs.js";
import { generateMarkdown } from "./generate-markdown.js";
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
 * @brief Loads project configuration and persists normalized path fields.
 * @details Resolves the base path, normalizes persisted docs/tests/source directories into project-relative form, writes the normalized config back to disk, and returns the in-memory result without persisting runtime-derived path metadata. Runtime is dominated by config I/O. Side effects include config writes.
 * @param[in] projectBase {string} Candidate project root.
 * @return {UseReqConfig} Normalized effective configuration.
 * @satisfies CTN-012, REQ-146
 */
export function loadAndRepairConfig(projectBase: string): UseReqConfig {
  const base = resolveProjectBase(projectBase);
  const config = normalizeConfigPaths(base, loadConfig(base));
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
 * @brief Generates the monolithic summary markdown for explicit files.
 * @details Delegates to `generateMarkdown(...)`, keeps output paths relative to the caller cwd, and returns the Python-compatible summary markdown document through stdout. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] files {string[]} Explicit file paths.
 * @param[in] cwd {string} Base directory used for relative output paths. Defaults to `process.cwd()`.
 * @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing monolithic markdown.
 * @satisfies REQ-011, REQ-076, REQ-077, REQ-078, REQ-079
 */
export function runFilesSummarize(files: string[], cwd = process.cwd(), verbose = false): ToolResult {
  try {
    return ok(`${generateMarkdown(files, verbose, cwd)}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
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
 * @brief Searches named constructs in explicit files.
 * @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `searchConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
 * @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing construct markdown.
 * @throws {ReqError} Throws when required arguments are missing.
 */
export function runFilesSearch(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult {
  if (argsList.length < 3) {
    fail("Error: --files-find requires at least TAG, PATTERN, and one FILE.", 1);
  }
  const [tagFilter, pattern, ...files] = argsList;
  return ok(`${searchConstructsInFiles(files, tagFilter!, pattern!, enableLineNumbers, verbose)}\n`);
}

/**
 * @brief Generates the monolithic summary markdown for configured source directories.
 * @details Resolves the project base, collects configured source files, prepends the repository file-structure markdown block, and returns the Python-compatible summary document through stdout. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing monolithic markdown.
 * @throws {ReqError} Throws when no source files are found or no file can be analyzed.
 * @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079
 */
export function runSummarize(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  try {
    const filesStructure = formatFilesStructureMarkdown(files, base);
    const markdown = generateMarkdown(files, verbose, base);
    return ok(`${filesStructure}\n\n${markdown}\n`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error), 1);
  }
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
 * @brief Searches named constructs across configured project source files.
 * @details Resolves the project base, collects source files, delegates to `searchConstructsInFiles`, and converts thrown search errors into structured `ReqError` failures. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
 * @param[in] projectBase {string} Candidate project root.
 * @param[in] tagFilter {string} Pipe-delimited tag filter.
 * @param[in] pattern {string} Regular expression applied to construct names.
 * @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
 * @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
 * @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
 * @return {ToolResult} Successful tool result containing construct markdown.
 * @throws {ReqError} Throws when no source files are found or the search fails.
 */
export function runSearch(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult {
  const [base, srcDirs] = resolveProjectSrcDirs(projectBase, config);
  const files = collectSourceFiles(srcDirs, base);
  if (files.length === 0) fail("Error: no source files found in configured directories.", 1);
  try {
    return ok(`${searchConstructsInFiles(files, tagFilter, pattern, enableLineNumbers, verbose)}\n`);
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
 * @details Loads the effective static-check config, resolves the active checker list per file-extension language through the per-language enable flag, captures checker stdout for each dispatched entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
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
    const langConfigs = getActiveStaticCheckEntries(scConfig, lang);
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

