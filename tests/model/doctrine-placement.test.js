'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { read } = require('../helpers')

// specs/20260813/09-model-placement-mechanics.md D2/D4/D5/D6 (2026-08-14). D2 flips the wf-panel
// aggregate seat from Opus to Fable-first (Opus fallback) — JJ's 2026-08-13 ruling — and updates
// EVERY doctrine site that still names it an Opus seat (wf-panel's own meta/phases text, shared.md
// § Model Placement's Exceptions bullet, both genesis command checklists); fixing only the code
// point would reintroduce the exact doctrine-vs-code contradiction this spec exists to close. D4
// narrows § Model Placement's "uncorrelated model" review-independence claim at BOTH loci where it
// appears (the headline sentence and its ~15-line-later restatement) to one literal replacement
// sentence — fixing only the headline would leave the restatement as an unfixed echo of the same
// false claim. D5 adds an underivable-fork Fable-consult clause to § Question Style, appending to
// docs/consults.md; D6 wires that ledger into /spec:audit's mining list, promoted through the
// audit's EXISTING closed fate enum (never a new fate).

function extractSection(doc, headingPattern) {
  const re = new RegExp('^## ' + headingPattern + '\\s*\\n', 'm')
  const m = re.exec(doc)
  assert.ok(m, `section heading "## ${headingPattern}" not found — doctrine citation drift`)
  const rest = doc.slice(m.index + m[0].length)
  const nextIdx = rest.search(/\n## /)
  return nextIdx === -1 ? rest : rest.slice(0, nextIdx)
}

// Reuses the depth-counting call-site scanner (tests/model/effort-explicit.test.js AC-4) to
// isolate wf-panel's own aggregate-labeled call, so this pins the seat's arguments specifically
// rather than matching model:'fable'/effort:'high' loosely anywhere in the file.
function findCalls(src) {
  const calls = []
  const re = /\b(agent|dispatch)\(/g
  let m
  while ((m = re.exec(src))) {
    const start = m.index
    const open = start + m[0].length - 1
    let depth = 0
    let end = -1
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')' && --depth === 0) { end = i; break }
    }
    if (end === -1) throw new Error('unbalanced parens scanning a call at offset ' + start)
    calls.push(src.slice(start, end + 1))
  }
  return calls
}

test('AC-20260813-09-6: wf-panel\'s aggregate seat declares model: \'fable\' and effort: \'high\', drops the "Opus aggregator" framing from its own meta/phases text, and both genesis command checklists drop the stale "Opus session/aggregator" line', () => {
  const panelSrc = read('spec/workflows/src/wf-panel.body.js')
  const aggregateCall = findCalls(panelSrc).find(c => c.includes("label: 'aggregate'"))
  assert.ok(aggregateCall, 'wf-panel must still have an aggregate-labeled call site to check')
  assert.match(aggregateCall, /model:\s*'fable'/,
    'the aggregate seat must run model: \'fable\' — JJ\'s 2026-08-13 ruling flips the panel ' +
    'aggregator from an Opus seat to Fable-first with an Opus fallback')
  assert.match(aggregateCall, /effort:\s*'high'/,
    'the aggregate seat is the panel\'s synthesis/judgment seat — D3\'s three-band effort rule ' +
    'puts synthesis/judgment seats at \'high\'')
  assert.doesNotMatch(panelSrc, /Opus aggregator/,
    'wf-panel\'s own meta.description/phases text must stop calling the seat an "Opus aggregator" ' +
    'now that the seat itself runs on Fable — a stale label here reintroduces the exact ' +
    'doctrine-vs-code contradiction this spec closes')
  for (const rel of ['spec/commands/genesis-architect.md', 'spec/commands/genesis-design.md']) {
    const doc = read(rel)
    assert.doesNotMatch(doc, /Opus session\/aggregator/,
      `${rel}'s model checklist must drop "Opus session/aggregator" — it currently still asserts ` +
      'the panel aggregator is an Opus seat after the code moved to Fable-first')
  }
})

test('AC-20260813-09-7: shared.md § Model Placement states the three-band effort rule and the D4 review-independence replacement sentence at BOTH loci, drops every "uncorrelated model" claim, and no longer lists the panel aggregator among the Exceptions\' Opus seats', () => {
  const shared = read('spec/doctrine/shared.md')
  const section = extractSection(shared, 'Model Placement')

  assert.match(section, /effort.{0,40}explicit/is,
    'every Agent/workflow seat must be required to declare effort: explicitly, alongside model: ' +
    '— the effort clause rides on the existing never-inherit-model sentence per D3')
  assert.match(section, /low[^.\n]{0,15}[—-][^.\n]{0,250}(gate|extraction|red-check|currency)/i,
    'the low effort band must be defined as the mechanical/transcription seats (gates, ' +
    'extraction, red-check, currency probes, wf-design expansion workers)')
  assert.match(section, /medium[^.\n]{0,15}[—-][^.\n]{0,250}(propos|research|review|verif)/i,
    'the medium effort band must be defined as the analysis seats (proposers, researchers, ' +
    'reviewers, verifiers, wf-build implementation workers, enforce research)')
  assert.match(section, /high[^.\n]{0,15}[—-][^.\n]{0,250}(aggregator|synthesis|judgment)/i,
    'the high effort band must be defined as the synthesis/judgment seat (panel aggregator)')

  const replacement = /blind-to-author dispatch and execution-grounded\s+verification,\s+never model diversity/gi
  const occurrences = (section.match(replacement) || []).length
  assert.ok(occurrences >= 2,
    'the D4 replacement sentence ("review independence comes from blind-to-author dispatch and ' +
    'execution-grounded verification, never model diversity") must appear at BOTH loci — the ' +
    'headline sentence and its ~15-line-later restatement — never just the headline, or the ' +
    'restatement stands as an unfixed echo of the retired claim (found ' + occurrences + ')')
  assert.doesNotMatch(section, /uncorrelated model/,
    'no "uncorrelated model" claim may remain — this pipeline\'s reviewers and verifiers are all ' +
    'Sonnet, so the sentence asserts a cross-model-diversity property the system does not have')
  assert.doesNotMatch(section, /panel aggregator,?\s+and design-doctrine authoring stay Opus seats?/i,
    'the Exceptions bullet must stop listing the panel aggregator as a SUBJECT of "stay Opus ' +
    'seats" — the seat itself moved to Fable-first with an Opus fallback (a nearby, EXPLICITLY ' +
    'corrective mention of the seat\'s new placement is fine; the old affirmative claim is not)')
})

test('AC-20260813-09-8: § Question Style gains the underivable-fork Fable-consult clause naming docs/consults.md, audit.md\'s ledger-mining list includes it with promotion routed through the existing fate enum, and § Escalation Contract keeps its six triggers unmodified', () => {
  const shared = read('spec/doctrine/shared.md')
  const questionStyle = extractSection(shared, 'Question Style \\(every `AskUserQuestion`, every stage\\)')
  assert.match(questionStyle, /docs\/consults\.md/,
    'the underivable-fork clause must name docs/consults.md — the consult ledger /spec:audit mines')
  assert.match(questionStyle, /Fable/,
    'the clause must route a genuinely underivable fork to a Fable retainer consult, not a plain ask')
  assert.match(questionStyle, /recommendation/i,
    'the clause must check the fork payload\'s `recommendation` field (spec 08 D3) as one of the ' +
    'silent signals before consulting — the consult fires only when derivation AND recommendation ' +
    'are both empty')

  const audit = read('spec/commands/audit.md')
  assert.match(audit, /docs\/consults\.md/,
    'audit.md\'s ledger-mining list must include docs/consults.md, or ≥2-recurrence forks never ' +
    'get promoted into doctrine/config/an enforcer')
  assert.match(audit, /(rule-row|enforcer|refactor-brief)/,
    'consult-row promotion must route through the audit\'s EXISTING closed fate enum ' +
    '(rule-row/enforcer/refactor-brief) — D6 adds no new fate')

  const escalation = extractSection(shared, 'Escalation Contract \\(build\\)')
  assert.match(escalation, /These six are the entire contract/,
    '§ Escalation Contract\'s six build triggers must stay unmodified — D5 explicitly does not ' +
    'touch this list, a different mechanism gating build-execution failures, not underivable forks')
})

// D4a (review-time addendum, ratified by JJ 2026-08-14): review found a THIRD locus of the same
// retired claim that D4's spec missed — spec/commands/review.md restated it, paraphrased and
// hard-wrapped across a line break, so neither D4's retired literal nor the full replacement
// phrase ever matched a grep there. Corrected in the working tree to the same replacement
// sentence shared.md now carries at its two loci. This test pins that third locus so a future
// edit can't silently re-split or reintroduce the cross-model/uncorrelated-model framing here
// the way it escaped the original spec.
test('AC-20260813-09-7 (third locus): spec/commands/review.md states the D4 replacement sentence across its existing hard wrap, drops the cross-model/"gate\'s value" and uncorrelated-model framing, and keeps the Sonnet-only placement rule', () => {
  const review = read('spec/commands/review.md')

  const replacement = /Review independence\s+comes from blind-to-author dispatch and execution-grounded\s+verification,\s+never model\s+diversity/
  assert.match(review, replacement,
    'review.md must state the D4 replacement sentence ("Review independence comes from blind-to-author ' +
    'dispatch and execution-grounded verification, never model diversity") even though it is hard-wrapped ' +
    'across this file\'s existing line breaks — this is the third locus D4\'s spec missed, only caught at ' +
    'review time as D4a; a single-line literal here would silently pass a regression that re-splits the ' +
    'phrase across a different line break')

  assert.doesNotMatch(review, /cross[- ]model/i,
    'review.md must not reintroduce a "cross-model" framing for review independence — the retired claim ' +
    'attributed the gate\'s value to cross-model diversity, which is false: workers, reviewers, and ' +
    'verifiers here are all Sonnet')
  assert.doesNotMatch(review, /is\s+the\s+gate['’]s\s+value/i,
    'review.md must not reintroduce the "...is the gate\'s value" framing that used to attribute review ' +
    'independence to model diversity rather than to blind-to-author dispatch and execution-grounded ' +
    'verification')
  assert.doesNotMatch(review, /uncorrelated model/i,
    'review.md must not reintroduce an "uncorrelated model" claim — AC-20260813-09-7 already forbids this ' +
    'stem at shared.md\'s canonical locus, and this third locus must hold the same line')

  const placementRule = /\*\*Orchestrator: Sonnet\. Reviewers and verifiers: Sonnet — never Fable\.\*\*/
  assert.match(review, placementRule,
    'the bold placement rule ("Orchestrator: Sonnet. Reviewers and verifiers: Sonnet — never Fable.") must ' +
    'survive independently of its retired reason — only the CAUSE claimed for review independence was ' +
    'false, not the placement itself, so a future edit must not delete the rule along with the now-fixed ' +
    'reasoning sentence beside it')
})
