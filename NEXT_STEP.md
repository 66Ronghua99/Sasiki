# NEXT_STEP

- `P0` 先把 first-turn navigation bootstrap 修好，禁止在没有有效 observation 时生成 synthetic `sourceObservationRef`，并显式兼容系统 Chrome 初始 `about:blank` / omnibox tab；修完后再跑一条 focused refinement e2e 复核。
