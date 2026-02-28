# Copilot Instructions for Sasiki

## Build, test, and lint commands

### Python environment
```bash
# Recommended from project docs
uv sync

# Alternative
pip install -e ".[dev]"
```

### Python tests
```bash
# Full test suite
pytest -q

# Single test file
pytest -q tests/test_workflow_models.py

# Single test case
pytest -q tests/test_config.py::TestSettings::test_default_settings

# Async Phase 1 websocket E2E test (from PROGRESS.md)
PYTHONPATH=src uv run --with pytest --with pytest-asyncio --with websockets pytest -q tests/test_phase1_websocket_flow.py
```

### Linting / formatting / type-checking (Python)
```bash
ruff check .
black .
mypy src
```

### Chrome extension build/type-check
```bash
cd src/sasiki/browser/extension
npm install
npm run build
npm run build:dev
npm run typecheck
```

### Extension build helper scripts
```bash
# From repo root
./build_extension.sh        # macOS/Linux
.\build_extension.ps1       # Windows PowerShell
```

## High-level architecture

Sasiki is a browser-first workflow automation system:

1. **Recording layer (Chrome extension)**  
   `src/sasiki/browser/extension/content.ts` captures browser actions and element fingerprints (`targetHint`), and `background.ts` manages cross-tab recording state + WebSocket forwarding.

2. **Protocol + transport layer (Python WebSocket service)**  
   `src/sasiki/server/websocket_protocol.py` defines typed message/action schemas, and `src/sasiki/server/websocket_server.py` coordinates extension/CLI clients, recording sessions, and persistence.

3. **CLI/service layer**  
   `src/sasiki/cli.py` exposes operational commands (`server start|status`, `record`, workflow commands) and is the main developer/operator entrypoint.

4. **Storage/model layer**  
   Browser recordings are saved as JSONL under `~/.sasiki/recordings/browser/`.  
   Workflow artifacts are modeled in `src/sasiki/workflow/models.py` and stored by `src/sasiki/workflow/storage.py` as YAML + JSON under `~/.sasiki/workflows/<workflow_id>/`.

## Key conventions in this repo

- **Browser-first only**: screen-recording route is deprecated; prioritize extension + event stream path (`README.md`, `PROGRESS.md`).
- **Event payload naming bridge**: extension payloads use camelCase (`sessionId`, `targetHint`, `pageContext`), while Python models support snake_case and camelCase via `pydantic` aliases (`AliasChoices`).
- **Recording file format is JSONL with metadata first**: first line is a metadata object with `"_meta": true`; subsequent lines are action records.
- **Element targeting is fingerprint-based**: execution/recording logic depends on semantic fingerprints (`role/name/tag/context`) rather than stable DOM IDs/ref IDs.
- **Event ordering logic matters**: content script flushes pending input/scroll before click/navigation to preserve replayable sequence.
- **Local runtime state is under `~/.sasiki`**: do not assume recordings/workflows are stored in-repo.
