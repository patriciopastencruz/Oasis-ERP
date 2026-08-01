import { afterEach, describe, expect, it, vi } from "vitest";
import { MetaWhatsAppProvider } from "./meta-provider";

function textWebhook(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15551234567",
                phone_number_id: "123456",
              },
              contacts: [{ profile: { name: "Juan Pérez" }, wa_id: "56912345678" }],
              messages: [
                {
                  from: "56912345678",
                  id: "wamid.ABC123",
                  timestamp: "1234567890",
                  type: "text",
                  text: { body: "Hola, quiero cotizar una casa" },
                  ...overrides,
                },
              ],
            },
          },
        ],
      },
    ],
  });
}

const statusOnlyWebhook = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA_ID",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "15551234567" },
            statuses: [{ id: "wamid.ABC123", status: "delivered" }],
          },
        },
      ],
    },
  ],
});

describe("MetaWhatsAppProvider.parseWebhook", () => {
  it("normaliza los números y arma un mensaje de texto", () => {
    const provider = new MetaWhatsAppProvider();
    const parsed = provider.parseWebhook(textWebhook());
    expect(parsed).toEqual({
      provider: "meta",
      toNumber: "+15551234567",
      fromNumber: "+56912345678",
      externalMessageId: "wamid.ABC123",
      messageType: "text",
      content: "Hola, quiero cotizar una casa",
      profileName: "Juan Pérez",
      raw: JSON.parse(textWebhook()),
    });
  });

  it("devuelve null para webhooks de solo estado (statuses), sin tratarlo como error", () => {
    const provider = new MetaWhatsAppProvider();
    expect(provider.parseWebhook(statusOnlyWebhook)).toBeNull();
  });

  it("devuelve null si el body no es JSON válido", () => {
    const provider = new MetaWhatsAppProvider();
    expect(provider.parseWebhook("no-es-json")).toBeNull();
  });

  it("mapea tipos de medio conocidos", () => {
    const provider = new MetaWhatsAppProvider();
    const parsed = provider.parseWebhook(
      textWebhook({ type: "image", text: undefined }),
    );
    expect(parsed?.messageType).toBe("image");
    expect(parsed?.content).toBeNull();
  });

  it("marca como no soportado un tipo desconocido", () => {
    const provider = new MetaWhatsAppProvider();
    const parsed = provider.parseWebhook(
      textWebhook({ type: "sticker", text: undefined }),
    );
    expect(parsed?.messageType).toBe("unsupported");
  });
});

describe("MetaWhatsAppProvider.verifyChallenge", () => {
  const original = process.env.META_WHATSAPP_VERIFY_TOKEN;
  afterEach(() => {
    if (original === undefined) delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    else process.env.META_WHATSAPP_VERIFY_TOKEN = original;
  });

  it("devuelve el challenge cuando el modo y el token coinciden", () => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = "secreto123";
    const provider = new MetaWhatsAppProvider();
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "secreto123",
      "hub.challenge": "abc-challenge",
    });
    expect(provider.verifyChallenge(params)).toBe("abc-challenge");
  });

  it("devuelve null si el token no coincide", () => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = "secreto123";
    const provider = new MetaWhatsAppProvider();
    const params = new URLSearchParams({
      "hub.mode": "subscribe",
      "hub.verify_token": "otro-token",
      "hub.challenge": "abc-challenge",
    });
    expect(provider.verifyChallenge(params)).toBeNull();
  });

  it("devuelve null si el modo no es subscribe", () => {
    process.env.META_WHATSAPP_VERIFY_TOKEN = "secreto123";
    const provider = new MetaWhatsAppProvider();
    const params = new URLSearchParams({
      "hub.mode": "unsubscribe",
      "hub.verify_token": "secreto123",
      "hub.challenge": "abc-challenge",
    });
    expect(provider.verifyChallenge(params)).toBeNull();
  });
});

describe("MetaWhatsAppProvider.isConfigured", () => {
  const originalToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
  const originalPhoneId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  afterEach(() => {
    if (originalToken === undefined) delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    else process.env.META_WHATSAPP_ACCESS_TOKEN = originalToken;
    if (originalPhoneId === undefined)
      delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    else process.env.META_WHATSAPP_PHONE_NUMBER_ID = originalPhoneId;
  });

  it("no está configurado sin token o phone_number_id", () => {
    delete process.env.META_WHATSAPP_ACCESS_TOKEN;
    delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    expect(new MetaWhatsAppProvider().isConfigured()).toBe(false);
  });

  it("está configurado con ambos presentes", () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456";
    expect(new MetaWhatsAppProvider().isConfigured()).toBe(true);
  });
});

describe("MetaWhatsAppProvider.sendTextMessage", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía el mensaje vía Graph API con Bearer token", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ messages: [{ id: "wamid.OUT1" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MetaWhatsAppProvider();
    const result = await provider.sendTextMessage({
      to: "+56912345678",
      from: "+15551234567",
      body: "Hola",
    });

    expect(result).toEqual({ externalMessageId: "wamid.OUT1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/123456/messages");
    expect(init.headers.Authorization).toBe("Bearer token");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "56912345678",
      type: "text",
      text: { body: "Hola" },
    });
  });

  it("lanza WhatsAppProviderRequestError si Meta responde con error", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123456";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: "Número inválido" } }),
      }),
    );
    const provider = new MetaWhatsAppProvider();
    await expect(
      provider.sendTextMessage({ to: "+1", from: "+15551234567", body: "hola" }),
    ).rejects.toThrow("Número inválido");
  });
});
