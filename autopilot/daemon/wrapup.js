#!/usr/bin/env node
'use strict'
// wrapup.js — relayWrapup({transcriptPath, projectName, verdicts, authScheme, configPath,
// fetchImpl, nowMs, randomBytesImpl}): read a Claude Code transcript's last assistant
// message and, when its first line carries a 🟢/🟡/🔴 verdict (the STYLE.md wrap-up
// contract), relay one `session_wrapup` event to the hub per
// autopilot-hub docs/canonical/spoke-hooks.md § "Session wrap-up Stop hook (brief 06)".
// Order: credential read → transcript parse → payload derivation (skip rules) →
// POST /api/spokes/projects (idempotent, projectId) → POST /api/spokes/report.
// Resolves { skipped: <reason> } for every no-POST outcome and { posted: true, projectId,
// eventId } on success; rejects WrapupError only past the skip gate (network/hub failure) —
// hooks/session-wrapup.js swallows that and exits 0 (a Stop hook must never block).
//
// Deliberately does NOT: require the .ts contract copy itself (the hook entrypoint owns
// that, bin/autopilot D9 precedent — verdicts/authScheme arrive as parameters), best-effort
// POST a malformed verdict line (retainer ruling 2026-08-07: validation failure is a skip),
// log or print anything (silent library; the hook has no user-facing surface), persist any
// state (eventId dedupe lives hub-side). postJson/mintEventId/readCredential moved to
// daemon/hub-http.js (D7, specs/20260810/03-repo-discovery.md — discover.js is the second
// consumer); mintEventId stays re-exported here for existing consumers/tests.
//
// Exit codes: n/a — library module; hooks/session-wrapup.js always exits 0.

const crypto = require('crypto')
const fs = require('fs')

const { DEFAULT_CONFIG_PATH } = require('./enroll')
const { postJson, mintEventId, readCredential } = require('./hub-http')

const PROJECTS_PATH = '/api/spokes/projects'
const REPORT_PATH = '/api/spokes/report'
const SUMMARY_MAX_CHARS = 500

// Spoke-side rendering convention (STYLE.md verdict line / queue verbs) — the hub only
// ever sees the derived verdict word, so these emoji are NOT cross-plane constants.
const EMOJI_VERDICTS = new Map([
  ['🟢', 'green'],
  ['🟡', 'yellow'],
  ['🔴', 'red'],
])
// A queue item is a line whose content (after optional list marker) starts with a queue verb.
const QUEUE_ITEM_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?(?:📋|👤|📌)/u

class WrapupError extends Error {}

// Last assistant message = the last non-sidechain assistant entry with non-empty text
// content (tool_use-only entries and subagent sidechain entries are not the wrap-up).
function lastAssistantText(transcriptPath, fsImpl = fs) {
  let raw
  try {
    raw = fsImpl.readFileSync(transcriptPath, 'utf8')
  } catch {
    return null
  }
  const lines = raw.split('\n')
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].trim()) continue
    let entry
    try {
      entry = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (entry.type !== 'assistant' || entry.isSidechain === true) continue
    const content = entry.message && entry.message.content
    if (!Array.isArray(content)) continue
    const text = content
      .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text)
      .join('\n')
      .trim()
    if (text) return text
  }
  return null
}

// Skip rules are the contract: no verdict emoji on line 1, or an emoji-only line, → null.
// Truncation is by code point (the schema's maxLength counts code points, not UTF-16 units).
function deriveWrapup(messageText) {
  const lines = messageText.split('\n')
  const firstLine = lines[0]
  let verdict = null
  let emoji = null
  for (const [candidate, word] of EMOJI_VERDICTS) {
    if (firstLine.startsWith(candidate)) {
      emoji = candidate
      verdict = word
      break
    }
  }
  if (!verdict) return null
  const summary = Array.from(firstLine.slice(emoji.length).trim())
    .slice(0, SUMMARY_MAX_CHARS)
    .join('')
  if (!summary) return null
  const queueCount = lines.filter((line) => QUEUE_ITEM_RE.test(line)).length
  return { verdict, summary, queueCount }
}

// Mirrors SessionWrapupPayload (autopilot/contract/index.ts) without requiring typebox at
// runtime; `verdicts` is the vendored SESSION_WRAPUP_VERDICTS inventory.
function validatePayload(payload, verdicts) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    verdicts.includes(payload.verdict) &&
    typeof payload.summary === 'string' &&
    payload.summary.length >= 1 &&
    Array.from(payload.summary).length <= SUMMARY_MAX_CHARS &&
    Number.isInteger(payload.queueCount) &&
    payload.queueCount >= 0
  )
}

async function relayWrapup({
  transcriptPath,
  projectName,
  verdicts,
  authScheme = 'Bearer',
  configPath = DEFAULT_CONFIG_PATH,
  fetchImpl = fetch,
  nowMs = () => Date.now(),
  randomBytesImpl = crypto.randomBytes,
}) {
  const credential = readCredential(configPath)
  if (!credential) return { skipped: 'no-credential' }

  const text = lastAssistantText(transcriptPath)
  if (!text) return { skipped: 'no-assistant-text' }

  const payload = deriveWrapup(text)
  if (!payload || !validatePayload(payload, verdicts)) return { skipped: 'no-verdict-line' }

  if (!projectName) return { skipped: 'no-project-name' }

  const { hubUrl, token } = credential
  const project = await postJson({
    url: hubUrl + PROJECTS_PATH,
    token,
    authScheme,
    body: { name: projectName },
    fetchImpl,
  })
  if (!project || !project.projectId) {
    throw new WrapupError('hub project registration answered without a projectId')
  }

  const eventId = mintEventId(nowMs(), randomBytesImpl)
  await postJson({
    url: hubUrl + REPORT_PATH,
    token,
    authScheme,
    body: {
      events: [{ eventId, type: 'session_wrapup', projectId: project.projectId, payload }],
    },
    fetchImpl,
  })

  return { posted: true, projectId: project.projectId, eventId }
}

module.exports = {
  relayWrapup,
  deriveWrapup,
  lastAssistantText,
  validatePayload,
  mintEventId,
  WrapupError,
}
