---
description: The mutation-replay corpus — hand-authored and escape-derived defect classes /spec:replay injects into a scratch worktree to measure the blind reviewer's real catch rate
---

# Replay Corpus: Mutation Classes

`/spec:replay` (specs/20260819/02-mutation-replay.md, D11) injects one class from this file
into a just-CLEANed spec's tree per run. Each class below is an id `replay.js --record --class`
values must match verbatim, a **recipe** the authoring session follows to produce a
concrete patch, a **leg-invisibility requirement** — the property the recipe must hold so the
mutation reaches the reviewer instead of dying on a red leg — and a **worked example** showing
the shape in miniature. Every recipe binds two things without exception: the mutation sits
inside the *target spec's own File Plan files* (never a file the spec never touched), and it
leaves every leg green **by construction**, not by luck — a class whose recipe cannot reliably
stay leg-invisible is a broken class, not a hard replay run (D11's rationale: a red leg at
verify time records `leg-caught` and is corpus feedback, never a corpus fix-up mid-run).

This corpus is v1, hand-authored rather than escape-derived — the escape ledger holds too
few rows to grow a corpus from (specs/20260819/02-mutation-replay.md D11). It is refreshed at least once per major
pipeline version, and a real escape that reveals a genuinely new blind-spot shape folds in as a
new class rather than as a note on an existing one.

The ledger has since grown enough to derive classes directly: a defect class with `CORPUS_BAR`
(2, `spec/scripts/lib/replay-corpus.js`) or more fleet recurrences on the joined escape count
and no section here is a corpus gap — `fleet-reader.js`'s `escapes.corpusGaps` names it. A gap's
section is authored from the escape's own fix diff, cites its ledger rows (repo · timestamp ·
spec), and lives under `## Derived classes` below as a `### ` heading rather than a `## ` one —
`lib/replay-corpus.js`'s `parseCorpus` reads the grammar: a `## ` heading before the `## Derived
classes` line is hand-authored, a `### ` heading after it is derived. The six hand-authored
classes below stay until a derived class supersedes one by name, at which point the superseded
`## ` heading is replaced by a `### ` heading under the derived region — the id appears once.

## `promise-carried-not-delivered`

**Recipe:** Pick a Decision row in the target spec whose cited AC/test asserts a fact
*adjacent* to the promise rather than the promise itself — e.g. the AC checks a printed
label's shape while the Decision's real promise is a specific value the label wraps. Edit the
code so the promised behavior is quietly dropped, defaulted, or short-circuited while leaving
every literal string/shape the cited test actually inspects untouched.

**Leg-invisibility requirement:** the diff must not touch any expression the cited AC's
assertion evaluates — only the promise the assertion leaves unchecked. If the only way to break
the promise also changes the asserted value, this class doesn't apply to that Decision; pick
another row.

**Worked example:** a Decision promises "leg-caught rows are excluded from the catch-rate
denominator," and its AC only asserts the printed string matches `/catch-rate \d+\/\d+/`.
Mutate the arithmetic to fold leg-caught counts back into the denominator while keeping the
printed format identical — the AC's regex still matches, the suite stays green, and the
promised exclusion silently stops holding. Only a reviewer reading the Decision against the
diff's arithmetic (not the test) catches it — this is the reviewer's measured weak spot
(semantic-residue duty, promise-sweep.js's semantic half).

## `self-consistent-polarity`

**Recipe:** Find a boolean guard and the test assertion that covers it in the same diff region.
Flip the guard's polarity (`>` ↔ `<=`, drop/add a `!`) **and** flip the covering assertion's
polarity on the same fixture value, in lockstep, so the pinned test still passes against the
inverted behavior.

**Leg-invisibility requirement:** the guard and its assert must be mutated as a matched pair —
an isolated single-line flip fails the pinned assertion and the mutation dies on the gate before
it ever reaches a reviewer. Both sides move together or the class doesn't fire. The pair spans
whichever File Plan files its two sites actually live in: two files on a stack that keeps tests
apart from the code they cover, or one file on a stack that co-locates them (Rust's
`#[cfg(test)] mod tests`, Elixir, a doctest beside the function it documents) — the recipe binds
the pair, not a file count.

**Worked example:** a rate limiter's `if (attempts >= limit) return reject()` flipped to
`if (attempts < limit) return reject()`, paired with its test's `assert(rejected === true)`
flipped to `assert(rejected === false)` against the same fixture value. Suite green; the limiter
now rejects everyone under the limit and admits everyone over it.

## `silent-fallback`

**Recipe:** Locate a path that currently throws, exits non-zero, or refuses on a condition the
spec forbids, and replace the throw/refusal with a defaulted value that lets execution continue
silently. Choose a condition no pinned test drives with the exact malformed input that should
trigger it.

**Leg-invisibility requirement:** the pinned tests must only ever exercise this path's
happy-path input — none of them constructs the specific bad input the throw guarded against, so
removing the throw changes zero observed test outcomes.

**Worked example:** a script's `--tokens` argument is spec'd to exit 2 on a non-numeric value;
mutate the parse to default to `0` and continue instead of exiting. Every pinned AC only ever
passes a well-formed `--tokens 4200`, so the suite stays green; only a hand-crafted malformed
probe (or a reviewer reading the spec's exit-code contract against the diff) reveals the
fallback.

## `boundary-shift`

**Recipe:** Find a spec'd inclusive/exclusive numeric bound stated with a literal worked
example, whose test coverage exercises only an interior value (never the exact edge). Shift the
comparison operator by one at that bound (`>=` → `>`, `<=` → `<`) so behavior at the untested
edge value inverts.

**Leg-invisibility requirement:** the tested interior value's outcome must be unaffected by the
shift — only the untested boundary value's outcome may change, and no pinned test may probe
exactly that value.

**Worked example:** a pagination limit spec'd as `page_size <= 100` (inclusive), with pinned
tests only at `page_size = 1` and `page_size = 50`. Shift the comparison to `page_size < 100` so
a request for exactly 100 items is silently rejected — the pinned tests never construct the
boundary value, so the suite stays green while the spec'd inclusive bound quietly becomes
exclusive.

## `dead-wiring`

**Recipe:** Find a flag/config key that is still parsed, validated, and accepted without error,
but sever the site that reads it at runtime — the value is captured and never consulted, so the
flag becomes a silent no-op. The severed value must land in a consumed-but-ignored sink (a
variable read once for something else, a destructured field passed on unread, a logged-but-unused
capture) — never a stranded local nothing else touches, which a compiled or strict-lint host's
unused-variable/unused-binding check would flag on its own gate before a reviewer ever runs.

**Leg-invisibility requirement:** the flag's only pinned coverage must be a parse/shape
assertion (it exists, it doesn't error) rather than an assertion on its runtime *effect* — the
config-promise class this repo's Rules already name as "verified by executing the path," so
pick a flag no pinned test executes end-to-end with a non-default value set.

**Worked example:** a `--skips <file>` argument's parsing and validation stay intact and the
CLI still exits 0 on it, but the loop that would have consulted the file to attribute skipped
tests is deleted — skip attribution silently reverts to its pre-flag behavior. Only a test that
actually sets the flag with real skip data and inspects the attribution result would catch it.

## `doc-contract-lie`

**Recipe:** Find a header/doc comment claim — an exit code, an output format, a "never does X"
line — and change the code's actual behavior to contradict it, without touching the doc line
itself. Docs and comments carry no test by construction (pipeline Test Rules: "regexes over
prose are not tests").

**Leg-invisibility requirement:** pick a claim whose only pinned coverage is the happy path's
exit-0 behavior — no pinned test asserts the specific exit code or format the doc claims for the
path being mutated.

**Worked example:** a script's header states `Exit codes: 3 = safety refusal`, but the refusal
branch is changed to exit `1` instead; the header text is left untouched (still claims `3`).
Every pinned test only asserts the happy-path's exit `0`, so the suite stays green while the
script's own documented contract and its real behavior now disagree — only a reviewer or a
targeted exit-code probe on the refusal branch catches the lie.

## Derived classes

### `prefix-collision-coverage-fail-open`

**Derived from:** claude-plugins escape rows × 4 (specs 20260808/01, 20260813/03, 20260815/01,
20260816/01 — `preventedBy: enforcer`); fix specs/20260821/03 D7 (`acIdOccurs`).

**Recipe:** Find an identifier match that is full-token today — a boundary-checked helper
(`acIdOccurs`-style), an `===` on a key, an anchored regex — at a call site inside the target
spec's File Plan files, whose pinned fixtures never contain a shorter id that is a prefix of a
longer one. Loosen it to a bare substring test (`includes`, `indexOf(...) !== -1`,
`startsWith`) so a shorter id matches inside a longer sibling. Mutate a call site, never the
helper's own unit test.

**Leg-invisibility requirement:** every pinned fixture the loosened site reads must be
prefix-free (ids of equal length, or fewer than ten per namespace), so the substring match
returns byte-identical results on every fixture and the suite stays green; the only failing
input is a prefix-colliding pair no pinned test constructs. If the target's fixtures already
carry `-1` beside `-12`, this class does not apply to that site — pick another.

**Worked example (the real escape):** `ac-matrix.js` attributed an AC to a test file with
`readTestFile(f).includes(b.id)`, so `AC-20260808-01-1` matched inside `AC-20260808-01-12`
and the `uncovered-ac` hard finding was suppressed — four ACs across 78 specs reported covered
with no test anywhere, and every review passed. Caught only by a paired-fixture probe (`-2`
beside `-12`); the intended catch is a reviewer reading the coverage grep against the AC-ID
grammar rather than trusting the green matrix.

### `server-code-in-client-bundle`

**Derived from:** one host's escape rows × 2 (specs 20260816/04 `src/lib/photo-fns.ts`,
20260824/02 `src/lib/telegram-link-fns.ts` — `preventedBy: review-check` / `runtime-leg`);
the structural fix and that host's enforcement spec 20260826/01 (`clientBoundaryPlugin`).

**Recipe:** Find a module in the target spec's File Plan that top-level-imports the db client
(or any server-only dependency: `pg`, `drizzle-orm`, `node:` builtins, the env loader) and
exports only server functions or route handlers today. Add one plain, pure export beside them
— a message constant, a tiny status mapper, a "get or not-found" helper — and import that
export from a client-rendered module (a route component, a view-model). The mutation is the
import edge, not the helper: the helper is correct and its unit test stays green.

**Leg-invisibility requirement:** the host must serve dev traffic unbundled (Vite-style per-
module ESM), so typecheck, lint, unit tests, and a dev-server smoke all pass — the server
dependency only reaches the browser in the production bundle, and only crashes when a leaked
module evaluates something browser-hostile at load (a `Buffer` reference, a `process.env`
read). If the host's gate already runs a production build with a client-boundary check
(the originating host does since 20260826/01), this class does not apply to that host — pick another.

**Worked example (the real escape):** `photo-fns.ts` exported `finalizeStagedPhotos` as a
plain function for a sibling spec's `createWomanFn` to call; a client screen imported a
message constant from the same module, which retained `drizzle → pg` in the client chunk.
The telegram schema's bigint column then pulled pg's bytea parser, whose module-eval `Buffer`
reference killed hydration on every screen of the production build while all gate legs
stayed green (144 leaked module ids at the pre-fix commit). The intended catch is a reviewer
tracing each client import back to its module's top-level imports rather than trusting a
green dev-server smoke; the mechanized catch is a production-build leg that fails on server
module ids reaching a client chunk.
