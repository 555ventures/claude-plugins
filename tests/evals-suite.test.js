'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')
const { ROOT, SPEC, tmpdir, runBash } = require('./helpers')

// specs/20261024/03-plugin-evals-with-deterministic-graders.md D1–D6, D8: the plugin's
// `claude plugin eval` suite under spec/evals/ is never run by the gate (each run is a paid
// session), so this file pins its SHAPE instead — the keys the CLI rejects only at run time,
// the deterministic-grader-only rule, the cheap/heavy split, and that every fixture.sh builds a
// grounded host. It deliberately never invokes `claude plugin eval` itself.

const EVALS = path.join(SPEC, 'evals')
const CHEAP = { status: ['status', 'spec-status'], queue: ['queue', 'spec-queue'], doctor: ['doctor', 'contract-hash'] }
const PROMPT_KEYS = new Set(['name', 'description', 'tags', 'runs', 'max_turns', 'timeout_seconds', 'allowed_tools', 'expected_outcome'])
const DETERMINISTIC = new Set(['regex', 'tool_used', 'tool_order', 'file_exists'])

// The YAML subset the suite's frontmatter uses: `key: scalar`, flow lists `[a, b]`, flow maps
// `{ k: v }`, single/double-quoted scalars, and one level of indented block maps (`context:`).
// `wholeFile` reads a case.yaml, which is that same subset with no `---` fences.
function scalar(v) {
  v = v.trim()
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'")
  if (/^".*"$/.test(v)) return JSON.parse(v)
  if (/^-?\d+$/.test(v)) return Number(v)
  return v
}
function splitFlow(body) {
  const out = []
  let cur = '', q = null
  for (const ch of body) {
    if (q) { cur += ch; if (ch === q) q = null; continue }
    if (ch === "'" || ch === '"') { q = ch; cur += ch; continue }
    if (ch === ',') { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}
function value(v) {
  v = v.trim()
  if (v.startsWith('[') && v.endsWith(']')) return splitFlow(v.slice(1, -1)).map(scalar)
  if (v.startsWith('{') && v.endsWith('}')) {
    const o = {}
    for (const part of splitFlow(v.slice(1, -1))) {
      const at = part.indexOf(':')
      o[part.slice(0, at).trim()] = scalar(part.slice(at + 1))
    }
    return o
  }
  return scalar(v)
}
function frontmatter(file, wholeFile) {
  const text = fs.readFileSync(file, 'utf8')
  const m = wholeFile ? [text, text] : text.match(/^---\n([\s\S]*?)\n---/)
  assert.ok(m, `${path.relative(ROOT, file)} has no frontmatter block — the eval CLI would run it with every default and no graders' type`)
  const fm = {}
  let parent = null
  for (const line of m[1].split('\n')) {
    if (!line.trim() || /^\s*#/.test(line)) continue
    const nested = line.match(/^\s+([\w-]+):\s*(.*)$/)
    if (nested && parent) { fm[parent][nested[1]] = value(nested[2]); continue }
    const top = line.match(/^([\w-]+):\s*(.*)$/)
    assert.ok(top, `${path.relative(ROOT, file)} frontmatter line ${JSON.stringify(line)} is outside the parsed subset — its key would go unchecked`)
    if (top[2].trim() === '') { fm[top[1]] = {}; parent = top[1] } else { fm[top[1]] = value(top[2]); parent = null }
  }
  return fm
}
function cases() {
  if (!fs.existsSync(EVALS)) return []
  return fs.readdirSync(EVALS).filter(n => fs.statSync(path.join(EVALS, n)).isDirectory() && fs.existsSync(path.join(EVALS, n, 'prompt.md')))
}
function graders(name) {
  const dir = path.join(EVALS, name, 'graders')
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => ({ file: f, fm: frontmatter(path.join(dir, f)) }))
}

test('AC-20261024-03-1: every grader under spec/evals/ is deterministic (regex, tool_used, tool_order, file_exists) and none is llm or baseline, and every case has at least one grader', () => {
  const names = cases()
  assert.ok(names.length >= 4, `spec/evals/ holds ${names.length} cases — the suite D2/D3 promise (status, queue, doctor, run) is missing, so nothing proves a session follows the plugin`)
  for (const name of names) {
    const gs = graders(name)
    assert.ok(gs.length >= 1, `case ${name} has no graders/*.md — it would score nothing and pass silently`)
    for (const g of gs) {
      assert.ok(DETERMINISTIC.has(g.fm.type), `${name}/graders/${g.file} has type ${JSON.stringify(g.fm.type)} — a judge-model grader adds cost and drifts with the judge, which D1 forbids`)
    }
  }
})

test('AC-20261024-03-7: every case prompt.md uses only keys the eval CLI accepts and is tagged exactly one of cheap or heavy', () => {
  const names = cases()
  assert.ok(names.length >= 4, `spec/evals/ holds ${names.length} cases — there is nothing for the CLI key check to protect`)
  for (const name of names) {
    const fm = frontmatter(path.join(EVALS, name, 'prompt.md'))
    for (const k of Object.keys(fm)) {
      assert.ok(PROMPT_KEYS.has(k), `${name}/prompt.md carries key ${k} — the CLI rejects unknown keys only at run time, after a paid session starts`)
    }
    const tags = Array.isArray(fm.tags) ? fm.tags : []
    const tiers = tags.filter(t => t === 'cheap' || t === 'heavy')
    assert.strictEqual(tiers.length, 1, `${name}/prompt.md tags ${JSON.stringify(tags)} — a case in both or neither tier runs under the wrong --tag invocation and its cost is mispriced`)
  }
})

test('AC-20261024-03-7: claude plugin validate ./spec exits 0 at the repo root', () => {
  assert.ok(fs.existsSync(path.join(EVALS, 'README.md')), 'spec/evals/README.md is missing — the suite the manifest validation is meant to cover has not landed')
  const r = spawnSync('claude', ['plugin', 'validate', './spec'], { cwd: ROOT, encoding: 'utf8', timeout: 60000 })
  assert.ok(!r.error, `claude did not run (${r.error && r.error.message}) — install Claude Code so \`claude\` resolves on PATH; without it the plugin manifest is never validated`)
  assert.strictEqual(r.status, 0, `claude plugin validate ./spec exited ${r.status} — the plugin would fail to load in an eval run and every case would score the baseline:\n${r.stdout}\n${r.stderr}`)
})

test('AC-20261024-03-2: the status, queue and doctor cases are tagged cheap with runs 3, max_turns at most 15, and an executable fixture.sh as their scaffold script', () => {
  for (const name of Object.keys(CHEAP)) {
    const p = path.join(EVALS, name, 'prompt.md')
    assert.ok(fs.existsSync(p), `spec/evals/${name}/prompt.md is missing — the cheap suite cannot prove /spec:${name} is picked up on natural phrasing`)
    const fm = frontmatter(p)
    assert.ok(Array.isArray(fm.tags) && fm.tags.includes('cheap'), `${name} is not tagged cheap — \`--tag cheap\` would skip it`)
    assert.strictEqual(fm.runs, 3, `${name} runs ${fm.runs} — D2 prices the cheap suite at 3 runs per arm`)
    assert.ok(Number(fm.max_turns) <= 15, `${name} max_turns ${fm.max_turns} — a cheap case allowed to wander costs more than D2 priced`)
    const cy = path.join(EVALS, name, 'case.yaml')
    assert.ok(fs.existsSync(cy), `spec/evals/${name}/case.yaml is missing — prompt.md cannot carry context, so the scaffold never runs and the workspace has no host grounding`)
    const caseFm = frontmatter(cy, true)
    assert.strictEqual(caseFm.context && caseFm.context.scaffold_script, 'fixture.sh', `${name}/case.yaml has no context.scaffold_script: fixture.sh — the run starts in an empty workspace with no host grounding`)
    const fx = path.join(EVALS, name, 'fixture.sh')
    assert.ok(fs.existsSync(fx) && (fs.statSync(fx).mode & 0o111), `${name}/fixture.sh is missing or not executable — the scaffold step fails and the run scores 0`)
  }
})

test('AC-20261024-03-3: each cheap case has a with-only Skill grader naming its command and a Bash grader naming its script stem', () => {
  for (const [name, [cmd, stem]] of Object.entries(CHEAP)) {
    const gs = graders(name).map(g => g.fm)
    const skill = gs.find(g => g.type === 'tool_used' && g.tool === 'Skill')
    assert.ok(skill, `${name} has no tool_used Skill grader — nothing records whether the plugin's command fired`)
    assert.strictEqual(skill.arm, 'with-only', `${name}'s Skill grader is not arm: with-only — the baseline arm can never call the plugin, so it would drag the score instead of acting as an indicator`)
    assert.ok(new RegExp(skill.input_match).test(`{"skill":"spec:${cmd}"}`), `${name}'s Skill input_match ${skill.input_match} does not match spec:${cmd} — it would fail even when the right command ran`)
    const bash = gs.find(g => g.type === 'tool_used' && g.tool === 'Bash')
    assert.ok(bash, `${name} has no tool_used Bash grader — the case would pass on skill choice alone without the script ever running`)
    assert.ok(String(bash.input_match).includes(stem), `${name}'s Bash input_match ${bash.input_match} does not name ${stem} — it cannot tell the plugin's script ran`)
  }
})

test('AC-20261024-03-4: the run case is tagged heavy and not cheap, runs once, and grades build-driver before review-driver plus a --mark closed call', () => {
  const p = path.join(EVALS, 'run', 'prompt.md')
  assert.ok(fs.existsSync(p), 'spec/evals/run/prompt.md is missing — nothing proves a session walks the drivers\' printed steps')
  const fm = frontmatter(p)
  assert.ok(fm.tags.includes('heavy') && !fm.tags.includes('cheap'), `run tags ${JSON.stringify(fm.tags)} — a full pipeline run inside --tag cheap would bill a heavy run on every cheap invocation`)
  assert.strictEqual(fm.runs, 1, `run runs ${fm.runs} — each run is a full /spec:run session; D3 prices exactly one`)
  const gs = graders('run').map(g => g.fm)
  const order = gs.find(g => g.type === 'tool_order')
  assert.ok(order, 'run has no tool_order grader — build-before-review ordering goes unchecked')
  assert.ok(order.before && /spec-build-driver/.test(order.before.input_match), `run tool_order before ${JSON.stringify(order.before)} does not name spec-build-driver`)
  assert.ok(order.after && /spec-review-driver/.test(order.after.input_match), `run tool_order after ${JSON.stringify(order.after)} does not name spec-review-driver`)
  const closed = gs.find(g => g.type === 'tool_used' && String(g.input_match).includes('--mark closed'))
  assert.ok(closed, 'run has no tool_used grader on --mark closed — a session that stops before closing the review would still pass')
})

test('AC-20261024-03-5: every fixture.sh run in an empty directory exits 0 and leaves a parseable grounded host config with its rules file', () => {
  const names = cases()
  assert.ok(names.length >= 4, `spec/evals/ holds ${names.length} cases — no fixture exists to prove host grounding`)
  for (const name of names) {
    const dir = tmpdir('evals-fixture')
    const r = runBash(path.join('evals', name, 'fixture.sh'), [], { cwd: dir, timeout: 60000 })
    assert.strictEqual(r.status, 0, `${name}/fixture.sh exited ${r.status} — the eval scaffold step fails and every run scores 0:\n${r.stderr}`)
    const cfgPath = path.join(dir, '.claude', 'spec.config.json')
    assert.ok(fs.existsSync(cfgPath), `${name}/fixture.sh wrote no .claude/spec.config.json — every command stops with "run /spec:init first"`)
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'))
    for (const k of ['gateCommand', 'testCommand', 'runtime', 'pipelineRules']) {
      assert.ok(k in cfg, `${name}'s fixture config lacks ${k} — the drivers refuse an incomplete host config`)
    }
    assert.ok(fs.existsSync(path.join(dir, cfg.pipelineRules)), `${name}'s fixture names rules file ${cfg.pipelineRules} but never writes it — the drivers stop on the missing grounding`)
  }
})

test('AC-20261024-03-6: spec/evals/README.md carries the cheap and heavy invocations and a measured dollar cost per run', () => {
  const p = path.join(EVALS, 'README.md')
  assert.ok(fs.existsSync(p), 'spec/evals/README.md is missing — nobody knows how to run the suite or what it costs')
  const s = fs.readFileSync(p, 'utf8')
  assert.match(s, /claude plugin eval[^\n]*--tag cheap/, 'the README has no cheap invocation line — the one-command run D5 promises is undocumented')
  assert.match(s, /claude plugin eval[^\n]*--tag heavy/, 'the README has no heavy invocation line — the on-demand /spec:run case cannot be found')
  assert.match(s, /cost per run[^\n]*\$\d/i, 'the README states no dollar cost per run — a paid run would be started blind')
})
