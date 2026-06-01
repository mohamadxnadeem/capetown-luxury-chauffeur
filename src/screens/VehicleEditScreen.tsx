import React, { useEffect, useMemo, useState } from "react";
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
  Chip,
  Menu,
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCreateVehicle,
  useDeleteVehicle,
  useDeleteVehiclePhoto,
  useUpdateVehicle,
  useUpdateVehiclePhoto,
  useUploadVehiclePhoto,
  useVehicle,
} from "@/hooks/useVehicles";
import { useBookingFormOptions } from "@/hooks/useBookings";
import type {
  CreateVehiclePayload,
  DriverNested,
  Vehicle,
  VehicleCategory,
  VehicleCoverPhoto,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { ChipListInput } from "@/components/ChipListInput";
import { ShimmerImage } from "@/components/ShimmerImage";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";

// ---- Form state ---------------------------------------------------------

interface FormState {
  title: string;
  short_description: string;
  highlight: string;
  vehicle_type: string;
  number_of_seats: string; // string in form, parsed on save
  luggage_capacity: string;
  category: VehicleCategory;
  price: string;
  features: string[]; // chip list — one item per chip
  ideal_for: string[]; // chip list
  registration_number: string;
  driver_id: number | null;
  is_active: boolean;
  is_public: boolean;
}

const EMPTY_FORM: FormState = {
  title: "",
  short_description: "",
  highlight: "",
  vehicle_type: "",
  number_of_seats: "",
  luggage_capacity: "",
  category: "premium",
  price: "",
  features: [],
  ideal_for: [],
  registration_number: "",
  driver_id: null,
  is_active: true,
  is_public: true,
};

function vehicleToForm(v: Vehicle): FormState {
  return {
    title: v.title ?? "",
    short_description: v.short_description ?? "",
    highlight: v.highlight ?? "",
    vehicle_type: v.vehicle_type ?? "",
    number_of_seats: v.number_of_seats != null ? String(v.number_of_seats) : "",
    luggage_capacity:
      v.luggage_capacity != null ? String(v.luggage_capacity) : "",
    category: v.category ?? "premium",
    price: v.price ?? "",
    features: v.features ?? [],
    ideal_for: v.ideal_for ?? [],
    registration_number: v.registration_number ?? "",
    driver_id: v.driver?.id ?? null,
    is_active: v.is_active ?? true,
    is_public: v.is_public ?? true,
  };
}

function formToPayload(f: FormState): CreateVehiclePayload {
  return {
    title: f.title.trim(),
    short_description: f.short_description.trim(),
    highlight: f.highlight.trim(),
    vehicle_type: f.vehicle_type.trim(),
    number_of_seats: f.number_of_seats ? parseInt(f.number_of_seats, 10) : 0,
    luggage_capacity: f.luggage_capacity
      ? parseInt(f.luggage_capacity, 10)
      : 0,
    category: f.category,
    // Backend's price column is integer-only (DecimalField with
    // decimal_places=0), so round and serialize without any "." or trailing
    // zeros — "3500.00" gets rejected as "no more than 0 decimal places".
    price: f.price ? String(Math.round(parseFloat(f.price))) : "0",
    features: f.features,
    ideal_for: f.ideal_for,
    registration_number: f.registration_number.trim(),
    // Backend expects driver_id (FK by id), not the nested driver object.
    driver_id: f.driver_id,
    is_active: f.is_active,
    is_public: f.is_public,
  };
}

// ---- Screen -------------------------------------------------------------

export default function VehicleEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "VehicleEdit">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const editingId = route.params?.vehicleId;
  const isNew = editingId == null;

  const vehicleQuery = useVehicle(editingId);
  const optionsQuery = useBookingFormOptions();

  const createMutation = useCreateVehicle();
  const updateMutation = useUpdateVehicle(editingId);
  const deleteMutation = useDeleteVehicle();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [driverMenuOpen, setDriverMenuOpen] = useState(false);

  // Populate form when the vehicle data lands in edit mode.
  useEffect(() => {
    if (vehicleQuery.data) setForm(vehicleToForm(vehicleQuery.data));
  }, [vehicleQuery.data]);

  // Update the stack header title to reflect new vs edit.
  useEffect(() => {
    navigation.setOptions({
      title: isNew ? "New Vehicle" : "Edit Vehicle",
    });
  }, [navigation, isNew]);

  const drivers: DriverNested[] = useMemo(
    () => optionsQuery.data?.drivers ?? [],
    [optionsQuery.data?.drivers]
  );
  const selectedDriver = drivers.find((d) => d.id === form.driver_id);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate(): string | null {
    if (!form.title.trim()) return "Title is required.";
    if (form.price && isNaN(parseFloat(form.price)))
      return "Price must be a number.";
    if (form.number_of_seats && isNaN(parseInt(form.number_of_seats, 10)))
      return "Seats must be a whole number.";
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      Alert.alert("Can't save", err);
      return;
    }
    const payload = formToPayload(form);
    try {
      if (isNew) {
        const created = await createMutation.mutateAsync(payload);
        Alert.alert("Vehicle created", `${created.title} is in your fleet.`, [
          {
            text: "View",
            onPress: () =>
              navigation.replace("VehicleDetail", { vehicleId: created.id }),
          },
        ]);
      } else {
        await updateMutation.mutateAsync(payload);
        Alert.alert("Saved", "Vehicle updated.");
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't save", formatApiError(e));
    }
  }

  async function handleDelete() {
    if (editingId == null) return;
    Alert.alert(
      "Delete this vehicle?",
      `${form.title || "This vehicle"} will be removed from your fleet. Existing bookings stay intact.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMutation.mutateAsync(editingId);
              navigation.goBack();
            } catch (e: unknown) {
              Alert.alert("Couldn't delete", formatApiError(e));
            }
          },
        },
      ]
    );
  }

  if (!isNew && vehicleQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Basics ---- */}
        <Section title="Basics">
          <TextInput
            label="Title"
            value={form.title}
            onChangeText={(v) => update("title", v)}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. Mercedes V-Class"
          />
          <TextInput
            label="Registration number"
            value={form.registration_number}
            onChangeText={(v) => update("registration_number", v)}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. CA 123 ABC"
            autoCapitalize="characters"
          />
          <View style={styles.row}>
            <TextInput
              label="Vehicle type"
              value={form.vehicle_type}
              onChangeText={(v) => update("vehicle_type", v)}
              mode="outlined"
              style={[styles.input, styles.half]}
              placeholder="SUV / Sedan / Van"
            />
            <TextInput
              label="Daily rate (R)"
              value={form.price}
              onChangeText={(v) => update("price", v)}
              mode="outlined"
              keyboardType="decimal-pad"
              style={[styles.input, styles.half]}
            />
          </View>
          <View style={styles.row}>
            <TextInput
              label="Seats"
              value={form.number_of_seats}
              onChangeText={(v) => update("number_of_seats", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.half]}
            />
            <TextInput
              label="Luggage"
              value={form.luggage_capacity}
              onChangeText={(v) => update("luggage_capacity", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.half]}
            />
          </View>

          <Text style={styles.miniLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {(["premium", "budget"] as const).map((c) => {
              const active = form.category === c;
              return (
                <Chip
                  key={c}
                  selected={active}
                  onPress={() => update("category", c)}
                  style={[styles.chip, active && styles.chipActive]}
                  textStyle={active ? styles.chipTextActive : styles.chipText}
                  showSelectedCheck={false}
                >
                  {c[0].toUpperCase() + c.slice(1)}
                </Chip>
              );
            })}
          </View>
        </Section>

        {/* ---- Description ---- */}
        <Section title="Description">
          <TextInput
            label="Short description"
            value={form.short_description}
            onChangeText={(v) => update("short_description", v)}
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
            placeholder="One-line summary shown on the website."
          />
          <TextInput
            label="Highlight"
            value={form.highlight}
            onChangeText={(v) => update("highlight", v)}
            mode="outlined"
            style={styles.input}
            placeholder="Optional tagline"
          />
          <Text style={styles.miniLabel}>Features</Text>
          <ChipListInput
            values={form.features}
            onChange={(next) => update("features", next)}
            placeholder="A/C, Wi-Fi, leather seats… (one per chip)"
          />

          <Text style={[styles.miniLabel, { marginTop: 12 }]}>Ideal for</Text>
          <ChipListInput
            values={form.ideal_for}
            onChange={(next) => update("ideal_for", next)}
            placeholder="Business, family, airport transfer…"
          />
        </Section>

        {/* ---- Settings ---- */}
        <Section title="Settings">
          <Menu
            visible={driverMenuOpen}
            onDismiss={() => setDriverMenuOpen(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setDriverMenuOpen(true)}
                style={styles.driverButton}
                contentStyle={styles.driverButtonContent}
                textColor={colors.heading}
              >
                {selectedDriver?.full_name ?? "No driver assigned"}
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                update("driver_id", null);
                setDriverMenuOpen(false);
              }}
              title="No driver"
            />
            {drivers.map((d) => (
              <Menu.Item
                key={d.id}
                onPress={() => {
                  update("driver_id", d.id);
                  setDriverMenuOpen(false);
                }}
                title={d.full_name}
              />
            ))}
          </Menu>

          <ToggleRow
            label="Active"
            description="Inactive vehicles are hidden from the booking picker."
            value={form.is_active}
            onChange={(v) => update("is_active", v)}
          />
          <ToggleRow
            label="Show on website"
            description="Off → vehicle stays bookable here but hidden from www.capetown-concierge.co.za. Use this for duplicate vehicles (e.g. a second V-Class)."
            value={form.is_public}
            onChange={(v) => update("is_public", v)}
          />
        </Section>

        {/* ---- Photos (edit mode only) ---- */}
        {!isNew && vehicleQuery.data ? (
          <PhotoManager vehicle={vehicleQuery.data} />
        ) : isNew ? (
          <Card style={styles.section} mode="elevated">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.helper}>
                Save the vehicle first, then come back here to add photos.
              </Text>
            </View>
          </Card>
        ) : null}

        {/* ---- Actions ---- */}
        <Button
          mode="contained"
          onPress={handleSave}
          loading={createMutation.isPending || updateMutation.isPending}
          disabled={createMutation.isPending || updateMutation.isPending}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          labelStyle={styles.saveButtonLabel}
        >
          {isNew ? "Create vehicle" : "Save changes"}
        </Button>

        {!isNew ? (
          <Button
            mode="outlined"
            onPress={handleDelete}
            loading={deleteMutation.isPending}
            disabled={deleteMutation.isPending}
            style={styles.deleteButton}
            contentStyle={styles.deleteButtonContent}
            labelStyle={styles.deleteButtonLabel}
            textColor="#b03b3b"
            icon="trash-can-outline"
          >
            Delete vehicle
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Photo manager (in-screen sub-component) ----------------------------

function PhotoManager({ vehicle }: { vehicle: Vehicle }) {
  const uploadMutation = useUploadVehiclePhoto(vehicle.id);
  const updatePhotoMutation = useUpdateVehiclePhoto(vehicle.id);
  const deletePhotoMutation = useDeleteVehiclePhoto(vehicle.id);

  const photos = useMemo(() => {
    const list = vehicle.cover_photos ?? [];
    return [...list].sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [vehicle.cover_photos]);

  async function pickAndUpload() {
    // Ask for permission first (iOS especially is strict here).
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photos permission",
        "Allow photo library access in Settings to add vehicle photos."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      // SDK 54+: pass a string array. The old `MediaTypeOptions.Images`
      // constant is deprecated.
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: false,
    });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    try {
      await uploadMutation.mutateAsync({
        fileUri: asset.uri,
        filename: asset.fileName ?? undefined,
        mimeType: asset.mimeType ?? undefined,
      });
    } catch (e: unknown) {
      Alert.alert("Couldn't upload", formatApiError(e));
    }
  }

  async function setFeatured(photo: VehicleCoverPhoto) {
    try {
      await updatePhotoMutation.mutateAsync({
        photoId: photo.id,
        patch: { is_featured: true },
      });
    } catch (e: unknown) {
      Alert.alert("Couldn't update", formatApiError(e));
    }
  }

  async function deletePhoto(photo: VehicleCoverPhoto) {
    Alert.alert("Delete this photo?", "This can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deletePhotoMutation.mutateAsync(photo.id);
          } catch (e: unknown) {
            Alert.alert("Couldn't delete", formatApiError(e));
          }
        },
      },
    ]);
  }

  return (
    <Card style={styles.section} mode="elevated">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <Button
          compact
          onPress={pickAndUpload}
          loading={uploadMutation.isPending}
          disabled={uploadMutation.isPending}
          icon="plus"
          textColor={colors.primary}
        >
          Add
        </Button>
      </View>
      <View style={styles.sectionBody}>
        {photos.length === 0 ? (
          <Text style={styles.helper}>
            No photos yet. Tap Add to upload the first one — it'll become the
            featured image automatically.
          </Text>
        ) : (
          <View style={styles.photoGrid}>
            {photos.map((p) => (
              <View key={p.id} style={styles.photoTile}>
                <ShimmerImage uri={p.cover_photos} style={styles.photoImage} />
                {p.is_featured ? (
                  <View style={styles.featuredBadge}>
                    <Text style={styles.featuredText}>FEATURED</Text>
                  </View>
                ) : null}
                <View style={styles.photoActions}>
                  {!p.is_featured ? (
                    <TouchableOpacity
                      onPress={() => setFeatured(p)}
                      style={styles.photoActionBtn}
                    >
                      <Text style={styles.photoActionText}>★</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    onPress={() => deletePhoto(p)}
                    style={[styles.photoActionBtn, styles.photoActionDanger]}
                  >
                    <Text style={styles.photoActionText}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}

// ---- Sub-components -----------------------------------------------------

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card style={styles.section} mode="elevated">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {description ? (
          <Text style={styles.toggleDescription}>{description}</Text>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  content: { padding: 16, paddingBottom: 32 },

  section: {
    marginBottom: 14,
    borderRadius: 16,
    backgroundColor: colors.surface,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  sectionTitle: {
    color: colors.heading,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  sectionBody: { padding: 16, paddingTop: 12 },

  input: { marginBottom: 10, backgroundColor: colors.surface },
  row: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 18 },

  miniLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 6,
  },
  categoryRow: { flexDirection: "row", gap: 8 },
  chip: { backgroundColor: colors.surfaceMuted },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.onPrimary, fontWeight: "700" },

  driverButton: {
    borderRadius: 12,
    borderColor: colors.border,
    marginBottom: 12,
  },
  driverButtonContent: { height: 48, justifyContent: "flex-start" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  toggleText: { flex: 1, marginRight: 12 },
  toggleLabel: { color: colors.heading, fontSize: 15, fontWeight: "700" },
  toggleDescription: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  saveButton: { borderRadius: 14, marginTop: 4 },
  saveButtonContent: { height: 52 },
  saveButtonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.3 },

  deleteButton: {
    marginTop: 12,
    borderRadius: 12,
    borderColor: "#e3c1c1",
    backgroundColor: "#fbf2f2",
  },
  deleteButtonContent: { height: 48 },
  deleteButtonLabel: { fontWeight: "700", letterSpacing: 0.3 },

  // Photo grid
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photoTile: {
    width: "48%",
    aspectRatio: 4 / 3,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted,
    position: "relative",
  },
  photoImage: { width: "100%", height: "100%" },
  featuredBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  featuredText: {
    color: colors.onPrimary,
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 1,
  },
  photoActions: {
    position: "absolute",
    bottom: 8,
    right: 8,
    flexDirection: "row",
    gap: 6,
  },
  photoActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  photoActionDanger: { backgroundColor: "rgba(176,59,59,0.85)" },
  photoActionText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
