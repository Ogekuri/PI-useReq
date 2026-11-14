/**
 * @file
 * @brief Verifies the `--write-config` default-materialization and `--set`/`--unset` absence-preservation contracts.
 * @details Covers absent-default materialization across the global and local scopes, persisted-value and unknown-key preservation, idempotent skipping of complete files, operand rejection, and sparse `--set` plus `--unset` persistence that keeps absent parameter chains absent while preserving effective reads. Runtime is dominated by subprocess CLI invocations over isolated temporary project and global configuration files. Side effects are limited to temporary project, home, and configuration files.
 * @satisfies TST-227, TST-228
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { getGlobalConfigPath, getProjectConfigPath } from "../src/core/config.js";
import { createTempDir, readGlobalConfigJson, readProjectConfigJson, runNodeCli } from "./helpers.js";

/**
 * @brief Runs the configuration CLI in one temporary project and asserts a zero exit status.
 * @details Fails with captured stderr on a non-zero exit and returns stdout verbatim otherwise. Runtime is dominated by subprocess execution. Side effects are limited to subprocess creation.
 * @param[in] projectBase {string} Project working directory.
 * @param[in] args {string[]} Configuration CLI arguments.
 * @return {string} Captured stdout.
 */
function runSuccessful(projectBase: string, args: string[]): string {
  const result = runNodeCli(args, projectBase);
  assert.equal(result.status, 0, `CLI ${args.join(" ")} failed: ${result.stderr}`);
  return result.stdout;
}

/**
 * @brief Writes one partial global configuration payload over the isolated test global file.
 * @details Serializes the supplied payload with two-space indentation and one trailing newline so later raw-byte and key assertions observe the exact persisted shape. Runtime is O(n) in payload size. Side effects include one global-config file overwrite under the isolated test home.
 * @param[in] payload {Record<string, unknown>} Partial global payload.
 * @return {void} No return value.
 */
function writePartialGlobalConfig(payload: Record<string, unknown>): void {
  fs.writeFileSync(getGlobalConfigPath(), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/**
 * @brief Verifies absent-default materialization across both scopes with persisted-value preservation.
 * @details Overwrites the global file with one partial payload carrying a custom value and an unknown key, removes the local file, runs `--write-config`, and asserts the global file gains only absent defaults while the custom value and unknown key stay verbatim and the missing local file is created with the documented defaults. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-227
 */
test("write-config materializes only absent defaults and preserves persisted values", () => {
  const projectBase = createTempDir("pi-usereq-write-config-materialize-");
  writePartialGlobalConfig({
    GIT_WORKTREE_PREFIX: "CUSTOM-",
    "unknown-key": { nested: true },
  });
  fs.rmSync(getProjectConfigPath(projectBase), { force: true });

  const result = runNodeCli(["--write-config"], projectBase);

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  const globalPayload = readGlobalConfigJson();
  assert.equal(globalPayload.GIT_WORKTREE_PREFIX, "CUSTOM-");
  assert.deepEqual(globalPayload["unknown-key"], { nested: true });
  assert.equal(globalPayload.AUTO_GIT_COMMIT, "enable");
  assert.equal(globalPayload["notify-enabled"], false);
  assert.equal(globalPayload["notify-sound"], "none");
  const localPayload = readProjectConfigJson(projectBase);
  assert.equal(localPayload["docs-dir"], "usereq/docs");
  assert.equal(localPayload["tests-dir"], "tests");
  assert.deepEqual(localPayload["src-dir"], ["src"]);
  assert.equal(localPayload.DEBUG_LOG_FILE, "/tmp/PI-useReq.json");
  const localStaticCheck = localPayload["static-check"] as Record<string, Record<string, unknown>>;
  assert.equal(localStaticCheck.C.enabled, "enable");
  assert.equal(localStaticCheck.Lua.enabled, "disable");
});

/**
 * @brief Verifies idempotent skipping of already complete configuration files.
 * @details Runs `--write-config` twice and asserts the second run leaves both persisted files byte-identical while emitting no stdout. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-227
 */
test("write-config leaves complete configuration files untouched", () => {
  const projectBase = createTempDir("pi-usereq-write-config-idempotent-");
  assert.equal(runSuccessful(projectBase, ["--write-config"]), "");
  assert.ok(fs.existsSync(getProjectConfigPath(projectBase)));
  const localBytes = fs.readFileSync(getProjectConfigPath(projectBase), "utf8");
  const globalBytes = fs.readFileSync(getGlobalConfigPath(), "utf8");

  assert.equal(runSuccessful(projectBase, ["--write-config"]), "");

  assert.equal(fs.readFileSync(getProjectConfigPath(projectBase), "utf8"), localBytes);
  assert.equal(fs.readFileSync(getGlobalConfigPath(), "utf8"), globalBytes);
});

/**
 * @brief Verifies operand rejection for the zero-argument `--write-config` command.
 * @details Asserts exit code 1 plus one English stderr diagnostic when an operand is supplied. Runtime is dominated by subprocess execution. Side effects are limited to subprocess creation.
 * @return {void} No return value.
 * @satisfies TST-227
 */
test("write-config rejects operands with one stderr diagnostic", () => {
  const projectBase = createTempDir("pi-usereq-write-config-reject-");
  const result = runNodeCli(["--write-config", "extra"], projectBase);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /--write-config requires no arguments/);
});

/**
 * @brief Verifies sparse `--set` and `--unset` persistence over the local scope.
 * @details Asserts the first local mutation writes only the mutated key, effective reads keep returning documented defaults for absent keys, subsequent mutations extend the payload without materializing other defaults, and unset operations restore persisted values or keep absent keys absent. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-228
 */
test("set persists requested mutations while keeping absent local parameters absent", () => {
  const projectBase = createTempDir("pi-usereq-write-config-set-sparse-");
  fs.rmSync(getProjectConfigPath(projectBase), { force: true });

  assert.equal(runSuccessful(projectBase, ["--set", "Local:docs-dir", "documentation"]), "");
  let localPayload = readProjectConfigJson(projectBase);
  assert.deepEqual(Object.keys(localPayload), ["docs-dir"]);
  assert.equal(localPayload["docs-dir"], "documentation");
  assert.equal(runSuccessful(projectBase, ["--get", "Local:tests-dir"]), "\"tests\"\n");

  assert.equal(runSuccessful(projectBase, ["--set", "Local:context-files-workflow", "false"]), "");
  localPayload = readProjectConfigJson(projectBase);
  assert.deepEqual(Object.keys(localPayload), ["docs-dir", "context-files-workflow"]);
  assert.equal(localPayload["context-files-workflow"], false);
  assert.equal(Object.hasOwn(localPayload, "DEBUG_LOG_FILE"), false);

  assert.equal(runSuccessful(projectBase, ["--unset", "Local:docs-dir"]), "");
  localPayload = readProjectConfigJson(projectBase);
  assert.deepEqual(Object.keys(localPayload), ["docs-dir", "context-files-workflow"]);
  assert.equal(localPayload["docs-dir"], "usereq/docs");

  assert.equal(runSuccessful(projectBase, ["--unset", "Local:src-dir"]), "");
  localPayload = readProjectConfigJson(projectBase);
  assert.deepEqual(Object.keys(localPayload), ["docs-dir", "context-files-workflow"]);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:src-dir"]), "[\"src\"]\n");
});

/**
 * @brief Verifies that unsetting an absent parameter writes no local configuration file.
 * @details Removes the local file, unsets an absent parameter, and asserts the local file stays absent while the effective read keeps returning the documented default. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-228
 */
test("unset on an absent parameter writes no local configuration file", () => {
  const projectBase = createTempDir("pi-usereq-write-config-unset-absent-");
  fs.rmSync(getProjectConfigPath(projectBase), { force: true });

  assert.equal(runSuccessful(projectBase, ["--unset", "Local:docs-dir"]), "");

  assert.equal(fs.existsSync(getProjectConfigPath(projectBase)), false);
  assert.equal(runSuccessful(projectBase, ["--get", "Local:docs-dir"]), "\"usereq/docs\"\n");
});

/**
 * @brief Verifies sparse `--set` persistence over an existing partial global file.
 * @details Overwrites the global file with one single-key payload, sets one sound level, and asserts the global file holds exactly the persisted key plus the mutated key while effective reads keep returning documented defaults for absent keys. Runtime is dominated by subprocess execution. Side effects are limited to temporary configuration files.
 * @return {void} No return value.
 * @satisfies TST-228
 */
test("set keeps absent global parameters absent in an existing partial file", () => {
  const projectBase = createTempDir("pi-usereq-write-config-set-global-");
  writePartialGlobalConfig({ "notify-enabled": true });

  assert.equal(runSuccessful(projectBase, ["--set", "Global:notify-sound", "low"]), "");

  const globalPayload = readGlobalConfigJson();
  assert.deepEqual(Object.keys(globalPayload).sort(), ["notify-enabled", "notify-sound"]);
  assert.equal(globalPayload["notify-sound"], "low");
  assert.equal(Object.hasOwn(globalPayload, "AUTO_GIT_COMMIT"), false);
  assert.equal(runSuccessful(projectBase, ["--get", "Global:AUTO_GIT_COMMIT"]), "\"enable\"\n");
});
