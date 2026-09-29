import React, { useState } from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import VillaListScreen from "@/screens/VillaListScreen";
import HotelListScreen from "@/screens/HotelListScreen";
import { colors } from "@/theme";

type Kind = "villas" | "hotels";

// Combined tab that hosts both Villas and Hotels behind a top segmented
// toggle. Keeps AdminTabs at 6 tabs total (was hitting 7 which crowds
// small screens) while surfacing both accommodation types one tap away.
export default function AccommodationScreen() {
  const [kind, setKind] = useState<Kind>("villas");

  return (
    <View style={styles.root}>
      <View style={styles.headerBar}>
        <Text style={styles.headerEyebrow}>ACCOMMODATION</Text>
        <Text style={styles.headerTitle}>
          Your {kind === "villas" ? "villas" : "hotels"}
        </Text>
      </View>
      <View style={styles.toggleWrap}>
        <View style={styles.toggle}>
          <ToggleButton
            label="Villas"
            active={kind === "villas"}
            onPress={() => setKind("villas")}
          />
          <ToggleButton
            label="Hotels"
            active={kind === "hotels"}
            onPress={() => setKind("hotels")}
          />
        </View>
      </View>
      {/* Render both screens but only show the active one. Keeping both
          mounted preserves scroll position + filter chip state when the
          operator flips back and forth. */}
      <View style={styles.body}>
        <View
          style={[styles.pane, kind !== "villas" && styles.paneHidden]}
          pointerEvents={kind === "villas" ? "auto" : "none"}
        >
          <VillaListScreen />
        </View>
        <View
          style={[styles.pane, kind !== "hotels" && styles.paneHidden]}
          pointerEvents={kind === "hotels" ? "auto" : "none"}
        >
          <HotelListScreen />
        </View>
      </View>
    </View>
  );
}

function ToggleButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[styles.toggleBtn, active && styles.toggleBtnActive]}
    >
      <Text
        style={[styles.toggleText, active && styles.toggleTextActive]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headerBar: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 4 },
  headerEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.6,
    marginBottom: 4,
  },
  headerTitle: {
    color: colors.heading,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  toggleWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: colors.surfaceMuted,
    borderRadius: 999,
    padding: 3,
    gap: 3,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 999,
    alignItems: "center",
  },
  toggleBtnActive: {
    backgroundColor: colors.surface,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  toggleText: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  toggleTextActive: { color: colors.heading },
  body: { flex: 1 },
  pane: { ...StyleSheet.absoluteFillObject },
  paneHidden: { opacity: 0 },
});
