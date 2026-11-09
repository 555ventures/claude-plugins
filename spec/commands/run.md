---
description: Take one hardened spec through build, review and merge in its own worktree
argument-hint: <spec path> [--in-place]
model: opus
effort: medium
allowed-tools: Bash(node *), Read, Edit, Grep, Glob, Agent, AskUserQuestion
---

Read `${CLAUDE_PLUGIN_ROOT}/doctrine.md` once, then drive
`node ${CLAUDE_PLUGIN_ROOT}/scripts/run.js $ARGUMENTS`. You dispatch agents; the driver opens
the worktree, gates, commits and lands. Every `▶ when done:` line carries `--root`, the
checkout the driver works in (a lane's worktree under fanout); run it as printed. Off trunk the
driver builds only with `--in-place`, and then lands nothing on trunk.

- **BUILD, REPAIR, FIX**: dispatch one `spec:builder` with the printed brief, mark `built`,
  `repaired` or `fixed`, then re-run the driver. A builder that replies a failure is a flake,
  timeout or test outside its diff changed nothing: mark `regate` (REPAIR, once per tree);
  `repaired` or `fixed` on an unchanged tree and unchanged `evidence.md` and `as-built.md` is refused.
  GATE also runs the pin tests of a spec with `prototype: <stem>` (the host's `prototype.e2eCommand`
  against the app the driver boots from `runtime`, restarted at every GATE; the cited prototype's own app is
  stopped first only when it holds the run's url, a fixed-port host, and otherwise runs on until `closed`); red is a REPAIR. `runtime.envCommand` runs once per worktree.
- **REVIEW**: dispatch one `spec:reviewer`, then mark `reviewed --file <findings path>`; a clean
  review runs through to DONE itself. Advisories become one queued fix item.
- **LOOK** (a `prototype:` spec, after a clean review): the app GATE booted is still up (one that is not —
  a run resumed after a wait, or a dead app — the driver boots first; one that cannot come up goes back to
  GATE, which says why); print the url and the look lines, end the turn. A literal `close enough` → mark `looked`; anything else → mark
  `look-failed --why "<the reply verbatim>"` (a FIX round with the reply as the symptom). The driver
  stops the app at both marks and at every ending of the run.
- **ESCALATE**: one of three questions, in the agent's own words — a false Assumption, a choice
  the reviewer says the spec did not make, a Decision the build cannot keep. Ask it as printed
  and mark `escalate <label>`; if the user dismisses it, mark `dismissed` (the run stops and the
  question is queued as a decide item). You record the user's pick; you never choose.
- **STOPPED**: the run ended by a rule (gate red past the repair cap, blocking past the fix cap,
  a dismissed question) with its item queued; print the report. A run that picked `amend` waits, committed as
  wip, for the spec: print `/spec:plan <spec>`; once it is locked with changed text on trunk (in place, on the
  branch), the same `/spec:run <spec>` rebases, takes the amended text and goes on through GATE and REVIEW.

Everything else is decided by a rule and printed as a 📌 line: spec text a build edits is
reverted and gated again, a file that looks like a secret stays out of the commit, rulings and
the builder's `as-built.md` lines go into the commit message. A conflict when the run lands leaves
the rebase in the spec's worktree: edit each conflicted file there to both sides' intent and re-run
the driver; it gates and reviews the result again. Your main checkout is never left mid-merge.

When a builder replies that a Decision cannot be honoured, mark `unmet --decision <id> --why <text>`;
when an Assumption with an `ask` arm proved false, mark `unmet --assumption <id> [--why <text>]`
(a written fallback is the builder's to apply). A build that needs another spec done first marks
`after --on <spec>`; it goes on by itself once that spec is done. An unmet Decision asks `amend`
(first, recommended), `retry` (only until Opus has had its turn) and `park`; a question with one answer left
is not asked: the run parks and says so in a 📌 line. As a lane, stop and return on
`PENDING_QUESTION`; a lane ends at DONE in its worktree and fanout lands it.
