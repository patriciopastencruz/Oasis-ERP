import "server-only";
import { normalizePhoneNumber } from "@/modules/whatsapp/domain/phone";
import type { MessageType } from "@/modules/whatsapp/domain/conversation";
import {
  WhatsAppProviderNotConfiguredError,
  WhatsAppProviderRequestError,
  type ConnectionCheckResult,
  type NormalizedInboundMessage,
  type SendMessageResult,
  type SendTemplateMessageInput,
  type SendTextMessageInput,
  type WhatsAppProvider,
} from "./whatsapp-provider";
import { verifyMetaSignature } from "./meta-signature";

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

function mapMetaMessageType(type: string | undefined): MessageType {
  switch (type) {
    case "text":
      return "text";
    case "image":
      return "image";
    case "audio":
      return "audio";
    case "document":
      return "document";
    case "location":
      return "location";
    default:
      return "unsupported";
  }
}

type MetaWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        metadata?: { display_phone_number?: string };
        contacts?: { profile?: { name?: string } }[];
        messages?: {
          id?: string;
          from?: string;
          type?: string;
          text?: { body?: string };
        }[];
      };
    }[];
  }[];
};

/**
 * Meta WhatsApp Cloud API. A diferencia de Twilio, un solo número (el
 * configurado por META_WHATSAPP_PHONE_NUMBER_ID) es el remitente para
 * todos los envíos -- `input.from` se ignora al enviar, coherente con el
 * resto de la arquitectura (una integración por unidad de negocio).
 */
export class MetaWhatsAppProvider implements WhatsAppProvider {
  readonly name = "meta" as const;
  readonly signatureHeaderName = "x-hub-signature-256";
  private accessToken: string | undefined;
  private phoneNumberId: string | undefined;
  private verifyToken: string | undefined;
  private appSecret: string | undefined;

  constructor() {
    this.accessToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    this.phoneNumberId = process.env.META_WHATSAPP_PHONE_NUMBER_ID;
    this.verifyToken = process.env.META_WHATSAPP_VERIFY_TOKEN;
    this.appSecret = process.env.META_APP_SECRET;
  }

  isConfigured(): boolean {
    return Boolean(this.accessToken && this.phoneNumberId);
  }

  normalizePhoneNumber(raw: string): string | null {
    return normalizePhoneNumber(raw);
  }

  verifyWebhookSignature(input: {
    url: string;
    rawBody: string;
    signatureHeader: string | null;
  }): boolean {
    return verifyMetaSignature({
      rawBody: input.rawBody,
      signatureHeader: input.signatureHeader,
      appSecret: this.appSecret,
    });
  }

  /** Handshake de suscripción del webhook: GET con hub.mode/hub.verify_token/hub.challenge. */
  verifyChallenge(searchParams: URLSearchParams): string | null {
    const mode = searchParams.get("hub.mode");
    const token = searchParams.get("hub.verify_token");
    const challenge = searchParams.get("hub.challenge");
    if (mode === "subscribe" && this.verifyToken && token === this.verifyToken) {
      return challenge;
    }
    return null;
  }

  parseWebhook(rawBody: string): NormalizedInboundMessage | null {
    let payload: MetaWebhookPayload;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const value = payload.entry?.[0]?.changes?.[0]?.value;
    const message = value?.messages?.[0];
    // Los webhooks de "statuses" (confirmaciones de entrega) no traen
    // "messages" -- no es un error, simplemente no hay nada que procesar.
    if (!message?.id || !message.from) return null;

    const fromNumber = normalizePhoneNumber(message.from);
    const toNumber = value?.metadata?.display_phone_number
      ? normalizePhoneNumber(value.metadata.display_phone_number)
      : null;
    if (!fromNumber || !toNumber) return null;

    const messageType = mapMetaMessageType(message.type);
    const content =
      message.type === "text" ? message.text?.body?.trim() || null : null;
    const profileName =
      value?.contacts?.[0]?.profile?.name?.trim() || null;

    return {
      provider: "meta",
      toNumber,
      fromNumber,
      externalMessageId: message.id,
      messageType,
      content,
      profileName,
      raw: payload as unknown as Record<string, unknown>,
    };
  }

  async sendTextMessage(
    input: SendTextMessageInput,
  ): Promise<SendMessageResult> {
    return this.postMessage({
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""),
      type: "text",
      text: { body: input.body },
    });
  }

  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<SendMessageResult> {
    const parameters = input.variables
      ? Object.keys(input.variables)
          .sort()
          .map((key) => ({ type: "text", text: input.variables![key] }))
      : [];
    return this.postMessage({
      messaging_product: "whatsapp",
      to: input.to.replace(/^\+/, ""),
      type: "template",
      template: {
        name: input.templateId,
        language: { code: "es" },
        ...(parameters.length ? { components: [{ type: "body", parameters }] } : {}),
      },
    });
  }

  private async postMessage(
    body: Record<string, unknown>,
  ): Promise<SendMessageResult> {
    if (!this.isConfigured()) throw new WhatsAppProviderNotConfiguredError();
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw new WhatsAppProviderRequestError(
        error instanceof Error
          ? error.message
          : "No fue posible contactar a Meta.",
      );
    }
    const data = (await response.json().catch(() => null)) as {
      messages?: { id: string }[];
      error?: { message?: string };
    } | null;
    const messageId = data?.messages?.[0]?.id;
    if (!response.ok || !messageId) {
      throw new WhatsAppProviderRequestError(
        data?.error?.message || `Meta respondió con estado ${response.status}.`,
      );
    }
    return { externalMessageId: messageId };
  }

  async checkConnection(): Promise<ConnectionCheckResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Faltan variables de entorno de Meta." };
    }
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}?fields=id,display_phone_number`;
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        return {
          ok: false,
          error: data?.error?.message || `Meta respondió con estado ${response.status}.`,
        };
      }
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error de conexión.",
      };
    }
  }
}
