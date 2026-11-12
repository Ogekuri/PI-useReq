import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  claimPiUsereqExtensionActivation,
  releasePiUsereqExtensionActivation,
  resetPiUsereqExtensionActivationForTests,
} from "../src/core/extension-instance-guard.js";

/**
 * @brief Reproduces the duplicated-installation activation defect at the guard boundary.
 * @details Simulates one pi host process loading pi-usereq from the npm-managed installation root and then from the git-managed installation root, the layout that made pi report one tool-conflict error per registered tool. Arrange resets the process-scoped store so the case starts from a fresh host process; Act claims activation for both installation paths; Assert verifies the first installation keeps the claim while the duplicate is rejected and the owning path is reported for diagnostics.
 * @satisfies REQ-004, REQ-009, REQ-044, DES-002
 */
test("duplicate installation activation is rejected while the first installation keeps the claim", () => {
  resetPiUsereqExtensionActivationForTests();
  const npmRoot = path.join("/home/test", ".pi", "agent", "npm", "node_modules", "pi-usereq");
  const gitRoot = path.join("/home/test", ".pi", "agent", "git", "github.com", "Ogekuri", "PI-useReq");

  const npmClaim = claimPiUsereqExtensionActivation(npmRoot);
  const gitClaim = claimPiUsereqExtensionActivation(gitRoot);

  assert.deepEqual(npmClaim, { claimed: true, activeInstallationPath: path.resolve(npmRoot) });
  assert.equal(gitClaim.claimed, false);
  assert.equal(gitClaim.activeInstallationPath, path.resolve(npmRoot));
});

/**
 * @brief Verifies session-rebind activation of the same installation stays allowed.
 * @details pi rebinds extension modules for `/new`, `/resume`, `/fork`, and `/reload` and re-invokes the default export of the same installation, so the guard MUST re-confirm ownership instead of treating the rebind as a duplicate installation. Arrange claims one installation path twice with a relative spelling; Assert requires both claims to succeed on the same normalized owner.
 * @satisfies REQ-009, DES-002
 */
test("same installation re-activation stays allowed across session rebinds", () => {
  resetPiUsereqExtensionActivationForTests();
  const installRoot = path.join("/home/test", "checkout");

  const firstClaim = claimPiUsereqExtensionActivation(installRoot);
  const rebindClaim = claimPiUsereqExtensionActivation(path.join("/home/test", "checkout", "."));

  assert.equal(firstClaim.claimed, true);
  assert.equal(rebindClaim.claimed, true);
  assert.equal(rebindClaim.activeInstallationPath, path.resolve(installRoot));
});

/**
 * @brief Verifies a failed activation releases the claim for another installation.
 * @details A partially activated installation releases ownership before rethrowing so a second installed copy can still activate in the same host process; a non-owning release MUST NOT clear foreign ownership. Arrange claims the first installation, releases it from a foreign path, then releases from the owning path; Assert verifies the foreign release is ignored and the owning release frees the claim.
 * @satisfies REQ-009, DES-002
 */
test("activation claim release is ownership-scoped", () => {
  resetPiUsereqExtensionActivationForTests();
  const firstRoot = path.join("/home/test", "first");
  const secondRoot = path.join("/home/test", "second");

  claimPiUsereqExtensionActivation(firstRoot);
  releasePiUsereqExtensionActivation(secondRoot);
  assert.equal(claimPiUsereqExtensionActivation(secondRoot).claimed, false);

  releasePiUsereqExtensionActivation(firstRoot);
  assert.equal(claimPiUsereqExtensionActivation(secondRoot).claimed, true);
});

/**
 * @brief Verifies the deterministic test reset clears process-scoped ownership.
 * @details Removing the stored owner lets one suite simulate independent pi host processes without leaking a claim into later cases. Arrange claims one installation path; Act resets the store; Assert verifies a different installation path can claim afterwards.
 * @satisfies REQ-009, DES-002
 */
test("test reset clears the process-scoped activation owner", () => {
  resetPiUsereqExtensionActivationForTests();
  claimPiUsereqExtensionActivation(path.join("/home/test", "first"));
  resetPiUsereqExtensionActivationForTests();
  assert.equal(
    claimPiUsereqExtensionActivation(path.join("/home/test", "second")).claimed,
    true,
  );
});
