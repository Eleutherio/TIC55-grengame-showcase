import { useCallback, useEffect, useMemo, useState } from "react";
import "./AdministrarBadges.css";
import { API_URL } from "../config/api";
import CartaoJogoCriterioBadge from "../components/badges/CartaoJogoCriterioBadge";
import BadgeTierRulesCard from "../components/badges/BadgeTierRulesCard";
import BadgePreviewCard from "../components/badges/BadgePreviewCard";
import CartaoBadgesSalvas from "../components/badges/CartaoBadgesSalvas";

type GameOption = {
  id: string;
  name: string;
  category?: string;
};

type UnlockCriterion = "course_points" | "perfect_missions" | "active_days";
type CriterionValue = UnlockCriterion | "";
type ValueMode = "percentage" | "absolute";
type TierNumber = 1 | 2 | 3 | 4 | 5;
type TierValues = Record<TierNumber, number>;

type StatusFeedback = {
  type: "success" | "error" | "info";
  text: string;
};

type SavedBadgeConfig = {
  gameId: string;
  gameName: string;
  criterion: UnlockCriterion;
  valueMode: ValueMode;
  isActive: boolean;
  tierValues: TierValues;
  updatedAt?: string;
};

type GameFetchResult =
  | { kind: "ok"; configs: SavedBadgeConfig[] }
  | { kind: "unsupported" }
  | { kind: "error" };

type GamePagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

const API_BASE_URL = API_URL.replace(/\/+$/, "");
const GAMES_ENDPOINT = `${API_BASE_URL}/auth/games/`;
const BADGE_CONFIG_ENDPOINT_TEMPLATE =
  (import.meta.env.VITE_BADGE_CONFIG_ENDPOINT_TEMPLATE as string | undefined)
    ?.trim()
    ? (import.meta.env.VITE_BADGE_CONFIG_ENDPOINT_TEMPLATE as string)
    : `${API_BASE_URL}/auth/games/{gameId}/badge-config/`;
const GAMES_PAGE_LIMIT = 10;
const EMPTY_GAMES_PAGINATION: GamePagination = {
  page: 1,
  limit: GAMES_PAGE_LIMIT,
  total: 0,
  totalPages: 0,
  hasNext: false,
  hasPrevious: false,
};

const TIER_ASSETS: Array<{ tier: TierNumber; image: string }> = [
  { tier: 1, image: "/tier1.png" },
  { tier: 2, image: "/tier2.png" },
  { tier: 3, image: "/tier3.png" },
  { tier: 4, image: "/tier4.png" },
  { tier: 5, image: "/tier5.png" },
];

const CRITERIA_OPTIONS: Array<{
  id: UnlockCriterion;
  label: string;
  description: string;
}> = [
  {
    id: "course_points",
    label: "Conquistador do Curso (pontos)",
    description:
      "Desbloqueia por percentual dos pontos totais do game acumulados pelo usuário.",
  },
  {
    id: "perfect_missions",
    label: "Perfeccionista (missões perfeitas)",
    description:
      "Desbloqueia por percentual de missões concluídas com pontuação máxima.",
  },
  {
    id: "active_days",
    label: "Ritmo Constante (dias ativos)",
    description:
      "Desbloqueia por quantidade de dias diferentes com missões concluídas no game.",
  },
];

const GAMIFIED_TITLES: Record<UnlockCriterion, Record<TierNumber, string>> = {
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

const DEFAULT_TIER_VALUES: Record<UnlockCriterion, TierValues> = {
  course_points: { 1: 25, 2: 45, 3: 65, 4: 85, 5: 100 },
  perfect_missions: { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 },
  active_days: { 1: 2, 2: 3, 3: 4, 4: 5, 5: 7 },
};

const EMPTY_TIER_VALUES: TierValues = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 };

const defaultTiersByCriterion = (criterion: CriterionValue): TierValues =>
  criterion ? { ...DEFAULT_TIER_VALUES[criterion] } : { ...EMPTY_TIER_VALUES };

const configEndpoint = (gameId: string) =>
  BADGE_CONFIG_ENDPOINT_TEMPLATE.replace("{gameId}", encodeURIComponent(gameId));

const deleteConfigEndpoint = (gameId: string, criterion: UnlockCriterion) => {
  const base = configEndpoint(gameId);
  const separator = base.includes("?") ? "&" : "?";
  return `${base}${separator}criterion=${encodeURIComponent(criterion)}`;
};

const isCriterion = (value: unknown): value is UnlockCriterion =>
  value === "course_points" || value === "perfect_missions" || value === "active_days";

const isValueMode = (value: unknown): value is ValueMode =>
  value === "percentage" || value === "absolute";

const isPercentageCriterion = (criterion: CriterionValue): criterion is UnlockCriterion =>
  criterion === "course_points" || criterion === "perfect_missions";

const defaultValueModeByCriterion = (criterion: CriterionValue): ValueMode =>
  criterion === "active_days" ? "absolute" : "percentage";

const toPositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const toNonNegativeInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) return null;
  return parsed;
};

const configKey = (gameId: string, criterion: UnlockCriterion) =>
  `${gameId}:${criterion}`;

const criterionLabel = (criterion: UnlockCriterion) =>
  CRITERIA_OPTIONS.find((option) => option.id === criterion)?.label ?? criterion;

const publicationStatusLabel = (isActive: boolean) =>
  isActive ? "Publicado" : "Rascunho";

const criterionHelp = (criterion: CriterionValue) => {
  if (!criterion) return "Selecione um critério para ver como o desbloqueio será contado.";
  return CRITERIA_OPTIONS.find((option) => option.id === criterion)?.description ?? "";
};

const inferValueMode = (
  criterion: UnlockCriterion,
  rawValueMode: unknown,
  tiers: TierValues,
): ValueMode => {
  if (isValueMode(rawValueMode)) return rawValueMode;
  if (criterion === "active_days") return "absolute";

  const isPercentLike =
    tiers[1] <= 100 &&
    tiers[2] <= 100 &&
    tiers[3] <= 100 &&
    tiers[4] <= 100 &&
    tiers[5] === 100;
  return isPercentLike ? "percentage" : "absolute";
};

const criterionPresetHelp = (criterion: CriterionValue, valueMode: ValueMode) => {
  if (criterion === "course_points") {
    return valueMode === "percentage"
      ? "Preset MVP: 25, 45, 65, 85 e 100 (%)."
      : "Configuração legada em valor absoluto. Para salvar, use percentual (0 a 100).";
  }
  if (criterion === "perfect_missions") {
    return valueMode === "percentage"
      ? "Preset MVP: 20, 40, 60, 80 e 100 (%)."
      : "Configuração legada em valor absoluto. Para salvar, use percentual (0 a 100).";
  }
  if (criterion === "active_days") return "Preset MVP: 2, 3, 4, 5 e 7 dias.";
  return "";
};

const criterionInputLabel = (criterion: CriterionValue, valueMode: ValueMode) => {
  if (criterion === "active_days") return "Dias";
  if (isPercentageCriterion(criterion) && valueMode === "absolute") {
    return "Valor absoluto (legado)";
  }
  return "Percentual (%)";
};

const tierTitle = (criterion: CriterionValue, tier: TierNumber): string => {
  const titleCriterion: UnlockCriterion = criterion || "course_points";
  return `${GAMIFIED_TITLES[titleCriterion][tier]} - Tier ${tier}`;
};

const ruleDescription = (
  criterion: CriterionValue,
  value: number,
  valueMode: ValueMode,
): string => {
  if (criterion === "course_points") {
    return valueMode === "percentage"
      ? `Atingir ${value}% dos pontos totais do game`
      : `Atingir ${value} ponto(s) no game (legado absoluto)`;
  }
  if (criterion === "perfect_missions") {
    return valueMode === "percentage"
      ? `Concluir ${value}% das missões com pontuação máxima`
      : `Concluir ${value} missão(ões) com pontuação máxima (legado absoluto)`;
  }
  if (criterion === "active_days") return `Concluir missões em ${value} dia(s) diferentes`;
  return `Meta: ${value}`;
};

const formatDate = (value?: string) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleString("pt-BR");
};

const getErrorMessage = (payload: unknown): string => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    const firstText = payload.find((item) => typeof item === "string");
    return typeof firstText === "string" ? firstText : "";
  }
  if (typeof payload !== "object") return "";

  const parsed = payload as Record<string, unknown>;
  if (typeof parsed.detail === "string") return parsed.detail;
  if (typeof parsed.error === "string") return parsed.error;
  if (
    Array.isArray(parsed.non_field_errors) &&
    parsed.non_field_errors.length > 0 &&
    typeof parsed.non_field_errors[0] === "string"
  ) {
    return parsed.non_field_errors[0];
  }

  for (const value of Object.values(parsed)) {
    if (typeof value === "string") return value;
    if (Array.isArray(value)) {
      const firstText = value.find((item) => typeof item === "string");
      if (typeof firstText === "string") return firstText;
    }
  }

  return "";
};

const parseGameOptions = (payload: unknown): GameOption[] => {
  if (!Array.isArray(payload)) return [];

  return payload.reduce<GameOption[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const parsed = item as Record<string, unknown>;
    const id = parsed.id ?? parsed.pk;
    const name = parsed.name ?? parsed.title ?? parsed.titulo;
    if (id === undefined || typeof name !== "string") return acc;

    acc.push({
      id: String(id),
      name,
      category: typeof parsed.category === "string" ? parsed.category : undefined,
    });
    return acc;
  }, []);
};

const normalizeGamesListResponse = (payload: unknown): GameOption[] => {
  if (Array.isArray(payload)) return parseGameOptions(payload);
  if (!payload || typeof payload !== "object") return [];

  const parsed = payload as Record<string, unknown>;
  return parseGameOptions(parsed.results);
};

const normalizeGamesResponse = (
  payload: unknown,
  requestedPage: number,
  requestedLimit: number,
): { games: GameOption[]; pagination: GamePagination } => {
  // O backend pode responder em dois formatos:
  // 1) lista simples (sem paginação) 2) objeto { results, pagination }.
  // Aqui normalizamos ambos para um contrato único consumido pelo frontend.
  if (Array.isArray(payload)) {
    const games = parseGameOptions(payload);
    return {
      games,
      pagination: {
        page: 1,
        limit: games.length || requestedLimit,
        total: games.length,
        totalPages: games.length > 0 ? 1 : 0,
        hasNext: false,
        hasPrevious: false,
      },
    };
  }

  if (!payload || typeof payload !== "object") {
    return { games: [], pagination: { ...EMPTY_GAMES_PAGINATION } };
  }

  const parsed = payload as Record<string, unknown>;
  const games = parseGameOptions(parsed.results);
  const pagination = parsed.pagination as Record<string, unknown> | undefined;

  const pageValue = Number(pagination?.page);
  const limitValue = Number(pagination?.limit);
  const totalValue = Number(pagination?.total);
  const totalPagesValue = Number(pagination?.total_pages);

  const nextPagination: GamePagination = {
    page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : requestedPage,
    limit: Number.isFinite(limitValue) && limitValue > 0 ? limitValue : requestedLimit,
    total: Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : games.length,
    totalPages:
      Number.isFinite(totalPagesValue) && totalPagesValue >= 0
        ? totalPagesValue
        : games.length > 0
          ? 1
          : 0,
    hasNext: Boolean(pagination?.has_next),
    hasPrevious: Boolean(pagination?.has_previous),
  };

  return { games, pagination: nextPagination };
};

const normalizeConfigList = (payload: unknown): Array<Record<string, unknown>> => {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== "object") return [];

  const parsed = payload as Record<string, unknown>;
  if (Array.isArray(parsed.results)) {
    return parsed.results.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  }
  if (Array.isArray(parsed.configs)) {
    return parsed.configs.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  }
  if (Array.isArray(parsed.data)) {
    return parsed.data.filter((item) => item && typeof item === "object") as Array<Record<string, unknown>>;
  }
  return [parsed];
};

const parseConfig = (raw: Record<string, unknown>, fallbackGame: GameOption): SavedBadgeConfig | null => {
  const criterion = raw.criterion;
  if (!isCriterion(criterion)) return null;

  // Aceita apenas configurações completas (5 tiers válidos), para evitar
  // hidratar estado de edição com dados parciais/inconsistentes.
  const tierValuesByTier = new Map<TierNumber, number>();
  const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];

  for (const tierItem of tiers) {
    if (!tierItem || typeof tierItem !== "object") continue;
    const tierObj = tierItem as Record<string, unknown>;
    const tier = toPositiveInt(tierObj.tier);
    const requiredValue = toNonNegativeInt(tierObj.required_value ?? tierObj.required_count);

    if (!tier || requiredValue === null) continue;
    if (!TIER_ASSETS.some((asset) => asset.tier === tier)) continue;
    tierValuesByTier.set(tier as TierNumber, requiredValue);
  }

  if (tierValuesByTier.size !== TIER_ASSETS.length) return null;

  const parsedTiers: TierValues = {
    1: tierValuesByTier.get(1) ?? 0,
    2: tierValuesByTier.get(2) ?? 0,
    3: tierValuesByTier.get(3) ?? 0,
    4: tierValuesByTier.get(4) ?? 0,
    5: tierValuesByTier.get(5) ?? 0,
  };

  if (criterion === "active_days" && Object.values(parsedTiers).some((value) => value <= 0)) {
    return null;
  }

  const rawGameId = raw.game_id ?? raw.gameId ?? fallbackGame.id;
  const gameId = rawGameId === undefined ? fallbackGame.id : String(rawGameId);

  const rawGameName = raw.game_name ?? raw.gameName ?? fallbackGame.name;
  const gameName = typeof rawGameName === "string" ? rawGameName : fallbackGame.name;
  const valueMode = inferValueMode(criterion, raw.value_mode, parsedTiers);
  const isActive = Boolean(raw.is_active);

  return {
    gameId,
    gameName,
    criterion,
    valueMode,
    isActive,
    tierValues: parsedTiers,
    updatedAt: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
};

export default function AdministrarBadges() {
  const [games, setGames] = useState<GameOption[]>([]);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);

  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedCriterion, setSelectedCriterion] = useState<CriterionValue>("");
  const [selectedValueMode, setSelectedValueMode] = useState<ValueMode>("percentage");
  const [selectedIsActive, setSelectedIsActive] = useState(false);
  const [tierValues, setTierValues] = useState<TierValues>(defaultTiersByCriterion(""));

  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(false);
  const [isBackendUnavailable, setIsBackendUnavailable] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<StatusFeedback | null>(null);

  const [savedConfigs, setSavedConfigs] = useState<SavedBadgeConfig[]>([]);
  const [savedGameFilterId, setSavedGameFilterId] = useState("");
  const [expandedGameId, setExpandedGameId] = useState<string | null>(null);
  const [savedGamesPage, setSavedGamesPage] = useState(1);
  const [savedGamesPagination, setSavedGamesPagination] =
    useState<GamePagination>(EMPTY_GAMES_PAGINATION);
  const [isLoadingSavedConfigs, setIsLoadingSavedConfigs] = useState(false);
  const [savedConfigsError, setSavedConfigsError] = useState<string | null>(null);
  const [isDeletingConfigKey, setIsDeletingConfigKey] = useState<string | null>(null);

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  const groupedSavedConfigs = useMemo(() => {
    const groupedMap = new Map<
      string,
      { gameId: string; gameName: string; criteria: SavedBadgeConfig[] }
    >();

    for (const config of savedConfigs) {
      const existing = groupedMap.get(config.gameId);
      if (existing) {
        existing.criteria.push(config);
        continue;
      }
      groupedMap.set(config.gameId, {
        gameId: config.gameId,
        gameName: config.gameName,
        criteria: [config],
      });
    }

    const grouped = Array.from(groupedMap.values());
    grouped.sort((a, b) => a.gameName.localeCompare(b.gameName, "pt-BR"));
    for (const group of grouped) {
      group.criteria.sort((a, b) =>
        criterionLabel(a.criterion).localeCompare(criterionLabel(b.criterion), "pt-BR"),
      );
    }
    return grouped;
  }, [savedConfigs]);

  const visibleGroupedSavedConfigs = useMemo(() => {
    if (!savedGameFilterId) return groupedSavedConfigs;
    return groupedSavedConfigs.filter((group) => group.gameId === savedGameFilterId);
  }, [groupedSavedConfigs, savedGameFilterId]);

  const selectedSavedGroup = useMemo(() => {
    if (visibleGroupedSavedConfigs.length === 0) return null;
    return (
      visibleGroupedSavedConfigs.find((group) => group.gameId === expandedGameId) ??
      visibleGroupedSavedConfigs[0]
    );
  }, [expandedGameId, visibleGroupedSavedConfigs]);

  const validationError = useMemo(() => {
    if (!selectedGameId) return "Selecione um game para configurar a badge.";
    if (!selectedCriterion) return "Selecione um critério de desbloqueio.";

    const isPercentage = isPercentageCriterion(selectedCriterion);
    let previous = isPercentage ? -1 : 0;
    for (const asset of TIER_ASSETS) {
      const value = tierValues[asset.tier];
      if (!Number.isInteger(value)) {
        return `Tier ${asset.tier}: informe um numero inteiro valido.`;
      }
      if (isPercentage) {
        if (value < 0 || value > 100) {
          return `Tier ${asset.tier}: para critérios percentuais, use valor entre 0 e 100.`;
        }
      } else if (value <= 0) {
        return `Tier ${asset.tier}: informe um numero inteiro maior que zero.`;
      }
      if (value <= previous) {
        return `Tier ${asset.tier}: o valor deve ser maior que o tier anterior.`;
      }
      previous = value;
    }

    if (isPercentageCriterion(selectedCriterion) && tierValues[5] !== 100) {
      return "Para critérios percentuais, o Tier 5 deve ser 100.";
    }

    return "";
  }, [selectedGameId, selectedCriterion, tierValues]);

  const fetchGamesPage = useCallback(async (page: number) => {
    const token = localStorage.getItem("accessToken");
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(GAMES_PAGE_LIMIT));

    const response = await fetch(`${GAMES_ENDPOINT}?${params.toString()}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    if (!response.ok) throw new Error(`HTTP_${response.status}`);

    const payload = (await response.json()) as unknown;
    return normalizeGamesResponse(payload, page, GAMES_PAGE_LIMIT);
  }, []);

  useEffect(() => {
    let active = true;
    setIsLoadingGames(true);

    const loadGames = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(GAMES_ENDPOINT, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) throw new Error(`HTTP_${response.status}`);

        const payload = (await response.json()) as unknown;
        const normalizedGames = normalizeGamesListResponse(payload);
        if (!active) return;

        setGames(normalizedGames);
        setGamesError(
          normalizedGames.length === 0 ? "Nenhum game disponível no momento." : null,
        );
      } catch {
        if (!active) return;
        setGames([]);
        setGamesError("Não foi possível carregar os games.");
      } finally {
        if (active) setIsLoadingGames(false);
      }
    };

    void loadGames();

    return () => {
      active = false;
    };
  }, []);

  const fetchConfigsByGame = useCallback(async (game: GameOption): Promise<GameFetchResult> => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(configEndpoint(game.id), {
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (response.status === 404 || response.status === 405) {
        return { kind: "unsupported" };
      }

      if (!response.ok) return { kind: "error" };

      const payload = (await response.json().catch(() => null)) as unknown;
      const parsed = normalizeConfigList(payload)
        .map((item) => parseConfig(item, game))
        .filter((item): item is SavedBadgeConfig => Boolean(item));

      return { kind: "ok", configs: parsed };
    } catch {
      return { kind: "error" };
    }
  }, []);

  useEffect(() => {
    if (!selectedGameId || !selectedCriterion) {
      setSelectedValueMode(defaultValueModeByCriterion(selectedCriterion));
      setSelectedIsActive(false);
      setTierValues(defaultTiersByCriterion(selectedCriterion));
      return;
    }

    if (!selectedGame) return;
    const game = selectedGame;

    let active = true;
    setIsLoadingConfig(true);

    const loadSelectedConfig = async () => {
      const result = await fetchConfigsByGame(game);
      if (!active) return;

      if (result.kind === "unsupported") {
        setIsBackendUnavailable(true);
        setSelectedIsActive(false);
        setTierValues(defaultTiersByCriterion(selectedCriterion));
        setIsLoadingConfig(false);
        return;
      }

      if (result.kind === "error") {
        setStatusFeedback({
          type: "info",
          text: "Não foi possível carregar configuração prévia para este critério.",
        });
        setSelectedIsActive(false);
        setIsLoadingConfig(false);
        return;
      }

      setIsBackendUnavailable(false);
      const currentConfig = result.configs.find((config) => config.criterion === selectedCriterion);
      setSelectedValueMode(
        currentConfig?.valueMode ?? defaultValueModeByCriterion(selectedCriterion),
      );
      setSelectedIsActive(currentConfig?.isActive ?? false);
      setTierValues(currentConfig?.tierValues ?? defaultTiersByCriterion(selectedCriterion));
      setIsLoadingConfig(false);
    };

    void loadSelectedConfig();

    return () => {
      active = false;
    };
  }, [fetchConfigsByGame, selectedCriterion, selectedGame, selectedGameId]);

  const fetchSavedConfigs = useCallback(async () => {
    setIsLoadingSavedConfigs(true);
    setSavedConfigsError(null);

    try {
      // Primeiro pagina os games no backend, depois busca os critérios de badge
      // de cada game da página atual.
      const gamesPageResult = await fetchGamesPage(savedGamesPage);
      setSavedGamesPagination(gamesPageResult.pagination);

      if (gamesPageResult.pagination.page !== savedGamesPage) {
        setSavedGamesPage(gamesPageResult.pagination.page);
      }

      if (gamesPageResult.games.length === 0) {
        setSavedConfigs([]);
        return;
      }

      const results = await Promise.all(
        gamesPageResult.games.map((game) => fetchConfigsByGame(game)),
      );

      if (results.some((result) => result.kind === "unsupported")) {
        setIsBackendUnavailable(true);
        setSavedConfigs([]);
        setSavedConfigsError(
          "Endpoint de badges indisponível no backend para listar configurações.",
        );
        setIsLoadingSavedConfigs(false);
        return;
      }

      const merged = results.reduce<SavedBadgeConfig[]>((acc, result) => {
        if (result.kind === "ok") acc.push(...result.configs);
        return acc;
      }, []);

      merged.sort((a, b) => {
        const byGame = a.gameName.localeCompare(b.gameName, "pt-BR");
        if (byGame !== 0) return byGame;
        return criterionLabel(a.criterion).localeCompare(criterionLabel(b.criterion), "pt-BR");
      });

      setSavedConfigs(merged);

      if (results.some((result) => result.kind === "error")) {
        setSavedConfigsError(
          "Algumas configurações não puderam ser carregadas. Tente atualizar a lista.",
        );
      }
    } catch {
      setSavedConfigs([]);
      setSavedGamesPagination({ ...EMPTY_GAMES_PAGINATION });
      setSavedConfigsError("Não foi possível carregar as badges salvas.");
    } finally {
      setIsLoadingSavedConfigs(false);
    }
  }, [fetchConfigsByGame, fetchGamesPage, savedGamesPage]);

  useEffect(() => {
    void fetchSavedConfigs();
  }, [fetchSavedConfigs]);

  useEffect(() => {
    setSavedGameFilterId("");
  }, [savedGamesPage]);

  useEffect(() => {
    if (visibleGroupedSavedConfigs.length === 0) {
      setExpandedGameId(null);
      return;
    }

    if (
      expandedGameId &&
      visibleGroupedSavedConfigs.some((group) => group.gameId === expandedGameId)
    ) {
      return;
    }

    setExpandedGameId(visibleGroupedSavedConfigs[0].gameId);
  }, [expandedGameId, visibleGroupedSavedConfigs]);

  const handleGameChange = (gameId: string) => {
    setSelectedGameId(gameId);
    setSelectedCriterion("");
    setSelectedValueMode(defaultValueModeByCriterion(""));
    setSelectedIsActive(false);
    setTierValues(defaultTiersByCriterion(""));
    setStatusFeedback(null);
  };

  const handleCriterionChange = (criterion: CriterionValue) => {
    setSelectedCriterion(criterion);
    setSelectedValueMode(defaultValueModeByCriterion(criterion));
    setSelectedIsActive(false);
    setTierValues(defaultTiersByCriterion(criterion));
    setStatusFeedback(null);
  };

  const handleTierChange = (tier: TierNumber, value: string) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
      return;
    }
    const normalizedValue = isPercentageCriterion(selectedCriterion)
      ? Math.max(0, Math.min(100, parsed))
      : Math.max(1, parsed);
    setTierValues((current) => ({ ...current, [tier]: normalizedValue }));
  };

  const handleSave = async () => {
    if (validationError) {
      setStatusFeedback({ type: "error", text: validationError });
      return;
    }

    if (!selectedGameId || !selectedCriterion) return;
    if (isBackendUnavailable) {
      setStatusFeedback({
        type: "error",
        text: "O backend atual ainda não possui endpoint para salvar configuração de badges.",
      });
      return;
    }

    setIsSaving(true);
    setStatusFeedback(null);

    try {
      const token = localStorage.getItem("accessToken");
      const payload = {
        game_id: Number.isNaN(Number(selectedGameId))
          ? selectedGameId
          : Number(selectedGameId),
        criterion: selectedCriterion,
        is_active: selectedIsActive,
        tiers: TIER_ASSETS.map((asset) => ({
          tier: asset.tier,
          required_value: tierValues[asset.tier],
          required_count: tierValues[asset.tier],
        })),
      };

      const response = await fetch(configEndpoint(selectedGameId), {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (response.status === 404 || response.status === 405) {
        setIsBackendUnavailable(true);
        setStatusFeedback({
          type: "error",
          text: "Não foi possível salvar. Endpoint de badges indisponível no backend.",
        });
        return;
      }

      if (!response.ok) {
        const payloadError = (await response.json().catch(() => null)) as unknown;
        setStatusFeedback({
          type: "error",
          text:
            getErrorMessage(payloadError) ||
            `Não foi possível salvar a configuração (${response.status}).`,
        });
        return;
      }

      setStatusFeedback({
        type: "success",
        text: `Configuração ${criterionLabel(selectedCriterion)} salva como ${publicationStatusLabel(selectedIsActive).toLowerCase()}.`,
      });
      await fetchSavedConfigs();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Erro de conexão ao salvar. Tente novamente.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleEditSaved = (config: SavedBadgeConfig) => {
    setSelectedGameId(config.gameId);
    setSelectedCriterion(config.criterion);
    setSelectedValueMode(config.valueMode);
    setSelectedIsActive(config.isActive);
    setTierValues({ ...config.tierValues });
    setStatusFeedback({
      type: "info",
      text: `Configuração ${criterionLabel(config.criterion)} do game ${config.gameName} carregada para edição.`,
    });
  };

  const handleDeleteSaved = async (config: SavedBadgeConfig) => {
    if (isDeletingConfigKey) return;

    const currentKey = configKey(config.gameId, config.criterion);
    setIsDeletingConfigKey(currentKey);

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(deleteConfigEndpoint(config.gameId, config.criterion), {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (response.status === 404 || response.status === 405) {
        setIsBackendUnavailable(true);
        setStatusFeedback({
          type: "error",
          text: "Não foi possível excluir. Endpoint de badges indisponível no backend.",
        });
        return;
      }

      if (!response.ok) {
        const payloadError = (await response.json().catch(() => null)) as unknown;
        setStatusFeedback({
          type: "error",
          text:
            getErrorMessage(payloadError) ||
            `Não foi possível excluir a configuração (${response.status}).`,
        });
        return;
      }

      if (selectedGameId === config.gameId && selectedCriterion === config.criterion) {
        setSelectedValueMode(defaultValueModeByCriterion(selectedCriterion));
        setSelectedIsActive(false);
        setTierValues(defaultTiersByCriterion(selectedCriterion));
      }

      setStatusFeedback({
        type: "success",
        text: `Configuração ${criterionLabel(config.criterion)} excluída com sucesso.`,
      });
      await fetchSavedConfigs();
    } catch {
      setStatusFeedback({
        type: "error",
        text: "Erro de conexão ao excluir a configuração.",
      });
    } finally {
      setIsDeletingConfigKey(null);
    }
  };

  const previewGameName = selectedGame
    ? `${selectedGame.name}${selectedGame.category ? ` - ${selectedGame.category}` : ""}`
    : "Selecione um game";

  const legacyValueModeWarning =
    selectedCriterion &&
    isPercentageCriterion(selectedCriterion) &&
    selectedValueMode === "absolute"
      ? "Configuração legada detectada. Para salvar, converta os tiers para percentual (0 a 100) e mantenha o Tier 5 em 100."
      : "";

  const isSaveDisabled =
    isSaving ||
    isLoadingGames ||
    isLoadingConfig ||
    Boolean(validationError) ||
    isBackendUnavailable;

  return (
    <div className="badges-config-page">
      <section className="badges-config-card">
        <header className="badges-config-header">
          <div>
            <h1>Configurar Badges</h1>
            <p>
              Defina o critério por game e ajuste os 5 tiers de desbloqueio do
              MVP (pontos, missões perfeitas ou dias ativos).
            </p>
          </div>

          {statusFeedback && (
            <p
              className={`badges-config-status ${statusFeedback.type}`}
              role="status"
              aria-live="polite"
            >
              {statusFeedback.text}
            </p>
          )}
        </header>

        <div className="badges-config-grid">
          <div className="badges-config-panel">
            <CartaoJogoCriterioBadge
              games={games}
              selectedGameId={selectedGameId}
              selectedCriterion={selectedCriterion}
              selectedIsActive={selectedIsActive}
              isLoadingGames={isLoadingGames}
              isSaving={isSaving}
              gamesError={gamesError}
              criteriaOptions={CRITERIA_OPTIONS}
              criterionHelpText={
                !selectedGameId
                  ? "Escolha o game para habilitar os critérios."
                  : criterionHelp(selectedCriterion)
              }
              onGameChange={handleGameChange}
              onCriterionChange={handleCriterionChange}
              onStatusChange={setSelectedIsActive}
            />

            <BadgeTierRulesCard
              selectedCriterion={selectedCriterion}
              tierValues={tierValues}
              tierAssets={TIER_ASSETS}
              isSaving={isSaving}
              isLoadingConfig={isLoadingConfig}
              criterionPresetHelpText={criterionPresetHelp(
                selectedCriterion,
                selectedValueMode,
              )}
              legacyValueModeWarning={legacyValueModeWarning}
              inputLabel={criterionInputLabel(selectedCriterion, selectedValueMode)}
              isPercentageCriterion={isPercentageCriterion(selectedCriterion)}
              onTierChange={handleTierChange}
              tierTitle={(tier) => tierTitle(selectedCriterion, tier)}
              ruleDescription={(tier) =>
                ruleDescription(selectedCriterion, tierValues[tier], selectedValueMode)
              }
            />
          </div>

          <BadgePreviewCard
            gameName={previewGameName}
            criterion={selectedCriterion}
            tierAssets={TIER_ASSETS}
            tierTitle={tierTitle}
            ruleDescription={(tier) =>
              ruleDescription(selectedCriterion, tierValues[tier], selectedValueMode)
            }
          />
        </div>

        <footer className="badges-config-actions">
          {isBackendUnavailable && (
            <p className="badges-config-warning" role="alert">
              Sem endpoint backend para salvar badges. Configure o endpoint e tente
              novamente.
            </p>
          )}
          {validationError && !statusFeedback && (
            <p className="badges-config-warning" role="alert">
              {validationError}
            </p>
          )}
          {selectedGameId && selectedCriterion && (
            <p className="badges-config-help">
              Status atual para salvar:{" "}
              <strong>{publicationStatusLabel(selectedIsActive)}</strong>
            </p>
          )}

          <button
            type="button"
            className="badges-config-save-button"
            onClick={handleSave}
            disabled={isSaveDisabled}
          >
            {isSaving ? "Salvando..." : "Salvar configuração"}
          </button>
        </footer>

        <CartaoBadgesSalvas
          isLoadingSavedConfigs={isLoadingSavedConfigs}
          savedConfigsError={savedConfigsError}
          groupedSavedConfigs={groupedSavedConfigs}
          visibleGroupedSavedConfigs={visibleGroupedSavedConfigs}
          selectedSavedGroup={selectedSavedGroup}
          savedGameFilterId={savedGameFilterId}
          isDeletingConfigKey={isDeletingConfigKey}
          savedGamesPage={savedGamesPagination.page}
          savedGamesTotalPages={savedGamesPagination.totalPages}
          savedGamesHasPrevious={savedGamesPagination.hasPrevious}
          savedGamesHasNext={savedGamesPagination.hasNext}
          tierAssets={TIER_ASSETS}
          onSavedGameFilterChange={setSavedGameFilterId}
          onSavedGamesPagePrevious={() =>
            setSavedGamesPage((current) => Math.max(1, current - 1))
          }
          onSavedGamesPageNext={() =>
            setSavedGamesPage((current) =>
              savedGamesPagination.totalPages > 0
                ? Math.min(savedGamesPagination.totalPages, current + 1)
                : current + 1,
            )
          }
          onSelectSavedGame={setExpandedGameId}
          onEditSaved={handleEditSaved}
          onDeleteSaved={handleDeleteSaved}
          configKey={configKey}
          criterionLabel={criterionLabel}
          tierTitle={tierTitle}
          ruleDescription={ruleDescription}
          publicationStatusLabel={publicationStatusLabel}
          formatDate={formatDate}
        />
      </section>
    </div>
  );
}
