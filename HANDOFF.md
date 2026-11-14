# HANDOFF — Groundtruth (SearchHack, 2026-11-14)

> Product renamed from **Tripwire** to **Groundtruth** (Tripwire is an existing security company). "Tripwires" remains the name of the per-claim watch feature (Arm tripwires / Tripwire alerts). Code identifiers like `TripwireBar` and `components/tripwire.tsx` were left as-is.

Read this first. It is the full context of the build session so another agent can continue without the chat.

---

## 1. Event and judging

- **Event:** SearchHack — "Build the next layer of AI search", Telem AI Series. Sat 2026-11-14, 880 W Maude Ave, Sunnyvale.
- **Schedule:** building 11:00 → **submissions due 4:15 pm** (Devpost: https://searchhack.devpost.com/) → judging 4:30 → finals 5:30 → winners 6:15.
- **Goal:** 1st place (iPhone 18 Pro + $1500 Telem credits + 30k Tavily credits).
- **Judges:** investors (Micron Ventures, Llama Ventures, Foothill, Sixty Degree, Plug and Play, Sky9).
- **Official rubric (from kickoff slide):**
  | Weight | Criterion | Meaning |
  |---|---|---|
  | **40%** | Use of Telem AI | Strong query understanding, retrieval, ranking and grounded results, and something hard to build without Telem |
  | 20% | Startup and venture potential | Clear customer, urgent problem, sizable market, business model, edge over competitors |
  | 20% | Innovation | Originality, how far beyond existing solutions |
  | 20% | Technical execution | Works, how well built, how much achieved in the time |
- **Tracks (starting points, not rules):** 01 intelligent retrieval, 02 long context and memory, 03 search routing, 04 agentic search, 05 efficient search, 06 knowledge and discovery, 07 personalized search, 08 multimodal, 09 new interfaces.
- **Tavily is not in the rubric.** Telem routes to Tavily as one of its engines; Tavily is also used directly for `/map` and news search.
- **Sponsor feedback (from talking to them):** credibility is the big risk in AI search — focus on how reliable sources and news are. This became the core of the product.

## 2. The product: Groundtruth

**Pitch:** "Paste any company, or write your investment assumptions. Groundtruth checks every claim across 6 search engines, scores how credible the sources really are, and keeps watching for changes."
**Hook line:** "AI search counts 30 rewrites of one press release as 30 sources. Groundtruth counts one."

It merges two ideas from brainstorming:
- **Idea 2 — Diligence Room (BUILT):** company URL → site mapped and read → LinkedIn record → 5 falsifiable claims → evidence for and against each → credibility scoring → founder questions.
- **Idea 1 — Tripwires (BUILT):** user types investment assumptions → "Arm tripwires" creates one Telem Monitor per claim → "Check now" judges new findings, rescores, and raises alerts (see section 7).

"Belief" was dropped as a word; use **claim** or **assumption**. The product is **not** limited to one industry (dental was only an example early on).

## 3. Credentials and endpoints (IMPORTANT)

- Keys live in `.env.local` (git-ignored, **not in the repo**). The user must hand them to the next agent separately:
  ```
  TELEM_API_KEY=tlm_...
  TELEM_BASE_URL=https://hack.telem.ai/api
  TAVILY_API_KEY=tvly-...
  ANTHROPIC_API_KEY=sk-ant-...
  ```
- **Telem gotcha:** the hackathon uses its own host. `https://router.telem.ai` (public docs) returns `401 Invalid API key` for hackathon keys. Use **`https://hack.telem.ai/api`**. Hackathon docs: https://hack.telem.ai/doc, MCP: https://hack.telem.ai/mcp. Auth: `Authorization: Bearer tlm_...`.
- **Anthropic gotcha:** the dev shell may export `ANTHROPIC_BASE_URL`; `lib/llm.ts` pins `baseURL: "https://api.anthropic.com"`.
- Models: `claude-sonnet-5-5` (claim extraction, founder questions), `claude-haiku-5-5` (page judging).
- The keys were pasted in chat during the event — **rotate all three after the hackathon.**

### Verified Telem behaviour
- `POST /v1/search` with `search.providers.include` returns one `preprocessor_runs[]` entry per engine (exa, brave, linkup, tavily, perplexity, parallel all succeed). `auto_routing: "accuracy"` picked exa, tavily, brave, parallel, ceramic, seltz, you.
- `POST /v1/fetch` accepts **at most 5 URLs per call** (batched in `lib/telem.ts`). LinkedIn company URLs auto-route to the `brightdata` provider. Response: `preprocessor_runs[].output_payload.fetched_results[]`.
- Monitors: `POST /v1/monitors {query, options:{frequency:"1h"}, ttl:"3d"}`; `GET /v1/monitors/{id}`; `GET /v1/monitors/{id}/agent/changes`; `POST /v1/monitors/{id}/poll`. Min frequency is 1h; there is no "run now".

### Seed monitors (created 2026-11-14 19:59 UTC, 1h, ttl 3d, agent on)
In `lib/seeds.ts`:
- `e6b9c0ef-d78d-49c6-a71e-15eb76300158` Cursor (Anysphere)
- `e02c13e8-76f6-4347-92af-c1cc599ecb0a` Ramp
- `2f70b677-261f-4735-a678-8421106dcd07` Abridge
They already returned real `entity_added` changes.

## 4. Run

```
npm install
npm run dev     # http://localhost:3000
```
Next.js 15.5 App Router, React 19, TypeScript, Tailwind v4, three 0.170, @react-three/fiber 9, @react-three/drei 10, @anthropic-ai/sdk. Windows dev machine. A preview launch config exists at `D:\Code\Hackathons\.claude\launch.json` (name `tripwire`).

## 5. Architecture (what exists)

```
lib/types.ts          SHARED CONTRACT: Claim, Evidence, OriginCluster, ClaimScore, CaseFile, ApiCall, MonitorView + HTTP API list
lib/store.ts          in-memory store on globalThis + data/cases.json persistence; API call log
lib/telem.ts          telemSearch (per-engine), telemFetchPages (batched ≤5), monitors list/get/create/changes/poll
lib/tavily.ts         tavilyNews (/search topic=news), tavilyMap (/map)
lib/llm.ts            extractClaims (Sonnet), judgeEvidence (Haiku), openQuestions (Sonnet); JSON retry once
lib/credibility.ts    seeded tier list T1..T5, ROUTES (claim type → engines), echoCollapse, weighEvidence, scoreClaim
lib/pipeline.ts       startCase → run: map/fetch site → LinkedIn → claims → auto-routing baseline → drill each claim → questions
lib/monitors.ts       MonitorView assembly, create, check (changes + poll)
lib/seeds.ts          seed monitor ids
app/api/analyze       POST {kind:"url"|"thesis", value} → {id}
app/api/case/[id]     GET CaseFile (UI polls every 900ms)
app/api/cases         GET recent cases
app/api/calls         GET ApiCall[] (?caseId=)
app/api/monitors      GET list, POST create
app/api/monitors/[id]/check  POST → changes + poll now
app/page.tsx          home: headline, URL / assumptions tabs, 3 sample sites, 3 one-click sample-assumption cards, recent checks, monitors panel
app/case/[id]/page.tsx  case board: header + engine pills, 3D rack (CoreRack), claims list, evidence drawer, LinkedIn card, founder questions, live calls table, monitors
components/CoreRack.tsx   CURRENT 3D (stacked core cylinders) — TO BE REPLACED by Evidence Terrain
components/panels.tsx     2D fallback, claim list, evidence drawer, live calls table
components/MonitorsPanel.tsx, components/ui.tsx (colors, chips, hooks), components/mockCase.ts (/case/mock fixture, labelled MOCK DATA)
```

### Pipeline per claim (`drill` in lib/pipeline.ts)
1. Telem search with the claim-type engine list for a **support query** and an **attack query** (4 results per engine) + Tavily news on the attack query.
2. Merge by normalized URL; record which engines returned each URL; take the top 7 by engine count then rank.
3. Telem fetch full text (snippet fallback, labelled `fetchedVia: "snippet"`).
4. Haiku judges each doc: stance (supports/contradicts/irrelevant), verbatim quote, entailment 0..1, published date, tier for unknown domains.
5. Self-interest flag: company's own domain or press wires.
6. Push evidence (UI shows layers arriving) → 700 ms → echo collapse (5-word shingle containment > 0.3 or identical quote → one origin; origin = best tier, then earliest).
7. Weight = tier × independence × cross-engine × self-interest × recency × entailment. Score = sigmoid(support − 1.2 × contradict) → 0..100.
8. Labels: Verified / Contested / Self-reported only / Unverifiable / Pending.

### Color system (components/ui.tsx, app/globals.css)
- supports / verified `#3FB68B` (green), contradicts / contested `#E4572E` (red-orange), self-reported `#F2A93B` (amber), irrelevant / unverifiable `#5E6B78` (steel), accent / actions / confidence `#5B9DFF` (blue), background `#0E0E0C`, panel `#161613`, text `#E8E2D4`, muted `#8F897C`.
- Engine colors: exa `#6FD3FF`, brave `#FF8A3D`, linkup `#A6E35F`, tavily `#FF7EB6`, perplexity `#2EC4B6`, parallel `#FFD84D`.
- Tier colors: T1 `#3FB68B`, T2 `#5B9DFF`, T3 `#C9B98F`, T4 `#8F897C`, T5 `#5E6B78`.
- Fonts: Archivo Narrow (headings), JetBrains Mono (labels). No purple, no neon, no glow cards.

## 6. Verified so far (browser + real calls)

| Item | Status |
|---|---|
| Telem Search 6 engines, auto-routing baseline, Fetch, Bright Data LinkedIn, Monitors list/changes/poll | VERIFIED |
| Tavily map + news | VERIFIED |
| Claude Sonnet + Haiku | VERIFIED |
| URL flow (ramp.com, cursor.com) end to end ~30–60 s | PASS |
| Thesis flow from UI (Abridge assumptions) | PASS |
| Echo collapse on real data | PASS (Abridge thesis: 35 samples → 32 origins; it is rare on most runs) |
| Monitor "Check now" | PASS |
| Home page simplification + sample assumptions + new palette | PASS |
| Mock data | only `/case/mock`, labelled MOCK DATA |

## 7. Status of the planned work

1. **DONE — Evidence Terrain** replaced the stacked cores on the case page (`components/EvidenceTerrain.tsx`). CoreRack.tsx is kept only for the 2D fallback helper.
2. **DONE — Watch-and-alert loop (idea 1)** — `lib/watch.ts`, `app/api/case/[id]/watch`, `app/api/case/[id]/check`, `components/tripwire.tsx` (TripwireBar, AlertFeed, Sparkline). Monitor change records carry `after.url`; those URLs plus a fresh Telem attack re-search are fetched, judged, collapsed and scored. Alerts fire on a ≥15 point drop, a switch to Contested/Contradicted, or a new T1–T3 contradiction with entailment ≥ 0.6. Original design notes kept below:
   - "Watch this case" button on the case page → `POST /api/monitors` once per claim, query built from `claim.disproof`, stored on the case (`case.watch: {claimId, monitorId}[]`; add to `lib/types.ts`).
   - "Check now" per case → for each claim monitor, read `/agent/changes` + `/poll`; take new URLs not already in `case.evidence`; Telem fetch them; Haiku judge against the claim; append evidence; re-run echo collapse + score; push `case.history[claimId].push({ts, confidence})`.
   - If confidence drops ≥ 20 points or label becomes Contested → add an alert `{ts, claimId, from, to, sourceUrl, tier}` to `case.alerts`; show an alert feed and make the claim's terrain peak sink / pit glow.
3. Telem trace ids are shown shortened and are not links into the Observe console.
4. No webhooks (no public URL); the changes feed is used instead. ngrok exists at `C:\Users\Ash\opt\ngrok-v3-stable-windows-amd64\ngrok.exe` if needed.
5. Competitor discovery is only an occasional claim; no dedicated competitor graph.
6. Echo collapse is text-overlap only.
7. Pushed to https://github.com/wh0th3h3llam1/pullsignal (branch master).

## 8. Evidence Terrain (BUILT — design notes)

Replace `components/CoreRack.tsx` usage on the case page with a new `components/EvidenceTerrain.tsx` (React Three Fiber, `dynamic(..., {ssr:false})`). Keep the 2D fallback toggle and reduced-motion support. Keep layout simple: terrain on top (≈ 55vh), claim rows below or to the right — the user found the old board fragmented.

**Concept:** one landscape per company. Each claim is a location on the terrain.
- **Supported claims rise as green peaks**; height ∝ `score.supportWeight` (or confidence for Verified).
- **Contradicted claims sink into red pits**; depth ∝ `score.contradictWeight`.
- **Self-reported only** = amber, low plateau. **Unverifiable** = flat grey ground. **Pending** = flat, then rises/sinks as evidence streams in (animate the height field).
- **Pins/flags on peaks** mark the strongest sources (top origin evidence by weight); flag color = tier color; clicking a pin opens the evidence drawer.
- Clicking near a claim's peak/pit selects the claim (highlight + camera eases toward it); hover shows claim text + score.
- Vertex colors: neutral `#3a3a34` lerped toward green with height and toward red with depth; faint dark wireframe overlay; flat shading.
- Slow camera sway (disabled with reduced motion). Grid of claims laid out left→right (x = −4.5 … +4.5) with small z jitter.
- Echo collapse can be shown as small pins merging into one when `case.origins` arrives.
- For the alert loop: when an alert fires, the claim's peak animates down into a pit and the pit pulses red.

Reference prototype (plain three.js r128, matches the approved look): `docs/evidence-terrain-mockup.html` — open it in a browser.

## 9. Demo plan (2 min) — see DEMO.md
Hook → home → click a sample (or a judge's company) → engines light up → terrain forms → click a red pit (contested) → evidence drawer with verbatim quote and the six credibility factors → "N articles → M origins" (echo collapse) → LinkedIn card → founder questions → monitors with real changes → live calls table (every row real, with Telem trace ids). Record a backup video before 4:15.

## 10. Git
- Local repo on branch `master`. `.env*` is git-ignored. `data/cases.json` (cached real runs, replayed as SEEDED REPLAY) is committed so the demo has history.
- Remote: https://github.com/wh0th3h3llam1/pullsignal (branch `master`). No GitHub CLI on this machine; plain `git push` works via the credential manager.

## 11. User preferences (from the session)
- Hackathon strategist mode; skip basics; decide fast.
- Demo must actually work; label mocks; never fake sponsor calls.
- Extraordinary but readable 3D that does something; no generic AI UI (no purple gradients, neon, glow cards).
- Keep UI simple — the user called earlier versions cluttered/fragmented.
- Show visual mockups for approval before big UI changes.
