# Deviations — 03-the-build-reads-the-freeze

- tests/build/build-driver.fixtures.js's PROTO_CAPTURE_BIN stub reads its per-URL diff script from
  a `PROTO_CAPTURE_SCRIPT` env var naming a JSON map file — a mechanism the File Plan row names
  only as "scripted per url", not a specific shape; this is the tests-layer implementation of that
  instruction.
- The behaviour-lane fixture's stem is `<brief>-functional-prototype`, matching the spec's own
  Contracts block worked example (`28-functional-prototype`) — the File Plan does not fix a slug.
- A4 fired as stated: tests/review/merge-reentry.test.js's `driveToMerge` is not exported, so
  tests/review/harden-branch-cleanup.test.js builds its own equivalent worktree/merge harness
  (same recipe: gitRepo + merge-back.sh create + a real spec branch through CLOSE to MERGE) rather
  than importing it.
