---
description: The session queue's command surface — wraps spec-queue.js's next/add/bump/defer/done/list/ok subcommands in one script run per invocation; stores the one thing the pipeline cannot derive, JJ's intended work order across briefs plus free-text items and their done-when predicates, so /spec:status's --next stays queue-aware with zero hand reconstruction
argument-hint: "[subcommand] [args…] — next|add|bump|defer|done|list|ok; bare invocation defaults to next. add takes a payload plus optional --brief NN, --when <type>:<args>, --top | --after <ref>; bump/defer/done/ok take a <ref> (id, brief number, or unique payload substring)"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read
---

# Spec Queue: Durable Sequencing Behind `--next`

The queue is a single per-repository file (`spec-queue.json`, in the git common directory —
never inside the checkout, never in `git status`) holding an ordered to-do list: briefs by
number, plus free-text prompt items with a done-when predicate. `/spec:status`'s `--next`
derivation reads it as a read-only overlay; this command is the *only* way it is ever
written. This command **never edits `spec-queue.json` directly** — every mutation goes
through `spec-queue.js`, which owns reconciliation, seeding, and doneness in one place
(`spec/scripts/lib/queue.js`). There is no hand-tracked fallback: an absent or unparseable
answer is correct, a hand-reconstructed queue ordering never is.

**Intended model: any.** Run `spec-paths shared-for queue` and read what it prints. No
judgment happens here — the script derives and writes, you render its output.

## Input

`$ARGUMENTS` — `<subcommand> [args…]`. Subcommands: `next` (reconcile+write, print the top
undone item plus any veto notices — the default when `$ARGUMENTS` is empty), `list` (full
queue render), `add <payload…>` (append; classify as a `brief` item when given `--brief NN`,
a payload matching `^\d{2}[a-z]?$`, or a roadmap path — otherwise a `prompt` item stored
verbatim, with `--when <type>:<args>` for a predicate and `--top` / `--after <ref>` for
placement), `bump <ref>` (move to top, clear `auto_placed`), `defer <ref> [--after <ref2>]`
(move to end or after `<ref2>`, clear `auto_placed`), `done <ref>` (manual tick: stamp
`ticked`, clear `auto_placed`), `ok [<ref>]` (accept auto-placement — clear the flag, keep
position). Pass everything after the subcommand straight through — never reparse or validate
`<ref>`/`--when` shapes yourself; the script's usage/ambiguity errors already name the fix.

## Run

One script run per invocation, subcommand forwarded verbatim:

```
node "$(spec-paths spec-queue)" <subcommand> [args…]
```

If the run exits non-zero, print its stderr and stop — never reconstruct the intended
ordering, a predicate's doneness, or an item's position by hand. Exit codes carry their own
remedy: `2` (usage error or an unresolvable `<ref>` — remedy is `spec-queue list`, to see the
candidates) and `3` (not a git repository — remedy is running inside the repo) both print a
named next step; `0` covers both a successful mutation and "nothing to say."

## Render (Console Output Style — the script output IS the render)

Print the script's stdout **verbatim**. `list` uses the closed legend
`✅ done · ▶ top · ○ pending · 🅰 auto-placed` — reproduce it as printed, never rebuilt as a
markdown table or re-sorted by hand. For `next`, the top line is the paste-ready pick
(a brief's derived `/spec:plan`/`/spec:build`/`/spec:review` line, or a prompt item's payload
verbatim with no `@path` suffix); an `auto_placed` item still pending veto prints as a
trailing notice naming both `spec-queue bump <ref>` (reject the automatic placement) and
`spec-queue ok <ref>` (accept it) — narrate that choice in one sentence, never pick for the
user. After the block, add only what the script cannot: one sentence naming what changed
(`add`/`bump`/`defer`/`done`/`ok`) or, for `next`/`list`, one sentence naming the top
pick's relationship to the rest of the pipeline (e.g. "this jumps ahead of the closest-to-done
ranking because it's queued above it").

## Rules

- Never edit `spec-queue.json` directly, under any circumstance — every mutation is a
  `spec-queue.js` subcommand, so reconciliation and doneness are derived exactly once
  (`spec/scripts/lib/queue.js`), never duplicated in this command's judgment.
- Never hand-derive an item's doneness, position, or the top pick — an `add`/`bump`/`defer`
  that appears to have "obviously" landed in the wrong place is reported to the user with the
  script's own output, never silently corrected by a second write.
- `auto_placed` items are a veto surface, not a defect: reconciliation inserts them
  deterministically from on-disk brief provenance (a `Depends on:` list, or a letter-suffix
  parent), and they stay flagged until the user runs `bump`, `defer`, `done`, or `ok` —
  narrate the notice, never clear the flag yourself by editing the file.
- There is no session-start hook: the queue surfaces only when you invoke this command —
  `next` or `list` is the session check-in.
