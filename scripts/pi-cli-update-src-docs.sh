#!/usr/bin/env bash
# @file scripts/pi-cli-update-src-docs.sh
# @brief Updates read-only pi CLI reference sources and docs from the latest pi CLI release.
# @details Clones the official pi CLI repository (https://github.com/earendil-works/pi),
#     resolves the newest release tag reachable from the upstream default branch, and
#     performs a full one-way synchronization of the upstream repository root into the
#     local read-only `pi.dev-src/pi` target. Every dot-prefixed upstream entry
#     (`.git`, `.github`, `.gitignore`, and any other file or directory whose name
#     starts with `.`) is excluded at every tree level. Full synchronization
#     overwrites every present file and removes every file that no longer exists
#     upstream by replacing each target directory with a freshly staged copy.
#     Upstream file access and modification timestamps are preserved through `cp -p`.
#     After the source synchronization completes, three documentation targets are
#     refreshed from the synchronized sources: `docs/pi.dev/coding-agent-docs`
#     from `pi.dev-src/pi/packages/coding-agent/docs`,
#     `docs/pi.dev/coding-agent-examples` from
#     `pi.dev-src/pi/packages/coding-agent/examples`, and `docs/pi.dev/durable-docs`
#     from `pi.dev-src/pi/packages/durable/docs`. Existing target files whose
#     bytes differ from the upstream candidate only in carriage-return
#     line-ending characters are preserved with their committed bytes and
#     timestamps, so repeated updates against an unchanged upstream release
#     leave the git working tree clean. Before any modification, the
#     updater verifies that the repository root is inside a git work tree and
#     prints the resolved latest version and the stored versions read from
#     `docs/pi.dev/pi-cli-version.txt` and `pi.dev-src/pi-cli-version.txt`
#     (missing or empty files report `unknown`). Synchronization then runs
#     automatically without user confirmation whenever the stored source
#     version is `unknown` or the resolved version is strictly newer under
#     version-sorted ordering; otherwise the updater terminates with exit code 0
#     without modifying any repository content. After a successful
#     synchronization, the resolved version is written into both version marker
#     files and exactly one commit is created on the current branch staging only
#     the synchronized source target, the three documentation targets, and the
#     two version markers, with subject `change(pi-cli-src-docs-update): Update
#     bundled read-only PI cli source code and docs from <stored> to <resolved>
#     [useReq]`; an empty staged diff skips the commit with a no-change log
#     line, and a failing commit aborts with a non-zero exit code. Runtime is
#     dominated by one git clone plus one tag checkout and per-file copies.
#     Side effects include temporary-directory creation, git subprocesses,
#     replacement of the four target directories, overwrite of the two version
#     marker files, and one git staging plus commit operation. No other
#     repository content is modified.
# @satisfies DES-023, REQ-385, REQ-386, REQ-387, REQ-388, REQ-389, REQ-390, REQ-391, REQ-392, REQ-393, REQ-394, REQ-395, REQ-757, REQ-758, REQ-759, REQ-760, REQ-761, REQ-762

set -euo pipefail

PI_REPO_URL_PRIMARY="https://github.com/earendil-works/pi.git"
PI_REPO_URL_FALLBACK="https://github.com/earendil-works/pi"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

## @brief Stores the resolved read-only pi CLI source synchronization target.
## @details The updater replaces the whole content of `${REPO_ROOT}/${SRC_TARGET_REL}`
##     with the non-dot upstream repository tree. The constant is immutable at
##     runtime and costs O(1) per access.
SRC_TARGET_REL="pi.dev-src/pi"

## @brief Stores the ordered `source-relative:target-relative` documentation synchronization pairs.
## @details Each entry maps one directory inside the synchronized `${SRC_TARGET_REL}`
##     tree to one `docs/pi.dev` target directory synchronized in declaration order
##     after the source synchronization completes. The constant is immutable at
##     runtime and costs O(1) per element access.
DOC_SYNC_SPECS=(
  "pi.dev-src/pi/packages/coding-agent/docs:docs/pi.dev/coding-agent-docs"
  "pi.dev-src/pi/packages/coding-agent/examples:docs/pi.dev/coding-agent-examples"
  "pi.dev-src/pi/packages/durable/docs:docs/pi.dev/durable-docs"
)

## @brief Stores the documentation version marker path relative to the repository root.
## @details Read before the update and overwritten with the resolved version after
##     successful synchronization. The constant is immutable at runtime.
DOC_VERSION_REL="docs/pi.dev/pi-cli-version.txt"

## @brief Stores the source version marker path relative to the repository root.
## @details Read before the update and overwritten with the resolved version after
##     successful synchronization. The constant is immutable at runtime.
SRC_VERSION_REL="pi.dev-src/pi-cli-version.txt"

WORK_DIR=""
STAGING_DIR=""

## @brief Writes one progress message to stdout.
## @details Emits the supplied message fragments joined by single spaces followed
##     by one newline. Runtime is O(n) in message length. Side effect: writes to
##     `stdout`.
## @param[in] ... {string} Progress message fragments.
## @return {void} No return value.
log() {
  printf '%s\n' "$*"
}

## @brief Aborts the updater with one deterministic diagnostic.
## @details Writes the supplied diagnostic prefixed with `ERROR: ` to `stderr`
##     and terminates the process with exit code `1`. Runtime is O(n) in message
##     length. Side effects include `stderr` output and process exit; the `EXIT`
##     trap still removes updater temporary directories.
## @param[in] message {string} Failure diagnostic.
## @return {never} Never returns.
fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

## @brief Removes updater temporary directories.
## @details Deletes the cloned upstream working tree and any pending staging
##     directory registered in `WORK_DIR` plus `STAGING_DIR`. Invoked through the
##     `EXIT` trap on every exit path. Runtime is O(1) plus filesystem removal
##     cost. Side effects include directory removal.
## @return {void} No return value.
cleanup() {
  if [ -n "${STAGING_DIR}" ]; then
    rm -rf "${STAGING_DIR}"
  fi
  if [ -n "${WORK_DIR}" ]; then
    rm -rf "${WORK_DIR}"
  fi
}

## @brief Verifies that one required external tool is available.
## @details Probes the executable search path for the requested tool name and
##     aborts through `fail(...)` when the probe fails. Runtime is O(1) plus one
##     `PATH` lookup. No external state is mutated.
## @param[in] tool {string} Executable name to probe.
## @return {void} No return value.
require_tool() {
  command -v "$1" >/dev/null 2>&1 || fail "Required tool not found: $1"
}

## @brief Reads one stored pi CLI version marker file.
## @details Returns the first line of the marker file with all surrounding
##     whitespace removed when the file exists and is non-empty; otherwise
##     returns the literal `unknown` so missing or empty version markers are
##     handled deterministically. Runtime is O(n) in file size. Side effects are
##     limited to filesystem reads.
## @param[in] marker_path {string} Absolute version marker file path.
## @return {string} Trimmed stored version or `unknown` on `stdout`.
read_version_file() {
  local marker_path="$1"
  local version=""
  if [ -f "${marker_path}" ] && [ -s "${marker_path}" ]; then
    version="$(head -n 1 "${marker_path}" | tr -d '[:space:]' || true)"
  fi
  if [ -z "${version}" ]; then
    version="unknown"
  fi
  printf '%s\n' "${version}"
}

## @brief Clones the upstream pi CLI repository default branch into one target directory.
## @details Attempts a quiet, no-checkout clone from `${PI_REPO_URL_PRIMARY}`,
##     removes the partial destination on failure, and retries once with
##     `${PI_REPO_URL_FALLBACK}`. Prints the resolved upstream URL on `stdout` so
##     callers can capture provenance. Runtime is dominated by git subprocess
##     execution. Side effects include destination-directory creation and removal.
## @param[in] destination {string} Target directory path for the clone.
## @return {string} Resolved upstream repository URL on stdout.
## @throws Exits through `fail(...)` when both upstream URLs are unreachable.
clone_upstream() {
  local destination="$1"
  rm -rf "${destination}"
  if git clone --quiet --no-checkout "${PI_REPO_URL_PRIMARY}" "${destination}" 2>/dev/null; then
    printf '%s\n' "${PI_REPO_URL_PRIMARY}"
    return 0
  fi
  log "Primary clone failed, retrying with the fallback repository URL ..."
  rm -rf "${destination}"
  if git clone --quiet --no-checkout "${PI_REPO_URL_FALLBACK}" "${destination}" 2>/dev/null; then
    printf '%s\n' "${PI_REPO_URL_FALLBACK}"
    return 0
  fi
  fail "Unable to clone pi CLI from ${PI_REPO_URL_PRIMARY} or ${PI_REPO_URL_FALLBACK}."
}

## @brief Resolves the latest released pi CLI tag reachable from the default branch.
## @details Prefers the default branch reported by `refs/remotes/origin/HEAD` and
##     falls back to `origin/master` then `origin/main` when the symbolic ref is
##     absent. Selects the newest version-sorted tag matching `v[0-9]*` that is
##     merged into the resolved default ref, which represents the latest release
##     reachable from that branch. Prints the resolved tag on `stdout`. Runtime is
##     dominated by git ref enumeration. No external state is mutated.
## @param[in] repository {string} Cloned upstream repository path.
## @return {string} Latest release tag name on stdout.
## @throws Exits through `fail(...)` when no release tag is resolvable.
resolve_release_tag() {
  local repository="$1"
  local default_ref=""
  local release_tag=""

  default_ref="$(git -C "${repository}" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
  if [ -z "${default_ref}" ]; then
    if git -C "${repository}" rev-parse --verify --quiet refs/remotes/origin/master >/dev/null 2>&1; then
      default_ref="origin/master"
    else
      default_ref="origin/main"
    fi
  fi

  release_tag="$(git -C "${repository}" tag --list 'v[0-9]*' --sort=-v:refname --merged "${default_ref}" 2>/dev/null | head -n 1 || true)"
  if [ -z "${release_tag}" ]; then
    fail "Unable to resolve the latest pi CLI release tag from ${default_ref}."
  fi
  printf '%s\n' "${release_tag}"
}

## @brief Decides whether one staged upstream file must replace the existing target file.
## @details Returns success (replace) when the target file does not exist or when
##     its bytes differ from the staged upstream file beyond line-ending
##     characters. Returns failure (preserve) when both files are byte-equal or
##     when both files are equal after removing every carriage-return byte, so
##     committed reference bytes and timestamps stay stable when upstream
##     releases change only line endings. Runtime is O(n) in compared file size
##     plus at most three subprocesses. Side effects are limited to subprocess
##     execution and stdin pipes; no file is mutated.
## @param[in] source_file {string} Absolute staged upstream candidate file path.
## @param[in] target_file {string} Absolute existing target file path.
## @return {integer} `0` when the staged file must replace the target; `1` when
##     the existing target bytes must be preserved.
staged_copy_replaces_existing() {
  local source_file="$1"
  local target_file="$2"
  local source_normalized=""
  local target_normalized=""

  if [ ! -f "${target_file}" ]; then
    return 0
  fi
  if cmp -s -- "${source_file}" "${target_file}"; then
    return 0
  fi
  source_normalized="$(tr -d '\r' < "${source_file}" | git hash-object --stdin)" || return 0
  target_normalized="$(tr -d '\r' < "${target_file}" | git hash-object --stdin)" || return 0
  [ "${source_normalized}" != "${target_normalized}" ]
}

## @brief Fully synchronizes one upstream directory into one target directory.
## @details Stages every upstream entry below `source_dir` into a fresh sibling
##     staging directory using timestamp-preserving copies, excluding every
##     dot-prefixed entry and its whole subtree at every tree level, then
##     replaces `target_dir` with the staged tree through a backup-and-swap
##     sequence so files removed upstream disappear and existing files are
##     overwritten with an exact file-set match. Existing target files
##     whose bytes differ from the staged upstream file only in carriage-return
##     line-ending characters are preserved through
##     `staged_copy_replaces_existing(...)` so unchanged upstream releases do
##     not dirty the git working tree. Runtime is dominated by per-file copy
##     cost. Side effects include staging plus backup directory creation and
##     removal, target-directory replacement, and one progress line on `stdout`.
## @param[in] source_dir {string} Absolute upstream source directory path.
## @param[in] target_dir {string} Absolute read-only target directory path.
## @return {void} No return value.
## @throws Exits through `fail(...)` when `source_dir` is not a directory.
sync_directory() {
  local source_dir="$1"
  local target_dir="$2"

  [ -d "${source_dir}" ] || fail "Upstream directory not found: ${source_dir}"

  STAGING_DIR="${target_dir}.staging.$$"
  rm -rf "${STAGING_DIR}"
  mkdir -p "${STAGING_DIR}"

  local entry destination parent_dir copied=0
  while IFS= read -r -d '' entry; do
    entry="${entry#./}"
    [ -n "${entry}" ] || continue
    destination="${STAGING_DIR}/${entry}"
    if [ -d "${source_dir}/${entry}" ]; then
      mkdir -p "${destination}"
    else
      parent_dir="$(dirname "${destination}")"
      mkdir -p "${parent_dir}"
      if staged_copy_replaces_existing "${source_dir}/${entry}" "${target_dir}/${entry}"; then
        cp -p "${source_dir}/${entry}" "${destination}"
      else
        cp -p "${target_dir}/${entry}" "${destination}"
      fi
    fi
    copied=$((copied + 1))
  done < <(cd "${source_dir}" && find . -mindepth 1 \( -name '.*' -prune \) -o -print0)

  local backup_dir="${target_dir}.backup.$$"
  rm -rf "${backup_dir}"
  if [ -d "${target_dir}" ]; then
    mv "${target_dir}" "${backup_dir}"
  fi
  mv "${STAGING_DIR}" "${target_dir}"
  STAGING_DIR=""
  rm -rf "${backup_dir}"

  log "Synchronized ${copied} file(s) into ${target_dir#"${REPO_ROOT}"/}"
}

## @brief Decides update eligibility by comparing the stored and resolved versions.
## @details Returns success when the stored source version is `unknown` or the
##     resolved latest version is strictly greater than the stored source
##     version under GNU `sort -V` ordering, implemented as a strict
##     string-inequality guard followed by a sortedness check of the two-line
##     `stored` then `latest` sequence. Performs no I/O mutation. Runtime is
##     O(1) plus one `sort` subprocess. Invoked only inside `if` conditions, so
##     a failure exit status never terminates the caller under `set -e`.
## @pre Both versions are single-line strings without surrounding whitespace.
## @param[in] stored_version {string} Stored source version or `unknown`.
## @param[in] latest_version {string} Resolved upstream release version.
## @return {integer} `0` when synchronization is eligible; `1` when the resolved
##     version is equal to or older than the stored source version.
## @satisfies REQ-389, REQ-757
is_update_eligible() {
  local stored_version="$1"
  local latest_version="$2"
  if [ "${stored_version}" = "unknown" ]; then
    return 0
  fi
  if [ "${stored_version}" = "${latest_version}" ]; then
    return 1
  fi
  printf '%s\n' "${stored_version}" "${latest_version}" | sort -Vc 2>/dev/null
}

## @brief Commits the synchronized pi CLI reference sources and documentation on the current branch.
## @details Stages only the read-only source target declared in `SRC_TARGET_REL`,
##     the documentation targets declared in `DOC_SYNC_SPECS`, plus both version
##     marker files, skips commit creation with a progress line when the staged
##     diff is empty, and otherwise creates exactly one commit with subject
##     `change(pi-cli-src-docs-update): Update bundled read-only PI cli source
##     code and docs from <stored> to <resolved> [useReq]` on the current
##     branch. Runtime is dominated by git subprocess execution. Side effects
##     include git index mutation, one git commit object, and one
##     current-branch head advance; paths outside the synchronization scope are
##     never staged by this function.
## @pre `${REPO_ROOT}` is inside a git work tree with a resolvable `HEAD`.
## @param[in] stored_version {string} Stored source version before synchronization.
## @param[in] latest_version {string} Resolved upstream release version.
## @return {void} No return value.
## @throws Exits through `fail(...)` when staging or commit creation fails.
## @satisfies REQ-759, REQ-760, REQ-761, REQ-762
commit_update() {
  local stored_version="$1"
  local latest_version="$2"

  local spec target_paths=()
  target_paths+=("${REPO_ROOT}/${SRC_TARGET_REL}")
  for spec in "${DOC_SYNC_SPECS[@]}"; do
    target_paths+=("${REPO_ROOT}/${spec#*:}")
  done
  target_paths+=("${REPO_ROOT}/${DOC_VERSION_REL}")
  target_paths+=("${REPO_ROOT}/${SRC_VERSION_REL}")

  git -C "${REPO_ROOT}" add -- "${target_paths[@]}" \
    || fail "Unable to stage the synchronized pi CLI reference sources and documentation."
  if git -C "${REPO_ROOT}" diff --cached --quiet; then
    log "No synchronized content changed; skipping the pi CLI reference commit."
    return 0
  fi
  git -C "${REPO_ROOT}" commit --quiet \
    -m "change(pi-cli-src-docs-update): Update bundled read-only PI cli source code and docs from ${stored_version} to ${latest_version} [useReq]" \
    || fail "Unable to commit the synchronized pi CLI reference sources and documentation."
  log "Committed: change(pi-cli-src-docs-update): Update bundled read-only PI cli source code and docs from ${stored_version} to ${latest_version} [useReq]"
}

## @brief Executes one full pi CLI reference update run.
## @details Validates required tools, verifies that the repository root is
##     inside a git work tree, reads the stored version markers, allocates the
##     temporary upstream working tree, clones the pi CLI default branch,
##     resolves the newest release tag, prints the resolved plus stored
##     versions, applies the automatic version-sorted gate without user
##     confirmation and returns unchanged when the resolved version is not
##     newer than the stored source version, checks out the resolved release
##     tag, synchronizes the upstream repository root into the read-only source
##     target excluding every dot-prefixed entry, synchronizes every ordered
##     documentation pair declared in `DOC_SYNC_SPECS`, writes the resolved
##     version into both version marker files, and commits the synchronized
##     content on the current branch. Runtime is dominated by the upstream
##     clone plus the four directory synchronizations. Side effects include
##     temporary-directory creation and removal, git subprocesses, replacement
##     of the four target directories, overwrite of the two version marker
##     files, and one git staging plus commit operation.
## @return {void} No return value.
## @throws Exits through `fail(...)` when any required tool, work-tree probe,
##     clone, tag resolution, synchronization, staging, or commit step fails.
## @satisfies REQ-385, REQ-386, REQ-387, REQ-388, REQ-389, REQ-390, REQ-391, REQ-392, REQ-393, REQ-394, REQ-395, REQ-757, REQ-758, REQ-759, REQ-761, REQ-762
main() {
  require_tool git
  require_tool sort
  require_tool find
  require_tool mkdir
  require_tool cp
  require_tool cmp

  [ "$(git -C "${REPO_ROOT}" rev-parse --is-inside-work-tree 2>/dev/null)" = "true" ] \
    || fail "Repository root is not inside a git work tree: ${REPO_ROOT}"

  local doc_version src_version
  doc_version="$(read_version_file "${REPO_ROOT}/${DOC_VERSION_REL}")"
  src_version="$(read_version_file "${REPO_ROOT}/${SRC_VERSION_REL}")"

  WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pi-cli-update-src-docs.XXXXXX")" \
    || fail "Unable to create the temporary working directory."
  local repository="${WORK_DIR}/pi"

  local upstream_url
  upstream_url="$(clone_upstream "${repository}")"
  log "Upstream repository: ${upstream_url}"

  local release_tag
  release_tag="$(resolve_release_tag "${repository}")"

  log "Latest pi CLI release : ${release_tag}"
  log "Stored version (${DOC_VERSION_REL}): ${doc_version}"
  log "Stored version (${SRC_VERSION_REL}): ${src_version}"

  if ! is_update_eligible "${src_version}" "${release_tag}"; then
    log "Resolved version ${release_tag} is not newer than the stored version ${src_version}; no synchronization performed."
    return 0
  fi

  git -C "${repository}" checkout --quiet --detach "${release_tag}" \
    || fail "Unable to check out ${release_tag}."
  log "Synchronizing from release: ${release_tag}"

  sync_directory "${repository}" "${REPO_ROOT}/${SRC_TARGET_REL}"

  local spec source_rel target_rel
  for spec in "${DOC_SYNC_SPECS[@]}"; do
    source_rel="${spec%%:*}"
    target_rel="${spec#*:}"
    sync_directory "${REPO_ROOT}/${source_rel}" "${REPO_ROOT}/${target_rel}"
  done

  printf '%s\n' "${release_tag}" > "${REPO_ROOT}/${DOC_VERSION_REL}"
  printf '%s\n' "${release_tag}" > "${REPO_ROOT}/${SRC_VERSION_REL}"

  commit_update "${src_version}" "${release_tag}"

  log "pi CLI reference sources and documentation updated to ${release_tag}."
}

trap cleanup EXIT
main "$@"
