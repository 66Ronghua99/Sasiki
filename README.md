# Sasiki

> TALK IS CHEAP, SHOW ME YOUR MOVES. Observe user actions, automatically generate reusable workflow agents

Sasiki (Japanese "摩す" - to imitate, to copy) is a browser automation framework that records user interactions and generates reusable automation workflows through AI-powered skill generation and execution.

## Core Concept

**Demonstrate once, AI learns your workflow**

No code writing, no requirement descriptions needed. Just work normally, and Sasiki will automatically learn and generate reusable workflows for you.

## Current Focus

- Browser recording (Chrome Extension) + Element fingerprinting
- Python Agent Service (WebSocket)
- Skill generation (YAML)
- Playwright execution engine

Screen recording approach has been deprecated and removed from the codebase.

## Quick Start

### Installation

```bash
# Option 1: Using pip (recommended)
pip install -e ".[dev]"

# Option 2: Using uv
uv pip install -e ".[dev]"
```

After installation, the `sasiki` CLI tool will be available:

```bash
# Show help
sasiki --help

# List saved workflows
sasiki list

# Show workflow details
sasiki show "Contract Drafting"
```

### Configure API Key

```bash
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY
```

## Browser Recording Guide

Sasiki can record user actions in the browser through a Chrome extension, automatically generating reusable workflows.

### 1. Build and Load Extension

```bash
# Build extension and copy to root extension/ folder
./build_extension.sh          # macOS/Linux
# or
.\build_extension.ps1         # Windows
```

Then load the extension in Chrome:

1. Open Chrome and visit `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `extension/` folder in the project root

### 2. Start Recording Service

```bash
# Terminal 1: Start WebSocket server
sasiki server start

# Terminal 2: Start recording session
sasiki record --name "my-task"
```

### 3. Perform Browser Actions

Execute the actions you want to record in Chrome:

| Action Type | Example                       | Description                               |
| ----------- | ----------------------------- | ----------------------------------------- |
| Click       | Click buttons, links, cards   | Automatic element fingerprinting          |
| Type        | Enter text in search boxes    | Supports native input and contenteditable |
| Select      | Dropdown menu selection       | Records option value                      |
| Scroll      | Infinite scroll loading       | Smart content loading detection           |
| Navigate    | Page navigation, back/forward | Navigation source tracking                |

Recorded event types:

- `click` - Click element
- `type` - Text input (supports `<input>`, `<textarea>`, `<div contenteditable>`)
- `select` - Dropdown selection
- `navigate` - Page navigation
- `scroll_load` - Scroll-triggered content loading (smart detection)

### 4. Stop Recording

Press `Ctrl+C` in the recording terminal. The recording file will be automatically saved to `~/.sasiki/recordings/browser/<name>.jsonl`

### 5. View Recording Results

```bash
# View recording file content
cat ~/.sasiki/recordings/browser/my-task.jsonl

# Pretty print (if jq is installed)
cat ~/.sasiki/recordings/browser/my-task.jsonl | jq
```

### Recording Example: Xiaohongshu Search Task

```bash
# 1. Start the server
sasiki server start

# 2. Start recording in another terminal
sasiki record --name "xhs-search"

# 3. Perform these actions in Chrome:
#    - Visit https://www.xiaohongshu.com
#    - Click the search box
#    - Type "通勤穿搭 春季" (spring commute outfits)
#    - Press Enter
#    - Click "最热" (hottest) filter
#    - Scroll the page
#    - Click a note card to enter details
#    - Click back

# 4. Press Ctrl+C to stop recording
```

## Use Cases

- **Legal Contract Drafting**: Search laws → Organize key points → Generate contract
- **Competitor Price Monitoring**: Visit websites → Extract data → Update spreadsheets
- **Weekly Report Generation**: Extract project data → Organize → Generate report
- **Any repetitive browser work**

## Architecture

```
Record (Chrome Extension) → Generate (Skill) → Execute (Playwright Agent)
```

1. **Recording Layer**: Browser event capture + element fingerprinting
2. **Skill Layer**: LLM merges semantic actions and extracts variables
3. **Execution Layer**: Rule-based candidate matching + LLM decision + Playwright actions
4. **Feedback Layer**: Failure retry and human intervention (planned)

## Reference Implementation

The `src/sasiki/browser/extension/` directory contains the core browser capabilities (axtree, content/background scripts, etc.), which is the foundation of the project roadmap.

## Cost

The current architecture prioritizes text and structured context for decision-making, reducing screenshot and visual token consumption.

## Development Roadmap

See `PROGRESS.md` for details. Current phases:

- ✅ Phase 1: Extension recording pipeline (Completed)
- 🔄 Phase 2: Python Skill generation (In progress)
- 📋 Phase 3: Agent execution engine (Planned)
- 📋 Phase 4: Stability and UX (Planned)

## Documentation

- `PROGRESS.md` - Project progress and detailed documentation
- `AGENTS.md` - Agent development guide
- `Memory.md` - Technical lessons learned and pitfalls

## License

MIT
