import assert from "node:assert/strict";
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

test(
  "release workflow gates execution on canonical semver tags and origin/master ancestry",
  () => {
    const workflow = readReleaseWorkflow();

    assert.match(workflow, /name:\s+Release \(npm\)/);
    assert.match(workflow, /tags:\s*\n\s*-\s*"v\*\.\*\.\*"/);
    assert.ok(
      workflow.includes(
        'if [[ ! "${GITHUB_REF_NAME}" =~ ^v[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then',
      ),
    );
    assert.ok(workflow.includes("git fetch --no-tags origin master"));
    assert.ok(workflow.includes('grep -q "origin/master"'));
    assert.ok(
      workflow.includes(
        "if: needs.check-release-context.outputs.should_release == 'true'",
      ),
    );
    assert.ok(workflow.includes("needs: [check-release-context, publish-npm]"));
  },
);

test(
  "release workflow installs dependencies, publishes to npm, and creates the GitHub release",
  () => {
    const workflow = readReleaseWorkflow();

    assert.ok(workflow.includes("uses: actions/setup-node@v4"));
    assert.ok(workflow.includes("registry-url: https://registry.npmjs.org"));
    assert.ok(workflow.includes("run: npm ci"));
    assert.ok(workflow.includes("run: npm pkg delete private"));
    assert.ok(
      workflow.includes("run: npm publish --provenance --access public"),
    );
    assert.ok(workflow.includes("NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}"));
    assert.ok(
      workflow.includes("uses: mikepenz/release-changelog-builder-action@v6"),
    );
    assert.ok(workflow.includes("uses: softprops/action-gh-release@v2"));
    assert.ok(workflow.includes("draft: false"));
    assert.ok(workflow.includes("prerelease: false"));
    assert.ok(
      workflow.includes(
        "body: ${{ steps.build_changelog.outputs.changelog }}",
      ),
    );
  },
);
