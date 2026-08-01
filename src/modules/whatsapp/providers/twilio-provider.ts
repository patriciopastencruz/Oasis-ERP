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
import { verifyTwilioSignature } from "./twilio-signature";

const TWILIO_API_BASE = "https://api.twilio.com/2010-04-01";

function inferMediaType(params: Record<string, string>): MessageType {
  const contentType = params.MediaContentType0 || "";
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("audio/")) return "audio";
  if (contentType.startsWith("application/") || contentType.startsWith("text/"))
    return "document";
  return "unsupported";
}

export class TwilioWhatsAppProvider implements WhatsAppProvider {
  readonly name = "twilio" as const;
  readonly signatureHeaderName = "x-twilio-signature";
  private accountSid: string | undefined;
  private authToken: string | undefined;
  private webhookUrl: string | undefined;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.webhookUrl = process.env.WHATSAPP_WEBHOOK_URL;
  }

  isConfigured(): boolean {
    return Boolean(this.accountSid && this.authToken);
  }

  normalizePhoneNumber(raw: string): string | null {
    return normalizePhoneNumber(raw);
  }

  /**
   * La URL usada para firmar debe ser la URL pública exacta configurada en
   * la consola de Twilio (WHATSAPP_WEBHOOK_URL) -- `request.url` puede
   * diferir en protocolo/host detrás del proxy de Vercel y romper todas
   * las firmas. Solo cae a `input.url` si la variable no está configurada.
   */
  verifyWebhookSignature(input: {
    url: string;
    rawBody: string;
    signatureHeader: string | null;
  }): boolean {
    const params = Object.fromEntries(new URLSearchParams(input.rawBody));
    return verifyTwilioSignature({
      url: this.webhookUrl || input.url,
      params,
      signatureHeader: input.signatureHeader,
      authToken: this.authToken,
    });
  }

  /** Twilio no usa un handshake de verificación por GET. */
  verifyChallenge(): string | null {
    return null;
  }

  parseWebhook(rawBody: string): NormalizedInboundMessage | null {
    const params = Object.fromEntries(new URLSearchParams(rawBody));
    const from = params.From;
    const to = params.To;
    const messageSid = params.MessageSid || params.SmsMessageSid;
    if (!from || !to || !messageSid) return null;
    const fromNumber = normalizePhoneNumber(from);
    const toNumber = normalizePhoneNumber(to);
    if (!fromNumber || !toNumber) return null;

    const numMedia = Number(params.NumMedia || "0");
    const messageType: MessageType =
      numMedia > 0 ? inferMediaType(params) : "text";
    const content = params.Body?.trim() || null;

    return {
      provider: "twilio",
      toNumber,
      fromNumber,
      externalMessageId: messageSid,
      messageType,
      content,
      profileName: params.ProfileName?.trim() || null,
      raw: params,
    };
  }

  async sendTextMessage(
    input: SendTextMessageInput,
  ): Promise<SendMessageResult> {
    return this.postMessage({
      To: `whatsapp:${input.to}`,
      From: `whatsapp:${input.from}`,
      Body: input.body,
      ...this.statusCallbackField(),
    });
  }

  async sendTemplateMessage(
    input: SendTemplateMessageInput,
  ): Promise<SendMessageResult> {
    const fields: Record<string, string> = {
      To: `whatsapp:${input.to}`,
      From: `whatsapp:${input.from}`,
      ContentSid: input.templateId,
      ...this.statusCallbackField(),
    };
    if (input.variables)
      fields.ContentVariables = JSON.stringify(input.variables);
    return this.postMessage(fields);
  }

  /** Le pide a Twilio que notifique el estado de entrega en /api/whatsapp/status, si esa URL está configurada. */
  private statusCallbackField(): Record<string, string> {
    const url = process.env.WHATSAPP_STATUS_CALLBACK_URL;
    return url ? { StatusCallback: url } : {};
  }

  private async postMessage(
    fields: Record<string, string>,
  ): Promise<SendMessageResult> {
    if (!this.isConfigured()) throw new WhatsAppProviderNotConfiguredError();
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      "base64",
    );
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams(fields).toString(),
      });
    } catch (error) {
      throw new WhatsAppProviderRequestError(
        error instanceof Error
          ? error.message
          : "No fue posible contactar a Twilio.",
      );
    }
    const data = (await response.json().catch(() => null)) as {
      sid?: string;
      message?: string;
    } | null;
    if (!response.ok || !data?.sid) {
      throw new WhatsAppProviderRequestError(
        data?.message || `Twilio respondió con estado ${response.status}.`,
      );
    }
    return { externalMessageId: data.sid };
  }

  async checkConnection(): Promise<ConnectionCheckResult> {
    if (!this.isConfigured()) {
      return { ok: false, error: "Faltan variables de entorno de Twilio." };
    }
    const url = `${TWILIO_API_BASE}/Accounts/${this.accountSid}.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      "base64",
    );
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!response.ok)
        return { ok: false, error: `Twilio respondió con estado ${response.status}.` };
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Error de conexión.",
      };
    }
  }
}
