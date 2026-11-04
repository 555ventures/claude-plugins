#!/usr/bin/env bash
# UserPromptSubmit gate: `/spec:run <spec>` on a draft spec, or on one still carrying
# `[NEEDS CLARIFICATION:` markers, is refused (exit 2, remedy on stderr). Every other prompt,
# and any parse error or unreadable spec, passes (fail-open: never wedge the session).
command -v node >/dev/null 2>&1 || exit 0
exec node -e '
const fs = require("fs"), path = require("path")
try {
  const j = JSON.parse(fs.readFileSync(0, "utf8"))
  const m = /^\s*\/spec:run\s+(\S+)/.exec(String(j.prompt || ""))
  if (!m || m[1].startsWith("--")) process.exit(0)
  const rel = m[1].replace(/^@/, "")
  const file = path.resolve(j.cwd || process.cwd(), rel)
  const text = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n")
  const fm = /^---\n([\s\S]*?)\n---/.exec(text)
  const draft = !!fm && /^status:\s*["\x27]?draft\b/m.test(fm[1])
  const markers = (text.slice(fm ? fm[0].length : 0).match(/\[NEEDS CLARIFICATION:/g) || []).length
  if (!draft && !markers) process.exit(0)
  const why = draft ? "is still a draft" : `still has ${markers} [NEEDS CLARIFICATION:] marker(s)`
  process.stderr.write(`spec: ${rel} ${why} — finish and lock it with /spec:plan ${rel}, then /spec:run it\n`)
  process.exit(2)
} catch { process.exit(0) }
'
