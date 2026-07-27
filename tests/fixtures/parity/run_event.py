"""Wire-mirror contract record (PEP 8: module snake_case, class PascalCase)."""


class RunEvent:
    def __init__(self, runId: str, entryPx: float) -> None:
        self.runId = runId
        self.entryPx = entryPx
