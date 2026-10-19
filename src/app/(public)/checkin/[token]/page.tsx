import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { submitCheckinAction } from "@/modules/lodging/application/checkin-public-actions";
import { CheckinSubmit } from "@/components/lodging/checkin-submit";
import { CHECKIN_TOKEN, MAX_COMPANIONS, type CheckinView } from "@/modules/lodging/domain/checkin";

export const metadata = {
  title: "Check-in online | Hostal Oasis",
  description: "Completa tus datos antes de llegar.",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const day = (iso: string) =>
  new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(`${iso}T12:00:00Z`));

function Field({
  label,
  name,
  defaultValue,
  required,
  type = "text",
  placeholder,
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  required?: boolean;
  type?: string;
  placeholder?: string;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <label className="block text-sm font-medium text-[#3a2f26]">
      {label}
      {required && <span className="text-[#c1652f]"> *</span>}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="mt-1 w-full rounded-xl border border-[#e4d9c8] bg-white px-3.5 py-3 text-base text-[#241c16] outline-none focus:border-[#c1652f]"
      />
      {hint && <span className="mt-1 block text-xs font-normal text-[#8a7b6b]">{hint}</span>}
    </label>
  );
}

function PhotoField({ label, name, required, hint }: { label: string; name: string; required?: boolean; hint?: string }) {
  return (
    <label className="block text-sm font-medium text-[#3a2f26]">
      {label}
      {required && <span className="text-[#c1652f]"> *</span>}
      <input
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        required={required}
        className="mt-1 block w-full rounded-xl border border-dashed border-[#e4d9c8] bg-white p-3 text-sm text-[#3a2f26] file:mr-3 file:rounded-full file:border-0 file:bg-[#f3e7da] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-[#7a4320]"
      />
      {hint && <span className="mt-1 block text-xs font-normal text-[#8a7b6b]">{hint}</span>}
    </label>
  );
}

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ listo?: string; error?: string }>;
}) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  if (!CHECKIN_TOKEN.test(token)) notFound();
  const db = createSupabaseAdminClient();
  const { data } = await db.rpc("lodging_checkin_get", { p_token: token });
  const view = data as CheckinView | null;

  if (!view)
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="text-2xl font-bold text-[#241c16]" style={{ fontFamily: "var(--font-playfair), serif" }}>
          Este link ya no está disponible
        </h1>
        <p className="mt-3 text-sm text-[#6b5d4f]">Puede que haya vencido o que recepción haya enviado uno nuevo. Escríbenos y te ayudamos.</p>
      </main>
    );

  if (q.listo)
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-5xl">✅</p>
        <h1 className="mt-4 text-3xl font-bold text-[#241c16]" style={{ fontFamily: "var(--font-playfair), serif" }}>
          ¡Check-in listo!
        </h1>
        <p className="mt-3 text-sm text-[#6b5d4f]">
          Recibimos tus datos. Te esperamos en {view.unit} el {day(view.check_in)}.
        </p>
        <a href={`/checkin/${token}`} className="mt-6 inline-block text-sm font-semibold text-[#c1652f]">
          Revisar o corregir mis datos
        </a>
      </main>
    );

  const d = view.data ?? {};
  const companionsShown = Math.min(MAX_COMPANIONS, Math.max(view.guest_count - 1, d.companions?.length ?? 0));

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c1652f]">{view.unit}</p>
      <h1 className="mt-2 text-3xl font-bold text-[#241c16]" style={{ fontFamily: "var(--font-playfair), serif" }}>
        Check-in online
      </h1>
      <p className="mt-2 text-sm text-[#6b5d4f]">Completa tus datos antes de llegar y ahorra tiempo en recepción.</p>

      <div className="mt-5 rounded-2xl border border-[#e4d9c8] bg-white p-4 text-sm text-[#3a2f26]">
        <p>
          <b>Llegada:</b> {day(view.check_in)}
        </p>
        <p>
          <b>Salida:</b> {day(view.check_out)}
        </p>
        <p>
          <b>Habitación:</b> {view.room} · {view.guest_count} {view.guest_count === 1 ? "persona" : "personas"}
        </p>
      </div>

      {view.submitted_at && (
        <p className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          Ya recibimos tus datos. Si necesitas corregir algo, edítalo y vuelve a enviar.
        </p>
      )}
      {q.error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{q.error}</div>}

      <form action={submitCheckinAction} className="mt-6 space-y-5">
        <input type="hidden" name="token" value={token} />
        <section className="space-y-4">
          <h2 className="text-base font-bold text-[#241c16]">Titular de la reserva</h2>
          <Field label="Nombre completo" name="full_name" required defaultValue={d.full_name} autoComplete="name" />
          <Field label="RUT o pasaporte" name="document" required defaultValue={d.document} />
          <Field label="Nacionalidad" name="nationality" required defaultValue={d.nationality} autoComplete="country-name" />
          <Field label="Teléfono (WhatsApp)" name="phone" type="tel" required defaultValue={d.phone} autoComplete="tel" placeholder="+56 9 1234 5678" />
          <Field label="Correo" name="email" type="email" defaultValue={d.email} autoComplete="email" />
          <Field label="Hora estimada de llegada" name="estimated_arrival" type="time" defaultValue={d.estimated_arrival} />
          <Field label="Hora estimada de salida" name="estimated_departure" type="time" defaultValue={d.estimated_departure} hint="El día de tu salida." />
          <Field label="Patente del vehículo" name="license_plate" defaultValue={d.license_plate} hint="Solo si llegas en auto." />
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[#241c16]">Foto de tu carnet o pasaporte</h2>
          <p className="text-xs text-[#8a7b6b]">
            Toma la foto con buena luz y que se lean bien los datos. Solo la ve el equipo del hostal.
          </p>
          {view.has_document_front && (
            <p className="rounded-xl bg-emerald-50 p-3 text-xs text-emerald-800">
              Ya recibimos la foto. Sube otra solo si quieres cambiarla.
            </p>
          )}
          <PhotoField label="Frente del documento" name="document_front" required={!view.has_document_front} />
        </section>

        {companionsShown > 0 && (
          <section className="space-y-3">
            <h2 className="text-base font-bold text-[#241c16]">Acompañantes</h2>
            {Array.from({ length: companionsShown }, (_, i) => (
              <div key={i} className="grid grid-cols-2 gap-2">
                <Field label={`Nombre ${i + 1}`} name={`companion_name_${i}`} defaultValue={d.companions?.[i]?.full_name} />
                <Field label="RUT o pasaporte" name={`companion_document_${i}`} defaultValue={d.companions?.[i]?.document} />
              </div>
            ))}
          </section>
        )}

        <label className="block text-sm font-medium text-[#3a2f26]">
          Comentarios para recepción
          <textarea
            name="notes"
            maxLength={1000}
            defaultValue={d.notes ?? ""}
            className="mt-1 min-h-20 w-full rounded-xl border border-[#e4d9c8] bg-white px-3.5 py-3 text-base outline-none focus:border-[#c1652f]"
          />
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-[#e4d9c8] bg-white p-4 text-sm text-[#3a2f26]">
          <input type="checkbox" name="accept_rules" required className="mt-0.5 size-5 accent-[#c1652f]" />
          <span>Declaro que los datos son correctos y acepto las normas de convivencia del hostal.</span>
        </label>

        <CheckinSubmit label={view.submitted_at ? "Guardar cambios" : "Enviar mi check-in"} />
        <p className="text-center text-xs text-[#8a7b6b]">Tus datos solo los ve el equipo del hostal para registrar tu estadía.</p>
      </form>
    </main>
  );
}
