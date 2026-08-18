import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = "Sos el asistente de soporte de GproSoft, un sistema ERP. Respondes dudas de los clientes sobre como usar el sistema, basandote UNICAMENTE en los instructivos que se te pasan como contexto. Si el contexto no tiene la respuesta, decilo claramente y sugeri contactar al soporte humano de GproSoft. No inventes rutas de acceso ni pasos. Responde de forma breve y en pasos numerados cuando el instructivo lo permita. Usa vos, tono cordial y directo, en espanol rioplatense.";

async function embedQuery(text) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
                  Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify({
                  input: [text],
                  model: "voyage-4-lite",
                  input_type: "query",
          }),
    });
    const data = await res.json();
    return data.data[0].embedding;
}

async function searchKnowledgeBase(question, matchCount) {
    matchCount = matchCount || 4;
    const queryEmbedding = await embedQuery(question);
    const result = await supabase.rpc("match_kb_articles", {
          query_embedding: queryEmbedding,
          match_count: matchCount,
    });
    if (result.error) throw result.error;
    return result.data;
}

async function askClaude(question, contextArticles) {
    const context = contextArticles
      .map(function (a) { return "### " + a.title + "\n" + a.content; })
      .join("\n\n---\n\n");

  const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
                    role: "user",
                    content: "Contexto (instructivos de GproSoft relevantes):\n\n" + context + "\n\n---\n\nPregunta del cliente: " + question,
          },
              ],
  });
    return msg.content[0].text;
}

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
        return res.status(200).end();
  }

  if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed" });
  }

  try {
        const message = req.body && req.body.message;
        if (!message) {
                return res.status(400).json({ error: "Falta el mensaje" });
        }

      const relevantArticles = await searchKnowledgeBase(message);
        const reply = await askClaude(message, relevantArticles);

      const goodMatches = relevantArticles.filter(function (a) {
              return a.similarity > 0.5;
      });
        const articleIds = goodMatches.slice(0, 2).map(function (a) { return a.id; });

      return res.status(200).json({ reply: reply, articleIds: articleIds });
  } catch (err) {
        console.error("Error en chat:", err);
        return res.status(500).json({ error: "Error interno, intenta de nuevo" });
  }
}
