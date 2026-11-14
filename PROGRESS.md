# PROGRESS — 2026-11-14

## RESUME HERE
App runs with `npm run dev`. All sponsor calls verified live. Next: rehearse demo, record backup video.

| Area | State | Evidence |
|---|---|---|
| Telem Search (6 engines, per-engine results) | VERIFIED | exa/brave/linkup/tavily/perplexity/parallel all `succeeded` |
| Telem auto-routing baseline | VERIFIED | returned exa, tavily, brave, parallel, ceramic, seltz, you |
| Telem Fetch (batched ≤5) | VERIFIED | providers: tavily, exa, parallel, fetchlayer_reddit |
| Telem Fetch → Bright Data LinkedIn | VERIFIED | Ramp/Cursor/Abridge company records |
| Telem Monitors (3 seeds, 1h, agent) | VERIFIED | created 19:59 UTC; agent `ready`; real `entity_added` changes |
| Tavily map + news search | VERIFIED | |
| Anthropic Sonnet 5.5 / Haiku 5.5 | VERIFIED | JSON retry on parse error |
| Echo collapse | VERIFIED | Abridge thesis: 35 samples → 32 origins |
| 3D Core Rack + 2D fallback | PASS (browser) | real cases render, fractures/hollow/pending states |
| Thesis flow from UI | PASS (browser) | case_i5anixa |
| Monitor "Check now" | PASS (browser) | |
| Mocked | `/case/mock` only, labelled MOCK DATA | |

Seed monitor ids: lib/seeds.ts
