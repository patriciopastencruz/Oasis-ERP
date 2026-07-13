# Etapa 2A — Base de datos, seguridad y almacenamiento

## Estado

Los archivos están generados para revisión. **No se aplicaron a Supabase.** El seed exige reemplazar explícitamente el RUT real de Oasis Company y falla de forma segura mientras conserve el marcador.

## Orden de ejecución

1. `202607110001_platform_core.sql`: extensiones, tipos y núcleo multiempresa.
2. `202607110002_finance_payment_control.sql`: tablas financieras, relaciones e índices.
3. `202607110003_functions_triggers.sql`: RUT, correlativos, transiciones, caja chica, auditoría y notificaciones.
4. `202607110004_rls_policies.sql`: funciones de autorización, RLS y privilegios.
5. `202607110005_storage.sql`: buckets privados y políticas de objetos.
6. `202607110006_configurable_workflows_dashboards.sql`: workflows, instancias, decisiones y contratos de dashboard.
7. `seed.sql`: empresa, unidades, roles, permisos, flujos y configuración.

Cada migración usa una transacción. No cambie el orden ni ejecute el seed antes de las seis migraciones.
La migración 006 depreca las reglas simples sin borrarlas y convierte el seed inicial a tres workflows de una etapa por unidad.

## Revisión previa obligatoria

1. Revisar el diff completo de `supabase/migrations`.
2. Confirmar el RUT legal real de Oasis Company y reemplazar únicamente el marcador de `seed.sql`.
3. Confirmar códigos de unidades: `HOC`, `HOB`, `OM`, `DA`.
4. Revisar los permisos iniciales de cada rol; son presets editables.
5. Revisar especialmente todas las funciones `security definer`, que fijan `search_path = ''` y tienen ejecución revocada cuando solo son triggers.
6. Probar primero en Supabase local o en un proyecto de pruebas vacío.
7. Ejecutar `supabase/tests/verify_stage_2a.sql` y pruebas de comportamiento con seis usuarios separados.

## Aplicación futura (Etapa 2B)

Solo después de aprobación expresa:

```bash
supabase start
supabase db reset
```

Para un proyecto remoto, vincular el proyecto correcto, revisar `supabase db diff` y recién entonces usar el flujo oficial de `supabase db push`. No debe copiarse la clave service role al navegador.

## Reversión

Estas son migraciones fundacionales y su reversión elimina datos. Antes de producción, la forma segura es desechar y recrear la base local/de pruebas. En un entorno con datos, se requiere backup verificado y una migración compensatoria específica; no usar `DROP ... CASCADE` de manera improvisada.

Si una aplicación inicial falla dentro de una migración, la transacción revierte ese archivo. Si varias ya fueron aplicadas en un proyecto descartable, restablecer el proyecto local. En producción se debe restaurar un backup o point-in-time recovery cuando el plan contratado lo permita; los objetos de Storage requieren respaldo separado.

## Primer Superadministrador

1. Aplicar migraciones y seed con el RUT real.
2. Crear el primer usuario mediante Supabase Auth y verificar su correo.
3. Copiar su UUID exacto desde `auth.users`.
4. Desde SQL Editor, dentro de una transacción, insertar su perfil con el rol `superadmin`, asignarlo a Oasis Company y a las unidades necesarias:

```sql
begin;
-- Reemplace los valores; no guarde este script con datos personales.
insert into public.profiles(id, role_id, first_name, last_name, email, job_title, created_by)
select 'UUID_AUTH'::uuid, r.id, 'NOMBRE', 'APELLIDO', 'CORREO', 'Superadministrador', 'UUID_AUTH'::uuid
from public.roles r where r.key = 'superadmin';

insert into public.user_companies(user_id, company_id, created_by)
select 'UUID_AUTH'::uuid, c.id, 'UUID_AUTH'::uuid from public.companies c where c.code = 'OASIS';

insert into public.user_business_units(user_id, company_id, business_unit_id, created_by)
select 'UUID_AUTH'::uuid, bu.company_id, bu.id, 'UUID_AUTH'::uuid
from public.business_units bu join public.companies c on c.id = bu.company_id where c.code = 'OASIS';
commit;
```

Verificar que la consulta afecte exactamente un perfil. No crear contraseñas en SQL ni usar un usuario seed.

## Verificación de RLS

No basta consultar con `service_role`, porque omite RLS. Crear usuarios reales de prueba y obtener sesiones `authenticated` separadas:

- Trabajador A y B en la misma unidad: A no debe ver solicitudes de B.
- Administrador: ve su unidad, pero no otra y no aprueba sobre su regla.
- Finanzas: ve unidades asignadas y no aprueba el rango de Gerente de área.
- Gerente de área: aprueba su rango en unidades asignadas.
- Gerente general: puede reemplazar al aprobador dentro de empresas asignadas.
- Usuario sin asignación: no obtiene datos operacionales.
- Auditoría: no admite insert, update o delete desde cliente.
- Storage: URL pública falla; descarga autenticada o firmada funciona solo con autorización.

Las consultas de inventario están en `supabase/tests/verify_stage_2a.sql`. Las pruebas funcionales completas se agregarán antes de producción usando Supabase local.

## Convención de Storage

Todos los objetos usan rutas:

```text
{company_id}/{entity_id}/{uuid}.{extension}
```

Los buckets son privados, con límite de 10 MB y MIME PDF/JPEG/PNG. La base conserva nombre original, MIME, tamaño, uploader y ruta. Las URLs firmadas deberán emitirse por pocos minutos desde servidor.

## Riesgos abiertos

- Falta confirmar el RUT real de Oasis Company.
- Las reglas iniciales dejan saltos si se permiten montos con decimales; por eso CLP exige enteros.
- La auditoría de inicio de sesión requerirá un hook o acción de servidor en la Etapa 3; PostgreSQL no observa por sí solo todos los eventos de Auth.
- Los IP/user-agent completos deben enviarse desde una acción de servidor confiable.
- Los cambios de `auth.users` requieren APIs administrativas seguras y no quedan cubiertos solo por triggers del esquema público.
- Storage no forma parte del backup de base de datos; necesita estrategia propia.
- Las pruebas estáticas actuales no sustituyen pruebas RLS con sesiones reales en Supabase local.

## Lista de comprobación previa a Etapa 2B

- [x] RUT legal de Oasis Company confirmado como `78.271.136-9`.
- [x] RUT real incorporado en `supabase/seed.sql`.
- [ ] Confirmar que `public.is_valid_chilean_rut(RUT)` devuelve `true` en local.
- [ ] Confirmar códigos `HOC`, `HOB`, `OM` y `DA`.
- [ ] Instalar Docker Desktop y Supabase CLI.
- [ ] Ejecutar las seis migraciones y el seed con `supabase db reset` local.
- [ ] Ejecutar `supabase/tests/verify_stage_2a.sql` contra la base local.
- [ ] Ejecutar pruebas RLS con usuarios autenticados separados.
- [ ] Crear y verificar un backup del proyecto remoto.
- [ ] Confirmar que el proyecto remoto no contiene cambios manuales incompatibles.
- [ ] Ejecutar `supabase migration list` y resolver diferencias antes de continuar.
- [ ] Ejecutar `supabase db push --dry-run` y revisar exactamente seis migraciones pendientes.
- [ ] Obtener aprobación explícita antes del primer `supabase db push --include-seed`.

## Procedimiento exacto de aplicación

No ejecutar estos pasos hasta aprobar la Etapa 2B.

### A. Validación local obligatoria

1. Instalar Docker Desktop y dejarlo iniciado.
2. Desde la raíz del proyecto instalar la CLI como dependencia de desarrollo:

```bash
pnpm add -D supabase
pnpm exec supabase init
```

`init` debe conservar `supabase/migrations` y crear `supabase/config.toml`. Si indica que el proyecto ya está inicializado, no borrar la carpeta.

3. Reemplazar el marcador del RUT en `supabase/seed.sql`.
4. Iniciar el stack y reconstruir una base vacía:

```bash
pnpm exec supabase start
pnpm exec supabase db reset
```

`db reset` debe aplicar en orden `001` a `006` y después `seed.sql`. Si falla, detener el procedimiento y no vincular el proyecto remoto.

5. Obtener la URL local con:

```bash
pnpm exec supabase status
```

6. Ejecutar `supabase/tests/verify_stage_2a.sql` en el SQL Editor de Studio local (`http://127.0.0.1:54323`) o mediante `psql` usando la URL mostrada por `supabase status`.
7. Completar las pruebas con usuarios reales de Auth local. No probar RLS con `service_role`.

### B. Preparación remota

1. Crear un backup verificable desde Supabase antes de cualquier push.
2. Obtener el Project Ref desde Settings → General.
3. Iniciar sesión y vincular exactamente ese proyecto:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref REEMPLAZAR_PROJECT_REF
pnpm exec supabase migration list
```

4. Si el remoto no está vacío o la lista muestra divergencias, detenerse. No usar `migration repair` sin investigar la causa.
5. Hacer la simulación:

```bash
pnpm exec supabase db push --dry-run
```

La salida debe enumerar `202607110001` a `202607110006`, en ese orden, sin migraciones inesperadas.

### C. Aplicación remota, solo con aprobación

```bash
pnpm exec supabase db push --include-seed
pnpm exec supabase migration list
```

No ejecutar `supabase db reset --linked`: elimina entidades del proyecto remoto. Después del push, ejecutar la verificación de objetos indicada abajo y recién entonces crear el primer Superadministrador.

## Verificación posterior por objeto

Ejecutar `supabase/tests/verify_stage_2a.sql` y comprobar adicionalmente:

```sql
-- Tablas públicas esperadas y estado RLS.
select c.relname, c.relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r'
order by c.relname;

-- Seis migraciones registradas.
select version from supabase_migrations.schema_migrations order by version;

-- Políticas por tabla.
select schemaname,tablename,policyname,cmd
from pg_policies where schemaname in ('public','storage')
order by schemaname,tablename,policyname;

-- Buckets: exactamente tres y todos privados.
select id,public,file_size_limit,allowed_mime_types
from storage.buckets
where id in ('payment-request-attachments','payment-receipts','petty-cash-attachments');

-- Empresa y unidades.
select c.code,c.trade_name,c.rut,bu.code,bu.name
from public.companies c join public.business_units bu on bu.company_id=c.id
where c.code='OASIS' order by bu.code;

-- Workflows iniciales: 12, tres por cada una de las cuatro unidades.
select bu.code,w.code,c.min_amount,c.max_amount,r.key as required_role
from public.approval_workflows w
join public.business_units bu on bu.id=w.business_unit_id
join public.approval_workflow_conditions c on c.workflow_id=w.id
join public.approval_workflow_steps s on s.workflow_id=w.id
join public.roles r on r.id=s.required_role_id
where w.active order by bu.code,c.min_amount;

-- Funciones privilegiadas y search_path.
select p.proname,p.prosecdef,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prosecdef order by p.proname;

-- Vista segura del dashboard.
select c.relname,c.reloptions from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='dashboard_payment_facts';
```

Resultados esperados: todas las tablas operacionales con RLS, tres buckets `public=false`, cuatro unidades, doce workflows iniciales, todas las funciones privilegiadas con `search_path=` vacío y la vista con `security_invoker=true`.
