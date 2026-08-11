#!/usr/bin/env node
'use strict'
// lock.js — a pidfile lock so two autopilotd processes can never drive one repo at once
// (specs/20260810/05-service-bootstrap.md D5). Under `Restart=always` a debug daemon left
// running in tmux beside the installed service is an easy accident; two lanes over one repo
// means two SDK sessions writing the same worktree.
//
// acquireLock({stateDir, pid, killImpl, fsImpl}): real O_EXCL via `fs.writeFileSync(path, pid,
//   {flag: 'wx'})` — a second `wx` write throws EEXIST. On EEXIST, branch on the existing pid's
//   liveness by ERROR CODE, never any-throw: `killImpl(pid, 0)` succeeding, or throwing EPERM
//   (a live foreign-user process), means alive → throw LockError carrying that pid. Throwing
//   ESRCH means stale → unlink then a FRESH `wx` write; if that second write also throws EEXIST,
//   a racing starter won the recovery and this process must never overwrite its lock — throw
//   LockError instead of an unconditional rewrite (the TOCTOU this module exists to close).
// releaseLock({stateDir, pid, fsImpl}): removes the lockfile only if it still holds THIS pid —
//   a stale/foreign lock is never touched by a process that doesn't own it.
//
// Deliberately does NOT: retry, poll, or wait for a live lock to free up (the caller — bin/
// autopilotd — exits 2 immediately and names the remedy); treat same-user pid reuse racing the
// ESRCH check as anything but accepted residual risk on a single-user box (D5); touch the lock
// during `autopilotd --check` (preflight must run beside a live daemon — bin/autopilotd never
// calls acquireLock on that path).
//
// Exit codes: n/a — library module; bin/autopilotd owns exit-code rendering for LockError.

const fs = require('fs')
const path = require('path')

const LOCK_FILENAME = 'autopilotd.lock'

class LockError extends Error {
  constructor(message, pid) {
    super(message)
    this.pid = pid
  }
}

function lockPathFor(stateDir) {
  return path.join(stateDir, LOCK_FILENAME)
}

function readLockPid(fsImpl, lockPath) {
  return Number(fsImpl.readFileSync(lockPath, 'utf8'))
}

// A4 (executed 2026-08-10): kill(pid, 0) throws ESRCH for dead pids, EPERM for live
// foreign-user pids, and succeeds (no throw) for live same-user ones. Only ESRCH is stale.
function isAlive(killImpl, pid) {
  try {
    killImpl(pid, 0)
    return true
  } catch (err) {
    if (err.code === 'EPERM') return true
    if (err.code === 'ESRCH') return false
    throw err
  }
}

function acquireLock({ stateDir, pid, killImpl = process.kill, fsImpl = fs }) {
  const lockPath = lockPathFor(stateDir)

  try {
    fsImpl.writeFileSync(lockPath, String(pid), { flag: 'wx' })
    return { acquired: true }
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
  }

  const existingPid = readLockPid(fsImpl, lockPath)
  if (isAlive(killImpl, existingPid)) {
    throw new LockError(
      `autopilotd: another daemon is already running (pid ${existingPid}) — stop it first ` +
      `(kill ${existingPid}) or, if that's stale, remove ${lockPath}`,
      existingPid
    )
  }

  // Stale (ESRCH): unlink then retake via a fresh wx write. A second EEXIST here means a
  // racing starter won the recovery — throw, never overwrite (D5's TOCTOU close). The racer's
  // own write can already be gone by the time we look (it may have been claimed and released
  // in the same instant) — naming its pid is best-effort, not required to throw correctly.
  fsImpl.unlinkSync(lockPath)
  try {
    fsImpl.writeFileSync(lockPath, String(pid), { flag: 'wx' })
  } catch (err) {
    if (err.code !== 'EEXIST') throw err
    let racingPid
    try {
      racingPid = readLockPid(fsImpl, lockPath)
    } catch {
      racingPid = undefined
    }
    throw new LockError(
      `autopilotd: another daemon won the startup race${racingPid ? ` (pid ${racingPid})` : ''} — exiting`,
      racingPid
    )
  }
  return { acquired: true }
}

function releaseLock({ stateDir, pid, fsImpl = fs }) {
  const lockPath = lockPathFor(stateDir)
  let existing
  try {
    existing = fsImpl.readFileSync(lockPath, 'utf8')
  } catch {
    return
  }
  if (Number(existing) !== pid) return
  try {
    fsImpl.unlinkSync(lockPath)
  } catch {
    // already gone — nothing left to clean up
  }
}

module.exports = { acquireLock, releaseLock, LockError, LOCK_FILENAME }
