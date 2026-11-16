/**
 * @file
 * @brief Composes the single merged context-retention notification message: ANSI report printout, Next-Workflow command table, styled retention sentence, and numbered list.
 * @details Builds one process-independent message string for the final context-retention notification so every workflow prints exactly one info notification per completed orchestration; composing the ANSI-rendered final-output report, the dynamically sized Next-Workflow command table, the intense-white retention sentence with the intense-yellow percentage segment, and the numbered Next-Workflow list into one message avoids the pi TUI back-to-back info-notification collapse that overwrites consecutive status lines. Runtime is O(n) in aggregate report and entry length. The module is pure and performs no I/O.
 * @satisfies REQ-360, REQ-361, REQ-362, REQ-363, REQ-657, REQ-658, REQ-681, REQ-682, REQ-683, REQ-684, REQ-712, REQ-713, REQ-714, REQ-715, REQ-716, REQ-717, REQ-720, REQ-721, REQ-722, REQ-723, REQ-724, REQ-725
 */

import { renderAgentFinalOutputAnsiReport, type AgentFinalOutputReport } from "./agent-final-output.js";
import { ANSI_INTENSE_WHITE, ANSI_INTENSE_YELLOW, wrapAnsiStyle } from "./ansi-style.js";
import { formatNextWorkflowCommandTable, formatNextWorkflowList, type NextWorkflowCommandEntry } from "./next-workflow.js";

/**
 * @brief Stores the fixed retention-sentence prefix preceding the percentage segment.
 * @details Rendered in intense white by `buildContextRetentionLine(...)` whenever a finite percentage exists. Access complexity is O(1).
 * @satisfies REQ-716
 */
export const CONTEXT_RETENTION_USAGE_PREFIX = "Context retained. Current context usage: ";

/**
 * @brief Stores the fixed retention-sentence suffix following the percentage segment.
 * @details Rendered in intense white by `buildContextRetentionLine(...)` whenever a finite percentage exists. Access complexity is O(1).
 * @satisfies REQ-716
 */
export const CONTEXT_RETENTION_USAGE_SUFFIX = ". Start a new session with a clean context (/new) before the next /req-* command.";

/**
 * @brief Stores the fixed retention sentence emitted when no finite context-usage percentage exists.
 * @details Rendered verbatim without ANSI escapes so absent context-usage snapshots never emit partial styling. Access complexity is O(1).
 * @satisfies REQ-363, REQ-716
 */
export const CONTEXT_RETENTION_PLAIN_SENTENCE =
  "Context retained. Start a new session with a clean context (/new) before the next /req-* command.";

/**
 * @brief Builds the context-retention sentence with ANSI styling for a finite percentage.
 * @details Renders the intense-white prefix, the intense-yellow rounded percentage segment, and the intense-white suffix when the supplied percentage is a finite number; renders the plain unstyled sentence for `undefined`, non-finite, or non-numeric percentages. Runtime is O(1). No external state is mutated.
 * @param[in] percent {number | null | undefined} Context-usage percentage from the normalized status snapshot; `null` and `undefined` render the plain sentence.
 * @return {string} Styled or plain retention sentence.
 * @satisfies REQ-360, REQ-361, REQ-362, REQ-363, REQ-716, REQ-717
 * @note Complexity: O(1). Pure; no side effects.
 */
export function buildContextRetentionLine(percent: number | null | undefined): string {
  if (typeof percent === "number" && Number.isFinite(percent)) {
    return wrapAnsiStyle(CONTEXT_RETENTION_USAGE_PREFIX, ANSI_INTENSE_WHITE)
      + wrapAnsiStyle(`${Math.round(percent)}%`, ANSI_INTENSE_YELLOW)
      + wrapAnsiStyle(CONTEXT_RETENTION_USAGE_SUFFIX, ANSI_INTENSE_WHITE);
  }
  return CONTEXT_RETENTION_PLAIN_SENTENCE;
}

/**
 * @brief Builds the ANSI final-output printout composed of the boxed report sections plus the Next-Workflow command table.
 * @details Renders the captured report through `renderAgentFinalOutputAnsiReport(...)` and the captured Next-Workflow entries through `formatNextWorkflowCommandTable(...)`, then joins both payloads with one blank line while omitting either empty payload; both empty inputs return the empty string so callers skip emission. Runtime is O(n) in aggregate report and entry length. No external state is mutated.
 * @param[in] report {AgentFinalOutputReport | undefined} Captured final-output report; `undefined` contributes no sections.
 * @param[in] nextWorkflowEntries {readonly NextWorkflowCommandEntry[]} Captured Next-Workflow command entries; an empty array renders no table.
 * @return {string} ANSI-colored printout, or the empty string when both payloads are empty.
 * @satisfies REQ-712, REQ-713, REQ-714, REQ-715, REQ-720, REQ-721, REQ-722, REQ-723, REQ-724, REQ-725
 * @note Complexity: O(n) in aggregate report and entry length. Pure; no side effects.
 */
export function buildAgentFinalOutputAnsiPrintout(
  report: AgentFinalOutputReport | undefined,
  nextWorkflowEntries: readonly NextWorkflowCommandEntry[],
): string {
  const reportText = renderAgentFinalOutputAnsiReport(report);
  const commandTable = formatNextWorkflowCommandTable(nextWorkflowEntries);
  if (commandTable === "") {
    return reportText;
  }
  if (reportText === "") {
    return commandTable;
  }
  return `${reportText}\n\n${commandTable}`;
}

/**
 * @brief Builds the single merged context-retention notification message for every workflow outcome.
 * @details Composes, in fixed order, the ANSI final-output printout (boxed report sections plus the Next-Workflow command table), one blank line, the ANSI-styled or plain retention sentence, and the numbered Next-Workflow list so the complete terminal summary is delivered as exactly one info notification and never collapses a preceding status line in the pi TUI; a report present in the printout appears exactly once because no plain-markdown duplicate is rendered. Runtime is O(n) in aggregate report and entry length. No external state is mutated.
 * @param[in] percent {number | null | undefined} Context-usage percentage from the normalized status snapshot; `null` and `undefined` render the plain sentence.
 * @param[in] report {AgentFinalOutputReport | undefined} Captured final-output report; `undefined` contributes no sections.
 * @param[in] nextWorkflowEntries {readonly NextWorkflowCommandEntry[]} Captured Next-Workflow command entries; an empty array renders no table and no list.
 * @return {string} One merged notification message; never empty because the retention sentence is always present.
 * @satisfies REQ-360, REQ-361, REQ-362, REQ-363, REQ-657, REQ-658, REQ-681, REQ-682, REQ-683, REQ-684, REQ-712, REQ-713, REQ-716, REQ-717, REQ-719, REQ-722
 * @note Complexity: O(n) in aggregate report and entry length. Pure; no side effects.
 * @see buildAgentFinalOutputAnsiPrintout
 * @see buildContextRetentionLine
 */
export function buildContextRetentionNotificationMessage(
  percent: number | null | undefined,
  report: AgentFinalOutputReport | undefined,
  nextWorkflowEntries: readonly NextWorkflowCommandEntry[],
): string {
  const printout = buildAgentFinalOutputAnsiPrintout(report, nextWorkflowEntries);
  const nextWorkflowList = formatNextWorkflowList(nextWorkflowEntries);
  const retentionLine = buildContextRetentionLine(percent);
  const retentionWithList = nextWorkflowList === ""
    ? retentionLine
    : `${retentionLine}\n${nextWorkflowList}`;
  return printout === "" ? retentionWithList : `${printout}\n\n${retentionWithList}`;
}
