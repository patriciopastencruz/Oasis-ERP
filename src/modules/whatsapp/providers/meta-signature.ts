import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Algoritmo documentado por Meta para `X-Hub-Signature-256`: HMAC-SHA256
 * sobre el cuerpo crudo del request (bytes exactos, antes de cualquier
 * parseo), usando el App Secret de la app de Meta. La cabecera llega con
 * el prefijo `sha256=`.
 */
export function computeMetaSignature(
  rawBody: string,
  appSecret: string,
): string {
  return createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
}

export function verifyMetaSignature(input: {
  rawBody: string;
  signatureHeader: string | null;
  appSecret: string | undefined;
}): boolean {
  const { rawBody, signatureHeader, appSecret } = input;
  if (!appSecret || !signatureHeader) return false;
  const prefix = "sha256=";
  if (!signatureHeader.startsWith(prefix)) return false;
  const received = signatureHeader.slice(prefix.length);
  const expected = computeMetaSignature(rawBody, appSecret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}
