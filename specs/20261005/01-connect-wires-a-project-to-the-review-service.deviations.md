# Deviations — 01-connect-wires-a-project-to-the-review-service

- An existing settings file whose `env` is present but not an object is refused `bad-settings`
  and never overwritten. D6 names only "not a JSON object"; extended so user data is never clobbered.
- A write failure on the settings or config file is refused `write-failed` (exit 2), remedy:
  run the same command from a plain terminal. This is A8's if-false path given a code; listed in
  the script header, absent from the Contracts table.
- A contract-file read failure is reported under `bad-config`, alongside D11's block-check refusals.
- `spec/commands/connect.md` adds one sentence beyond D12: on a non-zero exit, print the line and
  stop. No judgment or behaviour added.
