'use strict'
// lib/util.js — the one-line helpers several scripts share, kept in one place so no script
// carries its own copy: isObj, escapeRegExp, relPosix, readJsonSafe.
//
// What this deliberately does NOT do: hold anything with a domain meaning (ledger, config,
// queue) — those live in their own lib modules.
//
// Exit codes: n/a (library, not an entrypoint) — never exits.

const fs = require('fs')
const path = require('path')

// A plain object: not null, not an array.
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

// Escape every RegExp metacharacter so `s` matches literally.
function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// `abs` relative to `root`, forward-slash separated on every platform.
function relPosix(root, abs) {
  return path.relative(root, abs).split(path.sep).join('/')
}

// Parsed JSON at `p`, or null when the file is missing or not valid JSON.
function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {
    return null
  }
}

module.exports = { isObj, escapeRegExp, relPosix, readJsonSafe }
