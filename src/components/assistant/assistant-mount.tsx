import { AssistantWidget } from "@/components/assistant/assistant-widget";
import { getAssistantWelcomeMessage } from "@/modules/assistant/application/actions";

export async function AssistantMount() {
  const { enabled, welcomeMessage } = await getAssistantWelcomeMessage();
  if (!enabled) return null;
  return <AssistantWidget enabled={enabled} welcomeMessage={welcomeMessage} />;
}
