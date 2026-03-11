import { useMemo, useState } from "react";
import type { FocusEvent, MouseEvent, SyntheticEvent } from "react";
import { createPortal } from "react-dom";
import { API_URL } from "../../config/api";

export type BadgeCriterion = "course_points" | "perfect_missions" | "active_days";
export type BadgeTierNumber = 1 | 2 | 3 | 4 | 5;
export type BadgeValueMode = "percentage" | "absolute";

const BADGE_TITLES: Record<BadgeCriterion, Record<BadgeTierNumber, string>> = {
  course_points: {
    1: "Explorador de Pontos",
    2: "Rumo ao Topo",
    3: "Domínio da Trilha",
    4: "Mestre da Jornada",
    5: "Conquistador do Curso",
  },
  perfect_missions: {
    1: "Acerto Afinado",
    2: "Olho Clínico",
    3: "Execução Precisa",
    4: "Mestre Perfeccionista",
    5: "Perfeccionista Supremo",
  },
  active_days: {
    1: "Presença em Campo",
    2: "Ritmo de Treino",
    3: "Constância Tática",
    4: "Compromisso de Elite",
    5: "Ritmo Constante",
  },
};

const TOOLTIP_OFFSET = 8;
const TOOLTIP_VIEWPORT_PADDING = 10;
const TOOLTIP_MAX_WIDTH = 270;
const TOOLTIP_ESTIMATED_HEIGHT = 128;

export type UserBadgeData = {
  game_id?: number;
  gameId?: number;
  criterion?: string;
  criterion_label?: string;
  value_mode?: BadgeValueMode | string;
  required_value?: number | null;
  tier?: number;
  image_url?: string;
  imageUrl?: string;
  unlocked_at?: string;
  unlockedAt?: string;
};

type BadgeTooltipData = {
  title: string;
  rule: string;
  unlockedAt: string;
};

type FloatingTooltipState = BadgeTooltipData & {
  left: number;
  top: number;
};

type BadgeClassNames = {
  trigger: string;
  image: string;
  error: string;
  tooltip: string;
};

type UserHighestBadgeProps = {
  badges?: unknown;
  scopedGameId?: number | null;
  classNames: BadgeClassNames;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const isBadgeCriterion = (value: string): value is BadgeCriterion =>
  value === "course_points" || value === "perfect_missions" || value === "active_days";

const asBadgeTierNumber = (value: number | null): BadgeTierNumber | null => {
  if (value === null || value < 1 || value > 5) return null;
  return value as BadgeTierNumber;
};

const isTierAssetPath = (pathname: string) => /^\/tier[1-5]\.png$/i.test(pathname);

const resolveBadgeImageUrl = (rawUrl: string) => {
  if (!rawUrl) return "";

  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("/") && isTierAssetPath(trimmed)) {
    return `${window.location.origin}${trimmed}`;
  }

  try {
    const parsed = new URL(rawUrl, window.location.origin);
    const backendOrigin = new URL(API_URL);
    const isBackendHost =
      parsed.hostname === backendOrigin.hostname &&
      parsed.port === backendOrigin.port;
    if (isBackendHost && isTierAssetPath(parsed.pathname)) {
      return `${window.location.origin}${parsed.pathname}`;
    }
    return parsed.toString();
  } catch {
    return rawUrl;
  }
};

const resolveImageStatusCode = async (src: string): Promise<number> => {
  if (!src) return 0;

  try {
    const response = await fetch(src, {
      method: "HEAD",
    });
    return response.status;
  } catch {
    return 0;
  }
};

const normalizeBadgeList = (badges: unknown): UserBadgeData[] => {
  if (!Array.isArray(badges)) return [];

  return badges
    .map((item) => {
      if (typeof item === "string") {
        return {
          image_url: item,
        } as UserBadgeData;
      }
      if (!item || typeof item !== "object") return null;
      return item as UserBadgeData;
    })
    .filter((item): item is UserBadgeData => item !== null);
};

const getHighestBadgeForGame = (
  badges: UserBadgeData[] | undefined,
  scopedGameId: number | null,
): UserBadgeData | null => {
  if (!Array.isArray(badges) || badges.length === 0) {
    return null;
  }

  let highestBadge: UserBadgeData | null = null;
  let highestTier = -1;
  let highestUnlockedAt = -1;
  let fallbackBadge: UserBadgeData | null = null;
  let fallbackUnlockedAt = -1;

  badges.forEach((badge) => {
    const badgeGameId = toFiniteNumber(badge.game_id ?? badge.gameId);
    if (scopedGameId !== null && badgeGameId !== scopedGameId) {
      return;
    }

    const imageUrl = badge.image_url ?? badge.imageUrl;
    const hasImage = typeof imageUrl === "string" && imageUrl.trim() !== "";
    const unlockedRaw = badge.unlocked_at ?? badge.unlockedAt;
    const unlockedAtTs = unlockedRaw ? Date.parse(unlockedRaw) : -1;

    if (hasImage && (fallbackBadge === null || unlockedAtTs > fallbackUnlockedAt)) {
      fallbackBadge = badge;
      fallbackUnlockedAt = unlockedAtTs;
    }

    const badgeTier = toFiniteNumber(badge.tier);
    if (badgeTier === null) {
      return;
    }

    const isBetterTier = badgeTier > highestTier;
    const isSameTierButNewer =
      badgeTier === highestTier && unlockedAtTs > highestUnlockedAt;

    if (isBetterTier || isSameTierButNewer) {
      highestBadge = badge;
      highestTier = badgeTier;
      highestUnlockedAt = unlockedAtTs;
    }
  });

  return highestBadge ?? fallbackBadge;
};

const getBadgeTitle = (badge: UserBadgeData, tierValue: number | null) => {
  const criterion = typeof badge.criterion === "string" ? badge.criterion : "";
  const tier = asBadgeTierNumber(tierValue);

  if (criterion && tier !== null && isBadgeCriterion(criterion)) {
    return `${BADGE_TITLES[criterion][tier]} - Tier ${tier}`;
  }

  if (tier !== null) {
    return `Badge - Tier ${tier}`;
  }

  return "Badge";
};

const getBadgeRule = (badge: UserBadgeData) => {
  const criterion = typeof badge.criterion === "string" ? badge.criterion : "";
  const rawValueMode =
    typeof badge.value_mode === "string" ? badge.value_mode : "absolute";
  const valueMode: BadgeValueMode =
    rawValueMode === "percentage" ? "percentage" : "absolute";
  const requiredValue = toFiniteNumber(badge.required_value);

  if (requiredValue === null) {
    return "Continue jogando para evoluir a badge.";
  }

  if (criterion === "course_points") {
    if (valueMode === "percentage") {
      return `Atingir ${requiredValue}% dos pontos totais do game.`;
    }
    return `Atingir ${requiredValue} pontos totais no game.`;
  }

  if (criterion === "perfect_missions") {
    if (valueMode === "percentage") {
      return `Concluir ${requiredValue}% das missões com pontuação máxima.`;
    }
    return `Concluir ${requiredValue} missões com pontuação máxima.`;
  }

  if (criterion === "active_days") {
    return `Concluir missões em ${requiredValue} dias diferentes no game.`;
  }

  return "Continue jogando para evoluir a badge.";
};

const formatUnlockedAt = (rawDate?: string) => {
  if (!rawDate) return "Data não informada";
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "Data não informada";

  const date = parsed.toLocaleDateString("pt-BR");
  const time = parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `${date} às ${time}`;
};

const getBadgeTooltipData = (
  badge: UserBadgeData | null,
  tierValue: number | null,
): BadgeTooltipData | null => {
  if (!badge) return null;

  return {
    title: getBadgeTitle(badge, tierValue),
    rule: getBadgeRule(badge),
    unlockedAt: formatUnlockedAt(badge.unlocked_at ?? badge.unlockedAt),
  };
};

const getTooltipPosition = (anchorX: number, anchorY: number) => {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const tooltipWidth = Math.min(
    TOOLTIP_MAX_WIDTH,
    Math.max(180, viewportWidth - TOOLTIP_VIEWPORT_PADDING * 2),
  );

  let left = anchorX + TOOLTIP_OFFSET;
  if (left + tooltipWidth + TOOLTIP_VIEWPORT_PADDING > viewportWidth) {
    left = anchorX - tooltipWidth - TOOLTIP_OFFSET;
  }
  if (left < TOOLTIP_VIEWPORT_PADDING) {
    left = TOOLTIP_VIEWPORT_PADDING;
  }

  let top = anchorY + TOOLTIP_OFFSET;
  if (top + TOOLTIP_ESTIMATED_HEIGHT + TOOLTIP_VIEWPORT_PADDING > viewportHeight) {
    top = anchorY - TOOLTIP_ESTIMATED_HEIGHT - TOOLTIP_OFFSET;
  }
  if (top < TOOLTIP_VIEWPORT_PADDING) {
    top = TOOLTIP_VIEWPORT_PADDING;
  }

  return { left, top };
};

export default function UserHighestBadge({
  badges,
  scopedGameId = null,
  classNames,
}: UserHighestBadgeProps) {
  const [imageErrorCode, setImageErrorCode] = useState<number | undefined>(undefined);
  const [floatingTooltip, setFloatingTooltip] = useState<FloatingTooltipState | null>(null);

  const normalizedBadges = useMemo(() => normalizeBadgeList(badges), [badges]);
  const highestBadge = useMemo<UserBadgeData | null>(
    () => getHighestBadgeForGame(normalizedBadges, scopedGameId),
    [normalizedBadges, scopedGameId],
  );

  const badgeTier = toFiniteNumber(highestBadge?.tier);
  const primaryBadgeImageUrl = highestBadge?.image_url ?? highestBadge?.imageUrl ?? "";
  const badgeImageUrl = resolveBadgeImageUrl(primaryBadgeImageUrl);
  const tooltip = getBadgeTooltipData(highestBadge, badgeTier);

  const handleBadgeImageError = (event: SyntheticEvent<HTMLImageElement>) => {
    const currentSrc = event.currentTarget.getAttribute("src") ?? "";
    if (imageErrorCode !== undefined) return;

    void resolveImageStatusCode(currentSrc).then((statusCode) => {
      setImageErrorCode((prev) => {
        if (prev !== undefined) return prev;
        return statusCode;
      });
    });
  };

  const showTooltipAt = (anchorX: number, anchorY: number) => {
    if (!tooltip) {
      setFloatingTooltip(null);
      return;
    }
    const position = getTooltipPosition(anchorX, anchorY);
    setFloatingTooltip({
      ...tooltip,
      left: position.left,
      top: position.top,
    });
  };

  const handleMouseEnter = (event: MouseEvent<HTMLDivElement>) => {
    showTooltipAt(event.clientX, event.clientY);
  };

  const handleMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    showTooltipAt(event.clientX, event.clientY);
  };

  const handleFocus = (event: FocusEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    showTooltipAt(rect.right, rect.top + rect.height / 2);
  };

  const hideFloatingTooltip = () => {
    setFloatingTooltip(null);
  };

  if (!badgeImageUrl && imageErrorCode === undefined) return null;

  return (
    <>
      {badgeImageUrl && imageErrorCode === undefined ? (
        <div
          className={classNames.trigger}
          tabIndex={0}
          onMouseEnter={handleMouseEnter}
          onMouseMove={handleMouseMove}
          onMouseLeave={hideFloatingTooltip}
          onFocus={handleFocus}
          onBlur={hideFloatingTooltip}
          aria-label={
            badgeTier ? `Maior badge do game: tier ${badgeTier}` : "Maior badge do game"
          }
        >
          <img
            className={classNames.image}
            src={badgeImageUrl}
            onError={handleBadgeImageError}
            alt={
              badgeTier
                ? `Maior badge conquistada no game, tier ${badgeTier}`
                : "Maior badge conquistada no game"
            }
          />
        </div>
      ) : imageErrorCode !== undefined ? (
        <span className={classNames.error} role="status">
          Erro: {imageErrorCode}
        </span>
      ) : null}

      {floatingTooltip && typeof document !== "undefined"
        ? createPortal(
            <div
              className={classNames.tooltip}
              role="tooltip"
              style={{
                left: `${floatingTooltip.left}px`,
                top: `${floatingTooltip.top}px`,
              }}
            >
              <p>{floatingTooltip.title}</p>
              <p>{floatingTooltip.rule}</p>
              <p>Conquistada em: {floatingTooltip.unlockedAt}</p>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
