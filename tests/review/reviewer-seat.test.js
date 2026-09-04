'use strict';
// Pins the reviewer/disposer seat declarations: the reviewer runs on a different model
// family than the build session, at an explicit effort, and core.md § Model Placement
// says so in the same words.
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

test('reviewer seat: model fable, effort low, declared in frontmatter', () => {
  const fm = frontmatter('agents/reviewer.md');
  assert.equal(fm.model, 'fable');
  assert.equal(fm.effort, 'low');
});

test('disposer seat: inherits the session model at an explicit medium effort', () => {
  const fm = frontmatter('agents/disposer.md');
  assert.equal(fm.model, 'inherit');
  assert.equal(fm.effort, 'medium');
});

test('core.md § Model Placement names the reviewer seat and its effort, and no longer calls Sonnet the reviewer', () => {
  const core = fs.readFileSync(path.join(SPEC, 'doctrine/core.md'), 'utf8');
  const section = core.slice(core.indexOf('## Model Placement'), core.indexOf('## Decisions'));
  assert.match(section, /reviewer seat is Fable at `effort:\s*low`/);
  assert.match(section, /disposer inherits the session model at\s+`effort:\s*medium`/);
  assert.doesNotMatch(section, /is every worker and the reviewer/);
  assert.match(section, /different model family/);
});
