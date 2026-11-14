import test from "node:test";
import assert from "node:assert/strict";
import {
  captureAgentFinalOutputReport,
  getCapturedAgentFinalOutputReport,
  parseAgentFinalOutput,
  renderAgentFinalOutputMarkdownReport,
  resetAgentFinalOutputStateForTests,
} from "../src/core/agent-final-output.js";
import { getDefaultConfig } from "../src/core/config.js";
import {
  runPiNotifyEffectsForOutcome,
  setPiNotifyHttpsRequestForTests,
  setPiNotifySpawnForTests,
  type PiNotifyEventRequest,
} from "../src/core/pi-notify.js";

/**
 * @brief Verifies final-output JSON parsing accepts one valid object and normalizes entries.
 * @details Parses one full final-output JSON carrying every report field plus `next_commands` entries with and without a leading slash and an entry missing `text`, then asserts the validated report keeps the `result` domain, every present report field, the normalized commands, and the empty-string text default. Runtime is O(n) in output length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the parser drops present fields, keeps raw command spellings, or fabricates text.
 * @satisfies REQ-677, REQ-678, REQ-679, TST-225
 */
test("agent-final-output parsing accepts one valid object and normalizes next_commands", () => {
  const parsed = parseAgentFinalOutput(JSON.stringify({
    result: "ok",
    summary: "Change implemented and verified.",
    outcome: "Workflow completed with one commit.",
    requirement_delta: "REQ-584 through REQ-588 updated.",
    design_delta: "One dedicated module owns the JSON gate.",
    implementation_delta: "src/core/agent-final-output.ts added.",
    verification_delta: "All suites passed.",
    evidence: "tsc --noEmit returned no diagnostics.",
    assumptions: "None.",
    next_workflow: "Continue with the captured commands.",
    next_commands: [
      { command: "/req-fix", text: "Fix the flaky retry path" },
      { command: "req-check" },
    ],
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.report.result, "ok");
  assert.equal(parsed.report.summary, "Change implemented and verified.");
  assert.equal(parsed.report.outcome, "Workflow completed with one commit.");
  assert.equal(parsed.report.requirement_delta, "REQ-584 through REQ-588 updated.");
  assert.equal(parsed.report.design_delta, "One dedicated module owns the JSON gate.");
  assert.equal(parsed.report.implementation_delta, "src/core/agent-final-output.ts added.");
  assert.equal(parsed.report.verification_delta, "All suites passed.");
  assert.equal(parsed.report.evidence, "tsc --noEmit returned no diagnostics.");
  assert.equal(parsed.report.assumptions, "None.");
  assert.equal(parsed.report.next_workflow, "Continue with the captured commands.");
  assert.deepEqual(parsed.report.next_commands, [
    { command: "req-fix", text: "Fix the flaky retry path" },
    { command: "req-check", text: "" },
  ]);
});

/**
 * @brief Verifies final-output JSON parsing tolerates absent optional report fields.
 * @details Parses one minimal final-output JSON carrying only `result`, `summary`, and an empty `next_commands` array, asserting the parse succeeds and every optional report field stays `undefined` without generating an error. Runtime is O(n) in output length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when absent optional fields fail the parse or materialize values.
 * @satisfies REQ-677, REQ-679, TST-225
 */
test("agent-final-output parsing tolerates absent optional report fields", () => {
  const parsed = parseAgentFinalOutput(JSON.stringify({
    result: "error",
    summary: "Blocked before any change.",
    next_commands: [],
  }));
  assert.equal(parsed.ok, true);
  if (!parsed.ok) {
    return;
  }
  assert.equal(parsed.report.result, "error");
  assert.deepEqual(parsed.report.next_commands, []);
  assert.equal(parsed.report.outcome, undefined);
  assert.equal(parsed.report.requirement_delta, undefined);
  assert.equal(parsed.report.design_delta, undefined);
  assert.equal(parsed.report.implementation_delta, undefined);
  assert.equal(parsed.report.verification_delta, undefined);
  assert.equal(parsed.report.evidence, undefined);
  assert.equal(parsed.report.assumptions, undefined);
  assert.equal(parsed.report.next_workflow, undefined);
});

/**
 * @brief Verifies final-output JSON parsing rejects every mandatory-field violation deterministically.
 * @details Parses one non-JSON output, one JSON array, and one object per missing `result`, invalid `result` domain, missing `summary`, non-string `summary`, and missing or non-array `next_commands`, asserting each rejection returns the deterministic English diagnostic. Runtime is O(n) in output length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any violation parses successfully or returns the wrong diagnostic.
 * @satisfies REQ-677, REQ-678, REQ-680, TST-225
 */
test("agent-final-output parsing rejects invalid outputs and mandatory-field violations", () => {
  const cases: Array<{ output: string; message: string }> = [
    { output: "Plain report without JSON.", message: "The final agent output is not exactly one valid JSON object." },
    { output: "[1, 2, 3]", message: "The final agent output is not exactly one valid JSON object." },
    { output: JSON.stringify({ summary: "Missing result.", next_commands: [] }), message: 'The final agent output JSON is missing the mandatory field "result".' },
    { output: JSON.stringify({ result: "warn", summary: "Invalid domain.", next_commands: [] }), message: 'The final agent output JSON field "result" must be exactly "ok" or "error".' },
    { output: JSON.stringify({ result: "ok", next_commands: [] }), message: 'The final agent output JSON is missing the mandatory string field "summary".' },
    { output: JSON.stringify({ result: "ok", summary: 7, next_commands: [] }), message: 'The final agent output JSON is missing the mandatory string field "summary".' },
    { output: JSON.stringify({ result: "ok", summary: "Missing commands." }), message: 'The final agent output JSON is missing the mandatory array field "next_commands".' },
    { output: JSON.stringify({ result: "ok", summary: "Non-array commands.", next_commands: "none" }), message: 'The final agent output JSON is missing the mandatory array field "next_commands".' },
  ];
  for (const { output, message } of cases) {
    const parsed = parseAgentFinalOutput(output);
    assert.equal(parsed.ok, false, `expected rejection for: ${output}`);
    if (parsed.ok) {
      continue;
    }
    assert.equal(parsed.errorMessage, message);
  }
});

/**
 * @brief Verifies markdown report rendering emits the fixed-order sections and omits absent fields.
 * @details Renders one report carrying `summary`, `outcome`, and `next_workflow`, asserting each present field renders as its `## **<Label>**` heading followed by the value in the fixed order with one blank line between sections; asserts a report with no optional field renders only the Summary section and `undefined` renders the empty string. Runtime is O(n) in report length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when headings, ordering, joining, or omission deviate from the contract.
 * @satisfies REQ-681, REQ-682, REQ-683, REQ-684, TST-225
 */
test("agent-final-output markdown report renders fixed-order sections and omits absent fields", () => {
  const rendered = renderAgentFinalOutputMarkdownReport({
    result: "ok",
    summary: "Summary text.",
    outcome: "Outcome text.",
    next_workflow: "Next workflow text.",
    next_commands: [],
  });
  assert.equal(
    rendered,
    [
      "## **Summary**\nSummary text.",
      "## **Outcome**\nOutcome text.",
      "## **Next Workflow**\nNext workflow text.",
    ].join("\n\n"),
  );
  const minimal = renderAgentFinalOutputMarkdownReport({
    result: "ok",
    summary: "Only summary.",
    next_commands: [],
  });
  assert.equal(minimal, "## **Summary**\nOnly summary.");
  assert.equal(renderAgentFinalOutputMarkdownReport(undefined), "");
});

/**
 * @brief Verifies the process-scoped captured report store replaces, clears, and resets.
 * @details Captures one valid parse and asserts the snapshot equals the report, captures one invalid parse and asserts the store clears to `undefined`, then resets and asserts the store stays empty. Runtime is O(n) in report size. Side effects are limited to process-scoped store mutation.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the store keeps an invalid capture or leaks a stale report.
 * @satisfies REQ-681, TST-225
 */
test("agent-final-output capture store replaces and clears the captured report", () => {
  resetAgentFinalOutputStateForTests();
  assert.equal(getCapturedAgentFinalOutputReport(), undefined);
  captureAgentFinalOutputReport(parseAgentFinalOutput(JSON.stringify({
    result: "ok",
    summary: "Captured summary.",
    next_commands: [{ command: "/req-check", text: "" }],
  })));
  const captured = getCapturedAgentFinalOutputReport();
  assert.equal(captured?.summary, "Captured summary.");
  assert.deepEqual(captured?.next_commands, [{ command: "req-check", text: "" }]);
  captureAgentFinalOutputReport(parseAgentFinalOutput("Not JSON."));
  assert.equal(getCapturedAgentFinalOutputReport(), undefined);
  captureAgentFinalOutputReport(parseAgentFinalOutput(JSON.stringify({
    result: "ok",
    summary: "Second summary.",
    next_commands: [],
  })));
  resetAgentFinalOutputStateForTests();
  assert.equal(getCapturedAgentFinalOutputReport(), undefined);
});

/**
 * @brief Builds one effective notification configuration with every channel enabled.
 * @details Derives the full default configuration and enables command-notify, the completed Pushover event, and Pushover credentials so `%%OUTPUT%%` substitution is observable on both channels. Runtime is O(1). No external state is mutated.
 * @param[in] notifyCommand {string} Shell command template substituted for `PI_NOTIFY_CMD`.
 * @return {Record<string, unknown>} Effective notification configuration subset.
 */
function buildNotifyTestConfig(notifyCommand: string): Record<string, unknown> {
  const config = getDefaultConfig("");
  return {
    ...config,
    "notify-enabled": true,
    "notify-on-completed": true,
    PI_NOTIFY_CMD: notifyCommand,
    "notify-pushover-enabled": true,
    "notify-pushover-on-completed": true,
    "notify-pushover-user-key": "user-key",
    "notify-pushover-api-token": "api-token",
    "notify-pushover-title": "%%PROMT%%",
    "notify-pushover-text": "%%OUTPUT%%",
  };
}

/**
 * @brief Records spawned notification commands and pushed Pushover bodies.
 * @details Installs the pi-notify test hooks capturing the substituted `PI_NOTIFY_CMD` shell command and the URL-encoded Pushover request body, returning both records plus one restore function. Runtime is O(1) per capture. Side effects are limited to module-local transport hook replacement.
 * @return {{ commands: string[]; bodies: string[]; restore: () => void }} Capture records and the hook restore function.
 */
function recordNotifyTransports(): { commands: string[]; bodies: string[]; restore: () => void } {
  const commands: string[] = [];
  const bodies: string[] = [];
  setPiNotifySpawnForTests(((command: string, args?: readonly string[] | undefined) => {
    commands.push([command, ...(args ?? [])].join(" "));
    const fakeChild = {
      once(_eventName: string, _handler: (...handlerArgs: unknown[]) => void) {
        return fakeChild;
      },
      unref() {
        return undefined;
      },
    };
    return fakeChild as unknown as ReturnType<typeof import("node:child_process").spawn>;
  }) as typeof import("node:child_process").spawn);
  setPiNotifyHttpsRequestForTests(((_url: URL, _options: Record<string, unknown>, callback?: (response: any) => void) => {
    const fakeResponse = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeResponse;
      },
      resume() {
        return undefined;
      },
    };
    callback?.(fakeResponse);
    const fakeRequest = {
      on(_eventName: string, _handler: (...args: any[]) => void) {
        return fakeRequest;
      },
      end(body?: string) {
        bodies.push(body ?? "");
      },
    };
    return fakeRequest as unknown as ReturnType<typeof import("node:https").request>;
  }) as typeof import("node:https").request);
  return {
    commands,
    bodies,
    restore: () => {
      setPiNotifySpawnForTests(undefined);
      setPiNotifyHttpsRequestForTests(undefined);
    },
  };
}

/**
 * @brief Verifies notification `%%OUTPUT%%` resolution uses the JSON `summary` for completed outcomes.
 * @details Runs `runPiNotifyEffectsForOutcome` for one completed outcome whose `agentOutput` is one valid final-output JSON, asserting both the substituted `PI_NOTIFY_CMD` command and the Pushover message body carry the JSON `summary` field instead of the raw serialized object. Runtime is O(n) in output length. Side effects are limited to module-local transport hook replacement.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when either channel substitutes the raw JSON instead of the summary.
 * @satisfies REQ-469, REQ-470, REQ-471, REQ-472, TST-226
 */
test("notification output substitution uses the final-output JSON summary for completed outcomes", () => {
  const recorder = recordNotifyTransports();
  try {
    const request: PiNotifyEventRequest = {
      promptName: "change",
      promptArgs: "adjust",
      basePath: "/tmp/project",
      completionTimeMs: 65_000,
      agentOutput: JSON.stringify({
        result: "ok",
        summary: "Change committed successfully.",
        next_commands: [],
      }),
    };
    runPiNotifyEffectsForOutcome(
      buildNotifyTestConfig('notify-send "%%OUTPUT%%"') as never,
      "completed",
      request,
    );
    assert.equal(recorder.commands.length, 1);
    assert.match(recorder.commands[0] ?? "", /Change committed successfully\./);
    assert.ok(!(recorder.commands[0] ?? "").includes("\"result\""));
    assert.equal(recorder.bodies.length, 1);
    const params = new URLSearchParams(recorder.bodies[0] ?? "");
    assert.equal(params.get("message"), "Change committed successfully.");
  } finally {
    recorder.restore();
  }
});

/**
 * @brief Verifies notification `%%OUTPUT%%` resolution keeps the raw output for unparseable completed outputs.
 * @details Runs `runPiNotifyEffectsForOutcome` for one completed outcome whose `agentOutput` is plain non-JSON text, asserting both channels substitute the raw output unchanged because no valid final-output JSON `summary` exists. Runtime is O(n) in output length. Side effects are limited to module-local transport hook replacement.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when either channel drops or rewrites the unparseable raw output.
 * @satisfies REQ-469, REQ-470, REQ-472, TST-226
 */
test("notification output substitution keeps the raw output for unparseable completed outputs", () => {
  const recorder = recordNotifyTransports();
  try {
    const request: PiNotifyEventRequest = {
      promptName: "change",
      promptArgs: "",
      basePath: "/tmp/project",
      completionTimeMs: 30_000,
      agentOutput: "Plain final report without JSON.",
    };
    runPiNotifyEffectsForOutcome(
      buildNotifyTestConfig('notify-send "%%OUTPUT%%"') as never,
      "completed",
      request,
    );
    assert.equal(recorder.commands.length, 1);
    assert.match(recorder.commands[0] ?? "", /Plain final report without JSON\./);
    assert.equal(recorder.bodies.length, 1);
    const params = new URLSearchParams(recorder.bodies[0] ?? "");
    assert.equal(params.get("message"), "Plain final report without JSON.");
  } finally {
    recorder.restore();
  }
});
