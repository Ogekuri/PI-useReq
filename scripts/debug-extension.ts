/**
 * @file
 * @brief Implements the standalone extension debug harness CLI.
 * @details Parses debug-harness subcommands, dispatches offline inspection and replay operations, formats reports as JSON or human-readable markdown, and converts `ReqError` instances into process-style stderr plus exit codes. Runtime is dominated by the selected harness subcommand. Side effects include stdout/stderr writes and any extension-owned behavior triggered by delegated replay operations.
 */

import process from "node:process";
import { ReqError } from "../src/core/errors.js";
import {
  inspectExtension,
  replayCommand,
  replaySessionStart,
  replayTool,
  type CommandReplayReport,
  type InspectReport,
  type OfflineContractSnapshot,
  type SessionStartReport,
  type ToolReplayReport,
} from "./lib/extension-debug-harness.js";
import { runSdkSmoke, type ParityMismatch, type SdkSmokeReport } from "./lib/sdk-smoke.js";

/**
 * @brief Enumerates the supported harness output formats.
 * @details Keeps the CLI formatter selection constrained to deterministic JSON output or human-readable markdown output. The alias is compile-time only and introduces no runtime cost.
 */
type OutputFormat = "json" | "pretty";

/**
 * @brief Describes the parsed debug-harness CLI arguments.
 * @details Captures the selected subcommand plus all recognized option values in the normalized shape consumed by `main`. The interface is compile-time only and introduces no runtime cost.
 */
interface ParsedHarnessArgs {
  subcommand?: string;
  cwd?: string;
  extensionPath?: string;
  format: OutputFormat;
  name?: string;
  commandArgs: string;
  params?: string;
  eventPayload?: string;
  selects: string[];
  inputs: string[];
  help: boolean;
}

/**
 * @brief Stores the standalone harness usage text.
 * @details Provides a deterministic help payload for invalid or incomplete invocations. Access complexity is O(1).
 */
const USAGE_TEXT = `Usage: node --import tsx ./scripts/debug-extension.ts <subcommand> [options]

Subcommands:
  inspect
  session-start
  command
  tool
  sdk-smoke

Options:
  --cwd <path>             Working directory exposed as ctx.cwd and process.cwd().
  --extension <path>       Extension entry path. Defaults to ./src/index.ts.
  --format <pretty|json>   Output format. Defaults to pretty.
  --name <value>           Command or tool name for replay subcommands.
  --args <text>            Raw argument string for the command subcommand.
  --params <json>          JSON object passed to the tool subcommand.
  --event-payload <json>   JSON object passed to session-start.
  --select <value>         Scripted ctx.ui.select response. Repeatable.
  --input <value>          Scripted ctx.ui.input response. Repeatable.
  --help                   Show this help text.
`;

/**
 * @brief Parses raw CLI arguments into a normalized harness command object.
 * @details Performs a single left-to-right scan, records the first positional token as the subcommand, supports repeatable `--select` and `--input` options, and defaults the output format to `pretty`. Runtime is O(n) in argument count. No external state is mutated.
 * @param[in] argv {string[]} Raw CLI arguments excluding executable and script path.
 * @return {ParsedHarnessArgs} Parsed harness arguments.
 */
function parseArgs(argv: string[]): ParsedHarnessArgs {
  const parsed: ParsedHarnessArgs = {
    format: "pretty",
    commandArgs: "",
    selects: [],
    inputs: [],
    help: false,
  };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index]!;
    if (!token.startsWith("--") && !parsed.subcommand) {
      parsed.subcommand = token;
      index += 1;
      continue;
    }
    switch (token) {
      case "--cwd":
        parsed.cwd = argv[index + 1];
        index += 2;
        break;
      case "--extension":
        parsed.extensionPath = argv[index + 1];
        index += 2;
        break;
      case "--format":
        parsed.format = argv[index + 1] === "json" ? "json" : "pretty";
        index += 2;
        break;
      case "--name":
        parsed.name = argv[index + 1];
        index += 2;
        break;
      case "--args":
        parsed.commandArgs = argv[index + 1] ?? "";
        index += 2;
        break;
      case "--params":
        parsed.params = argv[index + 1];
        index += 2;
        break;
      case "--event-payload":
        parsed.eventPayload = argv[index + 1];
        index += 2;
        break;
      case "--select":
        parsed.selects.push(argv[index + 1] ?? "");
        index += 2;
        break;
      case "--input":
        parsed.inputs.push(argv[index + 1] ?? "");
        index += 2;
        break;
      case "--help":
        parsed.help = true;
        index += 1;
        break;
      default:
        index += 1;
        break;
    }
  }
  return parsed;
}

/**
 * @brief Parses a JSON object option from the CLI.
 * @details Accepts an omitted value as the supplied fallback, requires object payloads for present values, and wraps parse failures in `ReqError` for deterministic CLI error reporting. Runtime is O(n) in input size. No external state is mutated.
 * @param[in] text {string | undefined} Raw JSON option value.
 * @param[in] label {string} Human-readable option label.
 * @param[in] fallback {Record<string, unknown>} Fallback object when the option is omitted.
 * @return {Record<string, unknown>} Parsed JSON object.
 * @throws {ReqError} Throws when the option is present but not valid JSON object syntax.
 */
function parseJsonObject(text: string | undefined, label: string, fallback: Record<string, unknown>): Record<string, unknown> {
  if (text === undefined) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ReqError(`Error: ${label} must be a JSON object.`, 1);
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ReqError) {
      throw error;
    }
    throw new ReqError(`Error: failed to parse ${label}: ${error instanceof Error ? error.message : String(error)}`, 1);
  }
}

/**
 * @brief Writes non-empty text to stdout.
 * @details Skips zero-length writes so callers can compose output safely. Runtime is O(n) in text length. Side effects are limited to stdout writes.
 * @param[in] text {string} Text payload.
 * @return {void} No return value.
 */
function writeStdout(text: string): void {
  if (text.length > 0) {
    process.stdout.write(text);
  }
}

/**
 * @brief Writes non-empty text to stderr with a trailing newline.
 * @details Appends a newline when needed and skips empty payloads. Runtime is O(n) in text length. Side effects are limited to stderr writes.
 * @param[in] text {string} Text payload.
 * @return {void} No return value.
 */
function writeStderr(text: string): void {
  if (text.length === 0) {
    return;
  }
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

/**
 * @brief Serializes one arbitrary report as pretty-printed JSON.
 * @details Uses two-space indentation and appends a trailing newline for stable automation-friendly output. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] value {unknown} Report payload.
 * @return {string} JSON document.
 */
function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * @brief Formats the common snapshot header for human-readable output.
 * @details Renders normalized path metadata, registration counts, and event names shared by all offline reports. Runtime is O(n) in inventory size. No external state is mutated.
 * @param[in] snapshot {OfflineContractSnapshot} Snapshot payload.
 * @return {string[]} Markdown lines.
 */
function formatSnapshotHeader(snapshot: OfflineContractSnapshot): string[] {
  return [
    `- Extension: \`${snapshot.extensionPath}\``,
    `- Requested cwd: \`${snapshot.requestedCwd}\``,
    `- Effective ctx.cwd: \`${snapshot.effectiveCtxCwd}\``,
    `- Effective process.cwd(): \`${snapshot.effectiveProcessCwd}\``,
    `- Commands: ${snapshot.commands.length}`,
    `- Tools: ${snapshot.tools.length}`,
    `- Event handlers: ${snapshot.eventHandlers.join(", ") || "(none)"}`,
    `- Active tools: ${snapshot.activeTools.join(", ") || "(none)"}`,
  ];
}

/**
 * @brief Formats one offline inspection report for human-readable output.
 * @details Emits sections for inventory counts, commands, tools, sent user messages, and the generated usage manual. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] report {InspectReport} Inspection report.
 * @return {string} Markdown document.
 */
function formatInspectReport(report: InspectReport): string {
  const lines = ["# Offline extension inspection", "", ...formatSnapshotHeader(report), "", "## Commands"];
  for (const command of report.commands) {
    lines.push(`- ${command.name}: ${command.description ?? "(no description)"}`);
  }
  lines.push("", "## Tools");
  for (const tool of report.tools) {
    lines.push(`- ${tool.name}: ${tool.description ?? "(no description)"} | parameters: ${tool.hasParameters ? "present" : "absent"}`);
  }
  lines.push("", "## Sent user messages");
  if (report.sentUserMessages.length === 0) {
    lines.push("- (none)");
  } else {
    for (const [index, message] of report.sentUserMessages.entries()) {
      lines.push(`- [${index}] ${JSON.stringify(message.content)}`);
    }
  }
  lines.push("", report.manual.trimEnd());
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Formats one recorded UI state snapshot for human-readable output.
 * @details Emits statuses, notifications, editor text, and scripted interaction traces used by session-start and command/tool replay reports. Runtime is O(n) in interaction count. No external state is mutated.
 * @param[in] ui {SessionStartReport["ui"]} UI-state snapshot.
 * @return {string[]} Markdown lines.
 */
function formatUiState(ui: SessionStartReport["ui"]): string[] {
  const lines = ["## UI side effects"];
  const statusEntries = Object.entries(ui.statuses);
  lines.push(`- Status slots: ${statusEntries.length === 0 ? "(none)" : statusEntries.map(([key, value]) => `${key}=${value}`).join(", ")}`);
  lines.push(`- Notifications: ${ui.notifications.length === 0 ? "(none)" : ui.notifications.map((entry) => `${entry.level}:${entry.message}`).join(" | ")}`);
  lines.push(`- Editor text length: ${ui.editorText.length}`);
  lines.push(`- Remaining scripted selects: ${ui.remainingSelects.length}`);
  lines.push(`- Remaining scripted inputs: ${ui.remainingInputs.length}`);
  if (ui.editorText.length > 0) {
    lines.push("", "### Editor text", "```text", ui.editorText.trimEnd(), "```");
  }
  if (ui.selectCalls.length > 0) {
    lines.push("", "### select() calls");
    for (const call of ui.selectCalls) {
      lines.push(`- ${call.title} -> ${call.response ?? "(undefined)"}`);
    }
  }
  if (ui.inputCalls.length > 0) {
    lines.push("", "### input() calls");
    for (const call of ui.inputCalls) {
      lines.push(`- ${call.title} -> ${call.response ?? "(undefined)"}`);
    }
  }
  return lines;
}

/**
 * @brief Formats one session-start replay report for human-readable output.
 * @details Emits common snapshot metadata plus the recorded event payload and UI side effects. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] report {SessionStartReport} Session-start replay report.
 * @return {string} Markdown document.
 */
function formatSessionStartReport(report: SessionStartReport): string {
  const lines = [
    "# Offline session_start replay",
    "",
    ...formatSnapshotHeader(report),
    "",
    `- Event payload: \`${JSON.stringify(report.eventPayload)}\``,
    "",
    ...formatUiState(report.ui),
  ];
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Formats one command replay report for human-readable output.
 * @details Emits common snapshot metadata, command identity, sent user messages, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] report {CommandReplayReport} Command replay report.
 * @return {string} Markdown document.
 */
function formatCommandReplayReport(report: CommandReplayReport): string {
  const lines = [
    `# Offline command replay: ${report.commandName}`,
    "",
    ...formatSnapshotHeader(report),
    "",
    `- Raw args: \`${report.commandArgs}\``,
    `- Sent user messages: ${report.sentUserMessages.length}`,
  ];
  if (report.sentUserMessages.length > 0) {
    lines.push("", "## Sent user messages");
    for (const [index, message] of report.sentUserMessages.entries()) {
      lines.push(`- [${index}] ${JSON.stringify(message.content)}`);
    }
  }
  lines.push("", ...formatUiState(report.ui));
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Formats one tool replay report for human-readable output.
 * @details Emits common snapshot metadata, tool identity, input parameters, streamed updates, final result payload, and UI side effects. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] report {ToolReplayReport} Tool replay report.
 * @return {string} Markdown document.
 */
function formatToolReplayReport(report: ToolReplayReport): string {
  const lines = [
    `# Offline tool replay: ${report.toolName}`,
    "",
    ...formatSnapshotHeader(report),
    "",
    `- Params: \`${JSON.stringify(report.toolParams)}\``,
    `- Stream updates: ${report.toolUpdates.length}`,
    "",
    "## Tool result",
    "```json",
    JSON.stringify(report.toolResult, null, 2),
    "```",
  ];
  if (report.toolUpdates.length > 0) {
    lines.push("", "## Tool updates", "```json", JSON.stringify(report.toolUpdates, null, 2), "```");
  }
  lines.push("", ...formatUiState(report.ui));
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Formats one parity mismatch for human-readable output.
 * @details Emits the category, subject, detail, and normalized offline versus SDK payloads for deterministic troubleshooting. Runtime is O(n) in payload size. No external state is mutated.
 * @param[in] mismatch {ParityMismatch} Mismatch payload.
 * @return {string[]} Markdown lines.
 */
function formatMismatch(mismatch: ParityMismatch): string[] {
  return [
    `- ${mismatch.category} :: ${mismatch.subject}`,
    `  - detail: ${mismatch.detail}`,
    `  - offline: ${JSON.stringify(mismatch.offline ?? null)}`,
    `  - sdk: ${JSON.stringify(mismatch.sdk ?? null)}`,
  ];
}

/**
 * @brief Formats one SDK smoke report for human-readable output.
 * @details Emits parity status, offline versus SDK inventory counts, runtime-shape metadata, and detailed mismatch entries when parity fails. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] report {SdkSmokeReport} SDK smoke report.
 * @return {string} Markdown document.
 */
function formatSdkSmokeReport(report: SdkSmokeReport): string {
  const lines = [
    "# SDK parity smoke",
    "",
    `- Parity: ${report.ok ? "OK" : "FAIL"}`,
    `- SDK runtime shape: ${report.sdk.runtimeShape}`,
    `- Offline commands/tools: ${report.offline.commands.length}/${report.offline.tools.length}`,
    `- SDK commands/tools: ${report.sdk.commands.length}/${report.sdk.tools.length}`,
    `- Offline active tools: ${report.offline.activeTools.join(", ") || "(none)"}`,
    `- SDK active tools: ${report.sdk.activeTools.join(", ") || "(none)"}`,
  ];
  if (report.mismatches.length === 0) {
    lines.push("", "No mismatches detected.");
  } else {
    lines.push("", "## Mismatches");
    for (const mismatch of report.mismatches) {
      lines.push(...formatMismatch(mismatch));
    }
  }
  return `${lines.join("\n")}\n`;
}

/**
 * @brief Formats the selected report according to the requested output mode.
 * @details Uses JSON for automation-friendly output and markdown for human review. Runtime is O(n) in report size. No external state is mutated.
 * @param[in] format {OutputFormat} Requested output format.
 * @param[in] subcommand {string} Executed harness subcommand.
 * @param[in] report {InspectReport | SessionStartReport | CommandReplayReport | ToolReplayReport | SdkSmokeReport} Report payload.
 * @return {string} Final stdout payload.
 */
function formatReport(
  format: OutputFormat,
  subcommand: string,
  report: InspectReport | SessionStartReport | CommandReplayReport | ToolReplayReport | SdkSmokeReport,
): string {
  if (format === "json") {
    return formatJson(report);
  }
  switch (subcommand) {
    case "inspect":
      return formatInspectReport(report as InspectReport);
    case "session-start":
      return formatSessionStartReport(report as SessionStartReport);
    case "command":
      return formatCommandReplayReport(report as CommandReplayReport);
    case "tool":
      return formatToolReplayReport(report as ToolReplayReport);
    case "sdk-smoke":
      return formatSdkSmokeReport(report as SdkSmokeReport);
    default:
      return `${USAGE_TEXT}\n`;
  }
}

/**
 * @brief Executes one standalone debug-harness invocation.
 * @details Parses CLI arguments, validates subcommand-specific requirements, dispatches the selected harness workflow, and formats the result for stdout while converting `ReqError` failures into stderr plus exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and delegated extension replay behavior.
 * @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
 * @return {Promise<number>} Process exit code.
 * @throws {ReqError} Internally catches `ReqError` and returns its exit code.
 */
export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseArgs(argv);
    if (args.help || !args.subcommand) {
      writeStdout(USAGE_TEXT);
      return 0;
    }

    const uiPlan = { selects: args.selects, inputs: args.inputs };
    let report: InspectReport | SessionStartReport | CommandReplayReport | ToolReplayReport | SdkSmokeReport;

    switch (args.subcommand) {
      case "inspect":
        report = await inspectExtension(args.cwd, args.extensionPath);
        break;
      case "session-start":
        report = await replaySessionStart(
          args.cwd,
          args.extensionPath,
          parseJsonObject(args.eventPayload, "event payload", { reason: "startup" }),
          uiPlan,
        );
        break;
      case "command":
        if (!args.name) {
          throw new ReqError("Error: --name is required for the command subcommand.", 1);
        }
        report = await replayCommand(args.name, args.commandArgs, args.cwd, args.extensionPath, uiPlan);
        break;
      case "tool":
        if (!args.name) {
          throw new ReqError("Error: --name is required for the tool subcommand.", 1);
        }
        report = await replayTool(
          args.name,
          parseJsonObject(args.params, "tool params", {}),
          args.cwd,
          args.extensionPath,
          uiPlan,
        );
        break;
      case "sdk-smoke":
        report = await runSdkSmoke(args.cwd, args.extensionPath);
        break;
      default:
        throw new ReqError(`Error: unknown subcommand: ${args.subcommand}`, 1);
    }

    writeStdout(formatReport(args.format, args.subcommand, report));
    return 0;
  } catch (error) {
    const reqError = error as ReqError;
    writeStderr(reqError.message ?? String(error));
    return reqError.code ?? 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
