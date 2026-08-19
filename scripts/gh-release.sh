#!/usr/bin/env bash
#
# GitHub Releases for micro-ai-client, generated from CHANGELOG.md (FE-ADR-009).
#
# The tag is the record; this only mirrors it onto GitHub so a reader who lands on
# the Releases page sees what CHANGELOG.md says instead of a bare tag list.
#
#   scripts/gh-release.sh notes    v0.7.0        # print the release body, publish nothing
#   scripts/gh-release.sh publish  v0.7.0        # create (or update) the release for one tag
#   scripts/gh-release.sh backfill               # publish every tag that has no release yet
#   scripts/gh-release.sh check                  # report drift, exit 1 if any (CI-friendly)
#
# Conventions held here:
#   - body      = that version's CHANGELOG section, verbatim, plus a footer link
#   - title     = the annotated tag's subject line, falling back to the tag name
#   - -rc.N     = marked --prerelease, so the Releases page's "Latest" is a real release
#   - existing  = updated in place, never duplicated
#
set -euo pipefail

cd "$(dirname "$0")/.."
CHANGELOG=CHANGELOG.md
REPO_URL=$(gh repo view --json url -q .url)

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# Released versions, oldest first, in CHANGELOG order - the changelog, not `sort -V`, is
# what knows that v0.7.0-rc.1 came before v0.7.0. Only versions that carry a tag are listed.
tags() {
  sed -n 's/^## \[\([0-9][^]]*\)\].*/v\1/p' "$CHANGELOG" | tail -r 2>/dev/null || \
  sed -n 's/^## \[\([0-9][^]]*\)\].*/v\1/p' "$CHANGELOG" | tac
}

# The newest tag that is not a release candidate - the one GitHub should mark "Latest".
latest_tag() { tags | grep -v -- '-rc\.' | tail -1; }

# The CHANGELOG section for a version, without its own heading or the trailing rule.
section() {
  local version=${1#v}
  awk -v want="## [$version]" '
    index($0, want) == 1 { found = 1; next }
    found && /^## \[/    { exit }
    found                { print }
  ' "$CHANGELOG" \
    | sed -e '/^---$/d' \
    | awk 'NF {blank = 0} !NF {blank++} blank < 2' \
    | awk 'NF {started = 1} started' \
    | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}'
}

# The annotated tag's subject line; empty for a lightweight tag, whose %(contents) would
# otherwise fall through to the commit message and hide the inconsistency.
tag_subject() {
  [ "$(git cat-file -t "$1" 2>/dev/null)" = tag ] || return 0
  git tag --list "$1" --format='%(contents:subject)'
}

notes() {
  local tag=$1 body
  body=$(section "$tag")
  [ -n "$body" ] || die "no [${tag#v}] section in $CHANGELOG"

  printf '%s\n\n' "$body"
  printf -- '---\n\n'
  printf 'Full entry, with the links and the compatibility notes: [`CHANGELOG.md`](%s/blob/%s/CHANGELOG.md).\n' \
    "$REPO_URL" "$tag"
  case "$tag" in
    v0.0.1|v0.1.0|v0.2.0|v0.3.0|v0.4.0-rc.1|v0.5.0-rc.1)
      printf '\n> Reconstructed from git history after the fact, not written at release time - this repo\n'
      printf '> had no changelog and no tags before 2026-08-12 (FE-ADR-009). The linked commits are the\n'
      printf '> primary source.\n' ;;
  esac
}

publish() {
  local tag=$1 title args=()
  git rev-parse -q --verify "refs/tags/$tag" >/dev/null || die "no such tag: $tag"

  title=$(tag_subject "$tag")
  [ -n "$title" ] || title="micro-ai-client $tag"

  case "$tag" in
    *-rc.*) args+=(--prerelease) ;;
    *)      [ "$tag" = "$(latest_tag)" ] && args+=(--latest) || args+=(--latest=false) ;;
  esac

  if gh release view "$tag" >/dev/null 2>&1; then
    notes "$tag" | gh release edit "$tag" --title "$title" --notes-file - "${args[@]}" >/dev/null
    printf 'updated  %s\n' "$tag"
  else
    notes "$tag" | gh release create "$tag" --title "$title" --notes-file - --verify-tag "${args[@]}" >/dev/null
    printf 'created  %s\n' "$tag"
  fi
}

backfill() {
  local tag
  for tag in $(tags); do
    if gh release view "$tag" >/dev/null 2>&1; then
      printf 'exists   %s\n' "$tag"
    else
      publish "$tag"
    fi
  done
}

check() {
  local tag missing=0 lightweight=0 pending=0
  for tag in $(tags); do
    # A version written up in the CHANGELOG but not tagged yet is the normal state DURING a
    # release, not drift: reported, not failed. Checked first because a missing tag would
    # otherwise read as a lightweight one (`git tag --format` prints nothing either way).
    if ! git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
      printf 'not tagged  %s  (in CHANGELOG, awaiting `git tag -a %s`)\n' "$tag" "$tag"
      pending=$((pending + 1))
      continue
    fi
    gh release view "$tag" >/dev/null 2>&1 || { printf 'no release  %s\n' "$tag"; missing=$((missing + 1)); }
    [ -n "$(tag_subject "$tag")" ] || { printf 'lightweight %s\n' "$tag"; lightweight=$((lightweight + 1)); }
    [ -n "$(section "$tag")" ] || printf 'no changelog section  %s\n' "$tag"
  done
  if [ "$missing" -eq 0 ] && [ "$lightweight" -eq 0 ]; then
    [ "$pending" -eq 0 ] && printf 'all tags annotated and released\n' \
      || printf 'every tag annotated and released; %d version(s) still to tag\n' "$pending"
    return 0
  fi
  return 1
}

case "${1:-}" in
  notes)    [ $# -eq 2 ] || die 'usage: gh-release.sh notes <tag>';   notes "$2" ;;
  publish)  [ $# -eq 2 ] || die 'usage: gh-release.sh publish <tag>'; publish "$2" ;;
  backfill) backfill ;;
  check)    check ;;
  *)        die 'usage: gh-release.sh {notes|publish|backfill|check} [tag]' ;;
esac
