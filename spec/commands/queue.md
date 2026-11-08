---
description: Show, add to, or reorder the work queue
argument-hint: "[next|list|groom|add [--top] [--type plan|prototype|fix|decide] [--after <NN|spec>]|move|done|show] [args…]"
allowed-tools: Bash(node *), Agent, AskUserQuestion
---

Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/queue.js $ARGUMENTS` (bare means `next`; `add --top`
puts the item first; `add --type plan|prototype|fix|decide` sets what a prose item pastes as, default `plan`;
`add --after <NN|spec>` holds the item until that brief's specs are done or that spec is done) and show its
output.

**The queue is the file plus the fill.** Agents mainly write the queue and you read it and reorder it. The file holds
what was placed; every unfinished brief and open ad-hoc spec nobody placed joins the end on every read, worked out
by `lib/queue.js` and never stored (ADR-0044; the rows are `lib/queue-rows.js`), so `list` shows the same work the status screen shows. A filled
item has no id (`—`): name it by its brief number or spec path. `move` or `done` on it stores that one item; `done`
on unfinished work prints `⚠️ <ref> is still open work, so it stays in the list`. `next` prints the real next
command (a prompt's paste line, else the derivation's top pick as `/spec:run @<spec>` with its `⏳` branches when it
is blocked) and never a blocked spec while an unblocked one exists. An item whose `--after` gate is unmet is skipped
by `next` and listed with `⏳ after <target> (<state>)`. When `/spec:run` or `/spec:fanout` merges a brief's last
spec and the brief's `## Steps outside specs` lists no open `- [ ]` box, the brief closes itself: its item is ticked
(an unstored brief leaves the fill) and the report says `📌 auto-closed brief NN (<name>) — its last spec merged and
<file> lists no open step (veto anytime)`. To veto, add an open box and the fill brings it back, or
`/spec:queue add NN`. With a box still open the brief stays queued and the report warns how many steps are open; an
in-place run, a superseded last spec or a box ticked after the merge closes nothing, and `done` closes it. `next`
skips a finished brief (every spec done, or superseded) and `list` ends its row with `✔ specs done — /spec:queue
done NN` (`✔ specs done, N step(s) open — …` with open steps, `⛔ superseded` for a superseded brief); the status
screen raises a decide line to close it.

`list` rows are `n  id  age  type  text` and end with the flags `🔨 in progress`, `⏳`, `📎 cites done`, `⌛ stale`: the
type column is 🏃 run, 📝 plan, 🧪 prototype, 🔧 fix or 📌 decide (a plain note has none). `list --json` is
`{items, done}`, each item carrying `type`, `ref` (what `move`, `done` and `show` accept) and `inProgress`. `show`
prints the id, kind, gate and full text. Every subcommand refuses a flag it does not take (`queue: <sub>: unknown
flag <flag>`, exit 2); `add` refuses a spec path with no file, a brief that is already queued however it is spelled,
and an exact duplicate, each naming its remedy. `add` takes a brief as `NN` or a roadmap path; `3` is prose.

`groom` is read-only: it prints the flagged buckets (`duplicates`, `cites done`, `gate met`, `stale`) or
`✨ nothing to groom · N pending`, takes no flag but `--root`, and writes nothing.

**Session rules.** A refusal's stderr is shown verbatim, then stop. A success's stdout is shown verbatim plus one
sentence. Never edit the queue file, and never work a row's position out by hand: `list` says it. A small fix lands
in this session, not in the queue, and work for another repo is never queued here.

**`groom` checks before it proposes.** Flags are suspicion, not evidence. Fan out one read-only
`Agent {model: "haiku", effort: "medium"}` per flagged item in one message, each only reading the repo and given the repo root
and `queue.js show <id> --json` (the id, kind and gate): done (name the file or spec) or live (name what is
missing)? Flagged = presumed `done`; `keep` only with the missing piece quoted. Hard evidence ticks with
`queue.js done <ref>` and `📌 Auto-picked done — <evidence> (veto anytime)`; ask only `keep`/ambiguous items
(`AskUserQuestion`, ≤ 4/call); never tick a keep or ambiguous item without a yes. No agent, no proposal.
