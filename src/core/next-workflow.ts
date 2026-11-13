/**
 * @file
 * @brief Implements Next-Workflow command capture, process-scoped storage, list rendering, and `/req-continue` selection helpers.
 * @details Parses the `## **Next Workflow**` section of the final agent output for `~~~text` fenced command blocks, captures pi-usereq slash commands plus input-text pairs into one process-scoped Next-Workflow array that survives extension rebinds and `/new` session starts, renders the numbered list appended after the final context-retention notification, resolves one-based ordinal selection, and stores the reusable command handlers that let `/req-continue` delegate exactly like a manual user invocation. Runtime is O(n) in inspected output length per capture and O(1) per store access. Side effects are limited to process-scoped state mutation; no configuration file is written.
 * @satisfies DES-040, REQ-653, REQ-654, REQ-655, REQ-656, REQ-657, REQ-658, REQ-659, REQ-662, REQ-663
 */

import { ReqError } from "./errors.js";
import { PROMPT_COMMAND_NAMES } from "./prompt-command-catalog.js";

/**
 * @brief Heading that opens the Next-Workflow section of one final agent output.
 * @details Matched as an exact trimmed line so the parser ignores prose mentions of the section name and selects the last occurrence so the terminal report wins over earlier attempts. Access complexity is O(1).
 */
const NEXT_WORKFLOW_SECTION_HEADING = "## **Next Workflow**";

/**
 * @brief Fence prefix opening and closing every `~~~text` Next-Workflow command block.
 * @details The bundled prompt contract emits one fenced block per follow-up command whose first line is the exact slash command and whose remaining lines are the prompt text, so every line whose trimmed form starts with this prefix toggles fence state. Access complexity is O(1).
 */
const NEXT_WORKFLOW_FENCE_PREFIX = "~~~";

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
 * @brief Describes one captured Next-Workflow command entry.
 * @details Pairs the invokable pi-usereq command name without the leading slash with the trimmed fenced-block input text, preserving the section order of the captured blocks. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-654
 */
export interface NextWorkflowCommandEntry {
  /** Invokable pi-usereq command name without the leading slash, such as `req-change`. */
  command: string;
  /** Remaining fenced-block lines joined with newlines; empty for commands without input text. */
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
  /** Captured command entries of the last completed agentic flow in section order. */
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
 * @brief Appends one parsed fenced-block entry when its first line names an allowed pi-usereq command.
 * @details Requires a non-empty first block line starting with `/`, strips the leading slash, drops the entry when the command is outside the pi-usereq inventory so non-pi-usereq orchestration commands are purged while `/req-continue` stays, and joins the remaining non-empty block lines as the input text. Runtime is O(n) in block length. No external state is mutated.
 * @param[in,out] entries {NextWorkflowCommandEntry[]} Entry accumulator in section order.
 * @param[in] blockLines {string[]} Raw fenced-block lines between two fence markers.
 * @return {void} No return value.
 * @satisfies REQ-654, REQ-655
 * @note Complexity: O(n) in block length.
 */
function appendNextWorkflowBlockEntry(
  entries: NextWorkflowCommandEntry[],
  blockLines: string[],
): void {
  const contentLines = blockLines.map((line) => line.trim());
  const firstContentIndex = contentLines.findIndex((line) => line !== "");
  if (firstContentIndex === -1) {
    return;
  }
  const firstLine = contentLines[firstContentIndex] ?? "";
  if (!firstLine.startsWith("/")) {
    return;
  }
  const command = firstLine.slice(1).trim();
  if (!NEXT_WORKFLOW_COMMAND_SET.has(command)) {
    // Purge rule: non-pi-usereq orchestration commands never enter the array; the
    // `/req-continue` exception stays eligible because its name is in the inventory.
    return;
  }
  const inputLines = contentLines.slice(firstContentIndex + 1).filter((line) => line !== "");
  entries.push({ command, inputText: inputLines.join("\n") });
}

/**
 * @brief Extracts the ordered lines following the last Next-Workflow section heading.
 * @details Splits the inspected text into lines, selects the last exact trimmed heading occurrence so the terminal report wins over earlier attempts, and returns the lines up to the next `## ` heading or the end of the text. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] agentOutputText {string} Final agent output text.
 * @return {string[]} Section body lines, or an empty array when the heading is absent.
 * @satisfies REQ-653
 * @note Complexity: O(n) in text length.
 */
function extractNextWorkflowSectionLines(agentOutputText: string): string[] {
  const lines = agentOutputText.split(/\r?\n/);
  let sectionStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim() === NEXT_WORKFLOW_SECTION_HEADING) {
      sectionStart = index;
    }
  }
  if (sectionStart === -1) {
    return [];
  }
  const sectionLines: string[] = [];
  for (let index = sectionStart + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (line.trimStart().startsWith("## ")) {
      break;
    }
    sectionLines.push(line);
  }
  return sectionLines;
}

/**
 * @brief Parses every `~~~text` fenced command block inside one Next-Workflow section.
 * @details Collects line groups between `~~~` fence markers, requires each block's first non-empty line to be a `/`-prefixed pi-usereq slash command, joins the remaining non-empty lines as the input text, and skips blocks naming purged non-pi-usereq orchestration commands or carrying no command at all. Runtime is O(n) in output length. No external state is mutated.
 * @param[in] agentOutputText {string} Final agent output text.
 * @return {NextWorkflowCommandEntry[]} Captured command entries in section order.
 * @satisfies REQ-653, REQ-654, REQ-655
 * @note Complexity: O(n) in output length. Pure; no side effects.
 */
export function parseNextWorkflowCommandEntries(agentOutputText: string): NextWorkflowCommandEntry[] {
  const entries: NextWorkflowCommandEntry[] = [];
  let blockLines: string[] | undefined;
  for (const line of extractNextWorkflowSectionLines(agentOutputText)) {
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith(NEXT_WORKFLOW_FENCE_PREFIX)) {
      if (blockLines === undefined) {
        blockLines = [];
      } else {
        appendNextWorkflowBlockEntry(entries, blockLines);
        blockLines = undefined;
      }
      continue;
    }
    if (blockLines !== undefined) {
      blockLines.push(line);
    }
  }
  if (blockLines !== undefined) {
    appendNextWorkflowBlockEntry(entries, blockLines);
  }
  return entries;
}

/**
 * @brief Captures the Next-Workflow commands of one final agent output into the process-scoped array.
 * @details Parses the fenced command blocks and replaces the stored array so the captured commands always reflect the last completed agentic flow, including the empty result when the terminal output carries no Next-Workflow commands. Runtime is O(n) in output length. Side effect: replaces process-scoped capture state.
 * @param[in] agentOutputText {string} Final agent output text of the completed run.
 * @return {NextWorkflowCommandEntry[]} Captured command entries in section order.
 * @satisfies REQ-653, REQ-654, REQ-655, REQ-656
 * @note Complexity: O(n) in output length.
 */
export function captureNextWorkflowCommands(agentOutputText: string): NextWorkflowCommandEntry[] {
  const entries = parseNextWorkflowCommandEntries(agentOutputText);
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
 * @details Clears both the captured entries and the handler registry so one test can simulate independent pi host processes without leaking captured follow-up commands or stale handlers into later cases. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 * @note Complexity: O(1).
 */
export function resetNextWorkflowStateForTests(): void {
  const store = getNextWorkflowStore();
  store.entries = [];
  store.handlers.clear();
}
