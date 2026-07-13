# Definiciones canónicas de KPI financieros

Reglas comunes: moneda CLP, redondeo de porcentajes y horas a 2 decimales, calendario `America/Santiago`, filtros limitados por RLS. `NULLIF(denominador,0)` evita divisiones por cero y devuelve `NULL` cuando una tasa no es definible.

| KPI                              | Fórmula y fuente                                                  | Fecha/estados y casos especiales                                                      |
| -------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1. Monto solicitado              | `SUM(payment_requests.amount)`                                    | `created_at` en periodo; excluye `cancelled`; incluye rechazadas.                     |
| 2. Monto aprobado                | Suma de solicitudes con `approved_at`                             | `approved_at` en periodo; estados aprobada, programada o pagada.                      |
| 3. Monto pagado                  | Suma de solicitudes con pago ejecutado                            | `payments.paid_at` en periodo; solo `paid`.                                           |
| 4. Monto pendiente               | Suma de `approved` y `scheduled`                                  | Foto al cierre `date_to`; excluye pagadas, rechazadas y anuladas.                     |
| 5. Solicitudes pendientes        | Conteo `pending_approval`, `under_review`, `correction_requested` | Creadas hasta `date_to`; excluye finales.                                             |
| 6. Solicitudes urgentes          | Conteo prioridad `urgent` no final                                | Creadas hasta `date_to`; excluye pagadas, rechazadas y anuladas.                      |
| 7. Tasa de aprobación            | aprobadas / (aprobadas + rechazadas) × 100                        | Cohorte creada en periodo; programadas/pagadas cuentan aprobadas; cero devuelve NULL. |
| 8. Tasa de rechazo               | rechazadas / (aprobadas + rechazadas) × 100                       | Cohorte creada en periodo; anuladas no integran denominador.                          |
| 9. Tiempo promedio de aprobación | AVG(`approved_at-submitted_at`) horas                             | Solicitudes aprobadas en periodo; redondeo 2 decimales.                               |
| 10. Tiempo promedio de pago      | AVG(`paid_at-approved_at`) horas                                  | Pagos ejecutados en periodo; exige ambas fechas.                                      |
| 11. Pagos vencidos               | `scheduled_date < hoy`                                            | Estado `scheduled`; hoy en Santiago; pagados no vencen.                               |
| 12. Pagos próximos               | hoy ≤ `scheduled_date` ≤ hoy+N                                    | Estado `scheduled`; N inicial 7 y nunca negativo.                                     |
| 13. Gasto por empresa            | Suma de monto solicitado por `company_id`                         | `created_at` en periodo; excluye anuladas.                                            |
| 14. Gasto por unidad             | Suma por `business_unit_id`                                       | Igual criterio de gasto solicitado; RLS limita unidades.                              |
| 15. Gasto por categoría          | Suma por `expense_category_id`                                    | Incluye rechazadas como demanda solicitada; excluye anuladas.                         |
| 16. Gasto por proveedor          | Suma por `supplier_id`                                            | Proveedor nulo se mantiene como grupo sin identificar; excluye anuladas.              |
| 17. Variación mensual            | `(mes actual-mes anterior)/mes anterior × 100`                    | Basada en `monthly_payment_trend`; mes anterior cero devuelve NULL.                   |
| 18. Participación de unidad      | monto unidad / monto empresa × 100                                | Mismo periodo y estados; total empresa cero devuelve NULL.                            |

Las pantallas futuras deben consumir estos contratos o reutilizar exactamente estas definiciones; no deben recalcular KPI con criterios divergentes.
