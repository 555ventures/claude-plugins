'use strict'
const test = require('node:test')
const assert = require('node:assert')
const { writePolicy } = require('../helpers')
const fx = require('./wireframe-fixtures')

// specs/20261029/09-the-commands-read-the-policy-block.md (AC-20261029-09-7): the terminal SCREENS
// confirm step prints the /spec:connect hint only for a host that opted into the hosted service.

const HINT = '(this project is not connected to the review service — /spec:connect connects it, and the screens are then drawn and sent)'

function confirmStep(policyBlock) {
  const root = fx.makeRoot({ block: false })
  fx.writeScreens(root)
  fx.writeStatus(root, {
    journeys: {
      'owner-onboarding': fx.journeyEntry({ approved: null, beats: fx.H_OWNER }),
      'team-invite': fx.journeyEntry({ approved: null, beats: fx.H_TEAM }),
    },
  })
  writePolicy(root, policyBlock)
  const r = fx.runDriver(root, [])
  assert.strictEqual(r.status, 0, 'setup precondition: the driver must print the SCREENS confirm step: ' + r.stdout + r.stderr)
  assert.match(r.stdout, /confirm 2 journeys in the terminal/,
    'setup precondition: the fixture must reach the terminal confirm step: ' + r.stdout)
  return r.stdout
}

test('AC-20261029-09-7: WHEN no walkthrough block and no policy block THE SYSTEM prints no /spec:connect hint at the terminal SCREENS confirm', () => {
  const out = confirmStep(null)
  assert.ok(!out.includes('/spec:connect connects it'),
    'a default host is nagged to connect an upload service it never opted into: ' + out)
})

test('AC-20261029-09-7: WHEN policy.reviewService is "terminal" and no walkthrough block THE SYSTEM prints no /spec:connect hint', () => {
  const out = confirmStep({ reviewService: 'terminal' })
  assert.ok(!out.includes('/spec:connect connects it'),
    'a host that answered terminal is still nagged to connect: ' + out)
})

test('AC-20261029-09-7: WHEN policy.reviewService is "hosted" and no walkthrough block THE SYSTEM prints the connect hint', () => {
  const out = confirmStep({ reviewService: 'hosted' })
  assert.ok(out.includes(HINT),
    'a host that opted into the hosted service but has not connected gets no pointer to /spec:connect: ' + out)
})
