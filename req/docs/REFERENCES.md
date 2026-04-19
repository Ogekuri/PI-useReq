# Files Structure
```
.
├── scripts
│   ├── debug-extension.ts
│   ├── lib
│   │   ├── extension-debug-harness.ts
│   │   ├── recording-extension-api.ts
│   │   └── sdk-smoke.ts
│   ├── pi-usereq-debug.sh
│   └── tool-args-to-params.ts
└── src
    ├── cli.ts
    ├── core
    │   ├── agent-tool-json.ts
    │   ├── compress-files.ts
    │   ├── compress-payload.ts
    │   ├── compress.ts
    │   ├── config.ts
    │   ├── doxygen-parser.ts
    │   ├── errors.ts
    │   ├── extension-status.ts
    │   ├── find-constructs.ts
    │   ├── find-payload.ts
    │   ├── generate-markdown.ts
    │   ├── path-context.ts
    │   ├── pi-notify.ts
    │   ├── pi-usereq-tools.ts
    │   ├── prompts.ts
    │   ├── reference-payload.ts
    │   ├── resources.ts
    │   ├── runtime-project-paths.ts
    │   ├── settings-menu.ts
    │   ├── source-analyzer.ts
    │   ├── static-check.ts
    │   ├── token-counter.ts
    │   ├── tool-runner.ts
    │   └── utils.ts
    └── index.ts
```

# debug-extension.ts | TypeScript | 497L | 17 symbols | 4 imports | 19 comments
> Path: `scripts/debug-extension.ts`
- @brief Implements the standalone extension debug harness CLI.
- @details Parses debug-harness subcommands, dispatches offline inspection and replay operations, formats reports as JSON or human-readable markdown, and converts `ReqError` instances into process-style stderr plus exit codes. Runtime is dominated by the selected harness subcommand. Side effects include stdout/stderr writes and any extension-owned behavior triggered by delegated replay operations.

## Imports
```
import process from "node:process";
import { ReqError } from "../src/core/errors.js";
import {
import { runSdkSmoke, type ParityMismatch, type SdkSmokeReport } from "./lib/sdk-smoke.js";
```

## Definitions

- type `type OutputFormat = "json" | "pretty";` (L26)
- @brief Enumerates the supported harness output formats.
- @details Keeps the CLI formatter selection constrained to deterministic JSON output or human-readable markdown output. The alias is compile-time only and introduces no runtime cost.
### iface `interface ParsedHarnessArgs` (L32-44)
- @brief Describes the parsed debug-harness CLI arguments.
- @details Captures the selected subcommand plus all recognized option values in the normalized shape consumed by `main`. The interface is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedHarnessArgs` (L78-141)
- @brief Parses raw CLI arguments into a normalized harness command object.
- @details Performs a single left-to-right scan, records the first positional token as the subcommand, supports repeatable `--select` and `--input` options, and defaults the output format to `pretty`. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding executable and script path.
- @return {ParsedHarnessArgs} Parsed harness arguments.

### fn `function parseJsonObject(text: string | undefined, label: string, fallback: Record<string, unknown>): Record<string, unknown>` (L152-168)
- @brief Parses a JSON object option from the CLI.
- @details Accepts an omitted value as the supplied fallback, requires object payloads for present values, and wraps parse failures in `ReqError` for deterministic CLI error reporting. Runtime is O(n) in input size. No external state is mutated.
- @param[in] text {string | undefined} Raw JSON option value.
- @param[in] label {string} Human-readable option label.
- @param[in] fallback {Record<string, unknown>} Fallback object when the option is omitted.
- @return {Record<string, unknown>} Parsed JSON object.
- @throws {ReqError} Throws when the option is present but not valid JSON object syntax.

### fn `function writeStdout(text: string): void` (L176-180)
- @brief Writes non-empty text to stdout.
- @details Skips zero-length writes so callers can compose output safely. Runtime is O(n) in text length. Side effects are limited to stdout writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L188-193)
- @brief Writes non-empty text to stderr with a trailing newline.
- @details Appends a newline when needed and skips empty payloads. Runtime is O(n) in text length. Side effects are limited to stderr writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `function formatJson(value: unknown): string` (L201-203)
- @brief Serializes one arbitrary report as pretty-printed JSON.
- @details Uses two-space indentation and appends a trailing newline for stable automation-friendly output. Runtime is O(n) in report size. No external state is mutated.
- @param[in] value {unknown} Report payload.
- @return {string} JSON document.

### fn `function formatSnapshotHeader(snapshot: OfflineContractSnapshot): string[]` (L211-222)
- @brief Formats the common snapshot header for human-readable output.
- @details Renders normalized path metadata, registration counts, and event names shared by all offline reports. Runtime is O(n) in inventory size. No external state is mutated.
- @param[in] snapshot {OfflineContractSnapshot} Snapshot payload.
- @return {string[]} Markdown lines.

### fn `function formatInspectReport(report: InspectReport): string` (L230-249)
- @brief Formats one offline inspection report for human-readable output.
- @details Emits sections for inventory counts, commands, tools, sent user messages, and the generated usage manual. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {InspectReport} Inspection report.
- @return {string} Markdown document.

### fn `function formatUiState(ui: SessionStartReport["ui"]): string[]` (L257-281)
- @brief Formats one recorded UI state snapshot for human-readable output.
- @details Emits statuses, notifications, editor text, and scripted interaction traces used by session-start and command/tool replay reports. Runtime is O(n) in interaction count. No external state is mutated.
- @param[in] ui {SessionStartReport["ui"]} UI-state snapshot.
- @return {string[]} Markdown lines.

### fn `function formatSessionStartReport(report: SessionStartReport): string` (L289-300)
- @brief Formats one session-start replay report for human-readable output.
- @details Emits common snapshot metadata plus the recorded event payload and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {SessionStartReport} Session-start replay report.
- @return {string} Markdown document.

### fn `function formatCommandReplayReport(report: CommandReplayReport): string` (L308-325)
- @brief Formats one command replay report for human-readable output.
- @details Emits common snapshot metadata, command identity, sent user messages, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {CommandReplayReport} Command replay report.
- @return {string} Markdown document.

### fn `function formatToolReplayReport(report: ToolReplayReport): string` (L333-352)
- @brief Formats one tool replay report for human-readable output.
- @details Emits common snapshot metadata, tool identity, input parameters, streamed updates, final result payload, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {ToolReplayReport} Tool replay report.
- @return {string} Markdown document.

### fn `function formatMismatch(mismatch: ParityMismatch): string[]` (L360-367)
- @brief Formats one parity mismatch for human-readable output.
- @details Emits the category, subject, detail, and normalized offline versus SDK payloads for deterministic troubleshooting. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] mismatch {ParityMismatch} Mismatch payload.
- @return {string[]} Markdown lines.

### fn `function formatSdkSmokeReport(report: SdkSmokeReport): string` (L375-395)
- @brief Formats one SDK smoke report for human-readable output.
- @details Emits parity status, offline versus SDK inventory counts, runtime-shape metadata, and detailed mismatch entries when parity fails. Runtime is O(n) in report size. No external state is mutated.
- @param[in] report {SdkSmokeReport} SDK smoke report.
- @return {string} Markdown document.

### fn `function formatReport(` (L405-427)
- @brief Formats the selected report according to the requested output mode.
- @details Uses JSON for automation-friendly output and markdown for human review. Runtime is O(n) in report size. No external state is mutated.
- @param[in] format {OutputFormat} Requested output format.
- @param[in] subcommand {string} Executed harness subcommand.
- @param[in] report {InspectReport | SessionStartReport | CommandReplayReport | ToolReplayReport | SdkSmokeReport} Report payload.
- @return {string} Final stdout payload.

### fn `export async function main(argv = process.argv.slice(2)): Promise<number>` (L436-491)
- @brief Executes one standalone debug-harness invocation.
- @details Parses CLI arguments, validates subcommand-specific requirements, dispatches the selected harness workflow, and formats the result for stdout while converting `ReqError` failures into stderr plus exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and delegated extension replay behavior.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {Promise<number>} Process exit code.
- @throws {ReqError} Internally catches `ReqError` and returns its exit code.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`OutputFormat`|type||26||
|`ParsedHarnessArgs`|iface||32-44|interface ParsedHarnessArgs|
|`parseArgs`|fn||78-141|function parseArgs(argv: string[]): ParsedHarnessArgs|
|`parseJsonObject`|fn||152-168|function parseJsonObject(text: string | undefined, label:...|
|`writeStdout`|fn||176-180|function writeStdout(text: string): void|
|`writeStderr`|fn||188-193|function writeStderr(text: string): void|
|`formatJson`|fn||201-203|function formatJson(value: unknown): string|
|`formatSnapshotHeader`|fn||211-222|function formatSnapshotHeader(snapshot: OfflineContractSn...|
|`formatInspectReport`|fn||230-249|function formatInspectReport(report: InspectReport): string|
|`formatUiState`|fn||257-281|function formatUiState(ui: SessionStartReport["ui"]): str...|
|`formatSessionStartReport`|fn||289-300|function formatSessionStartReport(report: SessionStartRep...|
|`formatCommandReplayReport`|fn||308-325|function formatCommandReplayReport(report: CommandReplayR...|
|`formatToolReplayReport`|fn||333-352|function formatToolReplayReport(report: ToolReplayReport)...|
|`formatMismatch`|fn||360-367|function formatMismatch(mismatch: ParityMismatch): string[]|
|`formatSdkSmokeReport`|fn||375-395|function formatSdkSmokeReport(report: SdkSmokeReport): st...|
|`formatReport`|fn||405-427|function formatReport(|
|`main`|fn||436-491|export async function main(argv = process.argv.slice(2)):...|


---

# extension-debug-harness.ts | TypeScript | 450L | 17 symbols | 6 imports | 20 comments
> Path: `scripts/lib/extension-debug-harness.ts`
- @brief Implements offline extension inspection and replay for the standalone debug harness.
- @details Loads the extension default export as a black box, records registrations through `RecordingExtensionAPI`, replays `session_start`, command, and tool handlers through recorded public boundaries, and renders a deterministic usage manual. Runtime is O(r + u) where r is the number of registrations and u is the number of replayed side effects. Side effects are limited to dynamic module loading, temporary `process.cwd()` mutation during replay, filesystem existence checks, and any extension-owned side effects triggered by the recorded handlers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { ReqError } from "../../src/core/errors.js";
import {
```

## Definitions

### iface `export interface ExtensionFactory` (L25-27)
- @brief Describes the public shape of an extension factory loaded by the harness.
- @details Constrains the dynamic import result to the default-export contract used by pi extensions while remaining independent from the official SDK package at compile time. The interface is compile-time only and introduces no runtime cost.

### iface `export interface OfflineContractSnapshot extends RecordingExtensionSnapshot` : RecordingExtensionSnapshot (L33-38)
- @brief Describes the shared offline snapshot returned by all harness operations.
- @details Aggregates normalized paths plus the recorded command, tool, event, active-tool, and user-message inventories so every subcommand can emit a stable machine-readable payload. The interface is compile-time only and introduces no runtime cost.

### iface `export interface InspectReport extends OfflineContractSnapshot` : OfflineContractSnapshot (L44-46)
- @brief Describes the `inspect` subcommand result.
- @details Extends the base offline snapshot with a generated usage manual covering every registered `req-*` command and agent tool. The interface is compile-time only and introduces no runtime cost.

### iface `export interface SessionStartReport extends OfflineContractSnapshot` : OfflineContractSnapshot (L52-56)
- @brief Describes the `session-start` subcommand result.
- @details Extends the base offline snapshot with the invoked event payload and all recorded UI side effects produced during `session_start` replay. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CommandReplayReport extends OfflineContractSnapshot` : OfflineContractSnapshot (L62-66)
- @brief Describes the `command` subcommand result.
- @details Extends the base offline snapshot with the executed command name, raw argument string, and recorded UI side effects produced by the command handler. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ToolReplayReport extends OfflineContractSnapshot` : OfflineContractSnapshot (L72-78)
- @brief Describes the `tool` subcommand result.
- @details Extends the base offline snapshot with the executed tool name, input parameter object, streamed updates, final result payload, and recorded UI side effects. The interface is compile-time only and introduces no runtime cost.

### iface `export interface HarnessPaths` (L84-87)
- @brief Describes the resolved harness execution target paths.
- @details Stores absolute normalized filesystem locations for the requested working directory and extension entry path. The interface is compile-time only and introduces no runtime cost.

### fn `function toJsonValue(value: unknown): JsonValue` (L95-106)
- @brief Serializes arbitrary replay payloads into deterministic JSON-compatible values.
- @details Uses JSON stringify/parse with function elision and bigint normalization so tool results, streamed updates, and event payloads remain stable in offline reports. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] value {unknown} Arbitrary payload value.
- @return {JsonValue} JSON-compatible representation.

### fn `export function resolveHarnessPaths(cwd?: string, extensionPath?: string): HarnessPaths` (L116-126)
- @brief Validates and resolves the requested working directory and extension path.
- @details Normalizes both inputs to absolute paths, rejects missing directories and files, and defaults the extension entry to `./src/index.ts` relative to the current process cwd when omitted. Runtime is O(p) in path length plus filesystem existence checks. Side effects are limited to filesystem reads.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @return {HarnessPaths} Resolved absolute paths.
- @throws {ReqError} Throws when the working directory or extension entry does not exist.

### fn `export async function loadExtensionFactory(extensionPath: string): Promise<ExtensionFactory>` (L136-143)
- @brief Loads the extension default export as a black-box factory.
- @details Performs a dynamic ESM import from the resolved extension path, verifies that the module exposes a callable default export, and returns that function without inspecting extension internals. Runtime is dominated by module loading. Side effects are limited to module evaluation.
- @param[in] extensionPath {string} Absolute extension entry path.
- @return {Promise<ExtensionFactory>} Loaded extension factory.
- @throws {ReqError} Throws when the module lacks a callable default export.
- @satisfies REQ-048

### fn `async function withProcessCwd<T>(cwd: string, action: () => Promise<T> | T): Promise<{ value: T; effectiveProcessCwd: string }>` (L152-161)
- @brief Executes a callback with `process.cwd()` temporarily set to the requested directory.
- @details Changes the current working directory before invoking the callback, records the effective cwd observed inside the callback, and restores the previous cwd in a `finally` block. Runtime is dominated by the callback. Side effects transiently mutate process cwd.
- @param[in] cwd {string} Requested working directory.
- @param[in] action {() => Promise<T> | T} Callback executed under the requested cwd.
- @return {Promise<{ value: T; effectiveProcessCwd: string }>} Callback result plus the cwd observed during execution.

### fn `async function registerExtensionOffline(` (L171-183)
- @brief Registers the target extension into a fresh recording API instance.
- @details Resolves the harness paths, loads the extension default export, instantiates a new recorder, and invokes the factory as a black box under the requested cwd. Runtime is dominated by module loading plus extension registration. Side effects include any extension-owned registration-time behavior.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @return {Promise<{ api: RecordingExtensionAPI; paths: HarnessPaths; effectiveProcessCwd: string }>} Recorder plus resolved paths.
- @satisfies REQ-048

### fn `export function buildDebugManual(snapshot: RecordingExtensionSnapshot): string` (L239-265)
- @brief Builds the generated harness usage manual.
- @details Emits one example for each debug mode plus one concrete replay example for every registered `req-*` command and agent tool. Runtime is O(c + t) in command and tool count. No external state is mutated.
- @param[in] snapshot {RecordingExtensionSnapshot} Recorded registration snapshot.
- @return {string} Markdown manual.
- @satisfies REQ-052

### fn `export async function inspectExtension(cwd?: string, extensionPath?: string): Promise<InspectReport>` (L275-290)
- @brief Builds an offline inspection report without replaying runtime handlers.
- @details Loads and registers the extension as a black box, captures the registration snapshot, and appends the generated usage manual. Runtime is dominated by extension registration. Side effects are limited to registration-time extension behavior.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @return {Promise<InspectReport>} Offline inspection report.
- @satisfies REQ-048, REQ-050, REQ-051, REQ-052

### fn `export async function replaySessionStart(` (L302-336)
- @brief Replays the recorded `session_start` handlers offline.
- @details Loads and registers the extension as a black box, invokes every recorded `session_start` handler in registration order, and captures final active tools, user messages, and UI side effects. Runtime is dominated by handler execution. Side effects include temporary `process.cwd()` mutation plus extension-owned handler behavior.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @param[in] eventPayload {Record<string, unknown> | undefined} Optional session-start payload. Defaults to `{ reason: "startup" }`.
- @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
- @return {Promise<SessionStartReport>} Offline session-start replay report.
- @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-053

### fn `export async function replayCommand(` (L350-386)
- @brief Replays one recorded command handler offline.
- @details Loads and registers the extension as a black box, resolves the named command from the recording API, executes its handler under the requested cwd, and captures resulting user messages plus UI side effects. Runtime is dominated by the command handler. Side effects include temporary `process.cwd()` mutation plus extension-owned command behavior.
- @param[in] commandName {string} Registered command name.
- @param[in] commandArgs {string} Raw command argument string.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
- @return {Promise<CommandReplayReport>} Offline command replay report.
- @throws {ReqError} Throws when the named command is not registered.
- @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-054, REQ-058

### fn `export async function replayTool(` (L400-450)
- @brief Replays one recorded tool execute handler offline.
- @details Loads and registers the extension as a black box, resolves the named tool from the recording API, executes its `execute(...)` handler under the requested cwd, records streamed updates, and captures the final return payload plus UI side effects. Runtime is dominated by the tool handler. Side effects include temporary `process.cwd()` mutation plus extension-owned tool behavior.
- @param[in] toolName {string} Registered tool name.
- @param[in] toolParams {Record<string, unknown>} Tool parameter object.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @param[in] uiPlan {RecordingUiPlan | undefined} Optional scripted UI responses.
- @return {Promise<ToolReplayReport>} Offline tool replay report.
- @throws {ReqError} Throws when the named tool is not registered or lacks an execute handler.
- @satisfies REQ-048, REQ-049, REQ-050, REQ-051, REQ-055, REQ-058

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ExtensionFactory`|iface||25-27|export interface ExtensionFactory|
|`OfflineContractSnapshot`|iface||33-38|export interface OfflineContractSnapshot extends Recordin...|
|`InspectReport`|iface||44-46|export interface InspectReport extends OfflineContractSna...|
|`SessionStartReport`|iface||52-56|export interface SessionStartReport extends OfflineContra...|
|`CommandReplayReport`|iface||62-66|export interface CommandReplayReport extends OfflineContr...|
|`ToolReplayReport`|iface||72-78|export interface ToolReplayReport extends OfflineContract...|
|`HarnessPaths`|iface||84-87|export interface HarnessPaths|
|`toJsonValue`|fn||95-106|function toJsonValue(value: unknown): JsonValue|
|`resolveHarnessPaths`|fn||116-126|export function resolveHarnessPaths(cwd?: string, extensi...|
|`loadExtensionFactory`|fn||136-143|export async function loadExtensionFactory(extensionPath:...|
|`withProcessCwd`|fn||152-161|async function withProcessCwd<T>(cwd: string, action: () ...|
|`registerExtensionOffline`|fn||171-183|async function registerExtensionOffline(|
|`buildDebugManual`|fn||239-265|export function buildDebugManual(snapshot: RecordingExten...|
|`inspectExtension`|fn||275-290|export async function inspectExtension(cwd?: string, exte...|
|`replaySessionStart`|fn||302-336|export async function replaySessionStart(|
|`replayCommand`|fn||350-386|export async function replayCommand(|
|`replayTool`|fn||400-450|export async function replayTool(|


---

# recording-extension-api.ts | TypeScript | 786L | 23 symbols | 2 imports | 55 comments
> Path: `scripts/lib/recording-extension-api.ts`
- @brief Implements recording adapters for offline extension registration and replay.
- @details Provides a minimal pi-compatible extension API plus command-context UI recorder used by the standalone debug harness. The module captures registered commands, registered tools, event handlers, active-tool state, user-message payloads, and UI side effects without invoking the official pi runtime. Runtime cost is O(n) in the number of recorded registrations and side effects. Side effects are limited to in-memory state mutation.

## Imports
```
import path from "node:path";
import {
```

## Definitions

- type `export type JsonValue =` (L17)
- @brief Represents a JSON-compatible serialized value.
- @details Constrains harness snapshots to deterministic, stringifiable payloads so offline reports remain stable across process boundaries. The alias is compile-time only and introduces no runtime cost.
### iface `export interface RecordingSourceInfo` (L29-35)
- @brief Describes normalized provenance metadata for commands and tools.
- @details Mirrors the source-information shape documented by the pi SDK while remaining serializable for offline snapshots and parity reports. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingCommandSnapshot` (L41-46)
- @brief Describes one offline-recorded slash command registration.
- @details Stores user-visible metadata plus synthesized provenance for deterministic inspection and parity comparison. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingToolSnapshot` (L52-61)
- @brief Describes one offline-recorded tool registration.
- @details Stores registration metadata, parameter-schema presence, and normalized provenance while omitting executable function references from serialized output. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordedUserMessage` (L67-70)
- @brief Describes one recorded prompt-delivery payload.
- @details Preserves serialized content and optional delivery metadata for direct `pi.sendUserMessage(...)` calls and user messages appended during offline new-session setup. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingNotification` (L76-79)
- @brief Describes one recorded notification side effect.
- @details Captures the emitted message and severity level from `ctx.ui.notify(...)`. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingStatusUpdate` (L85-88)
- @brief Describes one recorded status-bar mutation.
- @details Stores the status key and the written or cleared value from `ctx.ui.setStatus(...)`. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingSelectCall` (L94-98)
- @brief Describes one recorded `ctx.ui.select(...)` interaction.
- @details Captures the menu title, offered items, and dequeued scripted response so interactive command replays remain deterministic and auditable. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingInputCall` (L104-108)
- @brief Describes one recorded `ctx.ui.input(...)` interaction.
- @details Captures the prompt title, placeholder, and dequeued scripted response so interactive command replays remain deterministic and auditable. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingUiStateSnapshot` (L114-124)
- @brief Describes the complete UI-side-effect snapshot for one command context.
- @details Aggregates notifications, statuses, editor mutations, select/input interactions, and unconsumed scripted responses for deterministic replay evidence. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingUiPlan` (L130-133)
- @brief Describes scripted UI responses supplied to offline command replay.
- @details Provides FIFO queues for `select` and `input` calls so the harness can execute interactive handlers without a live terminal UI. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingCommandDefinition` (L139-142)
- @brief Describes the minimal command shape accepted by `registerCommand(...)`.
- @details Matches the subset of the pi command-registration contract exercised by `src/index.ts`. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RecordingToolDefinition` (L148-163)
- @brief Describes the minimal tool shape accepted by `registerTool(...)`.
- @details Matches the subset of the pi tool-registration contract exercised by `src/index.ts` while remaining independent from the official SDK package at compile time. The interface is compile-time only and introduces no runtime cost.

### fn `function toJsonValue(value: unknown): JsonValue | undefined` (L171-188)
- @brief Serializes arbitrary registration payloads into deterministic JSON-compatible values.
- @details Uses JSON stringify/parse with function elision and `undefined` normalization so TypeBox schemas and options objects can be embedded in snapshots without executable references. Runtime is O(n) in serialized payload size. No external state is mutated.
- @param[in] value {unknown} Arbitrary value to serialize.
- @return {JsonValue | undefined} JSON-compatible copy or `undefined` when the value cannot be represented.

### fn `function normalizeSessionUserMessageContent(message: unknown): JsonValue` (L196-210)
- @brief Normalizes `SessionManager.appendMessage(...)` payloads into recorder user-message content.
- @details Collapses single- or multi-part text arrays into one comparable string and preserves non-text payloads as JSON-compatible values. Runtime is O(n) in content size. No external state is mutated.
- @param[in] message {unknown} Session-manager message payload supplied during `ctx.newSession(...setup)`.
- @return {JsonValue} Normalized user-message content.

### fn `function buildSourceInfo(extensionPath: string, override?: Partial<RecordingSourceInfo>): RecordingSourceInfo` (L219-228)
- @brief Builds synthesized provenance metadata for offline registrations.
- @details Normalizes the extension path and derives project-scoped extension source metadata that approximates the official runtime provenance contract. Runtime is O(p) in path length. No external state is mutated.
- @param[in] extensionPath {string} Absolute extension entry path.
- @param[in] override {Partial<RecordingSourceInfo> | undefined} Optional source-info overrides supplied during registration.
- @return {RecordingSourceInfo} Normalized provenance record.

### fn `function buildBuiltinSourceInfo(name: string): RecordingSourceInfo` (L236-244)
- @brief Builds synthesized provenance metadata for one builtin tool.
- @details Produces the stable pseudo-path shape used by pi for builtin tools so extension runtime logic can distinguish builtin inventory entries during offline replay. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Builtin tool name.
- @return {RecordingSourceInfo} Normalized builtin provenance record.

### fn `function buildBuiltinToolDefinition(name: string): RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }` (L252-259)
- @brief Builds one supported builtin tool descriptor for offline inventory queries.
- @details Creates a minimal tool descriptor containing the builtin name, label, generic description, and synthesized builtin provenance metadata. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Builtin tool name.
- @return {RecordingToolDefinition & { sourceInfo: RecordingSourceInfo }} Builtin tool descriptor.

### fn `function formatRecordedThemeForeground(color: string, text: string): string` (L268-270)
- @brief Encodes one fake themed fragment for offline status capture.
- @details Wraps the requested color and text in stable XML-like markers so offline replay can preserve color intent in serialized status snapshots without terminal escape sequences. Runtime is O(n) in text length. No external state is mutated.
- @param[in] color {string} Requested theme color token.
- @param[in] text {string} Raw text payload.
- @return {string} Encoded themed fragment.

### fn `function formatRecordedThemeBackgroundFromForeground(color: string, text: string): string` (L281-283)
- @brief Encodes one fake background fragment derived from a foreground color.
- @details Wraps the provided text in stable XML-like markers so offline status
snapshots can preserve context-bar background intent without terminal escape
sequences. Runtime is O(n) in text length. No external state is mutated.
- @param[in] color {string} Foreground color reused as synthetic background.
- @param[in] text {string} Raw text payload.
- @return {string} Encoded background fragment.

### class `export class RecordingCommandContext` (L289-524)
- @brief Records UI activity and session-control side effects for one offline command context.
- @brief Stores the working directory exposed to handlers through `ctx.cwd`.
- @details Exposes the subset of `ctx.ui` plus command-only session APIs consumed by the extension, including shared settings-menu custom UI replay, dequeues scripted responses for interactive handlers, encodes theme-color output deterministically, and accumulates deterministic side-effect evidence. Runtime is O(1) per UI or session-control operation plus delegated setup cost. Side effects are limited to in-memory state mutation.
- @details The value is immutable after construction and is consumed by extension code that resolves project-local configuration and prompt paths. Access complexity is O(1).

### iface `export interface RecordingExtensionSnapshot` (L530-536)
- @brief Aggregates the offline registration snapshot maintained by `RecordingExtensionAPI`.
- @details Combines command metadata, tool metadata, event names, active tools, and sent user messages for deterministic inspection and parity comparison. The interface is compile-time only and introduces no runtime cost.

### class `export class RecordingExtensionAPI` (L542-786)
- @brief Records extension registrations and runtime-like mutations for offline replay.
- @details Implements the subset of the pi extension API exercised by `src/index.ts`, synthesizes provenance metadata, preserves registration order, and exposes lookup helpers for harness commands. Runtime is O(1) per registration or mutation plus payload serialization. Side effects are limited to in-memory state mutation.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`JsonValue`|type||17||
|`RecordingSourceInfo`|iface||29-35|export interface RecordingSourceInfo|
|`RecordingCommandSnapshot`|iface||41-46|export interface RecordingCommandSnapshot|
|`RecordingToolSnapshot`|iface||52-61|export interface RecordingToolSnapshot|
|`RecordedUserMessage`|iface||67-70|export interface RecordedUserMessage|
|`RecordingNotification`|iface||76-79|export interface RecordingNotification|
|`RecordingStatusUpdate`|iface||85-88|export interface RecordingStatusUpdate|
|`RecordingSelectCall`|iface||94-98|export interface RecordingSelectCall|
|`RecordingInputCall`|iface||104-108|export interface RecordingInputCall|
|`RecordingUiStateSnapshot`|iface||114-124|export interface RecordingUiStateSnapshot|
|`RecordingUiPlan`|iface||130-133|export interface RecordingUiPlan|
|`RecordingCommandDefinition`|iface||139-142|export interface RecordingCommandDefinition|
|`RecordingToolDefinition`|iface||148-163|export interface RecordingToolDefinition|
|`toJsonValue`|fn||171-188|function toJsonValue(value: unknown): JsonValue | undefined|
|`normalizeSessionUserMessageContent`|fn||196-210|function normalizeSessionUserMessageContent(message: unkn...|
|`buildSourceInfo`|fn||219-228|function buildSourceInfo(extensionPath: string, override?...|
|`buildBuiltinSourceInfo`|fn||236-244|function buildBuiltinSourceInfo(name: string): RecordingS...|
|`buildBuiltinToolDefinition`|fn||252-259|function buildBuiltinToolDefinition(name: string): Record...|
|`formatRecordedThemeForeground`|fn||268-270|function formatRecordedThemeForeground(color: string, tex...|
|`formatRecordedThemeBackgroundFromForeground`|fn||281-283|function formatRecordedThemeBackgroundFromForeground(colo...|
|`RecordingCommandContext`|class||289-524|export class RecordingCommandContext|
|`RecordingExtensionSnapshot`|iface||530-536|export interface RecordingExtensionSnapshot|
|`RecordingExtensionAPI`|class||542-786|export class RecordingExtensionAPI|


---

# sdk-smoke.ts | TypeScript | 503L | 20 symbols | 4 imports | 21 comments
> Path: `scripts/lib/sdk-smoke.ts`
- @brief Implements SDK-parity probing and comparison for the standalone debug harness.
- @details Dynamically loads the official pi SDK when available, inventories extension-owned commands and tools from the runtime surface, normalizes provenance metadata, and compares the result against the offline recorder snapshot. Runtime is O(c + t) in command and tool counts plus the cost of SDK session creation. Side effects are limited to dynamic module loading, optional SDK-managed filesystem reads, and any extension-owned startup behavior triggered by the official runtime.

## Imports
```
import path from "node:path";
import { ReqError } from "../../src/core/errors.js";
import type { JsonValue } from "./recording-extension-api.js";
import { replaySessionStart, resolveHarnessPaths, type OfflineContractSnapshot } from "./extension-debug-harness.js";
```

## Definitions

### iface `export interface NormalizedSourceInfo` (L16-22)
- @brief Describes normalized provenance metadata used for parity comparison.
- @details Reduces raw SDK and offline `sourceInfo` payloads to stable path and ownership fields so comparison is deterministic across absolute-path variations. The interface is compile-time only and introduces no runtime cost.

### iface `export interface NormalizedCommandRecord` (L28-32)
- @brief Describes one normalized command record used by the parity comparator.
- @details Stores the command name, description, and normalized provenance fields that are stable across offline and SDK inventories. The interface is compile-time only and introduces no runtime cost.

### iface `export interface NormalizedToolRecord` (L38-43)
- @brief Describes one normalized tool record used by the parity comparator.
- @details Stores the tool name, description, parameter-schema presence flag, and normalized provenance fields that are stable across offline and SDK inventories. The interface is compile-time only and introduces no runtime cost.

### iface `export interface SdkContractSnapshot` (L49-56)
- @brief Describes one normalized SDK inventory snapshot.
- @details Aggregates extension-owned commands, extension-owned tools, active tools, and runtime-shape metadata extracted from the official SDK surface. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ParityMismatch` (L62-76)
- @brief Describes one parity mismatch emitted by the comparator.
- @details Records the mismatch category, subject identifier, and normalized offline versus SDK payloads so callers can render deterministic error reports. The interface is compile-time only and introduces no runtime cost.

### iface `export interface SdkSmokeReport` (L82-87)
- @brief Describes the complete SDK parity smoke result.
- @details Combines the offline session-start snapshot, normalized SDK snapshot, and mismatch list into one machine-readable report. The interface is compile-time only and introduces no runtime cost.

### iface `interface SdkApiLike` (L93-97)
- @brief Describes the minimal SDK runtime methods required by the parity probe.
- @details Uses structural typing so the probe can adapt to minor SDK surface variations without compile-time coupling to package-local types. The interface is compile-time only and introduces no runtime cost.

### fn `function normalizePathValue(value: unknown, projectRoot: string): string | undefined` (L106-119)
- @brief Normalizes one path relative to the requested project root.
- @details Converts absolute paths under the project root to slash-normalized relative paths and leaves non-project or pseudo-path values unchanged. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {unknown} Candidate path value.
- @param[in] projectRoot {string} Absolute project root.
- @return {string | undefined} Normalized path or `undefined` when unavailable.

### fn `export function normalizeSourceInfo(sourceInfo: unknown, projectRoot: string): NormalizedSourceInfo | undefined` (L128-141)
- @brief Normalizes raw provenance metadata for parity comparison.
- @details Extracts documented `sourceInfo` fields, normalizes path-like members relative to the requested project root, and drops undefined fields for deterministic deep comparison. Runtime is O(p) in field size. No external state is mutated.
- @param[in] sourceInfo {unknown} Raw `sourceInfo` value.
- @param[in] projectRoot {string} Absolute project root.
- @return {NormalizedSourceInfo | undefined} Normalized provenance record or `undefined`.

### fn `export function normalizeCommandRecord(command: unknown, projectRoot: string): NormalizedCommandRecord | undefined` (L150-163)
- @brief Normalizes one raw command descriptor.
- @details Extracts the stable fields required by the parity comparator and trims empty descriptions to `undefined`. Runtime is O(p) in metadata size. No external state is mutated.
- @param[in] command {unknown} Raw command descriptor.
- @param[in] projectRoot {string} Absolute project root.
- @return {NormalizedCommandRecord | undefined} Normalized command record or `undefined` when the payload is invalid.

### fn `export function normalizeToolRecord(tool: unknown, projectRoot: string): NormalizedToolRecord | undefined` (L172-186)
- @brief Normalizes one raw tool descriptor.
- @details Extracts the stable fields required by the parity comparator, including only the presence of a parameter schema instead of the raw schema object. Runtime is O(p) in metadata size. No external state is mutated.
- @param[in] tool {unknown} Raw tool descriptor.
- @param[in] projectRoot {string} Absolute project root.
- @return {NormalizedToolRecord | undefined} Normalized tool record or `undefined` when the payload is invalid.

### fn `function extractSdkApi(createAgentSessionResult: unknown): { api: SdkApiLike; runtimeShape: string } | undefined` (L194-216)
- @brief Selects the first candidate object that exposes the SDK inventory methods.
- @details Tries several plausible access paths derived from documented return objects and runtime wrappers so the parity probe can tolerate minor SDK surface differences. Runtime is O(k) in candidate count. No external state is mutated.
- @param[in] createAgentSessionResult {unknown} Raw `createAgentSession(...)` result.
- @return {{ api: SdkApiLike; runtimeShape: string } | undefined} Matched runtime surface descriptor.

### fn `function isExtensionCommand(command: unknown, projectRoot: string): boolean` (L225-234)
- @brief Tests whether one normalized command belongs to the target extension.
- @details Accepts descriptors whose provenance identifies extension ownership and rejects prompt-template or skill commands discovered by the SDK. Runtime is O(1). No external state is mutated.
- @param[in] command {unknown} Raw SDK command descriptor.
- @param[in] projectRoot {string} Absolute project root.
- @return {boolean} `true` when the command belongs to the target extension.

### fn `function isExtensionTool(tool: unknown, projectRoot: string): boolean` (L243-250)
- @brief Tests whether one normalized tool belongs to the target extension.
- @details Accepts descriptors whose provenance identifies extension ownership and rejects built-in or SDK-injected tools from the official runtime. Runtime is O(1). No external state is mutated.
- @param[in] tool {unknown} Raw SDK tool descriptor.
- @param[in] projectRoot {string} Absolute project root.
- @return {boolean} `true` when the tool belongs to the target extension.

### fn `function compareCommandInventories(` (L260-300)
- @brief Compares two command inventories and appends mismatches.
- @details Detects missing names, differing descriptions, and differing normalized provenance metadata by command name. Runtime is O(n) in combined inventory size. Side effects mutate the mismatch accumulator only.
- @param[in] offline {NormalizedCommandRecord[]} Offline command inventory.
- @param[in] sdk {NormalizedCommandRecord[]} SDK command inventory.
- @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
- @return {void} No return value.

### fn `function compareToolInventories(` (L310-359)
- @brief Compares two tool inventories and appends mismatches.
- @details Detects missing names, differing descriptions, differing parameter-schema presence, and differing normalized provenance metadata by tool name. Runtime is O(n) in combined inventory size. Side effects mutate the mismatch accumulator only.
- @param[in] offline {NormalizedToolRecord[]} Offline tool inventory.
- @param[in] sdk {NormalizedToolRecord[]} SDK tool inventory.
- @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
- @return {void} No return value.

### fn `function compareActiveTools(offline: string[], sdk: string[], mismatches: ParityMismatch[]): void` (L369-381)
- @brief Compares offline and SDK active-tool sets after `session_start`.
- @details Normalizes both arrays as sorted unique sets so parity checks are robust to incidental ordering differences. Runtime is O(n log n) in active-tool count. Side effects mutate the mismatch accumulator only.
- @param[in] offline {string[]} Offline active-tool names.
- @param[in] sdk {string[]} SDK active-tool names.
- @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
- @return {void} No return value.

### fn `export function buildParityReport(offline: OfflineContractSnapshot, sdk: SdkContractSnapshot): SdkSmokeReport` (L391-413)
- @brief Builds a parity report from an offline snapshot and an SDK snapshot.
- @details Normalizes both inventories by name, compares required mismatch categories, and returns an `ok` flag when no mismatches remain. Runtime is O(n log n) in combined inventory size. No external state is mutated.
- @param[in] offline {OfflineContractSnapshot} Offline session-start snapshot.
- @param[in] sdk {SdkContractSnapshot} SDK parity snapshot.
- @return {SdkSmokeReport} Complete parity report.
- @satisfies REQ-057

### fn `export async function probeSdkRuntime(cwd?: string, extensionPath?: string): Promise<SdkContractSnapshot>` (L424-489)
- @brief Loads the official pi SDK runtime and extracts the extension-owned command and tool inventories.
- @details Dynamically imports `@mariozechner/pi-coding-agent`, creates a `DefaultResourceLoader` with the requested extension path, creates an SDK session, extracts inventory methods from the returned runtime surface, and filters to extension-owned commands and tools only. Runtime is dominated by SDK startup. Side effects include SDK-managed resource loading and extension startup behavior.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @return {Promise<SdkContractSnapshot>} Normalized SDK inventory snapshot.
- @throws {ReqError} Throws when the SDK package is unavailable, runtime extraction fails, or session creation fails.
- @satisfies REQ-050, REQ-056, REQ-058

### fn `export async function runSdkSmoke(cwd?: string, extensionPath?: string): Promise<SdkSmokeReport>` (L499-503)
- @brief Executes the full SDK parity smoke workflow.
- @details Replays offline `session_start`, probes the official SDK runtime, and compares the resulting command, tool, provenance, parameter-schema, and active-tool inventories. Runtime is dominated by SDK startup plus offline replay. Side effects include both offline and SDK extension startup behavior.
- @param[in] cwd {string | undefined} Requested working directory.
- @param[in] extensionPath {string | undefined} Requested extension entry path.
- @return {Promise<SdkSmokeReport>} Complete parity smoke result.
- @satisfies REQ-050, REQ-056, REQ-057, REQ-058

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`NormalizedSourceInfo`|iface||16-22|export interface NormalizedSourceInfo|
|`NormalizedCommandRecord`|iface||28-32|export interface NormalizedCommandRecord|
|`NormalizedToolRecord`|iface||38-43|export interface NormalizedToolRecord|
|`SdkContractSnapshot`|iface||49-56|export interface SdkContractSnapshot|
|`ParityMismatch`|iface||62-76|export interface ParityMismatch|
|`SdkSmokeReport`|iface||82-87|export interface SdkSmokeReport|
|`SdkApiLike`|iface||93-97|interface SdkApiLike|
|`normalizePathValue`|fn||106-119|function normalizePathValue(value: unknown, projectRoot: ...|
|`normalizeSourceInfo`|fn||128-141|export function normalizeSourceInfo(sourceInfo: unknown, ...|
|`normalizeCommandRecord`|fn||150-163|export function normalizeCommandRecord(command: unknown, ...|
|`normalizeToolRecord`|fn||172-186|export function normalizeToolRecord(tool: unknown, projec...|
|`extractSdkApi`|fn||194-216|function extractSdkApi(createAgentSessionResult: unknown)...|
|`isExtensionCommand`|fn||225-234|function isExtensionCommand(command: unknown, projectRoot...|
|`isExtensionTool`|fn||243-250|function isExtensionTool(tool: unknown, projectRoot: stri...|
|`compareCommandInventories`|fn||260-300|function compareCommandInventories(|
|`compareToolInventories`|fn||310-359|function compareToolInventories(|
|`compareActiveTools`|fn||369-381|function compareActiveTools(offline: string[], sdk: strin...|
|`buildParityReport`|fn||391-413|export function buildParityReport(offline: OfflineContrac...|
|`probeSdkRuntime`|fn||424-489|export async function probeSdkRuntime(cwd?: string, exten...|
|`runSdkSmoke`|fn||499-503|export async function runSdkSmoke(cwd?: string, extension...|


---

# pi-usereq-debug.sh | Shell | 330L | 15 symbols | 0 imports | 63 comments
> Path: `scripts/pi-usereq-debug.sh`

## Definitions

- var `readonly SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"` (L10)
- @brief Resolves the absolute directory containing `pi-usereq-debug.sh`.
- @details Uses `BASH_SOURCE[0]` so invocation through relative paths or symlinks still anchors repository-relative lookups. Runtime is O(p) in path length. No filesystem mutation occurs.
- var `readonly REPO_ROOT="$(CDPATH= cd -- "${SCRIPT_DIR}/.." && pwd)"` (L14)
- @brief Resolves the repository root that owns the debug wrapper.
- @details Moves one level above `SCRIPT_DIR` so delegated Node execution can load the repository-local `tsx` dependency and extension entry. Runtime is O(p) in path length. No filesystem mutation occurs.
- var `readonly DEFAULT_EXTENSION="${REPO_ROOT}/src/index.ts"` (L18)
- @brief Stores the default extension entry path used by the wrapper.
- @details Binds all convenience subcommands to the repository's `src/index.ts` entry unless the caller provides a later `--extension` override. Runtime is O(1). No filesystem mutation occurs.
- var `readonly CALLER_CWD="${PWD}"` (L22)
- @brief Stores the caller working directory used as the default debug cwd.
- @details Captures the shell cwd before the wrapper enters the repository root so replayed commands and tools observe the caller-selected project context. Runtime is O(1). No filesystem mutation occurs.
- fn `resolve_tsx_binary() {` (L28)
- @brief Resolves the `tsx` executable visible to the wrapper.
- @details Searches the active repository install first, then the shared git-common checkout used by worktrees, and finally the process `PATH`. When a shared checkout provides `node_modules`, the function links that directory into the worktree before returning the executable path. Runtime is O(1) plus one git subprocess. Side effects may include creating `REPO_ROOT/node_modules` as a symlink.
- @return {string} Absolute or PATH-resolved `tsx` executable path.
- @throws {shell-error} Returns non-zero when no usable `tsx` executable is available.
- var `readonly TSX_BIN="$(resolve_tsx_binary)"` (L62)
- @brief Stores the resolved `tsx` executable path.
- @details Captures the executable once during wrapper startup so later dispatch paths do not repeat repository lookup logic. Runtime is dominated by `resolve_tsx_binary()`. Side effects may include creating a worktree-local `node_modules` symlink.
- fn `print_usage() {` (L68)
- @brief Prints the wrapper usage contract.
- @details Emits subcommand semantics, override rules, and concrete examples covering registrations, session replay, prompt replay, tool replay, and raw pass-through. Runtime is O(1). Side effect: writes to stdout.
- @return {void} No return value.
- @satisfies REQ-061, REQ-062, REQ-065
- fn `contains_exact_option() {` (L109)
- @brief Tests whether one exact option token is present in an argument list.
- @details Performs a linear scan over forwarded tokens and returns success when any token equals the requested option string. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] needle {string} Exact option token to match.
- @param[in] ... {string[]} Forwarded CLI tokens.
- @return {int} Shell status `0` when the option exists; `1` otherwise.
- fn `contains_long_option() {` (L125)
- @brief Tests whether an argument list already contains any long option token.
- @details Detects tokens beginning with `--` so the wrapper can avoid inferring positional payloads when the caller is already using the underlying debug-harness option grammar. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] ... {string[]} Forwarded CLI tokens.
- @return {int} Shell status `0` when a long option exists; `1` otherwise.
- fn `normalize_prompt_name() {` (L140)
- @brief Normalizes prompt aliases to registered `req-*` command names.
- @details Returns the input unchanged when it already begins with `req-`; otherwise prepends the prefix required by extension registration. Runtime is O(p) in prompt-name length. No external state is mutated.
- @param[in] prompt_name {string} Prompt command alias supplied by the caller.
- @return {string} Registered prompt command name.
- @satisfies REQ-062
- fn `run_debug_extension() {` (L154)
- @brief Executes `scripts/debug-extension.ts` with wrapper defaults.
- @details Enters the repository root so the resolved `tsx` dependency and shared `node_modules` tree remain visible, prepends default `--cwd` and `--extension` values, and forwards all remaining arguments unchanged so later overrides win. Runtime is dominated by the delegated Node process. Side effects include spawning one subprocess.
- @param[in] ... {string[]} Debug-harness CLI tokens beginning with the target subcommand.
- @return {int} Exit status produced by the delegated Node process.
- @satisfies REQ-060, REQ-062
- fn `build_tool_params_json() {` (L167)
- @brief Converts wrapper tool `--args` text into a JSON `--params` payload.
- @details Executes the repository-local TypeScript converter so shell callers can reuse the same structured tool-parameter mapping as the debug interface without hand-writing JSON. Runtime is dominated by the helper subprocess. Side effects include spawning one subprocess.
- @param[in] tool_name {string} Registered tool name.
- @param[in] args_text {string} Raw wrapper `--args` payload.
- @return {string} JSON object serialized on stdout.
- @satisfies REQ-065
- fn `forward_tool_subcommand() {` (L182)
- @brief Replays one tool subcommand with wrapper-level `--args` normalization.
- @details Preserves direct `--params` passthrough, rewrites wrapper `--args` values into JSON `--params` payloads, forwards unrelated debug-harness options unchanged, and keeps the legacy single-positional-JSON shortcut. Runtime is O(n) in forwarded argument count plus delegated subprocess cost. Side effects include stdout/stderr writes and subprocess execution.
- @param[in] tool_name {string} Registered tool name.
- @param[in] ... {string[]} Forwarded wrapper tokens after the tool name.
- @return {int} Exit status propagated from the delegated harness or local validation.
- @satisfies REQ-060, REQ-062, REQ-065
- fn `require_value() {` (L250)
- @brief Validates that one required subcommand operand is present.
- @details Emits a deterministic stderr error when the caller omits a required positional name such as a command or tool identifier. Runtime is O(1). Side effect: writes to stderr on failure.
- @param[in] label {string} Human-readable operand label.
- @param[in] value {string} Operand value.
- @return {int} Shell status `0` when the operand exists; `1` otherwise.
- fn `main() {` (L265)
- @brief Dispatches wrapper subcommands to the standalone TypeScript harness.
- @details Implements the convenience grammar documented by `print_usage`, including session and SDK aliases, prompt-name normalization, tool `--args` to `--params` rewriting, default tool params, and raw pass-through mode. Runtime is O(n) in wrapper argument count plus delegated harness cost. Side effects include stdout/stderr writes and subprocess execution.
- @param[in] ... {string[]} Wrapper CLI arguments excluding the script path.
- @return {int} Exit status propagated from the delegated harness or local validation.
- @satisfies REQ-060, REQ-061, REQ-062, REQ-065
## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`SCRIPT_DIR`|var||10||
|`REPO_ROOT`|var||14||
|`DEFAULT_EXTENSION`|var||18||
|`CALLER_CWD`|var||22||
|`resolve_tsx_binary`|fn||28|resolve_tsx_binary()|
|`TSX_BIN`|var||62||
|`print_usage`|fn||68|print_usage()|
|`contains_exact_option`|fn||109|contains_exact_option()|
|`contains_long_option`|fn||125|contains_long_option()|
|`normalize_prompt_name`|fn||140|normalize_prompt_name()|
|`run_debug_extension`|fn||154|run_debug_extension()|
|`build_tool_params_json`|fn||167|build_tool_params_json()|
|`forward_tool_subcommand`|fn||182|forward_tool_subcommand()|
|`require_value`|fn||250|require_value()|
|`main`|fn||265|main()|


---

# tool-args-to-params.ts | TypeScript | 208L | 7 symbols | 3 imports | 9 comments
> Path: `scripts/tool-args-to-params.ts`
- @brief Converts pi-usereq-debug tool `--args` text into the JSON object expected by `--params`.
- @details Parses the wrapper-only tool-argument grammar, tokenizes shell-style text without invoking a shell, validates the argument shape for the current registered tool set, and emits one compact JSON object for `scripts/pi-usereq-debug.sh`. Runtime is O(n) in argument length. Side effects are limited to stdout and stderr writes.

## Imports
```
import process from "node:process";
import { ReqError } from "../src/core/errors.js";
import { shellSplit } from "../src/core/utils.js";
```

## Definitions

### iface `interface ParsedToolArgsCli` (L15-19)
- @brief Describes the normalized CLI request consumed by the tool-argument converter.
- @details Captures the target tool name, raw `--args` text, and help-mode state for the standalone converter entrypoint. The interface is compile-time only and introduces no runtime side effects.

### fn `function parseCliArgs(argv: string[]): ParsedToolArgsCli` (L39-66)
- @brief Parses CLI flags for the standalone tool-argument converter.
- @details Performs one left-to-right scan, records the last `--name` and `--args` values, and ignores unrelated tokens so the wrapper can compose deterministic invocations. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding executable and script path.
- @return {ParsedToolArgsCli} Parsed converter request.

### fn `function takeBooleanFlag(tokens: string[], flag: string): { tokens: string[]; present: boolean }` (L75-86)
- @brief Removes one boolean flag from a shell-token array.
- @details Preserves token order for all non-matching items and reports whether the requested flag appeared at least once. Runtime is O(n) in token count. No external state is mutated.
- @param[in] tokens {string[]} Tokenized `--args` payload.
- @param[in] flag {string} Flag token to remove.
- @return {{ tokens: string[]; present: boolean }} Remaining tokens plus presence marker.

### fn `export function buildToolParamsFromArgsText(toolName: string, argsText: string): Record<string, unknown>` (L97-152)
- @brief Converts one pi-usereq-debug tool `--args` string into a tool-parameter object.
- @details Tokenizes shell-style text with `shellSplit`, applies tool-specific positional and flag mappings, and rejects unsupported or structurally incomplete argument layouts before wrapper forwarding. Runtime is O(n) in token count. No external state is mutated.
- @param[in] toolName {string} Registered tool name selected by `scripts/pi-usereq-debug.sh`.
- @param[in] argsText {string} Raw wrapper `--args` payload.
- @return {Record<string, unknown>} JSON-serializable tool-parameter object compatible with `--params`.
- @throws {ReqError} Throws when the selected tool has no supported `--args` mapping or when the token layout is invalid.
- @satisfies REQ-065

### fn `function writeStdout(text: string): void` (L160-164)
- @brief Writes non-empty text to stdout.
- @details Skips zero-length payloads so callers can compose CLI output without duplicate blank writes. Runtime is O(n) in text length. Side effects are limited to stdout writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L172-177)
- @brief Writes non-empty text to stderr with a trailing newline.
- @details Appends a newline when absent and suppresses zero-length payloads. Runtime is O(n) in text length. Side effects are limited to stderr writes.
- @param[in] text {string} Text payload.
- @return {void} No return value.

### fn `export async function main(argv = process.argv.slice(2)): Promise<number>` (L187-202)
- @brief Executes one standalone tool-argument conversion request.
- @details Parses converter CLI flags, validates the presence of `--name`, transforms wrapper `--args` text into a JSON object, and writes the serialized payload for shell consumption while converting `ReqError` failures into stderr plus exit codes. Runtime is O(n) in argument length. Side effects are limited to stdout and stderr writes.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {Promise<number>} Process exit code.
- @throws {ReqError} Internally catches `ReqError` and returns its exit code.
- @satisfies REQ-065

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedToolArgsCli`|iface||15-19|interface ParsedToolArgsCli|
|`parseCliArgs`|fn||39-66|function parseCliArgs(argv: string[]): ParsedToolArgsCli|
|`takeBooleanFlag`|fn||75-86|function takeBooleanFlag(tokens: string[], flag: string):...|
|`buildToolParamsFromArgsText`|fn||97-152|export function buildToolParamsFromArgsText(toolName: str...|
|`writeStdout`|fn||160-164|function writeStdout(text: string): void|
|`writeStderr`|fn||172-177|function writeStderr(text: string): void|
|`main`|fn||187-202|export async function main(argv = process.argv.slice(2)):...|


---

# cli.ts | TypeScript | 349L | 9 symbols | 5 imports | 9 comments
> Path: `src/cli.ts`
- @brief Implements the standalone pi-usereq command-line entry point.
- @details Parses CLI flags, resolves project configuration, dispatches tool-runner operations, and converts thrown `ReqError` instances into process-style stdout, stderr, and exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and any filesystem or git operations performed by delegated commands.

## Imports
```
import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig, normalizeConfigPaths, saveConfig, type UseReqConfig } from "./core/config.js";
import {
import {
```

## Definitions

### iface `interface ParsedArgs` (L43-67)
- @brief Represents the parsed CLI flag state for one invocation.
- @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.

### fn `function parseArgs(argv: string[]): ParsedArgs` (L75-199)
- @brief Parses raw CLI tokens into a normalized argument object.
- @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
- @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
- @return {ParsedArgs} Parsed flag object.

### fn `const takeUntilOption = (start: number): [string[], number] =>` (L77-85)

### fn `function writeStdout(text: string): void` (L207-209)
- @brief Writes text to stdout when non-empty.
- @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeStderr(text: string): void` (L217-220)
- @brief Writes text to stderr and ensures a trailing newline.
- @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
- @param[in] text {string} Text to emit.
- @return {void} No return value.

### fn `function writeResult(result: { stdout: string; stderr: string; code: number }): number` (L228-232)
- @brief Emits a tool result object to process streams.
- @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
- @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
- @return {number} Exit code to propagate from the invoked command.

### fn `function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig }` (L241-245)
- @brief Loads mutable project config state without persisting runtime path metadata.
- @details Resolves the project base, loads existing config or defaults, normalizes persisted directory fields into project-relative form, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O. Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root path.
- @return {{ base: string; config: UseReqConfig }} Validated project base and normalized in-memory config.
- @satisfies REQ-035, REQ-146

### fn `function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig` (L256-278)
- @brief Applies repeatable `--enable-static-check` specifications to project config.
- @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing entries, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root path.
- @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
- @return {UseReqConfig} Persisted merged project configuration.
- @throws {ReqError} Throws when parsing or validation fails.
- @satisfies REQ-035, REQ-036, REQ-037

### fn `export function main(argv = process.argv.slice(2)): number` (L287-345)
- @brief Executes one pi-usereq CLI invocation.
- @details Parses arguments, enforces mutually exclusive project-selection rules, normalizes persisted config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config normalization writes and stdout/stderr output.
- @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
- @return {number} Process exit code for the invocation.
- @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ParsedArgs`|iface||43-67|interface ParsedArgs|
|`parseArgs`|fn||75-199|function parseArgs(argv: string[]): ParsedArgs|
|`takeUntilOption`|fn||77-85|const takeUntilOption = (start: number): [string[], numbe...|
|`writeStdout`|fn||207-209|function writeStdout(text: string): void|
|`writeStderr`|fn||217-220|function writeStderr(text: string): void|
|`writeResult`|fn||228-232|function writeResult(result: { stdout: string; stderr: st...|
|`loadMutableProjectConfig`|fn||241-245|function loadMutableProjectConfig(projectBase: string): {...|
|`applyEnableStaticCheckSpecs`|fn||256-278|function applyEnableStaticCheckSpecs(projectBase: string,...|
|`main`|fn||287-345|export function main(argv = process.argv.slice(2)): number|


---

# agent-tool-json.ts | TypeScript | 621L | 23 symbols | 7 imports | 24 comments
> Path: `src/core/agent-tool-json.ts`
- @brief Builds structured agent-tool JSON payloads for path, git, docs, worktree, and static-check tools.
- @details Converts extension-tool execution state into deterministic JSON-first payloads optimized for direct LLM traversal. The module normalizes execution metadata, path facts, required-doc status, worktree mutation facts, and static-check file-selection facts without depending on presentation-oriented text. Runtime is O(F) in the number of described files plus path normalization cost. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import type { StaticCheckEntry } from "./config.js";
import type { RuntimePathFacts } from "./path-context.js";
import { ReqError } from "./errors.js";
import { STATIC_CHECK_EXT_TO_LANG } from "./static-check.js";
import type { ToolResult } from "./tool-runner.js";
```

## Definitions

### iface `export interface ToolExecutionSection` (L19-27)
- @brief Describes normalized execution metadata shared by structured tool payloads.
- @details Separates numeric status, line-oriented diagnostics, and optional raw text so downstream agents can branch on stable fields before consulting residual text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StructuredToolExecuteResult<T>` (L33-36)
- @brief Describes the standard execute return wrapper used by structured agent tools.
- @details Mirrors the same JSON payload into both the text content channel and the machine-readable details channel so agents can consume stable fields without reparsing ad-hoc prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PathQueryToolPayload` (L42-58)
- @brief Describes the structured payload returned by path-query tools.
- @details Exposes the requested config key, caller cwd, resolved project base, resolved path value, and shared runtime path facts as direct-access fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface GitCheckToolPayload` (L64-80)
- @brief Describes the structured payload returned by `git-check`.
- @details Exposes git-root presence, repository validation status, shared runtime path facts, and normalized execution diagnostics as stable fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface DocsCheckFileRecord` (L86-94)
- @brief Describes one canonical-doc status record returned by `docs-check`.
- @details Binds each required filename to its prompt generator, normalized path facts, and presence status so agents can branch per missing document deterministically. The interface is compile-time only and introduces no runtime cost.

### iface `export interface DocsCheckToolPayload` (L100-116)
- @brief Describes the structured payload returned by `docs-check`.
- @details Exposes docs-root selection, per-document presence facts, remediation prompt commands, shared runtime path facts, and execution diagnostics as stable JSON fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface WorktreeNameToolPayload` (L122-137)
- @brief Describes the structured payload returned by `git-wt-name`.
- @details Exposes the generated worktree name, its normative format, shared runtime path facts, and execution diagnostics as direct-access fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface WorktreeMutationToolPayload` (L143-161)
- @brief Describes the structured payload returned by worktree mutation tools.
- @details Exposes the requested operation, exact worktree name, derived worktree path, mutation status, shared runtime path facts, and execution diagnostics as stable JSON fields. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckFileRecord` (L167-179)
- @brief Describes one file-selection record inside a static-check payload.
- @details Exposes request order, normalized path facts, detected language, configured checker modules, and stable selection status without forcing agents to parse checker output text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StaticCheckToolPayload` (L185-207)
- @brief Describes the structured payload returned by static-check agent tools.
- @details Exposes scope selection, configured checker coverage, per-file selection facts, shared runtime path facts, and normalized execution diagnostics while keeping residual checker text optional under execution. The interface is compile-time only and introduces no runtime cost.

### fn `function formatJsonToolPayload(payload: unknown): string` (L215-217)
- @brief Serializes one structured payload as pretty-printed JSON.
- @details Uses two-space indentation and omits a trailing newline so the mirrored text payload remains deterministic and compact. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {unknown} Structured JSON-compatible payload.
- @return {string} Pretty-printed JSON text.

### fn `function splitToolOutputLines(text: string): string[]` (L225-228)
- @brief Splits one stdout or stderr text block into normalized non-empty lines.
- @details Trims trailing newlines, preserves internal line order, and omits empty records so downstream agents can branch on stable arrays without reparsing blank output. Runtime is O(n) in text length. No external state is mutated.
- @param[in] text {string} Raw output text.
- @return {string[]} Normalized non-empty output lines.

### fn `function canonicalizeToolPath(baseDir: string, candidatePath: string): string` (L237-244)
- @brief Normalizes one path into a canonical slash-separated form relative to the project base when possible.
- @details Resolves the candidate against the provided base, emits a relative path for in-project targets, and falls back to an absolute slash-normalized path for external targets. Runtime is O(p) in path length. No external state is mutated.
- @param[in] baseDir {string} Absolute project base path.
- @param[in] candidatePath {string} Relative or absolute path candidate.
- @return {string} Canonical slash-normalized path.

- fn `export function buildStructuredToolExecuteResult<T extends { execution: ToolExecutionSection }>(` (L252)
- @brief Converts one structured tool payload into the standard execute wrapper.
- @details Mirrors the same payload into `content[0].text` and `details` so agents can use direct JSON fields or raw JSON text interchangeably without divergence. Runtime is O(n) in payload size. No external state is mutated.
- @param[in] payload {T} Structured payload containing an `execution` section.
- @return {StructuredToolExecuteResult<T>} Standard execute wrapper with mirrored payload.
### fn `export function buildToolExecutionSection(result: ToolResult): ToolExecutionSection` (L267-281)
- @brief Converts one raw `ToolResult` into a normalized execution section.
- @details Separates numeric exit status, line-oriented stdout/stderr arrays, and optional raw text so downstream agents can consume structured facts before consulting residual text. Runtime is O(n) in output size. No external state is mutated.
- @param[in] result {ToolResult} Raw tool result.
- @return {ToolExecutionSection} Normalized execution metadata.

### fn `export function normalizeToolFailure(error: unknown): ToolResult` (L290-299)
- @brief Converts one `ReqError` into a synthetic `ToolResult` for structured payload emission.
- @details Preserves the numeric exit code and message in stderr so agent tools can return deterministic JSON even when the underlying runner fails. Non-`ReqError` values are rethrown. Runtime is O(1). No external state is mutated.
- @param[in] error {unknown} Thrown value captured from a runner.
- @return {ToolResult} Synthetic tool result with empty stdout.
- @throws {unknown} Rethrows non-`ReqError` failures unchanged.

### fn `export function buildPathQueryToolPayload(` (L312-338)
- @brief Builds the structured payload returned by `git-path` or `get-base-path`.
- @details Exposes the resolved runtime path value as a direct-access field and preserves normalized execution metadata separately from path facts. Runtime is O(p) in path length. No external state is mutated.
- @param[in] toolName {"git-path" | "get-base-path"} Target tool name.
- @param[in] workingDirectoryPath {string} Caller working directory.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] resolvedPath {string} Resolved config path value.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {PathQueryToolPayload} Structured path-query payload.

### fn `export function buildGitCheckToolPayload(` (L349-373)
- @brief Builds the structured payload returned by `git-check`.
- @details Encodes runtime git-root presence plus clean-versus-error status as direct fields while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {GitCheckToolPayload} Structured git-check payload.

### fn `export function buildDocsCheckToolPayload(` (L383-433)
- @brief Builds the structured payload returned by `docs-check`.
- @details Enumerates required canonical documents, binds each missing file to its remediation prompt command, and emits summary counts plus normalized execution metadata. Runtime is O(k) in required file count plus filesystem reads. Side effects are limited to filesystem reads.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] docsDirPath {string} Configured docs directory relative to the project base.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @return {DocsCheckToolPayload} Structured docs-check payload.

### fn `export function buildWorktreeNameToolPayload(` (L444-467)
- @brief Builds the structured payload returned by `git-wt-name`.
- @details Preserves the generated worktree name plus its normative format string as direct-access fields and reports failures through structured execution metadata. Runtime is O(n) in output size. No external state is mutated.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {WorktreeNameToolPayload} Structured worktree-name payload.

### fn `export function buildWorktreeMutationToolPayload(` (L480-514)
- @brief Builds the structured payload returned by `git-wt-create` or `git-wt-delete`.
- @details Exposes the requested operation, exact worktree name, derived worktree path, and mutation outcome as stable JSON fields while preserving raw diagnostics under execution. Runtime is O(p) in path length. No external state is mutated.
- @param[in] toolName {"git-wt-create" | "git-wt-delete"} Target tool name.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] configuredGitPath {string | undefined} Runtime git root path.
- @param[in] worktreeName {string} Exact requested worktree name.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {WorktreeMutationToolPayload} Structured worktree mutation payload.

### fn `function buildStaticCheckFileRecord(` (L525-564)
- @brief Builds one static-check file-selection record.
- @details Resolves filesystem status, detects the configured language by file extension, counts configured checker entries, and emits a stable selection status without parsing checker output text. Runtime is O(p + c) in path length plus configured checker count. Side effects are limited to filesystem reads.
- @param[in] inputPath {string} Caller-supplied file path.
- @param[in] requestIndex {number} Zero-based request position.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
- @return {StaticCheckFileRecord} Structured file-selection record.

### fn `export function buildStaticCheckToolPayload(` (L580-621)
- @brief Builds the structured payload returned by `files-static-check` or `static-check`.
- @details Exposes configured checker coverage, per-file selection facts, and normalized execution diagnostics while leaving raw checker output under execution for residual inspection only. Runtime is O(F + C). Side effects are limited to filesystem reads.
- @param[in] toolName {"files-static-check" | "static-check"} Target tool name.
- @param[in] scope {"explicit-files" | "configured-source-and-test-directories"} Selection scope label.
- @param[in] projectBasePath {string} Resolved project base path.
- @param[in] requestedPaths {string[]} Explicit or discovered file paths.
- @param[in] selectionDirectoryPaths {string[]} Directories that produced the selection.
- @param[in] excludedDirectoryPaths {string[]} Directory roots excluded from project selection.
- @param[in] staticCheckConfig {Record<string, StaticCheckEntry[]>} Effective static-check configuration.
- @param[in] runtimePaths {RuntimePathFacts} Shared runtime path facts.
- @param[in] execution {ToolExecutionSection} Normalized execution metadata.
- @return {StaticCheckToolPayload} Structured static-check payload.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolExecutionSection`|iface||19-27|export interface ToolExecutionSection|
|`StructuredToolExecuteResult`|iface||33-36|export interface StructuredToolExecuteResult<T>|
|`PathQueryToolPayload`|iface||42-58|export interface PathQueryToolPayload|
|`GitCheckToolPayload`|iface||64-80|export interface GitCheckToolPayload|
|`DocsCheckFileRecord`|iface||86-94|export interface DocsCheckFileRecord|
|`DocsCheckToolPayload`|iface||100-116|export interface DocsCheckToolPayload|
|`WorktreeNameToolPayload`|iface||122-137|export interface WorktreeNameToolPayload|
|`WorktreeMutationToolPayload`|iface||143-161|export interface WorktreeMutationToolPayload|
|`StaticCheckFileRecord`|iface||167-179|export interface StaticCheckFileRecord|
|`StaticCheckToolPayload`|iface||185-207|export interface StaticCheckToolPayload|
|`formatJsonToolPayload`|fn||215-217|function formatJsonToolPayload(payload: unknown): string|
|`splitToolOutputLines`|fn||225-228|function splitToolOutputLines(text: string): string[]|
|`canonicalizeToolPath`|fn||237-244|function canonicalizeToolPath(baseDir: string, candidateP...|
|`buildStructuredToolExecuteResult`|fn||252|export function buildStructuredToolExecuteResult<T extend...|
|`buildToolExecutionSection`|fn||267-281|export function buildToolExecutionSection(result: ToolRes...|
|`normalizeToolFailure`|fn||290-299|export function normalizeToolFailure(error: unknown): Too...|
|`buildPathQueryToolPayload`|fn||312-338|export function buildPathQueryToolPayload(|
|`buildGitCheckToolPayload`|fn||349-373|export function buildGitCheckToolPayload(|
|`buildDocsCheckToolPayload`|fn||383-433|export function buildDocsCheckToolPayload(|
|`buildWorktreeNameToolPayload`|fn||444-467|export function buildWorktreeNameToolPayload(|
|`buildWorktreeMutationToolPayload`|fn||480-514|export function buildWorktreeMutationToolPayload(|
|`buildStaticCheckFileRecord`|fn||525-564|function buildStaticCheckFileRecord(|
|`buildStaticCheckToolPayload`|fn||580-621|export function buildStaticCheckToolPayload(|


---

# compress-files.ts | TypeScript | 72L | 2 symbols | 3 imports | 3 comments
> Path: `src/core/compress-files.ts`
- @brief Compresses explicit source-file lists into compact fenced-markdown excerpts.
- @details Bridges file validation, language detection, per-file source compression, and final markdown packaging for prompt consumption. Runtime is O(F + S) where F is file count and S is total source size processed. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { compressFileDetailed, detectLanguage } from "./compress.js";
```

## Definitions

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L18-21)
- @brief Formats one source path for markdown output.
- @details Returns the original file path when no base is provided. Otherwise computes a normalized POSIX-style relative path against the resolved output base. Time complexity is O(p) in path length. No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @param[in] outputBase {string | undefined} Optional base directory for relative formatting.
- @return {string} Display path used in the markdown header.

### fn `export function compressFiles(` (L33-72)
- @brief Compresses a list of explicit source files into concatenated markdown sections.
- @details Validates file existence, infers each supported language, invokes per-file compression, preserves optional line numbers, and emits one fenced block per successful file. Runtime is O(F + S) where F is file count and S is total processed source size. Side effects are limited to filesystem reads and optional stderr progress logging.
- @param[in] filePaths {string[]} Explicit file paths to process.
- @param[in] includeLineNumbers {boolean} When `true`, preserve original source line numbers in the emitted code block.
- @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
- @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
- @return {string} Markdown document containing one section per successfully compressed file.
- @throws {Error} Throws when no valid source files can be processed.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatOutputPath`|fn||18-21|function formatOutputPath(filePath: string, outputBase?: ...|
|`compressFiles`|fn||33-72|export function compressFiles(|


---

# compress-payload.ts | TypeScript | 648L | 22 symbols | 5 imports | 23 comments
> Path: `src/core/compress-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-compress` and `compress`.
- @details Converts compression results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, structured file metrics, structured compressed lines, symbols, and Doxygen fields. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { compressFileDetailed, detectLanguage, type CompressedLineEntry } from "./compress.js";
import {
```

## Definitions

- type `export type CompressToolScope = "explicit-files" | "configured-source-directories";` (L27)
- @brief Enumerates supported compression-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressFileStatus = "compressed" | "error" | "skipped";` (L33)
- @brief Enumerates supported per-file compression statuses.
- @details Separates compressed files, hard failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressLineNumberMode = "enabled" | "disabled";` (L39)
- @brief Enumerates the rendered line-number mode for compression output.
- @details Distinguishes payloads whose display strings include original source line numbers from payloads whose display strings contain plain compressed text only. The alias is compile-time only and introduces no runtime cost.
- type `export type CompressSymbolAnalysisStatus = "analyzed" | "error" | "not_attempted";` (L45)
- @brief Enumerates structured symbol-analysis statuses for compressed files.
- @details Separates successful symbol extraction from supplementary analysis failures so compression can still succeed when analyzer enrichment is unavailable. The alias is compile-time only and introduces no runtime cost.
### iface `export interface CompressLineRange` (L51-55)
- @brief Describes one numeric line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolLineEntry` (L61-66)
- @brief Describes one structured compressed line entry in the tool payload.
- @details Preserves output order, original source coordinates, raw compressed text, and rendered display text so agents can choose between normalized data and user-facing rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolSymbolEntry extends CompressLineRange` : CompressLineRange (L72-87)
- @brief Describes one structured symbol record inside the compression payload.
- @details Orders direct-access identity fields before hierarchy, locations, and Doxygen metadata so agents can branch without reparsing compressed source text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolFileEntry extends CompressLineRange` : CompressLineRange (L93-120)
- @brief Describes one per-file compression payload entry.
- @details Stores path identity, compression metrics, rendered line-number mode, optional file-level and symbol-level metadata, structured compressed lines, and stable failure facts. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRequestSection` (L126-136)
- @brief Describes the request section of the compression payload.
- @details Captures tool identity, scope, base directory, line-number mode, requested inputs, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolSummarySection` (L142-153)
- @brief Describes the summary section of the compression payload.
- @details Exposes aggregate file, line, symbol, and Doxygen counts as numeric fields with explicit unit names so agents can branch on totals without reparsing display strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolRepositorySection` (L159-164)
- @brief Describes the repository section of the compression payload.
- @details Stores the base path, configured source-directory scope, and canonical file list used during compression. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressToolPayload` (L170-175)
- @brief Describes the full agent-oriented compression payload.
- @details Orders the top-level sections as request, summary, repository, and files so execution metadata can be appended deterministically by the tool wrapper. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildCompressToolPayloadOptions` (L181-189)
- @brief Describes the options required to build one compression payload.
- @details Supplies tool identity, scope, base directory, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeCompressionPath(targetPath: string, baseDir: string): string` (L198-206)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): CompressLineRange` (L215-221)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {CompressLineRange} Structured line-range record.

### fn `function resolveSymbolName(element: SourceElement): string` (L229-231)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L240-249)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCompressedLines(compressedLines: CompressedLineEntry[]): CompressToolLineEntry[]` (L257-264)
- @brief Maps structured compression lines into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the core compression result type. Runtime is O(n) in compressed line count. No side effects occur.
- @param[in] compressedLines {CompressedLineEntry[]} Structured compression lines.
- @return {CompressToolLineEntry[]} Payload line entries.

### fn `function analyzeCompressedFileSymbols(` (L276-360)
- @brief Builds structured symbol entries for one successfully analyzed file.
- @details Extracts definition elements, computes parent-child relationships, attaches structured Doxygen metadata, and repeats the canonical file path inside each symbol record for direct-access agent indexing. Runtime is O(n log n) in definition count. No side effects occur.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] canonicalPath {string} Canonical path emitted in the payload.
- @param[in] languageId {string} Canonical language identifier.
- @return {{ languageName: string | undefined; symbols: CompressToolSymbolEntry[]; fileDoxygen: StructuredDoxygenFields | undefined; fileDescriptionText: string | undefined; doxygenFieldCount: number }} Structured symbol-analysis result.
- @throws {Error} Throws when source analysis or enrichment fails.

### fn `function analyzeCompressFile(` (L374-505)
- @brief Analyzes one path into a structured compression file entry.
- @details Resolves path identity, performs compression, attempts supplementary symbol and Doxygen extraction, preserves stable skip or error reasons, and keeps compression success independent from symbol-analysis success. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] includeLineNumbers {boolean} When `true`, rendered compressed text includes original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {CompressToolFileEntry} Structured file entry.

### fn `export function buildCompressToolPayload(options: BuildCompressToolPayloadOptions): CompressToolPayload` (L514-628)
- @brief Builds the full agent-oriented compression payload.
- @details Validates requested paths against the filesystem, compresses processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits repository scope metadata. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildCompressToolPayloadOptions} Payload-construction options.
- @return {CompressToolPayload} Structured compression payload ordered as request, summary, repository, and files.
- @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087

### fn `export function buildCompressToolExecutionStderr(payload: CompressToolPayload): string` (L637-648)
- @brief Builds execution diagnostics for one compression payload.
- @details Serializes skipped inputs, hard compression failures, and supplementary symbol-analysis warnings into stable stderr lines while keeping successful compressed files silent. Runtime is O(n) in issue count. No side effects occur.
- @param[in] payload {CompressToolPayload} Structured compression payload.
- @return {string} Newline-delimited execution diagnostics.
- @satisfies REQ-087

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CompressToolScope`|type||27||
|`CompressFileStatus`|type||33||
|`CompressLineNumberMode`|type||39||
|`CompressSymbolAnalysisStatus`|type||45||
|`CompressLineRange`|iface||51-55|export interface CompressLineRange|
|`CompressToolLineEntry`|iface||61-66|export interface CompressToolLineEntry|
|`CompressToolSymbolEntry`|iface||72-87|export interface CompressToolSymbolEntry extends Compress...|
|`CompressToolFileEntry`|iface||93-120|export interface CompressToolFileEntry extends CompressLi...|
|`CompressToolRequestSection`|iface||126-136|export interface CompressToolRequestSection|
|`CompressToolSummarySection`|iface||142-153|export interface CompressToolSummarySection|
|`CompressToolRepositorySection`|iface||159-164|export interface CompressToolRepositorySection|
|`CompressToolPayload`|iface||170-175|export interface CompressToolPayload|
|`BuildCompressToolPayloadOptions`|iface||181-189|export interface BuildCompressToolPayloadOptions|
|`canonicalizeCompressionPath`|fn||198-206|function canonicalizeCompressionPath(targetPath: string, ...|
|`buildLineRange`|fn||215-221|function buildLineRange(startLineNumber: number, endLineN...|
|`resolveSymbolName`|fn||229-231|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||240-249|function resolveParentElement(definitions: SourceElement[...|
|`mapCompressedLines`|fn||257-264|function mapCompressedLines(compressedLines: CompressedLi...|
|`analyzeCompressedFileSymbols`|fn||276-360|function analyzeCompressedFileSymbols(|
|`analyzeCompressFile`|fn||374-505|function analyzeCompressFile(|
|`buildCompressToolPayload`|fn||514-628|export function buildCompressToolPayload(options: BuildCo...|
|`buildCompressToolExecutionStderr`|fn||637-648|export function buildCompressToolExecutionStderr(payload:...|


---

# compress.ts | TypeScript | 464L | 13 symbols | 3 imports | 17 comments
> Path: `src/core/compress.ts`
- @brief Removes comments and redundant whitespace from source code while preserving semantic structure.
- @details Provides extension-based language detection and language-aware source compression backed by analyzer language specs. Runtime is linear in processed source size. Side effects are limited to filesystem reads in file-based helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildLanguageSpecs } from "./source-analyzer.js";
```

## Definitions

### iface `export interface CompressedLineEntry` (L57-62)
- @brief Describes one structured compressed output line.
- @details Separates source coordinates, output order, raw compressed text, and rendered display text so downstream JSON payloads can expose line facts without reparsing prefixed strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface CompressedSourceResult` (L68-79)
- @brief Describes one structured compression result.
- @details Exposes language identity, source line metrics, removed-line totals, structured compressed lines, and the final rendered excerpt text so CLI and agent-tool layers can share one canonical compression model. The interface is compile-time only and introduces no runtime cost.

### fn `function getSpecs()` (L86-89)
- @brief Returns the cached language specification table.
- @details Initializes the cache on first access by calling `buildLanguageSpecs`, then reuses the result for all subsequent calls. Time complexity is O(1) after cold start. Mutates module-local cache state only.
- @return {ReturnType<typeof buildLanguageSpecs>} Cached language specification map.

### fn `export function detectLanguage(filePath: string): string | undefined` (L97-99)
- @brief Infers a compression language from a file path extension.
- @details Lowercases the file extension and looks it up in `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @return {string | undefined} Canonical compression language identifier, or `undefined` when unsupported.

### fn `function countLogicalLines(content: string): number` (L107-113)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Source text.
- @return {number} Logical line count; `0` for empty content.

### fn `function isInString(line: string, pos: number, stringDelimiters: string[]): boolean` (L123-158)
- @brief Tests whether a character position falls inside a string literal.
- @details Scans the line left-to-right while tracking active string delimiters and escaped quote characters. Runtime is O(n) in inspected prefix length. No side effects occur.
- @param[in] line {string} Source line to inspect.
- @param[in] pos {number} Zero-based character position.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {boolean} `true` when the position is inside a string literal.

### fn `function removeInlineComment(line: string, singleComment: string | undefined, stringDelimiters: string[]): string` (L168-208)
- @brief Removes a trailing single-line comment from a source line.
- @details Scans the line while respecting string literals so comment markers inside strings are preserved. Runtime is O(n) in line length. No external state is mutated.
- @param[in] line {string} Source line to strip.
- @param[in] singleComment {string | undefined} Language single-line comment marker.
- @param[in] stringDelimiters {string[]} Supported string delimiters for the language.
- @return {string} Line content before the first real comment marker.

### fn `function buildCompressedLineEntry(` (L219-231)
- @brief Builds one rendered compressed line entry.
- @details Materializes both the raw compressed text and the display text that optionally prefixes the original source line number. Runtime is O(n) in line length. No side effects occur.
- @param[in] text {string} Compressed source text for one retained line.
- @param[in] sourceLineNumber {number} Original source line number.
- @param[in] compressedLineNumber {number} One-based output line number inside the compressed excerpt.
- @param[in] includeLineNumbers {boolean} When `true`, prefix the display text with the original source line number.
- @return {CompressedLineEntry} Structured compressed line entry.

### fn `function formatCompressedSourceText(entries: CompressedLineEntry[]): string` (L239-241)
- @brief Formats compressed line entries as newline-delimited text.
- @details Joins pre-rendered display lines without adding headers, fences, or other presentation artifacts. Runtime is O(n) in entry count and aggregate content length. No side effects occur.
- @param[in] entries {CompressedLineEntry[]} Structured compressed line entries.
- @return {string} Final compressed source text.

### fn `export function compressSourceDetailed(source: string, language: string, includeLineNumbers = true): CompressedSourceResult` (L252-420)
- @brief Compresses in-memory source text into the structured compression model.
- @details Removes blank lines and comments, preserves shebangs, respects string-literal boundaries, retains leading indentation for indentation-significant languages, and emits both structured line entries and a rendered text excerpt. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressSource(source: string, language: string, includeLineNumbers = true): string` (L431-433)
- @brief Compresses in-memory source text for one language.
- @details Delegates to `compressSourceDetailed(...)` and returns only the rendered compressed source text so legacy CLI and markdown-oriented paths keep their existing behavior. Runtime is O(n) in source length. No external state is mutated.
- @param[in] source {string} Raw source text.
- @param[in] language {string} Canonical compression language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language is unsupported.

### fn `export function compressFileDetailed(filePath: string, language?: string, includeLineNumbers = true): CompressedSourceResult` (L444-451)
- @brief Compresses one source file from disk into the structured compression model.
- @details Detects the language when not supplied, reads the file as UTF-8, and delegates to `compressSourceDetailed(...)`. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, prefix rendered text lines with original source line numbers.
- @return {CompressedSourceResult} Structured compression result.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

### fn `export function compressFile(filePath: string, language?: string, includeLineNumbers = true): string` (L462-464)
- @brief Compresses one source file from disk.
- @details Delegates to `compressFileDetailed(...)` and returns only the rendered compressed source text so CLI and markdown emitters can retain their established text contract. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] filePath {string} Source file path.
- @param[in] language {string | undefined} Optional explicit language override.
- @param[in] includeLineNumbers {boolean} When `true`, include original line-number prefixes in the output.
- @return {string} Compressed source text.
- @throws {Error} Throws when the language cannot be detected or the file cannot be read.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`CompressedLineEntry`|iface||57-62|export interface CompressedLineEntry|
|`CompressedSourceResult`|iface||68-79|export interface CompressedSourceResult|
|`getSpecs`|fn||86-89|function getSpecs()|
|`detectLanguage`|fn||97-99|export function detectLanguage(filePath: string): string ...|
|`countLogicalLines`|fn||107-113|function countLogicalLines(content: string): number|
|`isInString`|fn||123-158|function isInString(line: string, pos: number, stringDeli...|
|`removeInlineComment`|fn||168-208|function removeInlineComment(line: string, singleComment:...|
|`buildCompressedLineEntry`|fn||219-231|function buildCompressedLineEntry(|
|`formatCompressedSourceText`|fn||239-241|function formatCompressedSourceText(entries: CompressedLi...|
|`compressSourceDetailed`|fn||252-420|export function compressSourceDetailed(source: string, la...|
|`compressSource`|fn||431-433|export function compressSource(source: string, language: ...|
|`compressFileDetailed`|fn||444-451|export function compressFileDetailed(filePath: string, la...|
|`compressFile`|fn||462-464|export function compressFile(filePath: string, language?:...|


---

# config.ts | TypeScript | 272L | 9 symbols | 7 imports | 13 comments
> Path: `src/core/config.ts`
- @brief Loads, normalizes, and persists pi-usereq project configuration.
- @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq`.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
import {
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface StaticCheckEntry` (L32-36)
- @brief Describes one static-check module configuration entry.
- @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.

### iface `export interface UseReqConfig` (L42-56)
- @brief Defines the persisted pi-usereq project configuration schema.
- @details Captures documentation paths, source/test directory selection, static-check configuration, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.

### fn `export function getProjectConfigPath(projectBase: string): string` (L80-82)
- @brief Computes the per-project config file path.
- @details Joins the project base with `.pi-usereq/config.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {string} Absolute config file path.

### fn `export function getDefaultConfig(_projectBase: string): UseReqConfig` (L91-107)
- @brief Builds the default project configuration.
- @details Populates canonical docs/test/source directories, the default startup tool set, and default pi-notify fields while excluding runtime-derived path metadata. Time complexity is O(n) in default tool count. No filesystem side effects occur.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Fresh default configuration object.
- @satisfies CTN-001, CTN-012, REQ-066, REQ-146

### fn `export function loadConfig(projectBase: string): UseReqConfig` (L117-167)
- @brief Loads and sanitizes the persisted project configuration.
- @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates directory and static-check field shapes, normalizes enabled tool names and pi-notify fields, and ignores removed or runtime-derived path metadata. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @return {UseReqConfig} Sanitized effective configuration.
- @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
- @satisfies CTN-012, REQ-066, REQ-146

### fn `function buildPersistedConfig(config: UseReqConfig): UseReqConfig` (L176-201)
- @brief Builds the persisted configuration payload that excludes runtime-derived fields.
- @details Copies only the canonical persisted configuration keys into a fresh object so runtime-derived metadata such as `base-path` and `git-path` can never be written to disk. Runtime is O(n) in config size. No external state is mutated.
- @param[in] config {UseReqConfig} Effective configuration object.
- @return {UseReqConfig} Persistable configuration payload.
- @satisfies CTN-012, REQ-146

### fn `export function saveConfig(projectBase: string, config: UseReqConfig): void` (L211-215)
- @brief Persists the project configuration to disk.
- @details Creates the parent `.pi-usereq` directory when necessary, strips runtime-derived fields from the serialized payload, and writes formatted JSON terminated by a newline. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to persist.
- @return {void} No return value.
- @satisfies CTN-012, REQ-146

### fn `export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig` (L224-234)
- @brief Normalizes persisted directory fields to project-relative forms.
- @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Configuration object to normalize.
- @return {UseReqConfig} Normalized configuration copy.

### fn `export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string>` (L244-272)
- @brief Builds placeholder replacements for bundled prompt rendering.
- @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Absolute project root path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
- @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckEntry`|iface||32-36|export interface StaticCheckEntry|
|`UseReqConfig`|iface||42-56|export interface UseReqConfig|
|`getProjectConfigPath`|fn||80-82|export function getProjectConfigPath(projectBase: string)...|
|`getDefaultConfig`|fn||91-107|export function getDefaultConfig(_projectBase: string): U...|
|`loadConfig`|fn||117-167|export function loadConfig(projectBase: string): UseReqCo...|
|`buildPersistedConfig`|fn||176-201|function buildPersistedConfig(config: UseReqConfig): UseR...|
|`saveConfig`|fn||211-215|export function saveConfig(projectBase: string, config: U...|
|`normalizeConfigPaths`|fn||224-234|export function normalizeConfigPaths(projectBase: string,...|
|`buildPromptReplacementPaths`|fn||244-272|export function buildPromptReplacementPaths(projectBase: ...|


---

# doxygen-parser.ts | TypeScript | 318L | 13 symbols | 0 imports | 19 comments
> Path: `src/core/doxygen-parser.ts`
- @brief Parses repository-approved Doxygen tags and renders them as markdown bullets.
- @details Implements a constrained Doxygen grammar used by the source analyzer and construct finder. Parsing cost is linear in comment length. The module is pure and performs no I/O.

## Definitions

- type `export type DoxygenFieldMap = Record<string, string[]>;` (L62)
- @brief Represents parsed Doxygen fields grouped by normalized tag name.
- @details Each key maps to one or more textual payloads because the same tag may appear multiple times in a single comment. The alias is compile-time only and adds no runtime cost.
- type `export type StructuredDoxygenParamDirection = "in" | "out" | "in,out" | "unspecified";` (L68)
- @brief Enumerates supported structured parameter directions.
- @details Normalizes `
- @param ` direction modifiers into one small closed set so agents can branch on parameter flow without reparsing raw tag names. The alias is compile-time only and introduces no runtime cost.
### iface `export interface StructuredDoxygenParameterEntry` (L74-80)
- @brief Describes one structured Doxygen parameter field.
- @details Separates parameter direction, optional parameter name, optional declared type, and residual text so agents can access argument contracts without reparsing monolithic tag strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface StructuredDoxygenFields` (L86-101)
- @brief Describes the structured Doxygen field contract used by LLM-oriented JSON payloads.
- @details Converts repeated raw tag strings into tag-specific arrays and specialized parameter records while keeping unsplittable residual text local to the affected field. The interface is compile-time only and introduces no runtime cost.

### fn `export function parseDoxygenComment(commentText: string): DoxygenFieldMap` (L109-142)
- @brief Parses repository-approved Doxygen fields from one comment block.
- @details Normalizes line endings, strips comment delimiters, locates supported tags, and accumulates tag payloads in declaration order. Unsupported content is ignored. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentText {string} Raw comment text including delimiters.
- @return {DoxygenFieldMap} Parsed tag payloads keyed by normalized tag name.

### fn `export function stripCommentDelimiters(text: string): string` (L150-166)
- @brief Removes language comment delimiters from raw comment text.
- @details Drops standalone opening and closing markers, strips leading comment prefixes on each line, and preserves semantic payload lines only. Runtime is O(n) in line count. No external state is mutated.
- @param[in] text {string} Raw comment text.
- @return {string} Cleaned multi-line payload without delimiter syntax.

### fn `export function normalizeWhitespace(text: string): string` (L174-190)
- @brief Collapses redundant whitespace while preserving paragraph boundaries.
- @details Converts repeated spaces to single spaces, trims each line, and reduces multiple blank lines to one blank separator. Runtime is O(n) in text length. No side effects occur.
- @param[in] text {string} Input text to normalize.
- @return {string} Canonically spaced text.

### fn `export function formatDoxygenFieldsAsMarkdown(doxygenFields: DoxygenFieldMap): string[]` (L198-207)
- @brief Serializes parsed Doxygen fields into markdown bullet lines.
- @details Iterates over `DOXYGEN_TAGS` in canonical order and emits one `- @tag value` line for every stored payload. Runtime is O(t + v) where t is tag count and v is total values. No side effects occur.
- @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen field map.
- @return {string[]} Ordered markdown bullet lines.

### fn `export function countDoxygenFieldValues(doxygenFields: DoxygenFieldMap): number` (L215-217)
- @brief Counts the total number of parsed Doxygen field values.
- @details Sums the value-array lengths across all tags so payload builders can expose aggregate Doxygen density as a numeric fact. Runtime is O(t) in tag count. No side effects occur.
- @param[in] doxygenFields {DoxygenFieldMap} Parsed Doxygen fields.
- @return {number} Total stored Doxygen value count.

### fn `function structureDoxygenParameterValue(value: string, direction: StructuredDoxygenParamDirection): StructuredDoxygenParameterEntry` (L226-228)
- @brief Parses one raw Doxygen parameter value into structured fields.
- @details Supports the repository-preferred `name {type} description` form, the alternate `{type} name description` form, and a residual-text fallback when no safe split is possible. Runtime is O(n) in value length. No side effects occur.
- @param[in] value {string} Raw Doxygen parameter value.
- @param[in] direction {StructuredDoxygenParamDirection} Normalized parameter direction.
- @return {StructuredDoxygenParameterEntry} Structured parameter record.

### fn `function splitCommaSeparatedDoxygenValues(values: string[] | undefined): string[]` (L264-269)
- @brief Splits comma-delimited Doxygen value strings into normalized items.
- @details Trims surrounding whitespace, drops empty segments, and preserves original declaration order. Runtime is O(n) in aggregate text length. No side effects occur.
- @param[in] values {string[] | undefined} Raw Doxygen value strings.
- @return {string[]} Normalized item list.

### fn `function extractSatisfiedRequirementIds(values: string[] | undefined): string[]` (L277-280)
- @brief Extracts normalized requirement IDs from raw `
- @details Matches repository requirement ID prefixes directly from the raw value text so agents receive requirement links as a dedicated string array. Runtime is O(n) in aggregate text length. No side effects occur.
- @param[in] values {string[] | undefined} Raw `
- @return {string[]} Normalized requirement IDs in declaration order.
- @satisfies ` values.
- @satisfies ` values.

### fn `export function structureDoxygenFields(doxygenFields: DoxygenFieldMap): StructuredDoxygenFields` (L289-318)
- @brief Converts raw parsed Doxygen fields into the structured JSON contract.
- @details Reorders raw tags into tag-specific arrays, structures parameter fields, normalizes `
- @param[in] doxygenFields {DoxygenFieldMap} Raw parsed Doxygen field map.
- @return {StructuredDoxygenFields} Structured Doxygen fields.
- @see ` aliases, and extracts requirement IDs from `
- @satisfies `. Runtime is O(t + v) where t is tag count and v is total value count. No side effects occur.
- @satisfies REQ-078

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`DoxygenFieldMap`|type||62||
|`StructuredDoxygenParamDirection`|type||68||
|`StructuredDoxygenParameterEntry`|iface||74-80|export interface StructuredDoxygenParameterEntry|
|`StructuredDoxygenFields`|iface||86-101|export interface StructuredDoxygenFields|
|`parseDoxygenComment`|fn||109-142|export function parseDoxygenComment(commentText: string):...|
|`stripCommentDelimiters`|fn||150-166|export function stripCommentDelimiters(text: string): string|
|`normalizeWhitespace`|fn||174-190|export function normalizeWhitespace(text: string): string|
|`formatDoxygenFieldsAsMarkdown`|fn||198-207|export function formatDoxygenFieldsAsMarkdown(doxygenFiel...|
|`countDoxygenFieldValues`|fn||215-217|export function countDoxygenFieldValues(doxygenFields: Do...|
|`structureDoxygenParameterValue`|fn||226-228|function structureDoxygenParameterValue(value: string, di...|
|`splitCommaSeparatedDoxygenValues`|fn||264-269|function splitCommaSeparatedDoxygenValues(values: string[...|
|`extractSatisfiedRequirementIds`|fn||277-280|function extractSatisfiedRequirementIds(values: string[] ...|
|`structureDoxygenFields`|fn||289-318|export function structureDoxygenFields(doxygenFields: Dox...|


---

# errors.ts | TypeScript | 31L | 1 symbols | 0 imports | 4 comments
> Path: `src/core/errors.ts`
- @brief Defines the repository-specific error class used by CLI and extension workflows.
- @details Centralizes deterministic failure signaling by pairing an error message with a numeric exit code. The module is pure and performs no I/O. Access complexity is O(1).

## Definitions

### class `export class ReqError extends Error` : Error (L11-31)
- @brief Represents a useReq failure with a stable numeric exit code.
- @brief Stores the process-style exit code associated with the failure.
- @details Extends `Error` so callers can propagate human-readable diagnostics together with process-style status codes. Construction and property access are O(1). State mutation is limited to the created instance.
- @details Downstream CLI and extension handlers read this field to decide the final command status. Access complexity is O(1). The field is assigned during construction.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReqError`|class||11-31|export class ReqError extends Error|


---

# extension-status.ts | TypeScript | 660L | 30 symbols | 4 imports | 30 comments
> Path: `src/core/extension-status.ts`
- @brief Tracks pi-usereq extension status state and renders status-bar telemetry.
- @details Centralizes hook interception, context-usage snapshots, run timing,
and deterministic status-bar formatting for the pi-usereq extension. Runtime
is O(1) per event plus O(s) in configured source-path count during status
rendering. Side effects are limited to in-memory state mutation and interval
scheduling through exported controller helpers.

## Imports
```
import type {
import type { UseReqConfig } from "./config.js";
import { formatPiNotifyBeepStatus } from "./pi-notify.js";
import { formatAbsoluteGitPath, formatBasePathRelativeToGitPath, resolveRuntimeGitPath } from "./runtime-project-paths.js";
```

## Definitions

- type `type StatusForegroundColor = Extract<` (L27)
- @brief Enumerates the CLI-supported theme tokens consumed by status rendering.
- @details Restricts the status formatter to documented pi theme tokens so the
status bar remains compatible with the active CLI theme schema. Compile-time
only and introduces no runtime cost.
### iface `interface RawStatusTheme` (L38-42)
- @brief Describes the raw theme capabilities required for status rendering.
- @details Accepts the `ctx.ui.theme` foreground renderer plus optional helpers
that can convert a foreground color into a background-styled fragment for the
context-usage bar. Compile-time only and introduces no runtime cost.

### iface `interface StatusThemeAdapter` (L50-58)
- @brief Describes the normalized theme adapter used by status formatters.
- @details Exposes deterministic label, value, foreground, background, and
context-cell renderers so status text generation stays independent from the
raw theme API. Compile-time only and introduces no runtime cost.

### iface `interface ContextUsageOverlaySpec` (L66-70)
- @brief Describes one fixed-width context-bar overlay.
- @details Stores the literal text plus foreground and background color roles
used when the context bar must render threshold-specific labels instead of
block glyphs. Compile-time only and introduces no runtime cost.

- type `export type PiUsereqStatusHookName = (typeof PI_USEREQ_STATUS_HOOK_NAMES)[number];` (L113)
- @brief Represents one hook name handled by the pi-usereq status controller.
- @details Narrows hook registration and event-update calls to the canonical
intercepted-hook set. Compile-time only and introduces no runtime cost.
### iface `export interface PiUsereqStatusState` (L122-126)
- @brief Stores the mutable runtime facts displayed by the status bar.
- @details Persists the latest context-usage snapshot, the active run start
timestamp, and the most recent normally completed run duration. Runtime state
is mutated in-place by controller helpers. Compile-time only and introduces
no runtime cost.

### iface `export interface PiUsereqStatusController` (L135-141)
- @brief Stores the controller state required for event-driven status updates.
- @details Keeps the mutable status snapshot, the current configuration, the
latest extension context used for rendering, the active-tools provider, and
the interval handle used for live elapsed-time refreshes. Compile-time only
and introduces no runtime cost.

### fn `function convertForegroundAnsiToBackgroundAnsi(` (L151-159)
- @brief Converts a foreground ANSI sequence into the equivalent background ANSI.
- @details Supports the standard `38;` foreground prefix emitted by pi themes.
Returns `undefined` when the input cannot be transformed deterministically.
Runtime is O(n) in ANSI sequence length. No external state is mutated.
- @param[in] foregroundAnsi {string} Foreground ANSI sequence.
- @return {string | undefined} Background ANSI sequence when derivable.

### fn `function applyForegroundAsBackground(` (L172-189)
- @brief Applies a foreground-derived background style to one text fragment.
- @details Prefers a theme-provided `bgFromFg` encoder for deterministic test
rendering and falls back to ANSI conversion when the runtime theme exposes
`getFgAnsi`. Runtime is O(n) in fragment length. No external state is
mutated.
- @param[in] theme {RawStatusTheme} Raw theme adapter.
- @param[in] color {StatusForegroundColor} Foreground color reused as background.
- @param[in] text {string} Already-colored foreground fragment.
- @return {string} Background-decorated text fragment.

### fn `function createStatusThemeAdapter(theme: RawStatusTheme): StatusThemeAdapter` (L200-220)
- @brief Builds the normalized theme adapter used by pi-usereq status formatters.
- @details Precomputes label, value, foreground, background, separator, and
context-cell renderers so status formatting remains stable across real TUI
themes and deterministic test doubles. Runtime is O(1). No external state
is mutated.
- @param[in] theme {RawStatusTheme} Raw theme implementation from `ctx.ui.theme`.
- @return {StatusThemeAdapter} Normalized status-theme adapter.

### fn `const colorize = (color: StatusForegroundColor, text: string): string =>` (L201-219)

### fn `const backgroundize = (color: StatusForegroundColor, text: string): string =>` (L203-219)

### fn `function normalizeContextUsage(` (L230-247)
- @brief Normalizes one raw context-usage snapshot.
- @details Preserves the runtime token and context-window counts, derives a
percentage when the runtime omits it, and clamps percentages into `[0, 100]`.
Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Raw runtime snapshot.
- @return {ContextUsage | undefined} Normalized snapshot.

### fn `function refreshContextUsage(` (L259-264)
- @brief Refreshes the stored context-usage snapshot from the active extension context.
- @details Calls `ctx.getContextUsage()` on every intercepted event so the
controller retains the newest context-usage facts available from the pi
runtime. Runtime is O(1). Side effect: mutates `state.contextUsage`.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] state {PiUsereqStatusState} Mutable status state.
- @return {void} No return value.
- @satisfies REQ-118, REQ-119

### fn `function countFilledContextCells(` (L275-283)
- @brief Counts the filled cells rendered by the 5-cell context bar.
- @details Uses ceiling semantics for positive percentages so any non-zero
usage occupies at least one cell and zero usage occupies none. Runtime is
O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {number} Filled-cell count in the inclusive range `[0, 5]`.
- @satisfies REQ-122

### fn `function resolveContextUsageOverlay(` (L295-314)
- @brief Resolves the threshold-specific context-bar overlay when required.
- @details Returns the empty-state `CLEAR` overlay when normalized context
usage is unavailable or non-positive and returns the high-water `FULL!`
overlay with the active theme `error` token when usage exceeds 90 percent.
Runtime is O(1). No external state is mutated.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {ContextUsageOverlaySpec | undefined} Overlay spec when a replacement label is required.
- @satisfies REQ-127, REQ-128

### fn `function formatContextUsageOverlay(` (L327-335)
- @brief Formats one threshold-specific context-bar overlay.
- @details Renders the fixed-width overlay text with the requested foreground
color and reuses the selected bar color as the background so the bar width
and state-specific backdrop remain preserved. Runtime is O(n) in overlay
width. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] overlay {ContextUsageOverlaySpec} Overlay specification.
- @return {string} Rendered overlay text.
- @satisfies REQ-127, REQ-128

### fn `function formatContextUsageBar(` (L349-361)
- @brief Formats one 5-cell context-usage bar.
- @details Renders threshold-specific overlays for empty and high-water states;
otherwise renders filled cells with the theme `warning` token on an
accent-derived background and unfilled cells in `dim` on the same background
to preserve constant bar width. Runtime is O(1). No external state is
mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] contextUsage {ContextUsage | undefined} Normalized context snapshot.
- @return {string} Rendered 5-cell bar or overlay.
- @satisfies REQ-121, REQ-122, REQ-126, REQ-127, REQ-128

### fn `function formatStatusDuration(durationMs: number): string` (L372-377)
- @brief Formats one elapsed-duration value as `M:SS`.
- @details Floors the input to whole seconds, keeps minutes unbounded above 59,
and zero-pads seconds to two digits. Runtime is O(1). No external state is
mutated.
- @param[in] durationMs {number} Duration in milliseconds.
- @return {string} Duration rendered as `M:SS`.
- @satisfies REQ-125

### fn `function formatStatusField(` (L388-394)
- @brief Formats one standard status-bar field.
- @details Renders the field label in accent color and the value in warning
color. Runtime is O(n) in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] value {string} Unstyled field value.
- @return {string} Rendered status-field fragment.

### fn `function formatRenderedStatusField(` (L406-412)
- @brief Formats one pre-rendered status-bar field value.
- @details Preserves the accent-colored field label while allowing callers to
provide a custom styled value such as the context-usage bar. Runtime is O(n)
in combined text length. No external state is mutated.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] fieldName {string} Field label emitted before the colon.
- @param[in] renderedValue {string} Pre-rendered field value.
- @return {string} Rendered status-field fragment.

### fn `function didAgentEndAbort(messages: AgentEndEvent["messages"]): boolean` (L423-430)
- @brief Detects whether an agent run ended through abort semantics.
- @details Treats any assistant message whose `stopReason` equals `aborted` as
an escape-triggered termination that must not overwrite the `last` timer.
Runtime is O(n) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Messages emitted by `agent_end`.
- @return {boolean} `true` when the run ended in aborted state.
- @satisfies REQ-125

### fn `function buildPiUsereqStatusText(` (L444-481)
- @brief Builds the full single-line pi-usereq status-bar payload.
- @details Renders git, base, docs, tests, src, tools, context, elapsed, last, beep, and sound fields in the canonical order with dim bullet separators and threshold-specific context-bar overlays. Runtime is O(s) in configured source-path count plus runtime git probing. No external state is mutated.
- @param[in] cwd {string} Runtime working directory used for git/base path derivation.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in] activeTools {readonly string[]} Active runtime tool names.
- @param[in] theme {StatusThemeAdapter} Normalized status theme.
- @param[in] state {PiUsereqStatusState} Mutable status state snapshot.
- @param[in] nowMs {number} Current wall-clock time in milliseconds.
- @return {string} Single-line status-bar text.
- @satisfies REQ-109, REQ-112, REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136, REQ-147, REQ-148, REQ-156

### fn `function stopStatusTicker(controller: PiUsereqStatusController): void` (L491-496)
- @brief Stops the live elapsed-time ticker when it is active.
- @details Clears the interval handle and resets the stored timer reference so
subsequent runs can reinitialize live status refreshes deterministically.
Runtime is O(1). Side effect: mutates `controller.tickHandle`.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `function syncPiUsereqStatusTicker(` (L508-524)
- @brief Synchronizes the live elapsed-time ticker with the current run state.
- @details Starts a 1-second render ticker while a run is active and stops the
ticker when the run returns to idle. Runtime is O(1). Side effects include
interval creation, interval disposal, and footer-status mutation on timer
ticks.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-123

### fn `export function createPiUsereqStatusController(` (L535-549)
- @brief Creates an empty pi-usereq status controller.
- @details Initializes the mutable status snapshot, stores the active-tools
provider used by render-time tool counting, and starts with no config, no
context, and no live ticker. Runtime is O(1). No external state is mutated.
- @param[in] getActiveTools {() => readonly string[]} Provider for active tools.
- @return {PiUsereqStatusController} New status controller.
- @satisfies DES-010

### fn `export function setPiUsereqStatusConfig(` (L561-566)
- @brief Stores the effective project configuration used by status rendering.
- @details Replaces the controller's cached configuration so later status
renders reuse the latest docs, tests, source-path, and pi-notify values
without reading from disk on every event. Runtime is O(1). Side effect:
mutates `controller.config`.
- @param[in] config {UseReqConfig} Effective project configuration.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

### fn `export function renderPiUsereqStatus(` (L579-599)
- @brief Renders the current pi-usereq status bar into the active UI context.
- @details Updates the controller's latest context pointer and writes the
single-line status text only when configuration is available, including any
threshold-specific context-bar overlays. Runtime is O(s) in configured
source-path count. Side effect: mutates `ctx.ui` status.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-120, REQ-121, REQ-123, REQ-124, REQ-125, REQ-126, REQ-127, REQ-128, REQ-135, REQ-136

### fn `export function updateExtensionStatus(` (L616-644)
- @brief Updates mutable status state for one intercepted lifecycle hook.
- @details Refreshes stored context usage on every hook, starts run timing on
`agent_start`, captures non-aborted run duration on `agent_end`, clears live
timing on shutdown, synchronizes the live ticker, and re-renders the status
bar when configuration is available. Runtime is O(n) in `agent_end` message
count and otherwise O(1). Side effects include in-memory state mutation,
interval scheduling, and footer-status updates.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded from the wrapper.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-123, REQ-124, REQ-125

### fn `export function disposePiUsereqStatusController(` (L655-660)
- @brief Disposes the pi-usereq status controller.
- @details Stops the live ticker, clears the cached context pointer, and leaves
the last captured status snapshot available for inspection until the
controller object itself is discarded. Runtime is O(1). Side effects are
limited to interval disposal and in-memory state mutation.
- @param[in,out] controller {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StatusForegroundColor`|type||27||
|`RawStatusTheme`|iface||38-42|interface RawStatusTheme|
|`StatusThemeAdapter`|iface||50-58|interface StatusThemeAdapter|
|`ContextUsageOverlaySpec`|iface||66-70|interface ContextUsageOverlaySpec|
|`PiUsereqStatusHookName`|type||113||
|`PiUsereqStatusState`|iface||122-126|export interface PiUsereqStatusState|
|`PiUsereqStatusController`|iface||135-141|export interface PiUsereqStatusController|
|`convertForegroundAnsiToBackgroundAnsi`|fn||151-159|function convertForegroundAnsiToBackgroundAnsi(|
|`applyForegroundAsBackground`|fn||172-189|function applyForegroundAsBackground(|
|`createStatusThemeAdapter`|fn||200-220|function createStatusThemeAdapter(theme: RawStatusTheme):...|
|`colorize`|fn||201-219|const colorize = (color: StatusForegroundColor, text: str...|
|`backgroundize`|fn||203-219|const backgroundize = (color: StatusForegroundColor, text...|
|`normalizeContextUsage`|fn||230-247|function normalizeContextUsage(|
|`refreshContextUsage`|fn||259-264|function refreshContextUsage(|
|`countFilledContextCells`|fn||275-283|function countFilledContextCells(|
|`resolveContextUsageOverlay`|fn||295-314|function resolveContextUsageOverlay(|
|`formatContextUsageOverlay`|fn||327-335|function formatContextUsageOverlay(|
|`formatContextUsageBar`|fn||349-361|function formatContextUsageBar(|
|`formatStatusDuration`|fn||372-377|function formatStatusDuration(durationMs: number): string|
|`formatStatusField`|fn||388-394|function formatStatusField(|
|`formatRenderedStatusField`|fn||406-412|function formatRenderedStatusField(|
|`didAgentEndAbort`|fn||423-430|function didAgentEndAbort(messages: AgentEndEvent["messag...|
|`buildPiUsereqStatusText`|fn||444-481|function buildPiUsereqStatusText(|
|`stopStatusTicker`|fn||491-496|function stopStatusTicker(controller: PiUsereqStatusContr...|
|`syncPiUsereqStatusTicker`|fn||508-524|function syncPiUsereqStatusTicker(|
|`createPiUsereqStatusController`|fn||535-549|export function createPiUsereqStatusController(|
|`setPiUsereqStatusConfig`|fn||561-566|export function setPiUsereqStatusConfig(|
|`renderPiUsereqStatus`|fn||579-599|export function renderPiUsereqStatus(|
|`updateExtensionStatus`|fn||616-644|export function updateExtensionStatus(|
|`disposePiUsereqStatusController`|fn||655-660|export function disposePiUsereqStatusController(|


---

# find-constructs.ts | TypeScript | 319L | 12 symbols | 4 imports | 14 comments
> Path: `src/core/find-constructs.ts`
- @brief Finds named language constructs in explicit source-file lists and renders compact excerpts.
- @details Combines source analysis, tag filtering, regex name matching, optional Doxygen extraction, and comment-stripped code rendering. Runtime is O(F + S + M) where F is file count, S is analyzed source size, and M is candidate element count. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import { compressSource, detectLanguage } from "./compress.js";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
import { SourceAnalyzer, SourceElement, ElementType } from "./source-analyzer.js";
```

## Definitions

### fn `export function formatAvailableTags(): string` (L44-49)
- @brief Formats the supported tag matrix for user-facing error messages.
- @details Sorts languages alphabetically and emits one bullet per language containing its sorted construct tags. Runtime is O(l * t log t). No side effects occur.
- @return {string} Multiline markdown-like tag summary.

### fn `export function parseTagFilter(tagString: string): Set<string>` (L57-64)
- @brief Parses a pipe-delimited construct tag filter.
- @details Splits the raw filter on `|`, trims whitespace, uppercases entries, and removes empty tokens. Runtime is O(n) in input length. No side effects occur.
- @param[in] tagString {string} Raw pipe-delimited tag expression.
- @return {Set<string>} Normalized tag set.

### fn `export function languageSupportsTags(language: string, tagSet: Set<string>): boolean` (L73-76)
- @brief Tests whether a language supports at least one requested tag.
- @details Performs O(k) membership checks across the requested tag set against the language-specific supported-tag set. No external state is mutated.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] tagSet {Set<string>} Requested construct tags.
- @return {boolean} `true` when at least one requested tag is supported for the language.

### fn `export function constructMatches(element: SourceElement, tagSet: Set<string>, pattern: string): boolean` (L86-94)
- @brief Tests whether one analyzed element satisfies tag and name filters.
- @details Rejects elements whose type label is outside the requested tag set or that do not expose a name, then applies the user regex to the name. Invalid regex patterns are treated as non-matches. Runtime is O(p) for regex evaluation plus constant filtering work.
- @param[in] element {SourceElement} Candidate source element.
- @param[in] tagSet {Set<string>} Requested construct tags.
- @param[in] pattern {string} User-provided regular expression applied to element names.
- @return {boolean} `true` when the element matches both tag and name criteria.

### fn `function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]>` (L103-109)
- @brief Merges parsed Doxygen field arrays into one accumulator.
- @details Appends values for matching tags without deduplication so comment order is preserved. Runtime is O(v) in merged value count. The function mutates `baseFields` in place.
- @param[in] extraFields {Record<string, string[]>} Source map to append.
- @param[in,out] baseFields {Record<string, string[]>} Mutable destination map.
- @return {Record<string, string[]>} The mutated destination map.

### fn `function extractConstructDoxygenFields(element: SourceElement): Record<string, string[]>` (L117-127)
- @brief Collects Doxygen fields associated with one construct.
- @details Starts with fields already attached to the element and extends them with nearby body comments from the first three lines of the body. Runtime is O(c) in inspected comment count. No external state is mutated.
- @param[in] element {SourceElement} Source element whose documentation should be aggregated.
- @return {Record<string, string[]>} Aggregated Doxygen field map.

### fn `function extractFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]>` (L135-146)

### iface `export interface StrippedConstructLineEntry` (L152-157)
- @brief Describes one stripped-code line extracted from a matched construct.
- @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so markdown and JSON renderers can share one canonical intermediate format. The interface is compile-time only and introduces no runtime cost.

### fn `export function buildStrippedConstructLineEntries(` (L168-199)
- @brief Removes comments from a construct excerpt and returns structured stripped-code lines.
- @details Reuses `compressSource` for comment stripping, translates local compressed line numbers back into absolute file coordinates, and emits both direct-access text fields and rendered display strings. Runtime is O(n) in excerpt length. No external state is mutated.
- @param[in] codeLines {string[]} Raw code lines belonging to the construct.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] lineStart {number} Absolute starting line number of the construct.
- @param[in] includeLineNumbers {boolean} When `true`, `display_text` includes absolute source line prefixes.
- @return {StrippedConstructLineEntry[]} Structured stripped-code line entries.

### fn `function stripConstructComments(codeLines: string[], language: string, lineStart: number, includeLineNumbers: boolean): string` (L210-214)
- @brief Removes comments from a construct excerpt while preserving optional absolute line numbers.
- @details Delegates to `buildStrippedConstructLineEntries(...)` and joins the rendered display strings into one newline-delimited excerpt. Runtime is O(n) in excerpt length. No external state is mutated.
- @param[in] codeLines {string[]} Raw code lines belonging to the construct.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] lineStart {number} Absolute starting line number of the construct.
- @param[in] includeLineNumbers {boolean} When `true`, emit absolute source line prefixes.
- @return {string} Comment-stripped construct excerpt.

### fn `export function formatConstruct(element: SourceElement, sourceLines: string[], includeLineNumbers: boolean, language = "python"): string` (L225-240)
- @brief Formats one matched construct as markdown.
- @details Emits construct metadata, attached Doxygen fields, and a fenced code block stripped of comments. Runtime is O(n) in construct span length plus attached documentation size. No side effects occur.
- @param[in] element {SourceElement} Matched source element.
- @param[in] sourceLines {string[]} Full source file split into line-preserving entries.
- @param[in] includeLineNumbers {boolean} When `true`, include absolute source line prefixes.
- @param[in] language {string} Canonical analyzer language identifier. Defaults to `python`.
- @return {string} Markdown section for the matched construct.

### fn `export function findConstructsInFiles(` (L253-319)
- @brief Finds named constructs across explicit files and renders markdown excerpts.
- @details Validates files, infers languages, skips unsupported tag/language combinations, analyzes source elements, filters matches by tag and regex, and emits one markdown section per file containing matches. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] filePaths {string[]} Explicit file paths to search.
- @param[in] tagFilter {string} Pipe-delimited requested construct tags.
- @param[in] pattern {string} Regular expression applied to construct names.
- @param[in] includeLineNumbers {boolean} When `true`, preserve absolute source line numbers in code excerpts.
- @param[in] verbose {boolean} When `true`, write progress and skip diagnostics to stderr.
- @return {string} Concatenated markdown output grouped by file.
- @throws {Error} Throws when no valid tags are provided or when no constructs match the request.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatAvailableTags`|fn||44-49|export function formatAvailableTags(): string|
|`parseTagFilter`|fn||57-64|export function parseTagFilter(tagString: string): Set<st...|
|`languageSupportsTags`|fn||73-76|export function languageSupportsTags(language: string, ta...|
|`constructMatches`|fn||86-94|export function constructMatches(element: SourceElement, ...|
|`mergeDoxygenFields`|fn||103-109|function mergeDoxygenFields(baseFields: Record<string, st...|
|`extractConstructDoxygenFields`|fn||117-127|function extractConstructDoxygenFields(element: SourceEle...|
|`extractFileLevelDoxygenFields`|fn||135-146|function extractFileLevelDoxygenFields(elements: SourceEl...|
|`StrippedConstructLineEntry`|iface||152-157|export interface StrippedConstructLineEntry|
|`buildStrippedConstructLineEntries`|fn||168-199|export function buildStrippedConstructLineEntries(|
|`stripConstructComments`|fn||210-214|function stripConstructComments(codeLines: string[], lang...|
|`formatConstruct`|fn||225-240|export function formatConstruct(element: SourceElement, s...|
|`findConstructsInFiles`|fn||253-319|export function findConstructsInFiles(|


---

# find-payload.ts | TypeScript | 915L | 32 symbols | 6 imports | 33 comments
> Path: `src/core/find-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-find` and `find`.
- @details Converts construct-search results into deterministic JSON sections ordered for LLM traversal, including request metadata, repository scope, file statuses, structured matches, structured Doxygen fields, typed line ranges, and normalized stripped code lines. Runtime is O(F log F + S + M) where F is file count, S is analyzed source size, and M is matched construct count. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { detectLanguage } from "./compress.js";
import {
import {
```

## Definitions

- type `export type FindToolScope = "explicit-files" | "configured-source-directories";` (L33)
- @brief Enumerates supported find-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type FindFileStatus = "matched" | "no_match" | "error" | "skipped";` (L39)
- @brief Enumerates supported per-file find-entry statuses.
- @details Separates matched files, analyzed no-match files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
- type `export type FindRequestStatus = "valid" | "invalid";` (L45)
- @brief Enumerates request-validation statuses for tag-filter and regex fields.
- @details Distinguishes validated search inputs from invalid request parameters without requiring stderr parsing. The alias is compile-time only and introduces no runtime cost.
- type `export type FindLineNumberMode = "enabled" | "disabled";` (L51)
- @brief Enumerates rendered line-number modes for find output.
- @details Distinguishes payloads whose display strings include original source line prefixes from payloads whose display strings contain plain stripped code only. The alias is compile-time only and introduces no runtime cost.
- type `export type FindSearchStatus = "matched" | "no_matches" | "invalid_tag_filter" | "invalid_regex";` (L57)
- @brief Enumerates top-level find execution outcomes.
- @details Separates successful match delivery from invalid request states and valid no-match searches so agents can branch on one canonical field. The alias is compile-time only and introduces no runtime cost.
### iface `export interface FindLineRange` (L63-67)
- @brief Describes one numeric source line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolCodeLineEntry` (L73-78)
- @brief Describes one structured stripped-code line.
- @details Preserves output order, original source coordinates, normalized stripped text, and rendered display text so agents can choose between direct-access facts and human-visible rendering without reparsing strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolMatchEntry extends FindLineRange` : FindLineRange (L84-103)
- @brief Describes one structured matched construct.
- @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and stripped code so agents can branch without reparsing monolithic markdown. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolFileEntry extends FindLineRange` : FindLineRange (L109-131)
- @brief Describes one per-file find payload entry.
- @details Stores path identity, file status, supported-tag metadata, line metrics, file-level Doxygen metadata, and matched-construct records while keeping failure facts structured. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRequestSection` (L137-155)
- @brief Describes the request section of the find payload.
- @details Captures tool identity, scope, base directory, line-number mode, tag filter, regex, validation statuses, and requested path inventory so agents can reason about how the search was executed. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolSummarySection` (L161-171)
- @brief Describes the summary section of the find payload.
- @details Exposes aggregate file, match, line, and Doxygen counts as numeric fields plus one stable search-status discriminator. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolRepositorySection` (L177-183)
- @brief Describes the repository section of the find payload.
- @details Stores the base path, configured source-directory scope, canonical file list, and supported-tag matrix needed to specialize later searches without rereading tool descriptions. The interface is compile-time only and introduces no runtime cost.

### iface `export interface FindToolPayload` (L189-194)
- @brief Describes the full agent-oriented find payload.
- @details Orders the top-level sections as request, summary, repository, and files so execution metadata can be appended deterministically by the tool wrapper. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildFindToolPayloadOptions` (L200-210)
- @brief Describes the options required to build one find payload.
- @details Supplies tool identity, scope, base directory, tag filter, regex, requested paths, line-number mode, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedRegex` (L216-220)
- @brief Describes the result of validating one regex pattern.
- @details Separates valid compiled regex instances from invalid user input while preserving a stable machine-readable status and error message. The interface is compile-time only and introduces no runtime cost.

### iface `interface ValidatedTagFilter` (L226-231)
- @brief Describes the result of validating one tag filter.
- @details Separates normalized tag values from invalid or empty filters while preserving a stable status and error message. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeFindPath(targetPath: string, baseDir: string): string` (L240-248)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): FindLineRange` (L257-263)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {FindLineRange} Structured line-range record.

### fn `function buildSupportedTagsByLanguage(): Record<string, string[]>` (L270-276)
- @brief Returns the supported-tag matrix ordered for deterministic JSON emission.
- @details Sorts languages alphabetically and tag arrays lexicographically so downstream agents can reuse the matrix without reparsing human prose. Runtime is O(l * t log t). No side effects occur.
- @return {Record<string, string[]>} Supported tags keyed by canonical language identifier.

### fn `function resolveSymbolName(element: SourceElement): string` (L284-286)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every matched construct retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], element: SourceElement): SourceElement | undefined` (L295-304)
- @brief Resolves the direct parent definition for one source element.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] element {SourceElement} Candidate child element.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function mapCodeLines(lineEntries: StrippedConstructLineEntry[]): FindToolCodeLineEntry[]` (L312-319)
- @brief Converts stripped-code line entries into the payload line-entry contract.
- @details Performs a shallow field copy so the payload remains decoupled from the lower-level strip helper type. Runtime is O(n) in stripped line count. No side effects occur.
- @param[in] lineEntries {StrippedConstructLineEntry[]} Normalized stripped-code line entries.
- @return {FindToolCodeLineEntry[]} Payload line entries.

### fn `function buildStrippedSourceText(lineEntries: FindToolCodeLineEntry[]): string | undefined` (L327-332)
- @brief Joins stripped-code line entries into one optional monolithic text field.
- @details Preserves rendered display strings in line order so agents that need a contiguous excerpt can read one field without losing access to the structured line array. Runtime is O(n) in stripped line count. No side effects occur.
- @param[in] lineEntries {FindToolCodeLineEntry[]} Structured stripped-code line entries.
- @return {string | undefined} Joined stripped-source text, or `undefined` when no lines remain.

### fn `function validateTagFilter(tagFilter: string): ValidatedTagFilter` (L340-356)
- @brief Validates and normalizes one tag filter.
- @details Parses the raw pipe-delimited filter, sorts the resulting unique tag values, and marks the filter invalid when no recognized tag remains after normalization. Runtime is O(n log n) in requested tag count. No side effects occur.
- @param[in] tagFilter {string} Raw pipe-delimited tag filter.
- @return {ValidatedTagFilter} Validation result containing the normalized tag set and status.

### fn `function validateRegexPattern(pattern: string): ValidatedRegex` (L364-376)
- @brief Validates and compiles one construct-name regex pattern.
- @details Uses the JavaScript `RegExp` engine with search-style `.test(...)` evaluation and records a stable error message when compilation fails. Runtime is O(n) in pattern length. No side effects occur.
- @param[in] pattern {string} Raw user pattern.
- @return {ValidatedRegex} Validation result containing the compiled regex when valid.

### fn `function elementMatches(element: SourceElement, tagSet: Set<string>, regex: RegExp): boolean` (L386-394)
- @brief Tests whether one element matches a validated tag filter and regex.
- @details Rejects unnamed elements and elements outside the requested tag set before applying the precompiled regex to the construct name. Runtime is O(1) plus regex evaluation. No side effects occur.
- @param[in] element {SourceElement} Candidate source element.
- @param[in] tagSet {Set<string>} Normalized requested tag set.
- @param[in] regex {RegExp} Precompiled construct-name regex.
- @return {boolean} `true` when the element matches both filters.

### fn `function countLogicalLines(fileContent: string): number` (L402-407)
- @brief Counts logical source lines from one file content string.
- @details Preserves the repository's line-count convention that excludes the terminal empty split produced by trailing newlines. Runtime is O(n) in content length. No side effects occur.
- @param[in] fileContent {string} Raw file content.
- @return {number} Logical source-line count.

### fn `function buildSkippedFileEntry(` (L422-457)
- @brief Builds one skipped file entry for a request path.
- @details Preserves path identity, filesystem status, language metadata when detectable, supported tags for the language, and a stable skip reason without attempting search analysis. Runtime is O(t) in supported-tag count. No side effects occur.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] errorReason {string} Stable skip reason identifier.
- @param[in] errorMessage {string} Human-readable skip reason.
- @param[in] exists {boolean} Filesystem existence flag.
- @param[in] isFile {boolean} Filesystem file-kind flag.
- @return {FindToolFileEntry} Structured skipped file entry.

### fn `function buildMatchEntry(` (L471-514)
- @brief Builds one matched construct entry from an analyzed element.
- @details Resolves symbol identity, hierarchy hints, structured Doxygen fields, numeric declaration lines, and stripped code excerpts while keeping monolithic source text optional. Runtime is O(n) in construct span length plus Doxygen size. No side effects occur.
- @param[in] element {SourceElement} Matched element.
- @param[in] matchIndex {number} Match index within the file.
- @param[in] definitions {SourceElement[]} Sorted definition elements used for parent resolution.
- @param[in] qualifiedNameByLineStart {Map<number, string>} Precomputed qualified-name map for definitions.
- @param[in] sourceLines {string[]} Full file content split into line-preserving entries.
- @param[in] languageId {string} Canonical language identifier.
- @param[in] includeLineNumbers {boolean} When `true`, rendered display strings include absolute source line prefixes.
- @return {FindToolMatchEntry} Structured match entry.

### fn `function analyzeFindFile(` (L530-716)
- @brief Analyzes one path into a structured find file entry.
- @details Resolves path identity, validates language and tag support, parses the file with `SourceAnalyzer`, builds structured match entries, and preserves stable status facts for no-match or failure outcomes. Runtime is dominated by file I/O and analyzer cost. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared analyzer instance.
- @param[in] inputPath {string} Caller-supplied path.
- @param[in] absolutePath {string} Absolute path resolved against the payload base directory.
- @param[in] requestIndex {number} Caller-order index.
- @param[in] baseDir {string} Base directory used for canonical path derivation.
- @param[in] tagSet {Set<string>} Validated requested tag set.
- @param[in] regex {RegExp} Validated construct-name regex.
- @param[in] includeLineNumbers {boolean} When `true`, rendered stripped-source text includes original line prefixes.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {FindToolFileEntry} Structured file entry.

### fn `export function buildFindToolPayload(options: BuildFindToolPayloadOptions): FindToolPayload` (L725-881)
- @brief Builds the full agent-oriented find payload.
- @details Validates request parameters, analyzes requested files in caller order when the request is valid, preserves skipped and no-match outcomes in structured file entries, computes aggregate numeric totals, and emits a structured supported-tag matrix. Runtime is O(F log F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildFindToolPayloadOptions} Payload-construction options.
- @return {FindToolPayload} Structured find payload ordered as request, summary, repository, and files.
- @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-096, REQ-098

### fn `export function buildFindToolExecutionStderr(payload: FindToolPayload): string` (L890-915)
- @brief Builds deterministic stderr diagnostics from a find payload.
- @details Serializes invalid request states, skipped inputs, no-match files, and analysis failures into stable newline-delimited diagnostics while leaving successful matched files silent. Runtime is O(n) in file-entry count. No side effects occur.
- @param[in] payload {FindToolPayload} Structured find payload.
- @return {string} Newline-delimited diagnostics.
- @satisfies REQ-096

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`FindToolScope`|type||33||
|`FindFileStatus`|type||39||
|`FindRequestStatus`|type||45||
|`FindLineNumberMode`|type||51||
|`FindSearchStatus`|type||57||
|`FindLineRange`|iface||63-67|export interface FindLineRange|
|`FindToolCodeLineEntry`|iface||73-78|export interface FindToolCodeLineEntry|
|`FindToolMatchEntry`|iface||84-103|export interface FindToolMatchEntry extends FindLineRange|
|`FindToolFileEntry`|iface||109-131|export interface FindToolFileEntry extends FindLineRange|
|`FindToolRequestSection`|iface||137-155|export interface FindToolRequestSection|
|`FindToolSummarySection`|iface||161-171|export interface FindToolSummarySection|
|`FindToolRepositorySection`|iface||177-183|export interface FindToolRepositorySection|
|`FindToolPayload`|iface||189-194|export interface FindToolPayload|
|`BuildFindToolPayloadOptions`|iface||200-210|export interface BuildFindToolPayloadOptions|
|`ValidatedRegex`|iface||216-220|interface ValidatedRegex|
|`ValidatedTagFilter`|iface||226-231|interface ValidatedTagFilter|
|`canonicalizeFindPath`|fn||240-248|function canonicalizeFindPath(targetPath: string, baseDir...|
|`buildLineRange`|fn||257-263|function buildLineRange(startLineNumber: number, endLineN...|
|`buildSupportedTagsByLanguage`|fn||270-276|function buildSupportedTagsByLanguage(): Record<string, s...|
|`resolveSymbolName`|fn||284-286|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||295-304|function resolveParentElement(definitions: SourceElement[...|
|`mapCodeLines`|fn||312-319|function mapCodeLines(lineEntries: StrippedConstructLineE...|
|`buildStrippedSourceText`|fn||327-332|function buildStrippedSourceText(lineEntries: FindToolCod...|
|`validateTagFilter`|fn||340-356|function validateTagFilter(tagFilter: string): ValidatedT...|
|`validateRegexPattern`|fn||364-376|function validateRegexPattern(pattern: string): Validated...|
|`elementMatches`|fn||386-394|function elementMatches(element: SourceElement, tagSet: S...|
|`countLogicalLines`|fn||402-407|function countLogicalLines(fileContent: string): number|
|`buildSkippedFileEntry`|fn||422-457|function buildSkippedFileEntry(|
|`buildMatchEntry`|fn||471-514|function buildMatchEntry(|
|`analyzeFindFile`|fn||530-716|function analyzeFindFile(|
|`buildFindToolPayload`|fn||725-881|export function buildFindToolPayload(options: BuildFindTo...|
|`buildFindToolExecutionStderr`|fn||890-915|export function buildFindToolExecutionStderr(payload: Fin...|


---

# generate-markdown.ts | TypeScript | 120L | 3 symbols | 3 imports | 5 comments
> Path: `src/core/generate-markdown.ts`
- @brief Generates useReq reference markdown from explicit source-file lists.
- @details Combines file validation, language detection, source analysis, metadata enrichment, and final markdown rendering for downstream prompt workflows. Runtime is O(F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { SourceAnalyzer, formatMarkdown } from "./source-analyzer.js";
```

## Definitions

### fn `export function detectLanguage(filePath: string): string | undefined` (L47-49)
- @brief Infers the analyzer language from a file path extension.
- @details Normalizes the extension to lowercase and resolves it through `EXT_LANG_MAP`. Time complexity is O(1). No I/O side effects occur.
- @param[in] filePath {string} Source file path.
- @return {string | undefined} Canonical analyzer language identifier, or `undefined` for unsupported extensions.

### fn `function formatOutputPath(filePath: string, outputBase?: string): string` (L58-61)
- @brief Formats one analyzed file path for markdown output.
- @details Returns the original path when no base is supplied; otherwise computes a slash-normalized relative path against the resolved output base. Time complexity is O(p) in path length. No side effects occur.
- @param[in] filePath {string} Source file path.
- @param[in] outputBase {string | undefined} Optional base directory used for relative formatting.
- @return {string} Display path used in the rendered markdown header.

### fn `export function generateMarkdown(filePaths: string[], verbose = false, outputBase?: string): string` (L72-120)
- @brief Generates reference markdown for explicit source files.
- @details Filters unsupported or missing files, analyzes each valid source file, enriches extracted symbols with signatures and Doxygen metadata, and concatenates per-file markdown sections separated by horizontal rules. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] filePaths {string[]} Explicit file paths to analyze.
- @param[in] verbose {boolean} When `true`, write per-file progress diagnostics to stderr.
- @param[in] outputBase {string | undefined} Optional base directory used to shorten output paths.
- @return {string} Concatenated markdown reference document.
- @throws {Error} Throws when no valid source files can be processed.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`detectLanguage`|fn||47-49|export function detectLanguage(filePath: string): string ...|
|`formatOutputPath`|fn||58-61|function formatOutputPath(filePath: string, outputBase?: ...|
|`generateMarkdown`|fn||72-120|export function generateMarkdown(filePaths: string[], ver...|


---

# path-context.ts | TypeScript | 196L | 9 symbols | 4 imports | 12 comments
> Path: `src/core/path-context.ts`
- @brief Derives shared runtime path context for prompts, tools, and configuration flows.
- @details Resolves installation, execution, base, config, resource, docs, test, source, and optional git paths from the active runtime context, validates ancestor constraints for repository roots, and formats prompt-visible paths relative to the user home via platform-native environment variables. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. Side effects are limited to filesystem-path normalization.

## Imports
```
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseReqConfig } from "./config.js";
```

## Definitions

### iface `export interface RuntimePathContext` (L28-44)
- @brief Describes the absolute runtime path context shared across extension components.
- @details Aggregates the derived installation, execution, base, config, resource, documentation, tests, source, template, guideline, and optional git paths needed by prompt rendering and tool payload generation. The interface is compile-time only and introduces no runtime cost.

### iface `export interface RuntimePathFacts` (L50-64)
- @brief Describes the prompt/tool-facing runtime paths rendered with a home-environment-variable prefix when possible.
- @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable, user-home-relative path strings without reparsing absolute local paths. The interface is compile-time only and introduces no runtime cost.

### fn `export function getInstallationPath(): string` (L71-73)
- @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
- @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
- @return {string} Absolute installation path.

### fn `export function getConfigPath(basePath: string): string` (L81-83)
- @brief Computes the absolute project config path for one base path.
- @details Appends `.pi-usereq/config.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
- @param[in] basePath {string} Absolute or relative base path.
- @return {string} Absolute config-file path.

### fn `export function normalizePathSlashes(value: string): string` (L91-93)
- @brief Formats one path with slash separators.
- @details Normalizes the supplied path and converts platform separators to `/` so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
- @param[in] value {string} Absolute or relative filesystem path.
- @return {string} Slash-normalized path string.

### fn `export function isSameOrAncestorPath(ancestorPath: string, childPath: string): boolean` (L102-107)
- @brief Tests whether one path is identical to or an ancestor of another path.
- @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
- @param[in] ancestorPath {string} Candidate ancestor or identical path.
- @param[in] childPath {string} Candidate child or identical path.
- @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.

### fn `export function formatRuntimePathForDisplay(absolutePath: string): string` (L115-127)
- @brief Formats one absolute path relative to the user home using platform-native home environment variables when possible.
- @details Returns `$HOME` for POSIX platforms and `%USERPROFILE%` for Windows when the path equals or descends from the current home directory; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
- @param[in] absolutePath {string} Absolute or relative path candidate.
- @return {string} Home-environment-relative or slash-normalized absolute path.

### fn `export function buildRuntimePathContext(` (L137-140)
- @brief Builds the absolute runtime path context for one execution directory and configuration.
- @details Derives `base-path` from the supplied execution path, derives `config-path` under `.pi-usereq`, resolves docs/tests/source directories against the base path, derives installation-owned resource directories, and keeps `git-path` only when it satisfies the base-path ancestor constraint. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] executionPath {string} Current execution directory.
- @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective configuration fields required for path derivation.
- @param[in] options {{ installationPath?: string; gitPath?: string | undefined } | undefined} Optional installation and git-root overrides.
- @return {RuntimePathContext} Absolute runtime path context.

### fn `export function buildRuntimePathFacts(context: RuntimePathContext): RuntimePathFacts` (L180-196)
- @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
- @details Re-encodes every absolute path with the user-home environment-variable formatter while preserving path presence for the optional git root. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
- @param[in] context {RuntimePathContext} Absolute runtime path context.
- @return {RuntimePathFacts} Display-oriented runtime path facts.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`RuntimePathContext`|iface||28-44|export interface RuntimePathContext|
|`RuntimePathFacts`|iface||50-64|export interface RuntimePathFacts|
|`getInstallationPath`|fn||71-73|export function getInstallationPath(): string|
|`getConfigPath`|fn||81-83|export function getConfigPath(basePath: string): string|
|`normalizePathSlashes`|fn||91-93|export function normalizePathSlashes(value: string): string|
|`isSameOrAncestorPath`|fn||102-107|export function isSameOrAncestorPath(ancestorPath: string...|
|`formatRuntimePathForDisplay`|fn||115-127|export function formatRuntimePathForDisplay(absolutePath:...|
|`buildRuntimePathContext`|fn||137-140|export function buildRuntimePathContext(|
|`buildRuntimePathFacts`|fn||180-196|export function buildRuntimePathFacts(context: RuntimePat...|


---

# pi-notify.ts | TypeScript | 430L | 24 symbols | 4 imports | 31 comments
> Path: `src/core/pi-notify.ts`
- @brief Implements pi-usereq terminal-beep and external sound-hook helpers.
- @details Centralizes configuration defaults, status serialization, agent-end outcome classification, terminal notification dispatch, and successful-run external sound-command execution. Runtime is O(m + c) in `agent_end` message count plus command length. Side effects include stdout writes and detached child-process spawning.

## Imports
```
import { execFile, spawn } from "node:child_process";
import type { AgentEndEvent } from "@mariozechner/pi-coding-agent";
import { getInstallationPath } from "./path-context.js";
import type { UseReqConfig } from "./config.js";
```

## Definitions

- type `export type PiNotifySoundLevel = (typeof PI_NOTIFY_SOUND_LEVELS)[number];` (L22)
- @brief Represents one supported successful-run sound level.
- @details Narrows configuration parsing and runtime command dispatch to the canonical four-state sound-hook domain. Compile-time only and introduces no runtime cost.
- type `export type PiNotifyOutcome = (typeof PI_NOTIFY_OUTCOMES)[number];` (L34)
- @brief Represents one supported prompt-end notification outcome.
- @details Narrows prompt-end event classification and status serialization to the canonical three-outcome domain. Compile-time only and introduces no runtime cost.
- type `export type PiNotifyConfigFields = Pick<` (L68)
- @brief Describes the configuration fields consumed by pi-notify helpers.
- @details Narrows the full project config to the persisted notification and sound-hook fields used by status rendering, prompt-end routing, and shortcut toggles. Compile-time only and introduces no runtime cost.
### fn `export function normalizePiNotifySoundLevel(value: unknown): PiNotifySoundLevel` (L87-91)
- @brief Normalizes one persisted sound level.
- @details Accepts only canonical `none|low|mid|high` values and falls back to `none` for missing or invalid payloads. Runtime is O(1). No external state is mutated.
- @param[in] value {unknown} Raw persisted sound-level payload.
- @return {PiNotifySoundLevel} Canonical sound level.
- @satisfies REQ-131

### fn `export function normalizePiNotifyShortcut(value: unknown): string` (L100-104)
- @brief Normalizes one persisted sound toggle shortcut.
- @details Accepts any non-empty string so project config can carry raw pi shortcut syntax and falls back to the canonical default when the payload is empty or invalid. Runtime is O(n) in shortcut length. No external state is mutated.
- @param[in] value {unknown} Raw persisted shortcut payload.
- @return {string} Canonical non-empty shortcut string.
- @satisfies REQ-134

### fn `export function normalizePiNotifyCommand(value: unknown, fallback: string): string` (L114-116)
- @brief Normalizes one persisted sound command string.
- @details Accepts any non-empty string so project config can override bundled commands verbatim and falls back to the supplied default when the payload is empty or invalid. Runtime is O(n) in command length. No external state is mutated.
- @param[in] value {unknown} Raw persisted command payload.
- @param[in] fallback {string} Canonical fallback command.
- @return {string} Canonical non-empty command string.
- @satisfies REQ-133

### fn `export function formatPiNotifyBeepStatus(config: PiNotifyConfigFields): string` (L125-137)
- @brief Formats enabled terminal-beep flags for status rendering.
- @details Emits the canonical comma-ordered enabled outcome tokens `end`, `esc`, and `err`, or `none` when all prompt-end beep flags are disabled. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @return {string} Status-bar beep payload.
- @satisfies REQ-135

### fn `export function cyclePiNotifySoundLevel(currentLevel: PiNotifySoundLevel): PiNotifySoundLevel` (L146-152)
- @brief Cycles one sound level through the canonical shortcut order.
- @details Advances persisted sound state in the exact order `none -> low -> mid -> high -> none`, enabling deterministic shortcut toggling and menu reuse. Runtime is O(1). No external state is mutated.
- @param[in] currentLevel {PiNotifySoundLevel} Current persisted sound level.
- @return {PiNotifySoundLevel} Next sound level in the cycle.
- @satisfies REQ-134

### fn `function escapePowerShellLiteral(value: string): string` (L160-162)
- @brief Escapes one string for single-quoted PowerShell embedding.
- @details Doubles embedded apostrophes so the generated Windows toast script preserves literal title and body text. Runtime is O(n) in text length. No external state is mutated.
- @param[in] value {string} Raw literal text.
- @return {string} PowerShell-safe single-quoted literal content.

### fn `function windowsToastScript(title: string, body: string): string` (L171-186)
- @brief Builds the PowerShell script used for Windows toast notifications.
- @details Reuses the pi notify example contract, escapes title and body literals, and emits a one-shot script that shows a toast notification through the Windows Runtime API. Runtime is O(n) in payload length. No external state is mutated.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {string} PowerShell script passed to `powershell.exe`.

### fn `export function notifyOSC777(title: string, body: string): void` (L196-198)
- @brief Emits one OSC 777 terminal notification.
- @details Writes the Ghostty/iTerm2/WezTerm-compatible OSC 777 escape sequence directly to stdout using the supplied title and body payloads. Runtime is O(n) in payload length. Side effect: writes to stdout.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {void} No return value.
- @satisfies REQ-130

### fn `export function notifyOSC99(title: string, body: string): void` (L208-211)
- @brief Emits one Kitty OSC 99 terminal notification.
- @details Writes the two-part Kitty OSC 99 sequence that carries the title and body payloads under one notification identifier. Runtime is O(n) in payload length. Side effect: writes to stdout.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {void} No return value.
- @satisfies REQ-130

### fn `export function notifyOSC9(title: string, body: string): void` (L221-223)
- @brief Emits one OSC 9 terminal notification.
- @details Writes the single-part OSC 9 sequence commonly used by terminals that accept message-only desktop notifications. Runtime is O(n) in payload length. Side effect: writes to stdout.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {void} No return value.
- @satisfies REQ-130

### fn `export function notifyWindows(title: string, body: string): void` (L233-239)
- @brief Emits one Windows toast notification.
- @details Spawns `powershell.exe` without waiting, delegates payload rendering to `windowsToastScript(...)`, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include child-process execution.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {void} No return value.
- @satisfies REQ-130

### fn `export function notifyPiTerminal(title: string, body: string): void` (L249-263)
- @brief Routes one prompt-end terminal notification through the detected terminal protocol.
- @details Prefers Windows toast delivery inside Windows Terminal, Kitty OSC 99 inside Kitty, OSC 9 inside iTerm-like terminals, and OSC 777 as the fallback path. Runtime is O(n) in payload length plus optional process spawn cost. Side effects include stdout writes or child-process execution.
- @param[in] title {string} Notification title.
- @param[in] body {string} Notification body.
- @return {void} No return value.
- @satisfies REQ-130

### fn `function hasAgentEndStopReason(` (L272-282)
- @brief Detects whether one agent-end payload contains the requested stop reason.
- @details Scans assistant messages only so prompt-end classification remains stable even when user or tool-result messages also appear in the payload. Runtime is O(m) in message count. No external state is mutated.
- @param[in] messages {AgentEndEvent["messages"]} Agent-end message list.
- @param[in] stopReason {"aborted" | "error"} Stop reason to detect.
- @return {boolean} `true` when an assistant message carries the requested stop reason.

### fn `export function classifyPiNotifyOutcome(event: Pick<AgentEndEvent, "messages">): PiNotifyOutcome` (L291-299)
- @brief Classifies one agent-end payload into the canonical pi-notify outcome.
- @details Treats assistant `stopReason=error` as `err`, `stopReason=aborted` as `esc`, and every remaining terminal state as successful `end`. Runtime is O(m) in message count. No external state is mutated.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @return {PiNotifyOutcome} Canonical prompt-end outcome.
- @satisfies REQ-129

### fn `function buildPiNotifyTitle(): string` (L306-308)
- @brief Builds the user-visible prompt-end notification title.
- @details Keeps a stable `pi-usereq` title across outcomes so terminal notification stacks remain easy to correlate with this extension. Runtime is O(1). No external state is mutated.
- @return {string} Notification title.

### fn `function buildPiNotifyBody(outcome: PiNotifyOutcome): string` (L316-325)
- @brief Builds the user-visible prompt-end notification body.
- @details Maps each canonical outcome to one deterministic English phrase so downstream tests and users can distinguish success, abort, and error notifications. Runtime is O(1). No external state is mutated.
- @param[in] outcome {PiNotifyOutcome} Canonical prompt-end outcome.
- @return {string} Notification body.

### fn `function quotePiNotifyInstallPath(installationPath: string): string` (L333-338)
- @brief Quotes one installation path for shell substitution.
- @details Emits POSIX single-quoted literals for `sh -lc` execution and CMD double-quoted literals for `cmd.exe /c` execution so `%%INSTALLATION_PATH%%` substitutions preserve whitespace safely. Runtime is O(n) in path length. No external state is mutated.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Shell-quoted installation path fragment.

### fn `export function substitutePiNotifyInstallPath(command: string, installationPath: string): string` (L348-350)
- @brief Substitutes `%%INSTALLATION_PATH%%` inside one sound command.
- @details Replaces every `%%INSTALLATION_PATH%%` token with a shell-quoted runtime installation path so bundled sound assets can be addressed safely from external commands. Runtime is O(n) in command length. No external state is mutated.
- @param[in] command {string} Raw configured sound command.
- @param[in] installationPath {string} Absolute extension installation path.
- @return {string} Runtime-ready command string.
- @satisfies REQ-133

### fn `function resolvePiNotifySoundCommand(` (L359-371)
- @brief Resolves the configured command for one non-`none` sound level.
- @details Selects the matching persisted command string from config without performing runtime substitution or shell execution. Runtime is O(1). No external state is mutated.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Non-disabled sound level.
- @return {string} Configured command string for the requested level.

### fn `export function runPiNotifySoundCommand(` (L381-397)
- @brief Executes the configured successful-run sound command on an external shell.
- @details Resolves the runtime installation path, substitutes `%%INSTALLATION_PATH%%`, spawns the configured shell command without waiting, and ignores transport failures so prompt-end handling remains non-blocking. Runtime is dominated by process spawn. Side effects include detached child-process execution.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] soundLevel {Exclude<PiNotifySoundLevel, "none">} Requested non-disabled sound level.
- @return {void} No return value.
- @satisfies REQ-132, REQ-133

### fn `export function runPiNotifyEffects(` (L407-430)
- @brief Dispatches prompt-end beep and sound effects for one agent-end payload.
- @details Classifies the terminal outcome, emits the configured terminal notification only for the enabled outcome flag, and executes the configured external sound command only for successful completion with a non-disabled sound level. Runtime is O(m + c) in message count plus command length. Side effects include stdout writes and child-process spawning.
- @param[in] config {PiNotifyConfigFields} Effective notification configuration.
- @param[in] event {Pick<AgentEndEvent, "messages">} Agent-end payload subset.
- @return {void} No return value.
- @satisfies REQ-129, REQ-130, REQ-131, REQ-132, REQ-133

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiNotifySoundLevel`|type||22||
|`PiNotifyOutcome`|type||34||
|`PiNotifyConfigFields`|type||68||
|`normalizePiNotifySoundLevel`|fn||87-91|export function normalizePiNotifySoundLevel(value: unknow...|
|`normalizePiNotifyShortcut`|fn||100-104|export function normalizePiNotifyShortcut(value: unknown)...|
|`normalizePiNotifyCommand`|fn||114-116|export function normalizePiNotifyCommand(value: unknown, ...|
|`formatPiNotifyBeepStatus`|fn||125-137|export function formatPiNotifyBeepStatus(config: PiNotify...|
|`cyclePiNotifySoundLevel`|fn||146-152|export function cyclePiNotifySoundLevel(currentLevel: PiN...|
|`escapePowerShellLiteral`|fn||160-162|function escapePowerShellLiteral(value: string): string|
|`windowsToastScript`|fn||171-186|function windowsToastScript(title: string, body: string):...|
|`notifyOSC777`|fn||196-198|export function notifyOSC777(title: string, body: string)...|
|`notifyOSC99`|fn||208-211|export function notifyOSC99(title: string, body: string):...|
|`notifyOSC9`|fn||221-223|export function notifyOSC9(title: string, body: string): ...|
|`notifyWindows`|fn||233-239|export function notifyWindows(title: string, body: string...|
|`notifyPiTerminal`|fn||249-263|export function notifyPiTerminal(title: string, body: str...|
|`hasAgentEndStopReason`|fn||272-282|function hasAgentEndStopReason(|
|`classifyPiNotifyOutcome`|fn||291-299|export function classifyPiNotifyOutcome(event: Pick<Agent...|
|`buildPiNotifyTitle`|fn||306-308|function buildPiNotifyTitle(): string|
|`buildPiNotifyBody`|fn||316-325|function buildPiNotifyBody(outcome: PiNotifyOutcome): string|
|`quotePiNotifyInstallPath`|fn||333-338|function quotePiNotifyInstallPath(installationPath: strin...|
|`substitutePiNotifyInstallPath`|fn||348-350|export function substitutePiNotifyInstallPath(command: st...|
|`resolvePiNotifySoundCommand`|fn||359-371|function resolvePiNotifySoundCommand(|
|`runPiNotifySoundCommand`|fn||381-397|export function runPiNotifySoundCommand(|
|`runPiNotifyEffects`|fn||407-430|export function runPiNotifyEffects(|


---

# pi-usereq-tools.ts | TypeScript | 140L | 5 symbols | 0 imports | 14 comments
> Path: `src/core/pi-usereq-tools.ts`
- @brief Declares the configurable pi-usereq active-tool inventory.
- @details Provides canonical custom-tool names, supported embedded-tool names, default enablement subsets, and normalization helpers shared by configuration loading, extension startup, and test doubles. The module is side-effect free. Lookup and normalization costs are linear in configured tool count.

## Definitions

- type `export type PiUsereqCustomToolName = (typeof PI_USEREQ_CUSTOM_TOOL_NAMES)[number];` (L83)
- @brief Represents one valid extension-owned configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_CUSTOM_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqEmbeddedToolName = (typeof PI_USEREQ_EMBEDDED_TOOL_NAMES)[number];` (L89)
- @brief Represents one valid embedded configurable tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_EMBEDDED_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
- type `export type PiUsereqStartupToolName = (typeof PI_USEREQ_STARTUP_TOOL_NAMES)[number];` (L95)
- @brief Represents one valid configurable active-tool identifier.
- @details Narrows arbitrary strings to the literal union derived from `PI_USEREQ_STARTUP_TOOL_NAMES`. The alias is compile-time only and introduces no runtime cost.
### fn `export function isPiUsereqEmbeddedToolName(name: string): name is PiUsereqEmbeddedToolName` (L121-123)
- @brief Tests whether one tool name belongs to the supported embedded-tool subset.
- @details Performs one set-membership probe against `PI_USEREQ_EMBEDDED_TOOL_SET`. Runtime is O(1). No external state is mutated.
- @param[in] name {string} Candidate tool name.
- @return {boolean} `true` when the name belongs to the embedded configurable-tool subset.

### fn `export function normalizeEnabledPiUsereqTools(value: unknown): PiUsereqStartupToolName[]` (L133-140)
- @brief Normalizes a user-configured active-tool list.
- @details Returns the default enabled-tool tuple when the input is not an array. Otherwise filters to string entries, removes names outside the configurable tool set, and deduplicates while preserving first-seen order. Time complexity is O(n). No external state is mutated.
- @param[in] value {unknown} Raw configuration payload for `enabled-tools`.
- @return {PiUsereqStartupToolName[]} Deduplicated canonical tool names.
- @satisfies REQ-064
- @post Returned values are members of `PI_USEREQ_STARTUP_TOOL_NAMES` only.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqCustomToolName`|type||83||
|`PiUsereqEmbeddedToolName`|type||89||
|`PiUsereqStartupToolName`|type||95||
|`isPiUsereqEmbeddedToolName`|fn||121-123|export function isPiUsereqEmbeddedToolName(name: string):...|
|`normalizeEnabledPiUsereqTools`|fn||133-140|export function normalizeEnabledPiUsereqTools(value: unkn...|


---

# prompts.ts | TypeScript | 184L | 5 symbols | 4 imports | 11 comments
> Path: `src/core/prompts.ts`
- @brief Renders bundled pi-usereq prompts for the current project context.
- @details Applies placeholder substitution, legacy tool-name rewrites, and conditional pi.dev conformance guidance before prompt text is sent to the agent. Runtime is linear in prompt size plus replacement count. Side effects are limited to filesystem reads used for manifest checks and bundled prompt loading.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { buildPromptReplacementPaths, type UseReqConfig } from "./config.js";
import { readBundledPrompt } from "./resources.js";
```

## Definitions

### fn `function buildPiDevConformanceBlock(promptName: string, projectBase: string): string` (L96-105)
- @brief Builds the conditional pi.dev conformance block for one rendered prompt.
- @details Emits the manifest-driven rules only when the selected bundled prompt can analyze or mutate source code and the project root contains the pi.dev manifest. Time complexity O(1). No filesystem writes.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Markdown bullet block or the empty string when injection is not applicable.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108

### fn `function injectPiDevConformanceBlock(text: string, promptName: string, projectBase: string): string` (L116-123)
- @brief Injects the pi.dev conformance block into the prompt behavior section.
- @details Inserts the block immediately after the `## Behavior` heading so downstream agents evaluate the rule before workflow steps. Leaves prompts unchanged when no behavior section exists or the block is already present. Time complexity O(n).
- @param[in] text {string} Prompt markdown after placeholder replacement.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] projectBase {string} Absolute project root used for manifest existence checks.
- @return {string} Prompt markdown with zero or one injected conformance block.
- @satisfies REQ-032, REQ-033, REQ-034, REQ-108

### fn `export function adaptPromptForInternalTools(text: string): string` (L132-138)
- @brief Rewrites bundled prompt tool references from legacy `req --...` syntax to internal tool names.
- @details Applies deterministic global regex replacements so prompt text matches the extension-registered tool surface instead of the standalone CLI spelling. Time complexity O(p*r) where p is pattern count and r is prompt length.
- @param[in] text {string} Prompt markdown before tool-reference normalization.
- @return {string} Prompt markdown with internal tool names.
- @satisfies REQ-003

### fn `export function applyReplacements(text: string, replacements: Record<string, string>): string` (L148-154)
- @brief Applies literal placeholder replacements to bundled prompt markdown.
- @details Replaces every placeholder token using split/join semantics so all occurrences are updated without regex escaping. Time complexity O(t*n) where t is replacement count and n is prompt length.
- @param[in] text {string} Prompt markdown containing placeholder tokens.
- @param[in] replacements {Record<string, string>} Token-to-value map.
- @return {string} Prompt markdown with all placeholder tokens expanded.
- @satisfies REQ-002

### fn `export function renderPrompt(` (L166-184)
- @brief Renders a bundled prompt for the current project context.
- @details Loads the bundled markdown template, expands configuration-derived placeholders, injects conditional pi.dev conformance guidance, and rewrites legacy tool references to internal names. Time complexity O(n) relative to prompt size. No tracked files are modified.
- @param[in] promptName {string} Bundled prompt identifier.
- @param[in] args {string} Raw user-supplied prompt arguments.
- @param[in] projectBase {string} Absolute project root used for placeholder and manifest resolution.
- @param[in] config {UseReqConfig} Effective project configuration used for path substitutions.
- @return {string} Fully rendered prompt markdown ready for `pi.sendUserMessage(...)`.
- @satisfies REQ-002, REQ-003, REQ-032, REQ-033, REQ-034, REQ-108

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`buildPiDevConformanceBlock`|fn||96-105|function buildPiDevConformanceBlock(promptName: string, p...|
|`injectPiDevConformanceBlock`|fn||116-123|function injectPiDevConformanceBlock(text: string, prompt...|
|`adaptPromptForInternalTools`|fn||132-138|export function adaptPromptForInternalTools(text: string)...|
|`applyReplacements`|fn||148-154|export function applyReplacements(text: string, replaceme...|
|`renderPrompt`|fn||166-184|export function renderPrompt(|


---

# reference-payload.ts | TypeScript | 818L | 28 symbols | 5 imports | 27 comments
> Path: `src/core/reference-payload.ts`
- @brief Builds agent-oriented JSON payloads for `files-references` and `references`.
- @details Converts analyzed source files into deterministic JSON sections ordered for LLM traversal, including repository structure, per-file metrics, imports, symbols, structured Doxygen fields, and structured comment evidence. Runtime is O(F log F + S) where F is file count and S is total source size. Side effects are limited to filesystem reads and optional stderr logging.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import {
import { detectLanguage } from "./compress.js";
import {
```

## Definitions

- type `export type ReferenceToolScope = "explicit-files" | "configured-source-directories";` (L27)
- @brief Enumerates supported references-payload scopes.
- @details Distinguishes explicit-file requests from configured project scans while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type ReferenceFileStatus = "analyzed" | "error" | "skipped";` (L33)
- @brief Enumerates supported per-file references entry statuses.
- @details Separates analyzed files, analysis failures, and skipped inputs so downstream agents can branch without reparsing stderr text. The alias is compile-time only and introduces no runtime cost.
### iface `export interface ReferenceLineRange` (L39-43)
- @brief Describes one numeric source line range.
- @details Exposes start and end line numbers plus the same inclusive range as a numeric tuple for direct agent access. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceImportEntry extends ReferenceLineRange` : ReferenceLineRange (L49-52)
- @brief Describes one structured import record.
- @details Stores the normalized import identity, raw import statement, and declaration line range without requiring agents to parse markdown blocks. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceCommentEntry extends ReferenceLineRange` : ReferenceLineRange (L58-61)
- @brief Describes one structured standalone or attached comment record.
- @details Preserves normalized comment text plus per-line comment fragments so agents can consume comment evidence without reparsing source delimiters. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceExitPointEntry` (L67-70)
- @brief Describes one structured exit-point annotation.
- @details Preserves the normalized exit expression text together with its source line number for downstream reasoning about control flow hints. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceSymbolEntry extends ReferenceLineRange` : ReferenceLineRange (L76-96)
- @brief Describes one structured symbol record.
- @details Orders direct-access identity fields before hierarchy, locations, Doxygen metadata, and comment evidence so agents can branch without reparsing monolithic summaries. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolFileEntry extends ReferenceLineRange` : ReferenceLineRange (L102-125)
- @brief Describes one per-file references payload entry.
- @details Stores canonical path identity, filesystem status, line metrics, structured imports, structured symbols, structured comment evidence, and optional file-level Doxygen metadata. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRequestSection` (L131-140)
- @brief Describes the request section of the references payload.
- @details Captures tool identity, scope, base directory, requested path inventory, and configured source-directory scope so agents can reason about how the file set was selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolSummarySection` (L146-157)
- @brief Describes the summary section of the references payload.
- @details Exposes aggregate file, symbol, import, comment, and Doxygen counts as numeric fields plus deterministic symbol-kind totals. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceRepositoryTreeNode` (L163-169)
- @brief Describes one repository tree node in the references payload.
- @details Encodes directory and file hierarchy without ASCII-art decoration so agents can traverse repository structure as structured JSON. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolRepositorySection` (L175-181)
- @brief Describes the repository section of the references payload.
- @details Stores the base path, configured source-directory scope, canonical file list, and structured directory tree used during analysis. The interface is compile-time only and introduces no runtime cost.

### iface `export interface ReferenceToolPayload` (L187-192)
- @brief Describes the full agent-oriented references payload.
- @details Orders the top-level sections as request, summary, repository, and files for deterministic downstream traversal. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildReferenceToolPayloadOptions` (L198-205)
- @brief Describes the options required to build one references payload.
- @details Supplies tool identity, scope, base directory, requested paths, and optional configured source directories while keeping payload construction deterministic. The interface is compile-time only and introduces no runtime cost.

### fn `function canonicalizeReferencePath(targetPath: string, baseDir: string): string` (L214-222)
- @brief Canonicalizes one filesystem path relative to the payload base directory.
- @details Emits a slash-normalized relative path when the target is under the base directory; otherwise emits the normalized absolute path. Runtime is O(p) in path length. No side effects occur.
- @param[in] targetPath {string} Absolute or relative filesystem path.
- @param[in] baseDir {string} Base directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function buildLineRange(startLineNumber: number, endLineNumber: number): ReferenceLineRange` (L231-237)
- @brief Builds one structured line-range record.
- @details Duplicates the inclusive range as start, end, and tuple fields so callers can address whichever shape is most convenient. Runtime is O(1). No side effects occur.
- @param[in] startLineNumber {number} Inclusive start line number.
- @param[in] endLineNumber {number} Inclusive end line number.
- @return {ReferenceLineRange} Structured line-range record.

### fn `function extractCommentText(commentElement: SourceElement, maxLength = 0): string` (L246-266)
- @brief Extracts normalized plain text from one comment element.
- @details Removes language comment markers, drops delimiter-only lines, joins content with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @param[in] maxLength {number} Optional maximum output length; `0` disables truncation.
- @return {string} Cleaned comment text.

### fn `function extractCommentLines(commentElement: SourceElement): string[]` (L274-288)
- @brief Extracts cleaned individual lines from one comment element.
- @details Removes language comment markers while preserving line granularity for structured comment payloads. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @return {string[]} Cleaned comment lines.

### fn `function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string]` (L296-346)
- @brief Associates nearby comment blocks with definitions and standalone comment groups.
- @details Reuses the repository comment-attachment heuristic that binds comments within three lines of a definition while preserving early file-description text. Runtime is O(n log n). No side effects occur.
- @param[in] elements {SourceElement[]} Analyzed source elements.
- @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and compact file description.

### fn `function resolveSymbolName(element: SourceElement): string` (L354-356)
- @brief Resolves one stable symbol name from an analyzed element.
- @details Prefers explicit analyzer name metadata, then falls back to the derived signature or the first source line so every symbol retains a direct-access identifier. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Stable symbol name.

### fn `function resolveParentElement(definitions: SourceElement[], child: SourceElement): SourceElement | undefined` (L365-374)
- @brief Resolves the direct parent element for one child symbol.
- @details Matches by parent name plus inclusive line containment and chooses the deepest enclosing definition. Runtime is O(n) in definition count. No side effects occur.
- @param[in] definitions {SourceElement[]} Sorted definition elements.
- @param[in] child {SourceElement} Candidate child symbol.
- @return {SourceElement | undefined} Matched parent definition when available.

### fn `function buildCommentEntry(commentElement: SourceElement): ReferenceCommentEntry` (L382-389)
- @brief Builds one structured comment record from a comment element.
- @details Preserves numeric line-range metadata plus normalized text and per-line fragments. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Source comment element.
- @return {ReferenceCommentEntry} Structured comment record.

### fn `function buildRepositoryTree(canonicalPaths: string[]): ReferenceRepositoryTreeNode` (L397-456)
- @brief Builds one structured repository tree from canonical file paths.
- @details Materializes a nested directory map and converts it into recursively ordered JSON nodes without decorative ASCII formatting. Runtime is O(n log n) in path count. No side effects occur.
- @param[in] canonicalPaths {string[]} Canonical file paths.
- @return {ReferenceRepositoryTreeNode} Structured repository tree rooted at `.`.

### fn `const ensureDirectory = (parent: ReferenceRepositoryTreeNode, nodeName: string, relativePath: string): ReferenceRepositoryTreeNode =>` (L406-420)

### fn `const finalizeNode = (node: ReferenceRepositoryTreeNode): ReferenceRepositoryTreeNode =>` (L442-453)

### fn `function analyzeReferenceFile(` (L469-662)
- @brief Builds one analyzed file entry for the references payload.
- @details Parses the file with `SourceAnalyzer`, extracts structured imports and symbols, attaches structured Doxygen fields, and preserves standalone comment evidence. Runtime is O(S log S) in file size and symbol count. Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] analyzer {SourceAnalyzer} Shared source analyzer instance.
- @param[in] inputPath {string} Caller-provided input path.
- @param[in] absolutePath {string} Absolute file path.
- @param[in] requestIndex {number} Zero-based request index.
- @param[in] baseDir {string} Base directory used for canonical paths.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ReferenceToolFileEntry} Structured file entry.

### fn `export function buildReferenceToolPayload(options: BuildReferenceToolPayloadOptions): ReferenceToolPayload` (L671-796)
- @brief Builds the full agent-oriented references payload.
- @details Validates requested paths against the filesystem, analyzes processable files in caller order, preserves skipped and failed inputs in structured file entries, computes aggregate numeric totals, and emits a structured repository tree. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] options {BuildReferenceToolPayloadOptions} Payload-construction options.
- @return {ReferenceToolPayload} Structured references payload ordered as request, summary, repository, and files.
- @satisfies REQ-011, REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function buildReferenceToolExecutionStderr(payload: ReferenceToolPayload): string` (L804-818)
- @brief Builds deterministic stderr diagnostics from a references payload.
- @details Serializes skipped-input and analysis-error entries into stable newline-delimited diagnostics while leaving fully analyzed payloads silent. Runtime is O(n) in file-entry count. No side effects occur.
- @param[in] payload {ReferenceToolPayload} Structured references payload.
- @return {string} Newline-delimited diagnostics.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ReferenceToolScope`|type||27||
|`ReferenceFileStatus`|type||33||
|`ReferenceLineRange`|iface||39-43|export interface ReferenceLineRange|
|`ReferenceImportEntry`|iface||49-52|export interface ReferenceImportEntry extends ReferenceLi...|
|`ReferenceCommentEntry`|iface||58-61|export interface ReferenceCommentEntry extends ReferenceL...|
|`ReferenceExitPointEntry`|iface||67-70|export interface ReferenceExitPointEntry|
|`ReferenceSymbolEntry`|iface||76-96|export interface ReferenceSymbolEntry extends ReferenceLi...|
|`ReferenceToolFileEntry`|iface||102-125|export interface ReferenceToolFileEntry extends Reference...|
|`ReferenceToolRequestSection`|iface||131-140|export interface ReferenceToolRequestSection|
|`ReferenceToolSummarySection`|iface||146-157|export interface ReferenceToolSummarySection|
|`ReferenceRepositoryTreeNode`|iface||163-169|export interface ReferenceRepositoryTreeNode|
|`ReferenceToolRepositorySection`|iface||175-181|export interface ReferenceToolRepositorySection|
|`ReferenceToolPayload`|iface||187-192|export interface ReferenceToolPayload|
|`BuildReferenceToolPayloadOptions`|iface||198-205|export interface BuildReferenceToolPayloadOptions|
|`canonicalizeReferencePath`|fn||214-222|function canonicalizeReferencePath(targetPath: string, ba...|
|`buildLineRange`|fn||231-237|function buildLineRange(startLineNumber: number, endLineN...|
|`extractCommentText`|fn||246-266|function extractCommentText(commentElement: SourceElement...|
|`extractCommentLines`|fn||274-288|function extractCommentLines(commentElement: SourceElemen...|
|`buildCommentMaps`|fn||296-346|function buildCommentMaps(elements: SourceElement[]): [Re...|
|`resolveSymbolName`|fn||354-356|function resolveSymbolName(element: SourceElement): string|
|`resolveParentElement`|fn||365-374|function resolveParentElement(definitions: SourceElement[...|
|`buildCommentEntry`|fn||382-389|function buildCommentEntry(commentElement: SourceElement)...|
|`buildRepositoryTree`|fn||397-456|function buildRepositoryTree(canonicalPaths: string[]): R...|
|`ensureDirectory`|fn||406-420|const ensureDirectory = (parent: ReferenceRepositoryTreeN...|
|`finalizeNode`|fn||442-453|const finalizeNode = (node: ReferenceRepositoryTreeNode):...|
|`analyzeReferenceFile`|fn||469-662|function analyzeReferenceFile(|
|`buildReferenceToolPayload`|fn||671-796|export function buildReferenceToolPayload(options: BuildR...|
|`buildReferenceToolExecutionStderr`|fn||804-818|export function buildReferenceToolExecutionStderr(payload...|


---

# resources.ts | TypeScript | 63L | 4 symbols | 3 imports | 5 comments
> Path: `src/core/resources.ts`
- @brief Resolves installation-owned bundled resource locations.
- @details Encapsulates installation-path discovery, bundled-resource validation, prompt enumeration, and prompt loading directly from the installed extension payload. Runtime is proportional to directory-entry enumeration and prompt file size. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getInstallationPath, RESOURCE_ROOT_DIRNAME } from "./path-context.js";
```

## Definitions

### fn `export function getBundledResourceRoot(): string` (L16-18)
- @brief Resolves the bundled resource directory inside the installed extension payload.
- @details Joins the installation path with `resources`, producing the immutable source tree used for prompt, template, and guideline access during runtime. Time complexity is O(1). No I/O side effects occur.
- @return {string} Absolute bundled resource root path.

### fn `export function ensureBundledResourcesAccessible(): string` (L26-38)
- @brief Validates that installed bundled resources are accessible.
- @details Verifies that the installation-owned resource root plus `prompts`, `templates`, and `guidelines` directories exist before prompt or tool execution. Runtime is O(1) plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
- @return {string} Absolute bundled resource root path.
- @throws {Error} Propagates a deterministic error when required installed resource directories are missing.

### fn `export function readBundledPrompt(promptName: string): string` (L47-50)
- @brief Reads one bundled markdown prompt by logical prompt name.
- @details Resolves the prompt file under the installation-owned `resources/prompts` directory, validates resource accessibility, and loads it as UTF-8 text. Time complexity is O(n) in file size. Side effects are limited to filesystem reads.
- @param[in] promptName {string} Prompt identifier without the `.md` suffix.
- @return {string} Raw prompt markdown content.
- @throws {Error} Propagates `fs.readFileSync` errors when the prompt file is missing or unreadable.

### fn `export function listBundledPromptNames(): string[]` (L57-63)
- @brief Lists bundled prompt identifiers available in the installed extension payload.
- @details Scans the installation-owned prompt directory, keeps visible markdown files only, strips the `.md` suffix, and returns a lexicographically sorted list. Time complexity is O(n log n). Side effects are limited to filesystem reads.
- @return {string[]} Sorted prompt names without file extensions.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`getBundledResourceRoot`|fn||16-18|export function getBundledResourceRoot(): string|
|`ensureBundledResourcesAccessible`|fn||26-38|export function ensureBundledResourcesAccessible(): string|
|`readBundledPrompt`|fn||47-50|export function readBundledPrompt(promptName: string): st...|
|`listBundledPromptNames`|fn||57-63|export function listBundledPromptNames(): string[]|


---

# runtime-project-paths.ts | TypeScript | 99L | 6 symbols | 4 imports | 7 comments
> Path: `src/core/runtime-project-paths.ts`
- @brief Derives runtime-only repository and base-path facts.
- @details Centralizes git-repository probing, repository-root resolution, and base-path-to-git-path formatting for extension status, tool execution, and CLI flows. Runtime is dominated by git subprocess execution plus path normalization. Side effects are limited to subprocess spawning.

## Imports
```
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { isSameOrAncestorPath, normalizePathSlashes } from "./path-context.js";
```

## Definitions

### fn `function runGitCapture(command: string[], cwd?: string): ReturnType<typeof spawnSync>` (L19-24)
- @brief Executes one git subprocess and captures UTF-8 output.
- @details Delegates to `spawnSync`, keeps execution synchronous for deterministic command flows, and supports an optional working directory. Runtime is dominated by the spawned git process. Side effects include subprocess creation.
- @param[in] command {string[]} Git executable plus argument vector.
- @param[in] cwd {string | undefined} Optional working directory.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `export function isInsideGitRepo(targetPath: string): boolean` (L33-36)
- @brief Tests whether one path is inside a git work tree.
- @details Executes `git rev-parse --is-inside-work-tree` in the supplied directory and returns `true` only for a successful literal `true` response. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] targetPath {string} Directory to probe.
- @return {boolean} `true` when the directory belongs to a git work tree.
- @satisfies REQ-145

### fn `export function resolveGitRoot(targetPath: string): string` (L46-52)
- @brief Resolves the repository root for one path inside a git work tree.
- @details Executes `git rev-parse --show-toplevel`, normalizes the result to an absolute path, and rejects non-repository paths with `ReqError`. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] targetPath {string} Directory inside the target repository.
- @return {string} Absolute repository-root path.
- @throws {ReqError} Throws when the path is not inside a git repository.
- @satisfies REQ-145

### fn `export function resolveRuntimeGitPath(executionPath: string): string | undefined` (L61-68)
- @brief Resolves the runtime git root for one execution path.
- @details Returns `undefined` when the path is outside a git repository. Otherwise resolves the repository root and rejects roots that are not identical to or ancestors of the execution path. Runtime is dominated by git execution. Side effects include subprocess creation.
- @param[in] executionPath {string} Runtime execution path.
- @return {string | undefined} Absolute repository-root path or `undefined` when unavailable.
- @satisfies REQ-105, REQ-145

### fn `export function formatBasePathRelativeToGitPath(basePath: string, gitPath: string | undefined): string` (L78-88)
- @brief Formats the runtime `base-path` relative to the runtime `git-path`.
- @details Returns `.` when the repository root is unavailable or identical to the base path. Otherwise returns the slash-normalized relative path from `git-path` to `base-path`. Runtime is O(p) in path length. No external state is mutated.
- @param[in] basePath {string} Runtime base path.
- @param[in] gitPath {string | undefined} Runtime repository root.
- @return {string} Relative base-path token for status rendering.
- @satisfies REQ-148

### fn `export function formatAbsoluteGitPath(gitPath: string | undefined): string` (L97-99)
- @brief Formats the runtime git path for status rendering.
- @details Returns a slash-normalized absolute path or an empty string when no repository root is available. Runtime is O(p) in path length. No external state is mutated.
- @param[in] gitPath {string | undefined} Runtime repository root.
- @return {string} Absolute repository path or an empty string.
- @satisfies REQ-147

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`runGitCapture`|fn||19-24|function runGitCapture(command: string[], cwd?: string): ...|
|`isInsideGitRepo`|fn||33-36|export function isInsideGitRepo(targetPath: string): boolean|
|`resolveGitRoot`|fn||46-52|export function resolveGitRoot(targetPath: string): string|
|`resolveRuntimeGitPath`|fn||61-68|export function resolveRuntimeGitPath(executionPath: stri...|
|`formatBasePathRelativeToGitPath`|fn||78-88|export function formatBasePathRelativeToGitPath(basePath:...|
|`formatAbsoluteGitPath`|fn||97-99|export function formatAbsoluteGitPath(gitPath: string | u...|


---

# settings-menu.ts | TypeScript | 233L | 11 symbols | 2 imports | 12 comments
> Path: `src/core/settings-menu.ts`
- @brief Renders pi-usereq configuration menus with the shared pi.dev settings style.
- @details Wraps `SettingsList` in one extension-command helper that exposes right-aligned current values, built-in circular scrolling, bottom-line descriptions, and a deterministic bridge for offline test harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.

## Imports
```
import { getSettingsListTheme, type ThemeColor, type ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Container, SettingsList, Text, type Component, type SettingItem, type SettingsListTheme } from "@mariozechner/pi-tui";
```

## Definitions

### iface `export interface PiUsereqSettingsMenuChoice` (L14-19)
- @brief Describes one selectable pi-usereq settings-menu choice.
- @details Stores the stable action identifier, left-column label, right-column current value, and bottom-line description consumed by the shared settings-menu renderer. The interface is compile-time only and introduces no runtime cost.

### iface `export interface PiUsereqSettingsMenuBridge` (L25-30)
- @brief Describes the offline bridge exposed by shared settings-menu components.
- @details Lets deterministic harnesses and unit tests drive the same settings-menu choices by label without simulating raw terminal key streams. The interface is runtime-facing but carries no side effects by itself.

### iface `export interface PiUsereqSettingsMenuComponent extends Component` : Component (L36-38)
- @brief Represents a custom menu component augmented with the offline bridge.
- @details Extends the generic TUI `Component` contract with one optional bridge field consumed only by deterministic test and debug harness adapters. The interface is compile-time only and introduces no runtime cost.

- type `type PiUsereqSettingsThemeColor = Extract<ThemeColor, "accent" | "muted" | "dim">;` (L46)
- @brief Enumerates the CLI-supported theme tokens consumed by settings menus.
- @details Narrows callback-local theme calls to the documented settings-list
semantics used by the pi CLI. Compile-time only and introduces no runtime
cost.
### iface `interface PiUsereqSettingsTheme` (L55-58)
- @brief Describes the callback-local theme surface required by settings menus.
- @details Captures the subset of the custom-UI theme API needed to rebuild
title and fallback settings-list styling when the shared global theme is not
available in tests or offline replay. Compile-time only and introduces no
runtime cost.

### fn `function buildFallbackPiUsereqSettingsListTheme(` (L70-82)
- @brief Builds the fallback settings-list theme matching CLI settings semantics.
- @details Mirrors the shared CLI settings theme token mapping for labels,
values, descriptions, cursor, and hints while avoiding the global theme
singleton used by the live pi runtime. Runtime is O(1). No external state is
mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Fallback settings-list theme.
- @satisfies REQ-151, REQ-156

### fn `function buildPiUsereqSettingsListTheme(` (L95-109)
- @brief Resolves the settings-list theme used by pi-usereq configuration menus.
- @details Prefers the shared CLI `getSettingsListTheme()` API so extension
menus inherit active-theme behavior from pi itself, then falls back to an
equivalent callback-local mapping when the shared theme singleton is
unavailable in deterministic tests or offline replay. Runtime is O(1). No
external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @return {SettingsListTheme} Settings-list theme used by pi-usereq menus.
- @satisfies REQ-151, REQ-156

### fn `function formatPiUsereqSettingsMenuTitle(` (L121-126)
- @brief Formats the settings-menu title with active-theme semantics.
- @details Applies the callback-local `accent` token and bold styling on every
rebuild so custom-menu titles stay synchronized with live theme changes.
Runtime is O(n) in title length. No external state is mutated.
- @param[in] theme {PiUsereqSettingsTheme} Callback-local pi theme adapter.
- @param[in] title {string} Menu title.
- @return {string} Styled title text.
- @satisfies REQ-151, REQ-156

### fn `function createImmediateSelectionComponent(choiceId: string, done: (value?: string) => void): Component` (L135-147)
- @brief Closes a settings menu immediately with one selected action identifier.
- @details Provides the submenu callback used by `SettingsList` so pressing Enter on any menu row resolves the outer custom UI promise with the row identifier. Runtime is O(1). Side effects are limited to one custom-UI completion callback.
- @param[in] choiceId {string} Stable choice identifier to emit.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {Component} Immediate-completion submenu component.

### fn `function buildSettingItems(` (L156-167)
- @brief Builds `SettingsList` items from one menu-choice vector.
- @details Copies labels, current values, and descriptions into `SettingItem` records and attaches a submenu that resolves the outer custom UI with the selected choice identifier. Runtime is O(n) in choice count. No external state is mutated.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @param[in] done {(value?: string) => void} Outer custom-UI completion callback.
- @return {SettingItem[]} `SettingsList` item vector.

### fn `export async function showPiUsereqSettingsMenu(` (L178-233)
- @brief Renders one shared pi-usereq settings menu and resolves the selected action.
- @details Uses `ctx.ui.custom(...)` plus `SettingsList` so every configuration menu shares pi.dev styling, right-aligned current values, circular scrolling, and bottom-line descriptions. The returned custom component also exposes an offline bridge for deterministic tests and debug harnesses. Runtime is O(n) in visible choice count plus user interaction cost. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] title {string} Menu title displayed in the heading and offline bridge.
- @param[in] choices {PiUsereqSettingsMenuChoice[]} Ordered menu-choice vector.
- @return {Promise<string | undefined>} Selected choice identifier or `undefined` when cancelled.
- @satisfies REQ-151, REQ-152, REQ-153, REQ-154, REQ-156

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiUsereqSettingsMenuChoice`|iface||14-19|export interface PiUsereqSettingsMenuChoice|
|`PiUsereqSettingsMenuBridge`|iface||25-30|export interface PiUsereqSettingsMenuBridge|
|`PiUsereqSettingsMenuComponent`|iface||36-38|export interface PiUsereqSettingsMenuComponent extends Co...|
|`PiUsereqSettingsThemeColor`|type||46||
|`PiUsereqSettingsTheme`|iface||55-58|interface PiUsereqSettingsTheme|
|`buildFallbackPiUsereqSettingsListTheme`|fn||70-82|function buildFallbackPiUsereqSettingsListTheme(|
|`buildPiUsereqSettingsListTheme`|fn||95-109|function buildPiUsereqSettingsListTheme(|
|`formatPiUsereqSettingsMenuTitle`|fn||121-126|function formatPiUsereqSettingsMenuTitle(|
|`createImmediateSelectionComponent`|fn||135-147|function createImmediateSelectionComponent(choiceId: stri...|
|`buildSettingItems`|fn||156-167|function buildSettingItems(|
|`showPiUsereqSettingsMenu`|fn||178-233|export async function showPiUsereqSettingsMenu(|


---

# source-analyzer.ts | TypeScript | 1721L | 18 symbols | 4 imports | 38 comments
> Path: `src/core/source-analyzer.ts`
- @brief Analyzes source files into language-agnostic structural elements and markdown references.
- @details Defines the language-spec registry, source-element model, structural analyzer, Doxygen association logic, and markdown rendering helpers used by compression, reference generation, and construct search tools. Runtime is generally linear in source size plus language-pattern count. Side effects are limited to filesystem reads.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { formatDoxygenFieldsAsMarkdown, parseDoxygenComment } from "./doxygen-parser.js";
```

## Definitions

### enum `export enum ElementType` (L16-42)
- @brief Enumerates the normalized source-element kinds emitted by the analyzer.
- @details The enum lets language-specific regex matches collapse into a shared symbol taxonomy for downstream markdown generation and construct filtering. Access complexity is O(1).

### class `export class SourceElement` (L48-95)
- @brief Represents one analyzed source element or comment block.
- @details Stores location metadata, extracted source text, normalized naming/signature data, hierarchy information, attached Doxygen fields, and body annotations used by downstream renderers. Instance initialization is O(1) aside from object assignment.

### iface `export interface LanguageSpec` (L101-108)
- @brief Describes language-specific parsing behavior for the source analyzer.
- @details Each spec defines comment syntax, string delimiters, and ordered regex patterns mapping source lines to `ElementType` values. The interface is compile-time only and introduces no runtime cost.

### fn `function re(pattern: string): RegExp` (L116-118)
- @brief Creates a regular expression from a raw pattern string.
- @details Wraps `new RegExp(...)` to keep the language-spec table compact and visually uniform. Runtime is O(1) relative to call-site complexity. No side effects occur.
- @param[in] pattern {string} Raw regular-expression pattern.
- @return {RegExp} Constructed regular expression.

### fn `export function buildLanguageSpecs(): Record<string, LanguageSpec>` (L125-424)
- @brief Builds the analyzer language-spec registry.
- @details Materializes comment syntax, string delimiters, and ordered construct-detection regexes for all supported languages and aliases. Runtime is O(l) in the number of language definitions. No side effects occur.
- @return {Record<string, LanguageSpec>} Language-spec map keyed by canonical names and aliases.

### class `export class SourceAnalyzer` (L491-790)
- @brief Performs language-aware structural analysis and metadata enrichment on source files.
- @brief Matches explicit early-exit statements inside analyzed bodies.
- @details Parses files into `SourceElement` records, derives signatures, hierarchy, visibility, inheritance, body annotations, and Doxygen fields, then exposes the enriched element list to higher-level renderers. Runtime is generally O(n * p) where n is line count and p is pattern count for the selected language. Side effects are limited to filesystem reads.
- @details The regex captures return-like constructs that downstream markdown renderers should surface as exit annotations. Evaluation cost is linear in line length.

### fn `const isFileLevelComment = (comment: SourceElement): boolean =>` (L983-986)
- @brief Associates parsed Doxygen comments with analyzed elements.
- @details Searches inline postfix comments, nearby preceding comments, and selected following postfix comments while excluding file-level comments, then stores the parsed Doxygen field map on each element. Runtime is O(n^2) in the worst case due to proximity scans across comments and elements. Side effect: mutates `element.doxygenFields`.
- @param[in,out] elements {SourceElement[]} Elements to enrich.
- @return {void} No return value.

### fn `const hasBlockingElement = (comment: SourceElement): boolean =>` (L1007-1027)

### fn `function mdLoc(element: SourceElement): string` (L1260-1262)
- @brief Formats one element location for markdown output.
- @details Returns either a single-line `Lx` token or an inclusive line-range token `Lx-y`. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Markdown location token.

### fn `function mdKind(element: SourceElement): string` (L1270-1299)
- @brief Maps an element type to its compact markdown kind code.
- @details Converts `ElementType` values into the abbreviated tokens used by reference markdown and symbol indexes. Runtime is O(1). No side effects occur.
- @param[in] element {SourceElement} Source element.
- @return {string} Compact kind code.

### fn `function extractCommentText(commentElement: SourceElement, maxLength = 0): string` (L1308-1329)
- @brief Extracts normalized plain text from a comment element.
- @details Removes comment markers, drops language-specific block delimiters, joins lines with spaces, and optionally truncates the result. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @param[in] maxLength {number} Optional maximum output length, where `0` disables truncation.
- @return {string} Cleaned comment text.

### fn `function extractCommentLines(commentElement: SourceElement): string[]` (L1337-1352)
- @brief Extracts cleaned individual lines from a comment element.
- @details Removes comment markers and delimiter-only lines while preserving line granularity for markdown rendering. Runtime is O(n) in comment length. No side effects occur.
- @param[in] commentElement {SourceElement} Comment element.
- @return {string[]} Cleaned comment lines.

### fn `function buildCommentMaps(elements: SourceElement[]): [Record<number, SourceElement[]>, SourceElement[], string]` (L1360-1400)
- @brief Builds lookup structures linking comments to definitions and file descriptions.
- @details Sorts elements, associates nearby non-inline comments with following definitions, collects standalone comments, and derives a compact file description from early comment text. Runtime is O(n log n). No side effects occur.
- @param[in] elements {SourceElement[]} Analyzed source elements.
- @return {[Record<number, SourceElement[]>, SourceElement[], string]} Attached-comment map, standalone comments, and file description.

### fn `function mergeDoxygenFields(baseFields: Record<string, string[]>, extraFields: Record<string, string[]>): Record<string, string[]>` (L1409-1415)
- @brief Merges Doxygen field values into one accumulator map.
- @details Appends values for matching tags without deduplication so relative source order is preserved. Runtime is O(v) in appended value count. Side effect: mutates `baseFields`.
- @param[in] extraFields {Record<string, string[]>} Source field map.
- @param[in,out] baseFields {Record<string, string[]>} Mutable destination field map.
- @return {Record<string, string[]>} The mutated destination map.

### fn `export function collectElementDoxygenFields(element: SourceElement): Record<string, string[]>` (L1423-1437)
- @brief Aggregates all Doxygen fields associated with one element.
- @details Starts with directly attached fields and then merges early body comments from the first three body lines when they parse as Doxygen. Runtime is O(c) in considered comment count. No external state is mutated.
- @param[in] element {SourceElement} Source element.
- @return {Record<string, string[]>} Aggregated Doxygen field map.

### fn `export function collectFileLevelDoxygenFields(elements: SourceElement[]): Record<string, string[]>` (L1445-1456)

### fn `export function formatMarkdown(` (L1469-1721)
- @brief Renders analyzed source elements as the repository reference-markdown format.
- @details Builds file metadata, imports, top-level definitions, child elements, comments, and a symbol index while incorporating Doxygen fields and optional legacy annotations. Runtime is O(n log n) in element count. No side effects occur.
- @param[in] elements {SourceElement[]} Enriched source elements.
- @param[in] filePath {string} Display file path.
- @param[in] language {string} Canonical analyzer language identifier.
- @param[in] specName {string} Human-readable language name.
- @param[in] totalLines {number} Total source-line count.
- @param[in] includeLegacyAnnotations {boolean} When `true`, include non-Doxygen comment annotations.
- @return {string} Rendered markdown document for the file.

### fn `function renderBodyAnnotations(` (L1695-1721)
- @brief Renders body comments and exit-point annotations for one element.
- @details Merges comment and exit maps, skips excluded line ranges, and emits normalized markdown lines that summarize body-level annotations. Runtime is O(a log a) in annotation count. No side effects occur.
- @param[in] element {SourceElement} Source element whose body annotations should be rendered.
- @param[in] indent {string} Prefix applied to each rendered annotation line.
- @param[in] excludeRanges {ReadonlyArray<readonly [number, number]> | undefined} Optional line ranges to suppress.
- @param[in,out] out {string[]} Markdown output buffer.
- @return {void} No return value.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ElementType`|enum||16-42|export enum ElementType|
|`SourceElement`|class||48-95|export class SourceElement|
|`LanguageSpec`|iface||101-108|export interface LanguageSpec|
|`re`|fn||116-118|function re(pattern: string): RegExp|
|`buildLanguageSpecs`|fn||125-424|export function buildLanguageSpecs(): Record<string, Lang...|
|`SourceAnalyzer`|class||491-790|export class SourceAnalyzer|
|`isFileLevelComment`|fn||983-986|const isFileLevelComment = (comment: SourceElement): bool...|
|`hasBlockingElement`|fn||1007-1027|const hasBlockingElement = (comment: SourceElement): bool...|
|`mdLoc`|fn||1260-1262|function mdLoc(element: SourceElement): string|
|`mdKind`|fn||1270-1299|function mdKind(element: SourceElement): string|
|`extractCommentText`|fn||1308-1329|function extractCommentText(commentElement: SourceElement...|
|`extractCommentLines`|fn||1337-1352|function extractCommentLines(commentElement: SourceElemen...|
|`buildCommentMaps`|fn||1360-1400|function buildCommentMaps(elements: SourceElement[]): [Re...|
|`mergeDoxygenFields`|fn||1409-1415|function mergeDoxygenFields(baseFields: Record<string, st...|
|`collectElementDoxygenFields`|fn||1423-1437|export function collectElementDoxygenFields(element: Sour...|
|`collectFileLevelDoxygenFields`|fn||1445-1456|export function collectFileLevelDoxygenFields(elements: S...|
|`formatMarkdown`|fn||1469-1721|export function formatMarkdown(|
|`renderBodyAnnotations`|fn||1695-1721|function renderBodyAnnotations(|


---

# static-check.ts | TypeScript | 674L | 18 symbols | 7 imports | 34 comments
> Path: `src/core/static-check.ts`
- @brief Defines static-check language mappings and checker dispatch implementations.
- @details Parses static-check configuration syntax, resolves file targets, and runs built-in or command-based analyzers such as Pylance and Ruff. Runtime is linear in file count plus external tool cost. Side effects include filesystem reads, PATH probing, process spawning, and console output.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import fg from "fast-glob";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";
```

## Definitions

### iface `export interface StaticCheckLanguageSupport` (L85-88)
- @brief Describes supported extensions for one canonical static-check language.
- @details The interface is used for UI rendering and capability reporting only. It is compile-time only and adds no runtime cost.

### fn `export function getSupportedStaticCheckLanguages(): string[]` (L106-108)
- @brief Returns the sorted list of canonical languages with extension support.
- @details Deduplicates the extension map values and sorts them alphabetically for stable UI and error messages. Runtime is O(n log n). No side effects occur.
- @return {string[]} Sorted canonical language names.

### fn `export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[]` (L115-126)
- @brief Returns supported languages paired with their known file extensions.
- @details Groups extensions by canonical language and emits alphabetically sorted extension lists. Runtime is O(n log n). No external state is mutated.
- @return {StaticCheckLanguageSupport[]} Sorted language-support descriptors.

### fn `function formatStaticCheckModules(): string` (L133-135)
- @brief Formats the supported module list for diagnostics.
- @details Joins `STATIC_CHECK_MODULES` with commas for direct insertion into error strings. Time complexity is O(n). No side effects occur.
- @return {string} Comma-delimited module names.

### fn `function splitCsvLikeTokens(specRhs: string): string[]` (L143-165)
- @brief Splits a comma-delimited static-check specification while honoring quotes.
- @details Performs a single pass over the right-hand side of `LANG=...`, preserving commas inside quoted segments. Runtime is O(n). No side effects occur.
- @param[in] specRhs {string} Right-hand side of the enable-static-check specification.
- @return {string[]} Parsed tokens with surrounding whitespace trimmed.

### fn `export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry]` (L174-222)
- @brief Parses one `LANG=MODULE[,CMD[,PARAM...]]` static-check specification.
- @details Validates the language alias, canonicalizes the module name, enforces module-specific argument requirements, and returns a config entry ready for persistence. Runtime is O(n) in specification length. No external state is mutated.
- @param[in] spec {string} Raw static-check specification string.
- @return {[string, StaticCheckEntry]} Tuple of canonical language name and normalized checker configuration.
- @throws {ReqError} Throws for missing separators, unknown languages, unknown modules, or missing required command arguments.

### fn `export function buildStaticCheckEntryIdentity(language: string, entry: StaticCheckEntry): string` (L232-237)
- @brief Builds the duplicate-identity token for one static-check entry.
- @details Canonicalizes the language key, module name, command name, and parameter list into a stable JSON tuple used for merge deduplication. Runtime is O(p) in parameter count. No side effects occur.
- @param[in] language {string} Canonical or alias language name associated with the entry.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to normalize.
- @return {string} Stable identity token suitable for equality comparison.
- @satisfies REQ-036

### fn `export function validateStaticCheckEntry(entry: StaticCheckEntry): void` (L247-258)
- @brief Validates pre-persistence invariants for one static-check entry.
- @details Rejects `Command` entries whose executable cannot be resolved before config writes while leaving non-command modules untouched. Runtime is O(p) in PATH entry count. Side effects are limited to filesystem reads.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry to validate.
- @return {void} No return value.
- @throws {ReqError} Throws when a `Command` entry omits `cmd` or resolves to a non-executable program.
- @satisfies REQ-037

### fn `function resolveFiles(inputs: string[]): string[]` (L266-290)
- @brief Resolves explicit files, directories, and glob patterns into absolute file paths.
- @details Expands glob inputs with `fast-glob`, enumerates direct children for directory inputs, accepts regular files, and warns for invalid entries. Runtime is O(n + m) where m is the total matched path count. Side effects are filesystem reads and warning output to stderr.
- @param[in] inputs {string[]} Raw file, directory, or glob inputs.
- @return {string[]} Unique absolute file paths.

### class `export class StaticCheckBase` (L296-370)
- @brief Provides the base implementation for file-oriented static checks.
- @details Resolves input files once, emits standardized headers, and defines overridable `checkFile` and `emitLine` hooks used by concrete analyzers. Runtime is O(f) plus subclass checker cost. Side effects include console output.

### fn `function detectPythonExecutable(projectBase?: string): string` (L378-398)
- @brief Resolves the preferred Python executable for Python-based checkers.
- @details Checks the project virtual environment first, then `PI_USEREQ_PYTHON`, then `python3`, then `python`, and finally falls back to the literal `python3` string. Runtime is O(c) in candidate count. Side effects are filesystem reads and PATH probing.
- @param[in] projectBase {string | undefined} Optional project root used to probe `.venv/bin/python`.
- @return {string} Executable path or command name.

### class `export class StaticCheckPylance extends StaticCheckBase` : StaticCheckBase (L404-455)
- @brief Runs Pyright/Pylance checks through the selected Python interpreter.
- @details Invokes `python -m pyright` for each resolved file and emits standardized OK/FAIL records. Runtime is dominated by external checker execution. Side effects include process spawning and console output.

### class `export class StaticCheckRuff extends StaticCheckBase` : StaticCheckBase (L461-509)
- @brief Runs Ruff checks through the selected Python interpreter.
- @details Invokes `python -m ruff check` for each resolved file and emits standardized OK/FAIL records. Runtime is dominated by external checker execution. Side effects include process spawning and console output.

### class `export class StaticCheckCommand extends StaticCheckBase` : StaticCheckBase (L515-564)
- @brief Runs an arbitrary external command as a static checker.
- @brief Initializes a command-backed checker instance.
- @details Validates command availability on PATH during construction, then invokes the command with configured extra arguments plus one target file at a time. Runtime is dominated by external command execution. Side effects include PATH probing, process spawning, and console output.
- @details Validates that the executable exists on PATH before delegating file resolution to the base class and recording the command label. Runtime is O(p + f) where p is PATH entry count and f is resolved input count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name.
- @param[in] inputs {string[]} Raw file inputs.
- @param[in] extraArgs {string[] | undefined} Extra command arguments.
- @param[in] failOnly {boolean} When `true`, suppress successful-file output.
- @throws {ReqError} Throws when the executable cannot be found on PATH.

### fn `function isExecutableFile(candidate: string): boolean` (L572-582)
- @brief Tests whether one filesystem path is executable.
- @details Requires the candidate to exist, be a regular file, and pass `X_OK` access checks. Runtime is O(1). Side effects are limited to filesystem reads.
- @param[in] candidate {string} Absolute or relative path to inspect.
- @return {boolean} `true` when the candidate is executable by the current process.

### fn `function findExecutable(cmd: string): string | undefined` (L590-601)
- @brief Locates an executable by scanning the current PATH.
- @details Checks each PATH directory for an executable file named exactly as the requested command. Runtime is O(p) in PATH entry count. Side effects are filesystem reads.
- @param[in] cmd {string} Executable name to locate.
- @return {string | undefined} Absolute executable path, or `undefined` when not found.

### fn `export function dispatchStaticCheckForFile(` (L612-615)
- @brief Dispatches one configured static checker for a single file.
- @details Selects the checker implementation by module name, normalizes parameter arrays, and runs exactly one checker instance against the target file. Runtime is dominated by the selected checker. Side effects include console output and possible process spawning.
- @param[in] filePath {string} Absolute or relative file path to check.
- @param[in] langConfig {StaticCheckEntry} Normalized static-check configuration entry.
- @param[in] options {{ failOnly?: boolean; projectBase?: string }} Optional execution controls.
- @return {number} Checker exit status where `0` means success and non-zero means failure.
- @throws {ReqError} Throws when configuration is incomplete or names an unknown module.

### fn `export function runStaticCheck(argv: string[]): number` (L649-674)
- @brief Runs the standalone static-check test driver.
- @details Dispatches subcommands to the built-in checker implementations without consulting project configuration. Runtime is O(n) in argument count plus checker cost. Side effects include console output and external process spawning.
- @param[in] argv {string[]} Raw static-check subcommand arguments.
- @return {number} Checker exit status where `0` means success.
- @throws {ReqError} Throws when no subcommand is provided, the subcommand is unknown, or required arguments are missing.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`StaticCheckLanguageSupport`|iface||85-88|export interface StaticCheckLanguageSupport|
|`getSupportedStaticCheckLanguages`|fn||106-108|export function getSupportedStaticCheckLanguages(): string[]|
|`getSupportedStaticCheckLanguageSupport`|fn||115-126|export function getSupportedStaticCheckLanguageSupport():...|
|`formatStaticCheckModules`|fn||133-135|function formatStaticCheckModules(): string|
|`splitCsvLikeTokens`|fn||143-165|function splitCsvLikeTokens(specRhs: string): string[]|
|`parseEnableStaticCheck`|fn||174-222|export function parseEnableStaticCheck(spec: string): [st...|
|`buildStaticCheckEntryIdentity`|fn||232-237|export function buildStaticCheckEntryIdentity(language: s...|
|`validateStaticCheckEntry`|fn||247-258|export function validateStaticCheckEntry(entry: StaticChe...|
|`resolveFiles`|fn||266-290|function resolveFiles(inputs: string[]): string[]|
|`StaticCheckBase`|class||296-370|export class StaticCheckBase|
|`detectPythonExecutable`|fn||378-398|function detectPythonExecutable(projectBase?: string): st...|
|`StaticCheckPylance`|class||404-455|export class StaticCheckPylance extends StaticCheckBase|
|`StaticCheckRuff`|class||461-509|export class StaticCheckRuff extends StaticCheckBase|
|`StaticCheckCommand`|class||515-564|export class StaticCheckCommand extends StaticCheckBase|
|`isExecutableFile`|fn||572-582|function isExecutableFile(candidate: string): boolean|
|`findExecutable`|fn||590-601|function findExecutable(cmd: string): string | undefined|
|`dispatchStaticCheckForFile`|fn||612-615|export function dispatchStaticCheckForFile(|
|`runStaticCheck`|fn||649-674|export function runStaticCheck(argv: string[]): number|


---

# token-counter.ts | TypeScript | 729L | 29 symbols | 5 imports | 35 comments
> Path: `src/core/token-counter.ts`
- @brief Provides token, size, and structure counting utilities for agent-oriented file payloads.
- @details Wraps `js-tiktoken` encoding lookup, extracts per-file structural facts, and builds machine-oriented JSON payloads for token-centric tools. Runtime is linear in processed text size plus sort cost for derived ordering hints. Side effects are limited to filesystem reads in file-based helpers.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { getEncoding } from "js-tiktoken";
import { detectLanguage as detectSourceLanguage } from "./compress.js";
import { parseDoxygenComment, type DoxygenFieldMap } from "./doxygen-parser.js";
```

## Definitions

- type `export type TokenToolScope = "explicit-files" | "canonical-docs";` (L23)
- @brief Enumerates supported token-payload scopes.
- @details Distinguishes explicit-file requests from canonical-document requests while preserving one stable JSON contract. The alias is compile-time only and introduces no runtime cost.
- type `export type TokenFileStatus = "counted" | "error" | "skipped";` (L29)
- @brief Enumerates supported per-file token-entry statuses.
- @details Separates counted files, read-time failures, and skipped inputs so downstream agents can branch without reparsing text diagnostics. The alias is compile-time only and introduces no runtime cost.
### iface `export interface CountFileMetricsResult` (L35-48)
- @brief Describes one per-file token metric record.
- @details Stores canonical file identity plus numeric token, character, byte, and line metrics extracted from one readable file. Optional metadata remains isolated in dedicated fields so agents can access headings and Doxygen fields without reparsing monolithic text. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolFileEntry` (L54-77)
- @brief Describes one file entry in the agent-oriented token payload.
- @details Orders direct-access path identifiers before source facts and numeric metrics so agents can branch without reparsing formatted strings. Optional metadata captures markdown headings or Doxygen file fields when they can be derived from the source content. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRequestSection` (L83-93)
- @brief Describes the request section of the agent-oriented token payload.
- @details Captures tool identity, scope, path-resolution base, encoding, and requested path inventories so agents can reason about how metrics were selected. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSummarySection` (L99-112)
- @brief Describes the summary section of the agent-oriented token payload.
- @details Exposes aggregate counts, sizes, totals, and per-file averages as numeric fields with explicit units so agents can branch on totals without reparsing formatted strings. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPathIssue` (L118-122)
- @brief Describes one skipped-input or read-error observation.
- @details Preserves both the caller-provided path and the canonicalized path plus a stable machine-readable reason string. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolDominantFileObservation` (L128-132)
- @brief Describes the dominant counted file for one metric ordering.
- @details Exposes the canonical path plus the numeric token metrics that justify why the file dominates the current context budget. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolSourceObservationsSection` (L138-144)
- @brief Describes the source-observation subsection of the guidance payload.
- @details Separates measured ordering facts and path issues from derived recommendations so agents can reason about raw observations independently. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolRecommendation` (L150-154)
- @brief Describes one derived recommendation in the guidance payload.
- @details Provides a stable recommendation kind, the basis metric used to derive it, and the ordered path list the agent can follow directly. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolNextStepHint` (L160-164)
- @brief Describes one actionable next-step hint in the guidance payload.
- @details Supplies a stable hint kind, a focused ordered path subset, and the goal the agent can apply without reparsing surrounding prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolGuidanceSection` (L170-174)
- @brief Describes the guidance section of the agent-oriented token payload.
- @details Separates source observations, derived recommendations, and actionable next-step hints so downstream agents can choose between raw evidence and planning heuristics without reparsing mixed prose. The interface is compile-time only and introduces no runtime cost.

### iface `export interface TokenToolPayload` (L180-185)
- @brief Describes the full agent-oriented token payload.
- @details Orders the top-level sections as request, summary, files, and guidance for deterministic downstream traversal. The interface is compile-time only and introduces no runtime cost.

### iface `export interface BuildTokenToolPayloadOptions` (L191-199)
- @brief Describes the options required to build one agent-oriented token payload.
- @details Supplies tool identity, scope, path base, requested paths, and optional canonical-doc metadata while keeping counting behavior configurable through a stable object contract. The interface is compile-time only and introduces no runtime cost.

### class `export class TokenCounter` (L205-245)
- @brief Encapsulates one tokenizer instance for repeated token counting.
- @brief Stores the tokenizer implementation used for subsequent counts.
- @details Caches a `js-tiktoken` encoding object so multiple documents can be counted without repeated encoding lookup. Counting cost is O(n) in content length. The class mutates only instance state during construction.
- @details The field holds the encoder returned by `getEncoding`. Access complexity is O(1). The value is initialized once per instance.

### fn `function canonicalizeTokenPath(filePath: string, baseDir: string): string` (L254-262)
- @brief Converts one filesystem path into the canonical token-payload path form.
- @details Emits a slash-normalized relative path when the target is under the supplied base directory; otherwise emits a slash-normalized absolute path. Runtime is O(p) in path length. No external state is mutated.
- @param[in] filePath {string} Candidate absolute or relative filesystem path.
- @param[in] baseDir {string} Reference directory used for relative canonicalization.
- @return {string} Canonicalized path string.

### fn `function countLines(content: string): number` (L270-276)
- @brief Counts logical lines in one text payload.
- @details Counts newline separators while treating a trailing newline as line termination instead of an extra empty logical line. Runtime is O(n) in text length. No side effects occur.
- @param[in] content {string} Text payload.
- @return {number} Logical line count; `0` for empty content.

### fn `function stripMarkdownFrontMatter(content: string): string` (L284-287)
- @brief Strips YAML front matter from markdown content before heading extraction.
- @details Removes the first `--- ... ---` block only when it appears at the file start so heading detection can operate on semantic markdown content instead of metadata. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} Markdown payload.
- @return {string} Markdown body without the leading front matter block.

### fn `function extractPrimaryHeadingText(content: string, filePath: string): string | undefined` (L296-303)
- @brief Extracts the first level-one markdown heading when present.
- @details Restricts extraction to markdown-like files, skips YAML front matter, and returns the first `# ` heading payload without surrounding whitespace. Runtime is O(n) in content length. No side effects occur.
- @param[in] content {string} File content.
- @param[in] filePath {string} Source path used for extension-based markdown detection.
- @return {string | undefined} First heading text, or `undefined` when absent or the file is not markdown-like.

### fn `function inferLanguageName(filePath: string): string | undefined` (L311-320)
- @brief Infers a file language label optimized for agent payloads.
- @details Reuses source-language detection when available, normalizes markdown extensions explicitly, and falls back to the lowercase extension name without the leading dot. Runtime is O(1). No side effects occur.
- @param[in] filePath {string} File path whose extension should be classified.
- @return {string | undefined} Normalized language label, or `undefined` when the path has no usable extension.

### fn `function extractLeadingDoxygenFields(content: string): DoxygenFieldMap | undefined` (L328-346)
- @brief Extracts leading Doxygen file fields when present.
- @details Tests common leading-comment syntaxes, normalizes an optional shebang away before matching, and returns the first non-empty parsed Doxygen map. Runtime is O(n) in comment length. No side effects occur.
- @param[in] content {string} File content.
- @return {DoxygenFieldMap | undefined} Parsed Doxygen field map, or `undefined` when no supported file-level fields are present.

### fn `function roundRatio(numerator: number, denominator: number): number` (L355-360)
- @brief Rounds one ratio to six decimal places.
- @details Preserves zero exactly and otherwise limits floating-point noise so share fields remain stable across executions. Runtime is O(1). No side effects occur.
- @param[in] numerator {number} Partial numeric value.
- @param[in] denominator {number} Total numeric value.
- @return {number} Rounded ratio in range `[0, 1]` when the denominator is positive; `0` otherwise.

### fn `function orderPathsByMetric(` (L370-395)
- @brief Orders canonical file paths by one numeric metric while removing duplicates.
- @details Filters to counted file entries, sorts by the supplied metric direction, breaks ties by canonical path, and preserves only the first occurrence of each path. Runtime is O(n log n). No external state is mutated.
- @param[in] files {TokenToolFileEntry[]} Token payload file entries.
- @param[in] metric {(entry: TokenToolFileEntry) => number} Numeric metric selector.
- @param[in] direction {"asc" | "desc"} Sort direction.
- @return {string[]} Unique canonical paths ordered by the requested metric.

### fn `function probeRequestedPath(absolutePath: string): { exists: boolean; isFile: boolean; reason?: string }` (L403-417)
- @brief Probes one requested path before token counting.
- @details Resolves whether the target exists and is a regular file while capturing a stable skip reason for missing or non-file inputs. Runtime is dominated by one filesystem stat. Side effects are limited to filesystem reads.
- @param[in] absolutePath {string} Absolute path to inspect.
- @return {{ exists: boolean; isFile: boolean; reason?: string }} Path probe result.

### fn `function buildCountFileMetricsResult(filePath: string, content: string, counter: TokenCounter): CountFileMetricsResult` (L427-442)
- @brief Builds one rich per-file metrics record from readable content.
- @details Combines token, character, byte, and line counts with file-extension, inferred-language, heading, and Doxygen metadata extraction so agents can consume direct-access facts without reparsing the raw file. Runtime is O(n) in content length. No external state is mutated.
- @param[in] filePath {string} Absolute or project-local file path.
- @param[in] content {string} UTF-8 file content.
- @param[in] counter {TokenCounter} Reused token counter instance.
- @return {CountFileMetricsResult} Structured per-file metrics record.

### fn `export function countFileMetrics(content: string, encodingName = TOKEN_COUNTER_ENCODING):` (L451-464)
- @brief Counts tokens, characters, bytes, and lines for one in-memory content string.
- @details Instantiates a `TokenCounter`, tokenizes the supplied text, and pairs the result with raw character length, UTF-8 byte size, and logical line count. Runtime is O(n). No filesystem I/O occurs.
- @param[in] content {string} Text payload to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {{ tokens: number; chars: number; bytes: number; lines: number }} Aggregate metrics for the supplied content.

### fn `export function countFilesMetrics(filePaths: string[], encodingName = TOKEN_COUNTER_ENCODING): CountFileMetricsResult[]` (L474-495)
- @brief Counts tokens, characters, bytes, and lines for multiple files.
- @details Reuses a single `TokenCounter`, reads each file as UTF-8, and returns per-file metrics plus direct-access metadata such as heading and Doxygen file fields. Read failures are captured as error strings instead of aborting the entire batch. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] filePaths {string[]} File paths to measure.
- @param[in] encodingName {string} Tokenizer identifier. Defaults to `cl100k_base`.
- @return {CountFileMetricsResult[]} Per-file metrics and optional read errors.
- @satisfies REQ-010, REQ-070, REQ-073

### fn `export function buildTokenToolPayload(options: BuildTokenToolPayloadOptions): TokenToolPayload` (L504-697)
- @brief Builds the agent-oriented JSON payload for token-centric tools.
- @details Validates requested paths against the filesystem, counts token metrics for processable files, preserves caller order in the file table, separates raw observations from derived guidance, and emits direct-access file facts such as line ranges, sizes, headings, and optional Doxygen file fields. Runtime is O(F log F + S). Side effects are limited to filesystem reads.
- @param[in] options {BuildTokenToolPayloadOptions} Payload-construction options.
- @return {TokenToolPayload} Structured token payload ordered as request, summary, files, guidance.
- @satisfies REQ-010, REQ-017, REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075

### fn `export function formatPackSummary(results: CountFileMetricsResult[]): string` (L705-729)
- @brief Formats per-file token metrics as a human-readable summary block.
- @details Aggregates totals, emits one status line per file, and appends a summary footer containing file, token, and character counts. Runtime is O(n). No external state is mutated.
- @param[in] results {CountFileMetricsResult[]} Per-file metric records.
- @return {string} Multiline summary suitable for CLI or editor output.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`TokenToolScope`|type||23||
|`TokenFileStatus`|type||29||
|`CountFileMetricsResult`|iface||35-48|export interface CountFileMetricsResult|
|`TokenToolFileEntry`|iface||54-77|export interface TokenToolFileEntry|
|`TokenToolRequestSection`|iface||83-93|export interface TokenToolRequestSection|
|`TokenToolSummarySection`|iface||99-112|export interface TokenToolSummarySection|
|`TokenToolPathIssue`|iface||118-122|export interface TokenToolPathIssue|
|`TokenToolDominantFileObservation`|iface||128-132|export interface TokenToolDominantFileObservation|
|`TokenToolSourceObservationsSection`|iface||138-144|export interface TokenToolSourceObservationsSection|
|`TokenToolRecommendation`|iface||150-154|export interface TokenToolRecommendation|
|`TokenToolNextStepHint`|iface||160-164|export interface TokenToolNextStepHint|
|`TokenToolGuidanceSection`|iface||170-174|export interface TokenToolGuidanceSection|
|`TokenToolPayload`|iface||180-185|export interface TokenToolPayload|
|`BuildTokenToolPayloadOptions`|iface||191-199|export interface BuildTokenToolPayloadOptions|
|`TokenCounter`|class||205-245|export class TokenCounter|
|`canonicalizeTokenPath`|fn||254-262|function canonicalizeTokenPath(filePath: string, baseDir:...|
|`countLines`|fn||270-276|function countLines(content: string): number|
|`stripMarkdownFrontMatter`|fn||284-287|function stripMarkdownFrontMatter(content: string): string|
|`extractPrimaryHeadingText`|fn||296-303|function extractPrimaryHeadingText(content: string, fileP...|
|`inferLanguageName`|fn||311-320|function inferLanguageName(filePath: string): string | un...|
|`extractLeadingDoxygenFields`|fn||328-346|function extractLeadingDoxygenFields(content: string): Do...|
|`roundRatio`|fn||355-360|function roundRatio(numerator: number, denominator: numbe...|
|`orderPathsByMetric`|fn||370-395|function orderPathsByMetric(|
|`probeRequestedPath`|fn||403-417|function probeRequestedPath(absolutePath: string): { exis...|
|`buildCountFileMetricsResult`|fn||427-442|function buildCountFileMetricsResult(filePath: string, co...|
|`countFileMetrics`|fn||451-464|export function countFileMetrics(content: string, encodin...|
|`countFilesMetrics`|fn||474-495|export function countFilesMetrics(filePaths: string[], en...|
|`buildTokenToolPayload`|fn||504-697|export function buildTokenToolPayload(options: BuildToken...|
|`formatPackSummary`|fn||705-729|export function formatPackSummary(results: CountFileMetri...|


---

# tool-runner.ts | TypeScript | 717L | 34 symbols | 13 imports | 35 comments
> Path: `src/core/tool-runner.ts`
- @brief Implements the executable back-end for all pi-usereq CLI and extension tools.
- @details Centralizes project discovery, git helpers, source-file collection, documentation generation, compression, construct lookup, static-check dispatch, and worktree lifecycle operations. Runtime depends on the selected command and may include filesystem reads, config writes, process spawning, and git mutations.

## Imports
```
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { loadConfig, normalizeConfigPaths, saveConfig, type UseReqConfig } from "./config.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
import { countFilesMetrics, formatPackSummary } from "./token-counter.js";
import {
import { compressFiles } from "./compress-files.js";
import { findConstructsInFiles } from "./find-constructs.js";
import { STATIC_CHECK_EXT_TO_LANG, dispatchStaticCheckForFile } from "./static-check.js";
import { makeRelativeIfContainsProject } from "./utils.js";
```

## Definitions

### iface `export interface ToolResult` (L28-32)
- @brief Represents the normalized output contract for a tool invocation.
- @details Every tool emits stdout, stderr, and a numeric exit code so CLI and extension front-ends can handle results uniformly. The interface is compile-time only and adds no runtime cost.

### fn `function ok(stdout = "", stderr = ""): ToolResult` (L52-54)
- @brief Creates a successful tool result payload.
- @details Wraps stdout and stderr text with exit code `0`. Runtime is O(1). No side effects occur.
- @param[in] stdout {string} Standard-output text.
- @param[in] stderr {string} Standard-error text.
- @return {ToolResult} Successful result object.

### fn `function fail(message: string, code = 1, stdout = "", stderr = ""): never` (L66-71)
- @brief Throws a `ReqError` populated with tool-result stream content.
- @details Creates a structured failure object, attaches optional stdout and stderr payloads, and throws immediately. Runtime is O(1). Side effect: throws an exception.
- @param[in] message {string} Primary failure message.
- @param[in] code {number} Exit code to attach. Defaults to `1`.
- @param[in] stdout {string} Optional stdout payload.
- @param[in] stderr {string} Optional stderr payload. Defaults to `message` when omitted.
- @return {never} This function never returns.
- @throws {ReqError} Always throws.

### fn `function runCapture(command: string[], options: { cwd?: string } = {})` (L80-85)
- @brief Executes a subprocess synchronously and captures its output.
- @details Delegates to `spawnSync`, passes through an optional working directory, and forces UTF-8 decoding. Runtime is dominated by external process execution. Side effects include process spawning.
- @param[in] command {string[]} Executable plus argument vector.
- @param[in] options {{ cwd?: string }} Optional process-spawn settings.
- @return {ReturnType<typeof spawnSync>} Captured subprocess result.

### fn `function resolveEffectiveGitPath(projectBase: string): string | undefined` (L94-96)
- @brief Resolves the effective runtime git root for the current base path.
- @details Delegates to the shared runtime-only repository resolver so git helpers never consult persisted `git-path` metadata. Runtime is dominated by git probing. Side effects include subprocess execution.
- @param[in] projectBase {string} Resolved base path.
- @return {string | undefined} Effective git root path or `undefined` when unavailable.
- @satisfies REQ-145, REQ-146

### fn `export function sanitizeBranchName(branch: string): string` (L104-106)
- @brief Rewrites a branch name into a filesystem-safe token.
- @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No side effects occur.
- @param[in] branch {string} Raw branch name.
- @return {string} Sanitized token.

### fn `export function validateWtName(wtName: string): boolean` (L114-117)
- @brief Validates a requested worktree or branch name.
- @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No side effects occur.
- @param[in] wtName {string} Candidate worktree name.
- @return {boolean} `true` when the name is acceptable for worktree creation.

### fn `export function collectSourceFiles(srcDirs: string[], projectBase: string): string[]` (L127-154)
- @brief Collects tracked and untracked source files from configured source directories.
- @details Uses `git ls-files` to enumerate candidate files, filters them by configured source roots, excluded directories, and supported extensions, and returns sorted absolute paths. Runtime is O(n log n) in collected file count plus git execution cost. Side effects include process spawning.
- @param[in] srcDirs {string[]} Configured source-directory roots.
- @param[in] projectBase {string} Absolute project root.
- @return {string[]} Sorted absolute source-file paths.
- @throws {ReqError} Throws when `git ls-files` fails.

### fn `function buildAsciiTree(paths: string[]): string` (L162-190)
- @brief Builds an ASCII tree from relative file paths.
- @details Materializes a nested object tree and renders it using box-drawing characters for markdown display. Runtime is O(n log n) in path count due to sorting. No side effects occur.
- @param[in] paths {string[]} Relative POSIX-style file paths.
- @return {string} Rendered ASCII tree.

### fn `const emit = (branch: Record<string, Record<string, unknown> | null>, prefix = "") =>` (L178-187)

### fn `function formatFilesStructureMarkdown(files: string[], projectBase: string): string` (L199-202)
- @brief Formats the collected file structure as markdown.
- @details Converts absolute file paths to project-relative POSIX paths, renders an ASCII tree, and wraps the result in a fenced markdown block. Runtime is O(n log n) in file count. No side effects occur.
- @param[in] files {string[]} Absolute file paths.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Markdown section describing the file structure.

### fn `export function resolveProjectBase(projectBase?: string): string` (L211-217)
- @brief Resolves and validates the project base directory.
- @details Uses the supplied path or the current working directory, normalizes it to an absolute path, and verifies that it exists. Runtime is O(1) plus one filesystem existence check. Side effects are limited to filesystem reads.
- @param[in] projectBase {string | undefined} Optional project-root override.
- @return {string} Absolute validated project root.
- @throws {ReqError} Throws when the resolved path does not exist.

### fn `export function resolveProjectSrcDirs(projectBase: string, config?: UseReqConfig): [string, string[]]` (L227-235)
- @brief Resolves the project base and effective source-directory list.
- @details Loads configuration when not supplied, validates that at least one source directory exists in config, and returns both the absolute base path and source-directory array. Runtime is O(s). Side effects are limited to config reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {[string, string[]]} Tuple of absolute project base and configured source directories.
- @throws {ReqError} Throws when no source directories are configured.

### fn `export function loadAndRepairConfig(projectBase: string): UseReqConfig` (L244-249)
- @brief Loads project configuration and persists normalized path fields.
- @details Resolves the base path, normalizes persisted docs/tests/source directories into project-relative form, writes the normalized config back to disk, and returns the in-memory result without persisting runtime-derived path metadata. Runtime is dominated by config I/O. Side effects include config writes.
- @param[in] projectBase {string} Candidate project root.
- @return {UseReqConfig} Normalized effective configuration.
- @satisfies CTN-012, REQ-146

### fn `export function runFilesTokens(files: string[]): ToolResult` (L258-270)
- @brief Counts tokens and characters for explicit files.
- @details Filters missing files into stderr warnings, counts metrics for valid files, and returns a formatted summary. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] files {string[]} Explicit file paths.
- @return {ToolResult} Tool result containing the formatted summary and warnings.
- @throws {ReqError} Throws when no valid files are provided.

### fn `export function runFilesReferences(files: string[], cwd = process.cwd(), verbose = false): ToolResult` (L281-297)
- @brief Generates the structured references JSON payload for explicit files.
- @details Builds the agent-oriented references payload in caller order, preserves skipped and failed inputs as structured file records, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory used for canonical path resolution. Defaults to `process.cwd()`.
- @param[in] verbose {boolean} When `true`, emit per-file progress diagnostics to stderr.
- @return {ToolResult} Successful tool result containing structured JSON.
- @satisfies REQ-011, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runFilesCompress(files: string[], cwd = process.cwd(), enableLineNumbers = false, verbose = false): ToolResult` (L308-310)
- @brief Compresses explicit files into compact source excerpts.
- @details Delegates to `compressFiles` using the caller working directory as the relative-output base by default. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] files {string[]} Explicit file paths.
- @param[in] cwd {string} Base directory for relative output formatting. Defaults to `process.cwd()`.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.

### fn `export function runFilesFind(argsList: string[], enableLineNumbers = false, verbose = false): ToolResult` (L321-327)
- @brief Finds named constructs in explicit files.
- @details Expects `[TAG, PATTERN, ...FILES]`, validates minimum arity, and delegates to `findConstructsInFiles`. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] argsList {string[]} Positional argument list containing tag filter, regex pattern, and files.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when required arguments are missing.

### fn `export function runReferences(projectBase: string, config?: UseReqConfig, verbose = false): ToolResult` (L339-356)
- @brief Generates the structured references JSON payload for configured source directories.
- @details Resolves the project base, collects configured source files, builds the agent-oriented references payload, emits deterministic JSON to stdout, and mirrors structured diagnostics to stderr. Runtime is O(F log F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing structured JSON.
- @throws {ReqError} Throws when no source files are found or no file can be analyzed.
- @satisfies REQ-014, REQ-076, REQ-077, REQ-078, REQ-079

### fn `export function runCompress(projectBase: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L368-373)
- @brief Compresses all source files from configured source directories.
- @details Resolves the project base, collects source files, and delegates to `compressFiles`. Runtime is O(F + S). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers.
- @param[in] verbose {boolean} When `true`, emit per-file diagnostics to stderr.
- @return {ToolResult} Successful tool result containing compressed output.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runFind(projectBase: string, tagFilter: string, pattern: string, config?: UseReqConfig, enableLineNumbers = false, verbose = false): ToolResult` (L387-396)
- @brief Finds named constructs across configured project source files.
- @details Resolves the project base, collects source files, delegates to `findConstructsInFiles`, and converts thrown search errors into structured `ReqError` failures. Runtime is O(F + S + M). Side effects are limited to filesystem reads and optional stderr logging.
- @param[in] projectBase {string} Candidate project root.
- @param[in] tagFilter {string} Pipe-delimited tag filter.
- @param[in] pattern {string} Regular expression applied to construct names.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @param[in] enableLineNumbers {boolean} When `true`, preserve original source line numbers in excerpts.
- @param[in] verbose {boolean} When `true`, emit diagnostics to stderr.
- @return {ToolResult} Successful tool result containing construct markdown.
- @throws {ReqError} Throws when no source files are found or the search fails.

### fn `export function runTokens(projectBase: string, config?: UseReqConfig): ToolResult` (L406-415)
- @brief Counts tokens for canonical documentation files.
- @details Loads the configured docs directory, selects `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md` when present, and delegates to `runFilesTokens`. Runtime is O(F + S). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Tool result containing documentation token metrics.
- @throws {ReqError} Throws when no canonical docs files exist.

### fn `export function runFilesStaticCheck(files: string[], projectBase: string, config?: UseReqConfig): ToolResult` (L425-461)
- @brief Runs configured static checks for explicit files.
- @details Loads the effective static-check config, groups checks by file extension language, captures checker stdout for each configured entry, and aggregates stderr warnings for invalid paths. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] files {string[]} Explicit file paths.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.

### fn `export function runProjectStaticCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L471-484)
- @brief Runs configured static checks for project source and test directories.
- @details Collects source and test files, excludes fixture roots, and delegates to `runFilesStaticCheck`. Runtime is O(F * C) plus external checker cost. Side effects include filesystem reads, stdout interception, and process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Aggregated static-check result.
- @throws {ReqError} Throws when no source files are found.

### fn `export function runGitCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L495-518)
- @brief Verifies that the effective repository root is clean and has a valid HEAD.
- @details Resolves the runtime git root for the current execution path, checks work-tree status, rejects uncommitted changes, and verifies either a symbolic ref or detached HEAD hash exists. Runtime is dominated by git execution. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when the repository state is valid.
- @throws {ReqError} Throws when the runtime git root is unavailable or repository status is unclear.
- @satisfies REQ-145, REQ-146

### fn `export function runDocsCheck(projectBase: string, config?: UseReqConfig): ToolResult` (L528-545)
- @brief Verifies that canonical documentation files exist.
- @details Checks the configured docs directory for `REQUIREMENTS.md`, `WORKFLOW.md`, and `REFERENCES.md`, and throws a guided error for the first missing file. Runtime is O(1) plus filesystem existence checks. Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when all canonical docs exist.
- @throws {ReqError} Throws when a required doc file is missing.

### fn `export function runGitWtName(projectBase: string, config?: UseReqConfig): ToolResult` (L556-570)
- @brief Generates the standardized worktree name for the effective repository root.
- @details Resolves the runtime git root constrained by the current base path, combines the repository basename, sanitized current branch, and a timestamp-based execution identifier into a deterministic `useReq-...` name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the generated worktree name and trailing newline.
- @throws {ReqError} Throws when the runtime git root is unavailable.
- @satisfies REQ-145, REQ-146

### fn `function worktreePathExistsExact(gitPath: string, targetPath: string): boolean` (L580-585)
- @brief Tests whether a git worktree exists at an exact filesystem path.
- @details Parses `git worktree list --porcelain` output and compares normalized paths for exact equality. Runtime is O(n) in reported worktree count plus git execution cost. Side effects include process spawning.
- @param[in] gitPath {string} Git root used to query worktrees.
- @param[in] targetPath {string} Candidate worktree path.
- @return {boolean} `true` when a worktree exists at the exact target path.
- @throws {ReqError} Throws when the worktree list cannot be queried.

### fn `function rollbackWorktreeCreate(gitPath: string, wtPath: string, wtName: string): void` (L596-602)
- @brief Rolls back a partially created worktree and branch.
- @details Forces worktree removal and branch deletion, then throws if either rollback action fails. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] gitPath {string} Git root path.
- @param[in] wtPath {string} Worktree path to remove.
- @param[in] wtName {string} Branch name to delete.
- @return {void} No return value.
- @throws {ReqError} Throws when rollback cannot be completed.

### fn `export function runGitWtCreate(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L613-646)
- @brief Creates a dedicated git worktree and copies pi-usereq metadata into it.
- @details Validates the requested name, resolves base and git roots under the ancestor constraint, creates the worktree and branch, then mirrors the `.pi-usereq` directory into the corresponding path inside the new worktree. Runtime is dominated by git and filesystem operations. Side effects include worktree creation, branch creation, directory creation, and file copying.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Requested worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when creation completes.
- @throws {ReqError} Throws for invalid names, missing git metadata, git failures, or copy finalization failures.

### fn `export function runGitWtDelete(projectBase: string, wtName: string, config?: UseReqConfig): ToolResult` (L657-690)
- @brief Deletes a dedicated git worktree and its branch.
- @details Verifies that either the worktree path or branch exists, removes the worktree when present, deletes the branch when present, and fails atomically when either delete step reports an error. Runtime is dominated by git execution. Side effects include destructive git mutations.
- @param[in] projectBase {string} Candidate project root.
- @param[in] wtName {string} Exact worktree and branch name.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful empty result when deletion completes.
- @throws {ReqError} Throws when git metadata is missing, the target does not exist, or removal fails.

### fn `const branchExists = (() =>` (L667-670)

### fn `export function runGitPath(projectBase: string, config?: UseReqConfig): ToolResult` (L699-704)
- @brief Returns the effective git root path for the current execution context.
- @details Resolves the git root constrained by the current base path, formats it with the runtime path display serializer, and writes the resulting path followed by a newline. Runtime is O(p) plus config-load and optional git-probing cost. Side effects are limited to filesystem reads and git subprocess execution.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the derived git path or an empty line.

### fn `export function runGetBasePath(projectBase: string, config?: UseReqConfig): ToolResult` (L713-717)
- @brief Returns the current base path for the execution context.
- @details Resolves the current execution path, formats it with the runtime path display serializer, and writes the resulting base path followed by a newline. Runtime is O(p). Side effects are limited to filesystem reads.
- @param[in] projectBase {string} Candidate project root.
- @param[in] config {UseReqConfig | undefined} Optional preloaded configuration.
- @return {ToolResult} Successful result containing the base path and trailing newline.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`ToolResult`|iface||28-32|export interface ToolResult|
|`ok`|fn||52-54|function ok(stdout = "", stderr = ""): ToolResult|
|`fail`|fn||66-71|function fail(message: string, code = 1, stdout = "", std...|
|`runCapture`|fn||80-85|function runCapture(command: string[], options: { cwd?: s...|
|`resolveEffectiveGitPath`|fn||94-96|function resolveEffectiveGitPath(projectBase: string): st...|
|`sanitizeBranchName`|fn||104-106|export function sanitizeBranchName(branch: string): string|
|`validateWtName`|fn||114-117|export function validateWtName(wtName: string): boolean|
|`collectSourceFiles`|fn||127-154|export function collectSourceFiles(srcDirs: string[], pro...|
|`buildAsciiTree`|fn||162-190|function buildAsciiTree(paths: string[]): string|
|`emit`|fn||178-187|const emit = (branch: Record<string, Record<string, unkno...|
|`formatFilesStructureMarkdown`|fn||199-202|function formatFilesStructureMarkdown(files: string[], pr...|
|`resolveProjectBase`|fn||211-217|export function resolveProjectBase(projectBase?: string):...|
|`resolveProjectSrcDirs`|fn||227-235|export function resolveProjectSrcDirs(projectBase: string...|
|`loadAndRepairConfig`|fn||244-249|export function loadAndRepairConfig(projectBase: string):...|
|`runFilesTokens`|fn||258-270|export function runFilesTokens(files: string[]): ToolResult|
|`runFilesReferences`|fn||281-297|export function runFilesReferences(files: string[], cwd =...|
|`runFilesCompress`|fn||308-310|export function runFilesCompress(files: string[], cwd = p...|
|`runFilesFind`|fn||321-327|export function runFilesFind(argsList: string[], enableLi...|
|`runReferences`|fn||339-356|export function runReferences(projectBase: string, config...|
|`runCompress`|fn||368-373|export function runCompress(projectBase: string, config?:...|
|`runFind`|fn||387-396|export function runFind(projectBase: string, tagFilter: s...|
|`runTokens`|fn||406-415|export function runTokens(projectBase: string, config?: U...|
|`runFilesStaticCheck`|fn||425-461|export function runFilesStaticCheck(files: string[], proj...|
|`runProjectStaticCheck`|fn||471-484|export function runProjectStaticCheck(projectBase: string...|
|`runGitCheck`|fn||495-518|export function runGitCheck(projectBase: string, config?:...|
|`runDocsCheck`|fn||528-545|export function runDocsCheck(projectBase: string, config?...|
|`runGitWtName`|fn||556-570|export function runGitWtName(projectBase: string, config?...|
|`worktreePathExistsExact`|fn||580-585|function worktreePathExistsExact(gitPath: string, targetP...|
|`rollbackWorktreeCreate`|fn||596-602|function rollbackWorktreeCreate(gitPath: string, wtPath: ...|
|`runGitWtCreate`|fn||613-646|export function runGitWtCreate(projectBase: string, wtNam...|
|`runGitWtDelete`|fn||657-690|export function runGitWtDelete(projectBase: string, wtNam...|
|`branchExists`|fn||667-670|const branchExists = (() =>|
|`runGitPath`|fn||699-704|export function runGitPath(projectBase: string, config?: ...|
|`runGetBasePath`|fn||713-717|export function runGetBasePath(projectBase: string, confi...|


---

# utils.ts | TypeScript | 185L | 8 symbols | 3 imports | 9 comments
> Path: `src/core/utils.ts`
- @brief Provides path-normalization, shell-tokenization, and regex-escaping helpers.
- @details Concentrates small pure utilities used by configuration loading, prompt rendering, and command dispatch. Most operations are linear in string length. Side effects are limited to filesystem existence checks in path normalization helpers.

## Imports
```
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
```

## Definitions

### fn `export function formatSubstitutedPath(value: string): string` (L17-19)
- @brief Normalizes path separators to forward slashes.
- @details Leaves empty input as an empty string and converts platform-specific separators to POSIX form for prompt-safe display. Time complexity is O(n) in path length. No side effects occur.
- @param[in] value {string} Path-like string.
- @return {string} Slash-normalized path string.

### fn `export function makeRelativeIfContainsProject(pathValue: string, projectBase: string): string` (L28-68)
- @brief Rewrites a path to be project-relative when it resolves inside the project root.
- @details Handles absolute paths, repeated project-name prefixes, and embedded project-name segments, then falls back to the original value when safe relativization is not possible. Runtime is O(p) plus filesystem checks for candidate suffixes. Side effects are limited to existence checks.
- @param[in] pathValue {string} User-supplied path value.
- @param[in] projectBase {string} Absolute project root used as the relativization anchor.
- @return {string} Project-relative path when derivable; otherwise the original or best-effort normalized input.

### fn `export function resolveAbsolute(normalized: string, projectBase: string): string | undefined` (L77-80)
- @brief Resolves a normalized path against the project root.
- @details Returns `undefined` for empty input, preserves absolute paths, and resolves relative paths from `projectBase`. Time complexity is O(p). No side effects occur.
- @param[in] normalized {string} Normalized path token.
- @param[in] projectBase {string} Absolute project root.
- @return {string | undefined} Absolute path or `undefined` for empty input.

### fn `export function computeSubPath(normalized: string, absolute: string | undefined, projectBase: string): string` (L90-99)
- @brief Computes a slash-normalized project subpath for display or config storage.
- @details Prefers a relative path derived from the provided absolute path when it stays inside the project root; otherwise formats the normalized input directly. Runtime is O(p). No side effects occur.
- @param[in] normalized {string} Original normalized path token.
- @param[in] absolute {string | undefined} Absolute candidate path.
- @param[in] projectBase {string} Absolute project root.
- @return {string} Slash-normalized subpath.

### fn `export function makeRelativeToken(raw: string, keepTrailing = false): string` (L108-114)
- @brief Normalizes a raw path token into a relative slash-separated fragment.
- @details Removes leading and trailing separators, converts backslashes to slashes, and optionally preserves a trailing slash marker. Runtime is O(n). No side effects occur.
- @param[in] raw {string} Raw token to normalize.
- @param[in] keepTrailing {boolean} When `true`, preserve a trailing slash if the input contained one.
- @return {string} Normalized relative token.

### fn `export function shellSplit(value: string): string[]` (L122-160)
- @brief Splits a shell-style argument string into tokens.
- @details Supports single quotes, double quotes, backslash escaping, and whitespace token boundaries without invoking an external shell. Runtime is O(n). No side effects occur.
- @param[in] value {string} Raw argument string.
- @return {string[]} Parsed token list.

### fn `export function homeRelative(absolutePath: string): string` (L168-175)
- @brief Rewrites an absolute path relative to the user's home directory when possible.
- @details Returns `~` for the home directory itself, `~/...` for descendants, and a slash-normalized original path otherwise. Runtime is O(p). No side effects occur.
- @param[in] absolutePath {string} Absolute path candidate.
- @return {string} Home-relative or slash-normalized path string.

### fn `export function escapeRegExp(value: string): string` (L183-185)
- @brief Escapes regular-expression metacharacters in a literal string.
- @details Replaces every regex-significant character with its escaped form so the result can be embedded safely into a dynamic pattern. Runtime is O(n). No side effects occur.
- @param[in] value {string} Literal string to escape.
- @return {string} Regex-safe literal fragment.

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`formatSubstitutedPath`|fn||17-19|export function formatSubstitutedPath(value: string): string|
|`makeRelativeIfContainsProject`|fn||28-68|export function makeRelativeIfContainsProject(pathValue: ...|
|`resolveAbsolute`|fn||77-80|export function resolveAbsolute(normalized: string, proje...|
|`computeSubPath`|fn||90-99|export function computeSubPath(normalized: string, absolu...|
|`makeRelativeToken`|fn||108-114|export function makeRelativeToken(raw: string, keepTraili...|
|`shellSplit`|fn||122-160|export function shellSplit(value: string): string[]|
|`homeRelative`|fn||168-175|export function homeRelative(absolutePath: string): string|
|`escapeRegExp`|fn||183-185|export function escapeRegExp(value: string): string|


---

# index.ts | TypeScript | 2209L | 50 symbols | 21 imports | 53 comments
> Path: `src/index.ts`
- @brief Registers the pi-usereq extension commands, tools, and configuration UI.
- @details Bridges the standalone tool-runner layer into the pi extension API by registering prompt commands, agent tools, and interactive configuration menus. Runtime at module load is O(1); later behavior depends on the selected command or tool. Side effects include extension registration, UI updates, filesystem reads/writes, and delegated tool execution.

## Imports
```
import path from "node:path";
import type {
import { Type } from "@sinclair/typebox";
import {
import {
import {
import {
import {
import {
import {
import { buildRuntimePathContext, buildRuntimePathFacts } from "./core/path-context.js";
import { resolveRuntimeGitPath } from "./core/runtime-project-paths.js";
import { showPiUsereqSettingsMenu, type PiUsereqSettingsMenuChoice } from "./core/settings-menu.js";
import {
import { renderPrompt } from "./core/prompts.js";
import { ensureBundledResourcesAccessible } from "./core/resources.js";
import {
import {
import { LANGUAGE_TAGS } from "./core/find-constructs.js";
import {
import { makeRelativeIfContainsProject, shellSplit } from "./core/utils.js";
```

## Definitions

### iface `interface PiShortcutRegistrar` (L137-145)
- @brief Describes the optional shortcut-registration surface used by pi-usereq.
- @details Narrows the runtime API to the documented `registerShortcut(...)`
method so the extension can remain compatible with offline harnesses that do
not implement shortcut capture. Compile-time only and introduces no runtime
cost.

### fn `function getProjectBase(cwd: string): string` (L153-155)
- @brief Resolves the effective project base from a working directory.
- @details Normalizes the provided cwd into an absolute path without consulting configuration. Time complexity is O(1). No I/O side effects occur.
- @param[in] cwd {string} Current working directory.
- @return {string} Absolute project base path.

### fn `function buildSharedRuntimePathFacts(cwd: string, config: UseReqConfig): import("./core/path-context.js").RuntimePathFacts` (L165-169)
- @brief Builds the shared runtime path facts for the current command or tool context.
- @details Derives installation, execution, base, config, resource, docs, test, source, and optional git paths from the cwd-derived project configuration plus runtime-only repository probing, then converts them into prompt/tool-facing strings. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. Side effects are limited to git subprocess execution.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {import("./core/path-context.js").RuntimePathFacts} Shared runtime path facts.
- @satisfies REQ-145, REQ-146

### fn `function loadProjectConfig(cwd: string): UseReqConfig` (L178-181)
- @brief Loads project configuration for the extension runtime.
- @details Resolves the project base, loads persisted config, and normalizes configured directory paths without reading or persisting runtime-derived `base-path` or `git-path` metadata. Runtime is dominated by config I/O. Side effects are limited to filesystem reads.
- @param[in] cwd {string} Current working directory.
- @return {UseReqConfig} Effective project configuration.
- @satisfies REQ-030, REQ-145, REQ-146

### fn `function saveProjectConfig(cwd: string, config: UseReqConfig): void` (L191-194)
- @brief Persists project configuration from the extension runtime.
- @details Resolves the project base, normalizes configured directory paths into project-relative form, and delegates persistence to `saveConfig` without serializing runtime-derived path metadata. Runtime is O(n) in config size. Side effects include config-file writes.
- @param[in] cwd {string} Current working directory.
- @param[in] config {UseReqConfig} Configuration to persist.
- @return {void} No return value.
- @satisfies REQ-146

### fn `function collectProjectStaticCheckSelection(` (L203-234)
- @brief Collects the project-scoped static-check selection used by the agent tool.
- @details Resolves configured source plus test directories, reuses the same fixture-root exclusions as `runProjectStaticCheck`, and returns canonical relative file paths for structured payload emission. Runtime is O(F) plus project file-discovery cost. Side effects are limited to filesystem reads and git subprocesses delegated through `collectSourceFiles`.
- @param[in] projectBase {string} Resolved project base path.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {{ selectionDirectoryPaths: string[]; excludedDirectoryPaths: string[]; selectedPaths: string[] }} Structured static-check selection facts.

### fn `function buildTokenToolExecutionStderr(payload: TokenToolPayload): string` (L242-248)
- @brief Builds execution diagnostics for one token-tool payload.
- @details Serializes skipped-input and read-error observations into stable stderr lines while leaving successful counted files silent. Runtime is O(n) in issue count. No side effects occur.
- @param[in] payload {TokenToolPayload} Structured token payload.
- @return {string} Newline-delimited execution diagnostics.

### fn `function buildTokenToolExecuteResult(` (L257-274)
- @brief Builds the agent-oriented execute result returned by token-count tools.
- @details Mirrors the structured token payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {TokenToolPayload} Structured token payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: TokenToolPayload & { execution: { code: number; stderr: string } } }} Token-tool execute result.
- @satisfies REQ-069, REQ-070, REQ-071, REQ-073, REQ-074, REQ-075, REQ-099, REQ-102

### fn `function buildReferenceToolExecuteResult(` (L283-300)
- @brief Builds the agent-oriented execute result returned by references tools.
- @details Mirrors the structured references payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {ReferenceToolPayload} Structured references payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: ReferenceToolPayload & { execution: { code: number; stderr: string } } }} References-tool execute result.
- @satisfies REQ-076, REQ-077, REQ-078, REQ-079, REQ-099, REQ-102

### fn `function buildCompressionToolExecuteResult(` (L309-326)
- @brief Builds the agent-oriented execute result returned by compression tools.
- @details Mirrors the structured compression payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {CompressToolPayload} Structured compression payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: CompressToolPayload & { execution: { code: number; stderr: string } } }} Compression-tool execute result.
- @satisfies REQ-081, REQ-082, REQ-083, REQ-084, REQ-085, REQ-087, REQ-088, REQ-099, REQ-102

### fn `function buildFindToolSupportedTagGuidelines(): string[]` (L387-391)
- @brief Builds the supported-tag guidance lines embedded in find-tool registrations.
- @details Emits one deterministic line per supported language containing its canonical registration label and sorted tag list so downstream agents can specialize requests without invoking the tool first. Runtime is O(l * t log t). No side effects occur.
- @return {string[]} Supported-tag guidance lines.

### fn `function buildFindToolSchemaDescription(scope: FindToolScope): string` (L399-404)
- @brief Builds the schema description for one find-tool registration.
- @details Specializes the input-scope sentence for explicit-file or configured-directory searches while keeping the JSON output contract stable and fully machine-readable. Runtime is O(1). No side effects occur.
- @param[in] scope {FindToolScope} Find-tool scope.
- @return {string} Parameter-schema description.

### fn `function buildFindToolPromptGuidelines(scope: FindToolScope): string[]` (L412-428)
- @brief Builds the prompt-guideline set for one find-tool registration.
- @details Encodes scope selection, output schema, regex semantics, line-number behavior, tag-filter rules, and the full language-to-tag matrix as stable agent-oriented strings. Runtime is O(l * t log t). No side effects occur.
- @param[in] scope {FindToolScope} Find-tool scope.
- @return {string[]} Prompt-guideline strings.

### fn `function buildFindToolExecuteResult(` (L437-455)
- @brief Builds the agent-oriented execute result returned by find tools.
- @details Mirrors the structured find payload into both the text `content` channel and the machine-readable `details` channel while isolating execution metadata under `execution`. Runtime is O(n) in payload size. No side effects occur.
- @param[in] payload {FindToolPayload} Structured find payload.
- @return {{ content: Array<{ type: "text"; text: string }>; details: FindToolPayload & { execution: { code: number; stderr: string } } }} Find-tool execute result.
- @satisfies REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-097, REQ-098, REQ-099, REQ-102

### fn `async function deliverPromptCommand(pi: ExtensionAPI, content: string): Promise<void>` (L465-467)
- @brief Delivers one rendered prompt into the active session.
- @details Writes the rendered prompt directly through `pi.sendUserMessage(...)` without creating replacement sessions or pre-reset flows. Runtime is O(n) in prompt length. Side effects are limited to user-message delivery.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] content {string} Rendered prompt markdown.
- @return {Promise<void>} Promise resolved after the prompt is queued for delivery.
- @satisfies REQ-004, REQ-067, REQ-068

### fn `function getPiUsereqStartupTools(pi: ExtensionAPI): ToolInfo[]` (L476-481)
- @brief Returns the configurable active-tool inventory visible to the extension.
- @details Filters runtime tools against the canonical configurable-tool set, thereby combining extension-owned tools with supported embedded pi CLI tools. Output order is sorted by tool name. Runtime is O(t log t). No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {ToolInfo[]} Sorted configurable tool descriptors.
- @satisfies REQ-007, REQ-063

### fn `function getConfiguredEnabledPiUsereqTools(config: UseReqConfig): string[]` (L489-493)
- @brief Normalizes and returns the configured enabled active tools.
- @details Reuses repository normalization rules, updates the config object in place, and returns the normalized array. Runtime is O(n) in configured tool count. Side effect: mutates `config["enabled-tools"]`.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {string[]} Normalized enabled tool names.

### fn `function getPiUsereqToolKind(tool: ToolInfo): "builtin" | "extension"` (L501-506)
- @brief Classifies one configurable tool as embedded or extension-owned.
- @details Uses the runtime `sourceInfo.source` field plus the supported embedded-name subset to produce one stable UI label. Runtime is O(1). No external state is mutated.
- @param[in] tool {ToolInfo} Runtime tool descriptor.
- @return {"builtin" | "extension"} Stable tool-kind label.

### fn `function applyConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig): void` (L516-533)
- @brief Applies the configured active-tool enablement to the current session.
- @details Preserves non-configurable active tools, removes every configurable tool from the active set, then re-adds only configured tools that exist in the current runtime inventory. Runtime is O(t). Side effects include `pi.setActiveTools(...)`.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {void} No return value.
- @satisfies REQ-009, REQ-064

### fn `async function handleExtensionStatusEvent(` (L553-573)
- @brief Handles one intercepted pi lifecycle hook for pi-usereq status updates.
- @details Applies session-start-specific resource validation, project-config
refresh, and startup-tool enablement before forwarding the originating hook
name and payload into the shared `updateExtensionStatus(...)` pipeline.
On `agent_end`, also dispatches configured pi-notify beep and sound effects.
Runtime is dominated by configuration loading during `session_start`; all
other hooks are O(1). Side effects include resource checks, active-tool
mutation, status updates, live-ticker disposal on shutdown, stdout writes,
and optional child-process spawning.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] hookName {PiUsereqStatusHookName} Intercepted hook name.
- @param[in] event {unknown} Hook payload forwarded by pi.
- @param[in] ctx {ExtensionContext} Active extension context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when hook processing completes.
- @satisfies REQ-117, REQ-118, REQ-119, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133

### fn `function registerExtensionStatusHooks(` (L586-599)
- @brief Registers shared wrappers for every supported pi lifecycle hook.
- @details Installs one generic wrapper per intercepted hook so every resource,
session, agent, model, tool, bash, and input event is routed through the
same extension-status update pipeline. Runtime is O(h) in registered hook
count. Side effects include hook registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies DES-002, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117

### fn `function setConfiguredPiUsereqTools(pi: ExtensionAPI, config: UseReqConfig, enabledTools: string[]): void` (L609-612)
- @brief Replaces the configured active-tool selection and applies it immediately.
- @details Normalizes the requested tool names, stores them in config, and synchronizes the active tool set with runtime registration state. Runtime is O(n + t). Side effect: mutates config and active tools.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] enabledTools {string[]} Requested enabled tool names.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {void} No return value.

### fn `function renderPiUsereqToolsReference(pi: ExtensionAPI, config: UseReqConfig): string` (L621-649)
- @brief Renders a textual reference for configurable-tool configuration and runtime state.
- @details Lists every configurable tool with configured enablement, runtime activation, builtin-versus-extension classification, source metadata, and optional descriptions. Runtime is O(t). No side effects occur.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Multiline tool-status report.

- type `type PiNotifyBeepConfigKey =` (L657)
- @brief Represents one persisted pi-notify beep flag key.
- @details Restricts menu toggles to the three independent prompt-end beep
flags stored in project configuration. Compile-time only and introduces no
runtime cost.
### fn `function togglePiNotifyBeepFlag(config: UseReqConfig, key: PiNotifyBeepConfigKey): boolean` (L669-672)
- @brief Flips one persisted pi-notify beep flag.
- @details Negates the selected prompt-end beep flag in place and returns the resulting boolean value so callers can emit deterministic UI feedback. Runtime is O(1). Side effect: mutates `config`.
- @param[in] key {PiNotifyBeepConfigKey} Beep flag key to toggle.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {boolean} Next enabled state.

### fn `function buildPiNotifyMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L681-738)
- @brief Builds the shared settings-menu choices for notification configuration.
- @details Serializes the current beep flags, selected notify command, hotkey bind, and per-level notify commands into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(1) plus command-length formatting. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered notification-menu choice vector.
- @satisfies REQ-137, REQ-149, REQ-150, REQ-151, REQ-152

### fn `async function selectPiNotifySoundLevel(` (L748-779)
- @brief Opens the shared settings-menu selector for the selected notify command.
- @details Reuses the pi-usereq settings-menu renderer so notify-command selection remains stylistically aligned with the main configuration UI and returns the chosen sound level or `undefined` on cancel. Runtime depends on user interaction count. Side effects are limited to transient custom-UI rendering.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in] currentLevel {PiNotifySoundLevel} Currently selected notify command.
- @return {Promise<PiNotifySoundLevel | undefined>} Selected sound level or `undefined` when cancelled.
- @satisfies REQ-131, REQ-137, REQ-149, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiNotifyMenu(` (L789-854)
- @brief Runs the interactive notification-configuration menu.
- @details Exposes prompt-end beep toggles, selected notify-command selection, hotkey-bind editing, and per-level notify-command editors through the shared settings-menu renderer. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<boolean>} `true` when the sound-toggle shortcut changed.
- @satisfies REQ-129, REQ-131, REQ-133, REQ-134, REQ-137, REQ-149, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function registerPiNotifyShortcut(` (L869-889)
- @brief Registers the configurable successful-run sound shortcut when supported.
- @details Loads the current project config, registers one raw pi shortcut when
the runtime exposes `registerShortcut(...)`, cycles persisted sound state on
invocation, saves the config, refreshes the status bar, and emits one info
notification. Runtime is O(1) for registration plus config I/O per shortcut
use. Side effects include shortcut registration, config writes, and status
updates.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-131, REQ-134, REQ-136

### fn `function registerPromptCommands(pi: ExtensionAPI): void` (L898-911)
- @brief Registers bundled prompt commands with the extension.
- @details Creates one `req-<prompt>` command per bundled prompt name. Each handler ensures resources exist, renders the prompt, and sends it into the current active session. Runtime is O(p) for registration; handler cost depends on prompt rendering plus prompt dispatch. Side effects include command registration and user-message delivery during execution.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-004, REQ-067, REQ-068

### fn `function registerAgentTools(pi: ExtensionAPI): void` (L921-1220)
- @brief Registers pi-usereq agent tools exposed to the model.
- @details Defines the tool schemas, prompt metadata, and execution handlers that bridge extension tool calls into tool-runner operations without registering duplicate custom slash commands for the same capabilities. Runtime is O(t) for registration; execution cost depends on the selected tool. Side effects include tool registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies REQ-005, REQ-010, REQ-011, REQ-014, REQ-017, REQ-044, REQ-045, REQ-069, REQ-070, REQ-071, REQ-072, REQ-073, REQ-074, REQ-075, REQ-076, REQ-077, REQ-078, REQ-079, REQ-080, REQ-089, REQ-090, REQ-091, REQ-092, REQ-093, REQ-094, REQ-095, REQ-096, REQ-097, REQ-098, REQ-099, REQ-100, REQ-101, REQ-102

### fn `function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1564-1604)
- @brief Builds the shared settings-menu choices for startup-tool management.
- @details Serializes startup-tool actions into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered startup-tool menu choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildPiUsereqToolToggleChoices(pi: ExtensionAPI, config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1614-1630)
- @brief Builds the shared settings-menu choices for per-tool startup toggles.
- @details Exposes every configurable startup tool as one row whose right-side value reports the current enabled state. Runtime is O(t) in configurable-tool count. No external state is mutated.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered per-tool toggle choices.
- @satisfies REQ-007, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereqToolsMenu(pi: ExtensionAPI, ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L1641-1692)
- @brief Runs the interactive active-tool configuration menu.
- @details Synchronizes runtime active tools with persisted config, renders startup-tool actions through the shared settings-menu UI, and updates configuration state in response to selections until the user exits. Runtime depends on user interaction count. Side effects include UI updates, active-tool changes, and config mutation.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-007, REQ-063, REQ-064, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function formatStaticCheckEntry(entry: StaticCheckEntry): string` (L1700-1706)
- @brief Formats one static-check configuration entry for UI display.
- @details Renders command-backed entries as `Command(cmd args...)` and all other modules as `Module(args...)`. Runtime is O(n) in parameter count. No side effects occur.
- @param[in] entry {StaticCheckEntry} Static-check configuration entry.
- @return {string} Human-readable entry summary.

### fn `function formatStaticCheckLanguagesSummary(config: UseReqConfig): string` (L1714-1720)
- @brief Summarizes configured static-check languages.
- @details Keeps only languages with at least one configured checker, sorts them, and emits a compact `Language (count)` list. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Compact summary string or `(none)`.

### fn `function renderStaticCheckReference(config: UseReqConfig): string` (L1728-1749)
- @brief Renders the static-check configuration reference view.
- @details Produces a markdown-like summary containing configured entries, supported languages, supported modules, and example specifications. Runtime is O(l log l). No side effects occur.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {string} Reference text for the editor view.

### fn `function buildStaticCheckMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1758-1793)
- @brief Builds the shared settings-menu choices for static-check management.
- @details Serializes static-check actions into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(1). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered static-check menu choices.
- @satisfies REQ-008, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildSupportedStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1801-1820)
- @brief Builds the shared settings-menu choices for supported static-check languages.
- @details Exposes every supported language as one row whose right-side value reports extensions plus the current configured checker count. Runtime is O(l log l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered language-choice vector.

### fn `function buildStaticCheckModuleChoices(language: string): PiUsereqSettingsMenuChoice[]` (L1828-1845)
- @brief Builds the shared settings-menu choices for static-check modules.
- @details Exposes every supported static-check module as one selectable row with a concise execution description. Runtime is O(m) in module count. No external state is mutated.
- @param[in] language {string} Canonical selected language.
- @return {PiUsereqSettingsMenuChoice[]} Ordered module-choice vector.

### fn `function buildConfiguredStaticCheckLanguageChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1853-1870)
- @brief Builds the shared settings-menu choices for configured static-check languages.
- @details Exposes only languages that currently have at least one configured checker so removal remains deterministic. Runtime is O(l log l). No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered configured-language vector.

### fn `async function configureStaticCheckMenu(ctx: ExtensionCommandContext, config: UseReqConfig): Promise<void>` (L1880-1953)
- @brief Runs the interactive static-check configuration menu.
- @details Lets the user inspect support, add entries by guided prompts or raw spec strings, and remove configured language entries through the shared settings-menu renderer until the user exits. Runtime depends on user interaction count. Side effects include UI updates and config mutation.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] config {UseReqConfig} Mutable configuration object.
- @return {Promise<void>} Promise resolved when the menu closes.
- @satisfies REQ-008, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildPiUsereqMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L1962-2019)
- @brief Builds the shared settings-menu choices for the top-level pi-usereq configuration UI.
- @details Serializes primary configuration actions into right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered top-level menu choices.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152

### fn `function buildSrcDirMenuChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2028-2049)
- @brief Builds the shared settings-menu choices for source-directory management.
- @details Exposes add and remove actions for `src-dir` entries through right-valued menu rows consumed by the shared settings-menu renderer. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered source-directory management choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `function buildSrcDirRemovalChoices(config: UseReqConfig): PiUsereqSettingsMenuChoice[]` (L2058-2073)
- @brief Builds the shared settings-menu choices for removing one source-directory entry.
- @details Exposes every configured `src-dir` entry as one removable row and appends a `Back` action for cancellation. Runtime is O(s) in source-directory count. No external state is mutated.
- @param[in] config {UseReqConfig} Effective project configuration.
- @return {PiUsereqSettingsMenuChoice[]} Ordered removable source-directory choices.
- @satisfies REQ-006, REQ-151, REQ-152, REQ-153, REQ-154

### fn `async function configurePiUsereq(` (L2084-2165)
- @brief Runs the top-level pi-usereq configuration menu.
- @details Loads project config, exposes docs/test/source/static-check/startup-tool/notification actions through the shared settings-menu renderer, persists changes on exit, and refreshes the single-line status bar. Runtime depends on user interaction count. Side effects include UI updates, config writes, and active-tool changes.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in] ctx {ExtensionCommandContext} Active command context.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {Promise<void>} Promise resolved when configuration is saved and the menu closes.
- @satisfies REQ-006, REQ-031, REQ-137, REQ-150, REQ-151, REQ-152, REQ-153, REQ-154

### fn `const ensureSaved = () => saveProjectConfig(ctx.cwd, config)` (L2092-2096)

### fn `const refreshStatus = () =>` (L2093-2096)

### fn `function registerConfigCommands(` (L2175-2185)
- @brief Registers configuration-management commands.
- @details Adds the interactive `pi-usereq` configuration command only; the config-viewer action is now exposed exclusively inside that menu. Runtime is O(1) for registration. Side effects include command registration.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @param[in,out] statusController {PiUsereqStatusController} Mutable status controller.
- @return {void} No return value.
- @satisfies REQ-006, REQ-031

### fn `export default function piUsereqExtension(pi: ExtensionAPI): void` (L2201-2209)
- @brief Registers the complete pi-usereq extension.
- @details Validates installation-owned bundled resources, registers prompt and
configuration commands plus agent tools, registers the configurable
successful-run sound shortcut when the runtime supports shortcuts, and
installs shared wrappers for all supported pi lifecycle hooks so status
telemetry, context usage, prompt timing, and pi-notify effects remain
synchronized with runtime events. Runtime is O(h) in hook count during
registration. Side effects include filesystem reads, command/tool/shortcut
registration, UI updates, active-tool changes, and timer scheduling.
- @param[in] pi {ExtensionAPI} Active extension API instance.
- @return {void} No return value.
- @satisfies DES-002, REQ-004, REQ-005, REQ-009, REQ-044, REQ-045, REQ-067, REQ-068, REQ-109, REQ-110, REQ-111, REQ-112, REQ-113, REQ-114, REQ-115, REQ-116, REQ-117, REQ-118, REQ-119, REQ-120, REQ-121, REQ-122, REQ-123, REQ-124, REQ-125, REQ-126, REQ-129, REQ-130, REQ-131, REQ-132, REQ-133, REQ-134, REQ-135, REQ-136, REQ-137

## Symbol Index
|Symbol|Kind|Vis|Lines|Sig|
|---|---|---|---|---|
|`PiShortcutRegistrar`|iface||137-145|interface PiShortcutRegistrar|
|`getProjectBase`|fn||153-155|function getProjectBase(cwd: string): string|
|`buildSharedRuntimePathFacts`|fn||165-169|function buildSharedRuntimePathFacts(cwd: string, config:...|
|`loadProjectConfig`|fn||178-181|function loadProjectConfig(cwd: string): UseReqConfig|
|`saveProjectConfig`|fn||191-194|function saveProjectConfig(cwd: string, config: UseReqCon...|
|`collectProjectStaticCheckSelection`|fn||203-234|function collectProjectStaticCheckSelection(|
|`buildTokenToolExecutionStderr`|fn||242-248|function buildTokenToolExecutionStderr(payload: TokenTool...|
|`buildTokenToolExecuteResult`|fn||257-274|function buildTokenToolExecuteResult(|
|`buildReferenceToolExecuteResult`|fn||283-300|function buildReferenceToolExecuteResult(|
|`buildCompressionToolExecuteResult`|fn||309-326|function buildCompressionToolExecuteResult(|
|`buildFindToolSupportedTagGuidelines`|fn||387-391|function buildFindToolSupportedTagGuidelines(): string[]|
|`buildFindToolSchemaDescription`|fn||399-404|function buildFindToolSchemaDescription(scope: FindToolSc...|
|`buildFindToolPromptGuidelines`|fn||412-428|function buildFindToolPromptGuidelines(scope: FindToolSco...|
|`buildFindToolExecuteResult`|fn||437-455|function buildFindToolExecuteResult(|
|`deliverPromptCommand`|fn||465-467|async function deliverPromptCommand(pi: ExtensionAPI, con...|
|`getPiUsereqStartupTools`|fn||476-481|function getPiUsereqStartupTools(pi: ExtensionAPI): ToolI...|
|`getConfiguredEnabledPiUsereqTools`|fn||489-493|function getConfiguredEnabledPiUsereqTools(config: UseReq...|
|`getPiUsereqToolKind`|fn||501-506|function getPiUsereqToolKind(tool: ToolInfo): "builtin" |...|
|`applyConfiguredPiUsereqTools`|fn||516-533|function applyConfiguredPiUsereqTools(pi: ExtensionAPI, c...|
|`handleExtensionStatusEvent`|fn||553-573|async function handleExtensionStatusEvent(|
|`registerExtensionStatusHooks`|fn||586-599|function registerExtensionStatusHooks(|
|`setConfiguredPiUsereqTools`|fn||609-612|function setConfiguredPiUsereqTools(pi: ExtensionAPI, con...|
|`renderPiUsereqToolsReference`|fn||621-649|function renderPiUsereqToolsReference(pi: ExtensionAPI, c...|
|`PiNotifyBeepConfigKey`|type||657||
|`togglePiNotifyBeepFlag`|fn||669-672|function togglePiNotifyBeepFlag(config: UseReqConfig, key...|
|`buildPiNotifyMenuChoices`|fn||681-738|function buildPiNotifyMenuChoices(config: UseReqConfig): ...|
|`selectPiNotifySoundLevel`|fn||748-779|async function selectPiNotifySoundLevel(|
|`configurePiNotifyMenu`|fn||789-854|async function configurePiNotifyMenu(|
|`registerPiNotifyShortcut`|fn||869-889|function registerPiNotifyShortcut(|
|`registerPromptCommands`|fn||898-911|function registerPromptCommands(pi: ExtensionAPI): void|
|`registerAgentTools`|fn||921-1220|function registerAgentTools(pi: ExtensionAPI): void|
|`buildPiUsereqToolsMenuChoices`|fn||1564-1604|function buildPiUsereqToolsMenuChoices(pi: ExtensionAPI, ...|
|`buildPiUsereqToolToggleChoices`|fn||1614-1630|function buildPiUsereqToolToggleChoices(pi: ExtensionAPI,...|
|`configurePiUsereqToolsMenu`|fn||1641-1692|async function configurePiUsereqToolsMenu(pi: ExtensionAP...|
|`formatStaticCheckEntry`|fn||1700-1706|function formatStaticCheckEntry(entry: StaticCheckEntry):...|
|`formatStaticCheckLanguagesSummary`|fn||1714-1720|function formatStaticCheckLanguagesSummary(config: UseReq...|
|`renderStaticCheckReference`|fn||1728-1749|function renderStaticCheckReference(config: UseReqConfig)...|
|`buildStaticCheckMenuChoices`|fn||1758-1793|function buildStaticCheckMenuChoices(config: UseReqConfig...|
|`buildSupportedStaticCheckLanguageChoices`|fn||1801-1820|function buildSupportedStaticCheckLanguageChoices(config:...|
|`buildStaticCheckModuleChoices`|fn||1828-1845|function buildStaticCheckModuleChoices(language: string):...|
|`buildConfiguredStaticCheckLanguageChoices`|fn||1853-1870|function buildConfiguredStaticCheckLanguageChoices(config...|
|`configureStaticCheckMenu`|fn||1880-1953|async function configureStaticCheckMenu(ctx: ExtensionCom...|
|`buildPiUsereqMenuChoices`|fn||1962-2019|function buildPiUsereqMenuChoices(config: UseReqConfig): ...|
|`buildSrcDirMenuChoices`|fn||2028-2049|function buildSrcDirMenuChoices(config: UseReqConfig): Pi...|
|`buildSrcDirRemovalChoices`|fn||2058-2073|function buildSrcDirRemovalChoices(config: UseReqConfig):...|
|`configurePiUsereq`|fn||2084-2165|async function configurePiUsereq(|
|`ensureSaved`|fn||2092-2096|const ensureSaved = () => saveProjectConfig(ctx.cwd, config)|
|`refreshStatus`|fn||2093-2096|const refreshStatus = () =>|
|`registerConfigCommands`|fn||2175-2185|function registerConfigCommands(|
|`piUsereqExtension`|fn||2201-2209|export default function piUsereqExtension(pi: ExtensionAP...|

