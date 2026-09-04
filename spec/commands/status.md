---
description: Where the work stands — one script run, four blocks: the roadmap, the one command to paste next, up to three decisions, and a one-line verdict footer; --all adds the parallel lanes, blocked list, and hygiene catalogue; /spec:doctor stays the deep audit
argument-hint: "[NN — optional brief number for a single-brief dependency readiness check] [--all — everything the default screen omits]"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read, Edit
---

# Spec Status: Where Am I?

Answer one question — *what do I paste next* — in one deterministic script run. This command
**never edits specs or briefs**; statuses are derived, never stored. The derivation (shared
verbatim with `/spec:doctor` check 13 and `/spec:plan`'s preflight, implemented once in the
script): a brief with no spec stamped `brief: NN` is **unplanned**; any matching spec not
`done` makes it **in-flight**; all matching specs `done` makes it **done**. The one edit this
command may ever offer is the hand-tracked column strip named at the end, offered under
`--all` — everything else is display. When a session queue file exists (`/spec:queue`), the
top pick is queue-aware: queue position can jump a brief ahead of the closest-to-done default;
no queue file means the ordering is unchanged. If you want the full grounding-layer drift
audit, that's `/spec:doctor`; this is the glanceable subset you run between sessions.

**Intended model: any.** Run `spec-paths shared-for status` and read what it prints. No
judgment happens here — the script derives, you render.

## Run

One bare run IS the whole dashboard — exactly four blocks, nothing else, ever: a rule that
can detect something does not earn a line here. It embeds the `--next` derivation, so there is
no second run (`--pretty` is accepted as a no-op — pretty is the only human render):

```
node "$(spec-paths spec-status)" --root .
```

With a brief number in `$ARGUMENTS` (e.g. `/spec:status 04`), run the single-brief preflight
instead and report **only** that brief's dependency readiness — no dashboard (the script
rejects `--brief` combined with `--next` or `--all`):

```
node "$(spec-paths spec-status)" --root . --brief NN
```

With `--all` in `$ARGUMENTS`, run the everything-screen instead — the four blocks with the
decide cap lifted, plus the parallel-lane render, the blocked list, and the hygiene catalogue
(the same run `--all` and `--brief`/`--next` combined is usage, exit 2):

```
node "$(spec-paths spec-status)" --root . --all
```

If the run errors, print the error and stop — never reconstruct statuses or a next
suggestion by hand; an absent answer is correct, a hand-derived one never is. (The `--next`
mode still exists for other consumers — `/spec:review`'s close-out pointer — and prints just
the 🎯 top pick.)

## Render (Console Output Style — the script output IS the render)

Print the dashboard output **verbatim, as a fenced code block** so its alignment and lane
connectors survive — every visual judgment (emoji, ordering, the paste lines, the footer
glyph) lives in the script; never re-derive, reorder, restyle, or embellish its lines, and
never rebuild it as a markdown table. Then add the one thing the script can't: narration.

The default screen is exactly four blocks, in order:

- **🗺️ Roadmap** — unchanged: rows, collapse, and the `🧭 misunderstandings: {N} caught
  before build (latest {id} at {step})` line when `design/mocks/ledger.md` has ≥1 catch.
- **🎯 Next** — the paste line (top pick); `⏳` blocker branch lines print only when the top
  pick is itself blocked.
- **Up to three decide lines** — `⚠️ {line}` then `   {ask}  {paste}`, one anomaly whose
  remedy is a choice the user makes (`skipped-brief`, `out-of-order`). Overflow beyond three
  moves to the footer's `· {k} more to decide (--all)` clause — never a truncation notice of
  its own.
- **The footer** — one line, glyph + one sentence, always the last non-empty line: `🔴 CI is
  red on {path} — {branch}@{sha} ({url})` when any done spec's observation is red (the Next
  line above is already the `/spec:escape` entry); else `🟠 next is blocked · waiting on
  {short blocker}`; else `🟢 next is ready` with clauses; else `⬜ nothing waits` with
  clauses. Clauses print only when non-zero: how many wait behind the top pick, how many
  could run in parallel (`--all`), how many more decide lines exist (`--all`), how many
  hygiene findings exist (`/spec:doctor`).

Nothing else prints by default — no anomaly-fold tag trailing the Next line, no separate
anomalies section, no `⚡`/`🚦`/`🕓`/`⛔` lane render, no observation block, no headline
verdict line above the roadmap. The anomaly-fold tag, the observation block and the headline
verdict line are deleted outright — they print nowhere, not even under `--all`; only the lane
render, the blocked list and the hygiene catalogue move behind `--all`.

1. **After the block, narrate in one or two sentences** what the dashboard means for the
   user's next hour — name the paste line and, only when a decide line printed, the one
   question it asks. Tags worth knowing in the roadmap rows: `[design]` routes through
   `/spec:design` first; `[designed]` means that stage already ran and the Next line is
   `/spec:run`.
2. **Decide lines** — narrate each printed `⚠️` pair in plain language: `skipped-brief` means
   a later brief moved on while an earlier dependency was never planned; `out-of-order` means
   a later brief moved while an earlier one is still unplanned — both name the exact
   `/spec:plan` command to paste. An empty decide section is worth saying out loud: it's the
   "nothing to decide" answer the user came for.
3. **The footer glyph is the verdict** — read it back in one clause (ready / blocked / red CI
   / nothing waits) rather than re-deriving it from the blocks above.

## `--all` (everything the default screen omits)

`--all` prints the same Roadmap and Next blocks, every decide line (cap lifted), then two
sections the default screen never shows, then the same footer:

- **`📋 All open work`** — today's lane render, unchanged: `⚡ N parallel lanes…` / `🚦 solo`
  for the top tier, `🕓 after that:` for serial runner-ups, `⛔ blocked:` for entries with
  unmet dependencies, each with its branch lines. This is where the parallel-fan-out option
  and the full blocked list live now — narrate them exactly as before when the user asks "what
  else could I run."
- **`🧹 Hygiene ({h}) — /spec:doctor`** — one `[kind] {detail}` line per hygiene-audience
  anomaly. These describe a file to fix, not a choice — the full catalogue of hygiene kinds
  lives in `/spec:doctor` check 13; this list is `--all`'s pointer to it, never a second
  catalogue. On `hand-tracked-status`, quote the offending cell(s) from its line and offer to
  strip that column from `00-overview.md` — that edit is sanctioned because the overview
  template itself outlaws the column; it is the single edit this command may make, and it
  still requires the user's yes.

Do not re-derive, second-guess, or embellish the script's statuses, and never offer to
"fix" a status by editing `status:` frontmatter — statuses only move by running the pipeline
stage that owns the transition (the state machine is hook-enforced).
