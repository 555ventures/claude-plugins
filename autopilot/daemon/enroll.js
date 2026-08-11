#!/usr/bin/env node
'use strict'
// enroll.js — enroll({hubUrl, code, machineName, projects, reposRoot, force, configPath,
// fetchImpl, now}): exchange a one-time enrollment code for a spoke identity against the
// deployed autopilot-hub (specs/20260808/01-autopilot-enroll.md D1). Order: refusal check (D5,
// before any network) → POST exchange (D10) → validate the 201 body has non-empty
// spokeId/token → atomic 0600 persistence (D4). Resolves { spokeId, machineName, projectCount,
// configPath }; rejects an EnrollError { message, exitCode } (1 or 2, D7). No process.exit, no
// console — bin/autopilot owns rendering (config.js precedent: pure library, CLI owns argv +
// exit rendering). `reposRoot` is optional (specs/20260810/03-repo-discovery.md D6):
// bin/autopilot resolves --repos-root discovery BEFORE calling enroll() and passes the resolved
// root through to persist into hub.json; omitted, JSON.stringify drops the key so plain `enroll`
// stays byte-identical (AC-20260810-03-11) — this module never runs discovery itself.
//
// Deliberately does NOT: normalize or trailing-slash-strip --hub (D8, verbatim), validate
// --project values client-side (the hub owns that), retry on network failure, ever print or
// log the clear token (D6 — the token appears ONLY inside the written hub.json), run repo
// discovery (bin/autopilot does that, before any network call, per D6).
//
// Exit codes: n/a — library module; see autopilot/bin/autopilot for the CLI exit-code wiring
// (EnrollError.exitCode carries the intended exit: 1 exchange failed, 2 usage/precondition).

const fs = require('fs')
const os = require('os')
const path = require('path')

const { atomicWrite } = require('./atomic')

const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.config', 'autopilot', 'hub.json')
const ENROLL_PATH = '/api/spokes/enroll'
const REQUEST_TIMEOUT_MS = 30000

class EnrollError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.exitCode = exitCode
  }
}

// D5: refuse BEFORE any network call so a refusal never burns a code. --force re-enrolls.
function assertNoExistingConfig(configPath, force) {
  if (force) return
  if (fs.existsSync(configPath)) {
    throw new EnrollError(
      `autopilot enroll: ${configPath} already exists — pass --force to re-enroll ` +
      `(this mints a NEW spoke identity on the hub)`,
      2
    )
  }
}

// D9: the contract capability check — bin/autopilot performs the require() and wraps this in
// try/catch per D9; enroll.js takes the already-resolved contractVersion as a parameter so this
// module never itself requires the .ts contract copy (kept out of the library's DI surface).

// D7 fixed error strings, keyed by hub error `code`. Falls through to the generic render
// (Behavior: "hub answered <status> <code> — <message>") for anything else (403, 5xx, future
// codes).
function fixedErrorMessage(status, body) {
  if (status === 401) {
    return 'code invalid, already used, or expired — get a fresh one with /enroll in Telegram'
  }
  if (status === 400 && body && body.code === 'contract_version_unsupported') {
    return (
      `stale contract copy — update the autopilot plugin (hub contract is newer than this ` +
      `machine's copy)`
    )
  }
  if (status === 400 && body && body.code === 'validation_failed') {
    return body.message
  }
  if (status === 409 && body && body.code === 'conflict') {
    return (
      'machine name already registered on the hub — retry with --machine-name ' +
      '<a different name> (same code is still valid)'
    )
  }
  return null
}

async function exchange({ hubUrl, code, contractVersion, machineName, projects, fetchImpl }) {
  const url = hubUrl + ENROLL_PATH
  const body = JSON.stringify({ code, contractVersion, machineName, projects })

  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (err) {
    const cause = err && err.cause
    const detail = cause && cause.code ? cause.code : (cause && cause.message) || err.message
    throw new EnrollError(`autopilot enroll: could not reach ${hubUrl} — ${detail}`, 1)
  }

  const text = await response.text()
  if (response.ok) {
    let parsed
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new EnrollError(
        `autopilot enroll: hub answered ${response.status} but the response is not valid JSON`,
        1
      )
    }
    return parsed
  }

  let parsedBody = null
  try {
    parsedBody = JSON.parse(text)
  } catch {
    // unparseable/JSON-less body falls through to the generic render below
  }

  if (!parsedBody) {
    throw new EnrollError(
      `autopilot enroll: hub answered ${response.status} — ${text.slice(0, 200)}`,
      1
    )
  }

  const fixed = fixedErrorMessage(response.status, parsedBody)
  if (fixed) {
    throw new EnrollError(`autopilot enroll: ${fixed}`, 1)
  }

  throw new EnrollError(
    `autopilot enroll: hub answered ${response.status} ${parsedBody.code} — ${parsedBody.message}`,
    1
  )
}

// D4: same-dir temp file (mode 0600) then rename — no partial file, mode survives rename
// (POSIX). Directory created {recursive: true, mode 0o700}; a pre-existing dir keeps its
// current mode (mkdirSync never chmods — the file's 0600 is the security boundary). Mechanics
// live in atomic.js (shared with service.js/bootstrap.js); this wrapper only fixes the mode and
// dirMode this call site has always used.
function writeConfigAtomic(configPath, data) {
  atomicWrite(configPath, JSON.stringify(data, null, 2), { mode: 0o600, dirMode: 0o700 })
}

// enroll({hubUrl, code, machineName, projects, reposRoot, force, configPath, fetchImpl, now})
//   → resolves { spokeId, machineName, projectCount, configPath }
//   → rejects EnrollError { message, exitCode }
async function enroll({
  hubUrl,
  code,
  contractVersion,
  machineName,
  projects,
  reposRoot,
  force,
  configPath = DEFAULT_CONFIG_PATH,
  fetchImpl = fetch,
  now = () => new Date(),
}) {
  assertNoExistingConfig(configPath, force)

  const result = await exchange({ hubUrl, code, contractVersion, machineName, projects, fetchImpl })

  if (!result || !result.spokeId || !result.token) {
    throw new EnrollError(
      'autopilot enroll: hub answered 201 but the response is missing spokeId/token',
      1
    )
  }

  const enrolledAt = now().toISOString()
  writeConfigAtomic(configPath, {
    hubUrl,
    spokeId: result.spokeId,
    token: result.token,
    machineName,
    projects: result.projects || [],
    reposRoot,
    contractVersion: result.contractVersion,
    enrolledAt,
  })

  return {
    spokeId: result.spokeId,
    machineName,
    projectCount: (result.projects || []).length,
    configPath,
  }
}

module.exports = { enroll, EnrollError, DEFAULT_CONFIG_PATH, writeConfigAtomic }
