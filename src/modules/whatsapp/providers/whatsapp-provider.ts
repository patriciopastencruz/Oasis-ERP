import type { MessageType } from "@/modules/whatsapp/domain/conversation";

export type NormalizedInboundMessage = {
  provider: "twilio" | "meta";
  toNumber: string;
  fromNumber: string;
  externalMessageId: string;
  messageType: MessageType;
  content: string | null;
  profileName: string | null;
  raw: Record<string, unknown>;
};

export type SendTextMessageInput = {
  to: string;
  from: string;
  body: string;
};

export type SendTemplateMessageInput = {
  to: string;
  from: string;
  templateId: string;
  variables?: Record<string, string>;
};

export type SendMessageResult = {
  externalMessageId: string;
};

export type ConnectionCheckResult = {
  ok: boolean;
  error?: string;
};

export class WhatsAppProviderNotConfiguredError extends Error {
  constructor(message = "El proveedor de WhatsApp no está configurado.") {
    super(message);
    this.name = "WhatsAppProviderNotConfiguredError";
  }
}

export class WhatsAppProviderRequestError extends Error {
  constructor(
    message = "El proveedor de WhatsApp no pudo procesar la solicitud.",
  ) {
    super(message);
    this.name = "WhatsAppProviderRequestError";
  }
}

/**
 * Interfaz intercambiable de canal de WhatsApp. Permite pasar de Twilio
 * Sandbox a Meta WhatsApp Cloud API (o viceversa) sin tocar el resto del
 * agente — seleccionada en runtime vía WHATSAPP_PROVIDER (ver index.ts).
 *
 * Trabaja siempre sobre el cuerpo crudo del request (`rawBody`), nunca
 * pre-parseado: Twilio firma sobre form-urlencoded (HMAC-SHA1 URL+params)
 * y Meta firma sobre el JSON crudo (HMAC-SHA256) — cada proveedor decide
 * cómo interpretar su propio formato.
 */
export interface WhatsAppProvider {
  readonly name: "twilio" | "meta";
  /** Cabecera HTTP donde este proveedor envía la firma del webhook. */
  readonly signatureHeaderName: string;
  isConfigured(): boolean;
  normalizePhoneNumber(raw: string): string | null;
  verifyWebhookSignature(input: {
    url: string;
    rawBody: string;
    signatureHeader: string | null;
  }): boolean;
  parseWebhook(rawBody: string): NormalizedInboundMessage | null;
  /**
   * Handshake de verificación por GET (solo Meta lo requiere: responde el
   * valor de hub.challenge si hub.verify_token coincide). Devuelve null si
   * el proveedor no usa este mecanismo o si la verificación falla.
   */
  verifyChallenge(searchParams: URLSearchParams): string | null;
  sendTextMessage(input: SendTextMessageInput): Promise<SendMessageResult>;
  sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<SendMessageResult>;
  checkConnection(): Promise<ConnectionCheckResult>;
}
