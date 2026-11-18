import React from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from "react-native";
import { colors } from "@/theme";
import { vehicleLabel } from "@/utils/vehicle";

// Shared vehicle chooser. Replaces Paper's <Menu>, whose anchored popup
// re-measures itself and clamps its own height, so long fleets could not be
// scrolled (or snapped back to the top). This is a plain native Modal with a
// FlatList inside a card that has a fixed, bounded height, so it scrolls the
// same way on iOS and Android.

type PickerVehicle = {
  id: number;
  title: string;
  registration_number?: string | null;
};

export type VehiclePickerExtra = {
  key: string;
  title: string;
  selected?: boolean;
  onPress: () => void;
};

type Props<V extends PickerVehicle> = {
  visible: boolean;
  onDismiss: () => void;
  vehicles: V[];
  selectedId: number | null | undefined;
  onSelect: (v: V) => void;
  heading?: string;
  // Optional rows shown above the vehicles (e.g. "No chauffeur").
  extras?: VehiclePickerExtra[];
};

type Row =
  | { kind: "extra"; extra: VehiclePickerExtra }
  | { kind: "vehicle"; vehicle: PickerVehicle };

export default function VehiclePickerModal<V extends PickerVehicle>({
  visible,
  onDismiss,
  vehicles,
  selectedId,
  onSelect,
  heading = "Choose a vehicle",
  extras = [],
}: Props<V>) {
  const { height } = useWindowDimensions();
  const rows: Row[] = [
    ...extras.map((extra): Row => ({ kind: "extra", extra })),
    ...vehicles.map((vehicle): Row => ({ kind: "vehicle", vehicle })),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[styles.card, { height: Math.min(height * 0.7, 560) }]}>
          <Text style={styles.heading}>{heading}</Text>
          <FlatList
            data={rows}
            keyExtractor={(r) =>
              r.kind === "extra" ? `x-${r.extra.key}` : `v-${r.vehicle.id}`
            }
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            nestedScrollEnabled
            ListEmptyComponent={
              <Text style={styles.empty}>No vehicles available.</Text>
            }
            renderItem={({ item }) => {
              const isExtra = item.kind === "extra";
              const selected = isExtra
                ? !!item.extra.selected
                : item.vehicle.id === selectedId;
              const title = isExtra
                ? item.extra.title
                : vehicleLabel(item.vehicle);
              return (
                <TouchableOpacity
                  activeOpacity={0.7}
                  style={[styles.row, selected && styles.rowActive]}
                  onPress={() =>
                    isExtra
                      ? item.extra.onPress()
                      : onSelect(item.vehicle as V)
                  }
                >
                  <Text
                    style={[styles.rowText, selected && styles.rowTextActive]}
                    numberOfLines={2}
                  >
                    {title}
                  </Text>
                  {selected ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  heading: {
    fontSize: 16,
    fontWeight: "700",
    color: colors.heading,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  list: { flex: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowActive: { backgroundColor: "rgba(0,0,0,0.05)" },
  rowText: { flex: 1, fontSize: 15, color: colors.heading },
  rowTextActive: { fontWeight: "700" },
  check: { fontSize: 16, marginLeft: 8, color: colors.heading },
  empty: { padding: 16, color: colors.muted },
});
