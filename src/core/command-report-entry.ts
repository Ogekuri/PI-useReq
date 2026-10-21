/**
 * @file
 * @brief Persists durable non-agentic command execution reports as custom session entries.
 * @details Defines the stable custom-entry type, machine-readable report payload, builders for `req-references` outcome lines, and the pi guarded helpers that append the report entry and register its transcript renderer. Custom entries are stored in the session file, excluded from LLM context, rendered live through `entry_appended`, and re-rendered after any session restore, so transient UI-notification collapsing or chat rebuilds never lose the executed-commands outcome report. Runtime is O(n) in report-line count. Side effects are limited to session-entry persistence and renderer registration through the pi extension API.
 */

import type {
  CustomEntry,
  EntryRenderOptions,
  EntryRenderer,
  ExtensionAPI,
  Theme,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { formatRuntimePathForDisplay } from "./path-context.js";
import type { ReqReferencesCommandExecutionResult } from "./req-references-command.js";

/**
 * @brief Declares the stable custom-entry type used for durable command execution reports.
 * @details Identifies `pi-usereq` report entries inside the persisted session file so interactive mode renders them through the registered entry renderer after reload, resume, fork, and session switches. Lookup complexity is O(1).
 */
export const COMMAND_REPORT_ENTRY_TYPE = "pi-usereq.command-report";

/**
 * @brief Describes one durable command execution report entry payload.
 * @details Stores the originating slash-command name, the report severity, the terminal outcome, and the ordered per-operation outcome lines rendered in the transcript. The interface is compile-time only and introduces no runtime cost.
 */
export interface CommandReportEntryData {
  command: string;
  level: "info" | "error";
  outcome: "success" | "error";
  lines: string[];
}

/**
 * @brief Describes the loosely-typed pi runtime surface required for durable report entries.
 * @details Narrows the extension API to the optional `registerEntryRenderer(...)` and `appendEntry(...)` methods consumed by the guarded report helpers so legacy hosts and offline harnesses without custom-entry support degrade silently instead of throwing. The interface is compile-time only and introduces no runtime cost.
 */
interface CommandReportEntryRegistrar {
  registerEntryRenderer?: (
    customType: string,
    renderer: EntryRenderer<CommandReportEntryData>,
  ) => void;
  appendEntry?: (customType: string, data?: CommandReportEntryData) => void;
}

/**
 * @brief Validates one loosely-typed payload as a command report entry payload.
 * @details Accepts only payloads with a non-empty command string, the documented `info|error` level, the documented `success|error` outcome, and a string-only lines array so malformed session data never reaches the transcript renderer. Runtime is O(n) in line count. No external state is mutated.
 * @param[in] value {unknown} Candidate persisted payload.
 * @return {boolean} `true` when the payload satisfies the report entry contract.
 */
function isCommandReportEntryData(value: unknown): value is CommandReportEntryData {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<CommandReportEntryData>;
  return typeof candidate.command === "string"
    && candidate.command.trim() !== ""
    && (candidate.level === "info" || candidate.level === "error")
    && (candidate.outcome === "success" || candidate.outcome === "error")
    && Array.isArray(candidate.lines)
    && candidate.lines.every((line) => typeof line === "string");
}

/**
 * @brief Builds the ordered per-operation outcome lines for one completed `req-references` run.
 * @details Emits one machine-readable line per executed operation — terminal outcome, references-file regeneration result, guarded git-commit result, and post-run repository cleanliness — so the durable report states exactly which commands ran and with which outcome. Runtime is O(n) in path length. No external state is mutated.
 * @param[in] executionResult {ReqReferencesCommandExecutionResult} Per-operation outcome facts of the completed run.
 * @return {string[]} Ordered report lines starting with the terminal outcome.
 * @satisfies REQ-436, REQ-437, REQ-438
 */
export function buildReqReferencesCommandReportLines(
  executionResult: ReqReferencesCommandExecutionResult,
): string[] {
  const referencesDisplayPath = formatRuntimePathForDisplay(executionResult.referencesPath);
  return [
    `outcome: success`,
    `references file ${referencesDisplayPath}: ${
      executionResult.referencesChanged ? "updated" : "already matched the generated content"
    }`,
    `git commit: ${
      executionResult.commitCreated
        ? `created "${executionResult.commitMessage}"`
        : "skipped (references content matched HEAD)"
    }`,
    "repository: clean after run",
  ];
}

/**
 * @brief Builds the durable report entry payload for one completed `req-references` run.
 * @details Pairs the invokable command name with the per-operation outcome lines and the `success` outcome. Runtime is O(n) in report-line count. No external state is mutated.
 * @param[in] executionResult {ReqReferencesCommandExecutionResult} Per-operation outcome facts of the completed run.
 * @return {CommandReportEntryData} Report entry payload for session persistence.
 * @satisfies REQ-436, REQ-437, REQ-438
 */
export function buildReqReferencesCommandReportEntryData(
  executionResult: ReqReferencesCommandExecutionResult,
): CommandReportEntryData {
  return {
    command: "req-references",
    level: "info",
    outcome: "success",
    lines: buildReqReferencesCommandReportLines(executionResult),
  };
}

/**
 * @brief Builds the durable report entry payload for one failed non-agentic command run.
 * @details Records the invokable command name, the `error` outcome, and the surfaced failure diagnostic so failed runs keep their outcome evidence in the transcript. Runtime is O(n) in message length. No external state is mutated.
 * @param[in] command {string} Invokable slash-command name that failed.
 * @param[in] errorMessage {string} Surfaced failure diagnostic.
 * @return {CommandReportEntryData} Report entry payload for session persistence.
 */
export function buildCommandReportErrorEntryData(
  command: string,
  errorMessage: string,
): CommandReportEntryData {
  return {
    command,
    level: "error",
    outcome: "error",
    lines: [`outcome: error`, `error: ${errorMessage}`],
  };
}

/**
 * @brief Appends one durable command report entry to the active session when the host supports custom entries.
 * @details Probes the optional `pi.appendEntry(...)` surface before use so legacy hosts and offline harnesses without custom-entry support skip persistence silently; supported hosts persist the payload as a `custom` session entry that survives session restore while remaining excluded from LLM context. Runtime is O(1) plus delegated session-entry persistence. Side effects include session-file entry persistence on supported hosts.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @param[in] data {CommandReportEntryData} Report entry payload to persist.
 * @return {boolean} `true` when the entry was appended; `false` when the host lacks the custom-entry surface.
 */
export function appendCommandReportEntry(pi: ExtensionAPI, data: CommandReportEntryData): boolean {
  const registrar = pi as ExtensionAPI & CommandReportEntryRegistrar;
  if (typeof registrar.appendEntry !== "function") {
    return false;
  }
  registrar.appendEntry(COMMAND_REPORT_ENTRY_TYPE, data);
  return true;
}

/**
 * @brief Renders one durable command report entry as a transcript component.
 * @details Maps the report payload into a themed multi-line `Text` — header colored `error` for failed runs and `accent` otherwise, body lines colored `error` for failed runs and `muted` otherwise — and returns `undefined` for malformed payloads so the host transcript skips undisplayable entries. Runtime is O(n) in aggregate report-line length. No external state is mutated.
 * @param[in] entry {CustomEntry<CommandReportEntryData>} Persisted custom report entry.
 * @param[in] _options {EntryRenderOptions} Host render options; retained for renderer-signature compatibility.
 * @param[in] theme {Theme} Active pi theme used for color tokens.
 * @return {Component | undefined} Transcript component, or `undefined` when the payload is malformed.
 */
function renderCommandReportEntry(
  entry: CustomEntry<CommandReportEntryData>,
  _options: EntryRenderOptions,
  theme: Theme,
): Component | undefined {
  if (!isCommandReportEntryData(entry.data)) {
    return undefined;
  }
  const data = entry.data;
  const isError = data.level === "error";
  const headerColor = isError ? "error" : "accent";
  const bodyColor = isError ? "error" : "muted";
  const header = theme.fg(headerColor, `pi-usereq ${data.command}: execution report`);
  const body = data.lines.map((line) => theme.fg(bodyColor, line)).join("\n");
  return new Text(`${header}\n${body}`, 1, 0);
}

/**
 * @brief Registers the durable command report transcript renderer when the host supports entry rendering.
 * @details Probes the optional `pi.registerEntryRenderer(...)` surface before use so legacy hosts and offline harnesses without custom-entry rendering skip registration silently; supported hosts bind the renderer for `pi-usereq.command-report` entries so appended reports render in the live transcript and re-render after every session restore. Runtime is O(1). Side effects include entry-renderer registration on supported hosts.
 * @param[in] pi {ExtensionAPI} Active extension API instance.
 * @return {void} No return value.
 */
export function registerCommandReportEntryRenderer(pi: ExtensionAPI): void {
  const registrar = pi as ExtensionAPI & CommandReportEntryRegistrar;
  if (typeof registrar.registerEntryRenderer !== "function") {
    return;
  }
  registrar.registerEntryRenderer(COMMAND_REPORT_ENTRY_TYPE, renderCommandReportEntry);
}
