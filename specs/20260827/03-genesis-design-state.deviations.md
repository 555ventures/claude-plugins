# Deviations — specs/20260827/03-genesis-design-state.md

- Test batch (tests layer, 2026-08-29): the new AC-20260827-03-7 `genesis-design` repo-wide
  emptiness sweep (D8) needed two waivedPaths entries beyond AC-7's own representative
  waive-list text, both for the same reason `tests/genesis-gate.test.js` is already waived in
  the sibling `genesis-explore` sweep — the literal prompt/command string is the input under
  test, not a stale reference:
  - `tests/genesis/design-state.test.js` (this build's own new file): AC-20260827-03-1/-5 assert
    the driver reaches `state: DESIGN` and that HANDOFF/the chain bullet no longer name the
    retired command.
  - `tests/genesis-gate.test.js`: the new AC-20260827-03-6 test asserts the hook now falls
    through the retired command's prompt untouched.
- Same reasoning forced one addition to the EXISTING (spec 02) `genesis-explore` sweep's own
  waivedPaths in `tests/consistency/genesis-doctrine.test.js` (AC-20260827-02-8): the new
  `tests/genesis/design-state.test.js` (AC-20260827-03-5) asserts spec/commands/genesis.md's
  chain bullet no longer names `genesis-explore` either, so its own test name/assert text
  carries that literal too.
- `tests/genesis/explore-states.test.js` (spec 02, not in this spec's File Plan) carried one
  live assert message naming the retired command ("so /spec:genesis-design is admitted by the
  hook (A3)") that went stale once D6 deletes that hook arm — a live assertion of a retired
  literal outside the File Plan, per § Gotchas, updated in place rather than waived: the message
  text now names the genesis design state instead (assertion, subject, and strictness
  unchanged). This is an out-of-File-Plan file touched at build (message text only) —
  `/spec:review`'s scope reconcile will flag it as out-of-plan.
- Scripts batch (2026-08-29): D6 deletes `require_scaffold` from `spec/scripts/genesis-state-gate.sh`,
  which was the only caller of the `ARCH`, `EXPL`, and `DESC` variable assignments (each a `jq`
  read off `$STATUS`) — D6 names the helper's deletion but not these three now-callerless
  assignments. Removed them along with the helper rather than leaving dead reads in a
  critical-tier hook; `DES` (still read by the surviving `/spec:init` arm) is untouched.
- Other batch (2026-08-29): § Canonical Delta's paragraph to append at `docs/canonical/genesis.md`
  quotes the retired literal verbatim ("`/spec:genesis-design` is deleted, its hook arm
  removed"). `docs/canonical/` is not on the AC-20260827-03-7 sweep's `waivedPrefixes` (only
  `specs/`, `docs/roadmap/`, `docs/audit/`, `docs/adr/` are), so appending that sentence
  unmodified would redden the sweep. Landed the same substance as "The command is deleted, its
  hook arm removed" instead — the retired name stays out of this live surface, matching D8's own
  intent, at the cost of not quoting the Delta paragraph byte-for-byte.
