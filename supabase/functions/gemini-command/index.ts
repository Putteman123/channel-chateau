import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, library_context, watch_history } = await req.json();

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const historyContext = watch_history?.length
      ? `\n\nAnvändarens senaste tittade: ${watch_history.map((h: any) => h.item_name).join(", ")}.`
      : "";

    const libraryContext = library_context
      ? `\n\nBiblioteksinfo: ${library_context.channelCount} kanaler, ${library_context.movieCount} filmer, ${library_context.seriesCount} serier.`
      : "";

    const systemPrompt = `Du är en smart och charmig TV-assistent för appen "Channel Chateau". Du hjälper användaren navigera, hitta innehåll och styra appen.

Svara ALLTID på svenska. Var kort och koncis.

VIKTIGT: Svara ALLTID med ett tool call till tv_action. Inkludera ett kort meddelande i "message" och rätt action.

REGLER FÖR VILKEN ACTION DU SKA VÄLJA:
- Om användaren säger "vad ska jag se", "jag vill se något", "rekommendera" → ANVÄND SHOW_GENRES (visar genreknappar)
- Om användaren väljer en genre (Action, Komedi, etc) → ANVÄND FILTER_BY_GENRE
- Om användaren säger "överraska mig" → ANVÄND SURPRISE_ME  
- Om användaren säger "fortsätt titta" → ANVÄND CONTINUE_WATCHING
- Om användaren nämner en skådis → ANVÄND FILTER_BY_ACTOR
- Om användaren nämner en specifik titel → ANVÄND PLAY_SPECIFIC
- Om användaren säger "live tv" → ANVÄND OPEN_HUB med hub "live"
- Om användaren säger "hitta en film" → ANVÄND SHOW_GENRES
- UNDVIK ASK_FOLLOWUP om du kan använda en mer specifik action istället. Använd ASK_FOLLOWUP BARA om du verkligen behöver mer info, och ge ALLTID med chips-array med minst 3 alternativ.

Tillgängliga actions:
- SHOW_GENRES: Visa genreväljare för användaren. Använd denna ALLTID när användaren inte vet vad hen vill se.
- SHOW_ACTORS: Visa skådespelarförslag. parameters: { suggestions: ["namn1", "namn2", ...] }
- PLAY_SPECIFIC: Spela specifikt innehåll. parameters: { query: "sökterm", type: "movie"|"series"|"channel" }
- FILTER_BY_ACTOR: Filtrera efter skådespelare. parameters: { actor: "namn" }
- FILTER_BY_GENRE: Filtrera efter genre. parameters: { genre: "genre" }
- OPEN_HUB: Öppna en specifik sektion. parameters: { hub: "movies"|"series"|"live"|"favorites"|"continue" }
- SURPRISE_ME: Välj något slumpmässigt åt användaren.
- CONTINUE_WATCHING: Visa fortsätt titta.
- SHOW_RECOMMENDATIONS: Visa rekommendationer baserat på historik. parameters: { suggestions: [{title, reason}] }
- ASK_FOLLOWUP: Ställ en följdfråga med nya chips. parameters: { question: "fråga", chips: ["val1", "val2", ...] }. chips MÅSTE alltid ha minst 3 alternativ.
${historyContext}${libraryContext}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: [
          {
            type: "function",
            function: {
              name: "tv_action",
              description: "Utför en åtgärd i TV-appen",
              parameters: {
                type: "object",
                properties: {
                  action: {
                    type: "string",
                    enum: [
                      "SHOW_GENRES", "SHOW_ACTORS", "PLAY_SPECIFIC",
                      "FILTER_BY_ACTOR", "FILTER_BY_GENRE", "OPEN_HUB",
                      "SURPRISE_ME", "CONTINUE_WATCHING", "SHOW_RECOMMENDATIONS",
                      "ASK_FOLLOWUP",
                    ],
                  },
                  message: { type: "string", description: "Kort meddelande till användaren" },
                  parameters: {
                    type: "object",
                    description: "Extra parametrar beroende på action",
                  },
                },
                required: ["action", "message"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "tv_action" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit - försök igen om en stund." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI-krediter slut." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI-fel" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fallback if no tool call
    const content = data.choices?.[0]?.message?.content || "Jag förstod inte riktigt.";
    return new Response(
      JSON.stringify({ action: "ASK_FOLLOWUP", message: content, parameters: { chips: [] } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("gemini-command error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
