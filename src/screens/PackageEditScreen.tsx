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
  useCreatePackage,
  useDeletePackage,
  useDeletePackagePhoto,
  usePackage,
  useUpdatePackage,
  useUpdatePackagePhoto,
  useUploadPackagePhoto,
} from "@/hooks/usePackages";
import { useVillas } from "@/hooks/useVillas";
import type {
  CreatePackagePayload,
  PackageCategory,
  PackageItineraryDay,
  TravelPackage,
  Villa,
  VillaPhoto,
} from "@/api/types";
import type { RootStackParamList } from "@/navigation/types";
import { ChipListInput } from "@/components/ChipListInput";
import { ShimmerImage } from "@/components/ShimmerImage";
import { formatApiError } from "@/api/errors";
import { colors } from "@/theme";

// ---- Form state ---------------------------------------------------------

interface FormState {
  name: string;
  slug: string;
  tagline: string;
  category: PackageCategory;
  duration_nights: string;
  max_guests: string;
  price_from: string;
  price_currency: string;
  short_description: string;
  description: string;
  highlights: string[];
  includes: string[];
  excludes: string[];
  itinerary: PackageItineraryDay[];
  villa_id: number | null;
  vehicle_type: string;
  is_featured: boolean;
  is_active: boolean;
  sort_order: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  tagline: "",
  category: "cape_town_week",
  duration_nights: "",
  max_guests: "",
  price_from: "",
  price_currency: "ZAR",
  short_description: "",
  description: "",
  highlights: [],
  includes: [],
  excludes: [],
  itinerary: [],
  villa_id: null,
  vehicle_type: "",
  is_featured: false,
  is_active: true,
  sort_order: "0",
};

const CATEGORIES: { key: PackageCategory; label: string }[] = [
  { key: "cape_town_week", label: "Cape Town Week" },
  { key: "winelands_escape", label: "Winelands Escape" },
  { key: "family_cape_town", label: "Family Cape Town" },
  { key: "custom", label: "Custom" },
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

function packageToForm(p: TravelPackage): FormState {
  return {
    name: p.name ?? "",
    slug: p.slug ?? "",
    tagline: p.tagline ?? "",
    category: p.category ?? "cape_town_week",
    duration_nights:
      p.duration_nights != null ? String(p.duration_nights) : "",
    max_guests: p.max_guests != null ? String(p.max_guests) : "",
    price_from: p.price_from ?? "",
    price_currency: p.price_currency ?? "ZAR",
    short_description: p.short_description ?? "",
    description: p.description ?? "",
    highlights: p.highlights ?? [],
    includes: p.includes ?? [],
    excludes: p.excludes ?? [],
    itinerary: p.itinerary ?? [],
    villa_id: p.villa?.id ?? null,
    vehicle_type: p.vehicle_type ?? "",
    is_featured: p.is_featured ?? false,
    is_active: p.is_active ?? true,
    sort_order: p.sort_order != null ? String(p.sort_order) : "0",
  };
}

function formToPayload(f: FormState): CreatePackagePayload {
  return {
    name: f.name.trim(),
    slug: f.slug.trim() || undefined,
    tagline: f.tagline.trim(),
    category: f.category,
    duration_nights: f.duration_nights
      ? parseInt(f.duration_nights, 10)
      : undefined,
    max_guests: f.max_guests ? parseInt(f.max_guests, 10) : undefined,
    price_from: f.price_from || undefined,
    price_currency: f.price_currency || "ZAR",
    short_description: f.short_description.trim(),
    description: f.description.trim(),
    highlights: f.highlights,
    includes: f.includes,
    excludes: f.excludes,
    // Re-stamp day numbers from index so deletes/reorders keep them sequential.
    itinerary: f.itinerary.map((d, i) => ({
      day: i + 1,
      title: d.title,
      description: d.description,
    })),
    villa_id: f.villa_id,
    vehicle_type: f.vehicle_type.trim(),
    is_featured: f.is_featured,
    is_active: f.is_active,
    sort_order: f.sort_order ? parseInt(f.sort_order, 10) : 0,
  };
}

// ---- Screen -------------------------------------------------------------

export default function PackageEditScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "PackageEdit">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const editingId = route.params?.packageId;
  const isNew = editingId == null;

  const packageQuery = usePackage(editingId);
  // Villa picker source — only active villas so the operator can't link a
  // hidden one to a public package.
  const villasQuery = useVillas({ is_active: true });

  const createMutation = useCreatePackage();
  const updateMutation = useUpdatePackage(editingId);
  const deleteMutation = useDeletePackage();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [slugDirty, setSlugDirty] = useState(false);
  const [villaMenuOpen, setVillaMenuOpen] = useState(false);

  useEffect(() => {
    if (packageQuery.data) {
      setForm(packageToForm(packageQuery.data));
      setSlugDirty(true);
    }
  }, [packageQuery.data]);

  useEffect(() => {
    navigation.setOptions({
      title: isNew ? "New Package" : "Edit Package",
    });
  }, [navigation, isNew]);

  const villas: Villa[] = villasQuery.data ?? [];
  const selectedVilla = villas.find((v) => v.id === form.villa_id);

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

  // ---- Itinerary helpers ----
  function addItineraryDay() {
    setForm((f) => ({
      ...f,
      itinerary: [
        ...f.itinerary,
        { day: f.itinerary.length + 1, title: "", description: "" },
      ],
    }));
  }
  function updateItineraryDay(index: number, patch: Partial<PackageItineraryDay>) {
    setForm((f) => {
      const next = [...f.itinerary];
      next[index] = { ...next[index], ...patch };
      return { ...f, itinerary: next };
    });
  }
  function removeItineraryDay(index: number) {
    setForm((f) => ({
      ...f,
      itinerary: f.itinerary.filter((_, i) => i !== index),
    }));
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Name is required.";
    if (form.price_from && isNaN(parseFloat(form.price_from)))
      return "Price must be a number.";
    if (form.duration_nights && isNaN(parseInt(form.duration_nights, 10)))
      return "Duration must be a whole number of nights.";
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
        Alert.alert("Package created", `${created.name} is now in your list.`, [
          {
            text: "Add photos",
            onPress: () =>
              navigation.replace("PackageEdit", { packageId: created.id }),
          },
        ]);
      } else {
        await updateMutation.mutateAsync(payload);
        Alert.alert("Saved", "Package updated.");
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't save", formatApiError(e));
    }
  }

  async function handleDelete() {
    if (editingId == null) return;
    Alert.alert(
      "Delete this package?",
      `${form.name || "This package"} will be hidden from the marketing site.`,
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

  if (!isNew && packageQuery.isLoading) {
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
            placeholder="e.g. The Cape Town Week"
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
            label="Tagline"
            value={form.tagline}
            onChangeText={(v) => update("tagline", v)}
            mode="outlined"
            style={styles.input}
            placeholder="Seven days. One villa. Cape Town done properly."
          />

          <Text style={styles.miniLabel}>Category</Text>
          <View style={styles.chipWrap}>
            {CATEGORIES.map((c) => {
              const active = form.category === c.key;
              return (
                <Chip
                  key={c.key}
                  selected={active}
                  onPress={() => update("category", c.key)}
                  style={[styles.chip, active && styles.chipActive]}
                  textStyle={active ? styles.chipTextActive : styles.chipText}
                  showSelectedCheck={false}
                >
                  {c.label}
                </Chip>
              );
            })}
          </View>
        </Section>

        {/* ---- Sizing ---- */}
        <Section title="Duration & guests">
          <View style={styles.row}>
            <TextInput
              label="Nights"
              value={form.duration_nights}
              onChangeText={(v) => update("duration_nights", v)}
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
        </Section>

        {/* ---- Price ---- */}
        <Section title="Price">
          <View style={styles.row}>
            <TextInput
              label="Price from"
              value={form.price_from}
              onChangeText={(v) => update("price_from", v)}
              mode="outlined"
              keyboardType="decimal-pad"
              style={[styles.input, styles.flex2]}
              placeholder="85000.00"
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

          <Text style={styles.miniLabel}>Highlights</Text>
          <ChipListInput
            values={form.highlights}
            onChange={(next) => update("highlights", next)}
            placeholder="Private Camps Bay villa, Cape Peninsula full day…"
          />

          <Text style={[styles.miniLabel, { marginTop: 12 }]}>Includes</Text>
          <ChipListInput
            values={form.includes}
            onChange={(next) => update("includes", next)}
            placeholder="Private villa (7 nights), Airport transfers…"
          />

          <Text style={[styles.miniLabel, { marginTop: 12 }]}>Excludes</Text>
          <ChipListInput
            values={form.excludes}
            onChange={(next) => update("excludes", next)}
            placeholder="Attraction entrance fees, Meals…"
          />
        </Section>

        {/* ---- Itinerary ---- */}
        <Card style={styles.section} mode="elevated">
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Itinerary</Text>
            <Button
              compact
              onPress={addItineraryDay}
              icon="plus"
              textColor={colors.primary}
            >
              Add day
            </Button>
          </View>
          <View style={styles.sectionBody}>
            {form.itinerary.length === 0 ? (
              <Text style={styles.helper}>
                No itinerary yet. Tap Add day to start building the day-by-day
                breakdown that appears on the package detail page.
              </Text>
            ) : (
              form.itinerary.map((day, i) => (
                <View
                  key={i}
                  style={[styles.dayCard, i === 0 && styles.dayCardFirst]}
                >
                  <View style={styles.dayCardHeader}>
                    <View style={styles.dayBadge}>
                      <Text style={styles.dayBadgeText}>DAY {i + 1}</Text>
                    </View>
                    <Button
                      compact
                      onPress={() => removeItineraryDay(i)}
                      textColor={colors.muted}
                    >
                      Remove
                    </Button>
                  </View>
                  <TextInput
                    label="Title"
                    value={day.title}
                    onChangeText={(v) => updateItineraryDay(i, { title: v })}
                    mode="outlined"
                    style={styles.input}
                    placeholder="e.g. Cape Peninsula"
                  />
                  <TextInput
                    label="Description"
                    value={day.description}
                    onChangeText={(v) =>
                      updateItineraryDay(i, { description: v })
                    }
                    mode="outlined"
                    multiline
                    numberOfLines={3}
                    style={styles.input}
                  />
                </View>
              ))
            )}
          </View>
        </Card>

        {/* ---- Villa & vehicle ---- */}
        <Section title="Villa & vehicle">
          <Menu
            visible={villaMenuOpen}
            onDismiss={() => setVillaMenuOpen(false)}
            anchor={
              <Button
                mode="outlined"
                onPress={() => setVillaMenuOpen(true)}
                style={styles.menuButton}
                contentStyle={styles.menuButtonContent}
                textColor={colors.heading}
              >
                {selectedVilla?.name ?? "No villa linked"}
              </Button>
            }
          >
            <Menu.Item
              onPress={() => {
                update("villa_id", null);
                setVillaMenuOpen(false);
              }}
              title="No villa"
              leadingIcon={form.villa_id == null ? "check" : undefined}
            />
            {villas.map((v) => (
              <Menu.Item
                key={v.id}
                onPress={() => {
                  update("villa_id", v.id);
                  setVillaMenuOpen(false);
                }}
                title={v.name}
                leadingIcon={
                  form.villa_id === v.id ? "check" : undefined
                }
              />
            ))}
          </Menu>

          <TextInput
            label="Vehicle type (display)"
            value={form.vehicle_type}
            onChangeText={(v) => update("vehicle_type", v)}
            mode="outlined"
            style={[styles.input, { marginTop: 12 }]}
            placeholder="e.g. Hyundai Staria"
          />
        </Section>

        {/* ---- Visibility ---- */}
        <Section title="Visibility">
          <ToggleRow
            label="Active"
            description="Inactive packages are hidden from the marketing site."
            value={form.is_active}
            onChange={(v) => update("is_active", v)}
          />
          <ToggleRow
            label="Featured"
            description="Featured packages appear in the homepage Featured Packages section."
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
        {!isNew && packageQuery.data ? (
          <PhotoManager pkg={packageQuery.data} />
        ) : isNew ? (
          <Card style={styles.section} mode="elevated">
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Photos</Text>
            </View>
            <View style={styles.sectionBody}>
              <Text style={styles.helper}>
                Save the package first, then come back to add photos.
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
          {isNew ? "Create package" : "Save changes"}
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
            Delete package
          </Button>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---- Photo manager ------------------------------------------------------

function PhotoManager({ pkg }: { pkg: TravelPackage }) {
  const uploadMutation = useUploadPackagePhoto(pkg.id);
  const updatePhotoMutation = useUpdatePackagePhoto(pkg.id);
  const deletePhotoMutation = useDeletePackagePhoto(pkg.id);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const photos = useMemo(() => {
    const list = pkg.cover_photos ?? [];
    return [...list].sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [pkg.cover_photos]);

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
        "Allow photo library access in Settings to add package photos."
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

  // Itinerary day cards
  dayCard: {
    paddingTop: 14,
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  dayCardFirst: { marginTop: 0, paddingTop: 0, borderTopWidth: 0 },
  dayCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  dayBadge: {
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  dayBadgeText: {
    color: colors.onPrimary,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },

  menuButton: {
    borderRadius: 12,
    borderColor: colors.border,
  },
  menuButtonContent: { height: 48, justifyContent: "flex-start" },

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
});
