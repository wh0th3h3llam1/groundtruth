# Groundtruth: demo video script (about 2 min 20 s)

**Who it's for:** VC judges. **Tone:** plain English, no jargon.
**The one idea to remember:** *Groundtruth checks every claim a founder makes, shows how much to trust each source, and keeps watching after the meeting.*

Read the **Say** lines out loud. The **Show** lines describe what's on screen. The **Tools** line appears as a tag on screen during that scene.

---

### 1. The problem (0:00–0:15)
**Show:** Home page. The headline "Every claim, checked and watched."
**Say:**
> Every founder pitch is a stack of claims. "We're the market leader." "We're profitable." "Nobody else does this." Checking them takes an analyst days, and most of what you find online is the same press release, copied a hundred times. Groundtruth fixes that.

### 2. You give it a company (0:15–0:30)
**Show:** Click the "Investment assumptions" tab. Click the Fintech sample card and it fills in three claims. Switch to "Company URL" and click ramp.com.
**Tools:** Your input → Groundtruth
**Say:**
> You paste a startup's website, or type your own investment assumptions, one per line. Then press Check.

### 3. It reads the company (0:30–0:45)
**Show:** The new case running: the stage text and the live log at the bottom of the map.
**Tools:** Tavily Map · Telem Fetch · Bright Data (LinkedIn) · Claude
**Say:**
> First, Tavily maps the company's website and Telem Fetch reads the pages, even the LinkedIn profile, through Bright Data. Claude turns the pitch into clear, checkable claims, and writes down what evidence would prove each one wrong.

### 4. It searches everywhere, both sides (0:45–1:03)
**Show:** A finished Ramp case. The six engine pills light up. Scroll to the Live calls table, where every row is a real Telem call.
**Tools:** Telem Search: Exa · Brave · Linkup · Perplexity · Parallel · Tavily, plus Tavily News
**Say:**
> Here's the key part. Through one API, Telem sends every claim to six search engines at once. It searches both sides: evidence for the claim, and evidence against it. Tavily adds the latest news, so nothing recent slips through.

### 5. It decides who to trust (1:03–1:25)
**Show:** Open a claim. Click a source to open the evidence card with its trust factors.
**Tools:** Telem Fetch (full articles) · Claude (reads each one) · Groundtruth trust score
**Say:**
> Telem Fetch reads each full article, and Groundtruth scores how much to trust it. Reuters or a court filing counts more than a blog. The company's own press release counts less. If nine articles copy one press release, we count it once. And when different engines find the same source, that agreement is a trust signal you can only measure because Telem reaches every engine.

### 6. One picture of the truth (1:25–1:37)
**Show:** The 3D evidence terrain. Rotate it slowly.
**Tools:** Evidence Terrain
**Say:**
> It all lands on one map. Green peaks are claims that hold up. Red pits are claims the evidence contradicts. Flags are the strongest sources: the bigger the flag, the more trusted the source.

### 7. It proves its own search (1:37–1:47)
**Show:** The "Routing, measured" panel.
**Tools:** Telem auto-routing vs Groundtruth routing
**Say:**
> We even measure ourselves: every claim is searched with Telem's own routing and with ours, and we show which one found more credible sources.

### 8. It keeps watching (1:47–2:08)
**Show:** The Abridge case. The blue "auto-check every 3 min" badge counting down. Tripwire alerts. The red pit with a warning sign.
**Tools:** Telem Monitors · Telem Search (re-check) · auto-check every 3 min
**Say:**
> Diligence doesn't end at the term sheet. One click arms a tripwire on every claim: a Telem Monitor that keeps watching the web for whatever would break it, and re-checks on its own. Here, a new article contradicted a claim about Abridge. Its score dropped, and an alert landed.

### 9. What to ask, and the receipts (2:08–2:18)
**Show:** "Ask the founder" questions, then the Live calls table.
**Tools:** Claude · every call logged with a Telem trace ID
**Say:**
> Then it writes the questions to ask the founder. And every score traces back to a real source and a real API call.

### 10. Who it's for (2:18–2:32)
**Show:** Back to the home page.
**Tools:** Groundtruth
**Say:**
> Groundtruth is for anyone who has to trust a claim: checking a pitch before the term sheet, watching a portfolio after it, or testing the assumptions in your investment memo. Every claim, checked and watched.

---

## Use cases to mention in Q&A
- **Before the term sheet:** check every claim in the deck in minutes, not days.
- **Portfolio monitoring:** tripwires flag the moment a claim about a portfolio company breaks (a lawsuit, a lost customer, a down round).
- **Investment memos:** test your own market assumptions ("No competitor has more enterprise customers").
- **Competitive checks:** run assumptions about a rival ("Amex hasn't launched a competing product").
- **LP updates:** every statement backed by a source and an API trace.

## Where Telem and Tavily do the work
| Step | Tool | What it does |
|---|---|---|
| Read the company | **Tavily Map** | Finds the site's about, customers, pricing and press pages |
| Read the company | **Telem Fetch** (with Bright Data for LinkedIn) | Turns pages into clean full text |
| Search | **Telem Search** across Exa, Brave, Linkup, Perplexity, Parallel and Tavily | Searches both for and against every claim, routed by claim type |
| Recent news | **Tavily Search** (news) | Catches the latest articles against a claim |
| Trust | **Telem**'s cross-engine results | Agreement across independent engines raises trust |
| Proof | **Telem auto-routing** | Baseline we compare our routing against |
| Watch | **Telem Monitors** | One per claim, watching for the evidence that would break it |
| Reasoning | **Claude** (Sonnet and Haiku) | Pulls out claims, judges each article, writes founder questions |
