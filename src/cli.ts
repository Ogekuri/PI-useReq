#!/usr/bin/env node
import process from "node:process";
import { ReqError } from "./core/errors.js";
import { loadConfig } from "./core/config.js";
import {
  loadAndRepairConfig,
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
import { runStaticCheck } from "./core/static-check.js";

interface ParsedArgs {
  base?: string;
  here?: boolean;
  enableLineNumbers?: boolean;
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
      case "--enable-line-numbers":
        parsed.enableLineNumbers = true;
        index += 1;
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

function writeStdout(text: string): void {
  if (text) process.stdout.write(text);
}

function writeStderr(text: string): void {
  if (!text) return;
  process.stderr.write(text.endsWith("\n") ? text : `${text}\n`);
}

function writeResult(result: { stdout: string; stderr: string; code: number }): number {
  writeStdout(result.stdout);
  writeStderr(result.stderr);
  return result.code;
}

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
    if (args.here || args.base) {
      loadAndRepairConfig(projectBase);
    }
    const config = loadConfig(projectBase);

    if (args.filesTokens) return writeResult(runFilesTokens(args.filesTokens));
    if (args.filesReferences) return writeResult(runFilesReferences(args.filesReferences, process.cwd()));
    if (args.filesCompress) return writeResult(runFilesCompress(args.filesCompress, process.cwd(), args.enableLineNumbers));
    if (args.filesFind) return writeResult(runFilesFind(args.filesFind, args.enableLineNumbers));
    if (args.testStaticCheck) return runStaticCheck(args.testStaticCheck);
    if (args.filesStaticCheck) return writeResult(runFilesStaticCheck(args.filesStaticCheck, projectBase, config));
    if (args.references) return writeResult(runReferences(projectBase, config));
    if (args.compress) return writeResult(runCompress(projectBase, config, args.enableLineNumbers));
    if (args.find) return writeResult(runFind(projectBase, args.find[0], args.find[1], config, args.enableLineNumbers));
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
