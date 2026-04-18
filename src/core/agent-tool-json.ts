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
 * @details Separates numeric status, line-oriented diagnostics, and optional raw text so downstream agents can branch on stable fields before consulting residual text. The interface is compile-time only and introduces no runtime cost.
 */
export interface ToolExecutionSection {
  code: number;
  stdout_line_count: number;
  stderr_line_count: number;
  stdout_lines: string[];
  stderr_lines: string[];
  stdout_text?: string;
  stderr_text?: string;
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
 * @details Exposes the requested config key, caller cwd, resolved project base, and resolved path value as direct-access fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface PathQueryToolPayload {
  request: {
    tool_name: string;
    scope: "project-config";
    working_directory_path: string;
    project_base_path: string;
    query_key: "git-path" | "base-path";
  };
  result: {
    status: "resolved" | "empty";
    path_key: "git-path" | "base-path";
    path_value: string;
    path_present: boolean;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by `git-check`.
 * @details Exposes git-root presence, repository validation status, and normalized execution diagnostics as stable fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface GitCheckToolPayload {
  request: {
    tool_name: "git-check";
    scope: "project-config";
    project_base_path: string;
    configured_git_path: string;
    git_path_present: boolean;
  };
  result: {
    status: "clean" | "error";
    worktree_status: "clean" | "unknown";
    head_status: "valid" | "unknown";
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes one canonical-doc status record returned by `docs-check`.
 * @details Binds each required filename to its prompt generator, normalized path facts, and presence status so agents can branch per missing document deterministically. The interface is compile-time only and introduces no runtime cost.
 */
export interface DocsCheckFileRecord {
  file_name: string;
  canonical_path: string;
  absolute_path: string;
  prompt_command: string;
  exists: boolean;
  is_file: boolean;
  status: "present" | "missing";
}

/**
 * @brief Describes the structured payload returned by `docs-check`.
 * @details Exposes docs-root selection, per-document presence facts, remediation prompt commands, and execution diagnostics as stable JSON fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface DocsCheckToolPayload {
  request: {
    tool_name: "docs-check";
    scope: "canonical-docs";
    project_base_path: string;
    docs_directory_path: string;
    required_file_count: number;
    required_file_names: string[];
  };
  summary: {
    present_file_count: number;
    missing_file_count: number;
  };
  files: DocsCheckFileRecord[];
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by `git-wt-name`.
 * @details Exposes the generated worktree name and its normative format as direct-access fields while preserving execution diagnostics separately. The interface is compile-time only and introduces no runtime cost.
 */
export interface WorktreeNameToolPayload {
  request: {
    tool_name: "git-wt-name";
    scope: "project-config";
    project_base_path: string;
    configured_git_path: string;
  };
  result: {
    status: "generated" | "error";
    worktree_name?: string;
    format_text: "useReq-<project>-<sanitized-branch>-<YYYYMMDDHHMMSS>";
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes the structured payload returned by worktree mutation tools.
 * @details Exposes the requested operation, exact worktree name, derived worktree path, mutation status, and execution diagnostics as stable JSON fields. The interface is compile-time only and introduces no runtime cost.
 */
export interface WorktreeMutationToolPayload {
  request: {
    tool_name: "git-wt-create" | "git-wt-delete";
    scope: "project-config";
    operation: "create" | "delete";
    project_base_path: string;
    configured_git_path: string;
    worktree_name: string;
  };
  result: {
    status: "created" | "deleted" | "error";
    worktree_name: string;
    branch_name: string;
    worktree_path: string;
    error_message?: string;
  };
  execution: ToolExecutionSection;
}

/**
 * @brief Describes one file-selection record inside a static-check payload.
 * @details Exposes request order, normalized path facts, detected language, configured checker modules, and stable selection status without forcing agents to parse checker output text. The interface is compile-time only and introduces no runtime cost.
 */
export interface StaticCheckFileRecord {
  request_index: number;
  input_path: string;
  canonical_path: string;
  absolute_path: string;
  exists: boolean;
  is_file: boolean;
  language_name?: string;
  configured_checker_count: number;
  configured_checker_modules: string[];
  status: "selected" | "skipped" | "unsupported_language" | "no_configured_checkers";
  error_message?: string;
}

/**
 * @brief Describes the structured payload returned by static-check agent tools.
 * @details Exposes scope selection, configured checker coverage, per-file selection facts, and normalized execution diagnostics while keeping residual checker text optional under execution. The interface is compile-time only and introduces no runtime cost.
 */
export interface StaticCheckToolPayload {
  request: {
    tool_name: "files-static-check" | "static-check";
    scope: "explicit-files" | "configured-source-and-test-directories";
    project_base_path: string;
    configured_language_count: number;
    configured_languages: string[];
    selection_directory_paths: string[];
    excluded_directory_paths: string[];
    requested_file_count: number;
    requested_input_paths: string[];
  };
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
 * @details Separates numeric exit status, line-oriented stdout/stderr arrays, and optional raw text so downstream agents can consume structured facts before consulting residual text. Runtime is O(n) in output size. No external state is mutated.
 * @param[in] result {ToolResult} Raw tool result.
 * @return {ToolExecutionSection} Normalized execution metadata.
 */
export function buildToolExecutionSection(result: ToolResult): ToolExecutionSection {
  const stdoutText = result.stdout.trimEnd();
  const stderrText = result.stderr.trimEnd();
  const stdoutLines = splitToolOutputLines(stdoutText);
  const stderrLines = splitToolOutputLines(stderrText);
  return {
    code: result.code,
    stdout_line_count: stdoutLines.length,
    stderr_line_count: stderrLines.length,
    stdout_lines: stdoutLines,
    stderr_lines: stderrLines,
    stdout_text: stdoutText === "" ? undefined : stdoutText,
    stderr_text: stderrText === "" ? undefined : stderrText,
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
 * @details Exposes the resolved config value as a direct-access field and preserves normalized execution metadata separately from path facts. Runtime is O(p) in path length. No external state is mutated.
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
  const queryKey = toolName === "git-path" ? "git-path" : "base-path";
  return {
    request: {
      tool_name: toolName,
      scope: "project-config",
      working_directory_path: path.resolve(workingDirectoryPath).split(path.sep).join("/"),
      project_base_path: path.resolve(projectBasePath).split(path.sep).join("/"),
      query_key: queryKey,
    },
    result: {
      status: resolvedPath === "" ? "empty" : "resolved",
      path_key: queryKey,
      path_value: resolvedPath,
      path_present: resolvedPath !== "",
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `git-check`.
 * @details Encodes configured git-root presence plus clean-versus-error status as direct fields while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Configured git root path.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {GitCheckToolPayload} Structured git-check payload.
 */
export function buildGitCheckToolPayload(
  projectBasePath: string,
  configuredGitPath: string | undefined,
  execution: ToolExecutionSection,
): GitCheckToolPayload {
  const errorMessage = execution.stderr_lines[0];
  return {
    request: {
      tool_name: "git-check",
      scope: "project-config",
      project_base_path: path.resolve(projectBasePath).split(path.sep).join("/"),
      configured_git_path: configuredGitPath ?? "",
      git_path_present: Boolean(configuredGitPath),
    },
    result: {
      status: execution.code === 0 ? "clean" : "error",
      worktree_status: execution.code === 0 ? "clean" : "unknown",
      head_status: execution.code === 0 ? "valid" : "unknown",
      error_message: execution.code === 0 ? undefined : errorMessage,
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `docs-check`.
 * @details Enumerates required canonical documents, binds each missing file to its remediation prompt command, and emits summary counts plus normalized execution metadata. Runtime is O(k) in required file count plus filesystem reads. Side effects are limited to filesystem reads.
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
      absolute_path: absolutePath.split(path.sep).join("/"),
      prompt_command: promptCommand,
      exists,
      is_file: isFile,
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
    request: {
      tool_name: "docs-check",
      scope: "canonical-docs",
      project_base_path: normalizedProjectBasePath.split(path.sep).join("/"),
      docs_directory_path: normalizedDocsRootPath.split(path.sep).join("/"),
      required_file_count: files.length,
      required_file_names: files.map((file) => file.file_name),
    },
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
 * @details Preserves the generated worktree name plus its normative format string as direct-access fields and reports failures through structured execution metadata. Runtime is O(n) in output size. No external state is mutated.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Configured git root path.
 * @param[in] execution {ToolExecutionSection} Normalized execution metadata.
 * @return {WorktreeNameToolPayload} Structured worktree-name payload.
 */
export function buildWorktreeNameToolPayload(
  projectBasePath: string,
  configuredGitPath: string | undefined,
  execution: ToolExecutionSection,
): WorktreeNameToolPayload {
  const worktreeName = execution.stdout_lines[0];
  return {
    request: {
      tool_name: "git-wt-name",
      scope: "project-config",
      project_base_path: path.resolve(projectBasePath).split(path.sep).join("/"),
      configured_git_path: configuredGitPath ?? "",
    },
    result: {
      status: execution.code === 0 && worktreeName ? "generated" : "error",
      worktree_name: worktreeName,
      format_text: "useReq-<project>-<sanitized-branch>-<YYYYMMDDHHMMSS>",
      error_message: execution.code === 0 ? undefined : execution.stderr_lines[0],
    },
    execution,
  };
}

/**
 * @brief Builds the structured payload returned by `git-wt-create` or `git-wt-delete`.
 * @details Exposes the requested operation, exact worktree name, derived worktree path, and mutation outcome as stable JSON fields while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] toolName {"git-wt-create" | "git-wt-delete"} Target tool name.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] configuredGitPath {string | undefined} Configured git root path.
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
  const gitRoot = configuredGitPath ? path.resolve(configuredGitPath) : "";
  const worktreePath = gitRoot === ""
    ? ""
    : path.join(path.dirname(gitRoot), worktreeName).split(path.sep).join("/");
  const operation = toolName === "git-wt-create" ? "create" : "delete";
  return {
    request: {
      tool_name: toolName,
      scope: "project-config",
      operation,
      project_base_path: path.resolve(projectBasePath).split(path.sep).join("/"),
      configured_git_path: configuredGitPath ?? "",
      worktree_name: worktreeName,
    },
    result: {
      status: execution.code === 0
        ? (operation === "create" ? "created" : "deleted")
        : "error",
      worktree_name: worktreeName,
      branch_name: worktreeName,
      worktree_path: worktreePath,
      error_message: execution.code === 0 ? undefined : execution.stderr_lines[0],
    },
    execution,
  };
}

/**
 * @brief Builds one static-check file-selection record.
 * @details Resolves filesystem status, detects the configured language by file extension, counts configured checker entries, and emits a stable selection status without parsing checker output text. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
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
    request_index: requestIndex,
    input_path: inputPath,
    canonical_path: canonicalizeToolPath(projectBasePath, absolutePath),
    absolute_path: absolutePath.split(path.sep).join("/"),
    exists,
    is_file: isFile,
    language_name: languageName,
    configured_checker_count: configuredCheckers.length,
    configured_checker_modules: configuredCheckers.map((checker) => checker.module),
    status,
    error_message: errorMessage,
  };
}

/**
 * @brief Builds the structured payload returned by `files-static-check` or `static-check`.
 * @details Exposes configured checker coverage, per-file selection facts, and normalized execution diagnostics while leaving raw checker output under execution for residual inspection only. Runtime is O(F + C). Side effects are limited to filesystem reads.
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
  const files = requestedPaths.map((inputPath, index) => buildStaticCheckFileRecord(
    inputPath,
    index,
    projectBasePath,
    staticCheckConfig,
  ));
  const configuredLanguages = Object.keys(staticCheckConfig).sort((left, right) => left.localeCompare(right));
  return {
    request: {
      tool_name: toolName,
      scope,
      project_base_path: path.resolve(projectBasePath).split(path.sep).join("/"),
      configured_language_count: configuredLanguages.length,
      configured_languages: configuredLanguages,
      selection_directory_paths: [...selectionDirectoryPaths],
      excluded_directory_paths: [...excludedDirectoryPaths],
      requested_file_count: requestedPaths.length,
      requested_input_paths: [...requestedPaths],
    },
    summary: {
      selected_file_count: files.filter((file) => file.status === "selected").length,
      skipped_file_count: files.filter((file) => file.status === "skipped").length,
      unsupported_file_count: files.filter((file) => file.status === "unsupported_language").length,
      no_configured_checker_file_count: files.filter((file) => file.status === "no_configured_checkers").length,
      total_configured_checker_count: files.reduce((sum, file) => sum + file.configured_checker_count, 0),
    },
    files,
    execution,
  };
}
