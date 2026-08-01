import { describe, expect, it } from "vitest";
import { computeMetaSignature, verifyMetaSignature } from "./meta-signature";

// Vector calculado a mano con node:crypto (HMAC-SHA256) reproduciendo el
// algoritmo documentado por Meta para X-Hub-Signature-256: no hay un
// vector de prueba oficial publicado como el de Twilio, así que este se
// generó localmente para fijar el comportamiento esperado.
const APP_SECRET = "test_app_secret";
const RAW_BODY = '{"object":"whatsapp_business_account","entry":[]}';
const EXPECTED_HEX =
  "dec6a680679a968e7e0319355b23599cbfc54502c0784668e9618baa0c633756";
const EXPECTED_HEADER = `sha256=${EXPECTED_HEX}`;

describe("computeMetaSignature", () => {
  it("calcula el HMAC-SHA256 esperado sobre el body crudo", () => {
    expect(computeMetaSignature(RAW_BODY, APP_SECRET)).toBe(EXPECTED_HEX);
  });
});

describe("verifyMetaSignature", () => {
  it("acepta una firma válida con el prefijo sha256=", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY,
        signatureHeader: EXPECTED_HEADER,
        appSecret: APP_SECRET,
      }),
    ).toBe(true);
  });

  it("rechaza una firma sin el prefijo sha256=", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY,
        signatureHeader: EXPECTED_HEX,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("rechaza una firma alterada", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY,
        signatureHeader: `sha256=${"a".repeat(64)}`,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("rechaza si el body cambió después de firmar", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY + " ",
        signatureHeader: EXPECTED_HEADER,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });

  it("rechaza si falta el app secret", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY,
        signatureHeader: EXPECTED_HEADER,
        appSecret: undefined,
      }),
    ).toBe(false);
  });

  it("rechaza si falta la cabecera de firma", () => {
    expect(
      verifyMetaSignature({
        rawBody: RAW_BODY,
        signatureHeader: null,
        appSecret: APP_SECRET,
      }),
    ).toBe(false);
  });
});
