'use strict'
// lib/close-tree-drift.js — measureDrift(opts) → { total, binary, files, skipped }, the ONE tally
// behind the review driver's close-tree drift refusal: added + deleted lines of the committed
// close tree (`HEAD`) against the judged tree, overlay paths excluded.
// Any counted line or binary change is drift; the driver refuses it.
// Owner: specs/20261024/06-close-tree-equals-judged-tree.md
// Deliberately does NOT decide the verdict, tune a threshold, or write anything.
//
// The judged tree is a working-tree snapshot (tracked edits AND untracked files — an uncommitted
// fix's brand-new test file must count), never a commit. That same snapshot also swallows files
// the reviewer's own legs leave behind: a host's build or story output that it never gitignored.
// The dirty-tree check then forces the session to clean those files before closing, and a plain
// diff would count every one of them as deleted lines. The rule that separates the two: a
// path counts only when it is tracked on at
// least one committed side — the judged commit (`judgedCommit`, the close row's diff.head) or
// HEAD. A path in neither commit was never part of the reviewed change, so its disappearance is
// not drift; it is reported under `skipped` so the driver can print what it ignored. A new file
// a fix adds is in HEAD and counts; a tracked file a fix deletes is in the judged commit and
// counts; junk the session COMMITTED is in HEAD and counts, which is the check doing its job.
// One more tracked side: `alsoTracked`, the paths the fix rounds touched (the driver's fix-delta
// lists). A new file an uncommitted hard fix created is in the snapshot and in neither commit;
// without this it would be skipped as junk and a close commit could delete reviewed code unseen.
//
// opts: { repoRoot, judgedTree (40-hex tree sha), judgedCommit (40-hex commit sha or null),
//         alsoTracked (repo-relative paths that count even when in neither commit; optional),
//         excludes (repo-relative paths/prefixes, each becomes a `:(exclude)` pathspec),
//         run (cmd, args, spawnOpts, label) → spawnSync result — the caller's runChild }
// Returns { total: number, binary: boolean, files: string[] (counted), skipped: string[] }.
// Throws Error on a failing `git diff`; the caller decides how to die.
//
// Exit codes: n/a (library, not an entrypoint).

function listTracked(run, repoRoot, ref) {
  if (!ref) return new Set()
  const r = run('git', ['-C', repoRoot, 'ls-tree', '-r', '--name-only', '-z', ref],
    { encoding: 'utf8' }, 'git ls-tree (paths tracked at ' + ref.slice(0, 7) + ')')
  if (r.status !== 0) return new Set()
  return new Set(r.stdout.split('\0').filter(Boolean))
}

function measureDrift({ repoRoot, judgedTree, judgedCommit, alsoTracked, excludes, run }) {
  const r = run('git', ['-C', repoRoot, 'diff', '--numstat', '--no-renames', '-z', judgedTree, 'HEAD', '--', '.',
    ...(excludes || []).map((p) => ':(exclude)' + p)], { encoding: 'utf8' }, 'git diff --numstat (close tree drift)')
  if (r.status !== 0) {
    throw new Error('git diff --numstat ' + judgedTree + ' HEAD failed (' + (r.stderr || r.stdout).trim() + ')')
  }
  const tracked = listTracked(run, repoRoot, judgedCommit)
  for (const p of listTracked(run, repoRoot, 'HEAD')) tracked.add(p)
  for (const p of alsoTracked || []) tracked.add(p)
  let total = 0
  let binary = false
  const files = []
  const skipped = []
  // -z: `<add>\t<del>\t<path>\0` per entry; paths with special characters arrive unquoted.
  for (const entry of r.stdout.split('\0')) {
    if (!entry.trim()) continue
    const [add, del, ...rest] = entry.split('\t')
    const file = rest.join('\t')
    if (!tracked.has(file)) { skipped.push(file); continue }
    files.push(file)
    if (add === '-' && del === '-') binary = true
    else total += Number(add) + Number(del)
  }
  return { total, binary, files, skipped }
}

module.exports = { measureDrift }
