import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { saveConfig, type UseReqConfig } from "../src/core/config.js";
import { normalizeEnabledPiUsereqTools } from "../src/core/pi-usereq-tools.js";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX_LOADER = require.resolve("tsx", { paths: [ROOT] });
const PYTHON = path.join(ROOT, ".venv-oracle", "bin", "python");
const FIXTURES_DIR = path.join(ROOT, "tests", "fixtures");

export function getFixtureFiles(): string[] {
  return fs
    .readdirSync(FIXTURES_DIR)
    .filter((entry) => entry.startsWith("fixture_"))
    .map((entry) => path.join(FIXTURES_DIR, entry))
    .sort();
}

export function runNodeCli(args: string[], cwd = ROOT) {
  return spawnSync("node", ["--import", TSX_LOADER, path.join(ROOT, "src", "cli.ts"), ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PI_USEREQ_PYTHON: PYTHON,
    },
  });
}

export function runPythonCli(args: string[], cwd = ROOT) {
  assert.ok(fs.existsSync(PYTHON), "Python oracle virtualenv not found");
  return spawnSync(PYTHON, ["-m", "usereq.cli", ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PYTHONPATH: path.join(ROOT, "usereq", "src"),
    },
  });
}

export function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeOracleReqConfig(projectBase: string, config: UseReqConfig): void {
  const reqDir = path.join(projectBase, ".req");
  fs.mkdirSync(reqDir, { recursive: true });
  const payload = {
    "guidelines-dir": "guidelines",
    ...config,
  };
  fs.writeFileSync(path.join(reqDir, "config.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function initFixtureRepo(options: {
  fixtures?: string[];
  docs?: Record<string, string>;
  staticCheck?: Record<string, Array<{ module: string; cmd?: string; params?: string[] }>>;
} = {}): { projectBase: string; config: UseReqConfig } {
  const projectBase = createTempDir("pi-usereq-repo-");
  fs.mkdirSync(path.join(projectBase, "src"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, "tests"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, "guidelines"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, "req", "docs"), { recursive: true });
  fs.mkdirSync(path.join(projectBase, ".pi", "pi-usereq"), { recursive: true });

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
    fs.writeFileSync(path.join(projectBase, "req", "docs", name), content, "utf8");
  }

  const gitInit = spawnSync("git", ["init"], { cwd: projectBase, encoding: "utf8" });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  spawnSync("git", ["config", "user.name", "pi-usereq"], { cwd: projectBase, encoding: "utf8" });
  spawnSync("git", ["config", "user.email", "pi-usereq@example.com"], { cwd: projectBase, encoding: "utf8" });
  spawnSync("git", ["add", "."], { cwd: projectBase, encoding: "utf8" });
  const commit = spawnSync("git", ["commit", "-m", "init"], { cwd: projectBase, encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr);
  const gitPath = spawnSync("git", ["rev-parse", "--show-toplevel"], { cwd: projectBase, encoding: "utf8" }).stdout.trim();

  const config: UseReqConfig = {
    "docs-dir": "req/docs",
    "tests-dir": "tests",
    "src-dir": ["src"],
    "static-check": options.staticCheck ?? {},
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    "base-path": projectBase,
    "git-path": gitPath,
  };
  saveConfig(projectBase, config);
  writeOracleReqConfig(projectBase, config);

  const localVenv = path.join(projectBase, ".venv");
  if (!fs.existsSync(localVenv)) {
    fs.symlinkSync(path.join(ROOT, ".venv-oracle"), localVenv, "dir");
  }

  return { projectBase, config };
}
