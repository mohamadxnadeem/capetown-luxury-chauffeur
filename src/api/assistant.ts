import type { AxiosError } from "axios";
import { api } from "./client";
import { formatApiError } from "./errors";
import type {
  AssistantChatResponse,
  AssistantConversationDetail,
  AssistantConversationSummary,
} from "./types";

// Send a user message to the voice assistant. Omit conversation_id to
// start a new conversation; include it to continue an existing one.
// Returns the assistant's reply plus the (possibly newly-created)
// conversation_id so the mobile client can keep the thread going.
// 90s timeout because the backend runs a multi-step tool loop that can
// take far longer than the default 30s.
export const ASSISTANT_CHAT_TIMEOUT_MS = 90_000;

export async function sendAssistantMessage(
  message: string,
  conversation_id?: number
): Promise<AssistantChatResponse> {
  const resp = await api.post<AssistantChatResponse>(
    "/api/admin/assistant/chat/",
    { message, conversation_id },
    { timeout: ASSISTANT_CHAT_TIMEOUT_MS }
  );
  return resp.data;
}

// Human readable error for a failed chat call. The backend sends a
// ready-to-show `detail` on 400 (bad message), 502 (model call failed) and
// 503 (assistant not configured), so surface that text verbatim.
export function assistantErrorMessage(err: unknown): string {
  const axiosErr = err as AxiosError<{ detail?: unknown }>;
  const status = axiosErr?.response?.status;
  const detail = axiosErr?.response?.data?.detail;
  if (
    (status === 400 || status === 502 || status === 503) &&
    typeof detail === "string" &&
    detail.trim()
  ) {
    return detail;
  }
  if (status === 404) {
    return "That conversation no longer exists. Start a new one.";
  }
  if (axiosErr?.code === "ECONNABORTED" || axiosErr?.code === "ETIMEDOUT") {
    return "The assistant took too long to answer. Please try again.";
  }
  if (!axiosErr?.response && axiosErr?.isAxiosError) {
    return "No connection to the server. Check your signal and try again.";
  }
  return formatApiError(err);
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
