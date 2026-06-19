import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const since = new Date();
    since.setDate(since.getDate() - 7);

    const { data: thoughts } = await supabase
      .from("thoughts")
      .select("content, category, summary, tags")
      .gte("created_at", since.toISOString())
      .or("category.is.null,category.neq.digest")
      .order("created_at", { ascending: true });

    if (!thoughts || thoughts.length < 5) {
      console.log("Not enough thoughts for digest:", thoughts?.length ?? 0);
      return new Response("not enough content", { status: 200 });
    }

    const grouped = thoughts.reduce((acc, t) => {
      const cat = t.category ?? "uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(t.summary ?? t.content.slice(0, 200));
      return acc;
    }, {} as Record<string, string[]>);

    const groupedText = Object.entries(grouped)
      .map(([cat, items]) => `${cat.toUpperCase()}:\n${items.map(i => `- ${i}`).join("\n")}`)
      .join("\n\n");

    const llmRes = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/call-llm`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          systemPrompt: "You are a personal knowledge assistant writing a weekly brain digest.",
          prompt: `Here are the thoughts captured this week, grouped by category:

${groupedText}

Write a weekly digest with:
1. Key themes across everything captured
2. What I seem to be learning or exploring
3. One interesting question that emerges from this week's captures
4. 3 specific thoughts worth revisiting

Keep it conversational, under 400 words.`,
          maxTokens: 600,
        }),
      }
    );

    const { text } = await llmRes.json();

    await supabase.from("thoughts").insert({
      content: `WEEKLY DIGEST\n\n${text}`,
      category: "digest",
      summary: "Auto-generated weekly brain digest",
      tags: ["digest", "weekly"],
      enriched_at: new Date().toISOString(),
    });

    return new Response("digest saved", { status: 200 });
  } catch (err) {
    console.error(err);
    return new Response("error", { status: 500 });
  }
});
