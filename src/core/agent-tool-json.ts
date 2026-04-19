/**
 * @file
 * @brief Builds structured agent-tool JSON payloads for path, git, docs, worktree, and static-check tools.
 * @details Converts extension-tool execution state into deterministic JSON-first payloads optimized for direct LLM traversal. The module normalizes execution metadata, path facts, required-doc status, worktree mutation facts, and static-check file-selection facts without depending on presentation-oriented text. Runtime is O(F) in the number of described files plus path normalization cost. Side effects are limited to filesystem reads.
 */

import fs from "node:fs";
import path from "node:path";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";
import { STATIC_CHECK_EXT_TO_LANG } from "./static-check.js";
import type { ToolResult } from "./tool-runner.js";

/**
 * @brief Describes normalized execution metadata shared by structured tool payloads.
 * @details Stores only the exit code and residual stdout or stderr line arrays needed after response payload construction, omitting duplicate text and count fields to reduce token cost. The interface is compile-time only and introduces no runtime cost.
 */
export interface ToolExecutionSection {
  code: number;
  stdout_lines?: string[];
  stderr_lines?: string[];
}

/**
 * @brief Describes the standard execute return wrapper used by structured agent tools.
 * @details Mirrors the same JSON payload into both the text content channel and the machine-readable details channel so agents can consume stable fields without reparsing ad-hoc prose. The interface is compile-time only and introduces no runtime cost.
 */
export interface StructuredToolExecuteResult<T> {
  content: Array<{ type: "text"; text: string }>;
  details: T;
}

/**
 * @brief Describes the structured payload returned by path-query tools.
 * @details Exposes only the resolved path facts that can differ at runtime plus residual execution diagnostics, omitting caller-known request echoes and duplicated runtime-path inventories. The interface is compile-time only and introduces no runtime cost.
 */
export interface PathQueryToolPayload {
  result: {
    path_value: string;
    path_present: boolean;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by `git-check`.
 * @details Exposes only the runtime git-path presence fact plus aggregate repository validation status, omitting intermediate request metadata whose semantics already live in the tool registration. The interface is compile-time only and introduces no runtime cost.
 */
export interface GitCheckToolPayload {
  result: {
    git_path_present: boolean;
    status: "clean" | "error";
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes one canonical-doc status record returned by `docs-check`.
 * @details Stores the canonical path, remediation prompt command, and presence status while omitting redundant filesystem probe fields already summarized by the status value. The interface is compile-time only and introduces no runtime cost.
 */
export interface DocsCheckFileRecord {
  file_name: string;
  canonical_path: string;
  prompt_command: string;
  status: "present" | "missing";
}

/**
 * @brief Describes the structured payload returned by `docs-check`.
 * @details Exposes per-document presence facts and remediation commands plus residual execution diagnostics, omitting static request metadata that can be inferred from the tool registration and caller context. The interface is compile-time only and introduces no runtime cost.
 */
export interface DocsCheckToolPayload {
  summary: {
    present_file_count: number;
    missing_file_count: number;
  };
  files: DocsCheckFileRecord[];
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by `git-wt-name`.
 * @details Exposes only the generated worktree name plus residual execution diagnostics, omitting the static normative format string because it already belongs in registration metadata. The interface is compile-time only and introduces no runtime cost.
 */
export interface WorktreeNameToolPayload {
  result: {
    worktree_name?: string;
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by worktree mutation tools.
 * @details Exposes only the exact worktree name and derived path that can vary per invocation plus residual execution diagnostics, omitting static operation descriptors and duplicated branch-name fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface WorktreeMutationToolPayload {
  result: {
    worktree_name: string;
    worktree_path: string;
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes one file-selection record inside a static-check payload.
 * @details Exposes canonical path, detected language, configured checker modules, and stable selection status without echoing caller inputs or redundant filesystem probe fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface StaticCheckFileRecord {
  canonical_path: string;
  language_name?: string;
  configured_checker_modules: string[];
  status: "selected" | "skipped" | "unsupported_language" | "no_configured_checkers";
  error_message?: string;
}

/**
 * @brief Describes the structured payload returned by static-check agent tools.
 * @details Exposes aggregate checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics are already available in the tool registration and input parameters. The interface is compile-time only and introduces no runtime cost.
 */
export interface StaticCheckToolPayload {
  summary: {
    selected_file_count: number;
    skipped_file_count: number;
    unsupported_file_count: number;
    no_configured_checker_file_count: number;
    total_configured_checker_count: number;
  };
  files: StaticCheckFileRecord[];
  execution: ToolExecutionSection;
}

/**
 * @brief Serializes one structured payload as pretty-printed JSON.
 * @details Uses two-space indentation and omits a trailing newline so the mirrored text payload remains deterministic and compact. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] payload {unknown} Structured JSON-compatible payload.
 * @return {string} Pretty-printed JSON text.
 */
function formatJsonToolPayload(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
}

/**
 * @brief Splits one stdout or stderr text block into normalized non-empty lines.
 * @details Trims trailing newlines, preserves internal line order, and omits empty records so downstream agents can branch on stable arrays without reparsing blank output. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] text {string} Raw output text.
 * @return {string[]} Normalized non-empty output lines.
 */
function splitToolOutputLines(text: string): string[] {
  const trimmed = text.trim();
  return trimmed === "" ? [] : trimmed.split(/\r?\n/);
}

/**
 * @brief Normalizes one path into a canonical slash-separated form relative to the project base when possible.
 * @details Resolves the candidate against the provided base, emits a relative path for in-project targets, and falls back to an absolute slash-normalized path for external targets. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] baseDir {string} Absolute project base path.
 * @param[in] candidatePath {string} Relative or absolute path candidate.
 * @return {string} Canonical slash-normalized path.
 */
function canonicalizeToolPath(baseDir: string, candidatePath: string): string {
  const absolutePath = path.resolve(baseDir, candidatePath);
  const relativePath = path.relative(baseDir, absolutePath);
  if (relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return relativePath.split(path.sep).join("/");
  }
  return absolutePath.split(path.sep).join("/");
}

/**
 * @brief Converts one structured tool payload into the standard execute wrapper.
 * @details Mirrors the same payload into `content[0].text` and `details` so agents can use direct JSON fields or raw JSON text interchangeably without divergence. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] payload {T} Structured payload containing an `execution` section.
 * @return {StructuredToolExecuteResult<T>} Standard execute wrapper with mirrored payload.
 */
export function buildStructuredToolExecuteResult<T extends { execution: ToolExecutionSection }>(
  payload: T,
): StructuredToolExecuteResult<T> {
  return {
    content: [{ type: "text", text: formatJsonToolPayload(payload) }],
    details: payload,
  };
}

/**
 * @brief Converts one raw `ToolResult` into a normalized execution section.
 * @details Preserves only the exit code plus non-empty stdout or stderr line arrays so downstream payloads carry residual diagnostics without duplicating the primary structured response body. Runtime is O(n) in output size. No external state is mutated.
 * @param[in] result {ToolResult} Raw tool result.
 * @return {ToolExecutionSection} Normalized residual execution metadata.
 */
export function buildToolExecutionSection(result: ToolResult): ToolExecutionSection {
  const stdoutText = result.stdout.trimEnd();
  const stderrText = result.stderr.trimEnd();
  const stdoutLines = splitToolOutputLines(stdoutText);
  const stderrLines = splitToolOutputLines(stderrText);
  return {
    code: result.code,
    stdout_lines: stdoutLines.length === 0 ? undefined : stdoutLines,
    stderr_lines: stderrLines.length === 0 ? undefined : stderrLines,
  };
}

/**
 * @brief Converts one `ReqError` into a synthetic `ToolResult` for structured payload emission.
 * @details Preserves the numeric exit code and message in stderr so agent tools can return deterministic JSON even when the underlying runner fails. Non-`ReqError` values are rethrown. Runtime is O(1). No external state is mutated.
 * @param[in] error {unknown} Thrown value captured from a runner.
 * @return {ToolResult} Synthetic tool result with empty stdout.
 * @throws {unknown} Rethrows non-`ReqError` failures unchanged.
 */
export function normalizeToolFailure(error: unknown): ToolResult {
  if (error instanceof ReqError) {
    return {
      stdout: "",
      stderr: error.message,
      code: error.code,
    };
  }
  throw error;
}

/**
 * @brief Builds the structured payload returned by `git-path` or `get-base-path`.
 * @details Exposes only the resolved runtime path value plus residual execution metadata, omitting request echoes and duplicated runtime-path inventories from the runtime payload. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] toolName {"git-path" | "get-base-path"} Target tool name.
 * @param[in] workingDirectoryPath {string} Caller working directory.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] resolvedPath {string} Resolved config path value.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {PathQueryToolPayload} Structured path-query payload.
 */
export function buildPathQueryToolPayload(
  toolName: "git-path" | "get-base-path",
  workingDirectoryPath: string,
  projectBasePath: string,
  resolvedPath: string,
  execution: ToolExecutionSection,
): PathQueryToolPayload {
  void toolName;
  void workingDirectoryPath;
  void projectBasePath;
  return {
    result: {
      path_value: resolvedPath,
      path_present: resolvedPath !== "",
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `git-check`.
 * @details Encodes runtime git-path presence plus aggregate clean-versus-error status while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Runtime git root path.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {GitCheckToolPayload} Structured git-check payload.
 */
export function buildGitCheckToolPayload(
  projectBasePath: string,
  configuredGitPath: string | undefined,
  execution: ToolExecutionSection,
): GitCheckToolPayload {
  void projectBasePath;
  const errorMessage = execution.stderr_lines?.[0];
  return {
    result: {
      git_path_present: Boolean(configuredGitPath),
      status: execution.code === 0 ? "clean" : "error",
      error_message: execution.code === 0 ? undefined : errorMessage,
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `docs-check`.
 * @details Enumerates required canonical documents, binds each missing file to its remediation prompt command, and emits summary counts plus residual execution diagnostics while omitting static request metadata. Runtime is O(k) in required file count plus filesystem reads. Side effects are limited to filesystem reads.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] docsDirPath {string} Configured docs directory relative to the project base.
 * @return {DocsCheckToolPayload} Structured docs-check payload.
 */
export function buildDocsCheckToolPayload(
  projectBasePath: string,
  docsDirPath: string,
): DocsCheckToolPayload {
  const normalizedProjectBasePath = path.resolve(projectBasePath);
  const normalizedDocsRootPath = path.join(normalizedProjectBasePath, docsDirPath.replace(/[/\\]+$/, ""));
  const files: DocsCheckFileRecord[] = [
    ["REQUIREMENTS.md", "/req-write"],
    ["WORKFLOW.md", "/req-workflow"],
    ["REFERENCES.md", "/req-references"],
  ].map(([fileName, promptCommand]) => {
    const absolutePath = path.join(normalizedDocsRootPath, fileName);
    const exists = fs.existsSync(absolutePath);
    const isFile = exists && fs.statSync(absolutePath).isFile();
    return {
      file_name: fileName,
      canonical_path: canonicalizeToolPath(normalizedProjectBasePath, absolutePath),
      prompt_command: promptCommand,
      status: isFile ? "present" : "missing",
    };
  });
  const missingFiles = files.filter((file) => file.status === "missing");
  const execution = buildToolExecutionSection({
    stdout: "",
    stderr: missingFiles
      .map((file) => `missing: ${file.canonical_path}: generate with ${file.prompt_command}`)
      .join("\n"),
    code: missingFiles.length === 0 ? 0 : 1,
  });
  return {
    summary: {
      present_file_count: files.length - missingFiles.length,
      missing_file_count: missingFiles.length,
    },
    files,
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `git-wt-name`.
 * @details Preserves only the generated worktree name and error diagnostics, leaving the static naming format in registration metadata instead of the runtime payload. Runtime is O(n) in output size. No external state is mutated.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Runtime git root path.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {WorktreeNameToolPayload} Structured worktree-name payload.
 */
export function buildWorktreeNameToolPayload(
  projectBasePath: string,
  configuredGitPath: string | undefined,
  execution: ToolExecutionSection,
): WorktreeNameToolPayload {
  void projectBasePath;
  void configuredGitPath;
  const worktreeName = execution.stdout_lines?.[0];
  return {
    result: {
      worktree_name: worktreeName,
      error_message: execution.code === 0 ? undefined : execution.stderr_lines?.[0],
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `git-wt-create` or `git-wt-delete`.
 * @details Exposes only the exact worktree name, derived worktree path, and error diagnostics, omitting static operation and branch-name echoes from the runtime payload. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] toolName {"git-wt-create" | "git-wt-delete"} Target tool name.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Runtime git root path.
 * @param[in] worktreeName {string} Exact requested worktree name.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {WorktreeMutationToolPayload} Structured worktree mutation payload.
 */
export function buildWorktreeMutationToolPayload(
  toolName: "git-wt-create" | "git-wt-delete",
  projectBasePath: string,
  configuredGitPath: string | undefined,
  worktreeName: string,
  execution: ToolExecutionSection,
): WorktreeMutationToolPayload {
  void toolName;
  void projectBasePath;
  const gitRoot = configuredGitPath ? path.resolve(configuredGitPath) : "";
  const worktreePath = gitRoot === ""
    ? ""
    : path.join(path.dirname(gitRoot), worktreeName).split(path.sep).join("/");
  return {
    result: {
      worktree_name: worktreeName,
      worktree_path: worktreePath,
      error_message: execution.code === 0 ? undefined : execution.stderr_lines?.[0],
    },
    execution,
  };
}

/**
 * @brief Builds one static-check file-selection record.
 * @details Resolves filesystem status, detects the configured language by file extension, and emits the configured checker modules plus a stable selection status without echoing caller inputs or redundant filesystem facts. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
 * @param[in] inputPath {string} Caller-supplied file path.
 * @param[in] requestIndex {number} Zero-based request position.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
 * @return {StaticCheckFileRecord} Structured file-selection record.
 */
function buildStaticCheckFileRecord(
  inputPath: string,
  requestIndex: number,
  projectBasePath: string,
  staticCheckConfig: Record<string, StaticCheckEntry[]>,
): StaticCheckFileRecord {
  void requestIndex;
  const absolutePath = path.resolve(projectBasePath, inputPath);
  const exists = fs.existsSync(absolutePath);
  const isFile = exists && fs.statSync(absolutePath).isFile();
  const languageName = isFile ? STATIC_CHECK_EXT_TO_LANG[path.extname(absolutePath).toLowerCase()] : undefined;
  const configuredCheckers = languageName ? [...(staticCheckConfig[languageName] ?? [])] : [];
  let status: StaticCheckFileRecord["status"] = "selected";
  let errorMessage: string | undefined;
  if (!exists) {
    status = "skipped";
    errorMessage = "not found";
  } else if (!isFile) {
    status = "skipped";
    errorMessage = "not a file";
  } else if (!languageName) {
    status = "unsupported_language";
    errorMessage = "unsupported language";
  } else if (configuredCheckers.length === 0) {
    status = "no_configured_checkers";
    errorMessage = "no configured checkers";
  }
  return {
    canonical_path: canonicalizeToolPath(projectBasePath, absolutePath),
    language_name: languageName,
    configured_checker_modules: configuredCheckers.map((checker) => checker.module),
    status,
    error_message: errorMessage,
  };
}

/**
 * @brief Builds the structured payload returned by `files-static-check` or `static-check`.
 * @details Exposes configured checker coverage, per-file selection facts, and normalized execution diagnostics while omitting request echoes whose semantics already live in registration metadata. Runtime is O(F + C). Side effects are limited to filesystem reads.
 * @param[in] toolName {"files-static-check" | "static-check"} Target tool name.
 * @param[in] scope {"explicit-files" | "configured-source-and-test-directories"} Selection scope label.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] requestedPaths {string[]} Explicit or discovered file paths.
 * @param[in] selectionDirectoryPaths {string[]} Directories that produced the selection.
 * @param[in] excludedDirectoryPaths {string[]} Directory roots excluded from project selection.
 * @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {StaticCheckToolPayload} Structured static-check payload.
 */
export function buildStaticCheckToolPayload(
  toolName: "files-static-check" | "static-check",
  scope: "explicit-files" | "configured-source-and-test-directories",
  projectBasePath: string,
  requestedPaths: string[],
  selectionDirectoryPaths: string[],
  excludedDirectoryPaths: string[],
  staticCheckConfig: Record<string, StaticCheckEntry[]>,
  execution: ToolExecutionSection,
): StaticCheckToolPayload {
  void toolName;
  void scope;
  void selectionDirectoryPaths;
  void excludedDirectoryPaths;
  const files = requestedPaths.map((inputPath, index) => buildStaticCheckFileRecord(
    inputPath,
    index,
    projectBasePath,
    staticCheckConfig,
  ));
  return {
    summary: {
      selected_file_count: files.filter((file) => file.status === "selected").length,
      skipped_file_count: files.filter((file) => file.status === "skipped").length,
      unsupported_file_count: files.filter((file) => file.status === "unsupported_language").length,
      no_configured_checker_file_count: files.filter((file) => file.status === "no_configured_checkers").length,
      total_configured_checker_count: files.reduce((sum, file) => sum + file.configured_checker_modules.length, 0),
    },
    files,
    execution,
  };
}
