/**
 * @file
 * @brief Implements the specialized non-agentic `req-audit` slash-command workflow.
 * @details Audits the operating-system installation of the executables used by the configured static checkers that delegate execution to the command line (`Command` module entries invoked as external commands). The workflow resolves the audited project base from an optional `--prj-base <path>` command argument falling back to the live bootstrap cwd, loads the effective static-check configuration of that project base from the existing local and global configuration scopes without mutating persisted configuration, resolves every configured `Command` checker executable through the shared static-check executable resolution used by static-check execution, and renders one table of every configured static checker grouped by language with columns `language`, `static-check`, and `installed`. The workflow performs no LLM-session initialization, dispatches no prompt message, and creates no worktree. Runtime is dominated by executable resolution probing (installation `node_modules/.bin` plus PATH scans). Side effects are limited to filesystem reads and subprocess-free existence/access probes.
 * @satisfies DES-049, REQ-843, REQ-844, REQ-845, REQ-846, REQ-848
 */

import path from "node:path";
import {
  DEFAULT_STATIC_CHECK_LANGUAGES,
  type StaticCheckEntry,
  type UseReqConfig,
} from "./config.js";
import { ReqError } from "./errors.js";
import { formatConfigTable } from "./config-cli-render.js";
import { formatRuntimePathForDisplay } from "./path-context.js";
import { resolveCheckerExecutable } from "./static-check.js";

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
 * @brief Executes the specialized `req-audit` direct workflow and returns the rendered audit report.
 * @details Iterates the canonical supported static-check language order so table rows stay grouped by language, collects every configured checker entry of the effective static-check configuration regardless of the per-language enable flag, resolves the executable verification outcome of every configured entry, renders one display-width-aligned table with the `language`, `static-check`, and `installed` columns through the shared table formatter, and prepends one context line naming the audited project base; a configuration holding no checker entry renders the documented no-configured-checker line instead of a table. The audit reads configuration and probes executables only, never mutating persisted configuration. Runtime is O(l * c * p) where l is language count, c is configured checker count, and p is PATH entry count. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute audited project base path whose effective configuration is audited.
 * @param[in] config {UseReqConfig} Effective configuration of the audited project base loaded from the existing local and global scopes.
 * @return {ReqAuditResult} Audit outcome facts including the rendered report payload.
 * @note Complexity: O(l * c * p). No configuration mutation occurs.
 * @satisfies REQ-844, REQ-845, REQ-846, REQ-847, REQ-848
 */
export function executeReqAuditCommand(
  projectBase: string,
  config: UseReqConfig,
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
    : `${contextLine}\n\n${formatConfigTable(
      ["language", "static-check", "installed"],
      rows.map((row) => [row.language, row.checker, row.installed]),
    ).join("\n")}`;
  return {
    projectBase: path.resolve(projectBase),
    rows,
    report,
    configuredCount,
    missingCount,
  };
}
