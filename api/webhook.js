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

async function sendWhatsAppMessage(to, text) {
    const url = "https://graph.facebook.com/v21.0/" + process.env.WHATSAPP_PHONE_NUMBER_ID + "/messages";
    const res = await fetch(url, {
          method: "POST",
          headers: {
                  Authorization: "Bearer " + process.env.WHATSAPP_TOKEN,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify({
                  messaging_product: "whatsapp",
                  to: to,
                  text: { body: text },
          }),
    });
    const responseBody = await res.text();
    if (!res.ok) {
          console.error("Error enviando WhatsApp:", res.status, responseBody);
    } else {
          console.log("WhatsApp enviado OK:", responseBody);
    }
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
                const entry = req.body && req.body.entry && req.body.entry[0];
                const change = entry && entry.changes && entry.changes[0];
                const message = change && change.value && change.value.messages && change.value.messages[0];

          if (!message || message.type !== "text") {
                    console.log("Webhook recibido sin mensaje de texto:", JSON.stringify(req.body));
                    return res.status(200).send("ok");
          }

          const from = message.from;
                const question = message.text.body;
                console.log("Mensaje recibido de", from, ":", question);

          const relevantArticles = await searchKnowledgeBase(question);
                const answer = await askClaude(question, relevantArticles);
                await sendWhatsAppMessage(from, answer);

          return res.status(200).send("ok");
        } catch (err) {
                console.error("Error en webhook:", err);
                return res.status(200).send("error-handled");
        }
  }

  return res.status(405).send("Method not allowed");
}
