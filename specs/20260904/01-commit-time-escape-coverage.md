---
date: 2026-09-04
status: implementing
tier: standard
area: feedback-loop
design: false
breaking: false
depends_on: []
depended_on_by: []
brief: 25
open_markers: 0
diff_base: d542a092b9c0ffb9b86ae2c7aebb8e5fafa1532a
---

# Commit-time escape coverage: one derivation, and an offer that reaches the fixes it misses

## Goal

Make the share of fix commits that record an escape row a number a script prints — per repo
and fleet-wide, population first — and move `/git:commit`'s escape offer onto that same
derivation so it fires on every fix-typed commit that touches a file a reviewed spec landed,
instead of depending on commit-message archaeology. Done means: `commit-coverage.js` ships
with a commit mode (the offer's oracle), a window mode (one repo's share), and a fleet mode
(every checkout on this machine, population from the fleet reader); `/git:commit` step 3 runs
the commit mode and offers on `offer: true`; no commit is ever blocked, no decline is
recorded, and the fleet reader is untouched.

## Decisions (locked — workers apply verbatim, never override)

| ID | Decision | One-line rationale |
|----|----------|--------------------|
| D1 | The derivation is a standalone script `spec/scripts/commit-coverage.js` with three modes — `--commit <sha>`, `--since <YYYY-MM-DD>`, `--repos-root <dir>` — `--json` as the only machine format and a human render otherwise; it gets the `spec-paths` key `commit-coverage` and an `spec/entrypoints.json` entry whose entry point is `git/commands/commit.md` (AC-20260904-01-1, AC-20260904-01-2) | Rejected: a tenth fleet-reader question — the fleet reader is a ledger-only reader that `/spec:escape` runs twice per invocation, its eight test files build synthetic fleets with no `.git`, and spawning `git` across every checkout on each call taxes a hot path for a number nobody needs at that moment. A standalone script is the cheapest option to reverse. |
| D2 | Fix-shaped = the subject's conventional type token is `fix` or `hotfix`: `/^(fix\|hotfix)(\([^)]*\))?!?:/i` — nothing else (AC-20260904-01-3) | Executed measurement (A2): the brief's `fix\|hotfix\|regression\|bug` substring matched 41 pipeline-stage commits whose subjects contain "fixed" (review closes, build waves, design fidelity rounds — in-spec repairs, not escapes) and word-bounded `regression`/`bug` matched zero further commits fleet-wide. Rejected: keeping the substring rule. |
| D3 | A spec *lands* a touched file for commit C iff its `## File Plan` (lib/file-plan `parseFilePlan` over `<root>/specs/**/*.md`) lists the file exactly or via a glob row (`*`/`**`, lib/glob-match `globMatch`) AND the repo ledger (lib/observation `readLedgerRows`) holds at least one `stage:"review"` row for that spec path with `Date.parse(ts) < C's committer-date epoch`; the latest such row supplies `reviewTs`/`reviewRunId`/`verdict`. Frontmatter `status:` is never consulted. A listing spec with no such prior review row makes the file `inFlight` — counted, never offered (AC-20260904-01-4) | The review row is the only artifact that says a review passed over that code before the fix; a spec still building or under review is repairing its own work, not escaping (A3: 7 of 49 host fix commits are exactly that). Rejected: `git blame` / commit-message heuristics — host spec commits are worded `review(20260903/03): CLEAN — …` and merge-back writes `merge: squash spec/<slug> into main`, so a literal `specs/…` path is absent from the history the current check reads. |
| D4 | Commit time is the committer date (`git log --format=%cI`), parsed with `Date.parse`; window filtering happens in-process (`git log --no-merges --format=%H%x1f%cI%x1f%s`, keep `epoch >= Date.parse(since)`), never via git's `--since` (AC-20260904-01-6) | Executed spike (A5): `git log --since` stops walking at the first commit whose committer date is older than the cutoff — one rebased or cherry-picked commit at the tip hides the whole window. Every ledger `ts` shape on this machine parses with `Date.parse` (A4). |
| D5 | Commit mode prints the Contracts JSON: `files` in `git show --format= --name-only` order, `landed[]` per file with `specs[]` sorted by review epoch descending (ties: spec path ascending), `inFlight[]` only for files with zero reviewed landing spec, `offer = fixShaped && landed.length > 0`. No ledger file under `<root>/.claude/` → `ledger:false`, `landed:[]`, `offer:false`, exit 0. `--root` not a git repo, or an unknown `--commit` sha → exit 2 with the remedy on stderr (AC-20260904-01-4, AC-20260904-01-5, AC-20260904-01-7) | The offer needs one ranked spec to name and the count of alternatives; the newest review is the one most likely to have missed the defect. Absence of a ledger is the gate `/git:commit` already treats as "zero output", so it is a derived answer, not an error. |
| D6 | Window mode counts, per repo, over non-merge commits reachable from `HEAD` whose committer epoch ≥ since: `commits`, `fixShaped`, `landedPostClose` (fix-shaped with ≥1 landed file), `inFlightOnly` (fix-shaped, spec-listed files but none landed), `noSpecFile`, and `rows` = `stage:"escape"` rows with `Date.parse(ts) >= since` bucketed `commit` \| `manual` \| `unknown` (exactly `via:"commit"`, exactly `via:"manual"`, anything else or absent); `share = round4(rows.commit / landedPostClose)`, `null` when the denominator is 0 (AC-20260904-01-6, AC-20260904-01-9) | Population first, every exclusion named (brief 17's silent-absence rule); the share is a ratio of counts, never a per-commit join — rows carry no sha, so a join would be a guess. Mirrors `cleanByVia`'s three-bucket via rule. |
| D7 | Fleet mode takes its population from `fleet-reader.js --json --repos-root <dir>` (spawned via `path.join(__dirname, 'fleet-reader.js')`): each `population.repos[]` entry becomes `<reposRoot>/<name>`; `since` defaults to that output's `gate08.cutover`; a repo without a `.git` entry reports `git:false` with null counters; a repo with `.git` but no `HEAD` (`git rev-parse --verify -q HEAD` exits non-zero) reports zero commits; `fleet` totals sum host repos only (`selfRepair:false`, `git:true`); `excluded: { selfRepair: [names], noGit: [names] }` (AC-20260904-01-8, AC-20260904-01-10) | One fleet discovery, one cutover literal — both already owned by the fleet reader; re-implementing either is the drift the fleet reader was built to end. Self-repair rows are the plugin's own incidents (specs/20260903/01 D3's rule), so the brief's "share of host fixes" excludes them while the per-repo line still prints. |
| D8 | `git/commands/commit.md` step 3 becomes: gate = a ledger file exists AND (the subject is fix-typed per D2 OR the user called the commit a fix) → run `node "$(spec-paths commit-coverage)" --root . --commit HEAD --json`; offer once via a skippable `AskUserQuestion` when `offer` is `true` (or the user called it a fix and `landed` is non-empty), naming `landed[0].specs[0].spec`, its `reviewRunId`, the count of landed files and of distinct landing specs; Yes → `/spec:escape <that spec path>` commit-driven (`via:"commit"`, step 4 unchanged); No or a non-zero script exit → proceed silently (one `⚠️` line on non-zero exit). The `git blame -L` / `specs/...`-in-history heuristic and the `jq` review lookup are deleted; rule 7 names the fix-typed gate (AC-20260904-01-11) | JJ's ruling this session: offer on any file a reviewed spec landed (≈8 of 10 fix commits, A3) rather than only single-spec cases (≈2 of 10) or today's rule. `/spec:escape` step 1 already resolves multi-spec ambiguity with the user, so the offer only has to name the best candidate. |
| D9 | `git/.claude-plugin/plugin.json` bumps `1.2.0 → 1.3.0` with one changelog sentence appended to `description`; `spec/.claude-plugin/plugin.json` bumps to the next free minor (target `7.78.0`) with the last-3 changelog line (AC-20260904-01-12) | Pipeline rules § Planning: every behavior change bumps the owning plugin; both plugins change behavior here. The literal number is a target, not a pin (Gotchas). |
| D10 | Nothing blocks a commit, nothing records a decline, `fleet-reader.js` is not modified, and `spec/commands/escape.md` is not edited [no-ac: absence deliverables; AC-20260904-01-13 pins the never-blocking sentence and AC-20260904-01-14 pins the fleet reader's unchanged key set] | Brief 25 Out of scope (a shape gate reopens on a recurrence count, a "no" is not evidence); JJ's standing rule that doctrine prose only shrinks — escape.md's "common case" sentence becomes true by this spec, no rewording needed. |
| D11 | A re-measurement is queued behind this spec (`spec-queue add … --after-spec`) so the widened offer's effect is read from the script, never asserted [no-ac: queue entry, no code surface] | The brief's only success metric is the share moving; the queue is the pipeline's memory for deferred reads. |

## File Plan

| Path | Action | Layer | Summary |
|------|--------|-------|---------|
| spec/scripts/commit-coverage.js | CREATE | scripts | D1–D7: commit / window / fleet modes, `--json` + human renders, exit codes 0/2, header per Worker Rules (usage, owner citation `specs/20260904/01-commit-time-escape-coverage.md`, what it does NOT do, `Exit codes:`) |
| spec/bin/spec-paths | MODIFY | scripts | `commit-coverage` key → `$ROOT/scripts/commit-coverage.js`; usage list gains the key (D1) |
| spec/entrypoints.json | MODIFY | other | Entry `spec/scripts/commit-coverage.js` → `entryPoints: ["git/commands/commit.md"]` (D1) |
| git/commands/commit.md | MODIFY | doctrine | Step 3 rewritten on the script (D8); rule 7 names the fix-typed gate; steps 1, 2, 4 and rules 1–6 unchanged |
| git/.claude-plugin/plugin.json | MODIFY | doctrine | `1.3.0` + changelog sentence in `description` (D9) |
| spec/.claude-plugin/plugin.json | MODIFY | doctrine | Next free minor (target 7.78.0) + changelog line (D9) |
| tests/commit-coverage/commit-mode.test.js | CREATE | tests | AC-20260904-01-3, AC-20260904-01-4, AC-20260904-01-5, AC-20260904-01-7 |
| tests/commit-coverage/window-mode.test.js | CREATE | tests | AC-20260904-01-6, AC-20260904-01-9 |
| tests/commit-coverage/fleet-mode.test.js | CREATE | tests | AC-20260904-01-8, AC-20260904-01-10 |
| tests/git/commit-escape-check.test.js | CREATE | tests | AC-20260904-01-2, AC-20260904-01-11, AC-20260904-01-12, AC-20260904-01-13 |
| tests/spec-paths.test.js | MODIFY | tests | AC-20260904-01-1 — `commit-coverage` added to the resolves list plus one dedicated resolve test |
| tests/fleet-reader/discovery.test.js | MODIFY | tests | AC-20260904-01-14 — the existing nine-key exhaustive pin tagged (no assertion change) |

## Contracts

### `commit-coverage.js` CLI

```
commit-coverage.js --commit <sha> [--root <dir>] [--json]
                 | --since <YYYY-MM-DD> [--root <dir>] [--json]
                 | --repos-root <dir> [--since <YYYY-MM-DD>] [--json]
```

Mode resolution: `--repos-root` present → fleet; else `--commit` present → commit; else `--since`
present → window; else usage (exit 2). `--root` defaults to the process cwd. Hand-rolled
`--flag value` parsing; an unknown flag exits 2 with the usage line on stderr.

Exit codes: `0` derived (a zero-commit window, a missing ledger, and `offer:false` are all
derived answers); `2` usage error, `--root` not a git repository (`git rev-parse --show-toplevel`
fails — remedy names `--root <repo dir>`), unknown `--commit` sha (remedy names the sha and
`git log --oneline -5`), `--since` that `Date.parse` cannot read (`NaN`), `--repos-root` not a
directory, or the fleet-reader spawn exiting non-zero (its stderr is forwarded).

Stdout in `--json` mode is exactly one JSON document, written with a synchronous looped
`fs.writeSync(1, …)` (never `console.log` + `process.exit`, Gotchas). Nothing is ever written
to disk.

### Commit mode JSON

```
{
  mode: 'commit',
  root: '<abs dir>', sha: '<40-hex>', subject: '<%s>', committerTs: '<%cI literal>',
  fixShaped: true|false,                  // D2 regex on subject
  ledger: true|false,                     // any <root>/.claude/spec-runs*.jsonl
  files: ['<path>'…],                     // git show --format= --name-only <sha>, in order
  landed: [ { file: '<path>',
              specs: [ { spec: '<repo-relative spec path>', reviewTs: '<row ts literal>',
                         reviewRunId: '<runId>'|null, verdict: '<verdict>'|null } ] } ],
                                          // specs: review epoch desc, then spec path asc
  inFlight: [ { file: '<path>', specs: ['<spec path>'…] } ],   // spec asc; files with NO reviewed landing spec
  offer: true|false                        // fixShaped && landed.length > 0
}
```

A file listed by a reviewed spec AND an in-flight spec appears in `landed` only. `files`
excludes nothing — File Plan membership alone decides. Spec files are every `*.md` under
`<root>/specs/` (recursive); a spec with no parseable File Plan lands nothing.

### Commit mode human render

```
commit <sha12> — <subject>
  fix-shaped: yes|no · ledger: yes|no · files: <N>
  offer: yes — <L> files landed by reviewed specs (<S> distinct)
    <file> ← <spec> (review <runId|none> <verdict|?> <reviewTs>)[; <spec2> (…)]
  in-flight: <I> files listed by specs not yet reviewed
```

`offer: no — <reason>` with reason ∈ `not fix-shaped` | `no reviewed spec landed a touched
file` | `no ledger` (first applicable in that order). One `    <file> ← …` line per landed
file, specs joined by `; `.

### Window mode JSON

```
{
  mode: 'window', since: '<YYYY-MM-DD>', root: '<abs dir>',
  repo: { name: '<basename(root)>', dir: '<abs>', git: true, ledger: true|false,
          commits: N,            // non-merge, committer epoch >= Date.parse(since)
          fixShaped: N, landedPostClose: N, inFlightOnly: N, noSpecFile: N,
          rows: { commit: N, manual: N, unknown: N },   // stage:"escape", Date.parse(ts) >= since
          share: 0.0476 | null } // round4(rows.commit / landedPostClose); null when landedPostClose = 0
}
```

`fixShaped = landedPostClose + inFlightOnly + noSpecFile` always. A repo whose `HEAD` does not
resolve reports every commit counter 0.

### Fleet mode JSON

```
{
  mode: 'fleet', reposRoot: '<abs>', since: '<YYYY-MM-DD>',      // since default = fleet-reader gate08.cutover
  repos: [ { name, dir, selfRepair: true|false, git: true|false, ledger: true|false,
             commits, fixShaped, landedPostClose, inFlightOnly, noSpecFile, rows, share } ],
                                                                  // population order; git:false → every counter null, rows null, share null
  fleet: { repos: N,            // host repos with git:true
           commits, fixShaped, landedPostClose, inFlightOnly, noSpecFile,
           rows: { commit, manual, unknown }, share },
  excluded: { selfRepair: ['<name>'…], noGit: ['<name>'…] }
}
```

### Window / fleet human render

```
Commit-time escape coverage since <since> — <name> (<dir>)                                  [window]
Commit-time escape coverage since <since> — this machine's checkouts under <reposRoot> (<N> repos)   [fleet]
  <name>[ (self-repair, not in fleet totals)][ (no git checkout)]: commits=<N> fix=<N> → landed-post-close=<N> in-flight-only=<N> no-spec-file=<N> · rows via commit=<N> manual=<N> unknown=<N> → share <c>/<l> (<pct>)
  fleet (hosts): commits=<N> fix=<N> → landed-post-close=<N> in-flight-only=<N> no-spec-file=<N> · rows via commit=<N> manual=<N> unknown=<N> → share <c>/<l> (<pct>)
  excluded: selfRepair=<N> noGit=<N>
```

`<pct>` = `(share*100).toFixed(1) + '%'` (2/42 → `4.8%`); `n/a` when share is null. A `(no git
checkout)` repo prints `commits=— fix=—` … `share n/a`. The window render is the header line
plus the one repo line (no `fleet`/`excluded` lines).

### `/git:commit` step 3 (D8)

```
## Step 3: Escape Check (fix commits only, skippable)

Runs only when `.claude/spec-runs.jsonl` exists at repo root **and** the commit is plausibly
a defect fix — the user said so, or the subject's conventional type is `fix`/`hotfix` —
otherwise skip with zero output.

1. Run `node "$(spec-paths commit-coverage)" --root . --commit HEAD --json`. A non-zero
   exit prints one `⚠️` line naming the exit code and skips the check — never blocks.
2. `offer: false` (or, when the user called it a fix, `landed` empty) → skip silently: no
   touched file was landed by a spec whose review closed before this commit.
3. Otherwise offer once via `AskUserQuestion` (skippable, never blocking the commit): record a
   `/spec:escape` row for the defect this commit fixes? Name `landed[0].specs[0].spec` and its
   `reviewRunId`, the count of landed files, and the count of distinct landing specs (when
   more than one, say `/spec:escape` will confirm the spec with you). Question style: plain
   language, self-contained, consequences per option, recommended pick first.
4. Yes → run `/spec:escape <that spec path>` (it owns the row schema; tell it the invocation
   is commit-driven so the row carries `via:"commit"`). No → proceed silently.
```

Rule 7 becomes: `Escape check never slows non-fix commits — gated on a fix-typed subject (or
the user calling it a fix) AND ledger presence; both absent means zero cost`.

### `spec/entrypoints.json`

`"spec/scripts/commit-coverage.js": { "entryPoints": ["git/commands/commit.md"] }` — the forward
check is satisfied by commit.md's `spec-paths commit-coverage` mention; the reverse check
(spec-paths keys) resolves the new key to the new file.

## Behavior

- **The offer, end to end.** JJ runs `/git:commit` in a host after fixing a bug. Step 2 commits
  `fix(nango): unwrap the 0.71 connection listing`. Step 3 sees a fix-typed subject and a
  ledger, runs the script: three touched files are landed by six reviewed specs (the newest
  review `2026-08-17` on `specs/20260816/02-…`), one file (`docs/canonical/connections.md`) by
  none. `offer: true` → one question naming `specs/20260816/02-connect-failure-attribution.md`
  and "6 specs landed these files — /spec:escape will confirm". Yes → `/spec:escape` runs,
  row carries `via:"commit"`. No → the report renders as today.
- **Reading the number cold.** From the plugin repo:
  `node "$(spec-paths commit-coverage)" --repos-root ~/Projects`. Population prints first,
  one line per checkout (self-repair and no-git checkouts labeled), then the host fleet line
  and the excluded line. From a host: `--since 2026-08-17` for that repo alone.
- **Landing vs in flight.** A fix commit made while a spec is still under build or review
  touches files that spec lists but no review row precedes the commit → `inFlight`, not
  offered. The same commit touching a file an older, reviewed spec also lists → offered on the
  older spec (a later-spec escape is exactly the `foundBy: later-spec` case).
- **Edge cases.** A merge commit passed to `--commit` lists whatever `git show --name-only`
  prints for it (no special handling; `/git:commit` never produces merges). A `--since` date
  is midnight UTC (`Date.parse('2026-08-17')`). A ledger row with an unparseable `ts` is
  skipped for the review join and the row buckets (never a crash). An empty `specs/` directory
  or a spec with no File Plan lands nothing. Subjects containing `|` or `%x1f`-free control
  characters survive the `%x1f`-separated log parse (only the first two fields are split).
- **Test fixture recipe (for the test author).** Build a synthetic repo with
  `helpers.gitRepo(dir, { empty: true })`, then commit with
  `execFileSync('git', ['-C', dir, 'commit', …], { env: { ...process.env, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } })`
  so committer dates are literal; write specs as `specs/2026MMDD/NN-x.md` with a
  `## File Plan` table (`| Path | Action | Layer | Summary |`); write the ledger as
  `.claude/spec-runs.jsonl` rows `{ts, stage:'review', spec, runId, verdict}` and
  `{ts, stage:'escape', spec, file, via}`. For fleet mode, a repos-root holding directories
  with `.claude/spec.config.json` (`{}` suffices for `configExists`), a `.claude-plugin/marketplace.json`
  on the self-repair one, and one config-bearing directory without `.git`.

## Acceptance Criteria

- **AC-20260904-01-1**: WHEN `spec-paths commit-coverage` runs THE SYSTEM SHALL print the absolute path of `spec/scripts/commit-coverage.js`, an existing regular file → `spec-paths.test.js` (the resolves-list loop gains the key, plus one dedicated test)
- **AC-20260904-01-2**: WHEN `spec/entrypoints.json` is parsed THE SYSTEM SHALL hold a key `spec/scripts/commit-coverage.js` whose `entryPoints` array contains exactly `git/commands/commit.md` → `commit-escape-check.test.js`
- **AC-20260904-01-3**: WHEN `--commit <sha> --json` runs against commits with these subjects THE SYSTEM SHALL report `fixShaped` as: `fix(nango): unwrap the listing` → `true`; `hotfix: x` → `true`; `fix!: x` → `true`; `FIX(x): y` → `true`; `review(20260903/02): CLEAN — two defects fixed` → `false`; `Fix login crash` → `false`; `bugfix: x` → `false` → `commit-mode.test.js`
- **AC-20260904-01-4**: WHEN a synthetic repo holds spec `specs/20260801/01-a.md` (File Plan `src/a.js`) with review rows `{ts:"2026-08-10", runId:"rv_a1", verdict:"SURVIVORS"}` and `{ts:"2026-08-20T00:00:00Z", runId:"rv_a2", verdict:"CLEAN"}`, spec `specs/20260801/02-c.md` (File Plan `src/a.js`) with review row `{ts:"2026-08-21T00:00:00Z", runId:"rv_c1", verdict:"CLEAN"}`, spec `specs/20260801/03-b.md` (File Plan `src/b.js`) with review row `{ts:"2026-08-25T00:00:00Z"}`, spec `specs/20260801/04-g.md` (File Plan `src/gen/*.js`) with review row `{ts:"2026-08-20T00:00:00Z", runId:"rv_g1", verdict:"CLEAN"}`, and a commit `fix(x): y` with committer date `2026-08-22T00:00:00Z` touching `src/a.js`, `src/b.js`, `src/gen/x.js`, `src/c.js` THE SYSTEM SHALL emit `files` = those four paths, `landed` = `[{file:"src/a.js", specs:[{spec:"specs/20260801/02-c.md", reviewTs:"2026-08-21T00:00:00Z", reviewRunId:"rv_c1", verdict:"CLEAN"}, {spec:"specs/20260801/01-a.md", reviewTs:"2026-08-20T00:00:00Z", reviewRunId:"rv_a2", verdict:"CLEAN"}]}, {file:"src/gen/x.js", specs:[{spec:"specs/20260801/04-g.md", reviewTs:"2026-08-20T00:00:00Z", reviewRunId:"rv_g1", verdict:"CLEAN"}]}]`, `inFlight` = `[{file:"src/b.js", specs:["specs/20260801/03-b.md"]}]`, `offer: true`, exit 0; and the same repo with the commit's subject `feat(x): y` SHALL emit the same `landed` with `fixShaped: false`, `offer: false` → `commit-mode.test.js`
- **AC-20260904-01-5**: WHEN `--commit HEAD --json` runs in a git repo with no `.claude/spec-runs*.jsonl` THE SYSTEM SHALL exit 0 with `ledger: false`, `landed: []`, `offer: false`; WHEN `--root` names a directory that is not a git repository THE SYSTEM SHALL exit 2 with stderr naming `--root`; WHEN `--commit deadbeef` names no commit THE SYSTEM SHALL exit 2 with stderr containing `deadbeef`; WHEN an unknown flag `--bogus` is passed THE SYSTEM SHALL exit 2 with the usage line on stderr and nothing on stdout → `commit-mode.test.js`
- **AC-20260904-01-6**: WHEN `--since 2026-08-17 --json` runs in a synthetic repo whose commits (committer dates) are `fix(a): one` @ `2026-08-16T23:59:59Z` (touches `src/a.js`, landed), `fix(b): two` @ `2026-08-17T00:00:00Z` (touches `src/a.js`, landed by a spec reviewed `2026-08-10`), `fix(c): three` @ `2026-08-18T00:00:00Z` (touches `src/b.js`, listed by a spec whose only review row is `2026-08-30`), `fix(d): four` @ `2026-08-19T00:00:00Z` (touches `src/zzz.js`, listed nowhere), `feat: five` @ `2026-08-20T00:00:00Z`, and finally `chore: six` @ `2026-08-01T00:00:00Z` at `HEAD` (committer date older than since), and whose ledger holds escape rows `{ts:"2026-08-18T00:00:00Z", via:"commit"}`, `{ts:"2026-08-18T00:00:00Z", via:"manual"}`, `{ts:"2026-08-18T00:00:00Z"}` (no via), `{ts:"2026-08-16T00:00:00Z", via:"commit"}` THE SYSTEM SHALL emit `repo.commits: 4`, `fixShaped: 3`, `landedPostClose: 1`, `inFlightOnly: 1`, `noSpecFile: 1`, `rows: {commit:1, manual:1, unknown:1}`, `share: 1` (the old-dated HEAD commit hides nothing) → `window-mode.test.js`
- **AC-20260904-01-7**: WHEN `--commit <sha>` runs without `--json` against the AC-4 repo THE SYSTEM SHALL print a first line `commit <12-hex> — fix(x): y`, a line `  fix-shaped: yes · ledger: yes · files: 4`, a line `  offer: yes — 2 files landed by reviewed specs (3 distinct)`, a line `    src/a.js ← specs/20260801/02-c.md (review rv_c1 CLEAN 2026-08-21T00:00:00Z); specs/20260801/01-a.md (review rv_a2 CLEAN 2026-08-20T00:00:00Z)`, and a line `  in-flight: 1 files listed by specs not yet reviewed`; against a repo with no ledger it SHALL print `  offer: no — no ledger`; and the stdout SHALL NOT parse as JSON → `commit-mode.test.js`
- **AC-20260904-01-8**: WHEN `--repos-root <dir> --json` runs over a repos-root holding `host-a` (config, git, the AC-6 history and ledger), `plug` (config, git, `.claude-plugin/marketplace.json`, one `fix: p` commit @ `2026-08-18T00:00:00Z` touching a landed file, one escape row `via:"commit"` @ `2026-08-19T00:00:00Z`), `nogit` (config, no `.git`), and `empty` (config, `git init` with zero commits), with no `--since` THE SYSTEM SHALL emit `since` = the fleet reader's `gate08.cutover`, `repos` in population order with `nogit` → `git:false` and every counter `null`, `empty` → `commits: 0`, `plug` → `selfRepair: true`, `fleet` = `{repos: 2, commits: 4, fixShaped: 3, landedPostClose: 1, inFlightOnly: 1, noSpecFile: 1, rows: {commit:1, manual:1, unknown:1}, share: 1}` (host-a and empty only), and `excluded` = `{selfRepair: ["plug"], noGit: ["nogit"]}`; WHEN `--since 2026-08-19` is passed THE SYSTEM SHALL use it instead of the cutover → `fleet-mode.test.js`
- **AC-20260904-01-9**: WHEN `--since 2026-08-17` runs without `--json` against the AC-6 repo at `<dir>` THE SYSTEM SHALL print exactly two lines: `Commit-time escape coverage since 2026-08-17 — <basename> (<dir>)` and `  <basename>: commits=4 fix=3 → landed-post-close=1 in-flight-only=1 no-spec-file=1 · rows via commit=1 manual=1 unknown=1 → share 1/1 (100.0%)`; and a repo whose window holds no fix-shaped commit SHALL render `share 0/0 (n/a)` → `window-mode.test.js`
- **AC-20260904-01-10**: WHEN fleet mode runs over the AC-8 repos-root THE SYSTEM SHALL leave every file under it byte-identical and create no file (read-only, no cache) → `fleet-mode.test.js`
- **AC-20260904-01-11**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL contain, inside the `## Step 3` section, the literal `spec-paths commit-coverage`, the literal `--commit HEAD`, the literal `offer`, and the phrase `never blocks`; SHALL NOT contain `git blame` or `jq` anywhere; and rule 7 SHALL contain `fix-typed subject` → `commit-escape-check.test.js`
- **AC-20260904-01-12**: WHEN `git/.claude-plugin/plugin.json` and `spec/.claude-plugin/plugin.json` are parsed THE SYSTEM SHALL report a strict `MAJOR.MINOR.PATCH` `version` in each, the git plugin's differing from `1.2.0` and the spec plugin's differing from `7.77.1` → `commit-escape-check.test.js`
- **AC-20260904-01-13**: WHEN `git/commands/commit.md` is read THE SYSTEM SHALL CONTINUE TO contain the phrase `never blocking the commit` in Step 3 and the rule `Never touch worktrees` → `commit-escape-check.test.js`
- **AC-20260904-01-14**: WHEN `fleet-reader.js --json` runs THE SYSTEM SHALL CONTINUE TO print exactly the nine top-level keys `cleanByVia, cleanContradicted, driftCensus, escapes, gate08, legRecency, owed, population, replayDebt` → the existing exhaustive pin in `discovery.test.js`, tagged (no assertion change)

## Assumptions (escalation triggers)

- A1: The brief's 40-commit denominator is over-broad and under-scoped — **executed check** (scratch script over prax, salon-os, upwell since 2026-08-17, subject-only): substring `fix|hotfix|regression|bug` matched 86 subjects, of which 41 are pipeline-stage commits (`review(…): CLEAN — … fixed`, `build(…)`, `design(…): fidelity fixes`); conventional `fix`/`hotfix` type tokens matched 45–50 (author-date vs committer-date pass); word-bounded `regression|bug` outside the type rule matched 0. **if false:** D2's regex is a one-line constant — widen it and re-run the window mode; the contract shape does not change.
- A2: The current step-3 heuristic is the leak — **executed check**: host spec-landed commits are worded `review(20260903/03): CLEAN — …`, `build(20260901/10): …`, `feat(20260903/01): …`; `merge-back.sh` writes `merge: squash <src> into <target>` or git's default merge subject; a literal `specs/` path appears in the prior-3-commit messages of a touched file for 18 of 45 host fix commits, while File Plan membership plus a prior review row covers 42 of 50. **if false:** D3 stands on its own merits (deterministic, message-independent); the Rationale's "why the offer misses" paragraph is corrected.
- A3: Prototype of the D2–D7 contract over the fleet (committer date, in-process filter, since = 2026-08-17): hosts `fixShaped` 50, `landedPostClose` 42 (10 single-spec, 32 multi-spec), `inFlightOnly` 7, `noSpecFile` 1, rows via commit 2, via manual 9, share 0.0476; prax 15/13/0 rows, salon-os 17/12/0, upwell 18/17/2 (share 0.1176); plugin repo (self-repair) 37/33, 1 commit row, share 0.0303; autopilot-hub, zubu-menu, hiwora 0 commits in window; bwm-booking, cctop, zubu-ai no ledger. **if false (a build-time re-run differs):** numbers only inform the render's shape — update this line, never a decision.
- A4: `Date.parse` reads every ledger `ts` shape on this machine — **executed check** on `2026-08-04`, `2026-09-05T03:02:55.208281+00:00`, `2026-09-01T20:52:00Z`, `2026-08-23T18:21:47Z`, `2026-09-02T17:35:40.000Z`, `2026-09-04T19:50:00+09:00` → all finite epochs (date-only = midnight UTC; microseconds truncated to ms; offsets normalized); `Date.parse('not-a-date')` → `NaN`. Shape census over review+escape rows: `dddd-dd-dd`, `…Tdd:dd:dd.dddZ`, `…Tdd:dd:ddZ` only. **if false:** skip the row (D4's unparseable rule) and count it in a `rowsUnparsed` field — STOP and ask before adding the field.
- A5: `git log --since` truncates the walk — **executed spike** (scratch repo): commits with committer dates 08-20 and 08-25 print under `--since=2026-08-17`; after adding a HEAD commit with committer date 08-01 the same query prints nothing, and `rev-list --count --since` returns 0. `--since` compares committer date (author 08-10 / committer 08-25 is included). `%cI` prints `2026-08-20T10:00:00Z` for a Z-dated commit and `2026-08-25T12:00:00+09:00` for an offset one. **if false:** D4's in-process filter is still correct; nothing changes.
- A6: `git show --format= --name-only <sha>` lists a root commit's files (`a.txt\n`) and a normal commit's; `git log --format=%H%x1f%cI%x1f%s` separators survive a subject containing `|`; an unknown sha exits 128 with `unknown revision`; a non-repo exits 128 with `not a git repository`; an empty repo's `log` exits 128 (`does not have any commits yet`) and `rev-parse --verify -q HEAD` exits 1; a worktree checkout's `.git` is a regular file — **executed spike**. **if false:** the affected exit-2 remedy or the D7 zero-commit rule is adjusted in place.
- A7: `lib/file-plan.parseFilePlan` and `lib/glob-match.globMatch` behave as D3 assumes — **executed check**: `parseFilePlan` on `upwell/specs/20260816/02-connect-failure-attribution.md` → 22 paths including `app/src/lib/nango.ts`; `globMatch('src/components/*.tsx','src/components/a.tsx')` true, `('src/**/*.ts','src/a/b/c.ts')` true, `('src/*.ts','src/a/b.ts')` false, exact path true; six host File Plan rows in the prototype matched via globs. **if false:** the libs are the sole parsers by doctrine — fix the lib under its own owner, never a private parser here.
- A8: Adding the `commit-coverage` key reddens no exhaustive pin — **executed check**: `tests/spec-paths.test.js`'s resolves loop is a positive list (no "no other keys" assertion); `tests/consistency/entrypoints.test.js` requires a manifest entry for every executable under `spec/scripts/` (minus `lib/`) — the File Plan row provides it — and its forward check accepts a command `.md` mentioning `spec-paths <key>`. **if false (a pin reddens):** update it in place under AC-1/AC-2, never loosen.
- A9: The baseline is green — **executed check**: `node --test 'tests/fleet-reader/*.test.js' 'tests/escape/*.test.js' tests/spec-paths.test.js tests/consistency/entrypoints.test.js tests/consistency/plugin-version.test.js` → 94 tests, 94 pass, 0 fail. **if false:** a concurrent session's regression — stop and report, never repair inside this build.
- A10: Whether `/git:commit` drove a given host fix commit is not recoverable from git — the `🤖 Generated with Claude Code` / `Co-Authored-By: Claude` trailer is on 100% of host fix commits and is also Claude Code's default — and no artifact records an offer that was declined. **if false (a trailer or ledger field distinguishes them):** the window mode gains a `viaGitCommit` counter in a later spec; this one measures rows against candidates only.

## Rationale

**Why a standalone script.** The brief left "one script or fleet-reader question" open. The
fleet reader is a pure ledger reader with a frozen nine-key `--json` shape, invoked twice inside
every `/spec:escape` run (class registry, corpus gaps), and its eight test files stand up
synthetic fleets that have no `.git`. A tenth question would spawn `git` across ten checkouts
on each of those calls and force a git-less degrade path through every existing fixture. A
separate script costs one `spec-paths` key and one manifest entry, and is deleted in one
commit if the measurement proves useless. Fleet mode still takes its population from the
fleet reader's own JSON, so there is exactly one discovery rule and one cutover literal.

**Why the type token, not the brief's regex.** Measured (A1): the substring rule nearly
doubles the denominator with the pipeline's own repair commits — a review close whose subject
says "two defects fixed" is a review doing its job, not a fix that slipped past one — and the
`regression|bug` words add nothing. Every host uses conventional commits; `/git:commit` drafts
them that way; the user-said-so path in commit.md covers the rest.

**Why File Plan + review row, not blame.** The existing step asks git history whether "a spec
merge/close commit referencing a `specs/...` path" landed the fixed lines. Host spec commits
never spell that path (`review(20260903/03): CLEAN — …`; merge-back's `merge: squash …`), so the
check depends on whether a build worker happened to paste a spec path into a body. File Plan
membership is a fact on disk written at plan time; the review row is the fact that a review
passed. Joined on the commit's committer date they answer the only question the offer needs:
did a review already pass over this code before it was fixed? A spec still under build or
review lists the file too — those are its own repairs, so they are counted (`inFlight`) and
never offered.

**Why the offer widens to any reviewed landing spec.** JJ's ruling this session, priced on the
measured numbers: ≈8 of 10 host fix commits touch files a reviewed spec landed (32 of 42 span
several specs, because File Plans overlap heavily — 51% of unrelated-brief pairs share files).
Restricting to single-spec cases would fire on ≈2 of 10 and keep the leak. `/spec:escape` step 1
already resolves the multi-spec pick with the user, so the offer only names the best candidate
and says how many there are.

**What this cannot measure.** Neither an offer nor a decline leaves an artifact, and git cannot
tell a `/git:commit`-driven commit from any other Claude Code commit (A10). The share is
therefore rows-recorded over commits-that-would-be-offered — a ratio of counts. Recording
declines is out of scope by the brief; if the share stays low after the widening, the honest
next question is whether fixes bypass `/git:commit` altogether, not whether to gate.

**What is fragile.** A host that rewrites history (rebase with new committer dates after a
review) moves commits across the review-row boundary; the derivation reads what git says now.
Glob File Plan rows are honored but `parseFilePlan` drops path-less cells, so a spec whose plan
lists a bare directory lands nothing under it — visible as `noSpecFile`, never silent.

**Collision closure (lock-time, advisory).** D8 retires the `git blame` heuristic from
commit.md. Literals leg for stem `blame`: 5 hits — `git/commands/commit.md` is the planned fix
row; `spec/agents/reviewer.md` and `tests/review/reviewer-scope-identity.test.js` use "blame"
for the reviewer's range-identity rule (`merge-base --is-ancestor <blamed-commit>`), a different
mechanism, waived; `docs/roadmap/23-*.md` and `docs/roadmap/25-*.md` are planning prose that
describes the retired step, waived (roadmap is a waived prefix for retired-name sweeps). The
`jq` stem was not swept as a retirement: `jq` stays the sanctioned ledger reader everywhere else
and only commit.md's step-3 lookup goes. Paths leg: the 16 `executes` hits on `spec/bin/spec-paths`
were read — every one resolves existing keys or asserts the `usage: spec-paths` prefix on refusal;
adding a key changes neither, so no fixture repair is owed. `spec/entrypoints.json` and both
plugin manifests show only `likely`/`mentions` hits.

**Regression pins.** commit.md's never-blocking sentence and worktree rule (AC-13) and the
fleet reader's nine-key set (AC-14) carry `SHALL CONTINUE TO`; each lives in its own AC, never
mixed with a new promise (specs/20260903/01 D16's lesson).

## Canonical Delta

`docs/canonical/pipeline.md`, after the paragraph describing the fleet reader's `owed` question:
add — "Commit-time escape coverage is a derived number, never asserted:
`node "$(spec-paths commit-coverage)" --repos-root ~/Projects` prints, population first, per
checkout and for the host fleet, the fix-typed commits (`fix`/`hotfix` type token) since the v7
cutover, how many touched a file a reviewed spec landed (File Plan membership joined to a
`stage:"review"` row that precedes the commit's committer date), and the escape rows recorded
`via:"commit"` in the same window; `--since` scopes one repo, `--commit <sha>` answers the
single-commit question `/git:commit`'s step 3 asks. The commit-time offer fires on `offer: true`
— a fix-typed commit touching any file a reviewed spec landed — and is always skippable; a spec
still under build or review is in flight and never offered. Nothing blocks a commit and no
decline is recorded. (specs/20260904/01-commit-time-escape-coverage.md)"
