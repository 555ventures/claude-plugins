'use strict'
// Scripted stand-in for the hosted review service — specs/20260929/01-the-walkthrough-contract-and-the-client.md
// (File Plan: tests/walkthrough/stub-service.js). Run as its own child process, never in the test
// process: the client under test is spawned and a synchronous parent could not serve it.
//
// Usage: node stub-service.js <port> <answers.json> <log.jsonl>     (port 0 = pick a free one)
//
// answers.json maps "METHOD /path" (query string excluded) to a list of scripted answers, served
// in order per key; once the list is used up the last answer repeats. Each answer:
//   { status?: 200, headers?: {}, body?: <json>, raw?: "<text>", hang?: true }
// The token "$contentHash" inside a JSON body is replaced by the contentHash of the request body
// (for "the earlier push arrived" answers). A key with no script answers 404 stub-unscripted.
// Every request appends one JSON line to log.jsonl: method, url (with query), headers, bodyLength,
// bodySha256, json (parsed body or null). The port is printed as "PORT <n>" on stdout once bound.
//
// Exit codes: 0 never (runs until killed); 2 bad usage.

const http = require('node:http')
const fs = require('node:fs')
const crypto = require('node:crypto')

const [port, answersFile, logFile] = process.argv.slice(2)
// The build gate passes every File Plan tests path to `node --test`, which loads this file as a test with no argv: exit 0 there.
if (port === undefined && process.env.NODE_TEST_CONTEXT) process.exit(0)
if (port === undefined || !answersFile || !logFile) {
  process.stderr.write('usage: stub-service.js <port> <answers.json> <log.jsonl>\n')
  process.exit(2)
}

const answers = JSON.parse(fs.readFileSync(answersFile, 'utf8'))
const served = {}

const server = http.createServer((req, res) => {
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    let json = null
    if (body.length && body[0] === 0x7b) {
      try { json = JSON.parse(body.toString('utf8')) } catch { json = null }
    }
    fs.appendFileSync(logFile, JSON.stringify({
      method: req.method,
      url: req.url,
      headers: req.headers,
      bodyLength: body.length,
      bodySha256: crypto.createHash('sha256').update(body).digest('hex'),
      json,
    }) + '\n')

    const key = req.method + ' ' + req.url.split('?')[0]
    const list = answers[key]
    if (!list || !list.length) {
      res.writeHead(404, { 'content-type': 'application/json', connection: 'close' })
      res.end(JSON.stringify({ error: 'stub-unscripted', detail: key, apiVersion: 1 }))
      return
    }
    const at = served[key] || 0
    served[key] = at + 1
    const a = list[Math.min(at, list.length - 1)]
    if (a.hang) return // never answers
    const headers = { connection: 'close', ...(a.headers || {}) }
    let out = ''
    if (a.raw !== undefined) {
      if (!headers['content-type']) headers['content-type'] = 'text/plain'
      out = a.raw
    } else if (a.body !== undefined) {
      if (!headers['content-type']) headers['content-type'] = 'application/json'
      out = JSON.stringify(a.body).replace(/\$contentHash/g, json && json.contentHash ? json.contentHash : '')
    }
    res.writeHead(a.status || 200, headers)
    res.end(out)
  })
})

server.listen(Number(port), '127.0.0.1', () => {
  process.stdout.write('PORT ' + server.address().port + '\n')
})
