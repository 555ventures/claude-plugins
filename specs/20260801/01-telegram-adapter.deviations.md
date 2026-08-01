# Deviations — specs/20260801/01-telegram-adapter.md

- [telegram.js] Behavior says the "Other…" tap "edits the question message to say 'reply in
  this topic with your answer'" but the Contracts section's declared Telegram-methods list has
  no editMessageText — → clear the keyboard via editMessageReplyMarkup (empty inline_keyboard)
  instead of editing the message text, staying inside the declared method list.
- [telegram.js] Behavior never states whether multiSelect questions also get an "Other…" row
  (only single-choice is shown in the AC-1/Contracts example) — → multiSelect keyboards omit
  Other… (toggle rows + "✔ Done" only); single-choice keyboards keep options + Other….
- [telegram.js] D7 says free text "hands them to the daemon, which matches them to that topic's
  single pending ask", but only the adapter holds the askButtons promise's resolve/reject
  closures — → the adapter itself resolves an "Other…"-awaiting question on the next onText
  message in that topic (consuming it), and only forwards to the registered onText callback
  when no question is awaiting free text, so the daemon never double-handles the same message.
- [telegram.js] The poll loop hot-spun into an OOM when getUpdates resolves synchronously (no
  real network I/O to pace it, e.g. under a test's injected fetchImpl) — → added an explicit
  macrotask yield (`setImmediate`) at the end of every poll iteration; harmless against the
  real Telegram API where getUpdates already blocks server-side up to pollTimeoutSec.
