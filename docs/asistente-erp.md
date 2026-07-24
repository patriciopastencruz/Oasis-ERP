# Asistente ERP — arquitectura y operación

Copiloto conversacional embebido en Oasis ERP. Ayuda a cualquier usuario autenticado a entender dónde está, qué puede hacer y qué le falta, respondiendo solo con información verificada del propio código del ERP (nunca inventa módulos, botones ni reglas). Puede además consultar en vivo un puñado de datos de solo lectura (Nivel 2) respetando siempre los permisos y RLS del usuario. Las acciones de escritura (Nivel 3) están explícitamente deshabilitadas en esta entrega.

## Arquitectura

```
src/modules/assistant/
  domain/types.ts          Tipos compartidos (AssistantContext, AssistantResponse, KnowledgeArticle, ...)
  providers/
    ai-provider.ts          Interfaz AIProvider intercambiable
    anthropic-provider.ts   Implementación con @anthropic-ai/sdk (tool-use forzado + loop de herramientas)
    system-prompt.ts         Reglas del sistema (anti-invención, anti-injection)
  application/
    context-service.ts      Reconstruye el contexto real del usuario en el servidor
    knowledge-service.ts    Filtra/pondera artículos de conocimiento por permiso, ruta y palabras clave
    action-validator.ts     Descarta cualquier acción de navegación inventada o sin permiso
    actions.ts               Server actions para historial/mensajes/mensaje de bienvenida
    admin-actions.ts         Server actions del panel administrativo
  tools/
    types.ts                 Interfaz AssistantTool (read/write)
    read-tools.ts             5 herramientas de solo lectura (Nivel 2)

src/assistant/knowledge/
  types.ts                     ERPModuleDefinition / ERPRoute
  generated-modules.json      Inventario de rutas y permisos reales, usado por action-validator

src/components/assistant/     Botón flotante + panel (client components)
src/app/api/assistant/        Endpoints de chat y feedback
src/app/(portal)/admin/assistant/  Panel administrativo (assistant.admin.manage)

supabase/migrations/
  20260723010000_assistant_erp.sql          Tablas, RLS, permiso nuevo
  20260723020000_assistant_knowledge_seed.sql  20 artículos de conocimiento iniciales (verificados)
```

## Base de datos

6 tablas nuevas (RLS habilitada en todas):

- `assistant_settings` (1 fila por empresa): activar/desactivar, límite diario de mensajes, mensaje de bienvenida.
- `assistant_knowledge_articles`: conocimiento verificado, en base de datos (no archivos estáticos) — así el ciclo "pregunta no resuelta → revisión humana → nuevo artículo" no requiere desplegar código.
- `assistant_conversations` / `assistant_messages`: historial por usuario (cada usuario ve solo lo propio; `assistant.admin.manage` puede ver todo).
- `assistant_feedback`: 👍/👎 + comentario opcional, único por mensaje y usuario.
- `assistant_unresolved_questions`: preguntas que el modelo no pudo responder con seguridad, con estado `pending/reviewed/resolved`.

Permiso nuevo: `assistant.admin.manage` (módulo `assistant`), otorgado solo a `superadmin`.

## Contexto enviado al modelo (y lo que nunca se envía)

Cada consulta reconstruye en el servidor (`context-service.ts`, vía `requireSession()`): usuario, rol, permisos reales, pantalla actual (ruta/módulo/título) y contexto de UI (campos visibles/requeridos, estado, errores de validación). El `currentScreen`/`uiContext` que manda el cliente es solo una pista de qué pantalla está viendo — nunca se usa para autorizar nada; los permisos siempre se recalculan en el servidor.

**Nunca se envía al modelo:** contraseñas, tokens, cookies, API keys, variables de entorno, ni datos de otros usuarios.

## Conocimiento y recuperación

`knowledge-service.ts` filtra los artículos por permiso/rol del usuario y por pertenencia a la empresa, y pondera por coincidencia de ruta actual, módulo y palabras clave de la pregunta (sin embeddings en esta versión — preparado para agregarlos después sin cambiar la interfaz). Solo se envían al modelo los artículos relevantes (máx. 6), no toda la base de conocimiento.

## Capa de IA

`AnthropicAssistantProvider` usa `@anthropic-ai/sdk` con dos mecanismos:

1. **Salida forzada por tool-use**: el modelo solo puede responder invocando la herramienta `respond` con un schema JSON fijo — nunca texto libre, código ni SQL.
2. **Loop de herramientas de lectura (Nivel 2)**: el modelo puede invocar hasta 4 iteraciones de herramientas de solo lectura (`tools/read-tools.ts`) antes de responder — cada herramienta corre con el cliente de Supabase de la sesión del propio usuario, así que RLS ya limita los resultados a lo que puede ver.

Si `ANTHROPIC_API_KEY` no está configurada, el proveedor expone `isConfigured() === false` y el endpoint responde `errorCode: "not_configured"` sin romper la aplicación.

## Herramientas de lectura (Nivel 2)

`search_payment_request`, `check_material_stock`, `check_petty_cash_report`, `check_distribution_order`, `check_quotation_status` — todas de solo lectura, cada una declara `requiredPermission` y solo se ofrecen al modelo si el usuario lo tiene.

## Endpoints

- `POST /api/assistant/chat`: valida sesión, `assistant_settings.enabled`, límite diario de mensajes; arma contexto + artículos relevantes; llama al proveedor con las herramientas de lectura permitidas; valida las acciones propuestas (`action-validator.ts`); persiste ambos mensajes; si `resolved:false`, registra la pregunta como no resuelta.
- `POST /api/assistant/feedback`: guarda 👍/👎 + comentario opcional (único por mensaje/usuario).

## Interfaz

Botón flotante inferior derecho (ícono + "Asistente ERP" en escritorio, solo ícono en móvil) que abre un panel lateral responsive (pantalla completa en móvil). El panel detecta automáticamente módulo/ruta actual vía `usePathname()` (mismo patrón que `useIsAdminGeneral`), soporta nueva conversación, historial de conversaciones propias, sugerencias rápidas, feedback por mensaje, cancelar una consulta en curso y reintentar tras un error.

## Panel administrativo

`/admin/assistant` (permiso `assistant.admin.manage`): activar/desactivar, límite diario, mensaje de bienvenida, contadores (conversaciones totales, mensajes hoy, preguntas pendientes, feedback útil/no útil), listado de preguntas no resueltas con filtro por estado y dos acciones por pregunta — marcarla resuelta con una respuesta, o **crear un artículo de conocimiento directamente desde la pregunta** (queda `validation_status: "verified"` y resuelve la pregunta automáticamente). Listado de artículos con activar/desactivar.

## Seguridad

- Autenticación y permisos siempre re-verificados en el servidor (`requireSession`/`requirePermission`), nunca confiando en lo que envía el cliente.
- Salida del modelo restringida a un schema JSON fijo (tool-use forzado) — no puede emitir código ni SQL.
- Toda acción de navegación propuesta se valida contra el inventario real de rutas y el permiso del usuario antes de mostrarse (`action-validator.ts`).
- Límite diario de mensajes por usuario, configurable por empresa.
- El system prompt (`system-prompt.ts`) instruye explícitamente rechazar intentos de ignorar las reglas, pedir acceso de administrador, revelar secretos, datos de otros usuarios, ejecutar SQL o aprobar/eliminar sin autorización.
- Ninguna acción de escritura está implementada: `tools/types.ts` define el modo `"write"` para uso futuro, pero el registro de herramientas actual (`read-tools.ts`) solo contiene herramientas `mode: "read"`.

## Variables de entorno

```
ANTHROPIC_API_KEY=
ASSISTANT_AI_MODEL=claude-haiku-4-5-20251001
```

Sin `ANTHROPIC_API_KEY`, el asistente sigue siendo funcional (botón visible, mensaje de bienvenida, historial) pero responde "servicio no configurado" a cualquier consulta.

## Cómo extender

- **Agregar un módulo nuevo**: agregar su entrada a `src/assistant/knowledge/generated-modules.json` (rutas + permiso exacto) y artículos correspondientes en `assistant_knowledge_articles` (vía migración o el panel administrativo).
- **Agregar un artículo**: insertar en `assistant_knowledge_articles` con `validation_status: "verified"` solo si el contenido está confirmado en código real; si no, `"pending"`.
- **Agregar una herramienta de lectura**: implementar `AssistantTool` en `tools/read-tools.ts` con `mode: "read"` y agregarla a `READ_TOOLS`.
- **Habilitar una acción de escritura (segunda etapa)**: implementar la herramienta con `mode: "write"` y `requiresConfirmation: true`, y agregar en el endpoint de chat el paso de confirmación explícita del usuario antes de ejecutarla — no está implementado en esta entrega.

## Fuera de alcance en esta entrega (recomendación de segunda etapa)

Búsqueda vectorial/embeddings, acciones de escritura (Nivel 3), gráficos de estadísticas (v1 usa contadores simples), streaming de respuesta token a token.
