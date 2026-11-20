/**
 * @file
 * @brief Implements final-output JSON extraction, parsing, mandatory-field validation, markdown report rendering, and process-scoped report capture.
 * @details Extracts the one embedded JSON object from the terminal assistant text of one completed agentic prompt run, parses it as exactly one final-output JSON object, validates the mandatory `result`, `summary`, and `next_commands` fields, normalizes optional report fields and `next_commands` entries, renders the captured report fields as the fixed-order markdown section block printed before the final context-retention line, converts that block into ANSI-colored text with intense-yellow `## **<Label>**` headings, an intense-white `Summary`-section body base, plus colored markdown links, fenced code, inline code, bold, italic, underlined, and single-quote-span elements, and stores the latest parsed report in one process-scoped store that survives extension rebinds so the retention notification of a successor session renders the report of the completed flow. Runtime is O(n) in output length per parse and O(1) per store access. Side effects are limited to process-scoped state mutation; no configuration file is written.
 * @satisfies DES-042, REQ-584, REQ-677, REQ-678, REQ-679, REQ-680, REQ-681, REQ-682, REQ-683, REQ-684, REQ-710, REQ-711, REQ-713, REQ-714, REQ-715, REQ-720, REQ-721, REQ-763, REQ-764, REQ-765, REQ-766, REQ-767, REQ-811, REQ-812
 */

import { ANSI_BOLD, ANSI_CODE, ANSI_INTENSE_WHITE, ANSI_INTENSE_YELLOW, ANSI_ITALIC, ANSI_LINK, ANSI_UNDERLINE, wrapAnsiStyle } from "./ansi-style.js";
import { measureDisplayWidth } from "./config-cli-render.js";

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
 * @details Narrows the mandatory `result` payload to the `ok|error` domain so the parsed report carries the literal union. Exported so the `req-result-json-validator` final-output contract evaluator reuses the identical domain source instead of duplicating it. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate parsed `result` payload.
 * @return {boolean} `true` when the value is exactly `ok` or `error`.
 * @satisfies REQ-678, REQ-726
 */
export function isAgentFinalOutputResult(value: unknown): value is AgentFinalOutputResult {
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
 * @brief Heading label identifying the report section whose body renders with the intense-white base foreground.
 * @details Matches the `Summary` heading label emitted by `AGENT_FINAL_OUTPUT_REPORT_FIELDS` so the shared ANSI colorizer can scope the intense-white body styling to that section only while every other section body and non-report payload keep the terminal default foreground. Access complexity is O(1).
 * @satisfies REQ-811, REQ-812
 */
const AGENT_FINAL_OUTPUT_SUMMARY_SECTION_LABEL = "Summary";

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
 * @brief Matches the inline-code spans colored atomically by the ANSI report renderer.
 * @details Matches one non-empty backtick-delimited span without backticks or newlines. The capture group keeps the span inside `String.split` results at odd indices so the code span coloring takes absolute precedence over the emphasis alternatives. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_CODE_SPAN_PATTERN = /(`[^`\n]+`)/;

/**
 * @brief Matches the non-code inline markdown elements colored by the ANSI report renderer.
 * @details Alternation priority is link, bold `**`, bold `__`, `<u>` underline, italic `*`, and italic `_`; lookarounds keep intraword underscores and list-marker asterisks unstyled. The pattern never matches inline code or single-quote spans because `colorizeAgentFinalOutputInlineLine(...)` segments protected spans out first, so emphasis matching can no longer consume enclosed inline code or quoted regions. The global flag serves `String.replace` only. Access complexity is O(1).
 * @satisfies REQ-715
 */
const AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN =
  /(\[[^\]\n]+\]\([^)\n]+\))|(\*\*[^*\n]+\*\*)|(__[^_\n]+__)|(<u>[^<\n]+<\/u>)|((?<![\w*])\*(?![\s*])[^*\n]+?(?<![\s*])\*(?![\w*]))|((?<![\w_])_(?![\s_])[^_\n]+?(?<![\s_])_(?![\w_]))/g;

/**
 * @brief Matches the protected spans colored atomically by the ANSI report renderer: inline code spans and single-quote spans.
 * @details Alternation priority is inline code then single-quote span, so the regex engine always consumes the span that starts first and no emphasis alternative can consume a protected region. A single-quote span pairs one opening quote not preceded by a word character with one closing quote not followed by a word character, rejects whitespace-adjacent and empty content through the inner lookarounds, stays lazy so paired quotes on one line produce separate spans, and never crosses a newline. The capture group keeps the span inside `String.split` results at odd indices. Access complexity is O(1).
 * @satisfies REQ-763, REQ-765, REQ-766
 */
const AGENT_FINAL_OUTPUT_ANSI_PROTECTED_SPAN_PATTERN =
  /(`[^`\n]+`|(?<!\w)'(?![\s'])[^'\n]+?(?<![\s'])'(?!\w))/;

/**
 * @brief Replaces one matched inline markdown element with its ANSI-colored rendering.
 * @details Dispatches on the matched prefix: backtick spans style as code, `[text](url)` links style as colored links, `**`/`__` spans style bold, `<u>` spans strip their tags and style the inner text underlined, and every remaining match styles italic. Runtime is O(n) in match length. No external state is mutated.
 * @param[in] match {string} Matched inline markdown element.
 * @return {string} ANSI-colored rendering of the matched element.
 * @satisfies REQ-715
 */
function replaceAgentFinalOutputAnsiInline(match: string): string {
  if (match.startsWith("`")) {
    return wrapAnsiStyle(match, ANSI_CODE);
  }
  if (match.startsWith("[")) {
    return wrapAnsiStyle(match, ANSI_LINK);
  }
  if (match.startsWith("**") || match.startsWith("__")) {
    return wrapAnsiStyle(match, ANSI_BOLD);
  }
  if (match.startsWith("<u>")) {
    return wrapAnsiStyle(match.slice(3, -4), ANSI_UNDERLINE);
  }
  return wrapAnsiStyle(match, ANSI_ITALIC);
}

/**
 * @brief Replaces one matched protected span with its ANSI-colored rendering.
 * @details Dispatches on the matched prefix: single-quote spans compose italic and code SGR parameters per inner token, and every remaining protected span renders through the shared inline dispatcher. Runtime is O(n) in segment length. No external state is mutated.
 * @param[in] segment {string} Matched protected span, either an inline code span or a single-quote span.
 * @return {string} ANSI-colored rendering of the protected span.
 * @satisfies REQ-763, REQ-764
 */
function replaceAgentFinalOutputAnsiProtectedSpan(segment: string): string {
  if (segment.startsWith("'")) {
    return colorizeAgentFinalOutputQuotedSpan(segment);
  }
  return replaceAgentFinalOutputAnsiInline(segment);
}

/**
 * @brief Colorizes one single-quote span with italic wrapping and composed italic-plus-code inline code tokens.
 * @details Splits the span on the inline-code-span pattern, styles each code-span token with the combined italic and code SGR parameter list, and styles every remaining token, including the delimiting quote characters, with the italic escape pair, so per-token styling closes each escape region before the next token and a nested code reset never terminates the enclosing italic region. Runtime is O(n) in span length. No external state is mutated.
 * @param[in] span {string} Matched single-quote span including its delimiting quote characters.
 * @return {string} ANSI-colored span where plain tokens print italic and enclosed inline code prints italic plus code.
 * @satisfies REQ-763, REQ-764, REQ-767
 */
function colorizeAgentFinalOutputQuotedSpan(span: string): string {
  return span
    .split(AGENT_FINAL_OUTPUT_ANSI_CODE_SPAN_PATTERN)
    .map((token, tokenIndex) =>
      tokenIndex % 2 === 1
        ? wrapAnsiStyle(token, `${ANSI_ITALIC};${ANSI_CODE}`)
        : wrapAnsiStyle(token, ANSI_ITALIC),
    )
    .join("");
}

/**
 * @brief Composes the intense-white base foreground into one single-quote span rendering inside the `Summary` body.
 * @details Splits the span on the inline-code-span pattern, styles each code-span token with the combined intense-white, italic, and code SGR parameter list, and styles every remaining token, including the delimiting quote characters, with the combined intense-white and italic parameter list, so per-token styling closes each escape region before the next token and a nested code reset never terminates the enclosing white-and-italic region.
 * @param[in] span {string} Matched single-quote span including its delimiting quote characters.
 * @return {string} ANSI-colored span where plain tokens print intense white plus italic and enclosed inline code prints intense white plus italic plus code.
 * @satisfies REQ-811, REQ-763, REQ-764, REQ-767
 */
function colorizeAgentFinalOutputSummaryQuotedSpan(span: string): string {
  return span
    .split(AGENT_FINAL_OUTPUT_ANSI_CODE_SPAN_PATTERN)
    .map((token, tokenIndex) =>
      tokenIndex % 2 === 1
        ? wrapAnsiStyle(token, `${ANSI_INTENSE_WHITE};${ANSI_ITALIC};${ANSI_CODE}`)
        : wrapAnsiStyle(token, `${ANSI_INTENSE_WHITE};${ANSI_ITALIC}`),
    )
    .join("");
}

/**
 * @brief Renders one protected span inside the `Summary` body with its inline-element styling preserved.
 * @details Dispatches single-quote spans onto the intense-white composed quote renderer so the white base combines with the italic emphasis per token, and routes every remaining protected span through the shared inline dispatcher so inline code, links, bold, underline, and plain italic keep their own colors inside the `Summary` body.
 * @param[in] segment {string} Matched protected span, either an inline code span or a single-quote span.
 * @return {string} ANSI-colored rendering of the protected span.
 * @satisfies REQ-811, REQ-812, REQ-715
 */
function colorizeAgentFinalOutputSummaryProtectedSpan(segment: string): string {
  if (segment.startsWith("'")) {
    return colorizeAgentFinalOutputSummaryQuotedSpan(segment);
  }
  return replaceAgentFinalOutputAnsiInline(segment);
}

/**
 * @brief Styles every plain text run between inline markdown elements of one `Summary` body segment with the intense-white foreground.
 * @details Walks the inline-element matches of the segment, wraps every unmatched gap in the intense-white escape pair, renders every matched inline element through the shared inline dispatcher, and joins the tokens so inline elements keep their own colors while the surrounding plain text reads bright white.
 * @param[in] segment {string} Plain markdown segment outside protected spans.
 * @return {string} ANSI-colored segment.
 * @satisfies REQ-811, REQ-812, REQ-715
 */
function colorizeAgentFinalOutputSummaryPlainSegment(segment: string): string {
  const styledTokens: string[] = [];
  let cursor = 0;
  for (let match = AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN.exec(segment); match !== null; match = AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN.exec(segment)) {
    if (match.index > cursor) {
      styledTokens.push(wrapAnsiStyle(segment.slice(cursor, match.index), ANSI_INTENSE_WHITE));
    }
    styledTokens.push(replaceAgentFinalOutputAnsiInline(match[0]));
    cursor = match.index + match[0].length;
  }
  if (cursor < segment.length) {
    styledTokens.push(wrapAnsiStyle(segment.slice(cursor), ANSI_INTENSE_WHITE));
  }
  return styledTokens.join("");
}

/**
 * @brief Colorizes one non-fence body line of the `Summary` report section with the intense-white base foreground.
 * @details Splits the line on the protected-span pattern, styles protected spans through the `Summary` dispatcher, styles every plain segment through the intense-white plain-segment renderer, and joins the segments so the `Summary` body reads brighter than every other report section body while inline and quote-span styling stays per-token composed.
 * @param[in] line {string} Plain markdown line following the `## **Summary**` heading.
 * @return {string} ANSI-colored line.
 * @satisfies REQ-811, REQ-812, REQ-715, REQ-763, REQ-764, REQ-765, REQ-766, REQ-767
 */
function colorizeAgentFinalOutputSummaryBodyLine(line: string): string {
  return line
    .split(AGENT_FINAL_OUTPUT_ANSI_PROTECTED_SPAN_PATTERN)
    .map((segment, segmentIndex) =>
      segmentIndex % 2 === 1
        ? colorizeAgentFinalOutputSummaryProtectedSpan(segment)
        : colorizeAgentFinalOutputSummaryPlainSegment(segment),
    )
    .join("");
}

/**
 * @brief Renders one report section label as a rounded box frame sized from the label length.
 * @details Emits three lines framing the label with one leading and one trailing space: `╭` plus a dash run plus `╮`, `│` plus the padded label plus `│`, and `╰` plus the dash run plus `╯`, where the dash run equals the label display width plus two and every character comes from the mandated rounded box-drawing set. Runtime is O(n) in label length. No external state is mutated.
 * @param[in] label {string} Report section label rendered inside the frame.
 * @return {string[]} Three box lines in top, middle, and bottom order.
 * @satisfies REQ-720, REQ-721
 * @note Complexity: O(n) in label length. Pure; no side effects.
 */
function renderAgentFinalOutputSectionTitleBox(label: string): string[] {
  const dashes = "─".repeat(measureDisplayWidth(label) + 2);
  return [`╭${dashes}╮`, `│ ${label} │`, `╰${dashes}╯`];
}

/**
 * @brief Colorizes one non-fence, non-heading markdown line with protected spans treated as atomic tokens.
 * @details Splits the line on the protected-span pattern, styles every inline-code segment through the shared inline dispatcher so each backtick span always carries the code escape pair, composes italic and code SGR parameters for every inline-code token inside a single-quote span, wraps every single-quote-span segment in the italic escape pair, and applies the non-code inline alternatives only to the plain segments so emphasis matching can never consume a protected span. Runtime is O(n) in line length. No external state is mutated.
 * @param[in] line {string} Plain markdown line outside fenced code blocks and section headings.
 * @return {string} ANSI-colored line.
 * @satisfies REQ-715, REQ-763, REQ-764, REQ-765, REQ-766, REQ-767
 */
function colorizeAgentFinalOutputInlineLine(line: string): string {
  return line
    .split(AGENT_FINAL_OUTPUT_ANSI_PROTECTED_SPAN_PATTERN)
    .map((segment, segmentIndex) =>
      segmentIndex % 2 === 1
        ? replaceAgentFinalOutputAnsiProtectedSpan(segment)
        : segment.replace(AGENT_FINAL_OUTPUT_ANSI_INLINE_PATTERN, replaceAgentFinalOutputAnsiInline),
    )
    .join("");
}

/**
 * @brief Converts one rendered markdown report or table into ANSI-colored text.
 * @details Replaces every `## **<Label>**` heading with its rounded box frame whose lines print in intense yellow, keeps fenced code blocks plus their fence lines in the code color across the fence state machine, tracks the current section label from the heading lines so only the `Summary` section body routes through the intense-white body renderer, and applies inline markdown coloring to every remaining line through `colorizeAgentFinalOutputInlineLine(...)` or `colorizeAgentFinalOutputSummaryBodyLine(...)` so protected inline code and single-quote spans color atomically and every source character outside the replaced headings stays present; shared by the report-section renderer and the Next-Workflow command table so both payloads use the identical formatting algorithm while table text, carrying no heading lines, keeps the terminal default foreground. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] text {string} Plain markdown report or plain table text produced by the fixed-order renderer or the Next-Workflow table builder.
 * @return {string} ANSI-colored text.
 * @satisfies REQ-713, REQ-714, REQ-715, REQ-732, REQ-763, REQ-764, REQ-811, REQ-812
 */
export function colorizeAgentFinalOutputMarkdownText(text: string): string {
  const renderedLines: string[] = [];
  let insideFence = false;
  let insideSummaryBody = false;
  for (const line of text.split("\n")) {
    if (line.trimStart().startsWith("```")) {
      insideFence = !insideFence;
      renderedLines.push(wrapAnsiStyle(line, ANSI_CODE));
      continue;
    }
    if (insideFence) {
      renderedLines.push(wrapAnsiStyle(line, ANSI_CODE));
      continue;
    }
    if (/^##\s+\*\*([^*]+)\*\*$/.test(line)) {
      const headingLabel = line.replace(/^##\s+\*\*/, "").replace(/\*\*$/, "");
      insideSummaryBody = headingLabel === AGENT_FINAL_OUTPUT_SUMMARY_SECTION_LABEL;
      for (const boxLine of renderAgentFinalOutputSectionTitleBox(headingLabel)) {
        renderedLines.push(wrapAnsiStyle(boxLine, ANSI_INTENSE_YELLOW));
      }
      continue;
    }
    if (insideSummaryBody) {
      renderedLines.push(colorizeAgentFinalOutputSummaryBodyLine(line));
      continue;
    }
    renderedLines.push(colorizeAgentFinalOutputInlineLine(line));
  }
  return renderedLines.join("\n");
}

/**
 * @brief Renders the captured report fields as the fixed-order ANSI-colored markdown section block.
 * @details Renders the plain fixed-order report through `renderAgentFinalOutputMarkdownReport(...)` and converts it through the ANSI markdown colorizer so every section heading prints in intense yellow and links, fences, inline code, bold, italic, underlined, and single-quote-span elements print colored; `undefined` reports render the empty string. Runtime is O(n) in aggregate field length. No external state is mutated.
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
