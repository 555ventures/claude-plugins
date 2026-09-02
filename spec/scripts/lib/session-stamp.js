'use strict'
// lib/session-stamp.js (D2, specs/20260901/02-run-provenance.md): the read side of
// the session-provenance mechanism spec-session-stamp.sh writes. readSessionStamp(root) parses
// <root>/.claude/spec-session.json; sessionModel(root) derives the session's model id from the
// LAST "type":"assistant" line of the stamped transcript's final 512 KiB.
//
// Motivation: no review/build row could name which model held
// the session that produced it — the session model is not in the shell environment (executed
// spike A1), and the transcript is the only other carrier. The transcript format is documented
// as internal and version-unstable (Claude Code sessions doc), so every failure mode here — an
// absent stamp, a missing transcript file, an unparseable line, no assistant line at all —
// degrades to `null`, never a thrown error; a broken review must never be the cost of a format
// change (executed spike A2: four distinct model ids observed across 15 real transcripts on
// record).
//
// What this deliberately does NOT do: write the stamp file (spec-session-stamp.sh's job), read
// the model at prompt time (the transcript is empty right after /clear — this is read late, at
// ledger-row-write time, so a driver's checkpoints see a real assistant line), or validate the
// stamp beyond "does it parse as a JSON object".
//
// Exit codes: n/a (library, not an entrypoint) — both exports degrade to null rather than
// throwing or exiting.
const fs = require('fs')
const path = require('path')

const STAMP_RELPATH = path.join('.claude', 'spec-session.json')
const TAIL_BYTES = 512 * 1024

function readSessionStamp(root) {
  let raw
  try {
    raw = fs.readFileSync(path.join(root, STAMP_RELPATH), 'utf8')
  } catch {
    return null
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return {
    sessionId: parsed.session_id,
    transcriptPath: parsed.transcript_path,
    cwd: parsed.cwd,
    ts: parsed.ts,
  }
}

// Reads the transcript's final TAIL_BYTES (whole file when smaller), walks its lines backwards,
// and returns the first ("last" in file order) that JSON-parses with type:"assistant" and a
// non-empty string message.model. A partial first line (cut by the tail window) parses as
// garbage and is skipped like any other unparseable line.
function sessionModel(root) {
  const stamp = readSessionStamp(root)
  if (!stamp || !stamp.transcriptPath) return null
  let fd
  try {
    fd = fs.openSync(stamp.transcriptPath, 'r')
  } catch {
    return null
  }
  let text
  try {
    const size = fs.fstatSync(fd).size
    const readLen = Math.min(size, TAIL_BYTES)
    const start = size - readLen
    const buf = Buffer.alloc(readLen)
    fs.readSync(fd, buf, 0, readLen, start)
    text = buf.toString('utf8')
  } catch {
    return null
  } finally {
    try { fs.closeSync(fd) } catch { /* best-effort close */ }
  }
  const lines = text.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim()
    if (!line) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    if (row && row.type === 'assistant' && row.message &&
        typeof row.message.model === 'string' && row.message.model) {
      return row.message.model
    }
  }
  return null
}

module.exports = { readSessionStamp, sessionModel }
