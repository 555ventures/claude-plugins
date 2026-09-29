#!/usr/bin/env node
'use strict'
// Synthetic `prototype.dbDestroy` (spec 20260928/02 D7): cwd is the prototype worktree, which is
// deleted immediately after this runs, so the marker is written into the host ROOT — derived from
// PROTO_WORKTREE (env set at create, D1: "<root>/.claude/worktrees/proto-<stem>") — rather than a
// relative path that would vanish with the worktree. freeze.test.js's deletion case (spec 02 D7)
// checks for this file's existence in the host root, never inside the (by-then-removed) worktree.
const fs = require('fs')
const path = require('path')
const wt = process.env.PROTO_WORKTREE || process.cwd()
const root = path.resolve(wt, '..', '..', '..')
fs.writeFileSync(path.join(root, 'db-dropped'), process.env.PROTO_BRANCH || '')
