/**
 * @file
 * @brief Implements Next-Workflow command capture, process-scoped storage, rounded-table rendering, `/req-continue` selection, and parameter-less `/req-continue` printing helpers.
 * @details Maps the `next_commands` entries of the parsed final-output JSON into pi-usereq slash commands plus input-text pairs captured in one process-scoped Next-Workflow array that survives extension rebinds and `/new` session starts, renders the captured commands as the dynamically sized full-text Next-Workflow table whose `Text` column wraps at the terminal-adaptive target width with hard-broken unbreakable words printed inside the ANSI report notification and as the `/req-continue` command table appended after the final context-retention line, resolves one-based ordinal selection, stores the reusable command handlers that let `/req-continue` delegate exactly like a manual user invocation, and stores the empty-array placeholder printed by parameter-less `/req-continue`. Runtime is O(n) in captured entry count per capture and O(1) per store access. Side effects are limited to process-scoped state mutation; no configuration file is written.
 * @satisfies DES-040, REQ-653, REQ-654, REQ-655, REQ-656, REQ-657, REQ-658, REQ-659, REQ-662, REQ-663, REQ-722, REQ-723, REQ-724, REQ-725, REQ-729, REQ-730, REQ-731, REQ-733, REQ-734, REQ-749, REQ-750
 */

import process from "node:process";
import { type AgentFinalOutputCommandEntry, type AgentFinalOutputParse, resetAgentFinalOutputStateForTests } from "./agent-final-output.js";
import { measureDisplayWidth } from "./config-cli-render.js";
import { ReqError } from "./errors.js";
import { PROMPT_COMMAND_NAMES } from "./prompt-command-catalog.js";

/**
 * @brief Lists the specialized non-prompt pi-usereq commands eligible for Next-Workflow capture.
 * @details Extends the bundled prompt-command inventory with `req-references`, `req-wtd`, `req-print-result`, and the `/req-continue` exception so chained continuations stay capturable while every non-pi-usereq orchestration command is purged from the array. Access complexity is O(1).
 * @satisfies REQ-655, REQ-659, REQ-780
 */
export const NEXT_WORKFLOW_SPECIALIZED_COMMAND_NAMES = [
  "req-references",
  "req-wtd",
  "req-print-result",
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
 * @details Resets the process-scoped array to empty. The wipe runs only at the idle-reset bootstrap boundaries (`startup|reload` `session_start`) and immediately before prompt dispatch of a `new` agentic flow after every slash-command pre-check has succeeded, so failed pre-checks preserve queued commands and REQ-224 auto-recovery never clears the array. Runtime is O(1). Side effect: mutates process-scoped state.
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
 * @brief Stores the fixed minimum display width of the Next-Workflow table `Text` column wrap target.
 * @details Serves as the fallback wrap target whenever the pi CLI terminal column count is unavailable or leaves the derived target below the minimum, and bounds every wrapped `Text` cell line in that fallback so the full untruncated input text renders across multiple physical table rows instead of one oversized line. Access complexity is O(1).
 * @satisfies REQ-729, REQ-750
 */
export const NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH = 35;

/**
 * @brief Stores the fixed display-width chrome of one Next-Workflow table physical row outside the three column widths.
 * @details Counts the leading `│ ` border, the two ` │ ` cell separators, and the trailing ` │` border so `terminal columns - fixed columns - chrome - right margin` yields the widest `Text` column that keeps every physical row inside the CLI width while preserving the reserved right margin. Access complexity is O(1).
 * @satisfies REQ-749
 */
const NEXT_WORKFLOW_TABLE_ROW_FIXED_CHROME_WIDTH = 10;

/**
 * @brief Stores the fixed display-width right margin reserved between the widest derived Next-Workflow table row and the identified pi CLI terminal column count.
 * @details Subtracted from the terminal-derived `Text` column wrap target so the widest rendered physical table row keeps at least this many display columns of right margin against the identified terminal width; at equal console width every terminal-adaptive table renders at most `terminal columns - 5` display columns wide while staying left-aligned. Access complexity is O(1).
 * @satisfies REQ-749
 */
const NEXT_WORKFLOW_TABLE_RIGHT_MARGIN_WIDTH = 5;

/**
 * @brief Resolves the effective Next-Workflow table `Text` column wrap target from one terminal column count.
 * @details Returns `NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH` when the terminal column count is unavailable, non-integer, non-positive, or when `terminalColumns - fixedColumnsWidth - NEXT_WORKFLOW_TABLE_ROW_FIXED_CHROME_WIDTH - NEXT_WORKFLOW_TABLE_RIGHT_MARGIN_WIDTH` stays below the minimum; otherwise returns that difference so every rendered physical table row fits the CLI width while keeping at least `NEXT_WORKFLOW_TABLE_RIGHT_MARGIN_WIDTH` display columns of right margin against the terminal width. No upper cap is applied. Runtime is O(1). No external state is mutated.
 * @param[in] terminalColumns {number | undefined} pi CLI terminal column count; `undefined` or invalid selects the fixed minimum.
 * @param[in] fixedColumnsWidth {number} Summed display width of the non-`Text` columns, such as the ordinal column plus the `Next Workflow` header.
 * @return {number} Effective `Text` column wrap target in display columns; never below `NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH`.
 * @satisfies REQ-749, REQ-750
 * @note Complexity: O(1). Pure; no side effects.
 */
export function resolveNextWorkflowTextColumnTargetWidth(
  terminalColumns: number | undefined,
  fixedColumnsWidth: number,
): number {
  if (typeof terminalColumns !== "number" || !Number.isInteger(terminalColumns) || terminalColumns <= 0) {
    return NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH;
  }
  const derivedTarget =
    terminalColumns - fixedColumnsWidth - NEXT_WORKFLOW_TABLE_ROW_FIXED_CHROME_WIDTH - NEXT_WORKFLOW_TABLE_RIGHT_MARGIN_WIDTH;
  if (derivedTarget < NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH) {
    return NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH;
  }
  return derivedTarget;
}

/**
 * @brief Reads the pi CLI terminal column count from the hosting process standard output.
 * @details Returns `process.stdout.columns` only when it is a positive integer so non-TTY pipes, redirected output, and degraded hosts select the fixed minimum fallback through `resolveNextWorkflowTextColumnTargetWidth(...)`. Runtime is O(1). No external state is mutated.
 * @return {number | undefined} Positive terminal column count, or `undefined` when unavailable.
 * @satisfies REQ-749, REQ-750
 * @note Complexity: O(1).
 */
function readNextWorkflowTerminalColumns(): number | undefined {
  const columns = process.stdout?.columns;
  return typeof columns === "number" && Number.isInteger(columns) && columns > 0 ? columns : undefined;
}

/**
 * @brief Splits one unbreakable word into display-width-bounded chunks without splitting wide characters.
 * @details Iterates code points, accumulates characters while the joined display width stays within `maxWidth`, and flushes the chunk before a character that would exceed the bound; a single character wider than `maxWidth` occupies its own oversized chunk so degenerate narrow targets never lose characters. Runtime is O(n) in word length. No external state is mutated.
 * @param[in] word {string} Single whitespace-delimited word wider than `maxWidth`.
 * @param[in] maxWidth {number} Maximum display width per produced chunk.
 * @return {string[]} Ordered chunks in reading order; never empty.
 * @satisfies REQ-729
 * @note Complexity: O(n) in word length. Pure; no side effects.
 */
function splitUnbreakableWordByDisplayWidth(word: string, maxWidth: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let currentWidth = 0;
  for (const char of Array.from(word)) {
    const charWidth = measureDisplayWidth(char);
    if (current !== "" && currentWidth + charWidth > maxWidth) {
      chunks.push(current);
      current = char;
      currentWidth = charWidth;
    } else {
      current += char;
      currentWidth += charWidth;
    }
  }
  if (current !== "") {
    chunks.push(current);
  }
  return chunks;
}

/**
 * @brief Wraps one captured input text into `Text` cell lines bounded by the effective wrap target.
 * @details Collapses every whitespace run into one space, splits the normalized text into whitespace-delimited words, and greedily appends each word to the current line while the joined display width stays within `maxWidth`; a word that no longer fits starts a new line, a single word wider than `maxWidth` is hard-broken at display-width boundaries across multiple lines with the final chunk staying open for following words so no produced line exceeds `maxWidth` and the column never widens for unbreakable words, and a fully empty normalization yields one empty line. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] inputText {string} Captured input text.
 * @param[in] maxWidth {number} Maximum display width per produced line.
 * @return {string[]} Wrapped cell lines in reading order; never empty.
 * @satisfies REQ-724, REQ-729
 * @note Complexity: O(n) in input length. Pure; no side effects.
 */
function wrapNextWorkflowTableCellText(inputText: string, maxWidth: number): string[] {
  const normalized = inputText.replace(/\s+/g, " ").trim();
  if (normalized === "") {
    return [""];
  }
  const lines: string[] = [];
  let current = "";
  for (const word of normalized.split(" ")) {
    if (measureDisplayWidth(word) > maxWidth) {
      const chunks = splitUnbreakableWordByDisplayWidth(word, maxWidth);
      if (current !== "") {
        lines.push(current);
      }
      lines.push(...chunks.slice(0, -1));
      current = chunks[chunks.length - 1] ?? "";
      continue;
    }
    if (current === "") {
      current = word;
    } else if (measureDisplayWidth(current) + 1 + measureDisplayWidth(word) <= maxWidth) {
      current = `${current} ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current !== "") {
    lines.push(current);
  }
  return lines;
}

/**
 * @brief Condenses one captured input text for Next-Workflow and `/req-continue` table cell rendering.
 * @details Collapses every whitespace run, including newlines, into one space, then renders inputs longer than the 30-character verbatim limit as the first 20 characters followed by the ` .. ` table separator followed by the last 10 characters and shorter inputs verbatim; the empty string stays empty so the table builder renders the `N/A` placeholder. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] inputText {string} Captured input text.
 * @return {string} Single-line condensed table cell text.
 * @satisfies REQ-658
 * @note Complexity: O(n) in input length. Pure; no side effects.
 */
export function condenseNextWorkflowTableInputText(inputText: string): string {
  const normalized = inputText.replace(/\s+/g, " ").trim();
  if (normalized.length <= NEXT_WORKFLOW_CONDENSED_VERBATIM_LIMIT) {
    return normalized;
  }
  return `${normalized.slice(0, NEXT_WORKFLOW_CONDENSED_PREFIX_LENGTH)} .. ${normalized.slice(
    -NEXT_WORKFLOW_CONDENSED_SUFFIX_LENGTH,
  )}`;
}

/**
 * @brief Renders headers plus per-cell line arrays as one dynamically sized rounded table printout.
 * @details Computes every column width from the maximum display width over the header and every rendered cell line, renders each cell line as one physical row that pads cells to the column width with spaces, repeats empty cells for the continuation lines of multi-line cells, and frames the table with the rounded box-drawing characters using the double-line header separator plus single-line row separators between logical rows. Runtime is O(n) in aggregate cell line length. No external state is mutated.
 * @param[in] headers {readonly string[]} Column header labels.
 * @param[in] rows {readonly string[][][]} One entry per logical row; each row holds one line array per cell.
 * @return {string} Complete rounded table printout.
 * @satisfies REQ-725, REQ-730, REQ-731
 * @note Complexity: O(n) in aggregate cell line length. Pure; no side effects.
 */
function renderNextWorkflowRoundedTable(headers: readonly string[], rows: readonly string[][][]): string {
  const widths = headers.map((header, column) =>
    Math.max(
      measureDisplayWidth(header),
      ...rows.flatMap((row) => row[column]).map((line) => measureDisplayWidth(line)),
    ),
  );
  const border = (left: string, fill: string, middle: string, right: string): string =>
    left + widths.map((width) => fill.repeat(width + 2)).join(middle) + right;
  const dataRow = (cells: readonly string[]): string =>
    `│ ${cells.map((cell, column) => cell + " ".repeat(widths[column] - measureDisplayWidth(cell))).join(" │ ")} │`;
  const lines: string[] = [border("╭", "─", "┬", "╮"), dataRow(headers), border("╞", "═", "╪", "╡")];
  rows.forEach((row, index) => {
    if (index > 0) {
      lines.push(border("├", "─", "┼", "┤"));
    }
    const lineCount = Math.max(...row.map((cell) => cell.length));
    const paddedCells = row.map((cell) => {
      const cellLines = [...cell];
      while (cellLines.length < lineCount) {
        cellLines.push("");
      }
      return cellLines;
    });
    for (let lineIndex = 0; lineIndex < lineCount; lineIndex += 1) {
      lines.push(dataRow(paddedCells.map((cellLines) => cellLines[lineIndex])));
    }
  });
  lines.push(border("╰", "─", "┴", "╯"));
  return lines.join("\n");
}

/**
 * @brief Renders the captured Next-Workflow commands as the dynamically sized full-text rounded table printout.
 * @details Computes widths through `renderNextWorkflowRoundedTable(...)`, resolves the effective `Text` column wrap target through `resolveNextWorkflowTextColumnTargetWidth(...)` from the supplied or process-detected terminal column count, renders the `N.`, `Next Workflow`, and `Text` columns, renders each row with one right-aligned space-padded one-based ordinal, the command name without the `req-` prefix in uppercase, and the full untruncated input text wrapped at whitespace boundaries into at most the effective wrap-target display columns with hard-broken unbreakable words and `N/A` for absent input text, and frames the table with the rounded box-drawing characters; an empty entry array renders the empty string. Runtime is O(n) in aggregate cell length. No external state is mutated.
 * @param[in] entries {readonly NextWorkflowCommandEntry[]} Captured command entries.
 * @param[in] terminalColumns {number | undefined} pi CLI terminal column count consumed by the wrap-target resolution; defaults to the process-detected `process.stdout.columns`.
 * @return {string} Complete rounded table printout, or the empty string when no entry exists.
 * @satisfies REQ-722, REQ-723, REQ-724, REQ-725, REQ-729, REQ-730, REQ-731, REQ-749, REQ-750
 * @note Complexity: O(n) in aggregate cell length. Pure aside from the process stdout metadata read performed by the default width source.
 */
export function formatNextWorkflowCommandTable(
  entries: readonly NextWorkflowCommandEntry[],
  terminalColumns: number | undefined = readNextWorkflowTerminalColumns(),
): string {
  if (entries.length === 0) {
    return "";
  }
  const ordinalWidth = Math.max(2, String(entries.length).length);
  const headers = ["N.", "Next Workflow", "Text"];
  const textColumnTargetWidth = resolveNextWorkflowTextColumnTargetWidth(
    terminalColumns,
    ordinalWidth + measureDisplayWidth(headers[1]),
  );
  const rows = entries.map((entry, index) => [
    [String(index + 1).padStart(ordinalWidth)],
    [entry.command.replace(/^req-/, "").toUpperCase()],
    entry.inputText === ""
      ? ["N/A"]
      : wrapNextWorkflowTableCellText(entry.inputText, textColumnTargetWidth),
  ]);
  return renderNextWorkflowRoundedTable(headers, rows);
}

/**
 * @brief Renders the captured Next-Workflow commands as the `/req-continue` command table appended after the retention line.
 * @details Computes widths through `renderNextWorkflowRoundedTable(...)`, renders the `Continue comand`, `Workflow`, and `Text` columns, renders each capture-order row with the directly invokable `/req-continue <one-based-ordinal>` command, the command name without the `req-` prefix in uppercase, and the condensed input-text quotation collapsing inputs longer than 30 characters into the first 20 characters, the ` .. ` separator, and the last 10 characters with `N/A` for absent input text, and frames the table like the Next-Workflow table; an empty entry array renders the empty string. Runtime is O(n) in aggregate cell length. No external state is mutated.
 * @param[in] entries {readonly NextWorkflowCommandEntry[]} Captured command entries.
 * @return {string} Complete rounded table printout, or the empty string when no entry exists.
 * @satisfies REQ-657, REQ-658, REQ-731, REQ-733, REQ-734
 * @note Complexity: O(n) in aggregate cell length. Pure; no side effects.
 */
export function formatNextWorkflowContinueCommandTable(entries: readonly NextWorkflowCommandEntry[]): string {
  if (entries.length === 0) {
    return "";
  }
  const headers = ["Continue comand", "Workflow", "Text"];
  const rows = entries.map((entry, index) => [
    [`/req-continue ${index + 1}`],
    [entry.command.replace(/^req-/, "").toUpperCase()],
    entry.inputText === "" ? ["N/A"] : [condenseNextWorkflowTableInputText(entry.inputText)],
  ]);
  return renderNextWorkflowRoundedTable(headers, rows);
}

/**
 * @brief Stores the empty-list placeholder printed by parameter-less `/req-continue` when no Next-Workflow entry is captured.
 * @details Returned verbatim by the parameter-less `/req-continue` editor payload so empty arrays render the documented placeholder deterministically. Access complexity is O(1).
 * @satisfies REQ-741
 */
export const NEXT_WORKFLOW_EMPTY_LIST_TEXT = "No captured Next-Workflow commands.";

/**
 * @brief Resolves the zero-based entry index selected by one mandatory `/req-continue` ordinal argument.
 * @details Requires one non-empty decimal integer argument identifying the one-based Next-Workflow array ordinal, throws the mandatory-parameter diagnostic for an empty argument because parameter-less `/req-continue` invocations print the Next-Workflow table before reaching this selector, throws a deterministic diagnostic for non-numeric arguments, and throws a range diagnostic when the one-based ordinal exceeds the captured entry count. Runtime is O(n) in argument length. No external state is mutated.
 * @param[in] rawArgs {string} Raw `/req-continue` argument string.
 * @param[in] entryCount {number} Captured Next-Workflow entry count.
 * @return {number} Zero-based selected entry index.
 * @throws {ReqError} Throws when the argument is missing or non-numeric or the ordinal is outside `1..entryCount`.
 * @satisfies REQ-661, REQ-662
 * @note Complexity: O(n) in argument length. Pure aside from thrown diagnostics.
 */
export function resolveNextWorkflowEntryIndex(rawArgs: string, entryCount: number): number {
  const trimmedArgs = rawArgs.trim();
  if (trimmedArgs === "") {
    throw new ReqError(
      "ERROR: /req-continue requires a numeric ordinal argument selecting one captured Next-Workflow entry.",
      1,
    );
  }
  if (!/^\d+$/.test(trimmedArgs)) {
    throw new ReqError(
      `ERROR: /req-continue requires a numeric ordinal; received "${trimmedArgs}".`,
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
