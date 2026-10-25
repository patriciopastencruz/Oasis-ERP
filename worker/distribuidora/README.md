# Worker de WhatsApp del asistente de pedidos de la Distribuidora

Servicio Node.js que mantiene vinculado el WhatsApp de **Distribuidora Altiplánica** (con Baileys) y conecta
WhatsApp con el ERP. Corre fuera de Vercel porque necesita estar encendido todo el día. Es **independiente
del worker de Lucía**: otra sesión de WhatsApp, otras tablas (`dist_wa_*`) y otra clave.

```
WhatsApp ⇄ worker (Render) ⇄ Supabase (mensajes, cola, sesión)
                  │
                  └─► ERP /api/dist-assistant/process  → Claude responde y carga el pedido
```

- Guarda cada mensaje en `dist_wa_messages`. Ignora grupos, estados, canales y los contactos que se marcan como
  ignorados en el ERP (sus mensajes ni se guardan).
- Si alguien del equipo escribe desde el teléfono, el asistente se pausa en ese chat (tiempo configurable).
- Espera unos 8 segundos tras el último mensaje del cliente y le pide la respuesta al ERP. El worker **no** tiene
  la clave de Claude.
- Envía lo que el asistente dejó en cola, mostrando "escribiendo…" y respetando el máximo de mensajes por minuto.
  Si el cliente escribe otra cosa antes de que salga, esa respuesta se descarta.
- La sesión de WhatsApp se guarda en `dist_wa_auth`: un reinicio no pide otro QR.

## Puesta en marcha en Render

1. En Render crea un **Background Worker** nuevo desde este repositorio (aparte del de Lucía).
2. **Root Directory**: `worker/distribuidora` · **Build Command**: `npm ci` · **Start Command**: `npm start`.
3. Deja **1 instancia**. Dos instancias con la misma sesión se desconectan entre sí.
4. **Variables de entorno**:

   | Variable | Valor |
   | --- | --- |
   | `SUPABASE_URL` | La misma `NEXT_PUBLIC_SUPABASE_URL` de Vercel |
   | `SUPABASE_SECRET_KEY` | La misma `SUPABASE_SECRET_KEY` de Vercel |
   | `ERP_URL` | URL pública del ERP, por ejemplo `https://www.oasis-erp.cl` |
   | `DIST_WORKER_SECRET` | Texto aleatorio de 32 o más caracteres. **El mismo valor** va en Vercel |

5. En **Vercel → Settings → Environment Variables** agrega `DIST_WORKER_SECRET` (el mismo valor), confirma que
   exista `ANTHROPIC_API_KEY` y haz un redeploy.
6. En el ERP, entra a **Finanzas → Distribuidora → Asistente de pedidos → Conectar**, y escanea el QR desde el
   teléfono del número de la distribuidora: WhatsApp → Dispositivos vinculados → Vincular un dispositivo.
7. Antes de activar el asistente, en **Ajustes** elige el usuario a cuyo nombre se crean los pedidos, agrega los
   números que no debe atender (equipo, proveedores, familia) y pruébalo en el simulador.

Variables opcionales: `DIST_DEBOUNCE_MS` (espera antes de pedir la respuesta, 8000 por defecto) y `LOG_LEVEL`.

## Cuidado del número

Baileys no es oficial. WhatsApp puede bloquear números que parezcan automatizados:

- Úsalo de forma normal; no envíes mensajes masivos ni a personas que no escribieron primero.
- Mantén el teléfono encendido y con WhatsApp al menos cada 14 días.
- Al ser un dispositivo vinculado, el teléfono sigue funcionando como siempre para el equipo.
