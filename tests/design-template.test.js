'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { ROOT } = require('./helpers')

// specs/20260905/05-desktop-fill-render-rule.md D8 (AC-20260905-05-9): the shipped canon
// template's § Shells section must ask each shell what it does at every declared viewport
// before the first screen is drawn — the upstream fix that catches a phone-width-forever shell
// before a `data-narrow` mark or a desktop-fill finding would.

const TEMPLATE_PATH = path.join(ROOT, 'spec', 'templates', 'mocks-canon.md')

function shellsSection(src) {
  const start = src.indexOf('## Shells')
  assert.notStrictEqual(start, -1, 'the template must have a "## Shells" heading to scope this check to: ' + TEMPLATE_PATH)
  const nextHeading = src.indexOf('\n## ', start + 1)
  return nextHeading === -1 ? src.slice(start) : src.slice(start, nextHeading)
}

test('AC-20260905-05-9: spec/templates/mocks-canon.md § Shells asks each shell what it does at every declared viewport, and names the data-narrow mark, for a mock deliberately narrow at every width', () => {
  assert.ok(fs.existsSync(TEMPLATE_PATH),
    'spec/templates/mocks-canon.md must exist — a missing shipped template is a build regression, not a passing test: ' + TEMPLATE_PATH)
  const src = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  const section = shellsSection(src)

  // \s+ rather than a literal space between words: markdown hard-wrap can split this phrase
  // across lines in the shipped file without changing its meaning.
  assert.match(section, /at\s+every\s+viewport\s+in/,
    'D8: the § Shells prompt must ask what each shell does "at every viewport in" `design/targets.json` — without this upstream question, a cold canon author never learns what "responsive" means for this product before drawing the first screen: ' + section)
  assert.match(section, /data-narrow/,
    'D8: the § Shells prompt must name the `data-narrow` mark as the declared escape hatch for a shell that is deliberately a narrow column at every width, or an author has no way to mark that choice before it becomes a desktop-fill finding later: ' + section)
})
