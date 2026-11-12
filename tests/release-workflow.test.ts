import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * @brief Loads the npm release workflow YAML for structural assertions.
 * @details Resolves the repository-local workflow path from the current process working directory and returns the UTF-8 document unchanged so tests can assert release-gating and publication directives deterministically. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {string} Raw workflow YAML text.
 * @satisfies TST-039
 */
function readReleaseWorkflow(): string {
  return fs.readFileSync(
    path.join(process.cwd(), ".github", "workflows", "release-npm.yml"),
    "utf8",
  );
}

/**
 * @brief Validates release YAML using the declared Node YAML parser.
 * @details Parses the repository-owned workflow, rejects parser errors, and checks its root shape. No interpreter probing or optional skip path is allowed. Runtime is O(n) in YAML size; side effects are filesystem reads only.
 * @return {void} No return value.
 * @satisfies TST-039, TST-172
 */
function assertReleaseWorkflowYamlSyntax(): void {
  const document = parseDocument(readReleaseWorkflow(), { uniqueKeys: true });
  assert.deepEqual(document.errors, [], "release workflow must parse without YAML errors");
  const workflow = document.toJS();
  assert.equal(workflow.name, "Release (npm)");
  assert.ok(workflow.on.push.tags.length > 0);
  assert.ok(workflow.jobs["check-branch"]);
  assert.ok(workflow.jobs["release"]);
}

/**
 * @brief Describes the package manifest fields asserted by npm release tests.
 * @details Constrains the parsed `package.json` shape to the publication identity and provenance metadata required by the release workflow tests. The interface is compile-time only and introduces no runtime side effects.
 */
interface PackageManifest {
  name?: unknown;
  repository?: {
    type?: unknown;
    url?: unknown;
  };
  bugs?: {
    url?: unknown;
  };
  homepage?: unknown;
}

/**
 * @brief Loads the repository package manifest for npm publication assertions.
 * @details Resolves `package.json` from the current process working directory, parses the UTF-8 JSON document, and returns the manifest object so tests can assert publication identity and provenance metadata deterministically. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {PackageManifest} Parsed package manifest.
 * @satisfies TST-042, TST-044
 */
function readPackageManifest(): PackageManifest {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as PackageManifest;
}

/**
 * @brief Asserts the fixed npm package name used for publication.
 * @details Loads `package.json` and verifies that the published package name remains `pi-usereq`, preserving the canonical npm package identity. Runtime is O(n) in file size. Side effects are limited to filesystem reads through `readPackageManifest`.
 * @return {void} No return value.
 * @satisfies TST-042
 */
function assertFixedPackageName(): void {
  const manifest = readPackageManifest();

  assert.equal(manifest.name, "pi-usereq");
}

/**
 * @brief Asserts canonical GitHub provenance metadata in `package.json`.
 * @details Loads `package.json` and verifies that repository, issues, and homepage URLs remain aligned to the canonical GitHub repository required by npm provenance validation. Runtime is O(n) in file size. Side effects are limited to filesystem reads through `readPackageManifest`.
 * @return {void} No return value.
 * @satisfies TST-044
 */
function assertCanonicalPackageProvenanceMetadata(): void {
  const manifest = readPackageManifest();

  assert.deepEqual(manifest.repository, {
    type: "git",
    url: "git+https://github.com/Ogekuri/PI-useReq.git",
  });
  assert.deepEqual(manifest.bugs, {
    url: "https://github.com/Ogekuri/PI-useReq/issues",
  });
  assert.equal(manifest.homepage, "https://github.com/Ogekuri/PI-useReq#readme");
}

test(
  "release workflow remains valid YAML when parsed by Node",
  assertReleaseWorkflowYamlSyntax,
);

test(
  "release workflow keeps the current tag trigger and gates release work on origin/master ancestry",
  () => {
    const workflow = readReleaseWorkflow();

    assert.match(workflow, /name:\s+Release \(npm\)/);
    assert.match(workflow, /tags:\s*\n\s*-\s*'v\[0-9\]\+\.\[0-9\]\+\.\[0-9\]\+'/);
    assert.ok(workflow.includes("check-branch:"));
    assert.ok(workflow.includes("is_master: ${{ steps.check.outputs.is_master }}"));
    assert.ok(workflow.includes("git fetch origin master"));
    assert.ok(workflow.includes('grep -q "origin/master"'));
    assert.ok(
      workflow.includes("if: needs.check-branch.outputs.is_master == 'true'"),
    );
    assert.ok(workflow.includes("release:"));
    assert.ok(workflow.includes("needs: check-branch"));
    assert.equal(workflow.includes("build-release:"), false);
  },
);

test(
  "release workflow pins Node.js 24.15.0, publishes to npm, and creates the GitHub release",
  () => {
    const workflow = readReleaseWorkflow();

    assert.match(workflow, /NODE_VERSION:\s+'24\.15\.0'/);
    assert.ok(workflow.includes("uses: actions/setup-node@v5"));
    assert.ok(workflow.includes("registry-url: 'https://registry.npmjs.org'"));
    assert.ok(workflow.includes("Resolve pre-built release artifact"));
    assert.ok(workflow.includes('artifact="dist/pi-usereq-${version}.tgz"'));
    assert.ok(workflow.includes('git cat-file -e "${GITHUB_SHA}:${artifact}"'));
    assert.ok(
      workflow.includes(
        'npm publish "${{ steps.prebuilt.outputs.artifact_path }}" --provenance --access public',
      ),
    );
    assert.ok(workflow.includes("id-token: write"));
    assert.doesNotMatch(workflow, /NODE_AUTH_TOKEN/u);
    assert.doesNotMatch(workflow, /secrets\.NPM_TOKEN/u);
    assert.ok(
      workflow.includes(
        "uses: mikepenz/release-changelog-builder-action@v6",
      ),
    );
    assert.ok(workflow.includes("uses: softprops/action-gh-release@v3"));
    assert.ok(workflow.includes("files: dist/*.tgz"));
    assert.ok(workflow.includes("fail_on_unmatched_files: true"));
    assert.doesNotMatch(workflow, /files:\s*src\/\*\*\/\*/u);
    assert.ok(workflow.includes("draft: false"));
    assert.ok(workflow.includes("prerelease: false"));
    assert.ok(
      workflow.includes(
        "body: ${{ steps.build_changelog.outputs.changelog }}",
      ),
    );
  },
);

/**
 * @brief Asserts both release-workflow jobs pin the Ubuntu 24.04 hosted-runner label.
 * @details Reads `.github/workflows/release-npm.yml` through `readReleaseWorkflow` and asserts that every `runs-on:` declaration resolves to `ubuntu-24.04` while the floating `ubuntu-latest` label is absent. Guards the pipeline against the GitHub Ubuntu 26.04 `ubuntu-latest` re-target breaking change (migration window starting 2026-10-19) that fails compilation on Ubuntu 24.04-specific tooling. Deterministic and isolated; side effects limited to the read-only workflow document.
 * @return {void} No return value.
 * @satisfies TST-039
 */
test(
  "release workflow pins both jobs to the ubuntu-24.04 runner label",
  () => {
    const workflow = readReleaseWorkflow();

    const runOnDeclarations = workflow
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("runs-on:"));
    assert.ok(
      runOnDeclarations.length >= 2,
      `expected per-job runs-on declarations, found: ${runOnDeclarations.join(", ")}`,
    );
    assert.ok(
      runOnDeclarations.every((line) => line === "runs-on: ubuntu-24.04"),
      `unexpected runner label: ${runOnDeclarations.join(", ")}`,
    );
    assert.doesNotMatch(workflow, /ubuntu-latest/u);
  },
);

test(
  "package manifest keeps the npm publication name fixed to pi-usereq",
  assertFixedPackageName,
);

test(
  "package manifest files allowlist ships only runtime-required src and scripts entries",
  () => {
    const manifest = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { files?: unknown };
    assert.deepEqual(
      manifest.files,
      [
        "src",
        "!src/resources/pi-prompts-version.txt",
        "scripts/pi-usereq.js",
        "scripts/pi-usereq.sh",
        "scripts/install-static-checkers.ts",
        "scripts/install-static-checkers.js",
      ],
      "npm files allowlist must exclude maintainer-only scripts and the updater version record",
    );
  },
);

test(
  "package manifest keeps canonical repository, bugs, and homepage metadata for npm provenance",
  assertCanonicalPackageProvenanceMetadata,
);

/**
 * @brief Describes the npm publication metadata asserted by manifest compliance tests.
 * @details Constrains the parsed `package.json` shape to the license, discoverability, engine, and prepublish-gate metadata required for npm registry compliance. The interface is compile-time only and introduces no runtime side effects.
 */
interface NpmComplianceManifest {
  version?: unknown;
  description?: unknown;
  author?: unknown;
  keywords?: unknown;
  license?: unknown;
  engines?: {
    node?: unknown;
  };
  scripts?: {
    prepublishOnly?: unknown;
  };
}

/**
 * @brief Describes the root lockfile facts asserted by manifest compliance tests.
 * @details Constrains the parsed `package-lock.json` shape to the top-level version plus the root-package entry version that npm publication metadata must keep identical. The interface is compile-time only and introduces no runtime side effects.
 */
interface NpmComplianceLock {
  version?: unknown;
  packages?: Record<string, { version?: unknown } | undefined>;
}

/**
 * @brief Loads the package manifest for npm compliance assertions.
 * @details Reads and parses `package.json` from the current process working directory so registry-metadata tests share one deterministic loader with the existing release-workflow tests. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {NpmComplianceManifest} Parsed package manifest.
 * @satisfies TST-159, TST-160, TST-161
 */
function readNpmComplianceManifest(): NpmComplianceManifest {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
  ) as NpmComplianceManifest;
}

/**
 * @brief Loads the root lockfile facts for npm compliance assertions.
 * @details Reads and parses `package-lock.json` from the current process working directory, preserving the top-level version and the root-package entry version used for manifest and lockfile identity checks. Runtime is O(n) in file size. Side effects are limited to filesystem reads.
 * @return {NpmComplianceLock} Parsed root lockfile facts.
 * @satisfies TST-159
 */
function readNpmComplianceLock(): NpmComplianceLock {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8"),
  ) as NpmComplianceLock;
}

/**
 * @brief Asserts the published version is semver-valid and identical across manifest and lockfile.
 * @details Loads `package.json` plus `package-lock.json`, validates the manifest version against the official semver grammar, and asserts both root-package lockfile version fields equal the manifest version so npm publication always resolves one coherent package version. Runtime is O(n) in combined file size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-159, CTN-028
 */
test(
  "package manifest and lockfile keep one identical semver version for npm publication",
  () => {
    const manifest = readNpmComplianceManifest();
    const lock = readNpmComplianceLock();

    const version = manifest.version;
    assert.equal(typeof version, "string");
    assert.match(
      version as string,
      /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u,
    );
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages?.[""]?.version, manifest.version);
  },
);

/**
 * @brief Asserts the manifest carries license, discoverability, and engine metadata.
 * @details Loads `package.json` plus the committed `LICENSE` text, asserts the SPDX `GPL-3.0-only` identifier matches the GPL-3.0 license document, and asserts non-empty description, author, keywords, and the `>=24.0.0` Node.js engine floor required for npm registry discoverability and runtime policy compliance. Runtime is O(n) in combined file size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-160, CTN-025, CTN-026, CTN-027
 */
test(
  "package manifest declares npm compliance metadata for license, discoverability, and engines",
  () => {
    const manifest = readNpmComplianceManifest();
    const licenseText = fs.readFileSync(
      path.join(process.cwd(), "LICENSE"),
      "utf8",
    );

    assert.equal(manifest.license, "GPL-3.0-only");
    assert.match(licenseText, /GNU GENERAL PUBLIC LICENSE/u);
    assert.match(licenseText, /Version 3, 29 June 2007/u);

    const description = manifest.description;
    assert.equal(typeof description, "string");
    assert.ok((description as string).length > 0);

    const author = manifest.author;
    assert.equal(typeof author, "string");
    assert.ok((author as string).length > 0);

    const keywords = manifest.keywords;
    assert.ok(Array.isArray(keywords));
    assert.ok((keywords as unknown[]).length > 0);
    for (const keyword of keywords as unknown[]) {
      assert.equal(typeof keyword, "string");
      assert.ok((keyword as string).length > 0);
    }

    assert.equal(manifest.engines?.node, ">=24.0.0");
  },
);

/**
 * @brief Asserts source-directory publishes retain the prepublishOnly test gate.
 * @details Loads `package.json` plus the release workflow, asserts the `prepublishOnly` script executes `npm test` for source-directory `npm publish` runs, and asserts the release workflow publishes the pre-built tarball directly with provenance while never relying on `--ignore-scripts`. Runtime is O(n) in combined file size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-161, CTN-029
 */
test(
  "package manifest declares prepublishOnly while release workflow publishes the pre-built tarball",
  () => {
    const manifest = readNpmComplianceManifest();
    const workflow = readReleaseWorkflow();

    assert.equal(manifest.scripts?.prepublishOnly, "npm test");
    assert.ok(
      workflow.includes(
        'npm publish "${{ steps.prebuilt.outputs.artifact_path }}" --provenance --access public',
      ),
    );
    assert.doesNotMatch(workflow, /--ignore-scripts/u);
  },
);

/**
 * @brief Asserts the release workflow consumes only pre-built artifacts without build steps.
 * @details Loads `.github/workflows/release-npm.yml`, verifies the pre-built artifact resolution and direct tarball publication, and rejects every build or build-preparatory command (`npm ci`, `npm test`, `npm run build`, `tsc`, `scripts/build.sh`, `scripts/pre-release-check.sh`) so the automation never rebuilds release artifacts. Runtime is O(n) in workflow size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-195, TST-197, REQ-499, REQ-602, REQ-603
 */
test(
  "release workflow publishes pre-built artifacts without build or pre-release verification scripts",
  () => {
    const workflow = readReleaseWorkflow();

    assert.ok(workflow.includes("Resolve pre-built release artifact"));
    assert.ok(workflow.includes('artifact="dist/pi-usereq-${version}.tgz"'));
    assert.ok(workflow.includes('git cat-file -e "${GITHUB_SHA}:${artifact}"'));
    assert.ok(
      workflow.includes(
        'npm publish "${{ steps.prebuilt.outputs.artifact_path }}" --provenance --access public',
      ),
    );

    for (const forbiddenCommand of [
      "npm ci",
      "npm test",
      "npm run build",
      "tsc --noEmit",
      "scripts/build.sh",
      "scripts/pre-release-check.sh",
    ]) {
      assert.equal(
        workflow.includes(forbiddenCommand),
        false,
        `release workflow must not run ${forbiddenCommand}`,
      );
    }
  },
);

/**
 * @brief Asserts the GitHub Release uploads pre-built dist tarballs as assets.
 * @details Loads `.github/workflows/release-npm.yml` and verifies the release action attaches `dist/*.tgz` pre-built artifacts with unmatched-file failure enabled, replacing the previous source-tree glob. Runtime is O(n) in workflow size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-196, REQ-500
 */
test(
  "release workflow attaches pre-built dist tarballs to the GitHub release",
  () => {
    const workflow = readReleaseWorkflow();

    assert.ok(workflow.includes("files: dist/*.tgz"));
    assert.ok(workflow.includes("fail_on_unmatched_files: true"));
    assert.doesNotMatch(workflow, /files:\s*src\/\*\*\/\*/u);
  },
);

/**
 * @brief Asserts the release workflow runs every composite action on Node.js 24.
 * @details Loads `.github/workflows/release-npm.yml` and verifies each `uses:` pin targets a Node24-native action release (`actions/checkout@v5`, `actions/setup-node@v5`, `mikepenz/release-changelog-builder-action@v6`, `softprops/action-gh-release@v3`) while no Node20 transitional opt-out environment variable (`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`, `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION`) appears, so the automation depends only on the Node24 runtime GitHub runners provide by default. Runtime is O(n) in workflow size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-162, CTN-030
 */
test(
  "release workflow pins Node24-native composite actions without Node20 transitional opt-outs",
  () => {
    const workflow = readReleaseWorkflow();

    assert.ok(workflow.includes("uses: actions/checkout@v5"));
    assert.ok(workflow.includes("uses: actions/setup-node@v5"));
    assert.ok(
      workflow.includes("uses: mikepenz/release-changelog-builder-action@v6"),
    );
    assert.ok(workflow.includes("uses: softprops/action-gh-release@v3"));
    assert.doesNotMatch(workflow, /FORCE_JAVASCRIPT_ACTIONS_TO_NODE24/u);
    assert.doesNotMatch(workflow, /ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION/u);
  },
);

/**
 * @brief Asserts the npm publication target is passed as an explicit local tarball path.
 * @details Loads `.github/workflows/release-npm.yml` and verifies the resolved artifact path emitted for `npm publish` carries an explicit local-file prefix (`./` or an absolute path), because npm's package-argument parser resolves a bare `dir/file.tgz` token as a hosted-git GitHub shorthand and then fails publication with `git ls-remote ssh://git@github.com/dir/file.tgz.git`. The test also rejects any publish invocation that names `dist/` directly so the publication step must consume the prefixed artifact output. Runtime is O(n) in workflow size. Side effects are limited to filesystem reads.
 * @return {void} No return value.
 * @satisfies TST-195, REQ-140, REQ-499
 */
test(
  "release workflow publishes the pre-built tarball through an explicit local path",
  () => {
    const workflow = readReleaseWorkflow();

    assert.ok(
      workflow.includes('echo "artifact_path=./${artifact}" >> "$GITHUB_OUTPUT"'),
      "artifact_path must emit an explicit local-file prefix so npm never parses it as a hosted-git shorthand",
    );
    assert.ok(
      workflow.includes(
        'npm publish "${{ steps.prebuilt.outputs.artifact_path }}" --provenance --access public',
      ),
    );
    assert.doesNotMatch(workflow, /npm publish[^\n]*dist\//u);
  },
);
