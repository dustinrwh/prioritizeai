import { aiSuggestionOutputSchema, impactSuggestionOutputSchema, type Impact, type Priority } from '@prioritize/shared';

export interface SubmissionForAi {
  title: string;
  description: string;
  type: string;
  date_needed_by: string;
  impacted_users: number;
  user_type: string;
  impact_of_delay: string;
}
export interface BacklogItem {
  title: string;
  type: string;
  date_needed_by: string;
  impacted_users: number;
  priority: string | null;
}
export interface Suggestion {
  priority: Priority;
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are a pragmatic Applied AI program manager ranking work requests for one company.
Rank the submission as critical, high, medium or low using this rubric, in order of weight:
1. Revenue or human-safety impact of delay.
2. Number and type of impacted users. External users and "both" rank above internal-only.
3. Proximity of date_needed_by to today.
4. Type. Bug fixes that block users outrank feature requests of equal impact.
5. Effort is unknown, so do not guess at it.
Use the rest of the backlog only to calibrate: the suggestion should be relative, not absolute.
Respond with strict JSON: {"priority":"critical|high|medium|low","confidence":"high|medium|low","rationale":"2-4 sentences"}.`;

export function buildUserPrompt(s: SubmissionForAi, backlog: BacklogItem[], today: string): string {
  return JSON.stringify({ today, submission: s, rest_of_backlog: backlog }, null, 2);
}

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    priority: { type: 'STRING', enum: ['critical', 'high', 'medium', 'low'] },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    rationale: { type: 'STRING' },
  },
  required: ['priority', 'confidence', 'rationale'],
};

const TIMEOUT_MS = 8000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('AI timeout')), TIMEOUT_MS))]);
}

async function vertexSuggest(model: string, system: string, prompt: string): Promise<Suggestion> {
  const { VertexAI } = await import('@google-cloud/vertexai');
  const project = process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GCP_PROJECT is not set');
  const vertex = new VertexAI({ project, location: process.env.GCP_LOCATION ?? 'us-central1' });
  const m = vertex.getGenerativeModel({
    model,
    systemInstruction: system,
    generationConfig: {
      temperature: 0.2,
      // Gemini 2.5 counts internal reasoning against this cap, so 400 truncated the JSON on larger prompts.
      // The visible answer is ~100 tokens; the rest is headroom. Reasoning is off for Flash and minimal for Pro.
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: RESPONSE_SCHEMA as never,
      thinkingConfig: { thinkingBudget: model.includes('pro') ? 128 : 0 },
    } as never,
  });
  const res = await withTimeout(m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }));
  const candidate = res.response.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return aiSuggestionOutputSchema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`Unusable model output (finishReason=${candidate?.finishReason}): ${text.slice(0, 200)}`, { cause: err });
  }
}

/** Deterministic stand-in so the flow works locally without GCP credentials. */
function mockSuggest(s: SubmissionForAi, today: string): Suggestion {
  const days = Math.round((Date.parse(s.date_needed_by) - Date.parse(today)) / 86_400_000);
  let score = 0;
  if (/\$|revenue|safety|legal|compliance|outage/i.test(s.impact_of_delay)) score += 2;
  if (s.user_type !== 'internal') score += 1;
  if (s.impacted_users >= 500) score += 2;
  else if (s.impacted_users >= 50) score += 1;
  if (days <= 14) score += 2;
  else if (days <= 45) score += 1;
  if (s.type === 'bug_fix') score += 1;
  const priority: Priority = score >= 6 ? 'critical' : score >= 4 ? 'high' : score >= 2 ? 'medium' : 'low';
  return {
    priority,
    confidence: score >= 6 || score <= 1 ? 'high' : 'medium',
    rationale: `[mock] ${s.impacted_users} ${s.user_type} users are affected and the work is needed in ${days} days. Weighted against the stated impact of delay, this reads as ${priority}. Set AI_PROVIDER=vertex for a real model call.`,
  };
}

export async function suggestPriority(opts: {
  model: string;
  submission: SubmissionForAi;
  backlog: BacklogItem[];
  today: string;
}): Promise<{ suggestion: Suggestion; model: string }> {
  const system = process.env.AI_SYSTEM_PROMPT || DEFAULT_SYSTEM_PROMPT;
  if ((process.env.AI_PROVIDER ?? 'vertex') === 'mock') {
    return { suggestion: mockSuggest(opts.submission, opts.today), model: 'mock' };
  }
  const prompt = buildUserPrompt(opts.submission, opts.backlog, opts.today);
  return { suggestion: await vertexSuggest(opts.model, system, prompt), model: opts.model };
}

// ---- Impact estimates for completed initiatives ----
export interface ImpactEstimate extends Impact {
  confidence: 'high' | 'medium' | 'low';
  rationale: string;
}

export const IMPACT_SYSTEM_PROMPT = `You are a pragmatic Applied AI program manager estimating the ANNUAL business impact of a completed initiative, for a company-wide "wins" report.
Return whole-number annual estimates:
- people_impacted: people who benefit. Start from the stated impacted_users; do not inflate it.
- hours_saved: total working hours saved per year across all people. Derive it from time lost per week in the impact_of_delay text (hours per week x people affected x 52), scaled down sensibly if only some of them are affected.
- cost_reduced: dollars of cost removed per year (labor at roughly $50 per hour is a fair default for hours saved, but only count it if the work is truly eliminated, not just shifted). Use 0 if there is no real basis.
- revenue_increased: dollars of new or protected revenue per year. Use dollar figures from the impact_of_delay text when present. Use 0 if there is no basis.
Be conservative and never invent figures with no basis; prefer 0 over a guess. confidence is high only when the text gives concrete numbers.
Respond with strict JSON: {"people_impacted":int,"hours_saved":int,"cost_reduced":int,"revenue_increased":int,"confidence":"high|medium|low","rationale":"2-4 sentences naming the assumptions"}.`;

const IMPACT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    people_impacted: { type: 'INTEGER' },
    hours_saved: { type: 'INTEGER' },
    cost_reduced: { type: 'INTEGER' },
    revenue_increased: { type: 'INTEGER' },
    confidence: { type: 'STRING', enum: ['high', 'medium', 'low'] },
    rationale: { type: 'STRING' },
  },
  required: ['people_impacted', 'hours_saved', 'cost_reduced', 'revenue_increased', 'confidence', 'rationale'],
};

async function vertexImpact(model: string, prompt: string): Promise<ImpactEstimate> {
  const { VertexAI } = await import('@google-cloud/vertexai');
  const project = process.env.GCP_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error('GCP_PROJECT is not set');
  const vertex = new VertexAI({ project, location: process.env.GCP_LOCATION ?? 'us-central1' });
  const m = vertex.getGenerativeModel({
    model,
    systemInstruction: IMPACT_SYSTEM_PROMPT,
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1024,
      responseMimeType: 'application/json',
      responseSchema: IMPACT_SCHEMA as never,
      thinkingConfig: { thinkingBudget: model.includes('pro') ? 128 : 0 },
    } as never,
  });
  const res = await withTimeout(m.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }));
  const candidate = res.response.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    return impactSuggestionOutputSchema.parse(JSON.parse(text));
  } catch (err) {
    throw new Error(`Unusable impact output (finishReason=${candidate?.finishReason}): ${text.slice(0, 200)}`, { cause: err });
  }
}

/** Deterministic local stand-in: reads "N hours" and "$N" out of the impact text. */
function mockImpact(s: SubmissionForAi): ImpactEstimate {
  const hrs = /(\d[\d,]*)\s*(?:hours?|hrs?)/i.exec(s.impact_of_delay);
  const dollars = [...s.impact_of_delay.matchAll(/\$\s?(\d[\d,]*)(\s?[kKmM])?/g)].map((m) => {
    const n = Number(m[1]!.replace(/,/g, ''));
    const unit = m[2]?.trim().toLowerCase();
    return unit === 'k' ? n * 1e3 : unit === 'm' ? n * 1e6 : n;
  });
  const perWeek = hrs ? Number(hrs[1]!.replace(/,/g, '')) : 0;
  const hoursSaved = perWeek * 52;
  const money = dollars.reduce((a, b) => a + b, 0) * 4; // figures are usually quarterly or daily; assume ~4 periods
  const revenue = /revenue|sales|customers?|partners?/i.test(s.impact_of_delay) ? money : 0;
  return {
    people_impacted: s.impacted_users,
    hours_saved: hoursSaved,
    cost_reduced: revenue ? 0 : money + hoursSaved * 50,
    revenue_increased: revenue,
    confidence: hrs || dollars.length ? 'medium' : 'low',
    rationale: `[mock] ${s.impacted_users} ${s.user_type} users were affected. ${hrs ? `${perWeek} hours per week from the impact text is ${hoursSaved} hours per year. ` : ''}${dollars.length ? 'Dollar figures in the impact text were annualised roughly. ' : 'No dollar figures were stated, so dollars are estimated from hours only. '}Set AI_PROVIDER=vertex for a real model call.`,
  };
}

export async function suggestImpact(opts: { model: string; submission: SubmissionForAi; today: string }): Promise<{ estimate: ImpactEstimate; model: string }> {
  if ((process.env.AI_PROVIDER ?? 'vertex') === 'mock') return { estimate: mockImpact(opts.submission), model: 'mock' };
  const prompt = JSON.stringify({ today: opts.today, completed_initiative: opts.submission }, null, 2);
  return { estimate: await vertexImpact(opts.model, prompt), model: opts.model };
}
