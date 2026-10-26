'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const path = require('node:path')
const { SPEC } = require('../helpers')

const { journeyStoriesCheck } = require(path.join(SPEC, 'scripts/lib/storybook-index.js'))

const entry = (importPath) => ({ id: 'journeys-booking--walk', importPath, tags: ['journey', 'play-fn'] })

test('a workspace host\'s Storybook-root-relative importPath matches the repo-relative journeysDir', () => {
  const r = journeyStoriesCheck([entry('./src/journeys/booking.journey.stories.tsx')], ['booking'], 'apps/web/src/journeys')
  assert.deepStrictEqual(r, { ok: true, stories: { booking: 'journeys-booking--walk' } },
    'Storybook in apps/web reports "src/journeys" — refusing it refuses every journey on a workspace host')
})

test('a suffix match is /-bounded, never a partial segment', () => {
  const r = journeyStoriesCheck([entry('./b/src/journeys/booking.journey.stories.tsx')], ['booking'], 'apps/web/src/journeys')
  assert.deepStrictEqual(r, { ok: false, journey: 'booking' })
})
