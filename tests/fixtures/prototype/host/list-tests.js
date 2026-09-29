#!/usr/bin/env node
'use strict'
// Synthetic `prototype.e2eList` (spec 20260928/02 D4): reads the file named by the one positional
// arg (resolved against cwd = the host root, matching how the driver is expected to run this
// command) and prints one line per `test('<title>', ...)` call found in it, in file order.
// LIST_TESTS_LIMIT caps how many titles are printed — freeze.test.js's AC-20260928-02-7 case that
// must observe the driver refuse when the list stub under-reports a file that genuinely carries
// both AC ids.
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
