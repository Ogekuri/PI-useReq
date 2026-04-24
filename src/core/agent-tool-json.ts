/**
 * @file
 * @brief Builds shared agent-tool result helpers plus static-check payloads.
 * @details Converts extension-tool execution state into deterministic monolithic content blocks, minimal execution metadata, and static-check file-selection facts. Runtime is O(F) in the number of described files plus path normalization cost. Side effects are limited to filesystem reads.
 */

import fs from "node:fs";
import path from "node:path";
import {
  getActiveStaticCheckEntries,
  type StaticCheckLanguageConfig,
} from "./config.js";
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
 * @brief Selects the monolithic tool text exposed to the LLM-facing content channel.
 * @details Prefers stdout so successful tool payloads preserve the primary formatter output verbatim, and falls back to stderr when the command failed before producing stdout. Runtime is O(n) in output length. No external state is mutated.
 * @param[in] result {ToolResult} Raw tool result.
 * @return {string} Monolithic text payload written to `content[0].text`.
 */
function selectMonolithicToolText(result: ToolResult): string {
  const stdoutText = result.stdout.trimEnd();
  if (stdoutText !== "") {
    return stdoutText;
  }
  return result.stderr.trimEnd();
}

/**
 * @brief Builds the minimal execute wrapper used by monolithic agent-tool outputs.
 * @details Writes exactly one LLM-facing text block to `content[0].text` and preserves only normalized execution metadata in `details.execution`. Runtime is O(n) in output length. No external state is mutated.
 * @param[in] result {ToolResult} Raw tool result.
 * @return {StructuredToolExecuteResult<{ execution: ToolExecutionSection }>} Monolithic execute wrapper.
 */
export function buildMonolithicToolExecuteResult(
  result: ToolResult,
): StructuredToolExecuteResult<{ execution: ToolExecutionSection }> {
  return {
    content: [{ type: "text", text: selectMonolithicToolText(result) }],
    details: {
      execution: buildToolExecutionSection(result),
    },
  };
}

/**
 * @brief Converts one runner failure into a synthetic `ToolResult`.
 * @details Preserves numeric exit codes for `ReqError`, converts generic `Error` instances into exit code `1` with stderr text, and falls back to string coercion for other thrown values so agent tools can return deterministic execution metadata. Runtime is O(1). No external state is mutated.
 * @param[in] error {unknown} Thrown value captured from a runner.
 * @return {ToolResult} Synthetic tool result with empty stdout.
 */
export function normalizeToolFailure(error: unknown): ToolResult {
  if (error instanceof ReqError) {
    return {
      stdout: "",
      stderr: error.message,
      code: error.code,
    };
  }
  if (error instanceof Error) {
    return {
      stdout: "",
      stderr: error.message,
      code: 1,
    };
  }
  return {
    stdout: "",
    stderr: String(error),
    code: 1,
  };
}

/**
 * @brief Builds one static-check file-selection record.
 * @details Resolves filesystem status, detects the configured language by file extension, derives the active checker modules after per-language enable gating, and emits a stable selection status without echoing caller inputs or redundant filesystem facts. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
 * @param[in] inputPath {string} Caller-supplied file path.
 * @param[in] requestIndex {number} Zero-based request position.
 * @param[in] projectBasePath {string} Resolved project base path.
 * @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check configuration.
 * @return {StaticCheckFileRecord} Structured file-selection record.
 */
function buildStaticCheckFileRecord(
  inputPath: string,
  requestIndex: number,
  projectBasePath: string,
  staticCheckConfig: Record<string, StaticCheckLanguageConfig>,
): StaticCheckFileRecord {
  void requestIndex;
  const absolutePath = path.resolve(projectBasePath, inputPath);
  const exists = fs.existsSync(absolutePath);
  const isFile = exists && fs.statSync(absolutePath).isFile();
  const languageName = isFile ? STATIC_CHECK_EXT_TO_LANG[path.extname(absolutePath).toLowerCase()] : undefined;
  const configuredCheckers = languageName
    ? getActiveStaticCheckEntries(staticCheckConfig, languageName)
    : [];
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
 * @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check configuration.
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
  staticCheckConfig: Record<string, StaticCheckLanguageConfig>,
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
