/**
 * @file
 * @brief Implements SDK-parity probing and comparison for the standalone debug harness.
 * @details Dynamically loads the official pi SDK when available, inventories extension-owned commands and tools from the runtime surface, normalizes provenance metadata, and compares the result against the offline recorder snapshot. Runtime is O(c + t) in command and tool counts plus the cost of SDK session creation. Side effects are limited to dynamic module loading, optional SDK-managed filesystem reads, and any extension-owned startup behavior triggered by the official runtime.
 */

import path from "node:path";
import { ReqError } from "../../src/core/errors.js";
import type { JsonValue } from "./recording-extension-api.js";
import { replaySessionStart, resolveHarnessPaths, type OfflineContractSnapshot } from "./extension-debug-harness.js";

/**
 * @brief Describes normalized provenance metadata used for parity comparison.
 * @details Reduces raw SDK and offline `sourceInfo` payloads to stable path and ownership fields so comparison is deterministic across absolute-path variations. The interface is compile-time only and introduces no runtime cost.
 */
export interface NormalizedSourceInfo {
  path?: string;
  source?: string;
  scope?: string;
  origin?: string;
  baseDir?: string;
}

/**
 * @brief Describes one normalized command record used by the parity comparator.
 * @details Stores the command name, description, and normalized provenance fields that are stable across offline and SDK inventories. The interface is compile-time only and introduces no runtime cost.
 */
export interface NormalizedCommandRecord {
  name: string;
  description?: string;
  sourceInfo?: NormalizedSourceInfo;
}

/**
 * @brief Describes one normalized tool record used by the parity comparator.
 * @details Stores the tool name, description, parameter-schema presence flag, and normalized provenance fields that are stable across offline and SDK inventories. The interface is compile-time only and introduces no runtime cost.
 */
export interface NormalizedToolRecord {
  name: string;
  description?: string;
  hasParameters: boolean;
  sourceInfo?: NormalizedSourceInfo;
}

/**
 * @brief Describes one normalized SDK inventory snapshot.
 * @details Aggregates extension-owned commands, extension-owned tools, active tools, and runtime-shape metadata extracted from the official SDK surface. The interface is compile-time only and introduces no runtime cost.
 */
export interface SdkContractSnapshot {
  extensionPath: string;
  requestedCwd: string;
  commands: NormalizedCommandRecord[];
  tools: NormalizedToolRecord[];
  activeTools: string[];
  runtimeShape: string;
}

/**
 * @brief Describes one parity mismatch emitted by the comparator.
 * @details Records the mismatch category, subject identifier, and normalized offline versus SDK payloads so callers can render deterministic error reports. The interface is compile-time only and introduces no runtime cost.
 */
export interface ParityMismatch {
  category:
    | "command-name"
    | "command-description"
    | "command-source-info"
    | "tool-name"
    | "tool-description"
    | "tool-parameter-schema"
    | "tool-source-info"
    | "active-tools";
  subject: string;
  detail: string;
  offline?: JsonValue;
  sdk?: JsonValue;
}

/**
 * @brief Describes the complete SDK parity smoke result.
 * @details Combines the offline session-start snapshot, normalized SDK snapshot, and mismatch list into one machine-readable report. The interface is compile-time only and introduces no runtime cost.
 */
export interface SdkSmokeReport {
  ok: boolean;
  offline: OfflineContractSnapshot;
  sdk: SdkContractSnapshot;
  mismatches: ParityMismatch[];
}

/**
 * @brief Describes the minimal SDK runtime methods required by the parity probe.
 * @details Uses structural typing so the probe can adapt to minor SDK surface variations without compile-time coupling to package-local types. The interface is compile-time only and introduces no runtime cost.
 */
interface SdkApiLike {
  getCommands?: () => unknown[];
  getAllTools?: () => unknown[];
  getActiveTools?: () => string[];
}

/**
 * @brief Normalizes one path relative to the requested project root.
 * @details Converts absolute paths under the project root to slash-normalized relative paths and leaves non-project or pseudo-path values unchanged. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] value {unknown} Candidate path value.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {string | undefined} Normalized path or `undefined` when unavailable.
 */
function normalizePathValue(value: unknown, projectRoot: string): string | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }
  if (value.startsWith("<") || (!path.isAbsolute(value) && !value.includes(path.sep) && !value.startsWith("."))) {
    return value.split(path.sep).join("/");
  }
  const normalizedProjectRoot = path.resolve(projectRoot);
  const resolvedValue = path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
  if (resolvedValue.startsWith(normalizedProjectRoot + path.sep) || resolvedValue === normalizedProjectRoot) {
    return path.relative(normalizedProjectRoot, resolvedValue).split(path.sep).join("/") || ".";
  }
  return value.split(path.sep).join("/");
}

/**
 * @brief Normalizes raw provenance metadata for parity comparison.
 * @details Extracts documented `sourceInfo` fields, normalizes path-like members relative to the requested project root, and drops undefined fields for deterministic deep comparison. Runtime is O(p) in field size. No external state is mutated.
 * @param[in] sourceInfo {unknown} Raw `sourceInfo` value.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {NormalizedSourceInfo | undefined} Normalized provenance record or `undefined`.
 */
export function normalizeSourceInfo(sourceInfo: unknown, projectRoot: string): NormalizedSourceInfo | undefined {
  if (!sourceInfo || typeof sourceInfo !== "object") {
    return undefined;
  }
  const candidate = sourceInfo as Record<string, unknown>;
  const normalized: NormalizedSourceInfo = {
    path: normalizePathValue(candidate.path, projectRoot),
    source: typeof candidate.source === "string" ? candidate.source : undefined,
    scope: typeof candidate.scope === "string" ? candidate.scope : undefined,
    origin: typeof candidate.origin === "string" ? candidate.origin : undefined,
    baseDir: normalizePathValue(candidate.baseDir, projectRoot),
  };
  return Object.values(normalized).some((value) => value !== undefined) ? normalized : undefined;
}

/**
 * @brief Normalizes one raw command descriptor.
 * @details Extracts the stable fields required by the parity comparator and trims empty descriptions to `undefined`. Runtime is O(p) in metadata size. No external state is mutated.
 * @param[in] command {unknown} Raw command descriptor.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {NormalizedCommandRecord | undefined} Normalized command record or `undefined` when the payload is invalid.
 */
export function normalizeCommandRecord(command: unknown, projectRoot: string): NormalizedCommandRecord | undefined {
  if (!command || typeof command !== "object") {
    return undefined;
  }
  const candidate = command as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    return undefined;
  }
  return {
    name: candidate.name,
    description: typeof candidate.description === "string" && candidate.description.length > 0 ? candidate.description : undefined,
    sourceInfo: normalizeSourceInfo(candidate.sourceInfo, projectRoot),
  };
}

/**
 * @brief Normalizes one raw tool descriptor.
 * @details Extracts the stable fields required by the parity comparator, including only the presence of a parameter schema instead of the raw schema object. Runtime is O(p) in metadata size. No external state is mutated.
 * @param[in] tool {unknown} Raw tool descriptor.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {NormalizedToolRecord | undefined} Normalized tool record or `undefined` when the payload is invalid.
 */
export function normalizeToolRecord(tool: unknown, projectRoot: string): NormalizedToolRecord | undefined {
  if (!tool || typeof tool !== "object") {
    return undefined;
  }
  const candidate = tool as Record<string, unknown>;
  if (typeof candidate.name !== "string" || candidate.name.length === 0) {
    return undefined;
  }
  return {
    name: candidate.name,
    description: typeof candidate.description === "string" && candidate.description.length > 0 ? candidate.description : undefined,
    hasParameters: candidate.parameters !== undefined,
    sourceInfo: normalizeSourceInfo(candidate.sourceInfo, projectRoot),
  };
}

/**
 * @brief Selects the first candidate object that exposes the SDK inventory methods.
 * @details Tries several plausible access paths derived from documented return objects and runtime wrappers so the parity probe can tolerate minor SDK surface differences. Runtime is O(k) in candidate count. No external state is mutated.
 * @param[in] createAgentSessionResult {unknown} Raw `createAgentSession(...)` result.
 * @return {{ api: SdkApiLike; runtimeShape: string } | undefined} Matched runtime surface descriptor.
 */
function extractSdkApi(createAgentSessionResult: unknown): { api: SdkApiLike; runtimeShape: string } | undefined {
  if (!createAgentSessionResult || typeof createAgentSessionResult !== "object") {
    return undefined;
  }
  const candidateRoot = createAgentSessionResult as Record<string, unknown>;
  const candidates: Array<{ shape: string; value: unknown }> = [
    { shape: "extensionsResult.runtime", value: (candidateRoot.extensionsResult as Record<string, unknown> | undefined)?.runtime },
    { shape: "extensionsResult.runtime.pi", value: ((candidateRoot.extensionsResult as Record<string, unknown> | undefined)?.runtime as Record<string, unknown> | undefined)?.pi },
    { shape: "extensionsResult.runtime.api", value: ((candidateRoot.extensionsResult as Record<string, unknown> | undefined)?.runtime as Record<string, unknown> | undefined)?.api },
    { shape: "session.pi", value: (candidateRoot.session as Record<string, unknown> | undefined)?.pi },
    { shape: "session.extensionApi", value: (candidateRoot.session as Record<string, unknown> | undefined)?.extensionApi },
  ];
  for (const candidate of candidates) {
    if (!candidate.value || typeof candidate.value !== "object") {
      continue;
    }
    const api = candidate.value as SdkApiLike;
    if (typeof api.getCommands === "function" && typeof api.getAllTools === "function" && typeof api.getActiveTools === "function") {
      return { api, runtimeShape: candidate.shape };
    }
  }
  return undefined;
}

/**
 * @brief Tests whether one normalized command belongs to the target extension.
 * @details Accepts descriptors whose provenance identifies extension ownership and rejects prompt-template or skill commands discovered by the SDK. Runtime is O(1). No external state is mutated.
 * @param[in] command {unknown} Raw SDK command descriptor.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {boolean} `true` when the command belongs to the target extension.
 */
function isExtensionCommand(command: unknown, projectRoot: string): boolean {
  if (!command || typeof command !== "object") {
    return false;
  }
  const candidate = command as Record<string, unknown>;
  if (candidate.source === "extension") {
    return true;
  }
  return normalizeSourceInfo(candidate.sourceInfo, projectRoot)?.source === "extension";
}

/**
 * @brief Tests whether one normalized tool belongs to the target extension.
 * @details Accepts descriptors whose provenance identifies extension ownership and rejects built-in or SDK-injected tools from the official runtime. Runtime is O(1). No external state is mutated.
 * @param[in] tool {unknown} Raw SDK tool descriptor.
 * @param[in] projectRoot {string} Absolute project root.
 * @return {boolean} `true` when the tool belongs to the target extension.
 */
function isExtensionTool(tool: unknown, projectRoot: string): boolean {
  if (!tool || typeof tool !== "object") {
    return false;
  }
  const candidate = tool as Record<string, unknown>;
  const source = normalizeSourceInfo(candidate.sourceInfo, projectRoot)?.source;
  return source !== undefined && source !== "builtin" && source !== "sdk";
}

/**
 * @brief Compares two command inventories and appends mismatches.
 * @details Detects missing names, differing descriptions, and differing normalized provenance metadata by command name. Runtime is O(n) in combined inventory size. Side effects mutate the mismatch accumulator only.
 * @param[in] offline {NormalizedCommandRecord[]} Offline command inventory.
 * @param[in] sdk {NormalizedCommandRecord[]} SDK command inventory.
 * @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
 * @return {void} No return value.
 */
function compareCommandInventories(
  offline: NormalizedCommandRecord[],
  sdk: NormalizedCommandRecord[],
  mismatches: ParityMismatch[],
): void {
  const offlineMap = new Map(offline.map((entry) => [entry.name, entry]));
  const sdkMap = new Map(sdk.map((entry) => [entry.name, entry]));
  const allNames = [...new Set([...offlineMap.keys(), ...sdkMap.keys()])].sort();
  for (const name of allNames) {
    const offlineEntry = offlineMap.get(name);
    const sdkEntry = sdkMap.get(name);
    if (!offlineEntry || !sdkEntry) {
      mismatches.push({
        category: "command-name",
        subject: name,
        detail: !offlineEntry ? "Missing from offline inventory." : "Missing from SDK inventory.",
        offline: offlineEntry ? (offlineEntry as unknown as JsonValue) : undefined,
        sdk: sdkEntry ? (sdkEntry as unknown as JsonValue) : undefined,
      });
      continue;
    }
    if ((offlineEntry.description ?? undefined) !== (sdkEntry.description ?? undefined)) {
      mismatches.push({
        category: "command-description",
        subject: name,
        detail: "Command descriptions differ.",
        offline: (offlineEntry.description ?? null) as JsonValue,
        sdk: (sdkEntry.description ?? null) as JsonValue,
      });
    }
    if (JSON.stringify(offlineEntry.sourceInfo ?? null) !== JSON.stringify(sdkEntry.sourceInfo ?? null)) {
      mismatches.push({
        category: "command-source-info",
        subject: name,
        detail: "Command provenance differs.",
        offline: (offlineEntry.sourceInfo ?? null) as JsonValue,
        sdk: (sdkEntry.sourceInfo ?? null) as JsonValue,
      });
    }
  }
}

/**
 * @brief Compares two tool inventories and appends mismatches.
 * @details Detects missing names, differing descriptions, differing parameter-schema presence, and differing normalized provenance metadata by tool name. Runtime is O(n) in combined inventory size. Side effects mutate the mismatch accumulator only.
 * @param[in] offline {NormalizedToolRecord[]} Offline tool inventory.
 * @param[in] sdk {NormalizedToolRecord[]} SDK tool inventory.
 * @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
 * @return {void} No return value.
 */
function compareToolInventories(
  offline: NormalizedToolRecord[],
  sdk: NormalizedToolRecord[],
  mismatches: ParityMismatch[],
): void {
  const offlineMap = new Map(offline.map((entry) => [entry.name, entry]));
  const sdkMap = new Map(sdk.map((entry) => [entry.name, entry]));
  const allNames = [...new Set([...offlineMap.keys(), ...sdkMap.keys()])].sort();
  for (const name of allNames) {
    const offlineEntry = offlineMap.get(name);
    const sdkEntry = sdkMap.get(name);
    if (!offlineEntry || !sdkEntry) {
      mismatches.push({
        category: "tool-name",
        subject: name,
        detail: !offlineEntry ? "Missing from offline inventory." : "Missing from SDK inventory.",
        offline: offlineEntry ? (offlineEntry as unknown as JsonValue) : undefined,
        sdk: sdkEntry ? (sdkEntry as unknown as JsonValue) : undefined,
      });
      continue;
    }
    if ((offlineEntry.description ?? undefined) !== (sdkEntry.description ?? undefined)) {
      mismatches.push({
        category: "tool-description",
        subject: name,
        detail: "Tool descriptions differ.",
        offline: (offlineEntry.description ?? null) as JsonValue,
        sdk: (sdkEntry.description ?? null) as JsonValue,
      });
    }
    if (offlineEntry.hasParameters !== sdkEntry.hasParameters) {
      mismatches.push({
        category: "tool-parameter-schema",
        subject: name,
        detail: "Tool parameter-schema presence differs.",
        offline: offlineEntry.hasParameters,
        sdk: sdkEntry.hasParameters,
      });
    }
    if (JSON.stringify(offlineEntry.sourceInfo ?? null) !== JSON.stringify(sdkEntry.sourceInfo ?? null)) {
      mismatches.push({
        category: "tool-source-info",
        subject: name,
        detail: "Tool provenance differs.",
        offline: (offlineEntry.sourceInfo ?? null) as JsonValue,
        sdk: (sdkEntry.sourceInfo ?? null) as JsonValue,
      });
    }
  }
}

/**
 * @brief Compares offline and SDK active-tool sets after `session_start`.
 * @details Normalizes both arrays as sorted unique sets so parity checks are robust to incidental ordering differences. Runtime is O(n log n) in active-tool count. Side effects mutate the mismatch accumulator only.
 * @param[in] offline {string[]} Offline active-tool names.
 * @param[in] sdk {string[]} SDK active-tool names.
 * @param[in,out] mismatches {ParityMismatch[]} Mutable mismatch accumulator.
 * @return {void} No return value.
 */
function compareActiveTools(offline: string[], sdk: string[], mismatches: ParityMismatch[]): void {
  const offlineNormalized = [...new Set(offline)].sort();
  const sdkNormalized = [...new Set(sdk)].sort();
  if (JSON.stringify(offlineNormalized) !== JSON.stringify(sdkNormalized)) {
    mismatches.push({
      category: "active-tools",
      subject: "session_start",
      detail: "Active tools after session_start differ.",
      offline: offlineNormalized,
      sdk: sdkNormalized,
    });
  }
}

/**
 * @brief Builds a parity report from an offline snapshot and an SDK snapshot.
 * @details Normalizes both inventories by name, compares required mismatch categories, and returns an `ok` flag when no mismatches remain. Runtime is O(n log n) in combined inventory size. No external state is mutated.
 * @param[in] offline {OfflineContractSnapshot} Offline session-start snapshot.
 * @param[in] sdk {SdkContractSnapshot} SDK parity snapshot.
 * @return {SdkSmokeReport} Complete parity report.
 * @satisfies REQ-057
 */
export function buildParityReport(offline: OfflineContractSnapshot, sdk: SdkContractSnapshot): SdkSmokeReport {
  const mismatches: ParityMismatch[] = [];
  const offlineCommands = offline.commands.map((command) => ({
    name: command.name,
    description: command.description,
    sourceInfo: normalizeSourceInfo(command.sourceInfo, offline.requestedCwd),
  }));
  const offlineTools = offline.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    hasParameters: tool.hasParameters,
    sourceInfo: normalizeSourceInfo(tool.sourceInfo, offline.requestedCwd),
  }));
  compareCommandInventories(offlineCommands, sdk.commands, mismatches);
  compareToolInventories(offlineTools, sdk.tools, mismatches);
  compareActiveTools(offline.activeTools, sdk.activeTools, mismatches);
  return {
    ok: mismatches.length === 0,
    offline,
    sdk,
    mismatches,
  };
}

/**
 * @brief Loads the official pi SDK runtime and extracts the extension-owned command and tool inventories.
 * @details Dynamically imports `@mariozechner/pi-coding-agent`, creates a `DefaultResourceLoader` with the requested extension path, creates an SDK session, extracts inventory methods from the returned runtime surface, and filters to extension-owned commands and tools only. Runtime is dominated by SDK startup. Side effects include SDK-managed resource loading and extension startup behavior.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @return {Promise<SdkContractSnapshot>} Normalized SDK inventory snapshot.
 * @throws {ReqError} Throws when the SDK package is unavailable, runtime extraction fails, or session creation fails.
 * @satisfies REQ-050, REQ-056, REQ-058
 */
export async function probeSdkRuntime(cwd?: string, extensionPath?: string): Promise<SdkContractSnapshot> {
  const paths = resolveHarnessPaths(cwd, extensionPath);
  let sdkModule: Record<string, unknown>;
  try {
    sdkModule = await import("@mariozechner/pi-coding-agent") as Record<string, unknown>;
  } catch (error) {
    throw new ReqError(`Error: SDK parity loading failed: ${error instanceof Error ? error.message : String(error)}`, 1);
  }

  const DefaultResourceLoader = sdkModule.DefaultResourceLoader as (new (options: Record<string, unknown>) => { reload?: () => Promise<void> | void });
  const createAgentSession = sdkModule.createAgentSession as ((options: Record<string, unknown>) => Promise<unknown>) | undefined;
  const SessionManager = sdkModule.SessionManager as { inMemory?: () => unknown } | undefined;
  const SettingsManager = sdkModule.SettingsManager as { inMemory?: (settings?: Record<string, unknown>) => unknown } | undefined;

  if (typeof DefaultResourceLoader !== "function" || typeof createAgentSession !== "function" || typeof SessionManager?.inMemory !== "function") {
    throw new ReqError("Error: SDK parity loading failed: required SDK exports are unavailable.", 1);
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: paths.cwd,
    additionalExtensionPaths: [paths.extensionPath],
  });
  if (typeof resourceLoader.reload === "function") {
    await resourceLoader.reload();
  }

  let createAgentSessionResult: unknown;
  try {
    createAgentSessionResult = await createAgentSession({
      cwd: paths.cwd,
      resourceLoader,
      sessionManager: SessionManager.inMemory(),
      settingsManager: typeof SettingsManager?.inMemory === "function" ? SettingsManager.inMemory({}) : undefined,
    });
  } catch (error) {
    throw new ReqError(`Error: SDK parity loading failed: ${error instanceof Error ? error.message : String(error)}`, 1);
  }

  const extracted = extractSdkApi(createAgentSessionResult);
  if (!extracted) {
    throw new ReqError("Error: SDK parity loading failed: runtime inventory surface not found.", 1);
  }

  const commands = (extracted.api.getCommands?.() ?? [])
    .filter((command) => isExtensionCommand(command, paths.cwd))
    .map((command) => normalizeCommandRecord(command, paths.cwd))
    .filter((command): command is NormalizedCommandRecord => command !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  const tools = (extracted.api.getAllTools?.() ?? [])
    .filter((tool) => isExtensionTool(tool, paths.cwd))
    .map((tool) => normalizeToolRecord(tool, paths.cwd))
    .filter((tool): tool is NormalizedToolRecord => tool !== undefined)
    .sort((left, right) => left.name.localeCompare(right.name));

  const activeTools = [...new Set((extracted.api.getActiveTools?.() ?? []).filter((toolName) => tools.some((tool) => tool.name === toolName)))].sort();

  return {
    extensionPath: paths.extensionPath,
    requestedCwd: paths.cwd,
    commands,
    tools,
    activeTools,
    runtimeShape: extracted.runtimeShape,
  };
}

/**
 * @brief Executes the full SDK parity smoke workflow.
 * @details Replays offline `session_start`, probes the official SDK runtime, and compares the resulting command, tool, provenance, parameter-schema, and active-tool inventories. Runtime is dominated by SDK startup plus offline replay. Side effects include both offline and SDK extension startup behavior.
 * @param[in] cwd {string | undefined} Requested working directory.
 * @param[in] extensionPath {string | undefined} Requested extension entry path.
 * @return {Promise<SdkSmokeReport>} Complete parity smoke result.
 * @satisfies REQ-050, REQ-056, REQ-057, REQ-058
 */
export async function runSdkSmoke(cwd?: string, extensionPath?: string): Promise<SdkSmokeReport> {
  const offlineReport = await replaySessionStart(cwd, extensionPath, { reason: "startup" });
  const sdkSnapshot = await probeSdkRuntime(cwd, extensionPath);
  return buildParityReport(offlineReport, sdkSnapshot);
}
