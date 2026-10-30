'use strict'
// lib/session-stamp.js the read side of
// the session-provenance mechanism spec-session-stamp.sh writes. readSessionStamp(root) parses
// <root>/.claude/spec-session.json; sessionModel(root) derives the session's model id from the
// LAST "type":"assistant" line of the stamped transcript's final 512 KiB; sessionUsage(root)
// sums the stamped transcript's token counters over the WHOLE file (read whole, scanned line by
// line — not the 512 KiB tail), counting the FIRST "type":"assistant" line per message.id only
// (one API response is written as several lines that repeat the same usage). It returns
// {input, cacheCreate, cacheRead, output, turns} (turns = distinct ids counted), or null when
// there is no stamp, no readable transcript, or no assistant line carrying a usage object.
// Owner: specs/20260901/02-run-provenance.md.
//
// Motivation: no review/build row could name which model held
// the session that produced it — the session model is not in the shell environment,
// and the transcript is the only other carrier. The transcript format is documented
// as internal and version-unstable (Claude Code sessions doc), so every failure mode here — an
// absent stamp, a missing transcript file, an unparseable line, no assistant line at all —
// degrades to `null`, never a thrown error; a broken review must never be the cost of a format
// change (four distinct model ids observed across 15 real transcripts on
// record).
//
// What this deliberately does NOT do: write the stamp file (spec-session-stamp.sh's job), read
// the model at prompt time (the transcript is empty right after /clear — this is read late, at
// ledger-row-write time, so a driver's checkpoints see a real assistant line), validate the
// stamp beyond "does it parse as a JSON object", read subagent transcripts (sessionUsage
// counts this session's own transcript only), or count assistant lines that carry no
// message.id (sessionUsage skips them, so turns equals distinct ids).
//
// Exit codes: n/a (library, not an entrypoint) — every export degrades to null rather than
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

function sessionUsage(root) {
  try {
    const stamp = readSessionStamp(root)
    if (!stamp || !stamp.transcriptPath) return null
    const text = fs.readFileSync(stamp.transcriptPath, 'utf8')
    const seen = new Set()
    const total = { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, turns: 0 }
    const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
    let start = 0
    while (start <= text.length) {
      let end = text.indexOf('\n', start)
      if (end === -1) end = text.length
      const line = text.slice(start, end).trim()
      start = end + 1
      if (!line || !line.includes('"assistant"')) continue
      let row
      try { row = JSON.parse(line) } catch { continue }
      if (!row || row.type !== 'assistant' || !row.message || typeof row.message !== 'object') continue
      const u = row.message.usage
      if (!u || typeof u !== 'object') continue
      const id = row.message.id
      if (typeof id !== 'string' || !id) continue
      if (seen.has(id)) continue
      seen.add(id)
      total.input += num(u.input_tokens)
      total.cacheCreate += num(u.cache_creation_input_tokens)
      total.cacheRead += num(u.cache_read_input_tokens)
      total.output += num(u.output_tokens)
      total.turns += 1
    }
    return total.turns === 0 ? null : total
  } catch {
    return null
  }
}

// Counter-wise now - start over all five fields; null when either side is null or any
// difference is negative.
function usageDelta(now, start) {
  if (!now || !start) return null
  const d = {}
  for (const k of ['input', 'cacheCreate', 'cacheRead', 'output', 'turns']) {
    d[k] = now[k] - start[k]
    if (!(d[k] >= 0)) return null
  }
  return d
}

module.exports = { readSessionStamp, sessionModel, sessionUsage, usageDelta }
