import Anthropic from "@anthropic-ai/sdk";
import { recordCall } from "./store";
import type { ClaimType, Stance, Tier } from "./types";

export const SMART = "claude-sonnet-5-5";
export const FAST = "claude-haiku-5-5";

let client: Anthropic | null = null;
function ai() {
  // baseURL pinned: the dev shell may export a different ANTHROPIC_BASE_URL.
  return (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, baseURL: "https://api.anthropic.com" }));
}

function parseJson<T>(text: string): T {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const start = raw.search(/[\[{]/);
  const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
  return JSON.parse(raw.slice(start, end + 1));
}

async function ask<T>(model: string, system: string, user: string, caseId: string | null, label: string, maxTokens = 3000): Promise<T> {
  try { return await askOnce<T>(model, system, user, caseId, label, maxTokens); }
  catch { return askOnce<T>(model, system + " Output strictly valid JSON: escape every double quote inside strings.", user, caseId, label + " (retry)", maxTokens); }
}

async function askOnce<T>(model: string, system: string, user: string, caseId: string | null, label: string, maxTokens: number): Promise<T> {
  const t0 = Date.now();
  try {
    const msg = await ai().messages.create({
      model, max_tokens: maxTokens, system,
      messages: [{ role: "user", content: user }],
    });
    const text = msg.content.map((b: any) => (b.type === "text" ? b.text : "")).join("");
    const out = parseJson<T>(text);
    recordCall({ caseId, service: "anthropic", status: "ok", ms: Date.now() - t0, summary: `${model.replace("claude-", "")} · ${label}`, detail: `${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out` });
    return out;
  } catch (e: any) {
    recordCall({ caseId, service: "anthropic", status: "error", ms: Date.now() - t0, summary: `${model} · ${label}`, detail: String(e.message || e).slice(0, 300) });
    throw e;
  }
}

export interface RawClaim { text: string; type: ClaimType; disproof: string; entities: string[]; weight: number; support_query: string; attack_query: string }

export async function extractClaims(input: { kind: "url" | "thesis"; value: string }, pages: { url: string; content: string }[], caseId: string) {
  const ctx = pages.map((p) => `### ${p.url}\n${p.content.slice(0, 5000)}`).join("\n\n");
  const today = new Date().toISOString().slice(0, 10);
  return ask<{ company: string; claims: RawClaim[] }>(
    SMART,
    `You are a skeptical venture-capital diligence analyst. Today is ${today}. Extract the 5 most investment-relevant, independently checkable, falsifiable claims. Prefer concrete claims (numbers, customers, funding, founders' backgrounds, competitive position, pricing, compliance). Each claim must be checkable on the public web. Return ONLY JSON.`,
    `${input.kind === "url" ? `Company website: ${input.value}\nPages fetched from the site:\n${ctx}` : `Investor's assumptions:\n${input.value}\n${ctx ? "Context:\n" + ctx : ""}`}

Return JSON:
{"company": "<company or topic name>",
 "claims":[{"text":"<one sentence claim>","type":"funding|people|product|customers|market|pricing|legal|other","disproof":"<what evidence would prove it false>","entities":["..."],"weight":0.0-1.0,
 "support_query":"<web search query to find independent confirmation>","attack_query":"<web search query designed to find contradicting evidence: competitors, lawsuits, layoffs, conflicting numbers>"}]}`,
    caseId, "extract claims", 2500,
  );
}

export interface Judged { i: number; stance: Stance; quote: string; entailment: number; published: string | null; tier: Tier; tier_reason: string }

export async function judgeEvidence(claim: string, docs: { i: number; url: string; title: string; text: string }[], caseId: string) {
  const body = docs.map((d) => `[DOC ${d.i}] ${d.url}\nTITLE: ${d.title}\n${d.text.slice(0, 3500)}`).join("\n\n---\n\n");
  return ask<{ results: Judged[] }>(
    FAST,
    `You verify a claim against source documents. For each doc decide if its text SUPPORTS, CONTRADICTS, or does not address (irrelevant) the claim. Quote the single most decisive sentence VERBATIM from the doc (empty if irrelevant). Rate source credibility tier: 1=primary/official record (regulator filings, government, courts, the named investor's own announcement, peer-reviewed), 2=established national/business press (Reuters, Bloomberg, WSJ, FT, NYT, CNBC, TechCrunch, Forbes staff), 3=trade/niche press or credible analyst, 4=aggregator, PR wire repost, personal blog, social post, company marketing about itself, 5=unknown/SEO/content farm. Return ONLY JSON.`,
    `CLAIM: ${claim}\n\n${body}\n\nReturn {"results":[{"i":<doc number>,"stance":"supports|contradicts|irrelevant","quote":"...","entailment":0.0-1.0,"published":"YYYY-MM-DD or null","tier":1-5,"tier_reason":"<6 words>"}]}`,
    caseId, `judge ${docs.length} docs`, 3000,
  );
}

export async function openQuestions(company: string, summary: string, caseId: string) {
  return ask<{ questions: string[] }>(
    SMART,
    "You are a sharp VC partner preparing for a founder meeting. Return ONLY JSON.",
    `Company: ${company}\nClaim verification results:\n${summary}\n\nWrite 4 pointed questions to ask the founder, targeting claims that are self-reported only, contested, or unverifiable. Each under 30 words. Return {"questions":["..."]}`,
    caseId, "open questions", 800,
  );
}
