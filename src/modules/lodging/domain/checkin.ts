import { z } from "zod";

/** Token del link de check-in: 48 caracteres hexadecimales. */
export const CHECKIN_TOKEN = /^[a-f0-9]{48}$/;

export const MAX_COMPANIONS = 10;

export type CheckinCompanion = { full_name: string; document: string };

export type CheckinData = {
  full_name?: string | null;
  document?: string | null;
  nationality?: string | null;
  email?: string | null;
  phone?: string | null;
  estimated_arrival?: string | null;
  license_plate?: string | null;
  notes?: string | null;
  companions?: CheckinCompanion[];
  accepted_rules_at?: string;
};

export type CheckinView = {
  unit: string;
  unit_code: string;
  room: string;
  check_in: string;
  check_out: string;
  guest_count: number;
  submitted_at: string | null;
  data: CheckinData;
};

const text = (max: number) => z.string().trim().max(max);

/** Lo que envía el formulario público; la base vuelve a validar todo. */
export function parseCheckinForm(form: FormData) {
  const get = (k: string) => String(form.get(k) ?? "");
  const companions: CheckinCompanion[] = [];
  for (let i = 0; i < MAX_COMPANIONS; i++) {
    const name = get(`companion_name_${i}`).trim();
    if (name.length >= 3) companions.push({ full_name: name.slice(0, 160), document: get(`companion_document_${i}`).trim().slice(0, 40) });
  }
  return z
    .object({
      full_name: text(160).min(3, "Indica tu nombre completo."),
      document: text(40).min(4, "Indica tu RUT o pasaporte."),
      nationality: text(80).min(2, "Indica tu nacionalidad."),
      email: z.union([z.literal(""), z.string().trim().email("Revisa tu correo.").max(160)]),
      phone: text(40).min(6, "Indica tu teléfono."),
      estimated_arrival: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Revisa la hora de llegada.")]),
      license_plate: text(20),
      notes: text(1000),
      accept_rules: z.literal("on", { message: "Debes aceptar las normas del hostal." }),
    })
    .transform((v) => ({ ...v, accept_rules: true, companions }))
    .safeParse({
      full_name: get("full_name"),
      document: get("document"),
      nationality: get("nationality"),
      email: get("email"),
      phone: get("phone"),
      estimated_arrival: get("estimated_arrival"),
      license_plate: get("license_plate"),
      notes: get("notes"),
      accept_rules: get("accept_rules"),
    });
}

export function checkinUrl(base: string, token: string) {
  return `${base}/checkin/${token}`;
}

/** Número para wa.me (solo dígitos; los de 9 dígitos que parten en 9 se asumen de Chile). */
export function whatsappNumber(phone: string | null | undefined) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (digits.length === 9 && digits.startsWith("9")) return `56${digits}`;
  return digits.length >= 10 ? digits : null;
}

export function checkinMessage(unit: string, checkIn: string, url: string, guestName?: string | null) {
  const day = checkIn.split("-").reverse().join("-");
  const hello = guestName && !/^reserva /i.test(guestName) ? `Hola ${guestName.split(" ")[0]}` : "Hola";
  return `${hello}, te escribimos de ${unit}. Para agilizar tu llegada el ${day}, completa tu check-in online aquí: ${url}`;
}
