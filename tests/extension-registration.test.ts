import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import piUsereqExtension from "../src/index.ts";
import {
  DEFAULT_DOCS_DIR,
  getDefaultConfig,
  getProjectConfigPath,
} from "../src/core/config.js";
import { formatRuntimePathForDisplay } from "../src/core/path-context.js";
import {
  setPiNotifyHttpsRequestForTests,
  setPiNotifySpawnForTests,
} from "../src/core/pi-notify.js";
import {
  PI_USEREQ_DEFAULT_ENABLED_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
  PI_USEREQ_STARTUP_TOOL_NAMES,
} from "../src/core/pi-usereq-tools.js";
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
};

/**
 * @brief Describes one fake shortcut registration captured during tests.
 * @details Mirrors the minimal shortcut-registration shape exercised by the
 * suite so tests can trigger the configured sound toggle without a live TUI.
 * The alias is compile-time only and introduces no runtime side effects.
 */
type RegisteredShortcut = { description?: string; handler: (ctx: any) => Promise<void> | void };

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
function createFakeSessionManager(): FakeSessionManager {
  const entries: FakeSessionEntry[] = [];
  let nextEntryId = 0;
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
 * @brief Builds the expected fake context-gauge payload for assertions.
 * @details Resolves the documented icon thresholds for `0-100%` and emits the
 * blinking red overflow icon for percent values above `100`. Runtime is O(1).
 * No external state is mutated.
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
  if (percent > 100) {
    return formatFakeThemeForeground("error", "\u001b[5m▕█▏\u001b[25m");
  }
  if (percent <= 25) {
    return formatFakeThemeForeground("warning", "▕▂▏");
  }
  if (percent <= 50) {
    return formatFakeThemeForeground("warning", "▕▄▏");
  }
  if (percent <= 90) {
    return formatFakeThemeForeground("warning", "▕▆▏");
  }
  return formatFakeThemeForeground("warning", "▕█▏");
}

/**
 * @brief Builds the expected fake pi-usereq status-bar string for assertions.
 * @details Reconstructs the field order, separators, icon-based context gauge,
 * consolidated elapsed field, and sound field emitted by the extension using
 * deterministic fake theme markers. Runtime is O(1). No external state is
 * mutated.
 * @param[in] options {{ basePath: string; contextFilledCells: number; contextPercent?: number | null; et: string; sound?: string }} Expected status facts.
 * @return {string} Encoded status-bar string.
 */
function buildExpectedFakeStatusText(options: {
  basePath: string;
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
  const contextBar = buildExpectedFakeContextBar({
    filledCells: options.contextFilledCells,
    percent: options.contextPercent,
  });
  return [
    buildField("base", options.basePath),
    `${formatFakeThemeForeground("accent", "context:")}${contextBar}`,
    buildField("elapsed", options.et),
    buildField("sound", options.sound ?? "none"),
  ].join(formatFakeThemeForeground("dim", " • "));
}

/**
 * @brief Formats one expected absolute base path for fake status assertions.
 * @details Resolves the supplied cwd and normalizes path separators to `/` so
 * fake status comparisons stay stable across operating systems. Runtime is O(p)
 * in path length. No external state is mutated.
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
  const sessionManager = options.sessionManager ?? createFakeSessionManager();
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
  return {
    cwd,
    __state: state,
    sessionManager,
    async waitForIdle() {
      state.waitForIdleCalls += 1;
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

  for (const name of [
    "git-path",
    "get-base-path",
    "files-tokens",
    "files-references",
    "files-compress",
    "files-find",
    "references",
    "compress",
    "find",
    "tokens",
    "files-static-check",
    "static-check",
    "git-check",
    "docs-check",
    "git-wt-name",
    "git-wt-create",
    "git-wt-delete",
    "pi-usereq-show-config",
    "test-static-check",
  ]) {
    assert.ok(!commandNames.includes(name), `unexpected command ${name}`);
  }

  const toolNames = pi.tools.map((tool: RegisteredTool) => tool.name).sort();
  for (const name of [
    "git-path",
    "get-base-path",
    "files-tokens",
    "files-references",
    "files-compress",
    "files-find",
    "references",
    "compress",
    "find",
    "tokens",
    "files-static-check",
    "static-check",
    "git-check",
    "docs-check",
    "git-wt-name",
    "git-wt-create",
    "git-wt-delete",
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

  assert.match(filesTokens.description ?? "", /token-optimized JSON payload/);
  assert.ok(filesTokens.promptGuidelines?.some((line) => line.includes("Output contract:")));
  assert.match(String((filesTokens.parameters as { description?: string } | undefined)?.description ?? ""), /token metrics/);

  assert.match(tokens.description ?? "", /canonical docs/);
  assert.ok(tokens.promptGuidelines?.some((line) => line.includes("registration metadata")));
  assert.match(String((tokens.parameters as { description?: string } | undefined)?.description ?? ""), /token-optimized JSON shape/);
});

test("reference tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesReferences = pi.tools.find((tool: RegisteredTool) => tool.name === "files-references");
  const references = pi.tools.find((tool: RegisteredTool) => tool.name === "references");
  assert.ok(filesReferences, "missing files-references tool");
  assert.ok(references, "missing references tool");

  assert.match(filesReferences.description ?? "", /summary, repository, files, and execution sections/);
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("Numeric contract:")));
  assert.ok(filesReferences.promptGuidelines?.some((line) => line.includes("Behavior contract:")));
  assert.match(String((filesReferences.parameters as { description?: string } | undefined)?.description ?? ""), /structured Doxygen fields/);

  assert.match(references.description ?? "", /configured project source directories/);
  assert.ok(references.promptGuidelines?.some((line) => line.includes("source_directory_paths")));
  assert.ok(references.promptGuidelines?.some((line) => line.includes("Configuration contract:")));
  assert.match(String((references.parameters as { description?: string } | undefined)?.description ?? ""), /directory tree/);
});

test("find tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesFind = pi.tools.find((tool: RegisteredTool) => tool.name === "files-find");
  const find = pi.tools.find((tool: RegisteredTool) => tool.name === "find");
  assert.ok(filesFind, "missing files-find tool");
  assert.ok(find, "missing find tool");

  assert.match(filesFind.description ?? "", /token-optimized JSON payload/);
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Regex rule:")));
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Supported tags [Typescript]:")));
  assert.ok(filesFind.promptGuidelines?.some((line) => line.includes("Supported tags [Python]:")));
  assert.match(String((filesFind.parameters as { description?: string } | undefined)?.description ?? ""), /Static supported-tag matrices are documented in tool registration metadata/);

  assert.match(find.description ?? "", /configured project source directories/);
  assert.ok(find.promptGuidelines?.some((line) => line.includes("source_directory_paths")));
  assert.ok(find.promptGuidelines?.some((line) => line.includes("Tag rule:")));
  assert.match(String((find.parameters as { description?: string } | undefined)?.description ?? ""), /Regex matches construct names only/);
});

test("compression tools register agent-oriented descriptions and schema details", () => {
  const pi = createFakePi();
  piUsereqExtension(pi);

  const filesCompress = pi.tools.find((tool: RegisteredTool) => tool.name === "files-compress");
  const compress = pi.tools.find((tool: RegisteredTool) => tool.name === "compress");
  assert.ok(filesCompress, "missing files-compress tool");
  assert.ok(compress, "missing compress tool");

  assert.match(filesCompress.description ?? "", /summary, repository, files, and execution sections/);
  assert.ok(filesCompress.promptGuidelines?.some((line) => line.includes("Line-number behavior:")));
  assert.ok(filesCompress.promptGuidelines?.some((line) => line.includes("Behavior contract:")));
  assert.match(String((filesCompress.parameters as { description?: string } | undefined)?.description ?? ""), /structured compressed lines/);

  assert.match(compress.description ?? "", /configured project source directories/);
  assert.ok(compress.promptGuidelines?.some((line) => line.includes("Configuration contract:")));
  assert.ok(compress.promptGuidelines?.some((line) => line.includes("Behavior contract:")));
  assert.match(String((compress.parameters as { description?: string } | undefined)?.description ?? ""), /structured compressed lines/);
});

test("files-tokens returns token-optimized structured source facts", async () => {
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
      details?: {
        summary: {
          counted_file_count: number;
          skipped_file_count: number;
        };
        files: Array<{
          canonical_path: string;
          status: string;
          start_line_number: number;
          end_line_number: number;
          line_count: number;
          byte_count: number;
          primary_heading_text?: string;
          error_message?: string;
        }>;
        execution: {
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.counted_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.equal(payload.files[0]?.canonical_path, `${DEFAULT_DOCS_DIR}/REQUIREMENTS.md`);
    assert.equal(payload.files[0]?.start_line_number, 1);
    assert.equal(payload.files[0]?.end_line_number, payload.files[0]?.line_count);
    assert.ok((payload.files[0]?.byte_count ?? 0) > 0);
    assert.equal(payload.files[0]?.primary_heading_text, "Requirements");
    assert.equal(payload.files[1]?.canonical_path, `${DEFAULT_DOCS_DIR}/MISSING.md`);
    assert.equal(payload.files[1]?.error_message, "not found");
    assert.match(payload.execution.stderr, new RegExp(`skipped: ${DEFAULT_DOCS_DIR.replace("/", "\\/")}/MISSING\\.md: not found`));
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-references returns structured repository, symbol, and Doxygen facts", async () => {
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
      details?: {
        summary: {
          analyzed_file_count: number;
          skipped_file_count: number;
        };
        repository: {
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          status: string;
          symbol_count: number;
          doxygen_field_count: number;
          file_doxygen?: { brief?: string[] };
          symbols: Array<{
            symbol_name: string;
            qualified_name: string;
            symbol_kind: string;
            line_range: [number, number];
            doxygen?: {
              brief?: string[];
              params?: Array<{ direction: string; parameter_name?: string; value_type?: string; description?: string }>;
              returns?: string[];
              satisfies_requirement_ids?: string[];
            };
          }>;
        }>;
        execution: {
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.analyzed_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/sample.ts"]);
    assert.deepEqual(payload.files.map((file) => file.status), ["analyzed", "skipped"]);
    assert.equal(payload.files[0]?.canonical_path, "src/sample.ts");
    assert.equal(payload.files[0]?.symbol_count, 1);
    assert.ok((payload.files[0]?.doxygen_field_count ?? 0) >= 2);
    assert.deepEqual(payload.files[0]?.file_doxygen?.brief, ["Sample source file."]);
    assert.equal(payload.files[0]?.symbols[0]?.symbol_name, "buildSample");
    assert.equal(payload.files[0]?.symbols[0]?.qualified_name, "buildSample");
    assert.equal(payload.files[0]?.symbols[0]?.symbol_kind, "FUNCTION");
    assert.deepEqual(payload.files[0]?.symbols[0]?.line_range, [12, 14]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.brief, ["Builds the sample value."]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.params, [
      { direction: "in", parameter_name: "input", value_type: "string", description: "Caller-supplied value." },
    ]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.returns, ["{string} Upper-cased result."]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.satisfies_requirement_ids, ["REQ-011"]);
    assert.match(payload.execution.stderr, /skipped: src\/missing\.ts: not found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("references returns a structured repository tree for configured source directories", async () => {
  const { projectBase } = initFixtureRepo({ fixtures: [] });
  fs.writeFileSync(path.join(projectBase, "src", "alpha.ts"), "export const ALPHA = 1;\n", "utf8");
  fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
  fs.writeFileSync(path.join(projectBase, "src", "nested", "beta.ts"), "export function beta(): number {\n  return 2;\n}\n", "utf8");
  try {
    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "references", projectBase, {}) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        summary: {
          analyzed_file_count: number;
          total_symbol_count: number;
        };
        repository: {
          source_directory_paths: string[];
          file_canonical_paths: string[];
          directory_tree: {
            node_name: string;
            children: Array<{ node_name: string; node_kind: string; children: Array<{ relative_path: string; node_kind: string }> }>;
          };
        };
        files: Array<{
          canonical_path: string;
          line_range: [number, number];
          symbols: Array<{ symbol_name: string; line_range: [number, number] }>;
        }>;
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.analyzed_file_count, 2);
    assert.equal(payload.summary.total_symbol_count, 1);
    assert.deepEqual(payload.repository.source_directory_paths, ["src"]);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.equal(payload.repository.directory_tree.node_name, ".");
    assert.equal(payload.repository.directory_tree.children[0]?.node_name, "src");
    assert.equal(payload.repository.directory_tree.children[0]?.node_kind, "directory");
    assert.ok(payload.repository.directory_tree.children[0]?.children.some((child) => child.relative_path === "src/alpha.ts"));
    assert.ok(payload.repository.directory_tree.children[0]?.children.some((child) => child.relative_path === "src/nested"));
    assert.deepEqual(payload.files.map((file) => file.canonical_path), ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.deepEqual(payload.files[0]?.line_range, [1, 1]);
    assert.equal(payload.files[0]?.symbols.length, 0);
    assert.equal(payload.files[1]?.symbols[0]?.symbol_name, "beta");
    assert.deepEqual(payload.files[1]?.symbols[0]?.line_range, [1, 3]);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-compress returns structured line, symbol, and Doxygen facts", async () => {
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
      details?: {
        summary: {
          compressed_file_count: number;
          skipped_file_count: number;
          total_symbol_count: number;
        };
        repository: {
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          status: string;
          line_number_mode: string;
          source_line_count: number;
          compressed_line_count: number;
          file_doxygen?: { brief?: string[] };
          symbols: Array<{
            symbol_name: string;
            symbol_kind: string;
            line_range: [number, number];
            doxygen?: { brief?: string[] };
          }>;
          compressed_lines: Array<{ source_line_number: number; display_text: string; text: string }>;
          compressed_source_text?: string;
          error_reason?: string;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.compressed_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.equal(payload.summary.total_symbol_count, 1);
    assert.ok(payload.repository.file_canonical_paths.includes("src/sample.ts"));
    assert.equal(payload.files[0]?.canonical_path, "src/sample.ts");
    assert.equal(payload.files[0]?.status, "compressed");
    assert.equal(payload.files[0]?.line_number_mode, "enabled");
    assert.ok((payload.files[0]?.source_line_count ?? 0) > 0);
    assert.ok((payload.files[0]?.compressed_line_count ?? 0) > 0);
    assert.deepEqual(payload.files[0]?.file_doxygen?.brief, ["Sample source file."]);
    assert.equal(payload.files[0]?.symbols[0]?.symbol_name, "buildSample");
    assert.equal(payload.files[0]?.symbols[0]?.symbol_kind, "FUNCTION");
    assert.deepEqual(payload.files[0]?.symbols[0]?.line_range, [11, 14]);
    assert.deepEqual(payload.files[0]?.symbols[0]?.doxygen?.brief, ["Builds the sample value."]);
    assert.equal(payload.files[0]?.compressed_lines[0]?.source_line_number, 11);
    assert.match(payload.files[0]?.compressed_lines[0]?.display_text ?? "", /^11: export function buildSample/);
    assert.match(payload.files[0]?.compressed_source_text ?? "", /^11: export function buildSample/m);
    assert.equal(payload.files[1]?.status, "skipped");
    assert.equal(payload.files[1]?.error_reason, "not_found");
    assert.equal(payload.execution.code, 0);
    assert.match(payload.execution.stderr, /skipped: src\/missing\.ts: not_found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("compress returns a structured repository-scoped compression payload", async () => {
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
      details?: {
        summary: {
          compressed_file_count: number;
          total_compressed_line_count: number;
        };
        repository: {
          source_directory_paths: string[];
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          line_number_mode: string;
          compressed_source_text?: string;
          compressed_lines: Array<{ display_text: string }>;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.compressed_file_count, 2);
    assert.ok((payload.summary.total_compressed_line_count ?? 0) >= 2);
    assert.deepEqual(payload.repository.source_directory_paths, ["src"]);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.equal(payload.files[0]?.line_number_mode, "disabled");
    assert.doesNotMatch(payload.files[1]?.compressed_source_text ?? "", /^\d+:/m);
    assert.match(payload.files[1]?.compressed_lines[0]?.display_text ?? "", /^export function buildBeta/);
    assert.equal(payload.execution.code, 0);
    assert.equal(payload.execution.stderr, "");
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("files-find returns structured match, code-line, and Doxygen facts", async () => {
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
    const result = await executeRegisteredTool(pi, "files-find", projectBase, {
      tag: "FUNCTION",
      pattern: "^buildSample$",
      files: ["src/sample.ts", "src/missing.ts"],
      enableLineNumbers: true,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        summary: {
          search_status: string;
          matched_file_count: number;
          skipped_file_count: number;
          total_match_count: number;
        };
        repository: {
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          status: string;
          match_count: number;
          supported_tags: string[];
          file_doxygen?: { brief?: string[] };
          matches: Array<{
            symbol_name: string;
            qualified_name: string;
            symbol_kind: string;
            line_range: [number, number];
            code_line_count: number;
            code_lines: Array<{ source_line_number: number; display_text: string; text: string }>;
            stripped_source_text?: string;
            doxygen?: {
              brief?: string[];
              params?: Array<{ direction: string; parameter_name?: string; value_type?: string; description?: string }>;
              returns?: string[];
              satisfies_requirement_ids?: string[];
            };
          }>;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.search_status, "matched");
    assert.equal(payload.summary.matched_file_count, 1);
    assert.equal(payload.summary.skipped_file_count, 1);
    assert.equal(payload.summary.total_match_count, 1);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/sample.ts", "src/missing.ts"]);
    assert.deepEqual(payload.files.map((file) => file.status), ["matched", "skipped"]);
    assert.equal(payload.files[0]?.canonical_path, "src/sample.ts");
    assert.equal(payload.files[0]?.match_count, 1);
    assert.ok(payload.files[0]?.supported_tags.includes("FUNCTION"));
    assert.deepEqual(payload.files[0]?.file_doxygen?.brief, ["Sample source file."]);
    assert.equal(payload.files[0]?.matches[0]?.symbol_name, "buildSample");
    assert.equal(payload.files[0]?.matches[0]?.qualified_name, "buildSample");
    assert.equal(payload.files[0]?.matches[0]?.symbol_kind, "FUNCTION");
    assert.deepEqual(payload.files[0]?.matches[0]?.line_range, [12, 14]);
    assert.ok((payload.files[0]?.matches[0]?.code_line_count ?? 0) > 0);
    assert.equal(payload.files[0]?.matches[0]?.code_lines[0]?.source_line_number, 12);
    assert.match(payload.files[0]?.matches[0]?.code_lines[0]?.display_text ?? "", /^12: export function buildSample/);
    assert.match(payload.files[0]?.matches[0]?.stripped_source_text ?? "", /^12: export function buildSample/m);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.brief, ["Builds the sample value."]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.params, [
      { direction: "in", parameter_name: "input", value_type: "string", description: "Caller-supplied value." },
    ]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.returns, ["{string} Upper-cased result."]);
    assert.deepEqual(payload.files[0]?.matches[0]?.doxygen?.satisfies_requirement_ids, ["REQ-089"]);
    assert.equal(payload.execution.code, 0);
    assert.match(payload.execution.stderr, /skipped: src\/missing\.ts: not_found/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("find returns a structured repository-scoped construct-search payload", async () => {
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
    const result = await executeRegisteredTool(pi, "find", projectBase, {
      tag: "FUNCTION",
      pattern: "^build",
      enableLineNumbers: false,
    }) as {
      content?: Array<{ type: string; text?: string }>;
      details?: {
        summary: {
          search_status: string;
          matched_file_count: number;
          no_match_file_count: number;
          total_match_count: number;
        };
        repository: {
          source_directory_paths: string[];
          file_canonical_paths: string[];
        };
        files: Array<{
          canonical_path: string;
          status: string;
          matches: Array<{
            symbol_name: string;
            code_lines: Array<{ display_text: string }>;
            stripped_source_text?: string;
          }>;
        }>;
        execution: {
          code: number;
          stderr: string;
        };
      };
    };

    const payload = result.details!;
    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(payload)));
    assert.equal(payload.summary.search_status, "matched");
    assert.equal(payload.summary.matched_file_count, 1);
    assert.equal(payload.summary.no_match_file_count, 1);
    assert.equal(payload.summary.total_match_count, 1);
    assert.deepEqual(payload.repository.source_directory_paths, ["src"]);
    assert.deepEqual(payload.repository.file_canonical_paths, ["src/alpha.ts", "src/nested/beta.ts"]);
    assert.deepEqual(payload.files.map((file) => file.status), ["matched", "no_match"]);
    assert.equal(payload.files[0]?.matches[0]?.symbol_name, "buildAlpha");
    assert.match(payload.files[0]?.matches[0]?.code_lines[0]?.display_text ?? "", /^export function buildAlpha/);
    assert.doesNotMatch(payload.files[0]?.matches[0]?.stripped_source_text ?? "", /^\d+:/m);
    assert.equal(payload.execution.code, 0);
    assert.match(payload.execution.stderr, /info: no_match: src\/nested\/beta\.ts/);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
});

test("path, static-check, git, docs, and worktree tools return structured JSON payloads", async () => {
  const { projectBase } = initFixtureRepo({
    fixtures: [],
    staticCheck: {
      TypeScript: [{ module: "Dummy" }],
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

    const gitPathResult = await executeRegisteredTool(pi, "git-path", projectBase) as {
      content?: Array<{ text?: string }>;
      details?: {
        result: { path_value: string; path_present: boolean };
        execution: { code: number };
      };
    };
    assert.deepEqual(JSON.parse(gitPathResult.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(gitPathResult.details)));
    assert.equal(gitPathResult.details?.result.path_value, projectBase);
    assert.equal(gitPathResult.details?.result.path_present, true);
    assert.equal(gitPathResult.details?.execution.code, 0);

    const basePathResult = await executeRegisteredTool(pi, "get-base-path", projectBase) as {
      details?: {
        result: { path_value: string };
        execution: { code: number };
      };
    };
    assert.equal(basePathResult.details?.result.path_value, projectBase);
    assert.equal(basePathResult.details?.execution.code, 0);

    const gitCheckResult = await executeRegisteredTool(pi, "git-check", projectBase) as {
      details?: { result: { git_path_present: boolean; status: string }; execution: { code: number } };
    };
    assert.equal(gitCheckResult.details?.result.git_path_present, true);
    assert.equal(gitCheckResult.details?.result.status, "clean");
    assert.equal(gitCheckResult.details?.execution.code, 0);

    const docsCheckResult = await executeRegisteredTool(pi, "docs-check", projectBase) as {
      details?: {
        summary: { missing_file_count: number; present_file_count: number };
        files: Array<{ file_name: string; status: string; prompt_command: string }>;
        execution: { code: number };
      };
    };
    assert.equal(docsCheckResult.details?.summary.missing_file_count, 0);
    assert.equal(docsCheckResult.details?.summary.present_file_count, 3);
    assert.deepEqual(docsCheckResult.details?.files.map((file) => file.file_name), ["REQUIREMENTS.md", "WORKFLOW.md", "REFERENCES.md"]);
    assert.ok(docsCheckResult.details?.files.every((file) => file.status === "present"));
    assert.equal(docsCheckResult.details?.execution.code, 0);

    const filesStaticCheckResult = await executeRegisteredTool(pi, "files-static-check", projectBase, {
      files: ["src/check.ts", "src/missing.ts"],
    }) as {
      details?: {
        summary: { selected_file_count: number; skipped_file_count: number; total_configured_checker_count: number };
        files: Array<{ canonical_path: string; language_name?: string; status: string; configured_checker_modules: string[] }>;
        execution: { code: number };
      };
    };
    assert.equal(filesStaticCheckResult.details?.summary.selected_file_count, 1);
    assert.equal(filesStaticCheckResult.details?.summary.skipped_file_count, 1);
    assert.equal(filesStaticCheckResult.details?.summary.total_configured_checker_count, 1);
    assert.equal(filesStaticCheckResult.details?.files[0]?.canonical_path, "src/check.ts");
    assert.equal(filesStaticCheckResult.details?.files[0]?.language_name, "TypeScript");
    assert.deepEqual(filesStaticCheckResult.details?.files[0]?.configured_checker_modules, ["Dummy"]);
    assert.equal(filesStaticCheckResult.details?.files[1]?.status, "skipped");
    assert.equal(filesStaticCheckResult.details?.execution.code, 0);

    const staticCheckResult = await executeRegisteredTool(pi, "static-check", projectBase) as {
      details?: {
        summary: { selected_file_count: number };
        files: Array<{ canonical_path: string; status: string }>;
        execution: { code: number };
      };
    };
    assert.equal(staticCheckResult.details?.summary.selected_file_count, 1);
    assert.equal(staticCheckResult.details?.files[0]?.canonical_path, "src/check.ts");
    assert.equal(staticCheckResult.details?.files[0]?.status, "selected");
    assert.equal(staticCheckResult.details?.execution.code, 0);

    const gitWtNameResult = await executeRegisteredTool(pi, "git-wt-name", projectBase) as {
      details?: { result: { worktree_name?: string }; execution: { code: number } };
    };
    const wtName = gitWtNameResult.details?.result.worktree_name ?? "";
    assert.match(wtName, /^useReq-/);
    assert.equal(gitWtNameResult.details?.execution.code, 0);

    const gitWtCreateResult = await executeRegisteredTool(pi, "git-wt-create", projectBase, { wtName }) as {
      details?: { result: { worktree_name: string; worktree_path: string }; execution: { code: number } };
    };
    assert.equal(gitWtCreateResult.details?.result.worktree_name, wtName);
    assert.match(gitWtCreateResult.details?.result.worktree_path ?? "", new RegExp(`${wtName}$`));
    assert.equal(gitWtCreateResult.details?.execution.code, 0);

    const gitWtDeleteResult = await executeRegisteredTool(pi, "git-wt-delete", projectBase, { wtName }) as {
      details?: { result: { worktree_name: string; worktree_path: string }; execution: { code: number } };
    };
    assert.equal(gitWtDeleteResult.details?.result.worktree_name, wtName);
    assert.match(gitWtDeleteResult.details?.result.worktree_path ?? "", new RegExp(`${wtName}$`));
    assert.equal(gitWtDeleteResult.details?.execution.code, 0);
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
  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.equal(menuItems.some((item) => item.includes("reset-context")), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, "reset-context"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, "base-path"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(config, "git-path"), false);
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
  const ctx = createFakeCtx(cwd, { selects: ["show-config", "notifications", "Save and close", "Save and close"] });

  await command!.handler("", ctx);

  const renderedMenu = (ctx.__state.customRenderLines[0] ?? []).join("\n");
  assert.deepEqual(ctx.__state.selectCalls[0]?.items ?? [], [
    "Document directory",
    "Source-code directories",
    "Unit tests directory",
    "Static code checkers",
    "Enable tools",
    "Notifications",
    "Show configuration",
    "Reset defaults",
    "Save and close",
  ]);
  assert.ok(renderedMenu.includes(formatRuntimePathForDisplay(getProjectConfigPath(cwd))));
  assert.ok(renderedMenu.includes("notification:off • sound:none • pushover:off"));
  assert.doesNotMatch(renderedMenu, /beep:/);
  assert.deepEqual(ctx.__state.selectCalls[2]?.items ?? [], [
    "Enable notification",
    "Notification events",
    "Notify command",
    "Enable sound",
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
    "Save and close",
  ]);
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
    "Save and close",
  ]);
  assert.equal(notificationEventCalls[0]?.selectedChoiceId, "notify-on-completed");
  assert.equal(notificationEventCalls[1]?.selectedChoiceId, "notify-on-failed");
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
      "Enable sound",
      "high",
      "Reset defaults",
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
  assert.deepEqual([...usedColors].sort(), ["accent", "dim", "muted", "warning"]);
});

test("prompt commands use the current session by default", async () => {
  const cwd = createTempDir("pi-usereq-prompt-current-");
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("req-analyze");
  assert.ok(command);
  const ctx = createFakeCtx(cwd);

  await command!.handler("Inspect src/index.ts for prompt coverage", ctx);

  assert.equal(ctx.__state.waitForIdleCalls, 0);
  assert.equal(ctx.__state.newSessions.length, 0);
  assert.equal(pi.sentUserMessages.length, 1);
  assert.match(String(pi.sentUserMessages[0]?.content), /Inspect src\/index\.ts for prompt coverage/);
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
      "enabled-tools": ["git-path", "static-check"],
    }, null, 2)}\n`,
    "utf8",
  );

  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd);
  await pi.emit("session_start", { reason: "startup" }, ctx);

  const activeTools = new Set(pi.getActiveTools());
  assert.deepEqual([...activeTools].sort(), ["git-path", "static-check"]);
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

test("context hook renders the full context icon when usage exceeds ninety percent", async () => {
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

test("status overflow context icon uses only CLI-supported theme tokens", async () => {
  const cwd = createTempDir("pi-usereq-context-theme-contract-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const usedColors = new Set<string>();
  const pi = createFakePi();
  piUsereqExtension(pi);
  const ctx = createFakeCtx(cwd, { selects: [] }, {
    getContextUsage: () => ({ tokens: 1250, contextWindow: 1000, percent: 125 }),
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
      contextPercent: 125,
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
  assert.equal(activeTools.has("find"), false);
  assert.equal(activeTools.has("grep"), false);
  assert.equal(activeTools.has("ls"), false);
});

test("default configuration applies the documented notify, sound, and pushover defaults", () => {
  const config = getDefaultConfig(createTempDir("pi-usereq-default-notify-"));

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
});

test("configuration menu can enable embedded builtin tools", async () => {
  const cwd = createTempDir("pi-usereq-menu-embedded-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["Enable tools", "Toggle tool", "grep", "Save and close", "Save and close"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
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

test("configuration menu can persist notify and sound settings", async () => {
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
      "Enable sound",
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
      "notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png \"%%PROMT%% @ %%BASE%% [%%TIME%%]\" \"%%ARGS%%\"",
      "echo low %%INSTALLATION_PATH%%",
      "echo mid %%INSTALLATION_PATH%%",
      "echo high %%INSTALLATION_PATH%%",
    ],
  });

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
  assert.equal(config.PI_NOTIFY_CMD, "notify-send -i %%INSTALLATION_PATH%%/resources/images/pi.dev.png \"%%PROMT%% @ %%BASE%% [%%TIME%%]\" \"%%ARGS%%\"");
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
      sound: "high",
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
      "Enable pushover",
      "Pushover events",
      "Prompt failed",
      "Save and close",
      "Pushover priority",
      "High",
      "Pushover title",
      "Pushover text",
      "Pushover User Key/Delivery Group Key",
      "Pushover Token/API Token Key",
      "Save and close",
      "Save and close",
    ],
    inputs: [
      "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "%%ARGS%%",
      "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "ah6bf5u2sj63mcvou6qamiabeoubbe",
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
  assert.equal(config["notify-pushover-text"], "%%ARGS%%");
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

test("prompt-end pushover requests honor global enable, event toggles, credentials, priority, and templates", async () => {
  const cwd = createTempDir("pi-usereq-pushover-run-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const configPath = getProjectConfigPath(cwd);
  const writeConfig = (overrides: Record<string, unknown>) => {
    const config = {
      ...getDefaultConfig(cwd),
      ...overrides,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
      "notify-pushover-text": "%%ARGS%%",
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
    assert.equal(successParams.get("message"), "Inspect src/index.ts");
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
      "notify-pushover-on-failed": true,
      "notify-pushover-user-key": "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "notify-pushover-api-token": "ah6bf5u2sj63mcvou6qamiabeoubbe",
      "notify-pushover-priority": 1,
      "notify-pushover-title": "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "notify-pushover-text": "%%ARGS%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedRequests.length = 0;
    nowMs = 30_000;
    await pi.commands.get("req-write")!.handler("Write docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 32_000;
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
    assert.equal(errorParams.get("message"), "Write docs");

    writeConfig({
      "notify-pushover-enabled": true,
      "notify-pushover-on-completed": true,
      "notify-pushover-user-key": "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "notify-pushover-api-token": "",
      "notify-pushover-priority": 1,
      "notify-pushover-title": "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      "notify-pushover-text": "%%ARGS%%",
    });
    await pi.emit("session_start", { reason: "startup" }, ctx);
    recordedRequests.length = 0;
    nowMs = 40_000;
    await pi.commands.get("req-check")!.handler("Check docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 43_000;
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
  }
});

test("pushover global enable controls status and suppresses delivery when disabled", async () => {
  const cwd = createTempDir("pi-usereq-pushover-disabled-");
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
      "Save and close",
      "Save and close",
    ],
    inputs: [
      "gzfjjvp1xxmhibqwzh9m7i1zwvf83j",
      "ah6bf5u2sj63mcvou6qamiabeoubbe",
    ],
  });

  await command!.handler("", ctx);

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
  }
});

test("command notify routes through PI_NOTIFY_CMD placeholders and per-event toggles", async () => {
  const cwd = createTempDir("pi-usereq-command-notify-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const configPath = getProjectConfigPath(cwd);
  const writeConfig = (overrides: Record<string, unknown>) => {
    const config = {
      ...getDefaultConfig(cwd),
      ...overrides,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
      PI_NOTIFY_CMD: 'notify-send "%%PROMT%% @ %%BASE%% [%%TIME%%]" "%%ARGS%%"',
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
    assert.match(recordedCommands[0] ?? "", /Inspect src\/index\.ts/);

    recordedCommands.length = 0;
    nowMs = 10_000;
    await pi.commands.get("req-change")!.handler("Adjust docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 12_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "aborted", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 0);

    recordedCommands.length = 0;
    nowMs = 20_000;
    await pi.commands.get("req-write")!.handler("Write docs", ctx);
    await pi.emit("agent_start", {}, ctx);
    nowMs = 23_000;
    await pi.emit("agent_end", {
      messages: [{ role: "assistant", stopReason: "error", content: [] }],
    }, ctx);
    assert.equal(recordedCommands.length, 1);
    assert.match(
      recordedCommands[0] ?? "",
      new RegExp(`write @ ${buildExpectedNotifyBasePath(cwd).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\[0:03\\]`),
    );
    assert.match(recordedCommands[0] ?? "", /Write docs/);
  } finally {
    setPiNotifySpawnForTests(undefined);
    Date.now = originalDateNow;
  }
});

test("sound routing honors the selected sound state and per-event toggles", async () => {
  const cwd = createTempDir("pi-usereq-sound-routing-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const configPath = getProjectConfigPath(cwd);
  const writeConfig = (overrides: Record<string, unknown>) => {
    const config = {
      ...getDefaultConfig(cwd),
      ...overrides,
    };
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
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
  }
});

test("sound toggle shortcut cycles persisted pi-notify sound levels", async () => {
  const cwd = createTempDir("pi-usereq-shortcut-notify-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
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
    const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
    assert.equal(config["notify-sound"], expectedSound);
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

test("git-path tool derives the repository root at runtime", async () => {
  const { projectBase } = initFixtureRepo();
  try {
    const configPath = getProjectConfigPath(projectBase);
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    config["git-path"] = "/tmp/wrong-git-root";
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const pi = createFakePi();
    piUsereqExtension(pi);
    const result = await executeRegisteredTool(pi, "git-path", projectBase) as {
      content?: Array<{ text?: string }>;
      details?: { result: { path_value: string } };
    };

    assert.deepEqual(JSON.parse(result.content?.[0]?.text ?? "{}"), JSON.parse(JSON.stringify(result.details)));
    assert.equal(result.details?.result.path_value, projectBase);
  } finally {
    fs.rmSync(projectBase, { recursive: true, force: true });
  }
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

test("configuration menu can add static-check entries from raw specs", async () => {
  const cwd = createTempDir("pi-usereq-menu-sc-");
  fs.mkdirSync(path.dirname(getProjectConfigPath(cwd)), { recursive: true });
  const pi = createFakePi();
  piUsereqExtension(pi);
  const command = pi.commands.get("pi-usereq");
  assert.ok(command);

  await command!.handler(
    "",
    createFakeCtx(cwd, {
      selects: ["static-check", "Add entry from LANG=MODULE[,CMD[,PARAM...]]", "Save and close", "Save and close"],
      inputs: ["Python=Command,true"],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.deepEqual(config["static-check"].Python, [{ module: "Command", cmd: "true" }]);
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
  assert.match(renderedStaticCheckMenu, /Add entry for supported language/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Pylance/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Ruff/);
  assert.doesNotMatch(renderedStaticCheckMenu, /Dummy/);
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
        "Add entry for supported language",
        "Python",
        "Save and close",
        "Save and close",
      ],
      inputs: ["true", ""],
    }),
  );

  const config = JSON.parse(fs.readFileSync(getProjectConfigPath(cwd), "utf8"));
  assert.deepEqual(config["static-check"].Python, [{ module: "Command", cmd: "true" }]);
});
