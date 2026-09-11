#!/usr/bin/env node
'use strict'
// red-check.js --spec <path> --root <dir> --base <sha-or-ref> [--expect-green <path>]... [--json]
//
// specs/20260821/01-red-check.md: build.md Phase 0 step 2 (classify every
// tests-layer file's expected pre-image colour) and Phase 1's red-check paragraph (execute each
// file, reconcile observed against expected) were hand-run from prose every build — a leg that
// drifts per session and per model. Worse, the recurring failure class this reconciliation exists
// to catch — an AC that structurally cannot go red before implementation (a pre-existing generic
// fallback already rejects it, an absence invariant an inert stub already satisfies, a predicate
// that IS the deliverable inside a test file) — lived only in a thrice-amended Gotchas paragraph
// in .claude/rules/spec-pipeline.md, all 16 recorded instances benign. This script IS the
// reconciliation: it derives each tests-layer File Plan file's expected colour from the spec's AC
// vocabulary (a `SHALL CONTINUE TO` pin, or a closed-enum `[pre-green: <reason>]` tag — the tag
// grammar/enum live in lib/spec-sections.js, the single authority, D1), executes `{testCommand}`
// (+ `{typecheckCommand}` when declared) once per file against the untouched pre-image, and
// reports every mismatch as a named finding. build.md's classification prose and red-check
// paragraph shrink to this invocation line.
//
// What this deliberately does NOT do: parse or attribute runner OUTPUT (exit codes only — a
// crash-red vs assert-red distinction stays orchestrator judgment, per build.md's disposition
// rules); render a review report or compute a verdict (this is a build-Phase-1 gate, never a
// review leg); snapshot or restore the tree (the working tree AT INVOCATION TIME is the
// pre-image — the purity refusal below exists precisely because no snapshot is taken); validate
// `[pre-green:]` reasons anywhere but here and in ac-matrix.js (lib/spec-sections.js's
// `parseAcBullets` returns the raw tag unvalidated by design, D1); or expand a File Plan glob
// through any matcher but the shared lib/glob-match.js.
//
// An `[env: VAR]` tag on EVERY AC a green red-expected file carries downgrades that file's
// unsanctioned-green finding to a warning naming each withheld variable — the same trust
// ac-matrix.js already grants the tag for a skipped test. `expected` itself is never flipped to
// green by the tag, so a genuinely-red env-gated file (the variable provisioned, the suite run)
// still matches its expected colour instead of reporting as a broken pin.
//
// Exit codes: 0 = every resolved tests-layer file matches its expected pre-image colour ·
//             1 = findings emitted (unsanctioned-green | broken-pin | missing-test-file |
//                 invalid-pre-green | rejected-trailing-tag | mixed-pin | gutted-rewrite |
//                 broken-reuse) — rides the normal build Phase 1 disposition flow, never a script
//                 failure · 2 = usage error, unreadable --spec, no ## Acceptance Criteria section,
//                 host config declares no testCommand, or a pre-image purity refusal (a non-tests
//                 File Plan path already differs from --base — tracked or untracked)
//
// specs/20260911/04-every-criterion-declares-its-test.md D6/D7/D8: an AC declaring `rewrites` or
// `reuses` (lib/spec-sections.js's `parseDisposition`) gets one additional TARGETED run, on top of
// the whole-file arms above, ONLY when the host config declares `testNameFilter` — a shell-
// argument fragment carrying `{name}`. A `rewrites` case observed green is hard `gutted-rewrite`;
// a `reuses` case observed red is hard `broken-reuse`. Absent `testNameFilter`, every rewrites/
// reuses AC degrades to today's whole-file-only behaviour with exactly one warning naming the
// key — never one per AC, never a per-test spawn. A reference that resolves to other than exactly
// one pre-image test, or resolves but is absent from the filtered run's OWN OUTPUT (a pattern
// matching nothing still exits 0 — Assumptions A1), falls back the same way, WARN naming the file/
// prefix/cause (`unresolved` | `unselected`) — never a finding on that path alone. `--json` gains
// a fourth top-level array, `dispositions`, one entry per rewrites/reuses AC.
//
// specs/20260821/03-cross-spec-skip-mapping.md D7: the carried-AC
// classifier below (content.includes(b.id)) was a bare substring test — a tests-layer file
// citing only a longer AC-ID that shares a shorter red-expected AC's prefix (AC-...-12 sharing
// AC-...-1's prefix) phantom-carried the shorter id in too, forcing a false red expectation onto
// a file that never mentions it (observed: a false unsanctioned-green, the live hit that stopped
// specs/20260822/02's build). Fixed by replacing the bare .includes with
// lib/spec-sections.js's exported acIdOccurs, a full-token occurrence check — the same authority
// ac-matrix.js's coverage grep also uses.
//
// specs/20260823/03-silent-drop-hardening.md D1 (the
// silent-drop incident): a carried AC's `[pre-green:]` tag, when it ends the bullet backticked,
// is refused as a declaration by lib/spec-sections.js's bare-only trailing rule (rv_640c582f4902)
// — that refusal otherwise misreports as a plain `unsanctioned-green` with no hint the refusal is
// the actual cause. Loud-when-it-bites, never unconditional: when a red-expected file is observed
// green AND a carried AC's bullet has a refused trailing tag naming `[pre-green:`, the new hard
// finding `rejected-trailing-tag` REPLACES `unsanctioned-green` for that file — never both. A
// carried AC whose refused tag never changes the file's expected colour (e.g. the AC is already
// sanctioned another way) stays silent.
//
// specs/20260907/01-mixed-pin-guard-and-drift-line.md D1/D2: a carried AC whose `pinShape`
// (lib/spec-sections.js, the one authority also imported by ac-matrix.js D3 and `/spec:plan` lock
// D4) is `'mixed'` — a bullet mixing a new `SHALL` promise with a `SHALL CONTINUE TO` regression
// pin — is never sanctioned: the file gets exactly one hard `mixed-pin` finding naming every mixed
// AC-ID and the split remedy, no colour classification runs for that file in this pass (no
// `unsanctioned-green`/`broken-pin`), and the `{testCommand} <file>` run still executes and is
// logged — only the colour verdict is withheld, never the observation.

const fs = require('fs')
const path = require('path')
const { execFileSync, spawnSync } = require('child_process')
const { parseFilePlanRows } = require('./lib/file-plan')
const { globMatch } = require('./lib/glob-match')
const { readConfig } = require('./lib/host-config')
const { scanCalls } = require('./lib/scan-test-calls')
const {
  extractSection, parseAcBullets, PRE_GREEN_REASONS, acIdOccurs, rejectedTrailingTagDetail,
  normalizeForPinCheck, pinShape, parseDisposition,
} = require('./lib/spec-sections')

function usage() {
  console.error('usage: red-check.js --spec <path> --root <dir> --base <sha-or-ref> ' +
    '[--expect-green <path>]... [--json]')
}

let specPath = null, root = null, base = null, jsonOut = false
const expectGreenPaths = []
const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--spec') specPath = argv[++i]
  else if (a === '--root') root = argv[++i]
  else if (a === '--base') base = argv[++i]
  else if (a === '--expect-green') expectGreenPaths.push(argv[++i])
  else if (a === '--json') jsonOut = true
  else { usage(); process.exit(2) }
}
if (!specPath || !root || !base) { usage(); process.exit(2) }

let specText
try {
  specText = fs.readFileSync(specPath, 'utf8')
} catch (e) {
  console.error(`red-check: cannot read --spec ${specPath} — confirm the spec file exists: ${e.message}`)
  process.exit(2)
}

const acSection = extractSection(specText, 'Acceptance Criteria')
if (acSection === null) {
  console.error(`red-check: ${specPath} has no ## Acceptance Criteria section — nothing to classify`)
  process.exit(2)
}
const bullets = parseAcBullets(acSection)
const wellFormed = bullets.filter(b => !b.malformed)
const bulletById = new Map(wellFormed.map(b => [b.id, b]))

// D10 (specs/20260823/03-silent-drop-hardening.md): `rejectedTrailingTagDetail` — the `rejected-trailing-tag`
// remedy-text builder — is imported from lib/spec-sections.js, the one authority, rather than
// defined here. The first implementation landed a byte-identical local copy in both this file and
// ac-matrix.js — the exact two-identical-copies shape D4 (this spec) exists to eliminate. See
// that module's own comment above the function for why it lives beside the refusal predicate (D2)
// it explains; message bytes are unchanged (pinned by the AC-20260823-03-3 detail assertions).

const filePlanRows = parseFilePlanRows(specText)

// ---- D5: host config read ONLY through lib/host-config.js readConfig (name-ban) --------

const config = readConfig(root)
if (!config.testCommand) {
  console.error('red-check: host config declares no "testCommand" — add it to the host config, ' +
    'or run /spec:init to regenerate the grounding layer')
  process.exit(2)
}

// ---- D4: pre-image purity refusal — BEFORE any test file is resolved or executed ----------------
// Derived as the union of `git diff --name-only <base>` (tracked edits; A2: blind to untracked
// paths) and untracked paths from `git status --porcelain --untracked-files=all` (A2's fix for
// that blindness), intersected with the File Plan's NON-tests paths. Tests-layer paths are always
// exempt — the tests themselves are expected to differ from --base; that is what red-check exists
// to reconcile.

function gitLines(args) {
  try {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
  } catch (e) {
    console.error(`red-check: \`git ${args.join(' ')}\` failed under --root ${root} — confirm ` +
      `--root is a git repository and --base ${base} resolves (git rev-parse --verify ${base}): ${e.message}`)
    process.exit(2)
  }
}

const trackedDiff = gitLines(['diff', '--name-only', base])
const untracked = gitLines(['status', '--porcelain', '--untracked-files=all'])
  .filter(l => l.startsWith('??'))
  .map(l => l.replace(/^\?\?\s+/, ''))
const changedPaths = new Set([...trackedDiff, ...untracked])

const nonTestsPatterns = filePlanRows
  .filter(r => (r.layer || '').trim().toLowerCase() !== 'tests')
  .flatMap(r => r.paths)

function matchesNonTests(p) {
  return nonTestsPatterns.some(pat => (pat.includes('*') ? globMatch(pat, p) : pat === p))
}

const offending = [...changedPaths].filter(matchesNonTests)
if (offending.length) {
  console.error(`red-check: pre-image is not pure — non-tests File Plan path(s) already differ ` +
    `from --base ${base}: ${offending.join(', ')} — reconcile the working tree to match --base ` +
    `before running red-check (a post-image run proves nothing about vacuity)`)
  process.exit(2)
}

// ---- D2/D3: resolve tests-layer File Plan rows (DELETE rows skipped, per ac-matrix D13) --------

const testsRowEntries = filePlanRows
  .filter(r => (r.layer || '').trim().toLowerCase() === 'tests')
  .flatMap(r => {
    const isDelete = (r.action || '').trim().toLowerCase() === 'delete'
    return r.paths.map(p => ({ p, isDelete }))
  })

function walkAll(dir, rootDir, out = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (e.name === '.git') continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) walkAll(full, rootDir, out)
    else out.push(path.relative(rootDir, full).split(path.sep).join('/'))
  }
  return out
}

const testFiles = new Set()
let allFilesCache = null
for (const { p, isDelete } of testsRowEntries) {
  if (isDelete) continue // D2: a DELETE row is satisfied by the file's planned absence
  if (p.includes('*')) {
    if (allFilesCache === null) allFilesCache = walkAll(root, root)
    for (const f of allFilesCache) if (globMatch(p, f)) testFiles.add(f)
  } else {
    testFiles.add(p)
  }
}

// ---- D1: per-AC sanctioning — `SHALL CONTINUE TO` in the bullet's raw text, or a VALID
// `[pre-green:]` reason (validated here against PRE_GREEN_REASONS; the parser itself does no
// enum validation, D1) — plus the invalid-pre-green fail-closed classification -------------------
//
// Hardened (escape rv_640c582f4902, unanchored-marker-match — the same defect class
// the review just fixed for [oracle:]/[env:]/[pre-green:], left in place for this sibling
// marker): a literal `SHALL CONTINUE TO` search over the bullet's whole raw text fails OPEN in
// both directions. A quoted mention inside a backticked code span (an AC discussing the marker,
// not declaring one — specs/20260821/01-red-check.md AC-20260821-01-4) self-sanctions with no
// real pin. Conversely a genuine pin hard-wrapped mid-phrase across a continuation line
// (`…AND SHALL\n  CONTINUE TO require…` — specs/20260810/02-terminal-observable-acs.md
// AC-20260810-02-4, the Gotchas' recorded hard-wrap-blindness hazard) can miss the literal regex
// entirely and only "pass" by accident when the bullet ALSO happens to quote the phrase
// elsewhere. `normalizeForPinCheck` fixes both at once: inline code spans are stripped first (a
// quoted marker is never a declaration), then whitespace runs — including the newline a
// hard-wrap introduces — collapse to a single space (a wrapped genuine pin still reads as one
// phrase). The regex then runs on that normalized text, never on `b.raw` directly.
//
// specs/20260907/01-mixed-pin-guard-and-drift-line.md D1: `normalizeForPinCheck` is imported from
// lib/spec-sections.js (the single authority ac-drift.js and this file's own D1/D2 `pinShape` use
// too) rather than defined locally — a third from-scratch copy of the identical strip-then-collapse
// pass is the exact duplication this repo's calibration flags.

const preGreenValidity = new Map() // AC-ID -> 'valid' | 'invalid' (only set when tagged)
for (const b of wellFormed) {
  if (b.preGreen === null) continue
  preGreenValidity.set(b.id, PRE_GREEN_REASONS.includes(b.preGreen) ? 'valid' : 'invalid')
}

function isSanctioned(b) {
  if (/SHALL CONTINUE TO/.test(normalizeForPinCheck(b.raw))) return true
  return preGreenValidity.get(b.id) === 'valid'
}

const sanctionedById = new Map(wellFormed.map(b => [b.id, isSanctioned(b)]))

// ---- D2: `{testCommand} <file>` (+ `{typecheckCommand} <file>` when declared) — exit codes only,
// runner output is never parsed. NODE_TEST_CONTEXT is scrubbed so a nested `node --test` leg
// behaves as a fresh top-level runner even when red-check.js itself runs inside one.

function runLeg(cmd, relPath) {
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const res = spawnSync('bash', ['-c', `${cmd} ${JSON.stringify(relPath)}`], { cwd: root, env, stdio: 'ignore' })
  return res.status === null ? 1 : res.status
}

const expectGreenSet = new Set(expectGreenPaths)

const files = []
const findings = []
const warnings = []

for (const relPath of [...testFiles].sort()) {
  const fullPath = path.join(root, relPath)

  // D3/Spike A: existence probed BEFORE any execution — `node --test <missing-file>` exits 1,
  // which would fake a satisfied red expectation if the runner were invoked on it.
  if (!fs.existsSync(fullPath)) {
    findings.push({
      class: 'missing-test-file', path: relPath, acs: [],
      detail: `File Plan tests row ${relPath} does not exist under --root ${root}`,
    })
    continue
  }

  const content = fs.readFileSync(fullPath, 'utf8')
  const carriedAcs = wellFormed.filter(b => acIdOccurs(content, b.id)).map(b => b.id)

  // D3: zero carried AC-IDs → unclassified, a warning, and NEVER executed.
  if (carriedAcs.length === 0) {
    files.push({ path: relPath, expected: 'unclassified', observed: 'absent', carriedAcs: [] })
    warnings.push(`${relPath}: carries zero AC-IDs — unclassified, never executed`)
    continue
  }

  // specs/20260907/01-mixed-pin-guard-and-drift-line.md D2: a carried AC whose bullet mixes a new
  // promise with a SHALL CONTINUE TO pin is refused outright — no file colour is guessed while the
  // bullet is ambiguous. Exactly one hard finding for the whole file, naming every mixed AC-ID; the
  // run still executes and is logged (D2's Contracts), but no other finding class fires for it.
  const mixedAcs = carriedAcs.filter(id => pinShape(bulletById.get(id).raw) === 'mixed')
  if (mixedAcs.length) {
    findings.push({
      severity: 'hard', class: 'mixed-pin', path: relPath, acs: mixedAcs,
      detail: `${relPath}: ${mixedAcs.join(', ')} mixes a new promise with a SHALL CONTINUE TO pin ` +
        `— split the SHALL CONTINUE TO clause into its own AC, then re-run`,
    })
    let observed = runLeg(config.testCommand, relPath) === 0 ? 'green' : 'red'
    if (observed === 'green' && config.typecheckCommand) {
      observed = runLeg(config.typecheckCommand, relPath) === 0 ? 'green' : 'red'
    }
    files.push({ path: relPath, expected: 'unclassified', observed, carriedAcs })
    continue
  }

  const invalidAcs = carriedAcs.filter(id => preGreenValidity.get(id) === 'invalid')
  if (invalidAcs.length) {
    findings.push({
      class: 'invalid-pre-green', path: relPath, acs: invalidAcs,
      detail: `${relPath}: [pre-green:] reason outside PRE_GREEN_REASONS for ${invalidAcs.join(', ')} ` +
        `— stays red-expected (fail closed)`,
    })
  }

  let expected
  if (expectGreenSet.has(relPath)) {
    expected = 'green'
    warnings.push(`--expect-green ${relPath}: flipped to green-expected (orchestrator-derived sanction)`)
  } else {
    expected = carriedAcs.every(id => sanctionedById.get(id)) ? 'green' : 'red'
  }

  // Exit 124 is the host's test watchdog (`timeout`) killing a run that never finished — a
  // pinned CPU, not a failing assertion. It still classifies as red (a hung test is not green),
  // but it is surfaced by name so the build driver can record the incident on its build row
  // (core § Incident Policy materiality) instead of the trip vanishing into "observed: red".
  const testExit = runLeg(config.testCommand, relPath)
  if (testExit === 124) warnings.push(`watchdog-trip ${relPath} (exit 124) — the test run was killed by the host timeout, not a failing assertion`)
  let observed = testExit === 0 ? 'green' : 'red'
  if (observed === 'green' && config.typecheckCommand) {
    observed = runLeg(config.typecheckCommand, relPath) === 0 ? 'green' : 'red'
  }

  if (expected === 'green' && observed === 'red') {
    findings.push({
      class: 'broken-pin', path: relPath, acs: carriedAcs,
      detail: `${relPath}: sanctioned-green file failed its run`,
    })
  } else if (expected === 'red' && observed === 'green') {
    // D1: a refused trailing [pre-green:] tag on a carried AC's bullet replaces unsanctioned-green
    // — the refusal is causally relevant (it would have been this file's only sanction).
    const rejectedAc = carriedAcs.find((id) => {
      const b = bulletById.get(id)
      return b && b.trailingRejected && b.trailingRejected.includes('[pre-green:')
    })
    // The file must MENTION the variable it claims to be gated on. Without this, `[env:
    // ANY_NAME]` on a vacuous `assert.ok(true)` file would pass the build gate with a warning,
    // and nothing downstream would contradict it: ac-matrix.js's own `[env:]` sanction lives in
    // its SKIPPED-test reconciliation, so a test that passes never reaches it. A suite that
    // genuinely skips on a variable references that variable; a vacuous pin does not, and falls
    // through to `unsanctioned-green` exactly as before. This is a substring test on purpose —
    // red-check cannot evaluate the host's skip predicate, only check that the claim is anchored
    // in the file it is made about.
    const envGatedAcs = carriedAcs.filter((id) => {
      const b = bulletById.get(id)
      return !!(b && b.env && content.includes(b.env))
    })
    const ungatedAcs = carriedAcs.filter((id) => !envGatedAcs.includes(id))
    if (rejectedAc) {
      const b = bulletById.get(rejectedAc)
      findings.push({
        class: 'rejected-trailing-tag', path: relPath, acs: carriedAcs,
        detail: rejectedTrailingTagDetail(rejectedAc, b.trailingRejected, b.trailingRejectedCause,
          `${relPath} is a green expected-red file`),
      })
    } else if (envGatedAcs.length === carriedAcs.length && carriedAcs.length > 0) {
      // An `[env: VAR]`-tagged AC declares that verifying it depends on a variable this process
      // does not control. A host whose testCommand withholds that variable makes its suite skip,
      // so runLeg (exit codes only) reads green from ANY shell: the file's redness is not absent,
      // it is UNOBSERVABLE, and a hard finding here asserts something the run cannot know.
      // ac-matrix.js grants this exact tag the same trust at review (`skipped test sanctioned by
      // [env: VAR]`, a warning), so this is parity with an existing sanction rather than a new
      // laundering route — and the warning names each withheld variable, so the sanction stays
      // visible in the run's own output.
      //
      // EXPECTED STAYS 'red', deliberately. Flipping the file to green-expected instead would
      // route a genuinely-red env-gated file — the correct pre-image colour, observed whenever the
      // variable IS provisioned — into the `broken-pin` arm above and report the desired red as a
      // hard finding. Suppressing only this arm cannot regress that case: `expected === 'red'`
      // with a red observation matches, as it already does.
      //
      // Requiring EVERY carried AC to be env-tagged is the conservative half: a file mixing a
      // gated AC with an ungated one still owes a real red for the ungated one, and green there
      // is a genuine finding.
      warnings.push(`${relPath}: red-expected file passed against the pre-image, sanctioned by ` +
        `[env:] on ${envGatedAcs.map((id) => `${id} (${bulletById.get(id).env})`).join(', ')} — ` +
        `the suite skips when the variable is withheld, so redness is unobservable from this run`)
    } else {
      // The finding names the ACs that actually owe a red, not every AC the file carries: a
      // gated sibling is already sanctioned and listing it sends the author looking at the wrong
      // bullet. The gated ones are named in the detail as sanctioned so the split is legible.
      const owing = ungatedAcs.length ? ungatedAcs : carriedAcs
      const sanctionedNote = envGatedAcs.length
        ? ` — sanctioned by [env:] and not owing a red: ${envGatedAcs.map((id) => `${id} (${bulletById.get(id).env})`).join(', ')}`
        : ''
      findings.push({
        class: 'unsanctioned-green', path: relPath, acs: owing,
        detail: `${relPath}: red-expected file passed against the pre-image — carried ${owing.join(', ')}` +
          sanctionedNote,
      })
    }
  }

  files.push({ path: relPath, expected, observed, carriedAcs })
}

// ---- D6/D7/D8 (specs/20260911/04-every-criterion-declares-its-test.md): per-test verification
// for rewrites/reuses dispositions — a targeted run ON TOP OF the whole-file arms above, never a
// replacement for them. `writes` dispositions and undeclared (null) ones are untouched.

// D6: the regex-escaped, anchored title substituted for the host config's `{name}` placeholder —
// `\ ^ $ . | ? * + ( ) [ ] { }` are the only characters escaped, per the Decision's own list.
function escapeTitleForRegex(title) {
  return title.replace(/[\\^$.|?*+()[\]{}]/g, '\\$&')
}

// Wraps `arg` in single quotes for literal, no-expansion substitution into a `bash -c` command
// string — single quotes are the one POSIX quoting form with zero escapes recognised inside
// (no `\`, `$`, backtick, or `"` is special there), so this is the only form that survives a
// title carrying any of those characters unexpanded. An embedded single quote is closed,
// escaped as `\'` OUTSIDE the quoting (a literal backslash-quote passed straight through the
// shell), then reopened, e.g. `it's` → `'it'\''s'`.
function shellQuoteSingle(arg) {
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

// D6/D7: `{testCommand} {testNameFilter←escaped ^title$} <file>`, appended ahead of the file path
// (matching the existing `{typecheckCommand} <file>` append form) — output is captured (never
// `stdio: 'ignore'` like runLeg above) because D8's selection proof needs the run's own stdout to
// confirm the title was actually selected, not merely infer it from the exit code (Assumptions
// A1: a pattern matching nothing still exits 0).
//
// Hardened (confirmed hard finding, review): the filter/path fragments were substituted via
// `JSON.stringify`, which produces DOUBLE-quoted shell words — bash still expands `` ` `` (command
// substitution) and `$` (variable expansion) inside double quotes, so a test title carrying
// either ran as shell syntax instead of a literal string (a backtick-quoted `touch` in a title
// created the file it named; 27 of this repo's 1,050 live titles carry a backtick and 6 carry
// `$`). `testCommand` itself is still `bash -c`-interpreted (it is a host-supplied command
// string, D6's own contract) — only the SUBSTITUTED filter/path fragments are now single-quoted
// via `shellQuoteSingle`, which recognises no shell metacharacter at all.
function runFilteredLeg(cmd, filterTemplate, title, relPath) {
  const pattern = `^${escapeTitleForRegex(title)}$`
  const filterArg = filterTemplate.replace('{name}', pattern)
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  const res = spawnSync('bash',
    ['-c', `${cmd} ${shellQuoteSingle(filterArg)} ${shellQuoteSingle(relPath)}`],
    { cwd: root, env, encoding: 'utf8' })
  return { code: res.status === null ? 1 : res.status, output: (res.stdout || '') + (res.stderr || '') }
}

const dispositions = []
const dispositionCandidates = []
for (const b of wellFormed) {
  const disposition = parseDisposition(b.raw)
  if (disposition && (disposition.kind === 'rewrites' || disposition.kind === 'reuses')) {
    dispositionCandidates.push({ b, disposition })
  }
}

if (dispositionCandidates.length) {
  if (!config.testNameFilter) {
    // D6: absent testNameFilter degrades every rewrites/reuses AC to today's whole-file
    // behaviour, ONE warning naming the key (never one per AC), and spawns no per-test run at all.
    warnings.push(`testNameFilter is not declared in the host config — no per-test verification ` +
      `runs for any rewrites/reuses disposition (${dispositionCandidates.length} declared here); ` +
      `every file keeps its whole-file classification`)
  } else {
    for (const { b, disposition } of dispositionCandidates) {
      const expected = disposition.kind === 'rewrites' ? 'red' : 'green'
      let src = null
      try { src = fs.readFileSync(path.join(root, disposition.file), 'utf8') } catch { src = null }
      const matches = src === null ? [] : scanCalls(src).filter(c => c.title.startsWith(disposition.prefix))
      // D8: not resolvable to exactly one pre-image test — fall back to the file's whole-file
      // colour, WARN naming the file/prefix/cause, never a finding on this path alone.
      if (matches.length !== 1) {
        warnings.push(`${b.id}: ${disposition.kind} reference "${disposition.file} :: ` +
          `${disposition.prefix}" is unresolved (${matches.length} matches) — falling back to ` +
          `${disposition.file}'s whole-file colour (cause: unresolved)`)
        dispositions.push({
          ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix,
          expected, observed: null, fallback: 'unresolved',
        })
        continue
      }
      const title = matches[0].title
      const { code, output } = runFilteredLeg(config.testCommand, config.testNameFilter, title, disposition.file)
      // D8: selection proof — the run's OWN OUTPUT must name the selected title; a pattern
      // matching nothing still exits 0 (Assumptions A1), so the exit code alone proves nothing.
      if (!output.includes(title)) {
        warnings.push(`${b.id}: ${disposition.kind} reference "${disposition.file} :: ${title}" ` +
          `was not selected by the filtered run's own output — falling back to ` +
          `${disposition.file}'s whole-file colour (cause: unselected)`)
        dispositions.push({
          ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix,
          expected, observed: null, fallback: 'unselected',
        })
        continue
      }
      const observed = code === 0 ? 'green' : 'red'
      dispositions.push({ ac: b.id, kind: disposition.kind, file: disposition.file, prefix: disposition.prefix, expected, observed })
      if (disposition.kind === 'rewrites' && observed === 'green') {
        findings.push({
          class: 'gutted-rewrite', path: disposition.file, acs: [b.id],
          detail: `${b.id}: rewrites reference "${disposition.file} :: ${title}" already passes ` +
            `against the pre-image — a gutted rewrite (a failing sibling case never satisfies it)`,
        })
      } else if (disposition.kind === 'reuses' && observed === 'red') {
        findings.push({
          class: 'broken-reuse', path: disposition.file, acs: [b.id],
          detail: `${b.id}: reuses reference "${disposition.file} :: ${title}" fails against the ` +
            `pre-image — a broken reuse`,
        })
      }
    }
  }
}

// ---- output -------------------------------------------------------------------------------------
// The 64 KiB process.exit stdout truncation this synchronous writer avoids is explained in full
// at spec/scripts/lib/driver-io.js's writeOut.
// Local to this script: process.exitCode is set instead of calling process.exit(), so Node drains
// stdout naturally before exiting.

function writeAll(fd, buf) {
  let written = 0
  while (written < buf.length) written += fs.writeSync(fd, buf, written)
}

if (jsonOut) {
  writeAll(1, Buffer.from(JSON.stringify({ files, findings, warnings, dispositions }, null, 2) + '\n'))
} else {
  for (const f of findings) console.log(`HARD  ${f.class.padEnd(20)} ${f.path}  ${f.detail}`)
  for (const w of warnings) console.log(`WARN  ${w}`)
  console.log(`red-check: ${files.length} file(s) classified · ${findings.length} finding(s), ${warnings.length} warning(s)`)
}

process.exitCode = findings.length ? 1 : 0
