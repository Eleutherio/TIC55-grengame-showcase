import { useEffect, useMemo, useState } from "react";
import UserHighestBadge, {
  type UserBadgeData,
} from "../components/badges/UserHighestBadge";
import { API_URL } from "../config/api";
import "./Ranking.css";

export type RankingEntry = {
  userId?: number;
  user_id?: number;
  name?: string;
  tier?: "Ouro" | "Prata" | "Bronze" | string;
  nivel?: "Ouro" | "Prata" | "Bronze" | string;
  medal?: string;
  avatar?: string;
  avatar_url?: string;
  avatarUrl?: string;
  points?: number;
  total_points?: number;
  totalPoints?: number;
  badges?: UserBadgeData[] | string[];
  rank?: string;
  position?: number;
  game_id?: number | null;
  gameId?: number | null;
};

const RANKING_ENDPOINT = `${API_URL}/auth/ranking/`;
const ME_ENDPOINT = `${API_URL}/auth/me/`;

const BADGE_CLASSNAMES = {
  trigger: "ranking-highest-badge-trigger",
  image: "ranking-highest-badge-image",
  error: "ranking-highest-badge-error",
  tooltip: "ranking-highest-badge-tooltip",
} as const;

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

const getFirstName = (fullName?: string) => {
  if (!fullName) return "Jogador";
  const trimmed = fullName.trim();
  if (!trimmed) return "Jogador";
  const [firstName] = trimmed.split(/\s+/);
  return firstName || "Jogador";
};

const avatarFallback = (name?: string) => {
  if (!name) return "?";
  const trimmed = name.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
};

const rankInfoForIndex = (index: number) => {
  if (index === 0) {
    return { display: "🥇", className: "medal-ouro", aria: "Ouro" };
  }
  if (index === 1) {
    return { display: "🥈", className: "medal-prata", aria: "Prata" };
  }
  if (index === 2) {
    return { display: "🥉", className: "medal-bronze", aria: "Bronze" };
  }
  return { display: `${index + 1}`, className: "", aria: `${index + 1}º` };
};

const getEntryUserId = (
  entry: Pick<RankingEntry, "user_id" | "userId">,
): number | undefined => entry.user_id ?? entry.userId;

const resolveRankInfo = (rankValue: string | undefined, fallbackIndex: number) => {
  const numericRank = Number(rankValue);
  const resolvedIndex =
    Number.isFinite(numericRank) && numericRank > 0
      ? numericRank - 1
      : fallbackIndex;

  if (resolvedIndex < 0) {
    return { display: "-", className: "", aria: "-" };
  }

  return rankInfoForIndex(resolvedIndex);
};

const resolveEntryAvatar = (
  entry: Pick<RankingEntry, "avatar" | "avatarUrl" | "avatar_url">,
  fallbackAvatar?: string,
) =>
  resolveAvatarUrl(
    entry.avatar || entry.avatarUrl || entry.avatar_url || fallbackAvatar,
  );

const NAME_SEARCH_REGEX = /^(?=.{2,80}$)[\p{L}]+(?:[ '\-\s]+[\p{L}]+)*$/u;
const NAME_SEARCH_ERROR =
  "Use um nome entre 2 e 80 caracteres; letras (inclui acentos), espaços (inclui múltiplos), hífen e apóstrofo são permitidos.";

const validateRankingSearch = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return NAME_SEARCH_REGEX.test(trimmed) ? null : NAME_SEARCH_ERROR;
};

export default function Ranking() {
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<number | undefined>(
    undefined,
  );
  const [currentUserAvatarUrl, setCurrentUserAvatarUrl] = useState<string | undefined>(
    undefined,
  );
  const [invalidAvatarUrls, setInvalidAvatarUrls] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);

  const registerAvatarError = (avatarUrl: string) => {
    setInvalidAvatarUrls((previous) => {
      if (previous.has(avatarUrl)) {
        return previous;
      }
      const next = new Set(previous);
      next.add(avatarUrl);
      return next;
    });
  };

  const loadRanking = async () => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      // Permite tentar novamente imagens que falharam em carregamentos anteriores.
      setInvalidAvatarUrls(new Set<string>());

      const token = localStorage.getItem("accessToken");
      const response = await fetch(RANKING_ENDPOINT, {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();

      if (Array.isArray(data)) {
        setEntries(data);
      } else if (data.results && Array.isArray(data.results)) {
        setEntries(data.results);
      } else {
        setEntries([]);
      }
    } catch {
      setErrorMessage("Erro ao carregar ranking. Tente novamente mais tarde.");
      setEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRanking();
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;

    try {
      const parts = token.split(".");
      if (parts.length === 3) {
        const decoded = JSON.parse(atob(parts[1]));
        if (decoded.user_id) {
          setCurrentUserId(Number(decoded.user_id));
        }
      }
    } catch (error) {
      console.error("Erro ao decodificar token:", error);
    }

    const controller = new AbortController();

    const loadCurrentUserAvatar = async () => {
      try {
        const response = await fetch(ME_ENDPOINT, {
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) return;
        const payload = await response.json();
        const resolvedAvatar = resolveAvatarUrl(
          payload?.avatar_url ?? payload?.avatar,
        );
        setCurrentUserAvatarUrl(resolvedAvatar);
      } catch (error) {
        if (controller.signal.aborted) return;
        console.warn("Não foi possível carregar o avatar do usuário atual.", error);
      }
    };

    void loadCurrentUserAvatar();

    return () => controller.abort();
  }, []);

  const hasError = Boolean(errorMessage);

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchError(validateRankingSearch(value));
  };

  // Normaliza payload heterogêneo da API em um shape estável para o restante da tela.
  const normalizedEntries = useMemo(
    () =>
      entries.map((entry) => {
        let rankValue = "-";
        if (typeof entry.position === "number" && Number.isFinite(entry.position)) {
          rankValue = String(entry.position);
        } else if (typeof entry.rank === "string" && entry.rank.trim() !== "") {
          rankValue = entry.rank;
        }

        const resolvedPoints = toNonNegativeNumber(
          entry.total_points ?? entry.totalPoints ?? entry.points ?? 0,
        );

        return {
          ...entry,
          name: entry.name || "Jogador",
          rank: rankValue,
          points: resolvedPoints,
        };
      }),
    [entries],
  );

  const userEntry = useMemo(
    () =>
      normalizedEntries.find((entry) => {
        if (currentUserId === undefined) return false;
        return getEntryUserId(entry) === currentUserId;
      }) || null,
    [currentUserId, normalizedEntries],
  );

  const userFallbackIndex = useMemo(() => {
    if (!userEntry) return -1;
    const userId = getEntryUserId(userEntry);
    return normalizedEntries.findIndex((entry) => getEntryUserId(entry) === userId);
  }, [normalizedEntries, userEntry]);

  const hasPlayers = normalizedEntries.length > 0;
  const trimmedSearch = searchQuery.trim();
  const isSearchActive = trimmedSearch.length > 0;

  const filteredEntries = useMemo(() => {
    if (!isSearchActive || searchError) {
      return normalizedEntries;
    }

    const normalizedTerm = trimmedSearch.toLowerCase();
    return normalizedEntries.filter((entry) =>
      (entry.name ?? "").toLowerCase().includes(normalizedTerm),
    );
  }, [isSearchActive, normalizedEntries, searchError, trimmedSearch]);

  const hasVisiblePlayers = filteredEntries.length > 0;
  const userRankInfo = userEntry
    ? resolveRankInfo(userEntry.rank, userFallbackIndex)
    : null;
  const userAvatarUrl = userEntry
    ? resolveEntryAvatar(userEntry, currentUserAvatarUrl)
    : undefined;
  const resolvedUserAvatarUrl =
    userAvatarUrl && !invalidAvatarUrls.has(userAvatarUrl)
      ? userAvatarUrl
      : undefined;
  const userId = userEntry ? getEntryUserId(userEntry) : undefined;
  const userAvatarHue = ((userId ?? 0) * 47) % 360;
  const userInitials = avatarFallback(userEntry?.name);
  const userScopedGameId = userEntry
    ? toFiniteNumber(userEntry.game_id ?? userEntry.gameId) ?? null
    : null;

  return (
    <>
      <div className="ranking-page">
        <div className="ranking-container">
          <div className="ranking-card">
            <div className="ranking-header">
              <div className="ranking-header-text">
                <h1 className="ranking-title">Ranking Geral</h1>
                <p className="ranking-subtitle">
                  Confira os melhores jogadores do{" "}
                  <span
                    className="ranking-subtitle-brand"
                    aria-label="GrenGame"
                    role="text"
                  >
                    <span className="ranking-brand-letter ranking-brand-yellow">
                      G
                    </span>
                    ren
                    <span className="ranking-brand-letter ranking-brand-red">
                      G
                    </span>
                    ame
                  </span>
                  !
                </p>
              </div>
              <div className="ranking-search">
                <label htmlFor="rankingSearch" className="ranking-search-label">
                  Buscar jogadores
                </label>
                <input
                  id="rankingSearch"
                  type="text"
                  className="ranking-search-field"
                  placeholder="Nome completo"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                  aria-invalid={!!searchError}
                  aria-describedby={searchError ? "rankingSearchError" : undefined}
                  maxLength={80}
                />
                {searchError && (
                  <p
                    className="ranking-search-error"
                    id="rankingSearchError"
                    role="alert"
                  >
                    {searchError}
                  </p>
                )}
              </div>
            </div>

            <div className="ranking-list">
              <div className="ranking-columns" role="presentation">
                <span className="col-rank">Posição</span>
                <span className="col-name">Nome</span>
                <span className="col-badge">Badge</span>
                <span className="col-points">Pontos</span>
              </div>

              <div className="ranking-scroll">
                {isLoading ? (
                  <div className="ranking-loading" role="status" aria-live="polite">
                    <span className="ranking-spinner" aria-hidden="true" />
                    <p className="ranking-loading-text">
                      Carregando ranking, avatars e badges...
                    </p>
                  </div>
                ) : hasError ? (
                  <div className="ranking-error-inline" role="status" aria-live="polite">
                    <p className="ranking-error-inline-text">
                      {errorMessage ||
                        "Erro ao carregar ranking. Tente novamente mais tarde."}
                    </p>
                    <div className="ranking-error-inline-actions">
                      <button
                        type="button"
                        className="ranking-refresh-btn"
                        onClick={() => void loadRanking()}
                      >
                        Tentar novamente
                      </button>
                    </div>
                  </div>
                ) : hasPlayers ? (
                  hasVisiblePlayers ? (
                    filteredEntries.map((item, filteredIndex) => {
                      const itemUserId = getEntryUserId(item);
                      const isUser =
                        currentUserId !== undefined && itemUserId === currentUserId;

                      const avatarHue = ((itemUserId ?? filteredIndex) * 47) % 360;
                      const avatarImageUrl = resolveEntryAvatar(
                        item,
                        isUser ? currentUserAvatarUrl : undefined,
                      );
                      const resolvedAvatarImageUrl =
                        avatarImageUrl && !invalidAvatarUrls.has(avatarImageUrl)
                          ? avatarImageUrl
                          : undefined;
                      const avatarInitials = avatarFallback(item.name);

                      // Mantém medalhas consistentes quando rank vier inválido ou ausente.
                      const rankInfo = resolveRankInfo(item.rank, filteredIndex);
                      const isTopThree = rankInfo.className !== "";

                      const scopedGameId =
                        toFiniteNumber(item.game_id ?? item.gameId) ?? null;

                      return (
                        <div
                          className={`ranking-item ${rankInfo.className} ${
                            isTopThree ? "ranking-item-top-three" : ""
                          } ${isUser ? "ranking-item-user" : ""}`}
                          key={String(itemUserId ?? filteredIndex)}
                        >
                          <div
                            className={`ranking-rank ${rankInfo.className}`}
                            aria-label={`Posição ${rankInfo.aria}`}
                          >
                            {rankInfo.display}
                          </div>

                          <div className="ranking-name-cell">
                            <div className="ranking-avatar" aria-hidden="true">
                              {resolvedAvatarImageUrl ? (
                                <img
                                  src={resolvedAvatarImageUrl}
                                  alt={item.name ?? "Avatar"}
                                  loading="lazy"
                                  onError={() =>
                                    registerAvatarError(resolvedAvatarImageUrl)
                                  }
                                />
                              ) : (
                                <span
                                  className="ranking-avatar-fallback"
                                  style={{
                                    backgroundColor: `hsl(${avatarHue}, 70%, 75%)`,
                                    color: "#1f1f41",
                                  }}
                                >
                                  {avatarInitials}
                                </span>
                              )}
                            </div>
                            <p className="ranking-name">{getFirstName(item.name)}</p>
                          </div>

                          <div className="ranking-badge">
                            <UserHighestBadge
                              badges={item.badges}
                              scopedGameId={scopedGameId}
                              classNames={BADGE_CLASSNAMES}
                            />
                          </div>

                          <div className="ranking-points">
                            <p className="ranking-points-value">{item.points ?? 0}</p>
                            <p className="ranking-points-label">pontos</p>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <p className="ranking-empty">
                      {isSearchActive && !searchError
                        ? "Nenhum jogador encontrado para essa busca."
                        : "Nenhum jogador no ranking ainda."}
                    </p>
                  )
                ) : (
                  <p className="ranking-empty">Nenhum jogador no ranking ainda.</p>
                )}
              </div>

              <div className="ranking-bottom">
                {hasPlayers && !hasError && userEntry && (
                  <div
                    className="ranking-item highlight"
                    role="group"
                    aria-label={`Destaque de ${userEntry.name ?? "jogador"}`}
                  >
                    <div
                      className={`ranking-rank ${userRankInfo?.className ?? ""}`}
                      aria-label="Sua posição"
                    >
                      {userRankInfo?.display ?? "-"}
                    </div>

                    <div className="ranking-name-cell">
                      <div className="ranking-avatar" aria-hidden="true">
                        {resolvedUserAvatarUrl ? (
                          <img
                            src={resolvedUserAvatarUrl}
                            alt={userEntry.name ?? "Avatar"}
                            loading="lazy"
                            onError={() => registerAvatarError(resolvedUserAvatarUrl)}
                          />
                        ) : (
                          <span
                            className="ranking-avatar-fallback"
                            style={{
                              backgroundColor: `hsl(${userAvatarHue}, 70%, 75%)`,
                              color: "#1f1f41",
                            }}
                          >
                            {userInitials}
                          </span>
                        )}
                      </div>
                      <p className="ranking-name">{getFirstName(userEntry.name)}</p>
                    </div>

                    <div className="ranking-badge">
                      <UserHighestBadge
                        badges={userEntry.badges}
                        scopedGameId={userScopedGameId}
                        classNames={BADGE_CLASSNAMES}
                      />
                    </div>

                    <div className="ranking-points">
                      <p className="ranking-points-value">{userEntry.points ?? 0}</p>
                      <p className="ranking-points-label">pontos</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
