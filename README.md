# Groundtruth — what's solid under every claim

Paste any company URL (or type investment assumptions). Groundtruth extracts the checkable claims, searches
for evidence **for and against** each one across 6 engines through Telem, reads the full pages, scores how
credible each source is, and keeps watching with Telem Monitors.

## Run
```
npm install
npm run dev          # http://localhost:3000
```
`.env.local` (git-ignored):
```
TELEM_API_KEY=tlm_...
TELEM_BASE_URL=https://hack.telem.ai/api     # hackathon endpoint (NOT router.telem.ai)
TAVILY_API_KEY=tvly-...
ANTHROPIC_API_KEY=sk-ant-...
```

## How it works (lib/)
| Stage | File | Real API |
|---|---|---|
| Map + read company site | pipeline.ts | Tavily `/map`, Telem `/v1/fetch` |
| LinkedIn company record | pipeline.ts `linkedin()` | Telem `/v1/fetch` → Bright Data provider |
| Extract 5 falsifiable claims + support/attack queries | llm.ts | Claude Sonnet 5.5 |
| Route by claim type (funding → linkup/exa/brave/perplexity/tavily, …) | credibility.ts `ROUTES` | Telem `/v1/search` with `providers.include` |
| Baseline: Telem auto-routing on C1 | pipeline.ts | Telem `/v1/search` `auto_routing: "accuracy"` |
| Fresh news witness | tavily.ts | Tavily `/search` topic=news |
| Full-text grounding (≤5 URLs per call, batched) | telem.ts | Telem `/v1/fetch` |
| Stance + verbatim quote + tier for unknown domains | llm.ts | Claude Haiku 5.5 |
| Echo collapse (5-word shingle containment > 0.3 → one origin) | credibility.ts | — |
| Score: tier × independence × cross-engine × self-interest × recency × entailment | credibility.ts | — |
| Founder questions | llm.ts | Claude Sonnet 5.5 |
| Continuous watch | monitors.ts, seeds.ts | Telem `/v1/monitors`, `/agent/changes`, `/poll` |

Every external call is logged (`/api/calls`) and shown in the "Live calls" table with Telem trajectory ids for Observe.

## Labels
- **Verified** — independent (non-self), tier ≤3 origin supports it, confidence ≥ 60
- **Contested** — meaningful weight on both sides, or more against than for
- **Self-reported only** — only the company / press wires support it
- **Unverifiable** — no relevant evidence

## Limitations (honest)
- Domain tier list is a seeded list of ~80 domains; unknown domains are tiered by Claude Haiku.
- Echo collapse uses text overlap only; it does not follow canonical links.
- Monitors run hourly; the "Check now" button reads the agent change feed + polls, it cannot force a run.
- Cases are kept in memory and persisted to `data/cases.json`; after restart they show as **SEEDED REPLAY**.
- No auth; desktop-first.
