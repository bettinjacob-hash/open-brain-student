import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const payload = await req.json();
    const thought = payload.record;

    if (!thought?.content || thought.content.length < 20) {
      return new Response("too short, skipping", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const llmRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-llm`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          systemPrompt: "You are a knowledge organizer. Respond with valid JSON only, no markdown.",
          prompt: `Analyze this thought and return JSON with exactly these fields:
- tags: array of 3-5 short lowercase tags
- category: one of: idea, learning, question, reference, plan, reflection
- summary: one sentence max

Thought: ${thought.content.slice(0, 1000)}

Respond with only valid JSON like: {"tags":["tag1","tag2"],"category":"learning","summary":"..."}`,
        }),
      }
    );

    const { text } = await llmRes.json();
    const enrichment = JSON.parse(text);

    await supabase
      .from("thoughts")
      .update({
        tags: enrichment.tags,
        category: enrichment.category,
        summary: enrichment.summary,
        enriched_at: new Date().toISOString(),
      })
      .eq("id", thought.id);

    return new Response("enriched", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("ok", { status: 200 });
  }
});
