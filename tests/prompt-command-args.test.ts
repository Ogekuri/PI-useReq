import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getDefaultConfig } from "../src/core/config.js";
import { ReqError } from "../src/core/errors.js";
import {
  PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER,
  PROMPT_COMMAND_FILE_REQUEST_NAMES,
  expandPromptCommandHomePath,
  isPromptCommandFileRequestName,
  parsePromptCommandFileSpec,
  resolvePromptCommandUserRequest,
} from "../src/core/prompt-command-args.js";
import { renderPrompt } from "../src/core/prompts.js";
import { ensureBundledResourcesAccessible } from "../src/core/resources.js";

/**
 * @brief Creates one unique temporary directory for request-file fixtures.
 * @details Allocates a directory under the system temp root so every test isolates its fixtures from the repository and from other tests. Runtime is O(1). Side effects include one directory creation.
 * @param[in] prefix {string} Prefix forwarded to `fs.mkdtempSync(...)`.
 * @return {string} Absolute temporary directory path.
 */
function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * @brief Creates one text fixture with the supplied content inside a directory.
 * @details Writes the content verbatim so path spellings containing spaces and escape sequences can be exercised against real filesystem entries. Runtime is O(n) in content size. Side effects include one file creation.
 * @param[in] dir {string} Target directory receiving the fixture.
 * @param[in] name {string} Fixture file name, possibly containing spaces.
 * @param[in] content {string} Verbatim UTF-8 fixture content.
 * @return {string} Absolute fixture file path.
 */
function createRequestFile(dir: string, name: string, content: string): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * @brief Asserts one ReqError diagnostic against a regular expression.
 * @details Invokes the callback and verifies the thrown error is a `ReqError` whose message matches the supplied pattern, keeping the expected exception type and stable diagnostic fragment explicit. Runtime is O(1) beyond the callback cost. No external state is mutated.
 * @param[in] pattern {RegExp} Diagnostic fragment expected in the error message.
 * @param[in] callback {() => unknown} Zero-argument invocation expected to throw.
 * @return {void} No return value; assertion failures reject the enclosing test.
 */
function assertReqError(pattern: RegExp, callback: () => unknown): void {
  assert.throws(callback, (error: unknown) => {
    assert.ok(error instanceof ReqError);
    assert.match(error.message, pattern);
    return true;
  });
}

test("resolvePromptCommandUserRequest substitutes the empty-input placeholder and passes inline and non-covered command input through verbatim", () => {
  // Arrange: covered and non-covered command names plus empty, whitespace-only, and inline inputs.
  assert.deepEqual(
    [...PROMPT_COMMAND_FILE_REQUEST_NAMES],
    ["analyze", "change", "check", "cover", "fix", "new", "readme", "refactor", "write"],
  );
  assert.equal(isPromptCommandFileRequestName("change"), true);
  assert.equal(isPromptCommandFileRequestName("workflow"), false);
  assert.equal(isPromptCommandFileRequestName("create"), false);

  // Act + Assert: empty and whitespace-only covered inputs map to the fixed placeholder.
  const emptyResolved = resolvePromptCommandUserRequest("change", "");
  assert.equal(emptyResolved.source, "empty");
  assert.equal(emptyResolved.requestText, PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER);
  assert.equal(emptyResolved.filePath, undefined);
  const blankResolved = resolvePromptCommandUserRequest("write", "  \n\t ");
  assert.equal(blankResolved.source, "empty");
  assert.equal(blankResolved.requestText, PROMPT_COMMAND_EMPTY_REQUEST_PLACEHOLDER);

  // Act + Assert: inline covered input passes through verbatim including surrounding whitespace.
  const inlineResolved = resolvePromptCommandUserRequest("fix", "  Fix the parser module  ");
  assert.equal(inlineResolved.source, "inline");
  assert.equal(inlineResolved.requestText, "  Fix the parser module  ");

  // Act + Assert: non-covered commands keep verbatim raw-input passthrough without placeholder or '@' parsing.
  const coveredEmpty = resolvePromptCommandUserRequest("create", "");
  assert.equal(coveredEmpty.source, "inline");
  assert.equal(coveredEmpty.requestText, "");
  const coveredFileRef = resolvePromptCommandUserRequest("workflow", "@/tmp/missing-request.txt");
  assert.equal(coveredFileRef.source, "inline");
  assert.equal(coveredFileRef.requestText, "@/tmp/missing-request.txt");
});

test("quoted, escaped, and plain-space file references load textual content with home-directory expansion", () => {
  // Arrange: one spaced fixture plus one home-directory fixture under the system temp root.
  const tempDir = createTempDir("pi-usereq-args-load-");
  const homeDir = createTempDir("pi-usereq-args-home-");
  try {
    const fixturePath = createRequestFile(
      tempDir,
      "TI - EVB - request.txt",
      "# User Request\nImplement the parser module.\n",
    );
    const homeRequestPath = createRequestFile(homeDir, "home-request.md", "Refactor the docs renderer.\n");

    // Act + Assert: double-quoted spelling loads verbatim content.
    const doubleQuoted = resolvePromptCommandUserRequest("change", `@"${fixturePath}"`);
    assert.equal(doubleQuoted.source, "file");
    assert.equal(doubleQuoted.requestText, "# User Request\nImplement the parser module.\n");
    assert.equal(doubleQuoted.filePath, fixturePath);

    // Act + Assert: single-quoted spelling loads the same content.
    const singleQuoted = resolvePromptCommandUserRequest("change", `@'${fixturePath}'`);
    assert.equal(singleQuoted.source, "file");
    assert.equal(singleQuoted.requestText, doubleQuoted.requestText);

    // Act + Assert: backslash-escaped space spelling loads the same content.
    const escaped = resolvePromptCommandUserRequest(
      "fix",
      `@${tempDir}/TI\\ -\\ EVB\\ -\\ request.txt`,
    );
    assert.equal(escaped.source, "file");
    assert.equal(escaped.requestText, doubleQuoted.requestText);

    // Act + Assert: plain unescaped-space spelling loads the same content.
    const plain = resolvePromptCommandUserRequest("change", `@${fixturePath}`);
    assert.equal(plain.source, "file");
    assert.equal(plain.requestText, doubleQuoted.requestText);

    // Act + Assert: tilde spellings expand against the supplied home directory.
    const tildeSlash = resolvePromptCommandUserRequest("new", "@~/home-request.md", homeDir);
    assert.equal(tildeSlash.source, "file");
    assert.equal(tildeSlash.requestText, "Refactor the docs renderer.\n");
    assert.equal(tildeSlash.filePath, homeRequestPath);
    const bareTilde = expandPromptCommandHomePath("~", homeDir);
    assert.equal(bareTilde, homeDir);

    // Act + Assert: pure path-spec extraction unescapes sequences and strips quoted spans.
    assert.equal(parsePromptCommandFileSpec('"a \\"b\\" c.txt"'), 'a "b" c.txt');
    assert.equal(parsePromptCommandFileSpec("dir\\ name\\ with\\ spaces/x.txt"), "dir name with spaces/x.txt");
    assert.equal(expandPromptCommandHomePath("/absolute/x.txt", homeDir), "/absolute/x.txt");
    assert.equal(expandPromptCommandHomePath("relative/x.txt", homeDir), "relative/x.txt");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

test("file references reject missing, non-regular, binary, and empty fixtures with deterministic path-naming errors", () => {
  // Arrange: missing, directory, binary, empty, and whitespace-only fixtures.
  const tempDir = createTempDir("pi-usereq-args-errors-");
  try {
    const binaryPath = path.join(tempDir, "binary-request.bin");
    fs.writeFileSync(binaryPath, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01, 0x02]));
    const emptyPath = createRequestFile(tempDir, "empty-request.txt", "");
    const blankPath = createRequestFile(tempDir, "blank-request.txt", "  \n\t ");

    // Act + Assert: missing files fail naming the expanded path.
    const missingPath = path.join(tempDir, "missing-request.txt");
    assertReqError(
      new RegExp(`user-request file not found: ${missingPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`),
      () => resolvePromptCommandUserRequest("change", `@"${missingPath}"`),
    );

    // Act + Assert: directory references fail as non-regular files.
    assertReqError(
      /user-request file is not a regular file/,
      () => resolvePromptCommandUserRequest("change", `@"${tempDir}"`),
    );

    // Act + Assert: NUL-bearing content fails as binary or executable.
    assertReqError(
      new RegExp(`user-request file is binary or executable: ${binaryPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`),
      () => resolvePromptCommandUserRequest("change", `@${binaryPath}`),
    );

    // Act + Assert: empty and whitespace-only content fails naming the file path.
    assertReqError(
      new RegExp(`user-request file is empty: ${emptyPath.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}`),
      () => resolvePromptCommandUserRequest("change", `@"${emptyPath}"`),
    );
    assertReqError(
      /user-request file is empty/,
      () => resolvePromptCommandUserRequest("change", `@'${blankPath}'`),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("quoted-path syntax errors and rendered-prompt embedding of the resolved request text", () => {
  // Arrange: one valid fixture for the rendering assertions plus syntax-error inputs.
  const tempDir = createTempDir("pi-usereq-args-syntax-");
  try {
    const fixturePath = createRequestFile(tempDir, "spaced request.txt", "Write the coverage matrix.\n");

    // Act + Assert: unterminated quoted spans fail deterministically.
    assertReqError(/unterminated double-quoted file path/, () =>
      parsePromptCommandFileSpec(`"${fixturePath}`));
    assertReqError(/unterminated single-quoted file path/, () =>
      resolvePromptCommandUserRequest("readme", `@'${fixturePath}`));

    // Act + Assert: non-whitespace text after the closing quote fails deterministically.
    assertReqError(/unexpected text after the quoted file path: "extra words"/, () =>
      parsePromptCommandFileSpec(`"${fixturePath}" extra words`));
    assertReqError(/unexpected text after the quoted file path/, () =>
      resolvePromptCommandUserRequest("refactor", `@"${fixturePath}" extra words`));

    // Act + Assert: missing path content fails deterministically.
    assertReqError(/missing file path after '@'/, () => parsePromptCommandFileSpec('""'));

    // Act: render one bundled prompt with a file-resolved request text.
    ensureBundledResourcesAccessible();
    const projectBase = process.cwd();
    const config = getDefaultConfig(projectBase);
    config["context-files-requirements"] = false;
    config["context-files-references"] = false;
    config["context-files-workflow"] = false;
    const fileResolved = resolvePromptCommandUserRequest("change", `@"${fixturePath}"`);
    const renderedFile = renderPrompt("change", fileResolved.requestText, projectBase, config);
    assert.match(renderedFile, /Write the coverage matrix\./);
    assert.doesNotMatch(renderedFile, /%%ARGS%%/);

    // Act + Assert: render one bundled prompt with the empty-input placeholder text.
    const emptyResolved = resolvePromptCommandUserRequest("change", "");
    const renderedEmpty = renderPrompt("change", emptyResolved.requestText, projectBase, config);
    assert.match(renderedEmpty, /The user did not input any specific request/);
    assert.doesNotMatch(renderedEmpty, /%%ARGS%%/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
