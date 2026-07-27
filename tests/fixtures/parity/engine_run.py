"""Internal engine code: snake_case locals constructing camelCase wire records."""

from .run_event import RunEvent


def build(rows):
    events = []
    for row in rows:
        entry_px = row["px"]
        run_id = row["id"]
        events.append(RunEvent(runId=run_id, entryPx=float(entry_px)))
    return events
