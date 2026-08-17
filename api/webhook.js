// api/webhook.js
// Vercel Function. Deployala tal cual esta en la carpeta /api de tu proyecto Vercel.
//
// Flujo:
// 1. Meta llama a GET /api/webhook para verificar el webhook (una sola vez, al configurarlo).
// 2. Meta llama a POST /api/webhook cada vez que un cliente escribe por WhatsApp.
// 3. Tomamos el texto, generamos su embedding, buscamos los articulos mas
//    relevantes en Supabase, y le pasamos ese contexto + la pregunta a Claude.
// 4. Mandamos la respuesta de Claude de vuelta por WhatsApp.

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Sos el asistente de soporte de GproSoft, un sistema ERP.
Respondes dudas de los clientes sobre como usar el sistema, basandote
UNICAMENTE en los instructivos que se te pasan como contexto.

Reglas:
- Si el contexto no tiene la respuesta, decilo claramente y sugerí contactar
  al soporte humano de GproSoft. No inventes rutas de acceso ni pasos.
  - Respondé de forma breve y en pasos numerados cuando el instructivo lo permita.
  - Usa "vos/vení/hacé" (español rioplatense), tono cordial y directo.
  - No menciones que estás usando "artículos" o "base de conocimiento"; simplemente
    respondé como si supieras el procedimiento.`;

async function embedQuery(text) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
                  Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
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

async function searchKnowledgeBase(question, matchCount = 4) {
    const queryEmbedding = await embedQuery(question);
    const { data, error } = await supabase.rpc("match_kb_articles", {
          query_embedding: queryEmbedding,
          match_count: matchCount,
    });
    if (error) throw error;
    return data;
}

async function askClaude(question, contextArticles) {
    const context = contextArticles
      .map((a) => `### ${a.title}\n${a.content}`)
      .join("\n\n---\n\n");

  const msg = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system: SYSTEM_PROMPT,
        messages: [
          {
                    role: "user",
                    content: `Contexto (instructivos de GproSoft relevantes):\n\n${context}\n\n---\n\nPregunta del cliente: ${question}`,
          },
              ],
  });
    return msg.content[0].text;
}

async function sendWhatsAppMessage(to, text) {
    const url = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    await fetch(url, {
          method: "POST",
          headers: {
                  Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to,
                  text: { body: text },
          }),
    });
}

export default async function handler(req, res) {
    if (req.method === "GET") {
          const mode = req.query["hub.mode"];
          const token = req.query["hub.verify_token"];
          const challenge = req.query["hub.challenge"];
          if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
                  return res.status(200).send(challenge);
          }
          return res.status(403).send("Forbidden");
    }

  if (req.method === "POST") {
        try {
                const entry = req.body?.entry?.[0];
                const change = entry?.changes?.[0];
                const message = change?.value?.messages?.[0];

          if (!message || message.type !== "text") {
                    return res.status(200).send("ok");
          }

          const from = message.from;
                const question = message.text.body;

          const relevantArticles = await searchKnowledgeBase(question);
                const answer = await askClaude(question, relevantArticles);
                await sendWhatsAppMessage(from, answer);

          return res.status(200).send("ok");
        } catch (err) {
                console.error(err);
                return res.status(200).send("error-handled");
        }
  }

  return res.status(405).send("Method not allowed");
}
