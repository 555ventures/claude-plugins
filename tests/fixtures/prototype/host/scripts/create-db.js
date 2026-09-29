#!/usr/bin/env node
'use strict'
// Synthetic `prototype.dbCreate` (spec 20260928/01 D1/D3): cwd is the
// prototype worktree, so a plain relative write lands the sentinel file there for the test to
// find. Deliberately does not read PROTO_BRANCH/PROTO_WORKTREE/PROTO_BRIEF — no assertion in
// this spec's File Plan depends on their values, only on the env being set at all (D1).
const fs = require('fs')
fs.writeFileSync('db-created', process.env.PROTO_BRANCH || '')
