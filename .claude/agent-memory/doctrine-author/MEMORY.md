# Memory index

- [shared.md vs core.md](repo_naming_shared_vs_core.md) — this repo's doctrine file is core.md; "shared.md" in my own agent prompt is stale, verify with ls first
- [Pinned-sentence hard-wrap trap](feedback_pinned_sentence_hardwrap.md) — a markdown line-wrap inside a verbatim-pinned phrase breaks single-line regex pins; grep the literal after writing
- [citations-check: word before §](feedback_citations_check_word_before_section.md) — the word immediately before `§` can coincidentally match another doctrine file's basename (e.g. "design"), causing a false MISS; reword, don't touch the checker
- [shared-for scope + read-load margin](feedback_shared_for_scope_and_readload_margin.md) — shared-for only pulls core.md/design.md sections, never mocks.md/genesis.md; check margin via `spec-paths shared-for <cmd> | wc -l` before editing
