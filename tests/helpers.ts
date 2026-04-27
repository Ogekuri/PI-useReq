import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import {
  DEFAULT_DOCS_DIR,
  getDefaultConfig,
  getGlobalConfigPath,
  getProjectConfigPath,
  saveConfig,
  saveGlobalConfig,
  type StaticCheckLanguageConfig,
  type UseReqConfig,
} from "../src/core/config.js";
import { normalizeEnabledPiUsereqTools } from "../src/core/pi-usereq-tools.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_ROOT = fs.existsSync(path.join(ROOT, "node_modules"))
  ? ROOT
  : path.join(ROOT, "..", "PI-useReq");
const TSX_LOADER = require.resolve("tsx", { paths: [TSX_ROOT] });
const ORACLE_VENV_PYTHON = path.join(ROOT, ".venv-oracle", "bin", "python");
const PYTHON = fs.existsSync(ORACLE_VENV_PYTHON) ? ORACLE_VENV_PYTHON : "python3";
const ORACLE_PYTHONPATH_ROOT = fs.existsSync(path.join(ROOT, "temp", "usereq"))
  ? path.join(ROOT, "temp")
  : path.join(ROOT, "..", "PI-useReq", "temp");
const ORACLE_NODE_ROOT = fs.existsSync(path.join(ROOT, "node_modules"))
  ? ROOT
  : path.join(ROOT, "..", "PI-useReq");
const ORACLE_STUBS_ROOT = path.join(ROOT, "tests", "python_oracle_stubs");
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures");
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
process.env.XDG_CONFIG_HOME = path.join(TEST_HOME, ".config");

export function getFixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((entry) => entry.startsWith("fixture_"))
    .map((entry) => path.join(FIXTURES_DIR, entry))
    .sort();
}

/**
 * @brief Executes the TypeScript CLI in a subprocess.
 * @details Invokes `node --import tsx src/cli.ts` with the supplied arguments, cwd, and environment overrides while preserving the oracle Python interpreter binding. Runtime is dominated by child-process execution. Side effects are limited to subprocess creation.
 * @param[in] args {string[]} CLI arguments forwarded to `src/cli.ts`.
 * @param[in] cwd {string} Working directory for the child process.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional environment additions or overrides.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured process result.
 */
export function runNodeCli(args: string[], cwd = ROOT, envOverrides?: NodeJS.ProcessEnv) {
  return spawnSync("node", ["--import", TSX_LOADER, path.join(ROOT, "src", "cli.ts"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PI_USEREQ_PYTHON: PYTHON,
      ...envOverrides,
    },
  });
}

/**
 * @brief Executes the Python oracle CLI in a subprocess.
 * @details Invokes `python -m usereq.cli` with the supplied arguments, cwd, and environment overrides while preserving the oracle `PYTHONPATH`. Runtime is dominated by child-process execution. Side effects are limited to subprocess creation.
 * @param[in] args {string[]} CLI arguments forwarded to the oracle module.
 * @param[in] cwd {string} Working directory for the child process.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional environment additions or overrides.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured process result.
 */
export function runPythonCli(args: string[], cwd = ROOT, envOverrides?: NodeJS.ProcessEnv) {
  assert.ok(fs.existsSync(path.join(ORACLE_PYTHONPATH_ROOT, "usereq")), `Python oracle source not found at ${ORACLE_PYTHONPATH_ROOT}`);
  return spawnSync(PYTHON, ["-m", "usereq.cli", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: [ORACLE_STUBS_ROOT, ORACLE_PYTHONPATH_ROOT].join(path.delimiter),
      PI_USEREQ_NODE_ROOT: ORACLE_NODE_ROOT,
      ...envOverrides,
    },
  });
}

/**
 * @brief Executes inline Python code with the oracle module search path.
 * @details Invokes the oracle interpreter with `-c`, preserves `PYTHONPATH` for `usereq` imports, and returns the captured subprocess result. Runtime is dominated by child-process execution. Side effects are limited to subprocess creation.
 * @param[in] code {string} Inline Python program.
 * @param[in] cwd {string} Working directory for the child process.
 * @param[in] envOverrides {NodeJS.ProcessEnv | undefined} Optional environment additions or overrides.
 * @return {import("node:child_process").SpawnSyncReturns<string>} Captured process result.
 */
export function runPythonInline(code: string, cwd = ROOT, envOverrides?: NodeJS.ProcessEnv) {
  assert.ok(fs.existsSync(path.join(ORACLE_PYTHONPATH_ROOT, "usereq")), `Python oracle source not found at ${ORACLE_PYTHONPATH_ROOT}`);
  return spawnSync(PYTHON, ["-c", code], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: [ORACLE_STUBS_ROOT, ORACLE_PYTHONPATH_ROOT].join(path.delimiter),
      PI_USEREQ_NODE_ROOT: ORACLE_NODE_ROOT,
      ...envOverrides,
    },
  });
}

/**
 * @brief Creates one temporary working directory and resets the isolated test global config.
 * @details Allocates a unique directory under the system temp root, rewrites the process-scoped test global config file to documented defaults derived from the new project base, and returns the directory path. Runtime is O(n) in serialized config size. Side effects include directory creation and global-config file overwrite under the isolated test home.
 * @param[in] prefix {string} Prefix forwarded to `fs.mkdtempSync(...)`.
 * @return {string} Absolute temporary directory path.
 */
export function createTempDir(prefix: string): string {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  saveGlobalConfig(getDefaultConfig(tempDir));
  return tempDir;
}

/**
 * @brief Persists the Python oracle configuration mirror for one fixture project.
 * @details Writes `.req/config.json` with the supplied config plus the oracle-specific `guidelines-dir` field so Node and Python parity tests observe the same project metadata. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] config {UseReqConfig} Effective project configuration to mirror.
 * @return {void} No return value.
 */
function writeOracleReqConfig(projectBase: string, config: UseReqConfig): void {
  const reqDir = path.join(projectBase, ".req");
  fs.mkdirSync(reqDir, { recursive: true });
  const payload = {
    "guidelines-dir": "guidelines",
    ...config,
  };
  fs.writeFileSync(path.join(reqDir, "config.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @brief Persists Node local/global configs plus the Python-oracle mirror for parity tests.
 * @details Writes split `.pi-usereq.json` and `~/.config/pi-usereq/config.json` files for the TypeScript runtime, then writes `.req/config.json` for the Python oracle using the same effective payload. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Fixture project root.
 * @param[in] config {UseReqConfig} Effective project configuration to persist.
 * @return {void} No return value.
 */
export function saveFixtureConfigs(projectBase: string, config: UseReqConfig): void {
  saveConfig(projectBase, config);
  writeOracleReqConfig(projectBase, config);
}

/**
 * @brief Reads the raw persisted TypeScript local project config JSON.
 * @details Loads `.pi-usereq.json` without normalization so tests can inspect local-scope merge order and unknown metadata preservation exactly as written. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Fixture project root.
 * @return {Record<string, unknown>} Parsed raw local configuration object.
 */
export function readProjectConfigJson(projectBase: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(getProjectConfigPath(projectBase), "utf8")) as Record<string, unknown>;
}

/**
 * @brief Reads the raw persisted TypeScript global config JSON.
 * @details Loads `~/.config/pi-usereq/config.json` without normalization so tests can inspect global-scope merge order and unknown metadata preservation exactly as written. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {Record<string, unknown>} Parsed raw global configuration object.
 */
export function readGlobalConfigJson(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(getGlobalConfigPath(), "utf8")) as Record<string, unknown>;
}

/**
 * @brief Writes one executable shell script for integration tests.
 * @details Creates the parent directory when required, writes UTF-8 content, and marks the file owner-executable. Runtime is O(n) in script size. Side effects include directory creation, file overwrite, and permission changes.
 * @param[in] filePath {string} Absolute destination path for the script.
 * @param[in] content {string} Full script body.
 * @return {string} Absolute script path.
 */
export function writeExecutableScript(filePath: string, content: string): string {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
  fs.chmodSync(filePath, 0o755);
  return filePath;
}

export function initFixtureRepo(options: {
  fixtures?: string[];
  docs?: Record<string, string>;
  staticCheck?: Record<string, StaticCheckLanguageConfig>;
} = {}): { projectBase: string; config: UseReqConfig } {
  const projectBase = createTempDir("pi-usereq-repo-");
  fs.mkdirSync(path.join(projectBase, "src"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, "tests"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, "guidelines"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, ...DEFAULT_DOCS_DIR.split("/")), { recursive: true });

  for (const fixture of options.fixtures ?? getFixtureFiles()) {
    const destination = path.join(projectBase, "src", path.basename(fixture));
    fs.copyFileSync(fixture, destination);
  }

  const docs = options.docs ?? {
    "REQUIREMENTS.md": "# Requirements\n",
    "WORKFLOW.md": "# Workflow\n",
    "REFERENCES.md": "# References\n",
  };
  for (const [name, content] of Object.entries(docs)) {
    fs.writeFileSync(path.join(projectBase, ...DEFAULT_DOCS_DIR.split("/"), name), content, "utf8");
  }

  const gitInit = spawnSync("git", ["init"], { cwd: projectBase, encoding: "utf8" });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  spawnSync("git", ["config", "user.name", "pi-usereq"], { cwd: projectBase, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "pi-usereq@example.com"], { cwd: projectBase, encoding: "utf8" });
  const config: UseReqConfig = {
    ...getDefaultConfig(projectBase),
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": "tests",
    "src-dir": ["src"],
    "static-check": options.staticCheck ?? {},
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
  };
  saveFixtureConfigs(projectBase, config);
  spawnSync("git", ["add", "."], { cwd: projectBase, encoding: "utf8" });
  const commit = spawnSync("git", ["commit", "-m", "init"], { cwd: projectBase, encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr);

  const localVenv = path.join(projectBase, ".venv");
  const oracleVenvRoot = path.dirname(path.dirname(ORACLE_VENV_PYTHON));
  if (!fs.existsSync(localVenv) && fs.existsSync(oracleVenvRoot)) {
    fs.symlinkSync(oracleVenvRoot, localVenv, "dir");
  }

  return { projectBase, config };
}
