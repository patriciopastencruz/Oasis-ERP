import { afterEach, describe, expect, it, vi } from "vitest";
import { TwilioWhatsAppProvider } from "./twilio-provider";

const baseParams = {
  MessageSid: "SM1234567890abcdef1234567890abcdef",
  From: "whatsapp:+56912345678",
  To: "whatsapp:+14155238886",
  Body: "Hola, quiero cotizar una casa",
  ProfileName: "Juan Pérez",
  NumMedia: "0",
};

describe("TwilioWhatsAppProvider.parseWebhook", () => {
  it("normaliza los números y arma un mensaje de texto", () => {
    const provider = new TwilioWhatsAppProvider();
    const parsed = provider.parseWebhook(baseParams);
    expect(parsed).toEqual({
      provider: "twilio",
      toNumber: "+14155238886",
      fromNumber: "+56912345678",
      externalMessageId: "SM1234567890abcdef1234567890abcdef",
      messageType: "text",
      content: "Hola, quiero cotizar una casa",
      profileName: "Juan Pérez",
      raw: baseParams,
    });
  });

  it("devuelve null si falta From, To o MessageSid", () => {
    const provider = new TwilioWhatsAppProvider();
    expect(provider.parseWebhook({ ...baseParams, From: "" })).toBeNull();
    expect(provider.parseWebhook({ ...baseParams, To: "" })).toBeNull();
    expect(
      provider.parseWebhook({ ...baseParams, MessageSid: "" }),
    ).toBeNull();
  });

  it("devuelve null si un número no se puede normalizar", () => {
    const provider = new TwilioWhatsAppProvider();
    expect(
      provider.parseWebhook({ ...baseParams, From: "whatsapp:no-es-un-numero" }),
    ).toBeNull();
  });

  it("marca como imagen un mensaje con NumMedia > 0 y tipo image/*", () => {
    const provider = new TwilioWhatsAppProvider();
    const parsed = provider.parseWebhook({
      ...baseParams,
      NumMedia: "1",
      MediaContentType0: "image/jpeg",
      Body: "",
    });
    expect(parsed?.messageType).toBe("image");
    expect(parsed?.content).toBeNull();
  });

  it("marca como no soportado un tipo de medio desconocido", () => {
    const provider = new TwilioWhatsAppProvider();
    const parsed = provider.parseWebhook({
      ...baseParams,
      NumMedia: "1",
      MediaContentType0: "video/mp4",
    });
    expect(parsed?.messageType).toBe("unsupported");
  });

  it("acepta campos vacíos/ausentes sin reventar (ProfileName ausente)", () => {
    const provider = new TwilioWhatsAppProvider();
    const { ProfileName: _unused, ...withoutProfile } = baseParams;
    const parsed = provider.parseWebhook(withoutProfile);
    expect(parsed?.profileName).toBeNull();
  });
});

describe("TwilioWhatsAppProvider.isConfigured", () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;

  afterEach(() => {
    if (originalSid === undefined) delete process.env.TWILIO_ACCOUNT_SID;
    else process.env.TWILIO_ACCOUNT_SID = originalSid;
    if (originalToken === undefined) delete process.env.TWILIO_AUTH_TOKEN;
    else process.env.TWILIO_AUTH_TOKEN = originalToken;
  });

  it("no está configurado sin credenciales", () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    expect(new TwilioWhatsAppProvider().isConfigured()).toBe(false);
  });

  it("está configurado con SID y token presentes", () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    expect(new TwilioWhatsAppProvider().isConfigured()).toBe(true);
  });

  it("sendTextMessage lanza WhatsAppProviderNotConfiguredError si faltan credenciales", async () => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    const provider = new TwilioWhatsAppProvider();
    await expect(
      provider.sendTextMessage({ to: "+56912345678", from: "+14155238886", body: "hola" }),
    ).rejects.toThrow("no está configurado");
  });
});

describe("TwilioWhatsAppProvider.sendTextMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía el mensaje vía la API REST de Twilio con Basic Auth", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ sid: "SMabc123" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new TwilioWhatsAppProvider();
    const result = await provider.sendTextMessage({
      to: "+56912345678",
      from: "+14155238886",
      body: "Hola",
    });

    expect(result).toEqual({ externalMessageId: "SMabc123" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/Accounts/ACxxxx/Messages.json");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.body).toContain("Body=Hola");
  });

  it("lanza WhatsAppProviderRequestError si Twilio responde con error", async () => {
    process.env.TWILIO_ACCOUNT_SID = "ACxxxx";
    process.env.TWILIO_AUTH_TOKEN = "token";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "Número inválido" }),
      }),
    );
    const provider = new TwilioWhatsAppProvider();
    await expect(
      provider.sendTextMessage({ to: "+1", from: "+14155238886", body: "hola" }),
    ).rejects.toThrow("Número inválido");
  });
});
