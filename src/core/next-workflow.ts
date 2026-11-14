/**
 * @file
 * @brief Implements Next-Workflow command capture, process-scoped storage, list rendering, `/req-continue` selection, and `/req-continue-list` printing helpers.
 * @details Maps the `next_commands` entries of the parsed final-output JSON into pi-usereq slash commands plus input-text pairs captured in one process-scoped Next-Workflow array that survives extension rebinds and `/new` session starts, renders the numbered list appended after the final context-retention notification, resolves one-based ordinal selection, and stores the reusable command handlers that let `/req-continue` delegate exactly like a manual user invocation. Runtime is O(n) in captured entry count per capture and O(1) per store access. Side effects are limited to process-scoped state mutation; no configuration file is written.
 * @satisfies DES-040, REQ-653, REQ-654, REQ-655, REQ-656, REQ-657, REQ-658, REQ-659, REQ-662, REQ-663, REQ-672, REQ-676
 */

import { type AgentFinalOutputCommandEntry, type AgentFinalOutputParse, resetAgentFinalOutputStateForTests } from "./agent-final-output.js";
import { ReqError } from "./errors.js";
import { PROMPT_COMMAND_NAMES } from "./prompt-command-catalog.js";

/**
 * @brief Lists the specialized non-prompt pi-usereq commands eligible for Next-Workflow capture.
 * @details Extends the bundled prompt-command inventory with `req-references`, `req-reset`, and the `/req-continue` exception so chained continuations stay capturable while every non-pi-usereq orchestration command is purged from the array. Access complexity is O(1).
 * @satisfies REQ-655, REQ-659
 */
export const NEXT_WORKFLOW_SPECIALIZED_COMMAND_NAMES = [
  "req-references",
  "req-reset",
  "req-continue",
] as const;

/**
 * @brief Lists every pi-usereq slash command accepted inside the Next-Workflow array.
 * @details Combines the bundled prompt-backed commands with the specialized commands in canonical order; this inventory implements the Next-Workflow purge rule that drops every non-pi-usereq orchestration command while keeping the `/req-continue` exception. Access complexity is O(1) per exported constant access.
 * @satisfies REQ-655
 */
export const NEXT_WORKFLOW_COMMAND_NAMES: readonly string[] = [
  ...PROMPT_COMMAND_NAMES.map((promptName) => `req-${promptName}`),
  ...NEXT_WORKFLOW_SPECIALIZED_COMMAND_NAMES,
];

const NEXT_WORKFLOW_COMMAND_SET: ReadonlySet<string> = new Set(NEXT_WORKFLOW_COMMAND_NAMES);

/**
 * @brief Stores the dedicated `/req-continue` slash-command description.
 * @details Rendered verbatim by the extension command registration so `/req-continue` never depends on a bundled prompt Markdown heading. Access complexity is O(1).
 * @satisfies REQ-659
 */
export const REQ_CONTINUE_COMMAND_DESCRIPTION =
  "Continue the previous agentic workflow with a captured Next-Workflow command";

/**
 * @brief Stores the dedicated `/req-continue-list` slash-command description.
 * @details Rendered verbatim by the extension command registration so `/req-continue-list` never depends on a bundled prompt Markdown heading. Access complexity is O(1).
 * @satisfies REQ-671
 */
export const REQ_CONTINUE_LIST_COMMAND_DESCRIPTION =
  "Print the full captured Next-Workflow command list";

/**
 * @brief Describes one captured Next-Workflow command entry.
 * @details Pairs the invokable pi-usereq command name without the leading slash with the captured `next_commands` input text, preserving the entry order of the final-output JSON. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-654
 */
export interface NextWorkflowCommandEntry {
  /** Invokable pi-usereq command name without the leading slash, such as `req-change`. */
  command: string;
  /** Remaining entry lines joined with newlines; empty for commands without input text. */
  inputText: string;
}

/**
 * @brief Describes the loosely-typed command handler dispatched by `/req-continue`.
 * @details Mirrors the pi `registerCommand(...)` handler contract `(args, ctx) => Promise<void>` through deliberately loose structural typing: the `any` context parameter keeps every concrete registered handler assignable despite `strictFunctionTypes` contravariance while delegation forwards the live command context unchanged, so this module never imports concrete pi extension types. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-663
 */
export type NextWorkflowCommandHandler = (args: string, ctx: any) => unknown;

/**
 * @brief Stores the process-scoped Next-Workflow state persisted across extension rebinds.
 * @details Holds the captured command entries and the latest command-handler registry on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists, so the array captured by one completed agentic flow stays consumable by `/req-continue` in the successor session. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-656
 */
interface ProcessScopedNextWorkflowStore {
  /** Captured command entries of the last completed agentic flow in entry order. */
  entries: NextWorkflowCommandEntry[];
  /** Latest command handlers registered by the most recent extension bind, keyed by invokable command name. */
  handlers: Map<string, NextWorkflowCommandHandler>;
}

type GlobalNextWorkflowStore = typeof globalThis & {
  __piUsereqNextWorkflowStore?: ProcessScopedNextWorkflowStore;
};

/**
 * @brief Returns the process-scoped Next-Workflow store.
 * @details Lazily initializes one `globalThis` record so session rebinds reuse the captured array and the latest handler registry instead of resetting them. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedNextWorkflowStore} Mutable process-scoped Next-Workflow store.
 * @note Complexity: O(1). Side effect limited to first-access initialization.
 */
function getNextWorkflowStore(): ProcessScopedNextWorkflowStore {
  const store = globalThis as GlobalNextWorkflowStore;
  if (store.__piUsereqNextWorkflowStore === undefined) {
    store.__piUsereqNextWorkflowStore = { entries: [], handlers: new Map() };
  }
  return store.__piUsereqNextWorkflowStore;
}

/**
 * @brief Appends one parsed `next_commands` entry when it names an allowed pi-usereq command.
 * @details Drops the entry when the normalized command is outside the pi-usereq inventory so non-pi-usereq orchestration commands are purged while `/req-continue` stays, and carries the entry `text` verbatim as the input text. Runtime is O(1). No external state is mutated.
 * @param[in,out] entries {NextWorkflowCommandEntry[]} Entry accumulator in entry order.
 * @param[in] entry {AgentFinalOutputCommandEntry} Normalized `next_commands` entry of the final-output JSON.
 * @return {void} No return value.
 * @satisfies REQ-654, REQ-655
 * @note Complexity: O(1).
 */
function appendNextWorkflowEntry(
  entries: NextWorkflowCommandEntry[],
  entry: AgentFinalOutputCommandEntry,
): void {
  if (!NEXT_WORKFLOW_COMMAND_SET.has(entry.command)) {
    // Purge rule: non-pi-usereq orchestration commands never enter the array; the
    // `/req-continue` exception stays eligible because its name is in the inventory.
    return;
  }
  entries.push({ command: entry.command, inputText: entry.text });
}

/**
 * @brief Maps the `next_commands` entries of one parsed final-output JSON into Next-Workflow entries.
 * @details Iterates the normalized `next_commands` entries in payload order, keeps each entry naming a pi-usereq slash command with its verbatim input text, and purges every non-pi-usereq orchestration command while keeping the `/req-continue` exception; one invalid final-output parse yields no entry because no consumable JSON object exists. Runtime is O(n) in entry count. No external state is mutated.
 * @param[in] finalOutput {AgentFinalOutputParse} Parse result of the terminal agent output.
 * @return {NextWorkflowCommandEntry[]} Captured command entries in payload order.
 * @satisfies REQ-653, REQ-654, REQ-655
 * @note Complexity: O(n) in entry count. Pure; no side effects.
 */
export function parseNextWorkflowCommandEntries(
  finalOutput: AgentFinalOutputParse,
): NextWorkflowCommandEntry[] {
  if (!finalOutput.ok) {
    return [];
  }
  const entries: NextWorkflowCommandEntry[] = [];
  for (const entry of finalOutput.report.next_commands) {
    appendNextWorkflowEntry(entries, entry);
  }
  return entries;
}

/**
 * @brief Captures the Next-Workflow commands of one parsed final agent output into the process-scoped array.
 * @details Maps the `next_commands` entries of the final-output JSON and replaces the stored array so the captured commands always reflect the last captured completed agentic flow, including the empty result when the terminal output parses to no valid final-output JSON. Runtime is O(n) in entry count. Side effect: replaces process-scoped capture state.
 * @param[in] finalOutput {AgentFinalOutputParse} Parse result of the terminal agent output of the completed run.
 * @return {NextWorkflowCommandEntry[]} Captured command entries in payload order.
 * @satisfies REQ-653, REQ-654, REQ-655, REQ-656
 * @note Complexity: O(n) in entry count.
 */
export function captureNextWorkflowCommands(finalOutput: AgentFinalOutputParse): NextWorkflowCommandEntry[] {
  const entries = parseNextWorkflowCommandEntries(finalOutput);
  getNextWorkflowStore().entries = entries;
  return entries;
}

/**
 * @brief Returns a detached snapshot of the captured Next-Workflow commands.
 * @details Copies the process-scoped entries so callers can inspect or iterate the array without mutating the stored state. Runtime is O(n) in entry count. No external state is mutated.
 * @return {NextWorkflowCommandEntry[]} Detached entry snapshot in capture order.
 * @satisfies REQ-656
 * @note Complexity: O(n) in entry count.
 */
export function getNextWorkflowCommands(): NextWorkflowCommandEntry[] {
  return [...getNextWorkflowStore().entries];
}

/**
 * @brief Clears the captured Next-Workflow commands.
 * @details Resets the process-scoped array to empty. The wipe runs only at the idle-reset bootstrap boundaries (`startup|reload` `session_start`) and immediately before prompt dispatch of a `new` agentic flow after every slash-command pre-check has succeeded, so failed pre-checks preserve queued commands and `/req-reset` recovery never clears the array. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @satisfies REQ-656, REQ-669, REQ-670
 * @note Complexity: O(1).
 */
export function clearNextWorkflowCommands(): void {
  getNextWorkflowStore().entries = [];
}

/**
 * @brief Registers the reusable handler for one pi-usereq command dispatched by `/req-continue`.
 * @details Stores the supplied handler keyed by the invokable command name in the process-scoped registry, replacing any handler from an earlier extension bind so delegation always binds to the most recent registration. Runtime is O(1). Side effect: mutates process-scoped registry state.
 * @param[in] command {string} Invokable pi-usereq command name without the leading slash.
 * @param[in] handler {NextWorkflowCommandHandler} Registered command handler.
 * @return {void} No return value.
 * @satisfies REQ-663
 * @note Complexity: O(1).
 */
export function registerNextWorkflowCommandHandler(
  command: string,
  handler: NextWorkflowCommandHandler,
): void {
  getNextWorkflowStore().handlers.set(command, handler);
}

/**
 * @brief Resolves the registered handler for one captured command name.
 * @details Returns `undefined` when no extension bind registered the requested command so `/req-continue` surfaces a deterministic diagnostic instead of dispatching an unknown symbol. Runtime is O(1). No external state is mutated.
 * @param[in] command {string} Invokable pi-usereq command name without the leading slash.
 * @return {NextWorkflowCommandHandler | undefined} Registered handler, or `undefined` when absent.
 * @satisfies REQ-663
 * @note Complexity: O(1).
 */
export function resolveNextWorkflowCommandHandler(command: string): NextWorkflowCommandHandler | undefined {
  return getNextWorkflowStore().handlers.get(command);
}

const NEXT_WORKFLOW_CONDENSED_PREFIX_LENGTH = 20;
const NEXT_WORKFLOW_CONDENSED_SUFFIX_LENGTH = 10;
const NEXT_WORKFLOW_CONDENSED_VERBATIM_LIMIT =
  NEXT_WORKFLOW_CONDENSED_PREFIX_LENGTH + NEXT_WORKFLOW_CONDENSED_SUFFIX_LENGTH;

/**
 * @brief Condenses one captured input text for single-line list rendering.
 * @details Collapses every whitespace run, including newlines, into one space so the numbered list keeps one command per line, then renders inputs longer than the 30-character verbatim limit as the first 20 characters followed by `...` followed by the last 10 characters and shorter inputs verbatim. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] inputText {string} Captured input text.
 * @return {string} Single-line condensed quotation text.
 * @satisfies REQ-657, REQ-658
 * @note Complexity: O(n) in input length. Pure; no side effects.
 */
export function condenseNextWorkflowInputText(inputText: string): string {
  const normalized = inputText.replace(/\s+/g, " ").trim();
  if (normalized.length <= NEXT_WORKFLOW_CONDENSED_VERBATIM_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, NEXT_WORKFLOW_CONDENSED_PREFIX_LENGTH)}...${normalized.slice(
    -NEXT_WORKFLOW_CONDENSED_SUFFIX_LENGTH,
  )}`;
}

/**
 * @brief Renders the numbered Next-Workflow list appended after the retention line.
 * @details Emits one numbered line per captured entry in capture order, formatting commands without input text as the bare slash command and commands with input text as the slash command plus one double-quoted condensed quotation. Runtime is O(n) in aggregate entry length. No external state is mutated.
 * @param[in] entries {readonly NextWorkflowCommandEntry[]} Captured command entries.
 * @return {string} Newline-delimited numbered list, or the empty string when no entry exists.
 * @satisfies REQ-657, REQ-658
 * @note Complexity: O(n) in aggregate entry length. Pure; no side effects.
 */
export function formatNextWorkflowList(entries: readonly NextWorkflowCommandEntry[]): string {
  return entries
    .map((entry, index) => {
      const commandText = `/${entry.command}`;
      const inputText = condenseNextWorkflowInputText(entry.inputText);
      return inputText === "" ? `${index + 1}. ${commandText}` : `${index + 1}. ${commandText} "${inputText}"`;
    })
    .join("\n");
}

/**
 * @brief Stores the empty-list placeholder printed by `/req-continue-list` when no Next-Workflow entry is captured.
 * @details Returned verbatim by `formatNextWorkflowFullList` so the `/req-continue-list` editor payload stays deterministic for empty arrays. Access complexity is O(1).
 * @satisfies REQ-676
 */
export const NEXT_WORKFLOW_EMPTY_LIST_TEXT = "No captured Next-Workflow commands.";

/**
 * @brief Renders the complete numbered Next-Workflow entry list with full input text for `/req-continue-list`.
 * @details Emits one numbered line per captured entry in capture order, formatting commands without input text as the bare slash command and commands with input text as the slash command plus one double-quoted input text rendered verbatim without truncation or whitespace collapsing, so the printed list exposes the exact argument text that `/req-continue` delegates to the selected command. Returns `NEXT_WORKFLOW_EMPTY_LIST_TEXT` when no entry is captured. Runtime is O(n) in aggregate entry length. No external state is mutated.
 * @param[in] entries {readonly NextWorkflowCommandEntry[]} Captured command entries.
 * @return {string} Newline-delimited numbered list with full input text, or `NEXT_WORKFLOW_EMPTY_LIST_TEXT` when no entry exists.
 * @satisfies REQ-672, REQ-676
 * @note Complexity: O(n) in aggregate entry length. Pure; no side effects.
 * @see formatNextWorkflowList
 */
export function formatNextWorkflowFullList(entries: readonly NextWorkflowCommandEntry[]): string {
  if (entries.length === 0) {
    return NEXT_WORKFLOW_EMPTY_LIST_TEXT;
  }
  return entries
    .map((entry, index) => {
      const commandText = `/${entry.command}`;
      return entry.inputText === ""
        ? `${index + 1}. ${commandText}`
        : `${index + 1}. ${commandText} "${entry.inputText}"`;
    })
    .join("\n");
}

/**
 * @brief Resolves the zero-based entry index selected by one `/req-continue` argument.
 * @details Maps the empty argument to the first entry, requires a non-negative decimal integer for any other argument, throws a deterministic diagnostic for non-numeric arguments, and throws a range diagnostic when the one-based ordinal exceeds the captured entry count. Runtime is O(n) in argument length. No external state is mutated.
 * @param[in] rawArgs {string} Raw `/req-continue` argument string.
 * @param[in] entryCount {number} Captured Next-Workflow entry count.
 * @return {number} Zero-based selected entry index.
 * @throws {ReqError} Throws when the argument is non-numeric or the ordinal is outside `1..entryCount`.
 * @satisfies REQ-661, REQ-662
 * @note Complexity: O(n) in argument length. Pure aside from thrown diagnostics.
 */
export function resolveNextWorkflowEntryIndex(rawArgs: string, entryCount: number): number {
  const trimmedArgs = rawArgs.trim();
  if (trimmedArgs === "") {
    return 0;
  }
  if (!/^\d+$/.test(trimmedArgs)) {
    throw new ReqError(
      `ERROR: /req-continue expects an optional numeric ordinal; received "${trimmedArgs}".`,
      1,
    );
  }
  const ordinal = Number.parseInt(trimmedArgs, 10);
  if (ordinal < 1 || ordinal > entryCount) {
    throw new ReqError(
      `ERROR: /req-continue ordinal ${ordinal} is outside the captured Next-Workflow range 1..${entryCount}.`,
      1,
    );
  }
  return ordinal - 1;
}

/**
 * @brief Resets the process-scoped Next-Workflow state for deterministic tests.
 * @details Clears both the captured entries and the handler registry plus the process-scoped captured final-output report so one test can simulate independent pi host processes without leaking captured follow-up commands, stale handlers, or stale report sections into later cases. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @note Complexity: O(1).
 */
export function resetNextWorkflowStateForTests(): void {
  const store = getNextWorkflowStore();
  store.entries = [];
  store.handlers.clear();
  resetAgentFinalOutputStateForTests();
}
