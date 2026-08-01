import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Algoritmo documentado por Twilio para `X-Twilio-Signature`: HMAC-SHA1
 * sobre la URL completa (tal cual está configurada en la consola de
 * Twilio) seguida de cada parámetro POST, ordenado alfabéticamente por
 * clave, concatenado como `clave+valor` sin separadores.
 */
export function computeTwilioSignature(
  url: string,
  params: Record<string, string>,
  authToken: string,
): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/**
 * La URL debe ser la URL pública exacta configurada en Twilio
 * (WHATSAPP_WEBHOOK_URL), no `request.url` — detrás del proxy de Vercel
 * puede diferir en protocolo/host y romper la firma en todos los casos.
 */
export function verifyTwilioSignature(input: {
  url: string;
  params: Record<string, string>;
  signatureHeader: string | null;
  authToken: string | undefined;
}): boolean {
  const { url, params, signatureHeader, authToken } = input;
  if (!authToken || !signatureHeader) return false;
  const expected = computeTwilioSignature(url, params, authToken);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
