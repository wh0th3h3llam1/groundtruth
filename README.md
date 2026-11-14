# Groundtruth: what's solid under every claim

**Every founder pitch is a stack of claims.** "We're the market leader." "We're profitable." "Nobody else does this."
Checking them takes an analyst days, and most of what you find online is the same press release, copied many times.

Groundtruth checks every claim in minutes, shows **how much to trust each source**, and **keeps watching** after the meeting.
Paste a startup's website or type your own investment assumptions, and you get:

- every checkable claim, with a score and a label: **Verified / Contested / Contradicted / Self-reported only / Unverifiable**
- the sources for **and against** each claim, with the exact quote and a trust score you can open up and inspect
- a 3D **Evidence Terrain**: green peaks are claims that hold up, red pits are claims the evidence breaks
- **questions to ask the founder**, based on what didn't hold up
- **tripwires**: a Telem Monitor per claim that re-checks on its own and raises an alert when credible new evidence breaks a claim
- **receipts**: every number traces back to a real source and a real API call (with its Telem trace ID)

Built at SearchHack (Telem AI Series), Nov 14 2026.

---

## Who it's for

| Use case | How Groundtruth helps |
|---|---|
| **Before the term sheet** | Check every claim in a deck or on a website in minutes instead of days |
| **Portfolio monitoring** | Tripwires flag the moment a claim breaks: a lawsuit, a lost customer, a down round |
| **Investment memos** | Test your own assumptions ("No competitor has more enterprise customers") |
| **Competitive checks** | Run claims about a rival ("Amex hasn't launched a competing product") |
| **LP updates** | Every statement backed by a source and an API trace |

---

## Sponsors: what we use and how

### Telem AI (the core of the product)
Base URL `https://hack.telem.ai/api` · auth `Authorization: Bearer tlm_…`

| Telem feature | Endpoint | How Groundtruth uses it |
|---|---|---|
| **Search (multi-engine)** | `POST /v1/search` with `search.providers.include` | Every claim is searched **twice, for and against**, across the engines that suit its type (e.g. funding → Linkup, Exa, Brave, Perplexity, Tavily; market → Perplexity, Parallel, Exa, Tavily). Engines: **Exa, Brave, Linkup, Perplexity, Parallel, Tavily**. |
| **Cross-engine agreement** | results per engine in `preprocessor_runs[]` | When several independent engines return the same source, its trust weight goes up. This signal only exists because one Telem call reaches every engine. |
| **Auto-routing** | `POST /v1/search` with `auto_routing: "accuracy"` | The baseline we measure ourselves against. The **"Routing, measured"** panel runs each claim's queries through Telem auto-routing and through our routing, then compares credible domains, distinct domains and self-reported domains. On the Ramp demo case, our routing found 14 credible domains vs 11 with auto-routing, and 112 distinct domains vs 81. |
| **Fetch** | `POST /v1/fetch` (≤5 URLs per call, batched) | Reads the company's own pages and the **full text** of every evidence article, so judgments are grounded in the article itself, not a snippet. |
| **Fetch → Bright Data** | `POST /v1/fetch` on a LinkedIn URL | Telem routes LinkedIn URLs to **Bright Data**, which gives us the company's LinkedIn record. |
| **Monitors** | `POST /v1/monitors`, `GET /v1/monitors/{id}`, `GET …/agent/changes`, `POST …/poll` | **Tripwires**: one monitor per claim, written from the claim's *disproof condition* (what evidence would prove it wrong). New findings are fetched, judged and re-scored. |
| **Trace IDs** | `trajectory_id` on each response | Shown in the "Live calls" table so every score is auditable. |

### Tavily
| Tavily feature | Endpoint | How Groundtruth uses it |
|---|---|---|
| **Map** | `POST /map` | Finds a company's about, customers, pricing, team and press pages, so we read the pages where claims live. |
| **News search** | `POST /search` with `topic: "news"` | Searches recent news against each claim, so a fresh contradiction isn't missed. |
| **Tavily as a Telem engine** | via Telem Search | One of the six engines inside every routed search. |

### Anthropic (Claude)
| Model | Used for |
|---|---|
| `claude-sonnet-5-5` | Turning a website or an assumption list into ≤5 checkable claims, each with a support query, an attack query and a disproof condition. Writing the founder questions. |
| `claude-haiku-5-5` | Reading each fetched article: whether it supports or contradicts the claim, the exact quote, an entailment score, and a tier for domains not on our list. |

### Bright Data
Reached **through Telem Fetch** for LinkedIn company pages; no separate integration.

---

## How the trust score works

Each source gets a weight:

```
weight = tier × independence × cross-engine × self-interest × recency × entailment
```

- **Tier:** T1 (SEC, courts, government, peer-reviewed) → T5 (unknown). About 80 seeded domains; Claude tiers the rest.
- **Independence (echo collapse):** articles that copy each other (5-word shingle overlap > 0.3, or an identical quote) collapse into **one origin**. Nine rewrites of one press release count once.
- **Cross-engine:** found by more engines → more weight.
- **Self-interest:** the company's own domain and press-wire sites are discounted.
- **Recency** and **entailment** (how directly the quote supports or contradicts the claim).

Confidence = `sigmoid(2.2 × (support − 1.2 × contradict))`. Labels:
- **Verified:** an independent T1–T3 origin supports it, confidence ≥ 60
- **Contradicted:** credible evidence against (weight ≥ 0.2) and almost nothing for it
- **Contested:** meaningful weight on both sides
- **Self-reported only:** only the company or press wires support it
- **Unverifiable:** no relevant evidence

## Tripwires (the watch loop)
1. **Arm tripwires** creates one Telem Monitor per claim.
2. While a case is open, the server **auto-checks every 3 minutes**. Each check reads the monitor's change feed and poll, plus a fresh Telem re-search against the claim. New sources are fetched, judged and re-scored.
3. If confidence drops by 15 or more, the label flips to Contested or Contradicted, or a credible new contradiction appears, an **alert** lands and the claim's pit on the terrain pulses red.
4. Auto-checks pause after 20 minutes with no viewer (to save API credits) and resume when someone opens the case. **Check now** runs one immediately.

---

## Run it

```bash
npm install
npm run dev          # http://localhost:3000
```

`.env.local` (git-ignored, never commit it):
```
TELEM_API_KEY=tlm_...
TELEM_BASE_URL=https://hack.telem.ai/api     # hackathon endpoint (router.telem.ai rejects hackathon keys)
TAVILY_API_KEY=tvly-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Production / demo deploy
Groundtruth needs **one long-running Node process**: checks keep running after the request returns, and cases live in server memory. Serverless hosts (Vercel, Netlify) freeze or split that, so use a Node host or run it locally behind a tunnel:

```bash
NEXT_DIST_DIR=.next-prod npx next build
NEXT_DIST_DIR=.next-prod npx next start -p 3005
ngrok http 3005
```

`NEXT_DIST_DIR` keeps the production build in `.next-prod`, so `npm run dev` can run alongside it.

## Code map
| Path | What it does |
|---|---|
| `lib/pipeline.ts` | Full check: map + fetch site, LinkedIn, extract claims, two-sided routed search, fetch, judge, echo collapse, score, founder questions |
| `lib/telem.ts` | Telem Search, Fetch (batched), Monitors; every call logged with trace IDs |
| `lib/tavily.ts` | Tavily Map and News search |
| `lib/llm.ts` | Claude claim extraction, evidence judging, founder questions |
| `lib/credibility.ts` | Domain tiers, engine routes, echo collapse, weights, labels |
| `lib/routing.ts` | Telem auto-routing vs Groundtruth routing measurement |
| `lib/watch.ts` | Tripwires: arm monitors, check, alerts, 3-minute auto-check scheduler |
| `lib/store.ts` | In-memory store + `data/cases.json` cache (re-scored on load) |
| `components/EvidenceTerrain.tsx` | 3D terrain (React Three Fiber) |
| `components/RoutingPanel.tsx`, `tripwire.tsx`, `panels.tsx` | Routing comparison, tripwire bar and alerts, claims, evidence card, live calls |
| `docs/video/SCRIPT.md` | 2½-minute demo video script |

API: `POST /api/analyze` · `GET /api/case/:id` · `POST /api/case/:id/watch` · `POST /api/case/:id/check` · `POST /api/case/:id/routing` · `GET /api/cases` · `GET /api/calls` · `GET /api/monitors`

## Limitations
- The domain tier list is seeded (~80 domains); unknown domains are tiered by Claude Haiku.
- Echo collapse uses text overlap; it doesn't follow canonical links.
- Telem Monitors run hourly on Telem's side; our 3-minute auto-check reads their findings and adds a fresh re-search.
- Cached cases reload as **SEEDED REPLAY** after a restart; the "Live calls" table shows only calls made since the server started.
- No auth; desktop-first.
