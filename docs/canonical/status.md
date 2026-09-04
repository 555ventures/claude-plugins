# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
`observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
`observation: n/a|ok|red` from historical rows; only red renders — the `/spec:escape` entry
tops `--next` as the oracle-shaped pick and the dashboard footer turns 🔴 carrying branch, sha
and url. The default dashboard is four blocks — 🗺️ Roadmap, 🎯 Next (the paste line, with ⏳ branch
lines only when the top pick is blocked), up to three ⚠️ decide lines (`skipped-brief`,
`out-of-order`: one sentence, one question, one paste), and a one-line footer whose glyph
is the verdict (🔴 red CI, 🟠 blocked, 🟢 ready, ⬜ nothing) and whose clauses carry the
wait, parallel, overflow and hygiene counts. `--all` adds the lane render, the blocked list
and the hygiene catalogue. Every anomaly carries `audience: decide|hygiene` in `--json`;
hygiene kinds are `/spec:doctor` check 13's findings and never render by default.

The `--next` derivation consults an optional per-repo session queue (`spec-queue.json` in the
git common directory, written only by `spec-queue.js`) as an input overlay. Items are briefs
by number, specs by path, or free-text prompts; any item may carry an `after` gate on a spec
or a brief and is not ready until that target is done. Queue position orders unblocked
entries across briefs (a queued spec's own position overrides its brief's); a not-ready item's
entries carry an `after <target> (<state>)` blocker and sink with the other blocked entries;
prompt items surface verbatim; red-observation escape entries still rank first; linked
worktrees suppress the overlay entirely. A brief that lands on the roadmap is appended last
with no mark or notice. No queue file means the derivation is unchanged. Statuses and payloads
stay derived — the queue stores only ordering, gates, free-text payloads, and done-when
predicates.

The dashboard prints one line directly under the 🗺️ Roadmap block —
`🧭 misunderstandings: N caught before build (latest <id> at <step>)` — read from
`design/mocks/ledger.md` via `lib/mocks-ledger.js`; the line is omitted when the ledger is
absent, unparsable, or holds zero catches. Render only: the `--json` and `--next --json` shapes
are unchanged (specs/20260902/11-brief-from-approved-set.md).
