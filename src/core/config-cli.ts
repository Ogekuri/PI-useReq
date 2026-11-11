/**
 * @file
 * @brief Implements the additive pi-usereq configuration CLI.
 * @details Dispatches the leading `--print`, `--info`, `--print-raw`, `--get`, `--set`, and `--unset` commands over the canonical configuration schema. Loads the existing local and global scopes through the shared configuration loaders, bootstraps a missing global JSON file from schema defaults, renders `--print` and `--info` through one deterministic tree renderer, and persists mutations through an atomic same-directory temporary-file replace. Existing menu, prompt-command, and agent-tool behavior is untouched. Runtime is dominated by configuration I/O plus O(n) rendering in node count. Side effects include global-config bootstrapping and atomic configuration writes.
 * @satisfies PRJ-010, DES-032, DES-034, REQ-532, REQ-533, REQ-534, REQ-537, REQ-538, REQ-540, REQ-541, REQ-544, REQ-548, REQ-549, REQ-550, REQ-551, REQ-552, REQ-553, REQ-554, REQ-555, REQ-557, REQ-558, REQ-559, REQ-560, REQ-563
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  getDefaultConfig,
  getGlobalConfigPath,
  getPersistedGlobalConfigPayload,
  getPersistedLocalConfigPayload,
  getProjectConfigPath,
  loadConfig,
  normalizeConfigPaths,
} from "./config.js";
import {
  formatConfigTable,
  renderConfigTree,
  type ConfigRenderRoot,
  type ConfigRenderTreeNode,
} from "./config-cli-render.js";
import {
  applyConfigSet,
  applyConfigUnset,
  getConfigSchema,
  projectParameterValue,
  projectScopePayload,
  projectSectionValue,
  readArrayTargetValue,
  readParameterValue,
  resolveConfigTarget,
  validateScopePayload,
  type ConfigSchemaField,
  type ConfigSchemaParameter,
  type ConfigSchemaSection,
  type ConfigScope,
  type ConfigScopeState,
  type ConfigTarget,
} from "./config-cli-schema.js";
import { ReqError } from "./errors.js";

/**
 * @brief Defines the leading tokens owned by the configuration CLI.
 * @details Uses a set for O(1) invocation detection so standard flag parsing stays untouched for every other argv shape. Access complexity is O(1).
 * @satisfies REQ-558
 */
const CONFIG_CLI_FLAGS = new Set(["--print", "--info", "--print-raw", "--get", "--set", "--unset"]);

/**
 * @brief Tests whether one argv belongs to the configuration CLI surface.
 * @details Requires the configuration flag to be the leading token so the additive commands never capture existing option values. Runtime is O(1). No external state is mutated.
 * @param[in] argv {readonly string[]} Raw CLI arguments excluding the executable and script path.
 * @return {boolean} `true` when the invocation targets the configuration CLI.
 * @satisfies REQ-558
 */
export function isConfigCliInvocation(argv: readonly string[]): boolean {
  return argv.length > 0 && CONFIG_CLI_FLAGS.has(argv[0]!);
}

/**
 * @brief Renders one value as compact JSON text.
 * @details Serializes strings with JSON quoting while keeping numbers and booleans literal, and maps an unserializable value to `null`. Runtime is O(n) in value size. No external state is mutated.
 * @param[in] value {unknown} Value to render.
 * @return {string} JSON text.
 * @satisfies REQ-539, REQ-548
 */
function renderJsonValue(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? "null" : encoded;
}

/**
 * @brief Formats one shell-safe argument for a generated command example.
 * @details Leaves simple tokens bare, single-quotes every string containing spaces or shell metacharacters while escaping embedded single quotes, and renders numbers plus booleans as JSON literals. Runtime is O(n) in value length. No external state is mutated.
 * @param[in] value {unknown} Example value.
 * @return {string} Shell-ready argument text.
 * @satisfies REQ-553
 */
function formatShellArgument(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const text = typeof value === "string" ? value : renderJsonValue(value);
  if (/^[A-Za-z0-9_./:@%+,-]+$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, "'\\''")}'`;
}

/**
 * @brief Formats one `--set` command example.
 * @details Combines the canonical target path with a shell-safe example argument. Runtime is O(n) in argument length. No external state is mutated.
 * @param[in] commandPath {string} Canonical target path.
 * @param[in] value {unknown} Example value.
 * @return {string} Complete `--set` command text.
 * @satisfies REQ-553
 */
function formatSetCommand(commandPath: string, value: unknown): string {
  return `--set ${commandPath} ${formatShellArgument(value)}`;
}

/**
 * @brief Formats the default-or-custom status suffix of one `--print` value.
 * @details Compares the rendered value with the rendered schema default so typed values stay comparable without ad-hoc equality logic. Runtime is O(n) in value size. No external state is mutated.
 * @param[in] currentValue {unknown} Current typed value.
 * @param[in] defaultValue {unknown} Schema default value.
 * @return {string} `(default)` or `(custom | default: <JSON>)`.
 * @satisfies REQ-548
 */
function formatValueStatus(currentValue: unknown, defaultValue: unknown): string {
  if (renderJsonValue(currentValue) === renderJsonValue(defaultValue)) {
    return "(default)";
  }
  return `(custom | default: ${renderJsonValue(defaultValue)})`;
}

/**
 * @brief Renders one table cell from a typed configuration value.
 * @details Uses JSON text for present values and `-` for absent optional keys so multi-line strings stay escaped on one physical line. Runtime is O(n) in value size. No external state is mutated.
 * @param[in] value {unknown} Cell value.
 * @return {string} Rendered cell text.
 * @satisfies REQ-547
 */
function renderTableCell(value: unknown): string {
  return value === undefined ? "-" : renderJsonValue(value);
}

/**
 * @brief Resolves the example item used by append, insert, and replace commands.
 * @details Returns the schema example verbatim so generated commands stay schema-valid. Runtime is O(1). No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Array parameter.
 * @return {unknown} Example item value.
 * @satisfies REQ-551
 */
function getArrayItemExample(parameter: ConfigSchemaParameter): unknown {
  return parameter.example;
}

/**
 * @brief Builds the complete `--print` heading of one parameter.
 * @details Emits primitive values as JSON with default status, selection values as JSON with default status, and array collections with the documented count, target, and append summaries; empty collections receive a complete-path add hint instead of a table. Runtime is O(n) in collection size. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @param[in] value {unknown} Current parameter value.
 * @return {string} Parameter heading.
 * @satisfies REQ-548, REQ-550, REQ-551
 */
function buildPrintParameterHeading(parameter: ConfigSchemaParameter, value: unknown): string {
  if (parameter.valueKind === "string-array" || parameter.valueKind === "object-array") {
    const rows = Array.isArray(value) ? value : [];
    if (rows.length === 0) {
      return `${parameter.token} = (empty list | add: ${formatSetCommand(`${parameter.path}:+`, getArrayItemExample(parameter))})`;
    }
    if (parameter.valueKind === "string-array") {
      return `${parameter.token} = (${rows.length} items | row target: ${parameter.path}:<Idx> | add: ${parameter.path}:+)`;
    }
    return `${parameter.token} = (${rows.length} rows | cell target: ${parameter.path}:<Idx>:<Field> | add: ${parameter.path}:+)`;
  }
  return `${parameter.token} = ${renderJsonValue(value)} ${formatValueStatus(value, parameter.defaultValue)}`;
}

/**
 * @brief Builds the attached `--print` details of one parameter.
 * @details Emits the `Sel | Value` selection table with exactly one active row and the `Idx`-prefixed primitive or object-array tables for non-empty collections. Runtime is O(r * c) in table size. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @param[in] value {unknown} Current parameter value.
 * @return {string[]} Attached detail lines.
 * @satisfies REQ-549, REQ-550, REQ-551
 */
function buildPrintParameterDetails(parameter: ConfigSchemaParameter, value: unknown): string[] {
  if (parameter.valueKind === "selection") {
    const selectionValues = parameter.enumValues ?? [];
    return formatConfigTable(
      ["Sel", "Value"],
      selectionValues.map((candidate) => [candidate === value ? "[*]" : "[ ]", renderJsonValue(candidate)]),
    );
  }
  if (parameter.valueKind === "string-array") {
    const rows = Array.isArray(value) ? value : [];
    return rows.length === 0
      ? []
      : formatConfigTable(["Idx", "Value"], rows.map((row, index) => [String(index), renderTableCell(row)]));
  }
  if (parameter.valueKind === "object-array") {
    const rows = Array.isArray(value) ? value : [];
    if (rows.length === 0) {
      return [];
    }
    const headers = ["Idx", ...parameter.fields.map((field) => field.token)];
    return formatConfigTable(
      headers,
      rows.map((row, index) => [
        String(index),
        ...parameter.fields.map((field) => renderTableCell((row as Record<string, unknown> | undefined)?.[field.token])),
      ]),
    );
  }
  return [];
}

/**
 * @brief Builds the complete `--info` heading of one parameter.
 * @details Emits the exact token, typed constraint text, and one concise English description. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @return {string} Parameter heading.
 * @satisfies REQ-552
 */
function buildInfoParameterHeading(parameter: ConfigSchemaParameter): string {
  return `${parameter.token} - [${parameter.constraints}] ${parameter.description}`;
}

/**
 * @brief Resolves one schema-valid example value distinct from the default when possible.
 * @details Selects an example that exercises the set command without restating the default for booleans, selections, and integer domains, and reuses the schema example otherwise. Runtime is O(e) in enum size. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @return {unknown} Example value.
 * @satisfies REQ-553
 */
function resolveInfoExampleValue(parameter: ConfigSchemaParameter): unknown {
  if (parameter.valueKind === "boolean") {
    return parameter.defaultValue !== true;
  }
  if (parameter.valueKind === "integer" && parameter.integerValues) {
    return parameter.integerValues.find((value) => value !== parameter.defaultValue) ?? parameter.integerValues[0];
  }
  if (parameter.valueKind === "selection" && parameter.enumValues) {
    return parameter.enumValues.find((value) => value !== parameter.defaultValue) ?? parameter.enumValues[0];
  }
  return parameter.example;
}

/**
 * @brief Builds the provided `Value`, `Default`, `Meaning`, and `Set cmd` table.
 * @details Renders one row per enum or integer value with a complete valid set command so `--info` documents the whole selection domain. Runtime is O(v * c) in value count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Selection or integer-enum parameter.
 * @return {string[]} Rendered table lines.
 * @satisfies REQ-554
 */
function buildInfoAllowedValuesTable(parameter: ConfigSchemaParameter): string[] {
  const values = parameter.enumValues ?? (parameter.integerValues ?? []).map((value) => String(value));
  return formatConfigTable(
    ["Value", "Default", "Meaning", "Set cmd"],
    values.map((value) => [
      value,
      value === String(parameter.defaultValue) ? "yes" : "no",
      parameter.enumMeanings?.[value] ?? "",
      `--set ${parameter.path} ${JSON.stringify(value)}`,
    ]),
  );
}

/**
 * @brief Builds the field-description cell of one item-schema row.
 * @details Appends the schema-valid example to the English field description so downstream agents can construct valid rows without extra lookups. Runtime is O(n) in text length. No external state is mutated.
 * @param[in] field {ConfigSchemaField} Field schema.
 * @return {string} Description and example cell text.
 * @satisfies REQ-555
 */
function formatItemSchemaDescription(field: ConfigSchemaField): string {
  return `${field.description} (example: ${renderJsonValue(field.example)})`;
}

/**
 * @brief Builds the `Item Schema` table of one object-array parameter.
 * @details Emits the exact field tokens, type constraints, default-or-requirement status, and description with example for every fixed field. Runtime is O(f * c) in field count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Object-array parameter.
 * @return {string[]} Rendered table lines.
 * @satisfies REQ-555
 */
function buildInfoItemSchemaTable(parameter: ConfigSchemaParameter): string[] {
  return formatConfigTable(
    ["Field", "Type & Constraints", "Default / Req", "Description & Example"],
    parameter.fields.map((field) => [
      field.token,
      field.constraints,
      field.defaultValue !== undefined
        ? renderJsonValue(field.defaultValue)
        : (field.required ? "REQUIRED" : "optional"),
      formatItemSchemaDescription(field),
    ]),
  );
}

/**
 * @brief Builds the array command details of one primitive or object array.
 * @details Emits complete overwrite, append, insert, replace, delete, and reset commands with canonical paths; single-row operations receive exactly one item, whole-array overwrite receives one JSON array, and object arrays additionally emit the item-schema table plus update and reset cell commands. Runtime is O(f * c) in field count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Array parameter.
 * @return {string[]} Attached detail lines.
 * @satisfies REQ-553, REQ-555, REQ-556
 */
function buildInfoArrayDetails(parameter: ConfigSchemaParameter): string[] {
  const lines: string[] = [];
  const itemExample = getArrayItemExample(parameter);
  lines.push(`Overwrite : ${formatSetCommand(parameter.path, [itemExample])}`);
  lines.push(`Append row : ${formatSetCommand(`${parameter.path}:+`, itemExample)}`);
  lines.push(`Insert row : ${formatSetCommand(`${parameter.path}:insert:0`, itemExample)}`);
  lines.push(`Replace row : ${formatSetCommand(`${parameter.path}:0`, itemExample)}`);
  if (parameter.valueKind === "object-array") {
    lines.push("Item Schema:");
    lines.push(...buildInfoItemSchemaTable(parameter));
    const updateField = parameter.fields[0];
    if (updateField) {
      lines.push(`Update cell : ${formatSetCommand(`${parameter.path}:0:${updateField.token}`, updateField.example)}`);
    }
    for (const field of parameter.fields) {
      if (!field.required || field.defaultValue !== undefined) {
        lines.push(`Reset cell : --unset ${parameter.path}:0:${field.token}`);
      }
    }
  }
  lines.push(`Delete row : --unset ${parameter.path}:0`);
  lines.push(`Full overwrite : ${formatSetCommand(parameter.path, [itemExample])}`);
  lines.push(`Reset array : --unset ${parameter.path}`);
  return lines;
}

/**
 * @brief Builds the attached `--info` details of one parameter.
 * @details Emits the default line with its reset command, the set or array command family with complete canonical paths and schema-valid examples, the selection allowed-values table, and the object-array item-schema commands. Runtime is O(f + v) in field and value count. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @return {string[]} Attached detail lines.
 * @satisfies REQ-553, REQ-554, REQ-555, REQ-556
 */
function buildInfoParameterDetails(parameter: ConfigSchemaParameter): string[] {
  const lines: string[] = [
    `Default : ${renderJsonValue(parameter.defaultValue)} (restored via: --unset ${parameter.path})`,
  ];
  if (parameter.valueKind === "string-array" || parameter.valueKind === "object-array") {
    lines.push(...buildInfoArrayDetails(parameter));
  } else {
    lines.push(`Set cmd : ${formatSetCommand(parameter.path, resolveInfoExampleValue(parameter))}`);
    lines.push(`Reset cmd : --unset ${parameter.path}`);
  }
  if (parameter.enumValues || parameter.integerValues) {
    lines.push("Allowed Values:");
    lines.push(...buildInfoAllowedValuesTable(parameter));
  }
  return lines;
}

/**
 * @brief Builds one rendered section node.
 * @details Emits the canonical `[Path: ...]` badge, an optional `--info` reset block, and every real child in schema order. Runtime is O(n) in subtree node count. No external state is mutated.
 * @param[in] section {ConfigSchemaSection} Section schema.
 * @param[in] scopePayload {Record<string, unknown>} Owning scope payload.
 * @param[in] info {boolean} When `true`, build `--info` content instead of `--print` content.
 * @return {ConfigRenderTreeNode} Rendered section node.
 * @satisfies REQ-541, REQ-543
 */
function buildSectionRenderNode(
  section: ConfigSchemaSection,
  scopePayload: Record<string, unknown>,
  info: boolean,
): ConfigRenderTreeNode {
  return {
    heading: `${section.token} - [Path: ${section.path}]`,
    details: info ? [`Reset block : --unset ${section.path}`] : [],
    children: section.children.map((child) => child.kind === "section"
      ? buildSectionRenderNode(child, scopePayload, info)
      : buildParameterRenderNode(child, scopePayload, info)),
  };
}

/**
 * @brief Builds one rendered parameter node.
 * @details Chooses the `--print` or `--info` heading and detail formatters over the same real node so both commands share one tree topology. Runtime is O(n) in value and table size. No external state is mutated.
 * @param[in] parameter {ConfigSchemaParameter} Parameter schema.
 * @param[in] scopePayload {Record<string, unknown>} Owning scope payload.
 * @param[in] info {boolean} When `true`, build `--info` content instead of `--print` content.
 * @return {ConfigRenderTreeNode} Rendered parameter node.
 * @satisfies REQ-541, REQ-548, REQ-549, REQ-550, REQ-552, REQ-553
 */
function buildParameterRenderNode(
  parameter: ConfigSchemaParameter,
  scopePayload: Record<string, unknown>,
  info: boolean,
): ConfigRenderTreeNode {
  const value = readParameterValue(scopePayload, parameter);
  return {
    heading: info ? buildInfoParameterHeading(parameter) : buildPrintParameterHeading(parameter, value),
    details: info ? buildInfoParameterDetails(parameter) : buildPrintParameterDetails(parameter, value),
    children: [],
  };
}

/**
 * @brief Builds the complete rendered root for one display command.
 * @details Emits the virtual `Application_Configuration` root with the documented heading and both real scope sections. Runtime is O(n) in schema node count. No external state is mutated.
 * @param[in] state {ConfigScopeState} Mutable scope state.
 * @param[in] info {boolean} When `true`, build `--info` content.
 * @return {ConfigRenderRoot} Rendered display root.
 * @satisfies REQ-541, REQ-543
 */
function buildFullRenderRoot(state: ConfigScopeState, info: boolean): ConfigRenderRoot {
  return {
    heading: info
      ? "Application_Configuration - Configuration schema"
      : "Application_Configuration - Current configuration",
    children: getConfigSchema().map((section) => buildSectionRenderNode(section, state[section.scope], info)),
  };
}

/**
 * @brief Builds the rendered root for one requested subtree or parameter.
 * @details Emits the requested section or parameter as the unconnected display root with a four-space detail indent and renders only its own descendants, never invented ancestors. Runtime is O(n) in subtree size. No external state is mutated.
 * @param[in] state {ConfigScopeState} Mutable scope state.
 * @param[in] configPath {string} Requested canonical path.
 * @param[in] info {boolean} When `true`, build `--info` content.
 * @return {ConfigRenderRoot} Rendered display root.
 * @throws {ReqError} Throws when the path does not address a section or parameter.
 * @satisfies REQ-544, REQ-545
 */
function buildRequestedRenderRoot(
  state: ConfigScopeState,
  configPath: string,
  info: boolean,
): ConfigRenderRoot {
  const target = resolveConfigTarget(configPath);
  if (target.type === "section") {
    const rendered = buildSectionRenderNode(target.section, state[target.scope], info);
    return { heading: rendered.heading, details: rendered.details, children: rendered.children };
  }
  if (target.type === "parameter") {
    const rendered = buildParameterRenderNode(target.parameter, state[target.scope], info);
    return { heading: rendered.heading, details: rendered.details, children: [] };
  }
  throw new ReqError(`Error: configuration path "${configPath}" does not address a section or parameter.`, 1);
}

/**
 * @brief Loads mutable scope state from the existing configuration loaders.
 * @details Reuses `loadConfig(...)` plus the persisted scope projections so reads and writes observe the same state as the existing menu and prompt-command interfaces. Runtime is dominated by configuration I/O. Side effects are limited to filesystem reads.
 * @param[in] base {string} Absolute project base path.
 * @return {ConfigScopeState} Mutable scope state pair.
 * @satisfies REQ-532, REQ-533
 */
function loadConfigCliState(base: string): ConfigScopeState {
  const effective = normalizeConfigPaths(base, loadConfig(base));
  return {
    local: getPersistedLocalConfigPayload(effective),
    global: getPersistedGlobalConfigPayload(effective),
  };
}

/**
 * @brief Resolves the persisted file path owned by one scope.
 * @details Uses the shared project-local and global configuration path helpers so writes target the same files as the existing interfaces. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @param[in] base {string} Absolute project base path.
 * @return {string} Absolute configuration file path.
 * @satisfies REQ-533
 */
function resolveScopeWritePath(scope: ConfigScope, base: string): string {
  return scope === "local" ? getProjectConfigPath(base) : getGlobalConfigPath();
}

/**
 * @brief Atomically replaces one JSON configuration file.
 * @details Writes the complete payload into a same-directory temporary file with exclusive creation, flushes and fsyncs it, preserves the existing permission bits when the target already exists, atomically renames it over the target, and best-effort fsyncs the directory. Failures remove the temporary file and surface one English diagnostic without touching the target. Runtime is O(n) in serialized size plus filesystem I/O. Side effects include directory creation, temporary-file creation, rename, and conditional fsync.
 * @param[in] filePath {string} Absolute target path.
 * @param[in] payload {Record<string, unknown>} Complete schema-projected payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the write fails.
 * @satisfies REQ-537
 */
function atomicWriteJsonPayload(filePath: string, payload: Record<string, unknown>): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  let existingMode: number | undefined;
  try {
    existingMode = fs.statSync(filePath).mode;
  } catch {
    existingMode = undefined;
  }
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`,
  );
  let fileDescriptor: number | undefined;
  try {
    fileDescriptor = fs.openSync(temporaryPath, "wx", (existingMode ?? 0o600) & 0o777);
    fs.writeFileSync(fileDescriptor, serialized, "utf8");
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    if (existingMode !== undefined) {
      fs.chmodSync(temporaryPath, existingMode & 0o7777);
    }
    fs.renameSync(temporaryPath, filePath);
    try {
      const directoryDescriptor = fs.openSync(directory, "r");
      try {
        fs.fsyncSync(directoryDescriptor);
      } finally {
        fs.closeSync(directoryDescriptor);
      }
    } catch {
      // Directory fsync is unsupported on some platforms; the rename is already durable there.
    }
  } catch (error) {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Best-effort descriptor cleanup before reporting the original failure.
      }
    }
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort temporary-file cleanup before reporting the original failure.
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new ReqError(`Error: cannot write configuration file "${filePath}": ${message}`, 1);
  }
}

/**
 * @brief Initializes the global configuration file from schema defaults when missing.
 * @details Creates the parent directory and writes the documented default payload atomically when the global JSON file is absent, and leaves any existing valid file untouched while rejecting malformed JSON. Runtime is dominated by configuration I/O. Side effects include directory creation and conditional global-file creation.
 * @param[in] base {string} Absolute project base path.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the existing global file is malformed or not a JSON object.
 * @satisfies REQ-534
 */
function ensureGlobalConfigFile(base: string): void {
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    let payload: unknown;
    try {
      payload = JSON.parse(fs.readFileSync(globalPath, "utf8"));
    } catch {
      throw new ReqError(`Error: invalid configuration file "${globalPath}".`, 1);
    }
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
      throw new ReqError(`Error: invalid configuration file "${globalPath}".`, 1);
    }
    return;
  }
  const defaults = getPersistedGlobalConfigPayload(getDefaultConfig(base));
  atomicWriteJsonPayload(globalPath, projectScopePayload("global", defaults));
}

/**
 * @brief Enforces the exact argument count of one configuration command.
 * @details Emits one English diagnostic naming the command and its required operands. Runtime is O(1). No external state is mutated.
 * @param[in] command {string} Configuration command token.
 * @param[in] args {readonly string[]} Command operands.
 * @param[in] minimum {number} Minimum operand count.
 * @param[in] maximum {number} Maximum operand count.
 * @param[in] usage {string} Documented operand shape.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the operand count is outside the requested range.
 * @satisfies REQ-557
 */
function assertCommandArgumentCount(
  command: string,
  args: readonly string[],
  minimum: number,
  maximum: number,
  usage: string,
): void {
  if (args.length < minimum || args.length > maximum) {
    throw new ReqError(`Error: ${command} requires ${usage}.`, 1);
  }
}

/**
 * @brief Rejects one path operand that is actually another option token.
 * @details Keeps the configuration CLI grammar unambiguous by refusing option-like path values. Runtime is O(1). No external state is mutated.
 * @param[in] candidate {string} Path operand.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the operand starts with `--`.
 * @satisfies REQ-545
 */
function assertPathArgument(candidate: string): void {
  if (candidate.startsWith("--")) {
    throw new ReqError(`Error: missing configuration path before "${candidate}".`, 1);
  }
}

/**
 * @brief Reconciles scope-level policy after one mutation.
 * @details Forces persisted worktree disablement whenever automatic git commit is disabled and rejects an explicit attempt to enable worktrees under that policy. Runtime is O(1). Side effect: may mutate the supplied payload.
 * @param[in] target {ConfigTarget} Resolved mutation target.
 * @param[in,out] payload {Record<string, unknown>} Owning scope payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the mutation contradicts the automatic-commit policy.
 * @satisfies REQ-560
 */
function reconcileScopePolicy(target: ConfigTarget, payload: Record<string, unknown>): void {
  if (target.scope !== "global" || payload.AUTO_GIT_COMMIT !== "disable") {
    return;
  }
  const explicitlyAddressesWorktree = target.type === "section"
    || (target.type === "parameter" && target.parameter.token === "GIT_WORKTREE_ENABLED");
  if (explicitlyAddressesWorktree && payload.GIT_WORKTREE_ENABLED === "enable") {
    throw new ReqError(
      'Error: cannot enable "Global:GIT_WORKTREE_ENABLED" while "Global:AUTO_GIT_COMMIT" is "disable".',
      1,
    );
  }
  payload.GIT_WORKTREE_ENABLED = "disable";
}

/**
 * @brief Validates cross-field scope constraints before a write.
 * @details Enforces the Pushover credential prerequisite and the automatic-commit worktree policy so schema-valid payloads cannot encode unusable cross-field states. Runtime is O(1). No external state is mutated.
 * @param[in] scope {ConfigScope} Configuration scope.
 * @param[in] payload {Record<string, unknown>} Candidate scope payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws when a cross-field constraint fails.
 * @satisfies REQ-559, REQ-560
 */
function validateCrossFieldConstraints(scope: ConfigScope, payload: Record<string, unknown>): void {
  if (scope !== "global") {
    return;
  }
  if (payload.AUTO_GIT_COMMIT === "disable" && payload.GIT_WORKTREE_ENABLED === "enable") {
    throw new ReqError(
      'Error: cannot enable "Global:GIT_WORKTREE_ENABLED" while "Global:AUTO_GIT_COMMIT" is "disable".',
      1,
    );
  }
  if (payload["notify-pushover-enabled"] === true) {
    const userKey = payload["notify-pushover-user-key"];
    const apiToken = payload["notify-pushover-api-token"];
    const hasCredentials = typeof userKey === "string" && userKey.trim() !== ""
      && typeof apiToken === "string" && apiToken.trim() !== "";
    if (!hasCredentials) {
      throw new ReqError(
        'Error: cannot enable "Global:notify-pushover-enabled" while "Global:notify-pushover-user-key" or "Global:notify-pushover-api-token" is empty.',
        1,
      );
    }
  }
}

/**
 * @brief Validates, projects, and atomically persists one mutated scope.
 * @details Applies scope policy, checks cross-field constraints, projects the payload onto the canonical schema, validates every leaf, and writes only the owning file. Runtime is dominated by configuration I/O. Side effects include conditional directory creation and atomic file replacement.
 * @param[in] base {string} Absolute project base path.
 * @param[in] target {ConfigTarget} Resolved mutation target.
 * @param[in] payload {Record<string, unknown>} Mutated scope payload.
 * @return {void} No return value.
 * @throws {ReqError} Throws without writing when validation fails.
 * @satisfies REQ-535, REQ-537, REQ-559, REQ-560, REQ-561
 */
function persistScopeMutation(
  base: string,
  target: ConfigTarget,
  payload: Record<string, unknown>,
): void {
  reconcileScopePolicy(target, payload);
  validateCrossFieldConstraints(target.scope, payload);
  const projected = projectScopePayload(target.scope, payload);
  validateScopePayload(target.scope, projected);
  atomicWriteJsonPayload(resolveScopeWritePath(target.scope, base), projected);
}

/**
 * @brief Executes one `--print` or `--info` display command.
 * @details Loads scope state, builds the full or requested render root, and writes the rendered tree to stdout. Runtime is O(n) in rendered node and table size. Side effect: writes to stdout.
 * @param[in] base {string} Absolute project base path.
 * @param[in] configPath {string | undefined} Optional requested path.
 * @param[in] info {boolean} When `true`, render schema documentation instead of values.
 * @return {void} No return value.
 * @satisfies REQ-541, REQ-543, REQ-544, REQ-557
 */
function runDisplayCommand(base: string, configPath: string | undefined, info: boolean): void {
  const state = loadConfigCliState(base);
  const root = configPath === undefined
    ? buildFullRenderRoot(state, info)
    : buildRequestedRenderRoot(state, configPath, info);
  process.stdout.write(renderConfigTree(root));
}

/**
 * @brief Executes one `--get` command.
 * @details Resolves the canonical target, reads the typed value from the owning scope, and writes valid JSON to stdout without decoration. Runtime is O(n) in value size. Side effect: writes to stdout.
 * @param[in] base {string} Absolute project base path.
 * @param[in] configPath {string} Requested canonical path.
 * @return {void} No return value.
 * @satisfies REQ-539, REQ-545
 */
function runGetCommand(base: string, configPath: string): void {
  const state = loadConfigCliState(base);
  const target = resolveConfigTarget(configPath);
  let value: unknown;
  switch (target.type) {
    case "section":
      value = projectSectionValue(target.section, state[target.scope]);
      break;
    case "parameter":
      value = projectParameterValue(state[target.scope], target.parameter);
      break;
    default:
      value = readArrayTargetValue(state[target.scope], target);
      break;
  }
  process.stdout.write(`${renderJsonValue(value)}\n`);
}

/**
 * @brief Executes one `--set` command.
 * @details Resolves the canonical target, applies the typed mutation to in-memory scope state, validates and persists the owning scope atomically, and writes nothing to stdout on success. Runtime is dominated by configuration I/O. Side effects include atomic configuration writes.
 * @param[in] base {string} Absolute project base path.
 * @param[in] configPath {string} Target canonical path.
 * @param[in] rawValue {string} Raw CLI value.
 * @return {void} No return value.
 * @satisfies REQ-535, REQ-536, REQ-537, REQ-546, REQ-556, REQ-563
 */
function runSetCommand(base: string, configPath: string, rawValue: string): void {
  const target = resolveConfigTarget(configPath);
  const state = loadConfigCliState(base);
  applyConfigSet(state, target, rawValue);
  persistScopeMutation(base, target, state[target.scope]);
}

/**
 * @brief Executes one `--unset` command.
 * @details Resolves the canonical target, restores the documented default or removes the addressed row or optional field, validates and persists the owning scope atomically, and writes nothing to stdout on success. Runtime is dominated by configuration I/O. Side effects include atomic configuration writes.
 * @param[in] base {string} Absolute project base path.
 * @param[in] configPath {string} Target canonical path.
 * @return {void} No return value.
 * @satisfies REQ-535, REQ-546, REQ-556, REQ-563
 */
function runUnsetCommand(base: string, configPath: string): void {
  const target = resolveConfigTarget(configPath);
  const state = loadConfigCliState(base);
  applyConfigUnset(state, target);
  persistScopeMutation(base, target, state[target.scope]);
}

/**
 * @brief Executes one `--print-raw` command.
 * @details Bootstraps a missing global file, then writes the selected global configuration file bytes to stdout without parsing, reformatting, or tree decoration. Runtime is O(n) in file size. Side effect: writes raw bytes to stdout.
 * @param[in] base {string} Absolute project base path used for bootstrapping.
 * @return {void} No return value.
 * @satisfies REQ-540
 */
function runPrintRawCommand(base: string): void {
  ensureGlobalConfigFile(base);
  process.stdout.write(fs.readFileSync(getGlobalConfigPath()));
}

/**
 * @brief Executes one parsed configuration CLI invocation.
 * @details Validates the operand shape, bootstraps the global JSON file, and dispatches the selected display, read, or mutation command. Runtime is dominated by the delegated command. Side effects include global-config bootstrapping, stdout writes, and atomic configuration writes.
 * @param[in] argv {readonly string[]} Raw configuration CLI arguments.
 * @return {void} No return value.
 * @throws {ReqError} Throws on malformed invocations or failing commands.
 * @satisfies REQ-534, REQ-538, REQ-558
 */
function executeConfigCli(argv: readonly string[]): void {
  const command = argv[0]!;
  const args = argv.slice(1);
  const base = process.cwd();
  switch (command) {
    case "--print":
      assertCommandArgumentCount(command, args, 0, 1, "[Path]");
      if (args[0] !== undefined) assertPathArgument(args[0]);
      ensureGlobalConfigFile(base);
      runDisplayCommand(base, args[0], false);
      return;
    case "--info":
      assertCommandArgumentCount(command, args, 0, 1, "[Path]");
      if (args[0] !== undefined) assertPathArgument(args[0]);
      ensureGlobalConfigFile(base);
      runDisplayCommand(base, args[0], true);
      return;
    case "--print-raw":
      assertCommandArgumentCount(command, args, 0, 0, "no arguments");
      runPrintRawCommand(base);
      return;
    case "--get":
      assertCommandArgumentCount(command, args, 1, 1, "exactly one configuration path");
      assertPathArgument(args[0]!);
      ensureGlobalConfigFile(base);
      runGetCommand(base, args[0]!);
      return;
    case "--set":
      assertCommandArgumentCount(command, args, 2, 2, "exactly one configuration path and one value");
      assertPathArgument(args[0]!);
      ensureGlobalConfigFile(base);
      runSetCommand(base, args[0]!, args[1]!);
      return;
    case "--unset":
      assertCommandArgumentCount(command, args, 1, 1, "exactly one configuration path");
      assertPathArgument(args[0]!);
      ensureGlobalConfigFile(base);
      runUnsetCommand(base, args[0]!);
      return;
    default:
      throw new ReqError(`Error: unknown configuration command "${command}".`, 1);
  }
}

/**
 * @brief Runs one configuration CLI invocation and normalizes its exit contract.
 * @details Executes the selected command, returns `0` on success, and converts every failure into one English stderr diagnostic with exit code `1` without partial stdout success output. Runtime is dominated by the delegated command. Side effects are stdout or stderr writes plus delegated configuration changes.
 * @param[in] argv {readonly string[]} Raw configuration CLI arguments.
 * @return {number} Process exit code.
 * @satisfies REQ-538, REQ-557, REQ-563
 */
export function runConfigCli(argv: readonly string[]): number {
  try {
    executeConfigCli(argv);
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
    return error instanceof ReqError ? error.code : 1;
  }
}
