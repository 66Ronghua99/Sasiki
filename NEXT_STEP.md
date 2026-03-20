# NEXT_STEP

- `P0` 合并当前已验证基线后，在基线分支上跑一条 fresh refinement e2e；如果 file chooser / modal 仍触发连续 speculative `navigate`，就把下一刀限制成独立的小闭环，只修 tool-surface 和 stale-page guard，并在每一步通过 focused tests + repo gates 后立即合并。
