'use strict';
// specs/20261029/01-model-placement-refresh.md (AC-20261029-01-1, -2, -3): the reviewer and
// disposer seats pin a tier and an effort in frontmatter, and core.md § Model Placement
// carries the per-seat table and the fresh-context independence statement.
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

test('AC-20261029-01-1: reviewer seat frontmatter yields model opus and effort high', () => {
  const fm = frontmatter('agents/reviewer.md');
  assert.equal(fm.model, 'opus',
    'a reviewer seat that is not opus floats with or above the session model and loses the documented bug-finding tier');
  assert.equal(fm.effort, 'high',
    'a reviewer seat below high effort under-reviews the diff and lets findings escape');
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

test('AC-20261029-01-3: core.md § Model Placement carries the per-seat table rows and the fresh-context independence sentence, with no family rule', () => {
  const core = fs.readFileSync(path.join(SPEC, 'doctrine/core.md'), 'utf8');
  const section = core.slice(core.indexOf('## Model Placement'), core.indexOf('## Decisions'));
  const row = (seat, model, effort) =>
    new RegExp('^\\|\\s*' + seat + '[^|]*\\|\\s*' + model + '\\s*\\|\\s*' + effort + '\\s*\\|', 'm');
  assert.match(section, row('Reviewer', 'opus', 'high'),
    'without the Reviewer | opus | high row the table does not bind the reviewer seat that the agent frontmatter declares');
  assert.match(section, row('Disposer', 'opus', 'medium'),
    'without the Disposer | opus | medium row the disposer seat has no doctrine home');
  assert.match(section, row('Implementation workers', 'sonnet', 'medium'),
    'without the Implementation workers | sonnet | medium row the worker seat is unstated and drivers drift');
  assert.match(section, /fresh-context/,
    'without the fresh-context sentence review independence is unexplained and the family rule has no replacement');
  assert.doesNotMatch(section, /different model family/,
    'the retired "different model family" rule is still taught, which nothing in the plugin can enforce');
  assert.doesNotMatch(section, /different family/,
    'the retired "different family" phrasing is still taught, contradicting the fresh-context independence rule');
});
