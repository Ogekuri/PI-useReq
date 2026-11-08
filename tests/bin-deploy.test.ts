import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PI_USEREQ_LAUNCHER_NAME,
  deployPiUsereqLauncher,
  isPiPackageInstallation,
  removeDeployedPiUsereqLauncher,
  resolvePiAgentBinDir,
  type PiUsereqLauncherDeployOptions,
} from "../src/core/bin-deploy.js";
import {
  PACKAGE_UNINSTALL_COMMAND,
  runPackageManagerUninstallCommand,
  type PackageManagerSpawn,
} from "../src/core/package-manager.js";

/**
 * @brief Builds one isolated fake installation plus pi agent bin directory.
 * @details Materializes a temporary installation root carrying the shebang launcher at `scripts/pi-usereq.js` and an empty agent bin directory, so launcher deployment and removal run against real filesystem entries without touching the developer home. Runtime is O(1) plus temporary directory creation. Side effects are confined to the OS temp directory.
 * @return {{ installRoot: string; agentBinDir: string; launcherTarget: string; options: PiUsereqLauncherDeployOptions }} Temporary fixture paths plus the matching deploy options.
 */
function createLauncherFixture(): {
  installRoot: string;
  agentBinDir: string;
  launcherTarget: string;
  options: PiUsereqLauncherDeployOptions;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-bin-deploy-"));
  const installRoot = path.join(root, "install");
  const scriptsDir = path.join(installRoot, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  const launcherTarget = path.join(scriptsDir, "pi-usereq.js");
  fs.writeFileSync(launcherTarget, "#!/usr/bin/env node\n", "utf8");
  const agentBinDir = path.join(root, "agent-bin");
  fs.mkdirSync(agentBinDir, { recursive: true });
  return {
    installRoot,
    agentBinDir,
    launcherTarget,
    options: { installationPath: installRoot, agentBinDir },
  };
}

/**
 * @brief Builds a deterministic spawn double recording every uninstall child invocation.
 * @details Returns the configured exit status for each call and appends the executable plus argument vector into a captured list so uninstall behavior is asserted without spawning real package-manager processes. Runtime is O(1) per call. No external state is mutated.
 * @param[in] status {number} Fixed child exit status. Defaults to `0`.
 * @return {{ calls: { file: string; args: string[] }[]; spawn: PackageManagerSpawn }} Recording spawn double.
 */
function createUninstallSpawnDouble(status = 0): {
  calls: { file: string; args: string[] }[];
  spawn: PackageManagerSpawn;
} {
  const calls: { file: string; args: string[] }[] = [];
  const spawn: PackageManagerSpawn = (file, args) => {
    calls.push({ file, args: [...args] });
    return { status };
  };
  return { calls, spawn };
}

test("launcher deployment creates an idempotent best-effort symlink", () => {
  const fixture = createLauncherFixture();
  const first = deployPiUsereqLauncher(fixture.options);
  const linkPath = path.join(fixture.agentBinDir, PI_USEREQ_LAUNCHER_NAME);
  assert.deepEqual(first, { deployed: true, outcome: "created" });
  assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);
  assert.equal(fs.realpathSync(linkPath), fs.realpathSync(fixture.launcherTarget));
  const second = deployPiUsereqLauncher(fixture.options);
  assert.deepEqual(second, { deployed: false, outcome: "current" });
  assert.equal(fs.lstatSync(linkPath).isSymbolicLink(), true);
  const missing = deployPiUsereqLauncher({
    installationPath: path.join(fixture.installRoot, "absent"),
    agentBinDir: fixture.agentBinDir,
  });
  assert.deepEqual(missing, { deployed: false, outcome: "skipped", reason: "launcher-missing" });
});

test("launcher deployment replaces divergent symlinks and preserves foreign entries", () => {
  const fixture = createLauncherFixture();
  const divergentTarget = path.join(fixture.installRoot, "other-launcher.js");
  fs.writeFileSync(divergentTarget, "#!/usr/bin/env node\n", "utf8");
  const linkPath = path.join(fixture.agentBinDir, PI_USEREQ_LAUNCHER_NAME);
  fs.symlinkSync(divergentTarget, linkPath, "file");
  const replaced = deployPiUsereqLauncher(fixture.options);
  assert.deepEqual(replaced, { deployed: true, outcome: "replaced" });
  assert.equal(fs.realpathSync(linkPath), fs.realpathSync(fixture.launcherTarget));
  const foreignMarker = "user-owned";
  fs.unlinkSync(linkPath);
  fs.writeFileSync(linkPath, foreignMarker, "utf8");
  const skipped = deployPiUsereqLauncher(fixture.options);
  assert.deepEqual(skipped, { deployed: false, outcome: "skipped", reason: "foreign-entry" });
  assert.equal(fs.readFileSync(linkPath, "utf8"), foreignMarker);
});

test("launcher deployment helper resolves the pi agent bin directory contract", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-home-"));
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(resolvePiAgentBinDir(() => home), path.join(home, ".pi", "agent", "bin"));
    process.env.PI_CODING_AGENT_DIR = path.join(home, "custom-agent");
    assert.equal(resolvePiAgentBinDir(() => home), path.join(home, "custom-agent", "bin"));
    process.env.PI_CODING_AGENT_DIR = "~/tilde-agent";
    assert.equal(resolvePiAgentBinDir(() => home), path.join(home, "tilde-agent", "bin"));
  } finally {
    if (previous === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previous;
    }
  }
});

test("launcher deployment gates on pi package installation layout", () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-pkg-home-"));
  const packageInstall = path.join(home, ".pi", "agent", "npm", "node_modules", "pi-usereq");
  const scriptsDir = path.join(packageInstall, "scripts");
  fs.mkdirSync(scriptsDir, { recursive: true });
  fs.writeFileSync(path.join(scriptsDir, "pi-usereq.js"), "#!/usr/bin/env node\n", "utf8");
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(isPiPackageInstallation(packageInstall, () => home), true);
    assert.equal(isPiPackageInstallation(home, () => home), false);
    process.env.PI_CODING_AGENT_DIR = path.join(home, "custom-agent");
    assert.equal(isPiPackageInstallation(home, () => home), false);
    const gatedOptions: PiUsereqLauncherDeployOptions = {
      installationPath: packageInstall,
      agentBinDir: path.join(home, "custom-agent", "bin"),
    };
    assert.deepEqual(deployPiUsereqLauncher(gatedOptions), { deployed: true, outcome: "created" });
  } finally {
    if (previous === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previous;
    }
  }
});

test("uninstall removes only the installation-owned launcher link before spawning the child", () => {
  const fixture = createLauncherFixture();
  const foreignInstall = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-foreign-"));
  const foreignTarget = path.join(foreignInstall, "foreign.js");
  fs.writeFileSync(foreignTarget, "", "utf8");
  const ownLink = path.join(fixture.agentBinDir, PI_USEREQ_LAUNCHER_NAME);
  const foreignLink = path.join(fixture.agentBinDir, "foreign-usereq");
  fs.symlinkSync(fixture.launcherTarget, ownLink, "file");
  fs.symlinkSync(foreignTarget, foreignLink, "file");
  const { calls, spawn } = createUninstallSpawnDouble(7);
  const exitCode = runPackageManagerUninstallCommand({
    spawn,
    removeLauncher: () => removeDeployedPiUsereqLauncher(fixture.options),
  });
  assert.equal(exitCode, 7);
  assert.equal(fs.existsSync(ownLink), false);
  assert.equal(fs.existsSync(foreignLink), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, PACKAGE_UNINSTALL_COMMAND[0]);
  assert.deepEqual(calls[0].args, [...PACKAGE_UNINSTALL_COMMAND.slice(1)]);
  const removal = removeDeployedPiUsereqLauncher(fixture.options);
  assert.equal(removal, false);
});
