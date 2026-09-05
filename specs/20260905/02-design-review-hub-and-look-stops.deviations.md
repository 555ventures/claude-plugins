# Deviations — 02-design-review-hub-and-look-stops

- Scripts worker: D10's File Plan row for `spec/entrypoints.json` names only the new
  `spec/scripts/design-hub.js` row; it does not mention that D9's doctrine rewrite of
  `spec/commands/mocks.md` (the doctrine worker's landing, concurrent with this batch) removes
  every literal `design-atlas.js`/`spec-paths design-atlas` mention from that file — so the
  pre-existing `spec/scripts/design-atlas.js` entrypoints row's `spec/commands/mocks.md` member
  became stale (no live call site) and was dropped, or `tests/consistency/entrypoints.test.js`
  (AC-20260820-04-6) reddens on an over-broad manifest. Verified via
  `grep -n "design-atlas" spec/commands/mocks.md` (no hits) before removing the entry.
- Scripts worker: `spec/scripts/design-hub.js`'s own header comment originally cited its usage as
  `(spec-paths design-hub)` (mirroring other scripts' doc convention) and used a bare
  `127.0.0.1:<port>` IP literal plus a dated ruling citation and the phrase "no longer" in a code
  comment. `comment-narration.js --root .` flagged all three (self-citing a `spec-paths <key>`
  literal inside the SAME script it names makes the reverse-invocation check in
  `tests/consistency/entrypoints.test.js` demand the script declare itself as its own entry point;
  the IP/date/prior-phrasing hit the narration gate's version/date/prior classes). Fixed by
  dropping the self-citation, backtick-quoting the IP literal, removing the dated citation, and
  rewording "no longer matches" to "diverges from" — no behavior change, `comment-narration.js`
  and the entrypoints suite are both green.
- Test author (tests batch): AC-20260905-02-10's illustrative candidate example (directions
  "ocean"/"ember" over screens "signin"/"home") does not fit `tests/mocks/mocks-driver.test.js`'s
  existing fixture (LABELS = signin/invite/consent/session-live, dense screen session-live), whose
  direction-composed mark requires >=3 screens per direction. The test reuses the file's own
  `advanceToDirectionComposed` helper (3 screens including the dense one) for both "ocean" and
  "ember" and asserts the resulting `stop open theme` candidates are grouped by direction (kind
  "pick", groups {ocean, ember}) rather than pinning the AC's literal label/path strings verbatim.
- Test author (tests batch): AC-20260905-02-18/D11 says `decideLook` is "called before every
  existing acceptance of the five marks"; this batch also calls it before the handful of existing
  refusal-path invocations of those same marks (e.g. journey-approved before journey-drawn,
  theme-picked under 2 composed directions) so that AC-18's own SHALL-CONTINUE-TO text — "the
  system shall continue to refuse ... even WHEN a decided-approve/pick stop is present" — is
  actually exercised rather than left to depend on unspecified check ordering in the eventual D7
  implementation.
- Test author (tests batch): `tests/design-look-handoff.test.js`'s prior single test ("every human
  look stop prints the block and ends the turn: sketch ratification, mocks approvals, and the core
  rule they cite") pinned the pre-D9 unified look-stop rule text and the old mocks.md/sketch.md
  wording. Per D9's own Rationale ("the look-stop rule now names two shapes … so
  design-look-handoff.test.js pins them separately"), this test is replaced in place by two new
  AC-tagged tests (AC-20260905-02-16, AC-20260905-02-17) rather than amended piecemeal — its
  Step 5 catalog assertions (three separate tests above it) are untouched.
- Orchestrator (build Phase 0): main was red on two tests before this spec touched anything
  (the sibling 7.82.1 patch left a dated comment in `tests/queue/spec-queue.test.js` and a
  four-entry changelog in `spec/.claude-plugin/plugin.json`). The comment is outside this File
  Plan and was fixed as its own chore commit (411b8d9defb16afbed8125051912dba9b8511d1a) on main before any spec work was committed;
  `diff_base` was corrected from f7491dd to that commit, the true pre-image (§ Gotchas
  `diff_base` entry). The changelog count is repaired by the doctrine worker under D10, which
  rewrites that block anyway.
