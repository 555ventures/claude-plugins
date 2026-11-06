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
hygiene kinds are `/spec:doctor` check 13's findings; the catalogue shows only under `--all`.

The `--next` derivation consults an optional per-repo session queue (`spec-queue.json` in the
git common directory, written only by `spec-queue.js`) as an input overlay. Items are briefs
by number, specs by path, or free-text prompts; any item may carry an `after` gate on a spec
or a brief and is not ready until that target is done. Queue position orders unblocked
entries across briefs (a queued spec's own position overrides its brief's); a not-ready item's
entries carry an `after <target> (<state>)` blocker and sink with the other blocked entries;
prompt items surface verbatim; red-observation `/spec:fix` entries still rank first; linked
worktrees suppress the overlay entirely. The queue a reader sees is the file plus the fill (ADR-0044,
`lib/queue.js`), worked out on every read and never stored: every unfinished brief, then every open ad-hoc
spec (`brief: n/a`, not done, by path), that no open item holds joins the end, so the queue is never empty
while work is open; `add` of a not-yet-queued ad-hoc spec places it where asked. Statuses and payloads
stay derived — the file stores only what was placed: ordering, gates and free-text payloads.

Done rows stay in `spec-queue.json` (`show` resolves them and the `— N done` count reads them); there is
no archive file. `add` refuses an exact duplicate only: a near-duplicate score is suspicion, not
evidence, and is `groom`'s to report. `list` prints an age column and the flags `🔨 in progress`,
`📎 cites done <spec>`, `⏳ gate met` and `⌛ stale` (≥ 14 days, ungated prompt), each row led by its type
(🏃 run, 📝 plan, 🧪 prototype, 🔧 fix, 📌 decide); `groom` prints the flags in buckets plus duplicate
pairs (Jaccard 0.35 or more) and the two fate commands, writes nothing — the session proposes one fate per
item and asks per item. (specs/20261013/02-queue-hygiene.md, specs/20261105/16-the-queue-fills-itself-again.md)

`--lanes --json` is a third machine mode beside `--next --json` and `--json`: `{lanes, serialized, fixes}` — the admitted `/spec:run` lanes with their `spec/<stem>` branch and the linked worktree holding it (or null), the entries held back with their reason, and the `/spec:fix` escapes and queued fixes with their queue id. Refused outside the main worktree. Consumed by `/spec:fanout`'s driver; the two older shapes are unchanged. (specs/20261102/03-one-session-runs-the-lanes.md) Parallelism between two entries is one derivation,
`pairSerialReason`: briefed pairs by brief (shared brief, dependency path); every other pair is parallel — File
Plan overlap decides nothing, the 🔶 heads-up reports it and the fan-out's MERGE step resolves it by rebase.
(specs/20261103/15-shared-files-land-by-rebase.md) `fixes[]` carries `after`, the queued item's after-spec path or null.
(specs/20261103/06-the-fan-out-drains-the-queue.md) An item may carry `origin: {spec, stage}`,
`trigger` and `batch`, written only by `spec-queue add` (`--origin`/`--stage`/`--trigger`, or the lane
fallback from the fan-out table; `batch` is the live fan-out's `startedAt`); the dashboard prints
`↳ from <spec> (<trigger>)` under such a row and `show` prints it with the batch. Items without the
fields read as origin unknown. `--lanes --json`'s `fixes[]` carries `origin`, `trigger` and `batch`
(null when absent), `files` (the repo files the item's text names, null when none), `overlaps` (the
open specs whose File Plans name them) and `blocker` (the unmet `after` gate's text, null when ready),
and a fourth top-level key `born` lists every undone item carrying any of the three provenance fields.
(specs/20261103/08-queue-items-remember-their-origin.md)
A spec's `brief:` stamp is parsed once by
`spec/scripts/lib/brief.js` into `{ kind: 'briefed', num }` or `{ kind: 'adhoc' }`; `relateBriefs(a, b)` is the one
comparison (`same`, `different`, or `unknown` with a printed reason), and every external `--json` surface serializes
the stamp back to `'NN'` or `null`. The `--all` `🤷` line names the reason parallelism is unknown.
(specs/20261103/10-two-missing-briefs-are-not-the-same-brief.md)
