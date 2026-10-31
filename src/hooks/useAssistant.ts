import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAssistantConversation,
  fetchAssistantConversation,
  fetchAssistantConversations,
  sendAssistantMessage,
} from "@/api/assistant";
import type {
  AssistantChatResponse,
  AssistantConversationDetail,
} from "@/api/types";

export function useAssistantConversations(enabled = true) {
  return useQuery({
    queryKey: ["admin", "assistant", "conversations"],
    queryFn: fetchAssistantConversations,
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useAssistantConversation(id: number | undefined) {
  return useQuery({
    queryKey: ["admin", "assistant", "conversation", id],
    queryFn: () => fetchAssistantConversation(id!),
    enabled: id != null,
  });
}

export function useSendAssistantMessage() {
  const qc = useQueryClient();
  return useMutation<
    AssistantChatResponse,
    unknown,
    { message: string; conversation_id?: number }
  >({
    mutationFn: ({ message, conversation_id }) =>
      sendAssistantMessage(message, conversation_id),
    onSuccess: (resp, vars) => {
      // Put the user line and the reply into the cache straight away so the
      // thread updates without waiting for the refetch. The refetch below
      // then swaps in the server copy (real ids for the user message).
      const key = ["admin", "assistant", "conversation", resp.conversation_id];
      const reply = resp.assistant_message;
      qc.setQueryData<AssistantConversationDetail>(key, (prev) => {
        const userLine = {
          id: -Date.now(),
          role: "user" as const,
          body: vars.message,
          tool_calls_summary: null,
          created_at: reply.created_at,
        };
        if (!prev) {
          return {
            id: resp.conversation_id,
            title: vars.message.slice(0, 60),
            started_at: reply.created_at,
            last_message_at: reply.created_at,
            messages: [userLine, reply],
          };
        }
        if (prev.messages.some((m) => m.id === reply.id)) return prev;
        return {
          ...prev,
          last_message_at: reply.created_at,
          messages: [...prev.messages, userLine, reply],
        };
      });
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({
        queryKey: ["admin", "assistant", "conversations"],
      });
    },
    // On a 502 the backend still saves the user message, so refresh the
    // thread to show it.
    onError: (_, vars) => {
      if (vars.conversation_id != null) {
        qc.invalidateQueries({
          queryKey: ["admin", "assistant", "conversation", vars.conversation_id],
        });
      }
    },
  });
}

export function useDeleteAssistantConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteAssistantConversation(id),
    onSuccess: (_, id) => {
      qc.invalidateQueries({
        queryKey: ["admin", "assistant", "conversations"],
      });
      qc.removeQueries({
        queryKey: ["admin", "assistant", "conversation", id],
      });
    },
  });
}
