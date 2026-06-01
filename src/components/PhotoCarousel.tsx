import React, { useMemo, useState } from "react";
import {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleProp,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  ViewStyle,
} from "react-native";
import { ShimmerImage } from "@/components/ShimmerImage";
import { colors } from "@/theme";

interface Photo {
  id: number;
  cover_photos: string; // S3 URL — field name from Django's serializer
  order: number;
  is_featured: boolean;
}

interface Props {
  photos: Photo[];
  height?: number;
  style?: StyleProp<ViewStyle>;
}

// Horizontal pager over a vehicle's cover photos. Featured photo first, then
// sorted by `order`. Pill-shaped dot indicator at the bottom + an "n / total"
// badge in the top-right corner so the count is always visible.
//
// Single-photo case skips the carousel mechanics and just renders the image.
// Zero-photo case renders nothing so the parent can show its own fallback.
export function PhotoCarousel({ photos, height = 240, style }: Props) {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);

  const sorted = useMemo(() => {
    return [...photos].sort((a, b) => {
      if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1;
      return (a.order ?? 0) - (b.order ?? 0);
    });
  }, [photos]);

  if (sorted.length === 0) return null;

  if (sorted.length === 1) {
    return (
      <ShimmerImage
        uri={sorted[0].cover_photos}
        style={[{ width, height }, style]}
      />
    );
  }

  function onMomentumScrollEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== activeIndex) setActiveIndex(idx);
  }

  return (
    <View style={[{ width, height }, style]}>
      <FlatList
        data={sorted}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => String(p.id)}
        onMomentumScrollEnd={onMomentumScrollEnd}
        // Fixed item width lets RN skip per-item measurement — smooth paging
        // even with 30+ photos.
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        renderItem={({ item }) => (
          <ShimmerImage uri={item.cover_photos} style={{ width, height }} />
        )}
      />

      {/* "2 / 5" counter in the top-right */}
      <View pointerEvents="none" style={styles.badge}>
        <Text style={styles.badgeText}>
          {activeIndex + 1} / {sorted.length}
        </Text>
      </View>

      {/* Pill-style dots at the bottom, wrapped in a soft scrim so they
          remain visible against bright photos */}
      <View pointerEvents="none" style={styles.dotsRow}>
        <View style={styles.dotsTrack}>
          {sorted.map((p, i) => (
            <View
              key={p.id}
              style={[styles.dot, i === activeIndex && styles.dotActive]}
            />
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: "absolute",
    top: 14,
    right: 14,
    backgroundColor: "rgba(0,0,0,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.onPrimary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  dotsRow: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
  },
  dotsTrack: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 999,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.onPrimary,
  },
});
