# autopilot — founding brief

Remote-controlled roadmap driver: runs the spec pipeline continuously across many projects, relays every human decision to Telegram, and advances via `spec-status.js --next`. JJ answers fork questions from a phone; laptops/servers do the work.

Status: brief locked 2026-08-01 (three AskUserQuestion rounds). Next: /spec:plan directly — no sketch stage; autopilot has no visual surfaces. Telegram message formats are text contracts, pinned as test fixtures in the spec.

## Why a daemon, not a session

A Claude session cannot clear its own context and keep looping; each spec needs a fresh context. The loop therefore lives OUTSIDE any session: a driver daemon spawns one fresh Claude Agent SDK session per pipeline stage, discards it on completion (context clearing is structural), and intercepts AskUserQuestion/permission callbacks programmatically — the SDK exposes these; no hook gymnastics.

## Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Loop scope | Full pipeline remote: sketch → plan → design → build → review. Sketch/atlas and design catalogs reachable from mobile via tunnel. |
| 2 | Brief checkpoint | ONE pause per new roadmap brief, before sketch. Driver notifies Telegram ("Brief X next — start?") and waits for explicit go. Covers the whole brief's run; no second stop before plan. |
| 3 | Dev server at checkpoint | Driver starts the project dev server and tunnels it; checkpoint message includes the HTTPS link so the app can be sanity-checked from phone or laptop. |
| 4 | Halt policy | Gate failure after repair loop / review blockers → ONE Fable repair pass → if still failing, stop the lane, notify Telegram, and ask (buttons) whether to advance to the next admissible spec. Never auto-skip. |
| 5 | Unanswered questions | Wait forever. The asking lane blocks until JJ answers; nothing is ever decided by timeout. |
| 6 | Merge policy | CLEAN review merges locally (existing /spec:review merge-back) but NEVER pushes. Push is a manual human gate before anything reaches origin/CI. |
| 7 | Concurrency | All ~10 projects in parallel. Driver must implement 429/overload backoff so rate limiting degrades throughput gracefully, never crashes a lane. |
| 8 | Topology | Mixed local + remote hosts. One daemon per host, ONE Telegram bot token per host (getUpdates allows a single poller per token), all bots in one supergroup, one forum topic per project. Callback queries route to the bot that asked. |
| 9 | Mock/design review | Screenshots (Playwright) sent inline for quick verdicts + tunnel URL (Tailscale Funnel / cloudflared) to the live catalog/atlas for interactive review. Approve/redo via inline buttons. |
| 10 | Messaging platform | Telegram over Slack: one token per bot, long-poll works behind NAT, forum topics multiplex 10 projects, per-topic mute. Messaging goes through one thin adapter so Slack can be added later if teammates join. |
| 11 | Home | This plugin (`autopilot/`), sibling of `spec/` — daemon + Telegram adapter + per-host setup. Built through the spec pipeline itself. |

## Architecture sketch

```
per host: autopilot daemon (Node, tmux/systemd)
  config: repos on this host, bot token, supergroup id, topic map
  per project lane:
    1. node spec-status.js --next     → nothing? notify topic, lane idles
    2. new brief boundary?            → checkpoint: dev server + tunnel up,
                                        "start brief?" buttons, WAIT
    3. spawn fresh SDK session per stage (sketch/plan/design/build/review)
         AskUserQuestion → sendMessage w/ inline keyboard → tap → callback → answer
         design/sketch checkpoints → screenshots + tunnel URL
    4. stage gates fail → Fable repair pass → still failing? stop + ask
    5. review CLEAN → local merge, no push → back to 1
  shared: getUpdates long-poll loop, promptId→lane routing, 429 backoff,
          narration of stage transitions + gate results into each topic
```

## Constraints carried in from the plugins repo

- `spec-status.js --next` stays the sole source of "what's next" (v6.20.0 rule) — the daemon consumes it, never re-derives.
- Parallel-lane admission (brief topology) decides whether a parked spec blocks the next one (halt-policy decision #4).
- Workflow args no-free-text invariant applies to anything the daemon passes into sessions.
- Hosts opt in; the daemon must be a no-op on repos without the spec grounding layer.

## Deliberately out of v1

- Slack adapter (interface reserved, not built).
- Cross-host fleet dashboard beyond one topic per project.
- Any timeout-based auto-answering (decision #5 forbids it).
- Auto-push (decision #6 forbids it).
