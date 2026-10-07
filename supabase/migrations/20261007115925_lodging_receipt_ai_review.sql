begin;

-- La IA solo agrega evidencia de control. Nunca confirma, anula ni modifica
-- el monto de un pago: esas operaciones comerciales mantienen su flujo actual.
alter table public.lodging_payment_receipts
  add column ai_review_status text not null default 'pending'
    check (ai_review_status in ('pending','matched','mismatch','unreadable','error')),
  add column ai_detected_amount numeric(14,2)
    check (ai_detected_amount is null or ai_detected_amount >= 0),
  add column ai_detected_date date,
  add column ai_operation_number text,
  add column ai_confidence numeric(5,4)
    check (ai_confidence is null or ai_confidence between 0 and 1),
  add column ai_notes text,
  add column ai_model text,
  add column ai_reviewed_at timestamptz;

create index lodging_receipts_unit_ai_review_idx
  on public.lodging_payment_receipts(business_unit_id, ai_review_status)
  where deleted_at is null;

comment on column public.lodging_payment_receipts.ai_review_status is
  'Resultado informativo de la lectura automática; no altera el estado ni el monto del pago.';
comment on column public.lodging_payment_receipts.ai_detected_amount is
  'Monto leído desde el comprobante por IA, antes de compararlo con el pago asociado.';

commit;
