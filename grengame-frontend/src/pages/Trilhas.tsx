import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

import controllerPng from "../assets/img/controller.png";
import quizPng from "../assets/img/quiz.png";
import bookPng from "../assets/img/abra-o-livro.png";
import playButtonPng from "../assets/img/play-button.png";
import Leadboard, { type LeaderboardEntry } from "../components/Leadboard";
import MenuBadgesTilhas from "../components/badges/MenuBadgesTilhas";

import "./Trilhas.css";
import "./Trilhas.mobile.css";
import { API_URL } from "../config/api";

type MissionType = "video" | "reading" | "quiz" | "game";

type MissionWithStatus = {
  id: number;
  title: string;
  description: string;
  mission_type: MissionType;
  icon: string;
  order: number;
  points_value: number;
  points_earned: number;
  status: "locked" | "available" | "completed";
  stars_earned: number;
  stars_total: number;
  completed_at: string | null;
};

type TrilhasLocationState = {
  openBadgesDrawer?: boolean;
  challengeCriterion?: string;
  challengeCriterionLabel?: string;
};

const MISSION_ICONS: Record<MissionType, string> = {
  video: playButtonPng,
  reading: bookPng,
  quiz: quizPng,
  game: controllerPng,
};

const FIGMA_W = 1510;
const FIGMA_H = 760;
const ELLIPSE_SIZE = 172;
const STEP_W = 16;
const STEP_H = 6;
const STEP_OFFSET = 10;
const TOOLTIP_MAX_CHARS = 210;

const ZIGZAG_COLUMNS_X = [90, 512, 930];
const ZIGZAG_START_Y = 56;
const ZIGZAG_BOTTOM_PAD = 140;
const ZIGZAG_MIN_STEP = 280;
const ZIGZAG_MAX_STEP = 390;
const SCALE_EPSILON = 0.002;
const SCALE_DECIMALS = 4;

const getZigzagStep = (count: number) => {
  const rows = Math.max(1, Math.ceil(count / 3));
  if (rows <= 1) return 0;
  const available = FIGMA_H - ZIGZAG_START_Y - ZIGZAG_BOTTOM_PAD;
  const raw = available / (rows - 1);
  return Math.max(ZIGZAG_MIN_STEP, Math.min(ZIGZAG_MAX_STEP, raw));
};

export default function Trilhas() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as TrilhasLocationState | null) ?? null;
  const shouldAutoOpenBadgesDrawer = Boolean(locationState?.openBadgesDrawer);
  const challengeCriterionFromState =
    typeof locationState?.challengeCriterion === "string"
      ? locationState.challengeCriterion
      : null;
  const challengeCriterionLabelFromState =
    typeof locationState?.challengeCriterionLabel === "string"
      ? locationState.challengeCriterionLabel
      : null;

  const [missions, setMissions] = useState<MissionWithStatus[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(true);
  const [courseName, setCourseName] = useState<string>("");
  const [leaderboardEntries, setLeaderboardEntries] = useState<
    LeaderboardEntry[]
  >([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  // ====== Scale automatico do canvas ======
  const missionsAreaRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  // garante que o userId e memorizado e nao recalcula toda hora
  const currentUserId = useMemo(() => {
    const raw = localStorage.getItem("userId");
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isNaN(parsed) ? undefined : parsed;
  }, []);

  const stepY = getZigzagStep(missions.length);
  const rows = Math.max(1, Math.ceil(missions.length / 3));
  const canvasHeight = Math.max(
    FIGMA_H,
    ZIGZAG_START_Y + (rows - 1) * stepY + ZIGZAG_BOTTOM_PAD,
  );
  const isScrollable = missions.length > 9;

  useEffect(() => {
    const el = missionsAreaRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const { width, height } = el.getBoundingClientRect();

      // folga para nao encostar nas bordas
      const pad = 12;
      const heightForScale = isScrollable ? FIGMA_H : canvasHeight;
      const s = Math.min(
        (width - pad) / FIGMA_W,
        (height - pad) / heightForScale,
      );

      // minimo para nao sumir
      const minScale = width <= 1080 ? 0.22 : 0.45;
      const clamped = Math.max(minScale, Math.min(1, s));
      const normalizedScale = Number(clamped.toFixed(SCALE_DECIMALS));
      setScale((previousScale) =>
        Math.abs(previousScale - normalizedScale) < SCALE_EPSILON
          ? previousScale
          : normalizedScale,
      );
    });

    ro.observe(el);

    return () => ro.disconnect();
  }, [canvasHeight, isScrollable]);

  useEffect(() => {
    let isMounted = true;

    const loadMissions = async () => {
      if (!gameId) return;
      setCourseName("");
      setIsLoadingMissions(true);

      try {
        const token = localStorage.getItem("accessToken");

        // Buscar dados do game
        const gameResponse = await fetch(`${API_URL}/auth/games/${gameId}/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (gameResponse.ok) {
          const gameData = await gameResponse.json();
          if (isMounted) {
            setCourseName(gameData.name || "Game");
          }
        }

        // Buscar missoes
        const response = await fetch(
          `${API_URL}/auth/games/${gameId}/trilha/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!isMounted) return;

        const resolvedCourseName =
          typeof data?.course?.name === "string" ? data.course.name : "";
        setCourseName(resolvedCourseName);

        const list: MissionWithStatus[] =
          data.missions || data.missions_with_status || [];
        const sorted = [...list].sort(
          (a, b) => (a.order ?? 0) - (b.order ?? 0),
        );
        setMissions(sorted);
      } catch (error) {
        console.error("Erro ao carregar missoes:", error);
      } finally {
        if (isMounted) {
          setIsLoadingMissions(false);
        }
      }
    };

    const loadLeaderboard = async () => {
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(
          `${API_URL}/auth/games/${gameId}/ranking/`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!isMounted) return;

        // Normaliza os dados da leaderboard
        const playersData = Array.isArray(data) ? data : [];
        const normalizedLeaderboard: LeaderboardEntry[] = playersData.map(
          (entry: any) => {
            const rawTier =
              typeof entry?.tier === "string"
                ? entry.tier
                : typeof entry?.nivel === "string"
                  ? entry.nivel
                  : "";
            const nivel = rawTier.trim();
            const userId =
              typeof entry?.userId === "number"
                ? entry.userId
                : typeof entry?.user_id === "number"
                  ? entry.user_id
                  : typeof entry?.user_id === "string"
                    ? Number(entry.user_id) || undefined
                    : undefined;
            const rawPoints =
              entry?.points ?? entry?.total_points ?? entry?.totalPoints ?? 0;
            const points =
              typeof rawPoints === "number"
                ? rawPoints
                : Number(rawPoints) || 0;

            return {
              ...entry,
              userId,
              nivel: nivel || undefined,
              tier: nivel || undefined,
              points,
            } as LeaderboardEntry;
          },
        );
        setLeaderboardEntries(normalizedLeaderboard);
      } catch (error) {
        if (!isMounted) return;
        const details =
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : JSON.stringify(error);
        console.error("Erro ao carregar leaderboard:", details);
        setLeaderboardError(details);
      } finally {
        if (isMounted) setLeaderboardLoading(false);
      }
    };

    loadMissions();
    loadLeaderboard();

    return () => {
      isMounted = false;
    };
  }, [gameId, API_URL]);

  useEffect(() => {
    const root = document.documentElement;
    const previousScrollbarGutter = root.style.scrollbarGutter;
    const previousOverflowX = root.style.overflowX;

    root.style.scrollbarGutter = "stable both-edges";
    root.style.overflowX = "clip";

    return () => {
      root.style.scrollbarGutter = previousScrollbarGutter;
      root.style.overflowX = previousOverflowX;
    };
  }, []);

  const handleMissionClick = (mission: MissionWithStatus) => {
    if (mission.status === "available" || mission.status === "completed") {
      navigate(`/app/missao/${mission.id}`);
    }
  };

  const hasAvailableMission = (): boolean =>
    missions.some((m) => m.status === "available");

  const handlePlayNext = () => {
    const nextMission = missions.find((m) => m.status === "available");
    if (nextMission) navigate(`/app/missao/${nextMission.id}`);
  };

  /**
   * Posicoes:
   * - 3 colunas (esquerda, centro, direita)
   * - linhas alternam a ordem para manter o zigzag
   * - 4o fica abaixo do 2o, 8o abaixo do 4o, etc.
   */
  const positionsPx = useMemo(() => {
    return missions.map((_mission, idx) => {
      const row = Math.floor(idx / 3);
      const offset = idx % 3;
      const order = row % 2 === 0 ? [0, 1, 2] : [2, 1, 0];
      const left = ZIGZAG_COLUMNS_X[order[offset]] ?? ZIGZAG_COLUMNS_X[1];
      const top = ZIGZAG_START_Y + row * stepY;
      return { left, top };
    });
  }, [missions, stepY]);

  const stepMarkers = useMemo(() => {
    const centers = positionsPx.map((pos) => ({
      x: pos.left + ELLIPSE_SIZE / 2,
      y: pos.top + ELLIPSE_SIZE / 2,
    }));

    const markers: Array<{
      x: number;
      y: number;
      angle: number;
      alt: boolean;
    }> = [];

    for (let i = 0; i < centers.length - 1; i += 1) {
      const a = centers[i];
      const b = centers[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 60) continue;

      const steps = Math.max(4, Math.floor(dist / 90));
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      const nx = -dy / dist;
      const ny = dx / dist;

      for (let s = 1; s <= steps; s += 1) {
        const t = s / (steps + 1);
        const offset = (s % 2 === 0 ? 1 : -1) * STEP_OFFSET;
        markers.push({
          x: a.x + dx * t + nx * offset,
          y: a.y + dy * t + ny * offset,
          angle,
          alt: s % 2 === 0,
        });
      }
    }

    return markers;
  }, [positionsPx]);

  const journeyTitle = courseName
    ? `Sua jornada em: ${courseName}`
    : "Sua jornada em: ...";

  return (
    <div className="trilhas-wrapper">
      {/* Titulo central */}
      <div className="trilhas-title-wrap">
        <div className="trilhas-title-card">
          <h1 className="trilhas-title">{journeyTitle}</h1>
        </div>
      </div>

      {/* Leaderboard */}
      <section
        className="leaderboard-panel"
        aria-label="Leaderboard dos jogadores desta semana"
      >
        <Leadboard
          courseName="Top jogadores da semana"
          entries={leaderboardEntries}
          isLoading={leaderboardLoading}
          errorMessage={leaderboardError}
          currentUserId={currentUserId}
          trackedGameId={Number(gameId)}
          emptyMessage="Nenhum jogador no ranking desta trilha ainda."
        />
        <MenuBadgesTilhas
          gameId={gameId}
          autoOpen={shouldAutoOpenBadgesDrawer}
          focusCriterion={challengeCriterionFromState}
          focusCriterionLabel={challengeCriterionLabelFromState}
        />
      </section>

      {/* Missoes */}
      <div
        className={`trilhas-missions-area${
          isScrollable ? " trilhas-missions-area--scroll" : ""
        }`}
        ref={missionsAreaRef}
      >
        {missions.length > 0 ? (
          <div
            className="trilha-stage-wrap"
            style={{
              width: `${FIGMA_W * scale}px`,
              height: `${canvasHeight * scale}px`,
            }}
          >
            <div
              className="trilha-stage"
              style={{
                width: FIGMA_W,
                height: canvasHeight,
                transform: `scale(${scale})`,
              }}
            >
              {/* Linha vertical (atras) */}
              <svg
                className="trilha-lines"
                viewBox={`0 0 ${FIGMA_W} ${canvasHeight}`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <g className="trilha-steps">
                  {stepMarkers.map((marker, index) => (
                    <rect
                      key={`step-${index}`}
                      className={`trilha-step${
                        marker.alt ? " trilha-step--alt" : ""
                      }`}
                      x={marker.x - STEP_W / 2}
                      y={marker.y - STEP_H / 2}
                      width={STEP_W}
                      height={STEP_H}
                      rx={STEP_H / 2}
                      transform={`rotate(${marker.angle}, ${marker.x}, ${marker.y})`}
                    />
                  ))}
                </g>
              </svg>

              {missions.map((mission, index) => {
                const iconSrc = MISSION_ICONS[mission.mission_type];
                const pos = positionsPx[index];
                const shortDescription = mission.description?.trim();
                const displayDescription =
                  shortDescription &&
                  shortDescription.length > TOOLTIP_MAX_CHARS
                    ? `${shortDescription
                        .slice(0, TOOLTIP_MAX_CHARS - 3)
                        .trimEnd()}...`
                    : shortDescription;
                const shouldFlipTooltip = pos.top < 80;
                const tooltipShiftClass =
                  pos.left === ZIGZAG_COLUMNS_X[0]
                    ? " trilha-tooltip--shift-right"
                    : pos.left === ZIGZAG_COLUMNS_X[2]
                      ? " trilha-tooltip--shift-left"
                      : "";

                const isLocked = mission.status === "locked";
                const isAvailable = mission.status === "available";
                const isCompleted = mission.status === "completed";
                const isCurrent = isAvailable;

                const totalStars = 3;
                const earned = Math.max(
                  0,
                  Math.min(totalStars, mission.stars_earned || 0),
                );

                // classes especificas para ajuste fino via CSS (se precisar)
                const extraClass =
                  (mission.mission_type === "quiz"
                    ? " trilha-ellipse--quiz"
                    : "") +
                  (mission.mission_type === "video"
                    ? " trilha-ellipse--video"
                    : "");

                return (
                  <div
                    key={mission.id}
                    className={`trilha-ellipse${extraClass}`}
                    style={{ left: pos.left, top: pos.top }}
                    onClick={() => handleMissionClick(mission)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ")
                        handleMissionClick(mission);
                    }}
                    aria-label={`${mission.title} - ${
                      isLocked
                        ? "Bloqueada"
                        : isCompleted
                          ? "Concluida"
                          : "Disponivel"
                    }`}
                    aria-describedby={
                      displayDescription
                        ? `mission-tooltip-${mission.id}`
                        : undefined
                    }
                  >
                    <div
                      className={`ellipse-badge ${
                        isCurrent ? " ellipse-badge--current" : ""
                      }${isCompleted ? " ellipse-badge--completed" : ""}`}
                    >
                      <img
                        src={iconSrc}
                        alt=""
                        className={`ellipse-${mission.mission_type}-img`}
                        style={{
                          opacity: isLocked ? 0.45 : isCompleted ? 0.72 : 1,
                          filter: isLocked
                            ? "grayscale(100%)"
                            : isCompleted
                              ? "saturate(0.8)"
                              : "none",
                        }}
                      />

                      {isCompleted && (
                        <span
                          className="ellipse-completed-overlay"
                          aria-hidden="true"
                        >
                          <span className="ellipse-completed-check">
                            {"\u2713"}
                          </span>
                        </span>
                      )}
                      {isLocked && (
                        <span className="ellipse-lock">{"\uD83D\uDD12"}</span>
                      )}
                    </div>

                    <div className="mission-stars">
                      {Array.from({ length: totalStars }).map((_, i) => (
                        <span
                          key={i}
                          style={{ opacity: i < earned ? 1 : 0.25 }}
                        >
                          {"\u2605"}
                        </span>
                      ))}
                    </div>

                    {displayDescription && (
                      <div
                        id={`mission-tooltip-${mission.id}`}
                        className={`trilha-tooltip${
                          shouldFlipTooltip ? " trilha-tooltip--bottom" : ""
                        }${tooltipShiftClass}`}
                        role="tooltip"
                      >
                        <span className="trilha-tooltip__label">
                          Descricao curta
                        </span>
                        <span className="trilha-tooltip__text">
                          {displayDescription}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div
            className="missions-status-card"
            role="status"
            aria-live="polite"
          >
            <p className="missions-status-title">
              Aguarde, estamos carregando as missões desse game...
            </p>
            <p className="missions-status-subtitle">
              {isLoadingMissions
                ? "Isso pode levar alguns segundos."
                : "Se persistir, atualize a pagina ou volte para a lista de games e tente novamente."}
            </p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="trilhas-footer">
        <button
          className="trilhas-footer-btn trilhas-footer-btn--back"
          onClick={() => navigate("/app/cursos")}
        >
          {"\u2190 Voltar"}
        </button>

        <button
          className="trilhas-footer-btn trilhas-footer-btn--play"
          onClick={handlePlayNext}
          disabled={!hasAvailableMission()}
        >
          {"Jogar \u25B6"}
        </button>
      </div>
    </div>
  );
}
