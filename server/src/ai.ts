import { aiSuggestionOutputSchema, type Priority } from '@prioritize/shared';

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
