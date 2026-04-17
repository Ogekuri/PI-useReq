/**
 * @file
 * @brief Converts req-debug tool `--args` text into the JSON object expected by `--params`.
 * @details Parses the wrapper-only tool-argument grammar, tokenizes shell-style text without invoking a shell, validates the argument shape for the current registered tool set, and emits one compact JSON object for `scripts/req-debug.sh`. Runtime is O(n) in argument length. Side effects are limited to stdout and stderr writes.
 */

import process from "node:process";
import { ReqError } from "../src/core/errors.js";
import { shellSplit } from "../src/core/utils.js";

/**
 * @brief Describes the normalized CLI request consumed by the tool-argument converter.
 * @details Captures the target tool name, raw `--args` text, and help-mode state for the standalone converter entrypoint. The interface is compile-time only and introduces no runtime side effects.
 */
interface ParsedToolArgsCli {
  toolName?: string;
  argsText: string;
  help: boolean;
}

/**
 * @brief Stores the standalone converter usage text.
 * @details Provides a deterministic help payload for invalid or incomplete invocations of `scripts/tool-args-to-params.ts`. Access complexity is O(1).
 */
const USAGE_TEXT = `Usage: node --import tsx ./scripts/tool-args-to-params.ts --name <tool> --args <text>

Options:
  --name <tool>           Registered tool name.
  --args <text>           Raw req-debug tool argument text.
  --help                  Show this help text.
`;

/**
 * @brief Parses CLI flags for the standalone tool-argument converter.
 * @details Performs one left-to-right scan, records the last `--name` and `--args` values, and ignores unrelated tokens so the wrapper can compose deterministic invocations. Runtime is O(n) in argument count. No external state is mutated.
 * @param[in] argv {string[]} Raw CLI arguments excluding executable and script path.
 * @return {ParsedToolArgsCli} Parsed converter request.
 */
function parseCliArgs(argv: string[]): ParsedToolArgsCli {
  const parsed: ParsedToolArgsCli = {
    argsText: "",
    help: false,
  };
  let index = 0;
  while (index < argv.length) {
    const token = argv[index]!;
    switch (token) {
      case "--name":
        parsed.toolName = argv[index + 1];
        index += 2;
        break;
      case "--args":
        parsed.argsText = argv[index + 1] ?? "";
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
 * @brief Removes one boolean flag from a shell-token array.
 * @details Preserves token order for all non-matching items and reports whether the requested flag appeared at least once. Runtime is O(n) in token count. No external state is mutated.
 * @param[in] tokens {string[]} Tokenized `--args` payload.
 * @param[in] flag {string} Flag token to remove.
 * @return {{ tokens: string[]; present: boolean }} Remaining tokens plus presence marker.
 */
function takeBooleanFlag(tokens: string[], flag: string): { tokens: string[]; present: boolean } {
  const remaining: string[] = [];
  let present = false;
  for (const token of tokens) {
    if (token === flag) {
      present = true;
      continue;
    }
    remaining.push(token);
  }
  return { tokens: remaining, present };
}

/**
 * @brief Converts one req-debug tool `--args` string into a tool-parameter object.
 * @details Tokenizes shell-style text with `shellSplit`, applies tool-specific positional and flag mappings, and rejects unsupported or structurally incomplete argument layouts before wrapper forwarding. Runtime is O(n) in token count. No external state is mutated.
 * @param[in] toolName {string} Registered tool name selected by `scripts/req-debug.sh`.
 * @param[in] argsText {string} Raw wrapper `--args` payload.
 * @return {Record<string, unknown>} JSON-serializable tool-parameter object compatible with `--params`.
 * @throws {ReqError} Throws when the selected tool has no supported `--args` mapping or when the token layout is invalid.
 * @satisfies REQ-065
 */
export function buildToolParamsFromArgsText(toolName: string, argsText: string): Record<string, unknown> {
  const tokens = shellSplit(argsText);
  switch (toolName) {
    case "git-path":
    case "get-base-path":
    case "references":
    case "tokens":
    case "static-check":
    case "git-check":
    case "docs-check":
    case "git-wt-name":
      if (tokens.length !== 0) {
        throw new ReqError(`Error: tool ${toolName} does not accept --args values.`, 1);
      }
      return {};
    case "files-tokens":
    case "files-references":
    case "files-static-check":
      return { files: tokens };
    case "files-compress": {
      const { tokens: remaining, present } = takeBooleanFlag(tokens, "--enable-line-numbers");
      return present ? { files: remaining, enableLineNumbers: true } : { files: remaining };
    }
    case "files-find": {
      const { tokens: remaining, present } = takeBooleanFlag(tokens, "--enable-line-numbers");
      if (remaining.length < 3) {
        throw new ReqError("Error: tool files-find requires <tag> <pattern> <file...> in --args text.", 1);
      }
      const [tag, pattern, ...files] = remaining;
      return present ? { tag, pattern, files, enableLineNumbers: true } : { tag, pattern, files };
    }
    case "compress": {
      const { tokens: remaining, present } = takeBooleanFlag(tokens, "--enable-line-numbers");
      if (remaining.length !== 0) {
        throw new ReqError("Error: tool compress accepts only --enable-line-numbers in --args text.", 1);
      }
      return present ? { enableLineNumbers: true } : {};
    }
    case "find": {
      const { tokens: remaining, present } = takeBooleanFlag(tokens, "--enable-line-numbers");
      if (remaining.length !== 2) {
        throw new ReqError("Error: tool find requires <tag> <pattern> in --args text.", 1);
      }
      const [tag, pattern] = remaining;
      return present ? { tag, pattern, enableLineNumbers: true } : { tag, pattern };
    }
    case "git-wt-create":
    case "git-wt-delete":
      if (tokens.length !== 1) {
        throw new ReqError(`Error: tool ${toolName} requires exactly one wtName value in --args text.`, 1);
      }
      return { wtName: tokens[0] };
    default:
      throw new ReqError(`Error: unsupported --args conversion for tool ${toolName}. Use --params with JSON.`, 1);
  }
}

/**
 * @brief Writes non-empty text to stdout.
 * @details Skips zero-length payloads so callers can compose CLI output without duplicate blank writes. Runtime is O(n) in text length. Side effects are limited to stdout writes.
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
 * @details Appends a newline when absent and suppresses zero-length payloads. Runtime is O(n) in text length. Side effects are limited to stderr writes.
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
 * @brief Executes one standalone tool-argument conversion request.
 * @details Parses converter CLI flags, validates the presence of `--name`, transforms wrapper `--args` text into a JSON object, and writes the serialized payload for shell consumption while converting `ReqError` failures into stderr plus exit codes. Runtime is O(n) in argument length. Side effects are limited to stdout and stderr writes.
 * @param[in] argv {string[]} Raw CLI arguments. Defaults to `process.argv.slice(2)`.
 * @return {Promise<number>} Process exit code.
 * @throws {ReqError} Internally catches `ReqError` and returns its exit code.
 * @satisfies REQ-065
 */
export async function main(argv = process.argv.slice(2)): Promise<number> {
  try {
    const args = parseCliArgs(argv);
    if (args.help || !args.toolName) {
      writeStdout(USAGE_TEXT);
      return 0;
    }
    const params = buildToolParamsFromArgsText(args.toolName, args.argsText);
    writeStdout(`${JSON.stringify(params)}\n`);
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
