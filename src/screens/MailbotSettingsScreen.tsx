import React from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Card,
  Divider,
  Switch,
  Text,
} from "react-native-paper";
import {
  useMailbotStatus,
  useSetMailbotKillSwitch,
} from "@/hooks/useInbox";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";

// Renders a datestamp or a friendly "in X days" for the Gmail watch
// expiry — surfaces early-warning when a renewal cron might be broken.
function watchExpiryLabel(iso: string | null): {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
} {
  if (!iso) return { label: "Not registered", tone: "warn" };
  const now = new Date();
  const expiry = new Date(iso);
  const days = (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (days < 0) {
    return { label: "EXPIRED — run renew_gmail_watch", tone: "danger" };
  }
  if (days < 1) {
    return {
      label: `Expires in ${Math.round(days * 24)}h`,
      tone: "warn",
    };
  }
  return { label: `Renews in ${Math.round(days)} days`, tone: "ok" };
}

function timeAgo(iso: string | null): string {
  if (!iso) return "Never";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default function MailbotSettingsScreen() {
  const statusQuery = useMailbotStatus();
  const killSwitchMutation = useSetMailbotKillSwitch();

  const status = statusQuery.data;
  const gmailWatch = watchExpiryLabel(status?.gmail_watch_expires_at ?? null);

  async function toggleKillSwitch(enabled: boolean) {
    try {
      await killSwitchMutation.mutateAsync(enabled);
    } catch (err: unknown) {
      Alert.alert("Couldn't update kill switch", formatApiError(err));
    }
  }

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionLabel}>KILL SWITCH</Text>
          <View style={styles.killRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.killTitle}>Disable agent drafts</Text>
              <Text style={styles.killBody}>
                Inbound emails and messages still get saved to conversations,
                but the AI won't generate replies or booking drafts. Toggle
                this on if things go wrong and you need the agent to stop
                immediately.
              </Text>
            </View>
            {statusQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <Switch
                value={!!status?.kill_switch}
                onValueChange={toggleKillSwitch}
                disabled={killSwitchMutation.isPending}
                color={colors.primary}
              />
            )}
          </View>
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionLabel}>STATUS</Text>
          {statusQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} />
          ) : status ? (
            <>
              <Row
                label="Gmail connected"
                value={status.gmail_connected ? "Yes" : "No"}
                tone={status.gmail_connected ? "ok" : "danger"}
              />
              <Row
                label="Gmail watch"
                value={gmailWatch.label}
                tone={gmailWatch.tone}
              />
              <Row
                label="Drafts pending"
                value={String(status.drafts_pending_count)}
                tone={status.drafts_pending_count > 0 ? "warn" : "ok"}
              />
              <Row
                label="Last processed"
                value={timeAgo(status.last_message_processed_at)}
                tone="muted"
              />
              {status.meta_quality_tier ? (
                <Row
                  label="Meta quality"
                  value={status.meta_quality_tier}
                  tone="muted"
                />
              ) : null}
            </>
          ) : (
            <Text style={{ color: colors.muted }}>
              Couldn't load status. Check your connection.
            </Text>
          )}
        </Card.Content>
      </Card>

      <Card style={styles.card} mode="elevated">
        <Card.Content>
          <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
          <Text style={styles.helpText}>
            When a client emails{" "}
            <Text style={styles.helpMono}>zaid@capetown-concierge.co.za</Text>{" "}
            or WhatsApps the business line, their message lands in the Inbox
            tab. Claude drafts a reply (or a booking proposal) using real
            fleet, villa, and hotel data.
          </Text>
          <Divider style={styles.divider} />
          <Text style={styles.helpText}>
            Nothing is ever sent to the client without you approving it in
            the Inbox. Rejecting a draft discards it. Replying yourself
            pauses the agent on that conversation for 12 hours.
          </Text>
        </Card.Content>
      </Card>
    </ScrollView>
  );
}

function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "warn" | "danger" | "muted";
}) {
  const color =
    tone === "ok"
      ? colors.primary
      : tone === "warn"
        ? "#8a6411"
        : tone === "danger"
          ? "#b03b3b"
          : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  card: {
    borderRadius: 16,
    backgroundColor: colors.surface,
    marginBottom: 12,
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 12,
  },
  killRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  killTitle: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  killBody: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  rowLabel: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  rowValue: { fontSize: 14, fontWeight: "700" },

  divider: { backgroundColor: colors.border, marginVertical: 12 },
  helpText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  helpMono: {
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
    fontSize: 12,
    color: colors.primary,
  },
});
