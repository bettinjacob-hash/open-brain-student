// To switch providers, change LLM_PROVIDER in Supabase secrets. Add the new provider's API key. No other code changes needed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  try {
    const { prompt, systemPrompt, model, maxTokens } = await req.json();

    const provider = Deno.env.get("LLM_PROVIDER") ?? "anthropic";
    const llmModel = model ?? Deno.env.get("LLM_MODEL") ?? "claude-haiku-4-5-20251001";
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");

    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: llmModel,
        max_tokens: maxTokens ?? 512,
        system: systemPrompt ?? "You are a helpful assistant.",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();

    if (!response.ok) throw new Error(data.error?.message ?? "LLM call failed");

    const text = data.content?.[0]?.text ?? "";
    return new Response(JSON.stringify({ text }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});