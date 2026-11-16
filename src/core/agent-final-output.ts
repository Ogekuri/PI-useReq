/**
 * @file
 * @brief Implements final-output JSON extraction, parsing, mandatory-field validation, markdown report rendering, and process-scoped report capture.
 * @details Extracts the one embedded JSON object from the terminal assistant text of one completed agentic prompt run, parses it as exactly one final-output JSON object, validates the mandatory `result`, `summary`, and `next_commands` fields, normalizes optional report fields and `next_commands` entries, renders the captured report fields as the fixed-order markdown section block printed before the final context-retention line, converts that block into ANSI-colored text with intense-yellow `## **<Label>**` headings plus colored markdown links, fenced code, inline code, bold, italic, and underlined elements, and stores the latest parsed report in one process-scoped store that survives extension rebinds so the retention notification of a successor session renders the report of the completed flow. Runtime is O(n) in output length per parse and O(1) per store access. Side effects are limited to process-scoped state mutation; no configuration file is written.
 * @satisfies DES-042, REQ-584, REQ-677, REQ-678, REQ-679, REQ-680, REQ-681, REQ-682, REQ-683, REQ-684, REQ-710, REQ-711, REQ-713, REQ-714, REQ-715
 */

/**
 * @brief Lists the only allowed values of the mandatory `result` field.
 * @details `ok` marks a successful agentic flow termination; `error` marks failure, blockage, or a no-change termination. Access complexity is O(1).
 * @satisfies REQ-678
 */
export const AGENT_FINAL_OUTPUT_RESULT_VALUES: readonly AgentFinalOutputResult[] = ["ok", "error"];

/**
 * @brief Represents one validated terminal result of an agentic flow.
 * @details Narrows the mandatory `result` field domain to exactly `ok` or `error`. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-678
 */
export type AgentFinalOutputResult = "ok" | "error";

/**
 * @brief Tests whether one candidate value is one valid final-output terminal result.
 * @details Narrows the mandatory `result` payload to the `ok|error` domain so the parsed report carries the literal union. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate parsed `result` payload.
 * @return {boolean} `true` when the value is exactly `ok` or `error`.
 * @satisfies REQ-678
 */
function isAgentFinalOutputResult(value: unknown): value is AgentFinalOutputResult {
  return AGENT_FINAL_OUTPUT_RESULT_VALUES.includes(value as AgentFinalOutputResult);
}

/**
 * @brief Represents one validated `next_commands` entry of the final-output JSON.
 * @details Pairs the invokable slash command, normalized without its leading slash, with the input text string; an absent `text` normalizes to the empty string. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-688
 */
export interface AgentFinalOutputCommandEntry {
  /** Invokable slash command with one optional leading slash stripped, such as `req-fix`. */
  command: string;
  /** Input text forwarded with the command; empty when no input is required. */
  text: string;
}

/**
 * @brief Describes one validated final-output JSON report.
 * @details Carries the mandatory `result` and `summary` values, every optional human-readable report field present as a string, and the normalized `next_commands` entries; absent optional fields stay `undefined` so the markdown renderer omits their sections. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-677, REQ-679
 */
export interface AgentFinalOutputReport {
  /** Mandatory terminal result of the agentic flow: exactly `ok` or `error`. */
  result: AgentFinalOutputResult;
  /** Mandatory human-readable summary of the entire final response. */
  summary: string;
  /** Optional human-readable workflow outcome and diagnostics. */
  outcome?: string;
  /** Optional human-readable requirement-change report. */
  requirement_delta?: string;
  /** Optional human-readable design-change report. */
  design_delta?: string;
  /** Optional human-readable implementation-change report. */
  implementation_delta?: string;
  /** Optional human-readable verification report. */
  verification_delta?: string;
  /** Optional human-readable evidence report. */
  evidence?: string;
  /** Optional human-readable assumptions report. */
  assumptions?: string;
  /** Optional human-readable next-workflow description. */
  next_workflow?: string;
  /** Mandatory array of mandated follow-up command entries; `[]` when none is mandated. */
  next_commands: AgentFinalOutputCommandEntry[];
}

/**
 * @brief Describes the discriminated outcome of one final-output parse attempt.
 * @details Either carries the validated report or one deterministic English diagnostic explaining why the terminal output is not one consumable final-output JSON object. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-677, REQ-678
 */
export type AgentFinalOutputParse =
  | { ok: true; report: AgentFinalOutputReport }
  | { ok: false; errorMessage: string };

/**
 * @brief Describes one report field rendered as one markdown section.
 * @details Pairs the report property key with its fixed markdown heading label so the renderer iterates one canonical ordered list. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-682, REQ-683
 */
interface AgentFinalOutputReportField {
  /** Report property key consumed from `AgentFinalOutputReport`. */
  field: keyof AgentFinalOutputReport;
  /** Fixed heading label rendered between the `## **` markers. */
  label: string;
}

/**
 * @brief Lists the report fields rendered as markdown sections in the fixed order.
 * @details Orders the sections exactly as `Summary`, `Outcome`, `Requirement Delta`, `Design Delta`, `Implementation Delta`, `Verification Delta`, `Evidence`, `Assumptions`, and `Next Workflow`. Access complexity is O(1).
 * @satisfies REQ-682
 */
export const AGENT_FINAL_OUTPUT_REPORT_FIELDS: readonly AgentFinalOutputReportField[] = [
  { field: "summary", label: "Summary" },
  { field: "outcome", label: "Outcome" },
  { field: "requirement_delta", label: "Requirement Delta" },
  { field: "design_delta", label: "Design Delta" },
  { field: "implementation_delta", label: "Implementation Delta" },
  { field: "verification_delta", label: "Verification Delta" },
  { field: "evidence", label: "Evidence" },
  { field: "assumptions", label: "Assumptions" },
  { field: "next_workflow", label: "Next Workflow" },
];

/**
 * @brief Tests whether one candidate value is a plain JSON object.
 * @details Rejects `null`, arrays, and non-objects so the parser accepts exactly one JSON object as the final output. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate parsed JSON value.
 * @return {boolean} `true` when the value is a plain object.
 */
function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Normalizes the mandatory `next_commands` payload into command entries.
 * @details Keeps only object entries whose `command` is a non-empty string, strips one leading slash so both `req-fix` and `/req-fix` spellings normalize identically, defaults an absent or non-string `text` to the empty string, and drops malformed entries without failing the parse because only the three top-level mandatory fields gate validation. Runtime is O(n) in entry count. No external state is mutated.
 * @param[in] value {unknown} Candidate parsed `next_commands` payload.
 * @return {AgentFinalOutputCommandEntry[]} Normalized command entries in payload order.
 * @satisfies REQ-688
 */
function normalizeAgentFinalOutputCommands(value: unknown): AgentFinalOutputCommandEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: AgentFinalOutputCommandEntry[] = [];
  for (const candidate of value) {
    if (!isPlainJsonObject(candidate)) {
      continue;
    }
    const rawCommand = candidate.command;
    if (typeof rawCommand !== "string" || rawCommand.trim().length === 0) {
      continue;
    }
    const command = rawCommand.startsWith("/") ? rawCommand.slice(1) : rawCommand;
    const text = typeof candidate.text === "string" ? candidate.text : "";
    entries.push({ command, text });
  }
  return entries;
}

/**
 * @brief Extracts the single embedded final-output JSON object from one terminal agent output.
 * @details Scans the trimmed text for every balanced top-level brace pair using string-literal-aware matching, validates each candidate through the native JSON parser plus `isPlainJsonObject`, and returns the sole candidate when exactly one valid JSON object exists; every other outcome returns the original trimmed text unchanged so `JSON.parse` fails with the existing JSON-contract diagnostic. The scan strips surrounding non-JSON prose and optional markdown code fences around the first balanced top-level JSON object without mutating the source text. Runtime is O(n) in output length. No external state is mutated.
 * @param[in] agentOutputText {string} Concatenated text content blocks of the final assistant message.
 * @return {string} The extracted JSON object substring when exactly one exists; otherwise the trimmed input text unchanged.
 * @satisfies REQ-710, REQ-711
 */
function extractFinalOutputJsonObject(agentOutputText: string): string {
  const trimmed = agentOutputText.trim();
  const candidates: string[] = [];
  let insideString = false;
  let escapedCharacter = false;
  let index = 0;
  while (index < trimmed.length) {
    const character = trimmed[index];
    if (insideString) {
      if (escapedCharacter) {
        escapedCharacter = false;
      } else if (character === "\\") {
        escapedCharacter = true;
      } else if (character === '"') {
        insideString = false;
      }
      index += 1;
      continue;
    }
    if (character === '"') {
      insideString = true;
      index += 1;
      continue;
    }
    if (character !== "{") {
      index += 1;
      continue;
    }
    let depth = 0;
    let candidateString = false;
    let candidateEscaped = false;
    let candidateEnd = -1;
    for (let scan = index; scan < trimmed.length; scan += 1) {
      const scanCharacter = trimmed[scan];
      if (candidateString) {
        if (candidateEscaped) {
          candidateEscaped = false;
        } else if (scanCharacter === "\\") {
          candidateEscaped = true;
        } else if (scanCharacter === '"') {
          candidateString = false;
        }
        continue;
      }
      if (scanCharacter === '"') {
        candidateString = true;
        continue;
      }
      if (scanCharacter === "{") {
        depth += 1;
        continue;
      }
      if (scanCharacter !== "}") {
        continue;
      }
      depth -= 1;
      if (depth === 0) {
        candidateEnd = scan;
        break;
      }
    }
    if (candidateEnd === -1) {
      index += 1;
      continue;
    }
    const candidate = trimmed.slice(index, candidateEnd + 1);
    let parsedCandidate: unknown;
    try {
      parsedCandidate = JSON.parse(candidate);
    } catch {
      parsedCandidate = undefined;
    }
    if (isPlainJsonObject(parsedCandidate)) {
      candidates.push(candidate);
    }
    index = candidateEnd + 1;
  }
  return candidates.length === 1 ? candidates[0] : trimmed;
}

/**
 * @brief Extracts and parses the terminal agent output as exactly one validated final-output JSON object.
 * @details Extracts the one embedded JSON object from the trimmed output through `extractFinalOutputJsonObject(...)` (stripping surrounding non-JSON prose and optional markdown code fences, rejecting object-free and multi-object outputs), then validates the mandatory `result` field against the `ok|error` domain, the mandatory `summary` field as a string, and the mandatory `next_commands` field as an array, normalizes `next_commands` entries, and copies every optional report field only when present as a string so absent optional fields never fail the parse. Every rejection returns one deterministic English diagnostic that callers surface to the user. Runtime is O(n) in output length. No external state is mutated.
 * @param[in] agentOutputText {string} Concatenated text content blocks of the final assistant message.
 * @return {AgentFinalOutputParse} Validated report, or the deterministic parse/validation diagnostic.
 * @satisfies REQ-584, REQ-677, REQ-678, REQ-679, REQ-680, REQ-710, REQ-711
 */
export function parseAgentFinalOutput(agentOutputText: string): AgentFinalOutputParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractFinalOutputJsonObject(agentOutputText));
  } catch {
    return { ok: false, errorMessage: "The final agent output is not exactly one valid JSON object." };
  }
  if (!isPlainJsonObject(parsed)) {
    return { ok: false, errorMessage: "The final agent output is not exactly one valid JSON object." };
  }
  if (parsed.result === undefined) {
    return { ok: false, errorMessage: 'The final agent output JSON is missing the mandatory field "result".' };
  }
  if (!isAgentFinalOutputResult(parsed.result)) {
    return {
      ok: false,
      errorMessage: 'The final agent output JSON field "result" must be exactly "ok" or "error".',
    };
  }
  if (typeof parsed.summary !== "string") {
    return { ok: false, errorMessage: 'The final agent output JSON is missing the mandatory string field "summary".' };
  }
  if (!Array.isArray(parsed.next_commands)) {
    return { ok: false, errorMessage: 'The final agent output JSON is missing the mandatory array field "next_commands".' };
  }
  const optionalFields: Record<string, string> = {};
  for (const { field } of AGENT_FINAL_OUTPUT_REPORT_FIELDS) {
    if (field === "summary") {
      continue;
    }
    const value = parsed[field];
    if (typeof value === "string") {
      optionalFields[field] = value;
    }
  }
  const report: AgentFinalOutputReport = {
    result: parsed.result,
    summary: parsed.summary,
    next_commands: normalizeAgentFinalOutputCommands(parsed.next_commands),
    ...optionalFields,
  };
  return { ok: true, report };
}

/**
 * @brief Renders the captured report fields as the fixed-order markdown section block.
 * @details Emits one `## **<Label>**` heading followed by the field value for every report field present as a string, in the fixed Summary-through-Next-Workflow order, joined by one blank line between consecutive sections; absent fields contribute no section. Runtime is O(n) in aggregate field length. No external state is mutated.
 * @param[in] report {AgentFinalOutputReport | undefined} Captured final-output report; `undefined` renders the empty string.
 * @return {string} Newline-delimited markdown sections, or the empty string when no report is captured.
 * @satisfies REQ-681, REQ-682, REQ-683, REQ-684
 */
export function renderAgentFinalOutputMarkdownReport(report: AgentFinalOutputReport | undefined): string {
  if (report === undefined) {
    return "";
  }
  const sections: string[] = [];
  for (const { field, label } of AGENT_FINAL_OUTPUT_REPORT_FIELDS) {
    const value = report[field];
    if (typeof value === "string") {
      sections.push(`## **${label}**\n${value}`);
    }
  }
  return sections.join("\n\n");
}

/**
 * @brief ANSI SGR reset sequence terminating every colored fragment of the ANSI report renderer.
 * @details Appended after every styled fragment so colored report output never leaks styling into surrounding notification text. The constant carries no logic. Access complexity is O(1).
 * @satisfies REQ-713
 */
const AGENT_FINAL_OUTPUT_ANSI_RESET = "\u001b[0m";

/**
 * @brief ANSI SGR parameter selecting the intense-yellow foreground of report section headings.
 * @details `93` is the ANSI high-intensity yellow foreground code applied to every `## **<Label>**` report heading. Access complexity is O(1).
 * @satisfies REQ-714
 */
const AGENT_FINAL_OUTPUT_ANSI_INTENSE_YELLOW = "93";

/**
 * @brief ANSI SGR parameter selecting bold emphasis for markdown bold elements.
 * @details `1` is the ANSI bold attribute applied to `**bold**` and `__bold__` markdown spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_BOLD = "1";

/**
 * @brief ANSI SGR parameter selecting italic emphasis for markdown italic elements.
 * @details `3` is the ANSI italic attribute applied to `*italic*` and `_italic_` markdown spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_ITALIC = "3";

/**
 * @brief ANSI SGR parameter selecting underline emphasis for markdown underlined elements.
 * @details `4` is the ANSI underline attribute applied to `<u>...</u>` markdown spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_UNDERLINE = "4";

/**
 * @brief ANSI SGR parameters selecting colored link text.
 * @details `4;96` combines the ANSI underline attribute with the bright-cyan foreground for `[text](url)` markdown links. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_LINK = "4;96";

/**
 * @brief ANSI SGR parameters selecting colored code text for fences and inline code quotes.
 * @details `36` is the ANSI cyan foreground applied to fenced code blocks and backtick inline code spans. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_CODE = "36";

/**
 * @brief Wraps one text fragment into the ANSI escape sequence selected by the supplied SGR parameters.
 * @details Emits `ESC[<codes>m` before the fragment and the ANSI reset after it, leaving empty fragments unstyled so colored output never contains empty escape pairs. Runtime is O(n) in fragment length. No external state is mutated.
 * @param[in] text {string} Text fragment to style.
 * @param[in] codes {string} Semicolon-separated ANSI SGR parameter list.
 * @return {string} ANSI-styled fragment, or the input unchanged when empty.
 * @satisfies REQ-713
 */
function applyAgentFinalOutputAnsiWrapping(text: string, codes: string): string {
  if (text.length === 0) {
    return text;
  }
  return `\u001b[${codes}m${text}${AGENT_FINAL_OUTPUT_ANSI_RESET}`;
}

/**
 * @brief Matches the inline markdown elements colored by the ANSI report renderer.
 * @details Alternation priority is inline code, link, bold `**`, bold `__`, `<u>` underline, italic `*`, and italic `_`; lookarounds keep intraword underscores and list-marker asterisks unstyled. The global flag serves `String.replace` only. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN =
  /(`[^`\n]+`)|(\[[^\]\n]+\]\([^)\n]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(<u>[^<\n]+<\/u>)|((?<![\w*])\*(?![\s*])[^*\n]+?(?<![\s*])\*(?![\w*]))|((?<![\w_])_(?![\s_])[^_\n]+?(?<![\s_])_(?![\w_]))/g;

/**
 * @brief Replaces one matched inline markdown element with its ANSI-colored rendering.
 * @details Dispatches on the matched prefix: backtick spans style as code, `[text](url)` links style as colored links, `**`/`__` spans style bold, `<u>` spans strip their tags and style the inner text underlined, and every remaining match styles italic. Runtime is O(n) in match length. No external state is mutated.
 * @param[in] match {string} Matched inline markdown element.
 * @return {string} ANSI-colored rendering of the matched element.
 * @satisfies REQ-715
 */
function replaceAgentFinalOutputAnsiInline(match: string): string {
  if (match.startsWith("`")) {
    return applyAgentFinalOutputAnsiWrapping(match, AGENT_FINAL_OUTPUT_ANSI_CODE);
  }
  if (match.startsWith("[")) {
    return applyAgentFinalOutputAnsiWrapping(match, AGENT_FINAL_OUTPUT_ANSI_LINK);
  }
  if (match.startsWith("**") || match.startsWith("__")) {
    return applyAgentFinalOutputAnsiWrapping(match, AGENT_FINAL_OUTPUT_ANSI_BOLD);
  }
  if (match.startsWith("<u>")) {
    return applyAgentFinalOutputAnsiWrapping(match.slice(3, -4), AGENT_FINAL_OUTPUT_ANSI_UNDERLINE);
  }
  return applyAgentFinalOutputAnsiWrapping(match, AGENT_FINAL_OUTPUT_ANSI_ITALIC);
}

/**
 * @brief Converts one rendered markdown report into ANSI-colored text.
 * @details Colors every `## **<Label>**` heading with intense yellow, keeps fenced code blocks plus their fence lines in the code color across the fence state machine, and applies inline markdown coloring to every remaining line so every source character of the plain rendering stays present. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] text {string} Plain markdown report text produced by the fixed-order renderer.
 * @return {string} ANSI-colored report text.
 * @satisfies REQ-713, REQ-714, REQ-715
 */
function colorizeAgentFinalOutputMarkdownText(text: string): string {
  const renderedLines: string[] = [];
  let insideFence = false;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      insideFence = !insideFence;
      renderedLines.push(applyAgentFinalOutputAnsiWrapping(line, AGENT_FINAL_OUTPUT_ANSI_CODE));
      continue;
    }
    if (insideFence) {
      renderedLines.push(applyAgentFinalOutputAnsiWrapping(line, AGENT_FINAL_OUTPUT_ANSI_CODE));
      continue;
    }
    if (/^##\s+\*\*[^*]+\*\*$/.test(line)) {
      renderedLines.push(applyAgentFinalOutputAnsiWrapping(line, AGENT_FINAL_OUTPUT_ANSI_INTENSE_YELLOW));
      continue;
    }
    renderedLines.push(line.replace(AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN, replaceAgentFinalOutputAnsiInline));
  }
  return renderedLines.join("\n");
}

/**
 * @brief Renders the captured report fields as the fixed-order ANSI-colored markdown section block.
 * @details Renders the plain fixed-order report through `renderAgentFinalOutputMarkdownReport(...)` and converts it through the ANSI markdown colorizer so every section heading prints in intense yellow and links, fences, inline code, bold, italic, and underlined elements print colored; `undefined` reports render the empty string. Runtime is O(n) in aggregate field length. No external state is mutated.
 * @param[in] report {AgentFinalOutputReport | undefined} Captured final-output report; `undefined` renders the empty string.
 * @return {string} ANSI-colored newline-delimited markdown sections, or the empty string when no report is captured.
 * @satisfies REQ-713, REQ-714, REQ-715
 */
export function renderAgentFinalOutputAnsiReport(report: AgentFinalOutputReport | undefined): string {
  return colorizeAgentFinalOutputMarkdownText(renderAgentFinalOutputMarkdownReport(report));
}

/**
 * @brief Stores the process-scoped captured final-output report persisted across extension rebinds.
 * @details Holds the latest parsed report on `globalThis` because pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` while the hosting process persists, so the retention notification of the successor session renders the report of the completed flow. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-681
 */
interface ProcessScopedAgentFinalOutputStore {
  /** Latest captured final-output report of the last captured completed agentic flow. */
  capturedReport: AgentFinalOutputReport | undefined;
}

type GlobalAgentFinalOutputStore = typeof globalThis & {
  __piUsereqAgentFinalOutputStore?: ProcessScopedAgentFinalOutputStore;
};

/**
 * @brief Returns the process-scoped captured final-output report store.
 * @details Lazily initializes one `globalThis` record so session rebinds reuse the captured report instead of resetting it. Runtime is O(1). Side effect: initializes process-scoped state on first access.
 * @return {ProcessScopedAgentFinalOutputStore} Mutable process-scoped report store.
 */
function getProcessScopedAgentFinalOutputStore(): ProcessScopedAgentFinalOutputStore {
  const store = globalThis as GlobalAgentFinalOutputStore;
  if (store.__piUsereqAgentFinalOutputStore === undefined) {
    store.__piUsereqAgentFinalOutputStore = { capturedReport: undefined };
  }
  return store.__piUsereqAgentFinalOutputStore;
}

/**
 * @brief Captures the final-output report of one completed agentic run into the process-scoped store.
 * @details Stores the validated report so the final context-retention notification renders its markdown sections, and stores `undefined` for one invalid parse so a terminal output that violates the JSON contract never feeds stale report sections to the retention notification. Runtime is O(1). Side effect: mutates process-scoped capture state.
 * @param[in] finalOutput {AgentFinalOutputParse} Parse result of the terminal completed output.
 * @return {void} No return value.
 * @satisfies REQ-681
 */
export function captureAgentFinalOutputReport(finalOutput: AgentFinalOutputParse): void {
  getProcessScopedAgentFinalOutputStore().capturedReport = finalOutput.ok ? finalOutput.report : undefined;
}

/**
 * @brief Returns a detached snapshot of the captured final-output report.
 * @details Copies the captured report so callers render or inspect it without mutating the stored state. Runtime is O(n) in report size. No external state is mutated.
 * @return {AgentFinalOutputReport | undefined} Captured report snapshot, or `undefined` when the last capture was invalid or none exists.
 * @satisfies REQ-681
 */
export function getCapturedAgentFinalOutputReport(): AgentFinalOutputReport | undefined {
  const captured = getProcessScopedAgentFinalOutputStore().capturedReport;
  return captured === undefined ? undefined : { ...captured, next_commands: [...captured.next_commands] };
}

/**
 * @brief Resets the process-scoped final-output capture state for deterministic tests.
 * @details Clears the captured report so one test can simulate independent pi host processes without leaking the report of a previous flow into later retention assertions. Runtime is O(1). Side effect: mutates process-scoped state.
 * @return {void} No return value.
 */
export function resetAgentFinalOutputStateForTests(): void {
  getProcessScopedAgentFinalOutputStore().capturedReport = undefined;
}
