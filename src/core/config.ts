/**
 * @file
 * @brief Loads, normalizes, and persists pi-usereq project configuration.
 * @details Defines the configuration schema, default directory conventions, JSON serialization helpers, and prompt placeholder expansion paths. Runtime is dominated by filesystem reads and writes plus linear normalization over configured entries. Side effects include config-file persistence under `.pi-usereq`.
 */

import fs from "node:fs";
import path from "node:path";
import { ReqError } from "./errors.js";
import {
  buildRuntimePathContext,
  buildRuntimePathFacts,
  formatRuntimePathForDisplay,
  getConfigPath,
} from "./path-context.js";
import {
  DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
  DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
  DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
  DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT,
  normalizePiNotifyCommand,
  normalizePiNotifyPushoverCredential,
  normalizePiNotifyPushoverPriority,
  normalizePiNotifyShortcut,
  normalizePiNotifySoundLevel,
} from "./pi-notify.js";
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
 * @brief Defines the persisted pi-usereq project configuration schema.
 * @details Captures documentation paths, source/test directory selection, static-check configuration, enabled startup tools, and notification settings while excluding runtime-derived path metadata. The interface is compile-time only and introduces no runtime side effects.
 */
export interface UseReqConfig {
  "docs-dir": string;
  "tests-dir": string;
  "src-dir": string[];
  "static-check": Record<string, StaticCheckEntry[]>;
  "enabled-tools": string[];
  "notify-beep-on-end": boolean;
  "notify-beep-on-esc": boolean;
  "notify-beep-on-error": boolean;
  "notify-sound": "none" | "low" | "mid" | "high";
  "notify-sound-toggle-shortcut": string;
  "notify-pushover-global-disable": boolean;
  "notify-pushover-on-success": boolean;
  "notify-pushover-user-key": string;
  "notify-pushover-api-token": string;
  "notify-pushover-priority": 0 | 1;
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
 * @brief Computes the per-project config file path.
 * @details Joins the project base with `.pi-usereq/config.json`, producing the canonical persistence location used by CLI and extension code. Time complexity is O(1). No I/O side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {string} Absolute config file path.
 */
export function getProjectConfigPath(projectBase: string): string {
  return getConfigPath(projectBase);
}

/**
 * @brief Builds the default project configuration.
 * @details Populates canonical docs/test/source directories, the default startup tool set, default pi-notify fields, and default Pushover settings while excluding runtime-derived path metadata. Time complexity is O(n) in default tool count. No filesystem side effects occur.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Fresh default configuration object.
 * @satisfies CTN-001, CTN-012, REQ-066, REQ-129, REQ-146, REQ-163
 */
export function getDefaultConfig(_projectBase: string): UseReqConfig {
  return {
    "docs-dir": DEFAULT_DOCS_DIR,
    "tests-dir": DEFAULT_TESTS_DIR,
    "src-dir": [...DEFAULT_SRC_DIRS],
    "static-check": {},
    "enabled-tools": normalizeEnabledPiUsereqTools(undefined),
    "notify-beep-on-end": true,
    "notify-beep-on-esc": true,
    "notify-beep-on-error": true,
    "notify-sound": "none",
    "notify-sound-toggle-shortcut": DEFAULT_PI_NOTIFY_SOUND_TOGGLE_SHORTCUT,
    "notify-pushover-global-disable": false,
    "notify-pushover-on-success": false,
    "notify-pushover-user-key": "",
    "notify-pushover-api-token": "",
    "notify-pushover-priority": 0,
    PI_NOTIFY_SOUND_LOW_CMD: DEFAULT_PI_NOTIFY_SOUND_LOW_CMD,
    PI_NOTIFY_SOUND_MID_CMD: DEFAULT_PI_NOTIFY_SOUND_MID_CMD,
    PI_NOTIFY_SOUND_HIGH_CMD: DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD,
  };
}

/**
 * @brief Loads and sanitizes the persisted project configuration.
 * @details Returns defaults when the config file does not exist. Otherwise parses JSON, validates directory and static-check field shapes, normalizes enabled tool names plus pi-notify and Pushover fields, applies enabled beep defaults for missing flag payloads, and ignores removed or runtime-derived path metadata. Runtime is O(n) in config size. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @return {UseReqConfig} Sanitized effective configuration.
 * @throws {ReqError} Throws with exit code `11` when the config file contains invalid JSON or a non-object payload.
 * @satisfies CTN-012, REQ-066, REQ-129, REQ-146, REQ-163
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
  const notifyBeepOnEnd = data["notify-beep-on-end"] !== false;
  const notifyBeepOnEsc = data["notify-beep-on-esc"] !== false;
  const notifyBeepOnError = data["notify-beep-on-error"] !== false;
  const notifySound = normalizePiNotifySoundLevel(data["notify-sound"]);
  const notifySoundToggleShortcut = normalizePiNotifyShortcut(data["notify-sound-toggle-shortcut"]);
  const pushoverGlobalDisable = data["notify-pushover-global-disable"] === true;
  const pushoverOnSuccess = data["notify-pushover-on-success"] === true;
  const pushoverUserKey = normalizePiNotifyPushoverCredential(data["notify-pushover-user-key"]);
  const pushoverApiToken = normalizePiNotifyPushoverCredential(data["notify-pushover-api-token"]);
  const pushoverPriority = normalizePiNotifyPushoverPriority(data["notify-pushover-priority"]);
  const lowSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_LOW_CMD, DEFAULT_PI_NOTIFY_SOUND_LOW_CMD);
  const midSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_MID_CMD, DEFAULT_PI_NOTIFY_SOUND_MID_CMD);
  const highSoundCommand = normalizePiNotifyCommand(data.PI_NOTIFY_SOUND_HIGH_CMD, DEFAULT_PI_NOTIFY_SOUND_HIGH_CMD);

  return {
    "docs-dir": docsDir,
    "tests-dir": testsDir,
    "src-dir": srcDir,
    "static-check": staticCheck,
    "enabled-tools": enabledTools,
    "notify-beep-on-end": notifyBeepOnEnd,
    "notify-beep-on-esc": notifyBeepOnEsc,
    "notify-beep-on-error": notifyBeepOnError,
    "notify-sound": notifySound,
    "notify-sound-toggle-shortcut": notifySoundToggleShortcut,
    "notify-pushover-global-disable": pushoverGlobalDisable,
    "notify-pushover-on-success": pushoverOnSuccess,
    "notify-pushover-user-key": pushoverUserKey,
    "notify-pushover-api-token": pushoverApiToken,
    "notify-pushover-priority": pushoverPriority,
    PI_NOTIFY_SOUND_LOW_CMD: lowSoundCommand,
    PI_NOTIFY_SOUND_MID_CMD: midSoundCommand,
    PI_NOTIFY_SOUND_HIGH_CMD: highSoundCommand,
  };
}

/**
 * @brief Builds the persisted configuration payload that excludes runtime-derived fields.
 * @details Copies only the canonical persisted configuration keys into a fresh object so runtime-derived metadata such as `base-path` and `git-path` can never be written to disk while preserving notification and Pushover settings verbatim. Runtime is O(n) in config size. No external state is mutated.
 * @param[in] config {UseReqConfig} Effective configuration object.
 * @return {UseReqConfig} Persistable configuration payload.
 * @satisfies CTN-012, REQ-146, REQ-163
 */
function buildPersistedConfig(config: UseReqConfig): UseReqConfig {
  return {
    "docs-dir": config["docs-dir"],
    "tests-dir": config["tests-dir"],
    "src-dir": [...config["src-dir"]],
    "static-check": Object.fromEntries(
      Object.entries(config["static-check"]).map(([language, entries]) => [
        language,
        entries.map((entry) => ({
          module: entry.module,
          ...(entry.cmd ? { cmd: entry.cmd } : {}),
          ...(entry.params ? { params: [...entry.params] } : {}),
        })),
      ]),
    ),
    "enabled-tools": [...config["enabled-tools"]],
    "notify-beep-on-end": config["notify-beep-on-end"],
    "notify-beep-on-esc": config["notify-beep-on-esc"],
    "notify-beep-on-error": config["notify-beep-on-error"],
    "notify-sound": config["notify-sound"],
    "notify-sound-toggle-shortcut": config["notify-sound-toggle-shortcut"],
    "notify-pushover-global-disable": config["notify-pushover-global-disable"],
    "notify-pushover-on-success": config["notify-pushover-on-success"],
    "notify-pushover-user-key": config["notify-pushover-user-key"],
    "notify-pushover-api-token": config["notify-pushover-api-token"],
    "notify-pushover-priority": config["notify-pushover-priority"],
    PI_NOTIFY_SOUND_LOW_CMD: config.PI_NOTIFY_SOUND_LOW_CMD,
    PI_NOTIFY_SOUND_MID_CMD: config.PI_NOTIFY_SOUND_MID_CMD,
    PI_NOTIFY_SOUND_HIGH_CMD: config.PI_NOTIFY_SOUND_HIGH_CMD,
  };
}

/**
 * @brief Persists the project configuration to disk.
 * @details Creates the parent `.pi-usereq` directory when necessary, strips runtime-derived fields from the serialized payload, and writes formatted JSON terminated by a newline. Runtime is O(n) in serialized config size. Side effects include directory creation and file overwrite.
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
 * @details Computes runtime path context from the execution path, derives installation-owned template and guideline paths, enumerates visible guideline files from the installed resource tree, and returns the token map consumed by prompt templates. Runtime is O(g log g + s) where g is guideline count and s is source-directory count. Side effects are limited to filesystem reads.
 * @param[in] projectBase {string} Absolute project root path.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {Record<string, string>} Placeholder-to-string replacement map including runtime path tokens.
 * @satisfies REQ-002, REQ-103, REQ-106, REQ-107, CTN-011
 */
export function buildPromptReplacementPaths(projectBase: string, config: UseReqConfig): Record<string, string> {
  const runtimePathContext = buildRuntimePathContext(projectBase, config);
  const runtimePathFacts = buildRuntimePathFacts(runtimePathContext);
  const guidelineEntries = fs.existsSync(runtimePathContext.guidelinesPath)
    ? fs.readdirSync(runtimePathContext.guidelinesPath)
        .filter((entry) => !entry.startsWith("."))
        .map((entry) => formatRuntimePathForDisplay(path.join(runtimePathContext.guidelinesPath, entry)))
        .sort((left, right) => left.localeCompare(right))
    : [];

  const srcValue = config["src-dir"].map((value) => `\`${value.replace(/[/\\]+$/, "")}/\``).join(", ");
  const testValue = `\`${config["tests-dir"].replace(/[/\\]+$/, "")}/\``;
  const guidelinesValue = guidelineEntries.length > 0
    ? guidelineEntries.map((entry) => `\`${entry}\``).join(", ")
    : `\`${runtimePathFacts.guidelines_path}/\``;

  return {
    "%%DOC_PATH%%": config["docs-dir"].replace(/[/\\]+$/, ""),
    "%%GUIDELINES_FILES%%": guidelinesValue,
    "%%GUIDELINES_PATH%%": runtimePathFacts.guidelines_path,
    "%%TEMPLATE_PATH%%": runtimePathFacts.templates_path,
    "%%SRC_PATHS%%": srcValue,
    "%%TEST_PATH%%": testValue,
    "%%PROJECT_BASE%%": runtimePathFacts.base_path,
    "%%EXECUTION_PATH%%": runtimePathFacts.execution_path,
    "%%INSTALLATION_PATH%%": runtimePathFacts.installation_path,
    "%%CONFIG_PATH%%": runtimePathFacts.config_path,
  };
}
