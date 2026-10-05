'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { tmpdir, runNode, SPEC } = require('../helpers')

// specs/20260926/02-the-design-contract-is-code.md D2/D3: spec/scripts/design-contract-check.js
// is the presence oracle for a host's design contract (kit/tokens/rules) — this file owns
// AC-20260926-02-1 through AC-20260926-02-6 and AC-20260926-02-10.

const SCRIPT = 'scripts/design-contract-check.js'

const FULL_RULES = `---
paths:
  - "src/components/**"
---
# Design rules

## Intent to pattern

| Intent | Pattern | Composite |
|--------|---------|-----------|
| edit one record | side sheet | RecordEditSheet |
| confirm destructive | modal | DestructiveConfirmDialog |

## Naming

### code
| Kind | Convention | Example |
|------|------------|---------|
| component | PascalCase noun | RecordEditSheet |

### schema
| Kind | Convention | Example |
|------|------------|---------|
| table | snake_case plural | salon_clients |

### routes
| Kind | Convention | Example |
|------|------------|---------|
| path segment | kebab-case plural | /salon-clients/:id |

### wire
| Kind | Convention | Example |
|------|------------|---------|
| JSON key | camelCase | createdAt |
`

// Builds a synthetic host tree. Each of config/rules/kitFiles/tokens defaults to a fully
// conforming value when omitted (undefined), is skipped entirely when explicitly `null`, and is
// written verbatim otherwise — so each AC only has to spell the one thing it deliberately breaks.
function writeHost(dir, { config, rules, kitFiles, tokens } = {}) {
  fs.mkdirSync(path.join(dir, '.claude'), { recursive: true })
  fs.writeFileSync(path.join(dir, '.claude/spec.config.json'), JSON.stringify(config === undefined
    ? { design: { kit: 'src/kit', tokens: 'src/tokens.css', rules: '.claude/rules/design.md' } }
    : config, null, 2))

  if (rules !== null) {
    fs.mkdirSync(path.join(dir, '.claude/rules'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude/rules/design.md'), rules === undefined ? FULL_RULES : rules)
  }

  if (kitFiles !== null) {
    fs.mkdirSync(path.join(dir, 'src/kit'), { recursive: true })
    const files = kitFiles === undefined
      ? {
          'record-edit-sheet.tsx': 'export function RecordEditSheet() { return null }\n',
          'index.ts': 'export function DestructiveConfirmDialog() { return null }\n',
        }
      : kitFiles
    for (const [name, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'src/kit', name), content)
    }
  }

  if (tokens !== null) {
    fs.writeFileSync(path.join(dir, 'src/tokens.css'), tokens === undefined ? '@theme {}\n' : tokens)
  }
}

function runCheck(dir, extraArgs = []) {
  return runNode(SCRIPT, ['--root', dir, '--json', ...extraArgs])
}


// specs/20260926/04-the-design-brief.md D7: at genesis time no `.claude/spec.config.json`
// `design` block exists yet — `--mark design-brief-written` runs design-contract-check.js
// against design-paths.json's own three paths via new override flags that bypass the config
// entirely. This file owns AC-20260926-04-15.


test('WHEN Composite cells carry backticks, props, several names, a possessive, or no name THE SYSTEM resolves each PascalCase name and reports one composite-missing per missing name', () => {
  const dir = tmpdir('design-contract-cell-grammar')
  const rules = FULL_RULES.replace(
    '| edit one record | side sheet | RecordEditSheet |\n| confirm destructive | modal | DestructiveConfirmDialog |\n',
    '| edit one record | side sheet | `RecordEditSheet` |\n' +
    '| press | button | `Button kind="ink"` / `Button kind="plain"` |\n' +
    '| the whole story | sheet | `StoryHead`, `Storyboard`, `StoryEnd` |\n' +
    '| mark the screen | marks | `Outline` (`Frame`\'s `marks`) |\n' +
    '| prose only | none | the usual one |\n')
  assert.notStrictEqual(rules, FULL_RULES, 'the fixture edit must replace the intent rows, or this test proves nothing')
  writeHost(dir, {
    rules,
    kitFiles: {
      'record-edit-sheet.tsx': 'export function RecordEditSheet() { return null }\n',
      'button.tsx': 'export function Button() { return null }\n',
      'storyboard.tsx': 'export function StoryHead() { return null }\nexport function Storyboard() { return null }\n',
      'frame.tsx': 'export function Frame() { return null }\n',
      'marks.tsx': 'export function Outline() { return null }\n',
    },
  })
  const out = JSON.parse(runCheck(dir).stdout)
  const missing = out.findings.filter((f) => f.kind === 'composite-missing').map((f) => [f.intent, f.composite])
  assert.deepStrictEqual(missing, [
    ['the whole story', 'StoryEnd'],
    ['prose only', 'the usual one'],
  ], 'only the absent StoryEnd and the name-less prose cell may be reported — a backticked, prop-carrying or possessive name that exists in the kit must resolve: ' + JSON.stringify(out.findings))
})
