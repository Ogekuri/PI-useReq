/**
 * @file
 * @brief Derives shared runtime path context for prompts, tools, and configuration flows.
 * @details Resolves installation, execution, base, config, resource, docs, test, source, and optional git paths from the active runtime context, validates ancestor constraints for repository roots, and formats prompt-visible paths relative to the user home via platform-native environment variables. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. Side effects are limited to filesystem-path normalization.
 */

import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseReqConfig } from "./config.js";

/**
 * @brief Defines the per-project configuration directory name.
 * @details The directory lives directly under `base-path` and stores `config.json` for the current execution context. Access complexity is O(1).
 */
export const PROJECT_CONFIG_DIRNAME = ".pi-usereq";

/**
 * @brief Defines the bundled resources directory name under the installation path.
 * @details The directory contains prompts, templates, and guidelines shipped with the installed extension payload. Access complexity is O(1).
 */
export const RESOURCE_ROOT_DIRNAME = "resources";

/**
 * @brief Describes the absolute runtime path context shared across extension components.
 * @details Aggregates the derived installation, execution, base, config, resource, documentation, tests, source, template, guideline, and optional git paths needed by prompt rendering and tool payload generation. The interface is compile-time only and introduces no runtime cost.
 */
export interface RuntimePathContext {
  installationPath: string;
  executionPath: string;
  basePath: string;
  configPath: string;
  resourceRoot: string;
  promptsPath: string;
  templatesPath: string;
  guidelinesPath: string;
  docsDir: string;
  testsDir: string;
  srcDirs: string[];
  docsPath: string;
  testsPath: string;
  srcPaths: string[];
  gitPath?: string;
}

/**
 * @brief Describes the prompt/tool-facing runtime paths rendered with a home-environment-variable prefix when possible.
 * @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable, user-home-relative path strings without reparsing absolute local paths. The interface is compile-time only and introduces no runtime cost.
 */
export interface RuntimePathFacts {
  installation_path: string;
  execution_path: string;
  base_path: string;
  config_path: string;
  resource_root: string;
  prompts_path: string;
  templates_path: string;
  guidelines_path: string;
  docs_directory_path: string;
  tests_directory_path: string;
  source_directory_paths: string[];
  git_path: string;
  git_path_present: boolean;
}

/**
 * @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
 * @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
 * @return {string} Absolute installation path.
 */
export function getInstallationPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * @brief Computes the absolute project config path for one base path.
 * @details Appends `.pi-usereq/config.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
 * @param[in] basePath {string} Absolute or relative base path.
 * @return {string} Absolute config-file path.
 */
export function getConfigPath(basePath: string): string {
  return path.join(path.resolve(basePath), PROJECT_CONFIG_DIRNAME, "config.json");
}

/**
 * @brief Formats one path with slash separators.
 * @details Normalizes the supplied path and converts platform separators to `/` so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {string} Absolute or relative filesystem path.
 * @return {string} Slash-normalized path string.
 */
export function normalizePathSlashes(value: string): string {
  return value.split(path.sep).join("/");
}

/**
 * @brief Tests whether one path is identical to or an ancestor of another path.
 * @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] ancestorPath {string} Candidate ancestor or identical path.
 * @param[in] childPath {string} Candidate child or identical path.
 * @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.
 */
export function isSameOrAncestorPath(ancestorPath: string, childPath: string): boolean {
  const normalizedAncestorPath = path.resolve(ancestorPath);
  const normalizedChildPath = path.resolve(childPath);
  const relativePath = path.relative(normalizedAncestorPath, normalizedChildPath);
  return relativePath === "" || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath));
}

/**
 * @brief Formats one absolute path relative to the user home using platform-native home environment variables when possible.
 * @details Returns `$HOME` for POSIX platforms and `%USERPROFILE%` for Windows when the path equals or descends from the current home directory; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] absolutePath {string} Absolute or relative path candidate.
 * @return {string} Home-environment-relative or slash-normalized absolute path.
 */
export function formatRuntimePathForDisplay(absolutePath: string): string {
  const normalizedAbsolutePath = path.resolve(absolutePath);
  const homePath = path.resolve(os.homedir());
  const homeToken = process.platform === "win32" ? "%USERPROFILE%" : "$HOME";
  if (normalizedAbsolutePath === homePath) {
    return homeToken;
  }
  if (isSameOrAncestorPath(homePath, normalizedAbsolutePath)) {
    const relativePath = normalizePathSlashes(path.relative(homePath, normalizedAbsolutePath));
    return relativePath === "" ? homeToken : `${homeToken}/${relativePath}`;
  }
  return normalizePathSlashes(normalizedAbsolutePath);
}

/**
 * @brief Builds the absolute runtime path context for one execution directory and configuration.
 * @details Derives `base-path` from the supplied execution path, derives `config-path` under `.pi-usereq`, resolves docs/tests/source directories against the base path, derives installation-owned resource directories, and keeps `git-path` only when it satisfies the base-path ancestor constraint. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
 * @param[in] executionPath {string} Current execution directory.
 * @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective configuration fields required for path derivation.
 * @param[in] options {{ installationPath?: string; gitPath?: string | undefined } | undefined} Optional installation and git-root overrides.
 * @return {RuntimePathContext} Absolute runtime path context.
 */
export function buildRuntimePathContext(
  executionPath: string,
  config: Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">,
  options: { installationPath?: string; gitPath?: string | undefined } = {},
): RuntimePathContext {
  const normalizedExecutionPath = path.resolve(executionPath);
  const normalizedBasePath = normalizedExecutionPath;
  const normalizedInstallationPath = path.resolve(options.installationPath ?? getInstallationPath());
  const resourceRoot = path.join(normalizedInstallationPath, RESOURCE_ROOT_DIRNAME);
  const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
  const testsDir = config["tests-dir"].replace(/[/\\]+$/, "");
  const srcDirs = config["src-dir"].map((entry) => entry.replace(/[/\\]+$/, ""));
  const docsPath = path.resolve(normalizedBasePath, docsDir);
  const testsPath = path.resolve(normalizedBasePath, testsDir);
  const srcPaths = srcDirs.map((entry) => path.resolve(normalizedBasePath, entry));
  const gitPath = options.gitPath && isSameOrAncestorPath(options.gitPath, normalizedBasePath)
    ? path.resolve(options.gitPath)
    : undefined;
  return {
    installationPath: normalizedInstallationPath,
    executionPath: normalizedExecutionPath,
    basePath: normalizedBasePath,
    configPath: getConfigPath(normalizedBasePath),
    resourceRoot,
    promptsPath: path.join(resourceRoot, "prompts"),
    templatesPath: path.join(resourceRoot, "templates"),
    guidelinesPath: path.join(resourceRoot, "guidelines"),
    docsDir,
    testsDir,
    srcDirs,
    docsPath,
    testsPath,
    srcPaths,
    gitPath,
  };
}

/**
 * @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
 * @details Re-encodes every absolute path with the user-home environment-variable formatter while preserving path presence for the optional git root. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
 * @param[in] context {RuntimePathContext} Absolute runtime path context.
 * @return {RuntimePathFacts} Display-oriented runtime path facts.
 */
export function buildRuntimePathFacts(context: RuntimePathContext): RuntimePathFacts {
  return {
    installation_path: formatRuntimePathForDisplay(context.installationPath),
    execution_path: formatRuntimePathForDisplay(context.executionPath),
    base_path: formatRuntimePathForDisplay(context.basePath),
    config_path: formatRuntimePathForDisplay(context.configPath),
    resource_root: formatRuntimePathForDisplay(context.resourceRoot),
    prompts_path: formatRuntimePathForDisplay(context.promptsPath),
    templates_path: formatRuntimePathForDisplay(context.templatesPath),
    guidelines_path: formatRuntimePathForDisplay(context.guidelinesPath),
    docs_directory_path: formatRuntimePathForDisplay(context.docsPath),
    tests_directory_path: formatRuntimePathForDisplay(context.testsPath),
    source_directory_paths: context.srcPaths.map((entry) => formatRuntimePathForDisplay(entry)),
    git_path: context.gitPath ? formatRuntimePathForDisplay(context.gitPath) : "",
    git_path_present: Boolean(context.gitPath),
  };
}
