/**
 * @file
 * @brief Defines static-check language mappings and checker dispatch implementations.
 * @details Parses Command-only user static-check specifications, preserves debug `Dummy` config handling, resolves file targets, and runs modular dummy or command-based analyzers. Runtime is linear in file count plus external tool cost. Side effects include filesystem reads, PATH probing, process spawning, and console output.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import fg from "fast-glob";
import type { StaticCheckEntry } from "./config.js";
import { ReqError } from "./errors.js";

/**
 * @brief Maps user-facing language aliases to canonical static-check language names.
 * @details Accepts multiple spellings for the same language so config parsing can stay case-insensitive and permissive. Lookup complexity is O(1).
 */
export const STATIC_CHECK_LANG_CANONICAL: Record<string, string> = {
  python: "Python",
  c: "C",
  "c++": "C++",
  cpp: "C++",
  "c#": "C#",
  csharp: "C#",
  rust: "Rust",
  javascript: "JavaScript",
  js: "JavaScript",
  typescript: "TypeScript",
  ts: "TypeScript",
  java: "Java",
  go: "Go",
  ruby: "Ruby",
  php: "PHP",
  swift: "Swift",
  kotlin: "Kotlin",
  scala: "Scala",
  lua: "Lua",
  shell: "Shell",
  sh: "Shell",
  perl: "Perl",
  haskell: "Haskell",
  zig: "Zig",
  elixir: "Elixir",
};

/**
 * @brief Maps file extensions to canonical static-check language names.
 * @details Used by tool runners to decide which configured analyzers apply to a file. Lookup complexity is O(1).
 */
export const STATIC_CHECK_EXT_TO_LANG: Record<string, string> = {
  ".py": "Python",
  ".c": "C",
  ".cpp": "C++",
  ".cs": "C#",
  ".rs": "Rust",
  ".js": "JavaScript",
  ".mjs": "JavaScript",
  ".ts": "TypeScript",
  ".java": "Java",
  ".go": "Go",
  ".rb": "Ruby",
  ".php": "PHP",
  ".swift": "Swift",
  ".kt": "Kotlin",
  ".scala": "Scala",
  ".lua": "Lua",
  ".sh": "Shell",
  ".pl": "Perl",
  ".hs": "Haskell",
  ".zig": "Zig",
  ".ex": "Elixir",
};

/**
 * @brief Lists the user-configurable static-check module identifiers.
 * @details The tuple constrains guided configuration and `--enable-static-check` parsing to the supported user-facing checker implementations. Access complexity is O(1).
 */
export const STATIC_CHECK_MODULES = ["Command"] as const;

/**
 * @brief Lists the persisted or debug-capable static-check module identifiers.
 * @details The tuple augments user-configurable modules with debug-only `Dummy` support used by existing config payloads and the standalone test driver. Access complexity is O(1).
 */
const STATIC_CHECK_PERSISTED_MODULES = ["Dummy", "Command"] as const;

/**
 * @brief Describes supported extensions for one canonical static-check language.
 * @details The interface is used for UI rendering and capability reporting only. It is compile-time only and adds no runtime cost.
 */
export interface StaticCheckLanguageSupport {
  language: string;
  extensions: string[];
}

/**
 * @brief Maps case-insensitive user module names to canonical static-check module identifiers.
 * @details Enables permissive Command-only user input while keeping downstream dispatch logic deterministic. Lookup complexity is O(1).
 */
const CANONICAL_MODULES: Record<string, (typeof STATIC_CHECK_MODULES)[number]> = {
  command: "Command",
};

/**
 * @brief Returns the sorted list of canonical languages with extension support.
 * @details Deduplicates the extension map values and sorts them alphabetically for stable UI and error messages. Runtime is O(n log n). No side effects occur.
 * @return {string[]} Sorted canonical language names.
 */
export function getSupportedStaticCheckLanguages(): string[] {
  return [...new Set(Object.values(STATIC_CHECK_EXT_TO_LANG))].sort((left, right) => left.localeCompare(right));
}

/**
 * @brief Returns supported languages paired with their known file extensions.
 * @details Groups extensions by canonical language and emits alphabetically sorted extension lists. Runtime is O(n log n). No external state is mutated.
 * @return {StaticCheckLanguageSupport[]} Sorted language-support descriptors.
 */
export function getSupportedStaticCheckLanguageSupport(): StaticCheckLanguageSupport[] {
  const extensionsByLanguage = new Map<string, string[]>();
  for (const [extension, language] of Object.entries(STATIC_CHECK_EXT_TO_LANG)) {
    const extensions = extensionsByLanguage.get(language) ?? [];
    extensions.push(extension);
    extensionsByLanguage.set(language, extensions);
  }
  return getSupportedStaticCheckLanguages().map((language) => ({
    language,
    extensions: [...(extensionsByLanguage.get(language) ?? [])].sort((left, right) => left.localeCompare(right)),
  }));
}

/**
 * @brief Formats the user-configurable module list for diagnostics.
 * @details Joins `STATIC_CHECK_MODULES` with commas for direct insertion into user-facing error strings. Time complexity is O(n). No side effects occur.
 * @return {string} Comma-delimited user-configurable module names.
 */
function formatStaticCheckModules(): string {
  return STATIC_CHECK_MODULES.join(", ");
}

/**
 * @brief Formats the persisted or debug-capable module list for dispatch diagnostics.
 * @details Joins `STATIC_CHECK_PERSISTED_MODULES` with commas for error strings emitted while executing existing config entries or debug-driver requests. Time complexity is O(n). No side effects occur.
 * @return {string} Comma-delimited persisted module names.
 */
function formatDispatchStaticCheckModules(): string {
  return STATIC_CHECK_PERSISTED_MODULES.join(", ");
}

/**
 * @brief Splits a comma-delimited static-check specification while honoring quotes.
 * @details Performs a single pass over the right-hand side of `LANG=...`, preserving commas inside quoted segments. Runtime is O(n). No side effects occur.
 * @param[in] specRhs {string} Right-hand side of the enable-static-check specification.
 * @return {string[]} Parsed tokens with surrounding whitespace trimmed.
 */
function splitCsvLikeTokens(specRhs: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let activeQuote: string | undefined;
  for (const ch of specRhs) {
    if (!activeQuote) {
      if (ch === '"' || ch === "'") {
        activeQuote = ch;
      } else if (ch === ",") {
        tokens.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    } else if (ch === activeQuote) {
      activeQuote = undefined;
    } else {
      current += ch;
    }
  }
  tokens.push(current.trim());
  return tokens;
}

/**
 * @brief Parses one `LANG=Command,CMD[,PARAM...]` static-check specification.
 * @details Validates the language alias, canonicalizes the Command module name, enforces the required executable argument, and returns a config entry ready for persistence. Runtime is O(n) in specification length. No external state is mutated.
 * @param[in] spec {string} Raw static-check specification string.
 * @return {[string, StaticCheckEntry]} Tuple of canonical language name and normalized checker configuration.
 * @throws {ReqError} Throws for missing separators, unknown languages, non-Command modules, or missing required command arguments.
 */
export function parseEnableStaticCheck(spec: string): [string, StaticCheckEntry] {
  if (!spec.includes("=")) {
    throw new ReqError(
      "Error: --enable-static-check requires format LANG=MODULE[,CMD[,PARAM...]]; missing '=' separator.",
      1,
    );
  }
  const [langRaw, rest] = spec.split(/=(.*)/s, 2) as [string, string];
  const langKey = langRaw.trim().toLowerCase();
  if (!(langKey in STATIC_CHECK_LANG_CANONICAL)) {
    const valid = [...new Set(Object.values(STATIC_CHECK_LANG_CANONICAL))].sort((a, b) => a.localeCompare(b));
    throw new ReqError(
      `Error: unknown language '${langRaw.trim()}' in --enable-static-check. Valid language names (case-insensitive): ${valid.join(", ")}`,
      1,
    );
  }
  const canonicalLang = STATIC_CHECK_LANG_CANONICAL[langKey]!;
  const parts = splitCsvLikeTokens(rest);
  if (parts.length === 0 || !parts[0]?.trim()) {
    throw new ReqError(
      `Error: --enable-static-check requires MODULE after '='. Valid modules (case-insensitive): ${formatStaticCheckModules()}`,
      1,
    );
  }
  const moduleRaw = parts[0]!.trim();
  const moduleKey = moduleRaw.toLowerCase();
  if (!(moduleKey in CANONICAL_MODULES)) {
    throw new ReqError(
      `Error: unknown module '${moduleRaw}' in --enable-static-check. Valid modules (case-insensitive): ${formatStaticCheckModules()}`,
      1,
    );
  }
  const moduleName = CANONICAL_MODULES[moduleKey]!;
  const remaining = parts.slice(1).map((value) => value.trim()).filter(Boolean);
  const config: StaticCheckEntry = { module: moduleName };
  if (moduleName === "Command") {
    if (remaining.length === 0) {
      throw new ReqError(
        "Error: Command module requires a cmd argument in --enable-static-check. Format: LANG=Command,CMD[,PARAM...]",
        1,
      );
    }
    config.cmd = remaining[0]!;
    if (remaining.length > 1) config.params = remaining.slice(1);
  } else if (remaining.length > 0) {
    config.params = remaining;
  }
  return [canonicalLang, config];
}

/**
 * @brief Builds the duplicate-identity token for one static-check entry.
 * @details Canonicalizes the language key, module name, command name, and parameter list into a stable JSON tuple used for merge deduplication. Runtime is O(p) in parameter count. No side effects occur.
 * @param[in] language {string} Canonical or alias language name associated with the entry.
 * @param[in] entry {StaticCheckEntry} Static-check configuration entry to normalize.
 * @return {string} Stable identity token suitable for equality comparison.
 * @satisfies REQ-036
 */
export function buildStaticCheckEntryIdentity(language: string, entry: StaticCheckEntry): string {
  const moduleName = String(entry.module ?? "").trim().toLowerCase();
  const cmd = typeof entry.cmd === "string" ? entry.cmd.trim() : "";
  const params = Array.isArray(entry.params) ? entry.params.map((value) => String(value).trim()) : [];
  return JSON.stringify([language.trim().toLowerCase(), moduleName, cmd, params]);
}

/**
 * @brief Validates pre-persistence invariants for one static-check entry.
 * @details Rejects `Command` entries whose executable cannot be resolved before config writes while leaving non-command modules untouched. Runtime is O(p) in PATH entry count. Side effects are limited to filesystem reads.
 * @param[in] entry {StaticCheckEntry} Static-check configuration entry to validate.
 * @return {void} No return value.
 * @throws {ReqError} Throws when a `Command` entry omits `cmd` or resolves to a non-executable program.
 * @satisfies REQ-037
 */
export function validateStaticCheckEntry(entry: StaticCheckEntry): void {
  if (String(entry.module ?? "").trim().toLowerCase() !== "command") {
    return;
  }
  const cmd = typeof entry.cmd === "string" ? entry.cmd.trim() : "";
  if (!cmd) {
    throw new ReqError("Error: Command module requires a cmd argument in --enable-static-check. Format: LANG=Command,CMD[,PARAM...]", 1);
  }
  if (!findExecutable(cmd)) {
    throw new ReqError(`Error: --enable-static-check Command cmd '${cmd}' is not an executable program on this system.`, 1);
  }
}

/**
 * @brief Resolves explicit files, directories, and glob patterns into absolute file paths.
 * @details Expands glob inputs with `fast-glob`, enumerates direct children for directory inputs, accepts regular files, and warns for invalid entries. Runtime is O(n + m) where m is the total matched path count. Side effects are filesystem reads and warning output to stderr.
 * @param[in] inputs {string[]} Raw file, directory, or glob inputs.
 * @return {string[]} Unique absolute file paths.
 */
function resolveFiles(inputs: string[]): string[] {
  const resolved = new Map<string, true>();
  for (const entry of inputs) {
    if (/[*?[]/.test(entry)) {
      for (const match of fg.sync(entry, { onlyFiles: true, dot: false, unique: true })) {
        resolved.set(path.resolve(match), true);
      }
      continue;
    }
    if (fs.existsSync(entry) && fs.statSync(entry).isDirectory()) {
      for (const child of fs.readdirSync(entry, { withFileTypes: true })) {
        if (child.isFile()) {
          resolved.set(path.resolve(entry, child.name), true);
        }
      }
      continue;
    }
    if (fs.existsSync(entry) && fs.statSync(entry).isFile()) {
      resolved.set(path.resolve(entry), true);
    } else {
      console.error(`  Warning: skipping (not found or not a file): ${entry}`);
    }
  }
  return [...resolved.keys()];
}

/**
 * @brief Provides the shared and debug-capable base implementation for file-oriented static checks.
 * @details Resolves input files once, emits standardized headers, implements the debug `Dummy` checker behavior, and defines overridable `checkFile` plus `emitLine` hooks used by concrete analyzers. Runtime is O(f) plus subclass checker cost. Side effects include console output.
 */
export class StaticCheckBase {
  static LABEL = "Dummy";
  protected files: string[];
  protected extraArgs: string[];
  protected failOnly: boolean;
  protected label: string;

  /**
   * @brief Initializes a base static-check runner.
   * @details Resolves the input file set once, stores extra arguments, and derives the default label from the concrete class. Runtime is O(f) in resolved input count. Mutates instance fields only.
   * @param[in] inputs {string[]} Raw file, directory, or glob inputs.
   * @param[in] extraArgs {string[] | undefined} Additional checker arguments.
   * @param[in] failOnly {boolean} When `true`, suppress successful-file output.
   */
  constructor(inputs: string[], extraArgs?: string[], failOnly = false) {
    this.extraArgs = extraArgs ?? [];
    this.failOnly = failOnly;
    this.files = resolveFiles(inputs);
    this.label = (this.constructor as typeof StaticCheckBase).LABEL;
  }

  /**
   * @brief Runs the checker against all resolved files.
   * @details Iterates through `this.files`, aggregates a non-zero overall status when any file fails, and emits separator lines according to `failOnly`. Runtime is O(f) plus per-file checker cost. Side effects include console output.
   * @return {number} Aggregate exit status where `0` means all files passed.
   */
  run(): number {
    if (this.files.length === 0) {
      console.error("  Warning: no files resolved for static check.");
      return 0;
    }
    let overall = 0;
    for (const filePath of this.files) {
      const rc = this.checkFile(filePath);
      if (rc !== 0) overall = 1;
      if (!this.failOnly || rc !== 0) this.emitLine("");
    }
    return overall;
  }

  /**
   * @brief Formats the standard result header for one file.
   * @details Includes the checker label and any extra arguments so diagnostic output remains self-describing. Runtime is O(a) in argument count. No side effects occur.
   * @param[in] filePath {string} File being checked.
   * @return {string} Standardized header line.
   */
  protected headerLine(filePath: string): string {
    const options = this.extraArgs.length > 0 ? ` [${this.extraArgs.join(" ")}]` : "";
    return `# Static-Check(${this.label}): ${filePath}${options}`;
  }

  /**
   * @brief Performs the default no-op successful check.
   * @details Emits an OK record unless `failOnly` suppresses success output. Concrete subclasses override this method to run real analyzers. Runtime is O(1). Side effects include console output.
   * @param[in] filePath {string} File being checked.
   * @return {number} Always returns `0`.
   */
  protected checkFile(filePath: string): number {
    if (!this.failOnly) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: OK");
    }
    return 0;
  }

  /**
   * @brief Emits one output line for checker reporting.
   * @details Uses `console.log` so subclasses can override output transport if needed. Runtime is O(n) in line length. Side effect: writes to stdout.
   * @param[in] line {string} Output line to emit.
   * @return {void} No return value.
   */
  protected emitLine(line: string): void {
    console.log(line);
  }
}

/**
 * @brief Runs the user-facing external-command static checker.
 * @details Validates command availability on PATH during construction, then invokes the command with configured extra arguments plus one target file at a time. Runtime is dominated by external command execution. Side effects include PATH probing, process spawning, and console output.
 */
export class StaticCheckCommand extends StaticCheckBase {
  private cmd: string;

  /**
   * @brief Initializes a command-backed checker instance.
   * @details Validates that the executable exists on PATH before delegating file resolution to the base class and recording the command label. Runtime is O(p + f) where p is PATH entry count and f is resolved input count. Side effects are filesystem reads.
   * @param[in] cmd {string} Executable name.
   * @param[in] inputs {string[]} Raw file inputs.
   * @param[in] extraArgs {string[] | undefined} Extra command arguments.
   * @param[in] failOnly {boolean} When `true`, suppress successful-file output.
   * @throws {ReqError} Throws when the executable cannot be found on PATH.
   */
  constructor(cmd: string, inputs: string[], extraArgs?: string[], failOnly = false) {
    if (!findExecutable(cmd)) {
      throw new ReqError(`Error: external command '${cmd}' not found on PATH.`, 1);
    }
    super(inputs, extraArgs, failOnly);
    this.cmd = cmd;
    this.label = `Command[${cmd}]`;
  }

  /**
   * @brief Runs the configured external command for one file.
   * @details Executes the command with extra arguments followed by the target file and emits standardized OK/FAIL output with captured evidence. Runtime is dominated by external command execution. Side effects include process spawning and console output.
   * @param[in] filePath {string} File to analyze.
   * @return {number} `0` on success; `1` on execution or analysis failure.
   */
  protected override checkFile(filePath: string): number {
    const result = spawnSync(this.cmd, [...this.extraArgs, filePath], { encoding: "utf8" });
    if (result.error) {
      this.emitLine(this.headerLine(filePath));
      this.emitLine("Result: FAIL");
      this.emitLine("Evidence:");
      this.emitLine(`  command '${this.cmd}' not found on PATH`);
      return 1;
    }
    if (result.status === 0) {
      if (!this.failOnly) {
        this.emitLine(this.headerLine(filePath));
        this.emitLine("Result: OK");
      }
      return 0;
    }
    this.emitLine(this.headerLine(filePath));
    this.emitLine("Result: FAIL");
    this.emitLine("Evidence:");
    this.emitLine(`${result.stdout ?? ""}${result.stderr ?? ""}`.trimEnd());
    return 1;
  }
}

/**
 * @brief Tests whether one filesystem path is executable.
 * @details Requires the candidate to exist, be a regular file, and pass `X_OK` access checks. Runtime is O(1). Side effects are limited to filesystem reads.
 * @param[in] candidate {string} Absolute or relative path to inspect.
 * @return {boolean} `true` when the candidate is executable by the current process.
 */
function isExecutableFile(candidate: string): boolean {
  if (!fs.existsSync(candidate) || !fs.statSync(candidate).isFile()) {
    return false;
  }
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * @brief Locates an executable by scanning the current PATH.
 * @details Checks each PATH directory for an executable file named exactly as the requested command. Runtime is O(p) in PATH entry count. Side effects are filesystem reads.
 * @param[in] cmd {string} Executable name to locate.
 * @return {string | undefined} Absolute executable path, or `undefined` when not found.
 */
function findExecutable(cmd: string): string | undefined {
  if (cmd.includes(path.sep)) {
    return isExecutableFile(cmd) ? path.resolve(cmd) : undefined;
  }
  const pathValue = process.env.PATH ?? "";
  for (const dir of pathValue.split(path.delimiter)) {
    if (!dir) continue;
    const candidate = path.join(dir, cmd);
    if (isExecutableFile(candidate)) return candidate;
  }
  return undefined;
}

/**
 * @brief Dispatches one configured static checker for a single file.
 * @details Selects the debug `Dummy` or user-facing `Command` implementation by module name, normalizes parameter arrays, and runs exactly one checker instance against the target file. Runtime is dominated by the selected checker. Side effects include console output and possible process spawning.
 * @param[in] filePath {string} Absolute or relative file path to check.
 * @param[in] langConfig {StaticCheckEntry} Normalized static-check configuration entry.
 * @param[in] options {{ failOnly?: boolean; projectBase?: string }} Optional execution controls.
 * @return {number} Checker exit status where `0` means success and non-zero means failure.
 * @throws {ReqError} Throws when configuration is incomplete or names an unknown module.
 */
export function dispatchStaticCheckForFile(
  filePath: string,
  langConfig: StaticCheckEntry,
  options: { failOnly?: boolean; projectBase?: string } = {},
): number {
  const moduleName = String(langConfig.module ?? "");
  const params = Array.isArray(langConfig.params) ? langConfig.params.map(String) : [];
  const cmd = typeof langConfig.cmd === "string" ? langConfig.cmd : undefined;
  const failOnly = options.failOnly ?? false;
  switch (moduleName.toLowerCase()) {
    case "dummy":
      return new StaticCheckBase([filePath], params, failOnly).run();
    case "command":
      if (!cmd) {
        throw new ReqError(`Error: Command module requires 'cmd' in static-check config for '${filePath}'.`, 1);
      }
      return new StaticCheckCommand(cmd, [filePath], params, failOnly).run();
    default:
      throw new ReqError(
        `Error: unknown static-check module '${moduleName}'. Valid modules: ${formatDispatchStaticCheckModules()}`,
        1,
      );
  }
}

/**
 * @brief Runs the standalone static-check test driver.
 * @details Dispatches debug `dummy` or user-facing `command` subcommands without consulting project configuration. Runtime is O(n) in argument count plus checker cost. Side effects include console output and external process spawning.
 * @param[in] argv {string[]} Raw static-check subcommand arguments.
 * @return {number} Checker exit status where `0` means success.
 * @throws {ReqError} Throws when no subcommand is provided, the subcommand is unknown, or required arguments are missing.
 */
export function runStaticCheck(argv: string[]): number {
  if (argv.length === 0) {
    throw new ReqError("Error: --test-static-check requires a subcommand: dummy, command.", 1);
  }
  const [subcommand, ...rest] = argv;
  switch (subcommand) {
    case "dummy":
      return new StaticCheckBase(rest).run();
    case "command": {
      if (rest.length === 0) {
        throw new ReqError("Error: --test-static-check command requires a <cmd> argument.", 1);
      }
      const [cmd, ...files] = rest;
      return new StaticCheckCommand(cmd!, files).run();
    }
    default:
      throw new ReqError(
        `Error: unknown --test-static-check subcommand '${subcommand}'. Valid subcommands: dummy, command.`,
        1,
      );
  }
}
