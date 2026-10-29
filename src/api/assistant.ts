import { api } from "./client";
import type {
  AssistantChatResponse,
  AssistantConversationDetail,
  AssistantConversationSummary,
} from "./types";

// Send a user message to the voice assistant. Omit conversation_id to
// start a new conversation; include it to continue an existing one.
// Returns the assistant's reply plus the (possibly newly-created)
// conversation_id so the mobile client can keep the thread going.
export async function sendAssistantMessage(
  message: string,
  conversation_id?: number
): Promise<AssistantChatResponse> {
  const resp = await api.post<AssistantChatResponse>(
    "/api/admin/assistant/chat/",
    { message, conversation_id }
  );
  return resp.data;
}

export async function fetchAssistantConversations(): Promise<
  AssistantConversationSummary[]
> {
  const resp = await api.get<
    | AssistantConversationSummary[]
    | { results: AssistantConversationSummary[] }
  >("/api/admin/assistant/conversations/");
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

export async function fetchAssistantConversation(
  id: number | string
): Promise<AssistantConversationDetail> {
  const resp = await api.get<AssistantConversationDetail>(
    `/api/admin/assistant/conversations/${id}/`
  );
  return resp.data;
}

export async function deleteAssistantConversation(
  id: number | string
): Promise<void> {
  await api.delete(`/api/admin/assistant/conversations/${id}/`);
}
