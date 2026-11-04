# Deviations — 08-queue-items-remember-their-origin

- tests/fanout/fanout-driver.test.js AC-20261103-08-11: the AC example lists q107 among the live fix ids, but opt bornFix carries no q107; the test pins the real set q108, q109, q110, q111.
- tests/fanout/fixture.js: opt bornFix queue seq raised 109 to 111 so a born item gets q112 or later and never collides with q110/q111.
- tests/spec-status.test.js: AC-20261103-06-4 also pinned the three-key `--lanes --json` top-level list
  that D4's `born` key grows; extended in place to `['born','fixes','lanes','serialized']` and retagged
  `AC-20261103-06-4 / AC-20261103-08-8` — the same sanctioned exhaustive-pin collision class D10 names,
  one more pin than D10 enumerates.
- spec/scripts/fanout-driver.js printWait: the WAIT step lists only active lanes (dispatched, pending, merge-ready); a planned fix lane that D14 holds back is not "running", and AC 22 requires `q107` absent from the WAIT print.
- spec/scripts/fanout-driver.js batch walk: a queue prompt's stopBefore.path is parsed from the entry's note (`queue item q<n>`), since `--next --json` strips the private queue id; REPORT reads the prompt's action from `--next --json` by the same note.
- tests/fanout (fixture.js `h.born`, opt `fixes`) remain red against the drivers for fixture-side causes, not driver ones: `h.born` passes no `--distinct`, so the writer's existing near-duplicate refusal rejects the gate-red birth against q111 (AC 11, 25) and the q112 plan item (AC 10); on a host with no queue file the first `add` also seeds the roadmap briefs, so `h.born`'s exactly-one-new-id assertion fails (AC 18); opt `fixes` writes `.claude/spec-runs.jsonl` untracked after the seed commit, which D17's dirty-root refusal now rejects at MERGE (four fix-lane merge tests). Fixture fixes: `--distinct` in `h.born`, diff only ids from items born after the call, and gitignore or commit `.claude/spec-runs.jsonl` in the `fixes` opt.
- tests/fanout/fixture.js `h.born`: passes `--distinct` and returns the one new prompt whose payload equals the subject (a first add on a queue-less host also seeds briefs); opt `fixes` commits `.claude/spec-runs.jsonl` right after writing it (tracked in real hosts), so D17's dirty-root check stays quiet.
- tests/fanout/fanout-driver.test.js AC-20261103-08-25: `.gate-red` is committed on main before the red merge mark so the repair lane's worktree carries it and commits its deletion; the red leg leaves it in place.
