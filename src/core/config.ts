/**
 * @file
 * @brief Loads, normalizes, and persists pi-usereq project configuration.
 * @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi/pi-usereq`.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ReqError } from "./errors.js";
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { homeRelative, makeRelativeIfContainsProject } from "./utils.js";

/**
 * @brief Describes one static-check module configuration entry.
 * @details Each record identifies the checker module and optional command or parameter list used during per-language static analysis dispatch. The interface is type-only and has no runtime cost.
 */
export interface StaticCheckEntry {
  module: string;
  cmd?: string;
  params?: string[];
}

/**
 * @brief Defines the persisted pi-usereq project configuration schema.
 * @details Captures documentation paths, source/test directory selection, static-check configuration, enabled startup tools, and git/base-path metadata. The interface is compile-time only and introduces no runtime side effects.
 */
export interface UseReqConfig {
  "docs-dir": string;
  "tests-dir": string;
  "src-dir": string[];
  "static-check": Record<string, StaticCheckEntry[]>;
  "enabled-tools": string[];
  "base-path"?: string;
  "git-path"?: string;
}

/**
 * @brief Defines the default documentation directory relative to the project root.
 * @details Used when no persisted `docs-dir` value exists or normalization yields an empty string. Lookup complexity is O(1).
 */
export const DEFAULT_DOCS_DIR = "req/docs";
/**
 * @brief Defines the default tests directory relative to the project root.
 * @details Used when no persisted `tests-dir` value exists or normalization yields an empty string. Lookup complexity is O(1).
 */
export const DEFAULT_TESTS_DIR = "tests";
/**
 * @brief Defines the default set of source directories relative to the project root.
 * @details The array seeds newly created configs and repairs invalid persisted source selections. Access complexity is O(1).
 */
export const DEFAULT_SRC_DIRS = ["src"];
/**
 * @brief Defines the fixed configuration namespace under `.pi`.
 * @details Shared by config and resource helpers to keep all pi-usereq artifacts in a deterministic directory tree. Access complexity is O(1).
 */
export const CONFIG_DIRNAME = "pi-usereq";

/**
 * @brief Computes the per-project config file path.
 * @details Joins the project root with `.pi/pi-usereq/config.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {string} Absolute config file path.
 */
export function getProjectConfigPath(projectBase: string): string {
  return path.join(projectBase, ".pi", CONFIG_DIRNAME, "config.json");
}

/**
 * @brief Computes the user-scoped resource directory for pi-usereq assets.
 * @details Resolves the home directory and appends `.pi/pi-usereq/resources`. Time complexity is O(1). No filesystem writes occur.
 * @return {string} Absolute home resource root path.
 */
export function getHomeResourceRoot(): string {
  return path.join(os.homedir(), ".pi", CONFIG_DIRNAME, "resources");
}

/**
 * @brief Builds the default project configuration.
 * @details Populates canonical docs/test/source directories, enables the default startup tool set, and records the provided project base path. Time complexity is O(n) in default tool count. No filesystem side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Fresh default configuration object.
 */
export function getDefaultConfig(projectBase: string): UseReqConfig {
  return {
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": DEFAULT_TESTS_DIR,
    "src-dir": [...DEFAULT_SRC_DIRS],
    "static-check": {},
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    "base-path": projectBase,
  };
}

/**
 * @brief Loads and sanitizes the persisted project configuration.
 * @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates core field shapes, applies fallbacks, and normalizes enabled tool names. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Sanitized effective configuration.
 * @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
 */
export function loadConfig(projectBase: string): UseReqConfig {
  const configPath = getProjectConfigPath(projectBase);
  if (!fs.existsSync(configPath)) {
    return getDefaultConfig(projectBase);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }

  if (!payload || typeof payload !== "object") {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }
  const data = payload as Record<string, unknown>;
  const docsDir = typeof data["docs-dir"] === "string" && data["docs-dir"].trim() ? data["docs-dir"] : DEFAULT_DOCS_DIR;
  const testsDir = typeof data["tests-dir"] === "string" && data["tests-dir"].trim() ? data["tests-dir"] : DEFAULT_TESTS_DIR;
  const srcDir = Array.isArray(data["src-dir"]) && data["src-dir"].every((item) => typeof item === "string" && item.trim())
    ? (data["src-dir"] as string[])
    : [...DEFAULT_SRC_DIRS];
  const staticCheck = typeof data["static-check"] === "object" && data["static-check"] !== null
    ? (data["static-check"] as Record<string, StaticCheckEntry[]>)
    : {};
  const enabledTools = normalizeEnabledPiUsereqTools(data["enabled-tools"]);
  const basePath = typeof data["base-path"] === "string" ? data["base-path"] : projectBase;
  const gitPath = typeof data["git-path"] === "string" ? data["git-path"] : undefined;

  return {
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDir,
    "static-check": staticCheck,
    "enabled-tools": enabledTools,
    "base-path": basePath,
    "git-path": gitPath,
  };
}

/**
 * @brief Persists the project configuration to disk.
 * @details Creates the parent `.pi/pi-usereq` directory when necessary and writes formatted JSON terminated by a newline. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Configuration object to persist.
 * @return {void} No return value.
 */
export function saveConfig(projectBase: string, config: UseReqConfig): void {
  const configPath = getProjectConfigPath(projectBase);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * @brief Normalizes persisted directory fields to project-relative forms.
 * @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Configuration object to normalize.
 * @return {UseReqConfig} Normalized configuration copy.
 */
export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig {
  const docsDir = makeRelativeIfContainsProject(config["docs-dir"], projectBase).replace(/[/\\]+$/, "") || DEFAULT_DOCS_DIR;
  const testsDir = makeRelativeIfContainsProject(config["tests-dir"], projectBase).replace(/[/\\]+$/, "") || DEFAULT_TESTS_DIR;
  const srcDirs = config["src-dir"].map((value) => makeRelativeIfContainsProject(value, projectBase).replace(/[/\\]+$/, "")).filter(Boolean);
  return {
    ...config,
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDirs.length > 0 ? srcDirs : [...DEFAULT_SRC_DIRS],
  };
}

/**
 * @brief Builds placeholder replacements for bundled prompt rendering.
 * @details Computes project-relative docs, source, test, and guideline paths; enumerates visible guideline files from the home resource tree; and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {Record<string, string>} Placeholder-to-string replacement map.
 */
export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string> {
  const resourcesRoot = getHomeResourceRoot();
  const guidelinesDir = path.join(resourcesRoot, "guidelines");
  const guidelineEntries = fs.existsSync(guidelinesDir)
    ? fs.readdirSync(guidelinesDir)
        .filter((entry) => !entry.startsWith("."))
        .map((entry) => homeRelative(path.join(guidelinesDir, entry)))
        .sort()
    : [];

  const srcValue = config["src-dir"].map((value) => `\`${value.replace(/[/\\]+$/, "")}/\``).join(", ");
  const testValue = `\`${config["tests-dir"].replace(/[/\\]+$/, "")}/\``;
  const guidelinesValue = guidelineEntries.length > 0
    ? guidelineEntries.map((entry) => `\`${entry}\``).join(", ")
    : `\`${homeRelative(guidelinesDir)}/\``;

  return {
    "%%DOC_PATH%%": config["docs-dir"].replace(/[/\\]+$/, ""),
    "%%GUIDELINES_FILES%%": guidelinesValue,
    "%%GUIDELINES_PATH%%": homeRelative(guidelinesDir),
    "%%SRC_PATHS%%": srcValue,
    "%%TEST_PATH%%": testValue,
    "%%PROJECT_BASE%%": projectBase,
  };
}
