#!/usr/bin/env node
'use strict'
// pull-hearwell.js — usage: node pull-hearwell.js <host dir> <round> [--reply <note id> <text>]
// Pulls a round's notes and the project's approvals from the running walkthrough prototype
// into <host dir>/design/rounds/<round>/, through the plugin client, and optionally answers
// one note.
// What this deliberately does NOT do: decide anything about the notes — it lands them as
// files and prints one line each.
// Exit codes: 0 pulled · 1 refused (the refusal and its remedy are printed) · 2 usage.

const path = require('path')
const client = require('./client.js')

const [host, round] = process.argv.slice(2)
if (!host || !/^\d+$/.test(round || '')) {
  process.stderr.write('pull-hearwell: bad arguments — remedy: node pull-hearwell.js <host dir> <round>\n')
  process.exit(2)
}
const at = process.argv.indexOf('--reply')

async function main() {
  const root = path.resolve(host)
  if (at !== -1) {
    const r = await client.replyNote(root, process.argv[at + 1], process.argv[at + 2])
    process.stdout.write('replied to ' + process.argv[at + 1] + ' → ' + r.status + '\n')
  }
  const notes = await client.pullNotes(root, Number(round))
  for (const n of notes.notes) {
    process.stdout.write('note ' + n.id + ' [' + n.status + '] ' + n.screen + ' ' + JSON.stringify(n.anchor) + ' — ' +
      n.thread.map((t) => t.by + ': ' + t.text).join(' | ') + '\n')
  }
  const appr = await client.pullApprovals(root, Number(round))
  for (const a of appr.approvals) process.stdout.write('approval ' + a.journey + ' by ' + a.by + ' round ' + a.round + ' story ' + a.beats + '\n')
  process.stdout.write('files: design/rounds/' + round + '/{round,notes,approvals}.json\n')
}

main().catch((e) => {
  process.stderr.write('pull-hearwell: ' + e.message + (e.remedy ? ' — remedy: ' + e.remedy : '') + '\n')
  process.exit(1)
})
