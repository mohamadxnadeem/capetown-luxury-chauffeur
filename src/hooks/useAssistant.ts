import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteAssistantConversation,
  fetchAssistantConversation,
  fetchAssistantConversations,
  sendAssistantMessage,
} from "@/api/assistant";
import type { AssistantChatResponse } from "@/api/types";

export function useAssistantConversations() {
  return useQuery({
    queryKey: ["admin", "assistant", "conversations"],
    queryFn: fetchAssistantConversations,
    refetchOnWindowFocus: true,
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
    onSuccess: (resp) => {
      qc.invalidateQueries({
        queryKey: ["admin", "assistant", "conversation", resp.conversation_id],
      });
      qc.invalidateQueries({
        queryKey: ["admin", "assistant", "conversations"],
      });
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
