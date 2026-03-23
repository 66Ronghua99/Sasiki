# NEXT_STEP

- `P0` 修掉 refine smoke 首轮 `act.navigate` 携带 `sourceObservationRef=initial_navigation` 的噪声；以 `docs/testing/refine-e2e-baidu-search-runbook.md` 为回归基线，要求百度 smoke run 首轮直接走合法 bootstrap / observation 路径，不再依赖一次失败后的自恢复。
