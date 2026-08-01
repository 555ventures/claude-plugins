---
date: 2026-08-01
status: implementing
risk: T3
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: [specs/20260801/01-telegram-adapter.md, specs/20260801/02-session-runner.md]
depended_on_by: []
brief: n/a
spiked: 2026-08-01
---

# autopilot 03 — lane engine & daemon

## Goal

The daemon itself: load a per-host config, run one lane per project, and in each lane loop
`spec-status --next --json` → brief checkpoint → stage session → halt-or-advance, relaying
every human decision to Telegram (BRIEF.md architecture sketch, lines 29–43). Done means
`autopilotd` drives a synthetic host repo through the loop against fake adapter/session
implementations, and every BRIEF locked decision (#2–#7) is pinned by an AC.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | v1 concurrency = one lane per project (repo); stages within a repo run serially; no worktrees, no `/git:enter-worktree` | BRIEF #7's "all ~10 projects in parallel" is cross-repo; within-repo parallel lanes (worktrees, merge mutex, `build_base`) are deferred — rejected: per-spec lanes (51% of brief pairs share files; measured) |
| D2 | The lane's oracle is `node <specDir>/scripts/spec-status.js --root <repo> --next --json`; the pick is the FIRST `next[]` entry not in the lane's skip set (D5) with `blockers.length === 0` — none ⇒ idle; the daemon NEVER re-derives stage routing (choosing among the oracle's own admissible entries is selection, not derivation). Oracle non-zero exit or unparseable JSON ⇒ treat as `retryable` (D6 backoff) and narrate 🚫 once | v6.20.0 sole-derivation rule; the JSON mode exists exactly for machines; note `/spec:sketch` is not in the oracle's action alphabet — sketch stays laptop-interactive, an explicit v1 deferral of BRIEF #1's fullest scope (Rationale) |
| D3 | Config lives at `~/.config/autopilot/config.json` (overridable `--config`); per-lane fields: `project, root, topicId, devServerCommand?, tunnelCommand?, pollSeconds?`; host-level: `botToken, supergroupId, allowedUserIds, specPluginRoot, pluginPaths` | The daemon is per-host and spans repos, so config is per-host, not per-repo; command templates keep tunnel/dev-server provider-neutral (Tailscale or cloudflared) |
| D4 | Brief checkpoint (BRIEF #2/#3): when the pick's brief differs from the lane's last-completed brief — or the pick's path is a roadmap brief (`/spec:plan @docs/roadmap/…`) — start `devServerCommand` + `tunnelCommand` (process-group spawn, `smoke.sh` pattern), post "🟡 Brief NN next — start?" with the tunnel URL and [▶ Start] [⏸ Hold] buttons, and spawn nothing until ▶ | One pause per brief, dev server inspectable from phone or laptop; rejected: checkpoint per spec |
| D5 | Halt policy (BRIEF #4): stage outcome `failed` → one repair session (`model:"fable"`→opus fallback, prompt = stage command + failure detail) → still `failed` → lane state `halted`, post "🚫" with [➡ Next spec] [⏸ Stay parked]; NEVER auto-advance | Locked decision; ➡ adds the spec path to an IN-MEMORY skip set (cleared by daemon restart — deliberately not persisted; a restart is the operator's reset lever), the oracle pick then filters through it (D2), and the spec stays untouched on disk. Skip set exhausts `next[]` ⇒ idle with a "all admissible specs parked" notice |
| D6 | `retryable` outcomes back off exponentially per lane: 30s base, ×2, cap 15min, forever | BRIEF #7: rate limiting degrades throughput, never crashes a lane |
| D7 | Lane state persisted at `~/.config/autopilot/state/<project>.json` (`{state, spec, stage, brief, updatedAt}`) — advisory only; on restart every lane re-derives from `spec-status`, restores ONLY `lastBrief` (skip set is memory-only per D5), and a question that was pending at crash re-materializes because the stage RE-RUNS and asks again — the ask is repeated, never defaulted, satisfying BRIEF #5 (no decision by timeout or by crash) | The spec state machine on disk is ground truth; a daemon crash must never strand a lane (BRIEF gap #5: question-pending has no host-repo artifact) |
| D8 | Daemon entry `autopilot/bin/autopilotd`: refuses to start when `AUTOPILOT_SESSION=1` (exit 2, recursion guard per spec 02 D6) or when Node < 20.19.0 (exit 2 naming the floor — spec 02 D11); SIGTERM/SIGINT → abort in-flight sessions (which `cancelAsk`s any pending topic ask — spec 01 AC-9), kill dev-server process groups, persist lane states, exit 0 | Boot-path discipline; the same double-kill pattern as `smoke.sh` |
| D9 | Stage narration (BRIEF sketch "shared"): one topic message per stage transition — start (`▶ /spec:build …`), done (first line of the session's report + 💰 cost), halt/idle — never streamed transcripts | Phone-glanceable; transcripts stay on the host |
| D10 | Review stages run unmodified `/spec:review <spec>` — the session itself merges locally on CLEAN (existing merge-back path); the daemon never pushes and never runs git | BRIEF #6; review.md already forbids push; daemon adds nothing |
| D11 | Merge/strategy and any other in-session AskUserQuestion forks flow through the ordinary question relay — the daemon special-cases nothing | One relay path; review.md's strategy fork arrives with `RECOMMEND` context already in the question |
| D12 | Screenshots (BRIEF #9) via optional per-lane `screenshotCommand` template (`{url}`/`{out}` placeholders, e.g. `npx playwright screenshot {url} {out}`); when set, checkpoint and asking-state messages that carry a URL attach a capture via `adapter.sendPhoto`; unset or failing → URL-only message, never blocks | Keeps Playwright out of autopilot's dependency tree; hosts that have it get inline previews — rejected: a hard playwright dep |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/config.js | CREATE | scripts | load/validate config (`--config` flag, defaults, fail-loud misconfig with remedy) |
| autopilot/daemon/lane.js | CREATE | scripts | lane state machine: idle/checkpoint/running/asking/backoff/halted; oracle polling; halt policy; narration |
| autopilot/daemon/checkpoint.js | CREATE | scripts | dev-server + tunnel process-group spawn/kill, tunnel-URL capture from command stdout |
| autopilot/bin/autopilotd | CREATE | scripts | entry: recursion guard, config, adapter + real sdk wiring, N lanes, signals (D8) |
| autopilot/config.example.json | CREATE | other | documented example config |
| autopilot/.claude-plugin/plugin.json | MODIFY | other | bump 0.2.0 → 0.3.0 |
| tests/autopilot/config.test.js | CREATE | tests | AC-20260801-03-8 |
| tests/autopilot/lane.test.js | CREATE | tests | AC-20260801-03-1..7, fake adapter + fake runStage + synthetic host repo |
| tests/autopilot/checkpoint.test.js | CREATE | tests | AC-20260801-03-9, fake commands (`echo`/`sleep`) |

## Contracts

```js
// autopilot/daemon/lane.js
createLane({
  cfg,               // one lane's config row (D3)
  adapter,           // spec 01 surface (injected fake in tests)
  runStage,          // spec 02 surface (injected fake in tests)
  oracle,            // async () => nextJson — default shells to spec-status.js (D2); injected in tests
  stateDir,          // for the advisory lane-state file (D7)
  log,
}) => ({ start(), async stop(), state() })

// lane states: "idle" | "checkpoint" | "running" | "asking" | "backoff" | "halted"
// oracle pick contract (from spec-status.js --next --json, verified):
//   { next: [ { action, path, status, brief, blockers: string[], parallel, parallel_reason, note } ] }

// autopilot/daemon/checkpoint.js
async startSurfaces({devServerCommand, tunnelCommand, cwd, log})
  => ({ tunnelUrl /* first https:// URL on tunnel stdout OR stderr (cloudflared prints to
        stderr), 60s timeout → null */, async stopAll() })
// spawn with detached:true (new process group); stopAll(): SIGTERM group, 10s, SIGKILL group.

// config.json (D3) — full example ships as autopilot/config.example.json
{ "botToken": "…", "supergroupId": -100123, "allowedUserIds": [111],
  "specPluginRoot": "/abs/path/claude-plugins/spec",
  "pluginPaths": ["/abs/path/claude-plugins/spec", "/abs/path/claude-plugins/git"],
  "lanes": [ { "project": "prax", "root": "/abs/prax", "topicId": 7,
               "devServerCommand": "npm run dev", "tunnelCommand": "cloudflared tunnel --url http://localhost:3000",
               "pollSeconds": 300 } ] }
```

## Behavior

- **Lane loop:** `idle` → oracle → empty/blocked ⇒ notify once per distinct oracle answer
  (dedupe by hash — no spam), sleep `pollSeconds` (default 300), repeat. Pick present ⇒
  checkpoint test (D4) ⇒ `running`: `runStage({repoRoot: cfg.root, prompt: "<action> <path>",
  model: action==="/spec:plan" ? "fable" : undefined, pluginPaths, onQuestion, onPermission})`.
  `onQuestion` flips the lane to `asking` (narrate "⚠️ needs you — 30-sec decision"), awaits
  `adapter.askButtons` (forever — BRIEF #5), flips back on answer. Outcome `done` ⇒ narrate +
  loop to oracle (the oracle, not the session, decides what changed). `retryable` ⇒ `backoff`
  (D6). `failed` ⇒ repair-then-halt (D5).
- **Checkpoint detail:** lane remembers `lastBrief` (from the previous pick's `brief` field,
  persisted in the lane state file). A pick whose `brief` differs (or `n/a`→different path
  prefix, or a roadmap-brief path) triggers it. [⏸ Hold] leaves the lane in `checkpoint`;
  the buttons stay live — replay-safe taps, one pending ask per topic (spec 01 A2 holds
  because the checkpoint IS the lane's single ask).
- **Question relay wiring:** `onPermission` posts allow/deny buttons through the same
  `askButtons` path (2 options, header "Permission"); the state-gate/question-style hooks run
  inside the session untouched (spec 02 D5).
- **Free-text ("Other…")** answers route via `adapter.onText` → the lane's pending ask
  (spec 01 D7).
- **Idempotent restart:** on boot each lane reads its advisory state only to restore
  `lastBrief`; the skip set is memory-only and starts empty (D5), and everything else
  re-derives (D7). In-flight sessions from a previous daemon life are gone — the spec state
  machine makes re-running the stage safe (`implementing` re-picks `/spec:review`, etc.),
  and a question pending at crash is re-asked by the re-run stage (D7).

## Acceptance Criteria

- **AC-20260801-03-1**: WHEN the oracle returns `{next:[{action:"/spec:build", path:"specs/20260801/05-x.md", brief:"03", blockers:[]}]}` and the lane's `lastBrief` is `"03"` THE SYSTEM SHALL call `runStage` with prompt exactly `/spec:build specs/20260801/05-x.md` and no checkpoint → tests/autopilot/lane.test.js
- **AC-20260801-03-2**: WHEN the pick's `brief` is `"04"` and `lastBrief` is `"03"` THE SYSTEM SHALL post a checkpoint message containing the tunnel URL and [▶]/[⏸] options and SHALL NOT call `runStage` until ▶ is answered (fake adapter resolves after an assertion window) → tests/autopilot/lane.test.js
- **AC-20260801-03-3**: WHEN `runStage` resolves `{outcome:"failed", detail:"gate red"}` THE SYSTEM SHALL invoke exactly one repair `runStage` with `model:"fable"`, and if that also fails SHALL set lane state `halted` and post options [➡ Next spec]/[⏸ Stay parked] — and SHALL NOT call `runStage` again unanswered → tests/autopilot/lane.test.js
- **AC-20260801-03-4**: WHEN `runStage` resolves `{outcome:"retryable"}` repeatedly THE SYSTEM SHALL space the re-attempts by ~30s, ~60s, ~120s … capping at 900s (attempt 6+ all ~900s apart, fake timers) and keep the lane alive indefinitely → tests/autopilot/lane.test.js
- **AC-20260801-03-5**: WHEN a session's `onQuestion` fires with a 2-option question and the fake adapter resolves `{"Merge strategy?":"squash"}` after a delay THE SYSTEM SHALL pass exactly that answers object back and narrate the ⚠️ asking state in the topic → tests/autopilot/lane.test.js
- **AC-20260801-03-6**: WHEN the oracle returns `{next:[]}` twice with identical content THE SYSTEM SHALL post the idle notice once (dedupe), and WHEN its content changes SHALL post again → tests/autopilot/lane.test.js
- **AC-20260801-03-7**: WHEN `stop()` is called with a session in flight THE SYSTEM SHALL abort it (spec 02 signal), call `adapter.cancelAsk(project)` if the lane was `asking`, persist the lane state file with the current `lastBrief`, and resolve → tests/autopilot/lane.test.js
- **AC-20260801-03-8**: WHEN config is missing a required field (e.g. no `botToken`) THE SYSTEM SHALL exit 2 with a message naming the field and the config path (literal: `autopilotd: config missing "botToken" — edit ~/.config/autopilot/config.json`); WHEN two lanes share a `topicId` or a `root` THE SYSTEM SHALL exit 2 naming both offending projects (one-ask-per-topic and one-lane-per-repo are load-bearing invariants) → tests/autopilot/config.test.js
- **AC-20260801-03-9**: WHEN `startSurfaces` runs `tunnelCommand` printing `…https://abc.trycloudflare.com…` on stdout THE SYSTEM SHALL resolve `tunnelUrl:"https://abc.trycloudflare.com"`, and `stopAll()` SHALL leave no live child processes (poll kill(pid,0)) → tests/autopilot/checkpoint.test.js
- **AC-20260801-03-10**: WHEN `autopilotd` starts with `AUTOPILOT_SESSION=1` in its environment THE SYSTEM SHALL exit 2 with a recursion-guard message before reading config → tests/autopilot/lane.test.js (spawn `bin/autopilotd` via runNode-style helper)
- **AC-20260801-03-11**: WHEN a lane with `screenshotCommand:"node cap.js {url} {out}"` posts a checkpoint carrying tunnel URL `https://t.example` THE SYSTEM SHALL run the command with placeholders substituted and call `adapter.sendPhoto` with the produced file; WHEN the command exits non-zero THE SYSTEM SHALL still post the text message with the URL (no photo, no crash) → tests/autopilot/checkpoint.test.js
- **AC-20260801-03-12**: WHEN the lane is `halted` on `specs/a.md` and [➡ Next spec] is answered and the oracle returns `{next:[{path:"specs/a.md",blockers:[]},{path:"specs/b.md",blockers:[]}]}` THE SYSTEM SHALL pick `specs/b.md`; WHEN `next[]` contains only skipped/blocked entries THE SYSTEM SHALL idle with an "all admissible specs parked" notice, and after daemon restart the skip set SHALL be empty (a.md picked again) → tests/autopilot/lane.test.js
- **AC-20260801-03-13**: WHEN the oracle exits non-zero or prints unparseable JSON THE SYSTEM SHALL narrate 🚫 once, enter `backoff`, and retry the oracle on the D6 schedule (lane never crashes) → tests/autopilot/lane.test.js

## Assumptions (escalation triggers)

- A1: `spec-status.js --next --json` shape `{next:[{action,path,status,brief,blockers,parallel,parallel_reason,note}]}` with exit 0 (verified by execution against `tests/fixtures/minimal-host`, 2026-08-01) stays stable — **if false:** the oracle wrapper is one function; tests pin OUR consumption via injected oracle, plus one integration AC-style test may exec the real script against a fixture.
- A2: session-side spec commands behave headless exactly as interactive (hooks fire, review merges locally, run-ledger rows append) — **if false:** the daemon's oracle re-derivation still prevents state corruption; the failing stage surfaces as `failed` → halt policy → JJ's phone.
- A3: tunnel commands print their public URL on stdout/stderr within 60s (true for `cloudflared tunnel --url` and `tailscale funnel`) — **if false:** `tunnelUrl:null` → checkpoint message says "dev server up locally; no tunnel URL captured" and continues — never blocks the checkpoint.
- A4: one pending ask per topic (spec 01 A2) — the lane serializes its own asks; checkpoint, permission, and question asks never overlap within a lane — **if false:** lane.js already serializes on `state`; a violation is a bug, not a design gap.
- A5: `~/.config/autopilot/` is writable on both macOS and Linux hosts — **if false:** `--config`/`--state-dir` flags override; error names the remedy.

## Rationale

The engine is deliberately a thin consumer of three contracts it does not own: the oracle
(`spec-status --next --json`, D2 — the daemon adds zero routing intelligence, per the
v6.20.0 incident rule), the session runner (spec 02), and the adapter (spec 01) — so every
lane test injects all three and the daemon's own logic (checkpoint gating, halt ladder,
backoff, dedupe, restart re-derivation) is what's actually pinned. The biggest planning
reversal is D1: the brief's architecture sketch shows per-spec worktree lanes, but its locked
decision #7 says "all ~10 projects in parallel" — cross-repo. Serial-within-repo needs no
`/git:enter-worktree`, no `build_base`, no merge mutex (merge-back requires a clean root and
target checked out — trivially true when the lane is the repo's only writer). That entire
surface returns only if within-repo parallelism is ever wanted. D7's advisory-state stance
comes from the discovery gap: "question pending" exists nowhere in the host repo, so the
daemon persists it — but never trusts it over `spec-status`. Fragile: A2 (headless parity)
and spec 02's A2 (answers wiring) are the two claims only a live smoke can fully retire —
run one lane against a scratch repo before pointing the daemon at ten real projects.
Refuter findings folded: tunnel capture reads stdout AND stderr (cloudflared — the shipped
example — prints to stderr); the halt skip set is memory-only with defined [➡] selection
semantics (D2/D5/AC-12); oracle failure is a defined `backoff` transition (AC-13); crash-time
pending questions re-materialize via stage re-run, which is repetition not defaulting
(D7 — BRIEF #5 honored); config rejects duplicate topicId/root (AC-8). Two explicit
deferrals, not silent drops: `/spec:sketch` is absent from the oracle's action alphabet, so
roadmap sketching stays laptop-interactive in v1 (BRIEF #1's fullest scope narrows; revisit
if spec-status ever derives a sketch action); BRIEF #9's approve/redo buttons arrive via the
ordinary in-session question relay (D11) — no dedicated AC, verified at the live smoke. The
in-process DI test mode these ACs need is sanctioned by the § Test Rules amendment riding in
spec 02's File Plan.

## Canonical Delta

Append to `docs/canonical/autopilot.md`: the daemon (`autopilot/bin/autopilotd`) runs one
lane per project from `~/.config/autopilot/config.json`; lane states
idle/checkpoint/running/asking/backoff/halted; the oracle is `spec-status.js --next --json`
(never re-derived); halt policy = one Fable repair pass then park-and-ask; brief checkpoints
tunnel the dev server; the daemon never pushes; restart re-derives everything — lane-state
files are advisory.
