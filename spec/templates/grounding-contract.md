# Grounding-Layer Contract

This file IS the contract between the plugin's process layer and the grounding layer
`/spec:init` generates in each host repo. Drift detection is automatic: `/spec:init` stamps
this file's hash (`spec-paths contract-hash`) into the host's `.claude/spec.config.json` as
`contractHash`; the state-gate hook recomputes and compares on every pipeline command and
warns on mismatch. **Any edit to this file flags every host's grounding as stale** — edit it
only when the contract genuinely changes, and never edit it for wording alone.

## Required config keys (`.claude/spec.config.json`)

`generatedBy`, `contractHash`, `gateCommand` (appended-path placeholders `{testDirs}`/`{scopeDirs}`, or `{testFiles}` for the File Plan's exact test files), `testCommand`, `setupCommand`,
`patternsScript`, `layerGroups`, `agentMap` (must include `tests` and `default`),
`pipelineRules`, `runtime` (see § Runtime verification). Optional: `driftScript`, `routing`,
`postGateCommand` (a shell string the build driver chains after a green scoped gate at
integration and on every repair round; `{testCommand}` substitutes the host's `testCommand`;
absent = no post-gate),
`testEnv` (array of `{"var": "<NAME>", "provision": "<command>"}` rows — suite-gating
environment variables, checked by `env-preflight.js` before the build stage's and
the design stage's gate/repair paths run; absent = legacy mode, no preflight),
`testNameFilter` (a shell-argument fragment carrying `{name}`, e.g.
`"--test-name-pattern={name}"` — `red-check.js` substitutes a `rewrites`/`reuses` AC's
regex-escaped, anchored title and appends the fragment to `testCommand` ahead of the file path
to verify that one declared test rather than its whole file; absent = every file keeps today's
per-file classification),
`{file}` (a placeholder inside `testCommand` and `typecheckCommand`, for a runner that takes its file
somewhere other than the end of the command — where present, the plugin substitutes the file
path(s) there: one quoted path in `red-check.js`, the quoted space-joined list in the at-risk leg,
and the `testNameFilter` fragment is appended after the substituted command; absent, the path(s)
are appended as today, the filter fragment ahead of the path),
`trunk` (the branch the review stage diffs against when the spec pins neither `diff_base` nor
`build_base`; absent = the `main`-then-`master` probe, printed as a derived default),
`testCaseScanner` (a shell command run from the repo root, no placeholders, printing one test case
per stdout line — `<file> :: <title>` with a repo-relative POSIX file split at the first ` :: `,
or a JSON object `{"file","title","start"?,"end"?}` whose 1-based inclusive `start`/`end` line
numbers bound the case and any tag comment above it; blank lines skipped, any other line
malformed; absent = every test file is read by the built-in JavaScript walker. A file the
listing names is never read by the walker; a case without a span is never cut by the expiry
sweep and a host-named file is never deleted),
`fileShapes` (`{ "testGlobs"?: string[], "codeExtensions"?: string[], "manifests"?: string[] }` — the
host's file shapes: `testGlobs` and `manifests` in `lib/glob-match.js` syntax, a `manifests` entry
matching a path's basename (e.g. `*.csproj`, `requirements*.txt`); `codeExtensions` entries start
with `.`; each key absent = that key's stack-neutral default in `lib/file-shapes.js`, the block
absent = all three defaults),
`orchestratorOnly` (array of repo-relative path globs in `lib/glob-match.js` syntax — `**` any run
of segments, `*` within one segment, everything else literal, no braces — naming the host's
orchestrator-only File Plan paths; the build driver never lists a matching row in a worker's
file list and prints it as a line the orchestrator applies itself; absent = every row routes
by layer),
`design`
(`{ "kit": "<dir>", "tokens": "<file>", "rules": "<file>", "app"?: "<dir>" }` — present = the
host has a UI stack; `kit` (the directory of intent-named composite components), `tokens` (the
token file — a Tailwind 4 `@theme` block or the stack's equivalent) and `rules` (the
auto-loaded rule file holding the intent-to-pattern table and the naming-convention table) are
repo-relative and required when the block is present; `app` stays optional — the mock app dir,
written by `/spec:mocks` and genesis, and equal to `design/mocks/status.json`'s own `app`),
`slowTestCommand` (see § Test tiers), `release` (see § Release), `prototype` (see § Prototype), `walkthrough` (see § Walkthrough), `pictures` (see § Pictures), `capabilities` (see § Capabilities), `policy` (see § Policy),
the rule-enforcement keys `enforcementManifest` and `rulesEnforcementHash` (see § Rule
enforcement), and the genesis-handoff key `genesisStackDescriptor`
(see § Genesis handoff).

## Runtime verification (required)

Every verification claim the pipeline makes must be backed by an executed observation — a
verification stack composed entirely of static legs can pass a program that cannot start
(a host once had every gate task green while its root route returned 500 on every commit), and can
equally pass a program that starts but cannot cleanly stop. The `runtime` config block is the
contract for the executed leg:

- `runtime.bootCommand` — starts the app locally (e.g. the dev command); it must serve on the
  `PORT` environment variable, which `smoke.sh` sets to a free port for each run.
- `runtime.readyCheck` — a command that exits 0 once the app observably serves (e.g.
  `curl -sf localhost:$PORT/api/health`); `readyCheck` and `seedCommand` read `PORT`. A
  `readyCheck` naming a fixed port keeps fixed-address behaviour and cannot run beside a second launch.
- Optional: `runtime.seedCommand` (seeds an observable state), `runtime.readyTimeout`
  (seconds, default 120), `runtime.stopSignal` (default SIGTERM), `runtime.stopTimeout`
  (seconds, default 30), `runtime.stopExitCodes` (integer array, default `[0]`).
- Hosts with no bootable process (libraries, pure CLIs) declare
  `runtime: {"inert": "<reason>"}` — an explicit exemption, never a silent omission.

The plugin's `smoke.sh` (`spec-paths smoke`) executes this contract deterministically: after
readiness, it sends `runtime.stopSignal` and requires a bounded, clean exit
(`stopTimeout`/`stopExitCodes`) — a hung or unclean shutdown fails the leg. The review stage
runs it as a verdict leg (CLEAN requires it), and `/spec:init` proves it once via the deliverable
manifest before stamping.

## Test expiry (required)

A spec's tests are classified at close, deleted only by a deliberate sweep. At review close the
plugin runs `expire-tests.js` in dry-run mode over every test tagged with the closing spec's own
AC-IDs, reporting which are retirable — a test that cites a ledger escape class, exercises a
script the pipeline itself runs, or pins an AC bullet carrying `SHALL CONTINUE TO` (the opt-in
permanence marker) stays kept. Close writes nothing to the tree, and `--mark closed` writes
nothing either. The one path that deletes a test is
`node "$(spec-paths test-expiry)" --root . --all-done --apply`, run deliberately after review, on
one host at a time, never by the close itself. The host obligation follows from that:

- **A check that requires a test carrier per acceptance criterion scopes its carriers to specs
  that are NOT `done`.** A `done` spec owes a carrier only for a criterion whose bullet says
  `SHALL CONTINUE TO`; every other criterion of a done spec is retirable once classified. This is
  exactly the rule the plugin's own `ac-drift.js` applies repo-wide (`/spec:doctor` check 17).
- A host check that demands a carrier for **every** AC of a done spec goes red once the
  deliberate sweep actually runs, and stays red: the sweep deletes the retirable tests, so a
  check expecting a carrier for every criterion of a done spec finds none for the ones it
  retired, with no path forward short of rescoping the check.
- Relabelling a criterion `SHALL CONTINUE TO` to satisfy such a check is never the remedy — that
  phrase pins pre-existing behavior a spec must not break, never behavior the spec introduces.

The pipeline generates no coverage check of its own; a host that authors one owns this scoping.

## Test tiers (optional)

`testCommand` is the fast tier: every gate, suite, at-risk and close-time run executes it.
`slowTestCommand` (a shell string, no placeholders) is the host's own invocation of the tests it
has excluded from `testCommand` by its runner's own mechanism — a marker, a project, a tag; the
plugin names none. It runs once per review legs iteration as the blocking `slow` leg and never at
close. `gateCommand` carries `{testDirs}` (or `{scopeDirs}`) wherever the runner accepts appended
paths; an unscoped gate is reported by `/spec:doctor` (check 25), never refused. Absent
`slowTestCommand` = no slow leg.

## Deliverable manifest (required)

`/spec:init` writes `.claude/spec-manifest.json` — one entry per deliverable, each carrying
the activation it claims (`file` exists / `exec` runs / `smoke` boots / `remote` resolves /
`inert` with a stated reason). The plugin's `manifest-check.sh` (`spec-paths manifest-check`)
verifies every claim by existence or execution, fail-closed. **Init may not stamp
`generatedBy`/`contractHash` until it exits 0** — authored artifacts count only once their
activation is demonstrated. `/spec:doctor` re-runs it as the activation drift check.

## Session grounding (required)

Three deliverables serve **every** Claude session in the host — interactive or pipeline — not
only spec commands (the Claude Code baseline: path-scoped rules,
checked-in permissions, generated project skills):

- **Path-scoped rules.** The pipeline-rules file opens with `paths:` frontmatter scoping its
  ambient load to `specs/**` and `.claude/**` — pipeline commands Read it explicitly, so
  nothing changes for them; ordinary sessions stop paying its context cost. Layer conventions
  additionally live as small per-kind rule files in `.claude/rules/conventions/`, each with
  `paths:` globs derived from the same evidence as the config `routing` — a rule loads only
  when a session touches a matching file. A `paths:` glob matching zero tracked files is
  drift (`/spec:doctor` flags it: that rule silently never loads). Rule notes — Gotchas
  entries, convention bullets, agent constraints, `enforcement.json` notes — state the current invariant plus one owner citation (spec path, AC-ID, D-number, ADR, run id) and
  never narrate dates, people, hosts, versions, or prior behavior; `/spec:doctor` check 16
  scans the layer.
- **Permissions.** `.claude/settings.json` carries a generated `permissions` block: allow
  entries for the exact toolchain commands the config declares (gate / test / setup / boot /
  patterns), deny entries for destructive ops and secrets reads (`.env*`). Init merges into
  an existing block — never clobbers user entries, never emits a broad `Bash(*)` allow.
- **Run skill.** `.claude/skills/run/SKILL.md` — launch + observe for interactive sessions,
  generated from the same runtime profiling as `spec-verify`. Generated skills declare
  `allowed-tools` pre-authorizing exactly the commands their body instructs; any generated
  skill with side effects beyond local launch/seed declares `disable-model-invocation: true`.

## Release (optional — present when the host deploys)

`release` — the milestone release gate's grounding (`/spec:release`): `deployCommand`
(staging), `stagingUrl`, `e2eCommand` (takes the target URL via `BASE_URL`), optional
`promoteCommand` + `rollbackCommand` (a host command that returns production to the previous build; run with cwd = the repo root, no placeholders) + `productionUrl` + `healthPath` + `migrationsCheck` (a host command that
exits 0 iff every journaled migration is applied on the just-deployed staging database; the
literal `"none"` records an explicit decline, absent = legacy). All host-declared at
init/first-release time — the plugin never invents deploy mechanics.

## Prototype (optional — present when the host declares a functional-prototype path)

`prototype` — the grounding `/spec:prototype` runs a throwaway branch against
(specs/20261007/01-approve-writes-a-behaviour-contract.md D1): `url` (the dev server's base
URL, carrying `{port}` — the driver prints the port to boot on), optional `bootCommand` (the
command that serves the app at `url`, reading `PORT` like `runtime.bootCommand`; absent = the
drivers print `runtime.bootCommand` — declare it when the smoke boot is a different process from
the screens, such as an API-only worker beside a web build), `overlay` (the
worktree-relative file the driver writes the pin overlay to; the host's dev entry imports it
behind its own dev flag), `e2eFile` (a path template carrying `{stem}`, where the contract's
derived tests are written in the prototype worktree), `e2eList` (a shell string carrying
`{file}` that lists the tests in one file and exits 0), `e2eRun` (a shell string carrying
`{file}` that runs the tests in one file and exits 0 only when every test passes; it runs with
`PROTO_URL` in its environment, the address of the app under test), `picture` (a shell string
carrying `{url}`, `{out}`, `{width}` and `{height}` that writes one PNG of the page at `{url}`
to `{out}`, however this stack makes a picture of a screen — signing in is its own business; run
with cwd = the prototype worktree), optional `dbCreate` / `dbDestroy` (shell strings run with
cwd = the prototype worktree and env `PROTO_BRANCH`, `PROTO_WORKTREE`, `PROTO_BRIEF`). Absent
block = the host has never declared a prototype path — the driver refuses naming this block
and `/spec:doctor`.

## Walkthrough (optional — present when the project reviews wireframes on the hosted service)

`walkthrough` — `baseUrl` (the service's address; `https:` unless the host is `localhost`,
`127.0.0.1` or `[::1]`), `project` (the project id on the service), `tokenEnv` (the name of the
variable that holds the project's token: read from `env` in the git-ignored
`.claude/settings.local.json` when `/spec:connect` stored it there, else from the environment;
the token is never written to a file git tracks). Absent block = the project does not use the service: the client sends nothing, writes
nothing and exits 0.

## Pictures (optional — present when the project can make pictures of its real screens)

`pictures` — `command` (a shell string the project owns: it makes one PNG per entry of the wanted
list, however this stack makes a picture of a screen; run with cwd = the repo root and the
variables `SPEC_PICTURES_DIR`, the folder to fill, and `SPEC_PICTURES_WANTED`, the path of the
wanted list), `dir` (a repo-relative folder the plugin cleans of pictures and refills on every
run), optional `widths` (1 to 4 widths, each 240 to 3840; default 390 and 1280). The wanted list
names every picture by screen, state and width; a missing, empty or stray picture is refused.
Absent block = the project has never declared how its pictures are made: `spec-paths pictures`
refuses naming this block.

## Capabilities (optional — declares stack-shaped facts the pipeline would otherwise assume)

Without this block, commands and scripts would hardcode a stack shape — GitHub as the forge, a universal
skip-count format, pnpm-shaped monorepos, Storybook-shaped previews — and on a host where the
assumption missed, the consuming leg went inert *silently* (audit Class C). `capabilities` is
one closed block, written by `/spec:init`'s detection pass, read at the single points that
consume each fact:

```jsonc
"capabilities": {
  "forge": "github",              // or "none" — who runs CI/PRs; read by ci-query.js
  "failCountPattern": "none",     // regex over the gate log, group 1 = failure count, read ahead of
                                  // the built-in shapes; "none" = the runner prints no count;
                                  // absent = the built-ins
  "skipReportPattern": "none",    // regex over test-runner output capturing the skip count (group 1;
                                  // optional group 2 = todos), or "none"
  "testCountPattern": "none",     // regex over test-runner output, group 1 = executed-test count,
                                  // or "none"; read by review-legs.js for the gate and at-risk rows
  "ciPoll": { "intervalSeconds": 30, "timeoutSeconds": 600 }
}
```

**`forge` is `github` or `none`.** An absent block, an absent key, or any other value is **no forge
adapter** — the CI scripts print the canonical line `unavailable — no supported forge adapter` and
never probe `gh`; `/spec:doctor` check 2 nudges. A present block is authoritative: `forge:"none"`
makes the CI scripts print that line and exit cleanly rather than probe; a `skipReportPattern` (or `testCountPattern`) of `"none"` (or no match) makes
the corresponding observation slot a typed unavailability object instead of assuming zero —
`{"unavailable":"no-format-declared"}` when the host declares no pattern (sanctioned) and
`{"unavailable":"pattern-no-match"}` when a declared pattern misses the output (drift, which
raises a leg finding); `ciPoll` overrides `/spec:release`'s poll interval/timeout when present,
otherwise the 30s/600s defaults hold.

## Policy (optional — the standing preferences the owner answered once at init)

One closed block, asked at `/spec:init` in two rounds and written by `init-gen generate`; the
JSON is the default block:

```json
"policy": {
  "worktreePerSpec": true,
  "directLaneToMain": true,
  "mergeStrategy": "derived",
  "testExpiry": "classify",
  "closeSuite": "auto",
  "ledgerCommitted": true,
  "reviewService": "terminal",
  "models": {
    "workers":  {"model": "sonnet", "effort": "medium"},
    "reviewer": {"model": "fable",  "effort": "low"},
    "disposer": {"model": "opus",   "effort": "medium"}
  },
  "riskTiers": [],
  "stops": {
    "repairRound": "repair",
    "buildEscalate": "derived",
    "reviewEscalate": "queue",
    "redFindings": "remove-mention",
    "prototypeClose": "delete",
    "rejectWithEvidence": "accept"
  },
  "fanout": {
    "selfSurfaces": ["spec/scripts/fanout-driver.js", "spec/scripts/spec-build-driver.js", "spec/scripts/spec-review-driver.js", "spec/scripts/pending-question.js", "spec/scripts/merge-back.sh", "spec/scripts/lib/**", "spec/scripts/*-gate.*", "spec/hooks/**", "spec/bin/**"],
    "overlapExempt": ["README.md", "**/.claude-plugin/plugin.json", ".claude-plugin/marketplace.json", "spec/doctrine/core.md", "spec/doctrine/design.md"]
  }
}
```

Enums: `mergeStrategy` `derived | merge-commit | ff-only | squash | rebase-ff`; `testExpiry`
`classify | off`; `closeSuite` `always | auto`; `reviewService` `terminal | hosted`; `models.<seat>.model`
`fable | opus | sonnet | haiku`; `models.<seat>.effort` `low | medium | high | xhigh | max`;
`riskTiers` an array of non-empty strings; `stops.repairRound` `repair | ask`; `stops.buildEscalate`
`derived | ask`; `stops.reviewEscalate` `queue | ask`; `stops.redFindings` `remove-mention | ask`;
`stops.prototypeClose` `ask | keep | delete`; `stops.rejectWithEvidence` `accept | ask`;
`fanout.selfSurfaces` and `fanout.overlapExempt` arrays of non-empty glob strings.

Semantics: `worktreePerSpec` false → `/spec:run` runs in place without `--in-place`;
`directLaneToMain` false → a Direct-lane change lands through a branch and `/git:merge`, never a
commit on main, still no spec; `mergeStrategy` `derived` → `merge-back inspect`'s RECOMMEND, else
the named strategy is auto-picked; `testExpiry` `off` → review close runs no classification and
`/spec:doctor` check 20 reports `disabled by policy`; `ledgerCommitted` false →
`.claude/spec-runs.jsonl` and `.claude/spec-runs/` are gitignored at init and never staged;
`reviewService` `terminal` → the wireframe command never suggests `/spec:connect`;
`models.<seat>` → the model and effort every driver prints on that seat's dispatch line;
`riskTiers` → the high-risk areas the owner chose, also written as bullets into the rules file's
§ Risk Tiers (the section planning reads; the key is provenance, checked by `/spec:doctor`
check 24); `stops.repairRound` `repair` → a review STOPPED with the repair round unspent runs one
in-session repair round without asking, printing `📌 Auto-picked run one in-session repair round —
host policy stops.repairRound: repair (veto anytime)`; `stops.buildEscalate` `derived` → a build
ESCALATE takes the failure-trend recommendation (re-arm or park, never cold or amend), printing
`📌 Auto-picked <re-arm one more round|park and queue a /spec:fix> — host policy
stops.buildEscalate: derived (veto anytime)`; `stops.reviewEscalate` `queue` → a review ESCALATE
abandons the run and queues `/spec:fix`, printing `📌 Auto-picked abandon and queue /spec:fix — host
policy stops.reviewEscalate: queue (veto anytime)`; `stops.redFindings` `remove-mention` → a
critical-tier unsanctioned green removes the AC-ID mention, printing `📌 Auto-picked remove the AC-ID
mention — host policy stops.redFindings: remove-mention (veto anytime)`; `stops.prototypeClose`
`keep` or `delete` → the MERGE step closes an unmerged prototype that way, printing `📌 Auto-picked
<Keep it for now|Delete it> — host policy stops.prototypeClose: <value> (veto anytime)` and the
other `--prototype` value as the veto; `delete` (the default) also prints the branch tip's restore
command — the contract, pictures and tests already live under `design/prototypes/<stem>/` — while
`ask` asks. `stops.reviewEscalate` `queue` also answers a review STOPPED whose repair round is spent,
printing `📌 Auto-picked queue /spec:fix — host policy stops.reviewEscalate: queue (veto anytime)`. `stops.rejectWithEvidence` `accept` → `--mark dispositions` accepts a disposer `reject` whose `repro` names the command it ran and the output it observed, printing `📌 Auto-picked accept reject on executed repro: <refs> — host policy stops.rejectWithEvidence: accept (veto anytime)`, while a `waive` and a repro-less `reject` are asked whatever the value. Any `stops` key set to
`ask` brings its question back; `/spec:fanout --ask <key>` brings it back for one fan-out.
`fanout.selfSurfaces` → a spec touching one of these paths ends a fan-out batch and runs alone;
`fanout.overlapExempt` → an exempt path never serializes two briefless specs. `closeSuite` `auto` → the close-time whole-suite run is skipped when the close delta against the judged tree is overlay-only, no test file references an overlay path, and the judged tree's suite is green in the run cache, printing `close-time suite: skipped — close delta is overlay-only and no test reads it (policy.closeSuite: auto)`; `always` → the close-time suite runs whenever `gateRunsSuite` does not already cover it.

**Absent or partial block = the defaults above, key by key** — a host that predates the block
changes nothing. Validated by `validatePolicy` in `host-config.js`; read through `policy(root)`.

## Genesis handoff (optional — present when the genesis stage seeded the repo)

When `/spec:genesis-architect` + `/spec:genesis-design` ran first, `/spec:init` consumes their
on-disk artifacts instead of re-deciding:

- `genesisStackDescriptor` — path to `.claude/genesis/stack-descriptor.json` (archetype, stack,
  `designCatalog`, resolved `gateCommand`). Optional; absent in repos not seeded by the genesis stage.

Design rules reach `/spec:enforce` through the `design` block (the `kit-discipline` cell plus the
per-layer naming cells); any other design rule is a written host rule.

## Rule enforcement (optional — present after `/spec:enforce` has run)

`/spec:enforce` mechanizes the host's full rule set into deterministic checks wired to the
`gateCommand`, and records its choices in a manifest. The contract:

- `enforcementManifest` — path to `.claude/rules/enforcement.json`: one entry per
  `(workspace × stack × category)` cell carrying the chosen enforcer (or fallback), the discovery
  citation, the verified run command, and the gate wiring — plus, for a ratchet category, a
  `baseline` field (`path`, `establishCmd`) recording the once-established quarantine snapshot.
  Provenance — never plugin prose. Every entry carries `workspace`, a repo-relative directory
  (`.` for the root workspace); the id grammar is `<workspace>:<stack>:<category>[/<layer>]`,
  with the `<workspace>:` prefix omitted when the workspace is `.` (e.g. `api:python:naming/schema`
  for a nested workspace, `python:module-boundary` for the root). For `category: "naming"` only,
  an entry also carries `layer`, one of the four naming layers `code`, `schema`, `routes`, `wire`
  (the host naming table's own section list) — a `layer` on any other category is refused.
- `rulesEnforcementHash` — hash of that manifest, stamped by `/spec:enforce`; `/spec:doctor`
  recomputes it and warns when rules changed but enforcement was not regenerated.
- The reserved, language-neutral category taxonomy is `module-boundary | naming | forbidden-symbol | structural-pattern | datetime | schema-validation | format | duplication | cycle | kit-discipline`. Tool
  selection is **two-stage and runtime**: DISCOVER against live sources with citations (never
  training memory), then VERIFY the tool installs and runs against the repo before adoption.
  **No plugin file names a specific linter/formatter/arch-tool/hook-runner** — a named tool
  anchors the agent and goes stale faster than the rules. `duplication` and `cycle` are **ratchet
  categories**: enforcement quarantines the host's existing violations in a one-time baseline
  snapshot and the gate blocks only on violations not already in it, never on legacy debt.

## Required pipeline-rules sections (file at `pipelineRules`)

`Risk Tiers` · `Planning` · `Build` · `Worker Rules` · `Test Rules` · `Review Checks` ·
`Gotchas`

## Worker Contract (byte-identical across all generated agents)

Substituting only the parenthesized self-verify examples with the host's scoped commands —
the same way in every agent:

```markdown
## Worker Contract (spec pipeline)

When dispatched as a build worker by the build stage:

- The spec's **Decisions** table is authoritative — apply it verbatim. An unlocked design fork or stale spec assumption is a `blocked` return (kind, detail, options, recommendation), never a guess.
- The rules file's `## Gotchas` section is hard context, not a suggestion — it is distilled from this repo's real failures.
- Do NOT query MCP servers — the spec's UI and Contracts sections embed the references you need. If an embedded reference is wrong against the installed version, return blocked `{kind: "stale-assumption"}`.
- Edit only files in your assigned batch. Return receipts — files touched + one-line summaries — not narration.
- NEVER run git commands (checkout/stash/restore/reset/clean/add/commit). Bash is for scoped self-verification only (`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`). The orchestrator owns git; a repo-wide git op destroys sibling workers' uncommitted edits.
```

## Tests-kind addendum (appended after the contract bullets, identical wording)

```markdown
- As a TDD red-phase author: derive tests ONLY from the spec's Acceptance Criteria and Behavior sections, never from implementation code. Reference the AC-ID per this repo's convention.
- Every new test must FAIL on current code. If a test would already pass, the spec is wrong — return blocked `{kind: "stale-assumption"}`. Write NO implementation code; never weaken assertions to make tests pass.
```
