'use strict'
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert')
const { tmpdir, runNode, gitRepo } = require('../helpers')

// specs/20261102/03-one-session-runs-the-lanes.md, specs/20261103/04-predictable-stops-become-host-policy.md and specs/20261103/06-the-fan-out-drains-the-queue.md File Plan: the synthetic host shared by the
// fan-out driver tests — a roadmap, hardened specs, optional parked and dependent specs, a queued
// fix and a red-CI row, plus helpers that stand a lane's worktree up the way the harness does
// (a linked worktree on spec/<stem>) and write the fake pending question and review sidecar a
// lane would leave. Every driver state is reached through the driver's own marks, never by
// writing the state file by hand.

const DRIVER = 'scripts/fanout-driver.js'
const STATUS = 'scripts/spec-status.js'
const DIR = 'specs/20261102'
const specRel = (stem) => DIR + '/' + stem + '.md'

const REPAIR = 'run one in-session repair round (Recommended)'

const LANE_AGENT = 'Agent {subagent_type: "general-purpose", model: opus, effort: medium, isolation: "worktree", run_in_background: true}'

const SPECS = {
  '03-x': { brief: '32', status: 'hardened' },
  '06-y': { brief: '32', status: 'hardened' },
  '04-z': { brief: '33', status: 'hardened' },
}

// The fixture's spec rows as repo-relative paths, by the names the tests use.
const ROWS = {
  S03: specRel('03-x'), S04: specRel('04-z'), S06: specRel('06-y'),
  S08s: specRel('08-s'), S08k: specRel('08-k'), S08p: specRel('08-p'), S08c: specRel('08-c'),
}

// fm: extra frontmatter lines appended after date/status/brief; body: replaces the `# <stem>` body.
function writeSpec(root, stem, brief, status, { fm = '', body = '# ' + stem + '\n' } = {}) {
  const p = path.join(root, specRel(stem))
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, '---\ndate: 2026-11-02\nstatus: ' + status + '\nbrief: ' + brief + '\n' + (fm ? fm + '\n' : '') + '---\n\n' + body)
}

const filePlan = (...paths) => '# plan\n\n## File Plan\n\n| Path | Action | Layer | Summary |\n|------|--------|-------|---------|\n' +
  paths.map((x) => '| `' + x + '` | MODIFY | scripts | change |').join('\n') + '\n'

// opts: parked — a hardened spec 05-p on an independent brief whose branch lives in a linked
// worktree; dependent — a hardened spec 07-d on a brief that depends on brief 32; fixes — a queued
// `--lane fix` item q107 plus a red-CI row on a done spec; blocked — hardened 08-k (brief 35) that
// depends on 03-x; draft — a draft 08-p (brief 35); selfSurface — hardened 08-s (brief 35) whose File
// Plan names spec/scripts/fanout-driver.js; critical — a rules file whose Risk Tiers names src/db.js
// (config pipelineRules), 03-x planning src/db.js and a hardened critical 08-c (brief 35) planning it;
// bornFix — queue items q108 (fix, after 03-x) and q109 (fix, after the done 01-base).
function fanoutHost(opts = {}) {
  const root = fs.realpathSync(tmpdir('fanout'))
  const git = gitRepo(root)
  const brief = (n, name, dep) => fs.writeFileSync(path.join(root, 'docs/roadmap', n + '-' + name + '.md'),
    '# ' + n + ' — ' + name + '\n\nPhase: P0 · Depends on: ' + (dep || '—') + ' · Primary workspaces: api\n')
  fs.mkdirSync(path.join(root, 'docs/roadmap'), { recursive: true })
  fs.writeFileSync(path.join(root, 'docs/roadmap/00-overview.md'),
    '# X Roadmap — Overview\n\n## Sequence\n\n| #  | Brief | Phase | Depends on |\n|---|---|---|---|\n')
  brief('31', 'base')
  brief('32', 'fan')
  brief('33', 'solo')
  const specs = { ...SPECS }
  if (opts.dependent) { brief('34', 'after', '32'); specs['07-d'] = { brief: '34', status: 'hardened' } }
  if (opts.parked || opts.blocked || opts.draft || opts.selfSurface || opts.critical) brief('35', 'park')
  if (opts.parked) specs['05-p'] = { brief: '35', status: 'hardened' }
  if (opts.blocked) specs['08-k'] = { brief: '35', status: 'hardened', fm: 'depends_on: [' + specRel('03-x') + ']' }
  if (opts.draft) specs['08-p'] = { brief: '35', status: 'draft' }
  if (opts.selfSurface) specs['08-s'] = { brief: '35', status: 'hardened', body: filePlan('spec/scripts/fanout-driver.js') }
  if (opts.critical) {
    specs['03-x'] = { ...specs['03-x'], body: filePlan('src/db.js') }
    specs['08-c'] = { brief: '35', status: 'hardened', fm: 'tier: critical', body: filePlan('src/db.js') }
  }
  if (opts.fixes || opts.bornFix) specs['01-base'] = { brief: '31', status: 'done' }
  for (const [stem, s] of Object.entries(specs)) writeSpec(root, stem, s.brief, s.status, { fm: s.fm, body: s.body })
  fs.mkdirSync(path.join(root, '.claude/rules'), { recursive: true })
  const config = { gateCommand: 'bash ./gate.sh', testCommand: 'bash ./gate.sh' }
  if (opts.critical) {
    config.pipelineRules = '.claude/rules/spec-pipeline.md'
    fs.writeFileSync(path.join(root, config.pipelineRules),
      '# Pipeline rules\n\n## Risk Tiers\n\n- `src/db.js` — the schema surface\n\n## Planning\n\n- nothing\n')
  }
  fs.writeFileSync(path.join(root, '.claude/spec.config.json'), JSON.stringify(config, null, 2) + '\n')
  fs.writeFileSync(path.join(root, 'gate.sh'), '#!/usr/bin/env bash\n[ -e .gate-red ] && exit 1\npwd > .gate-cwd\nexit 0\n')
  git('add', '-A')
  git('commit', '-q', '-m', 'seed fan-out host')
  if (opts.fixes) {
    fs.writeFileSync(path.join(root, '.claude/spec-runs.jsonl'), JSON.stringify({
      ts: '2026-11-02', stage: 'observe', spec: specRel('01-base'), branch: 'main', ci: 'red',
      sha: 'deadbee', url: 'https://github.com/x/y/actions/runs/9', runAt: '2026-11-02T09:00:00Z',
    }) + '\n')
    fs.writeFileSync(path.join(root, '.git/spec-queue.json'), JSON.stringify({ version: 1, seq: 107, items: [
      { id: 'q1', kind: 'brief', brief: '32', added: '2026-11-02T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '33', added: '2026-11-02T10:01:00Z' },
      { id: 'q107', kind: 'prompt', lane: 'fix', payload: 'repair the flaky export', added: '2026-11-02T10:02:00Z' },
    ] }))
  }
  if (opts.bornFix) {
    fs.writeFileSync(path.join(root, '.git/spec-queue.json'), JSON.stringify({ version: 1, seq: 109, items: [
      { id: 'q1', kind: 'brief', brief: '32', added: '2026-11-02T10:00:00Z' },
      { id: 'q2', kind: 'brief', brief: '33', added: '2026-11-02T10:01:00Z' },
      { id: 'q108', kind: 'prompt', lane: 'fix', payload: 'repair what 03-x left', after: { spec: specRel('03-x') }, added: '2026-11-02T10:02:00Z' },
      { id: 'q109', kind: 'prompt', lane: 'fix', payload: 'repair what 01-base left', after: { spec: specRel('01-base') }, added: '2026-11-02T10:03:00Z' },
    ] }))
  }
  const common = path.join(root, '.git')
  const wt =(stem) => root + '-wt-' + stem
  const h = {
    root, git, common, wt, specRel, specs,
    stateFile: path.join(common, 'spec-fanout.json'),
    reportFile: path.join(common, 'spec-fanout', 'report.json'),
    run: (args = [], o = {}) => runNode(DRIVER, ['--root', root, ...args], { cwd: o.cwd || root, env: o.env }),
    state: () => JSON.parse(fs.readFileSync(path.join(common, 'spec-fanout.json'), 'utf8')),
    lane: (id) => h.state().lanes.find((l) => l.id === id),
    status: (args) => runNode(STATUS, ['--root', root, ...args], { cwd: root }),
    // A linked worktree on spec/<stem>, standing in for the one the harness gives a worker.
    startLane(stem) {
      git('worktree', 'add', '-q', '-b', 'spec/' + stem, wt(stem))
      return wt(stem)
    },
    pendingPath: (stem) => path.join(wt(stem), '.claude', 'pending-question.json'),
    writePending(stem, doc) {
      fs.mkdirSync(path.join(wt(stem), '.claude'), { recursive: true })
      fs.writeFileSync(h.pendingPath(stem), JSON.stringify({ ...doc, answers: null, dismissed: null }, null, 2) + '\n')
    },
    readPending: (stem) => JSON.parse(fs.readFileSync(h.pendingPath(stem), 'utf8')),
    // The lane's review or build sidecar: <worktree>/<spec>.review/review-state.json or .build/build-state.json.
    sidecar(stem, kind, marks) {
      const dir = path.join(wt(stem), DIR, stem + '.' + kind)
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, kind + '-state.json'), JSON.stringify(marks, null, 2) + '\n')
    },
    commitInLane(stem, file, text) {
      fs.writeFileSync(path.join(wt(stem), file), text)
      execGit(wt(stem), 'add', '-A')
      execGit(wt(stem), 'commit', '-q', '-m', 'lane work ' + stem)
    },
    // What a finished review leaves on main: the branch merged with a merge commit, the worktree and
    // the branch removed. markDone also flips the spec to done on the branch first.
    // cleanup: false leaves both, as when the review driver died after the merge landed.
    mergeLane(stem, { markDone = false, cleanup = true } = {}) {
      if (markDone) {
        const row = specs[stem]
        writeSpec(wt(stem), stem, row.brief, 'done', { fm: row.fm, body: row.body })
        execGit(wt(stem), 'add', '-A')
        execGit(wt(stem), 'commit', '-q', '-m', 'close ' + stem)
      }
      git('merge', '-q', '--no-ff', '-m', 'merge spec/' + stem, 'spec/' + stem)
      if (!cleanup) return
      git('worktree', 'remove', '--force', wt(stem))
      git('branch', '-q', '-d', 'spec/' + stem)
    },
    // Specs closed on main, as after their lanes merged: the rows flip to done and the change is committed.
    markDone(...stems) {
      for (const stem of stems) { const row = specs[stem]; writeSpec(root, stem, row.brief, 'done', { fm: row.fm, body: row.body }) }
      git('add', '-A')
      git('commit', '-q', '-m', 'close ' + stems.join(','))
    },
    // The harness keeps a lock on a worker's worktree after its return.
    lockLane: (stem) => git('worktree', 'lock', '--reason', 'claude agent agent-' + stem, wt(stem)),
    gateRed(on) {
      const p = path.join(root, '.gate-red')
      if (on) fs.writeFileSync(p, 'red\n')
      else fs.rmSync(p, { force: true })
    },
  }
  // Driver steps that must succeed, each failing with the driver's own stderr.
  h.must = (args, what) => {
    const r = h.run(args)
    assert.strictEqual(r.status, 0, 'the driver step ' + (what || args.join(' ')) + ' must exit 0 for the rest of the test to mean anything: ' + r.stderr + r.stdout)
    return r
  }
  // No --spec and no --batch plans the default two lanes 03-x and 04-z; a test of the derived batch calls
  // h.must([...]) then h.must(['--mark', 'planned']) itself.
  h.plan = (args = []) => {
    const explicit = args.includes('--spec') || args.includes('--batch') || fs.existsSync(h.stateFile)
    const planArgs = explicit ? args : ['--spec', specRel('03-x'), '--spec', specRel('04-z'), ...args]
    h.must(planArgs, 'plan')
    return h.must(['--mark', 'planned'], '--mark planned')
  }
  h.dispatch = (id, agent) => h.must(['--mark', 'dispatched', '--lane', id, '--agent', agent], '--mark dispatched ' + id)
  // plan + dispatch of the default two lanes: L1 = 03-x (agent lane-one), L2 = 04-z (agent lane-two).
  h.dispatchedPair = (planArgs = []) => {
    h.plan(planArgs)
    h.dispatch('L1', 'lane-one')
    h.dispatch('L2', 'lane-two')
  }
  return h
}

function execGit(cwd, ...args) {
  return require('node:child_process').execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
}

const opt = (label, description, resume) => ({ label, description, resume })

// The fake pending questions a lane would write, in the pending-question.json shape.
function pendingDoc(kind, spec, questions) {
  return { schemaVersion: 1, kind, stage: 'review', state: 'STOPPED', spec, writtenAt: '2026-11-02T10:00:00Z', questions }
}

function repairRoundDoc(spec) {
  return pendingDoc('repair-round', spec, [{
    id: 'q1', header: 'Review stop',
    question: 'A blocking review leg went red. What should the lane do?',
    options: [
      opt(REPAIR, 'The lane fixes the failing leg through the review fix seat and re-runs the legs; red again lands here with the round spent', 'node /abs/review-driver.js ' + spec + ' --mark repair-round'),
      opt('queue /spec:fix and stop', 'The review ends and the repair becomes the queue\'s top item for a later session', 'stop'),
    ],
  }])
}

function dispositionsDoc(spec, n) {
  return pendingDoc('dispositions', spec, Array.from({ length: n }, (_, i) => ({
    id: 's' + i, header: 'Finding ' + i,
    question: 'The reviewer raised a finding. What should happen to it?',
    options: [
      opt('accept waive (Recommended)', 'The finding is recorded as waived and the review goes on; chosen because the disposer judged it harmless', 'node /abs/review-driver.js ' + spec + ' --mark dispositions'),
      opt('reject and fix it', 'The finding is fixed first, which costs one more review iteration before the merge', 'node /abs/review-driver.js ' + spec + ' --mark dispositions'),
    ],
  })))
}

function redFindingsDoc(spec) {
  return pendingDoc('red-findings', spec, [{
    id: 'q1', header: 'Red findings',
    question: 'The build left a finding the gate cannot clear. How should the lane go on?',
    options: [
      opt('fix it in this lane (Recommended)', 'The lane repairs the finding itself and re-runs the gate, which is cheaper than a second lane', 'node /abs/build-driver.js ' + spec + ' --mark red-findings'),
      opt('queue /spec:fix and stop', 'The lane ends here and the repair becomes the queue\'s top item for a later session', 'stop'),
    ],
  }])
}

// Every balanced JSON object in `text` that carries a questions array — the AskUserQuestion blocks
// a driver step prints, in print order.
function askBlocks(text) {
  const found = []
  for (let i = text.indexOf('{'); i !== -1; i = text.indexOf('{', i + 1)) {
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < text.length; j++) {
      const c = text[j]
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try {
          const doc = JSON.parse(text.slice(i, j + 1))
          if (doc && Array.isArray(doc.questions)) { found.push(doc); i = j }
        } catch { /* not a block */ }
        break
      }
    }
  }
  return found
}

module.exports = {
  fanoutHost, askBlocks, specRel, DIR, LANE_AGENT, ROWS, writeSpec,
  repairRoundDoc, dispositionsDoc, redFindingsDoc,
}
