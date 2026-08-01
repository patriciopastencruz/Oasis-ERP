import { describe, expect, it } from "vitest";
import { computeTwilioSignature, verifyTwilioSignature } from "./twilio-signature";

// Vector de prueba oficial de la documentación de Twilio para
// RequestValidator (https://www.twilio.com/docs/usage/security).
const AUTH_TOKEN = "12345";
const URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const PARAMS = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+14158675309",
  Digits: "1234",
  From: "+14158675309",
  To: "+18005551212",
};
const EXPECTED_SIGNATURE = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

describe("computeTwilioSignature", () => {
  it("reproduce el vector de prueba oficial de Twilio", () => {
    expect(computeTwilioSignature(URL, PARAMS, AUTH_TOKEN)).toBe(
      EXPECTED_SIGNATURE,
    );
  });
});

describe("verifyTwilioSignature", () => {
  it("acepta una firma válida", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signatureHeader: EXPECTED_SIGNATURE,
        authToken: AUTH_TOKEN,
      }),
    ).toBe(true);
  });

  it("rechaza una firma alterada", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signatureHeader: "AAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        authToken: AUTH_TOKEN,
      }),
    ).toBe(false);
  });

  it("rechaza si se agrega un parámetro adicional no firmado", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: { ...PARAMS, Extra: "1" },
        signatureHeader: EXPECTED_SIGNATURE,
        authToken: AUTH_TOKEN,
      }),
    ).toBe(false);
  });

  it("rechaza si la URL no coincide", () => {
    expect(
      verifyTwilioSignature({
        url: "https://mycompany.com/otra.php?foo=1&bar=2",
        params: PARAMS,
        signatureHeader: EXPECTED_SIGNATURE,
        authToken: AUTH_TOKEN,
      }),
    ).toBe(false);
  });

  it("rechaza si falta el auth token", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signatureHeader: EXPECTED_SIGNATURE,
        authToken: undefined,
      }),
    ).toBe(false);
  });

  it("rechaza si falta la cabecera de firma", () => {
    expect(
      verifyTwilioSignature({
        url: URL,
        params: PARAMS,
        signatureHeader: null,
        authToken: AUTH_TOKEN,
      }),
    ).toBe(false);
  });
});
