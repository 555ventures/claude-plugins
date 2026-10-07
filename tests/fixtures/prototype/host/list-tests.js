#!/usr/bin/env node
'use strict'
// Synthetic `prototype.e2eList` (specs/20261007/01-approve-writes-a-behaviour-contract.md D6): reads the file named by the one positional
// arg (resolved against cwd = the prototype worktree, where the driver runs this
// command) and prints one line per `test('<title>', ...)` call found in it, in file order.
// LIST_TESTS_LIMIT caps how many titles are printed, so a file that carries `pin p1:` and `pin p3:`
// can be made to list only `pin p1:` (the runner under-reporting a test the file really holds).
const fs = require('fs')
const file = process.argv[2]
let src = ''
try {
  src = fs.readFileSync(file, 'utf8')
} catch (e) {
  process.stderr.write('list-tests: cannot read ' + file + ': ' + e.message + '\n')
  process.exit(1)
}
const titles = []
const re = /test\(\s*['"`]([^'"`]+)['"`]/g
let m
while ((m = re.exec(src))) titles.push(m[1])
const limit = process.env.LIST_TESTS_LIMIT ? parseInt(process.env.LIST_TESTS_LIMIT, 10) : titles.length
for (const t of titles.slice(0, limit)) console.log(t)
process.exit(0)
