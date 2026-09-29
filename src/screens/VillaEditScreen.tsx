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
import { Calendar } from "react-native-calendars";
import {
  useCreateVilla,
  useDeleteVilla,
  useDeleteVillaPhoto,
  useUpdateVilla,
  useUpdateVillaPhoto,
  useUploadVillaPhoto,
  useVilla,
  useVillaAvailability,
} from "@/hooks/useVillas";
import type {
  CreateVillaPayload,
  Villa,
  VillaArea,
  VillaPhoto,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { ChipListInput } from "@/components/ChipListInput";
import { ShimmerImage } from "@/components/ShimmerImage";
import { formatApiError } from "@/api/errors";
import { calendarTheme, colors } from "@/theme";

// ---- Form state ---------------------------------------------------------

interface FormState {
  name: string;
  slug: string;
  location: string;
  area: VillaArea;
  bedrooms: string; // string in form, parsed on save
  bathrooms: string;
  max_guests: string;
  price_per_night: string;
  price_currency: string;
  short_description: string;
  description: string;
  features: string[];
  nox_property_id: string;
  nox_booking_url: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  location: "",
  area: "camps_bay",
  bedrooms: "",
  bathrooms: "",
  max_guests: "",
  price_per_night: "",
  price_currency: "ZAR",
  short_description: "",
  description: "",
  features: [],
  nox_property_id: "",
  nox_booking_url: "",
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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function villaToForm(v: Villa): FormState {
  return {
    name: v.name ?? "",
    slug: v.slug ?? "",
    location: v.location ?? "",
    area: v.area ?? "camps_bay",
    bedrooms: v.bedrooms != null ? String(v.bedrooms) : "",
    bathrooms: v.bathrooms != null ? String(v.bathrooms) : "",
    max_guests: v.max_guests != null ? String(v.max_guests) : "",
    price_per_night: v.price_per_night ?? "",
    price_currency: v.price_currency ?? "ZAR",
    short_description: v.short_description ?? "",
    description: v.description ?? "",
    features: v.features ?? [],
    nox_property_id: v.nox_property_id ?? "",
    nox_booking_url: v.nox_booking_url ?? "",
    is_featured: v.is_featured ?? false,
    is_active: v.is_active ?? true,
    sort_order: v.sort_order != null ? String(v.sort_order) : "0",
  };
}

function formToPayload(f: FormState): CreateVillaPayload {
  return {
    name: f.name.trim(),
    // Only send slug if the operator changed it. Empty → backend auto-fills.
    slug: f.slug.trim() || undefined,
    location: f.location.trim(),
    area: f.area,
    bedrooms: f.bedrooms ? parseInt(f.bedrooms, 10) : 0,
    bathrooms: f.bathrooms ? parseInt(f.bathrooms, 10) : 0,
    max_guests: f.max_guests ? parseInt(f.max_guests, 10) : 0,
    price_per_night: f.price_per_night || "0",
    price_currency: f.price_currency || "ZAR",
    short_description: f.short_description.trim(),
    description: f.description.trim(),
    features: f.features,
    nox_property_id: f.nox_property_id.trim(),
    nox_booking_url: f.nox_booking_url.trim(),
    is_featured: f.is_featured,
    is_active: f.is_active,
    sort_order: f.sort_order ? parseInt(f.sort_order, 10) : 0,
  };
}

// ---- Screen -------------------------------------------------------------

export default function VillaEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "VillaEdit">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const editingId = route.params?.villaId;
  const isNew = editingId == null;

  const villaQuery = useVilla(editingId);

  const createMutation = useCreateVilla();
  const updateMutation = useUpdateVilla(editingId);
  const deleteMutation = useDeleteVilla();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Tracks whether the operator manually edited the slug — if they didn't,
  // we keep it auto-derived from the name.
  const [slugDirty, setSlugDirty] = useState(false);

  useEffect(() => {
    if (villaQuery.data) {
      setForm(villaToForm(villaQuery.data));
      setSlugDirty(true); // existing slugs are server-truth; never auto-override.
    }
  }, [villaQuery.data]);

  useEffect(() => {
    navigation.setOptions({
      title: isNew ? "New Villa" : "Edit Villa",
    });
  }, [navigation, isNew]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function onChangeName(v: string) {
    setForm((f) => ({
      ...f,
      name: v,
      // Auto-fill slug from name until the operator touches the slug field.
      slug: slugDirty ? f.slug : slugify(v),
    }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required.";
    if (form.price_per_night && isNaN(parseFloat(form.price_per_night)))
      return "Price must be a number.";
    if (form.bedrooms && isNaN(parseInt(form.bedrooms, 10)))
      return "Bedrooms must be a whole number.";
    if (form.bathrooms && isNaN(parseInt(form.bathrooms, 10)))
      return "Bathrooms must be a whole number.";
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
        Alert.alert("Villa created", `${created.name} is now in your list.`, [
          {
            text: "Add photos",
            onPress: () =>
              navigation.replace("VillaEdit", { villaId: created.id }),
          },
        ]);
      } else {
        await updateMutation.mutateAsync(payload);
        Alert.alert("Saved", "Villa updated.");
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't save", formatApiError(e));
    }
  }

  async function handleDelete() {
    if (editingId == null) return;
    Alert.alert(
      "Delete this villa?",
      `${form.name || "This villa"} will be hidden from the marketing site. The record stays in the database so existing links don't 404.`,
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

  if (!isNew && villaQuery.isLoading) {
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
            placeholder="e.g. Villa Azur — Camps Bay"
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
        </Section>

        {/* ---- Capacity ---- */}
        <Section title="Capacity">
          <View style={styles.row}>
            <TextInput
              label="Bedrooms"
              value={form.bedrooms}
              onChangeText={(v) => update("bedrooms", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.third]}
            />
            <TextInput
              label="Bathrooms"
              value={form.bathrooms}
              onChangeText={(v) => update("bathrooms", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.third]}
            />
            <TextInput
              label="Max guests"
              value={form.max_guests}
              onChangeText={(v) => update("max_guests", v)}
              mode="outlined"
              keyboardType="number-pad"
              style={[styles.input, styles.third]}
            />
          </View>
        </Section>

        {/* ---- Price ---- */}
        <Section title="Price">
          <View style={styles.row}>
            <TextInput
              label="Per night"
              value={form.price_per_night}
              onChangeText={(v) => update("price_per_night", v)}
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
            placeholder="One or two sentences shown on cards."
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
            placeholder="Private pool, Sea views, Chef kitchen… (one per chip)"
          />
        </Section>

        {/* ---- Nox Rentals ---- */}
        <Section title="Nox Rentals">
          <TextInput
            label="Nox property ID"
            value={form.nox_property_id}
            onChangeText={(v) => update("nox_property_id", v)}
            mode="outlined"
            style={styles.input}
            placeholder="e.g. NOX-123"
            autoCapitalize="characters"
            autoCorrect={false}
          />
          <TextInput
            label="Nox booking URL"
            value={form.nox_booking_url}
            onChangeText={(v) => update("nox_booking_url", v)}
            mode="outlined"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            style={styles.input}
            placeholder="https://nox.../book/123"
          />
        </Section>

        {/* ---- Availability (Nox-scraped) — only for saved villas with a
            Nox URL on file. Backend handles the scrape + cache; this just
            renders the unavailable dates greyed out on a calendar. ---- */}
        {!isNew && villaQuery.data && form.nox_booking_url.trim() ? (
          <AvailabilityCalendar villa={villaQuery.data} />
        ) : null}

        {/* ---- Visibility ---- */}
        <Section title="Visibility">
          <ToggleRow
            label="Active"
            description="Inactive villas are hidden from the marketing site."
            value={form.is_active}
            onChange={(v) => update("is_active", v)}
          />
          <ToggleRow
            label="Featured"
            description="Featured villas appear on the homepage carousel."
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
        {!isNew && villaQuery.data ? (
          <PhotoManager villa={villaQuery.data} />
        ) : isNew ? (
          <Card style={styles.section} mode="elevated">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.helper}>
                Save the villa first, then come back here to add photos.
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
          {isNew ? "Create villa" : "Save changes"}
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
            Delete villa
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Availability calendar (Nox-scraped) -------------------------------

function AvailabilityCalendar({ villa }: { villa: Villa }) {
  const availabilityQuery = useVillaAvailability(villa.id);

  // Mark all dates the backend returned. `unavailable` = fully blocked
  // (coral, disabled). `checkin_only` / `checkout_only` = partial (amber,
  // still tappable so the operator can read the date — no real action
  // since this screen is view-only for availability).
  const markedDates = useMemo(() => {
    const m: Record<
      string,
      {
        disabled?: boolean;
        disableTouchEvent?: boolean;
        customStyles?: { container: object; text: object };
      }
    > = {};
    const partial = [
      ...(availabilityQuery.data?.checkin_only ?? []),
      ...(availabilityQuery.data?.checkout_only ?? []),
    ];
    for (const d of partial) {
      m[d] = {
        customStyles: {
          container: { backgroundColor: colors.partialBg, borderRadius: 8 },
          text: { color: colors.partialText, fontWeight: "600" },
        },
      };
    }
    for (const d of availabilityQuery.data?.unavailable ?? []) {
      m[d] = {
        disabled: true,
        disableTouchEvent: true,
        customStyles: {
          container: { backgroundColor: colors.bookedBg, borderRadius: 8 },
          text: { color: colors.bookedText, fontWeight: "600" },
        },
      };
    }
    return m;
  }, [availabilityQuery.data]);

  const lastFetched = availabilityQuery.data?.fetched_at
    ? new Date(availabilityQuery.data.fetched_at).toLocaleString("en", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <Card style={styles.section} mode="elevated">
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Availability</Text>
        <Button
          compact
          onPress={() => availabilityQuery.refetch()}
          loading={availabilityQuery.isFetching}
          disabled={availabilityQuery.isFetching}
          icon="refresh"
          textColor={colors.primary}
        >
          Refresh
        </Button>
      </View>
      <View style={styles.sectionBody}>
        {availabilityQuery.isLoading ? (
          <View style={{ alignItems: "center", paddingVertical: 24 }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : availabilityQuery.error ? (
          <Text style={styles.helper}>
            Couldn't load Nox availability. Check the Nox booking URL is
            correct and tap Refresh.
          </Text>
        ) : (
          <>
            <View style={styles.calendarShell}>
              <Calendar
                markedDates={markedDates}
                markingType="custom"
                theme={calendarTheme}
                enableSwipeMonths
                // No minDate/maxDate — otherwise the header arrows get
                // clamped and the operator can't page forward.
                onDayPress={() => {}}
              />
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: colors.bookedBg },
                  ]}
                />
                <Text style={styles.legendText}>Unavailable</Text>
              </View>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendSwatch,
                    { backgroundColor: colors.partialBg },
                  ]}
                />
                <Text style={styles.legendText}>Check-in / out only</Text>
              </View>
            </View>
            {lastFetched ? (
              <Text style={styles.helper}>
                Pulled from Nox · last refreshed {lastFetched}
              </Text>
            ) : null}
          </>
        )}
      </View>
    </Card>
  );
}

// ---- Photo manager ------------------------------------------------------

function PhotoManager({ villa }: { villa: Villa }) {
  const uploadMutation = useUploadVillaPhoto(villa.id);
  const updatePhotoMutation = useUpdateVillaPhoto(villa.id);
  const deletePhotoMutation = useDeleteVillaPhoto(villa.id);

  // Multi-select state. When selectMode is on the per-photo ★/✕ buttons
  // hide and tapping a photo toggles selection instead.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const photos = useMemo(() => {
    const list = villa.cover_photos ?? [];
    return [...list].sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [villa.cover_photos]);

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
        "Allow photo library access in Settings to add villa photos."
      );
      return;
    }
    // Multi-select enabled — up to 20 at once. Sequential uploads so an
    // error surfaces with a clear "stopped at photo N" feel rather than
    // a flurry of parallel failures.
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

  async function setFeatured(photo: VillaPhoto) {
    try {
      await updatePhotoMutation.mutateAsync({
        photoId: photo.id,
        patch: { is_featured: true },
      });
    } catch (e: unknown) {
      Alert.alert("Couldn't update", formatApiError(e));
    }
  }

  async function deleteOne(photo: VillaPhoto) {
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
  third: { flex: 1 },
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

  // Multi-select photo overlay + bulk action bar.
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

  // Availability calendar (Nox-scraped).
  calendarShell: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    marginBottom: 12,
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 8,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  legendText: { color: colors.text, fontSize: 12, fontWeight: "600" },
});
