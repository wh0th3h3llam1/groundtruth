# Demo — 2 minutes

**Prep (before judging):** open a case and click **Arm tripwires** at least 10 minutes before you present, so the Telem Monitors are `ready` and have findings. Keep a second, already-checked case open in another tab as a backup.

**Hook (0:00, 15s):** "AI search counts 30 rewrites of one press release as 30 sources. Tripwire counts one, and it tells you when a claim breaks."

1. (0:15) Home → Investment assumptions → click a sample card (or type a judge's thesis) → **Check**. Engine pills light up: 6 engines through Telem.
2. (0:35) The **evidence terrain** rises: green peaks = supported claims, red pits = contradicted, amber = only the company says so. Flags are the strongest sources; bigger flag = more credible tier.
3. (0:55) Click a red pit → claim row → evidence with the verbatim quote and the six credibility factors. Point at "N sources → M origins" (rewrites collapsed).
4. (1:15) **Arm tripwires** (already armed on the backup case): one Telem Monitor per claim, built from what would disprove it.
5. (1:30) **Check now** → monitor findings (blue dots on flags) are fetched, judged and scored live; sparklines move; a **Tripwire alert** lands with source and tier.
6. (1:50) Live calls table: every row is a real Telem / Tavily / Claude response with trace ids. "Only buildable because Telem gives us six independent indexes + fetch + LinkedIn + monitoring behind one key."

**Reset:** stop server, delete `data/cases.json` for a clean list.
