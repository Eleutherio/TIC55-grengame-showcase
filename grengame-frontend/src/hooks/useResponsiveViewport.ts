import { useEffect, useMemo, useState } from "react";

const PHONE_QUERIES = [
  "(max-width: 600px)",
  "(max-aspect-ratio: 3/2) and (max-width: 768px)",
  "(orientation: portrait) and (max-width: 900px)",
];

const TABLET_QUERIES = [
  "(min-width: 600px) and (max-width: 1024px) and (max-aspect-ratio: 4/3)",
  "(orientation: landscape) and (max-height: 820px) and (max-width: 1366px)",
];

export const DEFAULT_DESKTOP_MIN_WIDTH = 1024;
export const DEFAULT_TABLET_MAX_WIDTH = 768;
export const DEFAULT_ASPECT_RATIO_THRESHOLD = 1.5;

const EMPTY_MEDIA_QUERY_LIST: string[] = [];

type ResponsiveViewportOptions = {
  desktopMinWidth?: number;
  tabletMaxWidth?: number;
  aspectRatioThreshold?: number;
  extraMediaQueries?: string[];
};

const hasWindowObject = typeof window !== "undefined";

function matchesSome(queries: string[]): boolean {
  if (!hasWindowObject || typeof window.matchMedia !== "function") {
    return false;
  }

  return queries.some((query) => window.matchMedia(query).matches);
}

export function computeIsMobileViewport(options: ResponsiveViewportOptions = {}): boolean {
  if (!hasWindowObject) {
    return false;
  }

  const {
    desktopMinWidth = DEFAULT_DESKTOP_MIN_WIDTH,
    tabletMaxWidth = DEFAULT_TABLET_MAX_WIDTH,
    aspectRatioThreshold = DEFAULT_ASPECT_RATIO_THRESHOLD,
    extraMediaQueries = [],
  } = options;

  const { innerWidth, innerHeight } = window;
  const aspectRatio = innerWidth / innerHeight;

  if (innerWidth >= desktopMinWidth) {
    return false;
  }

  if (innerWidth <= tabletMaxWidth) {
    return true;
  }

  if (aspectRatio <= aspectRatioThreshold && innerWidth < desktopMinWidth) {
    return true;
  }

  const combinedQueries = [...PHONE_QUERIES, ...TABLET_QUERIES, ...extraMediaQueries];
  if (matchesSome(combinedQueries)) {
    return true;
  }

  return false;
}

export function useResponsiveViewport(options: ResponsiveViewportOptions = {}): boolean {
  const {
    desktopMinWidth = DEFAULT_DESKTOP_MIN_WIDTH,
    tabletMaxWidth = DEFAULT_TABLET_MAX_WIDTH,
    aspectRatioThreshold = DEFAULT_ASPECT_RATIO_THRESHOLD,
    extraMediaQueries: providedMediaQueries,
  } = options;

  const extraMediaQueries = providedMediaQueries ?? EMPTY_MEDIA_QUERY_LIST;

  const normalizedExtraMediaQueries = useMemo(() => [...extraMediaQueries], [extraMediaQueries]);

  const [isMobile, setIsMobile] = useState(() =>
    computeIsMobileViewport({
      desktopMinWidth,
      tabletMaxWidth,
      aspectRatioThreshold,
      extraMediaQueries: normalizedExtraMediaQueries,
    })
  );

  useEffect(() => {
    if (!hasWindowObject) {
      return;
    }

    const handleViewportChange = () => {
      setIsMobile(
        computeIsMobileViewport({
          desktopMinWidth,
          tabletMaxWidth,
          aspectRatioThreshold,
          extraMediaQueries: normalizedExtraMediaQueries,
        })
      );
    };

    const combinedQueries = [...PHONE_QUERIES, ...TABLET_QUERIES, ...normalizedExtraMediaQueries];

    const mediaQueryLists = combinedQueries
      .map((query) => window.matchMedia(query))
      .filter((media) => typeof media.addEventListener === "function");

    mediaQueryLists.forEach((media) => media.addEventListener("change", handleViewportChange));
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("orientationchange", handleViewportChange);

    return () => {
      mediaQueryLists.forEach((media) => media.removeEventListener("change", handleViewportChange));
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("orientationchange", handleViewportChange);
    };
  }, [desktopMinWidth, tabletMaxWidth, aspectRatioThreshold, normalizedExtraMediaQueries]);

  return isMobile;
}
