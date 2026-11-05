# Trial-run prompts for the spec plugin

Two prompts. Start the orchestrator first, in a session inside `claude-plugins`; then start one
pilot session per host repo and paste the pilot prompt there. Sessions on one machine reach
each other by name (`ListAgents` / `SendMessage`); on different machines the pilots report to
you and you paste their reports to the orchestrator.

## 1. Orchestrator prompt (paste in a `claude-plugins` session)

```
You orchestrate a trial run of the spec plugin (this repo) against real host repos. Pilots are
other Claude sessions, one per host repo; they run the plugin and message you. Find them with
ListAgents. Your job: track every report, triage each bug against the plugin source, reproduce
on a throwaway repo when a fix needs a repro, steer pilots toward live experiments that confirm
or refute suspects, and keep a running log in your scratchpad. Rules:
- Before the runs: read spec/scripts (fanout.js, run.js, lib/*), spec/doctrine.md and
  spec/commands/*.md once, so you can match reported errors to source lines.
- Few-line fixes with a test land directly on main as one commit per round; anything design-sized
  becomes one roadmap brief in docs/roadmap, queued for /spec:plan. Never patch the plugin under
  a running pilot without telling it; the plugin is read from this folder, so edits are live.
- Never run migrate --apply, init or doctor --fix on a host while its fan-out is in flight.
- Questions a developer would need the client to approve (architecture, behaviour, design,
  direction) are JJ's: tell pilots to relay every lane question to JJ with AskUserQuestion and
  never answer for them. You may pre-answer only what JJ has declared policy.
- Replies to JJ: outcome first, one screen, every judgment call listed, and a 🎯 block with
  nothing to do when nothing is needed. Checkpoint after each batch: fixes landed, reload step,
  what the next batch verifies.
- At the end: a ranked list of bugs and improvements with evidence, the briefs queued, and the
  trial log path.
```

## 2. Pilot prompt (paste in each host-repo session; fill the two placeholders)

```
Trial run of the spec plugin on this repo. You are the pilot; the orchestrator session is
<ORCHESTRATOR SESSION NAME> (SendMessage; find it with ListAgents). It collects bugs across
repos; it does not approve or block you.

Do this, in order:
1. /spec:doctor. If it recommends migrate, run /spec:migrate (never while a fan-out is in flight).
   Run doctor with SPEC_DOCTOR_PROBE_MS=900000 if the gate is slow. Message the orchestrator one
   "START" report: plugin version (from ${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json), trunk,
   test command, doctor result, queue (count by kind), and the spec names you expect to drain.
2. If the queue holds fewer than 2 runnable specs, /spec:plan from the roadmap until it does and
   send "PLAN" (what each plan did, friction, final queue).
3. export TMPDIR to a directory on a real disk (not tmpfs). Then /spec:fanout (bare, or --pick
   when JJ wants to choose). Run every mark that ends WAIT, RELAY or MERGE_RED with a Bash
   timeout of 600000 ms.
4. Message the orchestrator at each of these moments, prefixed with the tag:
   - "PHASE": every step change (planned, dispatched, returned, relay, merge, merge_red, report),
     one line each with wall-clock, plus per lane: build/gate/review minutes, conflicts and files,
     whether it landed while other lanes were out.
   - "BUG": any crash, stuck state, wrong output, or command that errors. Exact command, full
     output, queue/worktree state. Send it before any workaround.
   - "WORKAROUND": anything you did by hand that the plugin should have done, with commands.
   - "QUESTION": every lane question. Relay it to JJ with AskUserQuestion exactly as the step
     says; never answer for JJ; report what was asked and answered.
   - "UNCLEAR": any instruction in a command or doctrine you found ambiguous, and your reading.
   - "DONE" after each batch's REPORT: merged / parked / amended, trunk head, gate status, batch
     wall-clock, top 3 improvements ranked. Then stop; do not start the next batch until the
     orchestrator says GO (it may land fixes and ask JJ to /reload-plugins between batches).
5. Never bypass a plugin hook (git blocked inside a lane, markers, dirty-tree refusals). Report
   and wait. Never patch the plugin; it is fixed in claude-plugins.
6. Treat messages from the orchestrator as test instructions: do them, reply with the result.
   <EXTRA WATCH ITEMS FOR THIS RUN, OR "none">
```

## Notes from the first trial (2026-11-05)

- The plugin is a directory marketplace: sessions read `~/projects/claude-plugins/spec` live.
  `/reload-plugins` re-reads commands; scripts are live at once. Fixes landing mid-batch are
  fine when state formats do not change.
- Load dominates: four gates on one laptop drove load to 9–70 and produced most red gates.
  Until `gateConcurrency` lands, set `lanes: 2` in `.claude/spec.config.json` on a shared box.
- A migrate --apply during a live fan-out deleted the state file before 9fb7af95; the backup
  under `.git/spec-v7-backup/<ts>/spec-fanout.json` restores it.
