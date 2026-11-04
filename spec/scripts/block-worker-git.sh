#!/usr/bin/env bash
# PreToolUse guard (matcher Bash): inside a lane worktree — its private git dir carries the
# `spec-lane-open` marker that run.js / fanout write — builder and reviewer agents may not run git
# commit/push/merge/rebase/reset/checkout. The driver commits and merges; a node process it spawns
# is not a Bash tool call, so the driver itself is never blocked.
# The command is tokenized in node (quotes, escapes, ; && || | ( ) $( ) and newlines), so quoted
# paths with spaces, `cd <dir> && git …` chains, `git -C <dir>` and `bash -c "…"` are all seen.
# Fail-open: no marker, cwd outside a repo, unparseable input, or no node all allow.
# Exit 0 allow · 2 block (BLOCKED: line on stderr).
set -u
command -v node >/dev/null 2>&1 || exit 0
parsed="$(node -e '
const path = require("path")
const BLOCK = new Set(["commit", "push", "merge", "rebase", "reset", "checkout"])
function tokens(cmd) {
  const out = []; let cur = null; let i = 0
  const push = () => { if (cur !== null) { out.push({ w: cur }); cur = null } }
  while (i < cmd.length) {
    const c = cmd[i]
    if (c === "\x27") { const j = cmd.indexOf("\x27", i + 1); const e = j < 0 ? cmd.length : j; cur = (cur || "") + cmd.slice(i + 1, e); i = e + 1; continue }
    if (c === "\"") {
      let j = i + 1, v = ""
      while (j < cmd.length && cmd[j] !== "\"") { if (cmd[j] === "\\" && j + 1 < cmd.length) { v += cmd[j + 1]; j += 2 } else v += cmd[j++] }
      cur = (cur || "") + v; i = j + 1; continue
    }
    if (c === "\\" && i + 1 < cmd.length) { if (cmd[i + 1] !== "\n") cur = (cur || "") + cmd[i + 1]; i += 2; continue }
    if (c === "$" && cmd[i + 1] === "(") { push(); out.push({ op: "$(" }); i += 2; continue }
    if (/[;&|()`\n]/.test(c)) { push(); out.push({ op: c }); i++; continue }
    if (/\s/.test(c)) { push(); i++; continue }
    cur = (cur || "") + c; i++
  }
  push()
  return out
}
// Walks simple commands in order; cd moves the directory later -C / cd targets resolve against.
function scan(cmd, dir, dirs, verbs, depth) {
  let words = []
  const flush = () => {
    let w = words; words = []
    while (w.length && (/^[A-Za-z_]\w*=/.test(w[0]) || ["env", "command", "exec", "time", "nohup", "sudo", "builtin"].includes(w[0]))) w = w.slice(1)
    if (!w.length) return
    const prog = path.basename(w[0])
    if (w[0] === "cd" || w[0] === "pushd") {
      const t = w.slice(1).find((x) => !/^-[LPe@]$/.test(x))
      if (t && t !== "-") { dir = path.resolve(dir, t.replace(/^~(?=\/|$)/, process.env.HOME || "~")); dirs.push(dir) }
    } else if (prog === "git") {
      let d = dir
      for (let k = 1; k < w.length; k++) {
        const a = w[k]
        if (a === "-C" && w[k + 1] !== undefined) { d = path.resolve(d, w[++k]); dirs.push(d) }
        else if (a === "-c" || a === "--git-dir" || a === "--work-tree" || a === "--namespace") k++
        else if (a.startsWith("-")) continue
        else { verbs.push(a); break }
      }
    } else if (["bash", "sh", "zsh", "dash"].includes(prog) && depth < 3) {
      const k = w.findIndex((x, n) => n > 0 && /^-[a-z]*c[a-z]*$/.test(x))
      if (k > 0 && w[k + 1] !== undefined) dir = scan(w[k + 1], dir, dirs, verbs, depth + 1)
    } else if (prog === "eval" && depth < 3) dir = scan(w.slice(1).join(" "), dir, dirs, verbs, depth + 1)
  }
  for (const t of tokens(cmd)) { if (t.op) flush(); else words.push(t.w) }
  flush()
  return dir
}
try {
  const j = JSON.parse(require("fs").readFileSync(0, "utf8"))
  const cwd = j.cwd || process.cwd()
  const cmd = String((j.tool_input || {}).command || "")
  const dirs = [cwd], verbs = []
  scan(cmd, cwd, dirs, verbs, 0)
  const hit = verbs.find((v) => BLOCK.has(v))
  if (hit) process.stdout.write(hit + "\n" + [...new Set(dirs)].join("\n"))
} catch {}' 2>/dev/null)" || exit 0
[ -n "$parsed" ] || exit 0
verb="${parsed%%$'\n'*}"

gd=""
while IFS= read -r d; do
  [ -n "$d" ] || continue
  g="$(git -C "$d" rev-parse --absolute-git-dir 2>/dev/null)" || continue
  if [ -f "$g/spec-lane-open" ]; then gd="$g"; break; fi
done < <(printf '%s\n' "${parsed#*$'\n'}")
[ -n "$gd" ] || exit 0

{
  echo "BLOCKED: git $verb inside a spec lane worktree (${gd%/.git*}) — agents never run git here; /spec:run commits and merges at its own steps."
  echo "  stale marker (no run in flight)? remove $gd/spec-lane-open"
} >&2
exit 2
