#!/usr/bin/env bash
##
# @file scripts/build.sh
# @brief Generates the pi-usereq release distribution artifact into dist/.
# @details Resolves the repository root from this script's own location and runs the release packaging stages in fixed order: toolchain validation (`git`, `npm`, and Node major `>= 24`), dependency preparation (`npm ci` only when `node_modules` is absent), the strict `node_modules/.bin/tsc --noEmit` compilation gate, stale generated `dist/*.tgz` pruning, npm tarball packing through `npm pack --pack-destination dist`, and artifact verification plus one artifact summary. The script stops at the first failing stage, exits non-zero on failure, and never presents a failed build as successful. Stale tarball pruning removes only root-level `dist/*.tgz` files so every other `dist/` entry survives. Runtime is dominated by `npm ci`, the TypeScript compiler, and `npm pack`. Side effects include dependency installation, npm lifecycle scripts, child process spawning, and `dist/` tarball replacement.
# @satisfies DES-035, REQ-564, REQ-565, REQ-566, REQ-567, REQ-568, REQ-569, REQ-570, REQ-571
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
# @brief Prints the English usage document for the release packaging script.
# @details Emits the fixed stage sequence and the exit-code contract to stdout. Runtime is O(1). No external state is mutated.
# @return {void} No return value; usage text goes to stdout.
##
usage() {
  cat <<'USAGE'
Usage: scripts/build.sh

Generates the pi-usereq release distribution artifact from the repository root:
  1. Toolchain validation: git, npm, node (major >= 24)
  2. Dependency preparation: npm ci (only when node_modules is absent)
  3. Strict compilation gate: node_modules/.bin/tsc --noEmit
  4. Stale artifact pruning: removes dist/*.tgz only
  5. Release packaging: npm pack --pack-destination dist
  6. Artifact verification: expected dist/pi-usereq-<version>.tgz exists non-empty

Exits 0 only after the expected artifact is verified; exits non-zero on the
first failing stage. Files inside dist/ other than *.tgz are preserved.
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
# @brief Removes stale generated release tarballs from dist/.
# @details Deletes only root-level `dist/*.tgz` files — the generated outputs of previous builds — so every other `dist/` entry, including versioned or user-owned files, is preserved. Runtime is O(n) in tarball count. Side effects include deletion of generated tarballs.
# @return {void} No return value.
# @satisfies REQ-568
##
prune_stale_dist_tarballs() {
  if [[ ! -d "${DIST_DIR}" ]]; then
    return 0
  fi
  find "${DIST_DIR}" -maxdepth 1 -type f -name '*.tgz' -print0 | while IFS= read -r -d '' tarball; do
    rm -f -- "${tarball}"
    printf 'build: removed stale artifact: %s\n' "${tarball}"
  done
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
# @details Checks that the expected `dist/pi-usereq-<version>.tgz` artifact exists and is non-empty, then prints one artifact summary with name and size so a failed or missing build can never be presented as successful. Runtime is O(1) plus filesystem metadata probing. Side effects are limited to filesystem reads.
# @return {void} No return value on success.
# @retval {never} Exits `1` through `die(...)` when the expected artifact is missing or empty.
# @satisfies REQ-570, REQ-571
##
verify_built_artifact() {
  local expected="${DIST_DIR}/pi-usereq-${PACKAGE_VERSION}.tgz"
  if [[ ! -f "${expected}" ]]; then
    die "expected release artifact missing after packaging: ${expected}"
  fi
  if [[ ! -s "${expected}" ]]; then
    die "release artifact is empty: ${expected}"
  fi
  local size
  size="$(wc -c < "${expected}")"
  size="$(printf '%s' "${size}" | tr -d '[:space:]')"
  printf '\nbuild: artifact summary\n  name: pi-usereq-%s.tgz\n  path: %s\n  size: %s bytes\n' "${PACKAGE_VERSION}" "${expected}" "${size}"
}

##
# @brief Parses build options and executes every stage in the documented order.
# @details Accepts exactly `-h` and `--help`; rejects every other option with the usage document on stderr and exit code `2`; changes the working directory to the resolved repository root, dispatches the six stages in order, and lets the final artifact summary report success. Runtime is the aggregate of all stages. Side effects are those of the dispatched stages.
# @param[in] arguments {string...} Raw command-line arguments passed to the script.
# @return {void} No return value on success; exits non-zero on any failure.
# @satisfies REQ-564, REQ-565, REQ-566, REQ-567, REQ-568, REQ-569, REQ-570, REQ-571
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
  run_build_stage 'stage 1/6: toolchain validation (git, npm, node >= 24)' check_build_tools
  run_build_stage 'stage 2/6: dependency preparation (npm ci when node_modules absent)' ensure_dependencies
  run_build_stage 'stage 3/6: strict compilation gate (tsc --noEmit)' run_compile_gate
  run_build_stage 'stage 4/6: stale artifact pruning (dist/*.tgz only)' prune_stale_dist_tarballs
  run_build_stage 'stage 5/6: release packaging (npm pack --pack-destination dist)' pack_release_tarball
  run_build_stage 'stage 6/6: artifact verification' verify_built_artifact
  printf '\nbuild: all stages passed.\n'
}

main "$@"
