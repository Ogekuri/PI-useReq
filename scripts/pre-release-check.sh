#!/usr/bin/env bash
##
# @file scripts/pre-release-check.sh
# @brief Executes the official pi-usereq pre-release verification gate.
# @details Resolves the repository root from this script's own location and runs the mandatory pre-release stages in fixed order: environment preflight (`git`, `node`, `npm` presence plus the Node.js major-version `>= 24` engine gate), strict TypeScript type-check (`node_modules/.bin/tsc --noEmit`), the full test suite (`npm test`), release packaging into one `TMPDIR` temporary build directory through `npm pack --pack-destination <temporary-directory>`, and validation of that temporary tarball. The gate stops at the first failing stage, prints one status banner per stage, exits `0` only after every stage succeeds, and exits non-zero otherwise. Toolchain provisioning is opt-in: `--install` runs one `npm ci` pass before stage 1 and before the pre-run inventory snapshot, while the default reuses the existing `node_modules` tree, so provisioning never alters the snapshot diff baseline; `--help` prints usage and unknown options exit with code `2`. Artifact validation verifies the temporary `pi-usereq-<version>.tgz` tarball for existence, non-zero size, and the required `package.json`, `LICENSE`, `README.md`, `src/index.ts`, and `scripts/pi-usereq.js` entries. The gate performs no operation on `dist/` and never creates, reads, verifies, or deletes any `dist/` entry, so its behavior is independent from `dist/` content. After the stages finish, the gate removes every repository entry its stages created — build outputs and intermediate files included, `dist/` entries excluded — by diffing the pre-run and post-run `git status --porcelain --untracked-files=normal --ignored` inventories and deletes the temporary build directory with its generated tarball on every exit path, keeping `node_modules`, every `dist/` entry, and every pre-existing or tracked-status entry untouched. Cleanup runs on success, failure, and signal-induced exits while preserving the first failing stage exit code. Runtime is dominated by `npm test`, `npm pack`, and the optional `npm ci`. Side effects include optional `node_modules` replacement, npm lifecycle scripts, child process spawning, temporary build directory creation and removal, and deletion of run-created repository entries.
# @satisfies DES-029, REQ-491, REQ-492, REQ-493, REQ-494, REQ-495, REQ-496, REQ-497, REQ-498, REQ-572, REQ-573, REQ-574, REQ-604, REQ-605, REQ-606, REQ-642, REQ-643
##

set -euo pipefail

##
# @brief Resolves the absolute repository root owning this script.
# @details Normalizes the parent directory of `scripts/pre-release-check.sh` once at startup so every stage executes from the repository root regardless of the caller working directory. Runtime is O(1) in path length. No external state is mutated.
# @return {void} Assigns the module-scoped `REPO_ROOT` variable; prints nothing.
# @satisfies REQ-494
##
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

##
# @brief Holds the `--install` opt-in toolchain-provisioning state.
# @details Defaults to `0`, so the gate reuses the existing `node_modules` tree and never runs `npm ci`; the argument parser sets `1` when `--install` is supplied, arming the provisioning pass that runs before the pre-run inventory snapshot and stage 1.
# @satisfies REQ-642, REQ-643
##
INSTALL_TOOLCHAIN=0

##
# Holds the absolute path of the pre-run repository inventory snapshot file.
# @details Written by `capture_pre_run_inventory(...)` and consumed by `cleanup_generated_artifacts(...)` as the `comm` diff baseline, then removed at exit.
##
PRC_PRE_INVENTORY_FILE=""

##
# Holds the guard flag arming run-created artifact removal.
# @details Stays `0` until the pre-run inventory snapshot succeeds so help, unknown-option, and pre-snapshot failures exit without running any removal pass.
##
PRC_INVENTORY_READY=0

##
# @brief Holds the absolute path of the temporary release build directory.
# @details Created under `TMPDIR` before the packaging stage and removed on every exit path, so the gate generates and validates the release tarball outside the repository and never touches `dist/`.
##
PRC_TEMP_BUILD_DIR=""

##
# @brief Captures one sorted repository artifact inventory snapshot.
# @details Emits one line per visible untracked (`??`) or ignored (`!!`) entry reported by `git status --porcelain --untracked-files=normal --ignored`, with directories collapsed to their root path, then sorts the lines with the C locale so later `comm` differencing stays deterministic. Runtime is O(n) in inventory size. Side effects are limited to read-only git probing.
# @return {string} Sorted inventory lines emitted on stdout.
# @satisfies REQ-495
##
capture_repo_inventory() {
  git status --porcelain --untracked-files=normal --ignored 2>/dev/null | LC_ALL=C sort
}

##
# @brief Captures the pre-run repository artifact inventory snapshot.
# @details Writes the `capture_repo_inventory(...)` output into one temporary file and arms `PRC_INVENTORY_READY` so the `EXIT` trap may remove only entries created after this point. Runtime is O(n) in inventory size. Side effects include one temporary file creation.
# @return {void} No return value; assigns `PRC_PRE_INVENTORY_FILE` and sets `PRC_INVENTORY_READY=1`.
# @satisfies REQ-495
##
capture_pre_run_inventory() {
  PRC_PRE_INVENTORY_FILE="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-pre-release-check.XXXXXX")"
  capture_repo_inventory > "${PRC_PRE_INVENTORY_FILE}"
  PRC_INVENTORY_READY=1
}

##
# @brief Removes the temporary release build directory and its generated tarball.
# @details Deletes the `TMPDIR` temporary build directory created for the packaging stage when it exists, so the gate leaves no tarball, archive listing, or packaging residue outside the repository on successful, failed, and signal-induced exits. Runtime is O(n) in temporary-directory entry count. Side effects include recursive deletion of the temporary directory only.
# @return {void} No return value; always returns `0` so the `EXIT` trap re-exits with the preserved gate exit code.
# @satisfies REQ-604, REQ-606
##
cleanup_temp_build_dir() {
  if [[ -n "${PRC_TEMP_BUILD_DIR}" && -d "${PRC_TEMP_BUILD_DIR}" ]]; then
    rm -rf -- "${PRC_TEMP_BUILD_DIR}"
    printf 'pre-release-check: removed temporary build directory: %s\n' "${PRC_TEMP_BUILD_DIR}"
  fi
  PRC_TEMP_BUILD_DIR=""
  return 0
}

##
# @brief Removes repository artifacts created by the gate stages.
# @details Removes the temporary build directory first, then diffs the post-run `capture_repo_inventory(...)` output against the pre-run snapshot and removes with `rm -rf` every `??` or `!!` entry absent from the snapshot so build outputs and intermediate files created by `npm ci`, `tsc --noEmit`, or `npm test` never survive the gate. Skips `node_modules` and `dist/` entries so the dependency tree stays reusable and no `dist/` entry is ever touched, skips every pre-existing or tracked-status entry, and removes its temporary inventory files. Runtime is O(n) in artifact and inventory diff size. Side effects include deletion of run-created repository entries, temporary-directory removal, and temporary-file removal.
# @param[in] gate_exit_code {number} Exit code observed by the `EXIT` trap.
# @return {void} No return value; always returns `0` so the `EXIT` trap re-exits with the preserved gate exit code.
# @satisfies REQ-496, REQ-497, REQ-498, REQ-574, REQ-605, REQ-606
##
cleanup_generated_artifacts() {
  cleanup_temp_build_dir
  if [[ "${PRC_INVENTORY_READY}" -ne 1 ]]; then
    return 0
  fi
  local post_inventory_file
  post_inventory_file="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-pre-release-check.XXXXXX")" || post_inventory_file=""
  if [[ -n "${post_inventory_file}" ]]; then
    capture_repo_inventory > "${post_inventory_file}" || :
    local entry entry_path
    while IFS= read -r entry || [[ -n "${entry}" ]]; do
      [[ -n "${entry}" ]] || continue
      case "${entry}" in
        '?? '*|'!! '*) entry_path="${entry#?? }" ;;
        *) continue ;;
      esac
      case "${entry_path}" in
        node_modules|node_modules/*) continue ;;
        dist|dist/*) continue ;;
      esac
      if [[ "${entry_path}" == '"'* ]]; then
        entry_path="${entry_path#\"}"
        entry_path="${entry_path%\"}"
      fi
      if [[ -e "${entry_path}" || -L "${entry_path}" ]]; then
        rm -rf -- "${entry_path}"
        printf 'pre-release-check: removed generated artifact: %s\n' "${entry_path}"
      fi
    done < <(comm -13 "${PRC_PRE_INVENTORY_FILE}" "${post_inventory_file}")
    rm -f -- "${post_inventory_file}"
  fi
  rm -f -- "${PRC_PRE_INVENTORY_FILE}"
  PRC_PRE_INVENTORY_FILE=""
  PRC_INVENTORY_READY=0
  return 0
}

##
# @brief Routes every gate exit path through artifact cleanup.
# @details Installs the `EXIT` trap that forwards the observed exit code into `cleanup_generated_artifacts(...)` and re-exits with the same code, plus `INT` and `TERM` traps that convert signal termination into trap-routed exits so interrupted runs still remove their created artifacts. Runtime is O(1). Side effects are limited to trap registration.
# @satisfies REQ-497
##
trap 'prc_gate_exit_code=$?; cleanup_generated_artifacts "${prc_gate_exit_code}" || :; exit "${prc_gate_exit_code}"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

##
# @brief Prints the English usage document for the pre-release gate.
# @details Emits the fixed stage sequence, the supported options, and the exit-code contract to stdout. Runtime is O(1). No external state is mutated.
# @return {void} No return value; usage text goes to stdout.
# @satisfies REQ-493
##
usage() {
  cat <<'USAGE'
Usage: scripts/pre-release-check.sh [--install]

Runs the official pre-release verification gate from the repository root:
  1. Environment preflight: git, node (major >= 24), npm availability
  2. Strict type-check: node_modules/.bin/tsc --noEmit
  3. Full test suite: npm test
  4. Release packaging: npm pack into one TMPDIR temporary build directory
  5. Release artifact validation: temporary pi-usereq-<version>.tgz structure

Options:
  --install       Provision the toolchain with npm ci before stage 1
                  (disabled by default: the existing node_modules tree is reused)
  -h, --help      Print this usage and exit 0

Exits 0 only when every stage succeeds; exits non-zero on the first failure.

Toolchain provisioning runs before the pre-run git status --porcelain
--ignored snapshot, so npm ci never alters the snapshot diff baseline.
Performs no operation on dist/ and never creates, reads, verifies, or
deletes any dist/ entry. Removes repository entries created by this run
(build outputs, intermediate files) before exiting; node_modules and every
dist/ and pre-existing entry are kept. The temporary build directory and
its tarball are removed on every exit path.
USAGE
}

##
# @brief Reports one fatal gate failure and terminates the process.
# @details Prints the supplied diagnostic to stderr prefixed with the canonical gate label and exits with code `1`. Runtime is O(n) in message length. Side effect: terminates the shell process.
# @param[in] message {string} Failure diagnostic emitted to stderr.
# @return {never} Never returns; always exits `1`.
# @satisfies REQ-492
##
die() {
  printf 'pre-release-check: FAIL: %s\n' "$1" >&2
  exit 1
}

##
# @brief Executes one named gate stage with stop-at-first-failure semantics.
# @details Prints a start banner, invokes the stage command, prints an `OK` banner on success, and on failure prints a `FAILED` banner to stderr before exiting `1`, so the gate stops at the first failing stage. Runtime is dominated by the delegated stage command. Side effects are those of the delegated command plus process termination on failure.
# @param[in] stage_name {string} Human-readable stage label used in the status banners.
# @param[in] stage_command {string...} Executable plus arguments invoked as the stage body.
# @return {void} No return value on success; exits `1` on stage failure.
# @satisfies REQ-492
##
run_stage() {
  local stage_name="$1"
  shift
  printf '\n==> %s\n' "${stage_name}"
  if "$@"; then
    printf '==> %s: OK\n' "${stage_name}"
    return 0
  fi
  printf '==> %s: FAILED\n' "${stage_name}" >&2
  exit 1
}

##
# @brief Verifies gate prerequisites and the Node.js engine contract.
# @details Probes `git`, `node`, and `npm` on `PATH`, reads the runtime Node major version, and fails when it is lower than `24`, enforcing the documented `engines.node >= 24.0.0` minimum before any mutation stage runs. Runtime is dominated by one `node` probe. Side effects are limited to child process probing.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when a command is missing or the engine gate fails.
# @satisfies REQ-491, CTN-027
##
check_environment() {
  local command_name
  for command_name in git node npm; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      die "required command not found on PATH: ${command_name}"
    fi
  done
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "${node_major}" -lt 24 ]]; then
    die "Node.js major >= 24 required (engines.node >=24.0.0), detected major: ${node_major}"
  fi
  printf 'node %s detected; Node major %s satisfies engines.node >=24.0.0\n' "$(node --version)" "${node_major}"
}

##
# @brief Provisions the toolchain through `npm ci` when `--install` was supplied.
# @details Honors the opt-in contract: without `--install` it prints one reuse notice and keeps the existing `node_modules` tree, never invoking `npm`; with `--install` it runs one `npm ci` pass from the repository root. Because the caller invokes it before the pre-run inventory snapshot and stage 1, the provisioning churn never appears in the snapshot diff baseline. Runtime is dominated by `npm ci`. Side effects are limited to `node_modules` replacement and npm lifecycle scripts.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when `npm ci` fails.
# @satisfies REQ-491, REQ-642, REQ-643
##
provision_toolchain() {
  if [[ "${INSTALL_TOOLCHAIN}" -ne 1 ]]; then
    printf 'toolchain provisioning disabled (default): reusing existing node_modules tree; pass --install to run npm ci\n'
    return 0
  fi
  npm ci
}

##
# @brief Runs the release packaging stage inside the temporary build directory.
# @details Packs the npm distribution tarball through `npm pack --pack-destination <temporary-directory>` so the release artifact is generated outside the repository without consulting or touching `dist/`. Runtime is dominated by `npm pack`. Side effects include tarball writing inside the temporary build directory only.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when packaging fails.
# @satisfies REQ-491, REQ-604, REQ-605
##
run_release_pack() {
  npm pack --pack-destination "${PRC_TEMP_BUILD_DIR}"
}

##
# @brief Validates the temporary release artifact generated by the packaging stage.
# @details Resolves the package version from the repository manifest, verifies the expected `pi-usereq-<version>.tgz` artifact inside the temporary build directory exists and is non-empty, lists the archive, and requires the `package.json`, `LICENSE`, `README.md`, `src/index.ts`, and `scripts/pi-usereq.js` entries inside the archive so a truncated or structurally invalid tarball fails the gate before cleanup. Never reads or verifies any `dist/` entry. Runtime is dominated by one archive listing. Side effects are limited to filesystem reads inside the temporary build directory.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when the expected artifact is missing, empty, or structurally incomplete.
# @satisfies REQ-491, REQ-572, REQ-573, REQ-605
##
validate_release_artifacts() {
  local version expected listing entry
  version="$(node -p 'require("./package.json").version')"
  expected="${PRC_TEMP_BUILD_DIR}/pi-usereq-${version}.tgz"
  if [[ ! -f "${expected}" ]]; then
    die "expected release artifact missing after build: ${expected}"
  fi
  if [[ ! -s "${expected}" ]]; then
    die "release artifact is empty: ${expected}"
  fi
  listing="$(tar -tzf "${expected}")"
  for entry in package/package.json package/LICENSE package/README.md package/src/index.ts package/scripts/pi-usereq.js; do
    if ! printf '%s\n' "${listing}" | grep -Fxq -- "${entry}"; then
      die "release artifact ${expected} is missing required entry: ${entry}"
    fi
  done
  printf 'validated release artifact: %s (%s bytes)\n' "${expected}" "$(wc -c < "${expected}" | tr -d '[:space:]')"
}

##
# @brief Runs the strict TypeScript type-check stage.
# @details Executes the repository-owned `node_modules/.bin/tsc` binary with `--noEmit`, honoring the documented strict `noEmit` program contract, and fails with a remediation hint when the binary is absent so missing toolchain provisioning is self-explanatory. Runtime is dominated by the TypeScript compiler. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` when the compiler is missing or reports diagnostics.
# @satisfies REQ-491, CTN-006
##
run_type_check() {
  local tsc_bin="${REPO_ROOT}/node_modules/.bin/tsc"
  if [[ ! -x "${tsc_bin}" ]]; then
    die "tsc not executable at ${tsc_bin}; run with --install so npm ci installs devDependencies"
  fi
  "${tsc_bin}" --noEmit
}

##
# @brief Runs the full test-suite stage.
# @details Delegates to `npm test`, the same suite gated by `prepublishOnly`, so the pre-release gate enforces the exact publication test contract. Runtime is dominated by the Node test runner. Side effects are those of the test suite.
# @return {void} No return value on success.
# @retval {never} Exits through `run_stage(...)` with `1` when any test fails.
# @satisfies REQ-491, CTN-029
##
run_test_suite() {
  npm test
}

##
# @brief Parses gate options and executes every stage in the documented order.
# @details Accepts exactly `--install`, `-h`, and `--help`; rejects every other option with the usage document on stderr and exit code `2`; changes the working directory to the resolved repository root, runs the optional `--install` provisioning pass before the pre-run repository inventory snapshot and before stage 1, creates the `TMPDIR` temporary build directory, dispatches the five stages in order, prints the final success summary, and lets the exit trap remove the temporary build directory plus repository entries created by the stages before the process returns the gate exit code. Provisioning precedes the snapshot, so `npm ci` cannot alter the snapshot diff baseline. Never creates, reads, verifies, or deletes any `dist/` entry. Runtime is the aggregate of all stages. Side effects are those of the dispatched stages plus temporary-directory and run-created artifact removal at exit.
# @param[in] arguments {string...} Raw command-line arguments passed to the script.
# @return {void} No return value on success; exits non-zero on any failure.
# @satisfies REQ-491, REQ-492, REQ-493, REQ-494, REQ-495, REQ-496, REQ-497, REQ-498, REQ-572, REQ-573, REQ-574, REQ-604, REQ-605, REQ-606, REQ-642, REQ-643
##
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --install)
        INSTALL_TOOLCHAIN=1
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'pre-release-check: unknown option: %s\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
  cd "${REPO_ROOT}"
  printf 'pi-usereq pre-release check\nrepository root: %s\n' "${REPO_ROOT}"
  run_stage 'toolchain provisioning (npm ci only with --install)' provision_toolchain
  capture_pre_run_inventory
  PRC_TEMP_BUILD_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pi-usereq-pre-release-build.XXXXXX")"
  local provisioning_label
  if [[ "${INSTALL_TOOLCHAIN}" -eq 1 ]]; then
    provisioning_label='npm ci (--install)'
  else
    provisioning_label='disabled (default, reusing node_modules)'
  fi
  printf 'temporary build directory: %s\ntoolchain provisioning: %s\nartifact cleanup: enabled (removes entries created by this run; keeps node_modules and every dist/ entry)\n' "${PRC_TEMP_BUILD_DIR}" "${provisioning_label}"
  run_stage 'stage 1/5: environment preflight (git, node >=24, npm)' check_environment
  run_stage 'stage 2/5: strict type-check (tsc --noEmit)' run_type_check
  run_stage 'stage 3/5: full test suite (npm test)' run_test_suite
  run_stage 'stage 4/5: release packaging (npm pack into the temporary build directory)' run_release_pack
  run_stage 'stage 5/5: release artifact validation (temporary pi-usereq-<version>.tgz)' validate_release_artifacts
  printf '\npre-release check: all stages passed.\n'
}

main "$@"
