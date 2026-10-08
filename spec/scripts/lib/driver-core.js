'use strict'
// lib/driver-core.js — the step-machine frame the driver scripts share: the refusal (die), the
// hand-rolled flag pair helpers, --root resolution, the status file's JSON read/write, the
// one-block step print, and the /clear-safe checkpoint line. prototype-driver.js and mocks-driver.js
// consume it; other drivers adopt it only when touched for another reason (2026-10-08 subtraction
// pass: full consolidation measured at 3–4% of driver lines, not worth its own spec).
//
// What this deliberately does NOT do: derive any state, know any status field beyond
// `lastUpdated`, or pick a remedy — every message a caller passes in is printed verbatim, so each
// driver's output text is byte-identical to its pre-extraction copy.
//
// Exit codes: n/a (library) — die() exits 2, emit()/checkpoint() exit 0.

const fs = require('fs')
const path = require('path')
const { writeOut } = require('./driver-io')

function nowIso() { return new Date().toISOString() }

// One refusal per driver name: `<name>: <msg>` on stderr, exit 2.
function makeDie(name) {
  return function die(msg) { writeOut(2, name + ': ' + msg + '\n'); process.exit(2) }
}

function flagArg(arr, name) { const i = arr.indexOf(name); return i > -1 ? arr[i + 1] : null }

function withoutFlagPair(arr, name) {
  const i = arr.indexOf(name)
  if (i === -1) return arr.slice()
  const copy = arr.slice()
  copy.splice(i, 2)
  return copy
}

// --root <dir> (default cwd) → { root, rest } with the pair removed; refuses a non-directory.
function takeRoot(arr, die) {
  const root = path.resolve(flagArg(arr, '--root') || process.cwd())
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    die('--root ' + root + ' is not a directory — remedy: pass a real project root, or omit --root to use the current directory')
  }
  return { root, rest: withoutFlagPair(arr, '--root') }
}

// Parsed JSON, or null when the file is absent; malformed JSON dies with the caller's message.
function readJsonOrNull(p, die, badJsonMsg) {
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch (e) {
    die(badJsonMsg(e))
    return null // unreachable
  }
}

// mkdir -p, pretty JSON + trailing newline.
function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n')
}

// Stamps lastUpdated, then writes.
function saveStatusFile(p, status) {
  status.lastUpdated = nowIso()
  writeJson(p, status)
}

// Prints one block of lines on stdout and exits 0.
function emit(lines) {
  writeOut(1, (Array.isArray(lines) ? lines.join('\n') : lines) + '\n')
  process.exit(0)
}

// The /clear-safe checkpoint line, last on stdout; exits 0.
function checkpoint(label, prevState, nextState, rerun) {
  writeOut(1, '✅ checkpoint — ' + label + ' state saved (' + prevState + ' → ' + nextState +
    '); safe to /clear and re-run ' + rerun + '\n')
  process.exit(0)
}

module.exports = {
  nowIso, makeDie, flagArg, withoutFlagPair, takeRoot, readJsonOrNull, writeJson, saveStatusFile,
  emit, checkpoint, writeOut,
}
