# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
`observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
`observation: n/a|ok|red` from historical rows; only red renders — the `/spec:fix` entry
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
prompt items surface verbatim; red-observation `/spec:fix` entries still rank first; linked
worktrees suppress the overlay entirely. A brief that lands on the roadmap is appended last
with no mark or notice. No queue file means the derivation is unchanged. Statuses and payloads
stay derived — the queue stores only ordering, gates, free-text payloads, and done-when
predicates.

The queue file holds only live rows: every write moves ticked and derived-done items into
`spec-queue-done.json` beside it (`show` still resolves an archived id). `add` refuses a
free-text prompt whose token-set Jaccard against any pending prompt is ≥ 0.35 (`--distinct`
overrides). `list` prints an age column and flags `📎 cites done <spec>`, `⏳ gate met` and
`⌛ stale` (≥ 14 days, ungated prompt); `groom` prints the same flags in buckets plus
duplicate pairs and the two fate commands, read-only — the session proposes one fate per item
and asks per item. (specs/20261013/02-queue-hygiene.md)

`--lanes --json` is a third machine mode beside `--next --json` and `--json`: `{lanes, serialized, fixes}` — the admitted `/spec:run` lanes with their `spec/<stem>` branch and the linked worktree holding it (or null), the entries held back with their reason, and the `/spec:fix` escapes and queued fixes with their queue id. Refused outside the main worktree. Consumed by `/spec:fanout`'s driver; the two older shapes are unchanged. (specs/20261102/03-one-session-runs-the-lanes.md) Parallelism between two
entries is one derivation, `pairSerialReason`: briefed pairs by brief (shared brief, dependency
path); any pair with a briefless side by File Plan — disjoint plans are parallel, overlapping ones
serialize with `File Plan overlap: <paths>`, where the host's `policy.fanout.overlapExempt` globs and
its pipeline rules file never count; a side with no File Plan rows makes no claim. The 🔶 heads-up
keeps reporting raw overlap. `fixes[]` carries `after`, the queued item's after-spec path or null.
(specs/20261103/06-the-fan-out-drains-the-queue.md) An item may carry `origin: {spec, stage}`,
`trigger` and `batch`, written only by `spec-queue add` (`--origin`/`--stage`/`--trigger`, or the lane
fallback from the fan-out table; `batch` is the live fan-out's `startedAt`); the dashboard prints
`↳ from <spec> (<trigger>)` under such a row and `show` prints it with the batch. Items without the
fields read as origin unknown. `--lanes --json`'s `fixes[]` carries `origin`, `trigger` and `batch`
(null when absent), `files` (the repo files the item's text names, null when none), `overlaps` (the
open specs whose File Plans name them) and `blocker` (the unmet `after` gate's text, null when ready),
and a fourth top-level key `born` lists every undone item carrying any of the three provenance fields.
(specs/20261103/08-queue-items-remember-their-origin.md)
