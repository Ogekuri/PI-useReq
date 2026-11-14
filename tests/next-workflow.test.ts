import test from "node:test";
import assert from "node:assert/strict";
import {
  captureNextWorkflowCommands,
  clearNextWorkflowCommands,
  condenseNextWorkflowInputText,
  formatNextWorkflowFullList,
  formatNextWorkflowList,
  getNextWorkflowCommands,
  NEXT_WORKFLOW_COMMAND_NAMES,
  NEXT_WORKFLOW_EMPTY_LIST_TEXT,
  parseNextWorkflowCommandEntries,
  registerNextWorkflowCommandHandler,
  REQ_CONTINUE_COMMAND_DESCRIPTION,
  resetNextWorkflowStateForTests,
  resolveNextWorkflowCommandHandler,
  resolveNextWorkflowEntryIndex,
} from "../src/core/next-workflow.js";

/**
 * @brief Builds one synthetic final agent output carrying a `~~~NEXT_WORKFLOW` fence.
 * @details Joins the supplied fence body lines between the `~~~NEXT_WORKFLOW` opening fence and its `~~~` closing fence inside one synthetic report carrying the parseable `~~~RESULT_SUMMARY` summary block and the terminal `STATUS_OK` keyword, so parser tests exercise the exact fence contract emitted by bundled prompts. Runtime is O(n) in body length. No external state is mutated.
 * @param[in] fenceBodyLines {string[]} Fence body lines placed between the fence markers.
 * @return {string} Synthetic final agent output text.
 */
function buildNextWorkflowOutput(fenceBodyLines: string[]): string {
  return [
    "~~~RESULT_SUMMARY",
    "Implementation complete.",
    "~~~",
    "",
    "~~~NEXT_WORKFLOW",
    ...fenceBodyLines,
    "~~~",
    "",
    "STATUS_OK",
  ].join("\n");
}

/**
 * @brief Verifies Next-Workflow parsing keeps pi-usereq commands plus `/req-continue` in entry order.
 * @details Parses one synthetic final output carrying one `~~~NEXT_WORKFLOW` fence with a `/req-fix` entry with multi-line input text, a `/req-check` entry without input text, a `/req-continue` exception entry, and a purged `/new` orchestration entry, then asserts the captured entries preserve entry order, keep the multi-line input text, and drop the non-pi-usereq orchestration command. Runtime is O(n) in output length. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the parser keeps purged commands, drops the `/req-continue` exception, or loses entry order.
 * @satisfies REQ-653, REQ-654, REQ-655, TST-215
 */
test("next-workflow parser keeps pi-usereq commands plus req-continue and purges orchestration commands", () => {
  resetNextWorkflowStateForTests();
  const entries = parseNextWorkflowCommandEntries(buildNextWorkflowOutput([
    "/req-fix",
    "Fix the flaky retry path in the orchestrator loop",
    "",
    "/req-check",
    "",
    "/new",
    "",
    "/req-continue",
  ]));
  assert.deepEqual(entries, [
    { command: "req-fix", inputText: "Fix the flaky retry path in the orchestrator loop" },
    { command: "req-check", inputText: "" },
    { command: "req-continue", inputText: "" },
  ]);
});

/**
 * @brief Verifies Next-Workflow parsing selects the last fence and skips non-command entries.
 * @details Parses one output carrying an earlier `~~~NEXT_WORKFLOW` fence and a later one, then asserts only the terminal fence contributes entries and entries whose first non-empty line is not a `/` command are ignored. Runtime is O(n) in output length. Side effects are limited to process-scoped capture reset.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when an earlier fence leaks entries or prose entries produce commands.
 * @satisfies REQ-653, REQ-654, TST-215
 */
test("next-workflow parser selects the last fence and skips non-command entries", () => {
  resetNextWorkflowStateForTests();
  const entries = parseNextWorkflowCommandEntries([
    "~~~NEXT_WORKFLOW",
    "/req-check",
    "~~~",
    "",
    "## **Evidence**",
    "Evidence body.",
    "",
    "~~~NEXT_WORKFLOW",
    "not-a-command line",
    "",
    "/req-refactor",
    "Rename the duplicated retry helper",
    "~~~",
  ].join("\n"));
  assert.deepEqual(entries, [{ command: "req-refactor", inputText: "Rename the duplicated retry helper" }]);
  assert.deepEqual(parseNextWorkflowCommandEntries("No Next-Workflow fence here."), []);
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
 * @brief Verifies the full-list rendering contract backing `/req-continue-list`.
 * @details Asserts the list numbers entries from one in capture order, renders commands without input text as bare slash commands, renders input text verbatim in double quotes without condensation truncation or whitespace collapsing including embedded newlines, and returns the documented empty-list placeholder for an empty entry array. Runtime is O(n) in entry length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the full list truncates, collapses, or reorders captured input text or breaks the empty-array placeholder contract.
 * @satisfies REQ-672, REQ-676, TST-223
 */
test("next-workflow full list rendering prints complete input text for req-continue-list", () => {
  const longInputText = "Fix the flaky retry path in the orchestrator loop and verify every regression suite stays green";
  assert.notEqual(condenseNextWorkflowInputText(longInputText), longInputText);
  const rendered = formatNextWorkflowFullList([
    { command: "req-fix", inputText: longInputText },
    { command: "req-check", inputText: "" },
    { command: "req-new", inputText: "first line\nsecond line" },
  ]);
  assert.equal(
    rendered,
    `1. /req-fix "${longInputText}"\n2. /req-check\n3. /req-new "first line\nsecond line"`,
  );
  assert.equal(formatNextWorkflowFullList([]), NEXT_WORKFLOW_EMPTY_LIST_TEXT);
  assert.equal(NEXT_WORKFLOW_EMPTY_LIST_TEXT, "No captured Next-Workflow commands.");
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
    "/req-check",
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
