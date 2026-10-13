---
description: The session queue's command surface — wraps spec-queue.js's next/list/add/move/done subcommands in one script run per invocation; stores the one thing the pipeline cannot derive, the user's intended work order across briefs, ad-hoc specs, and free-text items plus their gates and done-when predicates, so /spec:status's --next stays queue-aware with zero hand reconstruction
argument-hint: "[subcommand] [args…] — next|list|add|move|done|show|groom; bare invocation defaults to next. add takes a payload plus optional --top | --at <n>, --after-spec <path> | --after-brief NN, --when <type>:<args>. move takes a <ref> and a pending position <n>. done takes a <ref>"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read
---

# Spec Queue: Durable Sequencing Behind `--next`

The queue is a single per-repository file (`spec-queue.json`, in the git common directory —
never inside the checkout) holding an ordered to-do list: briefs by number, ad-hoc specs by
path, and free-text prompt items. Enforced by `spec-queue.js` — its header comment is the contract.

**Intended model: any.** Run `spec-paths shared-for queue` and read what it prints. No
judgment happens here — the script derives and writes, you render its output.

## Input

`$ARGUMENTS` — `<subcommand> [args…]`. Subcommands:

- `next` — reconcile+write, print the pick; the default when `$ARGUMENTS` is empty.
- `list` — pending items only, numbered exactly as `move`/`--at` count them.
- `add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when
  <type>:<args>]` — the script classifies the payload and refuses a brief/spec already queued.
- `move <ref> <n>` — reorder: `<n>` counts pending positions the way `list` prints them.
- `done <ref>` — manual tick.
- `show <ref>` — the item's full, untruncated payload plus its id, kind and gate.
- `groom` — read-only: prints the flagged buckets (duplicates, cites-done, gate-met, stale), writes nothing.

Pass everything after the subcommand through verbatim — never reparse `<ref>`/`--when`/`--after-*`.

## Run

One script run per invocation, subcommand forwarded verbatim:

```
node "$(spec-paths spec-queue)" <subcommand> [args…]
```

If the run exits non-zero, print its stderr verbatim and stop — every exit names its own
fix; never reconstruct ordering, readiness, or position by hand.

## Render (Console Output Style — the script output IS the render)

Print the script's stdout **verbatim** — never a markdown table, never re-sorted.
After the block, add one sentence naming what changed (`add`/`move`/`done`) or the top pick's
place (`next`/`list`). For `groom`, propose a fate per flagged item, ask per item (`AskUserQuestion`, ≤ 4/call); never tick without a yes.

## Rules

- Never edit `spec-queue.json` directly, under any circumstance — every mutation is a
  `spec-queue.js` subcommand.
- Never hand-derive an item's readiness, position, or the top pick — an `add`/`move` that
  appears to have landed in the wrong place is reported to the user with the script's own
  output, never silently corrected by a second write.
