import React, { useLayoutEffect, useMemo, useState } from "react";
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { ActivityIndicator, IconButton, Text } from "react-native-paper";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useInboxConversations } from "@/hooks/useInbox";
import type { InboxConversationSummary } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors } from "@/theme";

type FilterKey = "all" | "pending" | "human_only" | "archived";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "human_only", label: "Human-only" },
  { key: "archived", label: "Archived" },
];

// "2026-09-29T14:30:00Z" → "14:30" for today, "Mon" for this week,
// "29 Sep" otherwise. Keeps the row compact.
function relativeTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays < 7) {
    return d.toLocaleDateString("en", { weekday: "short" });
  }
  return d.toLocaleDateString("en", { day: "numeric", month: "short" });
}

function channelIcon(channel: string): string {
  return channel === "whatsapp" ? "💬" : "✉";
}

export default function InboxListScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [filter, setFilter] = useState<FilterKey>("all");
  const inboxQuery = useInboxConversations();

  // Settings gear in the top-right — opens Mailbot settings.
  useLayoutEffect(() => {
    navigation.setOptions({
      title: "Inbox",
      headerRight: () => (
        <IconButton
          icon="cog-outline"
          iconColor={colors.onPrimary}
          onPress={() => navigation.navigate("MailbotSettings")}
        />
      ),
    });
  }, [navigation]);

  const conversations = useMemo(() => {
    const list = inboxQuery.data ?? [];
    switch (filter) {
      case "pending":
        return list.filter((c) => c.pending_approval_count > 0);
      case "human_only":
        return list.filter((c) => c.status === "human_only");
      case "archived":
        return list.filter((c) => c.status === "archived");
      default:
        return list;
    }
  }, [inboxQuery.data, filter]);

  return (
    <View style={styles.container}>
      {/* Filter chip row */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <TouchableOpacity
              key={f.key}
              onPress={() => setFilter(f.key)}
              activeOpacity={0.85}
              style={[styles.filterChip, active && styles.filterChipActive]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  active && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={conversations}
        keyExtractor={(c) => String(c.conversation_id)}
        contentContainerStyle={
          conversations.length === 0
            ? styles.emptyContent
            : styles.listContent
        }
        ListEmptyComponent={
          inboxQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyTitle}>Nothing here yet</Text>
              <Text style={styles.emptyBody}>
                {filter === "all"
                  ? "When a client emails or WhatsApps, their thread lands here with an AI-drafted reply ready for your approval."
                  : "Nothing matches this filter right now."}
              </Text>
            </View>
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={inboxQuery.isFetching && !inboxQuery.isLoading}
            onRefresh={() => inboxQuery.refetch()}
            tintColor={colors.primary}
          />
        }
        renderItem={({ item }) => (
          <ConversationRow
            item={item}
            onPress={() =>
              navigation.navigate("InboxConversation", {
                conversationId: item.conversation_id,
              })
            }
          />
        )}
      />
    </View>
  );
}

function ConversationRow({
  item,
  onPress,
}: {
  item: InboxConversationSummary;
  onPress: () => void;
}) {
  const hasPending = item.pending_approval_count > 0;
  const hasUnread = item.unread_count > 0;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={[styles.row, hasPending && styles.rowPending]}
    >
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{channelIcon(item.channel)}</Text>
      </View>
      <View style={styles.body}>
        <View style={styles.rowHeader}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.contact_name || item.contact_identifier}
          </Text>
          <Text style={styles.rowTime}>
            {relativeTime(item.last_message_at)}
          </Text>
        </View>
        <Text style={styles.rowIdentifier} numberOfLines={1}>
          {item.contact_identifier}
        </Text>
        <Text
          style={[
            styles.rowPreview,
            (hasUnread || hasPending) && styles.rowPreviewStrong,
          ]}
          numberOfLines={2}
        >
          {item.last_message_preview}
        </Text>
        <View style={styles.badgesRow}>
          {hasPending ? (
            <View style={[styles.badge, styles.badgePending]}>
              <Text style={styles.badgeText}>
                {item.pending_approval_count} draft
                {item.pending_approval_count === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
          {hasUnread && !hasPending ? (
            <View style={[styles.badge, styles.badgeUnread]}>
              <Text style={styles.badgeText}>{item.unread_count} new</Text>
            </View>
          ) : null}
          {item.status === "human_only" ? (
            <View style={[styles.badge, styles.badgeMuted]}>
              <Text style={styles.badgeTextMuted}>Human-only</Text>
            </View>
          ) : null}
          {item.status === "archived" ? (
            <View style={[styles.badge, styles.badgeMuted]}>
              <Text style={styles.badgeTextMuted}>Archived</Text>
            </View>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  filterRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
  },
  filterChipActive: { backgroundColor: colors.primary },
  filterChipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextActive: { color: colors.onPrimary },

  listContent: { paddingVertical: 8 },
  emptyContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  emptyBox: { alignItems: "center", maxWidth: 320 },
  emptyTitle: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 6,
  },
  emptyBody: {
    color: colors.muted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 18,
  },

  row: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowPending: {
    backgroundColor: "rgba(11,91,51,0.04)",
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  avatarText: { fontSize: 20 },
  body: { flex: 1 },
  rowHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 2,
  },
  rowName: {
    color: colors.heading,
    fontSize: 15,
    fontWeight: "700",
    flex: 1,
    marginRight: 8,
  },
  rowTime: { color: colors.muted, fontSize: 11, fontWeight: "600" },
  rowIdentifier: { color: colors.muted, fontSize: 12, marginBottom: 4 },
  rowPreview: { color: colors.text, fontSize: 13, lineHeight: 18 },
  rowPreviewStrong: { color: colors.heading, fontWeight: "600" },
  badgesRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgePending: { backgroundColor: colors.primary },
  badgeUnread: { backgroundColor: "#8a6411" },
  badgeMuted: {
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  badgeTextMuted: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
});
