'use strict';
// specs/20261029/01-model-placement-refresh.md (AC-20261029-01-1, -2, -3): the reviewer and
// disposer seats pin a tier and an effort in frontmatter, and core.md § Model Placement
// carries the per-seat table and the fresh-context independence statement.
// specs/20261029/08-the-policy-round-at-init.md D8 (AC-20261029-08-9, AC-20261029-08-10): the reviewer
// seat returns to fable at low effort; the pins below are rewritten in place under both ids.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SPEC = path.join(__dirname, '..', '..', 'spec');
const frontmatter = (file) => {
  const s = fs.readFileSync(path.join(SPEC, file), 'utf8');
  const m = s.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(m, `${file} has frontmatter`);
  const out = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([a-zA-Z]+):\s*(\S.*)$/);
    if (kv) out[kv[1]] = kv[2].trim();
  }
  return out;
};

test('AC-20261029-01-1 / AC-20261029-08-9: reviewer seat frontmatter yields model fable and effort low', () => {
  const fm = frontmatter('agents/reviewer.md');
  assert.equal(fm.model, 'fable',
    'a reviewer seat that is not fable runs the same model as the Opus /spec:run session and is not independent of the orchestrator');
  assert.equal(fm.effort, 'low',
    'a reviewer seat off low effort drifts from the policy.models default that doctrine and the init question promise');
});

test('AC-20261029-01-2: disposer seat frontmatter yields model opus and effort medium, never inherit', () => {
  const fm = frontmatter('agents/disposer.md');
  assert.notEqual(fm.model, 'inherit',
    'an inherit disposer becomes Fable in a Fable session — cost drift and no independence from the session');
  assert.equal(fm.model, 'opus',
    'a disposer seat that is not opus is not the seat the per-seat table promises');
  assert.equal(fm.effort, 'medium',
    'a disposer without medium effort misprices its bounded judgment work');
});

test('AC-20261029-01-3 / AC-20261029-08-10: core.md § Model Placement carries the per-seat table rows and the fresh-context independence sentence, with no family rule', () => {
  const core = fs.readFileSync(path.join(SPEC, 'doctrine/core.md'), 'utf8');
  const section = core.slice(core.indexOf('## Model Placement'), core.indexOf('## Decisions'));
  const row = (seat, model, effort) =>
    new RegExp('^\\|\\s*' + seat + '[^|]*\\|\\s*' + model + '\\s*\\|\\s*' + effort + '\\s*\\|', 'm');
  assert.match(section, row('Reviewer', 'fable', 'low'),
    'without the Reviewer | fable | low row the table does not bind the reviewer seat that the agent frontmatter declares');
  assert.match(section, row('Disposer', 'opus', 'medium'),
    'without the Disposer | opus | medium row the disposer seat has no doctrine home');
  assert.match(section, row('Implementation workers', 'sonnet', 'medium'),
    'without the Implementation workers | sonnet | medium row the worker seat is unstated and drivers drift');
  assert.doesNotMatch(section, /different model family/,
    'the retired "different model family" rule is still taught, which nothing in the plugin can enforce');
  assert.doesNotMatch(section, /different family/,
    'the retired "different family" phrasing is still taught, contradicting the fresh-context independence rule');
  const fix = fs.readFileSync(path.join(SPEC, 'commands/fix.md'), 'utf8');
  assert.ok(fix.includes('`policy.models.reviewer`') && fix.includes('reviewer row of core § Model Placement'),
    'fix.md step 4 does not take the reviewer seat from the host policy with the table row as its default, so /spec:fix dispatches a seat the doctrine no longer defines');
  assert.ok(!fix.includes('`opus` at `effort: high`'),
    'fix.md still teaches the retired opus/high reviewer seat, contradicting core.md § Model Placement');
});
