# Worker de WhatsApp de Lucía

Servicio Node.js que mantiene vinculado el **número central** de las hostales
(con Baileys) y conecta WhatsApp con el ERP. Corre fuera de Vercel porque
necesita estar encendido todo el día.

```
WhatsApp ⇄ worker (Railway) ⇄ Supabase (mensajes, cola, sesión)
                    │
                    └─► ERP /api/lucia/process  → Claude genera el borrador
```

- Guarda cada mensaje en `lucia_messages`. Ignora grupos, estados, canales y
  los contactos excluidos.
- Si alguien del equipo escribe desde el teléfono, Lucía se pausa 12 horas en
  ese chat.
- Audios, imágenes y archivos quedan marcados como "requiere revisión humana".
- Espera unos 8 segundos tras el último mensaje del cliente y le pide el
  borrador al ERP. El worker **no** tiene la clave de Claude.
- Envía solo lo que alguien aprobó en la bandeja: muestra "escribiendo…",
  espera según el largo del texto y respeta el máximo de mensajes por minuto.
- La sesión de WhatsApp se guarda en `lucia_wa_auth`: un reinicio no pide otro
  QR. Si se cae, se reconecta sola.

## Puesta en marcha en Railway

1. En railway.com: plan **Hobby**, luego **New Project → Deploy from GitHub
   repo** → este repositorio.
2. En el servicio, **Settings → Root Directory**: `worker/lucia`. Railway
   detecta Node y ejecuta `npm start`.
3. **Settings → Deploy**: deja **1 réplica**. Dos instancias con la misma
   sesión se desconectan entre sí.
4. **Variables**:

   | Variable | Valor |
   | --- | --- |
   | `SUPABASE_URL` | La misma `NEXT_PUBLIC_SUPABASE_URL` de Vercel |
   | `SUPABASE_SECRET_KEY` | La misma `SUPABASE_SECRET_KEY` de Vercel |
   | `ERP_URL` | URL pública del ERP, por ejemplo `https://tu-erp.vercel.app` |
   | `LUCIA_WORKER_SECRET` | Texto aleatorio de 32 o más caracteres. **El mismo valor** va en Vercel |

5. En **Vercel → Settings → Environment Variables** agrega
   `LUCIA_WORKER_SECRET` (el mismo valor) y confirma que exista
   `ANTHROPIC_API_KEY`. Luego haz un redeploy.
6. En el ERP, entra a **Hostales → Prospectos (Lucía) → Conexión y consumo**
   y escanea el QR desde el teléfono del número central: WhatsApp →
   Dispositivos vinculados → Vincular un dispositivo.

Variables opcionales: `LUCIA_DEBOUNCE_MS` (espera antes de pedir el borrador,
8000 por defecto), `LOG_LEVEL` y `LUCIA_COMPANY_ID`.

## Cuidado del número

Baileys no es oficial. WhatsApp puede bloquear números que parezcan
automatizados. Para reducir el riesgo:

- Usa el número nuevo de forma normal una o dos semanas antes de conectarlo.
- No envíes mensajes masivos ni a personas que no escribieron primero.
- Mantén el teléfono encendido y con WhatsApp al menos cada 14 días.

## Desarrollo local

```bash
npm install
SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SECRET_KEY=... ERP_URL=http://localhost:3000 LUCIA_WORKER_SECRET=... npm start
```
