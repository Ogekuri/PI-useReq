import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import piUsereqExtension from "../src/index.ts";
import {
  createStaticCheckLanguageConfig,
  DEFAULT_DOCS_DIR,
  getDefaultConfig,
  getProjectConfigPath,
  loadConfig,
} from "../src/core/config.js";
import {
  DEBUG_PROMPT_NAMES,
  DEFAULT_DEBUG_LOG_FILE,
  DEFAULT_DEBUG_LOG_ON_STATUS,
  DEFAULT_DEBUG_WORKFLOW_EVENTS,
} from "../src/core/debug-runtime.js";
import { PROMPT_COMMAND_NAMES } from "../src/core/prompt-command-catalog.js";
import {
  setJsTiktokenModuleLoaderForTests,
} from "../src/core/token-counter.js";
import {
  setPiNotifyHttpsRequestForTests,
  setPiNotifySpawnForTests,
} from "../src/core/pi-notify.js";
import {
  abortPromptCommandExecution,
  activatePromptCommandExecution,
  preparePromptCommandExecution,
  restorePromptCommandExecution,
  setPromptCommandPostCreateHookForTests,
} from "../src/core/prompt-command-runtime.js";
import {
  readPersistedPromptCommandSessionContext,
} from "../src/core/prompt-command-state.js";
import {
  comparePiUsereqStartupToolNames,
  PI_USEREQ_CUSTOM_TOOL_NAMES,
  PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
  PI_USEREQ_STARTUP_TOOL_NAMES,
} from "../src/core/pi-usereq-tools.js";
import {
  createPiUsereqStatusController,
  renderPiUsereqStatus,
  setPiUsereqStatusConfig,
  setPiUsereqWorkflowState,
} from "../src/core/extension-status.js";
import { showPiUsereqSettingsMenu } from "../src/core/settings-menu.js";
import { getSupportedStaticCheckLanguageSupport } from "../src/core/static-check.js";
import { createTempDir, initFixtureRepo } from "./helpers.js";

/**
 * @brief Describes one fake extension command registration captured during tests.
 * @details Mirrors the minimal command shape consumed by this suite so assertions can inspect descriptions and invoke handlers deterministically. The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredCommand = { description?: string; handler: (args: string, ctx: any) => Promise<void> | void };

/**
 * @brief Describes one fake extension tool registration captured during tests.
 * @details Mirrors the minimal custom-tool definition surface used by the suite, including prompt metadata, parameter schemas, and the optional execute callback required for direct tool invocation assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredTool = {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters?: unknown;
  sourceInfo?: Record<string, unknown>;
  execute?: (toolCallId: string, params: any, signal?: AbortSignal, onUpdate?: unknown, ctx?: any) => Promise<any> | any;
  renderResult?: (result: any, options: { expanded?: boolean; isPartial?: boolean }, theme: FakeThemeAdapter, context: { args?: Record<string, unknown>; lastComponent?: unknown }) => { render: (width: number) => string[] };
};

/**
 * @brief Describes one fake shortcut registration captured during tests.
 * @details Mirrors the minimal shortcut-registration shape exercised by the
 * suite so tests can trigger the configured sound toggle without a live TUI.
 * The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredShortcut = { description?: string; handler: (ctx: any) => Promise<void> | void };

/**
 * @brief Applies targeted `.pi-usereq.json` overrides inside one test project.
 * @details Loads the persisted config JSON, merges the supplied top-level overrides, and writes the updated payload back with a trailing newline so prompt-command tests can script worktree and notification behavior deterministically. Runtime is O(n) in config size. Side effects include filesystem reads and file overwrite.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] overrides {Record<string, unknown>} Top-level config overrides.
 * @return {void} No return value.
 */
function writeProjectConfigOverrides(projectBase: string, overrides: Record<string, unknown>): void {
  const configPath = getProjectConfigPath(projectBase);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as Record<string, unknown>;
  Object.assign(config, overrides);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  if (fs.existsSync(path.join(projectBase, ".git"))) {
    const gitEnv = {
      ...process.env,
      GIT_AUTHOR_NAME: "pi-usereq",
      GIT_AUTHOR_EMAIL: "pi-usereq@example.com",
      GIT_COMMITTER_NAME: "pi-usereq",
      GIT_COMMITTER_EMAIL: "pi-usereq@example.com",
    };
    assert.equal(spawnSync("git", ["add", ".pi-usereq.json", ".req/config.json"], {
      cwd: projectBase,
      encoding: "utf8",
    }).status, 0);
    const commit = spawnSync("git", ["commit", "-m", "config override"], {
      cwd: projectBase,
      encoding: "utf8",
      env: gitEnv,
    });
    assert.equal(commit.status, 0, commit.stderr);
  }
}

/**
 * @brief Represents the fake pi runtime returned by `createFakePi`.
 * @details Captures registered commands, tools, shortcuts, event handlers, active-tool state, and prompt-delivery payloads for deterministic extension-registration assertions. The alias is compile-time only and introduces no runtime side effects.
 */
type FakePi = ReturnType<typeof createFakePi>;

/**
 * @brief Describes the scripted UI responses consumed by `createFakeCtx`.
 * @details Supplies queued select and input values so interactive command tests remain deterministic and free from real TUI dependencies. The alias is compile-time only and introduces no runtime side effects.
 */
type FakeCtxPlan = { selects: string[]; inputs?: string[] };

/**
 * @brief Describes one fake session entry stored by session-aware tests.
 * @details Mirrors the minimal subset of session-manager entry shapes consumed by the suite so setup messages and custom entries remain inspectable across simulated runtime interactions. The alias is compile-time only and introduces no runtime side effects.
 */
type FakeSessionEntry =
  | { id: string; type: "custom"; customType: string; data?: unknown }
  | { id: string; type: "message"; message: unknown };

/**
 * @brief Describes the fake session-manager surface consumed by session-aware tests.
 * @details Exposes only the mutation and read APIs required by `ctx.newSession(...setup)`, `ctx.sessionManager`, and `pi.appendEntry(...)`. The interface is compile-time only and introduces no runtime cost.
 */
interface FakeSessionManager {
  appendCustomEntry: (customType: string, data?: unknown) => string;
  appendMessage: (message: unknown) => string;
  getBranch: () => FakeSessionEntry[];
  getEntries: () => FakeSessionEntry[];
  getCwd: () => string;
  getSessionDir: () => string | undefined;
  getSessionFile: () => string | undefined;
}

/**
 * @brief Describes optional fake pi runtime capabilities used by specific tests.
 * @details Allows tests to connect extension-side session-entry writes to a shared fake session manager without affecting call sites that only require command and tool registration capture. The alias is compile-time only and introduces no runtime side effects.
 */
type FakePiOptions = { sessionManager?: FakeSessionManager };

/**
 * @brief Describes one fake context-usage snapshot returned by test doubles.
 * @details Mirrors the subset of pi `ContextUsage` fields consumed by the
 * extension status controller so tests can script deterministic token and
 * percentage updates across lifecycle hooks. The alias is compile-time only and
 * introduces no runtime side effects.
 */
type FakeContextUsage = {
  tokens: number | null;
  contextWindow: number;
  percent: number | null;
};

/**
 * @brief Describes the fake theme surface used by test command contexts.
 * @details Constrains tests to the subset of theme callbacks consumed by the
 * extension and allows strict token-validation doubles for render-contract
 * assertions. The alias is compile-time only and introduces no runtime side
 * effects.
 */
type FakeThemeAdapter = {
  fg: (color: string, text: string) => string;
  bgFromFg: (color: string, text: string) => string;
  bold: (text: string) => string;
};

/**
 * @brief Describes optional fake command-context capabilities used by session-aware tests.
 * @details Allows tests to inject a shared fake session manager, a callback that simulates runtime replacement after `ctx.newSession(...)` completes, a scripted `getContextUsage()` provider for lifecycle-status assertions, and a custom theme adapter for render-contract validation. The alias is compile-time only and introduces no runtime side effects.
 */
type FakeCtxOptions = {
  sessionManager?: FakeSessionManager;
  onNewSession?: (options?: { parentSession?: string }) => Promise<{ cancelled: boolean } | void> | { cancelled: boolean } | void;
  getContextUsage?: () => FakeContextUsage | undefined;
  theme?: FakeThemeAdapter;
};

/**
 * @brief Extracts text content from a recorded session-manager user message.
 * @details Collapses text-part arrays appended during fake `ctx.newSession(...setup)` execution into one comparable string. Non-text payloads yield an empty string. Runtime is O(n) in part count. No external state is mutated.
 * @param[in] message {unknown} Session-manager message payload.
 * @return {string} Collapsed text content.
 */
function extractSessionMessageText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((item) => (item && typeof item === "object" && typeof (item as { text?: unknown }).text === "string"
      ? (item as { text: string }).text
      : ""))
    .join("");
}

/**
 * @brief Creates a fake session manager for session-aware tests.
 * @details Stores appended custom entries and setup messages in deterministic insertion order, returns stable synthetic entry identifiers, and exposes branch reads used by `session_start` handlers. Runtime is O(1) per mutation plus O(n) per snapshot copy. Side effects are limited to in-memory state mutation.
 * @return {FakeSessionManager} Fake session manager.
 */
function createFakeSessionFile(cwd: string): string {
  const sessionDir = path.join(os.tmpdir(), "pi-usereq-test-sessions");
  fs.mkdirSync(sessionDir, { recursive: true });
  const sessionFile = path.join(sessionDir, `session-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
  fs.writeFileSync(sessionFile, `${JSON.stringify({
    type: "session",
    version: 3,
    id: path.basename(sessionFile, ".jsonl"),
    timestamp: new Date(0).toISOString(),
    cwd,
  })}\n`, "utf8");
  return sessionFile;
}

/**
 * @brief Reads the stored cwd header from one fake or persisted session file.
 * @details Parses the first JSONL line and returns its `cwd` field when available so fake `ctx.switchSession(...)` calls can mirror pi session-path semantics without a live runtime. Runtime is O(n) in header size. Side effects are limited to filesystem reads.
 * @param[in] sessionFile {string} Session file path.
 * @param[in] fallbackCwd {string} Fallback cwd when the file cannot be parsed.
 * @return {string} Parsed session cwd or the fallback value.
 */
function readFakeSessionFileCwd(sessionFile: string, fallbackCwd: string): string {
  try {
    const headerLine = fs.readFileSync(sessionFile, "utf8").split(/\r?\n/)[0] ?? "";
    const header = JSON.parse(headerLine) as { cwd?: unknown };
    return typeof header.cwd === "string" && header.cwd !== "" ? header.cwd : fallbackCwd;
  } catch {
    return fallbackCwd;
  }
}

/**
 * @brief Creates a fake session manager for session-aware tests.
 * @details Stores appended custom entries and setup messages in deterministic insertion order, returns stable synthetic entry identifiers, and exposes persisted session-file metadata used by prompt-command session switching. Runtime is O(1) per mutation plus O(n) per snapshot copy. Side effects include in-memory state mutation and one fake session-file write.
 * @param[in] cwd {string} Initial session cwd.
 * @return {FakeSessionManager} Fake session manager.
 */
function createFakeSessionManager(cwd: string): FakeSessionManager {
  const entries: FakeSessionEntry[] = [];
  let nextEntryId = 0;
  let currentCwd = cwd;
  const sessionFile = createFakeSessionFile(cwd);
  const buildEntryId = (): string => `entry-${nextEntryId++}`;
  return {
    appendCustomEntry(customType: string, data?: unknown): string {
      const entryId = buildEntryId();
      entries.push({ id: entryId, type: "custom", customType, data });
      return entryId;
    },
    appendMessage(message: unknown): string {
      const entryId = buildEntryId();
      entries.push({ id: entryId, type: "message", message });
      return entryId;
    },
    getBranch(): FakeSessionEntry[] {
      return entries.map((entry) => ({ ...entry }));
    },
    getEntries(): FakeSessionEntry[] {
      return entries.map((entry) => ({ ...entry }));
    },
    getCwd(): string {
      return currentCwd;
    },
    getSessionDir(): string {
      return path.dirname(sessionFile);
    },
    getSessionFile(): string {
      currentCwd = readFakeSessionFileCwd(sessionFile, currentCwd);
      return sessionFile;
    },
  };
}

/**
 * @brief Creates a fake pi runtime that records command, tool, and shortcut registrations.
 * @details Provides deterministic in-memory implementations for the subset of `ExtensionAPI` methods exercised by this suite, including command registration, tool registration, builtin-tool discovery, shortcut registration, event dispatch, active-tool mutation, prompt delivery, and optional session-entry persistence. Runtime is O(1) per registration plus delegated handler cost. Side effects are limited to in-memory state mutation.
 * @param[in] options {FakePiOptions} Optional fake runtime integrations.
 * @return {FakePi} Fake extension runtime.
 */
function createFakePi(options: FakePiOptions = {}) {
  const commands = new Map<string, RegisteredCommand>();
  const tools: RegisteredTool[] = [];
  const shortcuts = new Map<string, RegisteredShortcut>();
  const sentUserMessages: Array<{ content: unknown; options?: unknown }> = [];
  const eventHandlers = new Map<string, Array<(event: any, ctx: any) => Promise<void> | void>>();
  const embeddedToolNames = new Set<string>(PI_USEREQ_EMBEDDED_TOOL_NAMES);
  const builtinTools: RegisteredTool[] = PI_USEREQ_EMBEDDED_TOOL_NAMES.map((name) => ({
    name,
    label: name,
    description: `Built-in pi CLI tool ${name}.`,
    sourceInfo: {
      path: `<builtin:${name}>`,
      source: "builtin",
      scope: "temporary",
      origin: "top-level",
    },
  }));
  let activeTools = PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES.filter((name) => embeddedToolNames.has(name));
  const getVisibleTools = () => {
    const overridden = new Set(tools.map((tool) => tool.name));
    return [
      ...builtinTools.filter((tool) => !overridden.has(tool.name)),
      ...tools,
    ].map((tool) => ({
      ...tool,
      sourceInfo: tool.sourceInfo ?? {
        path: "<extension:pi-usereq>",
        source: "extension",
        scope: "project",
        origin: "top-level",
      },
    }));
  };
  return {
    commands,
    tools,
    shortcuts,
    sentUserMessages,
    eventHandlers,
    getActiveTools() {
      return [...activeTools];
    },
    getAllTools() {
      return getVisibleTools();
    },
    setActiveTools(names: string[]) {
      const available = new Set(getVisibleTools().map((tool) => tool.name));
      activeTools = names.filter((name, index) => available.has(name) && names.indexOf(name) === index);
    },
    on(name: string, handler: (event: any, ctx: any) => Promise<void> | void) {
      const handlers = eventHandlers.get(name) ?? [];
      handlers.push(handler);
      eventHandlers.set(name, handlers);
    },
    async emit(name: string, event: any, ctx: any) {
      for (const handler of eventHandlers.get(name) ?? []) {
        await handler(event, ctx);
      }
    },
    registerCommand(name: string, options: RegisteredCommand) {
      commands.set(name, options);
    },
    registerTool(definition: RegisteredTool) {
      const existingIndex = tools.findIndex((tool) => tool.name === definition.name);
      if (existingIndex >= 0) {
        tools[existingIndex] = definition;
      } else {
        tools.push(definition);
      }
      if (!activeTools.includes(definition.name)) {
        activeTools = [...activeTools, definition.name];
      }
    },
    registerShortcut(shortcut: string, options: RegisteredShortcut) {
      shortcuts.set(shortcut, options);
    },
    sendUserMessage(content: unknown, options?: unknown) {
      sentUserMessages.push({ content, options });
    },
    appendEntry(customType: string, data?: unknown) {
      return options.sessionManager?.appendCustomEntry(customType, data);
    },
  } as any;
}

/**
 * @brief Encodes one fake themed fragment for deterministic status assertions.
 * @details Wraps the requested color and text in stable XML-like markers so tests can validate color intent without terminal escape sequences. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] color {string} Requested theme color token.
 * @param[in] text {string} Raw text payload.
 * @return {string} Encoded themed fragment.
 */
function formatFakeThemeForeground(color: string, text: string): string {
  return `<${color}>${text}</${color}>`;
}

/**
 * @brief Encodes one fake background fragment derived from a foreground color.
 * @details Wraps the provided text in stable XML-like markers so tests can
 * assert the context-bar background contract without terminal escape sequences.
 * Runtime is O(n) in text length. No external state is mutated.
 * @param[in] color {string} Foreground color reused as synthetic background.
 * @param[in] text {string} Raw text payload.
 * @return {string} Encoded background fragment.
 */
function formatFakeThemeBackgroundFromForeground(color: string, text: string): string {
  return `<bg-from-fg-${color}>${text}</bg-from-fg-${color}>`;
}

/**
 * @brief Resolves the expected fake branch payload for status assertions.
 * @details Reads `git branch --show-current` from the supplied base path and falls back to `unknown` when the path is outside a repository or HEAD has no branch name. Runtime is dominated by git execution. Side effects include subprocess creation.
 * @param[in] basePath {string | undefined} Base path represented by the fake context.
 * @return {string} Expected branch name or `unknown` when unavailable.
 */
function buildExpectedFakeBranchValue(basePath: string | undefined): string {
  if (!basePath || !fs.existsSync(basePath)) {
    return "unknown";
  }
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: basePath,
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    return "unknown";
  }
  const branchName = result.stdout.trim();
  return branchName === "" ? "unknown" : branchName;
}

/**
 * @brief Builds the expected fake context-gauge payload for assertions.
 * @details Resolves the documented icon thresholds for `0`, `>0-<25`, `>=25-<50`, `>=50-<75`, and `>=75-<90`, renders those non-error bands with the same `warning` token used by the `status` value, emits the non-blinking error full icon for `>=90-<100`, and emits the blinking error full icon for `>=100`. Runtime is O(1). No external state is mutated.
 * @param[in] options {{ filledCells: number; percent?: number | null }} Expected context-gauge facts.
 * @return {string} Encoded context-gauge string.
 */
function buildExpectedFakeContextBar(options: {
  filledCells: number;
  percent?: number | null;
}): string {
  const percent = options.percent;
  if (percent === undefined || percent === null || percent <= 0) {
    return formatFakeThemeForeground("warning", "▕_▏");
  }
  if (percent >= 100) {
    return formatFakeThemeForeground("error", "\u001b[5m▕█▏\u001b[25m");
  }
  if (percent >= 90) {
    return formatFakeThemeForeground("error", "▕█▏");
  }
  if (percent < 25) {
    return formatFakeThemeForeground("warning", "▕▂▏");
  }
  if (percent < 50) {
    return formatFakeThemeForeground("warning", "▕▄▏");
  }
  if (percent < 75) {
    return formatFakeThemeForeground("warning", "▕▆▏");
  }
  return formatFakeThemeForeground("warning", "▕█▏");
}

/**
 * @brief Builds the expected fake pi-usereq status-bar string for assertions.
 * @details Reconstructs the field order, workflow-state highlighting, branch field, icon-based context gauge, consolidated elapsed field, and sound field emitted by the extension using deterministic fake theme markers. Runtime is O(1) plus optional git execution for branch discovery. No external state is mutated.
 * @param[in] options {{ workflowState?: string; basePath?: string; contextFilledCells: number; contextPercent?: number | null; et: string; sound?: string }} Expected status facts for rendered `status`, `branch`, `context`, `elapsed`, and `sound` fields.
 * @return {string} Encoded status-bar string.
 */
function buildExpectedFakeStatusText(options: {
  workflowState?: string;
  basePath?: string;
  docsDir?: string;
  testsDir?: string;
  srcDir?: string[];
  contextFilledCells: number;
  contextPercent?: number | null;
  et: string;
  sound?: string;
}): string {
  const buildField = (fieldName: string, value: string): string =>
    `${formatFakeThemeForeground("accent", `${fieldName}:`)}${formatFakeThemeForeground("warning", value)}`;
  const workflowStateText = options.workflowState ?? "idle";
  const workflowStateValue = workflowStateText === "error"
    ? formatFakeThemeForeground("error", "\u001b[5merror\u001b[25m")
    : formatFakeThemeForeground("warning", workflowStateText);
  const branchValue = buildExpectedFakeBranchValue(options.basePath);
  const contextBar = buildExpectedFakeContextBar({
    filledCells: options.contextFilledCells,
    percent: options.contextPercent,
  });
  return [
    `${formatFakeThemeForeground("accent", "status:")}${workflowStateValue}`,
    buildField("branch", branchValue),
    `${formatFakeThemeForeground("accent", "context:")}${contextBar}`,
    buildField("elapsed", options.et),
    buildField("sound", options.sound ?? "none"),
  ].join(formatFakeThemeForeground("dim", " • "));
}

/**
 * @brief Formats one expected absolute base path for prompt and status assertions.
 * @details Resolves the supplied cwd and normalizes path separators to `/` so
 * prompt-text comparisons and legacy status-call-site inputs stay stable across
 * operating systems. Runtime is O(p) in path length. No external state is
 * mutated.
 * @param[in] cwd {string} Runtime working directory.
 * @return {string} Slash-normalized absolute base path.
 */
function buildExpectedFakeBasePath(cwd: string): string {
  return path.resolve(cwd).split(path.sep).join("/");
}

/**
 * @brief Formats one expected home-relative base path for notify-template assertions.
 * @details Resolves the supplied cwd, emits `~` or `~/...` when the path is inside the current user home directory, and otherwise returns the slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] cwd {string} Runtime working directory.
 * @return {string} Home-relative or absolute base path used by notification templates.
 */
function buildExpectedNotifyBasePath(cwd: string): string {
  const resolvedPath = path.resolve(cwd);
  const homePath = path.resolve(process.env.HOME ?? os.homedir());
  if (resolvedPath === homePath) {
    return "~";
  }
  const relativePath = path.relative(homePath, resolvedPath);
  if (relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return `~/${relativePath.split(path.sep).join("/")}`;
  }
  return resolvedPath.split(path.sep).join("/");
}

/**
 * @brief Formats the expected `Show configuration` path value.
 * @details Resolves the current project config path and rewrites a leading home-directory prefix to `~` so top-level menu assertions match the documented display-only substitution without changing stored paths. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] cwd {string} Runtime working directory.
 * @return {string} `~`-relative or absolute config-path display string.
 */
function buildExpectedShowConfigPath(cwd: string): string {
  return buildExpectedNotifyBasePath(path.dirname(getProjectConfigPath(cwd))) === buildExpectedNotifyBasePath(cwd)
    ? `${buildExpectedNotifyBasePath(cwd)}/.pi-usereq.json`
    : getProjectConfigPath(cwd).split(path.sep).join("/");
}

/**
 * @brief Formats the expected `%%RESULT%%` placeholder value for one terminal stop reason.
 * @details Maps the tested assistant stop reasons to the literal runtime result tokens required by the default notify and Pushover templates. Runtime is O(1). No external state is mutated.
 * @param[in] stopReason {"stop" | "aborted" | "error"} Terminal stop reason under test.
 * @return {string} `successed`, `aborted`, or `failed`.
 */
function buildExpectedNotifyResult(stopReason: "stop" | "aborted" | "error"): string {
  switch (stopReason) {
    case "aborted":
      return "aborted";
    case "error":
      return "failed";
    default:
      return "successed";
  }
}

/**
 * @brief Creates a fake extension command context with scripted UI interactions.
 * @details Materializes deterministic `select`, shared settings-menu `custom`, `input`, `notify`, `setStatus`, `setEditorText`, `waitForIdle`, `newSession`, `sessionManager`, `getContextUsage`, theme-color behaviors, and captured custom-menu render output backed by in-memory state so menu-oriented and prompt-command tests can assert side effects without a real UI. Optional `onNewSession` and theme overrides let tests emulate runtime replacement and strict token validation. Runtime is O(1) plus queued interaction count and delegated new-session setup cost. Side effects are limited to in-memory state mutation.
 * @param[in] cwd {string} Working directory exposed to command handlers.
 * @param[in] plan {FakeCtxPlan} Scripted select and input responses.
 * @param[in] options {FakeCtxOptions} Optional fake session-manager, context-usage, and runtime-replacement integrations.
 * @return {any} Fake command context compatible with the tested handlers.
 */
function createFakeCtx(cwd: string, plan: FakeCtxPlan = { selects: [] }, options: FakeCtxOptions = {}) {
  const selects = [...plan.selects];
  const inputs = [...(plan.inputs ?? [])];
  const getContextUsage = options.getContextUsage ?? (() => undefined);
  const baseSessionManager = options.sessionManager ?? createFakeSessionManager(cwd);
  let currentSessionCwd = typeof baseSessionManager.getCwd === "function"
    ? baseSessionManager.getCwd()
    : cwd;
  let currentSessionFile = typeof baseSessionManager.getSessionFile === "function"
    ? baseSessionManager.getSessionFile()
    : createFakeSessionFile(currentSessionCwd);
  const theme = options.theme ?? {
    fg: (color: string, text: string) => formatFakeThemeForeground(color, text),
    bgFromFg: (color: string, text: string) => formatFakeThemeBackgroundFromForeground(color, text),
    bold: (text: string) => `<bold>${text}</bold>`,
  };
  const state = {
    editorText: "",
    statuses: new Map<string, string>(),
    notifications: [] as Array<{ message: string; level: string }>,
    selectCalls: [] as Array<{ title: string; items: string[]; selectedChoiceId?: string }>,
    customRenderLines: [] as string[][],
    waitForIdleCalls: 0,
    newSessions: [] as Array<{ messages: string[] }>,
  };
  const sessionManager: FakeSessionManager = {
    appendCustomEntry(customType: string, data?: unknown): string {
      return baseSessionManager.appendCustomEntry(customType, data);
    },
    appendMessage(message: unknown): string {
      return baseSessionManager.appendMessage(message);
    },
    getBranch(): FakeSessionEntry[] {
      return baseSessionManager.getBranch();
    },
    getEntries(): FakeSessionEntry[] {
      return baseSessionManager.getEntries();
    },
    getCwd(): string {
      return currentSessionCwd;
    },
    getSessionDir(): string | undefined {
      return typeof currentSessionFile === "string" ? path.dirname(currentSessionFile) : undefined;
    },
    getSessionFile(): string | undefined {
      return currentSessionFile;
    },
  };
  const fakeCtx: any = {
    cwd,
    __state: state,
    sessionManager,
    async waitForIdle() {
      state.waitForIdleCalls += 1;
    },
    async switchSession(sessionPath: string) {
      currentSessionFile = sessionPath;
      currentSessionCwd = readFakeSessionFileCwd(sessionPath, currentSessionCwd);
      fakeCtx.cwd = currentSessionCwd;
      process.chdir(currentSessionCwd);
      return { cancelled: false };
    },
    async newSession(newSessionOptions?: {
      parentSession?: string;
      setup?: (sessionManager: FakeSessionManager) => Promise<void>;
    }) {
      const session = { messages: [] as string[] };
      const setupSessionManager: FakeSessionManager = {
        appendCustomEntry(customType: string, data?: unknown): string {
          return sessionManager.appendCustomEntry(customType, data);
        },
        appendMessage(message: unknown): string {
          if ((message as { role?: unknown })?.role === "user") {
            session.messages.push(extractSessionMessageText(message));
          }
          return sessionManager.appendMessage(message);
        },
        getBranch(): FakeSessionEntry[] {
          return sessionManager.getBranch();
        },
        getEntries(): FakeSessionEntry[] {
          return sessionManager.getEntries();
        },
        getCwd(): string {
          return sessionManager.getCwd();
        },
        getSessionDir(): string | undefined {
          return sessionManager.getSessionDir();
        },
        getSessionFile(): string | undefined {
          return sessionManager.getSessionFile();
        },
      };
      if (newSessionOptions?.setup) {
        await newSessionOptions.setup(setupSessionManager);
      }
      state.newSessions.push(session);
      if (options.onNewSession) {
        const result = await options.onNewSession({ parentSession: newSessionOptions?.parentSession });
        return result ?? { cancelled: false };
      }
      return { cancelled: false };
    },
    getContextUsage() {
      return getContextUsage();
    },
    ui: {
      theme,
      async select(title: string, items: string[]) {
        state.selectCalls.push({ title, items: [...items] });
        return selects.shift();
      },
      async input(_title: string, _placeholder?: string) {
        return inputs.shift();
      },
      async custom<T>(factory: (tui: { requestRender: () => void }, theme: { fg: (color: string, text: string) => string; bgFromFg: (color: string, text: string) => string; bold: (text: string) => string }, keybindings: Record<string, never>, done: (value?: T) => void) => unknown) {
        let resolveResult!: (value: T | undefined) => void;
        const resultPromise = new Promise<T | undefined>((resolve) => {
          resolveResult = resolve;
        });
        const component = factory(
          { requestRender: () => undefined },
          theme,
          {},
          (value?: T) => resolveResult(value),
        ) as {
          render?: (width: number) => string[];
          __piUsereqSettingsMenu?: {
            title: string;
            choices: Array<{ label: string }>;
            selectedChoiceId?: string;
            selectByLabel: (label: string) => boolean;
            cancel: () => void;
          };
        };
        const bridge = component.__piUsereqSettingsMenu;
        assert.ok(bridge, "unsupported custom UI component");
        if (typeof component.render === "function") {
          state.customRenderLines.push(component.render(120));
        }
        const response = selects.shift();
        state.selectCalls.push({
          title: bridge.title,
          items: bridge.choices.map((choice) => choice.label),
          selectedChoiceId: bridge.selectedChoiceId,
        });
        if (response === undefined) {
          bridge.cancel();
        } else if (response === "Save and close" && !bridge.choices.some((choice) => choice.label === response)) {
          bridge.cancel();
        } else {
          assert.ok(bridge.selectByLabel(response), `unsupported custom selection ${response}`);
        }
        return resultPromise;
      },
      notify(message: string, level: string = "info") {
        state.notifications.push({ message, level });
      },
      setStatus(key: string, value?: string) {
        if (value === undefined) {
          state.statuses.delete(key);
        } else {
          state.statuses.set(key, value);
        }
      },
      setEditorText(value: string) {
        state.editorText = value;
      },
    },
  };
  return fakeCtx;
}

/**
 * @brief Executes one registered fake tool while temporarily overriding `process.cwd()`.
 * @details Locates the named tool, validates the presence of its execute callback, switches the process working directory for the duration of the call, invokes the tool, and restores the previous cwd in a `finally` block. Runtime is dominated by the delegated tool logic. Side effects transiently mutate process cwd.
 * @param[in] pi {FakePi} Fake extension runtime containing registered tools.
 * @param[in] toolName {string} Registered tool name.
 * @param[in] cwd {string} Working directory to expose to tool code through `process.cwd()`.
 * @param[in] params {Record<string, unknown>} Tool parameter object.
 * @return {Promise<any>} Tool execution result payload.
 */
async function executeRegisteredTool(
  pi: FakePi,
  toolName: string,
  cwd: string,
  params: Record<string, unknown> = {},
): Promise<any> {
  const tool = pi.tools.find((candidate) => candidate.name === toolName);
  assert.ok(tool, `missing tool ${toolName}`);
  assert.ok(tool.execute, `missing execute handler for tool ${toolName}`);
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    return await tool.execute!("tool-call-id", params, undefined, undefined, { cwd });
  } finally {
    process.chdir(previousCwd);
  }
}

test("extension registers prompt and config commands while exposing tool capabilities only as tools", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const commandNames = [...pi.commands.keys()].sort();
  for (const name of [
    "pi-usereq",
    "req-analyze",
    "req-change",
    "req-check",
    "req-cover",
    "req-create",
    "req-fix",
    "req-flowchart",
    "req-implement",
    "req-new",
    "req-readme",
    "req-recreate",
    "req-refactor",
    "req-references",
    "req-renumber",
    "req-workflow",
    "req-write",
  ]) {
    assert.ok(commandNames.includes(name), `missing command ${name}`);
  }
  assert.equal(pi.commands.get("req-analyze")?.description, "Produce an analysis report");

  for (const name of [
    "files-tokens",
    "files-references",
    "files-compress",
    "files-search",
    "references",
    "compress",
    "search",
    "tokens",
    "files-static-check",
    "static-check",
    "pi-usereq-show-config",
    "test-static-check",
  ]) {
    assert.ok(!commandNames.includes(name), `unexpected command ${name}`);
  }

  const toolNames = pi.tools.map((tool: RegisteredTool) => tool.name).sort();
  for (const name of [
    "files-tokens",
    "files-references",
    "files-compress",
    "files-search",
    "references",
    "compress",
    "search",
    "tokens",
    "files-static-check",
    "static-check",
  ]) {
    assert.ok(toolNames.includes(name), `missing tool ${name}`);
  }
});

test("token tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesTokens = pi.tools.find((tool: RegisteredTool) => tool.name === "files-tokens");
  const tokens = pi.tools.find((tool: RegisteredTool) => tool.name === "tokens");
  assert.ok(filesTokens, "missing files-tokens tool");
  assert.ok(tokens, "missing tokens tool");

  assert.match(filesTokens.description ?? "", /monolithic token pack summary/);
  assert.ok(filesTokens.promptGuidelines?.some((line) => line.includes("monolithic pack-summary text")));
  assert.match(String((filesTokens.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic pack-summary text/);

  assert.match(tokens.description ?? "", /canonical docs/);
  assert.ok(tokens.promptGuidelines?.some((line) => line.includes("monolithic pack-summary text")));
  assert.match(String((tokens.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic pack-summary text/);
});

test("reference tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesReferences = pi.tools.find((tool: RegisteredTool) => tool.name === "files-references");
  const references = pi.tools.find((tool: RegisteredTool) => tool.name === "references");
  assert.ok(filesReferences, "missing files-references tool");
  assert.ok(references, "missing references tool");

  assert.match(filesReferences.description ?? "", /monolithic references markdown report/);
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("monolithic markdown")));
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("Formatting contract:")));
  assert.match(String((filesReferences.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);

  assert.match(references.description ?? "", /configured project source directories/);
  assert.ok(references.promptGuidelines?.some((line) => line.includes("file-structure markdown block")));
  assert.ok(references.promptGuidelines?.some((line) => line.includes("Configuration contract:")));
  assert.match(String((references.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
});

test("search tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesSearch = pi.tools.find((tool: RegisteredTool) => tool.name === "files-search");
  const search = pi.tools.find((tool: RegisteredTool) => tool.name === "search");
  assert.ok(filesSearch, "missing files-search tool");
  assert.ok(search, "missing search tool");

  assert.match(filesSearch.description ?? "", /monolithic construct-search markdown report/);
  assert.ok(filesSearch.promptGuidelines?.some((line) => line.includes("Regex rule:")));
  assert.ok(filesSearch.promptGuidelines?.some((line) => line.includes("Supported tags [Typescript]:")));
  assert.ok(filesSearch.promptGuidelines?.some((line) => line.includes("Supported tags [Python]:")));
  assert.match(String((filesSearch.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);

  assert.match(search.description ?? "", /configured project source directories/);
  assert.ok(search.promptGuidelines?.some((line) => line.includes("monolithic markdown")));
  assert.ok(search.promptGuidelines?.some((line) => line.includes("Tag rule:")));
  assert.match(String((search.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
});

test("compression tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesCompress = pi.tools.find((tool: RegisteredTool) => tool.name === "files-compress");
  const compress = pi.tools.find((tool: RegisteredTool) => tool.name === "compress");
  assert.ok(filesCompress, "missing files-compress tool");
  assert.ok(compress, "missing compress tool");

  assert.match(filesCompress.description ?? "", /monolithic compression markdown report/);
  assert.ok(filesCompress.promptGuidelines?.some((line) => line.includes("Line-number behavior:")));
  assert.ok(filesCompress.promptGuidelines?.some((line) => line.includes("Formatting contract:")));
  assert.match(String((filesCompress.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);

  assert.match(compress.description ?? "", /configured project source directories/);
  assert.ok(compress.promptGuidelines?.some((line) => line.includes("monolithic markdown")));
  assert.ok(compress.promptGuidelines?.some((line) => line.includes("Formatting contract:")));
  assert.match(String((compress.parameters as { description?: string } | undefined)?.description ?? ""), /monolithic markdown/);
});

test("agent tools define custom renderResult with compact and expanded structured views", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const toolNames = [
      "files-tokens",
      "files-references",
      "files-compress",
      "files-search",
      "references",
      "compress",
      "search",
      "tokens",
      "files-static-check",
      "static-check",
    ];
    for (const toolName of toolNames) {
      const tool = pi.tools.find((candidate: RegisteredTool) => candidate.name === toolName);
      assert.ok(tool, `missing tool ${toolName}`);
      assert.equal(typeof tool?.renderResult, "function", `missing renderResult for ${toolName}`);
    }

    fs.writeFileSync(path.join(projectBase, "src", "render_result_target.ts"), "export function alpha(): number {\n  return 1;\n}\n", "utf8");
    const tool = pi.tools.find((candidate: RegisteredTool) => candidate.name === "files-search");
    assert.ok(tool?.renderResult, "missing renderResult for files-search");
    const params = {
      tag: "FUNCTION",
      pattern: "^alpha$",
      files: ["src/render_result_target.ts"],
      enableLineNumbers: true,
    };
    const result = await executeRegisteredTool(pi, "files-search", projectBase, params);
    const theme: FakeThemeAdapter = {
      fg: (color: string, text: string) => formatFakeThemeForeground(color, text),
      bgFromFg: (color: string, text: string) => formatFakeThemeBackgroundFromForeground(color, text),
      bold: (text: string) => `<bold>${text}</bold>`,
    };
    const compact = tool.renderResult(result, { expanded: false, isPartial: false }, theme, { args: params }).render(120).join("\n");
    const expanded = tool.renderResult(result, { expanded: true, isPartial: false }, theme, { args: params }).render(120).join("\n");
    assert.match(compact, /files-search/);
    assert.match(compact, /tag="FUNCTION"/);
    assert.match(compact, /pattern="\^alpha\$"/);
    assert.match(compact, /files=\["src\/render_result_target\.ts"\]/);
    assert.doesNotMatch(compact, /### FUNCTION/);
    assert.match(expanded, /### FUNCTION: `alpha`/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-tokens returns monolithic token summary text with execution diagnostics", async () => {
  const { projectBase } = initFixtureRepo({
    fixtures: [],
    docs: {
      "REQUIREMENTS.md": "---\ntitle: Requirements\n---\n# Requirements\nAlpha\nBeta\n",
      "WORKFLOW.md": "# Workflow\nStep one\n",
      "REFERENCES.md": "# References\nEntry one\n",
    },
  });
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-tokens", projectBase, {
      files: [`${DEFAULT_DOCS_DIR}/REQUIREMENTS.md`, `${DEFAULT_DOCS_DIR}/MISSING.md`],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /Pack Summary/);
    assert.match(content, /REQUIREMENTS\.md/);
    assert.equal(result.details?.execution.code, 0);
    assert.ok(result.details?.execution.stderr_lines?.some((line) => /MISSING\.md/.test(line)));
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-tokens defers js-tiktoken loading until execution and returns monolithic dependency failures", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const missingModuleError = new Error("Cannot find module 'js-tiktoken'");
  setJsTiktokenModuleLoaderForTests(() => {
    throw missingModuleError;
  });
  try {
    const pi = createFakePi();
    assert.doesNotThrow(() => piUsereqExtension(pi));
    const result = await executeRegisteredTool(pi, "files-tokens", projectBase, {
      files: [`${DEFAULT_DOCS_DIR}/REQUIREMENTS.md`],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    assert.equal(result.details?.execution.code, 1);
    assert.match(result.content?.[0]?.text ?? "", /js-tiktoken/);
    assert.ok(result.details?.execution.stderr_lines?.some((line) => /npm ci/.test(line)));
  } finally {
    setJsTiktokenModuleLoaderForTests(undefined);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-references returns monolithic references markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.ts");
  fs.writeFileSync(samplePath, `/**
 * @file
 * @brief Sample source file.
 */

/**
 * @brief Builds the sample value.
 * @param[in] input {string} Caller-supplied value.
 * @return {string} Upper-cased result.
 * @satisfies REQ-011
 */
export function buildSample(input: string): string {
  return input.toUpperCase();
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-references", projectBase, {
      files: ["src/sample.ts", "src/missing.ts"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /# sample\.ts \| TypeScript/);
    assert.match(content, /## Definitions/);
    assert.match(content, /buildSample/);
    assert.match(content, /Caller-supplied value\./);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("references returns monolithic project references markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(path.join(projectBase, "src", "alpha.ts"), "export const ALPHA = 1;\n", "utf8");
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(path.join(projectBase, "src", "nested", "beta.ts"), "export function beta(): number {\n  return 2;\n}\n", "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "references", projectBase, {}) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /# Files Structure/);
    assert.match(content, /src\/alpha\.ts/);
    assert.match(content, /src\/nested\/beta\.ts/);
    assert.match(content, /# alpha\.ts \| TypeScript/);
    assert.match(content, /# beta\.ts \| TypeScript/);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-compress returns monolithic compression markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.ts");
  fs.writeFileSync(samplePath, `/**
 * @file
 * @brief Sample source file.
 */

/**
 * @brief Builds the sample value.
 * @param[in] input {string} Caller-supplied value.
 * @return {string} Upper-cased result.
 */
export function buildSample(input: string): string {
  // stripped comment
  return input.toUpperCase();
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-compress", projectBase, {
      files: ["src/sample.ts", "src/missing.ts"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /@@@ src\/sample\.ts \| typescript/);
    assert.match(content, /> Lines: 11-14/);
    assert.match(content, /^11: export function buildSample/m);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("compress returns monolithic repository-scoped compression markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(
    path.join(projectBase, "src", "alpha.ts"),
    "export const ALPHA = 1;\n",
    "utf8",
  );
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(
    path.join(projectBase, "src", "nested", "beta.ts"),
    "export function buildBeta(): number {\n  return 2;\n}\n",
    "utf8",
  );
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "compress", projectBase, {
      enableLineNumbers: false,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /@@@ src\/alpha\.ts \| typescript/);
    assert.match(content, /@@@ src\/nested\/beta\.ts \| typescript/);
    assert.match(content, /^export function buildBeta/m);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-search returns monolithic search markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.ts");
  fs.writeFileSync(samplePath, `/**
 * @file
 * @brief Sample source file.
 */

/**
 * @brief Builds the sample value.
 * @param[in] input {string} Caller-supplied value.
 * @return {string} Upper-cased result.
 * @satisfies REQ-089
 */
export function buildSample(input: string): string {
  return input.toUpperCase();
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "files-search", projectBase, {
      tag: "FUNCTION",
      pattern: "^buildSample$",
      files: ["src/sample.ts", "src/missing.ts"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /### FUNCTION: `buildSample`/);
    assert.match(content, /> Signature: `export function buildSample\(input: string\): string`/);
    assert.match(content, /> Lines: 12-14/);
    assert.match(content, /^12: export function buildSample/m);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("search returns monolithic repository-scoped construct-search markdown", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(
    path.join(projectBase, "src", "alpha.ts"),
    `/**
 * @brief Builds alpha.
 * @return {number} Constant one.
 */
export function buildAlpha(): number {
  return 1;
}
`,
    "utf8",
  );
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(
    path.join(projectBase, "src", "nested", "beta.ts"),
    "export function helperBeta(): number {\n  return 2;\n}\n",
    "utf8",
  );
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "search", projectBase, {
      tag: "FUNCTION",
      pattern: "^build",
      enableLineNumbers: false,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };

    const content = result.content?.[0]?.text ?? "";
    assert.match(content, /### FUNCTION: `buildAlpha`/);
    assert.match(content, /export function buildAlpha/);
    assert.doesNotMatch(content, /helperBeta/);
    assert.equal(result.details?.execution.code, 0);
    assert.deepEqual(result.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("source-extraction agent tools preserve leading tabs in emitted content", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const samplePath = path.join(projectBase, "src", "sample.go");
  fs.writeFileSync(samplePath, `package main

import (
	"bytes"
	"context"
	"fmt"
)

type Runner interface {
	Run(ctx context.Context) error
}

type Server struct{}

func (s *Server) Start(ctx context.Context) error {
	var buffer bytes.Buffer
	fmt.Println("start", buffer.Len())
	return nil
}
`, "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);

    const filesReferencesResult = await executeRegisteredTool(pi, "files-references", projectBase, {
      files: ["src/sample.go"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(filesReferencesResult.content?.[0]?.text ?? "", /\tvar buffer bytes\.Buffer/);
    assert.equal(filesReferencesResult.details?.execution.code, 0);

    const referencesResult = await executeRegisteredTool(pi, "references", projectBase, {}) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(referencesResult.content?.[0]?.text ?? "", /\tvar buffer bytes\.Buffer/);
    assert.equal(referencesResult.details?.execution.code, 0);

    const filesCompressResult = await executeRegisteredTool(pi, "files-compress", projectBase, {
      files: ["src/sample.go"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(filesCompressResult.content?.[0]?.text ?? "", /\d+: \t"context"/);
    assert.equal(filesCompressResult.details?.execution.code, 0);

    const compressResult = await executeRegisteredTool(pi, "compress", projectBase, {
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(compressResult.content?.[0]?.text ?? "", /\d+: \t"context"/);
    assert.equal(compressResult.details?.execution.code, 0);

    const filesSearchResult = await executeRegisteredTool(pi, "files-search", projectBase, {
      tag: "METHOD|FUNCTION",
      pattern: "^Start$",
      files: ["src/sample.go"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(filesSearchResult.content?.[0]?.text ?? "", /\d+: \tfmt\.Println\("start", buffer\.Len\(\)\)/);
    assert.equal(filesSearchResult.details?.execution.code, 0);

    const searchResult = await executeRegisteredTool(pi, "search", projectBase, {
      tag: "METHOD|FUNCTION",
      pattern: "^Start$",
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number } };
    };
    assert.match(searchResult.content?.[0]?.text ?? "", /\d+: \tfmt\.Println\("start", buffer\.Len\(\)\)/);
    assert.equal(searchResult.details?.execution.code, 0);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("static-check tools return monolithic text payloads with minimal execution details", async () => {
  const { projectBase } = initFixtureRepo({
    fixtures: [],
    staticCheck: {
      TypeScript: createStaticCheckLanguageConfig([{ module: "Dummy" }], "enable"),
    },
  });
  fs.writeFileSync(path.join(projectBase, "src", "check.ts"), "export const VALUE = 1;\n", "utf8");
  const add = spawnSync("git", ["add", "."], { cwd: projectBase, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  const commit = spawnSync("git", ["commit", "-m", "add static-check input"], { cwd: projectBase, encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr);
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);

    const filesStaticCheckResult = await executeRegisteredTool(pi, "files-static-check", projectBase, {
      files: ["src/check.ts", "src/missing.ts"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };
    assert.match(filesStaticCheckResult.content?.[0]?.text ?? "", /src\/missing\.ts/);
    assert.equal(filesStaticCheckResult.details?.execution.code, 0);
    assert.ok(filesStaticCheckResult.details?.execution.stderr_lines?.some((line) => /src\/missing\.ts/.test(line)));

    const staticCheckResult = await executeRegisteredTool(pi, "static-check", projectBase) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };
    assert.equal(staticCheckResult.content?.[0]?.text ?? "", "");
    assert.equal(staticCheckResult.details?.execution.code, 0);
    assert.deepEqual(staticCheckResult.details?.execution.stderr_lines, undefined);

    fs.writeFileSync(
      getProjectConfigPath(projectBase),
      `${JSON.stringify({
        ...getDefaultConfig(projectBase),
        "docs-dir": DEFAULT_DOCS_DIR,
        "tests-dir": "tests",
        "src-dir": ["src"],
        "static-check": {
          TypeScript: createStaticCheckLanguageConfig([{ module: "Dummy" }], "disable"),
        },
      }, null, 2)}\n`,
      "utf8",
    );
    const disabledFilesStaticCheckResult = await executeRegisteredTool(pi, "files-static-check", projectBase, {
      files: ["src/check.ts"],
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: { execution: { code: number; stderr_lines?: string[] } };
    };
    assert.equal(disabledFilesStaticCheckResult.content?.[0]?.text ?? "", "");
    assert.equal(disabledFilesStaticCheckResult.details?.execution.code, 0);
    assert.deepEqual(disabledFilesStaticCheckResult.details?.execution.stderr_lines, undefined);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("configuration menu saves updated docs-dir in project config", async () => {
  const cwd = createTempDir("pi-usereq-menu-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler("", createFakeCtx(cwd, { selects: ["docs-dir", "Save and close"], inputs: ["docs/custom"] }));
  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["docs-dir"], "docs/custom");
});

test("configuration menu persists trailing-slash-free relative directory values", async () => {
  const cwd = createTempDir("pi-usereq-menu-path-contracts-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "docs-dir",
      "tests-dir",
      "src-dir",
      "add-src-dir-entry",
      "Save and close",
      "Save and close",
    ],
    inputs: ["docs/custom/", "tests/custom/", "src/custom/"],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["docs-dir"], "docs/custom");
  assert.equal(config["tests-dir"], "tests/custom");
  assert.deepEqual(config["src-dir"], ["src", "src/custom"]);
});

test("configuration menu forces worktree rows off and dim when auto git commit is disabled", async () => {
  const cwd = createTempDir("pi-usereq-menu-worktree-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["Auto git commit", "Git worktree", "Worktree prefix", "Save and close"],
    inputs: ["custom-prefix-"],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  const defaultConfig = getDefaultConfig(cwd);
  const renderedLockedMenu = (ctx.__state.customRenderLines[1] ?? []).join("\n");
  assert.equal(config.AUTO_GIT_COMMIT, "disable");
  assert.equal(config.GIT_WORKTREE_ENABLED, "disable");
  assert.equal(config.GIT_WORKTREE_PREFIX, defaultConfig.GIT_WORKTREE_PREFIX);
  assert.match(renderedLockedMenu, /<dim>Git worktree/);
  assert.match(renderedLockedMenu, /<dim>Worktree prefix/);
});

test("configuration menu omits prompt-delivery controls and persisted config omits removed runtime fields", async () => {
  const cwd = createTempDir("pi-usereq-menu-current-session-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, { selects: ["Save and close"] });

  await command!.handler("", ctx);

  const menuItems = ctx.__state.selectCalls[0]?.items ?? [];
  assert.equal(menuItems.some((item) => item.includes("reset-context")), false);
  assert.equal(fs.existsSync(getProjectConfigPath(cwd)), false);
});

test("configuration menus expose show-config ordering and omit overview or notification-reference rows", async () => {
  const cwd = fs.mkdtempSync(
    path.join(process.env.HOME ?? process.cwd(), "pi-usereq-menu-structure-"),
  );
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, { selects: ["notifications", "Save and close", "Save and close"] });

  await command!.handler("", ctx);

  const renderedMenu = (ctx.__state.customRenderLines[0] ?? []).join("\n");
  const renderedNotificationsMenu = (ctx.__state.customRenderLines[1] ?? []).join("\n");
  assert.deepEqual(ctx.__state.selectCalls[0]?.items ?? [], [
    "Document directory",
    "Source-code directories",
    "Unit tests directory",
    "Auto git commit",
    "Git worktree",
    "Worktree prefix",
    "Language static code checkers",
    "Enable tools",
    "Notifications",
    "Debug",
    "Show configuration",
    "Reset defaults",
  ]);
  assert.ok(renderedMenu.includes(buildExpectedShowConfigPath(cwd)));
  assert.ok(renderedMenu.includes("notification:off • sound:none • pushover:off"));
  assert.ok(renderedMenu.includes("disable"));
  assert.doesNotMatch(renderedMenu, /beep:/);
  assert.match(renderedNotificationsMenu, /<dim>Enable pushover/);
  assert.match(renderedNotificationsMenu, /<dim>configure user\/token keys first<\/dim>/);
  assert.deepEqual(ctx.__state.selectCalls[1]?.items ?? [], [
    "Enable notification",
    "Notification events",
    "Notify command",
    "Enable sound (boot value)",
    "Sound events",
    "Sound toggle hotkey bind",
    "Sound command (low vol.)",
    "Sound command (mid vol.)",
    "Sound command (high vol.)",
    "Enable pushover",
    "Pushover events",
    "Pushover priority",
    "Pushover title",
    "Pushover text",
    "Pushover User Key/Delivery Group Key",
    "Pushover Token/API Token Key",
    "Reset defaults",
  ]);
});

test("show configuration saves pending config, closes the menu, and writes the persisted project config file text into the editor", async () => {
  const cwd = createTempDir("pi-usereq-menu-show-config-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["docs-dir", "show-config"],
    inputs: ["docs/custom"],
  });

  await command!.handler("", ctx);

  const persistedText = fs.readFileSync(getProjectConfigPath(cwd), "utf8");
  assert.equal(ctx.__state.editorText, persistedText);
  assert.match(ctx.__state.editorText, /"docs-dir": "docs\/custom"/);
  assert.equal(
    ctx.__state.selectCalls.filter((call) => call.title === "pi-usereq").length,
    2,
  );
});

test("descendant configuration menus end with Reset defaults only", async () => {
  const cwd = createTempDir("pi-usereq-menu-terminal-rows-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "notifications",
      "Enable sound (boot value)",
      "Save and close",
      "Pushover priority",
      "Save and close",
      "Save and close",
      "Enable tools",
      "Enable tools",
      "Save and close",
      "Save and close",
      "Debug",
      "Save and close",
      "Language static code checkers",
      "Add static code checker",
      "Save and close",
      "Remove static code checker",
      "Save and close",
      "Save and close",
      "Source-code directories",
      "Remove source-code directory",
      "Save and close",
      "Save and close",
      "Save and close",
    ],
  });

  await command!.handler("", ctx);

  const getMenuIndex = (title: string, marker?: string): number => {
    const index = ctx.__state.selectCalls.findIndex(
      (entry) => entry.title === title && (marker === undefined || entry.items.includes(marker)),
    );
    assert.notEqual(index, -1, `missing menu ${title}`);
    return index;
  };
  const getTerminalRows = (title: string, marker?: string): string[] => {
    const index = getMenuIndex(title, marker);
    return ctx.__state.selectCalls[index]!.items.slice(-1);
  };
  const getRenderedMenu = (title: string, marker?: string): string => {
    const index = getMenuIndex(title, marker);
    return (ctx.__state.customRenderLines[index] ?? []).join("\n");
  };

  assert.deepEqual(getTerminalRows("Enable sound (boot value)", "high"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("Pushover priority", "High"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("Enable tools", "static-check"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("Debug", "Log on status"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("static-check language", "Python"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("Remove static code checker"), ["Reset defaults"]);
  assert.deepEqual(getTerminalRows("Remove source-code directory", "src"), ["Reset defaults"]);
  assert.doesNotMatch(getRenderedMenu("Enable sound (boot value)", "high"), /Reset defaults.*none/);
  assert.doesNotMatch(getRenderedMenu("Pushover priority", "High"), /Reset defaults.*Normal/);
  assert.doesNotMatch(getRenderedMenu("Enable tools", "static-check"), /Reset defaults.*defaults/);
  assert.doesNotMatch(getRenderedMenu("Debug", "Log on status"), /Reset defaults.*running/);
  assert.doesNotMatch(getRenderedMenu("Remove source-code directory", "src"), /Reset defaults.*src/);
});

test("debug menu dims locked rows and persists debug settings with focus-preserving re-renders", async () => {
  const cwd = createTempDir("pi-usereq-menu-debug-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "Debug",
      "Debug",
      "Log file",
      "Log on status",
      "any",
      "Status changes",
      "Workflow events",
      "files-tokens",
      "req-analyze",
      "Save and close",
      "Save and close",
    ],
    inputs: ["logs/debug-output.json"],
  });

  await command!.handler("", ctx);

  const renderedInitialDebugMenu = (ctx.__state.customRenderLines[1] ?? []).join("\n");
  const persistedConfig = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  const debugCalls = ctx.__state.selectCalls.filter((call) => call.title === "Debug");
  assert.match(renderedInitialDebugMenu, /<dim>Log file/);
  assert.match(renderedInitialDebugMenu, /<dim>Log on status/);
  assert.match(renderedInitialDebugMenu, /<dim>Status changes/);
  assert.match(renderedInitialDebugMenu, /<dim>Workflow events/);
  assert.match(renderedInitialDebugMenu, /<dim>compress/);
  assert.equal(persistedConfig.DEBUG_ENABLED, "enable");
  assert.equal(persistedConfig.DEBUG_LOG_FILE, "logs/debug-output.json");
  assert.equal(persistedConfig.DEBUG_STATUS_CHANGES, "enable");
  assert.equal(persistedConfig.DEBUG_WORKFLOW_EVENTS, "enable");
  assert.equal(persistedConfig.DEBUG_LOG_ON_STATUS, "any");
  assert.deepEqual(persistedConfig.DEBUG_ENABLED_TOOLS, ["files-tokens"]);
  assert.deepEqual(persistedConfig.DEBUG_ENABLED_PROMPTS, ["req-analyze"]);
  assert.equal(debugCalls[1]?.selectedChoiceId, "debug-enabled");
  assert.equal(debugCalls[2]?.selectedChoiceId, "debug-log-file");
  assert.equal(debugCalls[3]?.selectedChoiceId, "debug-log-on-status");
  assert.equal(debugCalls[4]?.selectedChoiceId, "debug-status-changes");
  assert.equal(debugCalls[5]?.selectedChoiceId, "debug-workflow-events");
  assert.equal(debugCalls[6]?.selectedChoiceId, "debug-tool:files-tokens");
  assert.equal(debugCalls[7]?.selectedChoiceId, "debug-prompt:req-analyze");

  const resetCtx = createFakeCtx(cwd, {
    selects: ["Debug", "Reset defaults", "Approve reset", "Save and close"],
  });
  await command!.handler("", resetCtx);
  const resetConfig = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(resetConfig.DEBUG_ENABLED, "disable");
  assert.equal(resetConfig.DEBUG_LOG_FILE, DEFAULT_DEBUG_LOG_FILE);
  assert.equal(resetConfig.DEBUG_STATUS_CHANGES, "disable");
  assert.equal(resetConfig.DEBUG_WORKFLOW_EVENTS, DEFAULT_DEBUG_WORKFLOW_EVENTS);
  assert.equal(resetConfig.DEBUG_LOG_ON_STATUS, DEFAULT_DEBUG_LOG_ON_STATUS);
  assert.deepEqual(resetConfig.DEBUG_ENABLED_TOOLS, []);
  assert.deepEqual(resetConfig.DEBUG_ENABLED_PROMPTS, []);
});

test("debug menu rows derive from canonical tool and prompt inventories", async () => {
  const cwd = createTempDir("pi-usereq-menu-debug-inventory-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["Debug", "Save and close"]
  });

  await command!.handler("", ctx);

  assert.deepEqual(ctx.__state.selectCalls[1]?.items ?? [], [
    "Debug",
    "Log file",
    "Log on status",
    "Status changes",
    "Workflow events",
    ...[
      ...PI_USEREQ_CUSTOM_TOOL_NAMES,
      ...PI_USEREQ_EMBEDDED_TOOL_NAMES,
    ].sort(comparePiUsereqStartupToolNames),
    ...DEBUG_PROMPT_NAMES,
    "Reset defaults",
  ]);
  assert.deepEqual(
    DEBUG_PROMPT_NAMES,
    PROMPT_COMMAND_NAMES.map((promptName) => `req-${promptName}`),
  );
});

test("tool debug logging honors global enablement and workflow-status filters", async () => {
  const idleBase = createTempDir("pi-usereq-tool-debug-idle-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(idleBase)), { recursive: true });
  fs.writeFileSync(
    getProjectConfigPath(idleBase),
    `${JSON.stringify({
      ...getDefaultConfig(idleBase),
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "tool-debug.json",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_TOOLS: ["bash"],
    }, null, 2)}\n`,
    "utf8",
  );
  const idlePi = createFakePi();
  piUsereqExtension(idlePi);
  const idleCtx = createFakeCtx(idleBase);
  await idlePi.emit("session_start", { reason: "startup" }, idleCtx);
  await idlePi.emit("tool_result", {
    toolName: "bash",
    input: { command: "echo idle" },
    content: [{ type: "text", text: "idle" }],
    details: { stdout: "idle" },
    isError: false,
  }, idleCtx);
  const idleLog = JSON.parse(fs.readFileSync(path.join(idleBase, "tool-debug.json"), "utf8"));
  assert.equal(idleLog.length, 1);
  assert.equal(idleLog[0].category, "tool");
  assert.equal(idleLog[0].name, "bash");
  assert.equal(idleLog[0].workflow_state, "idle");
  assert.deepEqual(idleLog[0].input, { command: "echo idle" });
  assert.deepEqual(idleLog[0].result, {
    content: [{ type: "text", text: "idle" }],
    details: { stdout: "idle" },
  });
  assert.equal(idleLog[0].is_error, false);

  const runningFixture = initFixtureRepo();
  writeProjectConfigOverrides(runningFixture.projectBase, {
    GIT_WORKTREE_ENABLED: "disable",
    DEBUG_ENABLED: "enable",
    DEBUG_LOG_FILE: "tool-debug.json",
    DEBUG_LOG_ON_STATUS: "running",
    DEBUG_ENABLED_TOOLS: ["files-tokens"],
  });
  const runningPi = createFakePi();
  piUsereqExtension(runningPi);
  const runningCtx = createFakeCtx(runningFixture.projectBase);
  await runningPi.emit("session_start", { reason: "startup" }, runningCtx);
  await runningPi.emit("tool_result", {
    toolName: "files-tokens",
    input: { files: ["src/fixture_python.py"] },
    content: [{ type: "text", text: "idle" }],
    details: { summary: { counted_file_count: 1 } },
    isError: false,
  }, runningCtx);
  assert.equal(fs.existsSync(path.join(runningFixture.projectBase, "tool-debug.json")), false);
  const runningCommand = runningPi.commands.get("req-implement");
  assert.ok(runningCommand);
  await runningCommand!.handler("debug tools", runningCtx);
  await runningPi.emit("tool_result", {
    toolName: "files-tokens",
    input: { files: ["src/fixture_python.py"] },
    content: [{ type: "text", text: "running" }],
    details: { summary: { counted_file_count: 1 } },
    isError: false,
  }, runningCtx);
  const runningLog = JSON.parse(fs.readFileSync(path.join(runningFixture.projectBase, "tool-debug.json"), "utf8"));
  assert.equal(runningLog.length, 1);
  assert.equal(runningLog[0].workflow_state, "running");
  assert.equal(runningLog[0].name, "files-tokens");

  const disabledBase = createTempDir("pi-usereq-tool-debug-disabled-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(disabledBase)), { recursive: true });
  fs.writeFileSync(
    getProjectConfigPath(disabledBase),
    `${JSON.stringify({
      ...getDefaultConfig(disabledBase),
      DEBUG_ENABLED: "disable",
      DEBUG_LOG_FILE: "tool-debug.json",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_TOOLS: ["bash"],
    }, null, 2)}\n`,
    "utf8",
  );
  const disabledPi = createFakePi();
  piUsereqExtension(disabledPi);
  const disabledCtx = createFakeCtx(disabledBase);
  await disabledPi.emit("session_start", { reason: "startup" }, disabledCtx);
  await disabledPi.emit("tool_result", {
    toolName: "bash",
    input: { command: "echo disabled" },
    content: [{ type: "text", text: "disabled" }],
    details: { stdout: "disabled" },
    isError: false,
  }, disabledCtx);
  assert.equal(fs.existsSync(path.join(disabledBase, "tool-debug.json")), false);
});

test("prompt debug logging captures failing and successful prompt orchestration entries", async () => {
  const failingFixture = initFixtureRepo();
  fs.rmSync(path.join(failingFixture.projectBase, DEFAULT_DOCS_DIR, "WORKFLOW.md"), { force: true });
  assert.equal(spawnSync("git", ["add", "-A"], { cwd: failingFixture.projectBase, encoding: "utf8" }).status, 0);
  assert.equal(
    spawnSync("git", ["commit", "-m", "remove workflow"], { cwd: failingFixture.projectBase, encoding: "utf8" }).status,
    0,
  );
  writeProjectConfigOverrides(failingFixture.projectBase, {
    DEBUG_ENABLED: "enable",
    DEBUG_LOG_FILE: "prompt-debug.json",
    DEBUG_STATUS_CHANGES: "enable",
    DEBUG_WORKFLOW_EVENTS: "enable",
    DEBUG_LOG_ON_STATUS: "any",
    DEBUG_ENABLED_PROMPTS: ["req-change"],
  });
  const failingPi = createFakePi();
  piUsereqExtension(failingPi);
  const failingCtx = createFakeCtx(failingFixture.projectBase);
  await failingPi.emit("session_start", { reason: "startup" }, failingCtx);
  const failingCommand = failingPi.commands.get("req-change");
  assert.ok(failingCommand);
  await assert.rejects(async () => {
    await failingCommand!.handler("debug prompt", failingCtx);
  }, /Git status unclear|WORKFLOW\.md/);
  const failingLog = JSON.parse(fs.readFileSync(path.join(failingFixture.projectBase, "prompt-debug.json"), "utf8"));
  assert.ok(failingLog.some((entry: any) => entry.action === "workflow_state" && entry.result?.workflow_state === "error"));

  const successFixture = initFixtureRepo();
  writeProjectConfigOverrides(successFixture.projectBase, {
    DEBUG_ENABLED: "enable",
    DEBUG_LOG_FILE: "prompt-debug.json",
    DEBUG_STATUS_CHANGES: "enable",
    DEBUG_WORKFLOW_EVENTS: "enable",
    DEBUG_LOG_ON_STATUS: "any",
    DEBUG_ENABLED_PROMPTS: ["req-implement"],
  });
  const successPi = createFakePi();
  piUsereqExtension(successPi);
  const successCtx = createFakeCtx(successFixture.projectBase);
  await successPi.emit("session_start", { reason: "startup" }, successCtx);
  const successCommand = successPi.commands.get("req-implement");
  assert.ok(successCommand);
  await successCommand!.handler("debug prompt", successCtx);
  const promptText = String(successPi.sentUserMessages.at(-1)?.content ?? "");
  const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
  assert.ok(worktreeMatch, promptText);
  const executionBasePath = worktreeMatch?.[2] ?? "";
  await successPi.emit("before_agent_start", {}, successCtx);
  await successPi.emit("agent_start", {}, successCtx);
  fs.writeFileSync(path.join(executionBasePath, "src", "debug.ts"), "export const debug = true;\n", "utf8");
  assert.equal(spawnSync("git", ["add", "src/debug.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
  const worktreeCommit = spawnSync("git", ["commit", "-m", "debug prompt"], {
    cwd: executionBasePath,
    encoding: "utf8",
  });
  assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);
  await successPi.emit("agent_end", {
    messages: [{ role: "assistant", stopReason: "end_turn" }],
  }, successCtx);
  const successLog = JSON.parse(fs.readFileSync(path.join(successFixture.projectBase, "prompt-debug.json"), "utf8"));
  assert.ok(successLog.some((entry: any) => entry.action === "required_docs_check" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "worktree_create" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "workflow_activation" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "workflow_closure" && entry.result?.should_finalize_matched_success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "workflow_restore" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "merge" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "worktree_delete" && entry.result?.success === true));
  assert.ok(successLog.some((entry: any) => entry.action === "workflow_state" && entry.result?.workflow_state === "merging"));
  assert.ok(successLog.some((entry: any) => entry.action === "workflow_state" && entry.result?.workflow_state === "idle"));
});

test("notifications menu preserves focus on toggled and edited rows", async () => {
  const cwd = createTempDir("pi-usereq-menu-focus-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "notifications",
      "Notification events",
      "Prompt failed",
      "Save and close",
      "Notify command",
      "Save and close",
      "Save and close",
    ],
    inputs: ["echo notify"],
  });

  await command!.handler("", ctx);

  const notificationCalls = ctx.__state.selectCalls.filter((call) => call.title === "Notifications");
  assert.equal(notificationCalls[0]?.selectedChoiceId, "notify-enabled");
  assert.equal(notificationCalls[1]?.selectedChoiceId, "notification-events");
  assert.equal(notificationCalls[2]?.selectedChoiceId, "notify-command");

  const notificationEventCalls = ctx.__state.selectCalls.filter((call) => call.title === "Notification events");
  assert.deepEqual(notificationEventCalls[0]?.items ?? [], [
    "Prompt completed",
    "Prompt interrupted",
    "Prompt failed",
    "Reset defaults",
  ]);
  assert.equal(notificationEventCalls[0]?.selectedChoiceId, "notify-on-completed");
  assert.equal(notificationEventCalls[1]?.selectedChoiceId, "notify-on-failed");
});

/**
 * @brief Verifies inline toggle rows stay open and preserve selection for confirm keys.
 * @details Builds one shared settings-menu instance with a primary inline toggle and a dependent secondary row whose disabled styling changes after each toggle. The test proves `space` and `enter` must mutate the selected row in place, rebuild dependent rows without closing the menu, and preserve focus on the toggled row until explicit cancel.
 * @return {Promise<void>} Promise resolved after the raw-input interaction sequence completes.
 * @throws {AssertionError} Throws when the menu closes early, loses focus, or fails to rebuild dependent row styling after a toggle.
 * @satisfies REQ-192, TST-052
 */
test("shared settings menu keeps inline toggles focused and open for space and enter", async () => {
  let primaryEnabled = true;
  let component:
    | {
      handleInput?: (data: string) => void;
      render: (width: number) => string[];
    }
    | undefined;
  let resolved = false;
  const changes: string[] = [];
  const theme = {
    fg: (color: string, text: string) => formatFakeThemeForeground(color, text),
    bgFromFg: (color: string, text: string) => formatFakeThemeBackgroundFromForeground(color, text),
    bold: (text: string) => `<bold>${text}</bold>`,
  };
  const ctx = {
    ui: {
      async custom<T>(factory: (tui: { requestRender: () => void }, customTheme: typeof theme, keybindings: Record<string, never>, done: (value?: T) => void) => unknown) {
        let resolveResult!: (value: T | undefined) => void;
        const resultPromise = new Promise<T | undefined>((resolve) => {
          resolveResult = (value?: T) => {
            resolved = true;
            resolve(value);
          };
        });
        component = factory(
          { requestRender: () => undefined },
          theme,
          {},
          (value?: T) => resolveResult(value),
        ) as typeof component;
        return resultPromise;
      },
    },
  } as any;
  const buildChoices = () => [
    {
      id: "primary",
      label: "Primary",
      value: primaryEnabled ? "enable" : "disable",
      values: ["enable", "disable"],
      description: "Toggle the primary row in place.",
    },
    {
      id: "secondary",
      label: "Secondary",
      labelTone: primaryEnabled ? undefined : "dim",
      value: primaryEnabled ? "editable" : "locked",
      valueTone: primaryEnabled ? undefined : "dim",
      disabled: !primaryEnabled,
      description: "Dependent row that must rebuild without closing the menu.",
    },
  ] as any;

  const resultPromise = showPiUsereqSettingsMenu(
    ctx,
    "Toggle menu",
    buildChoices(),
    {
      getChoices: buildChoices,
      onChange: (choiceId: string, newValue: string) => {
        if (choiceId === "primary") {
          primaryEnabled = newValue === "enable";
          changes.push(newValue);
        }
      },
    } as any,
  );

  assert.ok(component);
  assert.doesNotMatch(component.render(120).join("\n"), /<dim>Secondary/);

  component.handleInput?.(" ");
  await Promise.resolve();
  assert.deepEqual(changes, ["disable"]);
  assert.equal(resolved, false);
  assert.match(component.render(120).join("\n"), /<dim>Secondary/);

  component.handleInput?.("\r");
  await Promise.resolve();
  assert.deepEqual(changes, ["disable", "enable"]);
  assert.equal(resolved, false);
  assert.doesNotMatch(component.render(120).join("\n"), /<dim>Secondary/);

  component.handleInput?.("\x1b");
  assert.equal(await resultPromise, undefined);
});

test("notifications reset defaults preserves non-notification settings", async () => {
  const cwd = createTempDir("pi-usereq-menu-reset-notifications-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "docs-dir",
      "notifications",
      "Enable notification",
      "Enable sound (boot value)",
      "high",
      "Reset defaults",
      "Approve reset",
      "Save and close",
      "Save and close",
    ],
    inputs: ["docs/custom"],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["docs-dir"], "docs/custom");
  assert.equal(config["notify-enabled"], false);
  assert.equal(config["notify-sound"], "none");
  assert.equal(config["notify-pushover-enabled"], false);
});

test("top-level reset defaults restores all configuration values", async () => {
  const cwd = createTempDir("pi-usereq-menu-reset-all-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "docs-dir",
      "notifications",
      "Enable notification",
      "Save and close",
      "Reset defaults",
      "Approve reset",
      "Save and close",
    ],
    inputs: ["docs/custom"],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["docs-dir"], DEFAULT_DOCS_DIR);
  assert.deepEqual(config["src-dir"], ["src"]);
  assert.equal(config["notify-enabled"], false);
  assert.equal(config["notify-sound"], "none");
});

test("configuration menus reuse CLI settings theme semantics", async () => {
  const cwd = createTempDir("pi-usereq-menu-theme-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const usedColors = new Set<string>();
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    theme: {
      fg(color: string, text: string) {
        usedColors.add(color);
        return formatFakeThemeForeground(color, text);
      },
      bgFromFg(color: string, text: string) {
        assert.ok(["accent", "muted", "dim"].includes(color));
        return formatFakeThemeBackgroundFromForeground(color, text);
      },
      bold(text: string) {
        return `<bold>${text}</bold>`;
      },
    },
  });

  await command!.handler("", ctx);

  const renderedMenu = (ctx.__state.customRenderLines[0] ?? []).join("\n");
  assert.match(renderedMenu, /<accent><bold>pi-usereq<\/bold><\/accent>/);
  assert.match(renderedMenu, /<accent>→ <\/accent>/);
  assert.match(renderedMenu, /<accent>pi-usereq\/docs<\/accent>/);
  assert.match(renderedMenu, /<muted>tests<\/muted>/);
  assert.match(renderedMenu, /<dim>/);
  assert.deepEqual([...usedColors].sort(), ["accent", "dim", "muted"]);
});

test("prompt commands use the current session by default", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    writeProjectConfigOverrides(projectBase, { GIT_WORKTREE_ENABLED: "disable" });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const command = pi.commands.get("req-analyze");
    assert.ok(command);
    const ctx = createFakeCtx(projectBase);

    await command!.handler("Inspect src/index.ts for prompt coverage", ctx);

    assert.equal(ctx.__state.waitForIdleCalls, 0);
    assert.equal(ctx.__state.newSessions.length, 0);
    assert.equal(pi.sentUserMessages.length, 1);
    assert.match(String(pi.sentUserMessages[0]?.content), /Inspect src\/index\.ts for prompt coverage/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands skip worktree creation when auto git commit is disabled", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    writeProjectConfigOverrides(projectBase, {
      AUTO_GIT_COMMIT: "disable",
      GIT_WORKTREE_ENABLED: "enable",
    });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const command = pi.commands.get("req-change");
    assert.ok(command);
    const ctx = createFakeCtx(projectBase);

    await command!.handler("Adjust docs", ctx);

    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const expectedBasePath = buildExpectedFakeBasePath(projectBase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.doesNotMatch(promptText, /created worktree/);
    assert.match(
      promptText,
      new RegExp(`worktree orchestration is disabled and context-path remains \`${expectedBasePath}\``),
    );
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands capture checking before handoff and running at prompt injection", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  let checkingStatus = "";
  let handoffStatus = "";
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);
    const originalSendUserMessage = pi.sendUserMessage.bind(pi);
    pi.sendUserMessage = (content: unknown, options?: unknown) => {
      handoffStatus = ctx.__state.statuses.get("pi-usereq") ?? "";
      originalSendUserMessage(content, options);
    };
    setPromptCommandPostCreateHookForTests(() => {
      checkingStatus = ctx.__state.statuses.get("pi-usereq") ?? "";
    });

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(
      checkingStatus,
      buildExpectedFakeStatusText({
        workflowState: "checking",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );
    assert.equal(
      handoffStatus,
      buildExpectedFakeStatusText({
        workflowState: "checking",
        basePath: buildExpectedFakeBasePath(executionBasePath),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "running",
        basePath: buildExpectedFakeBasePath(executionBasePath),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);
  } finally {
    setPromptCommandPostCreateHookForTests(undefined);
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands reject non-idle workflow state before starting a new orchestration", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    writeProjectConfigOverrides(projectBase, { GIT_WORKTREE_ENABLED: "disable" });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "running",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );

    await assert.rejects(
      pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx),
      /expected idle/,
    );
    assert.equal(pi.sentUserMessages.length, 1);
    assert.ok(ctx.__state.notifications.some((entry) => /expected idle/.test(entry.message)));
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "running",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );

    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "idle",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ 0:00 ⌛︎0:00",
      }),
    );
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands abort when git validation fails", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    fs.writeFileSync(path.join(projectBase, "DIRTY.txt"), "dirty\n", "utf8");
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await assert.rejects(
      pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx),
      /ERROR: Git status unclear!/,
    );
    assert.equal(pi.sentUserMessages.length, 0);
    assert.ok(ctx.__state.notifications.some((entry) => /ERROR: Git status unclear!/.test(entry.message)));
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "error",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands enforce the documented required-doc matrix", async () => {
  const { projectBase } = initFixtureRepo({
    fixtures: [],
    docs: {
      "REQUIREMENTS.md": "# Requirements\n",
    },
  });
  const previousCwd = process.cwd();
  try {
    const worktreeParentPath = path.dirname(projectBase);
    const initialEntries = new Set(fs.readdirSync(worktreeParentPath));
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);

    await assert.rejects(
      pi.commands.get("req-change")!.handler("Adjust docs", ctx),
      /WORKFLOW\.md/,
    );
    const createdWorktreeEntries = fs.readdirSync(worktreeParentPath)
      .filter((entry) => !initialEntries.has(entry))
      .filter((entry) => /^PI-useReq-/.test(entry));
    assert.equal(pi.sentUserMessages.length, 0);
    assert.deepEqual(createdWorktreeEntries, []);
    assert.ok(ctx.__state.notifications.some((entry) => /WORKFLOW\.md/.test(entry.message)));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-enabled prompt commands merge successful runs, restore base-path, and delete the worktree", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    const recordedStatuses: string[] = [];
    const originalSetStatus = ctx.ui.setStatus.bind(ctx.ui);
    ctx.ui.setStatus = (key: string, value?: string) => {
      if (key === "pi-usereq" && value !== undefined) {
        recordedStatuses.push(value);
      }
      originalSetStatus(key, value);
    };
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const originalBranchName = buildExpectedFakeBranchValue(projectBase);
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.match(worktreeName, /^PI-useReq-/);
    assert.ok(fs.existsSync(executionBasePath));
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(process.cwd(), executionBasePath);
    assert.equal(ctx.cwd, executionBasePath);
    assert.ok(recordedStatuses.some((status) => /<accent>status:<\/accent><warning>running<\/warning>/.test(status)));
    assert.ok(recordedStatuses.some((status) => status.includes(`${formatFakeThemeForeground("accent", "branch:")}${formatFakeThemeForeground("warning", worktreeName)}`)));

    await pi.emit("before_agent_start", {}, ctx);
    assert.equal(process.cwd(), executionBasePath);
    const filesTokensTool = pi.tools.find((candidate: RegisteredTool) => candidate.name === "files-tokens");
    assert.ok(filesTokensTool?.execute, "missing files-tokens execute handler");
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "tool-relative.ts"), "export const TOOL_RELATIVE = 1;\n", "utf8");
    const toolResult = await filesTokensTool.execute!("tool-call-id", { files: ["src/tool-relative.ts"] }, undefined, undefined, ctx) as {
      content?: Array<{ type?: string; text?: string }>;
    };
    assert.match(toolResult.content?.[0]?.text ?? "", /tool-relative\.ts/);
    await pi.emit("agent_start", {}, ctx);
    fs.writeFileSync(path.join(executionBasePath, "src", "orchestrated.ts"), "export const ORCHESTRATED = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/orchestrated.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const commit = spawnSync("git", ["commit", "-m", "worktree change"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(commit.status, 0, commit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "orchestrated.ts")));
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(ctx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
    assert.ok(recordedStatuses.some((status) => /<accent>status:<\/accent><warning>merging<\/warning>/.test(status)));
    assert.ok(recordedStatuses.some((status) => status.includes(`${formatFakeThemeForeground("accent", "branch:")}${formatFakeThemeForeground("warning", originalBranchName)}`)));
    const finalStatus = ctx.__state.statuses.get("pi-usereq") ?? "";
    assert.match(finalStatus, /<accent>status:<\/accent><warning>idle<\/warning>/);
    assert.ok(finalStatus.includes(`${formatFakeThemeForeground("accent", "branch:")}${formatFakeThemeForeground("warning", originalBranchName)}`));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies successful closure stashes tracked `base-path` changes before merge and restores them afterward.
 * @details Creates tracked `base-path` files, dirties one in the index and one in the worktree after worktree handoff, commits a worktree change, and proves prompt finalization runs `git stash`/merge/`git stash pop` semantics by merging successfully, restoring the local `base-path` changes, deleting the worktree, and surfacing a warning-only notification about the dirty restored base path.
 * @return {Promise<void>} Promise resolved after stash-assisted merge assertions complete.
 * @throws {AssertionError} Throws when finalization drops local `base-path` changes, skips the merge, or reports an error instead of a warning.
 * @satisfies REQ-208, REQ-291, REQ-292
 */
test("worktree-backed successful closure stashes tracked base-path changes, merges, restores changes, and warns about dirty base-path", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const stagedBasePath = path.join(projectBase, "staged-base.txt");
    const worktreeBasePath = path.join(projectBase, "worktree-base.txt");
    fs.writeFileSync(stagedBasePath, "staged base clean\n", "utf8");
    fs.writeFileSync(worktreeBasePath, "worktree base clean\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "staged-base.txt", "worktree-base.txt"], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    const baseCommit = spawnSync("git", ["commit", "-m", "tracked base files"], {
      cwd: projectBase,
      encoding: "utf8",
    });
    assert.equal(baseCommit.status, 0, baseCommit.stderr);

    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "stash-assisted.ts"), "export const STASH_ASSISTED = 1;\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "src/stash-assisted.ts"], {
        cwd: executionBasePath,
        encoding: "utf8",
      }).status,
      0,
    );
    const worktreeCommit = spawnSync("git", ["commit", "-m", "stash assisted change"], {
      cwd: executionBasePath,
      encoding: "utf8",
    });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    fs.writeFileSync(stagedBasePath, "staged base dirty\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "staged-base.txt"], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    fs.writeFileSync(worktreeBasePath, "worktree base dirty\n", "utf8");

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    const statusResult = spawnSync("git", ["status", "--porcelain"], {
      cwd: projectBase,
      encoding: "utf8",
    });
    assert.equal(statusResult.status, 0, statusResult.stderr);
    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "stash-assisted.ts")));
    assert.equal(fs.readFileSync(stagedBasePath, "utf8"), "staged base dirty\n");
    assert.equal(fs.readFileSync(worktreeBasePath, "utf8"), "worktree base dirty\n");
    assert.match(statusResult.stdout, /staged-base\.txt/);
    assert.match(statusResult.stdout, /worktree-base\.txt/);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(ctx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
    assert.ok(
      ctx.__state.notifications.some(
        (entry) => entry.level === "info"
          && /WARNING: Restored base-path changes after merge; base-path is not clean\./.test(entry.message),
      ),
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies prompt-command bootstrap ignores stale deleted-worktree session metadata on later commands.
 * @details Simulates the `/tmp/debug.json` follow-up failure mode: one successful worktree-backed `req-change` run restores `base-path` and deletes its worktree, then a later `req-change` invocation receives a stale command context whose `cwd` and session getters still point at the removed execution worktree. The test proves command bootstrap MUST discard deleted-worktree cwd/session residue, prepare a fresh worktree with a new identifier, and complete the second successful run without reusing the removed execution path.
 * @return {Promise<void>} Promise resolved after two successful prompt-command runs complete.
 * @throws {AssertionError} Throws when the second command aborts with the canonical git-status preflight error or reuses the deleted worktree context.
 * @satisfies REQ-200, REQ-206, REQ-208, REQ-219, REQ-257
 */
test("prompt-command bootstrap ignores stale deleted-worktree session metadata on later commands", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const firstPromptText = String(pi.sentUserMessages[0]?.content ?? "");
    const firstWorktreeMatch = firstPromptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(firstWorktreeMatch, firstPromptText);
    const firstWorktreeName = firstWorktreeMatch?.[1] ?? "";
    const firstExecutionBasePath = firstWorktreeMatch?.[2] ?? "";
    const firstExecutionSessionFile = ctx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(firstExecutionSessionFile, "");

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(firstExecutionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(firstExecutionBasePath, "src", "bootstrap-first.ts"), "export const BOOTSTRAP_FIRST = 1;\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "src/bootstrap-first.ts"], {
        cwd: firstExecutionBasePath,
        encoding: "utf8",
      }).status,
      0,
    );
    const firstCommit = spawnSync("git", ["commit", "-m", "bootstrap first"], {
      cwd: firstExecutionBasePath,
      encoding: "utf8",
    });
    assert.equal(firstCommit.status, 0, firstCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(fs.existsSync(firstExecutionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${firstWorktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );

    ctx.cwd = firstExecutionBasePath;
    ctx.sessionManager.getCwd = () => firstExecutionBasePath;
    ctx.sessionManager.getSessionFile = () => firstExecutionSessionFile;
    ctx.sessionManager.getSessionDir = () => path.dirname(firstExecutionSessionFile);

    await pi.commands.get("req-change")!.handler("Adjust docs again", ctx);
    const secondPromptText = String(pi.sentUserMessages[1]?.content ?? "");
    const secondWorktreeMatch = secondPromptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(secondWorktreeMatch, secondPromptText);
    const secondWorktreeName = secondWorktreeMatch?.[1] ?? "";
    const secondExecutionBasePath = secondWorktreeMatch?.[2] ?? "";

    assert.notEqual(secondWorktreeName, firstWorktreeName);
    assert.notEqual(secondExecutionBasePath, firstExecutionBasePath);
    assert.equal(process.cwd(), secondExecutionBasePath);
    assert.equal(ctx.cwd, secondExecutionBasePath);

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(secondExecutionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(secondExecutionBasePath, "src", "bootstrap-second.ts"), "export const BOOTSTRAP_SECOND = 1;\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "src/bootstrap-second.ts"], {
        cwd: secondExecutionBasePath,
        encoding: "utf8",
      }).status,
      0,
    );
    const secondCommit = spawnSync("git", ["commit", "-m", "bootstrap second"], {
      cwd: secondExecutionBasePath,
      encoding: "utf8",
    });
    assert.equal(secondCommit.status, 0, secondCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(fs.existsSync(secondExecutionBasePath), false);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "bootstrap-first.ts")));
    assert.ok(fs.existsSync(path.join(projectBase, "src", "bootstrap-second.ts")));
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${secondWorktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(ctx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed finalization transitions through merging, error, and idle when merge fails", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    const recordedStatuses: string[] = [];
    const originalSetStatus = ctx.ui.setStatus.bind(ctx.ui);
    ctx.ui.setStatus = (key: string, value?: string) => {
      if (key === "pi-usereq" && value !== undefined) {
        recordedStatuses.push(value);
      }
      originalSetStatus(key, value);
    };
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.writeFileSync(path.join(projectBase, "divergent.txt"), "root\n", "utf8");
    assert.equal(spawnSync("git", ["add", "divergent.txt"], { cwd: projectBase, encoding: "utf8" }).status, 0);
    const rootCommit = spawnSync("git", ["commit", "-m", "root change"], { cwd: projectBase, encoding: "utf8" });
    assert.equal(rootCommit.status, 0, rootCommit.stderr);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "merge-failed.ts"), "export const MERGE_FAILED = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/merge-failed.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "worktree change"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), true);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "merge-failed.ts")), false);
    assert.ok(fs.existsSync(path.join(projectBase, "divergent.txt")));
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.ok(recordedStatuses.some((status) => /<accent>status:<\/accent><warning>merging<\/warning>/.test(status)));
    assert.ok(recordedStatuses.some((status) => /<accent>status:<\/accent><error>\u001b\[5merror\u001b\[25m<\/error>/.test(status)));
    assert.match(ctx.__state.statuses.get("pi-usereq") ?? "", /<accent>status:<\/accent><warning>idle<\/warning>/);
    assert.ok(ctx.__state.notifications.some((entry) => /Fast-forward merge failed/.test(entry.message)));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-enabled prompt commands honor overridden worktree prefixes", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, { GIT_WORKTREE_PREFIX: "custom-prefix-" });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    assert.match(worktreeMatch?.[1] ?? "", /^custom-prefix-/);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt failures skip merge, restore base-path, and retain worktree", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";

    await pi.emit("before_agent_start", {}, ctx);
    assert.equal(process.cwd(), executionBasePath);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "failed.ts"), "export const FAILED = 1;\n", "utf8");
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "error", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), true);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "failed.ts")), false);
    assert.equal(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.ok(ctx.__state.notifications.some((entry) => entry.level === "error"
      && /Prompt closure retained worktree .* after failed outcome\./.test(entry.message)));
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "idle",
        basePath: buildExpectedFakeBasePath(projectBase),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ 0:00 ⌛︎0:00",
      }),
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt commands use replacement-session callbacks for prompt dispatch and restore base-path after merge", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const originalSessionFile = ctx.sessionManager.getSessionFile();
    const originalSwitchSession = ctx.switchSession.bind(ctx);
    let activeSessionCtx: any = ctx;
    ctx.switchSession = async (
      sessionPath: string,
      options?: { withSession?: (replacementCtx: any) => Promise<void> },
    ) => {
      const result = await originalSwitchSession(sessionPath);
      const replacementCwd = readFakeSessionFileCwd(sessionPath, projectBase);
      const replacementCtx = {
        ...ctx,
        cwd: replacementCwd,
        sessionManager: {
          ...ctx.sessionManager,
          getCwd: () => replacementCwd,
          getSessionFile: () => sessionPath,
        },
        async sendUserMessage(content: unknown, sendOptions?: unknown) {
          pi.sentUserMessages.push({ content, options: sendOptions });
        },
      };
      activeSessionCtx = replacementCtx;
      if (options?.withSession) {
        process.chdir(replacementCwd);
        await options.withSession(replacementCtx);
        ctx.cwd = projectBase;
        ctx.sessionManager.getSessionFile = () => originalSessionFile;
        ctx.sessionManager.getCwd = () => projectBase;
        return result;
      }
      ctx.cwd = projectBase;
      ctx.sessionManager.getSessionFile = () => originalSessionFile;
      ctx.sessionManager.getCwd = () => projectBase;
      process.chdir(projectBase);
      return result;
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(activeSessionCtx.cwd, executionBasePath);
    assert.equal(process.cwd(), executionBasePath);
    assert.equal(fs.existsSync(executionBasePath), true);

    await pi.emit("before_agent_start", {}, activeSessionCtx);
    await pi.emit("agent_start", {}, activeSessionCtx);

    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "with-session.ts"), "export const WITH_SESSION = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/with-session.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "with session"], {
      cwd: executionBasePath,
      encoding: "utf8",
    });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, activeSessionCtx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(activeSessionCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "with-session.ts")), true);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies worktree-backed prompt orchestration against the pi runtime session-switch contract.
 * @details Simulates the current pi runtime behavior discovered in `/tmp/pi-mono`: `ctx.switchSession(...)` exposes the replacement session through `withSession(...)` and replacement-session contexts while the host process cwd stays anchored to the original project directory until the extension updates it explicitly. The test proves prompt delivery and prompt-end closure must synchronize `process.cwd()` with the active worktree session during execution and restore `base-path` plus remove the worktree after successful merge even when the pi host leaves cwd unchanged. Runtime is dominated by temporary git worktree setup and teardown. Side effects are limited to temporary repository mutation and temporary session-file writes.
 * @return {Promise<void>} Promise resolved after prompt delivery, merge handling, and restored-base assertions complete.
 * @throws {AssertionError} Throws when prompt activation or prompt-end closure fails to synchronize `process.cwd()` with the expected session path.
 * @satisfies REQ-068, REQ-208, REQ-257, REQ-271, REQ-272
 */
test("worktree-backed prompt commands restore base-path when switchSession does not change process cwd", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    process.chdir(projectBase);
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    let activeSessionCtx: any = ctx;
    ctx.switchSession = async (
      sessionPath: string,
      options?: { withSession?: (replacementCtx: any) => Promise<void> },
    ) => {
      const replacementCwd = readFakeSessionFileCwd(sessionPath, projectBase);
      const replacementCtx = {
        ...ctx,
        cwd: replacementCwd,
        sessionManager: {
          ...ctx.sessionManager,
          getCwd: () => replacementCwd,
          getSessionFile: () => sessionPath,
        },
        switchSession: ctx.switchSession,
        async sendUserMessage(content: unknown, sendOptions?: unknown) {
          pi.sentUserMessages.push({ content, options: sendOptions });
        },
      };
      activeSessionCtx = replacementCtx;
      await options?.withSession?.(replacementCtx);
      return { cancelled: false };
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(activeSessionCtx.cwd, executionBasePath);
    assert.equal(activeSessionCtx.sessionManager.getCwd(), executionBasePath);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(process.cwd(), executionBasePath);

    await pi.emit("before_agent_start", {}, activeSessionCtx);
    await pi.emit("agent_start", {}, activeSessionCtx);

    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "runtime-anchor.ts"), "export const RUNTIME_ANCHOR = 1;\n", "utf8");
    assert.equal(
      spawnSync("git", ["add", "src/runtime-anchor.ts"], {
        cwd: executionBasePath,
        encoding: "utf8",
      }).status,
      0,
    );
    const worktreeCommit = spawnSync("git", ["commit", "-m", "runtime anchor"], {
      cwd: executionBasePath,
      encoding: "utf8",
    });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, activeSessionCtx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(activeSessionCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "runtime-anchor.ts")), true);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies restored base-path closure tolerates stale `ctx.cwd` mutations after a successful session switch.
 * @details Simulates the real pi runtime behavior observed in `/tmp/debug.json`, where restoring the original session succeeds but the old replacement-session context becomes stale immediately afterward, so mutating its `cwd` mirror throws the documented stale-extension-context error. The test proves `restorePromptCommandExecution(...)` MUST ignore that late stale mutation failure once session-target verification already succeeded, leaving prompt finalization free to continue merge and cleanup.
 * @return {Promise<void>} Promise resolved after restored-base assertions and cleanup complete.
 * @throws {AssertionError} Throws when the stale post-restore `cwd` mutation still aborts restoration.
 * @satisfies REQ-208, REQ-257, REQ-276, REQ-280, REQ-282
 */
 test("restorePromptCommandExecution ignores stale ctx.cwd mutations after a verified restore switch", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  let executionPlan: ReturnType<typeof preparePromptCommandExecution> | undefined;
  try {
    const config = loadConfig(projectBase);
    const ctx = createFakeCtx(projectBase);
    executionPlan = preparePromptCommandExecution(
      "change",
      "Adjust docs",
      projectBase,
      config,
      ctx.sessionManager.getSessionFile(),
      ctx.sessionManager.getSessionDir?.(),
      ctx.sessionManager.getBranch?.(),
    );
    const activeContext = await activatePromptCommandExecution(executionPlan, ctx);
    assert.ok(activeContext);
    let activeContextCwd = activeContext?.cwd;
    let staleAfterSwitch = false;
    Object.defineProperty(activeContext!, "cwd", {
      configurable: true,
      get() {
        return activeContextCwd;
      },
      set(value: string) {
        if (staleAfterSwitch) {
          throw new Error("This extension ctx is stale after session replacement or reload.");
        }
        activeContextCwd = value;
      },
    });
    activeContext!.switchSession = async (sessionPath: string) => {
      activeContextCwd = projectBase;
      activeContext!.sessionManager.getSessionFile = () => sessionPath;
      activeContext!.sessionManager.getSessionDir = () => path.dirname(sessionPath);
      activeContext!.sessionManager.getCwd = () => projectBase;
      process.chdir(projectBase);
      staleAfterSwitch = true;
      return { cancelled: false };
    };

    const restoredContext = await restorePromptCommandExecution(executionPlan, activeContext, {
      config,
      workflowState: "merging",
    });

    assert.equal(process.cwd(), projectBase);
    assert.equal(restoredContext, activeContext);
    assert.equal(fs.existsSync(executionPlan.worktreePath ?? ""), true);
  } finally {
    if (executionPlan) {
      await abortPromptCommandExecution(executionPlan);
    }
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies restored base-path closure tolerates getter-only `ctx.cwd` mirrors after a successful session switch.
 * @details Simulates the real pi replacement-session context shape observed during `/tmp/debug.json` triage, where `cwd` is exposed through a getter-only property. The test proves `restorePromptCommandExecution(...)` MUST treat a non-writable `cwd` mirror as advisory-only after session-target verification succeeds, instead of aborting prompt finalization with a TypeError before merge. 
 * @return {Promise<void>} Promise resolved after restored-base assertions and cleanup complete.
 * @throws {AssertionError} Throws when a getter-only `cwd` property still aborts restoration.
 * @satisfies REQ-208, REQ-257, REQ-276, REQ-282
 */
 test("restorePromptCommandExecution ignores getter-only ctx.cwd mirrors after a verified restore switch", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  let executionPlan: ReturnType<typeof preparePromptCommandExecution> | undefined;
  try {
    const config = loadConfig(projectBase);
    const ctx = createFakeCtx(projectBase);
    executionPlan = preparePromptCommandExecution(
      "change",
      "Adjust docs",
      projectBase,
      config,
      ctx.sessionManager.getSessionFile(),
      ctx.sessionManager.getSessionDir?.(),
      ctx.sessionManager.getBranch?.(),
    );
    const activeContext = await activatePromptCommandExecution(executionPlan, ctx);
    assert.ok(activeContext);
    let activeContextCwd = activeContext?.cwd;
    Object.defineProperty(activeContext!, "cwd", {
      configurable: true,
      get() {
        return activeContextCwd;
      },
    });
    activeContext!.switchSession = async (sessionPath: string) => {
      activeContextCwd = projectBase;
      activeContext!.sessionManager.getSessionFile = () => sessionPath;
      activeContext!.sessionManager.getSessionDir = () => path.dirname(sessionPath);
      activeContext!.sessionManager.getCwd = () => projectBase;
      process.chdir(projectBase);
      return { cancelled: false };
    };

    const restoredContext = await restorePromptCommandExecution(executionPlan, activeContext, {
      config,
      workflowState: "merging",
    });

    assert.equal(process.cwd(), projectBase);
    assert.equal(restoredContext, activeContext);
    assert.equal(fs.existsSync(executionPlan.worktreePath ?? ""), true);
  } finally {
    if (executionPlan) {
      await abortPromptCommandExecution(executionPlan);
    }
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies worktree-backed closure succeeds when lifecycle event contexts omit `switchSession()`.
 * @details Simulates the documented pi extension contract where lifecycle hooks receive `ExtensionContext` rather than `ExtensionCommandContext`, so `agent_end` contexts expose the active execution-session file and cwd but omit session-replacement methods. The test proves closure must reuse the persisted command-capable replacement-session context captured during activation to restore `base-path`, merge the successful worktree branch, and delete the worktree plus branch. Runtime is dominated by temporary git worktree setup, commit creation, and prompt finalization. Side effects are limited to temporary repository mutation and temporary session-file writes.
 * @return {Promise<void>} Promise resolved after closure assertions complete.
 * @throws {AssertionError} Throws when closure fails to restore `base-path`, merge the worktree, or remove worktree resources.
 * @satisfies REQ-208, REQ-209, REQ-257, REQ-272, REQ-276, TST-089
 */
test("worktree-backed closure succeeds when agent_end lifecycle contexts omit switchSession", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const commandCtx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, commandCtx);

    await pi.commands.get("req-change")!.handler("Adjust docs", commandCtx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    const executionSessionFile = commandCtx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(executionSessionFile, "");

    const eventCtx = createFakeCtx(executionBasePath);
    eventCtx.sessionManager.getSessionFile = () => executionSessionFile;
    eventCtx.sessionManager.getSessionDir = () => path.dirname(executionSessionFile);
    eventCtx.sessionManager.getCwd = () => executionBasePath;
    eventCtx.cwd = executionBasePath;
    delete eventCtx.switchSession;

    await pi.emit("before_agent_start", {}, eventCtx);
    await pi.emit("agent_start", {}, eventCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "closure-context.ts"), "export const CLOSURE_CONTEXT = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/closure-context.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "closure context"], {
      cwd: executionBasePath,
      encoding: "utf8",
    });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, eventCtx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(commandCtx.cwd, projectBase);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "closure-context.ts")));
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(commandCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies switch-triggered `session_shutdown` preserves prompt-command state for same-runtime workflow closure.
 * @details Simulates the real pi runtime ordering captured in `/tmp/debug.json`, where `ctx.switchSession(...)` can trigger `session_shutdown` before the initiating command handler resumes. The test proves the initiating runtime must preserve its in-memory workflow state plus pending prompt request across that shutdown so activation remains in `checking`, the handler transitions to `running`, and later `agent_end` restores `base-path`, merges the successful worktree branch, and deletes the worktree plus branch.
 * @return {Promise<void>} Promise resolved after session-shutdown preservation and closure assertions complete.
 * @throws {AssertionError} Throws when switch-triggered shutdown clears prompt state, logs the wrong workflow state, or prevents merge and cleanup.
 * @satisfies REQ-221, REQ-227, REQ-278, TST-090
 */
test("switch-triggered session_shutdown preserves prompt state for same-runtime workflow closure", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const originalSwitchSession = ctx.switchSession.bind(ctx);
    ctx.switchSession = async (sessionPath: string) => {
      await pi.emit("session_shutdown", {
        reason: "resume",
        targetSessionFile: sessionPath,
      }, ctx);
      return originalSwitchSession(sessionPath);
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";

    const activationLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    const shutdownEntry = activationLog.find((entry: any) => entry.action === "workflow_session_shutdown");
    assert.equal(shutdownEntry?.workflow_state, "checking");
    assert.equal(shutdownEntry?.result?.preserve_prompt_command_state, true);
    assert.equal(shutdownEntry?.result?.pending_prompt_request, true);
    assert.equal(shutdownEntry?.result?.active_prompt_request, false);
    assert.ok(activationLog.some((entry: any) => entry.action === "workflow_activation" && entry.workflow_state === "checking"));
    assert.ok(
      activationLog.some(
        (entry: any) => entry.action === "workflow_state"
          && entry.input?.from_state === "checking"
          && entry.result?.workflow_state === "running",
      ),
    );

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "shutdown-preserve.ts"), "export const SHUTDOWN_PRESERVE = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/shutdown-preserve.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "shutdown preserve"], {
      cwd: executionBasePath,
      encoding: "utf8",
    });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "shutdown-preserve.ts")));
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(ctx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies replacement-session runtimes resynchronize persisted prompt state after switch-triggered rebinding.
 * @details Simulates the real pi ordering where the new execution-session extension instance receives `session_start` before the initiating command handler finishes the post-switch `running` transition. The test proves later lifecycle hooks on the replacement-session runtime must re-read persisted prompt-command state so `agent_end` still recognizes a matched successful run, restores `base-path`, merges the worktree branch, and deletes the worktree plus branch.
 * @return {Promise<void>} Promise resolved after rebound-session closure assertions complete.
 * @throws {AssertionError} Throws when the replacement-session runtime misses the persisted `running` state and skips merge plus cleanup.
 * @satisfies REQ-227, REQ-279, TST-091
 */
test("replacement-session runtime resynchronizes persisted running state before prompt closure", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const firstPi = createFakePi();
    piUsereqExtension(firstPi);
    const firstCtx = createFakeCtx(projectBase);
    await firstPi.emit("session_start", { reason: "startup" }, firstCtx);

    const originalSessionFile = firstCtx.sessionManager.getSessionFile() ?? "";
    const originalSwitchSession = firstCtx.switchSession.bind(firstCtx);
    let reboundPi: FakePi | undefined;
    let reboundCtx: any;
    firstCtx.switchSession = async (sessionPath: string) => {
      const executionSessionCwd = readFakeSessionFileCwd(sessionPath, firstCtx.cwd);
      await firstPi.emit("session_shutdown", {
        reason: "resume",
        targetSessionFile: sessionPath,
      }, firstCtx);
      if (!reboundPi) {
        reboundPi = createFakePi();
        piUsereqExtension(reboundPi);
        reboundCtx = createFakeCtx(executionSessionCwd);
        reboundCtx.sessionManager.getSessionFile = () => sessionPath;
        reboundCtx.sessionManager.getSessionDir = () => path.dirname(sessionPath);
        reboundCtx.sessionManager.getCwd = () => executionSessionCwd;
        reboundCtx.cwd = executionSessionCwd;
        await reboundPi.emit("session_start", {
          reason: "resume",
          previousSessionFile: originalSessionFile,
        }, reboundCtx);
      }
      return originalSwitchSession(sessionPath);
    };

    await firstPi.commands.get("req-change")!.handler("Adjust docs", firstCtx);
    assert.ok(reboundPi);
    assert.ok(reboundCtx);
    const promptText = String(firstPi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";

    await reboundPi!.emit("before_agent_start", {}, reboundCtx);
    await reboundPi!.emit("agent_start", {}, reboundCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "rebound-running.ts"), "export const REBOUND_RUNNING = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/rebound-running.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const reboundCommit = spawnSync("git", ["commit", "-m", "rebound running"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(reboundCommit.status, 0, reboundCommit.stderr);

    await reboundPi!.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, reboundCtx);

    const debugLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    assert.ok(
      debugLog.some(
        (entry: any) => entry.action === "workflow_closure"
          && entry.result?.should_finalize_matched_success === true,
      ),
    );
    assert.equal(process.cwd(), projectBase);
    assert.equal(reboundCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "rebound-running.ts")), true);
    assert.equal(reboundCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies `running` is persisted before async replacement-session prompt delivery completes.
 * @details Simulates the real pi runtime behavior visible in `/tmp/debug.json`, where replacement-session `sendUserMessage(...)` does not resolve until the prompt run has already reached `agent_end`. The test proves `req-<prompt>` must transition and persist `running` immediately after prompt handoff begins, so a rebound execution-session runtime can still finalize the matched successful closure while the initiating command handler remains blocked on prompt-delivery completion.
 * @return {Promise<void>} Promise resolved after delayed prompt delivery, rebound closure, and cleanup assertions complete.
 * @throws {AssertionError} Throws when `running` is delayed until after `agent_end`, causing closure to skip merge or cleanup.
 * @satisfies REQ-227, REQ-279, REQ-281, TST-093
 */
test("replacement-session prompt delivery persists running before async sendUserMessage resolves", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const firstPi = createFakePi();
    piUsereqExtension(firstPi);
    const firstCtx = createFakeCtx(projectBase);
    await firstPi.emit("session_start", { reason: "startup" }, firstCtx);

    const originalSessionFile = firstCtx.sessionManager.getSessionFile() ?? "";
    const originalSwitchSession = firstCtx.switchSession.bind(firstCtx);
    let reboundPi: FakePi | undefined;
    let reboundCtx: any;
    let resolvePromptDelivery: (() => void) | undefined;
    let handoffStatus = "";
    firstCtx.switchSession = async (
      sessionPath: string,
      options?: { withSession?: (replacementCtx: any) => Promise<void> },
    ) => {
      const executionSessionCwd = readFakeSessionFileCwd(sessionPath, firstCtx.cwd);
      await firstPi.emit("session_shutdown", {
        reason: "resume",
        targetSessionFile: sessionPath,
      }, firstCtx);
      if (!reboundPi) {
        reboundPi = createFakePi();
        piUsereqExtension(reboundPi);
        reboundCtx = createFakeCtx(executionSessionCwd);
        reboundCtx.sessionManager.getSessionFile = () => sessionPath;
        reboundCtx.sessionManager.getSessionDir = () => path.dirname(sessionPath);
        reboundCtx.sessionManager.getCwd = () => executionSessionCwd;
        reboundCtx.cwd = executionSessionCwd;
        await reboundPi.emit("session_start", {
          reason: "resume",
          previousSessionFile: originalSessionFile,
        }, reboundCtx);
      }
      const switchResult = await originalSwitchSession(sessionPath);
      const replacementCtx = {
        ...firstCtx,
        cwd: executionSessionCwd,
        sessionManager: {
          ...firstCtx.sessionManager,
          getCwd: () => executionSessionCwd,
          getSessionFile: () => sessionPath,
          getSessionDir: () => path.dirname(sessionPath),
        },
        switchSession: firstCtx.switchSession,
        async sendUserMessage(content: unknown, sendOptions?: unknown) {
          handoffStatus = firstCtx.__state.statuses.get("pi-usereq") ?? "";
          firstPi.sentUserMessages.push({ content, options: sendOptions });
          await new Promise<void>((resolve) => {
            resolvePromptDelivery = resolve;
          });
        },
      };
      await options?.withSession?.(replacementCtx);
      return switchResult;
    };

    const handlerPromise = firstPi.commands.get("req-change")!.handler("Adjust docs", firstCtx);
    for (let attempt = 0; attempt < 20 && resolvePromptDelivery === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(resolvePromptDelivery);
    assert.ok(reboundPi);
    assert.ok(reboundCtx);
    const promptText = String(firstPi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";

    assert.equal(
      handoffStatus,
      buildExpectedFakeStatusText({
        workflowState: "checking",
        basePath: buildExpectedFakeBasePath(executionBasePath),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );
    assert.equal(
      firstCtx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        workflowState: "running",
        basePath: buildExpectedFakeBasePath(executionBasePath),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );

    await reboundPi!.emit("before_agent_start", {}, reboundCtx);
    await reboundPi!.emit("agent_start", {}, reboundCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "delayed-running.ts"), "export const DELAYED_RUNNING = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/delayed-running.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const reboundCommit = spawnSync("git", ["commit", "-m", "delayed running"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(reboundCommit.status, 0, reboundCommit.stderr);

    await reboundPi!.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, reboundCtx);

    const debugLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    assert.ok(
      debugLog.some(
        (entry: any) => entry.action === "workflow_closure"
          && entry.result?.should_finalize_matched_success === true,
      ),
    );

    resolvePromptDelivery!();
    await handlerPromise;

    assert.equal(process.cwd(), projectBase);
    assert.equal(reboundCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "delayed-running.ts")), true);
    assert.equal(reboundCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies late stale replacement-session prompt-delivery rejections do not abort successful worktree closure.
 * @details Simulates the real pi runtime behavior observed in `/tmp/debug.json`, where the replacement-session `sendUserMessage(...)` promise rejects with the stale-extension-context error only after prompt-end restoration switches back to the original session. The test proves the initiating `req-<prompt>` handler MUST ignore that late stale rejection once workflow ownership has already advanced beyond `running`, allowing the rebound execution-session runtime to restore `base-path`, merge from `base-path`, and delete the worktree plus branch.
 * @return {Promise<void>} Promise resolved after stale delivery rejection, matched-success closure, and cleanup assertions complete.
 * @throws {AssertionError} Throws when the late stale rejection bubbles out of the command handler or prevents merge plus cleanup.
 * @satisfies REQ-208, REQ-276, REQ-278, REQ-279, REQ-280, REQ-281, REQ-282
 */
 test("late stale replacement-session prompt-delivery rejections do not interrupt worktree closure", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const firstPi = createFakePi();
    piUsereqExtension(firstPi);
    const firstCtx = createFakeCtx(projectBase);
    await firstPi.emit("session_start", { reason: "startup" }, firstCtx);

    const originalSessionFile = firstCtx.sessionManager.getSessionFile() ?? "";
    const originalSwitchSession = firstCtx.switchSession.bind(firstCtx);
    let reboundPi: FakePi | undefined;
    let reboundCtx: any;
    let rejectPromptDelivery: ((error: unknown) => void) | undefined;
    firstCtx.switchSession = async (
      sessionPath: string,
      options?: { withSession?: (replacementCtx: any) => Promise<void> },
    ) => {
      const replacementCwd = readFakeSessionFileCwd(sessionPath, firstCtx.cwd);
      await firstPi.emit("session_shutdown", {
        reason: "resume",
        targetSessionFile: sessionPath,
      }, firstCtx);
      if (!reboundPi) {
        reboundPi = createFakePi();
        piUsereqExtension(reboundPi);
        reboundCtx = createFakeCtx(replacementCwd);
        reboundCtx.sessionManager.getSessionFile = () => sessionPath;
        reboundCtx.sessionManager.getSessionDir = () => path.dirname(sessionPath);
        reboundCtx.sessionManager.getCwd = () => replacementCwd;
        reboundCtx.cwd = replacementCwd;
        await reboundPi.emit("session_start", {
          reason: "resume",
          previousSessionFile: originalSessionFile,
        }, reboundCtx);
      }
      const switchResult = await originalSwitchSession(sessionPath);
      const replacementCtx = {
        ...firstCtx,
        cwd: replacementCwd,
        sessionManager: {
          ...firstCtx.sessionManager,
          getCwd: () => replacementCwd,
          getSessionFile: () => sessionPath,
          getSessionDir: () => path.dirname(sessionPath),
        },
        switchSession: firstCtx.switchSession,
        async sendUserMessage(content: unknown, sendOptions?: unknown) {
          firstPi.sentUserMessages.push({ content, options: sendOptions });
          await new Promise<void>((_resolve, reject) => {
            rejectPromptDelivery = reject;
          });
        },
      };
      if (path.resolve(sessionPath) === path.resolve(originalSessionFile)) {
        rejectPromptDelivery?.(
          new Error("This extension ctx is stale after session replacement or reload."),
        );
        rejectPromptDelivery = undefined;
      }
      await options?.withSession?.(replacementCtx);
      return switchResult;
    };

    const handlerPromise = firstPi.commands.get("req-change")!.handler("Adjust docs", firstCtx);
    const handlerOutcomePromise = handlerPromise.then(
      () => ({ error: undefined as unknown }),
      (error) => ({ error }),
    );
    for (let attempt = 0; attempt < 20 && rejectPromptDelivery === undefined; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.ok(rejectPromptDelivery);
    assert.ok(reboundPi);
    assert.ok(reboundCtx);
    const promptText = String(firstPi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    const executionSessionFile = firstCtx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(executionSessionFile, "");

    await reboundPi!.emit("before_agent_start", {}, reboundCtx);
    await reboundPi!.emit("agent_start", {}, reboundCtx);

    const persistedContext = readPersistedPromptCommandSessionContext(executionSessionFile);
    assert.ok(persistedContext);
    reboundCtx.switchSession = async (sessionPath: string) => {
      assert.equal(path.resolve(sessionPath), path.resolve(originalSessionFile));
      const pendingPromptDeliveryRejection = rejectPromptDelivery;
      rejectPromptDelivery = undefined;
      queueMicrotask(() => {
        pendingPromptDeliveryRejection?.(
          new Error("This extension ctx is stale after session replacement or reload."),
        );
      });
      reboundCtx.cwd = projectBase;
      reboundCtx.sessionManager.getSessionFile = () => originalSessionFile;
      reboundCtx.sessionManager.getSessionDir = () => path.dirname(originalSessionFile);
      reboundCtx.sessionManager.getCwd = () => projectBase;
      process.chdir(projectBase);
      return { cancelled: false };
    };

    await Promise.race([
      reboundPi!.emit("agent_end", {
        messages: [{ role: "assistant", stopReason: "stop", content: [] }],
      }, reboundCtx),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("agent_end timed out")), 1_000);
      }),
    ]);
    assert.equal(rejectPromptDelivery, undefined);
    const handlerOutcome = await Promise.race([
      handlerOutcomePromise,
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error("handler timed out")), 1_000);
      }),
    ]);
    assert.equal(handlerOutcome.error, undefined);

    const debugLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    assert.ok(debugLog.some((entry: any) => entry.action === "workflow_restore" && entry.result?.success === true));
    assert.ok(debugLog.some((entry: any) => entry.action === "merge" && entry.result?.success === true));
    assert.equal(process.cwd(), projectBase);
    assert.equal(reboundCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(reboundCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt execution survives switch-triggered extension rebinding", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const firstPi = createFakePi();
    piUsereqExtension(firstPi);
    const firstCtx = createFakeCtx(projectBase);
    await firstPi.emit("session_start", { reason: "startup" }, firstCtx);

    await firstPi.commands.get("req-change")!.handler("Adjust docs", firstCtx);
    const promptText = String(firstPi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";
    const executionSessionFile = firstCtx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(executionSessionFile, "");

    const reboundPi = createFakePi();
    piUsereqExtension(reboundPi);
    const reboundCtx = createFakeCtx(executionBasePath);
    reboundCtx.sessionManager.getSessionFile = () => executionSessionFile;
    reboundCtx.sessionManager.getSessionDir = () => path.dirname(executionSessionFile);
    reboundCtx.sessionManager.getCwd = () => executionBasePath;
    reboundCtx.cwd = executionBasePath;
    await reboundPi.emit("session_start", {
      reason: "resume",
      previousSessionFile: firstCtx.sessionManager.getSessionFile(),
    }, reboundCtx);

    await reboundPi.emit("before_agent_start", {}, reboundCtx);
    await reboundPi.emit("agent_start", {}, reboundCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "rebound.ts"), "export const REBOUND = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/rebound.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const reboundCommit = spawnSync("git", ["commit", "-m", "rebound"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(reboundCommit.status, 0, reboundCommit.stderr);

    await reboundPi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, reboundCtx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(reboundCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "rebound.ts")), true);
    assert.equal(reboundCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Reproduces the defect where `ctx.switchSession(sessionPath)` ignores a `withSession` option and leaves the handler-scoped ctx frozen on the pre-switch session.
 * @details Simulates the real pi SDK contract observed in `@mariozechner/pi-coding-agent`, where `ctx.switchSession(sessionPath)` accepts a single argument, never invokes caller-supplied callbacks, and never mutates `ctx.cwd` or `ctx.sessionManager`. The test proves that worktree-backed `req-<prompt>` activation must succeed against that contract by relying on the persisted session-file header and `process.cwd()` instead of the stale handler-scoped `ctx` probes. Runtime is dominated by temporary git worktree setup and teardown. Side effects are limited to temporary repository mutation and temporary session-file writes.
 * @return {Promise<void>} Promise resolved after prompt delivery, activation, and assertions complete.
 * @throws {AssertionError} Throws when prompt activation aborts even though the persisted execution-session file and the host `process.cwd()` both match the worktree path.
 * @satisfies REQ-068, REQ-208, REQ-257, REQ-271, REQ-272
 */
test("worktree-backed prompt commands activate when ctx.switchSession only accepts a single argument and leaves handler ctx stale", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    process.chdir(projectBase);
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const frozenSessionFile = ctx.sessionManager.getSessionFile() ?? "";
    const frozenSessionCwd = ctx.sessionManager.getCwd();
    ctx.switchSession = async (sessionPath: string, ..._ignored: unknown[]) => {
      // Mirror the real pi SDK: accept only sessionPath, never mutate ctx.cwd or ctx.sessionManager.
      void sessionPath;
      return { cancelled: false };
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(process.cwd(), executionBasePath);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(ctx.sessionManager.getSessionFile(), frozenSessionFile);
    assert.equal(ctx.sessionManager.getCwd(), frozenSessionCwd);
    assert.equal(
      ctx.__state.notifications.some((entry) => /Prompt execution activation expected/.test(entry.message)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt commands tolerate stale ctx.sessionManager probes after switchSession returns non-cancelled", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const originalSessionFile = ctx.sessionManager.getSessionFile();
    const originalSessionCwd = ctx.sessionManager.getCwd();
    const originalSwitchSession = ctx.switchSession.bind(ctx);
    ctx.switchSession = async (sessionPath: string) => {
      // Mirror the real pi SDK: session switching runs internally but ctx.sessionManager stays frozen.
      const result = await originalSwitchSession(sessionPath);
      ctx.sessionManager.getSessionFile = () => originalSessionFile;
      ctx.sessionManager.getCwd = () => originalSessionCwd;
      return result;
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(process.cwd(), executionBasePath);
    assert.equal(ctx.sessionManager.getSessionFile(), originalSessionFile);
    assert.equal(ctx.sessionManager.getCwd(), originalSessionCwd);
    assert.equal(
      ctx.__state.notifications.some((entry) => /Prompt execution activation expected/.test(entry.message)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt commands tolerate a pending-persistence execution-session file when process.cwd() is aligned with worktree-path", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    const originalSwitchSession = ctx.switchSession.bind(ctx);
    ctx.switchSession = async (sessionPath: string) => {
      const result = await originalSwitchSession(sessionPath);
      // Simulate pi's lazy session-file persistence: ctx.switchSession returns non-cancelled and realigns process.cwd(), but pi defers writing the session file until the first assistant flush.
      if (typeof sessionPath === "string" && fs.existsSync(sessionPath)) {
        fs.rmSync(sessionPath, { force: true });
      }
      return result;
    };

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionBasePath = worktreeMatch?.[2] ?? "";
    assert.equal(process.cwd(), executionBasePath);
    assert.equal(
      ctx.__state.notifications.some((entry) => /Prompt execution activation expected session/.test(entry.message)),
      false,
    );
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt commands abort before prompt dispatch when the persisted execution-session header cwd diverges from worktree-path", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    const originalSwitchSession = ctx.switchSession.bind(ctx);
    ctx.switchSession = async (sessionPath: string) => {
      const result = await originalSwitchSession(sessionPath);
      // Simulate pi runtimes that persist a tampered header cwd, forcing the on-disk cwd verification to fail.
      if (typeof sessionPath === "string" && fs.existsSync(sessionPath)) {
        const tamperedHeader = `${JSON.stringify({ type: "session", cwd: projectBase })}\n`;
        fs.writeFileSync(sessionPath, tamperedHeader, "utf8");
      }
      return result;
    };

    await assert.rejects(
      pi.commands.get("req-change")!.handler("Adjust docs", ctx),
      /Prompt execution activation expected session/,
    );

    assert.equal(pi.sentUserMessages.length, 0);
    assert.ok(ctx.__state.notifications.some((entry) => /Prompt execution activation expected session/.test(entry.message)));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed successful merge stops before merge when fork-session verification cannot reattach", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, ctx);

    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const executionSessionFile = ctx.sessionManager.getSessionFile();
    const executionBasePath = worktreeMatch?.[2] ?? "";

    await pi.emit("before_agent_start", {}, ctx);
    await pi.emit("agent_start", {}, ctx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "restore-failed.ts"), "export const RESTORE_FAILED = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/restore-failed.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "worktree change"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    // Simulate a pi runtime that rewrites the execution-session header with a divergent cwd at prompt-end so closure verification must abort before merge.
    assert.equal(typeof executionSessionFile, "string");
    if (typeof executionSessionFile === "string" && fs.existsSync(executionSessionFile)) {
      const tamperedHeader = `${JSON.stringify({ type: "session", cwd: projectBase })}\n`;
      fs.writeFileSync(executionSessionFile, tamperedHeader, "utf8");
    }
    // Make ctx.sessionManager report a stale session file path so base-path restoration performs an explicit switch attempt after finalization verification fails.
    ctx.sessionManager.getSessionFile = () => path.join(projectBase, "stale-execution-session.jsonl");
    ctx.switchSession = async (_sessionPath: string) => ({ cancelled: false });

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(process.cwd(), projectBase);
    assert.equal(ctx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), true);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "restore-failed.ts")), false);
    assert.ok(ctx.__state.notifications.some((entry) => /Prompt execution finalization expected session/.test(entry.message)));
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies successful closure merges from `base-path` even when end-of-session timing already moved the persisted replacement context off the worktree session.
 * @details Simulates real pi session-end timing such as automatic compaction or other CLI housekeeping that can advance the live replacement-session context back to the original base session before the `agent_end` lifecycle hook executes. The persisted command-capable context is forced to report the original base session and to reject any attempt to reattach the execution session. The test proves prompt-end closure must restore `base-path` and merge directly from `base-path` using persisted execution artifacts instead of failing on a best-effort reactivation of the worktree session.
 * @return {Promise<void>} Promise resolved after closure assertions complete.
 * @throws {AssertionError} Throws when closure attempts an execution-session reattach or skips the merge plus cleanup.
 * @satisfies REQ-208, REQ-209, REQ-282, TST-094
 */
test("worktree-backed closure merges from base-path when end-of-session timing already moved the persisted context", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const commandCtx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, commandCtx);

    const originalSessionFile = commandCtx.sessionManager.getSessionFile() ?? "";
    await pi.commands.get("req-change")!.handler("Adjust docs", commandCtx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    const executionSessionFile = commandCtx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(executionSessionFile, "");

    await pi.emit("before_agent_start", {}, commandCtx);
    await pi.emit("agent_start", {}, commandCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "base-merge.ts"), "export const BASE_MERGE = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/base-merge.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "base merge"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    const persistedContext = readPersistedPromptCommandSessionContext(executionSessionFile) as any;
    assert.ok(persistedContext);
    persistedContext.cwd = projectBase;
    persistedContext.sessionManager.getSessionFile = () => originalSessionFile;
    persistedContext.sessionManager.getSessionDir = () => path.dirname(originalSessionFile);
    persistedContext.sessionManager.getCwd = () => projectBase;
    persistedContext.switchSession = async (sessionPath: string) => {
      if (path.resolve(sessionPath) !== path.resolve(originalSessionFile)) {
        throw new Error(`Unexpected execution-session reattach: ${sessionPath}`);
      }
      process.chdir(projectBase);
      return { cancelled: false };
    };

    const eventCtx = createFakeCtx(projectBase);
    eventCtx.sessionManager.getSessionFile = () => originalSessionFile;
    eventCtx.sessionManager.getSessionDir = () => path.dirname(originalSessionFile);
    eventCtx.sessionManager.getCwd = () => projectBase;
    eventCtx.cwd = projectBase;
    delete eventCtx.switchSession;
    process.chdir(projectBase);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, eventCtx);

    const debugLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    assert.ok(debugLog.some((entry: any) => entry.action === "workflow_restore" && entry.result?.success === true));
    assert.ok(debugLog.some((entry: any) => entry.action === "merge" && entry.result?.success === true));
    assert.equal(process.cwd(), projectBase);
    assert.equal(eventCtx.cwd, projectBase);
    assert.ok(fs.existsSync(path.join(projectBase, "src", "base-merge.ts")));
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(eventCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

/**
 * @brief Verifies matched successful closure ignores stale session-switch errors after restored base-path verification.
 * @details Simulates the real pi runtime behavior observed in `/tmp/debug.json`, where switching the persisted command-capable replacement-session context back to the original session completes the base-path reattachment but still surfaces the stale-extension-context error from the invalidated execution-session closure. The test proves prompt-end closure MUST treat that stale switch error as ignorable after the restored base session verifies successfully, then continue the fast-forward merge plus worktree deletion.
 * @return {Promise<void>} Promise resolved after restored-base verification, merge, and cleanup assertions complete.
 * @throws {AssertionError} Throws when the stale restore-switch error prevents merge plus cleanup.
 * @satisfies REQ-208, REQ-276, REQ-280, REQ-282
 */
 test("worktree-backed closure ignores stale restore-switch errors after base-path verification", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  try {
    writeProjectConfigOverrides(projectBase, {
      DEBUG_ENABLED: "enable",
      DEBUG_LOG_FILE: "prompt-debug.json",
      DEBUG_STATUS_CHANGES: "enable",
      DEBUG_WORKFLOW_EVENTS: "enable",
      DEBUG_LOG_ON_STATUS: "any",
      DEBUG_ENABLED_PROMPTS: ["req-change"],
    });
    const pi = createFakePi();
    piUsereqExtension(pi);
    const commandCtx = createFakeCtx(projectBase);
    await pi.emit("session_start", { reason: "startup" }, commandCtx);

    const originalSessionFile = commandCtx.sessionManager.getSessionFile() ?? "";
    await pi.commands.get("req-change")!.handler("Adjust docs", commandCtx);
    const promptText = String(pi.sentUserMessages[0]?.content ?? "");
    const worktreeMatch = promptText.match(/created worktree-dir `([^`]+)` and prepared context-path `([^`]+)`\./);
    assert.ok(worktreeMatch, promptText);
    const worktreeName = worktreeMatch?.[1] ?? "";
    const executionBasePath = worktreeMatch?.[2] ?? "";
    const executionSessionFile = commandCtx.sessionManager.getSessionFile() ?? "";
    assert.notEqual(executionSessionFile, "");

    await pi.emit("before_agent_start", {}, commandCtx);
    await pi.emit("agent_start", {}, commandCtx);
    fs.mkdirSync(path.join(executionBasePath, "src"), { recursive: true });
    fs.writeFileSync(path.join(executionBasePath, "src", "stale-restore.ts"), "export const STALE_RESTORE = 1;\n", "utf8");
    assert.equal(spawnSync("git", ["add", "src/stale-restore.ts"], { cwd: executionBasePath, encoding: "utf8" }).status, 0);
    const worktreeCommit = spawnSync("git", ["commit", "-m", "stale restore"], { cwd: executionBasePath, encoding: "utf8" });
    assert.equal(worktreeCommit.status, 0, worktreeCommit.stderr);

    const persistedContext = readPersistedPromptCommandSessionContext(executionSessionFile) as any;
    assert.ok(persistedContext);
    persistedContext.cwd = projectBase;
    persistedContext.sessionManager.getSessionFile = () => originalSessionFile;
    persistedContext.sessionManager.getSessionDir = () => path.dirname(originalSessionFile);
    persistedContext.sessionManager.getCwd = () => projectBase;
    persistedContext.switchSession = async (sessionPath: string) => {
      assert.equal(path.resolve(sessionPath), path.resolve(originalSessionFile));
      process.chdir(projectBase);
      persistedContext.cwd = projectBase;
      throw new Error("This extension ctx is stale after session replacement or reload.");
    };

    const eventCtx = createFakeCtx(projectBase);
    eventCtx.sessionManager.getSessionFile = () => originalSessionFile;
    eventCtx.sessionManager.getSessionDir = () => path.dirname(originalSessionFile);
    eventCtx.sessionManager.getCwd = () => projectBase;
    eventCtx.cwd = projectBase;
    delete eventCtx.switchSession;
    process.chdir(projectBase);

    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, eventCtx);

    const debugLog = JSON.parse(fs.readFileSync(path.join(projectBase, "prompt-debug.json"), "utf8"));
    assert.ok(debugLog.some((entry: any) => entry.action === "workflow_restore" && entry.result?.success === true));
    assert.ok(debugLog.some((entry: any) => entry.action === "merge" && entry.result?.success === true));
    assert.equal(process.cwd(), projectBase);
    assert.equal(eventCtx.cwd, projectBase);
    assert.equal(fs.existsSync(executionBasePath), false);
    assert.equal(fs.existsSync(path.join(projectBase, "src", "stale-restore.ts")), true);
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${worktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.equal(eventCtx.__state.notifications.filter((entry) => entry.level === "error").length, 0);
  } finally {
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("worktree-backed prompt commands abort before prompt dispatch when post-create verification fails", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  const previousCwd = process.cwd();
  const originalExistsSync = fs.existsSync;
  let failedWorktreeName = "";
  let failedWorktreePath = "";
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(projectBase);
    setPromptCommandPostCreateHookForTests(({ worktreeDir, worktreeRootPath, worktreePath }) => {
      failedWorktreeName = worktreeDir;
      failedWorktreePath = worktreePath;
      fs.existsSync = ((candidatePath: Parameters<typeof fs.existsSync>[0]) => {
        const normalizedPath = typeof candidatePath === "string" ? candidatePath : String(candidatePath);
        if (normalizedPath === worktreePath || normalizedPath === worktreeRootPath) {
          return false;
        }
        return originalExistsSync(candidatePath);
      }) as typeof fs.existsSync;
    });

    await assert.rejects(
      pi.commands.get("req-change")!.handler("Adjust docs", ctx),
      /ERROR: Worktree verification failed/,
    );

    assert.equal(pi.sentUserMessages.length, 0);
    fs.existsSync = originalExistsSync;
    assert.equal(fs.existsSync(failedWorktreePath), false);
    assert.notEqual(failedWorktreeName, "");
    assert.notEqual(
      spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${failedWorktreeName}`], {
        cwd: projectBase,
        encoding: "utf8",
      }).status,
      0,
    );
    assert.ok(ctx.__state.notifications.some((entry) => /Worktree verification failed/.test(entry.message)));
  } finally {
    fs.existsSync = originalExistsSync;
    setPromptCommandPostCreateHookForTests(undefined);
    process.chdir(previousCwd);
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("prompt commands remain functional when custom tool registrations are removed from the runtime inventory", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  try {
    writeProjectConfigOverrides(projectBase, { GIT_WORKTREE_ENABLED: "disable" });
    const pi = createFakePi();
    piUsereqExtension(pi);
    pi.tools.splice(0, pi.tools.length);
    const ctx = createFakeCtx(projectBase);

    await pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx);

    assert.equal(pi.sentUserMessages.length, 1);
    assert.match(String(pi.sentUserMessages[0]?.content ?? ""), /Inspect src\/index\.ts/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("session_start applies configured pi-usereq startup tools", async () => {
  const cwd = createTempDir("pi-usereq-tools-startup-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  fs.writeFileSync(
    getProjectConfigPath(cwd),
    `${JSON.stringify({
      "docs-dir": DEFAULT_DOCS_DIR,
      "tests-dir": "tests",
      "src-dir": ["src", "foobar"],
      "static-check": {},
      "enabled-tools": ["files-tokens", "static-check"],
    }, null, 2)}\n`,
    "utf8",
  );

  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd);
  await pi.emit("session_start", { reason: "startup" }, ctx);

  const activeTools = new Set(pi.getActiveTools());
  assert.deepEqual([...activeTools].sort(), ["files-tokens", "static-check"]);
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src", "foobar"],
      contextFilledCells: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

test("session_start renders the 0-percent context icon when context usage is empty", async () => {
  const cwd = createTempDir("pi-usereq-context-empty-status-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ tokens: 0, contextWindow: 1000, percent: 0 }),
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);

  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      contextPercent: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

/**
 * @brief Verifies direct status renders refresh context usage before drawing the footer.
 * @details Exercises `renderPiUsereqStatus(...)` without going through an intercepted lifecycle hook, then mutates the fake `getContextUsage()` result to simulate a post-compaction context reset. The test proves direct rerender call sites must fetch fresh context usage so the `context:` gauge updates immediately instead of reusing stale controller state.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when a direct render ignores the live `getContextUsage()` snapshot or fails to clear the gauge after context reset.
 * @satisfies REQ-118, REQ-119, REQ-122, REQ-284
 */
test("direct status rerenders refresh the context gauge after context reset", () => {
  const cwd = createTempDir("pi-usereq-context-direct-render-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const controller = createPiUsereqStatusController();
  setPiUsereqStatusConfig(controller, getDefaultConfig(cwd));
  const contextUsage: { tokens: number | null; contextWindow: number; percent: number | null } = {
    tokens: 910,
    contextWindow: 1000,
    percent: 91,
  };
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ ...contextUsage }),
  });

  renderPiUsereqStatus(controller, ctx);
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 10,
      contextPercent: 91,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );

  contextUsage.tokens = null;
  contextUsage.percent = null;
  renderPiUsereqStatus(controller, ctx);
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      contextPercent: null,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

/**
 * @brief Verifies stale replacement contexts do not break workflow-state rendering.
 * @details Simulates the guarded pi runtime error thrown when an extension context is accessed after session replacement or reload. The test proves workflow-state updates must preserve internal state while suppressing stale-context render failures instead of surfacing extension errors.
 * @return {void} No return value.
 * @throws {AssertionError} Throws when stale-context rendering escapes or leaves the stale context cached for later renders.
 * @satisfies REQ-280, TST-092
 */
test("stale replacement contexts do not break workflow-state rendering", () => {
  const cwd = createTempDir("pi-usereq-stale-render-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const controller = createPiUsereqStatusController();
  setPiUsereqStatusConfig(controller, getDefaultConfig());
  const staleCtx = createFakeCtx(cwd);
  Object.defineProperty(staleCtx, "ui", {
    configurable: true,
    get() {
      throw new Error("This extension instance is stale after session replacement or reload. Use the provided replacement-session context instead.");
    },
  });

  assert.doesNotThrow(() => {
    setPiUsereqWorkflowState(controller, "running", staleCtx);
  });
  assert.equal(controller.state.workflowState, "running");
  assert.equal(controller.latestContext, undefined);
});

test("extension registers wrappers for all pi-usereq status hooks", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  assert.deepEqual(
    [...pi.eventHandlers.keys()].sort(),
    [
      "agent_end",
      "agent_start",
      "before_agent_start",
      "before_provider_request",
      "context",
      "input",
      "message_end",
      "message_start",
      "message_update",
      "model_select",
      "resources_discover",
      "session_before_compact",
      "session_before_fork",
      "session_before_switch",
      "session_before_tree",
      "session_compact",
      "session_shutdown",
      "session_start",
      "session_tree",
      "tool_call",
      "tool_execution_end",
      "tool_execution_start",
      "tool_execution_update",
      "tool_result",
      "turn_end",
      "turn_start",
      "user_bash",
    ],
  );
});

test("context hook refreshes context usage and rounds progress cells upward", async () => {
  const cwd = createTempDir("pi-usereq-context-status-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const contextUsage = { tokens: 0, contextWindow: 1000, percent: 0 };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ ...contextUsage }),
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);
  contextUsage.tokens = 191;
  contextUsage.percent = 19.1;
  await pi.emit("context", { messages: [] }, ctx);

  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 2,
      contextPercent: 19.1,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

/**
 * @brief Verifies context-gauge icon cutovers below the error range.
 * @details Replays deterministic context percentages at documented threshold boundaries below `90%` so the status bar proves the `▕▂▏`, `▕▄▏`, `▕▆▏`, and `▕█▏` transitions while rendering every non-error band with the same warning-token color used by the `status` value. Runtime is O(n) in case count. Side effects are limited to in-memory status updates.
 * @return {Promise<void>} Promise resolved after all threshold assertions complete.
 * @throws {AssertionError} Throws when any threshold renders the wrong icon or low-band color.
 * @satisfies REQ-122, REQ-126, TST-096
 */
test("context hook applies warning-colored quarter-threshold gauge icons below the error range", async () => {
  const cwd = createTempDir("pi-usereq-context-threshold-status-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const contextUsage = { tokens: 0, contextWindow: 1000, percent: 0 };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ ...contextUsage }),
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);

  for (const percent of [24.9, 25, 49.9, 50, 74.9, 75, 89.9]) {
    contextUsage.tokens = Math.round(percent * 10);
    contextUsage.percent = percent;
    await pi.emit("context", { messages: [] }, ctx);

    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: Math.ceil(percent / 10),
        contextPercent: percent,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
      `unexpected context icon at ${percent}%`,
    );
  }
});

test("context hook renders the error full context icon when usage exceeds ninety percent", async () => {
  const cwd = createTempDir("pi-usereq-context-full-status-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const contextUsage = { tokens: 910, contextWindow: 1000, percent: 91 };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ ...contextUsage }),
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);
  await pi.emit("context", { messages: [] }, ctx);

  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 10,
      contextPercent: 91,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

test("status overflow-threshold context icon uses only CLI-supported theme tokens", async () => {
  const cwd = createTempDir("pi-usereq-context-theme-contract-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const usedColors = new Set<string>();
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ tokens: 1000, contextWindow: 1000, percent: 100 }),
    theme: {
      fg(color: string, text: string) {
        assert.ok(["accent", "warning", "dim", "error"].includes(color));
        usedColors.add(color);
        return formatFakeThemeForeground(color, text);
      },
      bgFromFg(color: string, text: string) {
        assert.ok(["accent", "warning"].includes(color));
        return formatFakeThemeBackgroundFromForeground(color, text);
      },
      bold(text: string) {
        return `<bold>${text}</bold>`;
      },
    },
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);
  await pi.emit("context", { messages: [] }, ctx);

  assert.ok(usedColors.has("error"));
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 10,
      contextPercent: 100,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
    }),
  );
});

test("agent timing status updates et while preserving accumulated completed runtime", async () => {
  const cwd = createTempDir("pi-usereq-timing-status-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });

  const originalDateNow = Date.now;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  let nowMs = 0;
  const intervalCallbacks: Array<() => void> = [];
  const clearedHandles: Array<number> = [];
  Date.now = () => nowMs;
  globalThis.setInterval = ((callback: TimerHandler) => {
    intervalCallbacks.push(callback as () => void);
    return intervalCallbacks.length as ReturnType<typeof setInterval>;
  }) as typeof setInterval;
  globalThis.clearInterval = ((handle: ReturnType<typeof setInterval>) => {
    clearedHandles.push(Number(handle));
  }) as typeof clearInterval;

  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const ctx = createFakeCtx(cwd);

    await pi.emit("session_start", { reason: "startup" }, ctx);
    await pi.emit("agent_start", {}, ctx);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ 0:00 ⚑ --:-- ⌛︎--:--",
      }),
    );

    nowMs = 61_000;
    intervalCallbacks[0]!();
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ 1:01 ⚑ --:-- ⌛︎--:--",
      }),
    );

    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ 1:01 ⌛︎1:01",
      }),
    );

    nowMs = 120_000;
    await pi.emit("agent_start", {}, ctx);
    nowMs = 125_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "aborted",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ 1:01 ⌛︎1:01",
      }),
    );
    assert.ok(clearedHandles.length >= 2);
  } finally {
    Date.now = originalDateNow;
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("elapsed counters persist across new-session rebinding and reset on reload", async () => {
  const cwd = createTempDir("pi-usereq-timing-rebind-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const originalDateNow = Date.now;
  let nowMs = 0;
  Date.now = () => nowMs;

  try {
    const firstPi = createFakePi();
    piUsereqExtension(firstPi);
    const firstCtx = createFakeCtx(cwd);
    await firstPi.emit("session_start", { reason: "startup" }, firstCtx);
    await firstPi.emit("agent_start", {}, firstCtx);
    nowMs = 61_000;
    await firstPi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [],
        },
      ],
    }, firstCtx);
    await firstPi.emit("session_shutdown", {}, firstCtx);

    const newPi = createFakePi();
    piUsereqExtension(newPi);
    const newCtx = createFakeCtx(cwd);
    await newPi.emit("session_start", {
      reason: "new",
      previousSessionFile: "/tmp/previous-session.jsonl",
    }, newCtx);
    assert.equal(
      newCtx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ 1:01 ⌛︎1:01",
      }),
    );
    await newPi.emit("session_shutdown", {}, newCtx);

    const reloadPi = createFakePi();
    piUsereqExtension(reloadPi);
    const reloadCtx = createFakeCtx(cwd);
    await reloadPi.emit("session_start", { reason: "reload" }, reloadCtx);
    assert.equal(
      reloadCtx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      }),
    );
  } finally {
    Date.now = originalDateNow;
  }
});

test("session_start enables default custom tools and default embedded tools only", async () => {
  const cwd = createTempDir("pi-usereq-default-tools-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);

  await pi.emit("session_start", { reason: "startup" }, createFakeCtx(cwd));

  const activeTools = new Set(pi.getActiveTools());
  for (const toolName of PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES) {
    assert.ok(activeTools.has(toolName), `missing default active tool ${toolName}`);
  }
  assert.equal(activeTools.has("search"), true);
  assert.equal(activeTools.has("files-search"), true);
  assert.equal(activeTools.has("find"), false);
  assert.equal(activeTools.has("grep"), false);
  assert.equal(activeTools.has("ls"), false);
});

test("default configuration applies the documented static-check, debug, notify, sound, and pushover defaults", () => {
  const config = getDefaultConfig(createTempDir("pi-usereq-default-notify-"));

  assert.equal(config.AUTO_GIT_COMMIT, "enable");
  assert.deepEqual(Object.keys(config["static-check"]).length, 20);
  assert.deepEqual(config["static-check"].C, createStaticCheckLanguageConfig([
    {
      module: "Command",
      cmd: "cppcheck",
      params: [
        "--error-exitcode=1",
        "--enable=warning,style,performance,portability",
        "--std=c11",
      ],
    },
    {
      module: "Command",
      cmd: "clang-format",
      params: ["--dry-run", "--Werror"],
    },
  ], "enable"));
  assert.deepEqual(config["static-check"]["C++"], createStaticCheckLanguageConfig([
    {
      module: "Command",
      cmd: "cppcheck",
      params: [
        "--error-exitcode=1",
        "--enable=warning,style,performance,portability",
        "--std=c++20",
      ],
    },
    {
      module: "Command",
      cmd: "clang-format",
      params: ["--dry-run", "--Werror"],
    },
  ], "enable"));
  assert.deepEqual(config["static-check"].Python, createStaticCheckLanguageConfig([
    { module: "Command", cmd: "pyright", params: ["--outputjson"] },
    { module: "Command", cmd: "ruff", params: ["check"] },
  ], "enable"));
  assert.deepEqual(config["static-check"].JavaScript, createStaticCheckLanguageConfig([
    { module: "Command", cmd: "node", params: ["--check"] },
  ], "enable"));
  assert.deepEqual(config["static-check"].TypeScript, createStaticCheckLanguageConfig([
    { module: "Command", cmd: "npx", params: ["eslint"] },
  ], "enable"));
  assert.deepEqual(config["static-check"].Ruby, createStaticCheckLanguageConfig([], "disable"));
  assert.equal(config.DEBUG_ENABLED, "disable");
  assert.equal(config.DEBUG_LOG_FILE, DEFAULT_DEBUG_LOG_FILE);
  assert.equal(config.DEBUG_WORKFLOW_EVENTS, DEFAULT_DEBUG_WORKFLOW_EVENTS);
  assert.equal(config.DEBUG_LOG_ON_STATUS, DEFAULT_DEBUG_LOG_ON_STATUS);
  assert.deepEqual(config.DEBUG_ENABLED_TOOLS, []);
  assert.deepEqual(config.DEBUG_ENABLED_PROMPTS, []);
  assert.equal(config["notify-enabled"], false);
  assert.equal(config["notify-on-completed"], true);
  assert.equal(config["notify-on-interrupted"], false);
  assert.equal(config["notify-on-failed"], false);
  assert.equal(config["notify-sound"], "none");
  assert.equal(config["notify-sound-on-completed"], true);
  assert.equal(config["notify-sound-on-interrupted"], false);
  assert.equal(config["notify-sound-on-failed"], false);
  assert.equal(config["notify-pushover-enabled"], false);
  assert.equal(config["notify-pushover-on-completed"], true);
  assert.equal(config["notify-pushover-on-interrupted"], false);
  assert.equal(config["notify-pushover-on-failed"], false);
  assert.equal(config.PI_NOTIFY_CMD, 'notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png -a "PI-useReq" "%%PROMT%% @ %%BASE%% [%%TIME%%]" "%%RESULT%%"');
  assert.equal(config["notify-pushover-text"], "%%RESULT%%\n%%ARGS%%");
});

test("configuration menu orders tool toggles and can enable embedded builtin tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-embedded-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["Enable tools", "Enable tools", "grep", "Save and close", "Save and close"],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.deepEqual(ctx.__state.selectCalls[2]?.items ?? [], [
    "compress",
    "references",
    "search",
    "static-check",
    "tokens",
    "files-compress",
    "files-references",
    "files-search",
    "files-static-check",
    "files-tokens",
    "bash",
    "edit",
    "read",
    "write",
    "find",
    "grep",
    "ls",
    "Reset defaults",
  ]);
  assert.ok(config["enabled-tools"].includes("grep"));
  assert.ok(pi.getActiveTools().includes("grep"));
});

test("configuration menu can disable configurable active tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-tools-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Enable tools", "Disable all configurable tools", "Save and close", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.deepEqual(config["enabled-tools"], []);
  assert.deepEqual(pi.getActiveTools().filter((toolName: string) => PI_USEREQ_STARTUP_TOOL_NAMES.includes(toolName as never)), []);
});

test("configuration menu can persist notify and boot-sound settings without changing runtime sound", async () => {
  const cwd = createTempDir("pi-usereq-menu-notify-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "notifications",
      "Enable notification",
      "Notification events",
      "Prompt failed",
      "Save and close",
      "Enable sound (boot value)",
      "high",
      "Sound events",
      "Prompt interrupted",
      "Save and close",
      "Sound toggle hotkey bind",
      "Notify command",
      "Sound command (low vol.)",
      "Sound command (mid vol.)",
      "Sound command (high vol.)",
      "Save and close",
      "Save and close",
    ],
    inputs: [
      "alt+shift+s",
      "notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png -a \"PI-useReq\" \"%%PROMT%% @ %%BASE%% [%%TIME%%]\" \"%%RESULT%%\"",
      "echo low %%INSTALLATION_PATH%%",
      "echo mid %%INSTALLATION_PATH%%",
      "echo high %%INSTALLATION_PATH%%",
    ],
  });

  await pi.emit("session_start", { reason: "startup" }, ctx);
  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["notify-enabled"], true);
  assert.equal(config["notify-on-completed"], true);
  assert.equal(config["notify-on-interrupted"], false);
  assert.equal(config["notify-on-failed"], true);
  assert.equal(config["notify-sound"], "high");
  assert.equal(config["notify-sound-on-completed"], true);
  assert.equal(config["notify-sound-on-interrupted"], true);
  assert.equal(config["notify-sound-on-failed"], false);
  assert.equal(config["notify-sound-toggle-shortcut"], "alt+shift+s");
  assert.equal(config.PI_NOTIFY_CMD, "notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png -a \"PI-useReq\" \"%%PROMT%% @ %%BASE%% [%%TIME%%]\" \"%%RESULT%%\"");
  assert.equal(config.PI_NOTIFY_SOUND_LOW_CMD, "echo low %%INSTALLATION_PATH%%");
  assert.equal(config.PI_NOTIFY_SOUND_MID_CMD, "echo mid %%INSTALLATION_PATH%%");
  assert.equal(config.PI_NOTIFY_SOUND_HIGH_CMD, "echo high %%INSTALLATION_PATH%%");
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      sound: "none",
    }),
  );
});

test("configuration menu can persist pushover settings", async () => {
  const cwd = createTempDir("pi-usereq-menu-pushover-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "notifications",
      "Pushover User Key/Delivery Group Key",
      "Pushover Token/API Token Key",
      "Enable pushover",
      "Pushover events",
      "Prompt failed",
      "Save and close",
      "Pushover priority",
      "High",
      "Pushover title",
      "Pushover text",
      "Save and close",
      "Save and close",
    ],
    inputs: [
      "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "ah6bf5u2sj63mcvou6qamiabeoubbe",
      "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "%%RESULT%%\\n%%ARGS%%",
    ],
  });

  await command!.handler("", ctx);

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["notify-pushover-enabled"], true);
  assert.equal(config["notify-pushover-on-completed"], true);
  assert.equal(config["notify-pushover-on-interrupted"], false);
  assert.equal(config["notify-pushover-on-failed"], true);
  assert.equal(config["notify-pushover-user-key"], "gzfjjvp1xxmhibqwzh9m7i1zwvf83j");
  assert.equal(config["notify-pushover-api-token"], "ah6bf5u2sj63mcvou6qamiabeoubbe");
  assert.equal(config["notify-pushover-priority"], 1);
  assert.equal(config["notify-pushover-title"], "%%PROMT%% @ %%BASE%% [%%TIME%%]");
  assert.equal(config["notify-pushover-text"], "%%RESULT%%\n%%ARGS%%");
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      sound: "none",
    }),
  );
});

test("notifications menu escapes pushover text and locks pushover enablement until credentials exist", async () => {
  const cwd = createTempDir("pi-usereq-menu-pushover-display-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  fs.writeFileSync(
    getProjectConfigPath(cwd),
    `${JSON.stringify({
      ...getDefaultConfig(cwd),
      "notify-pushover-text": "first line\nsecond line",
    }, null, 2)}\n`,
    "utf8",
  );
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["notifications", "Pushover text", "Save and close", "Save and close"],
  });

  await command!.handler("", ctx);

  const renderedNotificationsMenu = (ctx.__state.customRenderLines[2] ?? []).join("\n");
  assert.match(renderedNotificationsMenu, /first line\\nsecond line/);
  assert.match(renderedNotificationsMenu, /<dim>Enable pushover/);
  assert.match(renderedNotificationsMenu, /<dim>configure user\/token keys first<\/dim>/);
});

test("prompt-end pushover requests honor global enable, event toggles, credentials, priority, and templates", async () => {
  const { projectBase: cwd } = initFixtureRepo({ fixtures: [] });
  const writeConfig = (overrides: Record<string, unknown>) => {
    writeProjectConfigOverrides(cwd, {
      GIT_WORKTREE_ENABLED: "disable",
      ...overrides,
    });
  };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd);
  const originalDateNow = Date.now;
  const recordedRequests: Array<{ url: string; options: Record<string, unknown>; body: string }> = [];
  let nowMs = 0;
  setPiNotifyHttpsRequestForTests(((url: URL, options: Record<string, unknown>, callback?: (response: any) => void) => {
    const record = { url: url.toString(), options, body: "" };
    recordedRequests.push(record);
    const fakeResponse = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeResponse;
      },
      resume() {
        return undefined;
      },
    };
    callback?.(fakeResponse);
    const fakeRequest = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeRequest;
      },
      end(body?: string) {
        record.body = body ?? "";
      },
    };
    return fakeRequest as unknown as ReturnType<typeof import("node:https").request>;
  }) as typeof import("node:https").request);
  Date.now = () => nowMs;

  try {
    writeConfig({
      "notify-pushover-enabled": true,
      "notify-pushover-on-completed": true,
      "notify-pushover-user-key": "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "notify-pushover-api-token": "ah6bf5u2sj63mcvou6qamiabeoubbe",
      "notify-pushover-priority": 1,
      "notify-pushover-title": "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "notify-pushover-text": "%%RESULT%%\n%%ARGS%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedRequests.length = 0;
    nowMs = 0;
    await pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 5_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [],
        },
      ],
    }, ctx);

    assert.equal(recordedRequests.length, 1);
    assert.equal(recordedRequests[0]?.url, "https://api.pushover.net/1/messages.json");
    const successParams = new URLSearchParams(recordedRequests[0]?.body ?? "");
    assert.equal(successParams.get("token"), "ah6bf5u2sj63mcvou6qamiabeoubbe");
    assert.equal(successParams.get("user"), "gzfjjvp1xxmhibqwzh9m7i1zwvf83j");
    assert.equal(successParams.get("priority"), "1");
    assert.equal(successParams.get("message"), `${buildExpectedNotifyResult("stop")}\nInspect src/index.ts`);
    assert.equal(successParams.get("title"), `analyze @ ${buildExpectedNotifyBasePath(cwd)} [0:05]`);

    recordedRequests.length = 0;
    nowMs = 10_000;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 14_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "aborted",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(recordedRequests.length, 0);

    recordedRequests.length = 0;
    nowMs = 20_000;
    await pi.commands.get("req-create")!.handler("Create docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 23_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "error",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(recordedRequests.length, 0);

    writeConfig({
      "notify-pushover-enabled": true,
      "notify-pushover-on-interrupted": true,
      "notify-pushover-on-failed": true,
      "notify-pushover-user-key": "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "notify-pushover-api-token": "ah6bf5u2sj63mcvou6qamiabeoubbe",
      "notify-pushover-priority": 1,
      "notify-pushover-title": "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "notify-pushover-text": "%%RESULT%%\n%%ARGS%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedRequests.length = 0;
    nowMs = 30_000;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 32_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "aborted",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(recordedRequests.length, 1);
    const abortedParams = new URLSearchParams(recordedRequests[0]?.body ?? "");
    assert.equal(abortedParams.get("title"), `change @ ${buildExpectedNotifyBasePath(cwd)} [0:02]`);
    assert.equal(abortedParams.get("message"), `${buildExpectedNotifyResult("aborted")}\nAdjust docs`);

    recordedRequests.length = 0;
    nowMs = 40_000;
    await pi.commands.get("req-write")!.handler("Write docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 42_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "error",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(recordedRequests.length, 1);
    const errorParams = new URLSearchParams(recordedRequests[0]?.body ?? "");
    assert.equal(errorParams.get("title"), `write @ ${buildExpectedNotifyBasePath(cwd)} [0:02]`);
    assert.equal(errorParams.get("message"), `${buildExpectedNotifyResult("error")}\nWrite docs`);

    writeConfig({
      "notify-pushover-enabled": true,
      "notify-pushover-on-completed": true,
      "notify-pushover-user-key": "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "notify-pushover-api-token": "",
      "notify-pushover-priority": 1,
      "notify-pushover-title": "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "notify-pushover-text": "%%RESULT%%\n%%ARGS%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedRequests.length = 0;
    nowMs = 50_000;
    await pi.commands.get("req-check")!.handler("Check docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 53_000;
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [],
        },
      ],
    }, ctx);
    assert.equal(recordedRequests.length, 0);
  } finally {
    setPiNotifyHttpsRequestForTests(undefined);
    Date.now = originalDateNow;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("pushover global enable controls status and suppresses delivery when disabled", async () => {
  const { projectBase: cwd } = initFixtureRepo({ fixtures: [] });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: [
      "notifications",
      "Pushover User Key/Delivery Group Key",
      "Pushover Token/API Token Key",
      "Save and close",
      "Save and close",
    ],
    inputs: [
      "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "ah6bf5u2sj63mcvou6qamiabeoubbe",
    ],
  });

  await command!.handler("", ctx);
  writeProjectConfigOverrides(cwd, { GIT_WORKTREE_ENABLED: "disable" });

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["notify-pushover-enabled"], false);
  assert.equal(config["notify-pushover-on-completed"], true);
  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      sound: "none",
    }),
  );

  const recordedRequests: string[] = [];
  setPiNotifyHttpsRequestForTests(((url: URL, options: Record<string, unknown>, callback?: (response: any) => void) => {
    void options;
    recordedRequests.push(url.toString());
    const fakeResponse = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeResponse;
      },
      resume() {
        return undefined;
      },
    };
    callback?.(fakeResponse);
    const fakeRequest = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeRequest;
      },
      end(_body?: string) {
        return undefined;
      },
    };
    return fakeRequest as unknown as ReturnType<typeof import("node:https").request>;
  }) as typeof import("node:https").request);

  try {
    await pi.emit("session_start", { reason: "startup" }, ctx);
    await pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx);
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [
        {
          role: "assistant",
          stopReason: "stop",
          content: [],
        },
      ],
    }, ctx);
    assert.deepEqual(recordedRequests, []);
  } finally {
    setPiNotifyHttpsRequestForTests(undefined);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("command notify routes through PI_NOTIFY_CMD placeholders and per-event toggles", async () => {
  const { projectBase: cwd } = initFixtureRepo({ fixtures: [] });
  const writeConfig = (overrides: Record<string, unknown>) => {
    writeProjectConfigOverrides(cwd, {
      GIT_WORKTREE_ENABLED: "disable",
      ...overrides,
    });
  };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd);
  const originalDateNow = Date.now;
  const recordedCommands: string[] = [];
  let nowMs = 0;
  setPiNotifySpawnForTests(((command: string, args?: readonly string[] | undefined, _options?: Record<string, unknown>) => {
    void command;
    recordedCommands.push(String(args && args.length > 0 ? args[args.length - 1] : ""));
    const fakeChild = {
      once(_eventName: string, _handler: (...handlerArgs: unknown[]) => void) {
        return fakeChild;
      },
      unref() {
        return undefined;
      },
    };
    return fakeChild as unknown as ReturnType<typeof import("node:child_process").spawn>;
  }) as typeof import("node:child_process").spawn);
  Date.now = () => nowMs;

  try {
    writeConfig({
      "notify-enabled": true,
      "notify-on-completed": true,
      "notify-on-interrupted": false,
      "notify-on-failed": true,
      "notify-sound": "none",
      PI_NOTIFY_CMD: 'notify-send "%%PROMT%% @ %%BASE%% [%%TIME%%]" "%%RESULT%%"',
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedCommands.length = 0;
    nowMs = 0;
    await pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 5_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);

    assert.equal(recordedCommands.length, 1);
    assert.match(
      recordedCommands[0] ?? "",
      new RegExp(`analyze @ ${buildExpectedNotifyBasePath(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[0:05\\]`),
    );
    assert.match(recordedCommands[0] ?? "", new RegExp(buildExpectedNotifyResult("stop")));

    recordedCommands.length = 0;
    nowMs = 10_000;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 12_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "aborted", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 0);

    writeConfig({
      "notify-enabled": true,
      "notify-on-completed": true,
      "notify-on-interrupted": true,
      "notify-on-failed": true,
      "notify-sound": "none",
      PI_NOTIFY_CMD: 'notify-send "%%PROMT%% @ %%BASE%% [%%TIME%%]" "%%RESULT%%"',
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedCommands.length = 0;
    nowMs = 20_000;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 22_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "aborted", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 1);
    assert.match(
      recordedCommands[0] ?? "",
      new RegExp(`change @ ${buildExpectedNotifyBasePath(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[0:02\\]`),
    );
    assert.match(recordedCommands[0] ?? "", new RegExp(buildExpectedNotifyResult("aborted")));

    recordedCommands.length = 0;
    nowMs = 30_000;
    await pi.commands.get("req-write")!.handler("Write docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 33_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "error", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 1);
    assert.match(
      recordedCommands[0] ?? "",
      new RegExp(`write @ ${buildExpectedNotifyBasePath(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[0:03\\]`),
    );
    assert.match(recordedCommands[0] ?? "", new RegExp(buildExpectedNotifyResult("error")));
  } finally {
    setPiNotifySpawnForTests(undefined);
    Date.now = originalDateNow;
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("sound routing honors the selected sound state and per-event toggles", async () => {
  const { projectBase: cwd } = initFixtureRepo({ fixtures: [] });
  const writeConfig = (overrides: Record<string, unknown>) => {
    writeProjectConfigOverrides(cwd, {
      GIT_WORKTREE_ENABLED: "disable",
      ...overrides,
    });
  };
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd);
  const recordedCommands: string[] = [];
  setPiNotifySpawnForTests(((command: string, args?: readonly string[] | undefined, _options?: Record<string, unknown>) => {
    void command;
    recordedCommands.push(String(args && args.length > 0 ? args[args.length - 1] : ""));
    const fakeChild = {
      once(_eventName: string, _handler: (...handlerArgs: unknown[]) => void) {
        return fakeChild;
      },
      unref() {
        return undefined;
      },
    };
    return fakeChild as unknown as ReturnType<typeof import("node:child_process").spawn>;
  }) as typeof import("node:child_process").spawn);

  try {
    writeConfig({
      "notify-enabled": false,
      "notify-sound": "none",
      "notify-sound-on-completed": true,
      PI_NOTIFY_SOUND_HIGH_CMD: "echo high %%INSTALLATION_PATH%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedCommands.length = 0;
    await pi.commands.get("req-analyze")!.handler("Inspect src/index.ts", ctx);
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "stop", content: [] }],
    }, ctx);
    assert.deepEqual(recordedCommands, []);

    writeConfig({
      "notify-enabled": false,
      "notify-sound": "high",
      "notify-sound-on-completed": false,
      "notify-sound-on-interrupted": true,
      "notify-sound-on-failed": false,
      PI_NOTIFY_SOUND_HIGH_CMD: "echo high %%INSTALLATION_PATH%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedCommands.length = 0;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "aborted", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 1);

    writeConfig({
      "notify-enabled": false,
      "notify-sound": "high",
      "notify-sound-on-completed": false,
      "notify-sound-on-interrupted": false,
      "notify-sound-on-failed": true,
      PI_NOTIFY_SOUND_HIGH_CMD: "echo high %%INSTALLATION_PATH%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedCommands.length = 0;
    await pi.commands.get("req-write")!.handler("Write docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "error", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 1);
  } finally {
    setPiNotifySpawnForTests(undefined);
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});

test("sound toggle shortcut cycles active runtime pi-notify sound levels without persisting boot config", async () => {
  const cwd = createTempDir("pi-usereq-shortcut-notify-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const persistedConfigText = `${JSON.stringify(getDefaultConfig(cwd), null, 2)}\n`;
  fs.writeFileSync(getProjectConfigPath(cwd), persistedConfigText, "utf8");
  const previousCwd = process.cwd();
  const pi = createFakePi();
  process.chdir(cwd);
  try {
    piUsereqExtension(pi);
  } finally {
    process.chdir(previousCwd);
  }

  const shortcut = pi.shortcuts.get("alt+s");
  assert.ok(shortcut);
  const ctx = createFakeCtx(cwd);
  await pi.emit("session_start", { reason: "startup" }, ctx);

  for (const expectedSound of ["low", "mid", "high", "none"]) {
    await shortcut!.handler(ctx);
    assert.equal(fs.readFileSync(getProjectConfigPath(cwd), "utf8"), persistedConfigText);
    assert.equal(
      ctx.__state.statuses.get("pi-usereq"),
      buildExpectedFakeStatusText({
        basePath: buildExpectedFakeBasePath(cwd),
        docsDir: DEFAULT_DOCS_DIR,
        testsDir: "tests",
        srcDir: ["src"],
        contextFilledCells: 0,
        et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
        sound: expectedSound,
      }),
    );
  }
});

test("session_start loads the active runtime sound from persisted boot config", async () => {
  const cwd = createTempDir("pi-usereq-session-start-sound-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const persistedConfig = getDefaultConfig(cwd);
  persistedConfig["notify-sound"] = "mid";
  fs.writeFileSync(
    getProjectConfigPath(cwd),
    `${JSON.stringify(persistedConfig, null, 2)}\n`,
    "utf8",
  );
  const previousCwd = process.cwd();
  const pi = createFakePi();
  process.chdir(cwd);
  try {
    piUsereqExtension(pi);
  } finally {
    process.chdir(previousCwd);
  }

  const ctx = createFakeCtx(cwd);
  await pi.emit("session_start", { reason: "startup" }, ctx);

  assert.equal(
    ctx.__state.statuses.get("pi-usereq"),
    buildExpectedFakeStatusText({
      basePath: buildExpectedFakeBasePath(cwd),
      docsDir: DEFAULT_DOCS_DIR,
      testsDir: "tests",
      srcDir: ["src"],
      contextFilledCells: 0,
      et: "⏱︎ --:-- ⚑ --:-- ⌛︎--:--",
      sound: "mid",
    }),
  );
});

test("static-check exposes the supported programming languages", () => {
  const supported = getSupportedStaticCheckLanguageSupport();
  assert.equal(supported.length, 20);
  assert.deepEqual(supported.find((entry) => entry.language === "Python"), { language: "Python", extensions: [".py"] });
  assert.deepEqual(supported.find((entry) => entry.language === "JavaScript"), {
    language: "JavaScript",
    extensions: [".js", ".mjs"],
  });
});

test("configuration menu omits removed static-check raw-spec and reference actions", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["static-check"],
  });

  await command!.handler("", ctx);

  const renderedStaticCheckMenu = (ctx.__state.customRenderLines[1] ?? []).join("\n");
  const staticCheckItems = ctx.__state.selectCalls[1]?.items ?? [];
  assert.match(renderedStaticCheckMenu, /Add static code checker/);
  assert.match(renderedStaticCheckMenu, /Remove static code checker/);
  assert.deepEqual(staticCheckItems.slice(0, 2), ["Add static code checker", "Remove static code checker"]);
  assert.deepEqual(
    staticCheckItems.slice(2, 22),
    getSupportedStaticCheckLanguageSupport().map((entry) => entry.language),
  );
  assert.deepEqual(staticCheckItems.slice(-1), ["Reset defaults"]);
  assert.doesNotMatch(renderedStaticCheckMenu, /Add entry from LANG=MODULE\[,CMD\[,PARAM\.\.\.\]\]/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Show supported languages/);
});

test("configuration menu hides removed static-check modules from user-facing actions", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-hidden-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);
  const ctx = createFakeCtx(cwd, {
    selects: ["static-check"],
  });

  await command!.handler("", ctx);

  const renderedStaticCheckMenu = (ctx.__state.customRenderLines[1] ?? []).join("\n");
  assert.match(renderedStaticCheckMenu, /Add static code checker/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Pylance/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Ruff/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Dummy/);
});

test("configuration menu can toggle per-language static-check enablement", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-toggle-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["static-check", "Python", "Save and close", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(config["static-check"].Python.enabled, "disable");
  assert.deepEqual(config["static-check"].Python.checkers, [
    { module: "Command", cmd: "pyright", params: ["--outputjson"] },
    { module: "Command", cmd: "ruff", params: ["check"] },
  ]);
});

test("configuration menu can add guided static-check entries for explicit supported languages", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-guided-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: [
        "static-check",
        "Add static code checker",
        "Ruby",
        "Save and close",
        "Save and close",
      ],
      inputs: ["true", ""],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.deepEqual(config["static-check"].Ruby, createStaticCheckLanguageConfig([
    { module: "Command", cmd: "true" },
  ], "enable"));
});
