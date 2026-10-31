'use strict'
const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const fx = require('./wireframe-fixtures')

// specs/20261029/06-the-genesis-question-diet.md — AC-20261029-06-9 (D8 SEED reads the genesis
// brief), AC-20261029-06-10 (D8 one batched assumptions block and the all-journeys terminal block).

function writeGenesisBrief(root, text) {
  fs.mkdirSync(path.join(root, '.claude/genesis'), { recursive: true })
  fs.writeFileSync(path.join(root, '.claude/genesis/brief.md'), text)
}

test('AC-20261029-06-9: the SEED step prints the idea from the genesis brief when it holds the building section and asks for the idea only when it does not', () => {
  const warm = fx.makeRoot({ seed: false, ledger: false })
  writeGenesisBrief(warm, "# Discovery brief — x\n\n## What I think you're building\nA shared inbox for vet clinics.\n\nSecond paragraph.\n\n## Coverage\n- payer: dark\n")
  const w = fx.runDriver(warm, [])
  assert.strictEqual(w.status, 0, 'a cold root must print the SEED step: ' + w.stderr)
  assert.match(w.stdout, /^idea \(from genesis brief\): A shared inbox for vet clinics\.$/m, 'SEED must carry the idea from the genesis brief, or the owner is asked for the idea twice: ' + w.stdout)
  assert.doesNotMatch(w.stdout, /ask the user for the product idea/, 'a present genesis brief must suppress the ask-for-the-idea line, or the owner is still asked twice')

  const cold = fx.makeRoot({ seed: false, ledger: false })
  const c = fx.runDriver(cold, [])
  assert.match(c.stdout, /^idea: ask the user for the product idea \(no \.claude\/genesis\/brief\.md\)$/m, 'without a genesis brief SEED must say the idea is to be asked: ' + c.stdout)
})

test('AC-20261029-06-10: every step print is preceded by one confirm-these-assumptions block for blocking product rows, and the terminal SCREENS step lists every pending journey', () => {
  const rows = [
    '| A1 | SCREENS | product | Clinics have three staff | inferred | open | - | - | - |',
    '| A2 | SCREENS | product | Owners invite staff by email | inferred | open | - | - | - |',
    '| A3 | SCREENS | product | Billing is per clinic | invented | open | - | - | - |',
  ]
  const root = fx.makeRoot({ rows })
  fx.writeStatus(root)
  const r = fx.runDriver(root, [])
  assert.strictEqual(r.status, 0, 'a bare run with open product rows must still print a step: ' + r.stderr)
  const out = r.stdout
  const block = out.indexOf('confirm these 3 assumptions')
  const step = out.indexOf('## Step:')
  assert.ok(block !== -1 && block < step, 'the confirmation block must precede the step heading, or the rows are only ever refused one at a time at the mark: ' + out)
  assert.match(out, /A1 inferred open — Clinics have three staff/, 'each blocking row must be listed with id, tag, status and claim: ' + out)
  assert.match(out, /A2 inferred open — Owners invite staff by email/, 'each blocking row must be listed with id, tag, status and claim: ' + out)
  assert.match(out, /A3 invented open — Billing is per clinic/, 'each blocking row must be listed with id, tag, status and claim: ' + out)
  assert.strictEqual((out.match(/AskUserQuestion/g) || []).length, 1, 'the block must ask in exactly one AskUserQuestion, or the owner is asked per row')
  for (const id of ['A1', 'A2', 'A3']) {
    assert.ok(out.includes('ledger set --id ' + id + ' --status confirmed --tag said-by-user'), 'the block must print the ledger set command for ' + id + ', or confirming a row needs hand-built commands')
  }

  const terminal = fx.makeRoot({})
  fx.writeStatus(terminal)
  const t = fx.runDriver(terminal, [])
  assert.match(t.stdout, /^## Step: confirm 2 journeys in the terminal$/m, 'terminal SCREENS must confirm every pending journey in one step: ' + t.stdout)
  assert.match(t.stdout, /^### owner-onboarding$/m, 'the block must list owner-onboarding with its persona and beats')
  assert.match(t.stdout, /^### team-invite$/m, 'the block must list team-invite with its persona and beats')
  assert.match(t.stdout, /approve all, or name the ones to change/, 'the block must offer one approve-all reply, or the owner approves one journey per run')
  assert.strictEqual((t.stdout.match(/--mark journey-approved --journey /g) || []).length, 2, 'one journey-approved mark line must be printed per pending journey, or approve-all cannot be executed')
})
