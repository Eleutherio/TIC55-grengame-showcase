import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Progresso.css";
import { API_URL } from "../config/api";
import PerfilProgressoCard from "../components/PerfilProgressoCard";
import CardBadgesProgresso, {
  type BadgeChallenge,
} from "../components/CardBadgesProgresso";
import TemporaryUserBadge from "../components/TemporaryUserBadge";

type Perfil = {
  first_name?: string;
  last_name?: string;
  avatar_url?: string;
  is_temporary_account?: boolean;
  temporary_expires_at?: string | null;
};

type GameProgressApi = {
  id: number;
  game: number;
  game_name?: string;
  game_category?: string;
  game_points?: number | string;
  progress_percentage?: number;
  started_at?: string;
  completed_at?: string | null;
  updated_at?: string;
};

type GameConcluido = {
  id: string;
  titulo: string;
  descricao: string;
  pontos: number;
  progresso: number;
  status: "concluido" | "pendente" | "indisponivel";
  iniciadoEm: string;
  iniciadoEmRaw?: string;
  concluidoEm: string;
  concluidoEmRaw?: string;
};

type StatsApi = {
  level?: string | number;
  xp?: number;
  xpToNext?: number | null;
};

type Stats = {
  level: string | number | null;
  xp: number;
  xpToNext: number | null;
};

type BadgeProgressTierApi = {
  tier?: unknown;
  image_url?: unknown;
};

type BadgeProgressApi = {
  badge_config_id?: unknown;
  game_id?: unknown;
  game_name?: unknown;
  criterion?: unknown;
  criterion_label?: unknown;
  value_mode?: unknown;
  current_value?: unknown;
  next_tier?: unknown;
  next_required_value?: unknown;
  progress_to_next_percentage?: unknown;
  tiers?: unknown;
};

type BadgeProgressResponse = {
  progress?: unknown;
};

type TrilhasDrawerNavigationState = {
  openBadgesDrawer: boolean;
  challengeCriterion: string;
  challengeCriterionLabel: string;
};

const ACCESS_TOKEN_KEY = "accessToken";

const PERFIL_ENDPOINT = `${API_URL}/auth/me/`;
const PROGRESSO_ENDPOINT = `${API_URL}/auth/progress/list/`;
const STATS_ENDPOINT = `${API_URL}/auth/me/stats/`;
const BADGES_ENDPOINT = `${API_URL}/gamification/badges/`;
const PLACEHOLDER = "—";

const formatData = (value?: string | number | Date) => {
  if (!value) return PLACEHOLDER;

  let parsed: Date;
  if (typeof value === "string") {
    const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnlyMatch) {
      const [, year, month, day] = dateOnlyMatch;
      parsed = new Date(Number(year), Number(month) - 1, Number(day));
    } else {
      parsed = new Date(value);
    }
  } else {
    parsed = new Date(value);
  }

  if (Number.isNaN(parsed.getTime())) return PLACEHOLDER;
  return parsed.toLocaleDateString("pt-BR");
};

const mergeNome = (perfil?: Perfil | null) => {
  if (!perfil) return PLACEHOLDER;
  const first = perfil.first_name?.trim();
  const last = perfil.last_name?.trim();
  if (!first && !last) return PLACEHOLDER;
  return [first, last].filter(Boolean).join(" ");
};

const mapProgressToGame = (
  p: GameProgressApi,
  idx: number
): GameConcluido => {
  const progresso = Number.isFinite(p.progress_percentage)
    ? Math.max(0, Math.min(100, Number(p.progress_percentage)))
    : 0;
  const pontos = Number.isFinite(Number(p.game_points))
    ? Math.max(0, Number(p.game_points))
    : 0;
  const isCompleted = p.completed_at != null;
  const descricao =
    p.game_category?.trim() ||
    (isCompleted ? "Game concluído." : "Game em andamento.");

  const iniciadoEmRaw = p.started_at ?? undefined;
  const concluidoEmRaw = p.completed_at ?? p.updated_at ?? undefined;

  return {
    id: String(p.id ?? `progress-${idx}`),
    titulo: p.game_name?.trim() || "Game sem título",
    descricao,
    pontos,
    progresso,
    status: isCompleted ? "concluido" : progresso > 0 ? "pendente" : "indisponivel",
    iniciadoEm: formatData(iniciadoEmRaw),
    iniciadoEmRaw,
    concluidoEm: isCompleted ? formatData(concluidoEmRaw) : PLACEHOLDER,
    concluidoEmRaw,
  };
};

const parseStats = (raw?: StatsApi | null): Stats | null => {
  if (!raw) return null;
  const xp = Number(raw.xp);
  if (!Number.isFinite(xp)) return null;
  const rawXpToNext = raw.xpToNext;
  const xpToNext =
    rawXpToNext === null || rawXpToNext === undefined
      ? null
      : Number(rawXpToNext);
  if (xpToNext !== null && !Number.isFinite(xpToNext)) return null;
  const rawLevel = raw.level;
  let level: string | number | null = null;
  if (typeof rawLevel === "string" && rawLevel.trim()) {
    level = rawLevel;
  } else if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
    level = rawLevel;
  }
  return { level, xp, xpToNext };
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeBadgeImageUrl = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;

  const tierAssetRegex = /tier[1-5]\.png$/i;
  const pathMatch = rawUrl.match(/\/(tier[1-5]\.png)$/i);
  if (pathMatch?.[1]) {
    return `/${pathMatch[1]}`;
  }

  if (tierAssetRegex.test(rawUrl)) {
    return rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`;
  }

  return rawUrl;
};

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const parseBadgeChallenges = (raw?: BadgeProgressResponse | null): BadgeChallenge[] => {
  if (!raw || !Array.isArray(raw.progress)) return [];

  return raw.progress
    .map((entry, index) => {
      const item = entry as BadgeProgressApi;
      const gameId = asFiniteNumber(item.game_id);
      const nextTierRaw = asFiniteNumber(item.next_tier);
      const nextRequiredRaw = asFiniteNumber(item.next_required_value);
      const currentValueRaw = asFiniteNumber(item.current_value);
      const progressRaw = asFiniteNumber(item.progress_to_next_percentage);

      if (gameId === null) return null;

      const tierList = Array.isArray(item.tiers) ? (item.tiers as BadgeProgressTierApi[]) : [];
      const tierNumbers = tierList
        .map((tier) => Math.trunc(asFiniteNumber(tier.tier) ?? 0))
        .filter((tier) => tier > 0);
      const highestTier = tierNumbers.length > 0 ? Math.max(...tierNumbers) : 5;
      const hasPendingTier = nextTierRaw !== null && nextTierRaw > 0;
      const nextTier = hasPendingTier ? Math.trunc(nextTierRaw) : highestTier;
      const rawNextTierImageUrl =
        tierList.find((tier) => Math.trunc(asFiniteNumber(tier.tier) ?? -1) === nextTier)
          ?.image_url ?? null;
      const badgeConfigId = Math.trunc(asFiniteNumber(item.badge_config_id) ?? 0);
      const isCompleted = !hasPendingTier;

      return {
        id: String(badgeConfigId > 0 ? badgeConfigId : `badge-${index}`),
        badgeConfigId,
        sourceIndex: index,
        gameId,
        gameName: asNonEmptyString(item.game_name) ?? "Game",
        criterion: asNonEmptyString(item.criterion) ?? "criterion",
        criterionLabel:
          asNonEmptyString(item.criterion_label) ??
          asNonEmptyString(item.criterion) ??
          "Critério",
        valueMode: asNonEmptyString(item.value_mode) === "percentage" ? "percentage" : "absolute",
        isCompleted,
        nextTier,
        nextRequiredValue: Math.max(0, Math.trunc(hasPendingTier ? (nextRequiredRaw ?? 0) : 0)),
        currentValue: Math.max(0, Math.trunc(currentValueRaw ?? 0)),
        progressToNextPercentage: isCompleted
          ? 100
          : clampPercentage(Math.trunc(progressRaw ?? 0)),
        nextTierImageUrl: normalizeBadgeImageUrl(asNonEmptyString(rawNextTierImageUrl)),
      } as BadgeChallenge;
    })
    .filter((item): item is BadgeChallenge => item !== null);
};

export default function Progresso() {
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [gamesConcluidos, setGamesConcluidos] = useState<GameConcluido[]>(
    []
  );
  const [badgeChallenges, setBadgeChallenges] = useState<BadgeChallenge[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [perfilError, setPerfilError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [badgesError, setBadgesError] = useState<string | null>(null);

  useEffect(() => {
    let ativo = true;
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const authHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (token) authHeaders.Authorization = `Bearer ${token}`;

    const fetchJson = async <T,>(url: string): Promise<T> => {
      const resp = await fetch(url, { headers: authHeaders });
      if (resp.status === 401 || resp.status === 403)
        throw new Error("UNAUTHORIZED");
      if (!resp.ok) throw new Error("REQUEST_FAILED");
      return (await resp.json()) as T;
    };

    const carregar = async () => {
      setIsLoading(true);
      setErro(null);
      setPerfilError(null);
      setStatsError(null);
      setBadgesError(null);
      try {
        const [perfilResp, statsResp, gamesProgressResp, badgesResp] =
          await Promise.allSettled([
            fetchJson<Perfil>(PERFIL_ENDPOINT),
            fetchJson<StatsApi>(STATS_ENDPOINT),
            fetchJson<GameProgressApi[]>(PROGRESSO_ENDPOINT),
            fetchJson<BadgeProgressResponse>(BADGES_ENDPOINT),
          ]);
        if (!ativo) return;

        const unauthorized = [
          perfilResp,
          gamesProgressResp,
          statsResp,
          badgesResp,
        ].some(
          (resp) =>
            resp.status === "rejected" &&
            (resp.reason as Error)?.message === "UNAUTHORIZED"
        );
        if (unauthorized) {
          navigate("/login", { replace: true });
          return;
        }

        if (perfilResp.status === "fulfilled") {
          setPerfil(perfilResp.value);
        } else {
          setPerfilError("Não foi possível carregar perfil/progresso.");
        }

        if (statsResp.status === "fulfilled") {
          const parsed = parseStats(statsResp.value);
          if (parsed) {
            setStats(parsed);
          } else {
            setStats(null);
            setStatsError("Não foi possivel carregar o progresso.");
          }
        } else {
          setStats(null);
          setStatsError("Não foi possivel carregar o progresso.");
        }

        if (gamesProgressResp.status === "fulfilled") {
          const lista = (gamesProgressResp.value ?? []).map(
            mapProgressToGame
          );
          const ordenado = lista.sort((a, b) => {
            if (a.status === b.status)
              return (b.concluidoEmRaw || "").localeCompare(
                a.concluidoEmRaw || ""
              );
            return a.status === "concluido" ? -1 : 1;
          });
          setGamesConcluidos(ordenado);
        } else {
          setErro("Não foi possível carregar os games.");
          setGamesConcluidos([]);
        }

        if (badgesResp.status === "fulfilled") {
          setBadgeChallenges(parseBadgeChallenges(badgesResp.value));
        } else {
          setBadgesError("Não foi possível carregar os desafios de badges.");
          setBadgeChallenges([]);
        }

      } catch (error) {
        if (!ativo) return;
        if ((error as Error).message === "UNAUTHORIZED") {
          navigate("/login", { replace: true });
          return;
        }
        setErro(
          "Não foi possível carregar seu progresso. Confirme sua autenticação."
        );
        setPerfilError("Não foi possível carregar perfil/progresso.");
        setGamesConcluidos([]);
        setBadgeChallenges([]);
        setBadgesError("Não foi possível carregar os desafios de badges.");
      } finally {
        if (ativo) setIsLoading(false);
      }
    };

    carregar();
    return () => {
      ativo = false;
    };
  }, [navigate]);

  const nomeCompleto = mergeNome(perfil);
  const fullName =
    nomeCompleto === PLACEHOLDER
      ? "Falha em receber nome de usuário"
      : nomeCompleto;
  const level = stats?.level ?? null;
  const xp = stats?.xp ?? 0;
  const xpToNext = stats?.xpToNext ?? null;
  const activeGames = gamesConcluidos.filter(
    (game) => game.progresso < 100
  ).length;
  const completedGames = gamesConcluidos.filter(
    (game) => game.progresso >= 100
  ).length;

  const handleChallengeDoubleClick = (challenge: BadgeChallenge) => {
    const state: TrilhasDrawerNavigationState = {
      openBadgesDrawer: true,
      challengeCriterion: challenge.criterion,
      challengeCriterionLabel: challenge.criterionLabel,
    };

    navigate(`/app/trilhas/${challenge.gameId}`, { state });
  };

  return (
    <div className="progressoContainer" aria-busy={isLoading} aria-live="polite">
      <header className="pageHeader">
        <h1>Meu Progresso</h1>
        {Boolean(perfil?.is_temporary_account) && <TemporaryUserBadge />}
      </header>

      <div className="cardsStack">
        <PerfilProgressoCard
          fullName={fullName}
          level={level}
          xp={xp}
          xpToNext={xpToNext}
          activeGames={activeGames}
          completedGames={completedGames}
          isLoading={isLoading}
          error={perfilError ?? statsError}
          avatarUrl={perfil?.avatar_url}
          clickable={false}
        />

        <section
          className="cardProgresso"
          aria-labelledby="titulo-games-concluidos"
        >
          <header className="cardHeader">
            <h2 id="titulo-games-concluidos">Games</h2>
            <p className="cardSubtitle" aria-live="polite">
              Acompanhe progresso, início e conclusão de cada game.
            </p>
          </header>
          <div className="tabelaWrapper" role="region" aria-live="polite">
            {gamesConcluidos.length === 0 ? (
              <div className="gamesEmptyState">
                <p className="gamesEmptyTitle">Nenhum game iniciado.</p>
                <p className="gamesEmptySubtitle">
                  Comece um game agora para acompanhar seu progresso.
                </p>
                <button
                  className="gamesEmptyButton"
                  type="button"
                  onClick={() => navigate("/app/cursos")}
                >
                  Jogar
                </button>
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th scope="col">Game</th>
                    <th scope="col">Progresso</th>
                    <th scope="col">Pontos</th>
                    <th scope="col">Iniciado em</th>
                    <th scope="col">Concluído em</th>
                  </tr>
                </thead>
                <tbody>
                  {gamesConcluidos.map((game) => (
                    <tr key={game.id}>
                      <th scope="row">{game.titulo}</th>
                      <td className="progressoCell" data-label="Progresso">
                        <div
                          className="progressoBarWrapper"
                          aria-label="Barra de progresso do game"
                        >
                          <div
                            className="progressoBar"
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={game.progresso}
                          >
                            <div
                              className="progressoFill"
                              style={{ width: `${game.progresso}%` }}
                            />
                          </div>
                          <span className="progressoValor">
                            {game.progresso}% — {game.descricao}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`pontosChip ${game.status === "indisponivel"
                            ? ""
                            : game.status === "concluido"
                              ? "chipOk"
                              : "chipPendente"
                          }`}
                        data-label="Pontos"
                      >
                        +{Number.isFinite(game.pontos) ? game.pontos : 0}
                      </td>
                      <td data-label="Iniciado em">{game.iniciadoEm}</td>
                      <td data-label="Concluído em">{game.concluidoEm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <CardBadgesProgresso
          challenges={badgeChallenges}
          errorMessage={badgesError}
          onChallengeDoubleClick={handleChallengeDoubleClick}
        />

        {erro && (
          <p className="avisoErro" role="alert">
            {erro}
          </p>
        )}
        {isLoading && (
          <div className="loading" aria-live="polite">
            Carregando progresso...
          </div>
        )}
      </div>
    </div>
  );
}

