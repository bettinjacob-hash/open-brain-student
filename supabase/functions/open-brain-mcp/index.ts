import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tool definitions returned by tools/list
const TOOLS = [
  {
    name: "search_thoughts",
    description: "Search your brain for thoughts matching a query string",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search term to look for" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_recent",
    description: "List the most recently captured thoughts",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "How many thoughts to return (default 10)" },
      },
    },
  },
  {
    name: "add_thought",
    description: "Save a new thought to the brain",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The thought content to save" },
      },
      required: ["content"],
    },
  },
];

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Validate the MCP access key from the Authorization header
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "").trim();
  const expectedKey = Deno.env.get("MCP_ACCESS_KEY");

  if (!expectedKey || token !== expectedKey) {
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Build a Supabase client using the service role key (full DB access, server-side only)
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  const { id, method, params = {} } = body;

  // ── initialize ── required MCP handshake
  if (method === "initialize") {
    return jsonRpcOk(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "open-brain", version: "1.0" },
    });
  }

  // ── notifications ── client sends these with no id; just acknowledge
  if (typeof method === "string" && method.startsWith("notifications/")) {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // ── tools/list ── return the tool catalog
  if (method === "tools/list") {
    return jsonRpcOk(id, { tools: TOOLS });
  }

  // ── tools/call ── execute one of the tools
  if (method === "tools/call") {
    const toolName = params.name as string;
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

    // search_thoughts: ilike search across content, return top 10
    if (toolName === "search_thoughts") {
      const query = toolArgs.query as string;
      const { data, error } = await supabase
        .from("thoughts")
        .select("id, content, created_at")
        .ilike("content", `%${query}%`)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) return jsonRpcError(id, -32603, error.message);
      return jsonRpcOk(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });
    }

    // list_recent: return newest N thoughts
    if (toolName === "list_recent") {
      const limit = (toolArgs.limit as number) ?? 10;
      const { data, error } = await supabase
        .from("thoughts")
        .select("id, content, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return jsonRpcError(id, -32603, error.message);
      return jsonRpcOk(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });
    }

    // add_thought: insert a new row
    if (toolName === "add_thought") {
      const content = toolArgs.content as string;
      const { data, error } = await supabase
        .from("thoughts")
        .insert({ content })
        .select()
        .single();

      if (error) return jsonRpcError(id, -32603, error.message);
      return jsonRpcOk(id, {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      });
    }

    return jsonRpcError(id, -32601, `Unknown tool: ${toolName}`);
  }

  return jsonRpcError(id, -32601, `Method not found: ${method}`);
});

// ── helpers ──────────────────────────────────────────────────────────────────

function jsonRpcOk(id: unknown, result: unknown): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, result }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

function jsonRpcError(id: unknown, code: number, message: string): Response {
  return new Response(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
