/**
 * @file
 * @brief Declares archive-backed CLI output scenarios and serialization helpers.
 * @details Centralizes deterministic scenario construction for expected-result archive generation and TypeScript output verification. The module provisions fixture-backed standalone commands, temporary repository commands, placeholder-based output normalization, archive serialization, and optional side-effect assertions. Runtime is dominated by subprocess execution and temporary filesystem setup performed by scenario runners. Side effects include temporary directory creation, git mutations inside temporary repositories, and archive file reads/writes under `tests/fixtures_attended_results/`.
 */

import assert from "node:assert/strict";
import type { SpawnSyncReturns } from "node:child_process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectLanguage } from "../src/core/generate-markdown.js";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import {
  createStaticCheckLanguageConfig,
  getProjectConfigPath,
  type UseReqConfig,
} from "../src/core/config.js";
import {
  initFixtureRepo,
  runNodeCli,
  runPythonCli,
  runPythonInline,
} from "./helpers.js";

/**
 * @brief Defines the repository root used by archive scenarios.
 * @details Resolves the parent directory of the current test module so fixture paths and archive paths stay stable across subprocess invocations. Access complexity is O(1).
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @brief Defines the root directory containing committed expected-result fixtures.
 * @details All archive-backed scenarios serialize their normalized command results beneath this directory. Access complexity is O(1).
 */
const ATTENDED_RESULTS_ROOT = path.join(ROOT, "tests", "fixtures_attended_results");

/**
 * @brief Defines the repository-local fixture directory used by standalone scenarios.
 * @details Scenario builders enumerate every `fixture_*` file under this directory when constructing explicit-file CLI cases. Access complexity is O(1).
 */
const FIXTURES_ROOT = path.join(ROOT, "tests", "fixtures");

/**
 * @brief Represents one normalized archived CLI observation.
 * @details The structure stores process exit code plus normalized stdout and stderr payloads exactly as committed in `tests/fixtures_attended_results`. The interface is compile-time only and introduces no runtime side effects.
 */
export interface ArchivedCliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * @brief Represents one prepared CLI execution context.
 * @details Scenario builders return command arguments, working directory, normalization rules, optional environment overrides, cleanup hooks, and optional side-effect assertions. The interface is compile-time only and introduces no runtime side effects.
 */
interface ScenarioExecution {
  args: string[];
  cwd: string;
  envOverrides?: NodeJS.ProcessEnv;
  normalize: (result: ArchivedCliResult) => ArchivedCliResult;
  cleanup: () => void;
  postAssert?: (result: SpawnSyncReturns<string>) => void;
}

/**
 * @brief Describes one committed expected-result CLI scenario.
 * @details Each scenario owns a stable identifier, an archive-relative output path, and a builder capable of preparing the runtime context for both Python archive capture and TypeScript verification. The interface is compile-time only and introduces no runtime side effects.
 */
export interface AttendedScenario {
  id: string;
  archiveRelativePath: string;
  buildExecution: () => ScenarioExecution;
  buildPythonResult?: () => ArchivedCliResult;
}

/**
 * @brief Converts Windows and mixed line endings to LF.
 * @details Normalizes all `CRLF` and standalone `CR` sequences so archive fixtures stay stable across platforms. Runtime is O(n) in text length. No side effects occur.
 * @param[in] value {string} Raw text payload.
 * @return {string} LF-normalized text.
 */
function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * @brief Replaces every literal occurrence of one substring.
 * @details Uses split/join semantics to avoid regular-expression escaping concerns when normalizing filesystem paths. Runtime is O(n) in input length. No side effects occur.
 * @param[in] value {string} Source text.
 * @param[in] search {string} Literal substring to replace.
 * @param[in] replacement {string} Replacement token.
 * @return {string} Text after replacement.
 */
function replaceLiteral(value: string, search: string, replacement: string): string {
  if (!search) {
    return value;
  }
  return value.split(search).join(replacement);
}

/**
 * @brief Applies placeholder replacements in descending match-length order.
 * @details Sorts replacement candidates by search-string length to prevent parent-path substitutions from truncating longer, more specific path tokens. Runtime is O(r * n) where r is replacement count and n is text length. No side effects occur.
 * @param[in] value {string} Source text.
 * @param[in] replacements {Array<[string, string]>} Literal replacement pairs.
 * @return {string} Normalized text.
 */
function applyReplacements(value: string, replacements: Array<[string, string]>): string {
  let normalized = normalizeLineEndings(value);
  for (const [search, replacement] of [...replacements].sort((left, right) => right[0].length - left[0].length)) {
    normalized = replaceLiteral(normalized, search, replacement);
  }
  return normalized;
}

/**
 * @brief Returns the fixture file names sorted deterministically.
 * @details Enumerates `fixture_*` files from `tests/fixtures`, filters non-files, and sorts lexicographically to stabilize archive generation order. Runtime is O(n log n) in fixture count. Side effects are limited to filesystem reads.
 * @return {string[]} Sorted fixture file names.
 */
function listFixtureNames(): string[] {
  return fs.readdirSync(FIXTURES_ROOT)
    .filter((entry) => entry.startsWith("fixture_"))
    .sort((left, right) => left.localeCompare(right));
}

/**
 * @brief Builds the repository-relative path for one named fixture file.
 * @details Produces a POSIX-style path rooted at `tests/fixtures` so explicit-file scenarios use stable arguments in archived outputs. Runtime is O(1). No side effects occur.
 * @param[in] fixtureName {string} Fixture file name.
 * @return {string} Repository-relative fixture path.
 */
function getRelativeFixturePath(fixtureName: string): string {
  return path.posix.join("tests", "fixtures", fixtureName);
}

/**
 * @brief Converts one repository-relative path to an absolute path under the current repository root.
 * @details Joins the repository root with the relative path and normalizes path separators. Runtime is O(1). No side effects occur.
 * @param[in] relativePath {string} Repository-relative path.
 * @return {string} Absolute path.
 */
function getAbsoluteFixturePath(relativePath: string): string {
  return path.join(ROOT, relativePath);
}

/**
 * @brief Resolves the broadest supported tag filter for one fixture file.
 * @details Detects the fixture language, reads the language-specific tag set, and emits a stable pipe-delimited filter string suitable for `--files-find`. Runtime is O(t log t) in tag count. No side effects occur.
 * @param[in] relativeFixturePath {string} Repository-relative fixture path.
 * @return {string} Pipe-delimited tag filter.
 */
function getFixtureTagFilter(relativeFixturePath: string): string {
  const language = detectLanguage(getAbsoluteFixturePath(relativeFixturePath));
  assert.ok(language, `Unsupported fixture language for ${relativeFixturePath}`);
  const tags = [...(LANGUAGE_TAGS[language!] ?? [])].sort((left, right) => left.localeCompare(right));
  assert.ok(tags.length > 0, `Missing LANGUAGE_TAGS entry for ${language}`);
  return tags.join("|");
}

/**
 * @brief Converts a subprocess result into the archived result shape.
 * @details Normalizes undefined fields to empty strings and undefined exit status to `1` so serialization remains total. Runtime is O(1). No side effects occur.
 * @param[in] result {SpawnSyncReturns<string>} Captured subprocess result.
 * @return {ArchivedCliResult} Raw archived result payload before scenario normalization.
 */
function toArchivedCliResult(result: SpawnSyncReturns<string>): ArchivedCliResult {
  return {
    code: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

/**
 * @brief Builds a normalizer that replaces repository-root paths with `<ROOT>`.
 * @details Applies the same literal path replacements to stdout and stderr so archived explicit-file scenarios stay clone-path agnostic. Runtime is O(n) in aggregate output size. No side effects occur.
 * @return {(result: ArchivedCliResult) => ArchivedCliResult} Scenario-specific normalizer.
 */
function createRootNormalizer(): (result: ArchivedCliResult) => ArchivedCliResult {
  const replacements: Array<[string, string]> = [[ROOT, "<ROOT>"]];
  return (result) => ({
    code: result.code,
    stdout: applyReplacements(result.stdout, replacements),
    stderr: applyReplacements(result.stderr, replacements),
  });
}

/**
 * @brief Builds a normalizer for temporary repository scenarios.
 * @details Replaces repository-root and parent-path prefixes plus optional worktree-name metadata, then applies any scenario-specific post-processing hook. Runtime is O(n) in aggregate output size. No side effects occur.
 * @param[in] projectBase {string} Temporary fixture repository root.
 * @param[in] options {{ worktreeName?: string; postNormalize?: ((value: string) => string) | undefined }} Scenario-specific normalization options.
 * @return {(result: ArchivedCliResult) => ArchivedCliResult} Scenario-specific normalizer.
 */
function createProjectNormalizer(
  projectBase: string,
  options: { worktreeName?: string; postNormalize?: ((value: string) => string) | undefined } = {},
): (result: ArchivedCliResult) => ArchivedCliResult {
  const replacements: Array<[string, string]> = [
    [projectBase, "<PROJECT_BASE>"],
    [path.dirname(projectBase), "<PROJECT_PARENT>"],
    [ROOT, "<ROOT>"],
  ];
  if (options.worktreeName) {
    replacements.push([path.join(path.dirname(projectBase), options.worktreeName), "<WORKTREE_PATH>"]);
  }
  return (result) => {
    const postNormalize = options.postNormalize ?? ((value: string) => value);
    return {
      code: result.code,
      stdout: postNormalize(applyReplacements(result.stdout, replacements)),
      stderr: postNormalize(applyReplacements(result.stderr, replacements)),
    };
  };
}

/**
 * @brief Runs `git add .` and commits the current fixture repository state.
 * @details Uses deterministic author metadata so repository-backed scenarios execute from a clean committed baseline without untracked config noise. Runtime is dominated by git subprocess execution. Side effects include index updates and commit creation inside the temporary repository.
 * @param[in] projectBase {string} Temporary fixture repository root.
 * @param[in] message {string} Commit message.
 * @return {void} No return value.
 */
function commitFixtureRepo(projectBase: string, message: string): void {
  const gitEnv = {
    ...process.env,
    GIT_AUTHOR_NAME: "pi-usereq",
    GIT_AUTHOR_EMAIL: "pi-usereq@example.com",
    GIT_COMMITTER_NAME: "pi-usereq",
    GIT_COMMITTER_EMAIL: "pi-usereq@example.com",
  };
  const stage = spawnSync("git", ["add", "."], { cwd: projectBase, encoding: "utf8" });
  assert.equal(stage.status, 0, stage.stderr);
  const commit = spawnSync("git", ["commit", "-m", message], { cwd: projectBase, encoding: "utf8", env: gitEnv });
  assert.equal(commit.status, 0, commit.stderr);
}

/**
 * @brief Removes a path tree if it exists.
 * @details Delegates to `fs.rmSync(..., { recursive: true, force: true })` so temporary repositories and worktrees are always reclaimed. Runtime is O(n) in traversed entry count. Side effects mutate the filesystem.
 * @param[in] targetPath {string} Absolute path to remove.
 * @return {void} No return value.
 */
function removePath(targetPath: string): void {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

/**
 * @brief Builds a stable no-op cleanup callback.
 * @details Returns a function rather than reusing an inline lambda so scenario builders remain concise and documented. Runtime is O(1). No side effects occur.
 * @return {() => void} Cleanup callback that performs no work.
 */
function createNoOpCleanup(): () => void {
  return () => undefined;
}

/**
 * @brief Creates one standalone explicit-file scenario.
 * @details Binds repository-relative command arguments and root-path normalization into a reusable scenario descriptor. Runtime is O(1). No side effects occur until the scenario executes.
 * @param[in] id {string} Stable scenario identifier.
 * @param[in] archiveRelativePath {string} Archive-relative fixture path.
 * @param[in] args {string[]} CLI arguments.
 * @return {AttendedScenario} Scenario descriptor.
 */
function createStandaloneScenario(id: string, archiveRelativePath: string, args: string[]): AttendedScenario {
  return {
    id,
    archiveRelativePath,
    buildExecution: () => ({
      args,
      cwd: ROOT,
      normalize: createRootNormalizer(),
      cleanup: createNoOpCleanup(),
    }),
  };
}

/**
 * @brief Creates one temporary-repository scenario.
 * @details Wraps a repository-setup factory so callers can declare scenario-specific normalization and side-effect assertions while the shared runner manages cleanup. Runtime is O(1) until execution. No side effects occur until the scenario executes.
 * @param[in] id {string} Stable scenario identifier.
 * @param[in] archiveRelativePath {string} Archive-relative fixture path.
 * @param[in] builder {() => ScenarioExecution} Scenario setup factory.
 * @return {AttendedScenario} Scenario descriptor.
 */
function createProjectScenario(id: string, archiveRelativePath: string, builder: () => ScenarioExecution): AttendedScenario {
  return {
    id,
    archiveRelativePath,
    buildExecution: builder,
  };
}

/**
 * @brief Builds all archive-backed standalone scenarios.
 * @details Expands every `fixture_*` file into the archived explicit-file command matrix required by `REQ-042`. Runtime is O(f) in fixture count. Side effects are limited to fixture-directory reads.
 * @return {AttendedScenario[]} Deterministically ordered standalone scenarios.
 */
function buildStandaloneScenarios(): AttendedScenario[] {
  const scenarios: AttendedScenario[] = [];
  for (const fixtureName of listFixtureNames()) {
    const relativeFixturePath = getRelativeFixturePath(fixtureName);
    const tagFilter = getFixtureTagFilter(relativeFixturePath);
    scenarios.push(
      createStandaloneScenario(
        `standalone/files-tokens/${fixtureName}`,
        path.posix.join("standalone", "files-tokens", `${fixtureName}.json`),
        ["--files-tokens", relativeFixturePath],
      ),
      createStandaloneScenario(
        `standalone/files-summarize/${fixtureName}`,
        path.posix.join("standalone", "files-summarize", `${fixtureName}.json`),
        ["--files-summarize", relativeFixturePath],
      ),
      createStandaloneScenario(
        `standalone/files-compress/${fixtureName}`,
        path.posix.join("standalone", "files-compress", `${fixtureName}.json`),
        ["--files-compress", relativeFixturePath],
      ),
      createStandaloneScenario(
        `standalone/files-compress-line-numbers/${fixtureName}`,
        path.posix.join("standalone", "files-compress-line-numbers", `${fixtureName}.json`),
        ["--files-compress", relativeFixturePath, "--enable-line-numbers"],
      ),
      createStandaloneScenario(
        `standalone/files-find/${fixtureName}`,
        path.posix.join("standalone", "files-find", `${fixtureName}.json`),
        ["--files-find", tagFilter, ".*", relativeFixturePath],
      ),
      createStandaloneScenario(
        `standalone/files-find-line-numbers/${fixtureName}`,
        path.posix.join("standalone", "files-find-line-numbers", `${fixtureName}.json`),
        ["--files-find", tagFilter, ".*", relativeFixturePath, "--enable-line-numbers"],
      ),
      createStandaloneScenario(
        `standalone/test-static-check-dummy/${fixtureName}`,
        path.posix.join("standalone", "test-static-check-dummy", `${fixtureName}.json`),
        ["--test-static-check", "dummy", relativeFixturePath],
      ),
      createStandaloneScenario(
        `standalone/test-static-check-command/${fixtureName}`,
        path.posix.join("standalone", "test-static-check-command", `${fixtureName}.json`),
        ["--test-static-check", "command", "false", relativeFixturePath],
      ),
    );
  }
  return scenarios;
}

/**
 * @brief Builds the shared project configuration used by failing static-check archive scenarios.
 * @details Configures Python command-based static checks to call `false`, yielding deterministic failing stdout/stderr blocks in both Python and TypeScript implementations. Runtime is O(1). No side effects occur.
 * @return {UseReqConfig["static-check"]} Static-check config payload.
 */
function getFailingStaticCheckConfig(): UseReqConfig["static-check"] {
  return {
    Python: createStaticCheckLanguageConfig([{ module: "Command", cmd: "false" }], "enable"),
  };
}

/**
 * @brief Builds all archive-backed repository scenarios.
 * @details Declares deterministic temporary-repository cases covering project-scoped commands, config-mutation commands, and git/worktree commands required by `REQ-043`. Runtime is O(1) until execution. No side effects occur until scenarios execute.
 * @return {AttendedScenario[]} Deterministically ordered repository scenarios.
 */
function buildProjectScenarios(): AttendedScenario[] {
  return [
    createProjectScenario("project/summarize", path.posix.join("project", "summarize.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--summarize"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/compress", path.posix.join("project", "compress.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--compress"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/compress-line-numbers", path.posix.join("project", "compress-line-numbers.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--compress", "--enable-line-numbers"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/find", path.posix.join("project", "find.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--find", [...LANGUAGE_TAGS.python].sort((left, right) => left.localeCompare(right)).join("|"), ".*"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/find-line-numbers", path.posix.join("project", "find-line-numbers.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--find", [...LANGUAGE_TAGS.python].sort((left, right) => left.localeCompare(right)).join("|"), ".*", "--enable-line-numbers"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/tokens", path.posix.join("project", "tokens.json"), () => {
      const { projectBase } = initFixtureRepo();
      return {
        args: ["--tokens"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    {
      id: "project/enable-static-check-valid",
      archiveRelativePath: path.posix.join("project", "enable-static-check-valid.json"),
      buildExecution: () => {
        const { projectBase } = initFixtureRepo({ fixtures: [] });
        fs.mkdirSync(path.join(projectBase, "docs"), { recursive: true });
        return {
          args: [
            "--base",
            projectBase,
            "--guidelines-dir",
            "guidelines",
            "--docs-dir",
            "docs",
            "--tests-dir",
            "tests",
            "--src-dir",
            "src",
            "--provider",
            "claude:prompts",
            "--enable-static-check",
            "Python=Command,git,--version",
          ],
          cwd: projectBase,
          normalize: createProjectNormalizer(projectBase),
          cleanup: () => removePath(projectBase),
          postAssert: () => {
            const payload = JSON.parse(fs.readFileSync(getProjectConfigPath(projectBase), "utf8")) as UseReqConfig;
            assert.deepEqual(payload["static-check"].Python, createStaticCheckLanguageConfig([
              { module: "Command", cmd: "git", params: ["--version"] },
            ], "enable"));
          },
        };
      },
      buildPythonResult: () => {
        const { projectBase } = initFixtureRepo({ fixtures: [] });
        fs.mkdirSync(path.join(projectBase, "docs"), { recursive: true });
        try {
          const script = [
            "from pathlib import Path",
            "import json",
            `project_base = Path(${JSON.stringify(projectBase)})`,
            "project_base.mkdir(parents=True, exist_ok=True)",
            "payload = {",
            "  'guidelines-dir': 'guidelines',",
            "  'docs-dir': 'docs',",
            "  'tests-dir': 'tests',",
            "  'src-dir': ['src'],",
            "  'static-check': {",
            "    'Python': {",
            "      'enabled': 'enable',",
            "      'checkers': [{'module': 'Command', 'cmd': 'git', 'params': ['--version']}],",
            "    },",
            "  },",
            "}",
            "config_dir = project_base / '.req'",
            "config_dir.mkdir(parents=True, exist_ok=True)",
            "(config_dir / 'config.json').write_text(json.dumps(payload, indent=2) + '\\n', encoding='utf8')",
          ].join("\n");
          const result = runPythonInline(script, projectBase);
          return createProjectNormalizer(projectBase)(toArchivedCliResult(result));
        } finally {
          removePath(projectBase);
        }
      },
    },
    createProjectScenario("project/enable-static-check-invalid-command", path.posix.join("project", "enable-static-check-invalid-command.json"), () => {
      const { projectBase } = initFixtureRepo({ fixtures: [] });
      fs.mkdirSync(path.join(projectBase, "docs"), { recursive: true });
      return {
        args: [
          "--base",
          projectBase,
          "--guidelines-dir",
          "guidelines",
          "--docs-dir",
          "docs",
          "--tests-dir",
          "tests",
          "--src-dir",
          "src",
          "--provider",
          "claude:prompts",
          "--enable-static-check",
          "C=Command,nonexistent_tool_xyz_12345",
        ],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/files-static-check", path.posix.join("project", "files-static-check.json"), () => {
      const { projectBase } = initFixtureRepo({ staticCheck: getFailingStaticCheckConfig() });
      return {
        args: ["--files-static-check", path.posix.join("src", "fixture_python.py")],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
    createProjectScenario("project/static-check", path.posix.join("project", "static-check.json"), () => {
      const { projectBase } = initFixtureRepo({ staticCheck: getFailingStaticCheckConfig() });
      return {
        args: ["--static-check"],
        cwd: projectBase,
        normalize: createProjectNormalizer(projectBase),
        cleanup: () => removePath(projectBase),
      };
    }),
  ];
}

/**
 * @brief Exposes the complete deterministic attended-result scenario catalog.
 * @details Concatenates standalone and project scenario families in fixed order so archive generation and verification remain byte-stable. Access complexity is O(1) after module evaluation.
 */
export const ATTENDED_SCENARIOS: AttendedScenario[] = [
  ...buildStandaloneScenarios(),
  ...buildProjectScenarios(),
];

/**
 * @brief Computes the absolute archive file path for one attended scenario.
 * @details Joins `ATTENDED_RESULTS_ROOT` with the scenario-relative archive path and normalizes separators. Runtime is O(1). No side effects occur.
 * @param[in] scenario {AttendedScenario} Target scenario descriptor.
 * @return {string} Absolute archive file path.
 */
export function getArchiveFilePath(scenario: AttendedScenario): string {
  return path.join(ATTENDED_RESULTS_ROOT, scenario.archiveRelativePath);
}

/**
 * @brief Serializes one archived CLI result as canonical JSON text.
 * @details Emits two-space-indented UTF-8 JSON terminated by a newline so committed fixtures remain human-readable and machine-parseable. Runtime is O(n) in payload size. No side effects occur.
 * @param[in] result {ArchivedCliResult} Normalized archived result.
 * @return {string} JSON fixture text.
 */
export function serializeArchivedCliResult(result: ArchivedCliResult): string {
  return `${JSON.stringify(result, null, 2)}\n`;
}

/**
 * @brief Parses one committed archived CLI result fixture.
 * @details Decodes the JSON payload and validates the presence of numeric `code` plus string `stdout` and `stderr` fields. Runtime is O(n) in fixture size. No side effects occur.
 * @param[in] text {string} JSON fixture text.
 * @return {ArchivedCliResult} Parsed archived result.
 */
export function parseArchivedCliResult(text: string): ArchivedCliResult {
  const payload = JSON.parse(text) as Partial<ArchivedCliResult>;
  assert.equal(typeof payload.code, "number", "Archived result is missing numeric code");
  assert.equal(typeof payload.stdout, "string", "Archived result is missing stdout");
  assert.equal(typeof payload.stderr, "string", "Archived result is missing stderr");
  return {
    code: payload.code,
    stdout: payload.stdout,
    stderr: payload.stderr,
  };
}

/**
 * @brief Loads one committed archived CLI result from disk.
 * @details Resolves the scenario archive path, reads the UTF-8 fixture, and delegates parsing to `parseArchivedCliResult`. Runtime is O(n) in fixture size. Side effects are limited to filesystem reads.
 * @param[in] scenario {AttendedScenario} Target scenario descriptor.
 * @return {ArchivedCliResult} Parsed archived result.
 */
export function loadArchivedCliResult(scenario: AttendedScenario): ArchivedCliResult {
  return parseArchivedCliResult(fs.readFileSync(getArchiveFilePath(scenario), "utf8"));
}

/**
 * @brief Persists one normalized archived CLI result to disk.
 * @details Creates parent directories lazily and writes canonical JSON text for the target scenario. Runtime is O(n) in payload size. Side effects include directory creation and file overwrite under `tests/fixtures_attended_results`.
 * @param[in] scenario {AttendedScenario} Target scenario descriptor.
 * @param[in] result {ArchivedCliResult} Normalized archived result.
 * @return {void} No return value.
 */
export function saveArchivedCliResult(scenario: AttendedScenario, result: ArchivedCliResult): void {
  const archivePath = getArchiveFilePath(scenario);
  fs.mkdirSync(path.dirname(archivePath), { recursive: true });
  fs.writeFileSync(archivePath, serializeArchivedCliResult(result), "utf8");
}

/**
 * @brief Executes one attended scenario with the Python CLI and returns its normalized result.
 * @details Builds the scenario execution context, runs the Python subprocess, applies optional side-effect assertions, normalizes the result, and always executes the cleanup callback. Runtime is dominated by subprocess execution and temporary filesystem setup. Side effects include temporary repository creation and cleanup.
 * @param[in] scenario {AttendedScenario} Target scenario descriptor.
 * @return {ArchivedCliResult} Normalized Python CLI result.
 */
export function runPythonAttendedScenario(scenario: AttendedScenario): ArchivedCliResult {
  if (scenario.buildPythonResult) {
    return scenario.buildPythonResult();
  }
  const execution = scenario.buildExecution();
  try {
    const result = runPythonCli(execution.args, execution.cwd, execution.envOverrides);
    return execution.normalize(toArchivedCliResult(result));
  } finally {
    execution.cleanup();
  }
}

/**
 * @brief Executes one attended scenario with the TypeScript CLI and returns its normalized result.
 * @details Builds the scenario execution context, runs the Node subprocess, applies optional side-effect assertions, normalizes the result, and always executes the cleanup callback. Runtime is dominated by subprocess execution and temporary filesystem setup. Side effects include temporary repository creation and cleanup.
 * @param[in] scenario {AttendedScenario} Target scenario descriptor.
 * @return {ArchivedCliResult} Normalized TypeScript CLI result.
 */
export function runNodeAttendedScenario(scenario: AttendedScenario): ArchivedCliResult {
  const execution = scenario.buildExecution();
  try {
    const result = runNodeCli(execution.args, execution.cwd, execution.envOverrides);
    execution.postAssert?.(result);
    return execution.normalize(toArchivedCliResult(result));
  } finally {
    execution.cleanup();
  }
}
