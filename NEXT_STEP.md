# NEXT_STEP

- `P0` 启动 metric semantics slice：把 `loadedKnowledgeCount` 明确收窄为 bootstrap/start-prompt guidance 注入数，新增 `observe.page` 运行时 `pageKnowledge` hit metric 与对应 run-summary / focused-test proof，然后再单独评估 stable empty-state knowledge + corroborating DOM 是否应允许 direct finish。
