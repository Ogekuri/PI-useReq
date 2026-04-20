# Changelog

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

[0.1.0]: https://github.com/Ogekuri/PI-useReq/releases/tag/v0.1.0
[0.2.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.1.0..v0.2.0
[0.3.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.2.0..v0.3.0
[0.4.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.3.0..v0.4.0
[0.5.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.4.0..v0.5.0
[0.6.0]: https://github.com/Ogekuri/PI-useReq/compare/v0.5.0..v0.6.0
