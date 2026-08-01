import "server-only";
import { TwilioWhatsAppProvider } from "./twilio-provider";
import { MetaWhatsAppProvider } from "./meta-provider";
import type { WhatsAppProvider } from "./whatsapp-provider";

/** Selector por WHATSAPP_PROVIDER (default: twilio). */
export function getWhatsAppProvider(
  name: string | undefined = process.env.WHATSAPP_PROVIDER,
): WhatsAppProvider {
  if (name === "meta") return new MetaWhatsAppProvider();
  return new TwilioWhatsAppProvider();
}
