import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

export const config = { maxDuration: 60 };

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

async function embedBatch(texts) {
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
                  Authorization: "Bearer " + process.env.VOYAGE_API_KEY,
                  "Content-Type": "application/json",
          },
          body: JSON.stringify({
                  input: texts,
                  model: "voyage-4-lite",
                  input_type: "document",
          }),
    });
    if (!res.ok) {
          var errText = await res.text();
          throw new Error("Voyage error " + res.status + ": " + errText);
    }
    var data = await res.json();
    return data.data.map(function (d) { return d.embedding; });
}

export default async function handler(req, res) {
    try {
          var filePath = path.join(process.cwd(), "knowledge_base.json");
          var raw = fs.readFileSync(filePath, "utf-8");
          var articles = JSON.parse(raw);

      var loaded = 0;
          var BATCH_SIZE = 10;

      for (var i = 0; i < articles.length; i += BATCH_SIZE) {
              var batch = articles.slice(i, i + BATCH_SIZE);
              var texts = batch.map(function (a) { return a.title + "\n\n" + a.content; });
              var embeddings = await embedBatch(texts);

            var rows = batch.map(function (a, idx) {
                      return {
                                  id: a.id,
                                  title: a.title,
                                  source_doc: a.source_doc,
                                  content: a.content,
                                  char_count: a.char_count,
                                  embedding: embeddings[idx],
                      };
            });

            var result = await supabase.from("kb_articles").upsert(rows);
              if (result.error) {
                        return res.status(500).json({ error: result.error.message, loaded: loaded });
              }
              loaded += batch.length;
      }

      return res.status(200).json({ ok: true, loaded: loaded, total: articles.length });
    } catch (err) {
          return res.status(500).json({ error: String(err && err.message ? err.message : err) });
    }
}
