export const VERSION = "0.0.0"

import path from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ToolInfo } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import {
  getDefaultConfig,
  loadConfig,
  saveConfig,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./core/config.js";
import {
  PI_USEREQ_STARTUP_TOOL_SET,
  normalizeEnabledPiUsereqTools,
} from "./core/pi-usereq-tools.js";
import { renderPrompt } from "./core/prompts.js";
import { ensureHomeResources } from "./core/resources.js";
import {
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
  runStaticCheck,
} from "./core/static-check.js";
import { shellSplit } from "./core/utils.js";

type CommandRunner = (projectBase: string, config: UseReqConfig, args: string[]) => ToolResult;

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

const TOOL_RUNNERS: Record<string, CommandRunner> = {
  "git-path": (projectBase, config) => runGitPath(projectBase, config),
  "get-base-path": (projectBase, config) => runGetBasePath(projectBase, config),
  "files-tokens": (_projectBase, _config, args) => runFilesTokens(args),
  "files-references": (_projectBase, _config, args) => runFilesReferences(args, process.cwd()),
  "files-compress": (_projectBase, _config, args) => runFilesCompress(args, process.cwd(), false),
  "files-find": (_projectBase, _config, args) => runFilesFind(args, false),
  references: (projectBase, config) => runReferences(projectBase, config),
  compress: (projectBase, config) => runCompress(projectBase, config, false),
  find: (projectBase, config, args) => runFind(projectBase, args[0] ?? "", args[1] ?? "", config, false),
  tokens: (projectBase, config) => runTokens(projectBase, config),
  "files-static-check": (projectBase, config, args) => runFilesStaticCheck(args, projectBase, config),
  "static-check": (projectBase, config) => runProjectStaticCheck(projectBase, config),
  "git-check": (projectBase, config) => runGitCheck(projectBase, config),
  "docs-check": (projectBase, config) => runDocsCheck(projectBase, config),
  "git-wt-name": (projectBase, config) => runGitWtName(projectBase, config),
  "git-wt-create": (projectBase, config, args) => runGitWtCreate(projectBase, args[0] ?? "", config),
  "git-wt-delete": (projectBase, config, args) => runGitWtDelete(projectBase, args[0] ?? "", config),
};

function getProjectBase(cwd: string): string {
  return path.resolve(cwd);
}

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

function saveProjectConfig(cwd: string, config: UseReqConfig): void {
  const projectBase = getProjectBase(cwd);
  config["base-path"] = projectBase;
  saveConfig(projectBase, config);
}

function formatResultForEditor(result: ToolResult): string {
  const parts: string[] = [];
  if (result.stdout) parts.push(result.stdout.trimEnd());
  if (result.stderr) parts.push(result.stderr.trimEnd());
  return parts.join(parts.length > 1 ? "\n\n" : "");
}

function showToolResult(ctx: ExtensionCommandContext, result: ToolResult, label: string): void {
  const content = formatResultForEditor(result);
  if (content) {
    ctx.ui.setEditorText(content);
  }
  if (result.code === 0) {
    ctx.ui.notify(`${label} completed`, "info");
  } else {
    ctx.ui.notify(`${label} failed`, "error");
  }
}

function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[] {
  return pi.getAllTools()
    .filter((tool) => PI_USEREQ_STARTUP_TOOL_SET.has(tool.name))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[] {
  const enabledTools = normalizeEnabledPiUsereqTools(config["enabled-tools"]);
  config["enabled-tools"] = [...enabledTools];
  return enabledTools;
}

function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void {
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const allTools = pi.getAllTools();
  const allToolNames = new Set(allTools.map((tool) => tool.name));
  const nextActive = new Set(pi.getActiveTools().filter((toolName) => allToolNames.has(toolName)));

  for (const toolName of PI_USEREQ_STARTUP_TOOL_SET) {
    nextActive.delete(toolName);
  }
  for (const tool of allTools) {
    if (PI_USEREQ_STARTUP_TOOL_SET.has(tool.name) && enabledTools.has(tool.name)) {
      nextActive.add(tool.name);
    }
  }

  pi.setActiveTools(allTools.map((tool) => tool.name).filter((toolName) => nextActive.has(toolName)));
}

function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void {
  config["enabled-tools"] = normalizeEnabledPiUsereqTools(enabledTools);
  applyConfiguredPiUsereqTools(pi, config);
}

function formatPiUsereqToolLabel(tool: ToolInfo, enabled: boolean): string {
  const marker = enabled ? "✓" : "✗";
  return `${marker} ${tool.name}`;
}

function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string {
  const tools = getPiUsereqStartupTools(pi);
  const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
  const activeTools = new Set(pi.getActiveTools());
  const lines = [
    "# pi-usereq startup tools",
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
    lines.push(`  configured: ${configured}`);
    lines.push(`  runtime: ${active}`);
    lines.push(`  source: ${source}`);
    if (tool.description) {
      lines.push(`  description: ${tool.description}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

async function runToolCommand(name: string, rawArgs: string, ctx: ExtensionCommandContext): Promise<void> {
  const runner = TOOL_RUNNERS[name];
  if (!runner) {
    ctx.ui.notify(`Unknown tool wrapper: ${name}`, "error");
    return;
  }
  const projectBase = getProjectBase(ctx.cwd);
  const config = loadProjectConfig(ctx.cwd);
  const args = shellSplit(rawArgs);
  const result = runner(projectBase, config, args);
  showToolResult(ctx, result, name);
}

function registerPromptCommands(pi: ExtensionAPI): void {
  PROMPT_NAMES.forEach((promptName) => {
    pi.registerCommand(`req-${promptName}`, {
      description: `Run pi-usereq prompt ${promptName}`,
      handler: async (args, ctx) => {
        ensureHomeResources();
        const projectBase = getProjectBase(ctx.cwd);
        const config = loadProjectConfig(ctx.cwd);
        const content = renderPrompt(promptName, args, projectBase, config);
        pi.sendUserMessage(content);
      },
    });
  });
}

function registerToolWrapperCommands(pi: ExtensionAPI): void {
  Object.keys(TOOL_RUNNERS).forEach((name) => {
    pi.registerCommand(name, {
      description: `Run pi-usereq tool ${name}`,
      handler: async (args, ctx) => {
        await runToolCommand(name, args, ctx);
      },
    });
  });

  pi.registerCommand("test-static-check", {
    description: "Run pi-usereq static-check test driver",
    handler: async (args, ctx) => {
      const argv = shellSplit(args);
      const result: ToolResult = { stdout: "", stderr: "", code: 0 };
      try {
        const previousWrite = process.stdout.write.bind(process.stdout);
        let captured = "";
        (process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array) => {
          captured += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
          return true;
        }) as unknown as typeof process.stdout.write;
        try {
          result.code = runStaticCheck(argv);
        } finally {
          process.stdout.write = previousWrite;
        }
        result.stdout = captured;
      } catch (error) {
        result.code = (error as { code?: number }).code ?? 1;
        result.stderr = error instanceof Error ? error.message : String(error);
      }
      showToolResult(ctx, result, "test-static-check");
    },
  });
}

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

  const multiFileSchema = Type.Object({ files: Type.Array(Type.String({ description: "Project or absolute file path" })) });

  pi.registerTool({
    name: "files-tokens",
    label: "files-tokens",
    description: "Count tokens and characters for explicit files.",
    promptSnippet: "Count token and character usage for selected files.",
    promptGuidelines: ["Use this for direct file lists when you need pack token counts before composing prompts."],
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const result = runFilesTokens(params.files);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  pi.registerTool({
    name: "files-references",
    label: "files-references",
    description: "Generate useReq references markdown for explicit files.",
    promptSnippet: "Generate references markdown for explicit files.",
    promptGuidelines: ["Use this when you already know the files to index instead of scanning the configured source directories."],
    parameters: multiFileSchema,
    async execute(_toolCallId, params) {
      const result = runFilesReferences(params.files, process.cwd());
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  const multiFileLineSchema = Type.Object({
    files: Type.Array(Type.String({ description: "Project or absolute file path" })),
    enableLineNumbers: Type.Optional(Type.Boolean({ description: "Include original line numbers" })),
  });

  pi.registerTool({
    name: "files-compress",
    label: "files-compress",
    description: "Compress explicit files by stripping comments and extra whitespace.",
    promptSnippet: "Compress explicit files into compact source excerpts.",
    promptGuidelines: ["Enable line numbers when the user needs precise evidence citations."],
    parameters: multiFileLineSchema,
    async execute(_toolCallId, params) {
      const result = runFilesCompress(params.files, process.cwd(), params.enableLineNumbers ?? false);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
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

  const emptySchema = Type.Object({});

  pi.registerTool({
    name: "references",
    label: "references",
    description: "Generate useReq references markdown for the configured project source directories.",
    promptSnippet: "Generate project references markdown from configured source directories.",
    promptGuidelines: ["Use this to refresh REFERENCES.md or inspect the whole configured project source surface."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runReferences(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
    },
  });

  pi.registerTool({
    name: "compress",
    label: "compress",
    description: "Compress source files from the configured project source directories.",
    promptSnippet: "Compress all configured project source files.",
    promptGuidelines: ["Use this when you need compact project-wide source snapshots."],
    parameters: Type.Object({ enableLineNumbers: Type.Optional(Type.Boolean({ description: "Include original line numbers" })) }),
    async execute(_toolCallId, params) {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runCompress(projectBase, config, params.enableLineNumbers ?? false);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
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
    description: "Count tokens and characters for REQUIREMENTS.md, WORKFLOW.md, and REFERENCES.md under the configured docs directory.",
    promptSnippet: "Count canonical documentation token usage.",
    promptGuidelines: ["Use this before large documentation prompts to estimate context size."],
    parameters: emptySchema,
    async execute() {
      const projectBase = getProjectBase(process.cwd());
      const config = loadProjectConfig(process.cwd());
      const result = runTokens(projectBase, config);
      return { content: [{ type: "text", text: result.stdout.trimEnd() }], details: result };
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

async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void> {
  applyConfiguredPiUsereqTools(pi, config);
  while (true) {
    const tools = getPiUsereqStartupTools(pi);
    const enabledTools = new Set(getConfiguredEnabledPiUsereqTools(config));
    const choice = await ctx.ui.select("pi-usereq tools", [
      `Overview: ${enabledTools.size}/${tools.length} enabled`,
      "Show tool status",
      "Toggle tool",
      "Enable all pi-usereq tools",
      "Disable all pi-usereq tools",
      "Reset pi-usereq tool defaults",
      "Back",
    ]);

    if (!choice || choice === "Back") {
      return;
    }

    if (choice === "Show tool status" || choice.startsWith("Overview:")) {
      ctx.ui.setEditorText(renderPiUsereqToolsReference(pi, config));
      continue;
    }

    if (choice === "Enable all pi-usereq tools") {
      setConfiguredPiUsereqTools(pi, config, tools.map((tool) => tool.name));
      ctx.ui.notify("Enabled all pi-usereq startup tools", "info");
      continue;
    }

    if (choice === "Disable all pi-usereq tools") {
      setConfiguredPiUsereqTools(pi, config, []);
      ctx.ui.notify("Disabled all pi-usereq startup tools", "info");
      continue;
    }

    if (choice === "Reset pi-usereq tool defaults") {
      setConfiguredPiUsereqTools(pi, config, normalizeEnabledPiUsereqTools(undefined));
      ctx.ui.notify("Restored default pi-usereq startup tools", "info");
      continue;
    }

    if (choice === "Toggle tool") {
      const toolLabels = tools.map((tool) => formatPiUsereqToolLabel(tool, enabledTools.has(tool.name)));
      const selectedToolLabel = await ctx.ui.select("Toggle pi-usereq tool", [...toolLabels, "Back"]);
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

function formatStaticCheckEntry(entry: StaticCheckEntry): string {
  const params = Array.isArray(entry.params) && entry.params.length > 0 ? ` ${entry.params.join(" ")}` : "";
  if (entry.module === "Command") {
    return `${entry.module}(${entry.cmd ?? "?"}${params})`;
  }
  return `${entry.module}${params ? `(${entry.params!.join(" ")})` : ""}`;
}

function formatStaticCheckLanguagesSummary(config: UseReqConfig): string {
  const languages = Object.entries(config["static-check"])
    .filter(([, entries]) => Array.isArray(entries) && entries.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([language, entries]) => `${language} (${entries.length})`);
  return languages.join(", ") || "(none)";
}

function buildStaticCheckLanguageLabel(language: string, extensions: string[], configuredCount: number): string {
  const suffix = configuredCount === 1 ? "checker" : "checkers";
  return `${language} [${extensions.join(", ")}] (${configuredCount} ${suffix})`;
}

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
      `Overview: docs=${config["docs-dir"]}, tests=${config["tests-dir"]}, src=${config["src-dir"].join(", ")}, tools=${getConfiguredEnabledPiUsereqTools(config).length}`,
      "Set docs-dir",
      "Set tests-dir",
      "Manage src-dir",
      "Manage static-check",
      "Manage startup tools",
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
    if (choice === "Manage static-check") {
      await configureStaticCheckMenu(ctx, config);
      continue;
    }
    if (choice === "Manage startup tools") {
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

export default function piUsereqExtension(pi: ExtensionAPI): void {
  ensureHomeResources();
  registerPromptCommands(pi);
  registerToolWrapperCommands(pi);
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
