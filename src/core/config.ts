/**
 * @file
 * @brief Loads, normalizes, and persists pi-usereq project configuration.
 * @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
  buildRuntimePathContext,
  buildRuntimePathFacts,
  formatRuntimePathForDisplay,
  getConfigPath,
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
 * @brief Defines the persisted pi-usereq project configuration schema.
 * @details Captures documentation paths, source/test directory selection, per-language static-check enablement and checker configuration, prompt-command worktree settings, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.
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
 * @brief Returns the documented default static-check configuration.
 * @details Emits one per-language config object for every supported language, enabling only languages with documented default checker entries and leaving all remaining languages disabled with empty checker lists. Runtime is O(l + c). No external state is mutated.
 * @return {Record<string, StaticCheckLanguageConfig>} Fresh default static-check config.
 * @satisfies REQ-249, REQ-250, REQ-251, REQ-252
 */
export function getDefaultStaticCheckConfig(): Record<string, StaticCheckLanguageConfig> {
  return Object.fromEntries(DEFAULT_STATIC_CHECK_LANGUAGES.map((language) => [
    language,
    createStaticCheckLanguageConfig(DEFAULT_STATIC_CHECK_CHECKERS[language] ?? []),
  ]));
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
 * @details New project configs enable bundled commit-instruction injection unless the persisted project config explicitly disables it. Access complexity is O(1).
 * @satisfies CTN-001, REQ-212
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
 * @details New project configs enable prompt-command worktree orchestration unless the persisted project config explicitly disables it. Access complexity is O(1).
 * @satisfies CTN-001, REQ-204
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
 * @details The prefix is concatenated verbatim ahead of the repository basename inside slash-command-owned worktree-name generation. Access complexity is O(1).
 * @satisfies CTN-001, REQ-205
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
 * @brief Computes the per-project config file path.
 * @details Joins the project base with `.pi-usereq.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {string} Absolute config file path.
 */
export function getProjectConfigPath(projectBase: string): string {
  return getConfigPath(projectBase);
}

/**
 * @brief Builds the default project configuration.
 * @details Populates canonical docs/test/source directories, documented per-language static-check defaults, default prompt-command worktree settings, default debug fields including dedicated workflow-event logging, the default startup tool set, default command-notify, sound, and Pushover fields, and excludes runtime-derived path metadata. Time complexity is O(n) in default selector count plus default static-check entry count. No filesystem side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Fresh default configuration object.
 * @satisfies CTN-001, CTN-012, CTN-013, REQ-066, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-250, REQ-251, REQ-252, REQ-277
 */
export function getDefaultConfig(_projectBase: string): UseReqConfig {
  return {
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": DEFAULT_TESTS_DIR,
    "src-dir": [...DEFAULT_SRC_DIRS],
    "static-check": getDefaultStaticCheckConfig(),
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    AUTO_GIT_COMMIT: DEFAULT_AUTO_GIT_COMMIT,
    GIT_WORKTREE_ENABLED: DEFAULT_GIT_WORKTREE_ENABLED,
    GIT_WORKTREE_PREFIX: DEFAULT_GIT_WORKTREE_PREFIX,
    DEBUG_ENABLED: DEFAULT_DEBUG_ENABLED,
    DEBUG_LOG_FILE: DEFAULT_DEBUG_LOG_FILE,
    DEBUG_STATUS_CHANGES: DEFAULT_DEBUG_STATUS_CHANGES,
    DEBUG_WORKFLOW_EVENTS: DEFAULT_DEBUG_WORKFLOW_EVENTS,
    DEBUG_LOG_ON_STATUS: DEFAULT_DEBUG_LOG_ON_STATUS,
    DEBUG_ENABLED_TOOLS: [],
    DEBUG_ENABLED_PROMPTS: [],
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
 * @brief Normalizes the persisted per-language static-check configuration map.
 * @details Accepts only object-valued language entries using the new `{ enabled, checkers }` schema, normalizes missing or invalid `enabled` values from checker-list presence, and drops malformed or legacy non-object language payloads without migration. Runtime is O(l + c + p). No external state is mutated.
 * @param[in] value {unknown} Candidate persisted static-check payload.
 * @return {Record<string, StaticCheckLanguageConfig>} Normalized per-language static-check map.
 * @satisfies REQ-249
 */
function normalizeStaticCheckConfig(
  value: unknown,
): Record<string, StaticCheckLanguageConfig> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const config: Record<string, StaticCheckLanguageConfig> = {};
  for (const [language, languageValue] of Object.entries(value as Record<string, unknown>)) {
    if (!languageValue || typeof languageValue !== "object" || Array.isArray(languageValue)) {
      continue;
    }
    const languageRecord = languageValue as Record<string, unknown>;
    const checkers = normalizeStaticCheckEntries(languageRecord.checkers);
    config[language] = createStaticCheckLanguageConfig(
      checkers,
      normalizeStaticCheckEnabled(languageRecord.enabled, checkers.length > 0 ? "enable" : "disable"),
    );
  }
  return config;
}

/**
 * @brief Loads and sanitizes the persisted project configuration.
 * @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates directory and per-language static-check object shapes, normalizes enabled tool names plus prompt-command worktree, debug, notify, sound, and Pushover fields including dedicated workflow-event logging, preserves non-empty template text verbatim, forces the effective worktree mode off when automatic git commit is disabled, forces effective Pushover disablement until both credentials are populated, applies documented per-flag defaults for missing payloads, and ignores removed, malformed, or runtime-derived path metadata without legacy schema migration. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Sanitized effective configuration.
 * @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
 * @satisfies CTN-012, CTN-013, REQ-066, REQ-146, REQ-163, REQ-174, REQ-178, REQ-184, REQ-185, REQ-196, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-235, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277
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
  const docsDir = docsDirCandidate || DEFAULT_DOCS_DIR;
  const testsDir = testsDirCandidate || DEFAULT_TESTS_DIR;
  const srcDir = srcDirCandidate.length > 0 ? srcDirCandidate : [...DEFAULT_SRC_DIRS];
  const staticCheck = normalizeStaticCheckConfig(data["static-check"]);
  const enabledTools = normalizeEnabledPiUsereqTools(data["enabled-tools"]);
  const autoGitCommit = normalizeAutoGitCommit(data.AUTO_GIT_COMMIT);
  const gitWorktreeEnabled = resolveEffectiveGitWorktreeEnabled(
    autoGitCommit,
    normalizeGitWorktreeEnabled(data.GIT_WORKTREE_ENABLED),
  );
  const gitWorktreePrefix = normalizeGitWorktreePrefix(data.GIT_WORKTREE_PREFIX);
  const debugEnabled = normalizeDebugEnabled(data.DEBUG_ENABLED);
  const debugLogFile = normalizeDebugLogFile(data.DEBUG_LOG_FILE);
  const debugStatusChanges = normalizeDebugStatusChanges(data.DEBUG_STATUS_CHANGES);
  const debugWorkflowEvents = normalizeDebugWorkflowEvents(data.DEBUG_WORKFLOW_EVENTS);
  const debugLogOnStatus = normalizeDebugLogOnStatus(data.DEBUG_LOG_ON_STATUS);
  const debugEnabledTools = normalizeDebugEnabledTools(data.DEBUG_ENABLED_TOOLS);
  const debugEnabledPrompts = normalizeDebugEnabledPrompts(data.DEBUG_ENABLED_PROMPTS);
  const notifyEnabled = data["notify-enabled"] === true;
  const notifyOnCompleted = data["notify-on-completed"] !== false;
  const notifyOnInterrupted = data["notify-on-interrupted"] === true;
  const notifyOnFailed = data["notify-on-failed"] === true;
  const notifySound = normalizePiNotifySoundLevel(data["notify-sound"]);
  const notifySoundOnCompleted = data["notify-sound-on-completed"] !== false;
  const notifySoundOnInterrupted = data["notify-sound-on-interrupted"] === true;
  const notifySoundOnFailed = data["notify-sound-on-failed"] === true;
  const notifySoundToggleShortcut = normalizePiNotifyShortcut(data["notify-sound-toggle-shortcut"]);
  const pushoverOnCompleted = data["notify-pushover-on-completed"] !== false;
  const pushoverOnInterrupted = data["notify-pushover-on-interrupted"] === true;
  const pushoverOnFailed = data["notify-pushover-on-failed"] === true;
  const pushoverUserKey = normalizePiNotifyPushoverCredential(data["notify-pushover-user-key"]);
  const pushoverApiToken = normalizePiNotifyPushoverCredential(data["notify-pushover-api-token"]);
  const pushoverEnabled = data["notify-pushover-enabled"] === true
    && hasPiNotifyPushoverCredentials({
      "notify-pushover-user-key": pushoverUserKey,
      "notify-pushover-api-token": pushoverApiToken,
    });
  const pushoverPriority = normalizePiNotifyPushoverPriority(data["notify-pushover-priority"]);
  const pushoverTitle = normalizePiNotifyTemplateValue(
    data["notify-pushover-title"],
    DEFAULT_PI_NOTIFY_PUSHOVER_TITLE,
  );
  const pushoverText = normalizePiNotifyTemplateValue(
    data["notify-pushover-text"],
    DEFAULT_PI_NOTIFY_PUSHOVER_TEXT,
  );
  const notifyCommand = normalizePiNotifyCommand(data.PI_NOTIFY_CMD, DEFAULT_PI_NOTIFY_CMD);
  const lowSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_LOW_CMD, DEFAULT_PI_NOTIFY_SOUND_LOW_CMD);
  const midSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_MID_CMD, DEFAULT_PI_NOTIFY_SOUND_MID_CMD);
  const highSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_HIGH_CMD, DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD);

  return {
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDir,
    "static-check": staticCheck,
    "enabled-tools": enabledTools,
    AUTO_GIT_COMMIT: autoGitCommit,
    GIT_WORKTREE_ENABLED: gitWorktreeEnabled,
    GIT_WORKTREE_PREFIX: gitWorktreePrefix,
    DEBUG_ENABLED: debugEnabled,
    DEBUG_LOG_FILE: debugLogFile,
    DEBUG_STATUS_CHANGES: debugStatusChanges,
    DEBUG_WORKFLOW_EVENTS: debugWorkflowEvents,
    DEBUG_LOG_ON_STATUS: debugLogOnStatus,
    DEBUG_ENABLED_TOOLS: debugEnabledTools,
    DEBUG_ENABLED_PROMPTS: debugEnabledPrompts,
    "notify-enabled": notifyEnabled,
    "notify-on-completed": notifyOnCompleted,
    "notify-on-interrupted": notifyOnInterrupted,
    "notify-on-failed": notifyOnFailed,
    "notify-sound": notifySound,
    "notify-sound-on-completed": notifySoundOnCompleted,
    "notify-sound-on-interrupted": notifySoundOnInterrupted,
    "notify-sound-on-failed": notifySoundOnFailed,
    "notify-sound-toggle-shortcut": notifySoundToggleShortcut,
    "notify-pushover-enabled": pushoverEnabled,
    "notify-pushover-on-completed": pushoverOnCompleted,
    "notify-pushover-on-interrupted": pushoverOnInterrupted,
    "notify-pushover-on-failed": pushoverOnFailed,
    "notify-pushover-user-key": pushoverUserKey,
    "notify-pushover-api-token": pushoverApiToken,
    "notify-pushover-priority": pushoverPriority,
    "notify-pushover-title": pushoverTitle,
    "notify-pushover-text": pushoverText,
    PI_NOTIFY_CMD: notifyCommand,
    PI_NOTIFY_SOUND_LOW_CMD: lowSoundCommand,
    PI_NOTIFY_SOUND_MID_CMD: midSoundCommand,
    PI_NOTIFY_SOUND_HIGH_CMD: highSoundCommand,
  };
}

/**
 * @brief Builds the persisted configuration payload that excludes runtime-derived fields.
 * @details Copies only the canonical persisted configuration keys into a fresh object so runtime-derived metadata such as `base-path` and `git-path` can never be written to disk, serializes per-language static-check objects with key order `enabled` then `checkers`, normalizes `GIT_WORKTREE_PREFIX` plus debug fields including dedicated workflow-event logging, forces persisted worktree disablement when automatic git commit is disabled, forces persisted Pushover disablement until both credentials are populated, and preserves the remaining notification and Pushover settings. Runtime is O(n) in config size. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective configuration object.
 * @return {UseReqConfig} Persistable configuration payload.
 * @satisfies CTN-012, CTN-013, REQ-146, REQ-163, REQ-204, REQ-205, REQ-212, REQ-215, REQ-234, REQ-236, REQ-237, REQ-238, REQ-239, REQ-249, REQ-277
 */
function buildPersistedConfig(config: UseReqConfig): UseReqConfig {
  return {
    "docs-dir": normalizeRelativeDirContract(config["docs-dir"]) || DEFAULT_DOCS_DIR,
    "tests-dir": normalizeRelativeDirContract(config["tests-dir"]) || DEFAULT_TESTS_DIR,
    "src-dir": (() => {
      const normalizedSrcDir = config["src-dir"]
        .map((entry) => normalizeRelativeDirContract(entry))
        .filter((entry) => entry !== "");
      return normalizedSrcDir.length > 0 ? normalizedSrcDir : [...DEFAULT_SRC_DIRS];
    })(),
    "static-check": Object.fromEntries(
      Object.entries(config["static-check"]).map(([language, languageConfig]) => [
        language,
        {
          enabled: normalizeStaticCheckEnabled(
            languageConfig.enabled,
            languageConfig.checkers.length > 0 ? "enable" : "disable",
          ),
          checkers: languageConfig.checkers.map(cloneStaticCheckEntry),
        },
      ]),
    ),
    "enabled-tools": [...config["enabled-tools"]],
    AUTO_GIT_COMMIT: normalizeAutoGitCommit(config.AUTO_GIT_COMMIT),
    GIT_WORKTREE_ENABLED: resolveEffectiveGitWorktreeEnabled(
      normalizeAutoGitCommit(config.AUTO_GIT_COMMIT),
      config.GIT_WORKTREE_ENABLED,
    ),
    GIT_WORKTREE_PREFIX: normalizeGitWorktreePrefix(config.GIT_WORKTREE_PREFIX),
    DEBUG_ENABLED: normalizeDebugEnabled(config.DEBUG_ENABLED),
    DEBUG_LOG_FILE: normalizeDebugLogFile(config.DEBUG_LOG_FILE),
    DEBUG_STATUS_CHANGES: normalizeDebugStatusChanges(config.DEBUG_STATUS_CHANGES),
    DEBUG_WORKFLOW_EVENTS: normalizeDebugWorkflowEvents(config.DEBUG_WORKFLOW_EVENTS),
    DEBUG_LOG_ON_STATUS: normalizeDebugLogOnStatus(config.DEBUG_LOG_ON_STATUS),
    DEBUG_ENABLED_TOOLS: normalizeDebugEnabledTools(config.DEBUG_ENABLED_TOOLS),
    DEBUG_ENABLED_PROMPTS: normalizeDebugEnabledPrompts(config.DEBUG_ENABLED_PROMPTS),
    "notify-enabled": config["notify-enabled"],
    "notify-on-completed": config["notify-on-completed"],
    "notify-on-interrupted": config["notify-on-interrupted"],
    "notify-on-failed": config["notify-on-failed"],
    "notify-sound": config["notify-sound"],
    "notify-sound-on-completed": config["notify-sound-on-completed"],
    "notify-sound-on-interrupted": config["notify-sound-on-interrupted"],
    "notify-sound-on-failed": config["notify-sound-on-failed"],
    "notify-sound-toggle-shortcut": config["notify-sound-toggle-shortcut"],
    "notify-pushover-enabled": config["notify-pushover-enabled"]
      && hasPiNotifyPushoverCredentials(config),
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
 * @brief Persists the project configuration to disk.
 * @details Creates the base directory path when necessary, strips runtime-derived fields from the serialized payload, and writes formatted JSON terminated by a newline to `.pi-usereq.json`. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Configuration object to persist.
 * @return {void} No return value.
 * @satisfies CTN-012, REQ-146
 */
export function saveConfig(projectBase: string, config: UseReqConfig): void {
  const configPath = getProjectConfigPath(projectBase);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(buildPersistedConfig(config), null, 2)}\n`, "utf8");
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
