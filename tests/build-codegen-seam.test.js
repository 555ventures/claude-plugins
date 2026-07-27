'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')
const { SPEC } = require('./helpers')

// PRAX-20260721-02: wf-build's phase model (implement → gate → repair) has no slot for
// an orchestrator-only transform that must run BETWEEN implementation batches with
// read-only-to-workers output (a contracts codegen: Zod seam edit → regenerate
// schemas/*.json + the pydantic mirror before either plane's gate can go green).
// Workers correctly return `blocked` on the read-only mirror, the repair loop burns
// rounds on something no worker may fix, and the whole spec falls back to fastPath —
// discarding batching and the gate/repair loop. Any host with a codegen seam (schema
// emitter, ORM client generator, protobuf/OpenAPI compile) hits this on every spec
// touching the seam. Fix contract: a declared orchestrator-executed step at a layer
// group boundary — runs after group N, before group N+1, never dispatched to a worker.

const src = fs.readFileSync(
  path.join(SPEC, 'workflows/src/wf-build.body.js'), 'utf8')

test('wf-build supports an orchestrator-executed step between layer groups', () => {
  assert.match(src, /between[- ]?(group|batch)|group[- ]?(hook|step|command|boundary)|codegen/i,
    'the layer-group loop dispatches every group straight to workers: a codegen seam ' +
    'whose output is a read-only worker surface has no home, so workers block, the ' +
    'repair loop spins, and the build abandons the workflow entirely')
})
