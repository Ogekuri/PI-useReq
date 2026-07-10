/**
 * @file
 * @brief Verifies bundled static-checker resolution, postinstall exit-code invariants, and session_start missing-checker notification.
 * @details Exercises `resolveCheckerExecutable` bundled-bin precedence, the `scripts/install-static-checkers.ts` exit-code-0 invariant, and the `checkDefaultCheckersAvailability` helper used during `session_start`. Runtime is dominated by filesystem metadata checks and optional child-process execution. Side effects are limited to temporary filesystem reads and bounded writes under the installation-owned `node_modules/.bin` with cleanup.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  resolveCheckerExecutable,
  checkDefaultCheckersAvailability,
} from "../src/core/static-check.js";
import { getInstallationPath } from "../src/core/path-context.js";
import { getDefaultConfig } from "../src/core/config.js";
import { main as installStaticCheckersMain } from "../scripts/install-static-checkers.ts";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TSX_LOADER = require.resolve("tsx", { paths: [ROOT] });

/**
 * @brief Resolves the bundled `node_modules/.bin` directory probed by `resolveCheckerExecutable`.
 * @details Computes the first bundled-bin candidate directory derived from the runtime installation path so tests can create and clean up temporary fake executables at the exact probed location. Runtime is O(1). No side effects occur.
 * @return {string} Absolute bundled `node_modules/.bin` directory path.
 */
function getBundledBinDir(): string {
  return path.join(getInstallationPath(), "..", "node_modules", ".bin");
}

test("resolveCheckerExecutable probes bundled node_modules/.bin before PATH scan", () => {
  const binDir = getBundledBinDir();
  const fakeName = "pi-usereq-fake-checker";
  const fakeBin = path.join(binDir, fakeName);
  const dirExisted = fs.existsSync(binDir);
  try {
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(fakeBin, "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    const resolved = resolveCheckerExecutable(fakeName);
    assert.ok(resolved, "expected bundled-bin candidate to resolve");
    assert.equal(resolved, fakeBin);
  } finally {
    if (fs.existsSync(fakeBin)) {
      fs.rmSync(fakeBin, { force: true });
    }
    if (!dirExisted && fs.existsSync(binDir)) {
      fs.rmSync(binDir, { recursive: true, force: true });
    }
  }
});

test("resolveCheckerExecutable falls back to PATH scan for system executables", () => {
  const resolved = resolveCheckerExecutable("node");
  assert.ok(resolved, "expected 'node' to resolve via PATH scan");
});

test("resolveCheckerExecutable returns undefined for non-existent commands", () => {
  const resolved = resolveCheckerExecutable("pi-usereq-definitely-not-a-real-binary-xyz");
  assert.equal(resolved, undefined);
});

test("scripts/install-static-checkers.ts always returns exit code 0", () => {
  const exitCode = installStaticCheckersMain([]);
  assert.equal(exitCode, 0);
  const exitCodeWithArgs = installStaticCheckersMain(["--ignored"]);
  assert.equal(exitCodeWithArgs, 0);
});

test("scripts/install-static-checkers.ts exits 0 when invoked as a subprocess", () => {
  const result = spawnSync(
    "node",
    ["--import", TSX_LOADER, path.join(ROOT, "scripts", "install-static-checkers.ts")],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0);
});

test("checkDefaultCheckersAvailability returns missing enabled checkers for default config", () => {
  const config = getDefaultConfig(process.cwd());
  const missing = checkDefaultCheckersAvailability(config);
  assert.ok(Array.isArray(missing), "expected an array of missing checker names");
  for (const checker of ["cppcheck", "clang-format"]) {
    if (!resolveCheckerExecutable(checker)) {
      assert.ok(missing.includes(checker), `expected missing checker '${checker}' to be reported`);
    }
  }
});

test("checkDefaultCheckersAvailability returns empty array when all checkers disabled", () => {
  const config = getDefaultConfig(process.cwd());
  for (const languageConfig of Object.values(config["static-check"])) {
    languageConfig.enabled = "disable";
  }
  const missing = checkDefaultCheckersAvailability(config);
  assert.equal(missing.length, 0);
});
