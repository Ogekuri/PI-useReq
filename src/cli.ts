#!/usr/bin/env node
/**
 * @file
 * @brief Implements the standalone pi-usereq command-line entry point.
 * @details Parses CLI flags, resolves project configuration, dispatches tool-runner operations, and converts thrown `ReqError` instances into process-style stdout, stderr, and exit codes. Runtime is dominated by the selected subcommand. Side effects include stdout/stderr writes and any filesystem or git operations performed by delegated commands.
 */

import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig, normalizeConfigPaths, saveConfig, type UseReqConfig } from "./core/config.js";
import {
  loadAndRepairConfig,
  resolveProjectBase,
  runCompress,
  runDocsCheck,
  runFilesCompress,
  runFilesFind,
  runFilesReferences,
  runFilesStaticCheck,
  runFilesTokens,
  runFind,
  runGetBasePath,
  runGitCheck,
  runGitPath,
  runGitWtCreate,
  runGitWtDelete,
  runGitWtName,
  runProjectStaticCheck,
  runReferences,
  runTokens,
} from "./core/tool-runner.js";
import {
  buildStaticCheckEntryIdentity,
  parseEnableStaticCheck,
  runStaticCheck,
  validateStaticCheckEntry,
} from "./core/static-check.js";

/**
 * @brief Represents the parsed CLI flag state for one invocation.
 * @details The interface captures every supported command and option in a normalized shape consumed by `main`. It is compile-time only and introduces no runtime cost.
 */
interface ParsedArgs {
  base?: string;
  here?: boolean;
  verbose?: boolean;
  enableLineNumbers?: boolean;
  enableStaticCheck?: string[];
  filesTokens?: string[];
  filesReferences?: string[];
  filesCompress?: string[];
  filesFind?: string[];
  references?: boolean;
  compress?: boolean;
  find?: [string, string];
  tokens?: boolean;
  filesStaticCheck?: string[];
  staticCheck?: boolean;
  gitCheck?: boolean;
  docsCheck?: boolean;
  gitWtName?: boolean;
  gitWtCreate?: string;
  gitWtDelete?: string;
  gitPath?: boolean;
  getBasePath?: boolean;
  testStaticCheck?: string[];
}

/**
 * @brief Parses raw CLI tokens into a normalized argument object.
 * @details Performs a single left-to-right scan, supports options with variable-length value tails, and records only the last occurrence of scalar flags. Runtime is O(n) in argument count. No external state is mutated.
 * @param[in] argv {string[]} Raw CLI arguments excluding the executable and script path.
 * @return {ParsedArgs} Parsed flag object.
 */
function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  const takeUntilOption = (start: number): [string[], number] => {
    const values: string[] = [];
    let index = start;
    while (index < argv.length && !argv[index]!.startsWith("--")) {
      values.push(argv[index]!);
      index += 1;
    }
    return [values, index];
  };

  let index = 0;
  while (index < argv.length) {
    const token = argv[index]!;
    switch (token) {
      case "--base":
        parsed.base = argv[index + 1];
        index += 2;
        break;
      case "--here":
        parsed.here = true;
        index += 1;
        break;
      case "--verbose":
        parsed.verbose = true;
        index += 1;
        break;
      case "--enable-line-numbers":
        parsed.enableLineNumbers = true;
        index += 1;
        break;
      case "--enable-static-check":
        parsed.enableStaticCheck = [...(parsed.enableStaticCheck ?? []), argv[index + 1] ?? ""];
        index += 2;
        break;
      case "--files-tokens": {
        const [values, next] = takeUntilOption(index + 1);
        parsed.filesTokens = values;
        index = next;
        break;
      }
      case "--files-references": {
        const [values, next] = takeUntilOption(index + 1);
        parsed.filesReferences = values;
        index = next;
        break;
      }
      case "--files-compress": {
        const [values, next] = takeUntilOption(index + 1);
        parsed.filesCompress = values;
        index = next;
        break;
      }
      case "--files-find": {
        const [values, next] = takeUntilOption(index + 1);
        parsed.filesFind = values;
        index = next;
        break;
      }
      case "--references":
        parsed.references = true;
        index += 1;
        break;
      case "--compress":
        parsed.compress = true;
        index += 1;
        break;
      case "--find":
        parsed.find = [argv[index + 1]!, argv[index + 2]!];
        index += 3;
        break;
      case "--tokens":
        parsed.tokens = true;
        index += 1;
        break;
      case "--files-static-check": {
        const [values, next] = takeUntilOption(index + 1);
        parsed.filesStaticCheck = values;
        index = next;
        break;
      }
      case "--static-check":
        parsed.staticCheck = true;
        index += 1;
        break;
      case "--git-check":
        parsed.gitCheck = true;
        index += 1;
        break;
      case "--docs-check":
        parsed.docsCheck = true;
        index += 1;
        break;
      case "--git-wt-name":
        parsed.gitWtName = true;
        index += 1;
        break;
      case "--git-wt-create":
        parsed.gitWtCreate = argv[index + 1];
        index += 2;
        break;
      case "--git-wt-delete":
        parsed.gitWtDelete = argv[index + 1];
        index += 2;
        break;
      case "--git-path":
        parsed.gitPath = true;
        index += 1;
        break;
      case "--get-base-path":
        parsed.getBasePath = true;
        index += 1;
        break;
      case "--test-static-check":
        parsed.testStaticCheck = argv.slice(index + 1);
        index = argv.length;
        break;
      default:
        index += 1;
        break;
    }
  }
  return parsed;
}

/**
 * @brief Writes text to stdout when non-empty.
 * @details Avoids emitting zero-length writes so callers can compose result output safely. Runtime is O(n) in text length. Side effect: writes to `process.stdout`.
 * @param[in] text {string} Text to emit.
 * @return {void} No return value.
 */
function writeStdout(text: string): void {
  if (text) process.stdout.write(text);
}

/**
 * @brief Writes text to stderr and ensures a trailing newline.
 * @details Skips empty input, appends a newline when necessary, and emits the final text to `process.stderr`. Runtime is O(n) in text length. Side effect: writes to `process.stderr`.
 * @param[in] text {string} Text to emit.
 * @return {void} No return value.
 */
function writeStderr(text: string): void {
  if (!text) return;
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

/**
 * @brief Emits a tool result object to process streams.
 * @details Writes stdout first, then stderr, and returns the embedded exit code without modification. Runtime is O(n) in total emitted text size. Side effects are stdout/stderr writes.
 * @param[in] result {{ stdout: string; stderr: string; code: number }} Command result payload.
 * @return {number} Exit code to propagate from the invoked command.
 */
function writeResult(result: { stdout: string; stderr: string; code: number }): number {
  writeStdout(result.stdout);
  writeStderr(result.stderr);
  return result.code;
}

/**
 * @brief Loads mutable project config state without persisting runtime path metadata.
 * @details Resolves the project base, loads existing config or defaults, normalizes persisted directory fields into project-relative form, and returns the in-memory pair used by CLI mutations. Runtime is dominated by config I/O. Side effects are limited to config reads.
 * @param[in] projectBase {string} Candidate project root path.
 * @return {{ base: string; config: UseReqConfig }} Validated project base and normalized in-memory config.
 * @satisfies REQ-035, REQ-146
 */
function loadMutableProjectConfig(projectBase: string): { base: string; config: UseReqConfig } {
  const base = resolveProjectBase(projectBase);
  const config = normalizeConfigPaths(base, loadConfig(base));
  return { base, config };
}

/**
 * @brief Applies repeatable `--enable-static-check` specifications to project config.
 * @details Parses each specification, validates command-backed entries before persistence, appends only non-duplicate identities in argument order, preserves existing entries, and writes the merged config once after all validations succeed. Runtime is O(s + e) plus PATH probing where s is spec count and e is existing entry count. Side effects include config writes.
 * @param[in] projectBase {string} Candidate project root path.
 * @param[in] specs {string[]} Raw `--enable-static-check` specifications in CLI order.
 * @return {UseReqConfig} Persisted merged project configuration.
 * @throws {ReqError} Throws when parsing or validation fails.
 * @satisfies REQ-035, REQ-036, REQ-037
 */
function applyEnableStaticCheckSpecs(projectBase: string, specs: string[]): UseReqConfig {
  const { base, config } = loadMutableProjectConfig(projectBase);
  const seen = new Set<string>();
  for (const [language, entries] of Object.entries(config["static-check"] ?? {})) {
    for (const entry of entries) {
      seen.add(buildStaticCheckEntryIdentity(language, entry));
    }
  }
  config["static-check"] ??= {};
  for (const spec of specs) {
    const [language, entry] = parseEnableStaticCheck(spec);
    validateStaticCheckEntry(entry);
    const identity = buildStaticCheckEntryIdentity(language, entry);
    if (seen.has(identity)) {
      continue;
    }
    config["static-check"][language] ??= [];
    config["static-check"][language]!.push(entry);
    seen.add(identity);
  }
  saveConfig(base, config);
  return config;
}

/**
 * @brief Executes one pi-usereq CLI invocation.
 * @details Parses arguments, enforces mutually exclusive project-selection rules, normalizes persisted config when needed, dispatches the first matching command handler, and converts thrown `ReqError` instances into stream output plus numeric exit codes. Runtime is O(n) in argument count plus delegated command cost. Side effects include config normalization writes and stdout/stderr output.
 * @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
 * @return {number} Process exit code for the invocation.
 * @throws {ReqError} Internally catches `ReqError` and returns its code; other errors are coerced into exit code `1` with stderr output.
 */
export function main(argv = process.argv.slice(2)): number {
  try {
    if (argv.length === 0) {
      return 0;
    }
    const args = parseArgs(argv);
    const hereOnlyProjectCommand = !!(
      args.references || args.compress || args.tokens || args.find || args.staticCheck ||
      args.gitCheck || args.docsCheck || args.gitWtName || args.gitWtCreate || args.gitWtDelete ||
      args.gitPath || args.getBasePath
    );
    if (hereOnlyProjectCommand) {
      if (args.base) {
        throw new ReqError(
          "Error: --references, --compress, --tokens, --find, --static-check, --git-check, --docs-check, --git-wt-name, --git-wt-create, and --git-wt-delete, --git-path, and --get-base-path do not allow --base; use --here.",
          1,
        );
      }
      args.here = true;
    }

    const projectBase = args.base ? args.base : process.cwd();
    let config: UseReqConfig;
    if (args.enableStaticCheck && args.enableStaticCheck.length > 0) {
      config = applyEnableStaticCheckSpecs(projectBase, args.enableStaticCheck);
    } else {
      if (args.here || args.base) {
        loadAndRepairConfig(projectBase);
      }
      const resolvedBase = resolveProjectBase(projectBase);
      config = normalizeConfigPaths(resolvedBase, loadConfig(resolvedBase));
    }

    if (args.filesTokens) return writeResult(runFilesTokens(args.filesTokens));
    if (args.filesReferences) return writeResult(runFilesReferences(args.filesReferences, process.cwd(), args.verbose));
    if (args.filesCompress) return writeResult(runFilesCompress(args.filesCompress, process.cwd(), args.enableLineNumbers, args.verbose));
    if (args.filesFind) return writeResult(runFilesFind(args.filesFind, args.enableLineNumbers, args.verbose));
    if (args.testStaticCheck) return runStaticCheck(args.testStaticCheck);
    if (args.filesStaticCheck) return writeResult(runFilesStaticCheck(args.filesStaticCheck, projectBase, config));
    if (args.references) return writeResult(runReferences(projectBase, config, args.verbose));
    if (args.compress) return writeResult(runCompress(projectBase, config, args.enableLineNumbers, args.verbose));
    if (args.find) return writeResult(runFind(projectBase, args.find[0], args.find[1], config, args.enableLineNumbers, args.verbose));
    if (args.tokens) return writeResult(runTokens(projectBase, config));
    if (args.staticCheck) return writeResult(runProjectStaticCheck(projectBase, config));
    if (args.gitCheck) return writeResult(runGitCheck(projectBase, config));
    if (args.docsCheck) return writeResult(runDocsCheck(projectBase, config));
    if (args.gitWtName) return writeResult(runGitWtName(projectBase, config));
    if (args.gitWtCreate) return writeResult(runGitWtCreate(projectBase, args.gitWtCreate, config));
    if (args.gitWtDelete) return writeResult(runGitWtDelete(projectBase, args.gitWtDelete, config));
    if (args.gitPath) return writeResult(runGitPath(projectBase, config));
    if (args.getBasePath) return writeResult(runGetBasePath(projectBase, config));
    return 0;
  } catch (error) {
    const err = error as ReqError & { stdout?: string; stderr?: string };
    writeStdout(err.stdout ?? "");
    writeStderr(err.stderr ?? err.message ?? String(error));
    return err.code ?? 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
