# Aseo e inspección en el portal operativo

Guía de uso del flujo de limpieza en `/ops` (detalles técnicos en `docs/lodging-operations.md`).

## Aseo

1. Abrir el portal (icono "Oasis Operaciones" o el link `/ops`).
2. **Habitaciones por limpiar**: ordenadas por el check-in más próximo; las que tienen check-in dentro del umbral de alerta (2 horas por defecto) aparecen en rojo con ⚠. Un retrabajo muestra el motivo del rechazo.
3. **COMENZAR** (1 toque): la habitación pasa a *En limpieza* y queda a nombre de quien la tomó. Si otra persona ya la comenzó, el sistema avisa quién.
4. **FINALIZAR**: *✓ TODO OK · FINALIZAR* en un toque, o *Hay algo con problema* para desmarcar solo lo que quedó mal (checklist de 20 puntos) y dejar un comentario.
5. Al finalizar se registra la duración y la habitación queda *Por inspeccionar*.

No se piden fotos en la limpieza normal. El aseo no ve tarifas, pagos, RUT ni datos del huésped.

## Recepción: inspección del 100%

1. **Pendientes de inspección** muestra cuándo y quién terminó la limpieza, cuánto tardó y el próximo check-in.
2. **INSPECCIONAR**: checklist de 7 puntos (presentación, cama, baño, toallas/amenities, agua caliente, equipamiento, sin desperfectos visibles).
3. **✓ APROBAR** → la habitación queda *Lista* y habilitada para check-in.
4. **✕ Rechazar** → motivo obligatorio (baño mal limpiado, falta toalla, sábanas manchadas, piso pendiente, olor, problema en la ducha, equipamiento defectuoso u otro). La habitación vuelve de inmediato a aseo como *Retrabajo*.

## Check-in desde el ERP

El check-in en la ficha de la reserva solo está habilitado si la habitación está *Lista*. Si no, se muestra el aviso y, para quien tenga permiso, la opción *Forzar check-in* con motivo obligatorio que queda en auditoría.
