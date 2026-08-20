import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    NativeScrollEvent,
    NativeSyntheticEvent,
    Pressable,
    ScrollView,
    StyleSheet,
    useWindowDimensions,
    View,
} from "react-native";

import { attendanceMarkVideo } from "@/src/components/landing/LandingAttendanceDemo";
import {
    DEFAULT_LANDING_CAROUSEL,
    fetchLandingCarousel,
    type LandingCarouselSlide,
} from "@/src/services/landingCarouselApi";
import {
    appBrandBlueDark,
    appBrandMy,
    appSurface
} from "@/src/theme/appBrandPalette";

type Props = {
  compact?: boolean;
};

function AttendanceCarouselSlide({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const player = useVideoPlayer(attendanceMarkVideo, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  useEffect(() => {
    player.muted = true;
    player.loop = true;
    try {
      player.play();
    } catch {
      /* ignore */
    }
  }, [player]);

  return (
    <View style={{ width, height }}>
      <LinearGradient
        colors={["#041830", "#0B3A6E", "#1E88E5"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <VideoView
        player={player}
        style={styles.videoFill}
        contentFit="cover"
        nativeControls={false}
        allowsFullscreen={false}
        allowsPictureInPicture={false}
      />
      <LinearGradient
        colors={["transparent", "rgba(4,24,48,0.55)"]}
        style={styles.videoFade}
        pointerEvents="none"
      />
    </View>
  );
}

/**
 * Auto-advancing hero carousel. Live Supabase slides when present;
 * otherwise attendance demo video + brand fallbacks.
 */
export default function LandingHeroCarousel({ compact }: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const bannerWidth = Math.min(windowWidth, 1480);
  const height = compact
    ? Math.round(bannerWidth * 0.48)
    : Math.round(Math.min(bannerWidth * 0.36, 460));
  const [remote, setRemote] = useState<LandingCarouselSlide[]>([]);
  const [index, setIndex] = useState(0);
  const listRef = useRef<ScrollView>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchLandingCarousel().then((slides) => {
      if (!cancelled) setRemote(slides);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const useRemote = remote.length > 0;
  /** Defaults: video first, then brand stills (cap visual length). */
  const defaultCount = 1 + Math.min(4, DEFAULT_LANDING_CAROUSEL.length);
  const count = useRemote ? remote.length : defaultCount;

  const goTo = useCallback(
    (i: number) => {
      const next = ((i % count) + count) % count;
      setIndex(next);
      listRef.current?.scrollTo({ x: next * bannerWidth, animated: true });
    },
    [bannerWidth, count],
  );

  useEffect(() => {
    if (count <= 1) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setIndex((prev) => {
        const next = (prev + 1) % count;
        listRef.current?.scrollTo({ x: next * bannerWidth, animated: true });
        return next;
      });
    }, 5500);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [bannerWidth, count]);

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const i = Math.round(x / Math.max(bannerWidth, 1));
    setIndex(Math.max(0, Math.min(count - 1, i)));
  };

  return (
    <View
      style={[
        styles.wrap,
        { maxWidth: bannerWidth, alignSelf: "center", width: "100%" },
      ]}
    >
      <ScrollView
        ref={listRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onMomentumEnd}
        style={{ width: bannerWidth, height }}
        contentContainerStyle={{ height }}
      >
        {useRemote ? (
          remote.map((slide) => (
            <View key={slide.id} style={{ width: bannerWidth, height }}>
              <Image
                source={{ uri: slide.publicUrl }}
                style={styles.image}
                contentFit="cover"
                accessibilityLabel={slide.altText || "Carousel"}
              />
            </View>
          ))
        ) : (
          <>
            <AttendanceCarouselSlide width={bannerWidth} height={height} />
            {DEFAULT_LANDING_CAROUSEL.slice(0, 4).map((slide) => {
              const fit = slide.contentFit ?? "contain";
              const isCover = fit === "cover";
              return (
                <View
                  key={slide.id}
                  style={[styles.fallbackSlide, { width: bannerWidth, height }]}
                >
                  {!isCover ? (
                    <LinearGradient
                      colors={["#EEF4FF", "#E3F2FD", "#D6E8FF"]}
                      style={StyleSheet.absoluteFill}
                    />
                  ) : null}
                  <Image
                    source={slide.source}
                    style={isCover ? styles.image : styles.fallbackImage}
                    contentFit={fit}
                    accessibilityLabel={slide.altText}
                  />
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      {count > 1 ? (
        <View style={styles.dots} accessibilityRole="tablist">
          {Array.from({ length: count }, (_, i) => (
            <Pressable
              key={`dot-${i}`}
              accessibilityRole="button"
              accessibilityState={{ selected: i === index }}
              onPress={() => goTo(i)}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: appSurface,
    borderWidth: 1,
    borderColor: "rgba(4, 24, 48, 0.08)",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  videoFill: {
    ...StyleSheet.absoluteFillObject,
  },
  videoFade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "35%",
  },
  fallbackSlide: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#E8F1FF",
  },
  fallbackImage: {
    width: "48%",
    height: "48%",
  },
  dots: {
    position: "absolute",
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.55)",
    borderWidth: 1,
    borderColor: "rgba(4, 24, 48, 0.2)",
  },
  dotActive: {
    backgroundColor: appBrandMy,
    borderColor: appBrandBlueDark,
    width: 18,
  },
});
