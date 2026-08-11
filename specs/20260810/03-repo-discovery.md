---
date: 2026-08-10
status: implementing
risk: T2
open_markers: 0
area: autopilot
design: false
breaking: false
depends_on: []
depended_on_by: [specs/20260810/04-hub-wired-daemon.md]
brief: 03
spiked: 2026-08-10
---

# autopilot discover — spec-grounded repo discovery + idempotent hub registration

## Goal

Kill the hand-typed `--project` flag as the only way a machine's repos become hub projects
(the 2026-08-10 incident: an enroll without it produced `"projects": []` and total
silence). A new `autopilot discover` subcommand scans one directory level under a
persisted repos root, identifies spec-grounded repos by the `/spec:init` artifact,
registers each against the hub's idempotent projects route, and rewrites `hub.json`.
`enroll` gains `--repos-root` so a fresh machine enrolls with its repos in one command.
Done = a box with N cloned spec-grounded repos needs zero typed project names.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | A repo is spec-grounded iff `<repo>/.claude/spec.config.json` exists | The `/spec:init` artifact; `docs/roadmap/`/`specs/` presence is NOT tested — spec-status tolerates their absence, and an empty-but-grounded repo should become an idle lane, not be invisible. Rejected: `generatedBy` gating (warn-only territory, not v1). |
| D2 | Scan exactly one repo-root level: `readdir(reposRoot, {withFileTypes: true})`, keep entries where `dirent.isDirectory()` is true — **symlinks are not followed** (a symlinked repo is not discovered; refuter-executed: `Dirent.isDirectory()` is `false` for a symlink to a directory) — skip names starting with `.` and `node_modules`, skip git-worktree checkouts (`.git` present as a regular **file**) | Repos live flat under a projects dir; deep recursion registers vendored fixtures and pipeline worktrees as phantom projects. Symlink-skip is the conservative pick (cheap to reverse; a follow policy can be added later without breaking anything). Worktree marker verified by spike (see A1). |
| D3 | Project name = directory basename. Under D2's single flat root, basename uniqueness is structural (readdir names are unique) — `discoverRepos` still asserts uniqueness defensively over its final list and throws `DiscoverError` naming **both** absolute paths (exit 2, register nothing) should a future caller merge lists | The basename rule is load-bearing (`hooks/session-wrapup.js` `repoBasename()` routes wrap-ups on it). A soft merge would silently share one Telegram topic via the idempotent route. Rejected: a `--project-name` remap flag (reintroduces per-repo hand-config and desyncs from the hook's rule). |
| D4 | `autopilot discover [--repos-root <dir>] [--json]`: read credential from `hub.json` (missing → exit 2, remedy `autopilot enroll`), scan, `POST /api/spokes/projects` per repo **sequentially in basename order**, rewrite `hub.json` (atomic, 0600) with the full registered `{projectId, name}` list and the resolved `reposRoot` | Sequential ordered registration makes output deterministic and failure attribution unambiguous. Partial registration on mid-run failure is harmless — the route is idempotent, re-running heals. |
| D5 | reposRoot resolution order: `--repos-root` flag → `hub.json.reposRoot` → `~/Projects` if it exists → exit 2 naming the flag | One persisted choice per machine; the default matches the fleet's layout convention. The flag value is persisted back to `hub.json` on success. |
| D6 | `enroll` gains `--repos-root <dir>`: discovery runs **before** the network exchange and its basenames ride `EnrollRequest.projects[]`; `reposRoot` persists into the written `hub.json`. `--project` stays, additive (deduped union). In the USAGE string, `[--repos-root <dir>]` is appended **after** `[--force]` — `tests/autopilot/enroll.test.js:251` (AC-20260808-01-9) pins the contiguous substring `--project <name>]…[--force]`, and inserting before `--force` would break that regression pin | The enroll route already accepts `projects[]` (`uniqueItems: true` in the vendored contract) and creates topics at enroll time — one round trip. Discovery failures (bad root, defensive collision) exit 2 **before** any network call, so a refused run never burns the one-time code (existing enroll.js discipline). |
| D7 | Shared spoke-HTTP helpers move to new `autopilot/daemon/hub-http.js` (`postJson`, `mintEventId`, `readCredential`); `wrapup.js` imports them and keeps re-exporting `mintEventId` for its existing consumers/tests | Second consumer has arrived (discover), so the seam earns its file (facades follow their first consumer). Behavior byte-identical — moved, not rewritten. |
| D8 | Registration responses with `created: true` vs `false` render distinctly in the human output (`+ registered` vs `= already registered`); `--json` emits `{reposRoot, projects: [{projectId, name, created, root}]}` on stdout | Operator feedback on re-runs must show drift-healing did something vs nothing; `--json` is the machine contract per script conventions. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| autopilot/daemon/discover.js | CREATE | scripts | `discoverRepos({reposRoot, fsImpl})` (pure scan, D1–D3) + `registerRepos({credential, repos, fetchImpl})` (D4) |
| autopilot/daemon/hub-http.js | CREATE | scripts | `postJson`/`mintEventId`/`readCredential` moved from wrapup.js verbatim (D7) |
| autopilot/daemon/wrapup.js | MODIFY | scripts | import from hub-http.js; keep public exports stable (D7) |
| autopilot/daemon/enroll.js | MODIFY | scripts | accept + persist `reposRoot`; merge discovered project names into the exchange (D6) |
| autopilot/bin/autopilot | MODIFY | scripts | `discover` subcommand + `enroll --repos-root`; usage/exit-code header updated (D4–D6) |
| autopilot/.claude-plugin/plugin.json | MODIFY | doctrine | version bump + description changelog line |
| tests/autopilot/discover.test.js | CREATE | tests | AC-20260810-03-1 … AC-20260810-03-8, AC-20260810-03-12 |
| tests/autopilot/enroll.test.js | MODIFY | tests | AC-20260810-03-9, AC-20260810-03-10; existing cases stay green (regression pins) |

## Contracts

`hub.json` gains one field (additive; absent in pre-existing files is valid):

```jsonc
{
  "hubUrl": "…", "spokeId": "…", "token": "…", "machineName": "…",
  "projects": [{ "projectId": "…", "name": "…" }],   // full list as of last discover/enroll
  "reposRoot": "/home/jj/Projects",                    // NEW — resolved absolute path
  "contractVersion": 1, "enrolledAt": "…"
}
```

`discoverRepos` returns `[{ name, root }]` sorted by name, or throws `DiscoverError`
(collision / unusable root; `.remedy` names the fix). Wire shapes are the vendored
contract verbatim: `RegisterProjectRequest { name }` →
`RegisterProjectResponse { projectId, name, created, contractVersion }`;
`EnrollRequest.projects: string[]` (uniqueItems).

## Behavior

- `discover` happy path: resolve root (D5) → scan (D1–D3) → register sequentially (D4) →
  atomically rewrite `hub.json` preserving all other fields → print one line per repo
  (D8). Zero repos found is a success (exit 0) that says so — an empty fleet box is not
  an error.
- Any non-2xx from the projects route: exit 1 naming the failing repo and the HTTP
  status; `hub.json` is **not** rewritten (next run heals — idempotent). Network-throw
  gets `postJson`'s existing one-retry.
- `enroll --repos-root`: discovery errors exit 2 pre-network (code not burned). The
  union of `--project` values and discovered basenames (deduped, sorted) rides
  `projects[]`. Post-enroll, `hub.json` carries the hub's returned project list plus
  `reposRoot`.
- Depth is exactly one level: `<root>/repo/.claude/spec.config.json` matches;
  `<root>/a/b/.claude/spec.config.json` never does.

## Acceptance Criteria

- **AC-20260810-03-1**: WHEN `discoverRepos` scans a root containing a directory with
  `.claude/spec.config.json`, a directory without it, a file, and a `.hidden` directory
  THE SYSTEM SHALL return only the grounded directory (e.g. root with `alpha/.claude/spec.config.json`
  + `beta/README.md` + `notes.txt` + `.cache/` → `[{name: "alpha", root: "<root>/alpha"}]`)
  → test in tests/autopilot/discover.test.js
- **AC-20260810-03-2**: WHEN a grounded candidate's `.git` is a regular file (git-worktree
  checkout) THE SYSTEM SHALL skip it (worktree fixture with `.git` file containing
  `gitdir: …` → not in results) → tests/autopilot/discover.test.js
- **AC-20260810-03-3**: WHEN `discoverRepos`'s scan yields two candidates sharing a
  basename (exercised via an injected `fsImpl` fake whose readdir/stat answers produce
  `alpha` twice — structurally impossible on a real flat root, kept as the defensive
  guard per D3) THE SYSTEM SHALL throw `DiscoverError` whose message contains both
  resolved absolute paths, and register nothing → tests/autopilot/discover.test.js
- **AC-20260810-03-12**: WHEN the root contains a symlink pointing at a real
  spec-grounded directory THE SYSTEM SHALL NOT discover it (D2: `Dirent.isDirectory()`
  is authoritative; symlinks are skipped) → tests/autopilot/discover.test.js
- **AC-20260810-03-4**: WHEN `autopilot discover` runs with no `hub.json` THE SYSTEM
  SHALL exit 2 with a message naming `autopilot enroll` as the remedy →
  tests/autopilot/discover.test.js
- **AC-20260810-03-5**: WHEN `discover` registers two repos THE SYSTEM SHALL POST
  `/api/spokes/projects` once per repo in basename order and rewrite `hub.json` with the
  returned `{projectId, name}` list, `reposRoot`, mode 0600, all other fields preserved
  → tests/autopilot/discover.test.js
- **AC-20260810-03-6**: WHEN the projects route answers non-2xx for the second of two
  repos THE SYSTEM SHALL exit 1 naming that repo and leave `hub.json` unchanged →
  tests/autopilot/discover.test.js
- **AC-20260810-03-7**: WHEN `--json` is passed THE SYSTEM SHALL print exactly one JSON
  object `{reposRoot, projects:[{projectId, name, created, root}]}` on stdout and no
  other stdout output → tests/autopilot/discover.test.js
- **AC-20260810-03-8**: WHEN no `--repos-root` is passed and `hub.json` has `reposRoot`
  THE SYSTEM SHALL use it; WHEN neither exists and `~/Projects` is absent THE SYSTEM
  SHALL exit 2 naming `--repos-root` → tests/autopilot/discover.test.js
- **AC-20260810-03-9**: WHEN `enroll --repos-root <dir>` runs against a root with
  discovered repos `["beta","alpha"]` and `--project alpha --project gamma` THE SYSTEM
  SHALL send `projects: ["alpha","beta","gamma"]` (deduped union, sorted) in the enroll
  exchange and persist `reposRoot` in the written `hub.json` →
  tests/autopilot/enroll.test.js
- **AC-20260810-03-10**: WHEN `enroll --repos-root` discovery throws (collision or bad
  root) THE SYSTEM SHALL exit 2 **without** performing any network call (the one-time
  code is not burned) → tests/autopilot/enroll.test.js
- **AC-20260810-03-11**: WHEN `enroll` runs without `--repos-root` THE SYSTEM SHALL
  CONTINUE TO behave exactly as today (no discovery, no `reposRoot` field written) →
  existing cases in tests/autopilot/enroll.test.js tagged with this AC-ID

## Assumptions (escalation triggers)

- A1: A git-worktree checkout's `.git` is a regular file (`gitdir: <path>` pointer), a
  primary checkout's `.git` is a directory. **Executed 2026-08-10**: `git worktree add`
  spike → `stat` reported `Regular File` with `gitdir:` content vs `Directory` for the
  main repo. — **if false:** unreachable; evidence recorded.
- A1b: `fs.readdirSync(dir, {withFileTypes: true})` reports `isDirectory() === false`
  for a symlink targeting a directory. **Executed 2026-08-10** (refuter check against
  Node): confirmed — D2's filter therefore skips symlinks by construction. — **if
  false:** unreachable; evidence recorded.
- A2: `POST /api/spokes/projects` is idempotent per (spoke, name) and answers
  `200 {created: false}` on repeat — per the vendored contract comment and
  autopilot-hub `docs/canonical/api.md`. — **if false:** blocked; re-read the hub route
  before any retry-shaped design change.
- A3: `EnrollRequest.projects` accepts the discovered set (uniqueItems enforced
  contract-side; dedupe client-side per D6). — **if false (hub rejects sorted deduped
  list):** blocked; the contract copy has drifted — stop and re-vendor.
- A4: Moving `postJson`/`mintEventId`/`readCredential` to `hub-http.js` keeps
  `wrapup.js`'s observable behavior byte-identical; existing wrapup tests are the guard.
  — **if false:** the move is wrong, not the tests — revert to in-file and return blocked.

## Rationale

The discovery predicate deliberately matches the `/spec:init` artifact and nothing else:
the daemon's founding constraint is "no-op on repos without the spec grounding layer",
and `spec-status.js` already returns `{"next": []}` gracefully for a grounded-but-empty
repo — an idle lane is the correct steady state, not an error. The collision rule is a
hard error because both downstream identities key on basename: the hub project (and
thus the Telegram topic) via the idempotent route, and the Stop hook's wrap-up routing
via `repoBasename()`. A soft merge is the worst outcome — two repos' narration
interleaved in one topic with no error anywhere. Sequential registration (not
parallel) trades a few hundred ms on a 10-repo box for deterministic output and exact
failure attribution; discovery runs at enroll, on demand, and (from spec 04) at daemon
boot, none of which are hot paths. `--project` survives because removing a shipped flag
buys nothing and the union is well-defined. Fragile spot to watch: `hub.json` rewrite
must go through the same atomic-tmp-rename + 0600 path `enroll.js` established — a
plain `writeFileSync` would race the Stop hook's `readCredential`.

## Canonical Delta

`docs/canonical/autopilot.md` § Enrollment gains: discovery (`autopilot discover`), the
spec-grounded predicate (D1), the worktree-skip and collision rules (D2/D3), the
`reposRoot` field, and the rule that `enroll --repos-root` runs discovery pre-network so
refusals never burn codes. New § note under Conventions: spoke-HTTP helpers live in
`daemon/hub-http.js`; `wrapup.js` and `discover.js` consume them.
