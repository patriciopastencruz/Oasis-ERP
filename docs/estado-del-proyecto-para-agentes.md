# Estado del proyecto y guía de traspaso para agentes

Documento de contexto para cualquier agente o persona que continúe el trabajo (Claude Code, Codex, ChatGPT u otro). Complementa a `AGENTS.md` (reglas permanentes). **Última verificación contra el código: 2026-10-22.** Si pasó tiempo, contrastar con `git log` antes de confiar en lo que sigue.

> El repositorio es **público**. No subir claves, `.env`, datos personales de huéspedes ni de personal. Este documento menciona roles y permisos, nunca personas.

## 1. Qué es esto

OASIS ERP: aplicación modular de una sola organización, en **Next.js 16 (App Router) + Supabase (Postgres, Auth, Storage, RLS)**, desplegada en **Vercel**. Idioma de la interfaz y de los mensajes de error: español de Chile. Moneda CLP, zona `America/Santiago`, formato `es-CL`.

Unidades de negocio (`business_units.code`):

| Código | Unidad | Módulos principales |
|---|---|---|
| `HU` | Hostal Uruguay | Reservas/calendario, pagos y comprobantes, check-in/out, cierre diario/mensual, **Gastos**, aseo/inspección (`/ops`), Lucía |
| `HOC` | Hostal Oasis Centro | Igual que hostales (sin Gastos por ahora) |
| `HOB` | Hostal Oasis Cobija | Igual que hostales (15 habitaciones cargadas) |
| `OM` | Oasis Modulares | Cotizaciones, **Proyectos**, inventario y materiales, agente comercial de WhatsApp |
| `DA` | Distribuidora Altiplánica | Pedidos, rutas, reparto (uso real en producción) |

Transversal: Finanzas (solicitud de pagos, aprobaciones, caja chica, proveedores), dashboard ejecutivo, tareas, notificaciones, asistente de IA del ERP, administración de usuarios/roles/permisos.

Mapa de documentación existente: `docs/architecture.md`, `docs/data-model.md`, `docs/security.md`, y un documento por módulo (`docs/hostal-uruguay-reservas.md`, `docs/proyectos-oasis-modulares.md`, `docs/whatsapp-agent.md`, `docs/lodging-operations.md`, etc.). **Lucía no tiene documento propio**: ver `worker/lucia/README.md` y sección 6.

## 2. Cómo llega un cambio a producción

Son **dos sistemas independientes**. Hacer solo uno deja producción inconsistente.

1. **Código**: `git push origin main` → GitHub → Vercel despliega solo. Vercel **no** ejecuta migraciones.
2. **Base de datos**: las migraciones de `supabase/migrations/` se aplican aparte con la CLI contra el proyecto vinculado (`oasiscompany`):
   - `npx supabase migration list --linked` (confirmar que no hay desfase del ledger)
   - `npx supabase db push --linked --dry-run` (ver qué se aplicaría)
   - `npx supabase db push --linked --yes`
   - Al final la CLI imprime un aviso "failed to cache migrations catalog / pg-delta certificate": es inofensivo. La señal real es "Applying migration …".
   - Si un push falla a mitad de camino, la migración (envuelta en `begin; … commit;`) se revierte entera; revisar `migration list` y corregir el SQL.
3. Orden: si el código depende de la migración, **aplicar primero la migración** o ambas casi a la vez. Código en vivo sin su migración rompe pantallas (ya ocurrió una vez).
4. Verificar el despliegue: estado del commit en GitHub (`gh api repos/<owner>/<repo>/commits/<sha>/status`) debe decir `success`; Vercel lo publica ahí.

Dominio de producción: `oasis-erp.cl` (redirige a `www`). `oasis-erp.vercel.app` solo muestra un aviso de cambio de dirección.

Crons (`vercel.json`; plan Hobby = máximo una vez al día por cron): vencimiento de reservas pendientes, envío de correos de aprobación, revisión con IA de comprobantes. Protegidos con `CRON_SECRET`.

Preferencia explícita del dueño: **cada cambio terminado debe quedar desplegado**, no commiteado y olvidado. Aun así, confirmar antes de empujar a `main` cuando hay otras sesiones activas (sección 3).

## 3. Trampas conocidas de trabajar aquí

- **Checkout compartido.** Varias sesiones de agentes trabajan en el mismo directorio y empujan a `main`. Un commit local en `main` NO está "en espera": el push de otra sesión lo publica. Para trabajo con migración aún no aprobada, usar una rama (no `main`) o desarrollar el SQL fuera de `supabase/migrations/` y crear el archivo real solo cuando esté final. No dejar migraciones a medias en esa carpeta: otra sesión puede ejecutar `db push` y aplicarlas en su versión intermedia.
- **Ledger de migraciones.** Una vez una migración se aplicó a producción con un timestamp distinto al del archivo. Se arregló con `supabase migration repair --status reverted|applied <version>`. Revisar siempre `migration list --linked` tras un hueco entre sesiones.
- **`.env.local` apunta a producción.** Para probar UI contra datos locales, crear un `.env.development.local` temporal (ignorado por git) con la URL y claves de `npx supabase status -o json` (Supabase local por Docker) y **borrarlo al terminar**. Next.js no deja correr dos servidores de desarrollo sobre el mismo directorio.
- **`supabase db query` ejecuta una sola sentencia** (falla con "cannot insert multiple commands"). Para varias, una llamada por sentencia.
- **No escribir contraseñas** en formularios al probar. Para sesiones de prueba locales se genera un enlace mágico con la API admin de Auth local y se inyecta la sesión (cookie `sb-<host>-auth-token`, valor `base64-` + JSON de la sesión).
- Archivos sin seguimiento en la raíz (PDF, JPEG, zips, manuales .docx) **no son del proyecto**: no agregarlos con `git add .`. Añadir siempre archivos por nombre.

## 4. Convenciones de código que conviene respetar

- Capas por módulo: `src/modules/<área>/{domain,application,database}`. `domain` puro y con tests; `application` con `queries.ts`, `actions.ts` ("use server") y esquemas Zod; `database/*.test.ts` verifica el SQL de las migraciones por coincidencia de texto.
- Lectura en Server Components; mutaciones en Server Actions; Client Components solo para interacción local.
- Las acciones de formulario terminan en `redirect()` con `?success=` / `?error=` mediante un helper local (`go()` en lodging, `done()` en otros módulos). **El helper debe elegir `&` o `?` según el path ya tenga query**; un bug por no hacerlo dejó pestañas en blanco en Proyectos.
- Cuando una acción se invoca desde código cliente (no desde un `<form>`) y un `redirect()` haría perder estado de pantalla, devuelve `{ ok, message }` (ejemplo: `reassignReservationRoomAction`).
- Arrastrar y soltar: eventos HTML5 nativos, sin librería, actualización optimista con reversión si el servidor rechaza (`draggable-order-rows.tsx`, `weekly-calendar.tsx`). `startTransition(async () => …)` es válido (React 19).
- **Preferir estado derivado de datos reales a banderas guardadas.** Ejemplo: `lodging_reservations.information_complete` solo se pone en `false` al importar por iCal y vale `true` por defecto, así que no sirve para saber si una reserva directa tiene precio. El punto del calendario se calcula en `hasCompleteInfo()` (precio > 0 y nombre real).
- Errores de exclusión de traslape (`23P01`) se traducen a "La habitación ya está reservada en esas fechas."
- Totales, estados y permisos nunca se confían al navegador: triggers y funciones SQL los calculan/validan (ver `AGENTS.md`).
- No se borran operaciones comerciales: estado, anulación o `deleted_at`, con `audit_logs`.
- Verificación antes de cerrar: `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build`. El único warning de lint conocido y ajeno es `_unused` en `twilio-provider.test.ts`.

## 5. Hostales: estado actual del calendario y de las reservas

Detalle operativo en `docs/hostal-uruguay-reservas.md`. Lo que más confunde a quien llega tarde:

- **Desde 2026-10-19 el calendario es manual.** La conexión por iCal con Booking y Airbnb está **desactivada**: migración `20261019170000_lodging_disable_ota_calendar_sync.sql` (configs inactivas, `export_enabled=false`), sin cron de sincronización, la pantalla `/lodging/ical` redirige a `/lodging`. No se borró nada: las reservas ya importadas siguen como reservas normales. El código de `synchronizeUnit()` sigue en `actions.ts` pero está sin uso. Reservas manuales y reservas de origen iCal pueden solaparse en una misma habitación (se muestran en carriles); manual+manual no.
- **Si algún día se reactiva iCal**, recordar lo aprendido: (1) la reconciliación "ausente dos veces ⇒ cancelada" debe limitarse a estadías cuyo `ends_on` es hoy o después (ya implementado), porque Booking/Airbnb dejan de listar estadías terminadas y el sistema las cancelaba solas; (2) la misma `UID` puede venir en el feed de varias habitaciones que comparten "tipo de habitación" en la OTA, y el sync la registra una vez por habitación (reservas duplicadas); aún no hay deduplicación.
- **Calendario** (`src/components/lodging/weekly-calendar.tsx`): 10 días desde ayer, navegación por semanas, filtros por habitación y origen, estado operativo por habitación. Cada reserva muestra: nombre/origen, **punto verde/rojo** (verde = nombre real y precio > 0; rojo = falta alguno), ícono de **1 persona / varias** según `guest_count`, ícono de **ingreso** si `status = checked_in`, ícono de **dinero** si el pago tiene comprobante cargado, y un recuadro con datos al pasar el mouse.
- **Reasignar habitación arrastrando** una reserva a otra fila (requiere `lodging.reservations.manage`; no se pueden arrastrar anuladas ni con check-out). Valida que la habitación destino sea de la misma unidad y que no choque en fechas. Acción: `reassignReservationRoomAction`.
- **Completar información interna** (reservas importadas): la primera vez, nº de huéspedes, valor total y comisión salen vacíos; el nombre sugiere "Reserva Booking/Airbnb"; teléfono vacío. Al editar de nuevo se muestran los datos guardados (nunca se precarga un 0 como si fuera precio).
- **Pagos y comprobantes.** Registrar un pago mayor al saldo exige una observación (≥3 caracteres). Si la reserva tiene **precio $0** (no se ha completado la información), el saldo es $0 y cualquier pago "supera el saldo": hay que **guardar primero la información/precio y luego registrar el pago o adjuntar el comprobante**. Pendiente opcional: mensaje de error más claro para ese caso. Los comprobantes se pueden **quitar** con borrado lógico (`remove_lodging_payment_receipt`, permiso `lodging.payments.manage`, auditado); anular el **pago** requiere `lodging.payments.void`.
- **Permisos de pagos por rol:** `lodging.payments.manage` lo tiene Recepcionista (registra pagos, sube/quita comprobantes); `lodging.payments.void` (anular pagos) solo Administrador y Superadministrador. Anulación de reservas con aprobación: `lodging.reservations.cancel_request` / `cancel_approve`; eliminar reservas importadas de días pasados: `lodging.reservations.remove_past` (solo Superadministrador).
- **Gastos (solo HU por ahora)**: `/lodging/expenses`, tabla `lodging_expenses`, tipos en `lodging_finance_categories`. Todos eligen el tipo de gasto; solo administración administra la lista de tipos; el comprobante es obligatorio. **Decisión del dueño (2026-10-22):** los gastos declarados en el módulo Gastos son la fuente oficial; los gastos del **cierre diario** son solo referencia para conciliar y **nunca se suman** a los declarados (mostrarlos lado a lado). El estado de resultados futuro debe tomar `lodging_expenses` no anulados como fuente.

## 6. Lucía (asistente de WhatsApp de las hostales)

Nació el 2026-10-21 y es la parte más activa del repositorio. Código en `src/modules/lucia/`, pantallas en `/lodging/lucia`, migraciones `*_lucia_*.sql`. Un **worker en Railway** (`worker/lucia/`, Baileys) mantiene vinculado el número central de las hostales y conversa con el ERP (`/api/lucia/process`); la clave de Claude vive solo en el ERP. Funciones: borrador y respuesta automática con derivación a una persona, consulta de disponibilidad con fechas dichas por el cliente (sin suponer fechas), fotos de habitaciones, horarios de check-in/out por hostal, recontacto a los 20 minutos, preguntas del equipo a recepción, aviso por WhatsApp a uno o varios administradores que pueden responder OK/NO. Variable propia: `LUCIA_WORKER_SECRET`. Hay otro agente distinto, el **agente comercial de WhatsApp de Oasis Modulares** (Twilio/Meta, `docs/whatsapp-agent.md`).

## 7. Oasis Modulares: Proyectos

Módulo "Proyectos" (convertir una cotización aprobada en proyecto, gastos con IVA calculado en servidor, estado de resultados sin mezclar IVA, equipo, documentos privados, bitácora, cierre/reapertura/cancelación). Diseño y decisiones en `docs/proyectos-oasis-modulares.md`; migración base `20260727010000_om_projects.sql`. Lección registrada: en las políticas de Storage, calificar `storage.objects.name` cuando otra tabla del mismo subquery también tiene columna `name`.

## 8. Qué queda fuera del repositorio (no asumir que se sabe)

- El historial de conversaciones entre el dueño y los agentes; las decisiones de negocio recientes están aquí y en los mensajes de commit.
- Memorias locales de Claude Code (no viajan con el repo); lo relevante de ellas ya está resumido en las secciones 2, 3 y 5.
- Variables de entorno de Vercel y secretos de Supabase/Railway/Twilio/Resend/Anthropic.
- Correcciones puntuales hechas directamente sobre la base de producción (p. ej. cancelar una reserva duplicada a mano). Las reparaciones sistemáticas sí quedaron como migración (`20260914120000_lodging_restore_wrongly_cancelled_reservations.sql`).

## 9. Primeros pasos recomendados para un agente nuevo

1. Leer `AGENTS.md`, este documento y `docs/architecture.md`.
2. `git log --oneline -30` y `git status` (hay otras sesiones activas; no tocar sus archivos).
3. Si hay migraciones involucradas: `npx supabase migration list --linked` antes de planificar.
4. Probar en local con Supabase por Docker (sección 3), verificar con `pnpm test && pnpm lint && pnpm typecheck && pnpm build`.
5. Desplegar siguiendo la sección 2 y confirmar el estado `success` del commit.
