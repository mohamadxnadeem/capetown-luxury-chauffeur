import React, { useLayoutEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  Text,
  TextInput,
} from "react-native-paper";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useApproveAgentAction,
  useHandoffConversation,
  useInboxConversation,
  useOperatorReply,
  useRejectAgentAction,
} from "@/hooks/useInbox";
import { useAdminBooking } from "@/hooks/useBookings";
import type {
  AgentActionSummary,
  InboxMessage,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";

function messageTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function confidencePercent(c: number): string {
  return `${Math.round(c * 100)}%`;
}

function actionKindLabel(kind: string): string {
  switch (kind) {
    case "draft_reply":
      return "Draft reply";
    case "draft_booking":
      return "Draft booking";
    case "draft_booking_group":
      return "Draft group booking";
    case "escalate":
      return "Escalation";
    default:
      return kind;
  }
}

export default function InboxConversationScreen() {
  const route =
    useRoute<RouteProp<RootStackParamList, "InboxConversation">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { conversationId } = route.params;

  const conversationQuery = useInboxConversation(conversationId);
  const approveMutation = useApproveAgentAction(conversationId);
  const rejectMutation = useRejectAgentAction(conversationId);
  const replyMutation = useOperatorReply(conversationId);
  const handoffMutation = useHandoffConversation(conversationId);

  const [replyText, setReplyText] = useState("");

  useLayoutEffect(() => {
    navigation.setOptions({
      title: conversationQuery.data?.contact_name ?? "Conversation",
    });
  }, [navigation, conversationQuery.data]);

  if (conversationQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (conversationQuery.error || !conversationQuery.data) {
    return (
      <View style={styles.center}>
        <Text style={{ color: colors.muted }}>
          Couldn't load conversation.
        </Text>
      </View>
    );
  }

  const conv = conversationQuery.data;
  const isHumanOnly = conv.status === "human_only";

  async function handleReply() {
    const text = replyText.trim();
    if (!text) return;
    try {
      await replyMutation.mutateAsync(text);
      setReplyText("");
    } catch (err: unknown) {
      Alert.alert("Couldn't send reply", formatApiError(err));
    }
  }

  async function handleHandoff() {
    Alert.alert(
      "Hand off to human?",
      "The AI agent will stop drafting replies on this conversation. Only manual replies from you until you re-enable it (backend).",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Hand off",
          style: "destructive",
          onPress: async () => {
            try {
              await handoffMutation.mutateAsync();
            } catch (err: unknown) {
              Alert.alert("Couldn't hand off", formatApiError(err));
            }
          },
        },
      ]
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={80}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {/* Header banner: contact + channel + status */}
        <View style={styles.header}>
          <Text style={styles.headerName}>{conv.contact_name}</Text>
          <Text style={styles.headerIdentifier}>{conv.contact_identifier}</Text>
          <View style={styles.headerBadges}>
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeText}>
                {conv.channel.toUpperCase()}
              </Text>
            </View>
            {isHumanOnly ? (
              <View style={[styles.headerBadge, styles.headerBadgeMuted]}>
                <Text style={styles.headerBadgeTextMuted}>HUMAN-ONLY</Text>
              </View>
            ) : null}
            {conv.linked_booking_id ? (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("BookingDetail", {
                    bookingId: conv.linked_booking_id!,
                  })
                }
              >
                <View style={[styles.headerBadge, styles.headerBadgeLink]}>
                  <Text style={styles.headerBadgeTextLink}>
                    ↔ Linked booking
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Pending action cards — sorted first so the operator sees them */}
        {conv.pending_actions.map((action) => (
          <ActionCard
            key={action.id}
            action={action}
            onApprove={async (editedText) => {
              try {
                await approveMutation.mutateAsync({
                  actionId: action.id,
                  editedText,
                });
              } catch (err: unknown) {
                Alert.alert("Couldn't approve", formatApiError(err));
              }
            }}
            onReject={async () => {
              try {
                await rejectMutation.mutateAsync(action.id);
              } catch (err: unknown) {
                Alert.alert("Couldn't reject", formatApiError(err));
              }
            }}
            onViewBooking={
              action.output_booking_id
                ? () =>
                    navigation.navigate("BookingDetail", {
                      bookingId: action.output_booking_id!,
                    })
                : undefined
            }
            isBusy={approveMutation.isPending || rejectMutation.isPending}
          />
        ))}

        {/* Message thread — oldest first, WhatsApp-style bubbles */}
        <View style={styles.thread}>
          {conv.messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {conv.messages.length === 0 ? (
            <Text style={styles.helper}>No messages yet.</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* Operator reply composer — always available. Sends via
          /reply/ and flips conversation to human_only for 12h. */}
      <View style={styles.composer}>
        <TextInput
          value={replyText}
          onChangeText={setReplyText}
          mode="outlined"
          multiline
          placeholder="Reply as you (agent pauses on this thread)…"
          style={styles.composerInput}
        />
        <View style={styles.composerActions}>
          <Button
            compact
            onPress={handleHandoff}
            loading={handoffMutation.isPending}
            disabled={handoffMutation.isPending}
            textColor={colors.muted}
          >
            Hand off
          </Button>
          <Button
            mode="contained"
            onPress={handleReply}
            loading={replyMutation.isPending}
            disabled={!replyText.trim() || replyMutation.isPending}
            style={styles.sendButton}
            contentStyle={styles.sendButtonContent}
            labelStyle={styles.sendButtonLabel}
            buttonColor={colors.primary}
            textColor={colors.onPrimary}
          >
            Send reply
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ---- Message bubble -----------------------------------------------------

function MessageBubble({ message }: { message: InboxMessage }) {
  const isOut = message.direction === "out";
  const senderLabel =
    message.sender === "agent"
      ? "🤖 Agent"
      : message.sender === "operator"
        ? "You"
        : "Client";
  return (
    <View style={[styles.bubbleRow, isOut && styles.bubbleRowOut]}>
      <View style={[styles.bubble, isOut ? styles.bubbleOut : styles.bubbleIn]}>
        <Text
          style={[
            styles.bubbleMeta,
            isOut ? styles.bubbleMetaOut : styles.bubbleMetaIn,
          ]}
        >
          {senderLabel}  ·  {messageTime(message.sent_at)}
        </Text>
        <Text
          style={[
            styles.bubbleBody,
            isOut ? styles.bubbleBodyOut : styles.bubbleBodyIn,
          ]}
        >
          {message.body}
        </Text>
      </View>
    </View>
  );
}

// ---- Pending action card (draft_reply / draft_booking / escalation) ----

function ActionCard({
  action,
  onApprove,
  onReject,
  onViewBooking,
  isBusy,
}: {
  action: AgentActionSummary;
  onApprove: (editedText?: string) => Promise<void>;
  onReject: () => Promise<void>;
  onViewBooking?: () => void;
  isBusy: boolean;
}) {
  const [edited, setEdited] = useState(action.draft_text);
  const isReplyDraft = action.kind === "draft_reply";
  const isBookingDraft =
    action.kind === "draft_booking" || action.kind === "draft_booking_group";

  return (
    <Card style={styles.actionCard} mode="elevated">
      <Card.Content>
        <View style={styles.actionHeader}>
          <Text style={styles.actionKind}>{actionKindLabel(action.kind)}</Text>
          <Text style={styles.actionConfidence}>
            Confidence: {confidencePercent(action.confidence)}
          </Text>
        </View>
        {action.reason ? (
          <Text style={styles.actionReason}>{action.reason}</Text>
        ) : null}

        {isReplyDraft ? (
          <TextInput
            value={edited}
            onChangeText={setEdited}
            mode="outlined"
            multiline
            numberOfLines={6}
            style={styles.draftInput}
          />
        ) : (
          <View style={styles.draftReadonly}>
            <Text style={styles.draftReadonlyText}>{action.draft_text}</Text>
          </View>
        )}

        {isBookingDraft && action.output_booking_id ? (
          <BookingPreview bookingId={action.output_booking_id} />
        ) : null}

        <Divider style={styles.divider} />

        <View style={styles.actionButtonsRow}>
          {onViewBooking ? (
            <Button
              mode="outlined"
              onPress={onViewBooking}
              disabled={isBusy}
              style={styles.actionButton}
              textColor={colors.primary}
              icon="eye-outline"
            >
              View
            </Button>
          ) : null}
          <Button
            mode="outlined"
            onPress={onReject}
            disabled={isBusy}
            style={[styles.actionButton, styles.rejectButton]}
            textColor="#b03b3b"
            icon="close"
          >
            Reject
          </Button>
          <Button
            mode="contained"
            onPress={() => onApprove(isReplyDraft ? edited : undefined)}
            disabled={isBusy || (isReplyDraft && !edited.trim())}
            loading={isBusy}
            style={styles.actionButton}
            buttonColor={colors.primary}
            textColor={colors.onPrimary}
            icon="check"
          >
            {isReplyDraft ? "Approve & send" : "Approve"}
          </Button>
        </View>
      </Card.Content>
    </Card>
  );
}

// Fetch + preview the CarBooking a draft_booking is proposing. Kept
// intentionally compact — the operator taps "View" for the full detail.
function BookingPreview({ bookingId }: { bookingId: number }) {
  const bookingQuery = useAdminBooking(bookingId);
  if (bookingQuery.isLoading) {
    return (
      <View style={styles.bookingPreview}>
        <ActivityIndicator size="small" color={colors.primary} />
      </View>
    );
  }
  const b = bookingQuery.data;
  if (!b) return null;
  return (
    <View style={styles.bookingPreview}>
      <Text style={styles.bookingPreviewRef}>
        {b.booking_reference ?? `Booking #${b.id}`}
      </Text>
      <Text style={styles.bookingPreviewTitle}>
        {b.car?.title ?? "Accommodation only"}
      </Text>
      <Text style={styles.bookingPreviewMeta}>
        {b.customer_name}
        {b.total_client_amount
          ? `  ·  R ${b.total_client_amount}`
          : ""}
      </Text>
    </View>
  );
}

// ---- Styles -------------------------------------------------------------

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 24 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },

  header: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
  headerName: {
    color: colors.heading,
    fontSize: 18,
    fontWeight: "800",
  },
  headerIdentifier: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  headerBadges: {
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
    flexWrap: "wrap",
  },
  headerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  headerBadgeText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerBadgeMuted: {
    backgroundColor: colors.surfaceMuted,
  },
  headerBadgeTextMuted: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  headerBadgeLink: {
    backgroundColor: "rgba(11,91,51,0.1)",
  },
  headerBadgeTextLink: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  actionCard: {
    borderRadius: 14,
    backgroundColor: colors.surface,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(11,91,51,0.2)",
  },
  actionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  actionKind: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  actionConfidence: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  actionReason: {
    color: colors.text,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: 10,
  },
  draftInput: {
    backgroundColor: colors.surface,
    marginBottom: 6,
  },
  draftReadonly: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 6,
  },
  draftReadonlyText: { color: colors.text, fontSize: 14, lineHeight: 20 },

  bookingPreview: {
    marginTop: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surfaceMuted,
  },
  bookingPreviewRef: {
    color: colors.primary,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  bookingPreviewTitle: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
    marginTop: 2,
  },
  bookingPreviewMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
  },

  divider: { backgroundColor: colors.border, marginVertical: 12 },
  actionButtonsRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  actionButton: { flexGrow: 1, borderRadius: 10 },
  rejectButton: { borderColor: "#e3c1c1", backgroundColor: "#fbf2f2" },

  thread: { marginTop: 8 },
  bubbleRow: { flexDirection: "row", marginVertical: 4 },
  bubbleRowOut: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    padding: 10,
    borderRadius: 14,
  },
  bubbleIn: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
  },
  bubbleOut: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  bubbleMeta: { fontSize: 10, fontWeight: "700", marginBottom: 4 },
  bubbleMetaIn: { color: colors.muted },
  bubbleMetaOut: { color: "rgba(255,255,255,0.75)" },
  bubbleBody: { fontSize: 14, lineHeight: 20 },
  bubbleBodyIn: { color: colors.text },
  bubbleBodyOut: { color: colors.onPrimary },

  helper: { color: colors.muted, textAlign: "center", marginTop: 20 },

  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  composerInput: {
    backgroundColor: colors.surface,
    marginBottom: 8,
    maxHeight: 120,
  },
  composerActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  sendButton: { borderRadius: 999 },
  sendButtonContent: { paddingHorizontal: 12, height: 40 },
  sendButtonLabel: { fontWeight: "700", fontSize: 13 },
});
