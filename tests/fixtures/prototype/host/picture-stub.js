#!/usr/bin/env node
'use strict'
// Synthetic `prototype.picture` (specs/20261007/01-approve-writes-a-behaviour-contract.md D4):
// argv = <url> <out> <width> <height>, cwd = the prototype worktree. Records every call as one
// JSON line {argv, cwd, env:{PROTO_BRANCH,PROTO_WORKTREE,PROTO_BRIEF}} in <host root>/picture-calls.jsonl
// (root = the worktree's grandparent-of-grandparent, the same derivation destroy-db.js uses), then
// writes a 1x1 PNG to <out>. PICTURE_RED=<slug>--<state> exits 2 (stderr names it) when <out>
// carries that fragment; PICTURE_EMPTY=1 writes a zero-byte file instead of a PNG.
const fs = require('fs')
const path = require('path')
const [url, out, width, height] = process.argv.slice(2)
const root = path.resolve(process.cwd(), '..', '..', '..')
fs.appendFileSync(path.join(root, 'picture-calls.jsonl'), JSON.stringify({
  argv: [url, out, width, height],
  cwd: process.cwd(),
  env: { PROTO_BRANCH: process.env.PROTO_BRANCH, PROTO_WORKTREE: process.env.PROTO_WORKTREE, PROTO_BRIEF: process.env.PROTO_BRIEF },
}) + '\n')
if (process.env.PICTURE_RED && out.includes(process.env.PICTURE_RED)) {
  process.stderr.write('picture-stub: forced failure for ' + out + '\n')
  process.exit(2)
}
fs.mkdirSync(path.dirname(out), { recursive: true })
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
fs.writeFileSync(out, process.env.PICTURE_EMPTY === '1' ? Buffer.alloc(0) : PNG)
process.exit(0)
