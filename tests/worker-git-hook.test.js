'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { SPEC, tmpdir, runBash, gitRepo, read, section, phrase } = require('./helpers')

// specs/20261103/03-workers-never-run-git.md: AC-20261103-03-1 .. -4 (the block-worker-git.sh
// verdicts), AC-20261103-03-8 (core § Worker Git Ban names its enforcer), AC-20261103-03-9 (wiring).

const SPEC_PATH = 'specs/20261103/03-workers-never-run-git.md'
const SCRIPT = 'scripts/block-worker-git.sh'

// A repo whose private git dir carries (or not) the spec-wave-open marker.
function fixture({ marker = true } = {}) {
  const root = fs.realpathSync(tmpdir('wgh'))
  gitRepo(root)
  if (marker) {
    const gd = execFileSync('git', ['-C', root, 'rev-parse', '--git-dir'], { encoding: 'utf8' }).trim()
    fs.writeFileSync(path.join(path.isAbsolute(gd) ? gd : path.join(root, gd), 'spec-wave-open'),
      JSON.stringify({ spec: SPEC_PATH, state: 'WAVE:scripts' }))
  }
  return root
}

function hook(cwd, command, extra = {}) {
  return runBash(SCRIPT, [], { input: JSON.stringify({ cwd, tool_name: 'Bash', tool_input: { command }, ...extra }) })
}

test('AC-20261103-03-1: a marked tree plus a single git commit exits 2 with the BLOCKED line naming the verb, state and spec, and an agent line', () => {
  const root = fixture()
  const r = hook(root, 'git commit -m x')
  assert.strictEqual(r.status, 2, 'a worker commit during an open wave goes through and destroys sibling workers\' uncommitted edits: ' + r.stdout + r.stderr)
  assert.match(r.stderr, /^BLOCKED: git commit during WAVE:scripts of specs\/20261103\/03-workers-never-run-git\.md/,
    'the block must name verb, state and spec from the marker so a stale marker is diagnosable: ' + r.stderr)
  assert.match(r.stderr, /agent: /, 'the message must name the calling agent so the refusal is attributable: ' + r.stderr)
})

test('AC-20261103-03-2: a writing verb behind other text, global options, a switch alias or a newline exits 2 naming that verb', () => {
  const root = fixture()
  const cases = [
    ['npm test && git add -A', 'add'],
    ['git -C /x reset --hard', 'reset'],
    ['git switch main', 'switch'],
    ['npm run lint\ngit add -A', 'add'],
  ]
  for (const [cmd, verb] of cases) {
    const r = hook(root, cmd)
    assert.strictEqual(r.status, 2, `${JSON.stringify(cmd)} slipped past the ban, so a worker can still mutate the tree: ` + r.stdout + r.stderr)
    assert.match(r.stderr, new RegExp('BLOCKED: git ' + verb + ' '), `the refusal must name "${verb}" for ${JSON.stringify(cmd)}: ` + r.stderr)
  }
})

test('AC-20261103-03-3: a marked tree with only read-only git verbs exits 0 with empty stderr', () => {
  const root = fixture()
  for (const cmd of ['git status', 'git --no-pager diff --stat', 'git log --oneline | head', 'git rev-parse --show-toplevel', 'git -c core.pager=cat log']) {
    const r = hook(root, cmd)
    assert.strictEqual(r.status, 0, `"${cmd}" is a read and a worker's scoped self-verification needs it; blocking it stalls every build: ` + r.stderr)
    assert.strictEqual(r.stderr, '', `an allowed read must print nothing, or every Bash call is polluted: ${r.stderr}`)
  }
})

test('AC-20261103-03-4: no marker, a non-git command, a quoted git string, or a cwd outside any repo all exit 0', () => {
  const marked = fixture()
  const bare = fixture({ marker: false })
  const outside = fs.realpathSync(tmpdir('wgh-nogit'))
  const cases = [
    [bare, 'git commit -m x', 'no marker means no build wave is open, so every session\'s commits must pass'],
    [marked, 'npm test', 'a command with no git invocation must pass'],
    [marked, 'echo "git commit"', 'a git string inside quotes is not an invocation'],
    [outside, 'git commit -m x', 'a cwd outside any repo has no private git dir to carry a marker'],
  ]
  for (const [cwd, cmd, why] of cases) {
    const r = hook(cwd, cmd)
    assert.strictEqual(r.status, 0, `${why}; a false block here stops ordinary sessions: ` + r.stderr)
  }
})

test('AC-20261103-03-8: core § Worker Git Ban names block-worker-git.sh as its enforcer and keeps the checkpoint-commit duty', () => {
  const body = section('spec/doctrine/core.md', /^## Worker Git Ban/, /^## /)
  assert.match(body, phrase('Enforced by `block-worker-git.sh`'),
    'without the enforcer pointer the rule is prose a worker may judge inapplicable and the script has no doctrine home')
  assert.match(body, phrase('checkpoint-commits after each green phase'),
    'the orchestrator\'s checkpoint duty is the other half of the ban; losing it leaves nobody owning git')
})

test('AC-20261103-03-9: hooks.json holds a PreToolUse Bash entry running block-worker-git.sh and keeps the existing entries', () => {
  const hooks = JSON.parse(read('spec/hooks/hooks.json')).hooks
  assert.ok(hooks.PreToolUse.some((e) => e.matcher === 'Bash' && e.hooks.some((h) => h.command.includes('scripts/block-worker-git.sh'))),
    'an unwired script never fires — the ban would stay prose')
  const old = hooks.PreToolUse.filter((e) => e.matcher !== 'Bash').map((e) => e.matcher).sort()
  assert.deepStrictEqual(old, ['AskUserQuestion', 'Write|Edit|NotebookEdit'],
    'adding the entry must not move the neighbouring hooks')
  assert.strictEqual(hooks.UserPromptSubmit.length, 3, 'the prompt-submit hooks must be untouched by the new entry')
  assert.ok(fs.existsSync(path.join(SPEC, SCRIPT)), 'the wired script must exist or every Bash call errors')
})
