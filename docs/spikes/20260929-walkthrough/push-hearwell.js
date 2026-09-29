#!/usr/bin/env node
'use strict'
// push-hearwell.js — usage: node push-hearwell.js <host dir> [--reword]
// Pushes the hearwell owner-onboarding journey as a wireframe round to the running
// walkthrough prototype, through the plugin client. <host dir> is a scratch host whose
// .claude/spec.config.json carries the `walkthrough` block. --reword changes one sentence of
// the story, to show a confirmed journey going stale.
// What this deliberately does NOT do: start the service, or author screens from a real seed
// file — the seed text is inline because this is a spike.
// Exit codes: 0 pushed · 1 refused (the refusal and its remedy are printed) · 2 usage.

const path = require('path')
const surfaces = require('../../../spec/scripts/lib/surfaces.js')
const client = require('./client.js')

const host = process.argv[2]
if (!host) {
  process.stderr.write('push-hearwell: no host dir — remedy: node push-hearwell.js <host dir>\n')
  process.exit(2)
}
const reword = process.argv.includes('--reword')

const SEED = `## Journeys

### owner-onboarding
Mika (clinic owner) is invited, confirms her roster, and ends at the brief.
1. "I open the invitation" -> owner-intro
2. "I check who is on my team" -> roster-confirm
3. "I see nobody is listed yet" -> roster-confirm@empty
4. "${reword ? 'I read what we will ask my team' : 'I read what happens next'}" -> reciprocity-brief
`

const go = (to) => ({ press: { action: 'navigate', params: { to } } })
const el = (type, props, children, on) => ({ type, props, children: children || [], ...(on ? { on } : {}) })
const shell = (active, body) => ({
  page: el('Stack', { gap: 0 }, ['nav', 'main']),
  nav: el('Nav', { brand: 'Hearwell', items: ['Welcome', 'Team', 'Brief'], active }, ['me']),
  me: el('Avatar', { name: 'Mika Sato', size: 'sm' }),
  main: el('Stack', { gap: 20, padding: 32 }, body),
})

const screens = [
  {
    name: 'owner-intro',
    spec: { root: 'page', elements: {
      ...shell('Welcome', ['title', 'lede', 'clinic', 'start']),
      title: el('Heading', { text: 'You are invited to Hearwell', level: 1 }),
      lede: el('Text', { text: 'Dr. Sato asked you to set up the clinic. It takes about five minutes.', muted: true }),
      clinic: el('Card', { title: 'Hearwell Clinic', description: 'Shibuya, Tokyo' }, ['clinicPhoto', 'clinicFacts']),
      clinicPhoto: el('Image', { label: 'Clinic photo', height: 140 }),
      clinicFacts: el('List', { items: ['3 audiologists', '2 front desk staff', 'Open Monday to Saturday'] }),
      start: el('Button', { label: 'Check my team' }, [], go('roster-confirm')),
    } },
  },
  {
    name: 'roster-confirm',
    spec: { root: 'page', state: { members: [
      { name: 'Aiko Tanaka', role: 'Audiologist' }, { name: 'Ren', role: 'Front desk' }, { name: 'Dr. Sato', role: 'Director' },
    ] }, elements: {
      ...shell('Team', ['title', 'lede', 'people', 'actions']),
      title: el('Heading', { text: 'Is this your team?', level: 1 }),
      lede: el('Text', { text: 'We will ask each person three short questions.', muted: true }),
      people: { type: 'Stack', props: { gap: 8 }, children: ['person'], repeat: { statePath: '/members' } },
      person: el('Row', { gap: 12 }, ['face', 'who', 'what']),
      face: el('Avatar', { name: { $item: 'name' } }),
      who: el('Text', { text: { $item: 'name' } }),
      what: el('Badge', { text: { $item: 'role' } }),
      actions: el('Row', { justify: 'between' }, ['add', 'next']),
      add: el('Button', { label: 'Add a person', variant: 'secondary' }),
      next: el('Button', { label: 'This is right' }, [], go('reciprocity-brief')),
    } },
  },
  {
    name: 'roster-confirm', state: 'empty',
    spec: { root: 'page', elements: {
      ...shell('Team', ['title', 'none', 'actions']),
      title: el('Heading', { text: 'Is this your team?', level: 1 }),
      none: el('Alert', { title: 'Nobody is listed yet', text: 'Add the people who work with clients.' }),
      actions: el('Row', { justify: 'between' }, ['add', 'next']),
      add: el('Button', { label: 'Add a person' }),
      next: el('Button', { label: 'Skip for now', variant: 'ghost' }, [], go('reciprocity-brief')),
    } },
  },
  {
    name: 'reciprocity-brief',
    spec: { root: 'page', elements: {
      ...shell('Brief', ['title', 'steps', 'topics', 'done']),
      title: el('Heading', { text: 'What happens next', level: 1 }),
      steps: el('List', { ordered: true, items: ['We email each person today', 'They answer three questions', 'You get one page back on Friday'] }),
      topics: el('Table', { columns: ['Question', 'Asked of'], rows: [
        ['What slows you down?', 'Everyone'], ['What do clients ask most?', 'Front desk'], ['What would you change first?', 'Audiologists'],
      ] }),
      done: el('Button', { label: 'Send the questions' }),
    } },
  },
]

async function main() {
  const j = surfaces.parseSeedJourneys(SEED).get('owner-onboarding')
  const journeys = [{
    id: 'owner-onboarding', title: 'Owner onboarding', persona: j.persona, beats: surfaces.beatHash(j.beats),
    // A beat with no state omits the key: the story hash has no `@state` for it, and the
    // service refuses both `null` and a made-up "default" (the hash would no longer match).
    steps: j.beats.map((b) => ({ beat: b.beat, screen: b.screen, ...(b.state ? { state: b.state } : {}) })),
  }]
  const pushed = await client.pushRound(path.resolve(host), { kind: 'wireframe', journeys, screens })
  if (pushed.skipped) {
    process.stdout.write('this host declares no walkthrough block: nothing sent\n')
    return
  }
  process.stdout.write('pushed round ' + pushed.round + ' · story hash ' + journeys[0].beats + '\n')
}

main().catch((e) => {
  process.stderr.write('push-hearwell: ' + e.message + (e.remedy ? ' — remedy: ' + e.remedy : '') + '\n')
  process.exit(1)
})
