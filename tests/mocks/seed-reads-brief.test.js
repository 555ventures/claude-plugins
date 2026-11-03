'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261103/02-ceremony-nothing-reads.md AC-20261103-02-12 (terminal block continues).
// specs/20261029/06-the-genesis-question-diet.md — AC-20261029-06-9 (D8 SEED reads the genesis
// brief), AC-20261029-06-10 (D8 the all-journeys terminal block).

function writeGenesisBrief(root, text) {
  fs.mkdirSync(path.join(root, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/genesis/brief.md'), text)
}

test('AC-20261029-06-9: the SEED step prints the idea from the genesis brief when it holds the building section and asks for the idea only when it does not', () => {
  const warm = fx.makeRoot({ seed: false })
  writeGenesisBrief(warm, "# Discovery brief — x\n\n## What I think you're building\nA shared inbox for vet clinics.\n\nSecond paragraph.\n\n## Coverage\n- payer: dark\n")
  const w = fx.runDriver(warm, [])
  assert.strictEqual(w.status, 0, 'a cold root must print the SEED step: ' + w.stderr)
  assert.match(w.stdout, /^idea \(from genesis brief\): A shared inbox for vet clinics\.$/m, 'SEED must carry the idea from the genesis brief, or the owner is asked for the idea twice: ' + w.stdout)
  assert.doesNotMatch(w.stdout, /ask the user for the product idea/, 'a present genesis brief must suppress the ask-for-the-idea line, or the owner is still asked twice')

  const cold = fx.makeRoot({ seed: false })
  const c = fx.runDriver(cold, [])
  assert.match(c.stdout, /^idea: ask the user for the product idea \(no \.claude\/genesis\/brief\.md\)$/m, 'without a genesis brief SEED must say the idea is to be asked: ' + c.stdout)
})

test('AC-20261029-06-10 / AC-20261103-02-12: the terminal SCREENS step lists every pending journey', () => {
  const terminal = fx.makeRoot({})
  fx.writeStatus(terminal)
  const t = fx.runDriver(terminal, [])
  assert.match(t.stdout, /^## Step: confirm 2 journeys in the terminal$/m, 'terminal SCREENS must confirm every pending journey in one step: ' + t.stdout)
  assert.match(t.stdout, /^### owner-onboarding$/m, 'the block must list owner-onboarding with its persona and beats')
  assert.match(t.stdout, /^### team-invite$/m, 'the block must list team-invite with its persona and beats')
  assert.match(t.stdout, /approve all, or name the ones to change/, 'the block must offer one approve-all reply, or the owner approves one journey per run')
  assert.strictEqual((t.stdout.match(/--mark journey-approved --journey /g) || []).length, 2, 'one journey-approved mark line must be printed per pending journey, or approve-all cannot be executed')
})
