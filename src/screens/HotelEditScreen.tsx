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
  Switch,
  Text,
  TextInput,
} from "react-native-paper";
import * as ImagePicker from "expo-image-picker";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import {
  useCreateHotel,
  useDeleteHotel,
  useDeleteHotelPhoto,
  useHotel,
  useUpdateHotel,
  useUpdateHotelPhoto,
  useUploadHotelPhoto,
} from "@/hooks/useHotels";
import type {
  CreateHotelPayload,
  Hotel,
  HotelPhoto,
  VillaArea,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { ChipListInput } from "@/components/ChipListInput";
import { ShimmerImage } from "@/components/ShimmerImage";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";

interface FormState {
  name: string;
  slug: string;
  location: string;
  area: VillaArea;
  star_rating: number;
  room_types: string[];
  bedrooms_available: string;
  max_guests: string;
  price_per_night_from: string;
  price_currency: string;
  short_description: string;
  description: string;
  features: string[];
  is_featured: boolean;
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  location: "",
  area: "camps_bay",
  star_rating: 5,
  room_types: [],
  bedrooms_available: "",
  max_guests: "",
  price_per_night_from: "",
  price_currency: "ZAR",
  short_description: "",
  description: "",
  features: [],
  is_featured: false,
  is_active: true,
  sort_order: "0",
};

const AREAS: { key: VillaArea; label: string }[] = [
  { key: "camps_bay", label: "Camps Bay" },
  { key: "clifton", label: "Clifton" },
  { key: "bantry_bay", label: "Bantry Bay" },
  { key: "constantia", label: "Constantia" },
  { key: "franschhoek", label: "Franschhoek" },
  { key: "stellenbosch", label: "Stellenbosch" },
  { key: "other", label: "Other" },
];

// Backend returns hotel area as a free-form string ("Camps Bay", "city-bowl",
// etc.) instead of the VillaArea enum. Normalize into the picker's enum
// values so the form's chip selection can still light up; unknown values
// fall through to "other" so the operator can just re-pick.
function hotelAreaToEnum(area: string | null | undefined): VillaArea {
  if (!area) return "other";
  const normalized = area.toLowerCase().replace(/[-\s]+/g, "_");
  const known: VillaArea[] = [
    "camps_bay",
    "clifton",
    "bantry_bay",
    "constantia",
    "franschhoek",
    "stellenbosch",
    "other",
  ];
  return known.includes(normalized as VillaArea)
    ? (normalized as VillaArea)
    : "other";
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function hotelToForm(h: Hotel): FormState {
  return {
    name: h.name ?? "",
    slug: h.slug ?? "",
    location: h.location ?? "",
    // Backend can return a display string (e.g. "Camps Bay"); coerce to the
    // enum via a lookup, defaulting to "other" so the picker still renders.
    area: hotelAreaToEnum(h.area),
    star_rating: h.star_rating ?? 5,
    room_types: h.room_types ?? [],
    bedrooms_available:
      h.bedrooms_available != null ? String(h.bedrooms_available) : "",
    max_guests: h.max_guests != null ? String(h.max_guests) : "",
    price_per_night_from: h.price_per_night_from ?? "",
    price_currency: h.price_currency ?? "ZAR",
    short_description: h.short_description ?? "",
    description: h.description ?? "",
    features: h.features ?? [],
    is_featured: h.is_featured ?? false,
    is_active: h.is_active ?? true,
    sort_order: h.sort_order != null ? String(h.sort_order) : "0",
  };
}

function formToPayload(f: FormState): CreateHotelPayload {
  return {
    name: f.name.trim(),
    slug: f.slug.trim() || undefined,
    location: f.location.trim(),
    area: f.area,
    star_rating: f.star_rating,
    room_types: f.room_types,
    bedrooms_available: f.bedrooms_available
      ? parseInt(f.bedrooms_available, 10)
      : 0,
    max_guests: f.max_guests ? parseInt(f.max_guests, 10) : 0,
    price_per_night_from: f.price_per_night_from || "0",
    price_currency: f.price_currency || "ZAR",
    short_description: f.short_description.trim(),
    description: f.description.trim(),
    features: f.features,
    is_featured: f.is_featured,
    is_active: f.is_active,
    sort_order: f.sort_order ? parseInt(f.sort_order, 10) : 0,
  };
}

export default function HotelEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "HotelEdit">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const editingId = route.params?.hotelId;
  const isNew = editingId == null;

  const hotelQuery = useHotel(editingId);

  const createMutation = useCreateHotel();
  const updateMutation = useUpdateHotel(editingId);
  const deleteMutation = useDeleteHotel();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugDirty, setSlugDirty] = useState(false);

  useEffect(() => {
    if (hotelQuery.data) {
      setForm(hotelToForm(hotelQuery.data));
      setSlugDirty(true);
    }
  }, [hotelQuery.data]);

  useEffect(() => {
    navigation.setOptions({
      title: isNew ? "New Hotel" : "Edit Hotel",
    });
  }, [navigation, isNew]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onChangeName(v: string) {
    setForm((f) => ({
      ...f,
      name: v,
      slug: slugDirty ? f.slug : slugify(v),
    }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required.";
    if (form.price_per_night_from && isNaN(parseFloat(form.price_per_night_from)))
      return "Price must be a number.";
    if (form.bedrooms_available && isNaN(parseInt(form.bedrooms_available, 10)))
      return "Rooms must be a whole number.";
    if (form.max_guests && isNaN(parseInt(form.max_guests, 10)))
      return "Max guests must be a whole number.";
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
        Alert.alert("Hotel created", `${created.name} is now in your list.`, [
          {
            text: "Add photos",
            onPress: () =>
              navigation.replace("HotelEdit", { hotelId: created.id }),
          },
        ]);
      } else {
        await updateMutation.mutateAsync(payload);
        Alert.alert("Saved", "Hotel updated.");
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't save", formatApiError(e));
    }
  }

  async function handleDelete() {
    if (editingId == null) return;
    Alert.alert(
      "Delete this hotel?",
      `${form.name || "This hotel"} will be hidden from the marketing site.`,
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

  if (!isNew && hotelQuery.isLoading) {
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
            label="Name"
            value={form.name}
            onChangeText={onChangeName}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. The Bay Hotel — Camps Bay"
          />
          <TextInput
            label="Slug (URL)"
            value={form.slug}
            onChangeText={(v) => {
              setSlugDirty(true);
              update("slug", v);
            }}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="auto-derived from name"
          />
          <TextInput
            label="Location (display)"
            value={form.location}
            onChangeText={(v) => update("location", v)}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. Camps Bay"
          />

          <Text style={styles.miniLabel}>Area</Text>
          <View style={styles.chipWrap}>
            {AREAS.map((a) => {
              const active = form.area === a.key;
              return (
                <Chip
                  key={a.key}
                  selected={active}
                  onPress={() => update("area", a.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  textStyle={active ? styles.chipTextActive : styles.chipText}
                  showSelectedCheck={false}
                >
                  {a.label}
                </Chip>
              );
            })}
          </View>

          <Text style={[styles.miniLabel, { marginTop: 12 }]}>Star rating</Text>
          <View style={styles.chipWrap}>
            {[1, 2, 3, 4, 5].map((n) => {
              const active = form.star_rating === n;
              return (
                <Chip
                  key={n}
                  selected={active}
                  onPress={() => update("star_rating", n)}
                  style={[styles.chip, active && styles.chipActive]}
                  textStyle={active ? styles.chipTextActive : styles.chipText}
                  showSelectedCheck={false}
                >
                  {"★".repeat(n)}
                </Chip>
              );
            })}
          </View>
        </Section>

        {/* ---- Capacity ---- */}
        <Section title="Rooms & capacity">
          <View style={styles.row}>
            <TextInput
              label="Rooms available"
              value={form.bedrooms_available}
              onChangeText={(v) => update("bedrooms_available", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.half]}
            />
            <TextInput
              label="Max guests"
              value={form.max_guests}
              onChangeText={(v) => update("max_guests", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.half]}
            />
          </View>

          <Text style={styles.miniLabel}>Room types</Text>
          <ChipListInput
            values={form.room_types}
            onChange={(next) => update("room_types", next)}
            placeholder="Sea View Suite, Family Room, Presidential…"
          />
        </Section>

        {/* ---- Price ---- */}
        <Section title="Price">
          <View style={styles.row}>
            <TextInput
              label="Per night from"
              value={form.price_per_night_from}
              onChangeText={(v) => update("price_per_night_from", v)}
              mode="outlined"
              keyboardType="decimal-pad"
              style={[styles.input, styles.flex2]}
            />
            <TextInput
              label="Currency"
              value={form.price_currency}
              onChangeText={(v) => update("price_currency", v.toUpperCase())}
              mode="outlined"
              autoCapitalize="characters"
              autoCorrect={false}
              style={[styles.input, styles.half]}
              placeholder="ZAR"
            />
          </View>
        </Section>

        {/* ---- Copy ---- */}
        <Section title="Copy">
          <TextInput
            label={`Short description (${form.short_description.length}/300)`}
            value={form.short_description}
            onChangeText={(v) =>
              update("short_description", v.slice(0, 300))
            }
            mode="outlined"
            multiline
            numberOfLines={3}
            style={styles.input}
          />
          <TextInput
            label="Description (HTML)"
            value={form.description}
            onChangeText={(v) => update("description", v)}
            mode="outlined"
            multiline
            numberOfLines={6}
            style={styles.input}
            placeholder="<p>Rich text for the detail page</p>"
          />

          <Text style={styles.miniLabel}>Features</Text>
          <ChipListInput
            values={form.features}
            onChange={(next) => update("features", next)}
            placeholder="Spa, Pool, Restaurant, Concierge…"
          />
        </Section>

        {/* ---- Visibility ---- */}
        <Section title="Visibility">
          <ToggleRow
            label="Active"
            description="Inactive hotels are hidden from the marketing site."
            value={form.is_active}
            onChange={(v) => update("is_active", v)}
          />
          <ToggleRow
            label="Featured"
            description="Featured hotels appear in homepage carousels."
            value={form.is_featured}
            onChange={(v) => update("is_featured", v)}
          />
          <TextInput
            label="Sort order"
            value={form.sort_order}
            onChangeText={(v) => update("sort_order", v)}
            mode="outlined"
            keyboardType="number-pad"
            style={styles.input}
            placeholder="0"
          />
        </Section>

        {/* ---- Photos (edit mode only) ---- */}
        {!isNew && hotelQuery.data ? (
          <PhotoManager hotel={hotelQuery.data} />
        ) : isNew ? (
          <Card style={styles.section} mode="elevated">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.helper}>
                Save the hotel first, then come back to add photos.
              </Text>
            </View>
          </Card>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSave}
          loading={createMutation.isPending || updateMutation.isPending}
          disabled={createMutation.isPending || updateMutation.isPending}
          style={styles.saveButton}
          contentStyle={styles.saveButtonContent}
          labelStyle={styles.saveButtonLabel}
        >
          {isNew ? "Create hotel" : "Save changes"}
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
            Delete hotel
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Photo manager (multi-select upload + bulk delete) ------------------

function PhotoManager({ hotel }: { hotel: Hotel }) {
  const uploadMutation = useUploadHotelPhoto(hotel.id);
  const updatePhotoMutation = useUpdateHotelPhoto(hotel.id);
  const deletePhotoMutation = useDeleteHotelPhoto(hotel.id);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const photos = useMemo(() => {
    const list = hotel.cover_photos ?? [];
    return [...list].sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [hotel.cover_photos]);

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function pickAndUpload() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photos permission",
        "Allow photo library access in Settings to add hotel photos."
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 20,
    });
    if (result.canceled || result.assets.length === 0) return;
    for (const asset of result.assets) {
      try {
        await uploadMutation.mutateAsync({
          fileUri: asset.uri,
          filename: asset.fileName ?? undefined,
          mimeType: asset.mimeType ?? undefined,
        });
      } catch (e: unknown) {
        Alert.alert("Some photos didn't upload", formatApiError(e));
        return;
      }
    }
  }

  async function setFeatured(photo: HotelPhoto) {
    try {
      await updatePhotoMutation.mutateAsync({
        photoId: photo.id,
        patch: { is_featured: true },
      });
    } catch (e: unknown) {
      Alert.alert("Couldn't update", formatApiError(e));
    }
  }

  async function deleteOne(photo: HotelPhoto) {
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

  async function bulkDelete() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    Alert.alert(
      `Delete ${ids.length} photo${ids.length === 1 ? "" : "s"}?`,
      "This can't be undone.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of ids) {
              try {
                await deletePhotoMutation.mutateAsync(id);
              } catch (e: unknown) {
                Alert.alert("Couldn't delete all", formatApiError(e));
                exitSelectMode();
                return;
              }
            }
            exitSelectMode();
          },
        },
      ]
    );
  }

  return (
    <Card style={styles.section} mode="elevated">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <View style={styles.photoHeaderActions}>
          {selectMode ? (
            <Button compact onPress={exitSelectMode} textColor={colors.muted}>
              Cancel
            </Button>
          ) : (
            <>
              {photos.length > 0 ? (
                <Button
                  compact
                  onPress={() => setSelectMode(true)}
                  textColor={colors.muted}
                >
                  Select
                </Button>
              ) : null}
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
            </>
          )}
        </View>
      </View>
      <View style={styles.sectionBody}>
        {photos.length === 0 ? (
          <Text style={styles.helper}>
            No photos yet. Tap Add to upload — you can pick multiple at once.
            The first uploaded photo becomes the featured image automatically.
          </Text>
        ) : (
          <View style={styles.photoGrid}>
            {photos.map((p) => {
              const isSelected = selectedIds.has(p.id);
              return (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={selectMode ? 0.7 : 1}
                  onPress={selectMode ? () => toggleSelected(p.id) : undefined}
                  style={styles.photoTile}
                >
                  <ShimmerImage uri={p.cover_photos} style={styles.photoImage} />
                  {p.is_featured ? (
                    <View style={styles.featuredBadge}>
                      <Text style={styles.featuredText}>FEATURED</Text>
                    </View>
                  ) : null}
                  {selectMode ? (
                    <View
                      style={[
                        styles.selectOverlay,
                        isSelected && styles.selectOverlayActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.selectCheck,
                          isSelected && styles.selectCheckActive,
                        ]}
                      >
                        {isSelected ? (
                          <Text style={styles.selectCheckMark}>✓</Text>
                        ) : null}
                      </View>
                    </View>
                  ) : (
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
                        onPress={() => deleteOne(p)}
                        style={[styles.photoActionBtn, styles.photoActionDanger]}
                      >
                        <Text style={styles.photoActionText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {selectMode && selectedIds.size > 0 ? (
          <Button
            mode="contained"
            onPress={bulkDelete}
            loading={deletePhotoMutation.isPending}
            disabled={deletePhotoMutation.isPending}
            buttonColor="#b03b3b"
            textColor="#fff"
            icon="trash-can-outline"
            style={styles.bulkDeleteButton}
            contentStyle={styles.bulkDeleteContent}
          >
            Delete {selectedIds.size} photo{selectedIds.size === 1 ? "" : "s"}
          </Button>
        ) : null}
      </View>
    </Card>
  );
}

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
  flex2: { flex: 2 },
  helper: { color: colors.muted, fontSize: 13, lineHeight: 18 },

  miniLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginTop: 6,
    marginBottom: 6,
  },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { backgroundColor: colors.surfaceMuted },
  chipActive: { backgroundColor: colors.primary },
  chipText: { color: colors.text, fontWeight: "600" },
  chipTextActive: { color: colors.onPrimary, fontWeight: "700" },

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

  photoHeaderActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  selectOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.18)",
    justifyContent: "flex-end",
    alignItems: "flex-end",
    padding: 8,
  },
  selectOverlayActive: { backgroundColor: "rgba(11,91,51,0.45)" },
  selectCheck: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: "#fff",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
  },
  selectCheckActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectCheckMark: { color: "#fff", fontWeight: "800", fontSize: 16 },
  bulkDeleteButton: { marginTop: 12, borderRadius: 12 },
  bulkDeleteContent: { height: 48 },
});
