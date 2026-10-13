---
description: Where the work stands — one script run, four blocks: the roadmap, the 🎯 Next block carrying every startable command (lanes included), up to three decisions, and a one-line verdict footer; --all adds what isn't startable yet and the hygiene catalogue; /spec:doctor stays the deep audit
argument-hint: "[NN — optional brief number for a single-brief dependency readiness check] [--all — everything the default screen omits]"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read, Edit
---

# Spec Status: Where Am I?

Answer one question — *what do I paste next* — in one deterministic script run. This command
**never edits specs or briefs**; statuses are derived, never stored. The derivation (shared
verbatim with `/spec:doctor` check 13 and `/spec:plan`'s preflight) is implemented once in
`spec-status.js`; its header comment is the contract.

**Intended model: any.** Run `spec-paths shared-for status` and read what it prints. No
judgment happens here — the script derives, you render.

## Run

One bare run IS the whole dashboard — exactly four blocks, nothing else, ever. It embeds the
`--next` derivation, so there is no second run (`--pretty` is accepted as a no-op):

```
node "$(spec-paths spec-status)" --root .
```

With a brief number in `$ARGUMENTS` (e.g. `/spec:status 04`), run the single-brief preflight
instead and report **only** that brief's dependency readiness:

```
node "$(spec-paths spec-status)" --root . --brief NN
```

With `--all` in `$ARGUMENTS`, run the everything-screen instead (`🕓 after that:`,
`⛔ blocked:`, the hygiene catalogue):

```
node "$(spec-paths spec-status)" --root . --all
```

If the run errors, print the error and stop — never reconstruct statuses or a next
suggestion by hand; an absent answer is correct, a hand-derived one never is.

## Render (Console Output Style — the script output IS the render)

Print the dashboard output **verbatim, as a fenced code block** so its alignment and lane
connectors survive — never re-derive, reorder, restyle, or embellish its lines, and never
rebuild it as a markdown table. Then add the one thing the script can't: narration.

1. **After the block, narrate in one or two sentences** what the dashboard means for the user.
2. **Decide lines** — narrate each printed `⚠️` pair in plain language.
3. **The footer glyph is the verdict** — read it back in one clause.

## `--all` (everything the default screen omits)

- **`🧹 Hygiene ({h}) — /spec:doctor`** — one `[kind] {detail}` line per hygiene-audience
  anomaly; the full catalogue lives in `/spec:doctor` check 13. On `hand-tracked-status`, quote
  the offending cell(s) from its line and offer to strip that column from `00-overview.md` — it
  is the single edit this command may make, and it still requires the user's yes.

Never offer to "fix" a status by editing `status:` frontmatter.
