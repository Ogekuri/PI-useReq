import test from "node:test";
import assert from "node:assert/strict";
import {
  captureNextWorkflowCommands,
  clearNextWorkflowCommands,
  condenseNextWorkflowInputText,
  formatNextWorkflowList,
  getNextWorkflowCommands,
  NEXT_WORKFLOW_COMMAND_NAMES,
  parseNextWorkflowCommandEntries,
  registerNextWorkflowCommandHandler,
  REQ_CONTINUE_COMMAND_DESCRIPTION,
  resetNextWorkflowStateForTests,
  resolveNextWorkflowCommandHandler,
  resolveNextWorkflowEntryIndex,
} from "../src/core/next-workflow.js";

/**
 * @brief Builds one synthetic final agent output carrying a Next-Workflow section.
 * @details Joins the supplied section body lines under the canonical `## **Next Workflow**` heading so parser tests exercise the exact block contract emitted by bundled prompts. Runtime is O(n) in body length. No external state is mutated.
 * @param[in] sectionBodyLines {string[]} Section body lines placed after the heading.
 * @return {string} Synthetic final agent output text.
 */
function buildNextWorkflowOutput(sectionBodyLines: string[]): string {
  return ["## **Summary**", "Implementation complete.", "", "## **Next Workflow**", ...sectionBodyLines, "", "STATUS: OK"].join("\n");
}

/**
 * @brief Verifies Next-Workflow parsing keeps pi-usereq commands plus `/req-continue` in section order.
 * @details Parses one synthetic final output carrying a `/req-fix` block with multi-line input text, a `/req-check` block without input text, a `/req-continue` exception block, and a purged `/new` orchestration block, then asserts the captured entries preserve section order, keep the multi-line input text, and drop the non-pi-usereq orchestration command. Runtime is O(n) in output length. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the parser keeps purged commands, drops the `/req-continue` exception, or loses section order.
 * @satisfies REQ-653, REQ-654, REQ-655, TST-215
 */
test("next-workflow parser keeps pi-usereq commands plus req-continue and purges orchestration commands", () => {
  resetNextWorkflowStateForTests();
  const entries = parseNextWorkflowCommandEntries(buildNextWorkflowOutput([
    "~~~text",
    "/req-fix",
    "Fix the flaky retry path in the orchestrator loop",
    "~~~",
    "",
    "~~~text",
    "/req-check",
    "~~~",
    "",
    "~~~text",
    "/new",
    "~~~",
    "",
    "~~~text",
    "/req-continue",
    "~~~",
  ]));
  assert.deepEqual(entries, [
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
    { command: "req-continue", inputText: "" },
  ]);
});

/**
 * @brief Verifies Next-Workflow parsing selects the last section and skips non-command blocks.
 * @details Parses one output carrying an earlier Next-Workflow section and a later one, then asserts only the terminal section contributes entries and blocks whose first non-empty line is not a `/` command are ignored. Runtime is O(n) in output length. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when an earlier section leaks entries or prose blocks produce commands.
 * @satisfies REQ-653, REQ-654, TST-215
 */
test("next-workflow parser selects the last section and skips non-command blocks", () => {
  resetNextWorkflowStateForTests();
  const entries = parseNextWorkflowCommandEntries([
    "## **Next Workflow**",
    "~~~text",
    "/req-check",
    "~~~",
    "",
    "## **Evidence**",
    "Evidence body.",
    "",
    "## **Next Workflow**",
    "~~~text",
    "not-a-command line",
    "~~~",
    "",
    "~~~text",
    "/req-refactor",
    "Rename the duplicated retry helper",
    "~~~",
  ].join("\n"));
  assert.deepEqual(entries, [{ command: "req-refactor", inputText: "Rename the duplicated retry helper" }]);
  assert.deepEqual(parseNextWorkflowCommandEntries("No Next-Workflow section here."), []);
});

/**
 * @brief Verifies the input-text condensation contract for long, short, and whitespace-heavy inputs.
 * @details Asserts inputs longer than the verbatim limit render as the first 20 characters followed by `...` followed by the last 10 characters, shorter inputs render verbatim, every whitespace run including newlines collapses to one space, and empty inputs render empty. Runtime is O(n) in input length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the condensed quotation does not match the documented first-20/last-10 contract.
 * @satisfies REQ-657, REQ-658, TST-216
 */
test("next-workflow input condensation renders first-20 plus ellipsis plus last-10", () => {
  assert.equal(condenseNextWorkflowInputText("Fix the flaky retry path in the orchestrator loop"), "Fix the flaky retry ...rator loop");
  assert.equal(condenseNextWorkflowInputText("short text"), "short text");
  assert.equal(condenseNextWorkflowInputText("123456789012345678901234567890"), "123456789012345678901234567890");
  assert.equal(condenseNextWorkflowInputText("1234567890123456789012345678901"), "12345678901234567890...2345678901");
  assert.equal(condenseNextWorkflowInputText("multi\nline   input\ttext"), "multi line input text");
  assert.equal(condenseNextWorkflowInputText("   "), "");
});

/**
 * @brief Verifies the numbered list rendering contract for quoted and bare commands.
 * @details Asserts the list numbers entries from one, quotes condensed input text in double quotes, renders commands without input text as bare slash commands, and returns the empty string for an empty entry array. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the rendered list breaks the one-command-per-line contract.
 * @satisfies REQ-657, REQ-658, TST-216
 */
test("next-workflow list rendering prints one numbered command per line", () => {
  const rendered = formatNextWorkflowList([
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
  ]);
  assert.equal(rendered, "1. /req-fix \"Fix the flaky retry ...rator loop\"\n2. /req-check");
  assert.equal(formatNextWorkflowList([]), "");
});

/**
 * @brief Verifies the one-based ordinal selection contract including error branches.
 * @details Asserts the empty argument selects the first entry, a decimal ordinal selects the one-based entry, a non-numeric argument and an out-of-range ordinal throw deterministic `ReqError` diagnostics. Runtime is O(n) in argument length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when selection or rejection deviates from the documented contract.
 * @satisfies REQ-661, REQ-662, TST-217, TST-218
 */
test("next-workflow ordinal selection maps empty to first and validates numeric ordinals", () => {
  assert.equal(resolveNextWorkflowEntryIndex("", 2), 0);
  assert.equal(resolveNextWorkflowEntryIndex(" 2 ", 2), 1);
  assert.throws(() => resolveNextWorkflowEntryIndex("3", 2), /outside the captured Next-Workflow range 1\.\.2/);
  assert.throws(() => resolveNextWorkflowEntryIndex("abc", 2), /optional numeric ordinal/);
});

/**
 * @brief Verifies the process-scoped capture store replace, snapshot, and clear contract.
 * @details Asserts capture replaces the stored array with the parsed entries of the last output, snapshots are detached copies, clearing empties the array, and the captured inventory accepts every pi-usereq command while excluding the `/new` orchestration command. Runtime is O(n) in output length. Side effects are limited to process-scoped store mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the store accumulates stale entries or leaks detached references.
 * @satisfies REQ-654, REQ-655, REQ-656, TST-215
 */
test("next-workflow capture store replaces entries and clears deterministically", () => {
  resetNextWorkflowStateForTests();
  assert.deepEqual(getNextWorkflowCommands(), []);
  const captured = captureNextWorkflowCommands(buildNextWorkflowOutput([
    "~~~text",
    "/req-check",
    "~~~",
  ]));
  assert.equal(captured.length, 1);
  const snapshot = getNextWorkflowCommands();
  assert.equal(snapshot.length, 1);
  snapshot.length = 0;
  assert.equal(getNextWorkflowCommands().length, 1);
  captureNextWorkflowCommands("No section.");
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
