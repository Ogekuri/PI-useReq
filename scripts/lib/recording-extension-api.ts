/**
 * @file
 * @brief Implements recording adapters for offline extension registration and replay.
 * @details Provides a minimal pi-compatible extension API plus command-context UI recorder used by the standalone debug harness. The module captures registered commands, registered tools, event handlers, active-tool state, user-message payloads, and UI side effects without invoking the official pi runtime. Runtime cost is O(n) in the number of recorded registrations and side effects. Side effects are limited to in-memory state mutation.
 */

import path from "node:path";
import {
  PI_USEREQ_DEFAULT_EMBEDDED_TOOL_NAMES,
  PI_USEREQ_EMBEDDED_TOOL_NAMES,
} from "../../src/core/pi-usereq-tools.js";

/**
 * @brief Represents a JSON-compatible serialized value.
 * @details Constrains harness snapshots to deterministic, stringifiable payloads so offline reports remain stable across process boundaries. The alias is compile-time only and introduces no runtime cost.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/**
 * @brief Describes normalized provenance metadata for commands and tools.
 * @details Mirrors the source-information shape documented by the pi SDK while remaining serializable for offline snapshots and parity reports. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingSourceInfo {
  path: string;
  source: string;
  scope: string;
  origin: string;
  baseDir?: string;
}

/**
 * @brief Describes one offline-recorded slash command registration.
 * @details Stores user-visible metadata plus synthesized provenance for deterministic inspection and parity comparison. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingCommandSnapshot {
  name: string;
  description?: string;
  source: "extension";
  sourceInfo: RecordingSourceInfo;
}

/**
 * @brief Describes one offline-recorded tool registration.
 * @details Stores registration metadata, parameter-schema presence, and normalized provenance while omitting executable function references from serialized output. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingToolSnapshot {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines: string[];
  hasParameters: boolean;
  parameters?: JsonValue;
  sourceInfo: RecordingSourceInfo;
}

/**
 * @brief Describes one recorded prompt-delivery payload.
 * @details Preserves serialized content and optional delivery metadata for direct `pi.sendUserMessage(...)` calls and user messages appended during offline new-session setup. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordedUserMessage {
  content: JsonValue;
  options?: JsonValue;
}

/**
 * @brief Describes one recorded notification side effect.
 * @details Captures the emitted message and severity level from `ctx.ui.notify(...)`. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingNotification {
  message: string;
  level: string;
}

/**
 * @brief Describes one recorded status-bar mutation.
 * @details Stores the status key and the written or cleared value from `ctx.ui.setStatus(...)`. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingStatusUpdate {
  key: string;
  value?: string;
}

/**
 * @brief Describes one recorded `ctx.ui.select(...)` interaction.
 * @details Captures the menu title, offered items, and dequeued scripted response so interactive command replays remain deterministic and auditable. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingSelectCall {
  title: string;
  items: string[];
  response?: string;
}

/**
 * @brief Describes one recorded `ctx.ui.input(...)` interaction.
 * @details Captures the prompt title, placeholder, and dequeued scripted response so interactive command replays remain deterministic and auditable. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingInputCall {
  title: string;
  placeholder?: string;
  response?: string;
}

/**
 * @brief Describes the complete UI-side-effect snapshot for one command context.
 * @details Aggregates notifications, statuses, editor mutations, select/input interactions, and unconsumed scripted responses for deterministic replay evidence. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingUiStateSnapshot {
  notifications: RecordingNotification[];
  statuses: Record<string, string>;
  statusUpdates: RecordingStatusUpdate[];
  editorText: string;
  editorTexts: string[];
  selectCalls: RecordingSelectCall[];
  inputCalls: RecordingInputCall[];
  remainingSelects: string[];
  remainingInputs: string[];
}

/**
 * @brief Describes scripted UI responses supplied to offline command replay.
 * @details Provides FIFO queues for `select` and `input` calls so the harness can execute interactive handlers without a live terminal UI. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingUiPlan {
  selects?: string[];
  inputs?: string[];
}

/**
 * @brief Describes the minimal command shape accepted by `registerCommand(...)`.
 * @details Matches the subset of the pi command-registration contract exercised by `src/index.ts`. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingCommandDefinition {
  description?: string;
  handler: (args: string, ctx: RecordingCommandContext) => Promise<void> | void;
}

/**
 * @brief Describes the minimal tool shape accepted by `registerTool(...)`.
 * @details Matches the subset of the pi tool-registration contract exercised by `src/index.ts` while remaining independent from the official SDK package at compile time. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingToolDefinition {
  name: string;
  label?: string;
  description?: string;
  promptSnippet?: string;
  promptGuidelines?: string[];
  parameters?: unknown;
  sourceInfo?: Partial<RecordingSourceInfo>;
  execute?: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal?: AbortSignal,
    onUpdate?: (update: unknown) => void,
    ctx?: RecordingCommandContext,
  ) => Promise<unknown> | unknown;
}

/**
 * @brief Serializes arbitrary registration payloads into deterministic JSON-compatible values.
 * @details Uses JSON stringify/parse with function elision and `undefined` normalization so TypeBox schemas and options objects can be embedded in snapshots without executable references. Runtime is O(n) in serialized payload size. No external state is mutated.
 * @param[in] value {unknown} Arbitrary value to serialize.
 * @return {JsonValue | undefined} JSON-compatible copy or `undefined` when the value cannot be represented.
 */
function toJsonValue(value: unknown): JsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }
  const serialized = JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "function") {
      return undefined;
    }
    if (typeof currentValue === "bigint") {
      return currentValue.toString();
    }
    return currentValue;
  });
  if (serialized === undefined) {
    return undefined;
  }
  return JSON.parse(serialized) as JsonValue;
}

/**
 * @brief Normalizes `SessionManager.appendMessage(...)` payloads into recorder user-message content.
 * @details Collapses single- or multi-part text arrays into one string so reset-session prompt delivery remains comparable with `pi.sendUserMessage(...)` snapshots; non-text payloads remain JSON-compatible. Runtime is O(n) in content size. No external state is mutated.
 * @param[in] message {unknown} Session-manager message payload supplied during `ctx.newSession(...setup)`.
 * @return {JsonValue} Normalized user-message content.
 */
function normalizeSessionUserMessageContent(message: unknown): JsonValue {
  if (!message || typeof message !== "object") {
    return toJsonValue(message) ?? null;
  }
  const content = (message as { content?: unknown }).content;
  if (
    Array.isArray(content)
    && content.every((item) => item && typeof item === "object" && (item as { type?: unknown }).type === "text")
  ) {
    return content
      .map((item) => (typeof (item as { text?: unknown }).text === "string" ? (item as { text: string }).text : ""))
      .join("");
  }
  return toJsonValue(content ?? null) ?? null;
}

/**
 * @brief Builds synthesized provenance metadata for offline registrations.
 * @details Normalizes the extension path and derives project-scoped extension source metadata that approximates the official runtime provenance contract. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] extensionPath {string} Absolute extension entry path.
 * @param[in] override {Partial<RecordingSourceInfo> | undefined} Optional source-info overrides supplied during registration.
 * @return {RecordingSourceInfo} Normalized provenance record.
 */
function buildSourceInfo(extensionPath: string, override?: Partial<RecordingSourceInfo>): RecordingSourceInfo {
  const absolutePath = path.resolve(extensionPath);
  return {
    path: override?.path ?? absolutePath,
    source: override?.source ?? "extension",
    scope: override?.scope ?? "project",
    origin: override?.origin ?? "top-level",
    baseDir: override?.baseDir ?? path.dirname(absolutePath),
  };
}

/**
 * @brief Builds synthesized provenance metadata for one builtin tool.
 * @details Produces the stable pseudo-path shape used by pi for builtin tools so extension runtime logic can distinguish builtin inventory entries during offline replay. Runtime is O(1). No external state is mutated.
 * @param[in] name {string} Builtin tool name.
 * @return {RecordingSourceInfo} Normalized builtin provenance record.
 */
function buildBuiltinSourceInfo(name: string): RecordingSourceInfo {
  return {
    path: `<builtin:${name}>`,
    source: "builtin",
    scope: "temporary",
    origin: "top-level",
    baseDir: "<builtin>",
  };
}

/**
 * @brief Builds one supported builtin tool descriptor for offline inventory queries.
 * @details Creates a minimal tool descriptor containing the builtin name, label, generic description, and synthesized builtin provenance metadata. Runtime is O(1). No external state is mutated.
 * @param[in] name {string} Builtin tool name.
 * @return {RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }} Builtin tool descriptor.
 */
function buildBuiltinToolDefinition(name: string): RecordingToolDefinition & { sourceInfo: RecordingSourceInfo } {
  return {
    name,
    label: name,
    description: `Built-in pi CLI tool ${name}.`,
    sourceInfo: buildBuiltinSourceInfo(name),
  };
}

/**
 * @brief Records UI activity and session-control side effects for one offline command context.
 * @details Exposes the subset of `ctx.ui` plus command-only session APIs consumed by the extension, dequeues scripted responses for interactive handlers, and accumulates deterministic side-effect evidence. Runtime is O(1) per UI or session-control operation plus delegated setup cost. Side effects are limited to in-memory state mutation.
 */
export class RecordingCommandContext {
  /**
   * @brief Stores the working directory exposed to handlers through `ctx.cwd`.
   * @details The value is immutable after construction and is consumed by extension code that resolves project-local configuration and prompt paths. Access complexity is O(1).
   */
  public readonly cwd: string;

  /**
   * @brief Exposes the recorded UI adapter consumed by extension handlers.
   * @details Each method mutates recorder state only and never touches a real terminal UI. Access complexity is O(1).
   */
  public readonly ui: {
    select: (title: string, items: string[]) => Promise<string | undefined>;
    input: (title: string, placeholder?: string) => Promise<string | undefined>;
    notify: (message: string, level?: string) => void;
    setStatus: (key: string, value?: string) => void;
    setEditorText: (value: string) => void;
  };

  private readonly selectQueue: string[];
  private readonly inputQueue: string[];
  private readonly notifications: RecordingNotification[] = [];
  private readonly statuses = new Map<string, string>();
  private readonly statusUpdates: RecordingStatusUpdate[] = [];
  private readonly editorTexts: string[] = [];
  private readonly selectCalls: RecordingSelectCall[] = [];
  private readonly inputCalls: RecordingInputCall[] = [];
  /**
   * @brief Stores the callback used to record user messages appended during new-session setup.
   * @details The callback normalizes `/new`-equivalent prompt delivery into the shared recorder snapshot without mutating real session state. Access complexity is O(1).
   */
  private readonly recordSessionUserMessage: (content: JsonValue) => void;

  /**
   * @brief Initializes a recording command context.
   * @details Copies scripted response queues so callers can reuse input arrays safely across replays, stores the user-message recorder used by `ctx.newSession(...setup)`, then binds a stable `ui` adapter over the recorder methods. Runtime is O(s + i) in queued select and input count. Side effects are limited to instance initialization.
   * @param[in] cwd {string} Working directory exposed through `ctx.cwd`.
   * @param[in] plan {RecordingUiPlan | undefined} Optional scripted UI responses.
   * @param[in] recordSessionUserMessage {(content: JsonValue) => void | undefined} Optional recorder for user messages appended during new-session setup.
   * @return {RecordingCommandContext} New context instance.
   */
  public constructor(cwd: string, plan?: RecordingUiPlan, recordSessionUserMessage?: (content: JsonValue) => void) {
    this.cwd = cwd;
    this.selectQueue = [...(plan?.selects ?? [])];
    this.inputQueue = [...(plan?.inputs ?? [])];
    this.recordSessionUserMessage = recordSessionUserMessage ?? (() => undefined);
    this.ui = {
      select: async (title: string, items: string[]) => this.recordSelect(title, items),
      input: async (title: string, placeholder?: string) => this.recordInput(title, placeholder),
      notify: (message: string, level = "info") => this.recordNotification(message, level),
      setStatus: (key: string, value?: string) => this.recordStatus(key, value),
      setEditorText: (value: string) => this.recordEditorText(value),
    };
  }

  /**
   * @brief Simulates `ctx.waitForIdle()` for offline command replay.
   * @details Offline command replay executes handlers synchronously with no concurrent agent stream, so the recorder resolves immediately. Runtime is O(1). No external state is mutated.
   * @return {Promise<void>} Already-resolved promise.
   */
  public async waitForIdle(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * @brief Simulates `ctx.newSession(...)` for offline command replay.
   * @details Executes the optional setup callback against a minimal session-manager stub that records appended user messages, thereby preserving `/new`-equivalent prompt delivery evidence without switching real sessions. Runtime is O(n) in setup work. Side effects are limited to in-memory user-message recording.
   * @param[in] options {{ parentSession?: string; setup?: (sessionManager: { appendMessage: (message: unknown) => string }) => Promise<void> } | undefined} Optional new-session options.
   * @return {Promise<{ cancelled: boolean }>} Deterministic non-cancelled result.
   */
  public async newSession(options?: {
    parentSession?: string;
    setup?: (sessionManager: { appendMessage: (message: unknown) => string }) => Promise<void>;
  }): Promise<{ cancelled: boolean }> {
    void options?.parentSession;
    if (options?.setup) {
      await options.setup({
        appendMessage: (message: unknown): string => {
          if ((message as { role?: unknown })?.role === "user") {
            this.recordSessionUserMessage(normalizeSessionUserMessageContent(message));
          }
          return "recorded-entry";
        },
      });
    }
    return { cancelled: false };
  }

  /**
   * @brief Captures one `select` interaction and returns the next scripted response.
   * @details Dequeues one response from the FIFO select plan, records the offered items, and returns `undefined` when no scripted response remains. Runtime is O(m) in item count for defensive copying. Side effects mutate recorder state.
   * @param[in] title {string} UI selection title.
   * @param[in] items {string[]} Offered selection items.
   * @return {string | undefined} Dequeued scripted response.
   */
  private recordSelect(title: string, items: string[]): string | undefined {
    const response = this.selectQueue.shift();
    this.selectCalls.push({ title, items: [...items], response });
    return response;
  }

  /**
   * @brief Captures one `input` interaction and returns the next scripted response.
   * @details Dequeues one response from the FIFO input plan and records the prompt metadata for later inspection. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] title {string} UI input title.
   * @param[in] placeholder {string | undefined} Optional placeholder string.
   * @return {string | undefined} Dequeued scripted response.
   */
  private recordInput(title: string, placeholder?: string): string | undefined {
    const response = this.inputQueue.shift();
    this.inputCalls.push({ title, placeholder, response });
    return response;
  }

  /**
   * @brief Captures one notification side effect.
   * @details Appends the emitted message and level in registration order. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] message {string} Notification payload.
   * @param[in] level {string} Notification severity.
   * @return {void} No return value.
   */
  private recordNotification(message: string, level: string): void {
    this.notifications.push({ message, level });
  }

  /**
   * @brief Captures one status-bar mutation.
   * @details Records the mutation history and maintains the latest non-cleared status map used by session-start and command replays. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] key {string} Status slot identifier.
   * @param[in] value {string | undefined} New status text or `undefined` to clear the slot.
   * @return {void} No return value.
   */
  private recordStatus(key: string, value?: string): void {
    this.statusUpdates.push({ key, value });
    if (value === undefined) {
      this.statuses.delete(key);
      return;
    }
    this.statuses.set(key, value);
  }

  /**
   * @brief Captures one editor-text mutation.
   * @details Appends the editor content in chronological order so callers can inspect the latest text and the full mutation history. Runtime is O(n) in text length for string copy. Side effects mutate recorder state.
   * @param[in] value {string} Editor content.
   * @return {void} No return value.
   */
  private recordEditorText(value: string): void {
    this.editorTexts.push(value);
  }

  /**
   * @brief Serializes the accumulated UI state.
   * @details Produces deterministic copies of the recorder collections and exposes both the latest editor text and any unconsumed scripted responses. Runtime is O(n) in recorded interaction count. No external state is mutated.
   * @return {RecordingUiStateSnapshot} Immutable snapshot of the UI recorder state.
   */
  public snapshotUiState(): RecordingUiStateSnapshot {
    return {
      notifications: this.notifications.map((notification) => ({ ...notification })),
      statuses: Object.fromEntries(this.statuses.entries()),
      statusUpdates: this.statusUpdates.map((update) => ({ ...update })),
      editorText: this.editorTexts.at(-1) ?? "",
      editorTexts: [...this.editorTexts],
      selectCalls: this.selectCalls.map((call) => ({ title: call.title, items: [...call.items], response: call.response })),
      inputCalls: this.inputCalls.map((call) => ({ ...call })),
      remainingSelects: [...this.selectQueue],
      remainingInputs: [...this.inputQueue],
    };
  }
}

/**
 * @brief Aggregates the offline registration snapshot maintained by `RecordingExtensionAPI`.
 * @details Combines command metadata, tool metadata, event names, active tools, and sent user messages for deterministic inspection and parity comparison. The interface is compile-time only and introduces no runtime cost.
 */
export interface RecordingExtensionSnapshot {
  commands: RecordingCommandSnapshot[];
  tools: RecordingToolSnapshot[];
  eventHandlers: string[];
  activeTools: string[];
  sentUserMessages: RecordedUserMessage[];
}

/**
 * @brief Records extension registrations and runtime-like mutations for offline replay.
 * @details Implements the subset of the pi extension API exercised by `src/index.ts`, synthesizes provenance metadata, preserves registration order, and exposes lookup helpers for harness commands. Runtime is O(1) per registration or mutation plus payload serialization. Side effects are limited to in-memory state mutation.
 */
export class RecordingExtensionAPI {
  private readonly extensionPath: string;
  private readonly commandOrder: string[] = [];
  private readonly commandDefinitions = new Map<string, RecordingCommandDefinition>();
  private readonly commandSnapshots = new Map<string, RecordingCommandSnapshot>();
  private readonly toolOrder: string[] = [];
  private readonly toolDefinitions = new Map<string, RecordingToolDefinition>();
  private readonly toolSnapshots = new Map<string, RecordingToolSnapshot>();
  private readonly eventHandlers = new Map<string, Array<(event: unknown, ctx: RecordingCommandContext) => Promise<unknown> | unknown>>();
  private readonly sentUserMessages: RecordedUserMessage[] = [];
  private activeTools: string[] = [];

  /**
   * @brief Initializes a recording extension API instance.
   * @details Stores the normalized extension path used to synthesize provenance metadata for every subsequently registered command and tool, then seeds the recorder with the supported builtin default active-tool set. Runtime is O(p + b) in path length and builtin-tool count. Side effects are limited to instance initialization.
   * @param[in] extensionPath {string} Absolute or relative extension entry path.
   * @return {RecordingExtensionAPI} New recorder instance.
   */
  public constructor(extensionPath: string) {
    this.extensionPath = path.resolve(extensionPath);
    this.activeTools = [...PI_USEREQ_DEFAULT_EMBEDDED_TOOL_NAMES];
  }

  /**
   * @brief Returns the supported builtin tools visible during offline replay.
   * @details Synthesizes builtin descriptors for the supported embedded-tool subset and omits names already overridden by extension-registered tools. Runtime is O(b). No external state is mutated.
   * @return {Array<RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }>} Builtin tool descriptors available to `getAllTools()`.
   */
  private getBuiltinTools(): Array<RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }> {
    return PI_USEREQ_EMBEDDED_TOOL_NAMES
      .filter((name) => !this.toolDefinitions.has(name))
      .map((name) => buildBuiltinToolDefinition(name));
  }

  /**
   * @brief Registers one slash command in the offline recorder.
   * @details Preserves first-registration order, stores the callable handler for later replay, and synthesizes extension provenance metadata for inspection and parity comparison. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] name {string} Slash-command name without the leading slash.
   * @param[in] definition {RecordingCommandDefinition} Command registration payload.
   * @return {void} No return value.
   * @satisfies REQ-046
   */
  public registerCommand(name: string, definition: RecordingCommandDefinition): void {
    if (!this.commandDefinitions.has(name)) {
      this.commandOrder.push(name);
    }
    this.commandDefinitions.set(name, definition);
    this.commandSnapshots.set(name, {
      name,
      description: definition.description,
      source: "extension",
      sourceInfo: buildSourceInfo(this.extensionPath),
    });
  }

  /**
   * @brief Registers one tool in the offline recorder.
   * @details Preserves first-registration order, stores the callable execute handler for later replay, synthesizes extension provenance metadata, and marks newly seen extension tools active by default to mirror runtime registration behavior. Runtime is O(n) in tool count for duplicate filtering. Side effects mutate recorder state.
   * @param[in] definition {RecordingToolDefinition} Tool registration payload.
   * @return {void} No return value.
   * @satisfies REQ-046
   */
  public registerTool(definition: RecordingToolDefinition): void {
    if (!this.toolDefinitions.has(definition.name)) {
      this.toolOrder.push(definition.name);
      this.activeTools = [...this.activeTools, definition.name];
    }
    this.toolDefinitions.set(definition.name, definition);
    this.toolSnapshots.set(definition.name, {
      name: definition.name,
      label: definition.label,
      description: definition.description,
      promptSnippet: definition.promptSnippet,
      promptGuidelines: [...(definition.promptGuidelines ?? [])],
      hasParameters: definition.parameters !== undefined,
      parameters: toJsonValue(definition.parameters),
      sourceInfo: buildSourceInfo(this.extensionPath, definition.sourceInfo),
    });
    this.activeTools = this.activeTools.filter((toolName, index, values) => values.indexOf(toolName) === index);
  }

  /**
   * @brief Registers one event handler in the offline recorder.
   * @details Appends the handler to the event-specific FIFO list so replay preserves registration order. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] name {string} Event name.
   * @param[in] handler {(event: unknown, ctx: RecordingCommandContext) => Promise<unknown> | unknown} Event handler callback.
   * @return {void} No return value.
   * @satisfies REQ-046
   */
  public on(name: string, handler: (event: unknown, ctx: RecordingCommandContext) => Promise<unknown> | unknown): void {
    const handlers = this.eventHandlers.get(name) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(name, handlers);
  }

  /**
   * @brief Returns all tools visible to extension runtime logic.
   * @details Produces supported builtin tool descriptors first, then appends extension-registered tools in registration order, always including synthesized `sourceInfo` required by active-tool filtering. Runtime is O(n + b). No external state is mutated.
   * @return {Array<RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }>} Visible runtime tool descriptors.
   * @satisfies REQ-046
   */
  public getAllTools(): Array<RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }> {
    const registeredTools = this.toolOrder
      .map((toolName) => {
        const definition = this.toolDefinitions.get(toolName);
        const snapshot = this.toolSnapshots.get(toolName);
        if (!definition || !snapshot) {
          return undefined;
        }
        return {
          ...definition,
          promptGuidelines: [...(definition.promptGuidelines ?? [])],
          sourceInfo: { ...snapshot.sourceInfo },
        };
      })
      .filter((tool): tool is RecordingToolDefinition & { sourceInfo: RecordingSourceInfo } => tool !== undefined);
    return [...this.getBuiltinTools(), ...registeredTools];
  }

  /**
   * @brief Returns the current active-tool set.
   * @details Clones the active-tool array so callers cannot mutate recorder state accidentally. Runtime is O(n) in active-tool count. No external state is mutated.
   * @return {string[]} Active tool names in activation order.
   * @satisfies REQ-046
   */
  public getActiveTools(): string[] {
    return [...this.activeTools];
  }

  /**
   * @brief Replaces the active-tool set with a filtered deduplicated list.
   * @details Removes names absent from the visible runtime inventory, preserves first occurrence order, and stores the resulting activation set for later inspection and parity comparison. Runtime is O(n + b). Side effects mutate recorder state.
   * @param[in] names {string[]} Requested active-tool names.
   * @return {void} No return value.
   * @satisfies REQ-046
   */
  public setActiveTools(names: string[]): void {
    const available = new Set(this.getAllTools().map((tool) => tool.name));
    this.activeTools = names.filter((toolName, index, values) => available.has(toolName) && values.indexOf(toolName) === index);
  }

  /**
   * @brief Appends one normalized user-message snapshot.
   * @details Centralizes storage for direct `pi.sendUserMessage(...)` calls and `/new`-session setup injections so replay reports expose one stable user-message inventory. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] content {JsonValue} Normalized user-message content.
   * @param[in] options {JsonValue | undefined} Optional normalized delivery metadata.
   * @return {void} No return value.
   */
  private appendRecordedUserMessage(content: JsonValue, options?: JsonValue): void {
    this.sentUserMessages.push({ content, options });
  }

  /**
   * @brief Records one user message injected by the extension.
   * @details Serializes the content payload plus optional delivery metadata into a deterministic JSON-compatible structure. Runtime is O(n) in payload size. Side effects mutate recorder state.
   * @param[in] content {unknown} Message content accepted by `pi.sendUserMessage(...)`.
   * @param[in] options {unknown} Optional delivery metadata.
   * @return {void} No return value.
   * @satisfies REQ-046
   */
  public sendUserMessage(content: unknown, options?: unknown): void {
    this.appendRecordedUserMessage(toJsonValue(content) ?? null, toJsonValue(options));
  }

  /**
   * @brief Records one user message appended during offline new-session setup.
   * @details Captures `/new`-equivalent prompt delivery performed through `ctx.newSession(...setup)` so command replay reports preserve the rendered prompt payload even when no direct `pi.sendUserMessage(...)` call occurs. Runtime is O(1). Side effects mutate recorder state.
   * @param[in] content {JsonValue} Normalized user-message content.
   * @return {void} No return value.
   * @satisfies REQ-054, REQ-067
   */
  public recordSessionUserMessage(content: JsonValue): void {
    this.appendRecordedUserMessage(content);
  }

  /**
   * @brief Returns the recorded command metadata in registration order.
   * @details Clones the stored command snapshot array for deterministic inspection and parity comparison. Runtime is O(n) in command count. No external state is mutated.
   * @return {RecordingCommandSnapshot[]} Recorded command descriptors.
   */
  public getCommands(): RecordingCommandSnapshot[] {
    return this.commandOrder
      .map((commandName) => this.commandSnapshots.get(commandName))
      .filter((command): command is RecordingCommandSnapshot => command !== undefined)
      .map((command) => ({ ...command, sourceInfo: { ...command.sourceInfo } }));
  }

  /**
   * @brief Looks up one registered command definition by name.
   * @details Returns the stored handler payload for offline replay. Runtime is O(1). No external state is mutated.
   * @param[in] name {string} Command name.
   * @return {RecordingCommandDefinition | undefined} Registered command definition or `undefined`.
   */
  public getCommandDefinition(name: string): RecordingCommandDefinition | undefined {
    return this.commandDefinitions.get(name);
  }

  /**
   * @brief Looks up one registered tool definition by name.
   * @details Returns the stored execute payload for offline replay. Runtime is O(1). No external state is mutated.
   * @param[in] name {string} Tool name.
   * @return {RecordingToolDefinition | undefined} Registered tool definition or `undefined`.
   */
  public getToolDefinition(name: string): RecordingToolDefinition | undefined {
    return this.toolDefinitions.get(name);
  }

  /**
   * @brief Returns the handlers registered for one event.
   * @details Clones the event-handler list so callers can replay it without mutating recorder state. Runtime is O(n) in handler count. No external state is mutated.
   * @param[in] name {string} Event name.
   * @return {Array<(event: unknown, ctx: RecordingCommandContext) => Promise<unknown> | unknown>} Registered handlers in registration order.
   */
  public getEventHandlers(name: string): Array<(event: unknown, ctx: RecordingCommandContext) => Promise<unknown> | unknown> {
    return [...(this.eventHandlers.get(name) ?? [])];
  }

  /**
   * @brief Returns all recorded event names in registration order.
   * @details Preserves `Map` insertion order so inspection output remains stable across runs. Runtime is O(n) in event count. No external state is mutated.
   * @return {string[]} Registered event names.
   */
  public getEventNames(): string[] {
    return [...this.eventHandlers.keys()];
  }

  /**
   * @brief Serializes the complete recorder state.
   * @details Aggregates command metadata, tool metadata, event names, active tools, and recorded user messages into one stable snapshot object. Runtime is O(n) in total recorded entries. No external state is mutated.
   * @return {RecordingExtensionSnapshot} Complete offline registration snapshot.
   * @satisfies REQ-046
   */
  public snapshot(): RecordingExtensionSnapshot {
    return {
      commands: this.getCommands(),
      tools: this.toolOrder
        .map((toolName) => this.toolSnapshots.get(toolName))
        .filter((tool): tool is RecordingToolSnapshot => tool !== undefined)
        .map((tool) => ({ ...tool, promptGuidelines: [...tool.promptGuidelines], sourceInfo: { ...tool.sourceInfo } })),
      eventHandlers: this.getEventNames(),
      activeTools: this.getActiveTools(),
      sentUserMessages: this.sentUserMessages.map((message) => ({ ...message })),
    };
  }
}
