# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
`observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
`observation: n/a|ok|red` from historical rows; only red renders (🔴 headline, one 📡 line, `/spec:escape` tops
--next as the oracle-shaped entry). The `--pretty` dashboard is bottom-anchored: Roadmap and
detail first, 🎯 Next and the headline verdict are the final lines.

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
