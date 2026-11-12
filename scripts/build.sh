#!/usr/bin/env bash
##
# @file scripts/build.sh
# @brief Generates the pi-usereq release distribution artifact into dist/ from a clean previous-build state.
# @details Resolves the repository root from this script's own location and runs the release packaging stages in fixed order: toolchain validation (`git`, `npm`, and Node major `>= 24`), pre-run repository inventory capture, previous-build artifact cleanup (every root-level `dist/*.tgz` tarball of every present version plus the emptied `dist/` directory) followed by removal verification that aborts when any tarball survived, dependency preparation (`npm ci` only when `node_modules` is absent), the strict `node_modules/.bin/tsc --noEmit` compilation gate, npm tarball packing through `npm pack --pack-destination dist`, artifact verification plus one artifact summary, and post-build repository cleanup that removes every temporary or intermediate repository entry created by the run while preserving `node_modules/`, every pre-existing entry, and the verified release tarball. The script stops at the first failing stage, exits non-zero on failure, and never presents a failed build as successful. Cleanup runs through `EXIT`, `INT`, and `TERM` traps so successful, failed, and signal-induced exits all leave the repository free of intermediate artifacts while preserving the first failing stage exit code. Runtime is dominated by `npm ci`, the TypeScript compiler, and `npm pack`. Side effects include previous-build artifact deletion, dependency installation, npm lifecycle scripts, child process spawning, `dist/` tarball replacement, and deletion of run-created intermediate repository entries.
# @satisfies DES-035, DES-036, REQ-564, REQ-565, REQ-566, REQ-567, REQ-568, REQ-569, REQ-570, REQ-571, REQ-597, REQ-598, REQ-599, REQ-600, REQ-601, REQ-606, REQ-607, REQ-608
##

set -Eeuo pipefail

##
# @brief Resolves the absolute repository root owning this script.
# @details Normalizes the parent directory of `scripts/build.sh` once at startup so every stage executes from the repository root regardless of the caller working directory. Runtime is O(1) in path length. No external state is mutated.
# @return {void} Assigns the module-scoped `REPO_ROOT` variable; prints nothing.
# @satisfies REQ-564
##
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

##
# @brief Holds the canonical release artifact destination directory.
# @details Anchored at `<repo-root>/dist`, the canonical destination of release artifacts; created on demand by the packaging stage only.
##
DIST_DIR="${REPO_ROOT}/dist"

##
# @brief Holds the package version resolved from the repository manifest.
# @details Assigned by `pack_release_tarball(...)` from `package.json` before the expected artifact filename is verified.
##
PACKAGE_VERSION=""

##
# @brief Holds the absolute path of the verified release artifact retained after a successful build.
# @details Assigned by `verify_built_artifact(...)` so post-build cleanup can distinguish the final artifact from intermediate generated tarballs.
##
EXPECTED_ARTIFACT=""

##
# @brief Records whether `dist/` existed before the previous-build cleanup.
# @details Defaults to `0`; `main(...)` sets `1` when `dist/` already exists so failure cleanup removes the directory itself only when this run created it.
##
DIST_EXISTED=0

##
# @brief Holds the absolute path of the pre-run repository inventory snapshot file.
# @details Written by `capture_pre_run_inventory(...)` and consumed by `cleanup_build_artifacts(...)` as the `comm` diff baseline, then removed at exit.
##
PRE_INVENTORY_FILE=""

##
# @brief Holds the guard flag arming run-created artifact removal.
# @details Stays `0` until the pre-run inventory snapshot succeeds so help, unknown-option, and pre-snapshot failures exit without running any removal pass.
##
INVENTORY_READY=0

##
# @brief Prints the English usage document for the release packaging script.
# @details Emits the fixed stage sequence and the exit-code contract to stdout. Runtime is O(1). No external state is mutated.
# @return {void} No return value; usage text goes to stdout.
##
usage() {
  cat <<'USAGE'
Usage: scripts/build.sh

Generates the pi-usereq release distribution artifact from a clean state:
  1. Toolchain validation: git, npm, node (major >= 24)
  2. Previous-build cleanup: removes every dist/*.tgz tarball of every
     present version, removes dist/ itself only when emptied, and verifies
     that no tarball survived the removal
  3. Dependency preparation: npm ci (only when node_modules is absent)
  4. Strict compilation gate: node_modules/.bin/tsc --noEmit
  5. Release packaging: npm pack --pack-destination dist
  6. Artifact verification: expected dist/pi-usereq-<version>.tgz exists non-empty
  7. Repository cleanup: removes temporary and intermediate entries created
     by this run while preserving node_modules/, pre-existing entries, and
     the verified release tarball

Exits 0 only after the expected artifact is verified and the repository is
free of intermediate build artifacts; exits non-zero on the first failing
stage. Cleanup also runs on failed and signal-induced exits. Files inside
dist/ other than *.tgz are preserved.
USAGE
}

##
# @brief Reports one fatal build failure and terminates the process.
# @details Prints the supplied diagnostic to stderr prefixed with the canonical build label and exits with code `1`. Runtime is O(n) in message length. Side effect: terminates the shell process.
# @param[in] message {string} Failure diagnostic emitted to stderr.
# @return {never} Never returns; always exits `1`.
# @satisfies REQ-571
##
die() {
  printf 'build: FAIL: %s\n' "$1" >&2
  exit 1
}

##
# @brief Executes one named build stage with stop-at-first-failure semantics.
# @details Prints a start banner, invokes the stage command, prints an `OK` banner on success, and on failure prints a `FAILED` banner to stderr before exiting `1`. Failure detection uses an `ERR` trap installed for the stage duration instead of an `if` condition, because Bash suspends `set -e` for every function body invoked inside an `if` condition, which would let non-final failing commands continue; the trap is inherited by stage functions through `set -E`, so the build stops at the first failing command of any stage. The banner is printed only by the main shell process (`BASHPID` equals `$$`), so command-substitution subshells do not duplicate it. Runtime is dominated by the delegated stage command. Side effects are those of the delegated command plus process termination on failure.
# @param[in] stage_name {string} Human-readable stage label used in the status banners.
# @param[in] stage_command {string...} Executable plus arguments invoked as the stage body.
# @return {void} No return value on success; exits `1` on stage failure.
# @satisfies REQ-571
##
run_build_stage() {
  local stage_name="$1"
  shift
  printf '\n==> %s\n' "${stage_name}"
  trap 'if [[ "${BASHPID}" == "$$" ]]; then printf "==> %s: FAILED\n" "${stage_name}" >&2; fi; exit 1' ERR
  "$@"
  trap - ERR
  printf '==> %s: OK\n' "${stage_name}"
}

##
# @brief Captures one sorted repository artifact inventory snapshot.
# @details Emits one line per visible untracked (`??`) or ignored (`!!`) entry reported by `git status --porcelain --untracked-files=normal --ignored`, with directories collapsed to their root path, then sorts the lines with the C locale so later `comm` differencing stays deterministic. A failing git probe degrades to an empty inventory without aborting the build. Runtime is O(n) in inventory size. Side effects are limited to read-only git probing.
# @return {string} Sorted inventory lines emitted on stdout.
# @satisfies REQ-599
##
capture_repo_inventory() {
  git status --porcelain --untracked-files=normal --ignored 2>/dev/null | LC_ALL=C sort || :
}

##
# @brief Captures the pre-run repository artifact inventory snapshot.
# @details Writes the `capture_repo_inventory(...)` output into one temporary file and arms `INVENTORY_READY` so the `EXIT` trap may remove only entries created after this point. A failed temporary-file allocation leaves cleanup disarmed instead of aborting the build. Runtime is O(n) in inventory size. Side effects include one temporary file creation.
# @return {void} No return value; assigns `PRE_INVENTORY_FILE` and sets `INVENTORY_READY=1` on success.
# @satisfies REQ-599
##
capture_pre_run_inventory() {
  PRE_INVENTORY_FILE="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-build.XXXXXX")" || {
    PRE_INVENTORY_FILE=""
    return 0
  }
  capture_repo_inventory > "${PRE_INVENTORY_FILE}"
  INVENTORY_READY=1
}

##
# @brief Verifies build prerequisites and the Node.js engine contract.
# @details Probes `git`, `npm`, and `node` on `PATH`, reads the runtime Node major version, and fails when it is lower than `24`, enforcing the documented `engines.node >= 24.0.0` minimum before any mutation stage runs. Runtime is dominated by one `node` probe. Side effects are limited to child process probing.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when a command is missing or the engine gate fails.
# @satisfies REQ-565, CTN-027
##
check_build_tools() {
  local command_name
  for command_name in git npm node; do
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
# @brief Removes every previous-build release tarball regardless of version.
# @details Deletes every root-level `dist/*.tgz` file — the generated outputs of all previous builds across every version number — printing one removal line per removed tarball, so every other `dist/` entry, including non-tarball and user-owned files, is preserved. Skips with one notice when the `dist/` directory is absent or holds no tarball. Runtime is O(n) in tarball count. Side effects include deletion of previous-build tarballs.
# @return {void} No return value.
# @satisfies REQ-568, REQ-597, REQ-606, REQ-608
##
clean_previous_dist_tarballs() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    printf 'build: no dist directory present; skipping previous-build tarball removal\n'
    return 0
  fi
  local tarball removed=0
  while IFS= read -r -d '' tarball; do
    rm -f -- "${tarball}"
    removed=1
    printf 'build: removed previous-build artifact: %s\n' "${tarball}"
  done < <(find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0)
  if [[ "${removed}" -eq 0 ]]; then
    printf 'build: no previous-build tarball present\n'
  fi
}

##
# @brief Removes the artifact directory itself only when emptied by previous-build cleanup.
# @details Removes `dist/` through `rmdir` only when the directory exists and contains no remaining entry, so non-tarball entries preserved by the tarball stage keep the directory in place. Prints one removal line when the directory is removed. Runtime is O(n) in remaining entry count. Side effects include conditional directory removal.
# @return {void} No return value.
# @satisfies REQ-598, REQ-597
##
clean_previous_dist_directory() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    return 0
  fi
  if [[ -n "$(find "${DIST_DIR}" -mindepth 1 -print -quit)" ]]; then
    printf 'build: dist directory preserved: non-artifact entries remain\n'
    return 0
  fi
  rmdir -- "${DIST_DIR}"
  printf 'build: removed previous-build artifact: %s\n' "${DIST_DIR}"
}

##
# @brief Removes every previous-build artifact from the release destination.
# @details Composes the version-independent tarball removal, the emptied-directory removal, and the post-removal absence verification into one stage so the build starts from a verified-clean release destination while preserving every non-tarball `dist/` entry. Runtime is O(n) in tarball and remaining-entry count. Side effects include previous-build artifact deletion.
# @return {void} No return value.
# @satisfies REQ-568, REQ-597, REQ-598, REQ-606, REQ-607, REQ-608
##
clean_previous_build_artifacts() {
  clean_previous_dist_tarballs
  clean_previous_dist_directory
  verify_previous_dist_tarballs_removed
}

##
# @brief Verifies that no previous-build tarball survived the cleanup.
# @details Rescans every root-level `dist/*.tgz` file after the previous-build cleanup and aborts through `die(...)` when at least one tarball is still present, so a removal failure can never be presented as a clean build bootstrap. Reports the surviving tarball paths on stderr and prints one verification line on success. Runtime is O(n) in tarball count. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when a tarball survives.
# @satisfies REQ-606, REQ-607, REQ-608
##
verify_previous_dist_tarballs_removed() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    printf 'build: verified absence of previous-build artifacts\n'
    return 0
  fi
  local tarball remaining=0
  while IFS= read -r -d '' tarball; do
    remaining=1
    printf 'build: FAIL: previous-build artifact still present: %s\n' "${tarball}" >&2
  done < <(find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0)
  if [[ "${remaining}" -eq 1 ]]; then
    die "previous-build artifact removal verification failed"
  fi
  printf 'build: verified absence of previous-build artifacts\n'
}

##
# @brief Prepares the release dependency tree.
# @details Reuses the existing `node_modules` tree when present and runs `npm ci` only when the tree is absent, so the standalone build bootstraps a complete lockfile-exact dependency tree while repeated builds avoid reinstalling. Runtime is dominated by `npm ci` when installation runs. Side effects include `node_modules` creation and npm lifecycle scripts.
# @return {void} No return value on success.
# @retval {never} Exits through `run_build_stage(...)` with `1` when `npm ci` fails.
# @satisfies REQ-566
##
ensure_dependencies() {
  if [[ -d "${REPO_ROOT}/node_modules" ]]; then
    printf 'node_modules present: reusing existing dependency tree\n'
    return 0
  fi
  npm ci
}

##
# @brief Runs the strict TypeScript compilation gate.
# @details Executes the repository-owned `node_modules/.bin/tsc` binary with `--noEmit`, honoring the documented strict `noEmit` program contract, and fails with a remediation hint when the binary is absent so partial installs are self-explanatory. Runtime is dominated by the TypeScript compiler. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` when the compiler is missing or reports diagnostics.
# @satisfies REQ-567, CTN-006
##
run_compile_gate() {
  local tsc_bin="${REPO_ROOT}/node_modules/.bin/tsc"
  if [[ ! -x "${tsc_bin}" ]]; then
    die "tsc not executable at ${tsc_bin}; remove node_modules so npm ci installs devDependencies"
  fi
  "${tsc_bin}" --noEmit
}

##
# @brief Packs the npm release tarball into dist/.
# @details Resolves the package version from the repository manifest, creates the `dist/` destination on demand, and runs `npm pack --pack-destination dist` so the packed tarball is the exact npm distribution artifact governed by the manifest `files` allowlist. Runtime is dominated by `npm pack`. Side effects include `dist/` creation and tarball writing.
# @return {void} No return value on success.
# @retval {never} Exits through `run_build_stage(...)` with `1` when packing fails.
# @satisfies REQ-569
##
pack_release_tarball() {
  PACKAGE_VERSION="$(node -p 'require("./package.json").version')"
  mkdir -p -- "${DIST_DIR}"
  npm pack --pack-destination "${DIST_DIR}"
}

##
# @brief Verifies the produced release artifact and prints the artifact summary.
# @details Checks that the expected `dist/pi-usereq-<version>.tgz` artifact exists and is non-empty, then prints one artifact summary with name and size so a failed or missing build can never be presented as successful. Records the verified artifact path for post-build cleanup. Runtime is O(1) plus filesystem metadata probing. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when the expected artifact is missing or empty.
# @satisfies REQ-570, REQ-571, REQ-600
##
verify_built_artifact() {
  EXPECTED_ARTIFACT="${DIST_DIR}/pi-usereq-${PACKAGE_VERSION}.tgz"
  if [[ ! -f "${EXPECTED_ARTIFACT}" ]]; then
    die "expected release artifact missing after packaging: ${EXPECTED_ARTIFACT}"
  fi
  if [[ ! -s "${EXPECTED_ARTIFACT}" ]]; then
    die "release artifact is empty: ${EXPECTED_ARTIFACT}"
  fi
  local size
  size="$(wc -c < "${EXPECTED_ARTIFACT}")"
  size="$(printf '%s' "${size}" | tr -d '[:space:]')"
  printf '\nbuild: artifact summary\n  name: pi-usereq-%s.tgz\n  path: %s\n  size: %s bytes\n' "${PACKAGE_VERSION}" "${EXPECTED_ARTIFACT}" "${size}"
}

##
# @brief Removes run-generated release tarballs that are not the verified artifact.
# @details On successful runs every root-level `dist/*.tgz` file except the verified `dist/pi-usereq-<version>.tgz` artifact is removed so only the final release artifact survives. On failed or signal-induced runs the `dist/` directory is removed whole when this run created it, and otherwise every generated tarball is removed while non-tarball entries stay untouched, so no intermediate release artifact survives a failed build. Runtime is O(n) in tarball count. Side effects include conditional tarball and directory removal.
# @param[in] success {number} `1` when the build completed successfully; `0` otherwise.
# @return {void} No return value.
# @satisfies REQ-599, REQ-600
##
cleanup_dist_artifacts() {
  local success="${1:-0}"
  if [[ ! -d "${DIST_DIR}" ]]; then
    return 0
  fi
  if [[ "${success}" -eq 1 ]]; then
    local tarball
    while IFS= read -r -d '' tarball; do
      if [[ "${tarball}" != "${EXPECTED_ARTIFACT}" ]]; then
        rm -f -- "${tarball}"
        printf 'build: removed intermediate artifact: %s\n' "${tarball}"
      fi
    done < <(find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0)
    return 0
  fi
  if [[ "${DIST_EXISTED}" -eq 0 ]]; then
    rm -rf -- "${DIST_DIR}"
    printf 'build: removed intermediate artifact: %s\n' "${DIST_DIR}"
    return 0
  fi
  local tarball
  while IFS= read -r -d '' tarball; do
    rm -f -- "${tarball}"
    printf 'build: removed intermediate artifact: %s\n' "${tarball}"
  done < <(find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0)
}

##
# @brief Removes repository artifacts created by the build run.
# @details Applies the `dist/` policy of `cleanup_dist_artifacts(...)` first, then diffs the post-run `capture_repo_inventory(...)` output against the pre-run snapshot and removes with `rm -rf` every `??` or `!!` entry absent from the snapshot so temporary files and intermediate artifacts created by `npm ci`, `tsc --noEmit`, `npm pack`, or any packaging helper never survive the build. Skips `node_modules` and `dist/` entries so the dependency tree stays reusable and the verified release artifact stays tracked, skips every pre-existing or tracked-status entry, and removes its temporary inventory files. Runtime is O(n) in artifact and inventory diff size. Side effects include deletion of run-created repository entries and temporary-file removal.
# @param[in] build_exit_code {number} Exit code observed by the `EXIT` trap forwarded to `cleanup_dist_artifacts(...)`.
# @return {void} No return value; always returns `0` so the `EXIT` trap re-exits with the preserved build exit code.
# @satisfies REQ-599, REQ-600, REQ-601
##
cleanup_build_artifacts() {
  local build_exit_code="${1:-1}"
  local success=0
  if [[ "${build_exit_code}" -eq 0 ]]; then
    success=1
  fi
  cleanup_dist_artifacts "${success}"
  if [[ "${INVENTORY_READY}" -ne 1 ]]; then
    return 0
  fi
  local post_inventory_file=""
  post_inventory_file="$(mktemp "${TMPDIR:-/tmp}/pi-usereq-build.XXXXXX")" || post_inventory_file=""
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
        printf 'build: removed intermediate artifact: %s\n' "${entry_path}"
      fi
    done < <(comm -13 "${PRE_INVENTORY_FILE}" "${post_inventory_file}")
    rm -f -- "${post_inventory_file}"
  fi
  rm -f -- "${PRE_INVENTORY_FILE}"
  PRE_INVENTORY_FILE=""
  INVENTORY_READY=0
  return 0
}

##
# @brief Routes every build exit path through artifact cleanup.
# @details Installs the `EXIT` trap that forwards the observed exit code into `cleanup_build_artifacts(...)` and re-exits with the same code, plus `INT` and `TERM` traps that convert signal termination into trap-routed exits so interrupted builds still remove their created artifacts. Runtime is O(1). Side effects are limited to trap registration.
# @satisfies REQ-601
##
trap 'build_cleanup_exit_code=$?; cleanup_build_artifacts "${build_cleanup_exit_code}" || :; exit "${build_cleanup_exit_code}"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

##
# @brief Parses build options and executes every stage in the documented order.
# @details Accepts exactly `-h` and `--help`; rejects every other option with the usage document on stderr and exit code `2`; changes the working directory to the resolved repository root, captures the pre-run repository inventory plus the pre-build `dist/` existence state, dispatches the seven stages in order, and lets the final artifact summary report success. The `EXIT` trap removes run-created intermediate artifacts on every exit path. Runtime is the aggregate of all stages. Side effects are those of the dispatched stages plus run-created artifact removal at exit.
# @param[in] arguments {string...} Raw command-line arguments passed to the script.
# @return {void} No return value on success; exits non-zero on any failure.
# @satisfies REQ-564, REQ-565, REQ-566, REQ-567, REQ-568, REQ-569, REQ-570, REQ-571, REQ-597, REQ-598, REQ-599, REQ-600, REQ-601, REQ-607
##
main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help)
        usage
        exit 0
        ;;
      *)
        printf 'build: unknown option: %s\n' "$1" >&2
        usage >&2
        exit 2
        ;;
    esac
    shift
  done
  cd "${REPO_ROOT}"
  printf 'pi-usereq release build\nrepository root: %s\nartifact destination: %s\n' "${REPO_ROOT}" "${DIST_DIR}"
  run_build_stage 'stage 1/7: toolchain validation (git, npm, node >= 24)' check_build_tools
  capture_pre_run_inventory
  if [[ -d "${DIST_DIR}" ]]; then
    DIST_EXISTED=1
  fi
  run_build_stage 'stage 2/7: previous-build cleanup (dist/*.tgz of every version)' clean_previous_build_artifacts
  run_build_stage 'stage 3/7: dependency preparation (npm ci when node_modules absent)' ensure_dependencies
  run_build_stage 'stage 4/7: strict compilation gate (tsc --noEmit)' run_compile_gate
  run_build_stage 'stage 5/7: release packaging (npm pack --pack-destination dist)' pack_release_tarball
  run_build_stage 'stage 6/7: artifact verification' verify_built_artifact
  run_build_stage 'stage 7/7: repository cleanup (temporary and intermediate artifacts)' cleanup_build_artifacts 0
  printf '\nbuild: all stages passed.\n'
}

main "$@"
