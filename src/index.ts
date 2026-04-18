/**
 * @file
 * @brief Registers the pi-usereq extension commands, tools, and configuration UI.
 * @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.
 */

/**
 * @brief Declares the extension version string.
 * @details The value is exported for external inspection and packaging metadata alignment. Access complexity is O(1).
 */
export const VERSION = "0.0.0"

import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ToolInfo } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  buildTokenToolPayload,
  TOKEN_COUNTER_ENCODING,
  type TokenToolPayload,
} from "./core/token-counter.js";
import {
  buildDocsCheckToolPayload,
  buildGitCheckToolPayload,
  buildPathQueryToolPayload,
  buildStaticCheckToolPayload,
  buildStructuredToolExecuteResult,
  buildToolExecutionSection,
  buildWorktreeMutationToolPayload,
  buildWorktreeNameToolPayload,
  normalizeToolFailure,
} from "./core/agent-tool-json.js";
import {
  buildReferenceToolExecutionStderr,
  buildReferenceToolPayload,
  type ReferenceToolPayload,
} from "./core/reference-payload.js";
import {
  buildCompressToolExecutionStderr,
  buildCompressToolPayload,
  type CompressToolPayload,
} from "./core/compress-payload.js";
import {
  buildFindToolExecutionStderr,
  buildFindToolPayload,
  type FindToolPayload,
  type FindToolScope,
} from "./core/find-payload.js";
import {
  getDefaultConfig,
  loadConfig,
  saveConfig,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./core/config.js";
import { buildRuntimePathContext, buildRuntimePathFacts } from "./core/path-context.js";
import {
  PI_USEREQ_STARTUP_TOOL_SET,
  isPiUsereqEmbeddedToolName,
  normalizeEnabledPiUsereqTools,
} from "./core/pi-usereq-tools.js";
import { renderPrompt } from "./core/prompts.js";
import { ensureBundledResourcesAccessible } from "./core/resources.js";
import {
  collectSourceFiles,
  runFilesStaticCheck,
  runGetBasePath,
  runGitCheck,
  runGitPath,
  runGitWtCreate,
  isInsideGitRepo,
  resolveGitRoot,
  runGitWtDelete,
  runGitWtName,
  runProjectStaticCheck,
} from "./core/tool-runner.js";
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
  STATIC_CHECK_MODULES,
  getSupportedStaticCheckLanguageSupport,
  parseEnableStaticCheck,
} from "./core/static-check.js";
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";

/**
 * @brief Lists bundled prompt commands exposed by the extension.
 * @details Each entry maps to a `req-<name>` command that renders a bundled prompt and sends it to the active session. Access complexity is O(1).
 */
const PROMPT_NAMES = [
  "analyze",
  "change",
  "check",
  "cover",
  "create",
  "fix",
  "flowchart",
  "implement",
  "new",
  "readme",
  "recreate",
  "refactor",
  "references",
  "renumber",
  "workflow",
  "write",
] as const;


/**
 * @brief Resolves the effective project base from a working directory.
 * @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
 * @param[in] cwd {string} Current working directory.
 * @return {string} Absolute project base path.
 */
function getProjectBase(cwd: string): string {
  return path.resolve(cwd);
}

/**
 * @brief Builds the shared runtime path facts for the current command or tool context.
 * @details Derives installation, execution, base, config, resource, docs, test, source, and optional git paths from the cwd-derived project configuration and converts them into prompt/tool-facing strings. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
 * @param[in] cwd {string} Current working directory.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {import("./core/path-context.js").RuntimePathFacts} Shared runtime path facts.
 */
function buildSharedRuntimePathFacts(cwd: string, config: UseReqConfig): import("./core/path-context.js").RuntimePathFacts {
  return buildRuntimePathFacts(buildRuntimePathContext(getProjectBase(cwd), config, { gitPath: config["git-path"] }));
}

/**
 * @brief Loads project configuration and refreshes derived path metadata for the extension runtime.
 * @details Resolves the project base, loads persisted config, updates `base-path`, refreshes `git-path` when the project is inside a repository, and removes stale git metadata otherwise. Runtime is dominated by config I/O and git detection. Side effects are limited to filesystem reads and git subprocess execution.
 * @param[in] cwd {string} Current working directory.
 * @return {UseReqConfig} Effective project configuration.
 */
function loadProjectConfig(cwd: string): UseReqConfig {
  const projectBase = getProjectBase(cwd);
  const config = loadConfig(projectBase);
  config["base-path"] = projectBase;
  if (isInsideGitRepo(projectBase)) {
    config["git-path"] = resolveGitRoot(projectBase);
  } else {
    delete config["git-path"];
  }
  return config;
}

/**
 * @brief Persists project configuration from the extension runtime.
 * @details Recomputes `base-path` from the current working directory and delegates persistence to `saveConfig`. Runtime is O(n) in config size. Side effects include config-file writes.
 * @param[in] cwd {string} Current working directory.
 * @param[in] config {UseReqConfig} Configuration to persist.
 * @return {void} No return value.
 */
function saveProjectConfig(cwd: string, config: UseReqConfig): void {
  const projectBase = getProjectBase(cwd);
  config["base-path"] = projectBase;
  saveConfig(projectBase, config);
}

/**
 * @brief Collects the project-scoped static-check selection used by the agent tool.
 * @details Resolves configured source plus test directories, reuses the same fixture-root exclusions as `runProjectStaticCheck`, and returns canonical relative file paths for structured payload emission. Runtime is O(F) plus project file-discovery cost. Side effects are limited to filesystem reads and git subprocesses delegated through `collectSourceFiles`.
 * @param[in] projectBase {string} Resolved project base path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {{ selectionDirectoryPaths: string[]; excludedDirectoryPaths: string[]; selectedPaths: string[] }} Structured static-check selection facts.
 */
function collectProjectStaticCheckSelection(
  projectBase: string,
  config: UseReqConfig,
): {
  selectionDirectoryPaths: string[];
  excludedDirectoryPaths: string[];
  selectedPaths: string[];
} {
  const selectionDirectoryPaths = [...config["src-dir"], config["tests-dir"]];
  const testsDirRel = makeRelativeIfContainsProject(config["tests-dir"], projectBase)
    .split(path.sep)
    .join("/")
    .replace(/^\.?\/?/, "")
    .replace(/\/+$/, "");
  const excludedDirectoryPaths = [...new Set([
    "tests/fixtures",
    testsDirRel ? `${testsDirRel}/fixtures` : "fixtures",
  ])];
  const selectedPaths = collectSourceFiles(selectionDirectoryPaths, projectBase)
    .filter((filePath) => {
      const relativePath = path.relative(projectBase, filePath).split(path.sep).join("/");
      return !excludedDirectoryPaths.some((excludedDirectoryPath) => {
        return relativePath === excludedDirectoryPath || relativePath.startsWith(`${excludedDirectoryPath}/`);
      });
    })
    .map((filePath) => path.relative(projectBase, filePath).split(path.sep).join("/"));
  return {
    selectionDirectoryPaths,
    excludedDirectoryPaths,
    selectedPaths,
  };
}

/**
 * @brief Builds execution diagnostics for one token-tool payload.
 * @details Serializes skipped-input and read-error observations into stable stderr lines while leaving successful counted files silent. Runtime is O(n) in issue count. No side effects occur.
 * @param[in] payload {TokenToolPayload} Structured token payload.
 * @return {string} Newline-delimited execution diagnostics.
 */
function buildTokenToolExecutionStderr(payload: TokenToolPayload): string {
  const skippedLines = payload.guidance.source_observations.skipped_inputs
    .map((entry) => `skipped: ${entry.canonical_path}: ${entry.reason}`);
  const errorLines = payload.guidance.source_observations.error_inputs
    .map((entry) => `error: ${entry.canonical_path}: ${entry.reason}`);
  return [...skippedLines, ...errorLines].join("\n");
}

/**
 * @brief Builds the agent-oriented execute result returned by token-count tools.
 * @details Mirrors the structured token payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {TokenToolPayload} Structured token payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: TokenToolPayload & { execution: { code: number; stderr: string } } }} Token-tool execute result.
 * @satisfies REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075, REQ-099, REQ-102
 */
function buildTokenToolExecuteResult(
  payload: TokenToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: TokenToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    request: payload.request,
    summary: payload.summary,
    files: payload.files,
    guidance: payload.guidance,
    execution: {
      code: payload.summary.counted_file_count > 0 ? 0 : 1,
      stderr: buildTokenToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Builds the agent-oriented execute result returned by references tools.
 * @details Mirrors the structured references payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {ReferenceToolPayload} Structured references payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: ReferenceToolPayload & { execution: { code: number; stderr: string } } }} References-tool execute result.
 * @satisfies REQ-076, REQ-077, REQ-078, REQ-079, REQ-099, REQ-102
 */
function buildReferenceToolExecuteResult(
  payload: ReferenceToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: ReferenceToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    request: payload.request,
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.analyzed_file_count > 0 ? 0 : 1,
      stderr: buildReferenceToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Builds the agent-oriented execute result returned by compression tools.
 * @details Mirrors the structured compression payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {CompressToolPayload} Structured compression payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: CompressToolPayload & { execution: { code: number; stderr: string } } }} Compression-tool execute result.
 * @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087, REQ-088, REQ-099, REQ-102
 */
function buildCompressionToolExecuteResult(
  payload: CompressToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: CompressToolPayload & { execution: { code: number; stderr: string } };
} {
  const details = {
    request: payload.request,
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.compressed_file_count > 0 ? 0 : 1,
      stderr: buildCompressToolExecutionStderr(payload),
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Maps find-payload language identifiers to stable registration labels.
 * @details Preserves the canonical capitalization used by tool descriptions so supported-tag guidance remains deterministic across inspection snapshots. Access complexity is O(1).
 */
const FIND_TOOL_LANGUAGE_LABELS: Record<string, string> = {
  c: "C",
  cpp: "Cpp",
  csharp: "Csharp",
  elixir: "Elixir",
  go: "Go",
  haskell: "Haskell",
  java: "Java",
  javascript: "Javascript",
  kotlin: "Kotlin",
  lua: "Lua",
  perl: "Perl",
  php: "Php",
  python: "Python",
  ruby: "Ruby",
  rust: "Rust",
  scala: "Scala",
  shell: "Shell",
  swift: "Swift",
  typescript: "Typescript",
  zig: "Zig",
};

/**
 * @brief Defines the stable language order used by find-tool supported-tag guidance.
 * @details Keeps registration descriptions aligned with the repository-supported language matrix and preserves deterministic inspection snapshots. Access complexity is O(1).
 */
const FIND_TOOL_LANGUAGE_ORDER = [
  "c",
  "cpp",
  "csharp",
  "elixir",
  "go",
  "haskell",
  "java",
  "javascript",
  "kotlin",
  "lua",
  "perl",
  "php",
  "python",
  "ruby",
  "rust",
  "scala",
  "shell",
  "swift",
  "typescript",
  "zig",
] as const;

/**
 * @brief Builds the supported-tag guidance lines embedded in find-tool registrations.
 * @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
 * @return {string[]} Supported-tag guidance lines.
 */
function buildFindToolSupportedTagGuidelines(): string[] {
  return FIND_TOOL_LANGUAGE_ORDER
    .filter((language) => language in LANGUAGE_TAGS)
    .map((language) => `Supported tags [${FIND_TOOL_LANGUAGE_LABELS[language]}]: ${[...LANGUAGE_TAGS[language]!].sort().join(", ")}`);
}

/**
 * @brief Builds the schema description for one find-tool registration.
 * @details Specializes the input-scope sentence for explicit-file or configured-directory searches while keeping the JSON output contract stable and fully machine-readable. Runtime is O(1). No side effects occur.
 * @param[in] scope {FindToolScope} Find-tool scope.
 * @return {string} Parameter-schema description.
 */
function buildFindToolSchemaDescription(scope: FindToolScope): string {
  const inputContract = scope === "explicit-files"
    ? "Input contract: tag + pattern + files[] + optional enableLineNumbers."
    : "Input contract: tag + pattern + optional enableLineNumbers. Scope is the configured src-dir list resolved from the current project configuration.";
  return `${inputContract} Output contract: JSON object with request, summary, repository, files, and execution. Repository exposes file_canonical_paths and supported_tags_by_language. File entries expose path facts, supported_tags, structured statuses, file_doxygen, and match records with typed line ranges, stripped code lines, and structured Doxygen fields. Regex matches construct names only.`;
}

/**
 * @brief Builds the prompt-guideline set for one find-tool registration.
 * @details Encodes scope selection, output schema, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
 * @param[in] scope {FindToolScope} Find-tool scope.
 * @return {string[]} Prompt-guideline strings.
 */
function buildFindToolPromptGuidelines(scope: FindToolScope): string[] {
  const scopeLine = scope === "explicit-files"
    ? "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute."
    : "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.";
  const outputLine = scope === "explicit-files"
    ? "Output contract: request + summary + repository + files + execution. Repository exposes requested file scope and supported_tags_by_language; file entries expose status, supported_tags, line ranges, file_doxygen, and matches; match entries expose symbol_kind, signature_text, line ranges, code_lines, stripped_source_text, and structured Doxygen fields."
    : "Output contract: request + summary + repository + files + execution. Repository exposes source_directory_paths, file_canonical_paths, and supported_tags_by_language; file entries expose status, supported_tags, line ranges, file_doxygen, and matches; match entries expose symbol_kind, signature_text, line ranges, code_lines, stripped_source_text, and structured Doxygen fields.";
  return [
    scopeLine,
    outputLine,
    "Regex rule: pattern is applied to construct names only with JavaScript RegExp search semantics; it never matches construct bodies; use ^...$ for exact-name matching.",
    "Tag rule: tag is pipe-separated and case-insensitive; unsupported tags are ignored; if no valid tag remains, request.tag_filter_status becomes invalid.",
    "Line-number behavior: enableLineNumbers changes only display_text and stripped_source_text rendering; numeric source_line_number and line_range facts remain dedicated fields.",
    "Failure contract: invalid tag filters, invalid regex patterns, unsupported extensions, unsupported tag-language combinations, no-match files, and analysis failures are surfaced as structured statuses plus optional execution.stderr diagnostics.",
    ...buildFindToolSupportedTagGuidelines(),
  ];
}

/**
 * @brief Builds the agent-oriented execute result returned by find tools.
 * @details Mirrors the structured find payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {FindToolPayload} Structured find payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: FindToolPayload & { execution: { code: number; stderr: string } } }} Find-tool execute result.
 * @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-097, REQ-098, REQ-099, REQ-102
 */
function buildFindToolExecuteResult(
  payload: FindToolPayload,
): {
  content: Array<{ type: "text"; text: string }>;
  details: FindToolPayload & { execution: { code: number; stderr: string } };
} {
  const stderr = buildFindToolExecutionStderr(payload);
  const details = {
    request: payload.request,
    summary: payload.summary,
    repository: payload.repository,
    files: payload.files,
    execution: {
      code: payload.summary.search_status === "matched" ? 0 : 1,
      stderr,
    },
  };
  return buildStructuredToolExecuteResult(details);
}

/**
 * @brief Delivers one rendered prompt according to the configured reset policy.
 * @details When `reset-context` is `true`, waits for idle, creates a `/new`-equivalent session, and only after a successful reset sends the rendered prompt through `pi.sendUserMessage(...)` so prompt delivery uses the same user-message path that triggers the agent turn in the fresh session. When `reset-context` is `false`, sends the prompt into the current session without clearing prior context. Runtime is dominated by session replacement or prompt dispatch. Side effects include session replacement and user-message persistence.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] content {string} Rendered prompt markdown.
 * @return {Promise<void>} Promise resolved after the prompt is queued for delivery.
 * @satisfies REQ-004, REQ-067, REQ-068
 */
async function deliverPromptCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig, content: string): Promise<void> {
  if (!config["reset-context"]) {
    pi.sendUserMessage(content);
    return;
  }

  await ctx.waitForIdle();
  const newSessionResult = await ctx.newSession();
  if (newSessionResult.cancelled) {
    return;
  }
  pi.sendUserMessage(content);
}

/**
 * @brief Returns the configurable active-tool inventory visible to the extension.
 * @details Filters runtime tools against the canonical configurable-tool set, thereby combining extension-owned tools with supported embedded pi CLI tools. Output order is sorted by tool name. Runtime is O(t log t). No external state is mutated.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {ToolInfo[]} Sorted configurable tool descriptors.
 * @satisfies REQ-007, REQ-063
 */
function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[] {
  return pi.getAllTools()
    .filter((tool) => PI_USEREQ_STARTUP_TOOL_SET.has(tool.name))
    .filter((tool) => !isPiUsereqEmbeddedToolName(tool.name) || tool.sourceInfo?.source === "builtin")
    .sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * @brief Normalizes and returns the configured enabled active tools.
 * @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {string[]} Normalized enabled tool names.
 */
function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[] {
  const enabledTools = normalizeEnabledPiUsereqTools(config["enabled-tools"]);
  config["enabled-tools"] = [...enabledTools];
  return enabledTools;
}

/**
 * @brief Describes the theme subset required by pi-usereq status rendering.
 * @details Restricts status formatting to foreground-color application so runtime contexts, offline replays, and tests can satisfy the same structural contract without depending on the full UI theme API. Compile-time only and introduces no runtime cost.
 */
interface StatusTheme {
  fg: (color: "accent" | "warning" | "dim", text: string) => string;
}

/**
 * @brief Formats one status-bar field as colored name-plus-value text.
 * @details Renders the field name with the accent color and the value with the warning color while keeping the separator outside both fragments. Runtime is O(n) in combined text length. No external state is mutated.
 * @param[in] theme {StatusTheme} Theme adapter providing foreground coloring.
 * @param[in] fieldName {string} Field label emitted before the colon.
 * @param[in] value {string} Field value emitted after the colon.
 * @return {string} Colored field fragment.
 * @satisfies REQ-112
 */
function formatPiUsereqStatusField(theme: StatusTheme, fieldName: string, value: string): string {
  return `${theme.fg("accent", `${fieldName}:`)}${theme.fg("warning", value)}`;
}

/**
 * @brief Builds the multi-line pi-usereq status-bar payload.
 * @details Renders configured docs, tests, and source paths on the first line, enabled tool names on the second line, and the `reset-context` state on the third line. Empty tool selections render as `none`. Runtime is O(s + t) in configured source-path and tool counts. No external state is mutated.
 * @param[in] theme {StatusTheme} Theme adapter providing foreground coloring.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] enabledTools {string[]} Normalized enabled tool names.
 * @return {string} Multi-line status-bar text.
 * @satisfies REQ-009, REQ-109, REQ-110, REQ-111, REQ-112
 */
function formatPiUsereqStatus(theme: StatusTheme, config: UseReqConfig, enabledTools: string[]): string {
  const separator = theme.fg("dim", " • ");
  const sourcePaths = config["src-dir"].join(",");
  const toolsValue = enabledTools.length > 0 ? enabledTools.join(",") : "none";
  const resetContextValue = config["reset-context"] ? "enabled" : "disabled";
  const firstLine = [
    formatPiUsereqStatusField(theme, "docs", config["docs-dir"]),
    formatPiUsereqStatusField(theme, "tests", config["tests-dir"]),
    formatPiUsereqStatusField(theme, "src", sourcePaths),
  ].join(separator);
  const secondLine = formatPiUsereqStatusField(theme, "tools", toolsValue);
  const thirdLine = formatPiUsereqStatusField(theme, "reset-context", resetContextValue);
  return [firstLine, secondLine, thirdLine].join("\n");
}

/**
 * @brief Classifies one configurable tool as embedded or extension-owned.
 * @details Uses the runtime `sourceInfo.source` field plus the supported embedded-name subset to produce one stable UI label. Runtime is O(1). No external state is mutated.
 * @param[in] tool {ToolInfo} Runtime tool descriptor.
 * @return {"builtin" | "extension"} Stable tool-kind label.
 */
function getPiUsereqToolKind(tool: ToolInfo): "builtin" | "extension" {
  if (tool.sourceInfo?.source === "builtin" && isPiUsereqEmbeddedToolName(tool.name)) {
    return "builtin";
  }
  return "extension";
}

/**
 * @brief Applies the configured active-tool enablement to the current session.
 * @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {void} No return value.
 * @satisfies REQ-009, REQ-064
 */
function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void {
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const allTools = pi.getAllTools();
  const configurableTools = getPiUsereqStartupTools(pi);
  const allToolNames = new Set(allTools.map((tool) => tool.name));
  const nextActive = new Set(pi.getActiveTools().filter((toolName) => allToolNames.has(toolName)));

  for (const tool of configurableTools) {
    nextActive.delete(tool.name);
  }
  for (const tool of configurableTools) {
    if (enabledTools.has(tool.name)) {
      nextActive.add(tool.name);
    }
  }

  pi.setActiveTools(allTools.map((tool) => tool.name).filter((toolName) => nextActive.has(toolName)));
}

/**
 * @brief Replaces the configured active-tool selection and applies it immediately.
 * @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @param[in] enabledTools {string[]} Requested enabled tool names.
 * @return {void} No return value.
 */
function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void {
  config["enabled-tools"] = normalizeEnabledPiUsereqTools(enabledTools);
  applyConfiguredPiUsereqTools(pi, config);
}

/**
 * @brief Formats one configurable-tool label for selection menus.
 * @details Prefixes the tool name with a checkmark or cross and appends a stable builtin-versus-extension marker derived from runtime metadata. Runtime is O(1). No side effects occur.
 * @param[in] tool {ToolInfo} Tool descriptor.
 * @param[in] enabled {boolean} Enablement state.
 * @return {string} Menu label.
 */
function formatPiUsereqToolLabel(tool: ToolInfo, enabled: boolean): string {
  const marker = enabled ? "✓" : "✗";
  return `${marker} ${tool.name} [${getPiUsereqToolKind(tool)}]`;
}

/**
 * @brief Renders a textual reference for configurable-tool configuration and runtime state.
 * @details Lists every configurable tool with configured enablement, runtime activation, builtin-versus-extension classification, source metadata, and optional descriptions. Runtime is O(t). No side effects occur.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Multiline tool-status report.
 */
function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string {
  const tools = getPiUsereqStartupTools(pi);
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const activeTools = new Set(pi.getActiveTools());
  const lines = [
    "# configurable active tools",
    "",
    `Configured enabled tools: ${enabledTools.size}/${tools.length}`,
    `Currently active tools: ${tools.filter((tool) => activeTools.has(tool.name)).length}/${tools.length}`,
    "",
    "Tools:",
  ];

  for (const tool of tools) {
    const configured = enabledTools.has(tool.name) ? "enabled" : "disabled";
    const active = activeTools.has(tool.name) ? "active" : "inactive";
    const source = tool.sourceInfo ? `${tool.sourceInfo.source}:${tool.sourceInfo.path}` : "unknown";
    lines.push(`- ${tool.name}`);
    lines.push(`  kind: ${getPiUsereqToolKind(tool)}`);
    lines.push(`  configured: ${configured}`);
    lines.push(`  runtime: ${active}`);
    lines.push(`  source: ${source}`);
    if (tool.description) {
      lines.push(`  description: ${tool.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}


/**
 * @brief Registers bundled prompt commands with the extension.
 * @details Creates one `req-<prompt>` command per bundled prompt name. Each handler ensures resources exist, renders the prompt, and dispatches it either into a `/new`-equivalent reset session or the current session based on `reset-context`. Runtime is O(p) for registration; handler cost depends on prompt rendering plus optional session replacement. Side effects include command registration, session replacement, and message dispatch during execution.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies REQ-004, REQ-067, REQ-068
 */
function registerPromptCommands(pi: ExtensionAPI): void {
  PROMPT_NAMES.forEach((promptName) => {
    pi.registerCommand(`req-${promptName}`, {
      description: `Run pi-usereq prompt ${promptName}`,
      handler: async (args, ctx) => {
        ensureBundledResourcesAccessible();
        const projectBase = getProjectBase(ctx.cwd);
        const config = loadProjectConfig(ctx.cwd);
        const content = renderPrompt(promptName, args, projectBase, config);
        await deliverPromptCommand(pi, ctx, config, content);
      },
    });
  });
}


/**
 * @brief Registers pi-usereq agent tools exposed to the model.
 * @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-045, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102
 */
function registerAgentTools(pi: ExtensionAPI): void {
  const gitPathSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with request, result, and execution. Result exposes path_key, path_value, and path_present for the cwd-derived configured git root.",
    },
  );
  pi.registerTool({
    name: "git-path",
    label: "git-path",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes the resolved `git-path` value through direct-access fields instead of text-only output.",
    promptSnippet: "Return the structured configured git-root payload for the current project.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived project configuration.",
      "Output contract: request + result + execution. Result exposes path_key, path_value, and path_present.",
      "Configuration contract: loadProjectConfig recomputes git-path from the current working directory when the project is inside a repository.",
      "Failure contract: configuration-loading failures surface through execution.code and execution.stderr_lines.",
    ],
    parameters: gitPathSchema,
    async execute() {
      ensureBundledResourcesAccessible();
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      const result = runGitPath(projectBase, config);
      const payload = buildPathQueryToolPayload(
        "git-path",
        process.cwd(),
        projectBase,
        result.stdout.trimEnd(),
        runtimePaths,
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const basePathSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with request, result, and execution. Result exposes path_key, path_value, and path_present for the cwd-derived configured project base path.",
    },
  );
  pi.registerTool({
    name: "get-base-path",
    label: "get-base-path",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes the resolved `base-path` value through direct-access fields instead of text-only output.",
    promptSnippet: "Return the structured configured project-base payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived project configuration.",
      "Output contract: request + result + execution. Result exposes path_key, path_value, and path_present.",
      "Configuration contract: loadProjectConfig refreshes base-path from the current working directory before the payload is emitted.",
      "Failure contract: configuration-loading failures surface through execution.code and execution.stderr_lines.",
    ],
    parameters: basePathSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      const result = runGetBasePath(projectBase, config);
      const payload = buildPathQueryToolPayload(
        "get-base-path",
        process.cwd(),
        projectBase,
        result.stdout.trimEnd(),
        runtimePaths,
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const filesReferencesSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with request, summary, repository, files, and execution. File entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and structured status facts. Missing or unsupported inputs become skipped entries. The tool fails when no source file can be analyzed.",
    },
  );
  const multiFileSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with request, summary, files, and execution. File entries expose canonical paths, detected language, configured checker modules, selection status, and error facts.",
    },
  );
  const filesTokensSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute file path resolved from the current working directory when not already absolute" }),
        { description: "Input file list preserved in caller order" },
      ),
    },
    {
      description: "Input contract: files[]. Output contract: JSON object with request, summary, files, guidance, and execution. File entries expose path identifiers, access facts, line ranges, sizes, token metrics, and optional heading or Doxygen metadata. Missing or non-file inputs become skipped entries. The tool fails when no processable files remain.",
    },
  );

  pi.registerTool({
    name: "files-tokens",
    label: "files-tokens",
    description: "Scope: explicit files. Return an LLM-oriented JSON payload with request, summary, files, guidance, and execution sections. File entries expose direct-access path facts, status, line ranges, sizes, token metrics, and optional heading or Doxygen metadata.",
    promptSnippet: "Return the structured token-analysis payload for caller-selected files.",
    promptGuidelines: [
      "Scope: explicit files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: request + summary + files + guidance + execution. File entries expose canonical paths, absolute paths, existence, file status, line range, line count, byte count, character count, token count, shares, and optional primary-heading or Doxygen file metadata.",
      "Numeric contract: counts, sizes, shares, and line ranges remain in dedicated numeric fields; descriptive text is limited to stable reasons and guidance labels.",
      "Behavior contract: missing or non-file inputs become skipped entries; read failures become error entries; the tool fails only when no processable files remain.",
    ],
    parameters: filesTokensSchema,
    async execute(_toolCallId, params) {
      const payload = buildTokenToolPayload({
        toolName: "files-tokens",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
        encodingName: TOKEN_COUNTER_ENCODING,
      });
      return buildTokenToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-references",
    label: "files-references",
    description: "Scope: explicit source files. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. File entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and structured status facts.",
    promptSnippet: "Return the structured references payload for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: request + summary + repository + files + execution. File entries expose canonical paths, absolute paths, file status, line counts, line ranges, imports, symbols, child relationships, standalone comments, and structured Doxygen metadata.",
      "Numeric contract: line counts, line ranges, symbol counts, import counts, comment counts, and Doxygen counts remain in dedicated numeric fields; text is limited to residual comment or signature content that cannot be split safely.",
      "Behavior contract: missing inputs, non-file inputs, and unsupported extensions become structured skipped entries; analysis failures become structured error entries; the tool fails only when no source file can be analyzed.",
    ],
    parameters: filesReferencesSchema,
    async execute(_toolCallId, params) {
      const payload = buildReferenceToolPayload({
        toolName: "files-references",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
      });
      return buildReferenceToolExecuteResult(payload);
    },
  });

  const filesCompressSchema = Type.Object(
    {
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `compressed_source_text` and `compressed_lines[].display_text` include original source line-number prefixes" })),
    },
    {
      description: "Input contract: files[] plus optional enableLineNumbers. Output contract: JSON object with request, summary, repository, files, and execution. File entries expose path identifiers, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts. Missing, unsupported, or invalid inputs become structured skipped entries. The tool fails when no file is compressed.",
    },
  );

  pi.registerTool({
    name: "files-compress",
    label: "files-compress",
    description: "Scope: explicit files. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. File entries expose canonical paths, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts.",
    promptSnippet: "Return the structured compression payload for caller-selected source files.",
    promptGuidelines: [
      "Scope: explicit source files selected by files[]; caller order is preserved; each item may be project-relative or absolute.",
      "Output contract: request + summary + repository + files + execution. File entries expose canonical paths, absolute paths, line_number_mode, source line counts, source line ranges, compressed line counts, removed line counts, compressed_lines, compressed_source_text, symbols, and file_doxygen.",
      "Line-number behavior: enableLineNumbers changes only rendered display strings; numeric source_line_number facts remain dedicated fields on compressed_lines for direct access.",
      "Behavior contract: missing inputs, non-file inputs, and unsupported extensions become structured skipped entries; compression failures become structured error entries; symbol-analysis failures retain compressed output with symbol_analysis_status=error; the tool fails only when no file is compressed.",
    ],
    parameters: filesCompressSchema,
    async execute(_toolCallId, params) {
      const payload = buildCompressToolPayload({
        toolName: "files-compress",
        scope: "explicit-files",
        baseDir: process.cwd(),
        requestedPaths: params.files,
        includeLineNumbers: params.enableLineNumbers ?? false,
      });
      return buildCompressionToolExecuteResult(payload);
    },
  });

  const filesFindSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      files: Type.Array(
        Type.String({ description: "Project-relative or absolute source file path resolved from the current working directory when not already absolute" }),
        { description: "Explicit source-file list preserved in caller order" },
      ),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `code_lines[].display_text` and `stripped_source_text` include original source line-number prefixes" })),
    },
    {
      description: buildFindToolSchemaDescription("explicit-files"),
    },
  );

  pi.registerTool({
    name: "files-find",
    label: "files-find",
    description: "Scope: explicit source files. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. File entries expose structured statuses and match records with typed location, symbol, stripped-code, and Doxygen facts.",
    promptSnippet: "Return the structured construct-search payload for caller-selected source files.",
    promptGuidelines: buildFindToolPromptGuidelines("explicit-files"),
    parameters: filesFindSchema,
    async execute(_toolCallId, params) {
      const payload = buildFindToolPayload({
        toolName: "files-find",
        scope: "explicit-files",
        baseDir: process.cwd(),
        tagFilter: params.tag,
        pattern: params.pattern,
        requestedPaths: params.files,
        includeLineNumbers: params.enableLineNumbers ?? false,
      });
      return buildFindToolExecuteResult(payload);
    },
  });

  const referencesSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir list resolved from the current project configuration. Output contract: JSON object with request, summary, repository, files, and execution. Repository exposes the structured directory tree; file entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, and status facts. The tool fails when no configured source file can be analyzed.",
    },
  );
  const tokensSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured docs-dir plus canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md. Output contract: same structured JSON shape as files-tokens, plus docs_dir_path and canonical_doc_names in request. Missing canonical docs become skipped entries. The tool fails when no processable canonical docs remain.",
    },
  );

  pi.registerTool({
    name: "references",
    label: "references",
    description: "Scope: configured project source directories. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. The repository section exposes the structured directory tree; file entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, standalone comments, and status facts.",
    promptSnippet: "Return the structured project references payload from the configured source directories.",
    promptGuidelines: [
      "Scope: no params; resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: request + summary + repository + files + execution. Repository exposes source_directory_paths, file_canonical_paths, and directory_tree; file entries expose canonical paths, line counts, line ranges, imports, symbols, hierarchy, standalone comments, and structured Doxygen metadata.",
      "Configuration contract: output changes with cwd-derived project config, src-dir values, and repository source discovery; the tool does not accept explicit file overrides.",
      "Behavior contract: configured source files are analyzed in deterministic order, analysis failures become structured error entries, and the tool fails when no configured source file can be analyzed.",
    ],
    parameters: referencesSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const payload = buildReferenceToolPayload({
        toolName: "references",
        scope: "configured-source-directories",
        baseDir: projectBase,
        requestedPaths: collectSourceFiles(config["src-dir"], projectBase),
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildReferenceToolExecuteResult(payload);
    },
  });

  const compressSchema = Type.Object(
    {
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `compressed_source_text` and `compressed_lines[].display_text` include original source line-number prefixes" })),
    },
    {
      description: "Input contract: optional enableLineNumbers boolean. Scope is the configured src-dir list resolved from the current project configuration. Output contract: JSON object with request, summary, repository, files, and execution. File entries expose path identifiers, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts. The tool fails when no configured source file is compressed.",
    },
  );

  pi.registerTool({
    name: "compress",
    label: "compress",
    description: "Scope: configured project source directories. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. File entries expose canonical paths, source and compressed line metrics, structured compressed lines, symbols, structured Doxygen fields, and stable status facts.",
    promptSnippet: "Return the structured project compression payload from the configured source directories.",
    promptGuidelines: [
      "Scope: resolve src-dir from the current project configuration and scan the configured source surface from the current working directory.",
      "Output contract: request + summary + repository + files + execution. Repository exposes source_directory_paths and file_canonical_paths; file entries expose line_number_mode, source line counts, source line ranges, compressed line counts, removed line counts, compressed_lines, compressed_source_text, symbols, and file_doxygen.",
      "Configuration contract: output changes with cwd-derived project config, src-dir values, and repository source discovery; the tool does not accept explicit file overrides.",
      "Behavior contract: configured source files are processed in deterministic order, compression failures become structured error entries, symbol-analysis failures retain compressed output with symbol_analysis_status=error, and the tool fails only when no configured source file is compressed.",
    ],
    parameters: compressSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const sourceFiles = collectSourceFiles(config["src-dir"], projectBase);
      const payload = buildCompressToolPayload({
        toolName: "compress",
        scope: "configured-source-directories",
        baseDir: projectBase,
        requestedPaths: sourceFiles,
        includeLineNumbers: params.enableLineNumbers ?? false,
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildCompressionToolExecuteResult(payload);
    },
  });

  const findSchema = Type.Object(
    {
      tag: Type.String({ description: "Pipe-separated construct-tag filter applied case-insensitively; unsupported tags are ignored" }),
      pattern: Type.String({ description: "JavaScript RegExp applied to construct names only; use ^...$ for exact-name matching" }),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "When true, `code_lines[].display_text` and `stripped_source_text` include original source line-number prefixes" })),
    },
    {
      description: buildFindToolSchemaDescription("configured-source-directories"),
    },
  );

  pi.registerTool({
    name: "find",
    label: "find",
    description: "Scope: configured project source directories. Return an LLM-oriented JSON payload with request, summary, repository, files, and execution sections. File entries expose structured statuses and match records with typed location, symbol, stripped-code, and Doxygen facts.",
    promptSnippet: "Return the structured construct-search payload from the configured source directories.",
    promptGuidelines: buildFindToolPromptGuidelines("configured-source-directories"),
    parameters: findSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const sourceFiles = collectSourceFiles(config["src-dir"], projectBase);
      const payload = buildFindToolPayload({
        toolName: "find",
        scope: "configured-source-directories",
        baseDir: projectBase,
        tagFilter: params.tag,
        pattern: params.pattern,
        requestedPaths: sourceFiles,
        includeLineNumbers: params.enableLineNumbers ?? false,
        sourceDirectoryPaths: config["src-dir"],
      });
      return buildFindToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "tokens",
    label: "tokens",
    description: "Scope: canonical docs from the configured docs-dir. Return the same LLM-oriented JSON contract as files-tokens, plus canonical-doc selection metadata in request for REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
    promptSnippet: "Return the structured token-analysis payload for canonical documentation files.",
    promptGuidelines: [
      "Scope: no params; resolve docs-dir from project config; target canonical docs REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
      "Output contract: request + summary + files + guidance + execution. Request includes docs_dir_path and canonical_doc_names; file entries expose direct-access path facts, line ranges, sizes, token metrics, and optional metadata.",
      "Numeric contract: counts, sizes, shares, and line ranges remain in dedicated numeric fields; guidance separates source observations, derived recommendations, and actionable next-step hints.",
      "Behavior contract: missing canonical docs become skipped entries; read failures become error entries; the tool fails only when no processable canonical docs remain.",
    ],
    parameters: tokensSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
      const canonicalDocNames = ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"];
      const payload = buildTokenToolPayload({
        toolName: "tokens",
        scope: "canonical-docs",
        baseDir: projectBase,
        requestedPaths: canonicalDocNames.map((name) => path.join(docsDir, name)),
        docsDir,
        canonicalDocNames,
        encodingName: TOKEN_COUNTER_ENCODING,
      });
      return buildTokenToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-static-check",
    label: "files-static-check",
    description: "Scope: explicit files. Return a JSON-first payload with request, summary, files, and execution sections. File entries expose canonical paths, detected language, configured checker modules, selection status, and stable error facts.",
    promptSnippet: "Return the structured explicit-file static-check payload for the current project configuration.",
    promptGuidelines: [
      "Input contract: files[]. Scope is explicit caller-selected files resolved from the current working directory.",
      "Output contract: request + summary + files + execution. File entries expose canonical_path, language_name, configured_checker_modules, status, and error_message.",
      "Configuration contract: checker selection is derived from the cwd-resolved static-check configuration and file extensions only.",
      "Failure contract: execution.code mirrors aggregated checker failures; execution.stdout_lines and execution.stderr_lines preserve residual checker diagnostics.",
    ],
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      const staticCheckConfig = config["static-check"] ?? {};
      const result = runFilesStaticCheck(params.files, projectBase, config);
      const payload = buildStaticCheckToolPayload(
        "files-static-check",
        "explicit-files",
        projectBase,
        params.files,
        [],
        [],
        staticCheckConfig,
        runtimePaths,
        buildToolExecutionSection(result),
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const staticCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir plus tests-dir selection after fixture exclusion. Output contract: JSON object with request, summary, files, and execution.",
    },
  );
  pi.registerTool({
    name: "static-check",
    label: "static-check",
    description: "Scope: configured source and test directories. Return a JSON-first payload with request, summary, files, and execution sections. File entries expose selected-path facts, checker coverage, selection status, and residual diagnostics metadata.",
    promptSnippet: "Return the structured project static-check payload for the current configuration.",
    promptGuidelines: [
      "Input contract: no params. Scope is src-dir plus tests-dir from the cwd-derived project configuration.",
      "Output contract: request + summary + files + execution. Request exposes selection_directory_paths and excluded_directory_paths; file entries expose configured_checker_modules and status.",
      "Selection contract: tests/fixtures and <tests-dir>/fixtures are excluded before checker dispatch.",
      "Failure contract: execution.code mirrors aggregated checker failures or selection failures; execution.stderr_lines preserve residual diagnostics.",
    ],
    parameters: staticCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      const staticCheckConfig = config["static-check"] ?? {};
      const selectionDirectoryPaths = [...config["src-dir"], config["tests-dir"]];
      const testsDirRel = makeRelativeIfContainsProject(config["tests-dir"], projectBase)
        .split(path.sep)
        .join("/")
        .replace(/^\.?\/?/, "")
        .replace(/\/+$/, "");
      const excludedDirectoryPaths = [...new Set([
        "tests/fixtures",
        testsDirRel ? `${testsDirRel}/fixtures` : "fixtures",
      ])];
      let selectedPaths: string[] = [];
      let execution;
      try {
        selectedPaths = collectProjectStaticCheckSelection(projectBase, config).selectedPaths;
        execution = buildToolExecutionSection(runProjectStaticCheck(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildStaticCheckToolPayload(
        "static-check",
        "configured-source-and-test-directories",
        projectBase,
        selectedPaths,
        selectionDirectoryPaths,
        excludedDirectoryPaths,
        staticCheckConfig,
        runtimePaths,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with request, result, and execution. Result exposes git-root presence plus clean-versus-error repository status fields.",
    },
  );
  pi.registerTool({
    name: "git-check",
    label: "git-check",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes repository validation status through direct fields instead of empty-success text.",
    promptSnippet: "Return the structured git-validation payload for the configured repository.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived project configuration.",
      "Output contract: request + result + execution. Result exposes git_path_present, status, worktree_status, and head_status.",
      "Behavior contract: the tool checks work-tree membership, porcelain cleanliness, and symbolic-or-detached HEAD validity.",
      "Failure contract: execution.code and execution.stderr_lines surface git-path or repository-state errors.",
    ],
    parameters: gitCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      let execution;
      try {
        execution = buildToolExecutionSection(runGitCheck(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildGitCheckToolPayload(projectBase, config["git-path"], runtimePaths, execution);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const docsCheckSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with request, summary, files, and execution. File entries expose canonical paths, prompt_command remediation, and presence status for canonical docs.",
    },
  );
  pi.registerTool({
    name: "docs-check",
    label: "docs-check",
    description: "Scope: canonical docs. Return a JSON-first payload with request, summary, files, and execution sections. File entries expose remediation prompt commands and direct presence facts for REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
    promptSnippet: "Return the structured canonical-document validation payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is docs-dir from the cwd-derived project configuration.",
      "Output contract: request + summary + files + execution. File entries expose file_name, canonical_path, prompt_command, and status.",
      "Specialization trigger: remediation differs per missing canonical file through prompt_command.",
      "Failure contract: execution.code is non-zero when any canonical document is missing; execution.stderr_lines enumerate missing files.",
    ],
    parameters: docsCheckSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      const payload = buildDocsCheckToolPayload(projectBase, config["docs-dir"], runtimePaths);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtNameSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Output contract: JSON object with request, result, and execution. Result exposes worktree_name and the normative useReq naming format string.",
    },
  );
  pi.registerTool({
    name: "git-wt-name",
    label: "git-wt-name",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes the generated worktree name plus its normative format as direct fields.",
    promptSnippet: "Return the structured worktree-name generation payload.",
    promptGuidelines: [
      "Input contract: no params. Scope is the cwd-derived project configuration.",
      "Output contract: request + result + execution. Result exposes worktree_name and format_text.",
      "Behavior contract: generation follows useReq-<project>-<sanitized-branch>-<YYYYMMDDHHMMSS>.",
      "Failure contract: execution.code and execution.stderr_lines surface git-path or branch-resolution errors.",
    ],
    parameters: gitWtNameSchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtName(projectBase, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeNameToolPayload(projectBase, config["git-path"], runtimePaths, execution);
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtCreateSchema = Type.Object(
    {
      wtName: Type.String({ description: "Exact target worktree name and branch name" }),
    },
    {
      description: "Input contract: wtName. Output contract: JSON object with request, result, and execution. Result exposes operation, worktree_name, branch_name, derived worktree_path, and status.",
    },
  );
  pi.registerTool({
    name: "git-wt-create",
    label: "git-wt-create",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes the requested create operation, exact worktree name, derived path, and mutation status.",
    promptSnippet: "Return the structured worktree-creation payload for the requested name.",
    promptGuidelines: [
      "Input contract: wtName is required and must match the exact worktree/branch name to create.",
      "Output contract: request + result + execution. Result exposes operation=create, worktree_name, branch_name, worktree_path, and status.",
      "Specialization trigger: worktree_path depends on the configured git root parent directory.",
      "Failure contract: execution.code and execution.stderr_lines surface invalid-name, git, or finalization errors.",
    ],
    parameters: gitWtCreateSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtCreate(projectBase, params.wtName, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeMutationToolPayload(
        "git-wt-create",
        projectBase,
        config["git-path"],
        params.wtName,
        runtimePaths,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });

  const gitWtDeleteSchema = Type.Object(
    {
      wtName: Type.String({ description: "Exact target worktree name and branch name" }),
    },
    {
      description: "Input contract: wtName. Output contract: JSON object with request, result, and execution. Result exposes operation, worktree_name, branch_name, derived worktree_path, and status.",
    },
  );
  pi.registerTool({
    name: "git-wt-delete",
    label: "git-wt-delete",
    description: "Scope: current project config. Return a JSON-first payload with request, result, and execution sections. Result exposes the requested delete operation, exact worktree name, derived path, and mutation status.",
    promptSnippet: "Return the structured worktree-deletion payload for the requested name.",
    promptGuidelines: [
      "Input contract: wtName is required and must match the exact worktree/branch name to delete.",
      "Output contract: request + result + execution. Result exposes operation=delete, worktree_name, branch_name, worktree_path, and status.",
      "Specialization trigger: worktree_path depends on the configured git root parent directory.",
      "Failure contract: execution.code and execution.stderr_lines surface missing-target or deletion errors.",
    ],
    parameters: gitWtDeleteSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const runtimePaths = buildSharedRuntimePathFacts(process.cwd(), config);
      let execution;
      try {
        execution = buildToolExecutionSection(runGitWtDelete(projectBase, params.wtName, config));
      } catch (error) {
        execution = buildToolExecutionSection(normalizeToolFailure(error));
      }
      const payload = buildWorktreeMutationToolPayload(
        "git-wt-delete",
        projectBase,
        config["git-path"],
        params.wtName,
        runtimePaths,
        execution,
      );
      return buildStructuredToolExecuteResult(payload);
    },
  });
}

/**
 * @brief Runs the interactive active-tool configuration menu.
 * @details Synchronizes runtime active tools with persisted config, renders overview and mutation actions, and updates configuration state in response to UI selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 * @satisfies REQ-007, REQ-063, REQ-064
 */
async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void> {
  applyConfiguredPiUsereqTools(pi, config);
  while (true) {
    const tools = getPiUsereqStartupTools(pi);
    const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
    const choice = await ctx.ui.select("Active tools", [
      `Overview: ${enabledTools.size}/${tools.length} enabled`,
      "Show tool status",
      "Toggle tool",
      "Enable all configurable tools",
      "Disable all configurable tools",
      "Reset configurable-tool defaults",
      "Back",
    ]);

    if (!choice || choice === "Back") {
      return;
    }

    if (choice === "Show tool status" || choice.startsWith("Overview:")) {
      ctx.ui.setEditorText(renderPiUsereqToolsReference(pi, config));
      continue;
    }

    if (choice === "Enable all configurable tools") {
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name));
      ctx.ui.notify("Enabled all configurable active tools", "info");
      continue;
    }

    if (choice === "Disable all configurable tools") {
      setConfiguredPiUsereqTools(pi, config, []);
      ctx.ui.notify("Disabled all configurable active tools", "info");
      continue;
    }

    if (choice === "Reset configurable-tool defaults") {
      setConfiguredPiUsereqTools(pi, config, normalizeEnabledPiUsereqTools(undefined));
      ctx.ui.notify("Restored default configurable active tools", "info");
      continue;
    }

    if (choice === "Toggle tool") {
      const toolLabels = tools.map((tool) => formatPiUsereqToolLabel(tool, enabledTools.has(tool.name)));
      const selectedToolLabel = await ctx.ui.select("Toggle active tool", [...toolLabels, "Back"]);
      if (!selectedToolLabel || selectedToolLabel === "Back") {
        continue;
      }
      const selectedTool = tools.find((tool) => formatPiUsereqToolLabel(tool, enabledTools.has(tool.name)) === selectedToolLabel);
      if (!selectedTool) {
        continue;
      }
      if (enabledTools.has(selectedTool.name)) {
        enabledTools.delete(selectedTool.name);
      } else {
        enabledTools.add(selectedTool.name);
      }
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name).filter((toolName) => enabledTools.has(toolName)));
      ctx.ui.notify(
        `${enabledTools.has(selectedTool.name) ? "Enabled" : "Disabled"} ${selectedTool.name}`,
        "info",
      );
    }
  }
}

/**
 * @brief Formats one static-check configuration entry for UI display.
 * @details Renders command-backed entries as `Command(cmd args...)` and all other modules as `Module(args...)`. Runtime is O(n) in parameter count. No side effects occur.
 * @param[in] entry {StaticCheckEntry} Static-check configuration entry.
 * @return {string} Human-readable entry summary.
 */
function formatStaticCheckEntry(entry: StaticCheckEntry): string {
  const params = Array.isArray(entry.params) && entry.params.length > 0 ? ` ${entry.params.join(" ")}` : "";
  if (entry.module === "Command") {
    return `${entry.module}(${entry.cmd ?? "?"}${params})`;
  }
  return `${entry.module}${params ? `(${entry.params!.join(" ")})` : ""}`;
}

/**
 * @brief Summarizes configured static-check languages.
 * @details Keeps only languages with at least one configured checker, sorts them, and emits a compact `Language (count)` list. Runtime is O(l log l). No side effects occur.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Compact summary string or `(none)`.
 */
function formatStaticCheckLanguagesSummary(config: UseReqConfig): string {
  const languages = Object.entries(config["static-check"])
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, entries]) => `${language} (${entries.length})`);
  return languages.join(", ") || "(none)";
}

/**
 * @brief Builds one static-check language selection label.
 * @details Includes the language name, supported extensions, and the number of configured checkers with singular/plural handling. Runtime is O(n) in extension count. No side effects occur.
 * @param[in] language {string} Canonical language name.
 * @param[in] extensions {string[]} Supported file extensions.
 * @param[in] configuredCount {number} Number of configured checkers for the language.
 * @return {string} Menu label.
 */
function buildStaticCheckLanguageLabel(language: string, extensions: string[], configuredCount: number): string {
  const suffix = configuredCount === 1 ? "checker" : "checkers";
  return `${language} [${extensions.join(", ")}] (${configuredCount} ${suffix})`;
}

/**
 * @brief Renders the static-check configuration reference view.
 * @details Produces a markdown-like summary containing configured entries, supported languages, supported modules, and example specifications. Runtime is O(l log l). No side effects occur.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Reference text for the editor view.
 */
function renderStaticCheckReference(config: UseReqConfig): string {
  const lines = ["# Static-check configuration", "", `Configured languages: ${formatStaticCheckLanguagesSummary(config)}`, ""];
  const configuredLanguages = Object.entries(config["static-check"])
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  if (configuredLanguages.length === 0) {
    lines.push("Configured entries: (none)");
  } else {
    lines.push("Configured entries:");
    for (const [language, entries] of configuredLanguages) {
      lines.push(`- ${language}: ${(entries as StaticCheckEntry[]).map(formatStaticCheckEntry).join(", ")}`);
    }
  }

  lines.push("", "Supported languages:");
  for (const { language, extensions } of getSupportedStaticCheckLanguageSupport()) {
    lines.push(`- ${language}: ${extensions.join(", ")}`);
  }
  lines.push("", `Supported modules: ${STATIC_CHECK_MODULES.join(", ")}`, "", "Examples:", "- Python=Ruff", "- Python=Command,mypy,--strict", "- TypeScript=Command,eslint,--max-warnings,0");
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Runs the interactive static-check configuration menu.
 * @details Lets the user inspect support, add entries by guided prompts or raw spec strings, and remove configured language entries until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in,out] config {UseReqConfig} Mutable configuration object.
 * @return {Promise<void>} Promise resolved when the menu closes.
 */
async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void> {
  while (true) {
    const staticChoice = await ctx.ui.select("static-check", [
      `Configured languages: ${formatStaticCheckLanguagesSummary(config)}`,
      "Add entry for supported language",
      "Add entry from LANG=MODULE[,CMD[,PARAM...]]",
      "Remove language entry",
      "Show supported languages",
      "Back",
    ]);

    if (!staticChoice || staticChoice === "Back") {
      return;
    }

    if (staticChoice === "Show supported languages" || staticChoice.startsWith("Configured languages:")) {
      ctx.ui.setEditorText(renderStaticCheckReference(config));
      continue;
    }

    if (staticChoice === "Add entry for supported language") {
      const languageOptions = getSupportedStaticCheckLanguageSupport();
      const languageLabels = languageOptions.map(({ language, extensions }) =>
        buildStaticCheckLanguageLabel(language, extensions, config["static-check"][language]?.length ?? 0),
      );
      const selectedLanguageLabel = await ctx.ui.select("Static-check language", [...languageLabels, "Back"]);
      if (!selectedLanguageLabel || selectedLanguageLabel === "Back") {
        continue;
      }
      const selectedLanguage = languageOptions.find(({ language, extensions }) =>
        buildStaticCheckLanguageLabel(language, extensions, config["static-check"][language]?.length ?? 0) === selectedLanguageLabel,
      );
      if (!selectedLanguage) {
        continue;
      }

      const moduleName = await ctx.ui.select(`Static-check for ${selectedLanguage.language}`, [...STATIC_CHECK_MODULES, "Back"]);
      if (!moduleName || moduleName === "Back") {
        continue;
      }

      const entry: StaticCheckEntry = { module: moduleName };
      if (moduleName === "Command") {
        const cmd = await ctx.ui.input(`Command executable for ${selectedLanguage.language}`, "");
        if (!cmd?.trim()) {
          ctx.ui.notify(`Command executable is required for ${selectedLanguage.language}`, "error");
          continue;
        }
        entry.cmd = cmd.trim();
      }

      const paramsInput = await ctx.ui.input(
        `Additional parameters for ${moduleName} on ${selectedLanguage.language} (optional, shell-style)`,
        "",
      );
      const params = paramsInput?.trim() ? shellSplit(paramsInput.trim()) : [];
      if (params.length > 0) {
        entry.params = params;
      }

      config["static-check"][selectedLanguage.language] ??= [];
      config["static-check"][selectedLanguage.language]!.push(entry);
      ctx.ui.notify(`Added ${moduleName} checker for ${selectedLanguage.language}`, "info");
      continue;
    }

    if (staticChoice === "Add entry from LANG=MODULE[,CMD[,PARAM...]]") {
      const spec = await ctx.ui.input("Static-check spec", "Python=Ruff");
      if (!spec?.trim()) {
        continue;
      }
      try {
        const [canonicalLang, entry] = parseEnableStaticCheck(spec.trim());
        config["static-check"][canonicalLang] ??= [];
        config["static-check"][canonicalLang]!.push(entry);
        ctx.ui.notify(`Added ${entry.module} checker for ${canonicalLang}`, "info");
      } catch (error) {
        ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
      }
      continue;
    }

    if (staticChoice === "Remove language entry") {
      const configuredLanguages = getSupportedStaticCheckLanguageSupport().filter(
        ({ language }) => (config["static-check"][language] ?? []).length > 0,
      );
      if (configuredLanguages.length === 0) {
        ctx.ui.notify("No static-check languages configured", "info");
        continue;
      }
      const languageLabels = configuredLanguages.map(({ language, extensions }) =>
        buildStaticCheckLanguageLabel(language, extensions, config["static-check"][language]!.length),
      );
      const selectedLanguageLabel = await ctx.ui.select("Remove static-check language", [...languageLabels, "Back"]);
      if (!selectedLanguageLabel || selectedLanguageLabel === "Back") {
        continue;
      }
      const selectedLanguage = configuredLanguages.find(({ language, extensions }) =>
        buildStaticCheckLanguageLabel(language, extensions, config["static-check"][language]!.length) === selectedLanguageLabel,
      );
      if (!selectedLanguage) {
        continue;
      }
      delete config["static-check"][selectedLanguage.language];
      ctx.ui.notify(`Removed static-check entries for ${selectedLanguage.language}`, "info");
    }
  }
}

/**
 * @brief Runs the top-level pi-usereq configuration menu.
 * @details Loads project config, exposes docs/test/source/reset/static-check/active-tool configuration actions, persists changes on exit, and refreshes the multi-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, and active-tool changes.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
 * @satisfies REQ-006, REQ-066, REQ-109, REQ-110, REQ-111, REQ-112
 */
async function configurePiUsereq(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  let config = loadProjectConfig(ctx.cwd);
  const projectBase = getProjectBase(ctx.cwd);
  const ensureSaved = () => saveProjectConfig(ctx.cwd, config);
  const refreshStatus = () => {
    const enabledTools = getConfiguredEnabledPiUsereqTools(config);
    ctx.ui.setStatus("pi-usereq", formatPiUsereqStatus(ctx.ui.theme, config, enabledTools));
  };

  while (true) {
    const choice = await ctx.ui.select("pi-usereq", [
      `Overview: docs=${config["docs-dir"]}, tests=${config["tests-dir"]}, src=${config["src-dir"].join(", ")}, reset-context=${config["reset-context"]}, tools=${getConfiguredEnabledPiUsereqTools(config).length}`,
      "Set docs-dir",
      "Set tests-dir",
      "Manage src-dir",
      `Toggle reset-context (${config["reset-context"]})`,
      "Manage static-check",
      "Manage active tools",
      "Reset defaults",
      "Save and close",
    ]);
    if (!choice || choice === "Save and close") {
      ensureSaved();
      refreshStatus();
      return;
    }
    if (choice === "Set docs-dir") {
      const value = await ctx.ui.input("docs-dir", config["docs-dir"]);
      if (value?.trim()) config["docs-dir"] = value.trim();
      continue;
    }
    if (choice === "Set tests-dir") {
      const value = await ctx.ui.input("tests-dir", config["tests-dir"]);
      if (value?.trim()) config["tests-dir"] = value.trim();
      continue;
    }
    if (choice === "Manage src-dir") {
      const srcAction = await ctx.ui.select("src-dir", [
        `Current: ${config["src-dir"].join(", ")}`,
        "Add src-dir entry",
        "Remove src-dir entry",
        "Back",
      ]);
      if (srcAction === "Add src-dir entry") {
        const value = await ctx.ui.input("New src-dir entry", "src");
        if (value?.trim()) config["src-dir"] = [...config["src-dir"], value.trim()];
      } else if (srcAction === "Remove src-dir entry") {
        const toRemove = await ctx.ui.select("Remove src-dir entry", [...config["src-dir"], "Back"]);
        if (toRemove && toRemove !== "Back") {
          config["src-dir"] = config["src-dir"].filter((entry) => entry !== toRemove);
          if (config["src-dir"].length === 0) config["src-dir"] = ["src"];
        }
      }
      continue;
    }
    if (choice.startsWith("Toggle reset-context")) {
      config["reset-context"] = !config["reset-context"];
      continue;
    }
    if (choice === "Manage static-check") {
      await configureStaticCheckMenu(ctx, config);
      continue;
    }
    if (choice === "Manage active tools") {
      await configurePiUsereqToolsMenu(pi, ctx, config);
      continue;
    }
    if (choice === "Reset defaults") {
      config = getDefaultConfig(projectBase);
      config["static-check"] = {};
      applyConfiguredPiUsereqTools(pi, config);
      continue;
    }
  }
}

/**
 * @brief Registers configuration-management commands.
 * @details Adds commands for opening the interactive configuration menu and showing the current config JSON in the editor. Runtime is O(1) for registration. Side effects include command registration.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 */
function registerConfigCommands(pi: ExtensionAPI): void {
  pi.registerCommand("pi-usereq", {
    description: "Open the pi-usereq configuration menu",
    handler: async (_args, ctx) => {
      await configurePiUsereq(pi, ctx);
    },
  });

  pi.registerCommand("pi-usereq-show-config", {
    description: "Show the current pi-usereq project configuration",
    handler: async (_args, ctx) => {
      const config = loadProjectConfig(ctx.cwd);
      ctx.ui.setEditorText(`${JSON.stringify(config, null, 2)}\n`);
    },
  });
}

/**
 * @brief Registers the complete pi-usereq extension.
 * @details Validates installation-owned bundled resources, registers prompt and configuration commands plus agent tools, and installs a `session_start` hook that refreshes runtime path context, applies configured active tools, and updates the multi-line status bar. Runtime is O(1) for registration; session-start behavior depends on config loading. Side effects include filesystem reads, command/tool registration, UI updates, active-tool changes, and prompt-command session replacement.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045, REQ-067, REQ-068, REQ-109, REQ-110, REQ-111, REQ-112
 */
export default function piUsereqExtension(pi: ExtensionAPI): void {
  ensureBundledResourcesAccessible();
  registerPromptCommands(pi);
  registerAgentTools(pi);
  registerConfigCommands(pi);
  pi.on("session_start", async (_event, ctx) => {
    ensureBundledResourcesAccessible();
    const config = loadProjectConfig(ctx.cwd);
    applyConfiguredPiUsereqTools(pi, config);
    const enabledTools = getConfiguredEnabledPiUsereqTools(config);
    ctx.ui.setStatus("pi-usereq", formatPiUsereqStatus(ctx.ui.theme, config, enabledTools));
  });
}
