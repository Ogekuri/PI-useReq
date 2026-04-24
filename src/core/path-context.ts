/**
 * @file
 * @brief Derives shared runtime path contracts for prompts, tools, and configuration flows.
 * @details Centralizes the static bootstrap paths and dynamic cwd-aligned paths used across the extension runtime. The module also exposes home-relative display formatting, trailing-slash-free normalization, and prompt-facing path facts. Runtime is O(s + p) where s is the configured source-directory count and p is aggregate path length. Side effects are limited to module-local runtime-path state mutation.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { UseReqConfig } from "./config.js";

/**
 * @brief Defines the per-project configuration file name.
 * @details The file lives directly under `base-path` and stores only persisted project configuration. Access complexity is O(1).
 */
export const PROJECT_CONFIG_FILENAME = ".pi-usereq.json";

/**
 * @brief Defines the bundled resources directory name under the installation path.
 * @details The directory contains prompts, templates, and guidelines shipped with the installed extension payload. Access complexity is O(1).
 */
export const RESOURCE_ROOT_DIRNAME = "resources";

/**
 * @brief Stores the mutable runtime path state shared across extension callbacks.
 * @details Persists the static bootstrap `base-path`, the dynamic `context-path`, the optional repository-derived `git-path`, the derived `parent-path` and `base-dir`, and the optional active worktree facts. The interface is compile-time only and introduces no runtime cost.
 */
export interface RuntimePathState {
  basePath: string;
  contextPath: string;
  gitPath?: string;
  parentPath?: string;
  baseDir: string;
  worktreeDir?: string;
  worktreePath?: string;
}

/**
 * @brief Describes the absolute runtime path context shared across extension components.
 * @details Aggregates the static installation, base, git, parent, and config paths with the dynamic context and optional worktree paths plus execution-resolved docs/tests/source absolute paths. The interface is compile-time only and introduces no runtime cost.
 */
export interface RuntimePathContext extends RuntimePathState {
  installPath: string;
  configPath: string;
  resourceRootPath: string;
  promptsPath: string;
  templatePath: string;
  guidelinesPath: string;
  docsDir: string;
  testsDir: string;
  srcDir: string[];
  docsPath: string;
  testsPath: string;
  srcPaths: string[];
}

/**
 * @brief Describes the prompt/tool-facing runtime paths rendered for display.
 * @details Mirrors `RuntimePathContext` in a serialization-oriented shape so downstream agents can consume stable `~`-relative absolute paths and trailing-slash-free relative directories without reparsing platform-specific separators. The interface is compile-time only and introduces no runtime cost.
 */
export interface RuntimePathFacts {
  installation_path: string;
  base_path: string;
  context_path: string;
  config_path: string;
  resource_root_path: string;
  prompts_path: string;
  template_path: string;
  guidelines_path: string;
  docs_directory_path: string;
  tests_directory_path: string;
  source_directory_paths: string[];
  git_path: string;
  git_path_present: boolean;
  parent_path: string;
  parent_path_present: boolean;
  base_dir: string;
  worktree_dir: string;
  worktree_dir_present: boolean;
  worktree_path: string;
  worktree_path_present: boolean;
}

/**
 * @brief Stores the mutable runtime path state for the current extension process.
 * @details The state is reset during bootstrap-style flows such as `session_start` and prompt-command preflight so later tool executions can resolve `base-path` independently from the dynamic `context-path`. Access complexity is O(1).
 */
const runtimePathState: Partial<RuntimePathState> & { baseDir: string } = {
  baseDir: "",
};

/**
 * @brief Resolves the installed extension root that owns `index.ts` and bundled resources.
 * @details Uses the current module location under `src/core` or its installed equivalent, then moves one directory upward so the returned path is the runtime installation root containing `resources/`. Runtime is O(1). No external state is mutated.
 * @return {string} Absolute installation path.
 */
export function getInstallationPath(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/**
 * @brief Formats one path with slash separators.
 * @details Rewrites backslashes to `/` without changing semantic path identity so serialized payloads remain stable across operating systems. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {string} Absolute or relative filesystem path.
 * @return {string} Slash-normalized path string.
 */
export function normalizePathSlashes(value: string): string {
  return value.replace(/\\/g, "/");
}

/**
 * @brief Removes trailing separators while preserving a filesystem root.
 * @details Keeps `/`, drive roots, and UNC roots intact while trimming redundant trailing separators from every other absolute or relative path string. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {string} Raw path string.
 * @return {string} Trailing-slash-free path string.
 */
function trimTrailingSeparatorsPreserveRoot(value: string): string {
  if (!value) {
    return "";
  }
  const parsed = path.parse(value);
  const normalizedRoot = parsed.root.replace(/[\\/]+$/, "");
  const normalizedValue = value.replace(/[\\/]+$/, "");
  if (normalizedValue === "") {
    return parsed.root || value;
  }
  if (normalizedRoot !== "" && normalizedValue === normalizedRoot) {
    return parsed.root || value;
  }
  return normalizedValue;
}

/**
 * @brief Normalizes one absolute path contract value.
 * @details Resolves the supplied value to an absolute path, removes trailing separators except for the filesystem root, and rewrites separators to `/`. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {string} Absolute or relative path candidate.
 * @return {string} Canonical trailing-slash-free absolute path.
 */
export function normalizeAbsolutePathContract(value: string): string {
  return normalizePathSlashes(trimTrailingSeparatorsPreserveRoot(path.resolve(value)));
}

/**
 * @brief Normalizes one relative-directory contract value.
 * @details Trims whitespace, rewrites separators to `/`, removes a leading `./`, and removes trailing separators so persisted `*-dir` values stay relative and trailing-slash-free. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {string} Relative-directory candidate.
 * @return {string} Canonical trailing-slash-free relative-directory string.
 */
export function normalizeRelativeDirContract(value: string): string {
  const trimmedValue = normalizePathSlashes(value.trim())
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/");
  return trimTrailingSeparatorsPreserveRoot(trimmedValue);
}

/**
 * @brief Computes the absolute project config path for one base path.
 * @details Appends `.pi-usereq.json` to the supplied base path using the canonical repository-local configuration layout. Runtime is O(1). No external state is mutated.
 * @param[in] basePath {string} Absolute or relative base path.
 * @return {string} Absolute config-file path.
 */
export function getConfigPath(basePath: string): string {
  return path.join(path.resolve(basePath), PROJECT_CONFIG_FILENAME);
}

/**
 * @brief Tests whether one path is identical to or an ancestor of another path.
 * @details Resolves both inputs, computes a relative traversal from the candidate ancestor to the candidate child, and accepts only exact matches or descendant traversals that stay within the ancestor subtree. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] ancestorPath {string} Candidate ancestor or identical path.
 * @param[in] childPath {string} Candidate child or identical path.
 * @return {boolean} `true` when `ancestorPath` equals `childPath` or strictly contains it.
 */
export function isSameOrAncestorPath(
  ancestorPath: string,
  childPath: string,
): boolean {
  const normalizedAncestorPath = path.resolve(ancestorPath);
  const normalizedChildPath = path.resolve(childPath);
  const relativePath = path.relative(
    normalizedAncestorPath,
    normalizedChildPath,
  );
  return (
    relativePath === ""
    || (!relativePath.startsWith("..") && !path.isAbsolute(relativePath))
  );
}

/**
 * @brief Derives repository-relative runtime state from one base path and optional git path.
 * @details Normalizes `base-path`, keeps `git-path` only when it is identical to or an ancestor of `base-path`, derives `parent-path` from `git-path`, and derives `base-dir` as `base-path` relative to `git-path`. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] basePath {string} Static base path candidate.
 * @param[in] gitPath {string | undefined} Optional repository-root candidate.
 * @return {{ basePath: string; gitPath?: string; parentPath?: string; baseDir: string }} Derived static path facts.
 */
function deriveStaticRuntimePathState(
  basePath: string,
  gitPath?: string,
): {
  basePath: string;
  gitPath?: string;
  parentPath?: string;
  baseDir: string;
} {
  const normalizedBasePath = path.resolve(basePath);
  const normalizedGitPath = gitPath && isSameOrAncestorPath(gitPath, normalizedBasePath)
    ? path.resolve(gitPath)
    : undefined;
  const parentPath = normalizedGitPath
    ? path.resolve(normalizedGitPath, "..")
    : undefined;
  const baseDir = normalizedGitPath
    ? normalizeRelativeDirContract(path.relative(normalizedGitPath, normalizedBasePath))
    : "";
  return {
    basePath: normalizedBasePath,
    gitPath: normalizedGitPath,
    parentPath,
    baseDir,
  };
}

/**
 * @brief Bootstraps the shared runtime path state for one extension session or command preflight.
 * @details Sets static `base-path`, initializes dynamic `context-path` to the same value, stores derived `git-path`, `parent-path`, and `base-dir`, and clears any prior worktree facts. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
 * @param[in] basePath {string} Bootstrap cwd that becomes the static base path.
 * @param[in] options {{ gitPath?: string | undefined } | undefined} Optional repository-root override.
 * @return {void} No return value.
 */
export function bootstrapRuntimePathState(
  basePath: string,
  options: { gitPath?: string | undefined } = {},
): void {
  const derivedState = deriveStaticRuntimePathState(basePath, options.gitPath);
  runtimePathState.basePath = derivedState.basePath;
  runtimePathState.contextPath = derivedState.basePath;
  runtimePathState.gitPath = derivedState.gitPath;
  runtimePathState.parentPath = derivedState.parentPath;
  runtimePathState.baseDir = derivedState.baseDir;
  runtimePathState.worktreeDir = undefined;
  runtimePathState.worktreePath = undefined;
}

/**
 * @brief Ensures the shared runtime path state has at least fallback base and context values.
 * @details Lazily bootstraps the module-local state from the supplied cwd only when no prior bootstrap has occurred, preserving any already-established static or dynamic path state. Runtime is O(1). Side effect: may initialize module-local runtime-path state.
 * @param[in] cwd {string} Fallback cwd.
 * @return {void} No return value.
 */
export function ensureRuntimePathState(cwd: string): void {
  if (!runtimePathState.basePath) {
    bootstrapRuntimePathState(cwd);
    return;
  }
  runtimePathState.contextPath ??= path.resolve(cwd);
}

/**
 * @brief Returns the current static base path.
 * @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
 * @param[in] fallbackPath {string} Fallback cwd.
 * @return {string} Static base path.
 */
export function getRuntimeBasePath(fallbackPath: string): string {
  const candidatePath = path.resolve(runtimePathState.basePath ?? fallbackPath);
  return fs.existsSync(candidatePath)
    ? candidatePath
    : path.resolve(fallbackPath);
}

/**
 * @brief Returns the current dynamic context path.
 * @details Falls back to the supplied path only when the runtime path state has not been bootstrapped yet. Runtime is O(1). No external state is mutated.
 * @param[in] fallbackPath {string} Fallback cwd.
 * @return {string} Dynamic context path.
 */
export function getRuntimeContextPath(fallbackPath: string): string {
  const candidatePath = path.resolve(runtimePathState.contextPath ?? fallbackPath);
  return fs.existsSync(candidatePath)
    ? candidatePath
    : path.resolve(fallbackPath);
}

/**
 * @brief Stores the derived git-root facts in the shared runtime path state.
 * @details Re-derives `parent-path` and `base-dir` from the stored static `base-path` plus the supplied `git-path`, preserving the existing dynamic context path. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
 * @param[in] gitPath {string | undefined} Optional repository-root path.
 * @return {void} No return value.
 */
export function setRuntimeGitPath(gitPath?: string): void {
  const basePath = getRuntimeBasePath(runtimePathState.contextPath ?? path.sep);
  const derivedState = deriveStaticRuntimePathState(basePath, gitPath);
  runtimePathState.basePath = derivedState.basePath;
  runtimePathState.gitPath = derivedState.gitPath;
  runtimePathState.parentPath = derivedState.parentPath;
  runtimePathState.baseDir = derivedState.baseDir;
}

/**
 * @brief Stores the current dynamic context path.
 * @details Replaces the module-local `context-path` with the supplied trailing-slash-free absolute path. Runtime is O(1). Side effect: mutates module-local runtime-path state.
 * @param[in] contextPath {string} Next context path.
 * @return {void} No return value.
 */
export function setRuntimeContextPath(contextPath: string): void {
  runtimePathState.contextPath = path.resolve(contextPath);
}

/**
 * @brief Stores the current worktree directory and path facts.
 * @details Normalizes the supplied relative `worktree-dir` and absolute `worktree-path` so later prompt rendering and tool execution can reuse the derived values across modules. Runtime is O(p) in path length. Side effect: mutates module-local runtime-path state.
 * @param[in] options {{ worktreeDir?: string | undefined; worktreePath?: string | undefined }} Optional active worktree facts.
 * @return {void} No return value.
 */
export function setRuntimeWorktreePathState(options: {
  worktreeDir?: string | undefined;
  worktreePath?: string | undefined;
}): void {
  runtimePathState.worktreeDir = options.worktreeDir
    ? normalizeRelativeDirContract(options.worktreeDir)
    : undefined;
  runtimePathState.worktreePath = options.worktreePath
    ? path.resolve(options.worktreePath)
    : undefined;
}

/**
 * @brief Returns a snapshot of the shared runtime path state.
 * @details Materializes the current static and dynamic path facts into a read-only copy suitable for prompt rendering, tool execution, and tests. Runtime is O(1). No external state is mutated.
 * @return {RuntimePathState} Snapshot of the current runtime path state.
 */
export function getRuntimePathState(): RuntimePathState {
  ensureRuntimePathState(process.cwd());
  return {
    basePath: getRuntimeBasePath(process.cwd()),
    contextPath: getRuntimeContextPath(process.cwd()),
    gitPath: runtimePathState.gitPath,
    parentPath: runtimePathState.parentPath,
    baseDir: runtimePathState.baseDir,
    worktreeDir: runtimePathState.worktreeDir,
    worktreePath: runtimePathState.worktreePath,
  };
}

/**
 * @brief Formats one absolute path relative to the user home using `~` when possible.
 * @details Returns `~` when the path equals the current home directory and returns `~/...` when the path descends from it; otherwise returns the normalized absolute path unchanged. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] absolutePath {string} Absolute or relative path candidate.
 * @return {string} Home-relative or trailing-slash-free absolute path.
 */
export function formatRuntimePathForDisplay(absolutePath: string): string {
  const normalizedAbsolutePath = normalizeAbsolutePathContract(absolutePath);
  const homePath = normalizeAbsolutePathContract(os.homedir());
  if (normalizedAbsolutePath === homePath) {
    return "~";
  }
  if (isSameOrAncestorPath(homePath, normalizedAbsolutePath)) {
    const relativePath = normalizeRelativeDirContract(
      path.relative(homePath, normalizedAbsolutePath),
    );
    return relativePath === "" ? "~" : `~/${relativePath}`;
  }
  return normalizedAbsolutePath;
}

/**
 * @brief Builds the absolute runtime path context for one base path, context path, and configuration.
 * @details Derives static `install-path`, `git-path`, `parent-path`, and `base-dir`, resolves the static `config-path`, preserves the dynamic `context-path`, and resolves docs/tests/source absolute paths against `context-path` so worktree-backed execution uses the active checkout. Runtime is O(s + p) where s is configured source-directory count and p is aggregate path length. No external state is mutated.
 * @param[in] basePath {string} Static base path.
 * @param[in] contextPath {string} Dynamic context path.
 * @param[in] config {Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">} Effective relative directory configuration.
 * @param[in] options {{ installationPath?: string; gitPath?: string | undefined; worktreeDir?: string | undefined; worktreePath?: string | undefined } | undefined} Optional installation, repository, and worktree overrides.
 * @return {RuntimePathContext} Absolute runtime path context.
 */
export function buildRuntimePathContext(
  basePath: string,
  contextPath: string,
  config: Pick<UseReqConfig, "docs-dir" | "tests-dir" | "src-dir">,
  options: {
    installationPath?: string;
    gitPath?: string | undefined;
    worktreeDir?: string | undefined;
    worktreePath?: string | undefined;
  } = {},
): RuntimePathContext {
  const normalizedBasePath = path.resolve(basePath);
  const normalizedContextPath = path.resolve(contextPath);
  const normalizedInstallPath = path.resolve(
    options.installationPath ?? getInstallationPath(),
  );
  const derivedState = deriveStaticRuntimePathState(
    normalizedBasePath,
    options.gitPath,
  );
  const docsDir = normalizeRelativeDirContract(config["docs-dir"]) || "pi-usereq/docs";
  const testsDir = normalizeRelativeDirContract(config["tests-dir"]) || "tests";
  const srcDir = config["src-dir"]
    .map((entry) => normalizeRelativeDirContract(entry))
    .filter((entry) => entry !== "");
  const effectiveSrcDir = srcDir.length > 0 ? srcDir : ["src"];
  const resourceRootPath = path.join(normalizedInstallPath, RESOURCE_ROOT_DIRNAME);
  return {
    installPath: normalizedInstallPath,
    basePath: normalizedBasePath,
    contextPath: normalizedContextPath,
    gitPath: derivedState.gitPath,
    parentPath: derivedState.parentPath,
    baseDir: derivedState.baseDir,
    worktreeDir: options.worktreeDir
      ? normalizeRelativeDirContract(options.worktreeDir)
      : undefined,
    worktreePath: options.worktreePath
      ? path.resolve(options.worktreePath)
      : undefined,
    configPath: getConfigPath(normalizedBasePath),
    resourceRootPath,
    promptsPath: path.join(resourceRootPath, "prompts"),
    templatePath: path.join(resourceRootPath, "templates"),
    guidelinesPath: path.join(resourceRootPath, "guidelines"),
    docsDir,
    testsDir,
    srcDir: effectiveSrcDir,
    docsPath: path.resolve(normalizedContextPath, docsDir),
    testsPath: path.resolve(normalizedContextPath, testsDir),
    srcPaths: effectiveSrcDir.map((entry) => path.resolve(normalizedContextPath, entry)),
  };
}

/**
 * @brief Converts the absolute runtime path context into prompt/tool-facing path facts.
 * @details Re-encodes every absolute path with the home-relative formatter while preserving trailing-slash-free relative directories for `base-dir` and `worktree-dir`. Runtime is O(s + p) where s is source-directory count and p is aggregate path length. No external state is mutated.
 * @param[in] context {RuntimePathContext} Absolute runtime path context.
 * @return {RuntimePathFacts} Display-oriented runtime path facts.
 */
export function buildRuntimePathFacts(
  context: RuntimePathContext,
): RuntimePathFacts {
  return {
    installation_path: formatRuntimePathForDisplay(context.installPath),
    base_path: formatRuntimePathForDisplay(context.basePath),
    context_path: formatRuntimePathForDisplay(context.contextPath),
    config_path: formatRuntimePathForDisplay(context.configPath),
    resource_root_path: formatRuntimePathForDisplay(context.resourceRootPath),
    prompts_path: formatRuntimePathForDisplay(context.promptsPath),
    template_path: formatRuntimePathForDisplay(context.templatePath),
    guidelines_path: formatRuntimePathForDisplay(context.guidelinesPath),
    docs_directory_path: formatRuntimePathForDisplay(context.docsPath),
    tests_directory_path: formatRuntimePathForDisplay(context.testsPath),
    source_directory_paths: context.srcPaths.map((entry) => formatRuntimePathForDisplay(entry)),
    git_path: context.gitPath ? formatRuntimePathForDisplay(context.gitPath) : "",
    git_path_present: Boolean(context.gitPath),
    parent_path: context.parentPath ? formatRuntimePathForDisplay(context.parentPath) : "",
    parent_path_present: Boolean(context.parentPath),
    base_dir: context.baseDir,
    worktree_dir: context.worktreeDir ?? "",
    worktree_dir_present: Boolean(context.worktreeDir),
    worktree_path: context.worktreePath ? formatRuntimePathForDisplay(context.worktreePath) : "",
    worktree_path_present: Boolean(context.worktreePath),
  };
}
