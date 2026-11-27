/**
 * @file
 * @brief Implements the specialized non-agentic `req-audit` slash-command workflow.
 * @details Audits the operating-system installation of the executables used by the configured static checkers that delegate execution to the command line (`Command` module entries invoked as external commands). The workflow resolves the audited project base from an optional `--prj-base <path>` command argument falling back to the live bootstrap cwd, loads the effective static-check configuration of that project base from the existing local and global configuration scopes without mutating persisted configuration, resolves every configured `Command` checker executable through the shared static-check executable resolution used by static-check execution, and renders one terminal-width-bounded rounded table of every configured static checker grouped by language with columns `language`, `static-check`, and `installed`, framing it with the rounded `╭┬╮`/`╰┴╯` corners and the double-line `╞╪╡` header separator and wrapping over-wide static-check cells into border-aligned continuation rows so the borders render correctly inside the pi CLI editor. The workflow performs no LLM-session initialization, dispatches no prompt message, and creates no worktree. Runtime is dominated by executable resolution probing (installation `node_modules/.bin` plus PATH scans). Side effects are limited to filesystem reads and subprocess-free existence/access probes.
 * @satisfies DES-049, REQ-843, REQ-844, REQ-845, REQ-846, REQ-847, REQ-848
 */

import path from "node:path";
import {
  DEFAULT_STATIC_CHECK_LANGUAGES,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./config.js";
import { ReqError } from "./errors.js";
import { formatConfigTable, measureDisplayWidth } from "./config-cli-render.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import { resolveCheckerExecutable } from "./static-check.js";
import { wrapNextWorkflowTableCellText } from "./next-workflow.js";

/**
 * @brief Stores the dedicated `req-audit` slash-command description.
 * @details Rendered verbatim by the extension command registration so `req-audit` never depends on a bundled prompt Markdown heading. Access complexity is O(1).
 * @satisfies REQ-842
 */
export const REQ_AUDIT_COMMAND_DESCRIPTION =
  "Audit the installation of configured static checker executables";

/**
 * @brief Stores the documented line rendered instead of a table when no static checker is configured.
 * @details Emitted verbatim as the whole report payload when the effective static-check configuration of the audited project base holds no checker entry, so the command output always names the absence deterministically instead of rendering an empty table. Access complexity is O(1).
 * @satisfies REQ-848
 */
export const REQ_AUDIT_NO_CHECKERS_LINE =
  "req-audit: No static checker is configured in the active local and global configuration.";

/**
 * @brief Stores the fixed per-table chrome width of one rendered audit table row.
 * @details Composes the two corner borders, the two middle separators, and the two padding spaces around each of the three table cells, so the complete rendered table width equals the language column width plus the static-check column width plus the installed column width plus this constant. Access complexity is O(1).
 * @satisfies REQ-846
 */
export const REQ_AUDIT_TABLE_ROW_CHROME_WIDTH = 10;

/**
 * @brief Stores the minimum display-column budget granted to the wrapped static-check column.
 * @details Applied whenever the derived terminal budget falls below this floor so degenerate narrow terminals still render hard-broken, border-aligned continuation rows instead of an arbitrarily crushed column, mirroring the documented fixed-minimum table wrap contract. Access complexity is O(1).
 * @satisfies REQ-846
 */
export const REQ_AUDIT_TEXT_COLUMN_MIN_WIDTH = 35;

/**
 * @brief Describes the optional execution controls of one `req-audit` command execution.
 * @details Carries the pi CLI terminal column count used to bound the rendered audit table width; an absent or non-positive value keeps the natural single-line table layout so offline harnesses and wide terminals preserve the established rendering byte-for-byte. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-846, REQ-847
 */
export interface ReqAuditExecuteOptions {
  /** pi CLI terminal column count bounding the rendered table width; `undefined` keeps the natural layout. */
  terminalColumns?: number | undefined;
}

/**
 * @brief Represents the verification outcome of one configured static checker entry.
 * @details `yes` marks a `Command` entry whose executable resolved through the shared static-check executable resolution, `no` marks a `Command` entry whose executable did not resolve or carries no command, and `n/a` marks a configured entry that delegates no external command-line executable. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-845, REQ-846
 */
export type ReqAuditInstalledState = "yes" | "no" | "n/a";

/**
 * @brief Describes one audit table row for one configured static checker entry.
 * @details Pairs the owning canonical language with the shell-like checker command summary and the executable verification outcome. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-846
 */
export interface ReqAuditCheckerRow {
  /** Canonical static-check language owning the configured checker entry. */
  language: string;
  /** Shell-like command summary identifying the configured checker entry. */
  checker: string;
  /** Executable verification outcome of the configured checker entry. */
  installed: ReqAuditInstalledState;
}

/**
 * @brief Describes the outcome facts of one completed `req-audit` run.
 * @details Carries the resolved audited project base, the ordered audit rows grouped by language, the rendered report payload written into the editor, the total configured checker count, and the count of `Command` entries whose executable did not resolve. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-846, REQ-847
 */
export interface ReqAuditResult {
  /** Absolute audited project base path whose effective configuration was audited. */
  projectBase: string;
  /** Audit rows in canonical language order, preserving configured entry order per language. */
  rows: ReqAuditCheckerRow[];
  /** Rendered report payload written into the editor by the command handler. */
  report: string;
  /** Total number of configured static checker entries included in the audit. */
  configuredCount: number;
  /** Number of configured `Command` checker entries whose executable did not resolve. */
  missingCount: number;
}

/**
 * @brief Formats one configured static checker entry as a shell-like command summary.
 * @details Joins the configured command with its parameter list into one deterministic space-separated token sequence so the `static-check` table column identifies the externally invoked command line; entries carrying no command render the owning module name. Runtime is O(p) in parameter count. No external state is mutated.
 * @param[in] entry {StaticCheckEntry} Configured static-check entry to summarize.
 * @return {string} Shell-like command summary used by the `static-check` table column.
 * @note Complexity: O(p) in parameter count. Pure; no side effects.
 * @satisfies REQ-846
 */
function formatReqAuditCheckerEntry(entry: StaticCheckEntry): string {
  const command = entry.cmd?.trim();
  if (!command) {
    return entry.module;
  }
  const parameters = entry.params ?? [];
  return parameters.length > 0 ? [command, ...parameters].join(" ") : command;
}

/**
 * @brief Resolves the executable verification outcome of one configured static checker entry.
 * @details Returns `n/a` for entries that delegate no external command-line executable, resolves `Command` entry executables through the shared `resolveCheckerExecutable(...)` resolution used by static-check execution, and reports `no` for `Command` entries whose executable is unresolvable or absent. Runtime is O(p) in PATH entry count plus bounded filesystem metadata checks. Side effects are limited to filesystem reads.
 * @param[in] entry {StaticCheckEntry} Configured static-check entry to verify.
 * @return {ReqAuditInstalledState} Executable verification outcome of the entry.
 * @note Complexity: O(p) in PATH entry count for `Command` entries; O(1) otherwise.
 * @satisfies REQ-845
 */
function resolveReqAuditInstalledState(entry: StaticCheckEntry): ReqAuditInstalledState {
  if (entry.module !== "Command") {
    return "n/a";
  }
  const command = entry.cmd?.trim();
  if (!command) {
    return "no";
  }
  return resolveCheckerExecutable(command) !== undefined ? "yes" : "no";
}

/**
 * @brief Parses the optional `--prj-base <path>` argument of one `req-audit` invocation.
 * @details Accepts the `--prj-base <path>` two-token spelling and the `--prj-base=<path>` attached spelling, rejects every other argument token with a deterministic diagnostic so the command grammar stays unambiguous, and resolves the supplied path to an absolute form; a missing or empty argument falls back to the supplied live bootstrap cwd. Runtime is O(n) in argument count. No external state is mutated.
 * @param[in] rawArgs {string} Raw user-supplied command argument string.
 * @param[in] fallbackCwd {string} Live bootstrap cwd used as the audited project base when no `--prj-base` argument is supplied.
 * @return {string} Absolute audited project base path.
 * @throws {ReqError} Throws when an unknown argument token is supplied or when `--prj-base` carries no path value.
 * @note Complexity: O(n) in argument count. Pure aside from thrown diagnostics.
 * @satisfies REQ-843
 */
export function parseReqAuditProjectBase(rawArgs: string, fallbackCwd: string): string {
  const trimmedArgs = rawArgs.trim();
  if (trimmedArgs.length === 0) {
    return path.resolve(fallbackCwd);
  }
  const tokens = trimmedArgs.split(/\s+/);
  let projectBase: string | undefined;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    if (token === "--prj-base") {
      const value = tokens[index + 1];
      if (value === undefined) {
        throw new ReqError("/req-audit requires a path value after --prj-base.", 1);
      }
      projectBase = value;
      index += 1;
      continue;
    }
    if (token.startsWith("--prj-base=")) {
      projectBase = token.slice("--prj-base=".length);
      continue;
    }
    throw new ReqError(
      `/req-audit rejects the unsupported argument ${JSON.stringify(token)}; only --prj-base <path> is accepted.`,
      1,
    );
  }
  if (projectBase === undefined || projectBase.trim().length === 0) {
    return path.resolve(fallbackCwd);
  }
  return path.resolve(projectBase);
}

/**
 * @brief Reads the pi CLI terminal column count from the hosting process standard output.
 * @details Returns `process.stdout.columns` only when it is a positive integer so non-TTY pipes, redirected output, and offline harnesses select the natural table layout through `resolveReqAuditTextColumnTargetWidth(...)`. Runtime is O(1). No external state is mutated.
 * @return {number | undefined} Positive terminal column count, or `undefined` when unavailable.
 * @note Complexity: O(1). Pure aside from the process stdout metadata read.
 * @satisfies REQ-846
 */
function readReqAuditTerminalColumns(): number | undefined {
  const columns = process.stdout.columns;
  return typeof columns === "number" && Number.isInteger(columns) && columns > 0
    ? columns
    : undefined;
}

/**
 * @brief Resolves the effective static-check column wrap target for one audit table rendering.
 * @details Returns the natural longest checker width when the terminal column count is unavailable or when the natural table still fits within the terminal, so wide and unknown-terminal renderings stay byte-identical to the established single-line layout; otherwise returns the terminal-derived budget `terminalColumns - fixedColumnsWidth` floored at `REQ_AUDIT_TEXT_COLUMN_MIN_WIDTH` so every wrapped physical row keeps the table borders aligned on screen. Runtime is O(1). No external state is mutated.
 * @param[in] terminalColumns {number | undefined} pi CLI terminal column count; `undefined` or invalid selects the natural width.
 * @param[in] fixedColumnsWidth {number} Summed display width of the language column, the installed column, and the per-row chrome.
 * @param[in] longestCheckerWidth {number} Natural display width of the widest static-check cell.
 * @return {number} Effective static-check column wrap target in display columns; never above `longestCheckerWidth`.
 * @note Complexity: O(1). Pure; no side effects.
 * @satisfies REQ-846
 */
function resolveReqAuditTextColumnTargetWidth(
  terminalColumns: number | undefined,
  fixedColumnsWidth: number,
  longestCheckerWidth: number,
): number {
  if (
    typeof terminalColumns !== "number" ||
    !Number.isInteger(terminalColumns) ||
    terminalColumns <= 0 ||
    fixedColumnsWidth + longestCheckerWidth <= terminalColumns
  ) {
    return longestCheckerWidth;
  }
  return Math.min(
    longestCheckerWidth,
    Math.max(REQ_AUDIT_TEXT_COLUMN_MIN_WIDTH, terminalColumns - fixedColumnsWidth),
  );
}

/**
 * @brief Builds the audit table cells with the static-check column wrapped into continuation rows.
 * @details Wraps every checker summary into display-width-bounded lines through the shared `wrapNextWorkflowTableCellText(...)` contract, renders the first physical row of every logical row with its language and installed verdict cells, and renders every continuation row with empty language and installed cells so the shared table formatter computes aligned borders across all physical rows. Runtime is O(n) in aggregate checker length. No external state is mutated.
 * @param[in] rows {ReqAuditCheckerRow[]} Audit rows in canonical language order.
 * @param[in] textColumnWidth {number} Maximum display width per wrapped static-check cell line.
 * @return {string[][]} Physical row cells consumed by the shared table formatter.
 * @note Complexity: O(n) in aggregate checker length. Pure; no side effects.
 * @satisfies REQ-846, REQ-847
 */
function buildReqAuditTableRows(
  rows: readonly ReqAuditCheckerRow[],
  textColumnWidth: number,
): string[][] {
  const wrappedRows: string[][] = [];
  for (const row of rows) {
    const checkerLines = wrapNextWorkflowTableCellText(row.checker, textColumnWidth);
    wrappedRows.push([row.language, checkerLines[0] ?? "", row.installed]);
    for (const continuationLine of checkerLines.slice(1)) {
      wrappedRows.push(["", continuationLine, ""]);
    }
  }
  return wrappedRows;
}

/**
 * @brief Executes the specialized `req-audit` direct workflow and returns the rendered audit report.
 * @details Iterates the canonical supported static-check language order so table rows stay grouped by language, collects every configured checker entry of the effective static-check configuration regardless of the per-language enable flag, resolves the executable verification outcome of every configured entry, bounds the rendered table width to the supplied terminal column count or the process-detected pi CLI terminal column count by wrapping the static-check column into border-aligned continuation rows while keeping the natural single-line layout on wide and unknown terminals, renders one display-width-aligned rounded table with the `language`, `static-check`, and `installed` columns through the shared table formatter with the rounded `╭┬╮`/`╰┴╯` corner frame and the double-line `╞╪╡` header separator, and prepends one context line naming the audited project base; a configuration holding no checker entry renders the documented no-configured-checker line instead of a table. The audit reads configuration and probes executables only, never mutating persisted configuration. Runtime is O(l * c * p) where l is language count, c is configured checker count, and p is PATH entry count. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute audited project base path whose effective configuration is audited.
 * @param[in] config {UseReqConfig} Effective configuration of the audited project base loaded from the existing local and global scopes.
 * @param[in] options {ReqAuditExecuteOptions} Optional terminal-column execution controls; an absent value selects the process-detected terminal column count.
 * @return {ReqAuditResult} Audit outcome facts including the rendered report payload.
 * @note Complexity: O(l * c * p). No configuration mutation occurs.
 * @satisfies REQ-844, REQ-845, REQ-846, REQ-847, REQ-848
 */
export function executeReqAuditCommand(
  projectBase: string,
  config: UseReqConfig,
  options: ReqAuditExecuteOptions = {},
): ReqAuditResult {
  const staticCheckConfig = config["static-check"] ?? {};
  const rows: ReqAuditCheckerRow[] = [];
  for (const language of DEFAULT_STATIC_CHECK_LANGUAGES) {
    const entries = staticCheckConfig[language]?.checkers ?? [];
    for (const entry of entries) {
      rows.push({
        language,
        checker: formatReqAuditCheckerEntry(entry),
        installed: resolveReqAuditInstalledState(entry),
      });
    }
  }
  const configuredCount = rows.length;
  const missingCount = rows.filter((row) => row.installed === "no").length;
  const contextLine = `req-audit: Auditing static checker executables for ${formatRuntimePathForDisplay(projectBase)}.`;
  const report = configuredCount === 0
    ? `${contextLine}\n${REQ_AUDIT_NO_CHECKERS_LINE}`
    : `${contextLine}\n\n${renderReqAuditTable(rows, options.terminalColumns ?? readReqAuditTerminalColumns())}`;
  return {
    projectBase: path.resolve(projectBase),
    rows,
    report,
    configuredCount,
    missingCount,
  };
}

/**
 * @brief Renders the audit table with rounded borders, a double-line header separator, and the static-check column bounded to the terminal width.
 * @details Measures the language, installed, and natural static-check column widths, resolves the effective static-check wrap target through `resolveReqAuditTextColumnTargetWidth(...)` against the supplied terminal column count or the process-detected fallback, builds the wrapped physical rows through `buildReqAuditTableRows(...)`, and renders the display-width-aligned table through the shared table formatter with the rounded frame `╭┬╮`/`╰┴╯` and the double-line `╞╪╡` header separator, so the frame glyphs match the documented rounded table framing. Runtime is O(n) in aggregate checker length. No external state is mutated.
 * @param[in] rows {ReqAuditCheckerRow[]} Audit rows in canonical language order.
 * @param[in] terminalColumns {number | undefined} pi CLI terminal column count bounding the rendered table width; `undefined` keeps the natural layout.
 * @return {string} Complete rendered rounded table text with one aligned border per physical row.
 * @note Complexity: O(n) in aggregate checker length. Pure aside from the process stdout metadata read performed by the default width source.
 * @satisfies REQ-846, REQ-847
 */
function renderReqAuditTable(rows: readonly ReqAuditCheckerRow[], terminalColumns: number | undefined): string {
  const languageWidth = Math.max(
    measureDisplayWidth("language"),
    ...rows.map((row) => measureDisplayWidth(row.language)),
  );
  const installedWidth = Math.max(
    measureDisplayWidth("installed"),
    ...rows.map((row) => measureDisplayWidth(row.installed)),
  );
  const longestCheckerWidth = Math.max(
    measureDisplayWidth("static-check"),
    ...rows.map((row) => measureDisplayWidth(row.checker)),
  );
  const fixedColumnsWidth = languageWidth + installedWidth + REQ_AUDIT_TABLE_ROW_CHROME_WIDTH;
  const textColumnWidth = resolveReqAuditTextColumnTargetWidth(
    terminalColumns,
    fixedColumnsWidth,
    longestCheckerWidth,
  );
  return formatConfigTable(
    ["language", "static-check", "installed"],
    buildReqAuditTableRows(rows, textColumnWidth),
    "rounded",
  ).join("\n");
}
