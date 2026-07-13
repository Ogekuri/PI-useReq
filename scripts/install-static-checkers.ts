#!/usr/bin/env node
/**
 * @file
 * @brief Implements the best-effort postinstall installer for bundled static checkers.
 * @details Probes bundled npm-backed static-check executables (`pyright`, `ruff`, `eslint`), attempts a best-effort `npm install --no-save --prefix` on miss, and prints platform-specific guidance for native checkers (`cppcheck`, `clang-format`). Runtime is dominated by child-process probing and optional npm execution. Side effects include stdout/stderr writes, filesystem reads, and best-effort `npm install` subprocess spawning. The script always exits with code `0` and never modifies git-tracked files.
 */

import process from "node:process";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
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
 * @brief Describes one parsed package manifest entry used for install-script detection.
 * @details Captures only the package `name` and lifecycle `scripts` map needed to decide whether a package contributes an install script. The interface is compile-time only and introduces no runtime side effects.
 */
export interface NodeModulesPackage {
  name: string;
  scripts: Record<string, string>;
}

/**
 * @brief Lists the npm lifecycle script fields that trigger the allow-scripts warning for registry dependencies.
 * @details Mirrors the npm lifecycle script names whose presence on a registry dependency causes `npm warn allow-scripts` when the package is not covered by the consumer-root `allowScripts` map. `prepare` is intentionally excluded because npm only runs `prepare` for non-registry (git/file) sources, so including it would over-approve ordinary registry dependencies that never trigger the warning. Access complexity is O(1).
 */
export const INSTALL_LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"] as const;

/**
 * @brief Describes the injectable filesystem operations consumed by the approval flow.
 * @details Exposes the strict subset of `node:fs` synchronous operations needed to scan `node_modules` and update the consumer-root `package.json` so unit tests substitute an in-memory fake without touching the real filesystem. The interface is compile-time only and introduces no runtime side effects.
 */
export interface InstallScriptApprovalDeps {
  existsSync(path: string): boolean;
  readdirSync(path: string): string[];
  readFileSync(path: string): string;
  writeFileSync(path: string, data: string): void;
}

/**
 * @brief Resolves the consumer install root that owns the active npm install transaction.
 * @details During an npm lifecycle script npm sets `INIT_CWD` to the invocation directory and `npm_config_local_prefix` to the resolved project prefix; both point at the true consumer root instead of the installed package directory that is the postinstall `process.cwd()`. Returns the first available value so the approval flow writes the consumer-root `package.json` allowScripts map instead of the nested `node_modules/<pkg>` directory. Runtime is O(1). No external state is mutated.
 * @param[in] env {NodeJS.ProcessEnv} Environment map read for npm lifecycle path variables.
 * @return {string | undefined} Consumer install root, or `undefined` when not running inside an npm lifecycle.
 */
export function getConsumerInstallRoot(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.INIT_CWD || env.npm_config_local_prefix || undefined;
}

/**
 * @brief Selects package names that declare at least one npm install lifecycle script.
 * @details Returns the `name` of every supplied package whose `scripts` map contains a non-empty `preinstall`, `install`, or `postinstall` entry, preserving input order. `prepare` is excluded because npm only runs it for non-registry sources. Pure derivation over supplied data with no filesystem access. Runtime is O(n * k) where n is the package count and k is the fixed lifecycle-field count. No external state is mutated.
 * @param[in] packages {readonly NodeModulesPackage[]} Parsed package manifests scanned from `node_modules`.
 * @return {string[]} Ordered list of package names declaring an install lifecycle script.
 */
export function selectInstallScriptPackageNames(packages: readonly NodeModulesPackage[]): string[] {
  const names: string[] = [];
  for (const pkg of packages) {
    if (typeof pkg.name !== "string") {
      continue;
    }
    const name = pkg.name.trim();
    if (name === "") {
      continue;
    }
    const hasLifecycleScript = INSTALL_LIFECYCLE_SCRIPTS.some(
      (field) => typeof pkg.scripts[field] === "string" && pkg.scripts[field] !== "",
    );
    if (hasLifecycleScript) {
      names.push(name);
    }
  }
  return names;
}

/**
 * @brief Merges name-only allowScripts approvals into an existing allowScripts map.
 * @details Returns a new map that preserves every existing entry (including explicit `false` denials) and adds each missing package name keyed by name only (no version pin) so approvals survive dependency version changes and never re-trigger the warning on later updates. Runtime is O(n + e) where n is the supplied name count and e is the existing entry count. No external state is mutated.
 * @param[in] existingAllowScripts {Record<string, boolean> | undefined} Current consumer-root allowScripts map, if any.
 * @param[in] packageNames {readonly string[]} Package names to approve when absent.
 * @return {Record<string, boolean>} Merged allowScripts map with name-only approvals added.
 */
export function mergeAllowScriptsEntries(
  existingAllowScripts: Record<string, boolean> | undefined,
  packageNames: readonly string[],
): Record<string, boolean> {
  const merged: Record<string, boolean> = { ...(existingAllowScripts ?? {}) };
  for (const name of packageNames) {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (trimmedName !== "" && !(trimmedName in merged)) {
      merged[trimmedName] = true;
    }
  }
  return merged;
}

/**
 * @brief Provides the default real filesystem operations for the approval flow.
 * @details Binds the synchronous `node:fs` operations used to scan `node_modules` and rewrite the consumer-root `package.json` in production. Runtime is dominated by filesystem I/O. Side effect: filesystem reads and an optional write.
 */
const realApprovalDeps: InstallScriptApprovalDeps = {
  existsSync: (p) => fs.existsSync(p),
  readdirSync: (p) => fs.readdirSync(p),
  readFileSync: (p) => fs.readFileSync(p, "utf8"),
  writeFileSync: (p, data) => fs.writeFileSync(p, data),
};

/**
 * @brief Scans consumer-root `node_modules` and returns parsed package manifests.
 * @details Iterates top-level `node_modules` entries, descends one level into `@scope` directories, skips dotfile entries and packages whose `package.json` is missing or unparseable, and returns the parsed `name` plus `scripts` map for every readable package. Runtime is O(m) where m is the top-level installed package count. No external state is mutated.
 * @param[in] nodeModulesPath {string} Absolute consumer-root `node_modules` path.
 * @param[in] deps {InstallScriptApprovalDeps} Injectable filesystem operations.
 * @return {NodeModulesPackage[]} Parsed package manifests for every readable installed package.
 */
function collectNodeModulesPackages(
  nodeModulesPath: string,
  deps: InstallScriptApprovalDeps,
): NodeModulesPackage[] {
  const packages: NodeModulesPackage[] = [];
  if (!deps.existsSync(nodeModulesPath)) {
    return packages;
  }
  const readPackage = (entryRelativePath: string): void => {
    const pkgPath = path.join(nodeModulesPath, entryRelativePath, "package.json");
    if (!deps.existsSync(pkgPath)) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(deps.readFileSync(pkgPath));
    } catch {
      return;
    }
    const name = typeof (parsed as { name?: unknown })?.name === "string"
      ? (parsed as { name: string }).name
      : "";
    const scripts = (parsed as { scripts?: unknown })?.scripts;
    const scriptsMap = scripts && typeof scripts === "object"
      ? (scripts as Record<string, string>)
      : {};
    packages.push({ name, scripts: scriptsMap });
  };
  for (const entry of deps.readdirSync(nodeModulesPath)) {
    if (entry.startsWith(".")) {
      continue;
    }
    if (entry.startsWith("@")) {
      const scopePath = path.join(nodeModulesPath, entry);
      for (const scopedEntry of deps.readdirSync(scopePath)) {
        readPackage(path.join(entry, scopedEntry));
      }
    } else {
      readPackage(entry);
    }
  }
  return packages;
}

/**
 * @brief Best-effort approves pending npm install scripts for the consumer install root.
 * @details Resolves the consumer install root from the npm lifecycle environment, scans consumer-root `node_modules` for installed packages that declare an install lifecycle script, and writes name-only `allowScripts` approvals into the consumer-root `package.json` for every such package that is not already covered. Direct writes are required because `npm approve-scripts --all` refuses to approve packages mid-install with `no trusted identity for policy key`. Name-only entries (no version pin) are used so approvals survive dependency version changes and never re-trigger the warning on later updates. Existing entries (including explicit `false` denials) are always preserved. Accepts injectable filesystem operations so unit tests stay deterministic and isolated. Swallows all errors so the postinstall flow never fails. Runtime is dominated by filesystem I/O. Side effects include a consumer-root `package.json` read and an optional write.
 * @param[in] deps {InstallScriptApprovalDeps} Injectable filesystem operations; defaults to the real `node:fs`-backed operations.
 * @return {void} No return value.
 * @satisfies DES-020, REQ-352
 */
export function approvePendingInstallScripts(deps: InstallScriptApprovalDeps = realApprovalDeps): void {
  const root = getConsumerInstallRoot();
  if (!root) {
    return;
  }
  const nodeModulesPath = path.join(root, "node_modules");
  const packages = collectNodeModulesPackages(nodeModulesPath, deps);
  const packageNames = selectInstallScriptPackageNames(packages);
  if (packageNames.length === 0) {
    return;
  }
  const rootPackageJsonPath = path.join(root, "package.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(deps.readFileSync(rootPackageJsonPath));
  } catch {
    return;
  }
  if (!parsed || typeof parsed !== "object") {
    return;
  }
  const pkgJson = parsed as Record<string, unknown>;
  const existingAllowScripts = pkgJson.allowScripts;
  const existingMap = existingAllowScripts && typeof existingAllowScripts === "object"
    ? (existingAllowScripts as Record<string, boolean>)
    : undefined;
  const merged = mergeAllowScriptsEntries(existingMap, packageNames);
  if (JSON.stringify(merged) === JSON.stringify(existingAllowScripts ?? {})) {
    return;
  }
  pkgJson.allowScripts = merged;
  try {
    deps.writeFileSync(rootPackageJsonPath, `${JSON.stringify(pkgJson, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Warning: failed to approve pending install scripts: ${error instanceof Error ? error.message : String(error)}\n`);
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
 * @details When invoked as the npm `postinstall` lifecycle script, first best-effort approves pending consumer install scripts through `approvePendingInstallScripts`, then probes each bundled npm checker through `resolveCheckerExecutable`, attempts a best-effort install on miss, prints native-checker guidance for unresolvable native checkers, and always returns `0` so `npm install` never fails because of missing optional checkers. The lifecycle gate keeps the approval side effect bound to real installs so manual or test invocations never mutate an unrelated project root. Runtime is dominated by PATH probing and optional npm execution. Side effects include stdout/stderr writes and best-effort `npm install` subprocess spawning. The script never modifies git-tracked files.
 * @param[in] argv {string[]} Raw CLI arguments (unused, retained for CLI convention parity).
 * @return {number} Always returns `0`.
 * @satisfies REQ-339, DES-017, DES-020, REQ-352
 */
export function main(argv = process.argv.slice(2)): number {
  void argv;
  if (process.env.npm_lifecycle_event === "postinstall") {
    approvePendingInstallScripts();
  }
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
