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

One run — `--pretty` is the whole dashboard (verdict line, roadmap with progress bars, the
next-action lanes, anomalies); it embeds the `--next` derivation, so there is no second run:

```
node "$(spec-paths spec-status)" --root . --pretty
```

With a brief number in `$ARGUMENTS` (e.g. `/spec:status 04`), run the single-brief preflight
instead and report **only** that brief's dependency readiness — no dashboard (the script
rejects `--brief` combined with `--next` or `--pretty`):

```
node "$(spec-paths spec-status)" --root . --brief NN
```

If the run errors, print the error and stop — never reconstruct statuses or a next
suggestion by hand; an absent answer is correct, a hand-derived one never is. (The plain
`--next` mode still exists for other consumers — `/spec:review`'s close-out pointer — and
prints the same entries without the dressing.)

## Render (Console Output Style — the script output IS the render)

Print the `--pretty` output **verbatim, as a fenced code block** so its alignment and lane
connectors survive — every visual judgment (emoji, bars, lane grouping, ordering, the
`Blocked` sinking, the all-done fall-through) lives in the script; never re-derive, reorder,
restyle, or embellish its lines, and never rebuild it as a markdown table. Then add the one
thing the script can't: narration.

1. **After the block, narrate in one or two sentences** what the dashboard means for the
   user's next hour — lead with the main lane, name the fan-out option when parallel lanes
   exist. Tags worth knowing: `[design]` routes through `/spec:design` first; `[designed]`
   means that stage already ran and the spec goes straight to `/spec:build`; `⛓ serial`
   runner-ups must wait for the main lane (the script names why), `⚡` lanes are safe to run
   concurrently in separate worktrees via `/git:enter-worktree`.
2. **Anomalies** — each `[kind]` line reframed in plain language with its one-step remedy:
   - `skipped-brief` / `out-of-order` — the script's line already embeds the `/spec:plan`
     command to run.
   - `orphan-stamp` / `unknown-dependency` — advise correcting the `brief:` stamp or the
     brief's `Depends on` list to the surviving file name (advice about a *pointer*, offered
     to the user — not a status change, and not an edit this command performs).
   - `skipped-spec` — the unfinished dependency is the work item: point at its line in
     the dashboard's 🎯 Next section (its entry already carries the command — usually
     `/spec:review`), never re-derive it here.
   - `hand-tracked-status` — see below.

   An empty anomaly list is worth saying out loud: it's the "you didn't forget anything"
   answer the user came for.

Do not re-derive, second-guess, or embellish the script's statuses, and never offer to
"fix" a status by editing `status:` frontmatter — statuses only move by running the pipeline
stage that owns the transition (the state machine is hook-enforced). On `hand-tracked-status`,
quote the offending cell(s) from the script's line and offer to strip that column from
`00-overview.md` — that edit is sanctioned because the overview template itself outlaws the
column; it is the single edit this command may make, and it still requires the user's yes.
