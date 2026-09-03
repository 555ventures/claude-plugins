# status — canonical

Observation is a red alarm, not a certification (specs/20260807/01). v7.0.0 retired
`observe-ci.js` (no new `stage:"observe"` rows are written); `spec-status.js` still derives
`observation: n/a|ok|red` from historical rows; only red renders (🔴 headline, one 📡 line, `/spec:escape` tops
--next as the oracle-shaped entry). The `--pretty` dashboard is bottom-anchored: Roadmap and
detail first, 🎯 Next and the headline verdict are the final lines.

The `--next` derivation consults an optional per-repo session queue (`spec-queue.json` in the
git common directory, written only by `spec-queue.js`) as an input overlay: queue position
orders unblocked entries across briefs, prompt items surface verbatim, red-observation escape
entries still rank first, and linked worktrees suppress the overlay entirely. No queue file
means the derivation is unchanged. Statuses and payloads stay derived — the queue stores only
ordering, free-text payloads, and done-when predicates.

The dashboard prints one line directly under the 🗺️ Roadmap block —
`🧭 misunderstandings: N caught before build (latest <id> at <step>)` — read from
`design/mocks/ledger.md` via `lib/mocks-ledger.js`; the line is omitted when the ledger is
absent, unparsable, or holds zero catches. Render only: the `--json` and `--next --json` shapes
are unchanged (specs/20260902/11-brief-from-approved-set.md).
