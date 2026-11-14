# DECISIONS
- Idea: Tripwire = Diligence Room (URL → claims) + Tripwire (assumptions watched by Monitors), with credibility as the core (sponsor feedback).
- Rubric: 40% Use of Telem → Telem used for Search (named engines + auto-routing), Fetch, Bright Data LinkedIn, Monitors, Observe trace ids. Tavily used directly for map + news, and via Telem as an engine.
- Stack: single Next.js 15 app, polling (900ms) instead of SSE for robustness, JSON file store (no native deps on Windows).
- Art direction: "Core Sample" — claims as geological cores, evidence as strata by tier, rewrites compress into slivers, contested cores fracture.
- Cut: auth, webhooks (no public URL), learned domain reputation, retraction monitoring.
