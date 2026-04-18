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
  getDefaultConfig,
  loadConfig,
  saveConfig,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./core/config.js";
import {
  PI_USEREQ_STARTUP_TOOL_SET,
  isPiUsereqEmbeddedToolName,
  normalizeEnabledPiUsereqTools,
} from "./core/pi-usereq-tools.js";
import { renderPrompt } from "./core/prompts.js";
import { ensureHomeResources } from "./core/resources.js";
import {
  collectSourceFiles,
  runCompress,
  runDocsCheck,
  runFilesCompress,
  runFilesFind,
  runFilesReferences,
  runFilesStaticCheck,
  runFilesTokens,
  runFind,
  runGetBasePath,
  runGitCheck,
  runGitPath,
  runGitWtCreate,
  isInsideGitRepo,
  resolveGitRoot,
  runGitWtDelete,
  runGitWtName,
  runProjectStaticCheck,
  runReferences,
  runTokens,
  type ToolResult,
} from "./core/tool-runner.js";
import {
  STATIC_CHECK_MODULES,
  getSupportedStaticCheckLanguageSupport,
  parseEnableStaticCheck,
} from "./core/static-check.js";
import { shellSplit } from "./core/utils.js";

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
 * @brief Formats a tool result for editor display.
 * @details Trims trailing whitespace on stdout and stderr independently, then joins non-empty sections with a blank line. Runtime is O(n) in emitted text size. No side effects occur.
 * @param[in] result {ToolResult} Tool result payload.
 * @return {string} Editor-ready textual representation.
 */
function formatResultForEditor(result: ToolResult): string {
  const parts: string[] = [];
  if (result.stdout) parts.push(result.stdout.trimEnd());
  if (result.stderr) parts.push(result.stderr.trimEnd());
  return parts.join(parts.length > 1 ? "\n\n" : "");
}

/**
 * @brief Serializes one structured payload as pretty-printed JSON text.
 * @details Uses two-space indentation and omits a trailing newline so tool `content` payloads remain compact while preserving deterministic field order. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {unknown} Structured JSON-compatible payload.
 * @return {string} Pretty-printed JSON string.
 */
function formatJsonToolPayload(payload: unknown): string {
  return JSON.stringify(payload, null, 2);
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
 * @satisfies REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075
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
      code: 0,
      stderr: buildTokenToolExecutionStderr(payload),
    },
  };
  return {
    content: [{ type: "text", text: formatJsonToolPayload(details) }],
    details,
  };
}

/**
 * @brief Builds the agent-oriented execute result returned by references tools.
 * @details Mirrors the structured references payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {ReferenceToolPayload} Structured references payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: ReferenceToolPayload & { execution: { code: number; stderr: string } } }} References-tool execute result.
 * @satisfies REQ-076, REQ-077, REQ-078, REQ-079
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
      code: 0,
      stderr: buildReferenceToolExecutionStderr(payload),
    },
  };
  return {
    content: [{ type: "text", text: formatJsonToolPayload(details) }],
    details,
  };
}

/**
 * @brief Builds the agent-oriented execute result returned by compression tools.
 * @details Mirrors the structured compression payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] payload {CompressToolPayload} Structured compression payload.
 * @return {{ content: Array<{ type: "text"; text: string }>; details: CompressToolPayload & { execution: { code: number; stderr: string } } }} Compression-tool execute result.
 * @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087, REQ-088
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
      code: 0,
      stderr: buildCompressToolExecutionStderr(payload),
    },
  };
  return {
    content: [{ type: "text", text: formatJsonToolPayload(details) }],
    details,
  };
}

/**
 * @brief Builds the first user-message payload for a reset prompt session.
 * @details Creates the timestamped session entry appended during `ctx.newSession(...)` so `req-*` commands seed the cleared session with the rendered prompt content. Runtime is O(n) in prompt length. No external state is mutated.
 * @param[in] content {string} Rendered prompt markdown.
 * @return {{ role: "user"; content: Array<{ type: "text"; text: string }>; timestamp: number }} Session-manager user message payload.
 * @satisfies REQ-067
 */
function buildPromptSessionMessage(content: string): {
  role: "user";
  content: Array<{ type: "text"; text: string }>;
  timestamp: number;
} {
  return {
    role: "user",
    content: [{ type: "text", text: content }],
    timestamp: Date.now(),
  };
}

/**
 * @brief Delivers one rendered prompt according to the configured reset policy.
 * @details When `reset-context` is `true`, waits for idle and uses `ctx.newSession(...)` to create a `/new`-equivalent session seeded with the rendered prompt as the first user message. When `reset-context` is `false`, sends the prompt into the current session without clearing prior context. Runtime is dominated by session replacement or prompt dispatch. Side effects include session replacement or message dispatch.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] content {string} Rendered prompt markdown.
 * @return {Promise<void>} Promise resolved after the prompt is queued for delivery.
 * @satisfies REQ-067, REQ-068
 */
async function deliverPromptCommand(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig, content: string): Promise<void> {
  if (!config["reset-context"]) {
    pi.sendUserMessage(content);
    return;
  }

  await ctx.waitForIdle();
  await ctx.newSession({
    setup: async (sessionManager) => {
      sessionManager.appendMessage(buildPromptSessionMessage(content));
    },
  });
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
        ensureHomeResources();
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
 * @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-045, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080
 */
function registerAgentTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "git-path",
    label: "git-path",
    description: "Print the configured git root path from .pi/pi-usereq/config.json.",
    promptSnippet: "Read the configured git repository root for the current project.",
    promptGuidelines: ["Use this when you need the project git root path for worktree or validation workflows."],
    parameters: Type.Object({}),
    async execute() {
      ensureHomeResources();
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitPath(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  pi.registerTool({
    name: "get-base-path",
    label: "get-base-path",
    description: "Print the configured base project path from .pi/pi-usereq/config.json.",
    promptSnippet: "Read the configured project base path.",
    promptGuidelines: ["Use this when a workflow must refer to the original project root path."],
    parameters: Type.Object({}),
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGetBasePath(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
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
  const multiFileSchema = Type.Object({ files: Type.Array(Type.String({ description: "Project or absolute file path" })) });
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
      if (payload.summary.processable_file_count === 0) {
        runFilesTokens(params.files);
      }
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
      if (payload.summary.processable_file_count === 0 || payload.summary.analyzed_file_count === 0) {
        runFilesReferences(params.files, process.cwd());
      }
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
      if (payload.summary.compressed_file_count === 0) {
        runFilesCompress(params.files, process.cwd(), params.enableLineNumbers ?? false);
      }
      return buildCompressionToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-find",
    label: "files-find",
    description: "Find named constructs in explicit files using a tag filter and regex pattern.",
    promptSnippet: "Extract named constructs from explicit files.",
    promptGuidelines: ["Use this for targeted code extraction when you already know which files to inspect."],
    parameters: Type.Object({
      tag: Type.String({ description: "Pipe-separated tag filter" }),
      pattern: Type.String({ description: "Regular expression applied to construct names" }),
      files: Type.Array(Type.String({ description: "Project or absolute file path" })),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "Include original line numbers" })),
    }),
    async execute(_toolCallId, params) {
      const result = runFilesFind([params.tag, params.pattern, ...params.files], params.enableLineNumbers ?? false);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  const referencesSchema = Type.Object(
    {},
    {
      description: "Input contract: no params. Scope is the configured src-dir list resolved from the current project configuration. Output contract: JSON object with request, summary, repository, files, and execution. Repository exposes the structured directory tree; file entries expose canonical paths, numeric line ranges, imports, symbols, structured Doxygen fields, and status facts. The tool fails when no configured source file can be analyzed.",
    },
  );
  const emptySchema = Type.Object({});
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
      if (payload.summary.analyzed_file_count === 0) {
        runReferences(projectBase, config);
      }
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
      if (payload.summary.compressed_file_count === 0) {
        runCompress(projectBase, config, params.enableLineNumbers ?? false);
      }
      return buildCompressionToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "find",
    label: "find",
    description: "Find named constructs in the configured project source directories.",
    promptSnippet: "Extract project constructs by tag and name regex.",
    promptGuidelines: ["Enable line numbers when the caller needs exact source locations."],
    parameters: Type.Object({
      tag: Type.String({ description: "Pipe-separated tag filter" }),
      pattern: Type.String({ description: "Regular expression applied to construct names" }),
      enableLineNumbers: Type.Optional(Type.Boolean({ description: "Include original line numbers" })),
    }),
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runFind(projectBase, params.tag, params.pattern, config, params.enableLineNumbers ?? false);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
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
      if (payload.summary.processable_file_count === 0) {
        runTokens(projectBase, config);
      }
      return buildTokenToolExecuteResult(payload);
    },
  });

  pi.registerTool({
    name: "files-static-check",
    label: "files-static-check",
    description: "Run configured static-check entries for explicit files.",
    promptSnippet: "Run static analysis for explicit files using pi-usereq configuration.",
    promptGuidelines: ["Use this for precise file-level verification before broader project scans."],
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runFilesStaticCheck(params.files, projectBase, config);
      return { content: [{ type: "text", text: formatResultForEditor(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "static-check",
    label: "static-check",
    description: "Run configured static-check entries for the configured source and test directories.",
    promptSnippet: "Run project-wide static analysis using pi-usereq configuration.",
    promptGuidelines: ["Use this after code changes when you need the same verification gate used by useReq workflows."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runProjectStaticCheck(projectBase, config);
      return { content: [{ type: "text", text: formatResultForEditor(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "git-check",
    label: "git-check",
    description: "Verify that the configured git repository has a clean work tree and a valid HEAD.",
    promptSnippet: "Verify clean git status for the configured repository.",
    promptGuidelines: ["Use this before workflows that require a clean repository state."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitCheck(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  pi.registerTool({
    name: "docs-check",
    label: "docs-check",
    description: "Verify that the configured docs directory contains REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md.",
    promptSnippet: "Verify the canonical project documentation files exist.",
    promptGuidelines: ["Use this before docs-maintenance workflows that require all canonical docs files."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runDocsCheck(projectBase, config);
      return { content: [{ type: "text", text: formatResultForEditor(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "git-wt-name",
    label: "git-wt-name",
    description: "Generate the standardized useReq worktree name for the configured repository.",
    promptSnippet: "Generate the standardized useReq worktree name.",
    promptGuidelines: ["Use this before creating a dedicated worktree for isolated workflows."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitWtName(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  pi.registerTool({
    name: "git-wt-create",
    label: "git-wt-create",
    description: "Create a dedicated git worktree and copy pi-usereq project configuration into it.",
    promptSnippet: "Create a dedicated worktree for isolated change workflows.",
    promptGuidelines: ["Use the exact worktree name returned by git-wt-name or a validated manual name."],
    parameters: Type.Object({ wtName: Type.String({ description: "Target worktree name" }) }),
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitWtCreate(projectBase, params.wtName, config);
      return { content: [{ type: "text", text: formatResultForEditor(result) }], details: result };
    },
  });

  pi.registerTool({
    name: "git-wt-delete",
    label: "git-wt-delete",
    description: "Delete a dedicated git worktree and its branch.",
    promptSnippet: "Delete an exact named worktree and branch.",
    promptGuidelines: ["Use this only with exact worktree names created for the current repository."],
    parameters: Type.Object({ wtName: Type.String({ description: "Target worktree name" }) }),
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runGitWtDelete(projectBase, params.wtName, config);
      return { content: [{ type: "text", text: formatResultForEditor(result) }], details: result };
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
 * @details Loads project config, exposes docs/test/source/reset/static-check/active-tool configuration actions, persists changes on exit, and refreshes the status line. Runtime depends on user interaction count. Side effects include UI updates, config writes, and active-tool changes.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] ctx {ExtensionCommandContext} Active command context.
 * @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
 * @satisfies REQ-006, REQ-066
 */
async function configurePiUsereq(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  let config = loadProjectConfig(ctx.cwd);
  const projectBase = getProjectBase(ctx.cwd);
  const ensureSaved = () => saveProjectConfig(ctx.cwd, config);
  const refreshStatus = () => {
    const enabledTools = getConfiguredEnabledPiUsereqTools(config);
    ctx.ui.setStatus(
      "pi-usereq",
      `docs:${config["docs-dir"]} • tests:${config["tests-dir"]} • src:${config["src-dir"].length} • tools:${enabledTools.length}`,
    );
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
 * @details Ensures bundled resources exist, registers prompt and configuration commands plus agent tools, and installs a `session_start` hook that applies configured active tools and updates the status line. Runtime is O(1) for registration; session-start behavior depends on config loading. Side effects include resource copying, command/tool registration, UI updates, active-tool changes, and prompt-command session replacement.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 * @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045, REQ-067, REQ-068
 */
export default function piUsereqExtension(pi: ExtensionAPI): void {
  ensureHomeResources();
  registerPromptCommands(pi);
  registerAgentTools(pi);
  registerConfigCommands(pi);
  pi.on("session_start", async (_event, ctx) => {
    ensureHomeResources();
    const config = loadProjectConfig(ctx.cwd);
    applyConfiguredPiUsereqTools(pi, config);
    ctx.ui.setStatus(
      "pi-usereq",
      `docs:${config["docs-dir"]} • tests:${config["tests-dir"]} • src:${config["src-dir"].length} • tools:${getConfiguredEnabledPiUsereqTools(config).length}`,
    );
  });
}
