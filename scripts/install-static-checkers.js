#!/usr/bin/env node
/**
 * @file
 * @brief Bootstraps the bundled static-checker installer without requiring installed dependencies.
 * @details Runs as the npm `postinstall` lifecycle command so package installation never fails while the
 * package dependency tree is absent, which is exactly the state npm's git-dependency preparation creates
 * inside its temporary clone. When the installation-owned `tsx` loader and the TypeScript installer entry
 * are both present, the bootstrap delegates to `scripts/install-static-checkers.ts`; otherwise it reports
 * the deferred checker installation and exits with code `0`. Runtime is dominated by two filesystem probes
 * plus at most one delegated child process. Side effects are limited to stdout/stderr writes and one child
 * process execution.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * @brief Absolute npm package root resolved from this bootstrap module location.
 * @details Anchors every delegated path on the package that owns `scripts/`, so the bootstrap behaves
 * identically for source checkouts, global npm installs, and npm git-dependency preparation clones.
 * Access complexity is O(p) in path length. No side effects occur.
 */
const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @brief Absolute TypeScript installer entry executed through the bundled loader.
 * @details Declares the installer contract owned by `scripts/install-static-checkers.ts`, which keeps its
 * best-effort exit-code-0 behavior and bundled-checker probing. Access complexity is O(p) in path length.
 * No side effects occur.
 */
const INSTALLER_ENTRY = path.join(PACKAGE_ROOT, "scripts", "install-static-checkers.ts");

/**
 * @brief Absolute directory of the installation-owned `tsx` loader package.
 * @details Presence of this directory proves the dependency tree was installed, so the delegated TypeScript
 * installer can resolve its TypeScript imports. Absence identifies the dependency-free git clone created by
 * npm's git-dependency preparation. Access complexity is O(p) in path length. No side effects occur.
 */
const TSX_PACKAGE_DIR = path.join(PACKAGE_ROOT, "node_modules", "tsx");

/**
 * @brief Tests whether the delegated TypeScript installer can run from this package root.
 * @details Requires both the installer entry and the installation-owned `tsx` package directory, because the
 * installer statically imports TypeScript sources that only the bundled loader can execute. Missing artifacts
 * describe a dependency-free clone rather than a broken installation. Runtime is O(1) plus two filesystem
 * stat calls. No external state is mutated.
 * @return {boolean} `true` when the delegated installer is runnable, otherwise `false`.
 */
function canDelegateToInstaller() {
  return fs.existsSync(TSX_PACKAGE_DIR) && fs.existsSync(INSTALLER_ENTRY);
}

/**
 * @brief Runs the delegated TypeScript installer as one child Node process.
 * @details Spawns the current Node executable with the bundled `tsx` loader and the installer entry using the
 * package root as working directory so the loader resolves from `node_modules/tsx`, and inherits stdio so
 * checker guidance reaches the npm log. Spawn failures and non-zero child statuses are reported as one warning
 * line because the installer is best-effort by contract. Runtime is dominated by the delegated installer. Side
 * effects include one child-process execution.
 * @return {void} No return value.
 */
function runInstaller() {
  const result = spawnSync(process.execPath, ["--import", "tsx", INSTALLER_ENTRY], {
    cwd: PACKAGE_ROOT,
    stdio: "inherit",
  });
  if (result.error || result.status !== 0) {
    const reason = result.error ? result.error.message : `exit code ${result.status ?? "unknown"}`;
    process.stderr.write(
      `Warning: bundled static-checker installation skipped (${reason}); run 'npm rebuild pi-usereq' after installing dependencies.\n`,
    );
  }
}

/**
 * @brief Executes the dependency-independent postinstall flow.
 * @details Delegates to the TypeScript installer when its loader and entry exist, otherwise reports that
 * bundled-checker installation is deferred until the dependency tree is present so npm's git-dependency
 * preparation clone still completes successfully. Always returns `0` so npm never fails a consumer install
 * because of optional checker setup. Runtime is O(1) plus the delegated installer cost. Side effects are
 * limited to stdout/stderr writes and optional child-process execution.
 * @return {number} Always `0`.
 */
function main() {
  if (!canDelegateToInstaller()) {
    process.stdout.write(
      "pi-usereq: bundled static-checker installation deferred until dependencies are installed.\n",
    );
    return 0;
  }
  runInstaller();
  return 0;
}

process.exitCode = main();
