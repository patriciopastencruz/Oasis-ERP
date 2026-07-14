begin;

-- Supabase puede aplicar privilegios predeterminados amplios sobre tablas
-- creadas en public. RLS continúa siendo obligatorio, pero además reducimos
-- los privilegios SQL para impedir cambios directos en estados y totales.
revoke all on table public.petty_cash_weekly_limits from anon, authenticated;
revoke all on table public.petty_cash_report_sequences from anon, authenticated;
revoke all on table public.petty_cash_reports from anon, authenticated;
revoke all on table public.petty_cash_expense_lines from anon, authenticated;
revoke all on table public.petty_cash_line_attachments from anon, authenticated;
revoke all on table public.petty_cash_review_actions from anon, authenticated;

grant select on public.petty_cash_weekly_limits to authenticated;
grant select,insert on public.petty_cash_reports to authenticated;
grant update(general_reason,general_observations) on public.petty_cash_reports to authenticated;
grant select,insert,delete on public.petty_cash_expense_lines to authenticated;
grant update(expense_date,merchant_name,document_type,document_number,expense_category_id,cost_center_id,
  description,amount,observation,sort_order,deleted_at) on public.petty_cash_expense_lines to authenticated;
grant select,insert on public.petty_cash_line_attachments to authenticated;
grant update(deleted_at) on public.petty_cash_line_attachments to authenticated;
grant select on public.petty_cash_review_actions to authenticated;

revoke execute on function public.can_view_petty_cash_report(public.petty_cash_reports) from public,anon;
revoke execute on function public.petty_cash_week_summary(uuid,date,uuid) from public,anon;
revoke execute on function public.submit_petty_cash_report(uuid) from public,anon;
revoke execute on function public.decide_petty_cash_report(uuid,text,text,uuid[]) from public,anon;
revoke execute on function public.delete_petty_cash_attachment(uuid) from public,anon;

grant execute on function public.can_view_petty_cash_report(public.petty_cash_reports),
  public.petty_cash_week_summary(uuid,date,uuid),public.submit_petty_cash_report(uuid),
  public.decide_petty_cash_report(uuid,text,text,uuid[]),public.delete_petty_cash_attachment(uuid)
to authenticated;

commit;
