/**
 * @file
 * @brief Implements bundled prompt-command preflight and worktree orchestration.
 * @details Centralizes prompt-template-backed `req-<prompt>` repository validation, prompt-specific required-document checks, slash-command-owned worktree naming and lifecycle handling, session-backed cwd switching plus verification, persisted replacement-session context reuse for non-command lifecycle handlers, matched-success stash-assisted fast-forward merge finalization with restored-session transcript preservation, and command-side abort cleanup. Runtime is dominated by git subprocess execution plus bounded filesystem and session-file metadata checks. Side effects include active-session replacement, worktree creation and deletion, branch merges, stash-stack mutation, and filesystem reads and writes.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { ReqError } from "./errors.js";
import { classifyPiNotifyOutcome, type PiNotifyOutcome } from "./pi-notify.js";
import {
  normalizeGitWorktreePrefix,
  resolveEffectiveGitWorktreeEnabled,
  type UseReqConfig,
} from "./config.js";
import {
  logDebugPromptEvent,
  logDebugPromptWorkflowEvent,
  type DebugWorkflowState,
} from "./debug-runtime.js";
import { type PromptCommandName } from "./prompt-command-catalog.js";
import {
  isSameOrAncestorPath,
  normalizeRelativeDirContract,
  setRuntimeContextPath,
  setRuntimeGitPath,
  setRuntimeWorktreePathState,
} from "./path-context.js";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { resolveRuntimeGitPath } from "./runtime-project-paths.js";
import {
  clearPersistedPromptCommandSessionContext,
  readPersistedPromptCommandSessionContext,
  writePersistedPromptCommandSessionContext,
} from "./prompt-command-state.js";

/**
 * @brief Describes one canonical required-document probe.
 * @details Binds a canonical doc filename to the remediation prompt command surfaced on failure so prompt-specific doc validation can stay deterministic. The interface is compile-time only and introduces no runtime cost.
 */
export interface PromptRequiredDocSpec {
  fileName: "REQUIREMENTS.md" | "WORKFLOW.md" | "REFERENCES.md";
  promptCommand: "/req-write" | "/req-workflow" | "/req-references";
}

/**
 * @brief Describes one prompt-command execution plan tracked across lifecycle hooks.
 * @details Stores the prompt identity, runtime git root, associated branch name, original project base, execution context path, persisted origin and execution session files, and optional worktree metadata so the extension can switch all cwd surfaces before prompt dispatch and finalize worktree lifecycle after agent end. The interface is compile-time only and introduces no runtime cost.
 */
export interface PromptCommandExecutionPlan {
  promptName: PromptCommandName;
  promptArgs: string;
  gitPath: string;
  branchName: string;
  basePath: string;
  contextPath: string;
  parentPath: string;
  baseDir: string;
  originalSessionFile: string;
  executionSessionFile: string;
  worktreeDir?: string;
  worktreePath?: string;
  worktreeRootPath?: string;
}

/**
 * @brief Describes one post-create test hook payload for prompt-command worktrees.
 * @details Exposes the git root, generated worktree name, sibling worktree path, and effective execution base so tests can simulate post-create verification failures deterministically. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandPostCreateHookContext {
  gitPath: string;
  worktreeDir: string;
  worktreeRootPath: string;
  worktreePath: string;
}

/**
 * @brief Represents one synchronous test hook invoked after prompt worktree creation.
 * @details Allows tests to mutate or remove newly created worktree artifacts before verification executes. The alias is compile-time only and introduces no runtime cost.
 */
type PromptCommandPostCreateHook = (context: PromptCommandPostCreateHookContext) => void;

/**
 * @brief Describes optional debug logging context for prompt orchestration helpers.
 * @details Carries the effective project configuration and current workflow state so prompt-runtime helpers can append selected debug entries without depending on extension UI types. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandDebugOptions {
  config: UseReqConfig;
  workflowState: DebugWorkflowState;
}

/**
 * @brief Describes prompt-delivery options supported by replacement-session callbacks.
 * @details Mirrors the documented `sendUserMessage(...)` delivery modes needed when prompt orchestration targets a replacement session after a slash-command-owned session switch. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandSessionMessageOptions {
  deliverAs?: "steer" | "followUp";
}

/**
 * @brief Describes the replacement-session callback options accepted by session switching.
 * @details Mirrors the documented pi runtime `withSession(...)` hook so prompt-command orchestration can continue work against the replacement session after the old command context becomes stale. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandSessionSwitchOptions {
  withSession?: (ctx: PromptCommandActiveContext) => Promise<void>;
}

/**
 * @brief Describes the minimal session-bound surface available after session replacement.
 * @details Extends the shared prompt-command context with `sendUserMessage(...)` so prompt dispatch can target the replacement session without reusing stale pre-switch runtime objects. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandActiveContext extends PromptCommandSessionContext {
  sendUserMessage?: (
    content: string | Array<{ type: string; text?: string }>,
    options?: PromptCommandSessionMessageOptions,
  ) => Promise<void> | void;
}

/**
 * @brief Describes one serializable session entry copied into a materialized execution-session file.
 * @details Captures the stable tree-entry fields needed to write a JSONL session snapshot for cross-cwd session replacement when the origin session file has not been flushed yet. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandSessionEntry {
  type: string;
  id: string;
  parentId: string | null;
  timestamp: string;
  [key: string]: unknown;
}

/**
 * @brief Describes the minimal command-context session surface used by prompt orchestration.
 * @details Narrows extension command contexts to the `switchSession(...)` hook, the mutable `cwd` mirror, and the session metadata probes required for cwd verification and session snapshot materialization. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandSessionContext {
  cwd?: string;
  switchSession?: (
    sessionPath: string,
    options?: PromptCommandSessionSwitchOptions,
  ) => Promise<{ cancelled?: boolean } | void> | { cancelled?: boolean } | void;
  sessionManager?: {
    getBranch?: () => PromptCommandSessionEntry[];
    getCwd?: () => string;
    getSessionDir?: () => string | undefined;
    getSessionFile?: () => string | undefined;
  };
}

/**
 * @brief Describes one error object enriched with a replacement-session context.
 * @details Allows prompt orchestration helpers to preserve the last valid session-bound context across replacement boundaries so callers can continue notifications and status updates after switch-triggered failures. The interface is compile-time only and introduces no runtime cost.
 */
interface PromptCommandContextError extends Error {
  promptContext?: PromptCommandSessionContext;
}

/**
 * @brief Stores the optional prompt-command post-create test hook.
 * @details The hook is undefined in production and is invoked only by tests that need deterministic post-create verification failures. Access complexity is O(1).
 */
let promptCommandPostCreateHook: PromptCommandPostCreateHook | undefined;

/**
 * @brief Tests whether the current session file remains reusable for prompt-command bootstrap.
 * @details Accepts only persisted session files whose header cwd is readable, still exists on disk, and remains inside the active project base. This rejects stale execution-session files that still point at deleted or sibling worktrees from earlier prompt runs. Runtime is O(p) plus one session-header read. No external state is mutated.
 * @param[in] sessionFile {string | undefined} Candidate current session file.
 * @param[in] projectBase {string} Active project base path.
 * @return {sessionFile is string} `true` when the session file remains reusable for prompt bootstrap.
 */
function isUsablePromptSessionFile(
  sessionFile: string | undefined,
  projectBase: string,
): sessionFile is string {
  if (typeof sessionFile !== "string" || sessionFile === "") {
    return false;
  }
  const normalizedSessionFile = path.resolve(sessionFile);
  if (!fs.existsSync(normalizedSessionFile) || !fs.statSync(normalizedSessionFile).isFile()) {
    return false;
  }
  const persistedSessionCwd = readPromptSessionFileCwd(normalizedSessionFile);
  if (typeof persistedSessionCwd !== "string") {
    return false;
  }
  const normalizedSessionCwd = path.resolve(persistedSessionCwd);
  return fs.existsSync(normalizedSessionCwd)
    && isSameOrAncestorPath(path.resolve(projectBase), normalizedSessionCwd);
}

/**
 * @brief Resolves the session file path used as the origin for prompt-command session switching.
 * @details Reuses the current session file only when its persisted header cwd is still readable, exists on disk, and remains inside the active project base. Otherwise allocates a fresh session file path rooted at the supplied cwd so later worktree switching and restoration never inherit stale deleted-worktree session metadata. Runtime is dominated by one optional session-header read plus optional session-file allocation. Side effects include session-file path allocation when the active session metadata is stale or ephemeral.
 * @param[in] sessionFile {string | undefined} Current active session file when available.
 * @param[in] cwd {string} Working directory that should own the resolved session file.
 * @return {string} Session file path reserved for prompt orchestration.
 * @throws {ReqError} Throws when a session file path cannot be resolved.
 */
function resolvePromptSessionFile(sessionFile: string | undefined, cwd: string): string {
  if (isUsablePromptSessionFile(sessionFile, cwd)) {
    return path.resolve(sessionFile);
  }
  const sessionManager = SessionManager.create(cwd);
  const createdSessionFile = sessionManager.getSessionFile();
  if (typeof createdSessionFile !== "string" || createdSessionFile === "") {
    throw new ReqError(`ERROR: Unable to prepare persisted session for ${cwd}.`, 1);
  }
  return path.resolve(createdSessionFile);
}

/**
 * @brief Writes one execution-session snapshot file with the target worktree cwd.
 * @details Persists a version-3 JSONL session header whose `cwd` equals the supplied target worktree path, then appends the supplied current-session branch entries unchanged so pi can reopen the replacement session in the correct cwd even when the origin session file has not been flushed yet. Runtime is O(n) in branch-entry count plus serialized byte size. Side effects include directory creation and file overwrite.
 * @param[in] sessionFile {string} Target execution-session file path.
 * @param[in] sessionId {string} Generated execution-session identifier.
 * @param[in] targetCwd {string} Worktree path stored in the session header.
 * @param[in] parentSessionFile {string | undefined} Optional origin session path recorded as `parentSession`.
 * @param[in] branchEntries {PromptCommandSessionEntry[]} Current session branch entries copied into the new session file.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the execution-session snapshot cannot be written.
 * @satisfies REQ-271
 */
function writePromptExecutionSessionSnapshot(
  sessionFile: string,
  sessionId: string,
  targetCwd: string,
  parentSessionFile: string | undefined,
  branchEntries: PromptCommandSessionEntry[],
): void {
  const sessionHeader = {
    type: "session",
    version: 3,
    id: sessionId,
    timestamp: new Date().toISOString(),
    cwd: targetCwd,
    parentSession: parentSessionFile,
  };
  const serializedLines = [
    JSON.stringify(sessionHeader),
    ...branchEntries.map((entry) => JSON.stringify(entry)),
  ];
  try {
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, `${serializedLines.join("\n")}\n`, "utf8");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ReqError(`ERROR: Unable to materialize execution session for ${targetCwd}: ${errorMessage}.`, 1);
  }
}

/**
 * @brief Creates the persisted session file used for worktree-backed prompt execution.
 * @details Forks the resolved origin session into the target cwd when the origin session file is already persisted. Otherwise allocates a new execution-session path, materializes a JSONL header whose `cwd` equals the target worktree path, and copies the current in-memory session branch so pi can switch into the worktree session with the correct runtime cwd. Runtime is dominated by session-file copy or snapshot-write cost. Side effects include session-file creation under the target cwd session directory.
 * @param[in] sourceSessionFile {string} Origin session file path.
 * @param[in] targetCwd {string} Target working directory stored in the execution-session header.
 * @param[in] sessionDir {string | undefined} Active session directory reused for the forked execution session when available.
 * @param[in] sourceSessionBranch {PromptCommandSessionEntry[] | undefined} Current in-memory session branch copied when the origin session file has not been flushed yet.
 * @return {string} Persisted execution-session file path.
 * @throws {ReqError} Throws when the execution-session file cannot be created.
 * @satisfies REQ-271
 */
function createPromptExecutionSessionFile(
  sourceSessionFile: string,
  targetCwd: string,
  sessionDir: string | undefined,
  sourceSessionBranch?: PromptCommandSessionEntry[],
): string {
  const sessionManager = fs.existsSync(sourceSessionFile)
    ? SessionManager.forkFrom(sourceSessionFile, targetCwd, sessionDir)
    : SessionManager.create(targetCwd, sessionDir);
  const executionSessionFile = sessionManager.getSessionFile();
  if (typeof executionSessionFile !== "string" || executionSessionFile === "") {
    throw new ReqError(`ERROR: Unable to prepare execution session for ${targetCwd}.`, 1);
  }
  if (!fs.existsSync(executionSessionFile)) {
    writePromptExecutionSessionSnapshot(
      executionSessionFile,
      sessionManager.getSessionId(),
      targetCwd,
      sourceSessionFile,
      sourceSessionBranch ?? [],
    );
  }
  return path.resolve(executionSessionFile);
}

/**
 * @brief Reads the current active session cwd from a prompt-command context.
 * @details Returns the session-manager cwd only when the supplied context exposes the documented `getCwd()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
 * @return {string | undefined} Active session cwd when available.
 */
function getPromptSessionCwd(ctx?: PromptCommandSessionContext): string | undefined {
  try {
    return typeof ctx?.sessionManager?.getCwd === "function"
      ? ctx.sessionManager.getCwd()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @brief Reads the current active session file from a prompt-command context.
 * @details Returns the session-manager file path only when the supplied context exposes the documented `getSessionFile()` probe and the probe remains valid after any prior session replacement. Stale or missing probes degrade to `undefined` so verification paths never reuse invalidated pre-switch session objects. Runtime is O(1). No external state is mutated.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
 * @return {string | undefined} Active session file when available.
 */
function getPromptSessionFile(ctx?: PromptCommandSessionContext): string | undefined {
  try {
    return typeof ctx?.sessionManager?.getSessionFile === "function"
      ? ctx.sessionManager.getSessionFile()
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @brief Reads the current context cwd from a prompt-command context.
 * @details Returns the context `cwd` only when the supplied getter remains valid after any prior session replacement. Stale getters degrade to `undefined` so verification paths never depend on invalidated pre-switch command objects. Runtime is O(1). No external state is mutated.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
 * @return {string | undefined} Context cwd when available.
 */
function getPromptContextCwd(ctx?: PromptCommandSessionContext): string | undefined {
  try {
    return ctx?.cwd;
  } catch {
    return undefined;
  }
}

/**
 * @brief Resolves the best available command-capable context for prompt session switching.
 * @details Prefers the caller-supplied context when it still exposes `switchSession(...)`, otherwise falls back to the persisted replacement-session context associated with the execution-session file so lifecycle handlers can complete closure when pi emits non-command event contexts. Runtime is O(1). No external state is mutated.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose execution-session file keys the persisted context.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Caller-supplied prompt-command context.
 * @return {{ context: PromptCommandSessionContext | undefined; source: "provided" | "persisted" | "missing" }} Preferred switch context plus its provenance.
 * @satisfies REQ-272, REQ-276
 */
function resolvePromptCommandSwitchContext(
  plan: PromptCommandExecutionPlan,
  ctx?: PromptCommandSessionContext,
): {
  context: PromptCommandSessionContext | undefined;
  source: "provided" | "persisted" | "missing";
} {
  if (typeof ctx?.switchSession === "function") {
    return { context: ctx, source: "provided" };
  }
  const persistedContext = readPersistedPromptCommandSessionContext(plan.executionSessionFile) as PromptCommandSessionContext | undefined;
  if (persistedContext !== undefined) {
    return { context: persistedContext, source: "persisted" };
  }
  return { context: ctx, source: "missing" };
}

/**
 * @brief Aligns the host process cwd to one expected prompt-orchestration path.
 * @details Applies `process.chdir(...)` only when the host process is still anchored to a different directory than the active prompt session, then re-reads `process.cwd()` and throws a deterministic error when the mutation fails or does not take effect. Runtime is O(p) in path length plus one optional cwd mutation. Side effect: mutates the host process cwd.
 * @param[in] expectedPath {string} Path that `process.cwd()` must match.
 * @param[in] stageLabel {string} Human-readable verification stage label.
 * @return {void} No return value.
 * @throws {ReqError} Throws when `process.chdir(...)` fails or leaves `process.cwd()` misaligned.
 * @satisfies REQ-257, REQ-272
 */
function syncPromptCommandProcessCwd(expectedPath: string, stageLabel: string): void {
  const normalizedExpectedPath = path.resolve(expectedPath);
  const observedProcessCwd = path.resolve(process.cwd());
  if (observedProcessCwd !== normalizedExpectedPath) {
    try {
      process.chdir(normalizedExpectedPath);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ReqError(
        `ERROR: ${stageLabel} unable to change process.cwd() to ${normalizedExpectedPath}: ${errorMessage}.`,
        1,
      );
    }
  }
  if (path.resolve(process.cwd()) !== normalizedExpectedPath) {
    throw new ReqError(
      `ERROR: ${stageLabel} expected ${normalizedExpectedPath} but observed process.cwd()=${path.resolve(process.cwd())}.`,
      1,
    );
  }
}

/**
 * @brief Reads the persisted working directory recorded in one prompt-command session file header.
 * @details Opens the JSONL session file, parses the first non-empty line as JSON, and returns the `cwd` field when present as a string so session-target verification can rely on live on-disk session state instead of stale handler-scoped `ctx` references. Runtime is O(n) in header size. No external state is mutated.
 * @param[in] sessionFile {string} Absolute session-file path.
 * @return {string | undefined} Persisted session cwd when readable; otherwise undefined.
 */
function readPromptSessionFileCwd(sessionFile: string): string | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(sessionFile, "utf8");
  } catch {
    return undefined;
  }
  const newlineIndex = raw.indexOf("\n");
  const firstLine = newlineIndex >= 0 ? raw.slice(0, newlineIndex) : raw;
  const trimmed = firstLine.trim();
  if (trimmed === "") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }
  const headerCwd = (parsed as { cwd?: unknown }).cwd;
  return typeof headerCwd === "string" ? headerCwd : undefined;
}

/**
 * @brief Reads one persisted session file as ordered parsed JSONL records.
 * @details Loads the raw session file, preserves every non-empty serialized line verbatim, parses each line as one JSON object, and rejects unreadable or structurally invalid files so prompt-closure helpers can replay exact execution-session transcript records into the restored base session without reserialization drift. Runtime is O(n) in session-file size. No external state is mutated.
 * @param[in] sessionFile {string} Absolute session-file path.
 * @return {Array<{ rawLine: string; parsed: Record<string, unknown> }>} Parsed non-empty JSONL lines in file order.
 * @throws {ReqError} Throws when the file cannot be read, when it contains no JSONL records, when any record is not a JSON object, or when the header record is missing.
 */
function readPromptSessionJsonLines(
  sessionFile: string,
): Array<{ rawLine: string; parsed: Record<string, unknown> }> {
  const normalizedSessionFile = path.resolve(sessionFile);
  let raw: string;
  try {
    raw = fs.readFileSync(normalizedSessionFile, "utf8");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ReqError(
      `ERROR: Unable to read session file ${normalizedSessionFile}: ${errorMessage}.`,
      1,
    );
  }
  const parsedLines: Array<{ rawLine: string; parsed: Record<string, unknown> }> = [];
  for (const [index, rawLine] of raw.split(/\r?\n/u).entries()) {
    if (rawLine.trim() === "") {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ReqError(
        `ERROR: Unable to parse session file ${normalizedSessionFile} line ${index + 1}: ${errorMessage}.`,
        1,
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new ReqError(
        `ERROR: Session file ${normalizedSessionFile} line ${index + 1} is not a JSON object.`,
        1,
      );
    }
    parsedLines.push({ rawLine, parsed: parsed as Record<string, unknown> });
  }
  if (parsedLines.length === 0) {
    throw new ReqError(`ERROR: Session file ${normalizedSessionFile} is empty.`, 1);
  }
  if (parsedLines[0]?.parsed.type !== "session") {
    throw new ReqError(
      `ERROR: Session file ${normalizedSessionFile} is missing a valid session header.`,
      1,
    );
  }
  return parsedLines;
}

/**
 * @brief Copies successful execution-session transcript records into the restored base session file.
 * @details Reads the execution session JSONL file, preserves the original base-session header when it already exists, materializes a restored base-session header when the reserved original session file is still pending persistence, appends any execution-session records missing from the original session in original execution order, and re-reads the restored file to verify both `base-path` cwd and copied entry identifiers. Runtime is O(n) in combined session-file size. Side effects include session-file creation or append operations for the restored base session.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original and execution session files must be synchronized.
 * @return {void} No return value.
 * @throws {ReqError} Throws when either session file is unreadable or when appended execution records are not persisted to the original session file.
 * @satisfies REQ-208
 */
function preservePromptCommandExecutionTranscript(plan: PromptCommandExecutionPlan): void {
  const normalizedOriginalSessionFile = path.resolve(plan.originalSessionFile);
  const normalizedExecutionSessionFile = path.resolve(plan.executionSessionFile);
  if (normalizedOriginalSessionFile === normalizedExecutionSessionFile) {
    return;
  }
  const executionLines = readPromptSessionJsonLines(normalizedExecutionSessionFile);
  const executionEntryIds = executionLines
    .slice(1)
    .map((line) => line.parsed.id)
    .filter((entryId): entryId is string => typeof entryId === "string" && entryId !== "");
  if (!fs.existsSync(normalizedOriginalSessionFile)) {
    const rewrittenHeader: Record<string, unknown> = {
      ...executionLines[0]!.parsed,
      cwd: plan.basePath,
    };
    if (
      typeof rewrittenHeader.parentSession === "string"
      && path.resolve(rewrittenHeader.parentSession) === normalizedOriginalSessionFile
    ) {
      delete rewrittenHeader.parentSession;
    }
    try {
      fs.mkdirSync(path.dirname(normalizedOriginalSessionFile), { recursive: true });
      const serializedLines = [
        JSON.stringify(rewrittenHeader),
        ...executionLines.slice(1).map((line) => line.rawLine),
      ];
      fs.writeFileSync(
        normalizedOriginalSessionFile,
        `${serializedLines.join("\n")}\n`,
        "utf8",
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new ReqError(
        `ERROR: Unable to materialize restored session transcript in ${normalizedOriginalSessionFile}: ${errorMessage}.`,
        1,
      );
    }
  } else {
    const originalLines = readPromptSessionJsonLines(normalizedOriginalSessionFile);
    const existingEntryIds = new Set<string>();
    for (const line of originalLines.slice(1)) {
      const entryId = line.parsed.id;
      if (typeof entryId === "string" && entryId !== "") {
        existingEntryIds.add(entryId);
      }
    }
    const missingExecutionLines = executionLines.slice(1).filter((line) => {
      const entryId = line.parsed.id;
      return typeof entryId === "string"
        && entryId !== ""
        && !existingEntryIds.has(entryId);
    });
    if (missingExecutionLines.length > 0) {
      const originalRaw = fs.readFileSync(normalizedOriginalSessionFile, "utf8");
      const leadingSeparator = originalRaw === "" || originalRaw.endsWith("\n") ? "" : "\n";
      try {
        fs.appendFileSync(
          normalizedOriginalSessionFile,
          `${leadingSeparator}${missingExecutionLines.map((line) => line.rawLine).join("\n")}\n`,
          "utf8",
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new ReqError(
          `ERROR: Unable to preserve execution transcript in ${normalizedOriginalSessionFile}: ${errorMessage}.`,
          1,
        );
      }
    }
  }
  const synchronizedSessionCwd = readPromptSessionFileCwd(normalizedOriginalSessionFile);
  if (
    typeof synchronizedSessionCwd !== "string"
    || path.resolve(synchronizedSessionCwd) !== path.resolve(plan.basePath)
  ) {
    throw new ReqError(
      `ERROR: Restored session transcript expected cwd ${path.resolve(plan.basePath)} but observed ${synchronizedSessionCwd ?? "missing"}.`,
      1,
    );
  }
  const synchronizedEntryIds = new Set<string>();
  for (const line of readPromptSessionJsonLines(normalizedOriginalSessionFile).slice(1)) {
    const entryId = line.parsed.id;
    if (typeof entryId === "string" && entryId !== "") {
      synchronizedEntryIds.add(entryId);
    }
  }
  const missingSynchronizedIds = executionEntryIds.filter((entryId) => !synchronizedEntryIds.has(entryId));
  if (missingSynchronizedIds.length > 0) {
    throw new ReqError(
      `ERROR: Unable to verify execution transcript preservation for ${normalizedOriginalSessionFile}: missing entries ${missingSynchronizedIds.join(", ")}.`,
      1,
    );
  }
}

/**
 * @brief Verifies that the active session file and cwd surfaces match one expected prompt-orchestration target.
 * @details Re-reads the persisted session-file header when present plus the host `process.cwd()` and throws on the first mismatch so prompt commands abort before prompt dispatch or prompt-end handling whenever session switching leaves execution attached to the wrong cwd. A missing persisted session file is treated as a non-fatal lazy-persistence state because pi's `SessionManager` writes session files on first assistant flush rather than eagerly during `ctx.switchSession(sessionPath)`; when the file is absent, pi aligns its internal session cwd to the live `process.cwd()`, so verifying `process.cwd()` alone is authoritative in that state. Reads of `ctx.cwd`, `ctx.sessionManager.getCwd()`, and `ctx.sessionManager.getSessionFile()` are advisory only because the pi `ctx.switchSession(sessionPath)` SDK contract does not mutate the handler-scoped `ctx` object, so those probes stay bound to the pre-switch session and a divergent value alone never triggers abort; they only surface a mismatch when they disagree with both the persisted header cwd and the live `process.cwd()`. Runtime is O(p) in aggregate path length plus one session-file header read. No external state is mutated.
 * @param[in] expectedSessionFile {string} Session file that must remain active.
 * @param[in] expectedPath {string} Path that every live cwd surface must match.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context retained for advisory reads.
 * @param[in] stageLabel {string} Human-readable verification stage label.
 * @return {void} No return value.
 * @throws {ReqError} Throws when the persisted session-file header cwd diverges from the expected target or when `process.cwd()` diverges from the expected target.
 * @satisfies REQ-257, REQ-272
 */
function verifyPromptCommandSessionTarget(
  expectedSessionFile: string,
  expectedPath: string,
  ctx: PromptCommandSessionContext | undefined,
  stageLabel: string,
): void {
  const normalizedExpectedSessionFile = path.resolve(expectedSessionFile);
  const normalizedExpectedPath = path.resolve(expectedPath);
  const observedProcessCwd = process.cwd();
  const mismatchLines: string[] = [];
  const sessionFileExists = fs.existsSync(normalizedExpectedSessionFile);
  if (sessionFileExists) {
    const persistedHeaderCwd = readPromptSessionFileCwd(normalizedExpectedSessionFile);
    if (typeof persistedHeaderCwd !== "string") {
      mismatchLines.push(`active session file=header-unreadable(${normalizedExpectedSessionFile})`);
    } else if (path.resolve(persistedHeaderCwd) !== normalizedExpectedPath) {
      mismatchLines.push(`active-session cwd=${path.resolve(persistedHeaderCwd)}`);
    }
  }
  if (path.resolve(observedProcessCwd) !== normalizedExpectedPath) {
    mismatchLines.push(`process.cwd()=${path.resolve(observedProcessCwd)}`);
  }
  if (mismatchLines.length === 0) {
    return;
  }
  const advisorySessionFile = getPromptSessionFile(ctx);
  const advisorySessionCwd = getPromptSessionCwd(ctx);
  const advisoryContextCwd = getPromptContextCwd(ctx);
  if (typeof advisorySessionFile === "string" && path.resolve(advisorySessionFile) !== normalizedExpectedSessionFile) {
    mismatchLines.push(`ctx.sessionManager.getSessionFile()=${path.resolve(advisorySessionFile)}`);
  }
  if (typeof advisorySessionCwd === "string" && path.resolve(advisorySessionCwd) !== normalizedExpectedPath) {
    mismatchLines.push(`ctx.sessionManager.getCwd()=${path.resolve(advisorySessionCwd)}`);
  }
  if (typeof advisoryContextCwd === "string" && path.resolve(advisoryContextCwd) !== normalizedExpectedPath) {
    mismatchLines.push(`ctx.cwd=${path.resolve(advisoryContextCwd)}`);
  }
  if (!sessionFileExists) {
    mismatchLines.push(`active session file=pending-persistence(${normalizedExpectedSessionFile})`);
  }
  throw new ReqError(
    `ERROR: ${stageLabel} expected session ${normalizedExpectedSessionFile} at ${normalizedExpectedPath} but observed ${mismatchLines.join(", ")}.`,
    1,
  );
}

/**
 * @brief Verifies persisted prompt execution artifacts before successful closure merge.
 * @details Re-reads the persisted execution-session header, verifies the worktree path still exists, confirms the sibling worktree remains registered, and confirms the linked branch is still present before prompt-end closure attempts to restore `base-path` and merge from the original repository. Unlike prompt-start activation checks, this helper intentionally does not require the live process cwd or current session-bound context to remain on `worktree-path`, because pi CLI may already have started end-of-session session replacement or other post-run housekeeping before the extension finishes closure handling. Runtime is dominated by one session-file read, two git subprocess checks, and bounded filesystem probes. No external state is mutated.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
 * @return {void} No return value.
 * @throws {ReqError} Throws when persisted execution-session metadata or worktree artifacts no longer match the expected worktree target.
 * @satisfies REQ-208, REQ-219, REQ-258, REQ-282
 */
function verifyPromptCommandClosureArtifacts(
  plan: PromptCommandExecutionPlan,
): void {
  if (!plan.worktreePath || !plan.worktreeDir || !plan.worktreeRootPath) {
    return;
  }
  const normalizedExecutionSessionFile = path.resolve(plan.executionSessionFile);
  const normalizedWorktreePath = path.resolve(plan.worktreePath);
  const mismatchLines: string[] = [];
  if (!fs.existsSync(normalizedExecutionSessionFile)) {
    mismatchLines.push(`execution session file=missing(${normalizedExecutionSessionFile})`);
  } else {
    const persistedHeaderCwd = readPromptSessionFileCwd(normalizedExecutionSessionFile);
    if (typeof persistedHeaderCwd !== "string") {
      mismatchLines.push(`execution session file=header-unreadable(${normalizedExecutionSessionFile})`);
    } else if (path.resolve(persistedHeaderCwd) !== normalizedWorktreePath) {
      mismatchLines.push(`execution-session cwd=${path.resolve(persistedHeaderCwd)}`);
    }
  }
  if (!fs.existsSync(normalizedWorktreePath)) {
    mismatchLines.push(`worktree-path=missing(${normalizedWorktreePath})`);
  }
  if (!promptWorktreeRegistered(plan.gitPath, normalizedWorktreePath)) {
    mismatchLines.push(`worktree=unregistered(${normalizedWorktreePath})`);
  }
  if (!promptWorktreeBranchExists(plan.gitPath, plan.branchName)) {
    mismatchLines.push(`branch=missing(${plan.branchName})`);
  }
  if (mismatchLines.length === 0) {
    return;
  }
  throw new ReqError(
    `ERROR: Prompt execution finalization expected session ${normalizedExecutionSessionFile} at ${normalizedWorktreePath} but observed ${mismatchLines.join(", ")}.`,
    1,
  );
}

/**
 * @brief Switches the active prompt session to one persisted session file when required.
 * @details Calls `ctx.switchSession(sessionPath, { withSession })` so current pi runtimes can expose a fresh replacement-session context for every post-switch session-bound operation. When a runtime ignores the callback, the helper falls back to the caller-supplied context and downstream verification continues to rely on the persisted session-file header plus `process.cwd()`. If pi surfaces only the documented stale-extension-context error while invalidating the old execution-session closure, the helper treats that side effect as non-fatal and lets downstream verification confirm whether the target session actually became active. Runtime is dominated by the session switch. Side effects include active-session replacement and cwd mutation by the host runtime.
 * @param[in] sessionFile {string} Target persisted session file.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Candidate prompt-command context.
 * @return {Promise<PromptCommandSessionContext | undefined>} Replacement-session context when the runtime provides one; otherwise the caller-supplied context.
 * @throws {ReqError} Throws when the context cannot switch sessions, when the host cancels the switch, or when later verification proves the target session never became active.
 * @satisfies REQ-068, REQ-271, REQ-272
 */
async function switchPromptCommandSession(
  sessionFile: string,
  ctx?: PromptCommandSessionContext,
): Promise<PromptCommandSessionContext | undefined> {
  const normalizedSessionFile = path.resolve(sessionFile);
  const currentSessionFile = getPromptSessionFile(ctx);
  if (typeof currentSessionFile === "string" && path.resolve(currentSessionFile) === normalizedSessionFile) {
    return ctx;
  }
  if (typeof ctx?.switchSession !== "function") {
    throw new ReqError(`ERROR: Prompt orchestration requires ctx.switchSession() for ${sessionFile}.`, 1);
  }
  let replacementContext: PromptCommandActiveContext | undefined;
  let switchResult: { cancelled?: boolean } | void;
  try {
    switchResult = await ctx.switchSession(sessionFile, {
      withSession: async (activeContext) => {
        replacementContext = activeContext;
      },
    });
  } catch (error) {
    if (!isPromptCommandStaleContextError(error)) {
      throw error;
    }
  }
  if ((switchResult as { cancelled?: boolean } | undefined)?.cancelled === true) {
    throw new ReqError(`ERROR: Session switch cancelled for ${sessionFile}.`, 1);
  }
  return replacementContext ?? ctx;
}

/**
 * @brief Detects the documented stale-extension-context runtime error during prompt-command session switching.
 * @details Matches the guarded pi runtime error emitted when the old execution-session closure is invalidated during a session replacement or reload. Prompt-command session-switch helpers use this detector to distinguish a late stale-context side effect from genuine switch failures, then rely on post-switch verification to confirm whether the target session actually became active. Runtime is O(n) in message length only when an error is supplied. No external state is mutated.
 * @param[in] error {unknown} Candidate thrown value.
 * @return {boolean} `true` when the value matches the stale-extension-context runtime error.
 * @satisfies REQ-280
 */
function isPromptCommandStaleContextError(error: unknown): boolean {
  return error instanceof Error
    && /stale after session replacement or reload/i.test(error.message);
}

/**
 * @brief Attaches the last valid prompt-command context to one thrown error.
 * @details Preserves the replacement-session context discovered after `ctx.switchSession(...)` so outer callers can continue UI notifications and cleanup without reusing stale pre-switch command objects. Runtime is O(1). Side effect: mutates the error object when it is an `Error` instance.
 * @param[in] error {unknown} Thrown value.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Last valid prompt-command context.
 * @return {unknown} Original thrown value with optional attached prompt context.
 */
function attachPromptCommandErrorContext(
  error: unknown,
  ctx: PromptCommandSessionContext | undefined,
): unknown {
  if (error instanceof Error && ctx !== undefined) {
    (error as PromptCommandContextError).promptContext = ctx;
  }
  return error;
}

/**
 * @brief Reads an attached prompt-command context from one thrown error.
 * @details Returns the replacement-session context captured by prompt orchestration helpers when a switch-triggered failure occurs after the original command context became stale. Runtime is O(1). No external state is mutated.
 * @param[in] error {unknown} Thrown value.
 * @return {PromptCommandSessionContext | undefined} Attached prompt-command context when available.
 */
export function getPromptCommandErrorContext(
  error: unknown,
): PromptCommandSessionContext | undefined {
  return error instanceof Error
    ? (error as PromptCommandContextError).promptContext
    : undefined;
}

/**
 * @brief Defines the canonical doc-validation matrix for bundled prompt commands.
 * @details Maps each prompt command to the exact canonical doc files that must exist before prompt delivery. Access complexity is O(1).
 * @satisfies REQ-201, REQ-202
 */
const PROMPT_REQUIRED_DOCS: Record<PromptCommandName, readonly PromptRequiredDocSpec[]> = {
  analyze: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  change: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  check: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  cover: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  create: [],
  fix: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  flowchart: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  implement: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
  ],
  new: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  readme: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  recreate: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  refactor: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  renumber: [
    { fileName: "REQUIREMENTS.md", promptCommand: "/req-write" },
    { fileName: "WORKFLOW.md", promptCommand: "/req-workflow" },
    { fileName: "REFERENCES.md", promptCommand: "/req-references" },
  ],
  workflow: [],
  write: [],
};

/**
 * @brief Executes one git subprocess synchronously and captures UTF-8 output.
 * @details Delegates to `spawnSync`, preserves the supplied working directory, and returns the raw subprocess result used by prompt-command orchestration. Runtime is dominated by external process execution. Side effects include process spawning.
 * @param[in] command {string[]} Executable plus argument vector.
 * @param[in] cwd {string} Working directory for the subprocess.
 * @return {ReturnType<typeof spawnSync>} Captured subprocess result.
 */
function runCapture(command: string[], cwd: string): ReturnType<typeof spawnSync> {
  return spawnSync(command[0]!, command.slice(1), {
    cwd,
    encoding: "utf8",
  });
}

/**
 * @brief Lists tracked `base-path` status rows that require stash-assisted merge handling.
 * @details Executes `git status --porcelain`, retains only tracked rows whose index or worktree slot reports a change, and excludes untracked or ignored rows because the required `git stash` command does not preserve them. Runtime is dominated by one git subprocess plus O(n) parsing in status-line count. Side effects include process spawning.
 * @param[in] basePath {string} Restored project base path.
 * @return {string[]} Tracked status rows requiring stash-assisted merge handling.
 * @throws {ReqError} Throws when git status cannot be read from `basePath`.
 * @satisfies REQ-291
 */
function listPromptTrackedBasePathChanges(basePath: string): string[] {
  const statusResult = runCapture(["git", "status", "--porcelain"], basePath);
  if (statusResult.error || statusResult.status !== 0) {
    throw new ReqError("ERROR: Unable to inspect base-path changes before merge.", 1);
  }
  return statusResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .filter((line) => {
      const statusCode = line.slice(0, 2);
      if (statusCode === "??" || statusCode === "!!") {
        return false;
      }
      const indexStatus = statusCode[0] ?? " ";
      const worktreeStatus = statusCode[1] ?? " ";
      return indexStatus !== " " || worktreeStatus !== " ";
    });
}

/**
 * @brief Executes the successful-closure merge sequence from restored `base-path`.
 * @details Detects tracked staged or unstaged `base-path` changes, wraps the existing fast-forward merge in `git stash` and `git stash pop` when required, preserves the direct merge path when no tracked changes exist, emits a warning-only result after successful local-change restoration, and writes one merge-finalization debug entry when enabled. Runtime is dominated by up to four git subprocesses plus O(n) status parsing. Side effects include stash-stack mutation, branch merge attempts, and optional debug-log writes.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose branch should be merged.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {{ mergeAttempted: boolean; mergeSucceeded: boolean; errorMessage?: string; warningMessage?: string }} Merge-attempt facts plus optional warning text.
 * @satisfies REQ-208, REQ-245, REQ-291, REQ-292
 */
function finalizePromptCommandMerge(
  plan: PromptCommandExecutionPlan,
  debugOptions?: PromptCommandDebugOptions,
): {
  mergeAttempted: boolean;
  mergeSucceeded: boolean;
  errorMessage?: string;
  warningMessage?: string;
} {
  const worktreeDir = plan.worktreeDir ?? plan.branchName;
  const mergeLogInput = {
    worktree_dir: worktreeDir,
    branch_name: plan.branchName,
  };
  let trackedStatusLines: string[];
  try {
    trackedStatusLines = listPromptTrackedBasePathChanges(plan.basePath);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (debugOptions) {
      logDebugPromptEvent(
        plan.basePath,
        debugOptions.config,
        debugOptions.workflowState,
        plan.promptName,
        "merge",
        mergeLogInput,
        {
          success: false,
          merge_attempted: false,
          error: errorMessage,
        },
        true,
      );
    }
    return {
      mergeAttempted: false,
      mergeSucceeded: false,
      errorMessage,
    };
  }
  const usedStash = trackedStatusLines.length > 0;
  let stashStatus: number | null | undefined;
  if (usedStash) {
    const stashResult = runCapture(["git", "stash"], plan.basePath);
    stashStatus = stashResult.status;
    if (stashResult.error || stashResult.status !== 0) {
      const errorMessage = `ERROR: Unable to stash base-path changes before merge for worktree ${worktreeDir}.`;
      if (debugOptions) {
        logDebugPromptEvent(
          plan.basePath,
          debugOptions.config,
          debugOptions.workflowState,
          plan.promptName,
          "merge",
          {
            ...mergeLogInput,
            used_stash: true,
            tracked_change_count: trackedStatusLines.length,
          },
          {
            success: false,
            merge_attempted: false,
            error: errorMessage,
            stash_status: stashStatus,
          },
          true,
        );
      }
      return {
        mergeAttempted: false,
        mergeSucceeded: false,
        errorMessage,
      };
    }
  }
  const mergeResult = runCapture(
    ["git", "merge", "--ff-only", plan.branchName],
    plan.basePath,
  );
  const mergeSucceeded = !mergeResult.error && mergeResult.status === 0;
  const errorMessage = mergeSucceeded
    ? undefined
    : `ERROR: Fast-forward merge failed for worktree ${worktreeDir}.`;
  let stashPopStatus: number | null | undefined;
  let warningMessage: string | undefined;
  if (usedStash) {
    const stashPopResult = runCapture(["git", "stash", "pop"], plan.basePath);
    stashPopStatus = stashPopResult.status;
    if (mergeSucceeded) {
      warningMessage = "WARNING: Restored base-path changes after merge; base-path is not clean.";
    }
  }
  if (debugOptions) {
    logDebugPromptEvent(
      plan.basePath,
      debugOptions.config,
      debugOptions.workflowState,
      plan.promptName,
      "merge",
      {
        ...mergeLogInput,
        used_stash: usedStash,
        tracked_change_count: trackedStatusLines.length,
      },
      {
        success: mergeSucceeded,
        merge_attempted: true,
        error: errorMessage,
        warning: warningMessage,
        stash_status: stashStatus,
        stash_pop_status: stashPopStatus,
      },
      !mergeSucceeded,
    );
  }
  return {
    mergeAttempted: true,
    mergeSucceeded,
    errorMessage,
    warningMessage,
  };
}

/**
 * @brief Stores or clears the prompt-command post-create test hook.
 * @details Enables deterministic simulation of post-create worktree verification failures without altering production control flow. Runtime is O(1). Side effect: mutates module-local test state.
 * @param[in] hook {PromptCommandPostCreateHook | undefined} Optional replacement hook.
 * @return {void} No return value.
 */
export function setPromptCommandPostCreateHookForTests(
  hook: PromptCommandPostCreateHook | undefined,
): void {
  promptCommandPostCreateHook = hook;
}

/**
 * @brief Resolves the configured docs root for one project base.
 * @details Joins the project base with the normalized `docs-dir` value while stripping trailing separators from the persisted config field. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Absolute project root.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Absolute canonical docs root path.
 */
function resolvePromptDocsRoot(projectBase: string, config: UseReqConfig): string {
  const docsDir = config["docs-dir"].replace(/[/\\]+$/, "");
  return path.join(projectBase, docsDir);
}

/**
 * @brief Resolves the effective worktree project base relative to the git root.
 * @details Reuses the original project-base location relative to the git root so nested repository subdirectories remain aligned inside the sibling worktree. Runtime is O(p) in path length. No external state is mutated.
 * @param[in] projectBase {string} Original absolute project base path.
 * @param[in] gitPath {string} Absolute runtime git root path.
 * @param[in] worktreeName {string} Created worktree name.
 * @return {{ worktreePath: string; worktreeBasePath: string }} Derived worktree paths.
 */
function resolveWorktreePaths(
  projectBase: string,
  gitPath: string,
  worktreeDir: string,
): {
  parentPath: string;
  baseDir: string;
  worktreeDir: string;
  worktreeRootPath: string;
  worktreePath: string;
} {
  const normalizedGitPath = path.resolve(gitPath);
  const normalizedProjectBase = path.resolve(projectBase);
  const parentPath = path.resolve(normalizedGitPath, "..");
  const baseDir = normalizeRelativeDirContract(
    path.relative(normalizedGitPath, normalizedProjectBase),
  );
  const worktreeRootPath = path.join(parentPath, worktreeDir);
  return {
    parentPath,
    baseDir,
    worktreeDir,
    worktreeRootPath,
    worktreePath: baseDir === ""
      ? worktreeRootPath
      : path.join(worktreeRootPath, baseDir),
  };
}

/**
 * @brief Rewrites a branch name into a filesystem-safe token for prompt worktrees.
 * @details Replaces characters invalid for worktree directory and branch-name generation with `-`. Runtime is O(n). No external state is mutated.
 * @param[in] branch {string} Raw branch name.
 * @return {string} Sanitized token.
 */
function sanitizePromptWorktreeBranchName(branch: string): string {
  return branch.replace(/[<>:"/\\|?*\x00-\x1f\s~^{}\[\]]/g, "-");
}

/**
 * @brief Validates a prompt-command-generated worktree or branch name.
 * @details Rejects empty names, dot-path markers, whitespace, and filesystem-invalid characters. Runtime is O(n). No external state is mutated.
 * @param[in] wtName {string} Candidate worktree name.
 * @return {boolean} `true` when the name is acceptable for worktree creation.
 */
function validatePromptWorktreeName(wtName: string): boolean {
  if (!wtName || wtName === "." || wtName === "..") {
    return false;
  }
  return !/[<>:"/\\|?*\x00-\x1f\s]/.test(wtName);
}

/**
 * @brief Throws the canonical prompt-command git-preflight failure.
 * @details Normalizes all repository-validation failures to the contractually stable prompt-command error string consumed by tests and downstream prompt workflows. Runtime is O(1). No external state is mutated.
 * @return {never} Always throws.
 * @throws {ReqError} Always throws with exit code `1`.
 */
function throwPromptGitStatusError(): never {
  throw new ReqError("ERROR: Git status unclear!", 1);
}

/**
 * @brief Runs slash-command-owned git validation and returns the runtime git root.
 * @details Validates work-tree membership, porcelain cleanliness, and symbolic or detached `HEAD` presence for bundled prompt commands and `req-references` without invoking extension custom-tool executors. Runtime is dominated by git subprocess execution. Side effects include process spawning.
 * @param[in] projectBase {string} Absolute current project base.
 * @param[in] config {UseReqConfig | undefined} Optional effective project configuration used to ignore extension-owned debug-log artifacts.
 * @return {string} Absolute runtime git root.
 * @throws {ReqError} Throws the canonical prompt-command git-preflight error on any validation failure.
 * @satisfies REQ-200, REQ-220
 */
export function validatePromptGitState(projectBase: string, config?: UseReqConfig): string {
  const gitPath = resolveRuntimeGitPath(projectBase);
  if (!gitPath) {
    throwPromptGitStatusError();
  }
  const gitRoot = path.resolve(gitPath);
  const insideWorkTree = runCapture(["git", "rev-parse", "--is-inside-work-tree"], gitRoot);
  if (
    insideWorkTree.error
    || insideWorkTree.status !== 0
    || insideWorkTree.stdout.trim() !== "true"
  ) {
    throwPromptGitStatusError();
  }
  const porcelainStatus = runCapture(["git", "status", "--porcelain"], gitRoot);
  const ignoredStatusPaths = new Set<string>();
  if (config) {
    const configuredLogPath = path.isAbsolute(config.DEBUG_LOG_FILE)
      ? path.normalize(config.DEBUG_LOG_FILE)
      : path.resolve(projectBase, config.DEBUG_LOG_FILE);
    const relativeLogPath = path.relative(gitRoot, configuredLogPath);
    if (relativeLogPath !== "" && !relativeLogPath.startsWith("..") && !path.isAbsolute(relativeLogPath)) {
      ignoredStatusPaths.add(relativeLogPath.split(path.sep).join("/"));
    }
  }
  const residualStatusLines = porcelainStatus.stdout
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "")
    .filter((line) => {
      const statusPath = line.slice(3).split(" -> ").at(-1)?.split(path.sep).join("/") ?? "";
      return !ignoredStatusPaths.has(statusPath);
    });
  if (porcelainStatus.error || porcelainStatus.status !== 0 || residualStatusLines.length > 0) {
    throwPromptGitStatusError();
  }
  const symbolicHead = runCapture(["git", "symbolic-ref", "-q", "HEAD"], gitRoot);
  if (symbolicHead.error || symbolicHead.status !== 0 || symbolicHead.stdout.trim() === "") {
    const detachedHead = runCapture(["git", "rev-parse", "--verify", "HEAD"], gitRoot);
    if (detachedHead.error || detachedHead.status !== 0 || detachedHead.stdout.trim() === "") {
      throwPromptGitStatusError();
    }
  }
  return gitRoot;
}

/**
 * @brief Resolves the current local branch name used by prompt-command orchestration.
 * @details Reads `git branch --show-current`, falls back to `unknown` when git cannot provide a branch name, and preserves the raw branch token for later worktree-name generation and state tracking. Runtime is dominated by one git subprocess. Side effects include process spawning.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @return {string} Current branch name or `unknown` when unavailable.
 */
function resolveCurrentPromptBranchName(gitRoot: string): string {
  const branchResult = runCapture(["git", "branch", "--show-current"], gitRoot);
  return branchResult.error || branchResult.status !== 0
    ? "unknown"
    : (branchResult.stdout.trim() || "unknown");
}

/**
 * @brief Defines the process-scoped prompt-worktree execution-id key.
 * @details The property stores the last emitted `YYYYMMDDHHMMSS` execution token so successive prompt commands in the same host process never reuse a sibling worktree name when they start within the same wall-clock second. Access complexity is O(1).
 */
const PI_USEREQ_PROMPT_WORKTREE_EXECUTION_ID_KEY = "__piUsereqPromptWorktreeExecutionId";

/**
 * @brief Formats one prompt-worktree execution identifier.
 * @details Serializes the supplied timestamp as `YYYYMMDDHHMMSS` with zero-padded calendar and clock fields so generated worktree names remain stable, lexicographically sortable, and requirement-compatible. Runtime is O(1). No external state is mutated.
 * @param[in] timestamp {Date} Timestamp to encode.
 * @return {string} Formatted execution identifier.
 */
function formatPromptWorktreeExecutionId(timestamp: Date): string {
  return `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}${String(timestamp.getHours()).padStart(2, "0")}${String(timestamp.getMinutes()).padStart(2, "0")}${String(timestamp.getSeconds()).padStart(2, "0")}`;
}

/**
 * @brief Resolves the next unique prompt-worktree execution identifier.
 * @details Formats the current wall-clock second as `YYYYMMDDHHMMSS`, then monotonically advances by one-second steps until the identifier is strictly greater than the last value emitted in the current host process. This preserves the documented timestamp-only name shape while preventing immediate same-process worktree-name reuse after fast back-to-back prompt starts. Runtime is O(1) in the common case and O(k) in repeated same-second collisions. Side effect: mutates process-scoped execution-id persistence.
 * @return {string} Unique execution identifier for worktree naming.
 */
function getNextPromptWorktreeExecutionId(): string {
  const globalState = globalThis as typeof globalThis & {
    __piUsereqPromptWorktreeExecutionId?: string;
  };
  let candidateTimestamp = new Date();
  let candidateId = formatPromptWorktreeExecutionId(candidateTimestamp);
  const lastExecutionId = globalState[PI_USEREQ_PROMPT_WORKTREE_EXECUTION_ID_KEY];
  while (typeof lastExecutionId === "string" && candidateId <= lastExecutionId) {
    candidateTimestamp = new Date(candidateTimestamp.getTime() + 1000);
    candidateId = formatPromptWorktreeExecutionId(candidateTimestamp);
  }
  globalState[PI_USEREQ_PROMPT_WORKTREE_EXECUTION_ID_KEY] = candidateId;
  return candidateId;
}

/**
 * @brief Builds the prompt-command worktree name without invoking agent-tool executors.
 * @details Combines the normalized persisted worktree prefix, repository basename, sanitized current branch, and timestamp execution identifier into the dedicated prompt-command worktree name. Runtime is O(1) plus git execution cost. Side effects include process spawning.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @return {string} Generated worktree and branch name.
 * @throws {ReqError} Throws when the generated name is invalid.
 * @satisfies REQ-206, REQ-220
 */
function buildPromptWorktreeName(gitRoot: string, config: UseReqConfig): string {
  const projectName = path.basename(gitRoot);
  const branchName = resolveCurrentPromptBranchName(gitRoot);
  const sanitizedBranchName = sanitizePromptWorktreeBranchName(branchName);
  const worktreePrefix = normalizeGitWorktreePrefix(config.GIT_WORKTREE_PREFIX);
  const executionId = getNextPromptWorktreeExecutionId();
  const worktreeName = `${worktreePrefix}${projectName}-${sanitizedBranchName}-${executionId}`;
  if (!validatePromptWorktreeName(worktreeName)) {
    throw new ReqError(`ERROR: Invalid worktree/branch name: ${worktreeName}.`, 1);
  }
  return worktreeName;
}

/**
 * @brief Tests whether the exact prompt-command branch is present in the local branch list.
 * @details Queries `git branch --list --format=%(refname:short)` and returns a boolean without mutating repository state. Runtime is dominated by one git subprocess plus O(n) parsing in listed branch count. Side effects include process spawning.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] branchName {string} Candidate local branch name.
 * @return {boolean} `true` when the exact local branch is listed.
 */
function promptWorktreeBranchExists(gitRoot: string, branchName: string): boolean {
  const branchResult = runCapture(["git", "branch", "--list", "--format=%(refname:short)", branchName], gitRoot);
  if (branchResult.error || branchResult.status !== 0) {
    return false;
  }
  return branchResult.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .includes(branchName);
}

/**
 * @brief Tests whether the exact prompt-command worktree is registered.
 * @details Scans `git worktree list --porcelain` for the resolved target path so cleanup and verification can distinguish registered worktrees from unrelated sibling directories. Runtime is dominated by one git subprocess plus O(n) parsing in listed worktree count. Side effects include process spawning.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] worktreePath {string} Absolute sibling worktree path.
 * @return {boolean} `true` when the exact path is registered as a git worktree.
 */
function promptWorktreeRegistered(gitRoot: string, worktreePath: string): boolean {
  const listResult = runCapture(["git", "worktree", "list", "--porcelain"], gitRoot);
  if (listResult.error || listResult.status !== 0) {
    return false;
  }
  const targetPath = path.resolve(worktreePath);
  return listResult.stdout
    .split(/\r?\n/)
    .filter((line) => line.startsWith("worktree "))
    .map((line) => path.resolve(line.slice("worktree ".length)))
    .includes(targetPath);
}

/**
 * @brief Removes partially created prompt-command worktree resources.
 * @details Force-removes the registered sibling worktree when present, deletes the matching local branch, and falls back to filesystem removal for leftover directories so failed prompt preflight leaves no reusable worktree residue. Runtime is dominated by git subprocess execution. Side effects include branch deletion and directory removal.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] worktreePath {string} Absolute sibling worktree path.
 * @param[in] worktreeName {string} Exact worktree and branch name.
 * @return {void} No return value.
 */
function cleanupPromptWorktreeCreation(
  gitRoot: string,
  worktreePath: string,
  worktreeName: string,
): void {
  if (promptWorktreeRegistered(gitRoot, worktreePath) || fs.existsSync(worktreePath)) {
    runCapture(["git", "worktree", "remove", "--force", worktreePath], gitRoot);
  }
  if (fs.existsSync(worktreePath)) {
    fs.rmSync(worktreePath, { recursive: true, force: true });
  }
  if (promptWorktreeBranchExists(gitRoot, worktreeName)) {
    runCapture(["git", "branch", "-D", worktreeName], gitRoot);
  }
}

/**
 * @brief Creates and verifies the prompt-command worktree and branch.
 * @details Creates the sibling worktree, mirrors project config when present, runs the optional post-create test hook, verifies git worktree registration, verifies git branch listing, verifies filesystem paths before prompt dispatch, and appends selected debug entries for worktree creation. Failed verification triggers immediate rollback. Runtime is dominated by git subprocess execution and filesystem metadata checks. Side effects include worktree creation, branch creation, directory creation, file copying, optional debug-log writes, and rollback on failure.
 * @param[in] projectBase {string} Absolute original project base.
 * @param[in] gitRoot {string} Absolute runtime git root.
 * @param[in] worktreeName {string} Exact worktree and branch name.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {{ worktreePath: string; worktreeBasePath: string }} Verified worktree paths.
 * @throws {ReqError} Throws when worktree creation, verification, or rollback finalization fails.
 * @satisfies REQ-206, REQ-219, REQ-220, REQ-245
 */
function createPromptWorktree(
  projectBase: string,
  gitRoot: string,
  worktreeDir: string,
  promptName: PromptCommandName,
  debugOptions?: PromptCommandDebugOptions,
): {
  parentPath: string;
  baseDir: string;
  worktreeDir: string;
  worktreeRootPath: string;
  worktreePath: string;
} {
  const logWorktreeCreate = (
    input: unknown,
    result: unknown,
    isError = false,
  ) => {
    if (!debugOptions) {
      return;
    }
    logDebugPromptEvent(
      projectBase,
      debugOptions.config,
      debugOptions.workflowState,
      promptName,
      "worktree_create",
      input,
      result,
      isError,
    );
  };
  logWorktreeCreate(
    { worktree_dir: worktreeDir },
    { success: false, stage: "start" },
  );
  if (!validatePromptWorktreeName(worktreeDir)) {
    logWorktreeCreate(
      { worktree_dir: worktreeDir },
      { success: false, error: `ERROR: Invalid worktree/branch name: ${worktreeDir}.` },
      true,
    );
    throw new ReqError(`ERROR: Invalid worktree/branch name: ${worktreeDir}.`, 1);
  }
  const resolvedWorktreePaths = resolveWorktreePaths(projectBase, gitRoot, worktreeDir);
  const addResult = runCapture(
    ["git", "worktree", "add", resolvedWorktreePaths.worktreeRootPath, "-b", worktreeDir],
    gitRoot,
  );
  if (addResult.error || addResult.status !== 0) {
    logWorktreeCreate(
      {
        worktree_dir: worktreeDir,
        worktree_root_path: resolvedWorktreePaths.worktreeRootPath,
      },
      { success: false, error: addResult.stderr.trim() },
      true,
    );
    throw new ReqError(`Error: git worktree add failed: ${addResult.stderr.trim()}`, 1);
  }
  try {
    promptCommandPostCreateHook?.({
      gitPath: gitRoot,
      worktreeDir,
      worktreeRootPath: resolvedWorktreePaths.worktreeRootPath,
      worktreePath: resolvedWorktreePaths.worktreePath,
    });
    const worktreeRegistered = promptWorktreeRegistered(
      gitRoot,
      resolvedWorktreePaths.worktreeRootPath,
    );
    const worktreeRootReady = fs.existsSync(resolvedWorktreePaths.worktreeRootPath)
      && fs.statSync(resolvedWorktreePaths.worktreeRootPath).isDirectory();
    const worktreePathReady = fs.existsSync(resolvedWorktreePaths.worktreePath)
      && fs.statSync(resolvedWorktreePaths.worktreePath).isDirectory();
    const branchReady = promptWorktreeBranchExists(gitRoot, worktreeDir);
    if (!worktreeRegistered || !worktreeRootReady || !worktreePathReady || !branchReady) {
      throw new ReqError(`ERROR: Worktree verification failed for ${worktreeDir}.`, 1);
    }
    logWorktreeCreate(
      {
        worktree_dir: worktreeDir,
        worktree_root_path: resolvedWorktreePaths.worktreeRootPath,
      },
      {
        success: true,
        worktree_dir: worktreeDir,
        branch_name: worktreeDir,
        parent_path: resolvedWorktreePaths.parentPath,
        base_dir: resolvedWorktreePaths.baseDir,
        worktree_root_path: resolvedWorktreePaths.worktreeRootPath,
        worktree_path: resolvedWorktreePaths.worktreePath,
      },
    );
    return resolvedWorktreePaths;
  } catch (error) {
    cleanupPromptWorktreeCreation(
      gitRoot,
      resolvedWorktreePaths.worktreeRootPath,
      worktreeDir,
    );
    const errorMessage = error instanceof ReqError
      ? error.message
      : `ERROR: Unable to finalize worktree creation for ${worktreeDir}.`;
    logWorktreeCreate(
      {
        worktree_dir: worktreeDir,
        worktree_root_path: resolvedWorktreePaths.worktreeRootPath,
      },
      { success: false, error: errorMessage },
      true,
    );
    if (error instanceof ReqError) {
      throw error;
    }
    throw new ReqError(
      `ERROR: Unable to finalize worktree creation for ${worktreeDir}.`,
      1,
    );
  }
}

/**
 * @brief Deletes prompt-command worktree resources without invoking custom-tool executors.
 * @details Force-removes the sibling worktree and matching branch, verifies both are absent so prompt finalization remains independent from agent-tool implementations, and appends selected debug entries for worktree deletion. Runtime is dominated by git subprocess execution plus filesystem probes. Side effects include worktree deletion, branch deletion, and optional debug-log writes.
 * @param[in] projectBase {string} Absolute original project base.
 * @param[in] worktreeName {string} Exact worktree and branch name.
 * @param[in] promptName {PromptCommandName | undefined} Optional bundled prompt identifier for debug logging.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {void} No return value.
 * @throws {ReqError} Throws when cleanup cannot remove the worktree and branch fully.
 * @satisfies REQ-208, REQ-220, REQ-245
 */
function deletePromptWorktree(
  basePath: string,
  worktreeDir: string,
  worktreeRootPath: string,
  promptName?: PromptCommandName,
  debugOptions?: PromptCommandDebugOptions,
): void {
  const logWorktreeDelete = (
    input: unknown,
    result: unknown,
    isError = false,
  ) => {
    if (!debugOptions || promptName === undefined) {
      return;
    }
    logDebugPromptEvent(
      basePath,
      debugOptions.config,
      debugOptions.workflowState,
      promptName,
      "worktree_delete",
      input,
      result,
      isError,
    );
  };
  logWorktreeDelete(
    { worktree_dir: worktreeDir, worktree_root_path: worktreeRootPath },
    { success: false, stage: "start" },
  );
  const gitPath = resolveRuntimeGitPath(basePath);
  if (!gitPath) {
    logWorktreeDelete(
      { worktree_dir: worktreeDir, worktree_root_path: worktreeRootPath },
      { success: false, error: `ERROR: Unable to remove worktree or branch ${worktreeDir}.` },
      true,
    );
    throw new ReqError(`ERROR: Unable to remove worktree or branch ${worktreeDir}.`, 1);
  }
  const gitRoot = path.resolve(gitPath);
  cleanupPromptWorktreeCreation(gitRoot, worktreeRootPath, worktreeDir);
  const worktreeStillPresent = promptWorktreeRegistered(gitRoot, worktreeRootPath)
    || fs.existsSync(worktreeRootPath);
  const branchStillPresent = promptWorktreeBranchExists(gitRoot, worktreeDir);
  if (worktreeStillPresent || branchStillPresent) {
    logWorktreeDelete(
      { worktree_dir: worktreeDir, worktree_root_path: worktreeRootPath },
      { success: false, error: `ERROR: Unable to remove worktree or branch ${worktreeDir}.` },
      true,
    );
    throw new ReqError(`ERROR: Unable to remove worktree or branch ${worktreeDir}.`, 1);
  }
  logWorktreeDelete(
    { worktree_dir: worktreeDir, worktree_root_path: worktreeRootPath },
    {
      success: true,
      worktree_dir: worktreeDir,
      worktree_root_path: worktreeRootPath,
    },
  );
}

/**
 * @brief Returns the canonical required-document probes for one prompt command.
 * @details Performs a constant-time lookup in the prompt-doc matrix used by command preflight validation. No filesystem access occurs.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @return {readonly PromptRequiredDocSpec[]} Required-doc definitions in probe order.
 * @satisfies REQ-201, REQ-202
 */
export function getPromptRequiredDocs(promptName: PromptCommandName): readonly PromptRequiredDocSpec[] {
  return PROMPT_REQUIRED_DOCS[promptName];
}

/**
 * @brief Runs prompt-specific required-document validation.
 * @details Resolves the configured docs root, verifies the prompt-mapped canonical docs exist as files, throws a deterministic remediation error for the first missing document, and appends selected debug entries for required-doc checks. Runtime is O(d) in required-doc count plus filesystem metadata cost. Side effects are limited to filesystem reads and optional debug-log writes.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @param[in] projectBase {string} Absolute project root.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {void} No return value.
 * @throws {ReqError} Throws when a required canonical doc is missing.
 * @satisfies REQ-201, REQ-202, REQ-203, REQ-245
 */
export function validatePromptRequiredDocs(
  promptName: PromptCommandName,
  projectBase: string,
  config: UseReqConfig,
  debugOptions?: PromptCommandDebugOptions,
): void {
  const docsRoot = resolvePromptDocsRoot(projectBase, config);
  const requirements = getPromptRequiredDocs(promptName);
  for (const requirement of requirements) {
    const canonicalPath = path.join(docsRoot, requirement.fileName);
    if (!fs.existsSync(canonicalPath) || !fs.statSync(canonicalPath).isFile()) {
      logDebugPromptEvent(
        projectBase,
        debugOptions?.config ?? config,
        debugOptions?.workflowState ?? "unknown",
        promptName,
        "required_docs_check",
        {
          required_docs: requirements.map((entry) => ({
            file_name: entry.fileName,
            prompt_command: entry.promptCommand,
          })),
        },
        {
          success: false,
          missing_file: requirement.fileName,
          missing_path: canonicalPath,
          prompt_command: requirement.promptCommand,
        },
        true,
      );
      throw new ReqError(
        `ERROR: File ${canonicalPath} does not exist, generate it with the ${requirement.promptCommand} prompt!`,
        1,
      );
    }
  }
  logDebugPromptEvent(
    projectBase,
    debugOptions?.config ?? config,
    debugOptions?.workflowState ?? "unknown",
    promptName,
    "required_docs_check",
    {
      required_docs: requirements.map((entry) => ({
        file_name: entry.fileName,
        prompt_command: entry.promptCommand,
      })),
    },
    { success: true },
  );
}

/**
 * @brief Prepares prompt-command execution for one bundled prompt.
 * @details Runs slash-command-owned git validation, enforces the prompt-specific required-doc matrix, resolves persisted origin and execution session files, applies the effective worktree policy, generates and verifies a dedicated worktree when enabled, and returns the execution plan consumed by prompt rendering plus lifecycle hooks. Worktree-backed execution reuses the active session directory for the forked session file. Runtime is dominated by git subprocesses, worktree creation, and optional session-file cloning. Side effects include worktree creation, session-file creation, filesystem reads, and optional prompt debug-log writes.
 * @param[in] promptName {PromptCommandName} Bundled prompt identifier.
 * @param[in] promptArgs {string} Raw prompt argument string.
 * @param[in] projectBase {string} Absolute current project base.
 * @param[in] config {UseReqConfig} Effective project configuration.
 * @param[in] currentSessionFile {string | undefined} Active session file used as the switch origin when available.
 * @param[in] currentSessionDir {string | undefined} Active session directory reused when the execution session is forked.
 * @param[in] currentSessionBranch {PromptCommandSessionEntry[] | undefined} Active in-memory session branch copied when the origin session file is not flushed yet.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {PromptCommandExecutionPlan} Prepared execution plan.
 * @throws {ReqError} Throws when repository validation, required-doc validation, worktree creation, or session preparation fails.
 * @satisfies REQ-200, REQ-203, REQ-206, REQ-207, REQ-215, REQ-219, REQ-220, REQ-245, REQ-256, REQ-271
 */
export function preparePromptCommandExecution(
  promptName: PromptCommandName,
  promptArgs: string,
  projectBase: string,
  config: UseReqConfig,
  currentSessionFile: string | undefined,
  currentSessionDir: string | undefined,
  currentSessionBranch: PromptCommandSessionEntry[] | undefined,
  debugOptions?: PromptCommandDebugOptions,
): PromptCommandExecutionPlan {
  const gitPath = validatePromptGitState(projectBase, config);
  const reuseCurrentSessionFile = isUsablePromptSessionFile(currentSessionFile, projectBase);
  const originalSessionFile = resolvePromptSessionFile(
    reuseCurrentSessionFile ? currentSessionFile : undefined,
    projectBase,
  );
  setRuntimeGitPath(gitPath);
  validatePromptRequiredDocs(promptName, projectBase, config, debugOptions);
  const staticWorktreePaths = resolveWorktreePaths(projectBase, gitPath, "");
  const gitWorktreeEnabled = resolveEffectiveGitWorktreeEnabled(
    config.AUTO_GIT_COMMIT,
    config.GIT_WORKTREE_ENABLED,
  );
  if (gitWorktreeEnabled === "disable") {
    setRuntimeWorktreePathState({});
    return {
      promptName,
      promptArgs,
      gitPath,
      branchName: resolveCurrentPromptBranchName(gitPath),
      basePath: projectBase,
      contextPath: projectBase,
      parentPath: staticWorktreePaths.parentPath,
      baseDir: staticWorktreePaths.baseDir,
      originalSessionFile,
      executionSessionFile: originalSessionFile,
    };
  }
  const worktreeDir = buildPromptWorktreeName(gitPath, config);
  const worktreePaths = createPromptWorktree(
    projectBase,
    gitPath,
    worktreeDir,
    promptName,
    debugOptions,
  );
  const effectiveSessionDir = reuseCurrentSessionFile
    && typeof currentSessionDir === "string"
    && currentSessionDir !== ""
      ? currentSessionDir
      : path.dirname(originalSessionFile);
  const executionSessionFile = createPromptExecutionSessionFile(
    originalSessionFile,
    worktreePaths.worktreePath,
    effectiveSessionDir,
    reuseCurrentSessionFile ? currentSessionBranch : undefined,
  );
  setRuntimeWorktreePathState({
    worktreeDir: worktreePaths.worktreeDir,
    worktreePath: worktreePaths.worktreePath,
  });
  return {
    promptName,
    promptArgs,
    gitPath,
    branchName: worktreeDir,
    basePath: projectBase,
    contextPath: worktreePaths.worktreePath,
    parentPath: worktreePaths.parentPath,
    baseDir: worktreePaths.baseDir,
    originalSessionFile,
    executionSessionFile,
    worktreeDir: worktreePaths.worktreeDir,
    worktreePath: worktreePaths.worktreePath,
    worktreeRootPath: worktreePaths.worktreeRootPath,
  };
}

/**
 * @brief Activates the prepared prompt execution path before prompt dispatch or agent start.
 * @details Switches the active session to the execution-session file when worktree routing changed the cwd, re-aligns `process.cwd()` to the execution path, verifies active-session cwd plus cwd mirrors after the switch completes, and stores the verified command-capable replacement-session context for later closure handling. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and process-scoped command-context persistence.
 * @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
 * @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required session switch.
 * @throws {ReqError} Throws when the session switch or cwd verification fails.
 * @satisfies REQ-206, REQ-207, REQ-257, REQ-272, REQ-276
 */
export async function activatePromptCommandExecution(
  plan: PromptCommandExecutionPlan,
  ctx?: PromptCommandSessionContext,
): Promise<PromptCommandSessionContext | undefined> {
  const nextContextPath = plan.worktreePath ?? plan.basePath;
  let activeContext = ctx;
  if (plan.worktreePath) {
    const switchContext = resolvePromptCommandSwitchContext(plan, ctx);
    activeContext = switchContext.context ?? activeContext;
    activeContext = await switchPromptCommandSession(plan.executionSessionFile, switchContext.context);
    try {
      syncPromptCommandProcessCwd(nextContextPath, "Prompt execution activation");
      verifyPromptCommandSessionTarget(
        plan.executionSessionFile,
        nextContextPath,
        activeContext,
        "Prompt execution activation",
      );
    } catch (error) {
      throw attachPromptCommandErrorContext(error, activeContext);
    }
    if (activeContext !== undefined) {
      writePersistedPromptCommandSessionContext(plan.executionSessionFile, activeContext);
    }
  } else {
    clearPersistedPromptCommandSessionContext();
  }
  setRuntimeContextPath(nextContextPath);
  setRuntimeWorktreePathState({
    worktreeDir: plan.worktreeDir,
    worktreePath: plan.worktreePath,
  });
  return activeContext;
}

/**
 * @brief Restores the original project base path before merge or session-closure return.
 * @details Switches the active session back to the original session file when worktree routing changed the cwd, re-aligns `process.cwd()` to `base-path`, verifies the restored session target, reuses the persisted replacement-session context when lifecycle handlers receive non-command contexts, tolerates the documented stale-extension-context error when the old replacement-session closure becomes invalid immediately after a successful restore, emits optional workflow restoration debug entries, and clears active worktree path facts before session closure continues. Runtime is dominated by the optional session switch and one optional cwd mutation. Side effects include active-session replacement, host-process cwd mutation, runtime-path state mutation, and optional workflow-debug writes.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan whose original base should be restored.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {Promise<PromptCommandSessionContext | undefined>} Active prompt-command context after any required restoration switch.
 * @throws {ReqError} Throws when the session switch or cwd verification fails.
 * @satisfies REQ-208, REQ-209, REQ-245, REQ-257, REQ-272, REQ-276
 */
export async function restorePromptCommandExecution(
  plan: PromptCommandExecutionPlan,
  ctx?: PromptCommandSessionContext,
  debugOptions?: PromptCommandDebugOptions,
): Promise<PromptCommandSessionContext | undefined> {
  let activeContext = ctx;
  if (plan.worktreePath) {
    const switchContext = resolvePromptCommandSwitchContext(plan, ctx);
    activeContext = switchContext.context ?? activeContext;
    const workflowInput = {
      execution_session_file: plan.executionSessionFile,
      original_session_file: plan.originalSessionFile,
      base_path: plan.basePath,
      context_source: switchContext.source,
    };
    try {
      activeContext = await switchPromptCommandSession(plan.originalSessionFile, switchContext.context);
      syncPromptCommandProcessCwd(plan.basePath, "Prompt execution restoration");
      verifyPromptCommandSessionTarget(
        plan.originalSessionFile,
        plan.basePath,
        activeContext,
        "Prompt execution restoration",
      );
      if (debugOptions) {
        logDebugPromptWorkflowEvent(
          plan.basePath,
          debugOptions.config,
          debugOptions.workflowState,
          plan.promptName,
          "workflow_restore",
          workflowInput,
          { success: true, base_path: plan.basePath, context_source: switchContext.source },
        );
      }
    } catch (error) {
      if (debugOptions) {
        logDebugPromptWorkflowEvent(
          plan.basePath,
          debugOptions.config,
          debugOptions.workflowState,
          plan.promptName,
          "workflow_restore",
          workflowInput,
          { success: false, error: error instanceof Error ? error.message : String(error), context_source: switchContext.source },
          true,
        );
      }
      throw attachPromptCommandErrorContext(error, activeContext);
    }
  }
  if (activeContext !== undefined) {
    try {
      Reflect.set(activeContext, "cwd", plan.basePath);
    } catch (error) {
      if (!isPromptCommandStaleContextError(error)) {
        throw attachPromptCommandErrorContext(error, activeContext);
      }
    }
  }
  setRuntimeContextPath(plan.basePath);
  setRuntimeWorktreePathState({});
  clearPersistedPromptCommandSessionContext();
  return activeContext;
}

/**
 * @brief Aborts one prepared prompt-command execution before pi CLI takes ownership.
 * @details Restores the original session-backed cwd and deletes any created worktree plus branch when command-side preflight, prompt rendering, or prompt handoff fails before agent completion. Restoration failures are returned as structured cleanup errors so the original preflight failure is not masked. Runtime is dominated by the optional session switch plus git subprocess execution. Side effects include active-session replacement, optional worktree deletion, and optional debug-log writes.
 * @param[in] plan {PromptCommandExecutionPlan} Prepared prompt execution plan.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {Promise<{ cleanupSucceeded: boolean; errorMessage?: string; activeContext?: PromptCommandSessionContext }>} Abort-cleanup facts plus the last valid active prompt-command context.
 * @satisfies REQ-226, REQ-220, REQ-245
 */
export async function abortPromptCommandExecution(
  plan: PromptCommandExecutionPlan,
  ctx?: PromptCommandSessionContext,
  debugOptions?: PromptCommandDebugOptions,
): Promise<{
  cleanupSucceeded: boolean;
  errorMessage?: string;
  activeContext?: PromptCommandSessionContext;
}> {
  let activeContext = ctx;
  try {
    activeContext = await restorePromptCommandExecution(plan, ctx, debugOptions);
  } catch (error) {
    return {
      cleanupSucceeded: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      activeContext: (getPromptCommandErrorContext(error) ?? activeContext) as PromptCommandSessionContext | undefined,
    };
  }
  if (!plan.worktreeDir || !plan.worktreeRootPath) {
    setRuntimeWorktreePathState({});
    return {
      cleanupSucceeded: true,
      activeContext,
    };
  }
  try {
    deletePromptWorktree(
      plan.basePath,
      plan.worktreeDir,
      plan.worktreeRootPath,
      plan.promptName,
      debugOptions,
    );
    setRuntimeWorktreePathState({});
    return {
      cleanupSucceeded: true,
      activeContext,
    };
  } catch {
    return {
      cleanupSucceeded: false,
      errorMessage: `ERROR: Unable to remove worktree or branch ${plan.worktreeDir}.`,
      activeContext,
    };
  }
}

/**
 * @brief Finalizes one matched successful worktree-backed prompt execution.
 * @details Re-verifies persisted execution-session metadata plus worktree artifacts, copies any execution-session transcript records missing from the original session file, restores the original session-backed `base-path`, executes the stash-assisted fast-forward merge sequence from `base-path`, deletes the worktree after merge success, and preserves the restored base session across closure failures. Closure intentionally treats `base-path` restoration as authoritative even when pi CLI has already started end-of-session session replacement or other housekeeping that moved the live runtime away from `worktree-path`. Runtime is dominated by session switching plus git subprocess execution. Side effects include session-file appends, active-session replacement, branch merges, stash-stack mutation, worktree deletion, and optional debug-log writes.
 * @param[in] plan {PromptCommandExecutionPlan} Prompt execution plan.
 * @param[in] ctx {PromptCommandSessionContext | undefined} Optional prompt-command context.
 * @param[in] debugOptions {PromptCommandDebugOptions | undefined} Optional prompt debug logging context.
 * @return {Promise<{ mergeAttempted: boolean; mergeSucceeded: boolean; cleanupSucceeded: boolean; errorMessage?: string; warningMessage?: string; activeContext?: PromptCommandSessionContext }>} Finalization facts plus the last valid active prompt-command context.
 * @satisfies REQ-208, REQ-209, REQ-220, REQ-245, REQ-282, REQ-291, REQ-292
 */
export async function finalizePromptCommandExecution(
  plan: PromptCommandExecutionPlan,
  ctx?: PromptCommandSessionContext,
  debugOptions?: PromptCommandDebugOptions,
): Promise<{
  mergeAttempted: boolean;
  mergeSucceeded: boolean;
  cleanupSucceeded: boolean;
  errorMessage?: string;
  warningMessage?: string;
  activeContext?: PromptCommandSessionContext;
}> {
  let activeContext = ctx;
  let verificationErrorMessage: string | undefined;
  try {
    verifyPromptCommandClosureArtifacts(plan);
    if (plan.worktreePath && plan.worktreeDir && plan.worktreeRootPath) {
      preservePromptCommandExecutionTranscript(plan);
    }
  } catch (error) {
    verificationErrorMessage = error instanceof Error ? error.message : String(error);
  }
  if (!plan.worktreeDir || !plan.worktreeRootPath) {
    setRuntimeWorktreePathState({});
    return {
      mergeAttempted: false,
      mergeSucceeded: false,
      cleanupSucceeded: true,
      activeContext,
    };
  }
  try {
    activeContext = await restorePromptCommandExecution(plan, activeContext, debugOptions);
  } catch (error) {
    activeContext = (getPromptCommandErrorContext(error) ?? activeContext) as PromptCommandSessionContext | undefined;
    return {
      mergeAttempted: false,
      mergeSucceeded: false,
      cleanupSucceeded: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      activeContext,
    };
  }
  if (verificationErrorMessage !== undefined) {
    return {
      mergeAttempted: false,
      mergeSucceeded: false,
      cleanupSucceeded: true,
      errorMessage: verificationErrorMessage,
      activeContext,
    };
  }
  const mergeFinalization = finalizePromptCommandMerge(plan, debugOptions);
  if (!mergeFinalization.mergeSucceeded) {
    return {
      mergeAttempted: mergeFinalization.mergeAttempted,
      mergeSucceeded: false,
      cleanupSucceeded: true,
      errorMessage: mergeFinalization.errorMessage,
      warningMessage: mergeFinalization.warningMessage,
      activeContext,
    };
  }
  try {
    deletePromptWorktree(
      plan.basePath,
      plan.worktreeDir,
      plan.worktreeRootPath,
      plan.promptName,
      debugOptions,
    );
  } catch {
    return {
      mergeAttempted: mergeFinalization.mergeAttempted,
      mergeSucceeded: true,
      cleanupSucceeded: false,
      errorMessage: `ERROR: Unable to remove worktree or branch ${plan.worktreeDir}.`,
      warningMessage: mergeFinalization.warningMessage,
      activeContext,
    };
  }
  return {
    mergeAttempted: mergeFinalization.mergeAttempted,
    mergeSucceeded: true,
    cleanupSucceeded: true,
    warningMessage: mergeFinalization.warningMessage,
    activeContext,
  };
}

/**
 * @brief Maps one `agent_end` payload into the canonical prompt-worktree finalization outcome.
 * @details Delegates to the shared notification outcome classifier so worktree merge and fork-session retention decisions stay aligned with prompt-end notification routing. Runtime is O(m) in assistant message count. No external state is mutated.
 * @param[in] event {Pick<import("@mariozechner/pi-coding-agent").AgentEndEvent, "messages">} Agent-end payload subset.
 * @return {PiNotifyOutcome} Canonical prompt-end outcome.
 */
export function classifyPromptCommandOutcome(
  event: Pick<import("@mariozechner/pi-coding-agent").AgentEndEvent, "messages">,
): PiNotifyOutcome {
  return classifyPiNotifyOutcome(event);
}
