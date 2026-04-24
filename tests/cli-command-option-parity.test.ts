/**
 * @file
 * @brief Verifies imported CLI command-option regressions against the TypeScript implementation.
 * @details Maintains an executable mapping from imported source regression identifiers to TypeScript parity targets, executes oracle-backed and direct-behavior command scenarios, and inspects persisted config side effects for CLI-only static-check enablement. Runtime is dominated by subprocess execution, git operations, and temporary filesystem setup. Side effects are limited to temporary files, temporary git repositories, and child processes.
 */

import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  createStaticCheckLanguageConfig,
  DEFAULT_DOCS_DIR,
  getProjectConfigPath,
  type UseReqConfig,
} from "../src/core/config.js";
import { detectLanguage } from "../src/core/generate-markdown.js";
import { LANGUAGE_TAGS } from "../src/core/find-constructs.js";
import {
  createTempDir,
  getFixtureFiles,
  initFixtureRepo,
  readProjectConfigJson,
  runNodeCli,
  runPythonCli,
  saveFixtureConfigs,
  writeExecutableScript,
} from "./helpers.js";

const TAB_SENSITIVE_FIXTURE_NAME = "fixture_go.go";

/**
 * @brief Describes one executable TypeScript regression target.
 * @details Each target exposes a stable identifier plus a runner that performs the imported command-option assertions. The interface is compile-time only and introduces no runtime side effects.
 */
interface TargetParityCase {
  id: string;
  run: (t: TestContext) => Promise<void> | void;
}

/**
 * @brief Maps one imported source regression identifier to a TypeScript target identifier.
 * @details The mapping is curated to current TypeScript CLI scope so coverage verification can assert that every imported case has a maintained executable target. The interface is compile-time only and adds no runtime cost.
 */
interface ImportedCaseMapping {
  sourceId: string;
  targetId: string;
}

/**
 * @brief Compares one Node CLI invocation with the Python oracle.
 * @details Executes both CLIs with the same arguments, cwd, and optional environment overrides, then asserts identical exit status, stdout, and stderr payloads. Runtime is dominated by subprocess execution. Side effects are limited to child-process creation.
 * @param[in] args {string[]} CLI arguments forwarded to both implementations.
 * @param[in] cwd {string} Working directory for both subprocesses.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional shared environment overrides.
 * @return {void} No return value.
 */
function assertCliParity(args: string[], cwd: string, envOverrides?: NodeJS.ProcessEnv): void {
  const node = runNodeCli(args, cwd, envOverrides);
  const python = runPythonCli(args, cwd, envOverrides);
  assert.equal(node.status, python.status, `exit code mismatch for ${args.join(" ")}`);
  assert.equal(node.stdout, python.stdout, `stdout mismatch for ${args.join(" ")}`);
  assert.equal(node.stderr, python.stderr, `stderr mismatch for ${args.join(" ")}`);
}

/**
 * @brief Creates one temporary file and registers recursive cleanup on the active test context.
 * @details Allocates a unique directory under the system temp root, writes the requested file content, and schedules directory removal after the enclosing test completes. Runtime is O(n) in content size. Side effects include directory creation and file writes.
 * @param[in] t {test.TestContext} Active Node test context used for cleanup.
 * @param[in] fileName {string} File name to create inside the temporary directory.
 * @param[in] content {string} UTF-8 file payload.
 * @return {string} Absolute file path.
 */
function createScratchFile(t: TestContext, fileName: string, content: string): string {
  const tempDir = createTempDir("pi-usereq-cli-case-");
  t.after(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
  const filePath = path.join(tempDir, fileName);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

/**
 * @brief Creates a fixture git repository and registers cleanup on the active test context.
 * @details Delegates to `initFixtureRepo`, then removes the temporary repository after the enclosing test completes. Runtime is dominated by git initialization and fixture copying. Side effects include temporary repository creation and git subprocess execution.
 * @param[in] t {test.TestContext} Active Node test context used for cleanup.
 * @param[in] options {Parameters<typeof initFixtureRepo>[0]} Repository initialization options.
 * @return {{ projectBase: string; config: UseReqConfig }} Fixture project descriptor.
 */
function createFixtureRepo(
  t: TestContext,
  options: Parameters<typeof initFixtureRepo>[0] = {},
): { projectBase: string; config: UseReqConfig } {
  const repo = initFixtureRepo(options);
  t.after(() => {
    fs.rmSync(repo.projectBase, { recursive: true, force: true });
  });
  return repo;
}

/**
 * @brief Resolves the broadest tag filter supported by one fixture file.
 * @details Detects the file language, loads the language-specific supported tag set, and returns a stable pipe-delimited filter string for `--files-find`. Runtime is O(k) in tag count. No side effects occur.
 * @param[in] filePath {string} Fixture file path.
 * @return {string} Pipe-delimited tag filter.
 */
function getFixtureTagFilter(filePath: string): string {
  const language = detectLanguage(filePath);
  assert.ok(language, `unsupported fixture language for ${filePath}`);
  const tags = [...(LANGUAGE_TAGS[language!] ?? [])].sort();
  assert.ok(tags.length > 0, `missing LANGUAGE_TAGS entry for ${language}`);
  return tags.join("|");
}

/**
 * @brief Returns the persisted per-language static-check config for one language.
 * @details Reads the raw project config JSON so tests can assert entry order, duplicate suppression, enable-flag persistence, and metadata preservation exactly as written. Runtime is O(n) in config file size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] language {string} Canonical language key.
 * @return {Record<string, unknown> | undefined} Persisted language config object when present.
 */
function getStaticCheckLanguageConfig(projectBase: string, language: string): Record<string, unknown> | undefined {
  const payload = readProjectConfigJson(projectBase);
  const staticCheck = (payload["static-check"] ?? {}) as Record<string, Record<string, unknown>>;
  return staticCheck[language];
}

/**
 * @brief Returns the persisted static-check entries for one language.
 * @details Reads the raw project config JSON and extracts the `checkers` array so tests can assert entry order and duplicate suppression exactly as written. Runtime is O(n) in config file size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] language {string} Canonical language key.
 * @return {Array<Record<string, unknown>>} Persisted checker-entry array or an empty array.
 */
function getStaticCheckEntries(projectBase: string, language: string): Array<Record<string, unknown>> {
  const languageConfig = getStaticCheckLanguageConfig(projectBase, language);
  return Array.isArray(languageConfig?.checkers)
    ? languageConfig.checkers as Array<Record<string, unknown>>
    : [];
}

/**
 * @brief Creates a command-logging shell script for static-check integration tests.
 * @details Writes an executable script that appends one tagged invocation record per run into the provided log file. Runtime is O(n) in script size. Side effects include file writes and permission changes.
 * @param[in] projectBase {string} Fixture project root containing the helper script.
 * @param[in] scriptName {string} Script file name.
 * @param[in] tag {string} Stable prefix emitted into the log file.
 * @param[in] logPath {string} Absolute log-file destination.
 * @return {string} Absolute script path.
 */
function createLoggingScript(projectBase: string, scriptName: string, tag: string, logPath: string): string {
  const escapedLogPath = logPath.replace(/'/g, "'\\''");
  const escapedTag = tag.replace(/'/g, "'\\''");
  return writeExecutableScript(
    path.join(projectBase, "bin", scriptName),
    `#!/usr/bin/env bash
set -eu
printf '%s|%s\n' '${escapedTag}' "$*" >> '${escapedLogPath}'
`,
  );
}

/**
 * @brief Lists the imported direct-CLI regression mappings maintained by this suite.
 * @details Each mapping identifies one imported source regression and the TypeScript target that executes its analogous behavior. The array is treated as normative test metadata for TST-014. Access complexity is O(1).
 */
const IMPORTED_CASE_MAPPINGS: ImportedCaseMapping[] = [
  { sourceId: "test_files_commands.py::TestFilesTokensCommand::test_files_tokens_basic", targetId: "oracle::standalone::files-tokens-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesTokensCommand::test_files_tokens_no_base_required", targetId: "oracle::standalone::files-tokens-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesTokensCommand::test_files_tokens_skip_missing", targetId: "oracle::standalone::files-tokens-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesTokensCommand::test_files_tokens_all_missing_errors", targetId: "oracle::standalone::files-tokens-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesReferencesCommand::test_files_references_basic", targetId: "direct::files-references-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesReferencesCommand::test_files_references_no_base_required", targetId: "direct::files-references-explicit-files" },
  { sourceId: "test_files_commands.py::TestFilesReferencesCommand::test_files_references_verbose_outputs_progress", targetId: "direct::files-references-verbose" },
  { sourceId: "test_files_commands.py::TestFilesCompressCommand::test_files_compress_basic", targetId: "oracle::standalone::files-compress-line-number-modes" },
  { sourceId: "test_files_commands.py::TestFilesCompressCommand::test_files_compress_no_base_required", targetId: "oracle::standalone::files-compress-line-number-modes" },
  { sourceId: "test_files_commands.py::TestFilesCompressCommand::test_files_compress_no_line_numbers_by_default", targetId: "oracle::standalone::files-compress-line-number-modes" },
  { sourceId: "test_files_commands.py::TestFilesCompressCommand::test_files_compress_enable_line_numbers", targetId: "oracle::standalone::files-compress-line-number-modes" },
  { sourceId: "test_files_commands.py::TestFilesCompressCommand::test_files_compress_verbose_outputs_progress", targetId: "oracle::standalone::files-compress-verbose" },
  { sourceId: "test_files_commands.py::TestReferencesCommand::test_rejects_base", targetId: "direct::references-modes" },
  { sourceId: "test_files_commands.py::TestReferencesCommand::test_references_with_here", targetId: "direct::references-modes" },
  { sourceId: "test_files_commands.py::TestReferencesCommand::test_references_prepends_files_structure", targetId: "direct::references-modes" },
  { sourceId: "test_files_commands.py::TestReferencesCommand::test_references_from_config", targetId: "direct::references-modes" },
  { sourceId: "test_files_commands.py::TestCompressCommand::test_rejects_base", targetId: "oracle::project::compress-modes" },
  { sourceId: "test_files_commands.py::TestCompressCommand::test_compress_with_here", targetId: "oracle::project::compress-modes" },
  { sourceId: "test_files_commands.py::TestCompressCommand::test_compress_no_line_numbers_by_default", targetId: "oracle::project::compress-modes" },
  { sourceId: "test_files_commands.py::TestCompressCommand::test_compress_enable_line_numbers", targetId: "oracle::project::compress-modes" },
  { sourceId: "test_files_commands.py::TestTokensCommand::test_tokens_rejects_base", targetId: "oracle::project::tokens-doc-selection" },
  { sourceId: "test_files_commands.py::TestTokensCommand::test_tokens_implies_here_and_uses_config_docs_dir", targetId: "oracle::project::tokens-doc-selection" },
  { sourceId: "test_files_commands.py::TestTokensCommand::test_tokens_counts_docs_files", targetId: "oracle::project::tokens-doc-selection" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_files_find_default_suppresses_progress", targetId: "oracle::standalone::files-find-modes" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_files_find_verbose_outputs_progress", targetId: "oracle::standalone::files-find-modes" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_files_find_enable_line_numbers", targetId: "oracle::standalone::files-find-modes" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_find_verbose_outputs_progress", targetId: "oracle::project::find-modes" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_find_enable_line_numbers", targetId: "oracle::project::find-modes" },
  { sourceId: "test_files_commands.py::TestFindCommandVerbose::test_find_rejects_base", targetId: "oracle::project::find-modes" },
  { sourceId: "test_static_check.py::TestCLIIntegrationStaticCheck::test_main_dispatches_dummy", targetId: "oracle::standalone::test-static-check-dispatch" },
  { sourceId: "test_static_check.py::TestCLIIntegrationStaticCheck::test_main_dispatches_unknown_subcommand", targetId: "oracle::standalone::test-static-check-dispatch" },
  { sourceId: "test_static_check.py::TestCLIIntegrationStaticCheck::test_main_static_check_is_standalone", targetId: "oracle::standalone::test-static-check-dispatch" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_dummy_language", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_unknown_extension_skipped", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_lang_not_in_config_skipped", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_fail_propagates_exit_code", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_multiple_files_mixed", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_runs_all_entries_for_language_in_order", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestFilesStaticCheckCLI::test_files_static_check_command_invokes_params_before_filename", targetId: "direct::files-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_dummy_on_project_files", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_skips_unconfigured_language", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_fail_propagates_exit_code", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_no_source_files_raises", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_rejects_base", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_uses_cwd_as_project_base_with_here", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_runs_all_entries_for_language_in_order", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_command_invokes_params_before_filename", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_includes_tests_dir_files", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_ignores_tests_fixtures_subtree", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestStaticCheckProjectScan::test_static_check_tests_dir_only", targetId: "direct::project-static-check-matrix" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckExecutableValidation::test_non_update_command_requires_executable_before_config_write", targetId: "direct::enable-static-check-invalid-command" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_saved_to_config_json", targetId: "direct::enable-static-check-persistence" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_command_saves_cmd_and_params", targetId: "direct::enable-static-check-persistence" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_multiple_langs", targetId: "direct::enable-static-check-persistence" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_preserves_multiple_entries_same_lang", targetId: "direct::enable-static-check-persistence" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_deduplicates_identical_entries_same_invocation", targetId: "direct::enable-static-check-deduplication" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_preserves_different_params_same_module", targetId: "direct::enable-static-check-deduplication" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_update_does_not_duplicate_existing_identical_entry", targetId: "direct::enable-static-check-merge" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_update_preserves_existing_tools_when_adding_new", targetId: "direct::enable-static-check-merge" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_update_adds_same_module_different_params", targetId: "direct::enable-static-check-merge" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_enable_static_check_update_ignores_non_identity_fields_for_duplicate_check", targetId: "direct::enable-static-check-merge" },
  { sourceId: "test_static_check.py::TestEnableStaticCheckConfigPersistence::test_non_update_enable_static_check_preserves_existing_entries", targetId: "direct::enable-static-check-merge" },
];

/**
 * @brief Lists the executable TypeScript regression targets maintained by this suite.
 * @details Each target runs one or more command-option scenarios that collectively cover the imported mappings above. The array is executed by the Node test runner through nested subtests. Access complexity is O(1).
 */
const TARGET_CASES: TargetParityCase[] = [
  {
    id: "oracle::standalone::files-tokens-explicit-files",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "def hello():\n    return 'world'\n");
      const missingOne = path.join(path.dirname(filePath), "missing-one.py");
      const missingTwo = path.join(path.dirname(filePath), "missing-two.py");
      const basic = runNodeCli(["--files-tokens", filePath], path.dirname(filePath));
      assert.equal(basic.status, 0, basic.stderr);
      assert.match(basic.stdout, /Pack Summary/);
      assert.match(basic.stdout, /tokens/);
      const mixed = runNodeCli(["--files-tokens", missingOne, filePath], path.dirname(filePath));
      assert.equal(mixed.status, 0, mixed.stderr);
      assert.match(mixed.stderr, /Warning/);
      const missing = runNodeCli(["--files-tokens", missingOne, missingTwo], path.dirname(filePath));
      assert.notEqual(missing.status, 0);
    },
  },
  {
    id: "direct::files-references-explicit-files",
    run(t) {
      const filePath = createScratchFile(
        t,
        "sample.ts",
        "/**\n * @file\n * @brief Sample file.\n */\n\n/**\n * @brief Build sample value.\n * @param[in] input {string} Caller text.\n * @return {string} Upper-cased text.\n */\nexport function buildSample(input: string): string {\n  return input.toUpperCase();\n}\n",
      );
      const cwd = path.dirname(filePath);
      const node = runNodeCli(["--files-references", filePath], cwd);
      const python = runPythonCli(["--files-references", filePath], cwd);
      assert.equal(node.status, python.status);
      assert.equal(node.stdout, python.stdout);
      assert.equal(node.stderr, python.stderr);
      assert.match(node.stdout, /# sample\.ts \| TypeScript/);
      assert.match(node.stdout, /## Definitions/);
      assert.match(node.stdout, /### fn `export function buildSample\(input: string\): string`/);
    },
  },
  {
    id: "direct::files-references-verbose",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "value = 1\n");
      const cwd = path.dirname(filePath);
      const node = runNodeCli(["--verbose", "--files-references", filePath], cwd);
      const python = runPythonCli(["--verbose", "--files-references", filePath], cwd);
      assert.equal(node.status, python.status);
      assert.equal(node.stdout, python.stdout);
      assert.equal(node.stderr, python.stderr);
      assert.match(node.stderr, /OK/);
    },
  },
  {
    id: "oracle::standalone::files-compress-line-number-modes",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "# comment\nvalue = 1\n");
      const cwd = path.dirname(filePath);
      assertCliParity(["--files-compress", filePath], cwd);
      assertCliParity(["--files-compress", filePath, "--enable-line-numbers"], cwd);
    },
  },
  {
    id: "oracle::standalone::files-compress-verbose",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "value = 1\n");
      assertCliParity(["--verbose", "--files-compress", filePath], path.dirname(filePath));
    },
  },
  {
    id: "direct::references-modes",
    run(t) {
      const { projectBase } = createFixtureRepo(t, { fixtures: [] });
      fs.writeFileSync(path.join(projectBase, "src", "alpha.ts"), "export const ALPHA = 1;\n", "utf8");
      fs.mkdirSync(path.join(projectBase, "src", "nested"), { recursive: true });
      fs.writeFileSync(path.join(projectBase, "src", "nested", "beta.ts"), "export function beta(): number {\n  return 2;\n}\n", "utf8");

      const directNode = runNodeCli(["--references"], projectBase);
      const directPython = runPythonCli(["--references"], projectBase);
      assert.equal(directNode.status, directPython.status);
      assert.equal(directNode.stdout, directPython.stdout);
      assert.equal(directNode.stderr, directPython.stderr);
      assert.match(directNode.stdout, /# Files Structure/);
      assert.match(directNode.stdout, /src\/nested\/beta\.ts/);
      assert.match(directNode.stdout, /# beta\.ts \| TypeScript/);

      const hereNode = runNodeCli(["--here", "--references"], projectBase);
      const herePython = runPythonCli(["--here", "--references"], projectBase);
      assert.equal(hereNode.status, herePython.status);
      assert.equal(hereNode.stdout, herePython.stdout);
      assert.equal(hereNode.stderr, herePython.stderr);

      const baseRejected = runNodeCli(["--base", projectBase, "--references"], projectBase);
      assert.notEqual(baseRejected.status, 0);
      assert.match(baseRejected.stderr, /do not allow --base/);
    },
  },
  {
    id: "oracle::project::compress-modes",
    run(t) {
      const fixtures = getFixtureFiles().filter((fixture) => path.basename(fixture) !== TAB_SENSITIVE_FIXTURE_NAME);
      const { projectBase } = createFixtureRepo(t, { fixtures });
      assertCliParity(["--compress"], projectBase);
      assertCliParity(["--here", "--compress"], projectBase);
      assertCliParity(["--compress", "--enable-line-numbers"], projectBase);
      const rejected = runNodeCli(["--base", projectBase, "--compress"], projectBase);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /do not allow --base/);
    },
  },
  {
    id: "oracle::project::tokens-doc-selection",
    run(t) {
      const { projectBase, config } = createFixtureRepo(t, {
        fixtures: [],
        docs: {
          "REQUIREMENTS.md": "# Requirements\n",
          "WORKFLOW.md": "# Workflow\n",
          "REFERENCES.md": "# References\n",
        },
      });
      fs.mkdirSync(path.join(projectBase, "docs"), { recursive: true });
      fs.writeFileSync(path.join(projectBase, "docs", "REQUIREMENTS.md"), "# Alt Requirements\n", "utf8");
      fs.writeFileSync(path.join(projectBase, "docs", "WORKFLOW.md"), "# Alt Workflow\n", "utf8");
      fs.writeFileSync(path.join(projectBase, "docs", "REFERENCES.md"), "# Alt References\n", "utf8");
      fs.writeFileSync(path.join(projectBase, "docs", "IGNORED.md"), "# Ignored\n", "utf8");
      const updatedConfig: UseReqConfig = { ...config, "docs-dir": "docs" };
      saveFixtureConfigs(projectBase, updatedConfig);
      assertCliParity(["--tokens"], projectBase);
      const rejected = runNodeCli(["--base", projectBase, "--tokens"], projectBase);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /do not allow --base/);
    },
  },
  {
    id: "oracle::standalone::files-find-modes",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "def foo():\n    return 1\n");
      const cwd = path.dirname(filePath);
      const basic = runNodeCli(["--files-find", "FUNCTION", "foo", filePath], cwd);
      assert.equal(basic.status, 0, basic.stderr);
      assert.equal(basic.stderr, "");
      assert.match(basic.stdout, /### FUNCTION: `foo`/);
      const verbose = runNodeCli(["--verbose", "--files-find", "FUNCTION", "foo", filePath], cwd);
      assert.equal(verbose.status, 0, verbose.stderr);
      assert.match(verbose.stderr, /Found:/);
      const numbered = runNodeCli(["--files-find", "FUNCTION", "foo", filePath, "--enable-line-numbers"], cwd);
      assert.equal(numbered.status, 0, numbered.stderr);
      assert.match(numbered.stdout, /1: def foo\(\):/);
    },
  },
  {
    id: "oracle::project::find-modes",
    run(t) {
      const { projectBase } = createFixtureRepo(t, { fixtures: [] });
      fs.writeFileSync(path.join(projectBase, "src", "find_target.py"), "def foo():\n    return 1\n", "utf8");
      const basic = runNodeCli(["--find", "FUNCTION", "foo"], projectBase);
      assert.equal(basic.status, 0, basic.stderr);
      assert.match(basic.stdout, /### FUNCTION: `foo`/);
      const verbose = runNodeCli(["--verbose", "--find", "FUNCTION", "foo"], projectBase);
      assert.equal(verbose.status, 0, verbose.stderr);
      assert.match(verbose.stderr, /Found:/);
      const numbered = runNodeCli(["--find", "FUNCTION", "foo", "--enable-line-numbers"], projectBase);
      assert.equal(numbered.status, 0, numbered.stderr);
      assert.match(numbered.stdout, /1: def foo\(\):/);
      const rejected = runNodeCli(["--base", projectBase, "--find", "FUNCTION", "foo"], projectBase);
      assert.notEqual(rejected.status, 0);
    },
  },
  {
    id: "oracle::standalone::test-static-check-dispatch",
    run(t) {
      const filePath = createScratchFile(t, "sample.py", "value = 1\n");
      const cwd = path.dirname(filePath);
      const dummy = runNodeCli(["--test-static-check", "dummy", filePath], cwd);
      assert.equal(dummy.status, 0, dummy.stderr);
      const bad = runNodeCli(["--test-static-check", "badcmd"], cwd);
      assert.notEqual(bad.status, 0);
      assert.match(bad.stderr, /unknown --test-static-check subcommand/i);
    },
  },
  {
    id: "direct::files-static-check-matrix",
    run(t) {
      const { projectBase, config } = createFixtureRepo(t, { fixtures: [] });
      const logPath = path.join(projectBase, "files-static-check.log");
      const firstScript = createLoggingScript(projectBase, "check-first.sh", "first", logPath);
      const secondScript = createLoggingScript(projectBase, "check-second.sh", "second", logPath);
      const jsFile = path.join(projectBase, "src", "sample.js");
      fs.writeFileSync(jsFile, "const value = 1;\n", "utf8");
      const updatedConfig: UseReqConfig = {
        ...config,
        "static-check": {
          JavaScript: createStaticCheckLanguageConfig([
            { module: "Command", cmd: firstScript },
            { module: "Command", cmd: secondScript, params: ["--check"] },
          ], "enable"),
          Python: createStaticCheckLanguageConfig([{ module: "Dummy" }], "enable"),
        },
      };
      saveFixtureConfigs(projectBase, updatedConfig);

      const success = runNodeCli(["--files-static-check", jsFile], projectBase);
      assert.equal(success.status, 0, success.stderr);
      const logLines = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/);
      assert.deepEqual(logLines, [
        `first|${path.resolve(jsFile)}`,
        `second|--check ${path.resolve(jsFile)}`,
      ]);

      fs.truncateSync(logPath, 0);
      saveFixtureConfigs(projectBase, {
        ...updatedConfig,
        "static-check": {
          JavaScript: createStaticCheckLanguageConfig([
            { module: "Command", cmd: firstScript },
            { module: "Command", cmd: secondScript, params: ["--check"] },
          ], "disable"),
        },
      });
      const disabled = runNodeCli(["--files-static-check", jsFile], projectBase);
      assert.equal(disabled.status, 0, disabled.stderr);
      assert.equal(disabled.stdout, "");
      assert.equal(fs.readFileSync(logPath, "utf8"), "");

      const unknownExtension = path.join(projectBase, "src", "ignored.txt");
      fs.writeFileSync(unknownExtension, "ignored\n", "utf8");
      const skipped = runNodeCli(["--files-static-check", unknownExtension], projectBase);
      assert.equal(skipped.status, 0, skipped.stderr);
      assert.equal(skipped.stdout, "");

      const unconfiguredLanguage = path.join(projectBase, "src", "program.c");
      fs.writeFileSync(unconfiguredLanguage, "int main(void){return 0;}\n", "utf8");
      const notConfigured = runNodeCli(["--files-static-check", unconfiguredLanguage], projectBase);
      assert.equal(notConfigured.status, 0, notConfigured.stderr);
      assert.equal(notConfigured.stdout, "");

      const failingScript = writeExecutableScript(
        path.join(projectBase, "bin", "check-fail.sh"),
        "#!/usr/bin/env bash\nset -eu\nprintf '%s\n' 'failing evidence'\nexit 1\n",
      );
      saveFixtureConfigs(projectBase, {
        ...updatedConfig,
        "static-check": {
          JavaScript: createStaticCheckLanguageConfig([
            { module: "Command", cmd: failingScript },
          ], "enable"),
        },
      });
      const failing = runNodeCli(["--files-static-check", jsFile], projectBase);
      assert.equal(failing.status, 1);
      assert.match(failing.stdout, /failing evidence/);
    },
  },
  {
    id: "direct::project-static-check-matrix",
    run(t) {
      const { projectBase, config } = createFixtureRepo(t, { fixtures: [] });
      const logPath = path.join(projectBase, "project-static-check.log");
      const logScript = createLoggingScript(projectBase, "collect.sh", "collect", logPath);
      fs.mkdirSync(path.join(projectBase, "tests", "fixtures"), { recursive: true });
      const srcFile = path.join(projectBase, "src", "main.py");
      const testFile = path.join(projectBase, "tests", "test_main.py");
      const fixtureFile = path.join(projectBase, "tests", "fixtures", "fixture_c.c");
      fs.writeFileSync(srcFile, "print('src')\n", "utf8");
      fs.writeFileSync(testFile, "print('test')\n", "utf8");
      fs.writeFileSync(fixtureFile, "int main(void){return 0;}\n", "utf8");
      saveFixtureConfigs(projectBase, {
        ...config,
        "static-check": {
          Python: createStaticCheckLanguageConfig([
            { module: "Command", cmd: logScript },
          ], "enable"),
          C: createStaticCheckLanguageConfig([
            { module: "Command", cmd: logScript },
          ], "enable"),
        },
      });

      const success = runNodeCli(["--static-check"], projectBase);
      assert.equal(success.status, 0, success.stderr);
      const dispatched = fs.readFileSync(logPath, "utf8").trim().split(/\r?\n/);
      assert.ok(dispatched.some((line) => line.endsWith(`|${path.resolve(srcFile)}`)));
      assert.ok(dispatched.some((line) => line.endsWith(`|${path.resolve(testFile)}`)));
      assert.ok(!dispatched.some((line) => line.endsWith(`|${path.resolve(fixtureFile)}`)));

      fs.truncateSync(logPath, 0);
      saveFixtureConfigs(projectBase, {
        ...config,
        "static-check": {
          Python: createStaticCheckLanguageConfig([{ module: "Dummy" }], "enable"),
        },
      });
      const skipped = runNodeCli(["--static-check"], projectBase);
      assert.equal(skipped.status, 0, skipped.stderr);
      assert.equal(skipped.stdout, "");

      const baseRejected = runNodeCli(["--base", projectBase, "--static-check"], projectBase);
      assert.notEqual(baseRejected.status, 0);

      fs.truncateSync(logPath, 0);
      const orderedLogPath = path.join(projectBase, "project-static-check-ordered.log");
      const firstOrderedScript = createLoggingScript(projectBase, "ordered-first.sh", "first", orderedLogPath);
      const secondOrderedScript = createLoggingScript(projectBase, "ordered-second.sh", "second", orderedLogPath);
      saveFixtureConfigs(projectBase, {
        ...config,
        "static-check": {
          Python: createStaticCheckLanguageConfig([
            { module: "Command", cmd: firstOrderedScript },
            { module: "Command", cmd: secondOrderedScript, params: ["--check"] },
          ], "enable"),
        },
      });
      const ordered = runNodeCli(["--static-check"], projectBase);
      assert.equal(ordered.status, 0, ordered.stderr);
      const orderedLines = fs.readFileSync(orderedLogPath, "utf8").trim().split(/\r?\n/);
      assert.deepEqual(orderedLines, [
        `first|${path.resolve(srcFile)}`,
        `second|--check ${path.resolve(srcFile)}`,
        `first|${path.resolve(testFile)}`,
        `second|--check ${path.resolve(testFile)}`,
      ]);

      const failingScript = writeExecutableScript(
        path.join(projectBase, "bin", "collect-fail.sh"),
        "#!/usr/bin/env bash\nset -eu\nprintf '%s\n' 'failing evidence'\nexit 1\n",
      );
      saveFixtureConfigs(projectBase, {
        ...config,
        "static-check": {
          Python: createStaticCheckLanguageConfig([
            { module: "Command", cmd: failingScript },
          ], "enable"),
        },
      });
      const failing = runNodeCli(["--static-check"], projectBase);
      assert.equal(failing.status, 1);
      assert.match(failing.stdout, /failing evidence/);

      const emptyRepo = createFixtureRepo(t, { fixtures: [] });
      fs.writeFileSync(path.join(emptyRepo.projectBase, "src", "README.txt"), "not source\n", "utf8");
      saveFixtureConfigs(emptyRepo.projectBase, {
        ...emptyRepo.config,
        "static-check": {
          Python: createStaticCheckLanguageConfig([{ module: "Dummy" }], "enable"),
        },
      });
      const noSource = runNodeCli(["--static-check"], emptyRepo.projectBase);
      assert.equal(noSource.status, 1);
      assert.match(noSource.stderr, /no source files found/i);
    },
  },
  {
    id: "direct::enable-static-check-invalid-command",
    run(t) {
      const projectBase = createTempDir("pi-usereq-enable-static-check-invalid-");
      t.after(() => {
        fs.rmSync(projectBase, { recursive: true, force: true });
      });
      fs.mkdirSync(path.join(projectBase, "src"), { recursive: true });
      fs.mkdirSync(path.join(projectBase, "tests"), { recursive: true });
      fs.mkdirSync(path.join(projectBase, ...DEFAULT_DOCS_DIR.split("/")), { recursive: true });
      const result = runNodeCli(
        ["--base", projectBase, "--enable-static-check", "C=Command,nonexistent_tool_xyz_12345"],
        projectBase,
      );
      assert.equal(result.status, 1);
      assert.match(result.stderr, /not an executable program/);
      assert.ok(!fs.existsSync(getProjectConfigPath(projectBase)));

      const removedModule = runNodeCli(
        ["--base", projectBase, "--enable-static-check", "Python=Ruff"],
        projectBase,
      );
      assert.equal(removedModule.status, 1);
      assert.match(removedModule.stderr, /unknown module/i);
      assert.ok(!fs.existsSync(getProjectConfigPath(projectBase)));
    },
  },
  {
    id: "direct::enable-static-check-persistence",
    run(t) {
      const { projectBase } = createFixtureRepo(t, { fixtures: [] });
      const persisted = runNodeCli(
        [
          "--base",
          projectBase,
          "--enable-static-check",
          "Python=Command,git,--version",
          "--enable-static-check",
          "C=Command,git,--version",
          "--enable-static-check",
          "Python=Command,git,--help",
        ],
        projectBase,
      );
      assert.equal(persisted.status, 0, persisted.stderr);
      assert.equal(getStaticCheckLanguageConfig(projectBase, "Python")?.enabled, "enable");
      assert.equal(getStaticCheckLanguageConfig(projectBase, "C")?.enabled, "enable");
      assert.deepEqual(getStaticCheckEntries(projectBase, "Python"), [
        { module: "Command", cmd: "git", params: ["--version"] },
        { module: "Command", cmd: "git", params: ["--help"] },
      ]);
      assert.deepEqual(getStaticCheckEntries(projectBase, "C"), [{ module: "Command", cmd: "git", params: ["--version"] }]);
    },
  },
  {
    id: "direct::enable-static-check-deduplication",
    run(t) {
      const { projectBase } = createFixtureRepo(t, { fixtures: [] });
      const result = runNodeCli(
        [
          "--base",
          projectBase,
          "--enable-static-check",
          "Python=Command,git,--version",
          "--enable-static-check",
          "Python=Command,git,--version",
          "--enable-static-check",
          "C=Command,git,--version",
          "--enable-static-check",
          "C=Command,git,--help",
        ],
        projectBase,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(getStaticCheckLanguageConfig(projectBase, "Python")?.enabled, "enable");
      assert.equal(getStaticCheckLanguageConfig(projectBase, "C")?.enabled, "enable");
      assert.deepEqual(getStaticCheckEntries(projectBase, "Python"), [{ module: "Command", cmd: "git", params: ["--version"] }]);
      assert.deepEqual(getStaticCheckEntries(projectBase, "C"), [
        { module: "Command", cmd: "git", params: ["--version"] },
        { module: "Command", cmd: "git", params: ["--help"] },
      ]);
    },
  },
  {
    id: "direct::enable-static-check-merge",
    run(t) {
      const { projectBase, config } = createFixtureRepo(t, { fixtures: [] });
      const preloaded = {
        ...config,
        "static-check": {
          Python: {
            enabled: "enable",
            checkers: [{ module: "Dummy", meta: "debug-note" }],
          } as unknown as UseReqConfig["static-check"][string],
          JavaScript: createStaticCheckLanguageConfig([
            { module: "Command", cmd: "git", params: ["--version"] },
          ], "enable"),
        } as unknown as UseReqConfig["static-check"],
      } as UseReqConfig;
      saveFixtureConfigs(projectBase, preloaded);
      const result = runNodeCli(
        [
          "--base",
          projectBase,
          "--enable-static-check",
          "Python=Command,git,--version",
          "--enable-static-check",
          "JavaScript=Command,git,--help",
        ],
        projectBase,
      );
      assert.equal(result.status, 0, result.stderr);
      assert.equal(getStaticCheckLanguageConfig(projectBase, "Python")?.enabled, "enable");
      assert.equal(getStaticCheckLanguageConfig(projectBase, "JavaScript")?.enabled, "enable");
      assert.deepEqual(getStaticCheckEntries(projectBase, "Python"), [
        { module: "Dummy" },
        { module: "Command", cmd: "git", params: ["--version"] },
      ]);
      assert.deepEqual(getStaticCheckEntries(projectBase, "JavaScript"), [
        { module: "Command", cmd: "git", params: ["--version"] },
        { module: "Command", cmd: "git", params: ["--help"] },
      ]);
    },
  },
  {
    id: "direct::fixtures::files-references-fixture-shape",
    async run(t) {
      for (const fixture of getFixtureFiles()) {
        if (path.basename(fixture) === TAB_SENSITIVE_FIXTURE_NAME) {
          continue;
        }
        await t.test(path.basename(fixture), () => {
          const cwd = path.dirname(fixture);
          const node = runNodeCli(["--files-references", fixture], cwd);
          const python = runPythonCli(["--files-references", fixture], cwd);
          assert.equal(node.status, python.status);
          assert.equal(node.stdout, python.stdout);
          assert.equal(node.stderr, python.stderr);
          assert.match(node.stdout, new RegExp(`# ${path.basename(fixture).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} \\|`));
          assert.match(node.stdout, /## Symbol Index/);
        });
      }
    },
  },
  {
    id: "oracle::fixtures::files-find-fixture-parity",
    async run(t) {
      for (const fixture of getFixtureFiles()) {
        if (path.basename(fixture) === TAB_SENSITIVE_FIXTURE_NAME) {
          continue;
        }
        await t.test(path.basename(fixture), () => {
          assertCliParity(["--files-find", getFixtureTagFilter(fixture), ".*", fixture], path.dirname(fixture));
        });
      }
    },
  },
  {
    id: "direct::fixtures::go-tab-preservation",
    run() {
      const fixture = getFixtureFiles().find((candidate) => path.basename(candidate) === TAB_SENSITIVE_FIXTURE_NAME);
      assert.ok(fixture, `missing ${TAB_SENSITIVE_FIXTURE_NAME}`);
      const cwd = path.dirname(fixture);

      const references = runNodeCli(["--files-references", fixture], cwd);
      assert.equal(references.status, 0, references.stderr);
      assert.match(references.stdout, /\tvar wg sync\.WaitGroup/);

      const compress = runNodeCli(["--files-compress", fixture, "--enable-line-numbers"], cwd);
      assert.equal(compress.status, 0, compress.stderr);
      assert.match(compress.stdout, /\d+: \t"context"/);

      const find = runNodeCli(["--files-find", "METHOD|FUNCTION", "^Start$", fixture, "--enable-line-numbers"], cwd);
      assert.equal(find.status, 0, find.stderr);
      assert.match(find.stdout, /\d+: \ts\.Lock\(\)/);
    },
  },
];

test("imported CLI regression mappings resolve to executable TypeScript targets", () => {
  const implementedTargetIds = new Set(TARGET_CASES.map((target) => target.id));
  assert.ok(IMPORTED_CASE_MAPPINGS.length > 0, "expected imported CLI regression mappings");
  for (const mapping of IMPORTED_CASE_MAPPINGS) {
    assert.ok(implementedTargetIds.has(mapping.targetId), `missing target ${mapping.targetId} for ${mapping.sourceId}`);
  }
});

test("imported CLI option parity targets execute successfully", async (t) => {
  for (const target of TARGET_CASES) {
    await t.test(target.id, async (subtest) => {
      await target.run(subtest);
    });
  }
});
