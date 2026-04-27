/**
 * @file
 * @brief Loads, normalizes, merges, and persists pi-usereq configuration.
 * @details Defines the effective configuration schema, split local/global persistence contracts, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq.json` and `~/.config/pi-usereq/config.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
  buildRuntimePathContext,
  buildRuntimePathFacts,
  formatRuntimePathForDisplay,
  getConfigPath,
  getGlobalConfigPath as resolveGlobalConfigPath,
  normalizeRelativeDirContract,
} from "./path-context.js";
import {
  DEFAULT_PI_NOTIFY_CMD,
  DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
  DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
  DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
  DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
  DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
  DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT,
  hasPiNotifyPushoverCredentials,
  normalizePiNotifyCommand,
  normalizePiNotifyPushoverCredential,
  normalizePiNotifyPushoverPriority,
  normalizePiNotifyShortcut,
  normalizePiNotifySoundLevel,
  normalizePiNotifyTemplateValue,
} from "./pi-notify.js";
import {
  DEFAULT_DEBUG_ENABLED,
  DEFAULT_DEBUG_LOG_FILE,
  DEFAULT_DEBUG_LOG_ON_STATUS,
  DEFAULT_DEBUG_STATUS_CHANGES,
  DEFAULT_DEBUG_WORKFLOW_EVENTS,
  normalizeDebugEnabled,
  normalizeDebugEnabledPrompts,
  normalizeDebugEnabledTools,
  normalizeDebugLogFile,
  normalizeDebugLogOnStatus,
  normalizeDebugStatusChanges,
  normalizeDebugWorkflowEvents,
} from "./debug-runtime.js";
import { normalizeEnabledPiUsereqTools } from "./pi-usereq-tools.js";
import { makeRelativeIfContainsProject } from "./utils.js";

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
 * @brief Represents the persisted per-language static-check enable flag.
 * @details Narrows persisted per-language enablement to the documented `enable|disable` domain reused by configuration loading, menu toggles, and static-check dispatch. The alias is compile-time only and introduces no runtime cost.
 */
export type StaticCheckEnabled = "enable" | "disable";

/**
 * @brief Describes one persisted per-language static-check configuration object.
 * @details Couples the per-language enable flag with the ordered checker-entry list so menu toggles, config serialization, and execution dispatch can distinguish configured-but-disabled languages from enabled active checker lists. The interface is compile-time only and introduces no runtime cost.
 */
export interface StaticCheckLanguageConfig {
  enabled: StaticCheckEnabled;
  checkers: StaticCheckEntry[];
}

/**
 * @brief Defines the effective pi-usereq configuration schema.
 * @details Captures the merged runtime view produced from project-local and cross-project persisted scopes, including documentation paths, source/test directory selection, per-language static-check enablement plus checker configuration, prompt-command worktree settings, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.
 */
export interface UseReqConfig {
  "docs-dir": string;
  "tests-dir": string;
  "src-dir": string[];
  "static-check": Record<string, StaticCheckLanguageConfig>;
  "enabled-tools": string[];
  AUTO_GIT_COMMIT: "enable" | "disable";
  GIT_WORKTREE_ENABLED: "enable" | "disable";
  GIT_WORKTREE_PREFIX: string;
  DEBUG_ENABLED: "enable" | "disable";
  DEBUG_LOG_FILE: string;
  DEBUG_STATUS_CHANGES: "enable" | "disable";
  DEBUG_WORKFLOW_EVENTS: "enable" | "disable";
  DEBUG_LOG_ON_STATUS: "any" | "idle" | "checking" | "running" | "merging" | "error";
  DEBUG_ENABLED_TOOLS: string[];
  DEBUG_ENABLED_PROMPTS: string[];
  "notify-enabled": boolean;
  "notify-on-completed": boolean;
  "notify-on-interrupted": boolean;
  "notify-on-failed": boolean;
  "notify-sound": "none" | "low" | "mid" | "high";
  "notify-sound-on-completed": boolean;
  "notify-sound-on-interrupted": boolean;
  "notify-sound-on-failed": boolean;
  "notify-sound-toggle-shortcut": string;
  "notify-pushover-enabled": boolean;
  "notify-pushover-on-completed": boolean;
  "notify-pushover-on-interrupted": boolean;
  "notify-pushover-on-failed": boolean;
  "notify-pushover-user-key": string;
  "notify-pushover-api-token": string;
  "notify-pushover-priority": 0 | 1;
  "notify-pushover-title": string;
  "notify-pushover-text": string;
  PI_NOTIFY_CMD: string;
  PI_NOTIFY_SOUND_LOW_CMD: string;
  PI_NOTIFY_SOUND_MID_CMD: string;
  PI_NOTIFY_SOUND_HIGH_CMD: string;
}

/**
 * @brief Defines one persisted local static-check language configuration.
 * @details Stores only the project-local enable flag so checker command definitions can live exclusively in global configuration. The interface is compile-time only and introduces no runtime cost.
 */
interface LocalStaticCheckLanguageConfig {
  enabled: StaticCheckEnabled;
}

/**
 * @brief Defines one persisted global static-check language configuration.
 * @details Stores only the cross-project checker-entry array so project-local files do not duplicate command definitions. The interface is compile-time only and introduces no runtime cost.
 */
interface GlobalStaticCheckLanguageConfig {
  checkers: StaticCheckEntry[];
}

/**
 * @brief Defines the persisted local pi-usereq configuration schema.
 * @details Captures project-scoped directory, debug, and static-check enablement fields written to `<base-path>/.pi-usereq.json` while excluding global notification, tool, git, and checker-command settings. The interface is compile-time only and introduces no runtime side effects.
 */
interface UseReqLocalConfig {
  "docs-dir": string;
  "tests-dir": string;
  "src-dir": string[];
  "static-check": Record<string, LocalStaticCheckLanguageConfig>;
  DEBUG_ENABLED: "enable" | "disable";
  DEBUG_LOG_FILE: string;
  DEBUG_STATUS_CHANGES: "enable" | "disable";
  DEBUG_WORKFLOW_EVENTS: "enable" | "disable";
  DEBUG_LOG_ON_STATUS: "any" | "idle" | "checking" | "running" | "merging" | "error";
  DEBUG_ENABLED_TOOLS: string[];
  DEBUG_ENABLED_PROMPTS: string[];
}

/**
 * @brief Defines the persisted global pi-usereq configuration schema.
 * @details Captures cross-project static-check checker commands, enabled tool names, git automation fields, and notification settings written to `~/.config/pi-usereq/config.json` while excluding project-local directory and debug fields. The interface is compile-time only and introduces no runtime side effects.
 */
interface UseReqGlobalConfig {
  "static-check": Record<string, GlobalStaticCheckLanguageConfig>;
  "enabled-tools": string[];
  AUTO_GIT_COMMIT: "enable" | "disable";
  GIT_WORKTREE_ENABLED: "enable" | "disable";
  GIT_WORKTREE_PREFIX: string;
  "notify-enabled": boolean;
  "notify-on-completed": boolean;
  "notify-on-interrupted": boolean;
  "notify-on-failed": boolean;
  "notify-sound": "none" | "low" | "mid" | "high";
  "notify-sound-on-completed": boolean;
  "notify-sound-on-interrupted": boolean;
  "notify-sound-on-failed": boolean;
  "notify-sound-toggle-shortcut": string;
  "notify-pushover-enabled": boolean;
  "notify-pushover-on-completed": boolean;
  "notify-pushover-on-interrupted": boolean;
  "notify-pushover-on-failed": boolean;
  "notify-pushover-user-key": string;
  "notify-pushover-api-token": string;
  "notify-pushover-priority": 0 | 1;
  "notify-pushover-title": string;
  "notify-pushover-text": string;
  PI_NOTIFY_CMD: string;
  PI_NOTIFY_SOUND_LOW_CMD: string;
  PI_NOTIFY_SOUND_MID_CMD: string;
  PI_NOTIFY_SOUND_HIGH_CMD: string;
}

/**
 * @brief Defines the default documentation directory relative to the project root.
 * @details Used when no persisted `docs-dir` value exists or normalization yields an empty string. Lookup complexity is O(1).
 * @satisfies CTN-001
 */
export const DEFAULT_DOCS_DIR = "pi-usereq/docs";
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
 * @brief Defines the canonical supported static-check language order used by default config serialization.
 * @details The array lists every supported user-configurable language exactly once so default config builders and config serializers can emit deterministic per-language records. Access complexity is O(1).
 */
export const DEFAULT_STATIC_CHECK_LANGUAGES = [
  "C",
  "C#",
  "C++",
  "Elixir",
  "Go",
  "Haskell",
  "Java",
  "JavaScript",
  "Kotlin",
  "Lua",
  "Perl",
  "PHP",
  "Python",
  "Ruby",
  "Rust",
  "Scala",
  "Shell",
  "Swift",
  "TypeScript",
  "Zig",
] as const;

/**
 * @brief Defines the default static-check entries per language.
 * @details Seeds the documented default Command checker lists for enabled-by-default languages while languages omitted from the map default to empty checker lists. Access complexity is O(1).
 * @satisfies REQ-250, REQ-251, REQ-252
 */
const DEFAULT_STATIC_CHECK_CHECKERS: Record<string, StaticCheckEntry[]> = {
  C: [
    {
      module: "Command",
      cmd: "cppcheck",
      params: [
        "--error-exitcode=1",
        "--enable=warning,style,performance,portability",
        "--std=c11",
      ],
    },
    {
      module: "Command",
      cmd: "clang-format",
      params: ["--dry-run", "--Werror"],
    },
  ],
  "C++": [
    {
      module: "Command",
      cmd: "cppcheck",
      params: [
        "--error-exitcode=1",
        "--enable=warning,style,performance,portability",
        "--std=c++20",
      ],
    },
    {
      module: "Command",
      cmd: "clang-format",
      params: ["--dry-run", "--Werror"],
    },
  ],
  Python: [
    {
      module: "Command",
      cmd: "pyright",
      params: ["--outputjson"],
    },
    {
      module: "Command",
      cmd: "ruff",
      params: ["check"],
    },
  ],
  JavaScript: [
    {
      module: "Command",
      cmd: "node",
      params: ["--check"],
    },
  ],
  TypeScript: [
    {
      module: "Command",
      cmd: "npx",
      params: ["eslint"],
    },
  ],
};

/**
 * @brief Clones one static-check entry into its persisted shape.
 * @details Copies only the stable module, cmd, and params fields so runtime-only or unknown metadata never leaks into persisted configuration payloads. Runtime is O(p) in parameter count. No external state is mutated.
 * @param[in] entry {StaticCheckEntry} Source static-check entry.
 * @return {StaticCheckEntry} Persistable static-check entry clone.
 */
function cloneStaticCheckEntry(entry: StaticCheckEntry): StaticCheckEntry {
  const params = Array.isArray(entry.params)
    ? entry.params.map((value) => String(value)).filter((value) => value.trim().length > 0)
    : [];
  return {
    module: String(entry.module ?? ""),
    ...(typeof entry.cmd === "string" && entry.cmd.trim() ? { cmd: entry.cmd.trim() } : {}),
    ...(params.length > 0 ? { params } : {}),
  };
}

/**
 * @brief Builds one per-language static-check configuration object.
 * @details Clones the supplied checker entries, derives `enabled` from the explicit argument or checker-list emptiness, and preserves checker order for menu and dispatch determinism. Runtime is O(c + p). No external state is mutated.
 * @param[in] checkers {StaticCheckEntry[]} Ordered checker entries.
 * @param[in] enabled {StaticCheckEnabled | undefined} Optional explicit enable flag.
 * @return {StaticCheckLanguageConfig} Normalized per-language config object.
 */
export function createStaticCheckLanguageConfig(
  checkers: StaticCheckEntry[],
  enabled?: StaticCheckEnabled,
): StaticCheckLanguageConfig {
  const normalizedCheckers = checkers.map(cloneStaticCheckEntry);
  return {
    enabled: enabled ?? (normalizedCheckers.length > 0 ? "enable" : "disable"),
    checkers: normalizedCheckers,
  };
}

/**
 * @brief Builds one persisted local static-check language configuration object.
 * @details Stores only the normalized enable flag so local project files do not duplicate checker command definitions. Runtime is O(1). No external state is mutated.
 * @param[in] enabled {StaticCheckEnabled} Canonical per-language enable flag.
 * @return {LocalStaticCheckLanguageConfig} Persistable local static-check language config.
 */
function createLocalStaticCheckLanguageConfig(
  enabled: StaticCheckEnabled,
): LocalStaticCheckLanguageConfig {
  return { enabled };
}

/**
 * @brief Builds one persisted global static-check language configuration object.
 * @details Clones the supplied checker entries so global configuration retains only stable module, command, and parameter fields. Runtime is O(c + p). No external state is mutated.
 * @param[in] checkers {StaticCheckEntry[]} Ordered checker entries.
 * @return {GlobalStaticCheckLanguageConfig} Persistable global static-check language config.
 */
function createGlobalStaticCheckLanguageConfig(
  checkers: StaticCheckEntry[],
): GlobalStaticCheckLanguageConfig {
  return {
    checkers: checkers.map(cloneStaticCheckEntry),
  };
}

/**
 * @brief Returns the documented default global static-check checker map.
 * @details Emits one checker-array object for every supported language, preserving documented Command entries for default-enabled languages and `[]` for every other language. Runtime is O(l + c). No external state is mutated.
 * @return {Record<string, GlobalStaticCheckLanguageConfig>} Fresh default global checker map.
 */
function getDefaultGlobalStaticCheckConfig(): Record<string, GlobalStaticCheckLanguageConfig> {
  return Object.fromEntries(DEFAULT_STATIC_CHECK_LANGUAGES.map((language) => [
    language,
    createGlobalStaticCheckLanguageConfig(DEFAULT_STATIC_CHECK_CHECKERS[language] ?? []),
  ]));
}

/**
 * @brief Returns the documented default local static-check enable map.
 * @details Derives each per-language enable flag from the supplied global checker definitions using the rule `enable` when `checkers` is non-empty and `disable` otherwise. Runtime is O(l). No external state is mutated.
 * @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Global checker map used to derive default enablement.
 * @return {Record<string, LocalStaticCheckLanguageConfig>} Fresh default local enable map.
 */
function getDefaultLocalStaticCheckConfig(
  globalStaticCheckConfig: Record<string, GlobalStaticCheckLanguageConfig>,
): Record<string, LocalStaticCheckLanguageConfig> {
  return Object.fromEntries(Object.entries(globalStaticCheckConfig).map(([language, languageConfig]) => [
    language,
    createLocalStaticCheckLanguageConfig(
      languageConfig.checkers.length > 0 ? "enable" : "disable",
    ),
  ]));
}

/**
 * @brief Merges local enable flags with global checker definitions into the effective static-check map.
 * @details Unifies all language keys present in either persisted scope, applies the default-enable rule when the local scope omits a language, and clones checker entries into the effective runtime config. Runtime is O(l + c + p). No external state is mutated.
 * @param[in] localStaticCheckConfig {Record<string, LocalStaticCheckLanguageConfig>} Persisted local enable map.
 * @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Persisted global checker map.
 * @return {Record<string, StaticCheckLanguageConfig>} Effective per-language static-check config.
 */
function mergeStaticCheckConfig(
  localStaticCheckConfig: Record<string, LocalStaticCheckLanguageConfig>,
  globalStaticCheckConfig: Record<string, GlobalStaticCheckLanguageConfig>,
): Record<string, StaticCheckLanguageConfig> {
  const languages = new Set<string>([
    ...Object.keys(globalStaticCheckConfig),
    ...Object.keys(localStaticCheckConfig),
  ]);
  return Object.fromEntries([...languages].map((language) => {
    const globalLanguageConfig = globalStaticCheckConfig[language]
      ?? createGlobalStaticCheckLanguageConfig([]);
    const checkers = globalLanguageConfig.checkers.map(cloneStaticCheckEntry);
    const defaultEnabled = checkers.length > 0 ? "enable" : "disable";
    const enabled = normalizeStaticCheckEnabled(
      localStaticCheckConfig[language]?.enabled,
      defaultEnabled,
    );
    return [language, createStaticCheckLanguageConfig(checkers, enabled)];
  }));
}

/**
 * @brief Returns the documented default static-check configuration.
 * @details Emits one effective per-language config object for every supported language by merging documented global checker defaults with derived local enable defaults. Runtime is O(l + c). No external state is mutated.
 * @return {Record<string, StaticCheckLanguageConfig>} Fresh default effective static-check config.
 * @satisfies REQ-249, REQ-250, REQ-251, REQ-252, REQ-316
 */
export function getDefaultStaticCheckConfig(): Record<string, StaticCheckLanguageConfig> {
  const globalStaticCheckConfig = getDefaultGlobalStaticCheckConfig();
  return mergeStaticCheckConfig(
    getDefaultLocalStaticCheckConfig(globalStaticCheckConfig),
    globalStaticCheckConfig,
  );
}

/**
 * @brief Normalizes one persisted per-language static-check enable flag.
 * @details Accepts only the documented `enable|disable` values and falls back to the supplied default when the candidate is absent or invalid. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted enable flag.
 * @param[in] defaultValue {StaticCheckEnabled} Fallback enable flag.
 * @return {StaticCheckEnabled} Canonical per-language enable flag.
 * @satisfies REQ-249
 */
export function normalizeStaticCheckEnabled(
  value: unknown,
  defaultValue: StaticCheckEnabled,
): StaticCheckEnabled {
  return value === "enable" || value === "disable" ? value : defaultValue;
}

/**
 * @brief Resolves the active checker list for one language.
 * @details Returns the persisted checker list only when the language is enabled; disabled or missing languages yield an empty list without mutating the source config. Runtime is O(c). No external state is mutated.
 * @param[in] staticCheckConfig {Record<string, StaticCheckLanguageConfig>} Effective static-check config.
 * @param[in] language {string} Canonical language name.
 * @return {StaticCheckEntry[]} Active checker list for the language.
 * @satisfies REQ-019
 */
export function getActiveStaticCheckEntries(
  staticCheckConfig: Record<string, StaticCheckLanguageConfig>,
  language: string,
): StaticCheckEntry[] {
  const languageConfig = staticCheckConfig[language];
  if (!languageConfig || languageConfig.enabled !== "enable") {
    return [];
  }
  return languageConfig.checkers.map(cloneStaticCheckEntry);
}

/**
 * @brief Defines the default automatic git-commit prompt mode.
 * @details New global configs enable bundled commit-instruction injection unless the persisted cross-project config explicitly disables it. Access complexity is O(1).
 * @satisfies CTN-018, REQ-212
 */
export const DEFAULT_AUTO_GIT_COMMIT = "enable" as const;
/**
 * @brief Normalizes one persisted automatic git-commit mode value.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_AUTO_GIT_COMMIT` for all other payloads. Runtime is O(1). No side effects occur.
 * @param[in] value {unknown} Candidate persisted automatic git-commit payload.
 * @return {"enable" | "disable"} Canonical automatic git-commit mode.
 * @satisfies REQ-212
 */
export function normalizeAutoGitCommit(value: unknown): "enable" | "disable" {
  return value === "disable" ? "disable" : DEFAULT_AUTO_GIT_COMMIT;
}
/**
 * @brief Defines the default worktree orchestration mode.
 * @details New global configs enable prompt-command worktree orchestration unless the persisted cross-project config explicitly disables it. Access complexity is O(1).
 * @satisfies CTN-018, REQ-204
 */
export const DEFAULT_GIT_WORKTREE_ENABLED = "enable" as const;
/**
 * @brief Normalizes one persisted worktree-enable flag value.
 * @details Accepts only the documented `enable|disable` values and falls back to `DEFAULT_GIT_WORKTREE_ENABLED` for all other payloads. Runtime is O(1). No side effects occur.
 * @param[in] value {unknown} Candidate persisted worktree-enable payload.
 * @return {"enable" | "disable"} Canonical persisted worktree-enable mode.
 * @satisfies REQ-204
 */
export function normalizeGitWorktreeEnabled(value: unknown): "enable" | "disable" {
  return value === "disable" ? "disable" : DEFAULT_GIT_WORKTREE_ENABLED;
}
/**
 * @brief Resolves the effective worktree mode after automatic-commit policy is applied.
 * @details Forces `disable` whenever `AUTO_GIT_COMMIT` is disabled; otherwise preserves the normalized persisted worktree flag. Runtime is O(1). No side effects occur.
 * @param[in] autoGitCommit {"enable" | "disable"} Effective automatic git-commit mode.
 * @param[in] gitWorktreeEnabled {"enable" | "disable"} Normalized persisted worktree-enable mode.
 * @return {"enable" | "disable"} Effective worktree mode used by menus, persistence, and prompt execution.
 * @satisfies REQ-204, REQ-215
 */
export function resolveEffectiveGitWorktreeEnabled(
  autoGitCommit: "enable" | "disable",
  gitWorktreeEnabled: "enable" | "disable",
): "enable" | "disable" {
  return autoGitCommit === "disable" ? "disable" : gitWorktreeEnabled;
}
/**
 * @brief Defines the default static prefix used by generated prompt-command worktree names.
 * @details The prefix is concatenated verbatim ahead of the repository basename inside slash-command-owned worktree-name generation and is persisted in global configuration. Access complexity is O(1).
 * @satisfies CTN-018, REQ-205
 */
export const DEFAULT_GIT_WORKTREE_PREFIX = "PI-useReq-";
/**
 * @brief Normalizes one persisted worktree-name prefix value.
 * @details Accepts only non-empty strings, trims surrounding whitespace, and falls back to `DEFAULT_GIT_WORKTREE_PREFIX` when the candidate is absent or blank. Runtime is O(n) in prefix length. No side effects occur.
 * @param[in] value {unknown} Candidate persisted prefix payload.
 * @return {string} Canonical worktree-name prefix.
 * @satisfies REQ-205
 */
export function normalizeGitWorktreePrefix(value: unknown): string {
  if (typeof value !== "string") {
    return DEFAULT_GIT_WORKTREE_PREFIX;
  }
  const trimmedValue = value.trim();
  return trimmedValue === "" ? DEFAULT_GIT_WORKTREE_PREFIX : trimmedValue;
}
/**
 * @brief Computes the per-project local config file path.
 * @details Joins the project base with `.pi-usereq.json`, producing the canonical local persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {string} Absolute local config file path.
 */
export function getProjectConfigPath(projectBase: string): string {
  return getConfigPath(projectBase);
}

/**
 * @brief Computes the cross-project global config file path.
 * @details Resolves `~/.config/pi-usereq/config.json` through the shared runtime path helper so CLI and extension code use one canonical global persistence location. Time complexity is O(1). No I/O side effects occur.
 * @return {string} Absolute global config file path.
 */
export function getGlobalConfigPath(): string {
  return resolveGlobalConfigPath();
}

/**
 * @brief Builds the default persisted local configuration.
 * @details Populates canonical docs/test/source directories, derives local static-check enable defaults from the supplied global checker definitions, and seeds documented debug defaults without any cross-project fields. Runtime is O(l). No filesystem side effects occur.
 * @param[in] globalStaticCheckConfig {Record<string, GlobalStaticCheckLanguageConfig>} Global checker definitions used to derive local enable defaults.
 * @return {UseReqLocalConfig} Fresh default local configuration object.
 */
function getDefaultLocalConfig(
  globalStaticCheckConfig: Record<string, GlobalStaticCheckLanguageConfig>,
): UseReqLocalConfig {
  return {
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": DEFAULT_TESTS_DIR,
    "src-dir": [...DEFAULT_SRC_DIRS],
    "static-check": getDefaultLocalStaticCheckConfig(globalStaticCheckConfig),
    DEBUG_ENABLED: DEFAULT_DEBUG_ENABLED,
    DEBUG_LOG_FILE: DEFAULT_DEBUG_LOG_FILE,
    DEBUG_STATUS_CHANGES: DEFAULT_DEBUG_STATUS_CHANGES,
    DEBUG_WORKFLOW_EVENTS: DEFAULT_DEBUG_WORKFLOW_EVENTS,
    DEBUG_LOG_ON_STATUS: DEFAULT_DEBUG_LOG_ON_STATUS,
    DEBUG_ENABLED_TOOLS: [],
    DEBUG_ENABLED_PROMPTS: [],
  };
}

/**
 * @brief Builds the default persisted global configuration.
 * @details Populates documented cross-project static-check checker commands, enabled tools, git automation fields, and notification defaults without any project-local directory or debug fields. Runtime is O(l + c). No filesystem side effects occur.
 * @return {UseReqGlobalConfig} Fresh default global configuration object.
 */
function getDefaultGlobalConfig(): UseReqGlobalConfig {
  return {
    "static-check": getDefaultGlobalStaticCheckConfig(),
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    AUTO_GIT_COMMIT: DEFAULT_AUTO_GIT_COMMIT,
    GIT_WORKTREE_ENABLED: DEFAULT_GIT_WORKTREE_ENABLED,
    GIT_WORKTREE_PREFIX: DEFAULT_GIT_WORKTREE_PREFIX,
    "notify-enabled": false,
    "notify-on-completed": true,
    "notify-on-interrupted": false,
    "notify-on-failed": false,
    "notify-sound": "none",
    "notify-sound-on-completed": true,
    "notify-sound-on-interrupted": false,
    "notify-sound-on-failed": false,
    "notify-sound-toggle-shortcut": DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT,
    "notify-pushover-enabled": false,
    "notify-pushover-on-completed": true,
    "notify-pushover-on-interrupted": false,
    "notify-pushover-on-failed": false,
    "notify-pushover-user-key": "",
    "notify-pushover-api-token": "",
    "notify-pushover-priority": 0,
    "notify-pushover-title": DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
    "notify-pushover-text": DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
    PI_NOTIFY_CMD: DEFAULT_PI_NOTIFY_CMD,
    PI_NOTIFY_SOUND_LOW_CMD: DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
    PI_NOTIFY_SOUND_MID_CMD: DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
    PI_NOTIFY_SOUND_HIGH_CMD: DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
  };
}

/**
 * @brief Merges persisted local and global configuration scopes into the effective runtime config.
 * @details Normalizes local directories, combines local static-check enable flags with global checker arrays, resolves effective worktree disablement when automatic git commit is off, normalizes debug and notification fields, and disables Pushover until both credentials are populated. Runtime is O(l + c + p). No external state is mutated.
 * @param[in] localConfig {UseReqLocalConfig} Persisted local configuration.
 * @param[in] globalConfig {UseReqGlobalConfig} Persisted global configuration.
 * @return {UseReqConfig} Effective merged configuration.
 */
function mergeConfigScopes(
  localConfig: UseReqLocalConfig,
  globalConfig: UseReqGlobalConfig,
): UseReqConfig {
  const docsDir = normalizeRelativeDirContract(localConfig["docs-dir"]) || DEFAULT_DOCS_DIR;
  const testsDir = normalizeRelativeDirContract(localConfig["tests-dir"]) || DEFAULT_TESTS_DIR;
  const srcDir = localConfig["src-dir"]
    .map((entry) => normalizeRelativeDirContract(entry))
    .filter((entry) => entry !== "");
  const autoGitCommit = normalizeAutoGitCommit(globalConfig.AUTO_GIT_COMMIT);
  const gitWorktreeEnabled = resolveEffectiveGitWorktreeEnabled(
    autoGitCommit,
    normalizeGitWorktreeEnabled(globalConfig.GIT_WORKTREE_ENABLED),
  );
  const pushoverUserKey = normalizePiNotifyPushoverCredential(globalConfig["notify-pushover-user-key"]);
  const pushoverApiToken = normalizePiNotifyPushoverCredential(globalConfig["notify-pushover-api-token"]);
  const pushoverEnabled = globalConfig["notify-pushover-enabled"] === true
    && hasPiNotifyPushoverCredentials({
      "notify-pushover-user-key": pushoverUserKey,
      "notify-pushover-api-token": pushoverApiToken,
    });
  return {
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDir.length > 0 ? srcDir : [...DEFAULT_SRC_DIRS],
    "static-check": mergeStaticCheckConfig(localConfig["static-check"], globalConfig["static-check"]),
    "enabled-tools": normalizeEnabledPiUsereqTools(globalConfig["enabled-tools"]),
    AUTO_GIT_COMMIT: autoGitCommit,
    GIT_WORKTREE_ENABLED: gitWorktreeEnabled,
    GIT_WORKTREE_PREFIX: normalizeGitWorktreePrefix(globalConfig.GIT_WORKTREE_PREFIX),
    DEBUG_ENABLED: normalizeDebugEnabled(localConfig.DEBUG_ENABLED),
    DEBUG_LOG_FILE: normalizeDebugLogFile(localConfig.DEBUG_LOG_FILE),
    DEBUG_STATUS_CHANGES: normalizeDebugStatusChanges(localConfig.DEBUG_STATUS_CHANGES),
    DEBUG_WORKFLOW_EVENTS: normalizeDebugWorkflowEvents(localConfig.DEBUG_WORKFLOW_EVENTS),
    DEBUG_LOG_ON_STATUS: normalizeDebugLogOnStatus(localConfig.DEBUG_LOG_ON_STATUS),
    DEBUG_ENABLED_TOOLS: normalizeDebugEnabledTools(localConfig.DEBUG_ENABLED_TOOLS),
    DEBUG_ENABLED_PROMPTS: normalizeDebugEnabledPrompts(localConfig.DEBUG_ENABLED_PROMPTS),
    "notify-enabled": globalConfig["notify-enabled"] === true,
    "notify-on-completed": globalConfig["notify-on-completed"] !== false,
    "notify-on-interrupted": globalConfig["notify-on-interrupted"] === true,
    "notify-on-failed": globalConfig["notify-on-failed"] === true,
    "notify-sound": normalizePiNotifySoundLevel(globalConfig["notify-sound"]),
    "notify-sound-on-completed": globalConfig["notify-sound-on-completed"] !== false,
    "notify-sound-on-interrupted": globalConfig["notify-sound-on-interrupted"] === true,
    "notify-sound-on-failed": globalConfig["notify-sound-on-failed"] === true,
    "notify-sound-toggle-shortcut": normalizePiNotifyShortcut(globalConfig["notify-sound-toggle-shortcut"]),
    "notify-pushover-enabled": pushoverEnabled,
    "notify-pushover-on-completed": globalConfig["notify-pushover-on-completed"] !== false,
    "notify-pushover-on-interrupted": globalConfig["notify-pushover-on-interrupted"] === true,
    "notify-pushover-on-failed": globalConfig["notify-pushover-on-failed"] === true,
    "notify-pushover-user-key": pushoverUserKey,
    "notify-pushover-api-token": pushoverApiToken,
    "notify-pushover-priority": normalizePiNotifyPushoverPriority(globalConfig["notify-pushover-priority"]),
    "notify-pushover-title": normalizePiNotifyTemplateValue(
      globalConfig["notify-pushover-title"],
      DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
    ),
    "notify-pushover-text": normalizePiNotifyTemplateValue(
      globalConfig["notify-pushover-text"],
      DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
    ),
    PI_NOTIFY_CMD: normalizePiNotifyCommand(globalConfig.PI_NOTIFY_CMD, DEFAULT_PI_NOTIFY_CMD),
    PI_NOTIFY_SOUND_LOW_CMD: normalizePiNotifyCommand(globalConfig.PI_NOTIFY_SOUND_LOW_CMD, DEFAULT_PI_NOTIFY_SOUND_LOW_CMD),
    PI_NOTIFY_SOUND_MID_CMD: normalizePiNotifyCommand(globalConfig.PI_NOTIFY_SOUND_MID_CMD, DEFAULT_PI_NOTIFY_SOUND_MID_CMD),
    PI_NOTIFY_SOUND_HIGH_CMD: normalizePiNotifyCommand(globalConfig.PI_NOTIFY_SOUND_HIGH_CMD, DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD),
  };
}

/**
 * @brief Builds the default effective configuration.
 * @details Composes documented local and global defaults, then merges them into the effective runtime config consumed by CLI and extension code. Time complexity is O(l + c). No filesystem side effects occur.
 * @param[in] _projectBase {string} Absolute project root path retained for stable call sites.
 * @return {UseReqConfig} Fresh default effective configuration object.
 * @satisfies CTN-001, CTN-012, CTN-013, CTN-018, REQ-066, REQ-137, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-250, REQ-251, REQ-252, REQ-277, REQ-315, REQ-316
 */
export function getDefaultConfig(_projectBase: string): UseReqConfig {
  const globalConfig = getDefaultGlobalConfig();
  return mergeConfigScopes(
    getDefaultLocalConfig(globalConfig["static-check"]),
    globalConfig,
  );
}

/**
 * @brief Normalizes one raw checker-entry array from persisted config.
 * @details Accepts only object entries with a non-empty module string, trims optional command text, filters blank params, and drops malformed records without applying any legacy schema migrations. Runtime is O(c + p). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted checker array.
 * @return {StaticCheckEntry[]} Normalized checker-entry vector.
 */
function normalizeStaticCheckEntries(value: unknown): StaticCheckEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: StaticCheckEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.module !== "string" || entry.module.trim() === "") {
      continue;
    }
    entries.push(cloneStaticCheckEntry({
      module: entry.module,
      ...(typeof entry.cmd === "string" ? { cmd: entry.cmd } : {}),
      ...(Array.isArray(entry.params) ? { params: entry.params.map(String) } : {}),
    }));
  }
  return entries;
}

/**
 * @brief Reads and validates one persisted config payload.
 * @details Returns `undefined` when the target file does not exist. Otherwise parses UTF-8 JSON, rejects array or primitive payloads, and surfaces deterministic `ReqError` diagnostics keyed by the exact path. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] configPath {string} Absolute config file path.
 * @return {Record<string, unknown> | undefined} Parsed object payload or `undefined` when the file is absent.
 * @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
 */
function readConfigPayload(configPath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ReqError(`Error: invalid ${configPath}`, 11);
  }
  return payload as Record<string, unknown>;
}

/**
 * @brief Normalizes the persisted local static-check enable map.
 * @details Starts from the supplied default enable map, accepts only object-valued language entries, reads only `enabled`, and ignores misplaced checker arrays or legacy non-object payloads without migration. Runtime is O(l). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted local static-check payload.
 * @param[in] defaultConfig {Record<string, LocalStaticCheckLanguageConfig>} Default enable map derived from global checker definitions.
 * @return {Record<string, LocalStaticCheckLanguageConfig>} Normalized local static-check enable map.
 * @satisfies REQ-249, REQ-316
 */
function normalizeLocalStaticCheckConfig(
  value: unknown,
  defaultConfig: Record<string, LocalStaticCheckLanguageConfig>,
): Record<string, LocalStaticCheckLanguageConfig> {
  const config: Record<string, LocalStaticCheckLanguageConfig> = Object.fromEntries(
    Object.entries(defaultConfig).map(([language, languageConfig]) => [
      language,
      createLocalStaticCheckLanguageConfig(languageConfig.enabled),
    ]),
  );
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return config;
  }
  for (const [language, languageValue] of Object.entries(value as Record<string, unknown>)) {
    if (!languageValue || typeof languageValue !== "object" || Array.isArray(languageValue)) {
      continue;
    }
    const languageRecord = languageValue as Record<string, unknown>;
    const defaultEnabled = config[language]?.enabled ?? "disable";
    config[language] = createLocalStaticCheckLanguageConfig(
      normalizeStaticCheckEnabled(languageRecord.enabled, defaultEnabled),
    );
  }
  return config;
}

/**
 * @brief Normalizes the persisted global static-check checker map.
 * @details Starts from documented global checker defaults, accepts only object-valued language entries, reads only `checkers`, and ignores misplaced local enable flags or legacy non-object payloads without migration. Runtime is O(l + c + p). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted global static-check payload.
 * @return {Record<string, GlobalStaticCheckLanguageConfig>} Normalized global static-check checker map.
 * @satisfies REQ-249, REQ-250, REQ-251, REQ-252
 */
function normalizeGlobalStaticCheckConfig(
  value: unknown,
): Record<string, GlobalStaticCheckLanguageConfig> {
  const config = getDefaultGlobalStaticCheckConfig();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return config;
  }
  for (const [language, languageValue] of Object.entries(value as Record<string, unknown>)) {
    if (!languageValue || typeof languageValue !== "object" || Array.isArray(languageValue)) {
      continue;
    }
    const languageRecord = languageValue as Record<string, unknown>;
    config[language] = createGlobalStaticCheckLanguageConfig(
      normalizeStaticCheckEntries(languageRecord.checkers),
    );
  }
  return config;
}

/**
 * @brief Loads and sanitizes the persisted local configuration.
 * @details Returns defaults when `<base-path>/.pi-usereq.json` is absent. Otherwise parses the local JSON payload, normalizes project-scoped directory, debug, and static-check enable fields, and ignores misplaced global keys without migration. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] defaultStaticCheckConfig {Record<string, LocalStaticCheckLanguageConfig>} Local static-check enable defaults derived from the current global checker map.
 * @return {UseReqLocalConfig} Sanitized local configuration.
 */
function loadLocalConfig(
  projectBase: string,
  defaultStaticCheckConfig: Record<string, LocalStaticCheckLanguageConfig>,
): UseReqLocalConfig {
  const configPath = getProjectConfigPath(projectBase);
  const data = readConfigPayload(configPath);
  if (!data) {
    return {
      "docs-dir": DEFAULT_DOCS_DIR,
      "tests-dir": DEFAULT_TESTS_DIR,
      "src-dir": [...DEFAULT_SRC_DIRS],
      "static-check": normalizeLocalStaticCheckConfig(undefined, defaultStaticCheckConfig),
      DEBUG_ENABLED: DEFAULT_DEBUG_ENABLED,
      DEBUG_LOG_FILE: DEFAULT_DEBUG_LOG_FILE,
      DEBUG_STATUS_CHANGES: DEFAULT_DEBUG_STATUS_CHANGES,
      DEBUG_WORKFLOW_EVENTS: DEFAULT_DEBUG_WORKFLOW_EVENTS,
      DEBUG_LOG_ON_STATUS: DEFAULT_DEBUG_LOG_ON_STATUS,
      DEBUG_ENABLED_TOOLS: [],
      DEBUG_ENABLED_PROMPTS: [],
    };
  }
  const docsDirCandidate = typeof data["docs-dir"] === "string"
    ? normalizeRelativeDirContract(data["docs-dir"])
    : "";
  const testsDirCandidate = typeof data["tests-dir"] === "string"
    ? normalizeRelativeDirContract(data["tests-dir"])
    : "";
  const srcDirCandidate = Array.isArray(data["src-dir"])
    ? data["src-dir"]
        .filter((item): item is string => typeof item === "string")
        .map((item) => normalizeRelativeDirContract(item))
        .filter((item) => item !== "")
    : [];
  return {
    "docs-dir": docsDirCandidate || DEFAULT_DOCS_DIR,
    "tests-dir": testsDirCandidate || DEFAULT_TESTS_DIR,
    "src-dir": srcDirCandidate.length > 0 ? srcDirCandidate : [...DEFAULT_SRC_DIRS],
    "static-check": normalizeLocalStaticCheckConfig(data["static-check"], defaultStaticCheckConfig),
    DEBUG_ENABLED: normalizeDebugEnabled(data.DEBUG_ENABLED),
    DEBUG_LOG_FILE: normalizeDebugLogFile(data.DEBUG_LOG_FILE),
    DEBUG_STATUS_CHANGES: normalizeDebugStatusChanges(data.DEBUG_STATUS_CHANGES),
    DEBUG_WORKFLOW_EVENTS: normalizeDebugWorkflowEvents(data.DEBUG_WORKFLOW_EVENTS),
    DEBUG_LOG_ON_STATUS: normalizeDebugLogOnStatus(data.DEBUG_LOG_ON_STATUS),
    DEBUG_ENABLED_TOOLS: normalizeDebugEnabledTools(data.DEBUG_ENABLED_TOOLS),
    DEBUG_ENABLED_PROMPTS: normalizeDebugEnabledPrompts(data.DEBUG_ENABLED_PROMPTS),
  };
}

/**
 * @brief Loads and sanitizes the persisted global configuration.
 * @details Returns defaults when `~/.config/pi-usereq/config.json` is absent. Otherwise parses the global JSON payload, normalizes cross-project checker, tool, git, and notification fields, and ignores misplaced local keys without migration. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {UseReqGlobalConfig} Sanitized global configuration.
 */
function loadGlobalConfig(): UseReqGlobalConfig {
  const configPath = getGlobalConfigPath();
  const data = readConfigPayload(configPath);
  if (!data) {
    return getDefaultGlobalConfig();
  }
  return {
    "static-check": normalizeGlobalStaticCheckConfig(data["static-check"]),
    "enabled-tools": normalizeEnabledPiUsereqTools(data["enabled-tools"]),
    AUTO_GIT_COMMIT: normalizeAutoGitCommit(data.AUTO_GIT_COMMIT),
    GIT_WORKTREE_ENABLED: normalizeGitWorktreeEnabled(data.GIT_WORKTREE_ENABLED),
    GIT_WORKTREE_PREFIX: normalizeGitWorktreePrefix(data.GIT_WORKTREE_PREFIX),
    "notify-enabled": data["notify-enabled"] === true,
    "notify-on-completed": data["notify-on-completed"] !== false,
    "notify-on-interrupted": data["notify-on-interrupted"] === true,
    "notify-on-failed": data["notify-on-failed"] === true,
    "notify-sound": normalizePiNotifySoundLevel(data["notify-sound"]),
    "notify-sound-on-completed": data["notify-sound-on-completed"] !== false,
    "notify-sound-on-interrupted": data["notify-sound-on-interrupted"] === true,
    "notify-sound-on-failed": data["notify-sound-on-failed"] === true,
    "notify-sound-toggle-shortcut": normalizePiNotifyShortcut(data["notify-sound-toggle-shortcut"]),
    "notify-pushover-enabled": data["notify-pushover-enabled"] === true,
    "notify-pushover-on-completed": data["notify-pushover-on-completed"] !== false,
    "notify-pushover-on-interrupted": data["notify-pushover-on-interrupted"] === true,
    "notify-pushover-on-failed": data["notify-pushover-on-failed"] === true,
    "notify-pushover-user-key": normalizePiNotifyPushoverCredential(data["notify-pushover-user-key"]),
    "notify-pushover-api-token": normalizePiNotifyPushoverCredential(data["notify-pushover-api-token"]),
    "notify-pushover-priority": normalizePiNotifyPushoverPriority(data["notify-pushover-priority"]),
    "notify-pushover-title": normalizePiNotifyTemplateValue(
      data["notify-pushover-title"],
      DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
    ),
    "notify-pushover-text": normalizePiNotifyTemplateValue(
      data["notify-pushover-text"],
      DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
    ),
    PI_NOTIFY_CMD: normalizePiNotifyCommand(data.PI_NOTIFY_CMD, DEFAULT_PI_NOTIFY_CMD),
    PI_NOTIFY_SOUND_LOW_CMD: normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_LOW_CMD, DEFAULT_PI_NOTIFY_SOUND_LOW_CMD),
    PI_NOTIFY_SOUND_MID_CMD: normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_MID_CMD, DEFAULT_PI_NOTIFY_SOUND_MID_CMD),
    PI_NOTIFY_SOUND_HIGH_CMD: normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_HIGH_CMD, DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD),
  };
}

/**
 * @brief Loads and sanitizes the effective merged configuration.
 * @details Loads global configuration first so local static-check enable defaults can be derived from the active global checker map, then merges both scopes into the effective runtime config without applying legacy single-file migrations. Runtime is O(n) in combined local and global config size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Sanitized effective configuration.
 * @throws {ReqError} Throws with exit code `11` when either persisted config file contains invalid JSON or a non-object payload.
 * @satisfies CTN-012, CTN-013, CTN-018, REQ-066, REQ-137, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-235, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277, REQ-315, REQ-316
 */
export function loadConfig(projectBase: string): UseReqConfig {
  const globalConfig = loadGlobalConfig();
  const localConfig = loadLocalConfig(
    projectBase,
    getDefaultLocalStaticCheckConfig(globalConfig["static-check"]),
  );
  return mergeConfigScopes(localConfig, globalConfig);
}

/**
 * @brief Builds the persisted local configuration payload.
 * @details Copies only project-scoped keys into a fresh object so runtime-derived metadata plus global checker, tool, git, and notification fields never reach `.pi-usereq.json`. Runtime is O(n) in config size. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective configuration object.
 * @return {UseReqLocalConfig} Persistable local configuration payload.
 * @satisfies CTN-012, CTN-013, REQ-104, REQ-146, REQ-249, REQ-316, REQ-277
 */
function buildPersistedLocalConfig(config: UseReqConfig): UseReqLocalConfig {
  const normalizedSrcDir = config["src-dir"]
    .map((entry) => normalizeRelativeDirContract(entry))
    .filter((entry) => entry !== "");
  return {
    "docs-dir": normalizeRelativeDirContract(config["docs-dir"]) || DEFAULT_DOCS_DIR,
    "tests-dir": normalizeRelativeDirContract(config["tests-dir"]) || DEFAULT_TESTS_DIR,
    "src-dir": normalizedSrcDir.length > 0 ? normalizedSrcDir : [...DEFAULT_SRC_DIRS],
    "static-check": Object.fromEntries(
      Object.entries(config["static-check"]).map(([language, languageConfig]) => [
        language,
        createLocalStaticCheckLanguageConfig(
          normalizeStaticCheckEnabled(
            languageConfig.enabled,
            languageConfig.checkers.length > 0 ? "enable" : "disable",
          ),
        ),
      ]),
    ),
    DEBUG_ENABLED: normalizeDebugEnabled(config.DEBUG_ENABLED),
    DEBUG_LOG_FILE: normalizeDebugLogFile(config.DEBUG_LOG_FILE),
    DEBUG_STATUS_CHANGES: normalizeDebugStatusChanges(config.DEBUG_STATUS_CHANGES),
    DEBUG_WORKFLOW_EVENTS: normalizeDebugWorkflowEvents(config.DEBUG_WORKFLOW_EVENTS),
    DEBUG_LOG_ON_STATUS: normalizeDebugLogOnStatus(config.DEBUG_LOG_ON_STATUS),
    DEBUG_ENABLED_TOOLS: normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS),
    DEBUG_ENABLED_PROMPTS: normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS),
  };
}

/**
 * @brief Builds the persisted global configuration payload.
 * @details Copies only cross-project keys into a fresh object so local directory and debug fields never reach `~/.config/pi-usereq/config.json`, while forcing persisted worktree disablement when automatic git commit is disabled and forcing persisted Pushover disablement until both credentials are populated. Runtime is O(n) in config size. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective configuration object.
 * @return {UseReqGlobalConfig} Persistable global configuration payload.
 * @satisfies REQ-137, REQ-163, REQ-174, REQ-178, REQ-184, REQ-196, REQ-204, REQ-205, REQ-212, REQ-234, REQ-249, REQ-315
 */
function buildPersistedGlobalConfig(config: UseReqConfig): UseReqGlobalConfig {
  const autoGitCommit = normalizeAutoGitCommit(config.AUTO_GIT_COMMIT);
  return {
    "static-check": Object.fromEntries(
      Object.entries(config["static-check"]).map(([language, languageConfig]) => [
        language,
        createGlobalStaticCheckLanguageConfig(languageConfig.checkers),
      ]),
    ),
    "enabled-tools": normalizeEnabledPiUsereqTools(config["enabled-tools"]),
    AUTO_GIT_COMMIT: autoGitCommit,
    GIT_WORKTREE_ENABLED: resolveEffectiveGitWorktreeEnabled(
      autoGitCommit,
      config.GIT_WORKTREE_ENABLED,
    ),
    GIT_WORKTREE_PREFIX: normalizeGitWorktreePrefix(config.GIT_WORKTREE_PREFIX),
    "notify-enabled": config["notify-enabled"],
    "notify-on-completed": config["notify-on-completed"],
    "notify-on-interrupted": config["notify-on-interrupted"],
    "notify-on-failed": config["notify-on-failed"],
    "notify-sound": config["notify-sound"],
    "notify-sound-on-completed": config["notify-sound-on-completed"],
    "notify-sound-on-interrupted": config["notify-sound-on-interrupted"],
    "notify-sound-on-failed": config["notify-sound-on-failed"],
    "notify-sound-toggle-shortcut": config["notify-sound-toggle-shortcut"],
    "notify-pushover-enabled": config["notify-pushover-enabled"] && hasPiNotifyPushoverCredentials(config),
    "notify-pushover-on-completed": config["notify-pushover-on-completed"],
    "notify-pushover-on-interrupted": config["notify-pushover-on-interrupted"],
    "notify-pushover-on-failed": config["notify-pushover-on-failed"],
    "notify-pushover-user-key": config["notify-pushover-user-key"],
    "notify-pushover-api-token": config["notify-pushover-api-token"],
    "notify-pushover-priority": config["notify-pushover-priority"],
    "notify-pushover-title": config["notify-pushover-title"],
    "notify-pushover-text": config["notify-pushover-text"],
    PI_NOTIFY_CMD: config.PI_NOTIFY_CMD,
    PI_NOTIFY_SOUND_LOW_CMD: config.PI_NOTIFY_SOUND_LOW_CMD,
    PI_NOTIFY_SOUND_MID_CMD: config.PI_NOTIFY_SOUND_MID_CMD,
    PI_NOTIFY_SOUND_HIGH_CMD: config.PI_NOTIFY_SOUND_HIGH_CMD,
  };
}

/**
 * @brief Writes one normalized config payload to disk.
 * @details Creates the parent directory when required, formats JSON with two-space indentation, and terminates the file with a newline. Runtime is O(n) in serialized payload size. Side effects include directory creation and file overwrite.
 * @param[in] configPath {string} Absolute destination config path.
 * @param[in] payload {object} Persistable config payload.
 * @return {void} No return value.
 */
function writeConfigFile(configPath: string, payload: object): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @brief Persists the local configuration scope to disk.
 * @details Serializes only project-scoped fields into `<base-path>/.pi-usereq.json`, excluding runtime-derived metadata and every global-scope configuration key. Runtime is O(n) in serialized local config size. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective configuration object to persist.
 * @return {void} No return value.
 * @satisfies CTN-012, REQ-104, REQ-146
 */
export function saveLocalConfig(projectBase: string, config: UseReqConfig): void {
  writeConfigFile(getProjectConfigPath(projectBase), buildPersistedLocalConfig(config));
}

/**
 * @brief Persists the global configuration scope to disk.
 * @details Serializes only cross-project fields into `~/.config/pi-usereq/config.json`, excluding every project-local directory and debug setting. Runtime is O(n) in serialized global config size. Side effects include directory creation and file overwrite.
 * @param[in] config {UseReqConfig} Effective configuration object to persist.
 * @return {void} No return value.
 * @satisfies CTN-012, CTN-018, REQ-137, REQ-146, REQ-315
 */
export function saveGlobalConfig(config: UseReqConfig): void {
  writeConfigFile(getGlobalConfigPath(), buildPersistedGlobalConfig(config));
}

/**
 * @brief Persists the effective configuration to local and global config files.
 * @details Splits the effective runtime config into project-scoped and cross-project payloads, then writes both files with normalized JSON formatting. Runtime is O(n) in combined serialized config size. Side effects include directory creation and file overwrite in both persistence locations.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective configuration object to persist.
 * @return {void} No return value.
 * @satisfies CTN-012, CTN-018, REQ-137, REQ-146, REQ-315
 */
export function saveConfig(projectBase: string, config: UseReqConfig): void {
  saveLocalConfig(projectBase, config);
  saveGlobalConfig(config);
}

/**
 * @brief Normalizes persisted directory fields to project-relative forms.
 * @details Rewrites docs, tests, and source directories using project containment heuristics, strips trailing separators, and restores defaults for empty results. Runtime is O(n) in configured path count plus path-length processing. No filesystem writes occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Configuration object to normalize.
 * @return {UseReqConfig} Normalized configuration copy.
 */
export function normalizeConfigPaths(projectBase: string, config: UseReqConfig): UseReqConfig {
  const docsDir = normalizeRelativeDirContract(
    makeRelativeIfContainsProject(config["docs-dir"], projectBase),
  ) || DEFAULT_DOCS_DIR;
  const testsDir = normalizeRelativeDirContract(
    makeRelativeIfContainsProject(config["tests-dir"], projectBase),
  ) || DEFAULT_TESTS_DIR;
  const srcDirs = config["src-dir"]
    .map((value) => normalizeRelativeDirContract(
      makeRelativeIfContainsProject(value, projectBase),
    ))
    .filter((value) => value !== "");
  return {
    ...config,
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDirs.length > 0 ? srcDirs : [...DEFAULT_SRC_DIRS],
  };
}

/**
 * @brief Builds placeholder replacements for bundled prompt rendering.
 * @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
 * @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011
 */
export function buildPromptReplacementPaths(
  basePath: string,
  contextPath: string,
  config: UseReqConfig,
): Record<string, string> {
  const runtimePathContext = buildRuntimePathContext(basePath, contextPath, config);
  const runtimePathFacts = buildRuntimePathFacts(runtimePathContext);
  const guidelineEntries = fs.existsSync(runtimePathContext.guidelinesPath)
    ? fs.readdirSync(runtimePathContext.guidelinesPath)
        .filter((entry) => !entry.startsWith("."))
        .map((entry) => formatRuntimePathForDisplay(path.join(runtimePathContext.guidelinesPath, entry)))
        .sort((left, right) => left.localeCompare(right))
    : [];

  const normalizedDocsDir = normalizeRelativeDirContract(config["docs-dir"])
    || DEFAULT_DOCS_DIR;
  const normalizedTestsDir = normalizeRelativeDirContract(config["tests-dir"])
    || DEFAULT_TESTS_DIR;
  const normalizedSrcDir = config["src-dir"]
    .map((value) => normalizeRelativeDirContract(value))
    .filter((value) => value !== "");
  const effectiveSrcDir = normalizedSrcDir.length > 0
    ? normalizedSrcDir
    : [...DEFAULT_SRC_DIRS];
  const srcValue = effectiveSrcDir.map((value) => `\`${value}/\``).join(", ");
  const testValue = `\`${normalizedTestsDir}/\``;
  const guidelinesValue = guidelineEntries.length > 0
    ? guidelineEntries.map((entry) => `\`${entry}\``).join(", ")
    : `\`${runtimePathFacts.guidelines_path}\``;

  return {
    "%%DOC_PATH%%": normalizedDocsDir,
    "%%GUIDELINES_FILES%%": guidelinesValue,
    "%%GUIDELINES_PATH%%": runtimePathFacts.guidelines_path,
    "%%TEMPLATE_PATH%%": runtimePathFacts.template_path,
    "%%SRC_PATHS%%": srcValue,
    "%%TEST_PATH%%": testValue,
    "%%PROJECT_BASE%%": runtimePathFacts.base_path,
    "%%CONTEXT_PATH%%": runtimePathFacts.context_path,
    "%%INSTALLATION_PATH%%": runtimePathFacts.installation_path,
    "%%CONFIG_PATH%%": runtimePathFacts.config_path,
  };
}
