---
description: The session queue's command surface — wraps spec-queue.js's next/list/add/move/done subcommands in one script run per invocation; stores the one thing the pipeline cannot derive, the user's intended work order across briefs, ad-hoc specs, and free-text items plus their gates and done-when predicates, so /spec:status's --next stays queue-aware with zero hand reconstruction
argument-hint: "[subcommand] [args…] — next|list|add|move|done|show|groom; bare invocation defaults to next. add takes a payload plus optional --top | --at <n>, --after-spec <path> | --after-brief NN, --when <type>:<args>. move takes a <ref> and a pending position <n>. done takes a <ref>"
allowed-tools: Bash(spec-paths:*), Bash(node:*), Read, Agent, AskUserQuestion
---

# Spec Queue: Durable Sequencing Behind `--next`

One per-repository file (`spec-queue.json`, in the git common directory, never the checkout): an
ordered to-do list of briefs, ad-hoc specs and free-text prompts. `spec-queue.js`'s header is the contract.

**Intended model: any.** Run `spec-paths shared-for queue` and read what it prints. The script
derives and writes, you render; the only judgment is `groom`'s, and agents do the checking.

## Input — `$ARGUMENTS` is `<subcommand> [args…]`

- `next` — reconcile+write, print the pick; the default when `$ARGUMENTS` is empty.
- `list` — pending items only, numbered exactly as `move`/`--at` count them.
- `add <payload…> [--top | --at <n>] [--after-spec <path> | --after-brief NN] [--when <type>:<args>]`
  — the script classifies the payload and refuses a brief/spec already queued.
- `move <ref> <n>` — reorder: `<n>` counts pending positions the way `list` prints them.
- `done <ref>` — manual tick.
- `show <ref>` — the item's full, untruncated payload plus its id, kind and gate.
- `groom` — read-only: prints the flagged buckets (duplicates, cites-done, gate-met, stale), writes nothing.

## Run

One script run per invocation, everything after the subcommand forwarded verbatim (never
reparse `<ref>`/`--when`/`--after-*`):

```
node "$(spec-paths spec-queue)" <subcommand> [args…]
```

Non-zero exit: print its stderr verbatim and stop — every exit names its own fix.

## Render (Console Output Style — the script output IS the render)

Print the script's stdout **verbatim** — never a table, never re-sorted — then one sentence
naming what changed (`add`/`move`/`done`) or the top pick's place (`next`/`list`).

**`groom` checks before it proposes.** Flags are suspicion, not evidence. Fan out one read-only
`Agent {model: "haiku"}` per flagged item, all in one message, each given the item's `show` output
and the repo root: does the tree already hold what it asks for (name the file), did a done spec
supersede it (name the spec), or is it live (name what is missing)? Propose from that evidence,
flagged = presumed `done`; `keep` only with the missing piece quoted. Ask per item (`AskUserQuestion`,
≤ 4/call, one evidence line each); never tick without a yes. No agent, no proposal.

## Rules

- Never edit `spec-queue.json` directly — every mutation is a `spec-queue.js` subcommand.
- Never hand-derive readiness, position, or the top pick — a misplaced-looking `add`/`move` is
  reported with the script's own output, never silently corrected by a second write.
