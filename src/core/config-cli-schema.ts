/**
 * @file
 * @brief Defines the canonical configuration CLI schema plus typed path operations.
 * @details Supplies one strict schema for the additive `--get`, `--set`, `--unset`, `--print`, and `--info` commands over the existing local and global configuration scopes. Defaults derive from `getDefaultConfig(...)` and enum domains derive from the existing configuration inventories, so the CLI never keeps a diverging parameter list. The module resolves case-sensitive colon paths, parses typed input, validates whole payloads, projects payloads onto the schema, and applies mutations to in-memory scope payloads. Runtime is O(n) in schema node count plus payload size. No filesystem writes occur here.
 * @satisfies REQ-533, REQ-535, REQ-536, REQ-541, REQ-545, REQ-546, REQ-551, REQ-556, REQ-561, REQ-562
 */

import {
  DEFAULT_STATIC_CHECK_LANGUAGES,
  getDefaultConfig,
  getPersistedGlobalConfigPayload,
  getPersistedLocalConfigPayload,
} from "./config.js";
import { DEBUG_PROMPT_NAMES, DEBUG_WORKFLOW_STATES } from "./debug-runtime.js";
import { ReqError } from "./errors.js";
import { PI_USEREQ_CUSTOM_TOOL_NAMES, PI_USEREQ_EMBEDDED_TOOL_NAMES, PI_USEREQ_STARTUP_TOOL_NAMES } from "./pi-usereq-tools.js";
import { PI_NOTIFY_SOUND_LEVELS } from "./pi-notify.js";

/**
 * @brief Enumerates the supported configuration scopes.
 * @details Distinguishes the project-local `.pi-usereq.json` scope from the cross-project global scope used by `~/.config/pi-usereq/config.json`. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-533
 */
export type ConfigScope = "local" | "global";

/**
 * @brief Enumerates supported parameter value kinds.
 * @details Restricts typed parsing, validation, display, and mutation to the documented scalar, selection, array, and object-array kinds present in the application schema. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-536
 */
export type ConfigValueKind =
  | "string"
  | "integer"
  | "float"
  | "boolean"
  | "selection"
  | "string-array"
  | "object-array";

/**
 * @brief Describes one fixed field inside an object-array item schema.
 * @details Carries the exact persisted field token, its scalar or array type, English documentation, constraint text, requirement flag, optional default, and a schema-valid example used by generated commands. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-555
 */
export interface ConfigSchemaField {
  token: string;
  type: "string" | "string-array";
  description: string;
  constraints: string;
  required: boolean;
  nonEmpty: boolean;
  itemNonEmpty: boolean;
  defaultValue?: unknown;
  example: unknown;
}

/**
 * @brief Describes one fixed-schema configuration section.
 * @details Stores the exact schema token, its full canonical path, owning scope, access key chain, English description, and ordered real children. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-541, REQ-543
 */
export interface ConfigSchemaSection {
  kind: "section";
  token: string;
  path: string;
  scope: ConfigScope;
  access: string[];
  description: string;
  children: ConfigSchemaNode[];
}

/**
 * @brief Describes one configurable parameter leaf.
 * @details Stores the exact persisted token, full canonical path, owning scope, access key chain, English documentation, value kind, constraint text, default value, enum domain, optional item domain, object fields, and a schema-valid example. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-552, REQ-554, REQ-555
 */
export interface ConfigSchemaParameter {
  kind: "parameter";
  token: string;
  path: string;
  scope: ConfigScope;
  access: string[];
  description: string;
  valueKind: ConfigValueKind;
  constraints: string;
  defaultValue: unknown;
  nonEmpty: boolean;
  enumValues?: readonly string[];
  integerValues?: readonly number[];
  enumMeanings?: Record<string, string>;
  itemEnum?: readonly string[];
  itemNonEmpty: boolean;
  fields: ConfigSchemaField[];
  example: unknown;
}

/**
 * @brief Represents one schema section or parameter.
 * @details Discriminated union consumed by path resolution, validation, projection, and rendering. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-541
 */
export type ConfigSchemaNode = ConfigSchemaSection | ConfigSchemaParameter;

/**
 * @brief Describes one resolved display or mutation target.
 * @details Narrows a canonical path onto a section, a parameter, one array element, one object-array field, or one append/insert operation while retaining the parsed index. The alias is compile-time only and introduces no runtime cost.
 * @satisfies REQ-545, REQ-546
 */
export type ConfigTarget =
  | { type: "section"; scope: ConfigScope; section: ConfigSchemaSection }
  | { type: "parameter"; scope: ConfigScope; parameter: ConfigSchemaParameter }
  | { type: "array-item"; scope: ConfigScope; parameter: ConfigSchemaParameter; index: number }
  | { type: "array-field"; scope: ConfigScope; parameter: ConfigSchemaParameter; index: number; field: ConfigSchemaField }
  | { type: "array-append"; scope: ConfigScope; parameter: ConfigSchemaParameter }
  | { type: "array-insert"; scope: ConfigScope; parameter: ConfigSchemaParameter; index: number };

/**
 * @brief Stores one mutable configuration scope state pair.
 * @details Keys the projected local and global payloads used by read and mutation commands so a single invocation can resolve any schema path. The interface is compile-time only and introduces no runtime cost.
 * @satisfies REQ-533
 */
export interface ConfigScopeState {
  local: Record<string, unknown>;
  global: Record<string, unknown>;
}

/**
 * @brief Defines the canonical `enable|disable` selection domain.
 * @details Reuses the persisted enablement tokens shared by static-check languages, worktree settings, and debug flags. Access complexity is O(1).
 * @satisfies REQ-562
 */
const ENABLE_DISABLE_VALUES = ["enable", "disable"] as const;

/**
 * @brief Defines the canonical debug workflow-status filter domain.
 * @details Combines the `any` pass-through token with every documented workflow state. Access complexity is O(1).
 * @satisfies REQ-562
 */
const DEBUG_LOG_ON_STATUS_VALUES = ["any", ...DEBUG_WORKFLOW_STATES] as const;

/**
 * @brief Defines English meanings for the `enable|disable` selection domain.
 * @details Reused by the `--info` allowed-values tables. Access complexity is O(1).
 * @satisfies REQ-554
 */
const ENABLE_DISABLE_MEANINGS: Record<string, string> = {
  enable: "Enables the setting.",
  disable: "Disables the setting.",
};

/**
 * @brief Defines English meanings for the debug workflow-status filter domain.
 * @details Reused by the `--info` allowed-values tables. Access complexity is O(1).
 * @satisfies REQ-554
 */
const DEBUG_LOG_ON_STATUS_MEANINGS: Record<string, string> = {
  any: "Logs entries for every workflow state.",
  idle: "Logs entries only while idle.",
  checking: "Logs entries only while checking.",
  running: "Logs entries only while running.",
  merging: "Logs entries only while merging.",
  warning: "Logs entries only on warning.",
  error: "Logs entries only on error.",
};

/**
 * @brief Defines English meanings for the sound-level selection domain.
 * @details Reused by the `--info` allowed-values tables. Access complexity is O(1).
 * @satisfies REQ-554
 */
const SOUND_LEVEL_MEANINGS: Record<string, string> = {
  none: "Plays no sound.",
  low: "Plays the low-volume sound command.",
  mid: "Plays the mid-volume sound command.",
  high: "Plays the high-volume sound command.",
};

/**
 * @brief Defines English meanings for the Pushover priority domain.
 * @details Reused by the `--info` allowed-values tables. Access complexity is O(1).
 * @satisfies REQ-554
 */
const PUSHOVER_PRIORITY_MEANINGS: Record<string, string> = {
  "0": "Normal priority.",
  "1": "High priority.",
};

/**
 * @brief Defines the fixed object-array fields of one static-check checker entry.
 * @details `module` is required, while `cmd` and `params` stay optional removable keys because persisted entries may omit them. Access complexity is O(1).
 * @satisfies REQ-555, REQ-556
 */
const STATIC_CHECK_FIELDS: ConfigSchemaField[] = [
  {
    token: "module",
    type: "string",
    description: "Checker module identifier.",
    constraints: "String: non-empty",
    required: true,
    nonEmpty: true,
    itemNonEmpty: false,
    example: "Command",
  },
  {
    token: "cmd",
    type: "string",
    description: "Executable name or installation-anchored command.",
    constraints: "String: non-empty",
    required: false,
    nonEmpty: true,
    itemNonEmpty: false,
    example: "eslint",
  },
  {
    token: "params",
    type: "string-array",
    description: "Extra command arguments.",
    constraints: "Array[String]",
    required: false,
    nonEmpty: false,
    itemNonEmpty: false,
    example: ["--check"],
  },
];

/**
 * @brief Memoizes the projected default payloads used for schema defaults.
 * @details Initializes once from `getDefaultConfig(...)` so every command shares one default source. Access complexity is O(1) after first initialization.
 * @satisfies REQ-562
 */
let schemaDefaultsCache: ConfigScopeState | undefined;

/**
 * @brief Resolves the projected default payloads for both scopes.
 * @details Derives defaults from the canonical `getDefaultConfig(...)` composition rather than duplicating literals. Runtime is O(n) on the first call in config size and O(1) afterwards. Side effect: initializes the module-local cache.
 * @return {ConfigScopeState} Projected default payloads keyed by scope.
 * @satisfies REQ-562
 */
function getSchemaDefaults(): ConfigScopeState {
  if (!schemaDefaultsCache) {
    const defaultConfig = getDefaultConfig("");
    schemaDefaultsCache = {
      local: getPersistedLocalConfigPayload(defaultConfig),
      global: getPersistedGlobalConfigPayload(defaultConfig),
    };
  }
  return schemaDefaultsCache;
}

/**
 * @brief Memoizes the canonical schema tree.
 * @details Built once per process because schema shape and defaults are process-stable. Access complexity is O(1) after first initialization.
 * @satisfies REQ-541, REQ-562
 */
let configSchemaCache: ConfigSchemaSection[] | undefined;

/**
 * @brief Tests whether one value is a plain JSON object.
 * @details Rejects null, arrays, and non-objects so payload handling never misclassifies containers. Runtime is O(1). No external state is mutated.
 * @param[in] value {unknown} Candidate value.
 * @return {boolean} `true` when the value is a plain object.
 * @satisfies REQ-535
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * @brief Clones one JSON-compatible schema value.
 * @details Uses `structuredClone` so populated defaults never leak mutations back into the cached schema. Runtime is O(n) in value size. No external state is mutated.
 * @param[in] value {unknown} Value to clone.
 * @return {unknown} Detached clone.
 * @satisfies REQ-561
 */
export function cloneConfigSchemaValue(value: unknown): unknown {
  return value === undefined ? undefined : structuredClone(value);
}

/**
 * @brief Reads one nested value from a payload.
 * @details Walks the supplied key chain, returning `undefined` when any intermediate value is not a plain object. Runtime is O(k) in key count. No external state is mutated.
 * @param[in] source {unknown} Payload root.
 * @param[in] keys {readonly string[]} Key chain.
 * @return {unknown} Nested value or `undefined`.
 * @satisfies REQ-545
 */
function getAtPath(source: unknown, keys: readonly string[]): unknown {
  let current: unknown = source;
  for (const key of keys) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

/**
 * @brief Writes one nested value into a payload, creating intermediate objects.
 * @details Mutates the supplied payload so mutation commands can share one scope state. Runtime is O(k) in key count. Side effect: mutates `target`.
 * @param[in,out] target {Record<string, unknown>} Payload root to mutate.
 * @param[in] keys {readonly string[]} Key chain.
 * @param[in] value {unknown} Value to store.
 * @return {void} No return value.
 * @satisfies REQ-545
 */
function setAtPath(target: Record<string, unknown>, keys: readonly string[], value: unknown): void {
  let current = target;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index]!;
    const next = current[key];
    if (!isPlainObject(next)) {
      const created: Record<string, unknown> = {};
      current[key] = created;
      current = created;
      continue;
    }
    current = next;
  }
  current[keys[keys.length - 1]!] = value;
}

/**
 * @brief Resolves the scope token rendered as the top-level section identifier.
 * @details Maps each persisted scope onto the documented capitalised section token. Runtime is O(1). No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @return {string} Top-level section token.
 * @satisfies REQ-533
 */
function getScopeToken(scope: ConfigScope): string {
  return scope === "local" ? "Local" : "Global";
}

/**
 * @brief Builds one parameter schema node with defaults resolved from the shared default payloads.
 * @details Computes the full canonical path, resolves the default value by access chain, and copies every supplied domain or field descriptor. Runtime is O(1) plus clone cost of the default. No external state is mutated.
 * @param[in] input {object} Parameter descriptor without path and default.
 * @return {ConfigSchemaParameter} Completed parameter node.
 * @satisfies REQ-552, REQ-562
 */
function createParameter(input: {
  scope: ConfigScope;
  token: string;
  access: string[];
  description: string;
  valueKind: ConfigValueKind;
  constraints: string;
  fallbackDefault: unknown;
  nonEmpty?: boolean;
  enumValues?: readonly string[];
  integerValues?: readonly number[];
  enumMeanings?: Record<string, string>;
  itemEnum?: readonly string[];
  itemNonEmpty?: boolean;
  fields?: ConfigSchemaField[];
  example: unknown;
}): ConfigSchemaParameter {
  const defaults = getSchemaDefaults()[input.scope];
  const resolvedDefault = getAtPath(defaults, input.access);
  return {
    kind: "parameter",
    token: input.token,
    path: [getScopeToken(input.scope), ...input.access].join(":"),
    scope: input.scope,
    access: [...input.access],
    description: input.description,
    valueKind: input.valueKind,
    constraints: input.constraints,
    defaultValue: resolvedDefault === undefined ? input.fallbackDefault : cloneConfigSchemaValue(resolvedDefault),
    nonEmpty: input.nonEmpty ?? false,
    ...(input.enumValues ? { enumValues: input.enumValues } : {}),
    ...(input.integerValues ? { integerValues: input.integerValues } : {}),
    ...(input.enumMeanings ? { enumMeanings: input.enumMeanings } : {}),
    ...(input.itemEnum ? { itemEnum: input.itemEnum } : {}),
    itemNonEmpty: input.itemNonEmpty ?? false,
    fields: input.fields ?? [],
    example: input.example,
  };
}

/**
 * @brief Builds the per-language static-check sections for one scope.
 * @details Emits one fixed-schema branch per documented language, exposing only the persisted `enabled` leaf for the local scope and only the persisted `checkers` array for the global scope. Runtime is O(l). No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @return {ConfigSchemaSection[]} Ordered language sections.
 * @satisfies REQ-541, REQ-562
 */
function createStaticCheckLanguageSections(scope: ConfigScope): ConfigSchemaSection[] {
  return DEFAULT_STATIC_CHECK_LANGUAGES.map((language) => {
    const languageAccess = ["static-check", language];
    const parameter = scope === "local"
      ? createParameter({
          scope,
          token: "enabled",
          access: [...languageAccess, "enabled"],
          description: `Static-check enablement for ${language}.`,
          valueKind: "selection",
          constraints: "Selection: enable|disable",
          fallbackDefault: "disable",
          enumValues: ENABLE_DISABLE_VALUES,
          enumMeanings: ENABLE_DISABLE_MEANINGS,
          example: "disable",
        })
      : createParameter({
          scope,
          token: "checkers",
          access: [...languageAccess, "checkers"],
          description: `Configured ${language} static-check command entries.`,
          valueKind: "object-array",
          constraints: "Array[Dictionary]: module, cmd, params",
          fallbackDefault: [],
          fields: STATIC_CHECK_FIELDS,
          example: { module: "Command" },
        });
    return {
      kind: "section",
      token: language,
      path: `${getScopeToken(scope)}:static-check:${language}`,
      scope,
      access: languageAccess,
      description: `${language} static-check configuration.`,
      children: [parameter],
    };
  });
}

/**
 * @brief Builds the complete canonical configuration schema tree.
 * @details Composes the `Local` and `Global` scopes in persisted-key order, including the fixed-schema `static-check` dictionary branches, and memoizes the result. Runtime is O(n) on the first call in schema size and O(1) afterwards. No external state is mutated beyond the module-local cache.
 * @return {ConfigSchemaSection[]} Top-level schema sections.
 * @satisfies REQ-533, REQ-541, REQ-562
 */
export function getConfigSchema(): ConfigSchemaSection[] {
  if (configSchemaCache) {
    return configSchemaCache;
  }
  const localChildren: ConfigSchemaNode[] = [
    createParameter({
      scope: "local",
      token: "docs-dir",
      access: ["docs-dir"],
      description: "Documentation directory relative to the project root.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "usereq/docs",
      nonEmpty: true,
      example: "documentation",
    }),
    createParameter({
      scope: "local",
      token: "tests-dir",
      access: ["tests-dir"],
      description: "Unit-test directory relative to the project root.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "tests",
      nonEmpty: true,
      example: "spec",
    }),
    createParameter({
      scope: "local",
      token: "src-dir",
      access: ["src-dir"],
      description: "Source-code directories relative to the project root.",
      valueKind: "string-array",
      constraints: "Array[String]: non-empty items",
      fallbackDefault: ["src"],
      itemNonEmpty: true,
      example: "lib",
    }),
    createParameter({
      scope: "local",
      token: "context-files-requirements",
      access: ["context-files-requirements"],
      description: "Inject REQUIREMENTS.md into prompt context.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    createParameter({
      scope: "local",
      token: "context-files-references",
      access: ["context-files-references"],
      description: "Inject REFERENCES.md into prompt context.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    createParameter({
      scope: "local",
      token: "context-files-workflow",
      access: ["context-files-workflow"],
      description: "Inject WORKFLOW.md into prompt context.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    {
      kind: "section",
      token: "static-check",
      path: "Local:static-check",
      scope: "local",
      access: ["static-check"],
      description: "Project-local static-check enablement per language.",
      children: createStaticCheckLanguageSections("local"),
    },
    createParameter({
      scope: "local",
      token: "DEBUG_LOG_FILE",
      access: ["DEBUG_LOG_FILE"],
      description: "Debug JSON log file path.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "/tmp/PI-useReq.json",
      nonEmpty: true,
      example: "/tmp/pi-usereq-debug.json",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_PROMPTS_ENABLED",
      access: ["DEBUG_PROMPTS_ENABLED"],
      description: "Save dispatched prompt debug files.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "disable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "enable",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_PROMPTS_LOG_PATH",
      access: ["DEBUG_PROMPTS_LOG_PATH"],
      description: "Directory for dispatched prompt debug files.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "/tmp/PI-useReq",
      nonEmpty: true,
      example: "/tmp/pi-usereq-prompts",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_STATUS_CHANGES",
      access: ["DEBUG_STATUS_CHANGES"],
      description: "Log every prompt workflow-state transition.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "disable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "enable",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_WORKFLOW_EVENTS",
      access: ["DEBUG_WORKFLOW_EVENTS"],
      description: "Log dedicated prompt workflow events.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "disable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "enable",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_TOOL_COMMANDS_ENABLED",
      access: ["DEBUG_TOOL_COMMANDS_ENABLED"],
      description: "Register debug wrapper slash commands for tools.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "disable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "enable",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_LOG_ON_STATUS",
      access: ["DEBUG_LOG_ON_STATUS"],
      description: "Workflow state that permits debug logging.",
      valueKind: "selection",
      constraints: "Selection: any|idle|checking|running|merging|error",
      fallbackDefault: "running",
      enumValues: DEBUG_LOG_ON_STATUS_VALUES,
      enumMeanings: DEBUG_LOG_ON_STATUS_MEANINGS,
      example: "any",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_ENABLED_TOOLS",
      access: ["DEBUG_ENABLED_TOOLS"],
      description: "Tool names whose executions are debug-logged.",
      valueKind: "string-array",
      constraints: "Array[String]: configurable tool names",
      fallbackDefault: [],
      itemEnum: [...PI_USEREQ_CUSTOM_TOOL_NAMES, ...PI_USEREQ_EMBEDDED_TOOL_NAMES],
      example: "read",
    }),
    createParameter({
      scope: "local",
      token: "DEBUG_ENABLED_PROMPTS",
      access: ["DEBUG_ENABLED_PROMPTS"],
      description: "Prompt command names whose events are debug-logged.",
      valueKind: "string-array",
      constraints: "Array[String]: req-* command names",
      fallbackDefault: [],
      itemEnum: DEBUG_PROMPT_NAMES,
      example: DEBUG_PROMPT_NAMES[0] ?? "req-analyze",
    }),
  ];
  const globalChildren: ConfigSchemaNode[] = [
    {
      kind: "section",
      token: "static-check",
      path: "Global:static-check",
      scope: "global",
      access: ["static-check"],
      description: "Cross-project static-check command entries per language.",
      children: createStaticCheckLanguageSections("global"),
    },
    createParameter({
      scope: "global",
      token: "enabled-tools",
      access: ["enabled-tools"],
      description: "Tool names enabled at session start.",
      valueKind: "string-array",
      constraints: "Array[String]: configurable tool names",
      fallbackDefault: ["read", "bash", "edit", "write"],
      itemEnum: PI_USEREQ_STARTUP_TOOL_NAMES,
      example: "read",
    }),
    createParameter({
      scope: "global",
      token: "AUTO_GIT_COMMIT",
      access: ["AUTO_GIT_COMMIT"],
      description: "Automatic git commit instruction mode.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "enable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "disable",
    }),
    createParameter({
      scope: "global",
      token: "GIT_WORKTREE_ENABLED",
      access: ["GIT_WORKTREE_ENABLED"],
      description: "Dedicated prompt-command worktree mode.",
      valueKind: "selection",
      constraints: "Selection: enable|disable",
      fallbackDefault: "enable",
      enumValues: ENABLE_DISABLE_VALUES,
      enumMeanings: ENABLE_DISABLE_MEANINGS,
      example: "disable",
    }),
    createParameter({
      scope: "global",
      token: "GIT_WORKTREE_PREFIX",
      access: ["GIT_WORKTREE_PREFIX"],
      description: "Prefix used by generated worktree names.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "PI-useReq-",
      nonEmpty: true,
      example: "PI-wt-",
    }),
    createParameter({
      scope: "global",
      token: "notify-enabled",
      access: ["notify-enabled"],
      description: "Enable command notifications.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-on-completed",
      access: ["notify-on-completed"],
      description: "Notify when a prompt completes.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    createParameter({
      scope: "global",
      token: "notify-on-interrupted",
      access: ["notify-on-interrupted"],
      description: "Notify when a prompt is interrupted.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-on-failed",
      access: ["notify-on-failed"],
      description: "Notify when a prompt fails.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-sound",
      access: ["notify-sound"],
      description: "Boot sound level.",
      valueKind: "selection",
      constraints: "Selection: none|low|mid|high",
      fallbackDefault: "none",
      enumValues: PI_NOTIFY_SOUND_LEVELS,
      enumMeanings: SOUND_LEVEL_MEANINGS,
      example: "low",
    }),
    createParameter({
      scope: "global",
      token: "notify-sound-on-completed",
      access: ["notify-sound-on-completed"],
      description: "Play sound when a prompt completes.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    createParameter({
      scope: "global",
      token: "notify-sound-on-interrupted",
      access: ["notify-sound-on-interrupted"],
      description: "Play sound when a prompt is interrupted.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-sound-on-failed",
      access: ["notify-sound-on-failed"],
      description: "Play sound when a prompt fails.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-sound-toggle-shortcut",
      access: ["notify-sound-toggle-shortcut"],
      description: "Shortcut that cycles the runtime sound level.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "alt+s",
      nonEmpty: true,
      example: "alt+n",
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-enabled",
      access: ["notify-pushover-enabled"],
      description: "Enable Pushover delivery.",
      valueKind: "boolean",
      constraints: "Boolean: requires both credentials",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-on-completed",
      access: ["notify-pushover-on-completed"],
      description: "Push when a prompt completes.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: true,
      example: false,
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-on-interrupted",
      access: ["notify-pushover-on-interrupted"],
      description: "Push when a prompt is interrupted.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-on-failed",
      access: ["notify-pushover-on-failed"],
      description: "Push when a prompt fails.",
      valueKind: "boolean",
      constraints: "Boolean",
      fallbackDefault: false,
      example: true,
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-user-key",
      access: ["notify-pushover-user-key"],
      description: "Pushover user or delivery-group key.",
      valueKind: "string",
      constraints: "String",
      fallbackDefault: "",
      example: "user-key",
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-api-token",
      access: ["notify-pushover-api-token"],
      description: "Pushover application API token.",
      valueKind: "string",
      constraints: "String",
      fallbackDefault: "",
      example: "api-token",
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-priority",
      access: ["notify-pushover-priority"],
      description: "Pushover message priority.",
      valueKind: "integer",
      constraints: "Integer: 0|1",
      fallbackDefault: 0,
      integerValues: [0, 1],
      enumMeanings: PUSHOVER_PRIORITY_MEANINGS,
      example: 1,
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-title",
      access: ["notify-pushover-title"],
      description: "Pushover title template.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "%%PROMT%% @ %%BASE%% [%%TIME%%]",
      nonEmpty: true,
      example: "%%PROMT%% completed",
    }),
    createParameter({
      scope: "global",
      token: "notify-pushover-text",
      access: ["notify-pushover-text"],
      description: "Pushover message template.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "%%RESULT%%\n%%OUTPUT%%",
      nonEmpty: true,
      example: "%%RESULT%%",
    }),
    createParameter({
      scope: "global",
      token: "PI_NOTIFY_CMD",
      access: ["PI_NOTIFY_CMD"],
      description: "Shell command for command notifications.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "notify-send",
      nonEmpty: true,
      example: "notify-send \"PI-useReq\" done",
    }),
    createParameter({
      scope: "global",
      token: "PI_NOTIFY_SOUND_LOW_CMD",
      access: ["PI_NOTIFY_SOUND_LOW_CMD"],
      description: "Shell command for the low sound level.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "paplay",
      nonEmpty: true,
      example: "paplay %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3",
    }),
    createParameter({
      scope: "global",
      token: "PI_NOTIFY_SOUND_MID_CMD",
      access: ["PI_NOTIFY_SOUND_MID_CMD"],
      description: "Shell command for the mid sound level.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "paplay",
      nonEmpty: true,
      example: "paplay --volume=20000 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3",
    }),
    createParameter({
      scope: "global",
      token: "PI_NOTIFY_SOUND_HIGH_CMD",
      access: ["PI_NOTIFY_SOUND_HIGH_CMD"],
      description: "Shell command for the high sound level.",
      valueKind: "string",
      constraints: "String: non-empty",
      fallbackDefault: "paplay",
      nonEmpty: true,
      example: "paplay --volume=65535 %%INSTALLATION_PATH%%/resources/sounds/Soft-high-tech-notification-sound-effect.mp3",
    }),
  ];
  configSchemaCache = [
    {
      kind: "section",
      token: "Global",
      path: "Global",
      scope: "global",
      access: [],
      description: "Cross-project configuration.",
      children: globalChildren,
    },
    {
      kind: "section",
      token: "Local",
      path: "Local",
      scope: "local",
      access: [],
      description: "Project-local configuration.",
      children: localChildren,
    },
  ];
  return configSchemaCache;
}

/**
 * @brief Resolves one top-level schema section by scope.
 * @details Looks up the `Local` or `Global` section from the cached schema. Runtime is O(1). No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @return {ConfigSchemaSection} Matching top-level section.
 * @satisfies REQ-533
 */
export function getScopeSection(scope: ConfigScope): ConfigSchemaSection {
  return getConfigSchema().find((section) => section.scope === scope)!;
}

/**
 * @brief Parses one array index token into a non-negative integer.
 * @details Accepts only canonical decimal text without signs or leading zeroes so ambiguous indices are rejected deterministically. Runtime is O(n) in token length. No external state is mutated.
 * @param[in] token {string} Raw index token.
 * @param[in] configPath {string} Full path used in diagnostics.
 * @return {number} Parsed zero-based index.
 * @throws {ReqError} Throws when the token is not a canonical non-negative decimal index.
 * @satisfies REQ-545, REQ-546
 */
function parseIndexToken(token: string, configPath: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(token)) {
    throw new ReqError(`Error: invalid array index "${token}" in configuration path "${configPath}".`, 1);
  }
  return Number(token);
}

/**
 * @brief Resolves the array-operation tail of one parameter path.
 * @details Recognises `:append`, `:+`, `:insert:<Idx>`, `:<Idx>`, and `:<Idx>:<Field>` tails for array parameters and rejects every other extension deterministically. Runtime is O(t) in tail token count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Array parameter being extended.
 * @param[in] tail {string[]} Remaining path tokens after the parameter.
 * @param[in] configPath {string} Full path used in diagnostics.
 * @return {ConfigTarget} Resolved array target.
 * @throws {ReqError} Throws when the tail cannot address the parameter.
 * @satisfies REQ-545, REQ-546
 */
function resolveParameterTail(
  parameter: ConfigSchemaParameter,
  tail: string[],
  configPath: string,
): ConfigTarget {
  if (parameter.valueKind !== "string-array" && parameter.valueKind !== "object-array") {
    throw new ReqError(`Error: configuration path "${configPath}" cannot extend parameter "${parameter.path}".`, 1);
  }
  const head = tail[0]!;
  if (head === "append" || head === "+") {
    if (tail.length > 1) {
      throw new ReqError(`Error: configuration path "${configPath}" must end after "${head}".`, 1);
    }
    return { type: "array-append", scope: parameter.scope, parameter };
  }
  if (head === "insert") {
    if (tail.length !== 2) {
      throw new ReqError(`Error: configuration path "${configPath}" must use ":insert:<Idx>".`, 1);
    }
    return {
      type: "array-insert",
      scope: parameter.scope,
      parameter,
      index: parseIndexToken(tail[1]!, configPath),
    };
  }
  const index = parseIndexToken(head, configPath);
  if (tail.length === 1) {
    return { type: "array-item", scope: parameter.scope, parameter, index };
  }
  if (parameter.valueKind !== "object-array" || tail.length !== 2) {
    throw new ReqError(`Error: configuration path "${configPath}" cannot extend array row "${head}".`, 1);
  }
  const fieldToken = tail[1]!;
  const field = parameter.fields.find((candidate) => candidate.token === fieldToken);
  if (!field) {
    throw new ReqError(`Error: unknown field "${fieldToken}" for configuration path "${configPath}".`, 1);
  }
  return { type: "array-field", scope: parameter.scope, parameter, index, field };
}

/**
 * @brief Resolves one canonical configuration path against the schema.
 * @details Performs a case-sensitive token walk from the top-level scope section and delegates array tails to `resolveParameterTail(...)`. Runtime is O(p) in path token count. No external state is mutated.
 * @param[in] configPath {string} Canonical colon-separated path.
 * @return {ConfigTarget} Resolved target descriptor.
 * @throws {ReqError} Throws for empty, malformed, or unknown paths.
 * @satisfies REQ-545, REQ-546
 */
export function resolveConfigTarget(configPath: string): ConfigTarget {
  if (typeof configPath !== "string" || configPath.length === 0) {
    throw new ReqError("Error: configuration path must not be empty.", 1);
  }
  const tokens = configPath.split(":");
  if (tokens.some((token) => token.length === 0)) {
    throw new ReqError(`Error: invalid configuration path "${configPath}": empty path token.`, 1);
  }
  let node: ConfigSchemaNode | undefined = getConfigSchema().find((section) => section.token === tokens[0]);
  if (!node || node.kind !== "section") {
    throw new ReqError(`Error: unknown configuration path "${configPath}": token "${tokens[0]}" is not a configuration section.`, 1);
  }
  let section: ConfigSchemaSection = node;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index]!;
    const child = section.children.find((candidate) => candidate.token === token);
    if (!child) {
      throw new ReqError(`Error: unknown configuration path "${configPath}": token "${token}" is not defined under "${section.path}".`, 1);
    }
    if (child.kind === "section") {
      section = child;
      continue;
    }
    if (index + 1 >= tokens.length) {
      return { type: "parameter", scope: child.scope, parameter: child };
    }
    return resolveParameterTail(child, tokens.slice(index + 1), configPath);
  }
  return { type: "section", scope: section.scope, section };
}

/**
 * @brief Reads one parameter value from a scope payload with default fallback.
 * @details Returns the persisted value when present and a detached default clone otherwise. Runtime is O(k) in key count. No external state is mutated.
 * @param[in] scopePayload {Record<string, unknown>} Scope payload.
 * @param[in] parameter {ConfigSchemaParameter} Parameter to read.
 * @return {unknown} Parameter value.
 * @satisfies REQ-539
 */
export function readParameterValue(
  scopePayload: Record<string, unknown>,
  parameter: ConfigSchemaParameter,
): unknown {
  const value = getAtPath(scopePayload, parameter.access);
  return value === undefined ? cloneConfigSchemaValue(parameter.defaultValue) : value;
}

/**
 * @brief Projects one object-array row onto the fixed field schema.
 * @details Copies only known field tokens, preserves string-array fields as string arrays, and drops unknown keys so payloads stay schema-strict. Runtime is O(f) in field count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
 * @param[in] row {unknown} Candidate persisted row.
 * @return {Record<string, unknown>} Projected row.
 * @satisfies REQ-561
 */
function projectObjectRow(
  parameter: ConfigSchemaParameter,
  row: unknown,
): Record<string, unknown> {
  if (!isPlainObject(row)) {
    return {};
  }
  const projected: Record<string, unknown> = {};
  for (const field of parameter.fields) {
    const value = row[field.token];
    if (value === undefined) {
      continue;
    }
    projected[field.token] = field.type === "string-array" && Array.isArray(value)
      ? value.map((item) => String(item))
      : value;
  }
  return projected;
}

/**
 * @brief Projects one parameter value onto the schema.
 * @details Normalizes object-array rows and string arrays so `--print` and `--get` always expose schema-shaped values. Runtime is O(n) in array size. No external state is mutated.
 * @param[in] scopePayload {Record<string, unknown>} Scope payload.
 * @param[in] parameter {ConfigSchemaParameter} Parameter to project.
 * @return {unknown} Projected value.
 * @satisfies REQ-561
 */
export function projectParameterValue(
  scopePayload: Record<string, unknown>,
  parameter: ConfigSchemaParameter,
): unknown {
  const value = readParameterValue(scopePayload, parameter);
  if (parameter.valueKind === "object-array") {
    return Array.isArray(value)
      ? value.map((row) => projectObjectRow(parameter, row))
      : [];
  }
  if (parameter.valueKind === "string-array") {
    return Array.isArray(value) ? value.map((item) => String(item)) : [];
  }
  return value;
}

/**
 * @brief Projects one section subtree onto the schema.
 * @details Emits the exact persisted key order for every schema child, reading values through the absolute access chain so nested `static-check` branches resolve correctly. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Section to project.
 * @param[in] scopePayload {Record<string, unknown>} Scope payload.
 * @return {Record<string, unknown>} Projected subtree.
 * @satisfies REQ-561
 */
export function projectSectionValue(
  section: ConfigSchemaSection,
  scopePayload: Record<string, unknown>,
): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const child of section.children) {
    projected[child.token] = child.kind === "section"
      ? projectSectionValue(child, scopePayload)
      : projectParameterValue(scopePayload, child);
  }
  return projected;
}

/**
 * @brief Projects one complete scope payload onto the schema.
 * @details Drops every key absent from the canonical schema before a write so the persisted file always validates against the strict schema. Runtime is O(n) in schema node count. No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @param[in] payload {Record<string, unknown>} Candidate payload.
 * @return {Record<string, unknown>} Schema-projected payload.
 * @satisfies REQ-561
 */
export function projectScopePayload(
  scope: ConfigScope,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return projectSectionValue(getScopeSection(scope), payload);
}

/**
 * @brief Resolves the projected default subtree of one section.
 * @details Projects the section against the cached default payload so `--unset` and branch completion restore documented defaults. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Section to resolve.
 * @return {Record<string, unknown>} Default subtree.
 * @satisfies REQ-556, REQ-562
 */
export function getSectionDefaultValue(section: ConfigSchemaSection): Record<string, unknown> {
  return projectSectionValue(section, getSchemaDefaults()[section.scope]);
}

/**
 * @brief Collects every schema parameter leaf of one scope section.
 * @details Performs one depth-first walk over the section children, recursing into nested sections and collecting parameter leaves in schema declaration order so default-merge and write-pruning consumers iterate one canonical parameter list. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Section subtree to walk.
 * @return {ConfigSchemaParameter[]} Parameter leaves in schema order.
 */
function collectScopeParameters(section: ConfigSchemaSection): ConfigSchemaParameter[] {
  const parameters: ConfigSchemaParameter[] = [];
  const visit = (node: ConfigSchemaNode): void => {
    if (node.kind === "section") {
      for (const child of node.children) visit(child);
      return;
    }
    parameters.push(node);
  };
  for (const child of section.children) visit(child);
  return parameters;
}

/**
 * @brief Tests whether two schema values render identical JSON text.
 * @details Compares `JSON.stringify(...)` renderings so typed scalars, arrays, and objects compare structurally while `undefined` equals only `undefined`. Runtime is O(n) in serialized size. No external state is mutated.
 * @param[in] left {unknown} First schema value.
 * @param[in] right {unknown} Second schema value.
 * @return {boolean} `true` when both values render identical JSON text.
 */
function isSameSchemaValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * @brief Merges one fallback value into every absent parameter chain of one raw scope payload.
 * @details Starts from a detached clone of the raw payload so persisted values, unknown persisted keys, and key order stay verbatim, then writes the fallback payload value into every schema parameter chain absent from the raw payload. Runtime is O(n) in schema node count plus clone size. No external state is mutated beyond the returned clone.
 * @param[in] scope {ConfigScope} Owning configuration scope.
 * @param[in] rawPayload {Record<string, unknown> | undefined} Raw persisted payload; `undefined` yields an empty base.
 * @param[in] fallbackPayload {Record<string, unknown>} Effective scope payload supplying the fallback value of every absent chain.
 * @return {Record<string, unknown>} Merged payload holding every persisted value plus one fallback value per absent parameter chain.
 * @satisfies REQ-690, REQ-691
 */
export function mergeScopeAbsentDefaults(
  scope: ConfigScope,
  rawPayload: Record<string, unknown> | undefined,
  fallbackPayload: Record<string, unknown>,
): Record<string, unknown> {
  const merged = rawPayload === undefined ? {} : structuredClone(rawPayload);
  for (const parameter of collectScopeParameters(getScopeSection(scope))) {
    if (getAtPath(merged, parameter.access) !== undefined) {
      continue;
    }
    const fallbackValue = getAtPath(fallbackPayload, parameter.access);
    if (fallbackValue !== undefined) {
      setAtPath(merged, parameter.access, structuredClone(fallbackValue));
    }
  }
  return merged;
}

/**
 * @brief Builds the sparse write payload of one `--set` or `--unset` mutation.
 * @details Starts from a detached clone of the raw persisted payload so absent parameter chains stay absent, writes the projected post-mutation value into every chain present in the raw payload, and additionally writes only chains whose value the requested operation changed relative to the pre-mutation payload; unknown raw keys are preserved verbatim. Runtime is O(n) in schema node count plus clone size. No external state is mutated beyond the returned clone.
 * @param[in] scope {ConfigScope} Owning configuration scope.
 * @param[in] projectedPayload {Record<string, unknown>} Schema-projected post-mutation scope payload.
 * @param[in] beforePayload {Record<string, unknown>} Schema-projected pre-mutation scope payload.
 * @param[in] rawPayload {Record<string, unknown> | undefined} Raw persisted payload; `undefined` yields an empty base.
 * @return {Record<string, unknown>} Sparse payload holding every persisted chain plus operation-changed chains only.
 * @satisfies REQ-693
 */
export function buildScopeMutationWritePayload(
  scope: ConfigScope,
  projectedPayload: Record<string, unknown>,
  beforePayload: Record<string, unknown>,
  rawPayload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const raw = rawPayload ?? {};
  const written = structuredClone(raw);
  for (const parameter of collectScopeParameters(getScopeSection(scope))) {
    const afterValue = getAtPath(projectedPayload, parameter.access);
    if (afterValue === undefined) {
      continue;
    }
    const rawValue = getAtPath(raw, parameter.access);
    if (rawValue === undefined && isSameSchemaValue(afterValue, getAtPath(beforePayload, parameter.access))) {
      continue;
    }
    setAtPath(written, parameter.access, structuredClone(afterValue));
  }
  return written;
}

/**
 * @brief Parses one raw JSON value for a configuration input.
 * @details Wraps `JSON.parse(...)` with a deterministic English diagnostic naming the target path. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] rawValue {string} Raw JSON text.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {unknown} Parsed JSON value.
 * @throws {ReqError} Throws when the text is not valid JSON.
 * @satisfies REQ-536
 */
function parseJsonInput(rawValue: string, pathLabel: string): unknown {
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ReqError(`Error: invalid JSON value for "${pathLabel}": ${message}`, 1);
  }
}

/**
 * @brief Validates one string-array field or parameter item list.
 * @details Requires string items, enforces non-empty items when configured, and checks the optional enum domain before reporting the first failure. Runtime is O(n) in item count. No external state is mutated.
 * @param[in] value {unknown} Candidate array.
 * @param[in] itemLabel {string} Path label used in diagnostics.
 * @param[in] itemNonEmpty {boolean} Whether items must be non-empty.
 * @param[in] itemEnum {readonly string[] | undefined} Optional allowed item domain.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the array or one item is invalid.
 * @satisfies REQ-535, REQ-536
 */
function validateStringArray(
  value: unknown,
  itemLabel: string,
  itemNonEmpty: boolean,
  itemEnum: readonly string[] | undefined,
): void {
  if (!Array.isArray(value)) {
    throw new ReqError(`Error: invalid value for "${itemLabel}": expected a JSON array of strings.`, 1);
  }
  for (const item of value) {
    if (typeof item !== "string") {
      throw new ReqError(`Error: invalid value for "${itemLabel}": expected string items.`, 1);
    }
    if (itemNonEmpty && item.trim() === "") {
      throw new ReqError(`Error: invalid value for "${itemLabel}": items must be non-empty.`, 1);
    }
    if (itemEnum && !itemEnum.includes(item)) {
      throw new ReqError(`Error: invalid value "${item}" for "${itemLabel}": allowed values are ${itemEnum.join(", ")}.`, 1);
    }
  }
}

/**
 * @brief Validates one fixed object-array field value.
 * @details Branches between scalar strings and string arrays so field updates share one validation contract. Runtime is O(n) in array size. No external state is mutated.
 * @param[in] field {ConfigSchemaField} Field schema.
 * @param[in] value {unknown} Candidate value.
 * @param[in] pathLabel {string} Path label used in diagnostics.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the value violates the field schema.
 * @satisfies REQ-535
 */
function validateFieldValue(field: ConfigSchemaField, value: unknown, pathLabel: string): void {
  if (field.type === "string-array") {
    validateStringArray(value, pathLabel, field.itemNonEmpty, undefined);
    return;
  }
  if (typeof value !== "string") {
    throw new ReqError(`Error: invalid value for "${pathLabel}": expected a string.`, 1);
  }
  if (field.nonEmpty && value.trim() === "") {
    throw new ReqError(`Error: invalid value for "${pathLabel}": expected a non-empty string.`, 1);
  }
}

/**
 * @brief Validates one object-array row against its fixed field schema.
 * @details Rejects non-objects, unknown field tokens, missing required fields, and invalid field values so rows stay strict. Runtime is O(f) in field count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
 * @param[in] row {unknown} Candidate row.
 * @param[in] pathLabel {string} Path label used in diagnostics.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the row violates the schema.
 * @satisfies REQ-535, REQ-555
 */
function validateObjectRow(
  parameter: ConfigSchemaParameter,
  row: unknown,
  pathLabel: string,
): void {
  if (!isPlainObject(row)) {
    throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON object.`, 1);
  }
  const allowedTokens = new Set(parameter.fields.map((field) => field.token));
  for (const key of Object.keys(row)) {
    if (!allowedTokens.has(key)) {
      throw new ReqError(`Error: unknown field "${key}" for "${pathLabel}".`, 1);
    }
  }
  for (const field of parameter.fields) {
    const value = row[field.token];
    if (value === undefined) {
      if (field.required) {
        throw new ReqError(`Error: missing required field "${field.token}" for "${pathLabel}".`, 1);
      }
      continue;
    }
    validateFieldValue(field, value, `${pathLabel}:${field.token}`);
  }
}

/**
 * @brief Validates one parameter value against the strict schema.
 * @details Enforces scalar type, non-empty constraints, selection domains, integer domains, and array item or row schemas. Runtime is O(n) in array size. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @param[in] value {unknown} Candidate value.
 * @param[in] pathLabel {string} Path label used in diagnostics.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the value violates the schema.
 * @satisfies REQ-535
 */
export function validateParameterValue(
  parameter: ConfigSchemaParameter,
  value: unknown,
  pathLabel: string,
): void {
  switch (parameter.valueKind) {
    case "string":
      if (typeof value !== "string" || (parameter.nonEmpty && value.trim() === "")) {
        throw new ReqError(`Error: invalid value for "${pathLabel}": expected ${parameter.constraints}.`, 1);
      }
      return;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON boolean.`, 1);
      }
      return;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON integer.`, 1);
      }
      if (parameter.integerValues && !parameter.integerValues.includes(value)) {
        throw new ReqError(`Error: invalid value ${value} for "${pathLabel}": allowed values are ${parameter.integerValues.join(", ")}.`, 1);
      }
      return;
    case "float":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON number.`, 1);
      }
      return;
    case "selection":
      if (typeof value !== "string" || !(parameter.enumValues ?? []).includes(value)) {
        throw new ReqError(`Error: invalid value for "${pathLabel}": allowed values are ${(parameter.enumValues ?? []).join(", ")}.`, 1);
      }
      return;
    case "string-array":
      validateStringArray(value, pathLabel, parameter.itemNonEmpty, parameter.itemEnum);
      return;
    case "object-array":
      if (!Array.isArray(value)) {
        throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON array of objects.`, 1);
      }
      value.forEach((row, index) => validateObjectRow(parameter, row, `${pathLabel}:${index}`));
      return;
  }
}

/**
 * @brief Recursively validates one section subtree against the schema.
 * @details Requires section values to be objects, every schema leaf to be present, and every leaf value to validate; unknown keys are ignored here because projection already removed them. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Section schema.
 * @param[in] scopePayload {Record<string, unknown>} Scope payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws when a section or leaf violates the schema.
 * @satisfies REQ-535
 */
function validateSectionPayload(
  section: ConfigSchemaSection,
  scopePayload: Record<string, unknown>,
): void {
  for (const child of section.children) {
    const value = getAtPath(scopePayload, child.access);
    if (child.kind === "section") {
      if (!isPlainObject(value)) {
        throw new ReqError(`Error: invalid value for "${child.path}": expected a JSON object.`, 1);
      }
      validateSectionPayload(child, scopePayload);
      continue;
    }
    if (value === undefined) {
      throw new ReqError(`Error: missing configuration value for "${child.path}".`, 1);
    }
    validateParameterValue(child, value, child.path);
  }
}

/**
 * @brief Validates one complete schema-projected scope payload.
 * @details Enforces every leaf constraint of the supplied scope before a write so invalid payloads never reach disk. Runtime is O(n) in schema node count. No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @param[in] payload {Record<string, unknown>} Schema-projected payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the payload violates the schema.
 * @satisfies REQ-535
 */
export function validateScopePayload(scope: ConfigScope, payload: Record<string, unknown>): void {
  validateSectionPayload(getScopeSection(scope), payload);
}

/**
 * @brief Parses one whole-parameter `--set` input into the schema type.
 * @details Keeps strings verbatim, parses JSON for typed scalars and arrays, and delegates value-shape errors to the caller validation. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Target parameter.
 * @param[in] rawValue {string} Raw CLI value.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {unknown} Parsed candidate value.
 * @satisfies REQ-536
 */
export function parseWholeParameterInput(
  parameter: ConfigSchemaParameter,
  rawValue: string,
  pathLabel: string,
): unknown {
  switch (parameter.valueKind) {
    case "string":
    case "selection":
      return rawValue;
    case "boolean":
    case "integer":
    case "float":
    case "string-array":
    case "object-array":
      return parseJsonInput(rawValue, pathLabel);
  }
}

/**
 * @brief Parses one array-item `--set` input into the item type.
 * @details Keeps primitive string items verbatim and requires exactly one JSON object for object-array items. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Array parameter.
 * @param[in] rawValue {string} Raw CLI value.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {unknown} Parsed item.
 * @throws {ReqError} Throws when an object-array item is not one JSON object.
 * @satisfies REQ-536, REQ-555
 */
export function parseArrayItemInput(
  parameter: ConfigSchemaParameter,
  rawValue: string,
  pathLabel: string,
): unknown {
  if (parameter.valueKind === "string-array") {
    return rawValue;
  }
  const parsed = parseJsonInput(rawValue, pathLabel);
  if (!isPlainObject(parsed)) {
    throw new ReqError(`Error: invalid value for "${pathLabel}": expected exactly one JSON object.`, 1);
  }
  return parsed;
}

/**
 * @brief Parses one object-array field `--set` input into the field type.
 * @details Keeps string fields verbatim and parses JSON for string-array fields. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] field {ConfigSchemaField} Target field.
 * @param[in] rawValue {string} Raw CLI value.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {unknown} Parsed field value.
 * @satisfies REQ-536
 */
export function parseFieldInput(
  field: ConfigSchemaField,
  rawValue: string,
  pathLabel: string,
): unknown {
  return field.type === "string-array" ? parseJsonInput(rawValue, pathLabel) : rawValue;
}

/**
 * @brief Parses one section `--set` input into a JSON object.
 * @details Requires exactly one JSON object for branch replacement so arrays and scalars are rejected deterministically. Runtime is O(n) in input length. No external state is mutated.
 * @param[in] rawValue {string} Raw CLI value.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {Record<string, unknown>} Parsed object.
 * @throws {ReqError} Throws when the input is not one JSON object.
 * @satisfies REQ-536
 */
function parseSectionInput(rawValue: string, pathLabel: string): Record<string, unknown> {
  const parsed = parseJsonInput(rawValue, pathLabel);
  if (!isPlainObject(parsed)) {
    throw new ReqError(`Error: invalid value for "${pathLabel}": expected a JSON object.`, 1);
  }
  return parsed;
}

/**
 * @brief Completes one section replacement value from supplied keys plus schema defaults.
 * @details Rejects unknown keys, fills omitted children with documented defaults, and validates every supplied leaf so branch replacement always yields a complete schema-compatible subtree. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Target section.
 * @param[in] provided {Record<string, unknown>} Supplied branch object.
 * @param[in] pathLabel {string} Target path used in diagnostics.
 * @return {Record<string, unknown>} Completed subtree.
 * @throws {ReqError} Throws when the supplied object violates the schema.
 * @satisfies REQ-535, REQ-561
 */
function completeSectionValue(
  section: ConfigSchemaSection,
  provided: Record<string, unknown>,
  pathLabel: string,
): Record<string, unknown> {
  const childTokens = new Set(section.children.map((child) => child.token));
  for (const key of Object.keys(provided)) {
    if (!childTokens.has(key)) {
      throw new ReqError(`Error: unknown token "${key}" for "${pathLabel}".`, 1);
    }
  }
  const completed: Record<string, unknown> = {};
  for (const child of section.children) {
    const supplied = provided[child.token];
    if (child.kind === "section") {
      if (supplied === undefined) {
        completed[child.token] = getSectionDefaultValue(child);
        continue;
      }
      if (!isPlainObject(supplied)) {
        throw new ReqError(`Error: invalid value for "${child.path}": expected a JSON object.`, 1);
      }
      completed[child.token] = completeSectionValue(child, supplied, child.path);
      continue;
    }
    const value = supplied === undefined ? cloneConfigSchemaValue(child.defaultValue) : supplied;
    validateParameterValue(child, value, child.path);
    completed[child.token] = cloneConfigSchemaValue(value);
  }
  return completed;
}

/**
 * @brief Resolves the mutable array value of one array parameter.
 * @details Returns the persisted array or installs a detached default array when the payload omits one. Runtime is O(k) in access chain length. Side effect: may mutate the supplied payload.
 * @param[in,out] payload {Record<string, unknown>} Scope payload.
 * @param[in] parameter {ConfigSchemaParameter} Array parameter.
 * @return {unknown[]} Mutable array value.
 * @satisfies REQ-546
 */
function getMutableArray(
  payload: Record<string, unknown>,
  parameter: ConfigSchemaParameter,
): unknown[] {
  const value = getAtPath(payload, parameter.access);
  if (Array.isArray(value)) {
    return value;
  }
  const fallback = cloneConfigSchemaValue(parameter.defaultValue);
  const array = Array.isArray(fallback) ? fallback : [];
  setAtPath(payload, parameter.access, array);
  return array;
}

/**
 * @brief Rejects one out-of-range array index with a deterministic diagnostic.
 * @details Reports the target path, rejected index, valid range, and append affordance so index failures stay actionable. Runtime is O(1). No external state is mutated.
 * @param[in] index {number} Rejected index.
 * @param[in] length {number} Current array length.
 * @param[in] parameter {ConfigSchemaParameter} Target array parameter.
 * @param[in] allowEnd {boolean} Whether the index may equal the length (insertion).
 * @return {void} No return value.
 * @throws {ReqError} Always throws.
 * @satisfies REQ-546
 */
function throwIndexRangeError(
  index: number,
  length: number,
  parameter: ConfigSchemaParameter,
  allowEnd: boolean,
): never {
  const upperBound = allowEnd ? length : length - 1;
  const range = length === 0 && !allowEnd ? "empty array" : `0..${upperBound}`;
  throw new ReqError(
    `Error: index ${index} is out of range for "${parameter.path}"; valid range is ${range}. Use "${parameter.path}:append" or "${parameter.path}:+" to append.`,
    1,
  );
}

/**
 * @brief Applies one `--set` mutation to a mutable scope state.
 * @details Parses and validates the supplied input for the resolved target kind, then mutates the owning scope payload: whole branches, whole parameters, single array rows, single fields, appends, and inserts. Runtime is O(n) in affected array or subtree size. Side effect: mutates `state`.
 * @param[in,out] state {ConfigScopeState} Mutable scope state.
 * @param[in] target {ConfigTarget} Resolved target.
 * @param[in] rawValue {string} Raw CLI value.
 * @return {void} No return value.
 * @throws {ReqError} Throws on invalid input or out-of-range indices without mutating state.
 * @satisfies REQ-535, REQ-536, REQ-546, REQ-556
 */
export function applyConfigSet(
  state: ConfigScopeState,
  target: ConfigTarget,
  rawValue: string,
): void {
  const payload = state[target.scope];
  switch (target.type) {
    case "section": {
      const completed = completeSectionValue(target.section, parseSectionInput(rawValue, target.section.path), target.section.path);
      setAtPath(payload, target.section.access, completed);
      return;
    }
    case "parameter": {
      const value = parseWholeParameterInput(target.parameter, rawValue, target.parameter.path);
      validateParameterValue(target.parameter, value, target.parameter.path);
      setAtPath(payload, target.parameter.access, cloneConfigSchemaValue(value));
      return;
    }
    case "array-item": {
      const array = getMutableArray(payload, target.parameter);
      if (target.index >= array.length) {
        throwIndexRangeError(target.index, array.length, target.parameter, false);
      }
      const itemPath = `${target.parameter.path}:${target.index}`;
      const value = parseArrayItemInput(target.parameter, rawValue, itemPath);
      validateParameterValue(target.parameter, [value], itemPath);
      array[target.index] = cloneConfigSchemaValue(value);
      return;
    }
    case "array-field": {
      const array = getMutableArray(payload, target.parameter);
      if (target.index >= array.length) {
        throwIndexRangeError(target.index, array.length, target.parameter, false);
      }
      const row = array[target.index];
      if (!isPlainObject(row)) {
        throw new ReqError(`Error: row ${target.index} of "${target.parameter.path}" is not a JSON object.`, 1);
      }
      const fieldPath = `${target.parameter.path}:${target.index}:${target.field.token}`;
      const value = parseFieldInput(target.field, rawValue, fieldPath);
      validateFieldValue(target.field, value, fieldPath);
      row[target.field.token] = cloneConfigSchemaValue(value);
      return;
    }
    case "array-append": {
      const array = getMutableArray(payload, target.parameter);
      const itemPath = `${target.parameter.path}:${array.length}`;
      const value = parseArrayItemInput(target.parameter, rawValue, itemPath);
      validateParameterValue(target.parameter, [value], itemPath);
      array.push(cloneConfigSchemaValue(value));
      return;
    }
    case "array-insert": {
      const array = getMutableArray(payload, target.parameter);
      if (target.index > array.length) {
        throwIndexRangeError(target.index, array.length, target.parameter, true);
      }
      const itemPath = `${target.parameter.path}:insert:${target.index}`;
      const value = parseArrayItemInput(target.parameter, rawValue, itemPath);
      validateParameterValue(target.parameter, [value], itemPath);
      array.splice(target.index, 0, cloneConfigSchemaValue(value));
      return;
    }
  }
}

/**
 * @brief Applies one `--unset` mutation to a mutable scope state.
 * @details Restores documented defaults for parameters and branches, removes one array row with index compaction, and resets or removes one object-array field under the required-field rule. Runtime is O(n) in affected array or subtree size. Side effect: mutates `state`.
 * @param[in,out] state {ConfigScopeState} Mutable scope state.
 * @param[in] target {ConfigTarget} Resolved reset target.
 * @return {void} No return value.
 * @throws {ReqError} Throws for append/insert targets, out-of-range indices, or required field resets.
 * @satisfies REQ-546, REQ-556
 */
export function applyConfigUnset(state: ConfigScopeState, target: ConfigTarget): void {
  const payload = state[target.scope];
  switch (target.type) {
    case "section":
      setAtPath(payload, target.section.access, getSectionDefaultValue(target.section));
      return;
    case "parameter":
      setAtPath(payload, target.parameter.access, cloneConfigSchemaValue(target.parameter.defaultValue));
      return;
    case "array-item": {
      const array = getMutableArray(payload, target.parameter);
      if (target.index >= array.length) {
        throwIndexRangeError(target.index, array.length, target.parameter, false);
      }
      array.splice(target.index, 1);
      return;
    }
    case "array-field": {
      const array = getMutableArray(payload, target.parameter);
      if (target.index >= array.length) {
        throwIndexRangeError(target.index, array.length, target.parameter, false);
      }
      const row = array[target.index];
      if (!isPlainObject(row)) {
        throw new ReqError(`Error: row ${target.index} of "${target.parameter.path}" is not a JSON object.`, 1);
      }
      const fieldPath = `${target.parameter.path}:${target.index}:${target.field.token}`;
      if (target.field.defaultValue !== undefined) {
        row[target.field.token] = cloneConfigSchemaValue(target.field.defaultValue);
        return;
      }
      if (target.field.required) {
        throw new ReqError(`Error: cannot reset required field "${target.field.token}" at "${fieldPath}"; it has no default.`, 1);
      }
      delete row[target.field.token];
      return;
    }
    case "array-append":
    case "array-insert":
      throw new ReqError(`Error: configuration path target cannot be reset for "${target.parameter.path}".`, 1);
  }
}

/**
 * @brief Reads one array row or field value for `--get`.
 * @details Resolves the array, enforces the read index range, and projects object rows onto the schema. Runtime is O(1) plus row projection. No external state is mutated.
 * @param[in] scopePayload {Record<string, unknown>} Scope payload.
 * @param[in] target {ConfigTarget} Resolved array target.
 * @return {unknown} Requested row or field value.
 * @throws {ReqError} Throws for append/insert targets or out-of-range indices.
 * @satisfies REQ-546
 */
export function readArrayTargetValue(
  scopePayload: Record<string, unknown>,
  target: Extract<ConfigTarget, { type: "array-item" | "array-field" | "array-append" | "array-insert" }>,
): unknown {
  if (target.type === "array-append" || target.type === "array-insert") {
    throw new ReqError(`Error: configuration path targeting "${target.parameter.path}" is not a read target.`, 1);
  }
  const array = readParameterValue(scopePayload, target.parameter);
  if (!Array.isArray(array) || target.index >= array.length) {
    throwIndexRangeError(target.index, Array.isArray(array) ? array.length : 0, target.parameter, false);
  }
  if (target.type === "array-item") {
    return target.parameter.valueKind === "object-array"
      ? projectObjectRow(target.parameter, array[target.index])
      : array[target.index];
  }
  const row = array[target.index];
  if (!isPlainObject(row)) {
    throw new ReqError(`Error: row ${target.index} of "${target.parameter.path}" is not a JSON object.`, 1);
  }
  return row[target.field.token];
}
