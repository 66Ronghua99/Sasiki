# NEXT_STEP

- `P0` 先不要继续扩 retrieval surface；基于 TikTok refine-only rerun `20260326_200513_031`，把 metrics 语义拆清楚：保留 startup-loaded guidance count 表示 bootstrap/start prompt 注入数，新增 runtime page-knowledge hit metric 表示 `observe.page` 在真实任务页命中的知识次数；随后再单独评估 start prompt 是否要在命中稳定 empty-state knowledge 且页面证据一致时，允许 agent 直接 finish 而不是重复复核。
