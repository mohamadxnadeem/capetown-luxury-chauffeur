import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Modal,
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
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useAssistantConversation,
  useAssistantConversations,
  useDeleteAssistantConversation,
  useSendAssistantMessage,
} from "@/hooks/useAssistant";
import { assistantErrorMessage } from "@/api/assistant";
import { formatApiError } from "@/api/errors";
import type {
  AssistantConversationSummary,
  AssistantMessage,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { colors, gradientPrimary } from "@/theme";

// Pause between the end of a spoken reply and the mic reopening in
// hands-free mode, so the tail of the reply is not picked up as speech.
const RESUME_LISTEN_DELAY_MS = 350;

type Phase = "idle" | "listening" | "thinking" | "speaking";

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
  const [handsFree, setHandsFreeState] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Speech events and TTS callbacks fire outside React's render cycle, so
  // everything they read lives in refs to avoid stale closures.
  const handsFreeRef = useRef(false);
  const conversationIdRef = useRef<number | undefined>(undefined);
  const voiceIdRef = useRef<string | undefined>(undefined);
  const activeRef = useRef(false);
  const listeningRef = useRef(false);
  const transcriptRef = useRef("");
  // True once the current listening turn has been sent or discarded, so the
  // "result", "error" and "end" events never act on the same turn twice.
  const turnHandledRef = useRef(true);
  // Bumped by stopAll(). A reply that lands after a stop is shown but not
  // spoken, and does not restart the mic.
  const generationRef = useRef(0);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const conversationQuery = useAssistantConversation(conversationId);
  const sendMutation = useSendAssistantMessage();

  const phase: Phase = listening
    ? "listening"
    : sendMutation.isPending
      ? "thinking"
      : speaking
        ? "speaking"
        : "idle";

  function setHandsFree(on: boolean) {
    handsFreeRef.current = on;
    setHandsFreeState(on);
  }

  function setConversation(id: number | undefined) {
    conversationIdRef.current = id;
    setConversationId(id);
  }

  function setListeningState(on: boolean) {
    listeningRef.current = on;
    setListening(on);
  }

  function clearResumeTimer() {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }

  // Stops everything: hands-free loop, speech output, the mic and any
  // pending reply playback.
  const stopAll = useCallback(() => {
    generationRef.current += 1;
    clearResumeTimer();
    handsFreeRef.current = false;
    setHandsFreeState(false);
    Speech.stop();
    setSpeaking(false);
    if (listeningRef.current) {
      turnHandledRef.current = true;
      try {
        ExpoSpeechRecognitionModule.abort();
      } catch {
        // Recognizer already stopped.
      }
      listeningRef.current = false;
      setListening(false);
    }
    setLiveTranscript("");
  }, []);

  // Pick the best voice once on mount.
  useEffect(() => {
    pickVoice().then((id) => {
      voiceIdRef.current = id;
    });
  }, []);

  // Leaving the screen (back, close, another screen on top) ends voice mode.
  useFocusEffect(
    useCallback(() => {
      activeRef.current = true;
      return () => {
        activeRef.current = false;
        stopAll();
      };
    }, [stopAll])
  );

  // So does sending the app to the background. Not on "inactive": iOS
  // reports that while the mic permission dialog is up.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "background") stopAll();
    });
    return () => sub.remove();
  }, [stopAll]);

  function silentTurn() {
    if (handsFreeRef.current) {
      setHandsFree(false);
      setNotice("Hands-free stopped because no speech was heard.");
    }
  }

  useSpeechRecognitionEvent("result", (event) => {
    if (turnHandledRef.current) return;
    const transcript = event.results?.[0]?.transcript ?? "";
    transcriptRef.current = transcript;
    setLiveTranscript(transcript);
    if (event.isFinal) {
      turnHandledRef.current = true;
      finalizeTranscript(transcript);
    }
  });
  useSpeechRecognitionEvent("end", () => {
    setListeningState(false);
    if (turnHandledRef.current) return;
    turnHandledRef.current = true;
    // Some platforms end without flagging a final result; send what we have.
    if (transcriptRef.current.trim()) {
      finalizeTranscript(transcriptRef.current);
    } else {
      setLiveTranscript("");
      silentTurn();
    }
  });
  useSpeechRecognitionEvent("error", (event) => {
    setListeningState(false);
    if (turnHandledRef.current) return;
    turnHandledRef.current = true;
    setLiveTranscript("");
    if (event.error === "no-speech") {
      silentTurn();
      return;
    }
    if (event.error === "aborted") return;
    if (handsFreeRef.current) setHandsFree(false);
    setErrorText(
      `Voice input error: ${event.message || String(event.error)}`
    );
  });

  function speak(text: string, onFinished?: () => void) {
    Speech.stop();
    setSpeaking(true);
    Speech.speak(text, {
      voice: voiceIdRef.current,
      language: "en-GB",
      rate: 1.0,
      pitch: 1.0,
      onDone: () => {
        setSpeaking(false);
        onFinished?.();
      },
      onStopped: () => setSpeaking(false),
      onError: () => setSpeaking(false),
    });
  }

  async function startListening() {
    if (!activeRef.current || listeningRef.current) return;
    clearResumeTimer();
    try {
      // Stop any ongoing speech so the last reply does not bleed into the mic.
      Speech.stop();
      setSpeaking(false);
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        if (handsFreeRef.current) setHandsFree(false);
        Alert.alert(
          "Microphone permission needed",
          "Enable microphone + speech recognition for Cape Town Concierge in your phone's settings."
        );
        return;
      }
      if (!activeRef.current) return;
      setErrorText(null);
      setNotice(null);
      transcriptRef.current = "";
      turnHandledRef.current = false;
      setLiveTranscript("");
      setListeningState(true);
      ExpoSpeechRecognitionModule.start({
        lang: "en-ZA",
        continuous: false,
        interimResults: true,
      });
    } catch (err: unknown) {
      turnHandledRef.current = true;
      setListeningState(false);
      if (handsFreeRef.current) setHandsFree(false);
      setErrorText(`Couldn't start listening: ${String(err)}`);
    }
  }

  // Push-to-talk stop: the recognizer then fires "end", which sends
  // whatever was heard.
  function stopListening() {
    try {
      ExpoSpeechRecognitionModule.stop();
    } catch {
      setListeningState(false);
    }
  }

  function finalizeTranscript(text: string) {
    const clean = text.trim();
    setLiveTranscript("");
    if (!clean) {
      silentTurn();
      return;
    }
    sendToAgent(clean);
  }

  async function sendToAgent(text: string) {
    if (sendMutation.isPending) return;
    setErrorText(null);
    setNotice(null);
    const generation = generationRef.current;
    try {
      const resp = await sendMutation.mutateAsync({
        message: text,
        conversation_id: conversationIdRef.current,
      });
      if (resp.conversation_id !== conversationIdRef.current) {
        setConversation(resp.conversation_id);
      }
      if (generation !== generationRef.current || !activeRef.current) return;
      speak(resp.assistant_message.body, () => {
        if (
          handsFreeRef.current &&
          activeRef.current &&
          generation === generationRef.current
        ) {
          clearResumeTimer();
          resumeTimerRef.current = setTimeout(() => {
            resumeTimerRef.current = null;
            if (handsFreeRef.current && generation === generationRef.current) {
              startListening();
            }
          }, RESUME_LISTEN_DELAY_MS);
        }
      });
    } catch (err: unknown) {
      // Show the reason, speak nothing, and end hands-free so the mic does
      // not keep reopening against a failing backend.
      if (handsFreeRef.current) setHandsFree(false);
      setErrorText(assistantErrorMessage(err));
    }
  }

  function toggleHandsFree() {
    if (handsFreeRef.current) {
      stopAll();
      return;
    }
    setHandsFree(true);
    setNotice(null);
    if (phase === "idle" || phase === "speaking") {
      startListening();
    }
    // While thinking, the loop picks up after the reply is spoken.
  }

  function onMicPress() {
    if (handsFreeRef.current) {
      stopAll();
      return;
    }
    if (phase === "listening") {
      stopListening();
    } else if (phase === "speaking") {
      Speech.stop();
      setSpeaking(false);
    } else if (phase === "idle") {
      startListening();
    }
  }

  function newConversation() {
    stopAll();
    setConversation(undefined);
    setDraftInput("");
    setErrorText(null);
    setNotice(null);
  }

  function openConversation(id: number) {
    stopAll();
    setConversation(id);
    setErrorText(null);
    setNotice(null);
    setHistoryOpen(false);
  }

  async function sendTypedInput() {
    const text = draftInput.trim();
    if (!text) return;
    setDraftInput("");
    await sendToAgent(text);
  }

  const messages: AssistantMessage[] = useMemo(
    () => conversationQuery.data?.messages ?? [],
    [conversationQuery.data]
  );
  const pendingText = sendMutation.isPending
    ? sendMutation.variables?.message
    : undefined;

  const statusLabel =
    phase === "listening"
      ? "Listening"
      : phase === "thinking"
        ? "Thinking"
        : phase === "speaking"
          ? "Speaking"
          : handsFree
            ? "Hands-free on"
            : "Tap the mic to talk";

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
            icon="history"
            iconColor={colors.onPrimary}
            size={22}
            onPress={() => {
              stopAll();
              setHistoryOpen(true);
            }}
          />
          <IconButton
            icon="refresh"
            iconColor={colors.onPrimary}
            size={22}
            onPress={newConversation}
            disabled={phase === "thinking"}
          />
          <IconButton
            icon="close"
            iconColor={colors.onPrimary}
            size={22}
            onPress={() => {
              stopAll();
              navigation.goBack();
            }}
          />
        </View>
        <Text style={styles.heroSubtitle}>
          Ask about bookings, earnings, drivers, or inbox drafts.
          Read-only: I can't create or send anything yet.
        </Text>
      </LinearGradient>

      <ScrollView
        ref={scrollRef}
        style={styles.thread}
        contentContainerStyle={styles.threadContent}
        onContentSizeChange={() =>
          scrollRef.current?.scrollToEnd({ animated: true })
        }
      >
        {conversationId != null && conversationQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        ) : null}

        {messages.length === 0 &&
        !pendingText &&
        !(conversationId != null && conversationQuery.isLoading) ? (
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

        {pendingText ? (
          <>
            <MessageBubble
              message={{
                id: -1,
                role: "user",
                body: pendingText,
                created_at: "",
              }}
            />
            <View style={styles.pendingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.pendingText}>Thinking…</Text>
            </View>
          </>
        ) : null}

        {errorText ? (
          <View style={styles.errorCard}>
            <Text style={styles.errorText}>{errorText}</Text>
          </View>
        ) : null}
        {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}
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
            disabled={handsFree}
          />
        )}

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusPill,
              phase === "listening" && styles.statusPillListening,
              phase === "thinking" && styles.statusPillThinking,
              phase === "speaking" && styles.statusPillSpeaking,
            ]}
          >
            {phase === "thinking" ? (
              <ActivityIndicator size={10} color={colors.heading} />
            ) : (
              <View
                style={[
                  styles.statusDot,
                  phase !== "idle" && styles.statusDotActive,
                ]}
              />
            )}
            <Text style={styles.statusText}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.composerActions}>
          <View style={styles.sideSlot}>
            <Button
              compact
              mode={handsFree ? "contained" : "outlined"}
              onPress={toggleHandsFree}
              icon={handsFree ? "account-voice" : "account-voice-off"}
              buttonColor={handsFree ? colors.primary : undefined}
              textColor={handsFree ? colors.onPrimary : colors.primary}
              style={styles.handsFreeButton}
            >
              Hands-free
            </Button>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onMicPress}
            disabled={phase === "thinking" && !handsFree}
            style={[
              styles.micButton,
              (listening || handsFree || speaking) && styles.micButtonActive,
              phase === "thinking" && !handsFree && styles.micButtonDisabled,
            ]}
          >
            <Text style={styles.micButtonIcon}>
              {listening || handsFree || speaking ? "■" : "🎙"}
            </Text>
          </TouchableOpacity>

          <View style={[styles.sideSlot, { alignItems: "flex-end" }]}>
            {!listening && !handsFree && draftInput.trim() ? (
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
      </View>

      <HistorySheet
        visible={historyOpen}
        currentId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onOpen={openConversation}
        onDeleted={(id) => {
          if (id === conversationIdRef.current) newConversation();
        }}
      />
    </KeyboardAvoidingView>
  );
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function HistorySheet({
  visible,
  currentId,
  onClose,
  onOpen,
  onDeleted,
}: {
  visible: boolean;
  currentId: number | undefined;
  onClose: () => void;
  onOpen: (id: number) => void;
  onDeleted: (id: number) => void;
}) {
  const listQuery = useAssistantConversations(visible);
  const deleteMutation = useDeleteAssistantConversation();
  const conversations: AssistantConversationSummary[] = listQuery.data ?? [];

  function confirmDelete(c: AssistantConversationSummary) {
    Alert.alert(
      "Delete conversation?",
      `"${c.title || "Untitled"}" will be removed from your assistant history. This only deletes the chat, nothing else.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(c.id);
              onDeleted(c.id);
            } catch (err: unknown) {
              Alert.alert("Couldn't delete", formatApiError(err));
            }
          },
        },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Conversations</Text>
          <IconButton icon="close" size={22} onPress={onClose} />
        </View>
        {listQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 24 }} />
        ) : listQuery.isError ? (
          <View style={styles.sheetEmpty}>
            <Text style={styles.errorText}>
              {formatApiError(listQuery.error)}
            </Text>
            <Button onPress={() => listQuery.refetch()}>Try again</Button>
          </View>
        ) : conversations.length === 0 ? (
          <View style={styles.sheetEmpty}>
            <Text style={styles.pendingText}>No conversations yet.</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
            {conversations.map((c) => (
              <View
                key={c.id}
                style={[
                  styles.historyRow,
                  c.id === currentId && styles.historyRowActive,
                ]}
              >
                <TouchableOpacity
                  style={{ flex: 1 }}
                  activeOpacity={0.8}
                  onPress={() => onOpen(c.id)}
                >
                  <Text style={styles.historyTitle} numberOfLines={2}>
                    {c.title || "Untitled"}
                  </Text>
                  <Text style={styles.historyMeta}>
                    {formatWhen(c.last_message_at)} · {c.message_count}{" "}
                    {c.message_count === 1 ? "message" : "messages"}
                  </Text>
                </TouchableOpacity>
                <IconButton
                  icon="trash-can-outline"
                  iconColor={colors.muted}
                  size={20}
                  disabled={deleteMutation.isPending}
                  onPress={() => confirmDelete(c)}
                />
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
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
  micButtonDisabled: { opacity: 0.5 },
  micButtonIcon: { color: colors.onPrimary, fontSize: 24, fontWeight: "800" },

  sideSlot: { flex: 1 },
  handsFreeButton: { alignSelf: "flex-start", borderColor: colors.primary },
  statusRow: { alignItems: "center", marginBottom: 8 },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusPillListening: {
    backgroundColor: "rgba(176,59,59,0.10)",
    borderColor: "#b03b3b",
  },
  statusPillThinking: {
    backgroundColor: "rgba(11,91,51,0.06)",
    borderColor: colors.border,
  },
  statusPillSpeaking: {
    backgroundColor: "rgba(11,91,51,0.10)",
    borderColor: colors.primary,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.muted,
  },
  statusDotActive: { backgroundColor: colors.primary },
  statusText: { color: colors.heading, fontSize: 12, fontWeight: "700" },

  errorCard: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(176,59,59,0.08)",
    borderWidth: 1,
    borderColor: "#b03b3b",
  },
  errorText: { color: "#8a2c2c", fontSize: 13, lineHeight: 18 },
  noticeText: {
    color: colors.muted,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 10,
  },

  sheet: { flex: 1, backgroundColor: colors.background },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 8,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sheetTitle: {
    flex: 1,
    color: colors.heading,
    fontSize: 18,
    fontWeight: "800",
  },
  sheetEmpty: { padding: 24, alignItems: "center", gap: 8 },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyRowActive: { backgroundColor: "rgba(11,91,51,0.06)" },
  historyTitle: { color: colors.heading, fontSize: 14, fontWeight: "700" },
  historyMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
});
