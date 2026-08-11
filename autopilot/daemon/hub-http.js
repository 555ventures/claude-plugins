#!/usr/bin/env node
'use strict'
// hub-http.js — shared spoke→hub HTTP helpers extracted from wrapup.js (D7,
// specs/20260810/03-repo-discovery.md): discover.js is the second consumer, so the seam earns
// its own file. Behavior is byte-identical to wrapup.js's prior in-file versions (A4) — moved,
// not rewritten.
//
// postJson({url, token, authScheme, body, fetchImpl}): POST + one retry on a thrown fetch
//   (network failure/timeout, at-least-once is safe when the caller's dedupe key survives the
//   retry); a non-2xx answer is terminal (retrying a rejected request can't succeed).
// mintEventId(nowMs, randomBytesImpl): 26-char Crockford ULID (10 time chars + 16 random).
// readCredential(configPath): parse hub.json, return null unless hubUrl+token are both present.
//
// Deliberately does NOT: retry a non-2xx response, persist or cache credentials, log or print
// anything (silent library — every consumer owns its own rendering).
//
// Exit codes: n/a — library module; consumers own exit-code rendering.

const crypto = require('crypto')
const fs = require('fs')

const REQUEST_TIMEOUT_MS = 10000

class HubHttpError extends Error {}

// ULID (Crockford base32, 26 chars: 10 time + 16 random). byte % 32 is unbiased (256 = 8·32).
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
function mintEventId(nowMs = Date.now(), randomBytesImpl = crypto.randomBytes) {
  const chars = new Array(26)
  let t = nowMs
  for (let i = 9; i >= 0; i--) {
    chars[i] = CROCKFORD[t % 32]
    t = Math.floor(t / 32)
  }
  const random = randomBytesImpl(16)
  for (let i = 0; i < 16; i++) {
    chars[10 + i] = CROCKFORD[random[i] % 32]
  }
  return chars.join('')
}

function readCredential(configPath) {
  let parsed
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return null
  }
  if (!parsed || !parsed.hubUrl || !parsed.token) return null
  return parsed
}

// One retry on a thrown fetch (network failure/timeout) — at-least-once is safe, eventId
// dedupes hub-side. A non-2xx answer is terminal: retrying a rejected request can't succeed.
async function postJson({ url, token, authScheme, body, fetchImpl }) {
  const attempt = () =>
    fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `${authScheme} ${token}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  let response
  try {
    response = await attempt()
  } catch {
    try {
      response = await attempt()
    } catch (err) {
      throw new HubHttpError(`could not reach ${url} — ${err.message}`)
    }
  }
  const text = await response.text()
  if (!response.ok) {
    throw new HubHttpError(`hub answered ${response.status} for ${url}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new HubHttpError(`hub answered ${response.status} for ${url} but the body is not JSON`)
  }
}

module.exports = { postJson, mintEventId, readCredential, HubHttpError }
