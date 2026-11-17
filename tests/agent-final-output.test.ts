import test from "node:test";
import assert from "node:assert/strict";
import {
  captureAgentFinalOutputReport,
  colorizeAgentFinalOutputMarkdownText,
  getCapturedAgentFinalOutputReport,
  parseAgentFinalOutput,
  renderAgentFinalOutputMarkdownReport,
  resetAgentFinalOutputStateForTests,
} from "../src/core/agent-final-output.js";
import { ANSI_CODE, ANSI_ITALIC } from "../src/core/ansi-style.js";
import { formatNextWorkflowCommandTable } from "../src/core/next-workflow.js";
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
 * @brief Verifies final-output extraction recovers prose-wrapped, fenced, and prose-plus-fenced objects.
 * @details Parses four wrapped terminal outputs carrying one identical valid final-output JSON object — bare-object-following prose, a ```json code fence, prose plus a ```json code fence, and prose with a quoted non-object brace pair — asserting each parse succeeds with the same validated report so closure keeps working when the model wraps the object. Runtime is O(n) in output length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any wrapped output fails the parse or loses the report fields.
 * @satisfies REQ-584, REQ-710, TST-225
 */
test("agent-final-output parsing extracts prose-wrapped, fenced, and prose-plus-fenced objects", () => {
  const objectText = JSON.stringify({
    result: "ok",
    summary: "Wrapped summary.",
    next_commands: [{ command: "/req-fix", text: "Fix the flaky retry path" }],
  });
  const wrappedOutputs: string[] = [
    `Final verification passed.\n\n${objectText}`,
    "```json\n" + objectText + "\n```",
    `Validation commentary before the report.\n\n\`\`\`json\n${objectText}\n\`\`\``,
    `Note "quoted {braces} in prose" then ${objectText}`,
  ];
  for (const output of wrappedOutputs) {
    const parsed = parseAgentFinalOutput(output);
    assert.equal(parsed.ok, true, `expected acceptance for: ${output}`);
    if (!parsed.ok) {
      continue;
    }
    assert.equal(parsed.report.summary, "Wrapped summary.");
    assert.deepEqual(parsed.report.next_commands, [{ command: "req-fix", text: "Fix the flaky retry path" }]);
  }
});

/**
 * @brief Verifies final-output extraction rejects object-free and multi-object terminal outputs.
 * @details Parses one prose-only output, one output carrying two valid JSON objects, and one output carrying an empty fenced object plus one valid object, asserting every rejection returns the existing JSON-contract diagnostic so invalid outputs never feed the merge gate. Runtime is O(n) in output length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any rejected output parses successfully or returns the wrong diagnostic.
 * @satisfies REQ-711, TST-225
 */
test("agent-final-output parsing rejects object-free and multi-object outputs", () => {
  const firstObject = JSON.stringify({ result: "ok", summary: "First.", next_commands: [] });
  const secondObject = JSON.stringify({ result: "error", summary: "Second.", next_commands: [] });
  const rejectedOutputs: string[] = [
    "No report object in this text at all.",
    firstObject + " " + secondObject,
    "```json\n{}\n```\n" + secondObject,
  ];
  for (const output of rejectedOutputs) {
    const parsed = parseAgentFinalOutput(output);
    assert.equal(parsed.ok, false, `expected rejection for: ${output}`);
    if (parsed.ok) {
      continue;
    }
    assert.equal(parsed.errorMessage, "The final agent output is not exactly one valid JSON object.");
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

/**
 * @brief Verifies the ANSI colorizer colors every inline code span even when emphasis-lookalike asterisks surround it.
 * @details Colorizes the report-section line shape observed in the defect where the glob asterisk of `prompts/*.md` and the trailing asterisk of `req-*` sit on one physical line enclosing four inline code spans, then asserts all six code spans carry the code escape pair, no italic styling swallows the enclosed code, and every source character survives the ANSI substitution. Runtime is O(n) in line length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any inline code span stays uncolored, an italic span consumes the code region, or the plain text is mutated.
 * @satisfies REQ-715
 */
test("ANSI colorizer colors every inline code span despite emphasis-lookalike asterisks on the same line", () => {
  const line = "src/resources/prompts/*.md (15 file): token `search`/`files-search`/`static-check`/`result-json-validator` → req-*, `references-generation` → `req-references`, \"static-check output\" → \"req-static-check output\".";
  const colored = colorizeAgentFinalOutputMarkdownText(line);
  const codeSpanTexts = ["`search`", "`files-search`", "`static-check`", "`result-json-validator`", "`references-generation`", "`req-references`"];
  for (const codeSpan of codeSpanTexts) {
    assert.ok(colored.includes(`\u001b[${ANSI_CODE}m${codeSpan}\u001b[0m`), `inline code span ${codeSpan} must carry the code escape pair`);
  }
  assert.equal((colored.match(/\u001b\[36m/g) ?? []).length, codeSpanTexts.length, "exactly the six inline code spans must be styled as code");
  assert.ok(!colored.includes(`\u001b[${ANSI_ITALIC}m`), "emphasis-lookalike asterisks must not style the enclosed code region as italic");
  assert.equal(colored.replace(/\u001b\[[0-9;]*m/g, ""), line, "every source character outside escape sequences must survive the coloring");
});

/**
 * @brief Verifies the ANSI colorizer keeps coloring non-code markdown elements outside inline code spans.
 * @details Asserts bold, italic, and link elements still carry their escape pairs on a plain line and that an italic-lookalike asterisk pair enclosing an inline code span never prevents the code span coloring, pinning inline-code atomicity over emphasis matching. Runtime is O(n) in line length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any non-code element loses its styling or an enclosed code span stays uncolored.
 * @satisfies REQ-715
 */
test("ANSI colorizer keeps coloring bold, italic, links, and code spans enclosed by emphasis-lookalike asterisks", () => {
  const colored = colorizeAgentFinalOutputMarkdownText("**bold** and *italic* plus [text](url) plus `code` and *a `deep` b* end");
  assert.ok(colored.includes(`\u001b[1m**bold**\u001b[0m`), "bold element must carry the bold escape pair");
  assert.ok(colored.includes(`\u001b[${ANSI_ITALIC}m*italic*\u001b[0m`), "italic element must carry the italic escape pair");
  assert.ok(colored.includes(`\u001b[4;96m[text](url)\u001b[0m`), "link element must carry the link escape pair");
  assert.ok(colored.includes(`\u001b[${ANSI_CODE}m\`code\`\u001b[0m`), "plain inline code span must carry the code escape pair");
  assert.ok(colored.includes(`\u001b[${ANSI_CODE}m\`deep\`\u001b[0m`), "inline code span enclosed by emphasis-lookalike asterisks must carry the code escape pair");
});

/**
 * @brief Verifies single-quote spans render italic with nested inline code composed as italic plus code.
 * @details Colorizes the mandated mixed line where plain text, one single-quote span, and one nested inline code span coexist, asserting the pre-code text prints italic including the opening quote, the nested code span carries the combined italic-plus-code escape pair, the post-code text keeps italic styling despite the nested reset, the text outside the span stays unstyled, and every source character survives the ANSI substitution. Runtime is O(n) in line length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when any quoted region loses italic styling, the nested code span misses the composed escape pair, or the outer text gets styled.
 * @satisfies REQ-763, REQ-764, REQ-766
 */
test("ANSI colorizer renders single-quote spans as italic with nested inline code composed as italic plus code", () => {
  const line = "foo bar1 'foo bar2 `foo bar3` foo bar4'";
  const colored = colorizeAgentFinalOutputMarkdownText(line);
  assert.ok(colored.includes("\u001b[3m'foo bar2 \u001b[0m"), "text before the nested code span must print italic including the opening quote");
  assert.ok(colored.includes(`\u001b[${ANSI_ITALIC};${ANSI_CODE}m\`foo bar3\`\u001b[0m`), "the nested inline code span must carry the combined italic plus code escape pair");
  assert.ok(colored.includes("\u001b[3m foo bar4'\u001b[0m"), "text after the nested code span must keep italic styling despite the nested reset");
  assert.ok(!colored.includes("\u001b[3mfoo bar1"), "text outside the single-quote span must stay unstyled");
  assert.equal(colored.replace(/\u001b\[[0-9;]*m/g, ""), line, "every source character outside escape sequences must survive the coloring");
});

/**
 * @brief Verifies apostrophe-lookalike quotes never open spans and only paired single-quote spans style italic.
 * @details Colorizes one contraction-plus-possessive line and one mixed line where a contraction sits next to a paired single-quote span, asserting the contraction line renders escape-free, the paired span carries exactly one italic escape pair, the contraction apostrophe stays unstyled, and every source character survives the ANSI substitution. Runtime is O(n) in line length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when a contraction or possessive apostrophe opens a span or the paired span misses the italic escape pair.
 * @satisfies REQ-763, REQ-765
 */
test("ANSI colorizer keeps apostrophe-lookalike quotes unstyled and styles only paired single-quote spans", () => {
  const possessive = "don't worry about the book's cover";
  const coloredPossessive = colorizeAgentFinalOutputMarkdownText(possessive);
  assert.equal(coloredPossessive, possessive, "contraction and possessive apostrophes must not open or close a single-quote span");
  const paired = "it's 'fine' here";
  const coloredPaired = colorizeAgentFinalOutputMarkdownText(paired);
  assert.ok(coloredPaired.includes("\u001b[3m'fine'\u001b[0m"), "the paired single-quote span must carry the italic escape pair");
  assert.equal((coloredPaired.match(/\u001b\[3m/g) ?? []).length, 1, "exactly one italic escape opener must be emitted");
  assert.ok(!coloredPaired.includes("\u001b[3mit's"), "the contraction apostrophe must stay unstyled");
  assert.equal(coloredPaired.replace(/\u001b\[[0-9;]*m/g, ""), paired, "every source character outside escape sequences must survive the coloring");
});

/**
 * @brief Verifies fenced code blocks stay free of single-quote span styling while surrounding lines color normally.
 * @details Colorizes one text with a fenced block containing single quotes between two quoting lines, asserting the fenced content carries only the code escape pair, no italic escape appears inside the fence, and the single-quote spans on the surrounding lines carry the italic escape pair. Runtime is O(n) in text length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the fence content gains italic styling or an outside single-quote span stays unstyled.
 * @satisfies REQ-763, REQ-766
 */
test("ANSI colorizer keeps fenced code blocks free of single-quote span styling", () => {
  const text = "Plain 'quoted' text.\n```\ninside 'fence' block\n```\nAfter 'more' quoting.";
  const colored = colorizeAgentFinalOutputMarkdownText(text);
  assert.ok(colored.includes(`\u001b[${ANSI_CODE}minside 'fence' block\u001b[0m`), "fenced content must carry only the code escape pair");
  assert.ok(!colored.includes("\u001b[3minside"), "fenced single quotes must not open an italic region");
  assert.ok(colored.includes("\u001b[3m'quoted'\u001b[0m"), "the single-quote span before the fence must carry the italic escape pair");
  assert.ok(colored.includes("\u001b[3m'more'\u001b[0m"), "the single-quote span after the fence must carry the italic escape pair");
});

/**
 * @brief Verifies the shared colorizer applies single-quote span styling to the rendered Next-Workflow command table.
 * @details Renders one Next-Workflow command table with a quoted input-text cell at a fixed terminal width, colorizes it through the shared ANSI markdown colorizer, asserting the quoted fragment carries the italic escape pair and every source character of the table survives the ANSI substitution. Runtime is O(n) in table length. No external state is mutated.
 * @return {void} Promise-less assertions executed synchronously.
 * @throws {AssertionError} Throws when the table cell quote fragment misses the italic escape pair or the table text mutates.
 * @satisfies REQ-732, REQ-763
 */
test("ANSI colorizer applies single-quote span styling to the rendered Next-Workflow command table", () => {
  const table = formatNextWorkflowCommandTable([{ command: "req-fix", inputText: "Fix 'quoted' path" }], 80);
  const colored = colorizeAgentFinalOutputMarkdownText(table);
  assert.ok(colored.includes("\u001b[3m'quoted'\u001b[0m"), "the shared colorizer must style single-quote spans inside Next-Workflow table cells");
  assert.equal(colored.replace(/\u001b\[[0-9;]*m/g, ""), table, "every source character of the table must survive the coloring");
});
