---
description: Where the work stands — derived roadmap/spec status plus skip and drift anomalies, one script run. The cheap "which briefs are done, which spec did I skip?" view; /spec:doctor stays the deep audit
argument-hint: "[NN — optional brief number for a single-brief dependency readiness check]"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read, Edit
---

# Spec Status: Where Am I?

Answer one question — *what's done, what's open, what got skipped* — in one deterministic
script run. This command **never edits specs or briefs**; statuses are derived, never
stored. The derivation (shared verbatim with `/spec:doctor` check 14 and `/spec:plan`'s
preflight, implemented once in the script): a brief with no spec stamped `brief: NN` is
**unplanned**; any matching spec not `done` makes it **in-flight**; all matching specs
`done` makes it **done**. The one edit this command may ever offer is the hand-tracked
column strip named at the end — everything else is display. If you want the full
grounding-layer drift audit, that's `/spec:doctor`; this is the glanceable subset you run
between sessions.

**Intended model: any.** Run `spec-paths shared-for status` and read what it prints. No
judgment happens here — the script derives, you render.

## Run

```
node "$(spec-paths spec-status)" --root .
```

With a brief number in `$ARGUMENTS` (e.g. `/spec:status 04`), run the single-brief preflight
instead and report just that brief's dependency readiness:

```
node "$(spec-paths spec-status)" --root . --brief NN
```

## Render (Console Output Style — outcome first, then the table)

Open with the one-line verdict, not the table: **"🟢 3 briefs done, 1 in flight, nothing
skipped"** or **"🟠 brief 02 looks skipped — 03 is in flight on top of it"**. Then:

1. **Roadmap table** as the script prints it (brief, phase, derived status, specs). Skip the
   section entirely when the host has no roadmap.
2. **Open specs** — every non-`done` spec with its status; for each, name the natural next
   command: `draft` → `/spec:plan <path>` to finish hardening; `hardened` → `/spec:build
   <path>`, or `/spec:design <path>` first when the script marks it `[design]`;
   `implementing` → `/spec:review <path>`.
3. **Anomalies** — each `[kind]` line reframed in plain language with its one-step remedy:
   - `skipped-brief` / `out-of-order` — the script's line already embeds the `/spec:plan`
     command to run.
   - `orphan-stamp` / `unknown-dependency` — advise correcting the `brief:` stamp or the
     brief's `Depends on` list to the surviving file name (advice about a *pointer*, offered
     to the user — not a status change, and not an edit this command performs).
   - `skipped-spec` — the unfinished dependency is the work item: name its own next command
     per its status (usually `/spec:review`).
   - `hand-tracked-status` — see below.

   An empty anomaly list is worth saying out loud: it's the "you didn't forget anything"
   answer the user came for.

Do not re-derive, second-guess, or embellish the script's statuses, and never offer to
"fix" a status by editing `status:` frontmatter — statuses only move by running the pipeline
stage that owns the transition (the state machine is hook-enforced). On `hand-tracked-status`,
quote the offending cell(s) from the script's line and offer to strip that column from
`00-overview.md` — that edit is sanctioned because the overview template itself outlaws the
column; it is the single edit this command may make, and it still requires the user's yes.
