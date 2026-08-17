# Chatbot GproSoft - Guia paso a paso

Estado actual (cuentas nuevas, setup profesional):
- Proyecto Supabase creado: gprosoft-chatbot (org TuequipoIA-coder, plan Pro, $10/mes)
- - Tabla kb_articles con busqueda vectorial (pgvector), RLS habilitado y politica de
  -   lectura publica configurada
  -   - 169 articulos extraidos y estructurados (ver knowledge_base.json, subilo manualmente
      -   arrastrandolo a este repo si todavia no esta)
      -   - Codigo de ingesta (ingest.js) y backend de WhatsApp (api/webhook.js) listos
          - - Repo conectado a Vercel: cada push a main dispara un deploy automatico
           
            - ## 1. Conseguir las 3 claves que faltan (10 min)
           
            - 1. Voyage AI (genera los embeddings, gratis hasta 200M tokens):
              2.    - https://dash.voyageai.com/ -> creas cuenta -> API Keys -> copias la key.
                    - 2. Anthropic (Claude API):
                      3.    - https://console.anthropic.com/ -> API Keys -> creas una -> la copias.
                            - 3. Supabase service_role key (para que el script de carga pueda escribir):
                              4.    - https://supabase.com/dashboard/project/kczbfnatswgbkupipydt/settings/api
                                    -    - Copia la clave service_role (NO la anon, esa es publica).
                                     
                                         - Estas 3 claves NO van al repo. Se cargan directo en Vercel (Settings -> Environment
                                         - Variables) y, para correr ingest.js en tu compu, en un archivo .env local (copia
                                         - .env.example y completalo, ese archivo esta en .gitignore-equivalente por convencion,
                                         - no lo subas con las claves adentro).
                                     
                                         - ## 2. Cargar la base de conocimiento en Supabase (5 min)
                                     
                                         - npm install
                                         - node --env-file=.env ingest.js
                                     
                                         - Esto lee knowledge_base.json (los 169 articulos), genera un embedding para cada uno
                                         - con Voyage AI, y los sube a la tabla kb_articles en Supabase.
                                     
                                         - ## 3. Crear tu app de WhatsApp Business (Meta) (20-30 min)
                                     
                                         - 1. https://developers.facebook.com/ -> creas cuenta de desarrollador -> Mis apps ->
                                           2.    Crear app -> tipo Empresa.
                                           3.2. Agregas el producto WhatsApp.
                                             3. Meta te da un numero de prueba y un token temporal (dura 24hs, sirve para probar hoy).
                                             4. 4. Para produccion real necesitas: verificar tu negocio en Meta Business Manager,
                                                5.    conectar un numero de telefono propio, y generar un token permanente (System Users).
                                                6.5. Copias WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID a Vercel.

                                                  ## 4. Variables de entorno en Vercel

                                                Dashboard de Vercel -> proyecto gprosoft-chatbot -> Settings -> Environment Variables.
                                                Cargas las 6: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VOYAGE_API_KEY,
                                                ANTHROPIC_API_KEY, WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_VERIFY_TOKEN.
                                                Despues, cualquier push a main dispara un redeploy que las toma.

                                                ## 5. Conectar el webhook en Meta (5 min)

                                                1. Panel de WhatsApp de tu app de Meta -> Configuration -> Webhook.
                                                2. 2. URL de callback: https://gprosoft-chatbot.vercel.app/api/webhook
                                                   3. 3. Verify token: el mismo valor que pusiste en WHATSAPP_VERIFY_TOKEN.
                                                      4. 4. Te suscribis al campo messages.
                                                        
                                                         5. Listo. Cualquier cliente que le escriba a ese numero de WhatsApp una pregunta sobre
                                                         6. GproSoft recibe una respuesta generada con Claude, basada en los 169 instructivos.
                                                        
                                                         7. ## Costos mensuales estimados
                                                        
                                                         8. | Servicio | Costo |
                                                         9. |---|---|
                                                         10. | Supabase (Pro) | $10/mes |
                                                         11. | Vercel (Pro) | $20/mes |
                                                         12. | Voyage AI (embeddings) | Gratis (200M tokens incluidos) |
                                                         13. | Claude API (Haiku 4.5) | Pago por uso, ~$2-10/mes con uso moderado |
                                                         14. | WhatsApp Business API | Gratis (conversaciones de servicio) |
                                                        
                                                         15. Total realista: ~$35-45/mes.
                                                         16. 
