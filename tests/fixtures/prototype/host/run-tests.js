#!/usr/bin/env node
'use strict'
// Synthetic `prototype.e2eRun` (specs/20261007/01-approve-writes-a-behaviour-contract.md D6):
// cwd = the prototype worktree. Writes process.env.PROTO_URL to
// <host root>/design/prototypes/<stem>/e2e-env.txt (root and stem derived from the worktree path
// <root>/.claude/worktrees/proto-<stem>, beside e2e.log) and exits 1 when E2E_RED=1, else 0.
const fs = require('fs')
const path = require('path')
const root = path.resolve(process.cwd(), '..', '..', '..')
const stem = path.basename(process.cwd()).replace(/^proto-/, '')
const dir = path.join(root, 'design/prototypes', stem)
fs.mkdirSync(dir, { recursive: true })
fs.writeFileSync(path.join(dir, 'e2e-env.txt'), process.env.PROTO_URL || '')
if (process.env.E2E_RED === '1') {
  console.error('run-tests: red (E2E_RED=1)')
  process.exit(1)
}
console.log('run-tests: green')
process.exit(0)
