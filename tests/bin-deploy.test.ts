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
  removeUserBinPiUsereqLauncher,
  resolvePiAgentBinDir,
  resolvePiUsereqLauncherTarget,
  type PiUsereqLauncherDeployOptions,
} from "../src/core/bin-deploy.js";
import {
  PACKAGE_UNINSTALL_COMMAND,
  runPackageManagerUninstallCommand,
  type PackageManagerSpawn,
} from "../src/core/package-manager.js";

/**
 * @brief Isolates the user home for this test module.
 * @details Redirects every home-derived launcher resolution (pi agent bin directory, user-home bin directory, default package-root containment) to one fresh temporary directory so the default, non-injected launcher helpers exercised by this module can never reach or delete the developer-home launcher links of the installed pi-usereq version. Runtime is O(1). Side effects are limited to process-scoped environment mutation plus one temporary directory.
 */
const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-bin-deploy-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;

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
  const gitInstall = path.join(home, ".pi", "agent", "git", "github.com", "Ogekuri", "PI-useReq");
  for (const installRoot of [packageInstall, gitInstall]) {
    const scriptsDir = path.join(installRoot, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.writeFileSync(path.join(scriptsDir, "pi-usereq.js"), "#!/usr/bin/env node\n", "utf8");
  }
  const previous = process.env.PI_CODING_AGENT_DIR;
  try {
    delete process.env.PI_CODING_AGENT_DIR;
    assert.equal(isPiPackageInstallation(packageInstall, () => home), true);
    assert.equal(isPiPackageInstallation(gitInstall, () => home), true);
    assert.equal(
      isPiPackageInstallation(
        path.join(home, "project", ".pi", "git", "github.com", "Ogekuri", "PI-useReq"),
        () => home,
      ),
      true,
    );
    assert.equal(
      isPiPackageInstallation(
        path.join(home, "project", ".pi", "npm", "node_modules", "pi-usereq"),
        () => home,
      ),
      true,
    );
    assert.equal(isPiPackageInstallation(home, () => home), false);
    process.env.PI_CODING_AGENT_DIR = path.join(home, "custom-agent");
    assert.equal(isPiPackageInstallation(home, () => home), false);
    const gatedOptions: PiUsereqLauncherDeployOptions = {
      installationPath: packageInstall,
      agentBinDir: path.join(home, "custom-agent", "bin"),
    };
    assert.deepEqual(deployPiUsereqLauncher(gatedOptions), { deployed: true, outcome: "created" });
    const gitOptions: PiUsereqLauncherDeployOptions = {
      installationPath: gitInstall,
      agentBinDir: path.join(home, "git-agent-bin"),
    };
    assert.deepEqual(deployPiUsereqLauncher(gitOptions), { deployed: true, outcome: "created" });
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
    removeUserBinLauncher: () => false,
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

test("launcher deployment resolves the default package-root target without injected overrides", () => {
  // Arrange: redirect the pi agent bin directory into a temporary sandbox through the
  // PI_CODING_AGENT_DIR contract so the DEFAULT installation-path resolution is exercised
  // against the real npm package layout (<packageRoot>/src module root plus
  // <packageRoot>/scripts/pi-usereq.js launcher) without touching the developer home.
  const sandboxDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-bin-deploy-default-"));
  const expectedTarget = resolvePiUsereqLauncherTarget();
  const previous = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = sandboxDir;
  try {
    // Act
    const deployed = deployPiUsereqLauncher();
    // Assert: default resolution anchors on the package root, so the real shebang
    // launcher exists and the sandboxed agent bin receives the owned symlink.
    assert.equal(
      fs.existsSync(expectedTarget),
      true,
      "default launcher target must resolve to <packageRoot>/scripts/pi-usereq.js",
    );
    assert.deepEqual(deployed, { deployed: true, outcome: "created" });
    const linkPath = path.join(sandboxDir, "bin", PI_USEREQ_LAUNCHER_NAME);
    assert.equal(fs.realpathSync(linkPath), fs.realpathSync(expectedTarget));
    // Act + Assert: uninstall containment anchored on the same package root removes the owned link.
    assert.equal(removeDeployedPiUsereqLauncher(), true);
    assert.equal(fs.existsSync(linkPath), false);
  } finally {
    if (previous === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previous;
    }
    fs.rmSync(sandboxDir, { recursive: true, force: true });
  }
});

/**
 * @brief Builds one fake installed pi package plus its deployed launcher chain.
 * @details Materializes one temporary installation root carrying `scripts/pi-usereq.js`, one pi agent bin directory holding the deployed `pi-usereq` symlink targeting that launcher, and one user-home bin directory holding the chained `pi-usereq` symlink targeting the agent-bin entry, mirroring the two-layer launcher chain deployed by extension activation. Runtime is O(1) plus temporary directory creation. Side effects are confined to the OS temp directory.
 * @return {{ installRoot: string; agentBinDir: string; userBinDir: string; agentBinLink: string; userBinLink: string }} Fixture paths of the installed package and its deployed launcher chain.
 */
function createUserBinLauncherChainFixture(): {
  installRoot: string;
  agentBinDir: string;
  userBinDir: string;
  agentBinLink: string;
  userBinLink: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-user-bin-chain-"));
  const installRoot = path.join(root, "installed");
  const launcherTarget = resolvePiUsereqLauncherTarget(installRoot);
  fs.mkdirSync(path.dirname(launcherTarget), { recursive: true });
  fs.writeFileSync(launcherTarget, "#!/usr/bin/env node\n", "utf8");
  const agentBinDir = path.join(root, "agent-bin");
  fs.mkdirSync(agentBinDir, { recursive: true });
  const agentBinLink = path.join(agentBinDir, PI_USEREQ_LAUNCHER_NAME);
  fs.symlinkSync(launcherTarget, agentBinLink, "file");
  const userBinDir = path.join(root, "user-bin");
  fs.mkdirSync(userBinDir, { recursive: true });
  const userBinLink = path.join(userBinDir, PI_USEREQ_LAUNCHER_NAME);
  fs.symlinkSync(agentBinLink, userBinLink, "file");
  return { installRoot, agentBinDir, userBinDir, agentBinLink, userBinLink };
}

/**
 * @brief Builds one fake foreign source checkout carrying its own launcher file.
 * @details Materializes one temporary source-checkout root holding `scripts/pi-usereq.js` so the executing-installation ownership probe observes a genuine package root that owns neither the deployed agent-bin launcher nor the chained user-home link. Runtime is O(1) plus temporary directory creation. Side effects are confined to the OS temp directory.
 * @return {string} Absolute foreign source-checkout package root.
 */
function createForeignSourceCheckout(): string {
  const checkoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-usereq-foreign-checkout-"));
  const launcherTarget = resolvePiUsereqLauncherTarget(checkoutRoot);
  fs.mkdirSync(path.dirname(launcherTarget), { recursive: true });
  fs.writeFileSync(launcherTarget, "#!/usr/bin/env node\n", "utf8");
  return checkoutRoot;
}

test("user-home launcher removal leaves the installed link untouched when executed from a foreign source checkout", () => {
  // Arrange: one installed package owns the deployed agent-bin launcher and its
  // chained user-home link; a second, foreign source checkout owns neither.
  const fixture = createUserBinLauncherChainFixture();
  const foreignCheckout = createForeignSourceCheckout();
  // Act + Assert: the foreign checkout must not de-register the installed
  // user-home launcher, even though the link chains to the agent-bin entry.
  const foreignRemoval = removeUserBinPiUsereqLauncher({
    installationPath: foreignCheckout,
    agentBinDir: fixture.agentBinDir,
    userBinDir: fixture.userBinDir,
  });
  assert.equal(foreignRemoval, false);
  assert.equal(fs.lstatSync(fixture.userBinLink).isSymbolicLink(), true);
  assert.equal(
    path.resolve(fixture.userBinDir, fs.readlinkSync(fixture.userBinLink)),
    path.resolve(fixture.agentBinLink),
  );
  assert.equal(fs.lstatSync(fixture.agentBinLink).isSymbolicLink(), true);
  // Act + Assert: the owning installation still removes its chained user-home link.
  const owningRemoval = removeUserBinPiUsereqLauncher({
    installationPath: fixture.installRoot,
    agentBinDir: fixture.agentBinDir,
    userBinDir: fixture.userBinDir,
  });
  assert.equal(owningRemoval, true);
  assert.equal(fs.existsSync(fixture.userBinLink), false);
  assert.equal(fs.lstatSync(fixture.agentBinLink).isSymbolicLink(), true);
});
