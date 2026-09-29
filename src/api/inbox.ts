import { api } from "./client";
import type {
  InboxConversationDetail,
  InboxConversationSummary,
  MailbotStatus,
} from "./types";

// GET /api/admin/inbox/ — sorted server-side by
// pending_approval_count DESC, then last_message_at DESC.
export async function fetchInboxConversations(params?: {
  offset?: number;
  limit?: number;
}): Promise<InboxConversationSummary[]> {
  const resp = await api.get<
    InboxConversationSummary[] | { results: InboxConversationSummary[] }
  >("/api/admin/inbox/", { params });
  const data = resp.data;
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

// GET /api/admin/inbox/<id>/. Server-side, this marks all unread inbound
// messages as read, so it doubles as a "mark seen" side-effect.
export async function fetchInboxConversation(
  conversationId: number | string
): Promise<InboxConversationDetail> {
  const resp = await api.get<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/`
  );
  return resp.data;
}

// Approve a pending AgentAction. For draft_reply: sends the reply
// (optionally edited via edited_text). For draft_booking /
// draft_booking_group: flips the linked booking / group to confirmed.
export async function approveAgentAction(
  conversationId: number | string,
  actionId: number | string,
  editedText?: string
): Promise<InboxConversationDetail> {
  const resp = await api.post<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/approve/${actionId}/`,
    editedText != null ? { edited_text: editedText } : {}
  );
  return resp.data;
}

// Reject a pending AgentAction. Also cancels any linked draft booking(s).
export async function rejectAgentAction(
  conversationId: number | string,
  actionId: number | string
): Promise<InboxConversationDetail> {
  const resp = await api.post<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/reject/${actionId}/`
  );
  return resp.data;
}

// Operator's own reply — bypasses the agent. Flips the conversation to
// human_only for 12h so the agent doesn't try to draft another reply
// while the human is actively in the thread.
export async function operatorReply(
  conversationId: number | string,
  text: string
): Promise<InboxConversationDetail> {
  const resp = await api.post<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/reply/`,
    { text }
  );
  return resp.data;
}

// Permanently hand off a conversation to the human — the agent stops
// generating drafts on it. Undo by clearing status via /link-booking
// or a follow-up API change; for now this is a one-way switch.
export async function handoffConversation(
  conversationId: number | string
): Promise<InboxConversationDetail> {
  const resp = await api.post<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/handoff/`
  );
  return resp.data;
}

// Attach an existing booking to a conversation for context. Useful when
// a client emails about a booking Claude didn't itself draft.
export async function linkBookingToConversation(
  conversationId: number | string,
  bookingId: number | string
): Promise<InboxConversationDetail> {
  const resp = await api.post<InboxConversationDetail>(
    `/api/admin/inbox/${conversationId}/link-booking/`,
    { booking_id: bookingId }
  );
  return resp.data;
}

// Global kill switch — when enabled, inbound messages are still saved
// but the agent doesn't draft anything.
export async function setMailbotKillSwitch(
  enabled: boolean
): Promise<{ kill_switch: boolean }> {
  const resp = await api.post<{ kill_switch: boolean }>(
    "/api/admin/mailbot/kill-switch/",
    { enabled }
  );
  return resp.data;
}

export async function fetchMailbotStatus(): Promise<MailbotStatus> {
  const resp = await api.get<MailbotStatus>("/api/admin/mailbot/status/");
  return resp.data;
}
