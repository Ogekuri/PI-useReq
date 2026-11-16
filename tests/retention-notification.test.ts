import test from "node:test";
import assert from "node:assert/strict";
import { type AgentFinalOutputReport } from "../src/core/agent-final-output.js";
import { ANSI_INTENSE_WHITE, ANSI_INTENSE_YELLOW } from "../src/core/ansi-style.js";
import {
  buildAgentFinalOutputAnsiPrintout,
  buildContextRetentionLine,
  buildContextRetentionNotificationMessage,
} from "../src/core/retention-notification.js";

/**
 * @brief Builds one synthetic final-output report fixture for retention-notification tests.
 * @details Returns one valid `AgentFinalOutputReport` with `result` `ok`, fixed `summary` and `outcome` strings, and one mandated `/req-workflow` follow-up command so the ANSI renderer, the command table, and the numbered list all have deterministic content. Runtime is O(1). No external state is mutated.
 * @return {AgentFinalOutputReport} Deterministic report fixture.
 */
function buildReportFixture(): AgentFinalOutputReport {
  return {
    result: "ok",
    summary: "Implementation complete.",
    outcome: "ok. The defect fix passed every gate.",
    next_commands: [{ command: "req-workflow", text: "" }],
  };
}

/**
 * @brief Builds one synthetic Next-Workflow entry fixture with one input-text case and one empty case.
 * @details Returns two entries in deterministic order: one command without input text and one command with a short input text below the condensation limit, so list and table rendering exercise both cell shapes. Runtime is O(1). No external state is mutated.
 * @return {{command: string; inputText: string}[]} Deterministic entry fixtures.
 */
function buildEntryFixtures(): { command: string; inputText: string }[] {
  return [
    { command: "req-workflow", inputText: "" },
    { command: "req-fix", inputText: "short text" },
  ];
}

/**
 * @brief Verifies the retention line renders the intense-white sentence with the intense-yellow percentage segment.
 * @details Asserts the exact ANSI-styled concatenation for one finite percentage so the byte-level styling contract of the retention sentence stays pinned. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the styled segments or their order differ.
 * @satisfies REQ-716, REQ-717
 */
test("retention line styles the sentence in intense white with the percentage in intense yellow", () => {
  const line = buildContextRetentionLine(33);
  const expected = [
    `\u001b[${ANSI_INTENSE_WHITE}mContext retained. Current context usage: \u001b[0m`,
    `\u001b[${ANSI_INTENSE_YELLOW}m33%\u001b[0m`,
    `\u001b[${ANSI_INTENSE_WHITE}m. Start a new session with a clean context (/new) before the next /req-* command.\u001b[0m`,
  ].join("");
  assert.equal(line, expected);
});

/**
 * @brief Verifies the retention line falls back to the unstyled sentence when no finite percentage exists.
 * @details Asserts the exact plain sentence for `undefined`, `NaN`, and `Infinity` percentages, each free of ANSI escape bytes, so absent context-usage snapshots never emit partial styling. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when a fallback line carries ANSI escapes or the wrong sentence.
 * @satisfies REQ-716, REQ-363
 */
test("retention line without a finite percentage stays plain", () => {
  const expected = "Context retained. Start a new session with a clean context (/new) before the next /req-* command.";
  for (const percent of [undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(buildContextRetentionLine(percent), expected);
  }
});

/**
 * @brief Verifies the ANSI printout composes the boxed report and the Next-Workflow command table.
 * @details Asserts the printout contains the rounded section-title box with intense-yellow wrapping, the rounded table with the double-line header separator, zero-padded ordinals, prefix-free uppercase commands, and the `N/A` placeholder, in report-before-table order. Runtime is O(n) in printout length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the box, the table, or their order is missing.
 * @satisfies REQ-712, REQ-713, REQ-714, REQ-720, REQ-722, REQ-723
 */
test("ANSI printout composes boxed report sections and the next-workflow command table", () => {
  const printout = buildAgentFinalOutputAnsiPrintout(buildReportFixture(), buildEntryFixtures());
  const boxIndex = printout.indexOf("╭");
  const tableIndex = printout.search(/╞═+╪═+╪═+╡/);
  assert.ok(printout.includes(`\u001b[${ANSI_INTENSE_YELLOW}m╭`), "box lines must print in intense yellow");
  assert.ok(printout.includes(`│ Summary │`), "summary heading must render as a box line");
  assert.ok(printout.includes("│ 01 │ WORKFLOW │ N/A        │"), "ordinal, uppercase prefix-free command, and N/A cell must render");
  assert.ok(printout.includes("│ 02 │ FIX      │ short text │"), "input-text cell must render");
  assert.ok(boxIndex !== -1 && tableIndex !== -1 && boxIndex < tableIndex, "report must precede the table");
  assert.ok(!printout.includes("## **"), "plain markdown headings must never survive ANSI rendering");
});

/**
 * @brief Verifies the ANSI printout degenerates to the table when no report is captured.
 * @details Asserts the undefined-report case with captured entries returns exactly the table printout and the empty-entry case with a captured report returns exactly the ANSI report. Runtime is O(n) in printout length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when either degenerate case leaks the other payload or returns a non-empty result for empty inputs.
 * @satisfies REQ-712, REQ-722
 */
test("ANSI printout degenerates to the sole available payload", () => {
  assert.equal(buildAgentFinalOutputAnsiPrintout(undefined, []), "");
  const tableOnly = buildAgentFinalOutputAnsiPrintout(undefined, buildEntryFixtures());
  assert.ok(/╞═+╪═+╪═+╡/.test(tableOnly) && !tableOnly.includes("│ Summary │"));
  const reportOnly = buildAgentFinalOutputAnsiPrintout(buildReportFixture(), []);
  assert.ok(reportOnly.includes("│ Summary │") && !/╞═+╪═+╪═+╡/.test(reportOnly));
});

/**
 * @brief Verifies the merged retention notification carries report, table, colored retention line, and numbered list in one message.
 * @details Asserts one message contains the boxed ANSI report, the command table, the exact styled retention line, and the numbered Next-Workflow list in the mandated order (report, table, retention line, list) with no plain-markdown duplicate of the report. Runtime is O(n) in message length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any segment is missing, misordered, duplicated as plain markdown, or when the message is empty.
 * @satisfies REQ-360, REQ-361, REQ-362, REQ-657, REQ-658, REQ-681, REQ-682, REQ-683, REQ-712, REQ-713, REQ-716, REQ-717, REQ-722
 */
test("retention notification merges report, table, retention line, and list into one message", () => {
  const message = buildContextRetentionNotificationMessage(
    33,
    buildReportFixture(),
    buildEntryFixtures(),
  );
  const boxIndex = message.indexOf("╭");
  const tableIndex = message.search(/╞═+╪═+╪═+╡/);
  const retentionIndex = message.indexOf("Context retained.");
  const listIndex = message.indexOf("1. /req-workflow");
  assert.ok(boxIndex !== -1, "boxed report must be present");
  assert.ok(tableIndex !== -1, "command table must be present");
  assert.ok(retentionIndex !== -1, "retention sentence must be present");
  assert.ok(listIndex !== -1, "numbered list must be present");
  assert.ok(boxIndex < tableIndex, "report must precede the table");
  assert.ok(tableIndex < retentionIndex, "table must precede the retention line");
  assert.ok(retentionIndex < listIndex, "numbered list must follow the retention line");
  assert.ok(
    message.includes(`\u001b[${ANSI_INTENSE_YELLOW}m33%\u001b[0m`),
    "percentage segment must print in intense yellow",
  );
  assert.ok(message.includes('2. /req-fix "short text"'), "input text must be quoted in the numbered list");
  assert.equal(message.split("│ Summary │").length - 1, 1, "the report must appear exactly once");
  assert.ok(!message.includes("## **"), "no plain-markdown report duplicate may survive");
});

/**
 * @brief Verifies the merged retention notification degenerates to the retention payload when no report and no entries exist.
 * @details Asserts the no-capture case returns exactly the styled retention line and the no-report case with entries appends the numbered list after the retention line without a report or table payload. Runtime is O(n) in message length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when stale report or table content leaks into the degenerate messages.
 * @satisfies REQ-361, REQ-657, REQ-684, REQ-712
 */
test("retention notification without captures prints only the retention payload", () => {
  const retentionOnly = buildContextRetentionNotificationMessage(33, undefined, []);
  assert.ok(retentionOnly.includes("Context retained.") && retentionOnly.includes("33%"));
  assert.ok(!retentionOnly.includes("╭") && !/╞═+╪═+╪═+╡/.test(retentionOnly));
  const listOnly = buildContextRetentionNotificationMessage(undefined, undefined, buildEntryFixtures());
  assert.ok(listOnly.startsWith("╭────┬"));
  assert.ok(listOnly.includes("Context retained. Start a new session"));
  assert.ok(listOnly.includes("1. /req-workflow") && !/╞═+╪═+╪═+╡/.test(listOnly.replace(/^╭[\s\S]*╯/m, "")));
});
