# Agent Index

## Default Route

1. Load `using-superpowers`.
2. Read `PROGRESS.md`, `NEXT_STEP.md`, `MEMORY.md`, and `.harness/bootstrap.toml`.
3. Route by task type:
   - new workflow or behavior design -> `brainstorming`
   - approved multi-step work -> `writing-plans`
   - implementation in this session -> `executing-plans` or `subagent-driven-development`
   - feature or bugfix coding -> `test-driven-development`
   - runtime failure or regression -> `systematic-debugging`
   - delivery review -> `requesting-code-review`
   - completion claim -> `verification-before-completion`
   - documentation drift or contract sync -> `harness-doc-health`

## Bootstrap Rule

If `.harness/bootstrap.toml` exists, treat it as the machine-readable bootstrap source of truth.
