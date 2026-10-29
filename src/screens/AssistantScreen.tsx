import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  IconButton,
  Text,
  TextInput,
} from "react-native-paper";
import { LinearGradient } from "expo-linear-gradient";
import * as Speech from "expo-speech";
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from "expo-speech-recognition";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useAssistantConversation,
  useSendAssistantMessage,
} from "@/hooks/useAssistant";
import { formatApiError } from "@/api/errors";
import type { AssistantMessage } from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors, gradientPrimary } from "@/theme";

// Pick the most JARVIS-ish built-in voice we can find. iOS ships Daniel
// (en-GB, male, polite butler-ish). On Android we fall back to any en-GB
// voice; if none exists, the system default is used. All free, offline,
// zero per-char cost.
async function pickVoice(): Promise<string | undefined> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const daniel = voices.find((v) =>
      v.identifier?.toLowerCase().includes("daniel")
    );
    if (daniel) return daniel.identifier;
    const enGBMale = voices.find(
      (v) => v.language === "en-GB" && v.name?.toLowerCase().includes("male")
    );
    if (enGBMale) return enGBMale.identifier;
    const anyEnGB = voices.find((v) => v.language === "en-GB");
    if (anyEnGB) return anyEnGB.identifier;
  } catch {
    // Older Androids may not expose voice listing; fall through to default.
  }
  return undefined;
}

export default function AssistantScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [conversationId, setConversationId] = useState<number | undefined>(
    undefined
  );
  const [draftInput, setDraftInput] = useState("");
  // Live transcript updates while the user is speaking.
  const [liveTranscript, setLiveTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceId, setVoiceId] = useState<string | undefined>(undefined);
  // Track which assistant messages have already been spoken so we don't
  // speak the whole conversation when the user re-opens the screen.
  const spokenIdsRef = useRef<Set<number>>(new Set());

  const conversationQuery = useAssistantConversation(conversationId);
  const sendMutation = useSendAssistantMessage();

  // Pick the best voice once on mount.
  useEffect(() => {
    pickVoice().then(setVoiceId);
  }, []);

  // Speech-recognition events — update live transcript and detect end.
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript ?? "";
    setLiveTranscript(transcript);
    // When recognition reports a final (non-interim) result, auto-send.
    if (event.isFinal) {
      finalizeTranscript(transcript);
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setListening(false);
    // If we have a transcript that didn't get auto-finalized (platform
    // quirks), send it now.
    if (liveTranscript.trim()) {
      finalizeTranscript(liveTranscript);
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListening(false);
    const msg = event.error ?? "Couldn't hear you";
    if (msg !== "no-speech" && msg !== "aborted") {
      Alert.alert("Voice input error", String(msg));
    }
  });

  const messages: AssistantMessage[] = useMemo(
    () => conversationQuery.data?.messages ?? [],
    [conversationQuery.data]
  );

  // Speak any new assistant message that we haven't already spoken.
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      if (spokenIdsRef.current.has(m.id)) continue;
      spokenIdsRef.current.add(m.id);
      speak(m.body);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  function speak(text: string) {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      voice: voiceId,
      language: "en-GB",
      rate: 1.0,
      pitch: 1.0,
      onDone: () => setSpeaking(false),
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  async function startListening() {
    try {
      // Stop any ongoing speech so we don't get feedback from the agent's
      // last reply bleeding into the mic.
      if (speaking) {
        Speech.stop();
        setSpeaking(false);
      }
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Microphone permission needed",
          "Enable microphone + speech recognition for Cape Town Concierge in your phone's settings."
        );
        return;
      }
      setLiveTranscript("");
      setListening(true);
      await ExpoSpeechRecognitionModule.start({
        lang: "en-ZA",
        continuous: false,
        interimResults: true,
      });
    } catch (err: unknown) {
      setListening(false);
      Alert.alert("Couldn't start listening", String(err));
    }
  }

  async function stopListening() {
    try {
      await ExpoSpeechRecognitionModule.stop();
    } catch {
      // No-op — just transition state.
    }
    setListening(false);
  }

  const finalizeTranscript = useCallback(
    (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setLiveTranscript("");
      sendToAgent(clean);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId]
  );

  async function sendToAgent(text: string) {
    try {
      const resp = await sendMutation.mutateAsync({
        message: text,
        conversation_id: conversationId,
      });
      if (resp.conversation_id !== conversationId) {
        setConversationId(resp.conversation_id);
      }
      // The query cache gets invalidated by the hook; the reply speaks
      // automatically via the useEffect above when it lands in messages.
    } catch (err: unknown) {
      Alert.alert("Agent error", formatApiError(err));
    }
  }

  function newConversation() {
    Speech.stop();
    spokenIdsRef.current = new Set();
    setConversationId(undefined);
    setLiveTranscript("");
    setDraftInput("");
  }

  async function sendTypedInput() {
    const text = draftInput.trim();
    if (!text) return;
    setDraftInput("");
    await sendToAgent(text);
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <LinearGradient
        colors={gradientPrimary}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={styles.heroTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.heroEyebrow}>CAPE TOWN CONCIERGE</Text>
            <Text style={styles.heroTitle}>Voice assistant</Text>
          </View>
          <IconButton
            icon="refresh"
            iconColor={colors.onPrimary}
            size={22}
            onPress={newConversation}
            disabled={listening || speaking}
          />
          <IconButton
            icon="close"
            iconColor={colors.onPrimary}
            size={22}
            onPress={() => {
              Speech.stop();
              if (listening) stopListening();
              navigation.goBack();
            }}
          />
        </View>
        <Text style={styles.heroSubtitle}>
          Ask about bookings, earnings, drivers, or inbox drafts.
          Read-only — I can't create or send anything yet.
        </Text>
      </LinearGradient>

      <ScrollView
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
      >
        {messages.length === 0 && !sendMutation.isPending ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Try asking:</Text>
            <View style={styles.exampleList}>
              {[
                "How many bookings today?",
                "What did we earn last week?",
                "Any drafts in the inbox?",
                "Is the V-Class free next Tuesday?",
              ].map((e) => (
                <TouchableOpacity
                  key={e}
                  activeOpacity={0.85}
                  onPress={() => sendToAgent(e)}
                  style={styles.exampleChip}
                >
                  <Text style={styles.exampleChipText}>{e}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {messages.map((m) => (
          <MessageBubble key={m.id} message={m} />
        ))}

        {sendMutation.isPending ? (
          <View style={styles.pendingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.pendingText}>Thinking…</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Composer: live transcript appears here while listening; otherwise
          a plain text input + mic. */}
      <View style={styles.composer}>
        {listening || liveTranscript ? (
          <View style={styles.liveWrap}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText} numberOfLines={3}>
              {liveTranscript || "Listening…"}
            </Text>
          </View>
        ) : (
          <TextInput
            value={draftInput}
            onChangeText={setDraftInput}
            mode="outlined"
            placeholder="Or type a question…"
            style={styles.textInput}
            onSubmitEditing={sendTypedInput}
            returnKeyType="send"
          />
        )}

        <View style={styles.composerActions}>
          {speaking ? (
            <Button
              compact
              onPress={() => {
                Speech.stop();
                setSpeaking(false);
              }}
              textColor={colors.muted}
              icon="volume-off"
            >
              Stop speaking
            </Button>
          ) : (
            <View style={{ flex: 1 }} />
          )}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={listening ? stopListening : startListening}
            style={[styles.micButton, listening && styles.micButtonActive]}
          >
            <Text style={styles.micButtonIcon}>{listening ? "■" : "🎙"}</Text>
          </TouchableOpacity>

          {!listening && draftInput.trim() ? (
            <IconButton
              icon="send"
              iconColor={colors.primary}
              size={28}
              onPress={sendTypedInput}
              disabled={sendMutation.isPending}
            />
          ) : null}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function MessageBubble({ message }: { message: AssistantMessage }) {
  const isUser = message.role === "user";
  return (
    <View style={[styles.bubbleRow, isUser && styles.bubbleRowUser]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.bubbleUser : styles.bubbleAssistant,
        ]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
        >
          {message.body}
        </Text>
        {message.tool_calls_summary ? (
          <Text style={styles.toolSummary}>
            {message.tool_calls_summary}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  hero: {
    paddingTop: Platform.OS === "ios" ? 50 : 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
  },
  heroEyebrow: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  heroTitle: {
    color: colors.onPrimary,
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginTop: 2,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 12,
    marginTop: 10,
    lineHeight: 17,
  },

  thread: { flex: 1 },
  threadContent: { padding: 16, paddingBottom: 24 },
  emptyCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: {
    color: colors.heading,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 10,
  },
  exampleList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  exampleChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  exampleChipText: {
    color: colors.heading,
    fontSize: 12,
    fontWeight: "600",
  },

  bubbleRow: { flexDirection: "row", marginVertical: 4 },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubble: {
    maxWidth: "82%",
    padding: 10,
    borderRadius: 14,
  },
  bubbleAssistant: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
  },
  bubbleUser: {
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20 },
  bubbleTextAssistant: { color: colors.text },
  bubbleTextUser: { color: colors.onPrimary },
  toolSummary: {
    color: colors.muted,
    fontSize: 10,
    fontStyle: "italic",
    marginTop: 6,
  },

  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingLeft: 10,
  },
  pendingText: { color: colors.muted, fontSize: 12, fontStyle: "italic" },

  composer: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 14,
  },
  textInput: {
    backgroundColor: colors.surface,
    marginBottom: 8,
    maxHeight: 100,
  },
  liveWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(11,91,51,0.08)",
    borderWidth: 1,
    borderColor: colors.primary,
    marginBottom: 8,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.primary,
  },
  liveText: { flex: 1, color: colors.heading, fontSize: 14, fontWeight: "600" },

  composerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  micButton: {
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  micButtonActive: {
    backgroundColor: "#b03b3b",
    shadowColor: "#b03b3b",
  },
  micButtonIcon: { color: colors.onPrimary, fontSize: 24, fontWeight: "800" },
});
