import test from "node:test";
import assert from "node:assert/strict";
import { parseAgentFinalOutput, type AgentFinalOutputCommandEntry } from "../src/core/agent-final-output.js";
import {
  captureNextWorkflowCommands,
  clearNextWorkflowCommands,
  condenseNextWorkflowTableInputText,
  formatNextWorkflowCommandTable,
  formatNextWorkflowContinueCommandTable,
  getNextWorkflowCommands,
  NEXT_WORKFLOW_COMMAND_NAMES,
  NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH,
  parseNextWorkflowCommandEntries,
  registerNextWorkflowCommandHandler,
  REQ_CONTINUE_COMMAND_DESCRIPTION,
  resetNextWorkflowStateForTests,
  resolveNextWorkflowCommandHandler,
  resolveNextWorkflowEntryIndex,
  resolveNextWorkflowTextColumnTargetWidth,
} from "../src/core/next-workflow.js";

/**
 * @brief Builds one synthetic final-output JSON carrying the supplied `next_commands` entries.
 * @details Serializes one valid final-output JSON object with `result` `ok`, a fixed summary, and the supplied command entries so parser tests exercise the exact JSON contract emitted by bundled prompts. Runtime is O(n) in entry count. No external state is mutated.
 * @param[in] nextCommands {AgentFinalOutputCommandEntry[]} Command entries placed inside the `next_commands` array.
 * @return {string} Synthetic final agent output text parsing to one valid final-output JSON object.
 */
function buildFinalOutputJson(nextCommands: AgentFinalOutputCommandEntry[]): string {
  return JSON.stringify({
    result: "ok",
    summary: "Implementation complete.",
    next_commands: nextCommands,
  });
}

/**
 * @brief Verifies Next-Workflow mapping keeps pi-usereq commands plus `/req-continue` in entry order.
 * @details Parses one synthetic final-output JSON whose `next_commands` array carries a `/req-fix` entry with input text, a `/req-check` entry without input text, a `/req-continue` exception entry, and a purged `/new` orchestration entry, then asserts the captured entries preserve entry order, keep the input text verbatim, and drop the non-pi-usereq orchestration command. Runtime is O(n) in entry count. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the mapping keeps purged commands, drops the `/req-continue` exception, or loses entry order.
 * @satisfies REQ-653, REQ-654, REQ-655, TST-215
 */
test("next-workflow mapping keeps pi-usereq commands plus req-continue and purges orchestration commands", () => {
  resetNextWorkflowStateForTests();
  const entries = parseNextWorkflowCommandEntries(parseAgentFinalOutput(buildFinalOutputJson([
    { command: "/req-fix", text: "Fix the flaky retry path in the orchestrator loop" },
    { command: "/req-check", text: "" },
    { command: "/new", text: "" },
    { command: "/req-continue", text: "" },
  ])));
  assert.deepEqual(entries, [
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
    { command: "req-continue", inputText: "" },
  ]);
});

/**
 * @brief Verifies Next-Workflow mapping skips malformed entries and yields none for invalid parses.
 * @details Parses one valid final-output JSON whose `next_commands` array mixes one well-formed entry with a non-object entry, an entry missing `command`, and an entry whose `command` is a number, asserting only the well-formed entry survives; additionally asserts one non-JSON terminal output parses to no valid final-output JSON and yields no entry. Runtime is O(n) in entry count. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when malformed entries leak into the array or an invalid parse produces entries.
 * @satisfies REQ-653, REQ-654, TST-215
 */
test("next-workflow mapping skips malformed entries and yields none for invalid parses", () => {
  resetNextWorkflowStateForTests();
  const rawPayload = JSON.stringify({
    result: "ok",
    summary: "Mixed entries.",
    next_commands: [
      "not-an-object",
      { text: "missing command" },
      { command: 7, text: "numeric command" },
      { command: "req-refactor", text: "Rename the duplicated retry helper" },
    ],
  });
  const entries = parseNextWorkflowCommandEntries(parseAgentFinalOutput(rawPayload));
  assert.deepEqual(entries, [{ command: "req-refactor", inputText: "Rename the duplicated retry helper" }]);
  const invalidParse = parseAgentFinalOutput("No final-output JSON here.");
  assert.equal(invalidParse.ok, false);
  assert.deepEqual(parseNextWorkflowCommandEntries(invalidParse), []);
});

/**
 * @brief Verifies the input-text table condensation contract for long, short, and whitespace-heavy inputs.
 * @details Asserts inputs longer than the verbatim limit render as the first 20 characters followed by ` .. ` followed by the last 10 characters, shorter inputs render verbatim, every whitespace run including newlines collapses to one space, and empty inputs render empty. Runtime is O(n) in input length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the condensed quotation does not match the documented first-20/last-10 contract.
 * @satisfies REQ-658, TST-216
 */
test("next-workflow table condensation renders first-20 plus separator plus last-10", () => {
  assert.equal(condenseNextWorkflowTableInputText("Fix the flaky retry path in the orchestrator loop"), "Fix the flaky retry  .. rator loop");
  assert.equal(condenseNextWorkflowTableInputText("short text"), "short text");
  assert.equal(condenseNextWorkflowTableInputText("123456789012345678901234567890"), "123456789012345678901234567890");
  assert.equal(condenseNextWorkflowTableInputText("1234567890123456789012345678901"), "12345678901234567890 .. 2345678901");
  assert.equal(condenseNextWorkflowTableInputText("multi\nline   input\ttext"), "multi line input text");
  assert.equal(condenseNextWorkflowTableInputText("   "), "");
});

/**
 * @brief Verifies the full-text Next-Workflow table rendering contract.
 * @details Asserts the table headers `N.`, `Next Workflow`, and `Text`, right-aligned space-padded one-based ordinals, prefix-free uppercase commands, full untruncated input text wrapped at whitespace boundaries into at most the fixed minimum 35-display-column fallback lines rendered as continuation physical rows with empty sibling cells, the `N/A` placeholder for absent input text, and the empty string for an empty entry array. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the rendered table truncates input text, breaks the wrapping, alignment, continuation-row, or empty-array contract.
 * @satisfies REQ-722, REQ-723, REQ-724, REQ-729, REQ-730, REQ-731, REQ-750
 */
test("next-workflow command table renders full wrapped text with right-aligned ordinals", () => {
  const rendered = formatNextWorkflowCommandTable([
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
  ]);
  assert.equal(
    rendered,
    [
      "╭────┬───────────────┬─────────────────────────────────╮",
      "│ N. │ Next Workflow │ Text                            │",
      "╞════╪═══════════════╪═════════════════════════════════╡",
      "│  1 │ FIX           │ Fix the flaky retry path in the │",
      "│    │               │ orchestrator loop               │",
      "├────┼───────────────┼─────────────────────────────────┤",
      "│  2 │ CHECK         │ N/A                             │",
      "╰────┴───────────────┴─────────────────────────────────╯",
    ].join("\n"),
  );
  assert.equal(formatNextWorkflowCommandTable([]), "");
  assert.equal(NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH, 35);
});

/**
 * @brief Verifies the hard-breaking wrap contract of the Next-Workflow table `Text` cell.
 * @details Asserts one unbreakable word longer than the fixed minimum wrap target is hard-broken across multiple physical rows of at most the target display width, the following short word joins the final chunk line, the column never widens beyond the target, and the full untruncated word stays present across the continuation rows. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any produced `Text` cell line exceeds the fixed minimum width, the unbreakable word renders on one oversized row, or characters of the untruncated word are lost.
 * @satisfies REQ-724, REQ-729, REQ-730, REQ-731, REQ-750
 */
test("next-workflow command table hard-breaks unbreakable words at the fixed minimum wrap target", () => {
  const longWord = "a".repeat(40);
  const rendered = formatNextWorkflowCommandTable([
    { command: "req-fix", inputText: `${longWord} tail` },
  ]);
  const dataLines = rendered.split("\n").filter((line) => line.startsWith("│") && !line.includes("N."));
  const textCells = dataLines.map((line) => line.split("│")[3].trim());
  assert.ok(!textCells.includes(longWord), "the unbreakable word must not own one oversized physical row");
  assert.ok(textCells.some((cell) => cell === "a".repeat(NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH)), "the first chunk fills the fixed minimum width");
  assert.ok(textCells.some((cell) => cell === `${"a".repeat(5)} tail`), "the final chunk joins the following short word");
  assert.equal(
    textCells.join(" ").split(" ").filter((token) => token !== "tail").join("").length,
    40,
    "all untruncated word characters stay present",
  );
  for (const cell of textCells) {
    assert.ok(cell.length <= NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH, `every produced line stays within the fixed minimum width, received ${cell.length}`);
  }
});

/**
 * @brief Verifies the terminal-adaptive `Text` column wrap-target resolution contract.
 * @details Asserts unavailable, non-integer, non-positive, and too-narrow terminal column counts fall back to the fixed minimum, and that adequate terminal widths derive the target as the terminal count minus the fixed columns width minus the fixed row chrome minus the fixed 5-display-column right margin so every rendered physical row fits the CLI width while preserving the reserved right margin. Runtime is O(1). No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the derived target deviates from the documented subtraction and minimum-fallback contract.
 * @satisfies REQ-749, REQ-750
 */
test("next-workflow text column wrap target adapts to the terminal width with the fixed minimum fallback", () => {
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(undefined, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(0, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(-8, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(12.5, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(60, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(65, 15), NEXT_WORKFLOW_TEXT_COLUMN_MAX_WIDTH);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(80, 15), 50);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(120, 15), 90);
  assert.equal(resolveNextWorkflowTextColumnTargetWidth(200, 15), 170);
});

/**
 * @brief Verifies terminal-width conformance of the rendered Next-Workflow table.
 * @details Asserts one table rendered with an explicit adequate terminal column count and a long unbreakable token keeps every physical line within the terminal width minus the fixed 5-display-column right margin, renders its widest physical row exactly 5 display columns narrower than the terminal width, and preserves the full untruncated input text across the hard-broken continuation rows without leaking the condensed citation separator into the full-text table. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any physical table line exceeds the terminal width minus the right margin, the widest row deviates from the terminal-width-minus-margin bound, the untruncated token loses characters, or the table renders empty.
 * @satisfies REQ-722, REQ-724, REQ-729, REQ-731, REQ-749
 */
test("next-workflow command table keeps every physical row inside the terminal width", () => {
  const longToken = "pi.dev-src/pi/packages/coding-agent/src/modes/interactive/interactive-mode.ts:868-916,";
  const rendered = formatNextWorkflowCommandTable([
    { command: "req-fix", inputText: `Check the failing path ${longToken} then retry` },
  ], 100);
  assert.notEqual(rendered, "");
  const lines = rendered.split("\n");
  const widestLineWidth = Math.max(...lines.map((line) => line.length));
  assert.equal(widestLineWidth, 95, "the widest physical row stays exactly 5 display columns narrower than the 100-column terminal width");
  for (const line of lines) {
    assert.ok(line.length <= 95, `physical row exceeds the terminal width minus the right margin: ${line.length}`);
  }
  assert.ok(!rendered.includes(" .. "), "the full-text table never uses the condensed citation separator");
  const dataLines = lines.filter((line) => line.startsWith("│") && !line.includes("N."));
  const textCells = dataLines.map((line) => line.split("│")[3].trim());
  assert.ok(textCells.join("").includes(longToken), "all untruncated token characters stay present across the hard-broken rows");
});

/**
 * @brief Verifies the `/req-continue` command table rendering contract backing the retention notification.
 * @details Asserts the table headers `Continue comand`, `Workflow`, and `Text`, one capture-order row per entry carrying the directly invokable `/req-continue <ordinal>` command, the prefix-free uppercase workflow name, and the condensed first-20/` .. `/last-10 input-text citation with `N/A` for absent input text, plus the empty string for an empty entry array. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the rendered table breaks the row, citation, or empty-array contract.
 * @satisfies REQ-657, REQ-658, REQ-731, REQ-733, REQ-734, TST-216
 */
test("next-workflow continue command table prints one invokable command row per entry", () => {
  const rendered = formatNextWorkflowContinueCommandTable([
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
  ]);
  assert.equal(
    rendered,
    [
      "╭─────────────────┬──────────┬────────────────────────────────────╮",
      "│ Continue comand │ Workflow │ Text                               │",
      "╞═════════════════╪══════════╪════════════════════════════════════╡",
      "│ /req-continue 1 │ FIX      │ Fix the flaky retry  .. rator loop │",
      "├─────────────────┼──────────┼────────────────────────────────────┤",
      "│ /req-continue 2 │ CHECK    │ N/A                                │",
      "╰─────────────────┴──────────┴────────────────────────────────────╯",
    ].join("\n"),
  );
  assert.equal(formatNextWorkflowContinueCommandTable([]), "");
});

/**
 * @brief Verifies the mandatory-ordinal selection contract including error branches.
 * @details Asserts a decimal ordinal selects the one-based entry, the empty argument throws the mandatory-parameter diagnostic because `/req-continue` dispatch requires the integer ordinal, and a non-numeric argument plus an out-of-range ordinal throw deterministic `ReqError` diagnostics. Runtime is O(n) in argument length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when selection or rejection deviates from the documented contract.
 * @satisfies REQ-661, REQ-662, TST-217, TST-218
 */
test("next-workflow ordinal selection requires a numeric ordinal and validates one-based entries", () => {
  assert.equal(resolveNextWorkflowEntryIndex("1", 2), 0);
  assert.equal(resolveNextWorkflowEntryIndex(" 2 ", 2), 1);
  assert.throws(() => resolveNextWorkflowEntryIndex("", 2), /requires a numeric ordinal/);
  assert.throws(() => resolveNextWorkflowEntryIndex("3", 2), /outside the captured Next-Workflow range 1\.\.2/);
  assert.throws(() => resolveNextWorkflowEntryIndex("abc", 2), /requires a numeric ordinal/);
});

/**
 * @brief Verifies the process-scoped capture store replace, snapshot, and clear contract.
 * @details Asserts capture replaces the stored array with the mapped entries of the last parsed final-output JSON, snapshots are detached copies, clearing empties the array, one invalid final-output parse captures no entry, and the captured inventory accepts every pi-usereq command while excluding the `/new` orchestration command. Runtime is O(n) in entry count. Side effects are limited to process-scoped store mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the store accumulates stale entries or leaks detached references.
 * @satisfies REQ-653, REQ-654, REQ-655, REQ-656, TST-215
 */
test("next-workflow capture store replaces entries and clears deterministically", () => {
  resetNextWorkflowStateForTests();
  assert.deepEqual(getNextWorkflowCommands(), []);
  const captured = captureNextWorkflowCommands(parseAgentFinalOutput(buildFinalOutputJson([
    { command: "/req-check", text: "" },
  ])));
  assert.equal(captured.length, 1);
  const snapshot = getNextWorkflowCommands();
  assert.equal(snapshot.length, 1);
  snapshot.length = 0;
  assert.equal(getNextWorkflowCommands().length, 1);
  captureNextWorkflowCommands(parseAgentFinalOutput("No final-output JSON section."));
  assert.deepEqual(getNextWorkflowCommands(), []);
  clearNextWorkflowCommands();
  assert.deepEqual(getNextWorkflowCommands(), []);
  assert.ok(NEXT_WORKFLOW_COMMAND_NAMES.includes("req-continue"));
  assert.ok(NEXT_WORKFLOW_COMMAND_NAMES.includes("req-references"));
  assert.ok(!NEXT_WORKFLOW_COMMAND_NAMES.includes("new"));
  assert.equal(REQ_CONTINUE_COMMAND_DESCRIPTION, "Continue the previous agentic workflow with a captured Next-Workflow command");
});

/**
 * @brief Verifies the `/req-continue` handler registry stores and overrides per-command handlers.
 * @details Registers one spy handler, resolves it by command name, replaces it with a second handler to prove later extension binds win, and confirms unknown commands resolve to `undefined`. Runtime is O(1). Side effects are limited to process-scoped registry mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the registry loses the latest handler or resolves unknown commands.
 * @satisfies REQ-663, TST-217
 */
test("next-workflow handler registry stores the latest handler per command", () => {
  resetNextWorkflowStateForTests();
  assert.equal(resolveNextWorkflowCommandHandler("req-check"), undefined);
  const firstHandler = (args: string) => `first:${args}`;
  const secondHandler = (args: string) => `second:${args}`;
  registerNextWorkflowCommandHandler("req-check", firstHandler);
  assert.equal(resolveNextWorkflowCommandHandler("req-check"), firstHandler);
  registerNextWorkflowCommandHandler("req-check", secondHandler);
  assert.equal(resolveNextWorkflowCommandHandler("req-check"), secondHandler);
});
