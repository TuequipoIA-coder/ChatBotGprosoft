// ingest.js
// Corre esto UNA VEZ (o cada vez que actualices la base de conocimiento) para
// cargar los articulos en Supabase con sus embeddings.
//
// Uso: node ingest.js
//
// Requiere: knowledge_base.json en la misma carpeta (el archivo que ya armamos
// con los 169 articulos extraidos de los PDFs de GproSoft/Redline).

import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VOYAGE_API_KEY = process.env.VOYAGE_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VOYAGE_API_KEY) {
    console.error(
          "Faltan variables de entorno. Revisa SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY y VOYAGE_API_KEY."
        );
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Voyage AI cobra por token y tiene 200M tokens gratis en la cuenta nueva.
// voyage-4-lite produce vectores de 1024 dimensiones (coincide con la tabla).
async function embedBatch(texts) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
                  Authorization: `Bearer ${VOYAGE_API_KEY}`,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify({
                  input: texts,
                  model: "voyage-4-lite",
                  input_type: "document",
          }),
    });
    if (!res.ok) {
          throw new Error(`Voyage API error: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    return data.data.map((d) => d.embedding);
}

async function main() {
    const articles = JSON.parse(fs.readFileSync("./knowledge_base.json", "utf-8"));
    console.log(`Cargando ${articles.length} articulos...`);

  const BATCH_SIZE = 10;
    for (let i = 0; i < articles.length; i += BATCH_SIZE) {
          const batch = articles.slice(i, i + BATCH_SIZE);

      const texts = batch.map((a) => `${a.title}\n\n${a.content}`);
          const embeddings = await embedBatch(texts);

      const rows = batch.map((a, idx) => ({
              id: a.id,
              title: a.title,
              source_doc: a.source_doc,
              content: a.content,
              char_count: a.char_count,
              embedding: embeddings[idx],
      }));

      const { error } = await supabase.from("kb_articles").upsert(rows);
          if (error) {
                  console.error(`Error en batch ${i}-${i + BATCH_SIZE}:`, error.message);
          } else {
                  console.log(`Cargados ${i + batch.length}/${articles.length}`);
          }
    }

  console.log("Listo. Base de conocimiento cargada en Supabase.");
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
