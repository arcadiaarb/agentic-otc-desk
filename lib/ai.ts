// Server-only. One OpenAI-compatible client for the negotiation agents.
// Dev: Groq. Production: NEAR AI Cloud. Switch by changing the three NEGOTIATION_AI_* env vars only.
import OpenAI from "openai";

export async function askAgent(system: string, user: string, opts?: { maxTokens?: number; reasoningEffort?: string }): Promise<string | null> {
  const apiKey = process.env.NEGOTIATION_AI_API_KEY;
  if (!apiKey) return null; // no key: callers use the built-in fallback strategy
  try {
    // Fresh client per call: each agent turn is isolated, nothing is shared between sides.
    const client = new OpenAI({ baseURL: process.env.NEGOTIATION_AI_BASE_URL, apiKey, timeout: 20_000, maxRetries: 0 });
    const params = {
      model: process.env.NEGOTIATION_AI_MODEL ?? "llama-3.3-70b-versatile",
      temperature: 0.4,
      max_tokens: opts?.maxTokens ?? (Number(process.env.NEGOTIATION_AI_MAX_TOKENS) || 1500), // reasoning models spend tokens thinking
      messages: [{ role: "system" as const, content: system }, { role: "user" as const, content: user }],
      ...(opts?.reasoningEffort ? { reasoning_effort: opts.reasoningEffort } : {}), // "low" = don't overthink (reasoning models only)
    };
    const r = await client.chat.completions.create(params as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const choice = r.choices[0];
    if (choice?.finish_reason === "length") console.warn("[negotiation] AI reply was cut off (finish_reason=length). Raise NEGOTIATION_AI_MAX_TOKENS or use a non-reasoning model.");
    return (choice?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim() || null;
  } catch (e) {
    console.error("negotiation AI error", e);
    return null;
  }
}
