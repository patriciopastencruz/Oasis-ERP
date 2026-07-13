# Flujos de aprobación configurables

## Modelo

La configuración se separa de la ejecución:

```text
approval_workflows
├── approval_workflow_conditions
└── approval_workflow_steps

payment_request_approval_instances
├── payment_request_approval_steps
└── payment_request_approval_decisions
```

Un flujo pertenece a empresa y unidad. Su condición filtra tipo de solicitud, rango de monto y prioridad; los valores nulos significan “cualquiera”. `priority_order` queda reservado para una selección explícita futura, pero la versión inicial rechaza configuraciones ambiguas en vez de elegir silenciosamente.

## Configuración

Cada etapa define orden, grupo paralelo, modo de ejecución, rol, obligatoriedad, sustitución, comentario y respaldo adicional. Etapas con el mismo `sequence_order` pueden actuar en paralelo. Una etapa de orden posterior no se habilita mientras exista una etapa obligatoria anterior sin aprobar.

## Instanciación y congelamiento

Al enviar o reenviar una solicitud, un trigger:

1. Busca exactamente un flujo vigente para empresa, unidad, tipo, monto y prioridad.
2. Falla si no encuentra ninguno o encuentra más de uno.
3. Crea `payment_request_approval_instances` con monto, tipo, prioridad, nombre y política congelados.
4. Copia todas las etapas activas a `payment_request_approval_steps`.
5. Vincula la instancia vigente a la solicitud.

Los cambios posteriores en configuración no alteran snapshots existentes.

## Decisiones

La única escritura autorizada es la función transaccional `decide_payment_request_approval_step`. Valida usuario activo, empresa, unidad, permiso, rol, etapa pendiente, orden y estado de solicitud. La decisión conserva rol real, rol requerido, sustitución, monto, comentario, IP y user-agent.

Una aprobación avanza al siguiente orden. La solicitud solo llega a `approved` cuando no quedan etapas obligatorias pendientes. Un rechazo cierra la instancia y cambia la solicitud a `rejected`. Una corrección cierra la instancia y devuelve la solicitud a `correction_requested`.

## Correcciones y sustituciones

La política inicial es `restart_all`: al reenviar se crea una nueva revisión y todas las etapas vuelven a comenzar. El enum también admite `resume_current`, reservado para evolución posterior; no se activa en el seed inicial.

Gerente general y Superadministrador pueden sustituir únicamente cuando `allow_higher_role_substitution=true`. La decisión marca `acted_as_substitute=true`; no se deduce retrospectivamente.

## Compatibilidad

Las reglas anteriores se convierten en tres flujos de una etapa por unidad. `approval_rules` y `approval_actions` permanecen físicamente para una transición revisable, pero están deprecadas, sin seed activo y sin permisos de escritura para clientes.
