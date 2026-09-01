#!/usr/bin/env node
'use strict'
// init-gen.js probe --root <dir> [--test-command "<cmd>"] [--sample <n>]
// init-gen.js generate --root <dir> --profile <path> [--refresh]
//
// specs/20260822/02-init-generation-script.md: the review-legs.js inversion applied to
// /spec:init. init.md used to hand-perform every deterministic file-generation phase as prose
// re-executed by a model each bootstrap — config, rules, agents, skills, settings merge,
// patterns harness, manifest, gitignore/gitattributes mechanics. That drifts per session/model
// exactly the way review-legs.js's prose predecessor did. `generate` is now the SOLE WRITER of
// the grounding-layer deliverables from a session-authored JSON profile; `probe` reports
// read-only findings the interview adjudicates. Two dated incidents behind this shape:
// (1) 2026-08-22 spike: the locked init.md idempotency check `git check-ignore -q
// .claude/worktrees` exits 1 on a fresh host even when the ignore entry exists (dir-only
// pattern, path not yet on disk) — D4 retires it for a child-path probe (`.../worktrees/x`).
// (2) the 2026-08-20 at-risk escape: a shared script's return value changed and reddened a
// suite outside the spec's own File Plan tests rows, undetected until much later — D8/D9 make
// the vacuous-pass and inert-at-risk-leg classes visible at the one moment (init) they're cheap
// to fix.
// (3) 2026-08-24 (specs/20260824/05-design-doctrine-cut.md, D6): generate no longer writes a
// `specs/**/*.design/` gitignore line — the render gate never wrote that sidecar, so init must
// not provision it either. The `.claude/worktrees/` entry is unaffected.
//
// What this deliberately does NOT do: profile the repo, interview the user, author judgment
// content (agent personas, rule bodies, convention text — all travel as profile fields),
// generate the runtime substrate (Phase 1.5), write the design foundation (Phase 6), or
// generate rule enforcement (`/spec:enforce` owns that, invoked separately by init.md).
//
// Exit codes:
//   generate: 0 = generated, manifest-check green, config stamped
//             1 = manifest-check red — nothing stamped
//             2 = usage error / invalid or incomplete profile (missing field, a required- or
//                 optional-when-present array field that isn't an array, or a field that must
//                 be a plain object but isn't, named + remedy) / unparseable Worker Contract
//                 (grounding-contract.md heading drifted, D6/A7) / existing
//                 .claude/settings.json unreadable, a directory, invalid JSON, or not a JSON
//                 object (D5 merge impossible — nothing written)
//             3 = an existing target differs from what the profile would produce and
//                 --refresh was not given — every target left byte-identical, nothing written
//             4 = unexpected internal error (uncaught throw) — the host tree may be
//                 partially written; remedy = re-run generate. Never a verdict; always a bug.
//   probe:    0 = always (adverse findings — no claude CLI, a vacuous test runner, an inert
//                 at-risk leg — are data for the interview, never a probe failure)
//             2 = usage error

const fs = require('fs')
const path = require('path')
const os = require('os')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const { globMatch } = require('./lib/glob-match')
const { configPath, CONFIG_RELPATH } = require('./lib/host-config')

function usage() {
  console.error('usage: init-gen.js probe --root <dir> [--test-command "<cmd>"] [--sample <n>]')
  console.error('       init-gen.js generate --root <dir> --profile <path> [--refresh]')
}

const argv = process.argv.slice(2)
const sub = argv[0]
if (sub !== 'probe' && sub !== 'generate') { usage(); process.exit(2) }

let root = null, profilePath = null, refresh = false, testCommandArg = null, sample = 20
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--root') root = argv[++i]
  else if (a === '--profile') profilePath = argv[++i]
  else if (a === '--refresh') refresh = true
  else if (a === '--test-command') testCommandArg = argv[++i]
  else if (a === '--sample') sample = parseInt(argv[++i], 10)
  else { usage(); process.exit(2) }
}
if (!root) { usage(); process.exit(2) }

const CONTRACT_FILE = path.join(__dirname, '..', 'templates', 'grounding-contract.md')
const CONTRACT_HEADING = '## Worker Contract (byte-identical across all generated agents)'
const ADDENDUM_HEADING = '## Tests-kind addendum (appended after the contract bullets, identical wording)'
const SELF_VERIFY_LITERAL = '`bun lint`, `bun test:run <your files>`, `bunx tsc --noEmit`'
const DEFAULT_TEST_GLOBS = ['tests/**', 'test/**', '**/*.test.*', '**/*.spec.*', '**/*_test.*']

// ============================================================================================
// probe
// ============================================================================================

if (sub === 'probe') {
  const out = {}
  out.frontendDesign = probeFrontendDesign()
  if (testCommandArg) out.testCommand = probeTestCommand(testCommandArg, root)
  const atRisk = probeAtRisk(root, sample)
  if (atRisk) out.atRisk = atRisk
  process.stdout.write(JSON.stringify(out, null, 2) + '\n')
  process.exit(0)
}

// D7/A1: `claude plugin list --json` reports an array of rows carrying id (name@marketplace),
// scope, enabled. `claude` absent from PATH -> typed no-claude-cli (never a probe failure).
// An unparseable/non-array response -> typed unparseable-plugin-list (A1's escalation arm).
function probeFrontendDesign() {
  const r = spawnSync('claude', ['plugin', 'list', '--json'], { encoding: 'utf8' })
  if (r.error) return { unavailable: 'no-claude-cli' }
  let rows
  try { rows = JSON.parse(r.stdout) } catch { return { unavailable: 'unparseable-plugin-list' } }
  if (!Array.isArray(rows)) return { unavailable: 'unparseable-plugin-list' }
  const row = rows.find((x) => x && typeof x.id === 'string' && x.id.split('@')[0] === 'frontend-design')
  if (!row) return { installed: false }
  return { installed: true, enabled: !!row.enabled, scope: row.scope }
}

// D8: executes `<cmd> <generated nonexistent path>` in the host root. exit 0 means the runner
// vacuously "passed" against a path that matches nothing (the 2026-08-20 escape's class);
// exit != 0 means it fails loud, which is the safe/expected shape. A spawn failure (runner not
// found) reports failsLoud:true too — a runner that can't even be invoked cannot be trusted to
// pass silently.
function probeTestCommand(cmd, hostRoot) {
  const nonexistent = path.join(hostRoot, '.spec-init-gen-probe-nonexistent.txt')
  const r = spawnSync('bash', ['-c', cmd + ' ' + JSON.stringify(nonexistent)], { cwd: hostRoot })
  const exit = r.status
  return { failsLoudOnNoMatch: exit !== 0, exit }
}

// D9: samples up to `sample` tracked non-test files and shells to scope-reconcile.js's
// additive --probe-at-risk mode (the sole stem-derivation, reused — never re-implemented here).
// Best-effort: any failure (no git, no tracked files, scope-reconcile error) omits the field
// entirely rather than failing the probe (probe never blocks, D1's contract).
function probeAtRisk(hostRoot, sampleN) {
  try {
    const ls = spawnSync('git', ['-C', hostRoot, 'ls-files'], { encoding: 'utf8' })
    if (ls.status !== 0) return null
    const files = ls.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
    const nonTest = files.filter((f) => !DEFAULT_TEST_GLOBS.some((g) => globMatch(g, f)))
    const sampled = nonTest.slice(0, sampleN)
    if (!sampled.length) return null
    const tmpFile = path.join(os.tmpdir(), 'init-gen-atrisk-' + process.pid + '-' + Date.now() + '.txt')
    fs.writeFileSync(tmpFile, sampled.join('\n') + '\n')
    const scopeReconcilePath = path.join(__dirname, 'scope-reconcile.js')
    const r = spawnSync(process.execPath, [scopeReconcilePath, '--probe-at-risk', tmpFile, '--root', hostRoot], { encoding: 'utf8' })
    try { fs.unlinkSync(tmpFile) } catch { /* best-effort cleanup */ }
    if (r.status !== 0) return null
    return JSON.parse(r.stdout)
  } catch {
    return null
  }
}

// ============================================================================================
// generate
// ============================================================================================

if (!profilePath) { usage(); process.exit(2) }

let profile
try {
  profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'))
} catch (e) {
  console.error(`init-gen: cannot read/parse profile at ${profilePath} (${e.message}) — pass --profile <path to a valid profile JSON> (see specs/20260822/02-init-generation-script.md Contracts)`)
  process.exit(2)
}

validateProfile(profile)

function fieldMissing(field) {
  console.error(`init-gen: profile is missing required field "${field}" — add it to the profile JSON per the Contracts profile schema in specs/20260822/02-init-generation-script.md before running generate again`)
  process.exit(2)
}

function has(obj, dotted) {
  const parts = dotted.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || !(p in cur)) return false
    cur = cur[p]
  }
  return cur !== undefined && cur !== null
}

// D1/D2: the two refusal shapes every optional-array and required-object field share. Kept as
// named helpers so every caller prints the identical message shape (round-3 ruling: a
// non-array/non-object is a shape refusal, never an enumeration).
function mustBeArray(field, v) {
  if (!Array.isArray(v)) {
    console.error(`init-gen: profile field "${field}" must be an array — fix the profile JSON per the Contracts profile schema in specs/20260822/02-init-generation-script.md before running generate again`)
    process.exit(2)
  }
}

function mustBeObject(field, v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) {
    console.error(`init-gen: profile field "${field}" must be an object — fix the profile JSON per the Contracts profile schema in specs/20260822/02-init-generation-script.md before running generate again`)
    process.exit(2)
  }
}

function validateProfile(p) {
  const required = [
    'config.gateCommand', 'config.testCommand', 'config.setupCommand', 'config.patternsScript',
    'config.layerGroups', 'config.agentMap', 'config.pipelineRules', 'config.runtime',
    'rules.paths', 'rules.sections',
    'agents',
    'conventionRules',
    'selfVerifyExamples',
    'skills.specVerify', 'skills.run',
    'settings',
    'patternSweeps',
    'sourceRoot',
    'manifestExtras',
    'probeOutcomes.testCommand', 'probeOutcomes.atRisk',
  ]
  for (const field of required) if (!has(p, field)) fieldMissing(field)
  // D1: extraAllow/extraDeny are optional (the `|| []` default in mergeSettings stands when
  // absent) — but a *present* non-array silently spreads per character (a string) or throws
  // "is not iterable" (a number/object) inside mergeSettings, so a present value gets the same
  // shape check as a required array, before generate ever reaches the merge.
  if (p.settings) {
    for (const f of ['extraAllow', 'extraDeny']) {
      if (p.settings[f] !== undefined && p.settings[f] !== null) mustBeArray(`settings.${f}`, p.settings[f])
    }
  }
  // D2: `'k' in v` throws a bare TypeError for any primitive `v` (42, "x", ...) — a plain-object
  // guard ahead of each `in`-operator loop turns that crash into the same named exit-2 refusal
  // the missing-field case already uses.
  if (p.config) {
    mustBeObject('config.agentMap', p.config.agentMap)
    for (const k of ['tests', 'default']) if (!(k in p.config.agentMap)) fieldMissing(`config.agentMap.${k}`)
  }
  if (p.rules) {
    mustBeObject('rules.sections', p.rules.sections)
    for (const s of ['Risk Tiers', 'Planning', 'Build', 'Worker Rules', 'Test Rules', 'Review Checks']) {
      if (!(s in p.rules.sections)) fieldMissing(`rules.sections["${s}"]`)
    }
  }
  // conventionRules was previously required-but-unchecked-for-shape (dereferenced at ~332/350
  // with no validation, uncaught TypeError at exit 1); now every field the script iterates with
  // for-of gets an explicit array-shape check with a matched remedy.
  for (const field of ['rules.paths', 'conventionRules', 'agents', 'patternSweeps', 'manifestExtras']) {
    const v = field.split('.').reduce((o, k) => o && o[k], p)
    mustBeArray(field, v)
  }
}

// D6/A7: the Worker Contract + Tests-kind addendum are extracted at runtime from the plugin's
// own grounding-contract.md, never a second copy. Unparseable (heading or fence not found) ->
// exit 2 naming the file and the heading it expected.
function fencedBlock(src, heading) {
  const hIdx = src.indexOf(heading)
  if (hIdx === -1) {
    console.error(`init-gen: ${CONTRACT_FILE} has no "${heading}" heading — the contract shape has drifted from what this script expects (D6/A7); restore the heading or update init-gen.js's extraction`)
    process.exit(2)
  }
  const fenceStart = src.indexOf('```markdown', hIdx)
  if (fenceStart === -1) {
    console.error(`init-gen: ${CONTRACT_FILE} has no fenced markdown block under "${heading}" — cannot extract the contract text`)
    process.exit(2)
  }
  const start = src.indexOf('\n', fenceStart) + 1
  const end = src.indexOf('```', start)
  return src.slice(start, end)
}

let contractSrc
try {
  contractSrc = fs.readFileSync(CONTRACT_FILE, 'utf8')
} catch (e) {
  console.error(`init-gen: cannot read the grounding contract at ${CONTRACT_FILE} (${e.message}) — reinstall/update the spec plugin`)
  process.exit(2)
}
const contractBlock = fencedBlock(contractSrc, CONTRACT_HEADING)
const addendumBlock = fencedBlock(contractSrc, ADDENDUM_HEADING)
const contractSubstituted = contractBlock.replace(SELF_VERIFY_LITERAL, profile.selfVerifyExamples)

// ---- rendering ------------------------------------------------------------------------------

function titleCase(name) {
  return name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function renderRulesFile(rules) {
  const order = ['Risk Tiers', 'Planning', 'Build', 'Worker Rules', 'Test Rules', 'Review Checks']
  const fm = ['---', 'paths:', ...rules.paths.map((p) => `  - "${p}"`), '---', ''].join('\n')
  let body = '# Spec pipeline grounding\n\n'
  for (const name of order) body += `## ${name}\n\n${String(rules.sections[name]).trimEnd()}\n\n`
  body += '## Gotchas (evidence-cited)\n\n' +
    '<!-- One line per entry; every entry cites a ledger row (spec path + runId) or a dated\n' +
    'incident, and carries a provenance tag: [host] (this repo/stack) or [plugin] (traces to a\n' +
    'spec-plugin template/command/generated artifact). Writers: /spec:review close and\n' +
    '/spec:escape only. /spec:doctor prunes dead citations and rolls [plugin] entries up as an\n' +
    'upstream bug list. -->\n'
  return fm + '\n' + body
}

function renderConventionRule(cr) {
  const fm = ['---', 'paths:', ...cr.paths.map((p) => `  - "${p}"`), '---', ''].join('\n')
  return fm + '\n' + String(cr.body).trimEnd() + '\n'
}

function renderAgent(agent) {
  const lines = []
  lines.push('---')
  lines.push(`name: ${agent.name}`)
  lines.push(`description: ${JSON.stringify(agent.description)}`)
  lines.push(`model: ${agent.model}`)
  lines.push('permissionMode: acceptEdits')
  lines.push('memory: project')
  lines.push('---')
  lines.push('')
  lines.push(`# ${titleCase(agent.name)} Specialist`)
  lines.push('')
  lines.push(String(agent.persona).trimEnd())
  lines.push('')
  lines.push('## Expertise')
  lines.push('')
  for (const e of agent.expertise || []) lines.push(`- ${e}`)
  lines.push('')
  lines.push('## Reference Material')
  lines.push('')
  for (const r of agent.reference || []) lines.push(`- ${r}`)
  lines.push('')
  lines.push('## Constraints')
  lines.push('')
  for (const c of agent.constraints || []) lines.push(`- ${c}`)
  if (agent.mcp) {
    lines.push('')
    lines.push('## Library Docs (MCP)')
    lines.push('')
    lines.push(String(agent.mcp).trimEnd())
  }
  lines.push('')
  lines.push(contractSubstituted.trimEnd())
  if (agent.kind === 'tests') {
    lines.push('')
    lines.push(addendumBlock.trimEnd())
  }
  lines.push('')
  return lines.join('\n')
}

function renderSkill(name, sp) {
  const lines = ['---', `name: ${name}`, `description: ${JSON.stringify(sp.description)}`, 'allowed-tools:']
  for (const t of sp.allowedTools || []) lines.push(`  - ${t}`)
  lines.push('---', '', String(sp.body).trimEnd(), '')
  return lines.join('\n')
}

function renderPatternsScript(p) {
  const lines = []
  lines.push('#!/usr/bin/env bash')
  lines.push('# Mechanical shortcut-pattern sweep — deterministic input to /spec:review. Generated by /spec:init.')
  lines.push(`# Usage: [DIFF_BASE=<ref>] ${p.config.patternsScript} [dir ...]    (defaults to ${p.sourceRoot})`)
  lines.push('# Pure report: always exits 0. Sanctioned exceptions exist — the reviewer judges; this only counts.')
  lines.push('set -u')
  lines.push('DIRS=("$@")')
  lines.push(`[ \${#DIRS[@]} -eq 0 ] && DIRS=(${p.sourceRoot})`)
  lines.push('echo "## Mechanical pattern sweep"; echo "Scope: ${DIRS[*]}"; echo')
  lines.push('sweep() {')
  lines.push('  local name="$1"; shift')
  lines.push('  local out; out=$(rg -n "$@" "${DIRS[@]}" 2>/dev/null || true)')
  lines.push('  local count=0')
  lines.push('  [ -n "$out" ] && count=$(printf \'%s\\n\' "$out" | wc -l | tr -d \' \')')
  lines.push('  echo "### ${name}: ${count}"')
  lines.push('  if [ -n "$out" ]; then')
  lines.push('    printf \'%s\\n\' "$out" | head -15 | sed \'s/^/    /\'')
  lines.push('    [ "$count" -gt 15 ] && echo "    ... (${count} total)"')
  lines.push('  fi')
  lines.push('  echo')
  lines.push('}')
  for (const s of p.patternSweeps) lines.push(s)
  lines.push('echo "Sweep complete. Counts are leads, not verdicts — sanctioned exceptions exist."')
  lines.push('exit 0')
  lines.push('')
  return lines.join('\n')
}

// ---- target list (D5: every one of these is subject to the refuse-or-refresh scan) ----------

function buildFileTargets(p) {
  const targets = []
  targets.push({ rel: CONFIG_RELPATH, kind: 'json', obj: p.config, stripKeys: ['generatedBy', 'contractHash'] })
  targets.push({ rel: p.config.pipelineRules, kind: 'text', text: renderRulesFile(p.rules) })
  for (const cr of p.conventionRules) {
    targets.push({ rel: '.claude/rules/conventions/' + cr.file, kind: 'text', text: renderConventionRule(cr) })
  }
  for (const agent of p.agents) {
    targets.push({ rel: '.claude/agents/' + agent.name + '.md', kind: 'text', text: renderAgent(agent) })
  }
  targets.push({ rel: '.claude/skills/spec-verify/SKILL.md', kind: 'text', text: renderSkill('spec-verify', p.skills.specVerify) })
  targets.push({ rel: '.claude/skills/run/SKILL.md', kind: 'text', text: renderSkill('run', p.skills.run) })
  targets.push({ rel: p.config.patternsScript, kind: 'text', text: renderPatternsScript(p), executable: true })
  return targets
}

// ---- manifest assembly (AC-14/15/16) ---------------------------------------------------------

function buildManifestObject(hostRoot, p) {
  const checks = []
  checks.push({ claim: 'grounding config generated', kind: 'file', target: CONFIG_RELPATH })
  checks.push({ claim: 'pipeline rules file generated', kind: 'file', target: p.config.pipelineRules })
  for (const cr of p.conventionRules) {
    checks.push({ claim: `convention rule ${cr.file} generated`, kind: 'file', target: '.claude/rules/conventions/' + cr.file })
  }
  for (const agent of p.agents) {
    checks.push({ claim: `agent ${agent.name} generated`, kind: 'file', target: '.claude/agents/' + agent.name + '.md' })
  }
  checks.push({ claim: 'spec-verify skill generated', kind: 'file', target: '.claude/skills/spec-verify/SKILL.md' })
  checks.push({ claim: 'run skill generated', kind: 'file', target: '.claude/skills/run/SKILL.md' })
  checks.push({ claim: 'patterns script executes cleanly', kind: 'exec', target: `bash ${p.config.patternsScript}` })
  checks.push({
    claim: 'settings.json permissions merge applied', kind: 'exec',
    target: `jq -e '(.permissions.allow|type=="array") and (.permissions.deny|type=="array")' .claude/settings.json`,
  })
  checks.push({ claim: 'runtime smoke boots and cleanly stops (or is declared inert)', kind: 'smoke', target: '' })

  const remoteOut = spawnSync('git', ['-C', hostRoot, 'remote'], { encoding: 'utf8' })
  const remotes = (remoteOut.status === 0 ? remoteOut.stdout : '').split('\n').map((s) => s.trim()).filter(Boolean)
  if (remotes.length) {
    checks.push({ claim: 'git remote / CI activation', kind: 'remote', target: remotes.includes('origin') ? 'origin' : remotes[0] })
  } else {
    checks.push({ claim: 'git remote / CI activation', kind: 'inert', target: 'no git remote configured for this host' })
  }

  // D8/A4: the negated exec form keeps the testCommand activation claim permanently
  // re-verifiable (doctor check 6b) instead of a one-shot interview answer.
  const tc = p.probeOutcomes.testCommand
  if (tc.failsLoud) {
    const nonexistent = '.spec-init-gen-nonexistent-probe.marker'
    checks.push({
      claim: 'testCommand fails loud on a no-match path (re-verifiable activation claim)', kind: 'exec',
      target: `bash -c "! ${p.config.testCommand} ${nonexistent}"`,
    })
  } else {
    checks.push({ claim: 'testCommand accepted-risk: vacuous pass on no-match', kind: 'inert', target: tc.acceptedReason })
  }

  // D9: an inapplicable at-risk leg is an explicit inert row, not a silent drop.
  const ar = p.probeOutcomes.atRisk
  if (!ar.applicable) {
    checks.push({ claim: 'at-risk leg applicability', kind: 'inert', target: ar.reason })
  }

  for (const extra of p.manifestExtras) checks.push(extra)

  return { checks }
}

// ---- comparison / write helpers (D5) ---------------------------------------------------------

function sortKeysDeep(v) {
  if (Array.isArray(v)) return v.map(sortKeysDeep)
  if (v && typeof v === 'object') {
    const out = {}
    for (const k of Object.keys(v).sort()) out[k] = sortKeysDeep(v[k])
    return out
  }
  return v
}

function compareExisting(hostRoot, t) {
  const full = path.join(hostRoot, t.rel)
  if (!fs.existsSync(full)) return { existed: false, differs: false }
  if (t.kind === 'json') {
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(full, 'utf8'))
    } catch {
      return { existed: true, differs: true }
    }
    if (t.stripKeys) {
      parsed = { ...parsed }
      for (const k of t.stripKeys) delete parsed[k]
    }
    const differs = JSON.stringify(sortKeysDeep(parsed)) !== JSON.stringify(sortKeysDeep(t.obj))
    return { existed: true, differs }
  }
  const raw = fs.readFileSync(full, 'utf8')
  return { existed: true, differs: raw !== t.text }
}

function writeTarget(hostRoot, t) {
  const full = path.join(hostRoot, t.rel)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, t.kind === 'json' ? JSON.stringify(t.obj, null, 2) + '\n' : t.text)
  if (t.executable) fs.chmodSync(full, 0o755)
}

// D4: idempotency by executed child-path probe — never the bare-directory form that falsified
// init.md's locked prose (A5). Each entry carries a representative descendant path to probe.
const IGNORE_ENTRIES = [
  { line: '.claude/worktrees/', sample: '.claude/worktrees/x' },
  // spec-review-driver.js keeps its re-entry sidecar at specs/<date>/<spec>.review/ for the whole
  // run (deleted only at DONE) — unignored, a host gate that sweeps the whole tree reds on the
  // pipeline's own scratch before a reviewer dispatches (hearwell 2026-08-31, prettier --check).
  { line: 'specs/**/*.review/', sample: 'specs/20260101/01-x.review/review-state.json' },
  // specs/20260901/01-build-driver.md D5: spec-build-driver.js keeps its own re-entry sidecar at
  // specs/<date>/<spec>.build/ for the build run's whole lifetime (deleted only at DONE) — the
  // same hearwell 2026-08-31 mechanism as the .review/ entry above, closed here for build.
  { line: 'specs/**/*.build/', sample: 'specs/20260101/01-x.build/build-state.json' },
]

function ensureGitignore(hostRoot) {
  const p = path.join(hostRoot, '.gitignore')
  let content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  let changed = false
  for (const { line, sample } of IGNORE_ENTRIES) {
    const r = spawnSync('git', ['check-ignore', '-q', sample], { cwd: hostRoot })
    if (r.status === 0) continue
    if (content.length && !content.endsWith('\n')) content += '\n'
    content += line + '\n'
    changed = true
  }
  if (changed) fs.writeFileSync(p, content)
}

// D4/A6: gitattributes detection stays `git check-attr merge` (unlike the ignore check, this
// form was never falsified — no child-path substitute needed here).
function ensureGitattributes(hostRoot) {
  const r = spawnSync('git', ['check-attr', 'merge', '--', '.claude/spec-runs.jsonl'], { cwd: hostRoot, encoding: 'utf8' })
  if (r.status === 0 && /union/.test(r.stdout)) return
  const p = path.join(hostRoot, '.gitattributes')
  let content = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''
  if (content.length && !content.endsWith('\n')) content += '\n'
  content += '.claude/spec-runs.jsonl merge=union\n'
  fs.writeFileSync(p, content)
}

// D5: settings.json is the exception to refuse-or-refresh — always merge-preserving, in both
// modes. An existing deny entry covering a config-derived would-be allow is kept and reported,
// never overridden.
function deriveAllowEntries(config) {
  const cmds = [config.gateCommand, config.testCommand, config.setupCommand, 'bash ' + config.patternsScript]
  if (config.runtime && !config.runtime.inert) {
    for (const k of ['bootCommand', 'readyCheck', 'seedCommand']) if (config.runtime[k]) cmds.push(config.runtime[k])
  }
  const bases = new Set()
  for (const c of cmds) {
    if (!c) continue
    const base = String(c).replace(/\{[^}]*\}/g, '').trim().replace(/\s+/g, ' ')
    if (base) bases.add(base)
  }
  return [...bases].map((b) => `Bash(${b}:*)`)
}

function mergeSettings(hostRoot, existing, p) {
  const settingsPath = path.join(hostRoot, '.claude', 'settings.json')
  const existingAllow = (existing.permissions && Array.isArray(existing.permissions.allow)) ? existing.permissions.allow : []
  const existingDeny = (existing.permissions && Array.isArray(existing.permissions.deny)) ? existing.permissions.deny : []

  const wantAllow = [...new Set([...deriveAllowEntries(p.config), ...(p.settings.extraAllow || [])])]
  const conflicts = []
  const allowSet = new Set(existingAllow)
  for (const a of wantAllow) {
    if (existingDeny.includes(a)) { conflicts.push(a); continue }
    allowSet.add(a)
  }
  const DEFAULT_DENY = ['Bash(rm -rf:*)', 'Read(.env*)']
  const denySet = new Set([...existingDeny, ...DEFAULT_DENY, ...(p.settings.extraDeny || [])])

  const settingsObj = { ...existing, permissions: { allow: [...allowSet], deny: [...denySet] } }
  return { settingsPath, settingsObj, conflicts }
}

// ---- version / contract hash (D3) -------------------------------------------------------------

function readVersion() {
  const pj = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8'))
  return pj.version
}

function computeContractHash() {
  return crypto.createHash('sha256').update(fs.readFileSync(CONTRACT_FILE)).digest('hex').slice(0, 12)
}

// ---- main generate flow -----------------------------------------------------------------------

// D5: settings.json is always merge-preserved, never rebuilt — so an unreadable, unparseable, or
// non-object existing file makes the merge impossible rather than emptyable. Read, parsed, and
// shape-checked once, here, pre-flight, before any target is written (both modes: --refresh's
// overwrite semantics apply only to script-owned targets, and settings.json is explicitly not
// one). D3 (round 3): the merge computation itself moved OFF this pre-flight block and into the
// try boundary below, as its first statement — still ahead of buildFileTargets and every write,
// so no settings-derived throw can follow a write; a value that parses as valid JSON but isn't a
// usable object (`null`, a top-level array) is still caught right here by the shape check below,
// and any other residual throw inside mergeSettings is now caught by that same boundary as
// exit 4, never a bare Node crash.
const existingSettingsPath = path.join(root, '.claude', 'settings.json')
let existingSettings = {}
if (fs.existsSync(existingSettingsPath)) {
  let rawSettings
  try {
    rawSettings = fs.readFileSync(existingSettingsPath, 'utf8')
  } catch (e) {
    // D4: EISDIR (A2: observed on darwin) is its own remedy — a directory can't be chmod'd into
    // a file, so the generic permissions message would send the operator down a dead end. Every
    // other read failure (permissions, ...) keeps the existing chmod remedy verbatim.
    if (e.code === 'EISDIR') {
      console.error(`init-gen: existing ${existingSettingsPath} is a directory, not a file — settings.json is always merge-preserved per D5, so generate refuses rather than guess; nothing written. Remove or replace the directory with a JSON file (e.g. \`rm -r ${existingSettingsPath}\`) and re-run generate.`)
      process.exit(2)
    }
    console.error(`init-gen: cannot read existing ${existingSettingsPath} (${e.message}) — settings.json is always merge-preserved per D5, so generate refuses rather than risk dropping entries it cannot see; nothing written. Fix the file's permissions (e.g. \`chmod u+r ${existingSettingsPath}\`) and re-run generate.`)
    process.exit(2)
  }
  try {
    existingSettings = JSON.parse(rawSettings)
  } catch (e) {
    console.error(`init-gen: existing ${existingSettingsPath} is not valid JSON (${e.message}) — settings.json is always merge-preserved per D5 (every existing allow/deny entry kept), never rebuilt from scratch, so generate refuses rather than risk silently dropping them; nothing written. Inspect it with \`jq . ${existingSettingsPath}\`, fix the JSON, and re-run generate.`)
    process.exit(2)
  }
  if (existingSettings === null || typeof existingSettings !== 'object' || Array.isArray(existingSettings)) {
    const found = Array.isArray(existingSettings) ? 'an array' : existingSettings === null ? 'null' : 'a ' + typeof existingSettings
    console.error(`init-gen: existing ${existingSettingsPath} is valid JSON but its top level is ${found}, not an object — D5's merge needs an object to preserve entries into, so generate refuses; nothing written. Make the file a JSON object (\`{}\` if it holds nothing) and re-run generate.`)
    process.exit(2)
  }
}

// D6.4 round 2: everything below can hit an unforeseen host filesystem state (a confirmed repro:
// .gitignore is a directory, so ensureGitignore's read throws EISDIR after all targets are
// written). A pre-flight check can't be written for every such case, so the remainder is boundary-
// wrapped — any uncaught throw here becomes an unmistakable exit 4, never a collision with the
// documented 0/1/2/3 verdicts. process.exit() calls inside do not throw, so they pass through.
try {
  // D3 (round 3): the merge is computed here, INSIDE the boundary, as its first statement — still
  // ahead of buildFileTargets and every write (round 2's no-settings-throw-after-a-write ordering
  // holds), and now also covered by this same exit-4 boundary for the unenumerable residue A1
  // describes (JSON-representable inputs no longer reach a throw here after D1/D2's shape checks).
  const merged = mergeSettings(root, existingSettings, profile)
  const fileTargets = buildFileTargets(profile)
  const manifestObj = buildManifestObject(root, profile)
  const targets = [...fileTargets, { rel: '.claude/spec-manifest.json', kind: 'json', obj: manifestObj }]

  const states = new Map()
  const offenders = []
  for (const t of targets) {
    const st = compareExisting(root, t)
    states.set(t, st)
    if (st.existed && st.differs && !refresh) offenders.push(t.rel)
  }
  if (offenders.length) {
    console.error(`init-gen: refusing to overwrite ${offenders.length} existing target(s) without --refresh — fold any hand-edits into the profile and re-run with --refresh: ${offenders.join(', ')}`)
    process.exit(3)
  }

  for (const t of targets) {
    writeTarget(root, t)
    if (refresh) {
      const st = states.get(t)
      console.log(`${st.existed && !st.differs ? 'unchanged' : 'changed'}: ${t.rel}`)
    }
  }

  ensureGitignore(root)
  ensureGitattributes(root)

  const { settingsPath, settingsObj, conflicts } = merged
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
  fs.writeFileSync(settingsPath, JSON.stringify(settingsObj, null, 2) + '\n')
  for (const c of conflicts) {
    console.log(`init-gen: existing deny '${c}' shadows a config-derived allow — kept, not overridden`)
  }

  const manifestCheckPath = path.join(__dirname, 'manifest-check.sh')
  const check = spawnSync('bash', [manifestCheckPath], { cwd: root, encoding: 'utf8' })
  if (check.stdout) process.stdout.write(check.stdout)
  if (check.stderr) process.stderr.write(check.stderr)
  if (check.status !== 0) {
    console.error('init-gen: manifest-check failed — the config is left unstamped; fix the failing row(s) above and re-run generate')
    process.exit(1)
  }

  // D3: stamp only after a green manifest-check.
  const cfgPath = configPath(root)
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
  cfg.generatedBy = 'spec@' + readVersion()
  cfg.contractHash = computeContractHash()
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n')

  process.exit(0)
} catch (e) {
  console.error(e && e.stack ? e.stack : String(e))
  console.error(`init-gen: unexpected internal error (${e && e.message ? e.message : e}) — generate may have stopped mid-write; inspect with \`git -C ${root} status\`, fix the named cause, and re-run generate (add --refresh if targets now differ). If the cause is not a host-file problem, report this stack against init-gen.js.`)
  process.exit(4)
}
