import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAgentAction,
  fetchInboxConversation,
  fetchInboxConversations,
  fetchMailbotStatus,
  handoffConversation,
  linkBookingToConversation,
  operatorReply,
  rejectAgentAction,
  setMailbotKillSwitch,
} from "@/api/inbox";

// The inbox is time-sensitive — new emails arrive at any moment. Refetch
// on window focus + a background poll every 30s while the tab is open.
export function useInboxConversations() {
  return useQuery({
    queryKey: ["admin", "inbox", "conversations"],
    queryFn: () => fetchInboxConversations(),
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useInboxConversation(conversationId: number | undefined) {
  return useQuery({
    queryKey: ["admin", "inbox", "conversation", conversationId],
    queryFn: () => fetchInboxConversation(conversationId!),
    enabled: conversationId != null,
    // Detail also polls, but slower — the operator is actively reading
    // the thread and a snappier UI matters more than freshness here.
    refetchInterval: 15_000,
  });
}

function invalidateInbox(
  qc: ReturnType<typeof useQueryClient>,
  conversationId?: number | string
) {
  qc.invalidateQueries({ queryKey: ["admin", "inbox", "conversations"] });
  if (conversationId != null) {
    qc.invalidateQueries({
      queryKey: ["admin", "inbox", "conversation", conversationId],
    });
  }
  qc.invalidateQueries({ queryKey: ["admin", "mailbot", "status"] });
  // Approving a draft_booking flips a booking's status/link — refresh
  // bookings + groups so the operator sees the change everywhere.
  qc.invalidateQueries({ queryKey: ["admin", "bookings"] });
  qc.invalidateQueries({ queryKey: ["admin", "booking-groups"] });
}

export function useApproveAgentAction(conversationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      actionId,
      editedText,
    }: {
      actionId: number;
      editedText?: string;
    }) => {
      if (conversationId == null) throw new Error("Conversation id required.");
      return approveAgentAction(conversationId, actionId, editedText);
    },
    onSuccess: (detail) => {
      qc.setQueryData(
        ["admin", "inbox", "conversation", conversationId],
        detail
      );
      invalidateInbox(qc, conversationId);
    },
  });
}

export function useRejectAgentAction(conversationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (actionId: number) => {
      if (conversationId == null) throw new Error("Conversation id required.");
      return rejectAgentAction(conversationId, actionId);
    },
    onSuccess: (detail) => {
      qc.setQueryData(
        ["admin", "inbox", "conversation", conversationId],
        detail
      );
      invalidateInbox(qc, conversationId);
    },
  });
}

export function useOperatorReply(conversationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => {
      if (conversationId == null) throw new Error("Conversation id required.");
      return operatorReply(conversationId, text);
    },
    onSuccess: (detail) => {
      qc.setQueryData(
        ["admin", "inbox", "conversation", conversationId],
        detail
      );
      invalidateInbox(qc, conversationId);
    },
  });
}

export function useHandoffConversation(conversationId: number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => {
      if (conversationId == null) throw new Error("Conversation id required.");
      return handoffConversation(conversationId);
    },
    onSuccess: (detail) => {
      qc.setQueryData(
        ["admin", "inbox", "conversation", conversationId],
        detail
      );
      invalidateInbox(qc, conversationId);
    },
  });
}

export function useLinkBookingToConversation(
  conversationId: number | undefined
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bookingId: number) => {
      if (conversationId == null) throw new Error("Conversation id required.");
      return linkBookingToConversation(conversationId, bookingId);
    },
    onSuccess: (detail) => {
      qc.setQueryData(
        ["admin", "inbox", "conversation", conversationId],
        detail
      );
      invalidateInbox(qc, conversationId);
    },
  });
}

export function useMailbotStatus() {
  return useQuery({
    queryKey: ["admin", "mailbot", "status"],
    queryFn: fetchMailbotStatus,
    refetchInterval: 60_000,
  });
}

export function useSetMailbotKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => setMailbotKillSwitch(enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "mailbot", "status"] });
    },
  });
}
