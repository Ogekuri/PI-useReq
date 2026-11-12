/**
 * @file
 * @brief Reproduces the git-dependency postinstall failure and verifies the dependency-free bootstrap.
 * @details Covers the `pi-usereq --upgrade --dev` install path, where npm's git-dependency preparation runs the
 * package `postinstall` command inside a temporary clone without an installed dependency tree. The suite proves
 * that the legacy `node --import tsx ./scripts/install-static-checkers.ts` command cannot resolve its loader in
 * that state, that the shipped `scripts/install-static-checkers.js` bootstrap still exits `0`, and that
 * `package.json` declares the bootstrap as the `postinstall` entry and ships it in the npm `files` allowlist.
 * Runtime is dominated by bounded child-process execution inside temporary directories. Side effects are limited
 * to temporary-directory creation and removal under the operating-system temp directory.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

/**
 * @brief Resolves the repository root containing the package manifest and shipped scripts.
 * @details Derives the root from this test module location so the suite runs from any caller working directory.
 * Runtime is O(p) in path length. No side effects occur.
 * @return {string} Absolute repository root path.
 */
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");

/**
 * @brief Absolute path of the shipped dependency-free postinstall bootstrap.
 * @details Targets the exact file declared by the `postinstall` lifecycle script. Access complexity is O(p) in
 * path length. No side effects occur.
 */
const BOOTSTRAP_PATH = path.join(ROOT, "scripts", "install-static-checkers.js");

/**
 * @brief Describes the parsed package manifest subset asserted by this suite.
 * @details Restricts assertions to the `scripts` and `files` fields that control the npm lifecycle command and
 * the published tarball content. The interface is compile-time only and introduces no runtime side effects.
 */
interface PostinstallManifest {
  scripts?: Record<string, string>;
  files?: string[];
}

/**
 * @brief Reads the repository package manifest.
 * @details Parses `package.json` from the module-derived repository root so assertions never depend on the
 * caller working directory. Runtime is O(n) in manifest size. Side effects are limited to one filesystem read.
 * @return {PostinstallManifest} Parsed manifest subset.
 */
function readManifest(): PostinstallManifest {
  return JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as PostinstallManifest;
}

/**
 * @brief Creates one dependency-free clone directory that mimics npm's git-dependency preparation checkout.
 * @details Copies only the shipped `scripts/install-static-checkers.js` bootstrap into a fresh temporary
 * directory, leaving `node_modules`, the TypeScript installer, and every dependency absent exactly as npm's
 * git-dependency preparation child install observes them. Runtime is dominated by temporary-directory creation
 * plus one file copy. Side effects are limited to writes inside the created temporary directory.
 * @return {string} Absolute dependency-free clone root path.
 */
function createDependencyFreeClone(): string {
  const cloneRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-postinstall-"));
  const scriptsDir = path.join(cloneRoot, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.copyFileSync(BOOTSTRAP_PATH, path.join(scriptsDir, "install-static-checkers.js"));
  return cloneRoot;
}

test("legacy postinstall command cannot resolve the tsx loader inside a dependency-free clone", () => {
  const cloneRoot = createDependencyFreeClone();
  try {
    const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "0"], {
      cwd: cloneRoot,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0, "expected the loader specifier to fail without an installed tree");
    assert.match(result.stderr, /Cannot find package 'tsx'/u);
  } finally {
    fs.rmSync(cloneRoot, { recursive: true, force: true });
  }
});

test("postinstall bootstrap exits 0 without an installed dependency tree", () => {
  const cloneRoot = createDependencyFreeClone();
  try {
    const result = spawnSync(
      process.execPath,
      [path.join(cloneRoot, "scripts", "install-static-checkers.js")],
      { cwd: cloneRoot, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /installation deferred until dependencies are installed/u);
    assert.equal(result.stderr, "");
  } finally {
    fs.rmSync(cloneRoot, { recursive: true, force: true });
  }
});

test("package manifest runs postinstall through the dependency-free bootstrap", () => {
  const manifest = readManifest();
  assert.equal(manifest.scripts?.postinstall, "node ./scripts/install-static-checkers.js");
  assert.ok(
    !(manifest.scripts?.postinstall ?? "").includes("--import tsx"),
    "postinstall must not require an installed package or loader",
  );
  assert.ok(
    (manifest.files ?? []).includes("scripts/install-static-checkers.js"),
    "npm files allowlist must ship the postinstall bootstrap",
  );
});
