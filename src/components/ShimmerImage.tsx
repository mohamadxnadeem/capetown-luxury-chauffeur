import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme";

interface Props {
  uri?: string | null;
  style?: StyleProp<ViewStyle>;
  imageStyle?: StyleProp<ImageStyle>;
  // If the URI is missing, render this fallback instead of the shimmer.
  // Lets callers preserve their existing "first-letter" tile when there's no
  // cover photo, while still getting shimmer during real loads.
  fallback?: React.ReactNode;
  // Cover/contain — matches RN Image's resizeMode.
  resizeMode?: "cover" | "contain" | "stretch" | "center";
}

// A wrapped <Image> that displays a moving shimmer-gradient placeholder while
// the real image is downloading, then crossfades to it. Built on Animated +
// expo-linear-gradient — no extra deps beyond what the app already ships.
export function ShimmerImage({
  uri,
  style,
  imageStyle,
  fallback,
  resizeMode = "cover",
}: Props) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const shimmer = useRef(new Animated.Value(0)).current;
  const fadeIn = useRef(new Animated.Value(0)).current;

  // Run the shimmer loop while we're waiting on the image. Stop it once the
  // image lands so we don't burn battery animating offscreen.
  useEffect(() => {
    if (loaded || errored || !uri) return;
    const loop = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [loaded, errored, uri, shimmer]);

  useEffect(() => {
    if (!loaded) return;
    Animated.timing(fadeIn, {
      toValue: 1,
      duration: 240,
      useNativeDriver: true,
    }).start();
  }, [loaded, fadeIn]);

  const translateX = useMemo(
    () =>
      shimmer.interpolate({
        inputRange: [0, 1],
        // The gradient is 200px wide; sweep it from off-screen-left to
        // off-screen-right so the highlight passes once per loop.
        outputRange: [-220, 220],
      }),
    [shimmer]
  );

  // No URI → render fallback (or just the placeholder color).
  if (!uri) {
    return (
      <View style={[styles.container, style]}>
        {fallback ?? <View style={[StyleSheet.absoluteFillObject, styles.placeholder]} />}
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {!loaded && !errored ? (
        <View style={[StyleSheet.absoluteFillObject, styles.placeholder]}>
          <Animated.View
            style={[
              StyleSheet.absoluteFillObject,
              { transform: [{ translateX }] },
            ]}
          >
            <LinearGradient
              colors={[
                "rgba(255,255,255,0)",
                "rgba(255,255,255,0.55)",
                "rgba(255,255,255,0)",
              ]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFillObject}
            />
          </Animated.View>
        </View>
      ) : null}
      {errored && fallback ? (
        <View style={StyleSheet.absoluteFillObject}>{fallback}</View>
      ) : null}
      <Animated.Image
        source={{ uri }}
        style={[StyleSheet.absoluteFillObject, imageStyle, { opacity: fadeIn }]}
        resizeMode={resizeMode}
        onLoad={() => setLoaded(true)}
        onError={() => setErrored(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: "hidden", backgroundColor: colors.surfaceMuted },
  placeholder: { backgroundColor: colors.surfaceMuted },
});

// Suppress an "unused" hint on the bare RN Image import — we use
// Animated.Image instead but want the typing for ImageStyle.
void Image;
