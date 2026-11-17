/**
 * @file
 * @brief Resolves the user-request text of prompt commands, including `@` file-reference loading.
 * @details Resolves the effective user-request text for the bundled prompt-backed commands that accept file-based requests by classifying raw command input into empty, inline, and `@` file-reference sources, extracting the referenced path through quoted, backslash-escaped, and plain spellings, expanding a leading `~` against the runtime home directory, and loading the referenced file as UTF-8 text after existence, regular-file, and textual-content verification. Runtime is linear in input size plus referenced-file size. Side effects are limited to filesystem stat, open, read, and close operations on the referenced file.
 * @satisfies DES-047, REQ-781, REQ-782, REQ-783, REQ-784, REQ-785, REQ-786, REQ-787, REQ-788, REQ-789, REQ-790, REQ-791, REQ-793
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReqError } from "./errors.js";
import type { PromptCommandName } from "./prompt-command-catalog.js";

/**
 * @brief Lists the bundled prompt command names that resolve file-based user requests.
 * @details Provides the single source of truth for the command set that parses empty input into the fixed placeholder and interprets a leading `@` as a user-request file reference; every other bundled prompt command keeps verbatim raw-input passthrough. Access complexity is O(1).
 * @satisfies REQ-781, REQ-793
 */
export const PROMPT_COMMAND_FILE_REQUEST_NAMES = [
  "analyze",
  "change",
  "check",
  "cover",
  "fix",
  "new",
  "readme",
  "refactor",
  "write",
] as const;

/**
 * @brief Stores the fixed `%%ARGS%%` replacement for empty prompt-command input.
 * @details The placeholder tells the downstream LLM agent that the user did not input any specific request so the workflow proceeds from its canonical inputs. Access complexity is O(1).
 * @satisfies REQ-782
 */
export const PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER =
  "The user did not input any specific request; execute the workflow from its canonical inputs only.";

/**
 * @brief Defines the byte length of the leading sample used for textual-content verification.
 * @details Mirrors the Git binary-detection convention: one NUL byte inside the leading sample classifies the file as binary or executable content. Access complexity is O(1).
 * @satisfies REQ-789
 */
const USER_REQUEST_BINARY_SAMPLE_SIZE = 8192;

/**
 * @brief Represents the resolved source kind of one prompt-command user request.
 * @details `empty` marks input that carries no specific request and maps to the fixed placeholder, `file` marks a loaded `@` file reference, and `inline` marks verbatim raw command input. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-781, REQ-782, REQ-783, REQ-793
 */
export type PromptCommandUserRequestSource = "empty" | "file" | "inline";

/**
 * @brief Represents one resolved prompt-command user request.
 * @details Carries the effective `%%ARGS%%` replacement text plus the classification source and, for file-based requests, the expanded absolute file path. Construction cost is O(1).
 * @satisfies REQ-782, REQ-783, REQ-790, REQ-792
 */
export interface PromptCommandUserRequest {
  /**
   * @brief Classification of the resolved request source.
   * @details One of `empty`, `file`, or `inline` as defined by `PromptCommandUserRequestSource`. Assigned during construction.
   */
  source: PromptCommandUserRequestSource;

  /**
   * @brief Effective text substituting the `%%ARGS%%` prompt token.
   * @details Contains the fixed placeholder, the verbatim loaded file content, or the verbatim raw command input depending on `source`. Assigned during construction.
   */
  requestText: string;

  /**
   * @brief Expanded absolute path of the loaded user-request file.
   * @details Defined only when `source` is `file`; `undefined` otherwise. Assigned during construction.
   */
  filePath?: string;
}

/**
 * @brief Reports whether one prompt command resolves file-based user requests.
 * @details Membership test against `PROMPT_COMMAND_FILE_REQUEST_NAMES` so the caller can decide between request resolution and verbatim raw-input passthrough. Time complexity is O(n) in the command-name list length, bounded by a 9-entry constant. No external state is mutated.
 * @param[in] promptName {PromptCommandName} Canonical bundled prompt name without the `req-` prefix.
 * @return {boolean} `true` when the command parses empty input and `@` file references; `false` otherwise.
 * @satisfies REQ-781, REQ-793
 */
export function isPromptCommandFileRequestName(promptName: PromptCommandName): boolean {
  return (PROMPT_COMMAND_FILE_REQUEST_NAMES as readonly string[]).includes(promptName);
}

/**
 * @brief Unescapes every `\X` backslash escape sequence into the literal character `X`.
 * @details Applies one linear pass so `\<space>` yields a literal space, `\"` yields a literal double quote, and `\\` yields a single backslash, matching the shell-like spellings accepted after `@`. Time complexity is O(n) in input length. No external state is mutated.
 * @param[in] value {string} Raw path fragment possibly containing backslash escape sequences.
 * @return {string} Fragment with every two-character `\X` sequence collapsed to `X`.
 * @satisfies REQ-784
 */
function unescapeUserRequestPath(value: string): string {
  return value.replace(/\\(.)/g, "$1");
}

/**
 * @brief Extracts the referenced file path from the input text following the `@` marker.
 * @details Accepts one double-quoted span, one single-quoted span, or the entire remaining input as the path specification; quoted spans honor `\X` escapes while scanning for the closing quote and reject any non-whitespace text after the closing quote, and the unquoted spelling takes the entire remaining input with `\X` escapes removed so plain unescaped spaces stay valid path characters. Throws `ReqError` when the specification is missing, a quoted span is unterminated, or trailing text follows a quoted span. Time complexity is O(n) in specification length. No external state is mutated.
 * @param[in] spec {string} Input text following the `@` marker with surrounding whitespace already trimmed.
 * @return {string} Extracted raw path specification with escape sequences removed.
 * @throws {ReqError} When `spec` unescapes to an empty path, a quoted span never closes, or non-whitespace text follows the closing quote.
 * @satisfies REQ-784, REQ-785, REQ-786
 */
export function parsePromptCommandFileSpec(spec: string): string {
  if (spec.length === 0) {
    throw new ReqError("invalid @file reference: missing file path after '@'");
  }
  const quote = spec[0];
  if (quote === '"' || quote === "'") {
    let index = 1;
    while (index < spec.length) {
      if (spec[index] === "\\") {
        index += 2;
        continue;
      }
      if (spec[index] === quote) {
        break;
      }
      index += 1;
    }
    if (index >= spec.length) {
      throw new ReqError(
        `invalid @file reference: unterminated ${quote === '"' ? "double" : "single"}-quoted file path`,
      );
    }
    const rawPath = unescapeUserRequestPath(spec.slice(1, index));
    if (rawPath.trim().length === 0) {
      throw new ReqError("invalid @file reference: missing file path after '@'");
    }
    const remainder = spec.slice(index + 1).trim();
    if (remainder.length > 0) {
      throw new ReqError(
        `invalid @file reference: unexpected text after the quoted file path: "${remainder}"`,
      );
    }
    return rawPath;
  }
  const rawPath = unescapeUserRequestPath(spec);
  if (rawPath.trim().length === 0) {
    throw new ReqError("invalid @file reference: missing file path after '@'");
  }
  return rawPath;
}

/**
 * @brief Expands a leading tilde in a user-request file path against the runtime home directory.
 * @details Rewrites a bare `~` to the supplied home directory and a `~/` prefix to the home-directory-joined path while leaving every other spelling unchanged so relative and absolute paths keep their literal form. Time complexity is O(n) in path length. No external state is mutated.
 * @param[in] rawPath {string} Extracted path specification after `@`.
 * @param[in] homeDir {string} Runtime home directory used for tilde expansion.
 * @return {string} Expanded path ready for filesystem access.
 * @satisfies REQ-787
 */
export function expandPromptCommandHomePath(rawPath: string, homeDir: string): string {
  if (rawPath === "~") {
    return homeDir;
  }
  if (rawPath.startsWith("~/")) {
    return path.join(homeDir, rawPath.slice(2));
  }
  return rawPath;
}

/**
 * @brief Loads one user-request file after existence, regular-file, and textual-content verification.
 * @details Verifies the file exists through `fs.statSync`, rejects non-regular files, samples the leading `USER_REQUEST_BINARY_SAMPLE_SIZE` bytes through one open-read-close cycle and rejects content containing a NUL byte as binary or executable, reads the full content as UTF-8 text through `fs.readFileSync`, and rejects empty or whitespace-only content. Every failure throws `ReqError` naming the file path and the cause; filesystem failures outside the classified checks wrap the underlying error message. Time complexity is O(size) in file size plus one bounded 8192-byte sample. Side effects are limited to filesystem stat, open, read, and close operations on the referenced file.
 * @param[in] promptName {string} Bundled prompt name without the `req-` prefix used in diagnostic prefixes.
 * @param[in] filePath {string} Expanded absolute or relative path of the referenced file.
 * @return {string} Verbatim UTF-8 file content used as the `%%ARGS%%` replacement text.
 * @throws {ReqError} When the file does not exist, is not a regular file, contains binary or executable content, is empty or whitespace-only, or cannot be read.
 * @satisfies REQ-788, REQ-789, REQ-790, REQ-791
 */
function loadTextualUserRequestFile(promptName: string, filePath: string): string {
  let stats: fs.Stats;
  try {
    stats = fs.statSync(filePath);
  } catch {
    throw new ReqError(`user-request file not found: ${filePath}`);
  }
  if (!stats.isFile()) {
    throw new ReqError(`user-request file is not a regular file: ${filePath}`);
  }
  try {
    const descriptor = fs.openSync(filePath, "r");
    try {
      const sample = Buffer.alloc(USER_REQUEST_BINARY_SAMPLE_SIZE);
      const bytesRead = fs.readSync(descriptor, sample, 0, USER_REQUEST_BINARY_SAMPLE_SIZE, 0);
      if (sample.subarray(0, bytesRead).includes(0)) {
        throw new ReqError(`user-request file is binary or executable: ${filePath}`);
      }
    } finally {
      fs.closeSync(descriptor);
    }
    const content = fs.readFileSync(filePath, "utf8");
    if (content.trim().length === 0) {
      throw new ReqError(`user-request file is empty: ${filePath}`);
    }
    return content;
  } catch (error) {
    if (error instanceof ReqError) {
      throw error;
    }
    const cause = error instanceof Error ? error.message : String(error);
    throw new ReqError(`cannot read user-request file ${filePath}: ${cause}`);
  }
}

/**
 * @brief Resolves the effective user-request text of one prompt command from raw command input.
 * @details Returns verbatim raw input for every command outside `PROMPT_COMMAND_FILE_REQUEST_NAMES`, maps empty and whitespace-only input of covered commands to `PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER`, passes non-empty inline text through verbatim, and for input whose first non-whitespace character is `@` extracts the referenced path through `parsePromptCommandFileSpec`, expands a leading tilde through `expandPromptCommandHomePath`, and returns the verbatim loaded file content from `loadTextualUserRequestFile`. Time complexity is O(n + size) in input length plus referenced-file size. Side effects are limited to filesystem reads delegated to `loadTextualUserRequestFile`.
 * @param[in] promptName {PromptCommandName} Canonical bundled prompt name without the `req-` prefix.
 * @param[in] args {string} Raw user-supplied prompt arguments as received by the slash-command handler.
 * @param[in] homeDir {string} Runtime home directory used for tilde expansion; defaults to `os.homedir()`.
 * @return {PromptCommandUserRequest} Resolved request carrying the effective `%%ARGS%%` replacement text, the source classification, and the expanded file path for file-based requests.
 * @throws {ReqError} When the input starts with `@` and the referenced path has invalid syntax, does not exist, is not a regular file, carries binary or executable content, or loads no usable textual content.
 * @satisfies REQ-781, REQ-782, REQ-783, REQ-784, REQ-785, REQ-786, REQ-787, REQ-788, REQ-789, REQ-790, REQ-791, REQ-793
 */
export function resolvePromptCommandUserRequest(
  promptName: PromptCommandName,
  args: string,
  homeDir: string = os.homedir(),
): PromptCommandUserRequest {
  if (!isPromptCommandFileRequestName(promptName)) {
    return { source: "inline", requestText: args };
  }
  const trimmed = args.trim();
  if (trimmed.length === 0) {
    return { source: "empty", requestText: PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER };
  }
  if (!trimmed.startsWith("@")) {
    return { source: "inline", requestText: args };
  }
  const rawPath = parsePromptCommandFileSpec(trimmed.slice(1));
  const filePath = expandPromptCommandHomePath(rawPath, homeDir);
  const content = loadTextualUserRequestFile(promptName, filePath);
  return { source: "file", requestText: content, filePath };
}
