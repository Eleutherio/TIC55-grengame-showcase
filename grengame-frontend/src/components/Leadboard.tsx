import { useEffect, useMemo, useState } from "react";
import UserHighestBadge, {
  type UserBadgeData,
} from "./badges/UserHighestBadge";
import "./Leadboard.css";
import { API_URL } from "../config/api";

export type LeaderboardBadge = UserBadgeData;

export type LeaderboardEntry = {
  userId?: number;
  name?: string;
  tier?: "Ouro" | "Prata" | "Bronze" | string;
  nivel?: "Ouro" | "Prata" | "Bronze" | string;
  avatar?: string;
  avatar_url?: string;
  avatarUrl?: string;
  points?: number;
  rank?: string;
  position?: number;
  game_id?: number | null;
  gameId?: number | null;
  badges?: LeaderboardBadge[];
};

type LeadboardProps = {
  courseName?: string;
  entries?: LeaderboardEntry[];
  isLoading?: boolean;
  errorMessage?: string | null;
  currentUserId?: number;
  trackedGameId?: number;
  emptyMessage?: string;
};

const toFiniteNumber = (value: unknown): number | null => {
  const parsed =
    typeof value === "number" ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const toNonNegativeNumber = (value: unknown): number => {
  const parsed =
    typeof value === "number" ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.trunc(parsed);
};

const normalizeTierLabel = (value: unknown): string => {
  if (typeof value !== "string") return "";
  return value.trim();
};

const resolveAvatarUrl = (raw?: string | null) => {
  if (!raw || typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${API_URL}${trimmed}`;
  }
  return `${API_URL}/${trimmed}`;
};

const avatarFallback = (name?: string) => {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const BADGE_CLASSNAMES = {
  trigger: "leaderboard-earned-badge",
  image: "leaderboard-earned-badge-image",
  error: "leaderboard-earned-badge-error",
  tooltip: "leaderboard-floating-tooltip",
} as const;

type DisplayEntry = {
  userId?: number;
  name: string;
  tier: string;
  avatar?: string;
  avatar_url?: string;
  avatarUrl?: string;
  points: number;
  rank: string;
  position?: number;
  game_id: number | null;
  gameId?: number | null;
  badges: LeaderboardBadge[];
  isPlaceholder?: boolean;
};

export default function Leadboard({
  courseName,
  entries,
  isLoading,
  errorMessage,
  currentUserId,
  trackedGameId,
  emptyMessage,
}: LeadboardProps) {
  const hasError = Boolean(errorMessage);
  const [invalidAvatarUrls, setInvalidAvatarUrls] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const normalizedTrackedGameId = toFiniteNumber(trackedGameId ?? null);
  const resolvedEmptyMessage =
    emptyMessage ?? "Nenhum jogador no ranking deste game ainda.";

  const registerAvatarError = (avatarUrl: string) => {
    setInvalidAvatarUrls((previous) => {
      if (previous.has(avatarUrl)) return previous;
      const next = new Set(previous);
      next.add(avatarUrl);
      return next;
    });
  };

  useEffect(() => {
    setInvalidAvatarUrls(new Set<string>());
  }, [entries, trackedGameId]);

  const normalizedEntries = useMemo<DisplayEntry[]>(
    () =>
      (Array.isArray(entries) ? entries : []).map((entry) => {
        const tier = normalizeTierLabel(entry.nivel ?? entry.tier);
        const gameId = toFiniteNumber(entry.game_id ?? entry.gameId);
        const badges = Array.isArray(entry.badges) ? entry.badges : [];
        let rankValue = "-";

        if (typeof entry.position === "number" && Number.isFinite(entry.position)) {
          rankValue = String(entry.position);
        } else if (typeof entry.rank === "string" && entry.rank.trim() !== "") {
          rankValue = entry.rank;
        }

        return {
          ...entry,
          name: entry.name || "Jogador",
          tier,
          points: toNonNegativeNumber(entry.points ?? 0),
          rank: rankValue,
          game_id: gameId,
          badges,
        };
      }),
    [entries],
  );

  const hasPlayers = normalizedEntries.length > 0;

  // Regra única: quando não estiver no ranking, o usuário atual aparece como placeholder.
  const userEntry = useMemo<DisplayEntry | null>(() => {
    if (currentUserId === undefined) return null;

    const existingEntry =
      normalizedEntries.find((entry) => entry.userId === currentUserId) ?? null;
    if (existingEntry) return existingEntry;

    return {
      userId: currentUserId,
      name: "Você",
      tier: "",
      points: 0,
      rank: "-",
      game_id: normalizedTrackedGameId,
      badges: [],
      isPlaceholder: true,
    };
  }, [currentUserId, normalizedEntries, normalizedTrackedGameId]);

  const resolveScopedGameId = (entry: DisplayEntry) =>
    toFiniteNumber(entry.game_id) ?? normalizedTrackedGameId;

  const resolveSafeAvatarUrl = (entry: DisplayEntry) => {
    const avatarUrl = resolveAvatarUrl(
      entry.avatar || entry.avatarUrl || entry.avatar_url,
    );
    if (!avatarUrl || invalidAvatarUrls.has(avatarUrl)) return undefined;
    return avatarUrl;
  };

  const userScopedGameId = userEntry ? resolveScopedGameId(userEntry) : normalizedTrackedGameId;
  const userAvatarUrl = userEntry ? resolveSafeAvatarUrl(userEntry) : undefined;
  const userAvatarInitials = avatarFallback(userEntry?.name);
  const userTierText = userEntry?.tier ? `Jogador ${userEntry.tier}` : "Jogador";

  return (
    <div className="leaderboard-card">
      <div className="leaderboard-header">
        <p className="leaderboard-title">Leaderboard</p>
        {courseName ? (
          <p className="leaderboard-subtitle">{courseName}</p>
        ) : null}
      </div>
      <div className="leaderboard-list">
        <div className="leaderboard-scroll">
          {isLoading ? (
            <p className="leaderboard-empty">Carregando leaderboard...</p>
          ) : hasError ? (
            <p className="leaderboard-error">
              {errorMessage ||
                "Falha em consultar jogadores. Contate o suporte."}
            </p>
          ) : hasPlayers ? (
            normalizedEntries.map((item, index) => {
              const rowKey =
                item.userId !== undefined
                  ? `leaderboard-user-${item.userId}-${index}`
                  : `leaderboard-row-${index}-${item.name}`;
              const isCurrentUser =
                currentUserId !== undefined && item.userId === currentUserId;
              const scopedGameId = resolveScopedGameId(item);
              const playerTierText = item.tier ? `Jogador ${item.tier}` : "Jogador";
              const resolvedAvatarUrl = resolveSafeAvatarUrl(item);
              const avatarInitials = avatarFallback(item.name);

              return (
                <div
                  className={`leaderboard-item ${
                    isCurrentUser ? "leaderboard-item-user" : ""
                  }`}
                  key={rowKey}
                >
                  <div className="leaderboard-avatar" aria-hidden="true">
                    {resolvedAvatarUrl ? (
                      <img
                        src={resolvedAvatarUrl}
                        alt={item.name || "Avatar"}
                        loading="lazy"
                        onError={() => registerAvatarError(resolvedAvatarUrl)}
                      />
                    ) : (
                      <span className="leaderboard-avatar-fallback">
                        {avatarInitials}
                      </span>
                    )}
                  </div>
                  <div className="leaderboard-body">
                    <p className="leaderboard-name">{item.name}</p>
                    <p className="leaderboard-tier">{playerTierText}</p>
                  </div>
                  <div className="leaderboard-badge-wrap">
                    <UserHighestBadge
                      badges={item.badges}
                      scopedGameId={scopedGameId}
                      classNames={BADGE_CLASSNAMES}
                    />
                    <span className="leaderboard-position-value">
                      {item.rank}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="leaderboard-empty">{resolvedEmptyMessage}</p>
          )}
        </div>
        <div className="leaderboard-bottom">
          {!isLoading && !hasError && userEntry && (
            <>
              <div className="leaderboard-divider" aria-hidden="true">
                <span>&bull;</span>
              </div>
              <div
                className="leaderboard-item leaderboard-item-user"
                role="group"
                aria-label="Seu destaque no leaderboard"
              >
                <div className="leaderboard-avatar" aria-hidden="true">
                  {userAvatarUrl ? (
                    <img
                      src={userAvatarUrl}
                      alt={userEntry.name || "Avatar"}
                      loading="lazy"
                      onError={() => registerAvatarError(userAvatarUrl)}
                    />
                  ) : (
                    <span className="leaderboard-avatar-fallback">
                      {userAvatarInitials}
                    </span>
                  )}
                </div>
                <div className="leaderboard-body">
                  <p className="leaderboard-name">{userEntry.name}</p>
                  <p className="leaderboard-tier">{userTierText}</p>
                </div>
                <div className="leaderboard-badge-wrap">
                  <UserHighestBadge
                    badges={userEntry.badges}
                    scopedGameId={userScopedGameId}
                    classNames={BADGE_CLASSNAMES}
                  />
                  <span className="leaderboard-position-value">
                    {userEntry.rank}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
