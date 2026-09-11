# Deviations — 01-the-page-waits-for-the-server

- D1/D2 name `buildClientIndex` and `buildWalkPage` as the two builders that lose `lang`, but
  `buildThemePage` in the same module also called the deleted `stringsFor` and also received a
  `lang` argument from `design-atlas.js`'s `clientRoute` block. Deleting `stringsFor` and the
  `lang` locals forces the identical edit on that third builder — it now reads `STRINGS`
  directly and takes no `lang`. Forced and unblocking: no behavior changes beyond the
  retirement D1 locks, both files are already File Plan rows, and no Decision is overridden.
- Out-of-plan file, user-approved at build time: `.claude/rules/spec-pipeline.md`. The
  comment-narration gate was already red on `main` at this build's `diff_base` — the escape
  commit `427d4b7` landed the client-page prevention gotcha citing the escape row id
  `escape:claude-plugins:<timestamp>:…`, and the scanner classes that timestamp as a banned
  `date` narration. The build's own gate cannot pass over a red repo-wide check, so the user
  was asked (add to scope / file separately / pause) and chose to fix it in this build. The
  citation now names the spec that escaped and the spec that fixes it, which is the citation
  form every other entry in that section already uses; no prose meaning changed. The scan is
  `0 findings in 331 files`, exit 0. Not this spec's defect — it is a pre-existing failure
  adopted so this build could reach a green gate.
- A6 assumed `specs/20260910/04-theme-before-the-client-walk.md` would still be `implementing`
  in its own worktree, forbidding a concurrent build. It resolved the benign way its "if false"
  branch names: 04 merged to `main` at commit `097ad2a` before this build started and its
  worktree is gone, so this spec built against the merged `main` (`diff_base`
  `427d4b746c3a1dde7ca4eee2c5a660ba5f79cb33`) with no concurrency. The `depends_on` entry for 04
  is left in place as the ordering record it now is; nothing here consumes 04's feature content.
