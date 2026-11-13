import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @brief Verifies the release gate script parses and skips `dist/` entries during generic removal.
 * @details Runs `bash -n` against `scripts/pre-release-check.sh` expecting exit status `0`, then asserts the generic removal case statement contains the `dist|dist/*` skip pattern. Runtime is dominated by one bash subprocess plus one file read. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-190, REQ-496, REQ-498, REQ-574
 */
test("pre-release gate passes bash syntax check and skips dist entries during generic removal", () => {
  // Arrange
  const scriptRelativePath = "scripts/pre-release-check.sh";

  // Act
  const syntax = spawnSync("bash", ["-n", scriptRelativePath], { cwd: process.cwd(), encoding: "utf8" });
  const script = fs.readFileSync(path.join(process.cwd(), scriptRelativePath), "utf8");

  // Assert
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(script.includes("dist|dist/*) continue ;;"), "generic removal must skip dist entries");
});

/**
 * @brief Verifies the release gate provisions the toolchain only on explicit opt-in and before the inventory snapshot.
 * @details Runs `scripts/pre-release-check.sh --help` expecting exit status `0` and usage text advertising `--install` without `--skip-install`, then resolves the `main(...)` body of the same script and asserts the default-off `INSTALL_TOOLCHAIN=0` state, the `--install` arm selecting `INSTALL_TOOLCHAIN=1`, the single `provision_toolchain(...)` dispatch guarded by `npm ci`, the removal of the former dependency-install stage, and that provisioning precedes both `capture_pre_run_inventory(...)` and stage 1. Runtime is dominated by one bash subprocess plus one file read. Side effects include process spawning.
 * @return {void} No return value.
 * @satisfies TST-210, REQ-491, REQ-493, REQ-495, REQ-642, REQ-643
 */
test("pre-release gate provisions npm ci only under --install before the inventory snapshot", () => {
  // Arrange
  const scriptRelativePath = "scripts/pre-release-check.sh";

  // Act
  const help = spawnSync("bash", [scriptRelativePath, "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const script = fs.readFileSync(path.join(process.cwd(), scriptRelativePath), "utf8");
  const mainBody = script.slice(script.indexOf("main() {"));
  const provisioningIndex = mainBody.indexOf("provision_toolchain");
  const snapshotIndex = mainBody.indexOf("capture_pre_run_inventory");
  const stageOneIndex = mainBody.indexOf("stage 1/5");

  // Assert
  assert.equal(help.status, 0, help.stderr);
  assert.ok(help.stdout.includes("--install"), "usage must advertise the --install opt-in");
  assert.equal(help.stdout.includes("--skip-install"), false, "usage must not advertise --skip-install");
  assert.match(script, /\nINSTALL_TOOLCHAIN=0\n/u, "toolchain provisioning must default to off");
  assert.match(script, /--install\)\s*\n\s*INSTALL_TOOLCHAIN=1/u, "--install must select provisioning");
  assert.match(script, /provision_toolchain\(\) \{[\s\S]*?npm ci/u, "provisioning must run npm ci");
  assert.equal(
    script.includes("clean dependency install"),
    false,
    "npm ci must not remain a numbered gate stage",
  );
  assert.ok(provisioningIndex >= 0, "main must dispatch the provisioning pass");
  assert.ok(
    snapshotIndex > provisioningIndex,
    "provisioning must precede the pre-run inventory snapshot",
  );
  assert.ok(stageOneIndex > provisioningIndex, "provisioning must precede stage 1");
});
