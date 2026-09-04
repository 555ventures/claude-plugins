---
description: The session queue's command surface — wraps spec-queue.js's next/list/add/move/done subcommands in one script run per invocation; stores the one thing the pipeline cannot derive, the user's intended work order across briefs, ad-hoc specs, and free-text items plus their gates and done-when predicates, so /spec:status's --next stays queue-aware with zero hand reconstruction
argument-hint: "[subcommand] [args…] — next|list|add|move|done; bare invocation defaults to next. add takes a payload plus optional --top | --at <n>, --after-spec <path> | --after-brief NN, --when <type>:<args>. move takes a <ref> and a pending position <n>. done takes a <ref>"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read
---

# Spec Queue: Durable Sequencing Behind `--next`

The queue is a single per-repository file (`spec-queue.json`, in the git common directory —
never inside the checkout, never in `git status`) holding an ordered to-do list: briefs by
number, ad-hoc specs by path, and free-text prompt items, any of which may carry an `after`
gate on a spec or a brief. `/spec:status`'s `--next` derivation reads it as a read-only
overlay; this command is the *only* way it is ever written. This command **never edits
`spec-queue.json` directly** — every mutation goes through `spec-queue.js`, which owns
reconciliation, readiness, and doneness in one place (`spec/scripts/lib/queue.js`). There is
no hand-tracked fallback: an absent or unparseable answer is correct, a hand-reconstructed
queue ordering never is.

**Intended model: any.** Run `spec-paths shared-for queue` and read what it prints. No
judgment happens here — the script derives and writes, you render its output.

## Input

`$ARGUMENTS` — `<subcommand> [args…]`. Subcommands:

- `next` — reconcile+write, print the pick (a brief's derived `/spec:plan`/`/spec:run` line,
  or a prompt item's payload verbatim); the default when `$ARGUMENTS` is empty.
- `list` — pending items only, numbered exactly as `move`/`--at` count them, gated entries
  shown, a done-count footer.
- `add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when
  <type>:<args>]` — classify the payload yourself only to describe it back to the user; the
  script does the real classification (`NN`/`NNa` or a `docs/roadmap/NN-*.md` path → brief; a
  path matching `^specs/.*\.md$` → spec; anything else → prompt verbatim) and refuses a
  brief/spec already queued.
- `move <ref> <n>` — reorder: `<n>` counts pending positions the way `list` prints them;
  `<n>` at or past the end places last.
- `done <ref>` — manual tick.

`<ref>` resolves against a brief number, a spec path (exact or unique basename substring), a
unique prompt-payload substring, or an item id. Pass everything after the subcommand straight
through — never reparse or validate `<ref>`/`--when`/`--after-*` shapes yourself; the
script's usage/ambiguity errors already name the fix.

`bump`, `defer`, `ok`, `add --after <ref>`, and `add --brief` no longer exist — the script
exits 2 naming the replacement (`move`, or `--at`/`--top` at add time); relay that message
verbatim rather than translating it.

## Run

One script run per invocation, subcommand forwarded verbatim:

```
node "$(spec-paths spec-queue)" <subcommand> [args…]
```

If the run exits non-zero, print its stderr and stop — never reconstruct the intended
ordering, a gate's readiness, or an item's position by hand. Exit codes carry their own
remedy: `2` (usage error, an unresolvable/ambiguous/already-done `<ref>`, a duplicate
brief/spec on `add`, a missing `--after-*` target, or a removed verb) always names the fix in
its own message; `3` (not a git repository) means run inside the repo; `0` covers both a
successful mutation and "nothing to say."

## Render (Console Output Style — the script output IS the render)

Print the script's stdout **verbatim**. `list` renders one line per pending item —
`{n}  {desc}`, with a trailing `  ⏳ after <target> (<state>)` on a gated, not-ready item —
followed by a footer `— {d} done · move: spec-queue move <ref> <n>`, or `✨ nothing pending ·
{d} done` when nothing is pending; reproduce it as printed, never rebuilt as a markdown table
or re-sorted by hand. For `next`, the top line is the paste-ready pick — a brief's derived
`/spec:plan`/`/spec:run` line, or a prompt item's payload verbatim with no `@path` suffix.
After the block, add only what the script cannot: one sentence naming what changed
(`add`/`move`/`done`) or, for `next`/`list`, one sentence naming the top pick's relationship
to the rest of the pipeline (e.g. "this jumps ahead of the closest-to-done ranking because
it's queued above it", or "waiting behind spec 04, which is still hardened").

## Rules

- Never edit `spec-queue.json` directly, under any circumstance — every mutation is a
  `spec-queue.js` subcommand, so reconciliation, readiness, and doneness are derived exactly
  once (`spec/scripts/lib/queue.js`), never duplicated in this command's judgment.
- Never hand-derive an item's readiness, position, or the top pick — an `add`/`move` that
  appears to have "obviously" landed in the wrong place is reported to the user with the
  script's own output, never silently corrected by a second write.
- A brief that lands on the roadmap is appended last on the next `spec-queue next`, with no
  mark and no notice — there is no accept step. The one way to say "this goes first" is
  `--top`/`--at <n>` at the moment an item is queued, or `move` afterward.
- There is no session-start hook: the queue surfaces only when you invoke this command —
  `next` or `list` is the session check-in.
