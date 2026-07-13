#!/usr/bin/env node
/**
 * @file
 * @brief Implements the best-effort postinstall installer for bundled static checkers.
 * @details Probes bundled npm-backed static-check executables (`pyright`, `ruff`, `eslint`), attempts a best-effort `npm install --no-save --prefix` on miss, and prints platform-specific guidance for native checkers (`cppcheck`, `clang-format`). Runtime is dominated by child-process probing and optional npm execution. Side effects include stdout/stderr writes, filesystem reads, and best-effort `npm install` subprocess spawning. The script always exits with code `0` and never modifies git-tracked files.
 */

import process from "node:process";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { resolveCheckerExecutable } from "../src/core/static-check.js";
import { getInstallationPath } from "../src/core/path-context.js";

/**
 * @brief Lists the npm-bundled static-check package names that the extension ships as dependencies.
 * @details Each entry maps to one executable name resolvable through bundled `node_modules/.bin` after `npm install` completes. Access complexity is O(1).
 */
export const BUNDLED_NPM_CHECKERS = ["pyright", "ruff", "eslint"] as const;

/**
 * @brief Lists the native system-package-manager static-check executables that the extension cannot bundle.
 * @details Each entry maps to one executable name that users must install through their operating system package manager. Access complexity is O(1).
 */
export const NATIVE_CHECKERS = ["cppcheck", "clang-format"] as const;

/**
 * @brief Maps one bundled npm checker name to its pinned caret install range.
 * @details Returns the caret range matching the package manifest so best-effort installs stay aligned with declared dependencies. Runtime is O(1). No side effects occur.
 * @param[in] pkg {string} Bundled npm package name.
 * @return {string} Pinned caret install range.
 */
function bundledCheckerRange(pkg: string): string {
  switch (pkg) {
    case "pyright":
      return "^1.1.411";
    case "ruff":
      return "^1.5.4";
    case "eslint":
      return "^10.2.0";
    default:
      return "latest";
  }
}

/**
 * @brief Reports whether one parsed `npm approve-scripts --allow-scripts-pending` payload references pending install-script packages.
 * @details Accepts an array of package specifiers or a map of package specifiers to pending-script descriptors, treating any non-empty array or non-empty object with at least one entry as pending. Runtime is O(n) in pending entry count. No external state is mutated.
 * @param[in] pending {unknown} Parsed JSON payload emitted by `npm approve-scripts --allow-scripts-pending`.
 * @return {boolean} `true` when at least one pending install-script package is referenced.
 */
function hasPendingInstallScriptPackages(pending: unknown): boolean {
  if (Array.isArray(pending)) {
    return pending.length > 0;
  }
  if (pending && typeof pending === "object") {
    return Object.keys(pending as Record<string, unknown>).length > 0;
  }
  return false;
}

/**
 * @brief Best-effort approves pending npm install scripts for bundled checker dependencies.
 * @details Probes `npm approve-scripts --allow-scripts-pending`, parses the JSON payload when available, and runs `npm approve-scripts --all` only when pending script-bearing packages are detected so bundled checkers and their transitive dependencies execute without manual script approval. Swallows all errors so the postinstall flow never fails. Runtime is dominated by npm execution. Side effects include optional writes to the installation-owned `package.json` allowScripts map and subprocess spawning.
 * @return {void} No return value.
 * @satisfies DES-020, REQ-352
 */
function approvePendingInstallScripts(): void {
  const pendingResult = spawnSync(
    "npm",
    ["approve-scripts", "--allow-scripts-pending", "--json"],
    { encoding: "utf8" },
  );
  if (pendingResult.error || (pendingResult.status !== null && pendingResult.status !== 0)) {
    return;
  }
  let pendingPayload: unknown;
  try {
    pendingPayload = JSON.parse(pendingResult.stdout ?? "");
  } catch {
    return;
  }
  if (!hasPendingInstallScriptPackages(pendingPayload)) {
    return;
  }
  const approveResult = spawnSync("npm", ["approve-scripts", "--all"], { encoding: "utf8" });
  if (approveResult.error) {
    process.stderr.write(`Warning: failed to approve pending install scripts: ${approveResult.error.message}\n`);
  }
}

/**
 * @brief Prints platform-specific install guidance for native checkers.
 * @details Detects the current platform and emits one consolidated stderr line per native checker describing the recommended system package manager command. Runtime is O(1). Side effect: writes to stderr.
 * @return {void} No return value.
 */
function printNativeCheckerGuidance(): void {
  const platform = process.platform;
  let manager: string;
  let installPrefix: string;
  if (platform === "linux") {
    manager = "apt";
    installPrefix = "sudo apt install";
  } else if (platform === "darwin") {
    manager = "brew";
    installPrefix = "brew install";
  } else if (platform === "win32") {
    manager = "choco/scoop";
    installPrefix = "choco install";
  } else {
    manager = "system package manager";
    installPrefix = "install";
  }
  for (const checker of NATIVE_CHECKERS) {
    process.stderr.write(
      `Native checker '${checker}' not found. Install via ${manager}: ${installPrefix} ${checker}\n`,
    );
  }
}

/**
 * @brief Attempts a best-effort `npm install` for one missing bundled checker.
 * @details Runs `npm install <pkg>@<range> --no-save --prefix <installation-root>` inside the installation parent directory, swallowing all errors so the postinstall flow never fails. Runtime is dominated by npm execution. Side effects include subprocess spawning and optional writes under the installation root.
 * @param[in] pkg {string} Bundled npm package name.
 * @return {void} No return value.
 */
function attemptBundledInstall(pkg: string): void {
  const range = bundledCheckerRange(pkg);
  const installRoot = path.resolve(getInstallationPath(), "..");
  try {
    const result = spawnSync(
      "npm",
      ["install", `${pkg}@${range}`, "--no-save", "--prefix", installRoot],
      { encoding: "utf8" },
    );
    if (result.error) {
      process.stderr.write(`Warning: failed to install bundled checker '${pkg}': ${result.error.message}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `Warning: failed to install bundled checker '${pkg}': ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
}

/**
 * @brief Executes the postinstall static-checker installation flow.
 * @details Probes each bundled npm checker through `resolveCheckerExecutable`, attempts a best-effort install on miss, prints native-checker guidance for unresolvable native checkers, and always returns `0` so `npm install` never fails because of missing optional checkers. Runtime is dominated by PATH probing and optional npm execution. Side effects include stdout/stderr writes and best-effort `npm install` subprocess spawning. The script never modifies git-tracked files.
 * @param[in] argv {string[]} Raw CLI arguments (unused, retained for CLI convention parity).
 * @return {number} Always returns `0`.
 * @satisfies REQ-339, DES-017, DES-020, REQ-352
 */
export function main(argv = process.argv.slice(2)): number {
  void argv;
  approvePendingInstallScripts();
  for (const checker of BUNDLED_NPM_CHECKERS) {
    if (resolveCheckerExecutable(checker)) {
      process.stdout.write(`Bundled static checker '${checker}' is available.\n`);
      continue;
    }
    process.stderr.write(`Bundled static checker '${checker}' not found; attempting best-effort install.\n`);
    attemptBundledInstall(checker);
  }
  const missingNative = NATIVE_CHECKERS.filter((checker) => !resolveCheckerExecutable(checker));
  if (missingNative.length > 0) {
    printNativeCheckerGuidance();
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = main();
}
