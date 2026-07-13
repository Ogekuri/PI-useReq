# Changelog

## [0.47.0](https://github.com/Ogekuri/PI-useReq/compare/v0.46.0..v0.47.0) - 2026-07-13
### 🐛  Bug Fixes
- Fix packages file.

## [0.46.0](https://github.com/Ogekuri/PI-useReq/compare/v0.45.0..v0.46.0) - 2026-07-13
### 🐛  Bug Fixes
- Fix extension installer.

## [0.45.0](https://github.com/Ogekuri/PI-useReq/compare/v0.44.0..v0.45.0) - 2026-07-13
### 🐛  Bug Fixes
- Fix packages.
- Fix packages.

### 🚜  Changes
- add view/reset menu actions, removal confirmation, embedded keyword resolution, approve-scripts [useReq] *(static-check)*
  - REQ-008/248/345-349: add View static code checker (read-only, before
  - Remove), Reset static code checker (after Remove, restores embedded
  - defaults), and require config preview plus confirmation before Remove.
  - DES-019/REQ-350/351: resolveCheckerExecutable substitutes the
  - %%INSTALLATION_PATH%% keyword and fixes hoisted node_modules/.bin probing.
  - DES-020/REQ-352: postinstall best-effort runs npm approve-scripts for
  - bundled checker dependencies before probing.
  - Update REQUIREMENTS/WORKFLOW/REFERENCES and the static-check menu test.

## [0.44.0](https://github.com/Ogekuri/PI-useReq/compare/v0.43.0..v0.44.0) - 2026-07-13
### 🚜  Changes
- BREAKING CHANGE: park failed worktree runs in error without resuming base-path [useReq] *(prompt-closure)*
  - REQ-209/REQ-230/TST-058: failed/interrupted/aborted/incomplete worktree-backed runs no longer resume the original base-path session.
  - src/index.ts agent_end closure: the closure-failure branch keeps the worktree execution session visible, notifies the error, parks workflow in error, and retains the active request for req-reset recovery.
  - tests/extension-registration.test.ts: realign the prompt-failure test to assert session retention + workflow error.

## [0.43.0](https://github.com/Ogekuri/PI-useReq/compare/v0.42.0..v0.43.0) - 2026-07-10
### 🚜  Changes
- make tsx a runtime dependency so postinstall resolves [useReq] *(packaging)*
  - Move tsx from devDependencies to dependencies in package.json and the root entry of package-lock.json. The package ships .ts source with noEmit and no dist build, so node --import tsx is required for package scripts, the postinstall checker installer, and the .ts extension entry. tsx was only a devDependency, hence absent on consumer installs, causing ERR_MODULE_NOT_FOUND during pi update --extensions.
  - Requirements: add CTN-020; update Section 5.2 note; bump front-matter to 0.0.75
  - Verified: npm install --legacy-peer-deps runs postinstall with exit 0

## [0.42.0](https://github.com/Ogekuri/PI-useReq/compare/v0.41.0..v0.42.0) - 2026-07-10
### 🚜  Changes
- bundle pyright/ruff/eslint and add bundled-bin resolution [useReq] *(static-check)*
  - Add pyright, ruff, and eslint as pinned npm dependencies with a best-effort postinstall installer (scripts/install-static-checkers.ts) that probes bundled node_modules/.bin, attempts npm install on miss, prints native-checker guidance, and always returns 0.
  - Add resolveCheckerExecutable bundled-bin-plus-PATH resolver and checkDefaultCheckersAvailability session_start helper. Change TypeScript default static-check entry from npx+eslint to eslint. Emit one warning notification during session_start for missing enabled checkers without aborting.
  - Add tests/static-check-bundled.test.ts covering resolveCheckerExecutable precedence, postinstall exit-code-0 invariant, and session_start missing-checker reporting. Update REQUIREMENTS.md (REQ-339..REQ-344, DES-017/018, TST-123..125), WORKFLOW.md, README.md, and REFERENCES.md.

## [0.41.0](https://github.com/Ogekuri/PI-useReq/compare/v0.40.0..v0.41.0) - 2026-07-10
### 🐛  Bug Fixes
- await and suppress summary sendMessage to prevent unhandled rejection breaking worktree merge [useReq] *(prompt-delivery)*
  - deliverPromptCommand now awaits the non-critical display:true summary sendMessage and suppresses its failures before dispatching the authoritative hidden display:false prompt turn with triggerTurn:true
  - a rejecting fire-and-forget summary sendMessage previously surfaced as an unhandled rejection (Node default --unhandled-rejections=throw) that could terminate the process before prompt-end closure ran the worktree merge, branch deletion, and worktree deletion
  - add regression tests covering the production sendMessage triggerTurn path, the pi.sendMessage fallback, and a rejecting summary that must not interrupt the merge
  - update WORKFLOW.md call-traces and regenerate REFERENCES.md
- resolve tsc errors in req command and session-entry types [useReq] *(types)*
  - Narrow runCapture/runGitCapture return types to SpawnSyncReturns<string>
  - so UTF-8 stdout/stderr string methods are type-safe in
  - req-references-command, req-reset-command, runtime-project-paths.
  - Remove index signature from PromptCommandSessionEntry so the SDK
  - SessionEntry union is structurally assignable, resolving all
  - SessionEntry/ExtensionContext -> PromptCommandSessionContext mismatches.
  - Narrow transitionPromptWorkflowState nextState parameter from
  - DebugWorkflowState to PiUsereqWorkflowState to match setPiUsereqWorkflowState.
  - Regenerate REFERENCES.md.
- add TST-122 summary test and resolve tsc errors [useReq] *(prompt-command)*
  - Add prompt-command-summary unit test verifying renderPromptCommandSummary renders none for empty context files, static code checks, and enabled tools (TST-122, REQ-338).
  - Narrow runCapture return type to SpawnSyncReturns<string> and initialize switchResult to resolve tsc errors in src/core/prompt-command-runtime.ts; re-export PromptCommandName for prompts.ts.
  - Fix getAllTools type predicate in scripts/lib/recording-extension-api.ts to include required promptGuidelines: string[].
  - Regenerate REFERENCES.md.

### 🚜  Changes
- render none for empty summary lists [useReq] *(prompts)*
  - Add REQ-338 and TST-122 requiring the command invocation summary to
  - render 'none' for context files, static code checks, and enabled
  - tools fields when their enabled-item list is empty.
  - Update renderPromptCommandSummary to fall back to 'none' for the
  - context-files, static-check-languages, and enabled-tools lists.
  - Update WORKFLOW.md node descriptions and regenerate REFERENCES.md.
- default context files to disabled [useReq] *(config)*
  - Update REQ-328 default to disabled and REQ-333 reset-to-disabled
  - Change DEFAULT_CONTEXT_FILES_FLAG from true to false
  - Update Doxygen docs on normalizeContextFilesFlag and constant
  - Bump SRS version to 0.0.72

## [0.40.0](https://github.com/Ogekuri/PI-useReq/compare/v0.39.0..v0.40.0) - 2026-07-10
### 🚜  Changes
- hide full prompt on screen, show command summary [useReq] *(prompt-delivery)*
  - Deliver rendered prompt to LLM via sendMessage(display:false, triggerTurn:true)
  - Display command invocation summary (command name, args, config) on screen
  - Fall back to sendUserMessage when sendMessage is unavailable
  - Add renderPromptCommandSummary in src/core/prompts.ts
  - Update deliverPromptCommand in src/index.ts for all req-<prompt> commands
  - Add requirements DES-016, REQ-334..337, TST-121
  - Update WORKFLOW.md call-traces and REFERENCES.md

## [0.39.0](https://github.com/Ogekuri/PI-useReq/compare/v0.38.0..v0.39.0) - 2026-07-09
### ⛰️  Features
- Add Context Files menu and %%CONTEXT_FILES%% prompt injection [useReq] *(context-files)*
  - Add top-level `Context Files` menu between `Unit tests directory` and `Auto git commit` with per-file toggles for REQUIREMENTS.md, REFERENCES.md, WORKFLOW.md
  - Persist context-files-requirements/references/workflow boolean flags in local config, defaulting enabled
  - Replace %%CONTEXT_FILES%% with per-file markdown sections (file-name heading, pre-substituted HTML file reference, four-backtick fences) in documented order
  - Update REQ-190/191 ordering, add REQ-326..333/TST-117..120, and refresh WORKFLOW/REFERENCES
- Update prompts.

### 🚜  Changes
- Align stale tests with Context Files menu and verbatim injection [useReq] *(tests)*
  - Add Context Files to expected top-level menu list in extension-registration test
  - Disable context-file injection in prompt-rendering placeholder/read-only tests so template-body assertions hold per REQ-332
  - Refine TST-060 to exclude the verbatim %%CONTEXT_FILES%% block from placeholder-absence assertions

## [0.38.0](https://github.com/Ogekuri/PI-useReq/compare/v0.37.0..v0.38.0) - 2026-07-09
### ⛰️  Features
- Add Google_TypeScript_Style_Guide.md and RFC2119.md.

## [0.37.0](https://github.com/Ogekuri/PI-useReq/compare/v0.36.0..v0.37.0) - 2026-07-08
### 🐛  Bug Fixes
- Update README.md file.

## [0.35.0](https://github.com/Ogekuri/PI-useReq/compare/v0.34.0..v0.35.0) - 2026-05-29
### 🐛  Bug Fixes
- Remove version from ts files.

### 🚜  Changes
- prepend runtime metadata in status bar [useReq] *(extension-status)*
  - Update the SRS for the status-bar prefix ordering and runtime metadata contract.
  - Read package metadata at runtime, prepend <extension>:v<version> before status, and keep the documented theme split.
  - Refresh status-bar tests, WORKFLOW.md, and REFERENCES.md for the new runtime call path.

## [0.34.0](https://github.com/Ogekuri/PI-useReq/compare/v0.33.0..v0.34.0) - 2026-05-29
### 🚜  Changes
- add debug-summarize and YAML check [useReq] *(debug-menu)*
  - Update the SRS for debug-menu ordering and debug wrapper coverage.
  - Implement debug-summarize, move the tool-wrapper row before Log file, and refresh runtime docs.
  - Add release-workflow YAML syntax coverage and align npm publish steps with the documented release contract.

## [0.33.0](https://github.com/Ogekuri/PI-useReq/compare/v0.32.0..v0.33.0) - 2026-05-29
### 🐛  Bug Fixes
- Clean workflow file after all tests and bug fixes.

## [0.32.0](https://github.com/Ogekuri/PI-useReq/compare/v0.31.0..v0.32.0) - 2026-05-29
### 🐛  Bug Fixes
- Revert workflow.

### 🚜  Changes
- update Node.js 24.15.0 release flow [useReq] *(release-workflow)*
  - update REQUIREMENTS.md and WORKFLOW.md traceability for the release runtime
  - pin .github/workflows/release-npm.yml to Node.js 24.15.0 and restore npm publish auth
  - align tests/release-workflow.test.ts with the pinned runtime and publish contract

## [0.31.0](https://github.com/Ogekuri/PI-useReq/compare/v0.30.0..v0.31.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround, again, and again.

## [0.30.0](https://github.com/Ogekuri/PI-useReq/compare/v0.29.0..v0.30.0) - 2026-05-29
### 🐛  Bug Fixes
- Revert setup-node version.

## [0.29.0](https://github.com/Ogekuri/PI-useReq/compare/v0.28.0..v0.29.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround, again, and again.

## [0.28.0](https://github.com/Ogekuri/PI-useReq/compare/v0.27.0..v0.28.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround, again, and again.

## [0.27.0](https://github.com/Ogekuri/PI-useReq/compare/v0.26.0..v0.27.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround, again, and again.

## [0.26.0](https://github.com/Ogekuri/PI-useReq/compare/v0.25.0..v0.26.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround, again.

## [0.25.0](https://github.com/Ogekuri/PI-useReq/compare/v0.24.0..v0.25.0) - 2026-05-29
### 🐛  Bug Fixes
- Try another workaround.

## [0.24.0](https://github.com/Ogekuri/PI-useReq/compare/v0.23.0..v0.24.0) - 2026-05-29
### 🐛  Bug Fixes
- Remove install -g npm@latest from workflow.

## [0.23.0](https://github.com/Ogekuri/PI-useReq/compare/v0.22.0..v0.23.0) - 2026-05-29
### 🐛  Bug Fixes
- Workaround actions/setup-node OIDC bug.

## [0.22.0](https://github.com/Ogekuri/PI-useReq/compare/v0.21.0..v0.22.0) - 2026-05-29
### 🐛  Bug Fixes
- Update workflow file.

## [0.21.0](https://github.com/Ogekuri/PI-useReq/compare/v0.20.0..v0.21.0) - 2026-05-29
### 🐛  Bug Fixes
- Update workflow file.

## [0.20.0](https://github.com/Ogekuri/PI-useReq/compare/v0.19.0..v0.20.0) - 2026-05-29
### 🐛  Bug Fixes
- Update workflow file for 2FA publish.

## [0.19.0](https://github.com/Ogekuri/PI-useReq/compare/v0.18.0..v0.19.0) - 2026-05-29
### 🐛  Bug Fixes
- Update version number.

### ◀️  Revert
- Roll back branch to 6b800ba9 (6b800ba99e97ec88f7d9d10d6abe125020d3aebb).

## [0.18.0](https://github.com/Ogekuri/PI-useReq/compare/v0.17.0..v0.18.0) - 2026-05-29
### 🐛  Bug Fixes
- Fix workflow file.

## [0.17.0](https://github.com/Ogekuri/PI-useReq/compare/v0.16.0..v0.17.0) - 2026-05-29
### ⛰️  Features
- Re-add tocken.

## [0.16.0](https://github.com/Ogekuri/PI-useReq/compare/v0.15.0..v0.16.0) - 2026-05-29
### 🐛  Bug Fixes
- Fix workflow.

### 🚜  Changes
- adopt trusted npm publishing [useReq] *(release-npm)*
  - update release requirements for Node 24 and OIDC trusted publishing
  - update workflow, package metadata, and release workflow tests
  - refresh release runtime documentation

## [0.14.0](https://github.com/Ogekuri/PI-useReq/compare/v0.13.0..v0.14.0) - 2026-05-29
### ⛰️  Features
- add debug tool slash commands [useReq] *(debug)*
  - Add DEBUG_TOOL_COMMANDS_ENABLED local config and Debug submenu row.
  - Register config-gated debug-compress, debug-references,
  - debug-static-check, and debug-tokens wrappers.
  - Update requirements, workflow, references, and tests for traceability.
- Update .gitignore file.
- Remove REFERENCES.md.

### 📚  Documentation
- Update REFERENCES.md document. [useReq] *(references)*

## [0.13.0](https://github.com/Ogekuri/PI-useReq/compare/v0.12.0..v0.13.0) - 2026-04-27
### 🚜  Changes
- BREAKING CHANGE: split local and global configuration [useReq] *(config)*
  - update REQUIREMENTS, WORKFLOW, and REFERENCES for the split config model
  - persist tool, notification, git, and checker-command settings globally
  - keep project paths, debug, and static-check enable flags locally
  - rename Show configuration to Show local configuration and add Show global configuration
  - refresh tests for local/global persistence and CLI static-check behavior

## [0.12.0](https://github.com/Ogekuri/PI-useReq/compare/v0.11.0..v0.12.0) - 2026-04-25
### ⛰️  Features
- add req-reset recovery command and docs [useReq] *(req-reset)*
  - Add dedicated req-reset recovery without prompt dispatch or worktree creation.
  - Extend requirements, workflow, and references traceability for req-reset.
  - Add extension-registration coverage for req-reset registration, success, and failure paths.

### 🐛  Bug Fixes
- keep toggle rows open and refresh status [useReq] *(settings-menu)*
  - keep inline menu toggles focused without closing menus
  - refresh direct status renders from live context usage
  - show Pushover credential guidance when enablement is locked

### 🚜  Changes
- BREAKING CHANGE: reject busy req commands and finalize active runs [useReq] *(orchestration)*
  - update REQUIREMENTS.md for req-reset and non-idle req-command behavior
  - enforce error-state rejection for req-references and bundled req prompts
  - preserve successful worktree finalization after busy-command rejection
  - extend extension-registration tests and refresh WORKFLOW/REFERENCES docs
- BREAKING CHANGE: specialize direct references workflow [useReq] *(req-references)*
  - remove the bundled req-references prompt template
  - add direct references generation, staging, commit, and clean-repo checks
  - update requirements, workflow, references, and extension tests
- add status-only REFERENCES writer [useReq] *(references)*
  - update requirements for references tool registration and output contract
  - implement the status-only references tool and default enablement
  - add extension tests and refresh workflow plus references docs
- derive req descriptions from markdown headings [useReq] *(prompt-command)*
  - update REQ-004 and TST-080 for heading-based descriptions
  - remove YAML description extraction from bundled prompts
  - refresh workflow and references traceability
- BREAKING CHANGE: rename references tools to summarize [useReq] *(tool-runner)*
  - Update REQUIREMENTS, WORKFLOW, and REFERENCES for files-summarize and summarize.
  - Rename CLI flags, tool registrations, startup-tool defaults, and debug harness examples.
  - Refresh oracle, parity, registration, and archived fixture tests.
- align low context gauge colors with status field [useReq] *(extension-status)*
  - update REQ-126, TST-035, and TST-096 for low-band context gauge color\n- render context icons below 90% with the status warning token\n- refresh workflow, references, and status-bar tests for traceability
- BREAKING CHANGE: stash dirty base-path around merge [useReq] *(prompt-command-runtime)*
  - update requirements, workflow, and references
  - add stash-assisted merge warning coverage
- decouple runtime sound from boot config [useReq] *(notifications)*
  - update sound requirements and runtime docs
  - keep hotkey sound changes runtime-only
  - keep menu edits persisted as boot value only
  - refresh references and extension tests

## [0.11.0](https://github.com/Ogekuri/PI-useReq/compare/v0.10.0..v0.11.0) - 2026-04-24
### 🚜  Changes
- BREAKING CHANGE: revise status bar branch gauge and debug defaults [useReq] *(extension-status)*
  - update requirements for branch field, context thresholds, and debug log defaults
  - remove Reset defaults right-side values across menus
  - align source, tests, workflow, and references with the breaking change
- preserve worktree transcript on session restore [useReq] *(prompt-command-runtime)*
  - Update REQ-208 to require client-visible transcript preservation after closure.
  - Copy execution-session JSONL entries into the restored base session before merge and cleanup.
  - Refresh workflow and references docs for the new prompt-finalization path.
- remove current-path from status footer [useReq] *(status-bar)*
  - Trace: useReq-20260424-1530
  - update requirements, workflow, and references
  - stop rendering current-path in extension status output
  - align harness and registration status tests

## [0.10.0](https://github.com/Ogekuri/PI-useReq/compare/v0.7.0..v0.10.0) - 2026-04-24
### ⛰️  Features
- Add source code from a extranal branch.

## [0.7.0](https://github.com/Ogekuri/PI-useReq/compare/v0.6.0..v0.7.0) - 2026-04-20
### ⛰️  Features
- Add src/resources/images/ files.

### 🐛  Bug Fixes
- defer js-tiktoken loading for token tools [useReq] *(extension)*
  - lazy-load js-tiktoken inside token counting instead of at extension import time
  - return structured token-tool failures when the dependency is unavailable
  - add coverage for deferred loading and dependency error handling

### 🚜  Changes
- BREAKING CHANGE: rename menus and notify defaults [useReq] *(config-menu)*
  - update requirements for tilde config-path display and guided static-check menus
  - remove legacy startup-tool status and static-check raw-spec/reference actions
  - add %%RESULT%% defaults for notify and Pushover templates with tests/docs refresh
- BREAKING CHANGE: move event toggles into shared submenus [useReq] *(notifications)*
  - update requirements for completed/interrupted/failed event contracts
  - replace direct notification toggles with shared event submenus
  - rename persisted notification keys and refresh extension docs/tests
- BREAKING CHANGE: remove terminal bell notification support [useReq] *(core)*
  - update requirements and workflow docs for the breaking removal
  - delete terminal bell config and runtime handling
  - refresh notification UI tests and references
- BREAKING CHANGE: replace status context bar and notification menus [useReq] *(config-ui)*
  - update requirements for breaking status and configuration UI behavior
  - switch context footer rendering to icon-based thresholds
  - remove notify, beep, and pushover footer fields
  - flatten Pushover settings into Notifications and add scoped submenu resets
  - preserve menu focus after toggles and edits
  - update configuration UI tests and debug harness assertions
- BREAKING CHANGE: unify notify beep sound and pushover [useReq] *(pi-notify)*
  - update SRS for breaking notification model changes
  - replace legacy terminal notification implementations with PI_NOTIFY_CMD and terminal bell routing
  - add global and per-event toggles for notify, beep, sound, and pushover
  - update status bar, configuration menus, workflow, references, and tests

## [0.6.0](https://github.com/Ogekuri/PI-useReq/compare/v0.5.0..v0.6.0) - 2026-04-20
### 🚜  Changes
- BREAKING CHANGE: optimize tool response payloads [useReq] *(core)*
  - Update requirements for token-minimized tool responses.
  - Move static response facts into tool registration metadata.
  - Reduce runtime payload sections and remove repeated request echoes.
  - Update workflow, references, and targeted tool-contract tests.

## [0.5.0](https://github.com/Ogekuri/PI-useReq/compare/v0.4.0..v0.5.0) - 2026-04-19
### ⛰️  Features
- add pushover completion notifications [useReq] *(notify)*
  - Add Pushover configuration, status-bar, and successful prompt delivery.
  - Update requirements, workflow, references, and extension tests for REQ-163..172.

### 🐛  Bug Fixes
- Fix ignore file.
- Fix move req in pi-usereq/docs dir.
- Fix move req in pi-usereq/docs dir.

### 🚜  Changes
- BREAKING CHANGE: revise elapsed footer and config menu path [useReq] *(status-bar)*
  - update requirements for footer, context bar, and show-config ordering
  - implement elapsed/footer rendering and config-path menu display
  - refresh workflow/references docs and extension registration tests
- BREAKING CHANGE: remove Pylance and Ruff modules [useReq] *(static-check)*
  - update requirements, workflow, and references
  - simplify static-check menus to Command only
  - keep Dummy debug-only and remove obsolete fixtures
- BREAKING CHANGE: simplify status bar timing and defaults [useReq] *(extension-status)*
  - update requirements for the breaking status-bar contract
  - remove git and tools fields and switch base to absolute path
  - consolidate timing into et with active, last, and total segments
  - enable all beep flags by default and refresh docs plus tests

### ◀️  Revert
- Roll back branch to bb44b543 (bb44b543846f3d73abc82f852784ec3c4a503d54).

## [0.4.0](https://github.com/Ogekuri/PI-useReq/compare/v0.3.0..v0.4.0) - 2026-04-19
### 🚜  Changes
- add npm provenance metadata and release checks [useReq] *(package)*
  - add canonical repository, bugs, and homepage metadata for npm provenance
  - update SRS with REQ-157, REQ-158, and TST-044
  - align release workflow Node setup action with release test expectations
  - extend release-workflow tests for package provenance metadata

## [0.3.0](https://github.com/Ogekuri/PI-useReq/compare/v0.2.0..v0.3.0) - 2026-04-19
### 🐛  Bug Fixes
- Fix .github/workflows/release-npm.yml file.

### 🚜  Changes
- BREAKING CHANGE: align extension theme tokens with cli themes [useReq] *(settings-menu)*
  - update requirements for CLI-theme token semantics
  - switch status overflow overlay from legacy redBright to error
  - reuse shared settings-list theming with offline fallback
  - extend menu and status tests for theme-token contracts

## [0.2.0](https://github.com/Ogekuri/PI-useReq/compare/v0.1.0..v0.2.0) - 2026-04-19
### ⛰️  Features
- Add release-npm.yml file.
- add configurable prompt beep and sound hooks [useReq] *(notify)*
  - extend SRS with pi-notify beep and sound requirements
  - add pi-notify config, status, and agent_end handlers
  - add configurable shortcut, menu controls, and sound commands
  - update extension and debug harness tests for new status fields

### 🐛  Bug Fixes
- Fix .github/workflows/release-npm.yml file.

### 🚜  Changes
- publish pi-usereq in release workflow [useReq] *(release-npm)*
  - update REQ-138 REQ-141 and add REQ-155/TST-042
  - keep existing tag trigger and changelog release flow intact
  - add npm setup and publish steps plus workflow assertions
- BREAKING CHANGE: derive runtime paths and restyle config menus [useReq] *(pi-usereq)*
  - Update requirements for runtime-only base/git paths.
  - Adopt shared settings-style menus with show-config submenu.
  - Switch notify defaults to %%INSTALLATION_PATH%% and alt+s.
  - Add status-bar git/base fields and CLEAR/FULL overlays.
  - Refresh references and workflow documentation.
- wire npm publish workflow and requirements [useReq] *(release-npm)*
  - update REQUIREMENTS.md with release workflow requirements and evidence
  - implement tag-gated npm publication and GitHub Release automation
  - add workflow-focused verification test and runtime model updates

## [0.1.0](https://github.com/Ogekuri/PI-useReq/releases/tag/v0.1.0) - 2026-04-19
### ⛰️  Features
- Add src/resources/sounds/ files.
- add hook-driven status telemetry [useReq] *(extension-status)*
  - extend requirements for lifecycle hook interception and status fields
  - add shared extension status controller for context, elapsed, and last
  - update offline replay and registration tests for the new status contract
- enforce pi.dev manifest API contract guidance [useReq] *(prompts)*
  - Add DES-009, REQ-108, and TST-030.
  - Require rendered pi.dev conformance blocks to treat the manifest as the authoritative API contract.
  - Extend prompt-rendering verification and refresh workflow/reference docs.
  - Trace-ID: REQ-108-20260418
- Update prompts.
- add req-debug wrapper and requirement traceability [useReq] *(debug-harness)*
  - extend REQUIREMENTS.md with wrapper requirements for debug harness access
  - add scripts/req-debug.sh for inspect, session, prompt, tool, sdk, and raw flows
  - refresh WORKFLOW.md and REFERENCES.md for the new bash execution surface
- add offline harness and sdk smoke [useReq] *(debug-extension)*
  - extend REQUIREMENTS.md for standalone extension debugging and parity validation
  - add scripts/debug-extension.ts with recording, replay, and sdk-smoke modules
  - add harness-focused tests and refresh WORKFLOW.md/REFERENCES.md
- archive expected CLI outputs [useReq] *(tests)*
  - add archive-backed CLI output scenarios and verification tests
  - commit expected results under tests/fixtures_attended_results
  - extend requirements for normalized expected-result archives
  - align invalid enable-static-check error text with archived output
- add command option parity coverage [useReq] *(cli)*
  - add CLI static-check enablement merge and validation support
  - route verbose command options through standalone dispatch
  - fix clean-repository git-check validation behavior
  - add TypeScript parity regressions and supporting test helpers
  - update requirements, workflow, references, tsconfig, and eslint config
- Fix source code doxygen documentation.
- Update manifest.
- add pi.dev manifest conformance guidance [useReq] *(prompts)*
  - add REQ-032..REQ-034 and TST-011 for pi.dev-aware prompts
  - inject manifest-gated conformance rules during prompt rendering
  - cover manifest present and absent prompt-rendering cases
- Initial commit.

### 🐛  Bug Fixes
- route reset-context prompts via session_start [useReq] *(prompt)*
  - queue reset-context prompt payloads in new-session setup instead of using the stale runtime
  - consume queued prompt payloads from the replacement session_start handler exactly once
  - add a runtime-replacement reproducer test and refresh workflow/reference docs
- start reset-context sessions with user delivery [useReq] *(prompt)*
  - send req-* prompt content after ctx.newSession() so the new session starts a turn
  - replace the reset-context reproducer to assert post-reset user delivery
  - refresh workflow and references docs for the shared prompt-delivery path
- append reset prompt during session setup [useReq] *(prompt-delivery)*
  - route reset-context prompt delivery through ctx.newSession setup
  - add req-workflow regression coverage for reset-session prompt startup
  - refresh workflow and references docs for the updated runtime path
- deliver reset prompts via sendUserMessage [useReq] *(prompt-commands)*
  - restore post-reset prompt delivery through pi.sendUserMessage
  - add req-create regression coverage for reset-context=true
  - refresh WORKFLOW and REFERENCES for the updated call path
- inject reset prompt during new session setup [useReq] *(index)*
  - move reset-context prompt delivery into ctx.newSession setup
  - update prompt command regression coverage
  - refresh workflow and references documentation
- send prompt after reset-session creation [useReq] *(prompt-command)*
  - Add a targeted reproducer for reset-context prompt delivery.
  - Deliver req-* prompts by creating the new session first.
  - Send the rendered prompt through pi.sendUserMessage after reset.
  - Update WORKFLOW and REFERENCES for the changed call trace.
- Fix version number to 0.0.0.

### 🚜  Changes
- add context bar overlay thresholds [useReq] *(extension-status)*
  - REQ-127/REQ-128 add claer and full! overlay states.
  - TST-035/TST-036 verify empty and above-90-percent context cases.
  - Update workflow and references for the new status rendering path.
- BREAKING CHANGE: remove context-reset prompt flow and status field [useReq] *(index)*
  - Update SRS for branchless current-session prompt delivery.
  - Remove reset-context config, menu entries, status output, and replacement-session flow.
  - Align offline recording and extension-registration tests with the breaking change.
- compact pi-usereq status summary [useReq] *(status-bar)*
  - REQ-009/109/110/111: switch to single-line status output
  - Record active-tool count and compact context mode
  - Align offline replay with reset-context prompt capture
- render colored multiline config status [useReq] *(status-bar)*
  - update REQUIREMENTS.md for multi-line colored status-bar fields\n- implement explicit docs/tests/src, tools, and reset-context rendering\n- refresh workflow/references docs and extend status replay tests
- BREAKING CHANGE: rename wrapper and disable find by default [useReq] *(debug-harness)*
  - Update REQUIREMENTS, WORKFLOW, and REFERENCES.
  - Switch debug wrapper path to scripts/pi-usereq-debug.sh.
  - Disable custom find in default startup-tool configuration.
  - Refresh debug manual examples to pi-usereq/docs paths.
  - Adjust targeted tests for wrapper rename and default tool state.
- default docs-dir to pi-usereq/docs [useReq] *(config)*
  - update CTN-001 for the new default docs directory
  - switch DEFAULT_DOCS_DIR to pi-usereq/docs
  - align fixture and registration tests with the new default
  - regenerate REFERENCES.md for updated symbol locations
- derive runtime paths from installation context [useReq] *(core)*
  - update SRS for installation-path and execution-path derivation
  - persist config under .pi-usereq and copy that directory into worktrees
  - resolve prompt resources from installation-owned resources tree
  - expose runtime path facts in structured tool payloads
  - refresh workflow and references docs for the new path context
- remove unused bundled model metadata [useReq] *(resources)*
  - update PRJ-005 and repository evidence for bundled resources
  - delete unused models and vscode settings resource files
  - keep runtime behavior limited to prompt, template, and guideline provisioning
- rename bundled templates path [useReq] *(resources)*
  - rename src/resources/docs to src/resources/templates
  - replace %%TEMPLATE_PATH%% during prompt rendering
  - update requirements, workflow, references, and prompt tests
- structure tool json outputs and registrations [useReq] *(tools)*
  - update general requirements for JSON-first agent-tool payloads and registrations
  - implement structured utility-tool payload builders and registration metadata
  - extend tests for compression and utility-tool payload and inspection coverage
- BREAKING CHANGE: refactor find tool payloads for agents [useReq] *(find)*
  - update requirements for agent-oriented files-find/find payloads
  - implement structured find payload builders and tool descriptions
  - add focused registration and debug-harness tests
- refactor compression tool payloads for LLM JSON [useReq] *(compress)*
  - update requirements, workflow, and references for the structured compression contract
  - add structured compression payload generation with line, symbol, and Doxygen metadata
  - keep CLI markdown compression output while tool responses and debug examples use JSON
- emit agent-oriented JSON for reference tools [useReq] *(references)*
  - update requirements, workflow, and references docs for structured reference payloads
  - add structured Doxygen and symbol JSON extraction for files-references and references
  - refresh targeted tests and archived reference fixtures
- optimize token tool JSON payloads for agents [useReq] *(token-counter)*
  - update requirements for agent-optimized files-tokens and tokens payloads
  - restructure token payloads with direct-access metrics and guidance sections
  - enrich tool registration metadata and add targeted extension tests
- refactor token tool JSON for agent parsing [useReq] *(token-tools)*
  - REQ-010 REQ-017 REQ-069 REQ-072
  - Refactor files-tokens and tokens agent-tool payloads into structured JSON.
  - Add numeric summaries, canonical path fields, and guidance ordering.
  - Update tool registration metadata, debug examples, and runtime docs.
- add reset-context pre-reset for req commands [useReq] *(prompt-commands)*
  - update requirements, workflow, and references for reset-context
  - add persisted reset-context config with default true and UI toggle
  - route req-* commands through /new-equivalent session setup when enabled
  - extend offline replay and tests for reset and current-session flows
- support tool --args param conversion [useReq] *(req-debug)*
  - add REQ-065 and TST-021 for req-debug tool arg normalization
  - convert wrapper tool --args text into debug-harness --params JSON
  - add wrapper integration coverage and refresh workflow/references docs
- configure active tools for embedded pi builtins [useReq] *(index)*
  - update REQUIREMENTS.md for configurable embedded active tools
  - enable config defaults for read bash edit write and disable grep ls
  - extend runtime and harness inventories with supported builtin tools
  - cover menu and session_start behavior with targeted tests
- remove tool slash command wrappers [useReq] *(index)*
  - update REQUIREMENTS.md for tool-only extension exposure\n- remove custom slash command registration for tool wrappers\n- keep agent tool registration and CLI static-check driver behavior\n- refresh workflow, references, and registration tests

### 📚  Documentation
- Update README.md file.
- add runtime workflow model [useReq] *(core)*
  - create req/docs/WORKFLOW.md from src runtime analysis
  - document execution units, call traces, and communication edges
- add source reference index [useReq] *(core)*
  - generate req/docs/REFERENCES.md from repository source
  - capture modules, symbols, and imports for agent navigation
- Add pi.dev api documentation.


# History

- \[0.1.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.1.0
- \[0.2.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.2.0
- \[0.3.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.3.0
- \[0.4.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.4.0
- \[0.5.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.5.0
- \[0.6.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.6.0
- \[0.7.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.7.0
- \[0.10.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.10.0
- \[0.11.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.11.0
- \[0.12.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.12.0
- \[0.13.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.13.0
- \[0.14.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.14.0
- \[0.15.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.15.0
- \[0.16.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.16.0
- \[0.17.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.17.0
- \[0.18.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.18.0
- \[0.19.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.19.0
- \[0.20.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.20.0
- \[0.21.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.21.0
- \[0.22.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.22.0
- \[0.23.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.23.0
- \[0.24.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.24.0
- \[0.25.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.25.0
- \[0.26.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.26.0
- \[0.27.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.27.0
- \[0.28.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.28.0
- \[0.29.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.29.0
- \[0.30.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.30.0
- \[0.31.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.31.0
- \[0.32.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.32.0
- \[0.33.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.33.0
- \[0.34.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.34.0
- \[0.35.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.35.0
- \[0.36.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.36.0
- \[0.37.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.37.0
- \[0.38.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.38.0
- \[0.39.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.39.0
- \[0.40.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.40.0
- \[0.41.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.41.0
- \[0.42.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.42.0
- \[0.43.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.43.0
- \[0.44.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.44.0
- \[0.45.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.45.0
- \[0.46.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.46.0
- \[0.47.0\]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.47.0

[0.1.0]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.1.0
[0.2.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.1.0..v0.2.0
[0.3.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.2.0..v0.3.0
[0.4.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.3.0..v0.4.0
[0.5.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.4.0..v0.5.0
[0.6.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.5.0..v0.6.0
[0.7.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.6.0..v0.7.0
[0.10.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.7.0..v0.10.0
[0.11.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.10.0..v0.11.0
[0.12.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.11.0..v0.12.0
[0.13.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.12.0..v0.13.0
[0.14.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.13.0..v0.14.0
[0.15.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.14.0..v0.15.0
[0.16.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.15.0..v0.16.0
[0.17.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.16.0..v0.17.0
[0.18.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.17.0..v0.18.0
[0.19.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.18.0..v0.19.0
[0.20.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.19.0..v0.20.0
[0.21.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.20.0..v0.21.0
[0.22.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.21.0..v0.22.0
[0.23.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.22.0..v0.23.0
[0.24.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.23.0..v0.24.0
[0.25.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.24.0..v0.25.0
[0.26.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.25.0..v0.26.0
[0.27.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.26.0..v0.27.0
[0.28.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.27.0..v0.28.0
[0.29.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.28.0..v0.29.0
[0.30.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.29.0..v0.30.0
[0.31.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.30.0..v0.31.0
[0.32.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.31.0..v0.32.0
[0.33.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.32.0..v0.33.0
[0.34.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.33.0..v0.34.0
[0.35.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.34.0..v0.35.0
[0.36.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.35.0..v0.36.0
[0.37.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.36.0..v0.37.0
[0.38.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.37.0..v0.38.0
[0.39.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.38.0..v0.39.0
[0.40.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.39.0..v0.40.0
[0.41.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.40.0..v0.41.0
[0.42.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.41.0..v0.42.0
[0.43.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.42.0..v0.43.0
[0.44.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.43.0..v0.44.0
[0.45.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.44.0..v0.45.0
[0.46.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.45.0..v0.46.0
[0.47.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.46.0..v0.47.0
