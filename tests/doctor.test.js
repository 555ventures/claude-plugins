'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')
const { execFileSync } = require('child_process')
const { tmpdir, gitRepo, runNode, SPEC } = require('./helpers')

const doctor = require(path.join(SPEC, 'scripts/doctor.js'))
const setup = (cfg, scripts) => {
  const d = tmpdir('doctor')
  gitRepo(d)
  fs.mkdirSync(path.join(d, '.claude'), { recursive: true })
  if (cfg) fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify(cfg))
  if (scripts) fs.writeFileSync(path.join(d, 'package.json'), JSON.stringify({ scripts }))
  return d
}
const inited = (cfg) => { const d = setup(cfg); runNode('scripts/init.js', ['--root', d]); return d }

test('clean host exits 0', () => {
  const d = inited({ testCommand: 'true' })
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 0, r.stdout)
  assert.deepStrictEqual(JSON.parse(r.stdout).findings, [])
})

test('findings: missing gitignore, 127, stale sidecar, worktree, pending question', () => {
  const d = setup({ testCommand: 'nonexistent-cmd-xyz' })
  fs.mkdirSync(path.join(d, 'specs/20260101/01-a.run'), { recursive: true })
  fs.mkdirSync(path.join(d, '.claude/worktrees/spec-x'), { recursive: true })
  fs.writeFileSync(path.join(d, '.claude/pending-question.json'), '{}')
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 1)
  const f = JSON.parse(r.stdout).findings.join('\n')
  for (const w of ['127', 'missing specs/**/*.run/', 'stale sidecar', 'leftover worktree', 'pending question']) assert.ok(f.includes(w), w)
})

test('missing or unparsable config is a finding', () => {
  assert.strictEqual(runNode('scripts/doctor.js', ['--root', setup(null)]).status, 1)
  const d = setup(null)
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), '{nope')
  assert.strictEqual(runNode('scripts/doctor.js', ['--root', d]).status, 1)
})

test('probe timeout is a finding, not healthy; probe is announced', () => {
  const d = inited({ testCommand: 'sleep 5' })
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'], { env: { SPEC_DOCTOR_PROBE_MS: '300' } })
  assert.strictEqual(r.status, 1)
  assert.ok(JSON.parse(r.stdout).findings.some((x) => /timed out/.test(x)))
  assert.match(r.stderr, /running testCommand: sleep 5/)
  assert.match(r.stderr, /finished in/)
})

test('probe cap: default 10 min, config doctorProbeMs overrides, env wins; the timeout remedy names doctorProbeMs', () => {
  const { probeCap } = doctor
  const env = process.env.SPEC_DOCTOR_PROBE_MS
  delete process.env.SPEC_DOCTOR_PROBE_MS
  try {
    assert.strictEqual(probeCap({ testCommand: 'true' }), 600000)
    assert.strictEqual(probeCap({ testCommand: 'true', doctorProbeMs: 900000 }), 900000)
    assert.strictEqual(probeCap({ testCommand: 'true', doctorProbeMs: 'soon' }), 600000, 'a non-number is ignored')
    process.env.SPEC_DOCTOR_PROBE_MS = '42'
    assert.strictEqual(probeCap({ testCommand: 'true', doctorProbeMs: 900000 }), 42)
  } finally { if (env === undefined) delete process.env.SPEC_DOCTOR_PROBE_MS; else process.env.SPEC_DOCTOR_PROBE_MS = env }
  const d = inited({ testCommand: 'sleep 5', doctorProbeMs: 300 })
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'], { env: { SPEC_DOCTOR_PROBE_MS: undefined } })
  assert.strictEqual(r.status, 1)
  const f = JSON.parse(r.stdout).findings.find((x) => /timed out after 0\.3s/.test(x))
  assert.ok(f, 'the config cap applied: ' + r.stdout)
  assert.match(f, /doctorProbeMs/)
})

test('tracked settings.local.json and uncommitted migration are findings', () => {
  const d = inited({ testCommand: 'true' })
  fs.writeFileSync(path.join(d, '.claude/settings.local.json'), '{}')
  fs.mkdirSync(path.join(d, 'docs/archive/v7'), { recursive: true })
  fs.writeFileSync(path.join(d, 'docs/archive/v7/a.md'), 'a')
  execFileSync('git', ['-C', d, 'add', '-f', '.claude/settings.local.json'])
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings.join('\n')
  assert.match(f, /token file is tracked — run: git rm --cached/)
  assert.match(f, /uncommitted migration/)
})

test('a run in flight is not stale: live sidecars and dirty or marked worktrees are reported as in flight; stale ones carry a remedy', () => {
  const d = setup({ testCommand: 'true' })
  fs.mkdirSync(path.join(d, 'specs/20260101/01-live.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/20260101/01-live.run/state.json'), JSON.stringify({ step: 'BUILD' }))
  fs.mkdirSync(path.join(d, 'specs/20260101/02-old.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/20260101/02-old.run/state.json'), JSON.stringify({ step: 'DONE', ended: true }))
  fs.mkdirSync(path.join(d, 'specs/fix/the-thing-abcdef.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/fix/the-thing-abcdef.run/state.json'), JSON.stringify({ step: 'BUILD', fix: { symptom: 'the thing is upside down' } }))
  const long = 'a fix lane review advisories are dropped and the report that names the run cannot resume it'
  fs.mkdirSync(path.join(d, 'specs/fix/long-one.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/fix/long-one.run/state.json'), JSON.stringify({ step: 'BUILD', fix: { symptom: long } }))
  fs.mkdirSync(path.join(d, 'specs/fix/multi-line.run'), { recursive: true })
  fs.writeFileSync(path.join(d, 'specs/fix/multi-line.run/state.json'), JSON.stringify({ step: 'BUILD', fix: { symptom: 'first line\nsecond line' } }))
  execFileSync('git', ['-C', d, 'worktree', 'add', '-q', '-b', 'spec/03-busy', '.claude/worktrees/spec-03-busy'])
  fs.writeFileSync(path.join(d, '.claude/worktrees/spec-03-busy/wip.txt'), 'x')
  execFileSync('git', ['-C', d, 'worktree', 'add', '-q', '-b', 'spec/04-idle', '.claude/worktrees/spec-04-idle'])
  const r = runNode('scripts/doctor.js', ['--root', d, '--json']); const j = JSON.parse(r.stdout); const f = j.findings; const info = j.info
  assert.ok(info.some((x) => /in flight: specs\/20260101\/01-live\.md at BUILD — \/spec:run/.test(x)), info.join('\n'))
  assert.ok(info.some((x) => x === 'in flight: fix "the thing is upside down" at BUILD — /spec:fix the thing is upside down'), 'a spec-less fix is named by its symptom and resumed by all of it: ' + info.join('\n'))
  assert.ok(info.some((x) => x.endsWith(` — /spec:fix ${long}`)), 'a long symptom is resumed by all of it, the key of its run: ' + info.join('\n'))
  assert.ok(info.every((x) => !x.includes('\n')) && info.some((x) => x.startsWith('in flight: fix "first line second line"')), 'a symptom with a newline stays on one line: ' + JSON.stringify(info))
  assert.ok(f.some((x) => /stale sidecar: specs\/20260101\/02-old\.run — rm -r/.test(x)))
  assert.ok(info.some((x) => /in flight: \.claude\/worktrees\/spec-03-busy/.test(x)), 'uncommitted work is never a leftover')
  assert.ok(f.some((x) => /leftover worktree: \.claude\/worktrees\/spec-04-idle — git worktree remove/.test(x)))
  fs.rmSync(path.join(d, 'specs/20260101/02-old.run'), { recursive: true }); fs.rmSync(path.join(d, 'specs/fix'), { recursive: true }); execFileSync('git', ['-C', d, 'worktree', 'remove', '.claude/worktrees/spec-04-idle'])
  fs.writeFileSync(path.join(d, '.gitignore'), 'specs/**/*.run/\n.claude/worktrees/\n.claude/pending-question.json\n.claude/settings.local.json\n')
  const st = require(path.join(require('./helpers').SPEC, 'scripts/lib/state.js'))
  st.writeFanout(d, { step: 'WAIT', batch: [{ worktree: '.claude/worktrees/spec-03-busy' }] })
  const r2 = runNode('scripts/doctor.js', ['--root', d, '--json']); const j2 = JSON.parse(r2.stdout)
  assert.strictEqual(r2.status, 0, 'runs in flight alone are not findings: ' + JSON.stringify(j2))
  assert.ok(j2.info.some((x) => /fan-out at WAIT — \/spec:fanout/.test(x)) && j2.info.some((x) => /spec-03-busy.*\/spec:fanout/.test(x)))
})

test('a sidecar at DONE or STOPPED is stale, whatever its spec says', () => {
  const d = inited({ testCommand: 'true' })
  for (const [stem, step] of [['01-done', 'DONE'], ['02-stopped', 'STOPPED']]) {
    fs.mkdirSync(path.join(d, `specs/20260101/${stem}.run`), { recursive: true })
    fs.writeFileSync(path.join(d, `specs/20260101/${stem}.run/state.json`), JSON.stringify({ step }))
    fs.writeFileSync(path.join(d, `specs/20260101/${stem}.md`), '---\nstatus: hardened\n---\n\n# x\n')
  }
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings.join('\n')
  for (const stem of ['01-done', '02-stopped']) assert.match(f, new RegExp(`stale sidecar: specs/20260101/${stem}\\.run — rm -r`))
})

test('gitignore is judged by git: a broader pattern that covers the sidecars is not missing', () => {
  const d = setup({ testCommand: 'true' })
  fs.writeFileSync(path.join(d, '.gitignore'), '*.run/\n.claude/\n')
  const f = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout).findings
  assert.ok(!f.some((x) => /gitignore: missing/.test(x)), f.join('\n'))
})

test('AC-20261108-01-6 a runtime with bootCommand and fixed-url readyCheck but no url is a finding naming those urls; a url clears it', () => {
  const rt = { bootCommand: 'pnpm dev', readyCheck: ['http://127.0.0.1:3100', 'http://127.0.0.1:4321'] }
  const d = setup({ testCommand: 'true', runtime: rt })
  assert.ok(doctor.check(d, { probe: false }).findings.some((x) => x.startsWith('config: runtime.url is unset') && x.includes('http://127.0.0.1:4321')))
  fs.writeFileSync(path.join(d, '.claude/spec.config.json'), JSON.stringify({ testCommand: 'true', runtime: { ...rt, url: 'http://127.0.0.1:4321' } }))
  assert.ok(!doctor.check(d, { probe: false }).findings.some((x) => x.includes('runtime.url')))
})

test('check(root, { probe: false }) returns the same findings without running the test command', () => {
  const marker = 'probed.marker'
  const d = setup({ testCommand: `touch ${marker}; exit 3` })
  const quiet = doctor.check(d, { probe: false })
  assert.ok(!fs.existsSync(path.join(d, marker)), 'the test command did not run')
  assert.ok(!quiet.findings.some((x) => /^testCommand:/.test(x)))
  const full = doctor.check(d)
  assert.ok(fs.existsSync(path.join(d, marker)), 'the default check still probes')
  assert.deepStrictEqual(full.findings.filter((x) => !/^testCommand:/.test(x)), quiet.findings)
  assert.ok(full.findings.some((x) => /^testCommand: exited 3/.test(x)))
})

// ---- spec 20261105/08: doctor knows the box -----------------------------------------------------

const os = require('os')

// A `df` that reports `availKb` free on a device called /dev/fake, first on PATH.
function fakeDf(availKb) {
  const bin = tmpdir('fakebin')
  const body = availKb === null ? 'exit 1' : `printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/fake 999999999 1 ${availKb} 1%% /fake\\n'`
  fs.writeFileSync(path.join(bin, 'df'), `#!/bin/sh\n${body}\n`, { mode: 0o755 })
  return { PATH: bin + path.delimiter + process.env.PATH }
}

const doctorJson = (d, env) => {
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'], { env })
  return { ...JSON.parse(r.stdout), status: r.status }
}
const FIVE_GB = 5 * 1024 * 1024
const cores = os.cpus().length

test('AC-20261105-08-10 doctor prints a box: info line with cores, the measured gate time and the free space of TMPDIR and the worktrees filesystem', () => {
  const d = inited({ testCommand: 'true' })
  const j = doctorJson(d, { ...fakeDf(FIVE_GB), TMPDIR: '/var/tmp' })
  const box = j.info.find((x) => x.startsWith('box:'))
  assert.ok(box, 'a box: line: ' + j.info)
  assert.ok(box.startsWith(`box: ${cores} cores · gate `), box)
  assert.match(box, /gate \d+s \(measured\) · TMPDIR \/var\/tmp 5\.0 GB free · worktrees on \/dev\/fake 5\.0 GB free$/, box)
  const none = doctorJson(d, { ...fakeDf(null) })
  assert.match(none.info.find((x) => x.startsWith('box:')), /TMPDIR \S+ \? free · worktrees on \? \? free$/, 'df unavailable prints ?')
})

test('AC-20261105-08-11 lanes above cores/2 prints the advice line and still exits 0; lanes at or under it prints none', () => {
  const over = inited({ testCommand: 'true', lanes: 1000 })
  const j = doctorJson(over, fakeDf(FIVE_GB))
  assert.strictEqual(j.status, 0, 'advice is not a finding')
  assert.deepStrictEqual(j.findings, [])
  const w = j.info.find((x) => x.startsWith('⚠️ lanes 1000 > cores/2'))
  assert.ok(w, j.info.join('\n'))
  assert.ok(w.includes(`(${cores}) — set "lanes": ${Math.max(1, Math.floor(cores / 2))} in .claude/spec.config.json`), w)
  assert.ok(!w.includes('"gateConcurrency": 1'), 'lanes count builders and the gate lock already caps gates: too many lanes is fixed by lanes, never by gateConcurrency')
  const under = inited({ testCommand: 'true', lanes: Math.max(1, Math.floor(cores / 2)) })
  assert.ok(!doctorJson(under, fakeDf(FIVE_GB)).info.some((x) => x.includes('cores/2')), 'lanes within cores/2: no advice')
})

test('AC-20261105-08-12 a gate over two minutes and a TMPDIR under 2 GB each print their ⚠️ info line with the remedy', () => {
  const d = inited({ testCommand: 'true' })
  const cache = path.join(d, '.git', 'spec-run-cache')
  fs.mkdirSync(cache, { recursive: true })
  fs.writeFileSync(path.join(cache, 'old.json'), JSON.stringify({ cmd: 'true', tree: 'a', ms: 5000, ts: '2026-01-01T00:00:00.000Z' }))
  fs.writeFileSync(path.join(cache, 'new.json'), JSON.stringify({ cmd: 'true', tree: 'b', ms: 130000, ts: '2026-02-01T00:00:00.000Z' }))
  const saved = process.env.PATH
  process.env.PATH = fakeDf(1500000).PATH // 1.4 GB free
  try {
    const { info, findings } = doctor.check(d, { probe: false })
    assert.deepStrictEqual(findings, [])
    assert.match(info.find((x) => x.startsWith('box:')), /gate 130s \(cached\)/, 'no probe: the newest cached run supplies the time')
    assert.ok(!info.some((x) => x.includes('gate took')), 'a slow gate alone is no evidence two gates compete: doctor reports the time, never gateConcurrency advice')
    const tmp = info.find((x) => x.startsWith('⚠️ TMPDIR has'))
    assert.match(tmp, /^⚠️ TMPDIR has 1\.4 GB free \(under 2 GB\) — export TMPDIR=<path on the worktrees' filesystem> before \/spec:fanout$/)
  } finally { process.env.PATH = saved }
  const roomy = doctorJson(d, fakeDf(FIVE_GB))
  assert.ok(!roomy.info.some((x) => x.includes('TMPDIR has')), 'enough room: no TMPDIR advice')
})

test('an untracked .env or .env.local that .worktreeinclude does not name is a finding naming the line to add; a tracked or named one is not', () => {
  const d = inited({ testCommand: 'true' })
  fs.writeFileSync(path.join(d, '.env'), 'K=1\n')
  fs.writeFileSync(path.join(d, '.env.local'), 'K=2\n')
  fs.appendFileSync(path.join(d, '.gitignore'), '.env\n.env.local\n')
  execFileSync('git', ['-C', d, 'add', '-A']); execFileSync('git', ['-C', d, 'commit', '-q', '-m', 'ignore env'])
  const f = doctorJson(d).findings
  assert.ok(f.includes('lanes: the root has .env that lanes will not see — add the line .env to .worktreeinclude'), f.join('\n'))
  assert.ok(f.some((x) => x.includes('.env.local that lanes will not see')), 'each file is reported')
  execFileSync('git', ['-C', d, 'add', '-f', '.env.local'])
  const tracked = doctorJson(d).findings
  assert.ok(!tracked.some((x) => x.includes('.env.local that')), 'a tracked file is not reported')
  assert.ok(tracked.some((x) => x.includes('root has .env that')), 'the untracked, unnamed one is')
})

test('AC-20261105-14-13 doctor reads prototype worktrees: in flight, leftover, v7 record', () => {
  const d = inited({ testCommand: 'true' })
  const rec = (stem, status) => {
    fs.mkdirSync(path.join(d, 'design/prototypes', stem), { recursive: true })
    fs.writeFileSync(path.join(d, 'design/prototypes', stem, 'status.json'), JSON.stringify(status))
    fs.mkdirSync(path.join(d, '.claude/worktrees', 'proto-' + stem), { recursive: true })
  }
  rec('a', { stem: 'a', rounds: 1, marks: { opened: 'x' } })
  rec('b', { stem: 'b', rounds: 1, marks: { opened: 'x', closed: 'y' } })
  rec('c', { schemaVersion: 1, stem: 'c', rounds: [], marks: { opened: 'x' } })
  fs.mkdirSync(path.join(d, '.claude/worktrees/proto-d'), { recursive: true }) // no record at all
  const out = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout)
  assert.ok(out.info.includes('in flight: prototype a — /spec:prototype a'), out.info.join('|'))
  assert.ok(out.findings.includes('leftover worktree: .claude/worktrees/proto-b — git worktree remove --force .claude/worktrees/proto-b'), out.findings.join('|'))
  assert.ok(out.findings.includes('leftover worktree: .claude/worktrees/proto-d — git worktree remove --force .claude/worktrees/proto-d'), 'an absent record is a leftover')
  assert.ok(out.findings.includes('prototype c is a v7 record — /spec:migrate'), out.findings.join('|'))
  assert.ok(!out.findings.some((x) => /proto-c|proto-a/.test(x)) && !out.info.some((x) => /proto-b/.test(x)))
})

test('AC-20261105-14-13 no file under spec/ carries the overlay, its endpoint or the switch', () => {
  const hits = []
  const banned = new RegExp(['proto-overlay', 'ser' + 've --stem', '\\?proto='].join('|'))
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (banned.test(e.name + '\n' + fs.readFileSync(p, 'utf8'))) hits.push(path.relative(SPEC, p))
    }
  }
  walk(SPEC)
  assert.deepStrictEqual(hits, [])
})

// ---- spec 20261105/17: roadmap hygiene, the .gitignore remedy, .worktreeinclude -------------------------------

const Q = require(path.join(SPEC, 'scripts/lib/queue.js'))
const put = (d, rel, text) => { fs.mkdirSync(path.dirname(path.join(d, rel)), { recursive: true }); fs.writeFileSync(path.join(d, rel), text) }
const briefDoc = (nn, title) => `# ${nn} — ${title}\n\nPhase: P1 · Depends on: — · Primary workspaces: app\n\n## Result\n\nx\n`
const specDoc = (stat, brief) => `---\nstatus: ${stat}\nbrief: ${brief}\n---\n# S\n\n## File Plan\n\n| Path | Action | Summary |\n|---|---|---|\n| x.js | MODIFY | x |\n`

test('AC-20261105-17-8 doctor reports status\'s hygiene anomalies as roadmap findings and the decide ones as info lines', () => {
  const d = inited({ testCommand: 'true' })
  put(d, 'docs/roadmap/03-rounds.md', briefDoc('03', 'Rounds'))
  put(d, 'specs/20261104/01-rounds.md', specDoc('done', '03'))
  put(d, 'specs/20261104/02-stamp.md', specDoc('hardened', '77')) // orphan-stamp: hygiene
  put(d, 'specs/20261104/03-weird.md', specDoc('weird', 'n/a')) // unknown-status: hygiene
  Q.write(d, { version: 3, seq: 1, items: [{ id: 'q1', kind: 'brief', payload: '03', added: '2026-11-01T00:00:00.000Z' }] }) // brief 03 done but queued: decide
  const st = JSON.parse(runNode('scripts/status.js', ['--root', d, '--json']).stdout).anomalies
  const hygiene = st.filter((a) => a.audience === 'hygiene')
  const decide = st.filter((a) => a.audience === 'decide')
  assert.ok(hygiene.length >= 2 && decide.length === 1, JSON.stringify(st))
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 1)
  const j = JSON.parse(r.stdout)
  assert.deepStrictEqual(j.findings.filter((x) => x.startsWith('roadmap: [')), hygiene.map((a) => `roadmap: [${a.kind}] ${a.detail}`))
  assert.deepStrictEqual(j.info.filter((x) => x.startsWith('roadmap: [')), decide.map((a) => `roadmap: [${a.kind}] ${a.detail}`))
  assert.ok(!j.findings.some((x) => x.includes('brief-done-queued')), 'a decide anomaly adds no finding')
  const clean = inited({ testCommand: 'true' })
  assert.deepStrictEqual(JSON.parse(runNode('scripts/doctor.js', ['--root', clean, '--json']).stdout).findings, [], 'no roadmap, no roadmap finding')
})

test('AC-20261105-17-9 a missing .gitignore entry names its remedy: migrate on a migrated host, init otherwise', () => {
  const missing = (cfg) => JSON.parse(runNode('scripts/doctor.js', ['--root', setup(cfg), '--json']).stdout).findings.filter((x) => x.startsWith('gitignore: missing '))
  const v7 = missing({ testCommand: 'true', generatedBy: 'spec@7' })
  const fresh = missing({ testCommand: 'true' })
  assert.ok(v7.length >= 1, 'the seeded repo lacks at least one entry')
  assert.strictEqual(fresh.length, v7.length)
  for (const x of v7) assert.match(x, / — run \/spec:migrate$/)
  for (const x of fresh) assert.match(x, / — run \/spec:init$/)
  assert.deepStrictEqual(require(path.join(SPEC, 'scripts/init.js')).IGNORE, ['specs/**/*.run/', '.claude/worktrees/', '.claude/pending-question.json', '.claude/settings.local.json'])
})

test('AC-20261105-17-11 a .env that .worktreeinclude matches is named for lanes: no finding', () => {
  const d = inited({ testCommand: 'true' })
  fs.writeFileSync(path.join(d, '.env'), 'K=1\n')
  fs.writeFileSync(path.join(d, '.env.local'), 'K=2\n')
  fs.appendFileSync(path.join(d, '.gitignore'), '.env\n.env.local\n')
  fs.writeFileSync(path.join(d, '.worktreeinclude'), '.env\n')
  execFileSync('git', ['-C', d, 'add', '-A']); execFileSync('git', ['-C', d, 'commit', '-q', '-m', 'ignore env'])
  const f = doctorJson(d).findings
  assert.ok(!f.some((x) => x.includes('root has .env that')), f.join('\n'))
  assert.ok(f.some((x) => x.includes('root has .env.local that')), 'the unmatched sibling is still reported')
})

test('a directory outside any repository is a refusal naming the remedy, not a crash', () => {
  const d = tmpdir('doctor-norepo')
  const r = runNode('scripts/doctor.js', ['--root', d, '--json'])
  assert.strictEqual(r.status, 2, r.stderr)
  assert.doesNotMatch(r.stderr, /at gitCommonDir|Error:/)
  const out = JSON.parse(r.stdout)
  assert.strictEqual(out.ok, false)
  assert.ok(out.findings.some((x) => /not inside a git repository/.test(x) && /run git i/.test(x)), out.findings.join('\n'))
})

// ---- spec 20261106/04: doctor names an unsafe chain setup wrote before the lint fix ---------------
const UNSAFE = 'config: testCommand lets a failed check pass the gate — run /spec:init'

test('AC-20261106-04-6 AC-20261106-04-3 an unsafe chain is a config finding with and without the probe; a hand-written one is none', () => {
  const d = setup({ testCommand: 'npm run lint && true || true' }, { lint: 'true' })
  for (const opts of [undefined, { probe: false }]) assert.ok(doctor.check(d, opts).findings.includes(UNSAFE), JSON.stringify(opts))
  const r = runNode('scripts/doctor.js', ['--root', d])
  assert.strictEqual(r.status, 1)
  assert.ok(r.stdout.includes('- ' + UNSAFE), r.stdout)
  for (const h of [setup({ testCommand: 'a || b' }), setup({ testCommand: 'custom-lint && a || b' }, { lint: 'true' })]) assert.ok(!doctor.check(h, { probe: false }).findings.includes(UNSAFE))
})

test('AC-20261107-04-8 doctor says how many test files cite an AC as info, never a finding; with none it says new criteria are warned about, never refused', () => {
  const d = inited({ testCommand: 'true' })
  fs.mkdirSync(path.join(d, 'tests'))
  fs.writeFileSync(path.join(d, 'tests/a.test.js'), '// AC-20990101-01-1\n')
  fs.writeFileSync(path.join(d, 'tests/b_test.py'), '# AC-20990101-01-2\n')
  fs.writeFileSync(path.join(d, 'tests/c.test.js'), '// no criterion\n')
  const j = JSON.parse(runNode('scripts/doctor.js', ['--root', d, '--json']).stdout)
  assert.ok(j.info.includes('criteria: 2 of 3 test files cite an AC'), j.info.join('\n'))
  assert.ok(!j.findings.some((x) => x.startsWith('criteria')), j.findings.join('\n'))
  const none = inited({ testCommand: 'true' })
  const k = JSON.parse(runNode('scripts/doctor.js', ['--root', none, '--json']).stdout)
  assert.ok(k.info.includes('criteria: no test file cites an AC — new criteria are warned about, never refused'), k.info.join('\n'))
  assert.strictEqual(k.ok, true)
})

test('AC-20261108-02-1 doctor lists the stale-plugin finding when a newer plugin is installed beside the running one, and none when no entry shares its parent', () => {
  const reg = (installPath) => {
    const cfg = tmpdir('cfg')
    fs.mkdirSync(path.join(cfg, 'plugins'))
    fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'spec@tools': [{ installPath, version: '999.0.0' }] } }))
    return { CLAUDE_CONFIG_DIR: cfg }
  }
  const d = inited({ testCommand: 'true' })
  const beside = runNode('scripts/doctor.js', ['--root', d, '--json'], { env: reg(path.join(path.dirname(SPEC), '999.0.0')) })
  const found = JSON.parse(beside.stdout).findings.find((x) => /is running but 999\.0\.0 is installed — restart Claude Code/.test(x))
  assert.ok(found && /^plugin: spec \d/.test(found), beside.stdout)
  assert.strictEqual(beside.status, 1)
  // the not-a-repository refusal keeps it: a stale plugin may be why the session is lost
  const bare = runNode('scripts/doctor.js', ['--root', tmpdir('bare'), '--json'], { env: reg(path.join(path.dirname(SPEC), '999.0.0')) })
  assert.ok(JSON.parse(bare.stdout).findings.some((x) => /restart Claude Code/.test(x)), bare.stdout)
  const away = runNode('scripts/doctor.js', ['--root', d, '--json'], { env: reg(path.join(tmpdir('elsewhere'), 'spec', '999.0.0')) })
  assert.deepStrictEqual(JSON.parse(away.stdout).findings, [])
  assert.strictEqual(away.status, 0)
})
