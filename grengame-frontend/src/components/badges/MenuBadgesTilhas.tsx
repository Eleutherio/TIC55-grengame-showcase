import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../../config/api";

import "./MenuBadgesTilhas.css";

const MOBILE_DRAWER_BREAKPOINT = 1080;

type Props = {
  gameId?: string;
  autoOpen?: boolean;
  focusCriterion?: string | null;
  focusCriterionLabel?: string | null;
};

type TrailBadgeApiItem = {
  game_id?: unknown;
  game_name?: unknown;
  criterion?: unknown;
  criterion_label?: unknown;
  value_mode?: unknown;
  next_tier?: unknown;
  next_required_value?: unknown;
  progress_to_next_percentage?: unknown;
};

type BadgeCriterion = "course_points" | "perfect_missions" | "active_days";
type BadgeTierNumber = 1 | 2 | 3 | 4 | 5;

type BadgeChallengeItem = {
  gameId: number;
  gameName: string;
  criterion: string;
  criterionLabel: string;
  valueMode: "percentage" | "absolute";
  nextTier: number | null;
  nextRequiredValue: number | null;
  progressToNextPercentage: number;
  nextTierImageUrl: string | null;
  nextTierBadgeName: string | null;
};

type ParsedTrailChallenges = {
  all: BadgeChallengeItem[];
  pending: BadgeChallengeItem[];
};

const GAMIFIED_TITLES: Record<BadgeCriterion, Record<BadgeTierNumber, string>> = {
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

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const clampPercentage = (value: number) => Math.max(0, Math.min(100, value));

const isBadgeCriterion = (value: string): value is BadgeCriterion =>
  value === "course_points" || value === "perfect_missions" || value === "active_days";

const asBadgeTierNumber = (value: number | null): BadgeTierNumber | null => {
  if (value === null) return null;
  if (value < 1 || value > 5) return null;
  return value as BadgeTierNumber;
};

const getTierBadgeName = (criterion: string, nextTier: number | null): string | null => {
  const tier = asBadgeTierNumber(nextTier);
  if (tier === null) return null;
  if (!isBadgeCriterion(criterion)) return `Tier ${tier}`;
  return GAMIFIED_TITLES[criterion][tier];
};

const getTierImageSrc = (nextTier: number | null): string | null => {
  const tier = asBadgeTierNumber(nextTier);
  if (tier === null) return null;
  return `/tier${tier}.png`;
};

const getChallengeInstruction = (
  criterion: string,
  nextRequiredValue: number | null,
  valueMode: "percentage" | "absolute",
): string => {
  const required = Math.max(0, nextRequiredValue ?? 0);

  if (criterion === "course_points") {
    if (valueMode === "percentage") {
      return `Para progredir, conclua missões deste game e alcance ${required}% dos pontos totais.`;
    }
    return `Para progredir, conclua missões deste game e alcance ${required} ponto(s).`;
  }

  if (criterion === "perfect_missions") {
    if (valueMode === "percentage") {
      return `Para progredir, conclua missões com pontuação máxima até atingir ${required}% das missões do game.`;
    }
    return `Para progredir, conclua ${required} missão(ões) com pontuação máxima.`;
  }

  if (criterion === "active_days") {
    return `Para progredir, conclua missões em ${required} dia(s) diferentes neste game.`;
  }

  return "Para progredir, continue concluindo missões neste game.";
};

const sortPendingChallenges = (items: BadgeChallengeItem[]): BadgeChallengeItem[] =>
  [...items].sort((a, b) => {
    if (b.progressToNextPercentage !== a.progressToNextPercentage) {
      return b.progressToNextPercentage - a.progressToNextPercentage;
    }
    const aRequired = a.nextRequiredValue ?? Number.MAX_SAFE_INTEGER;
    const bRequired = b.nextRequiredValue ?? Number.MAX_SAFE_INTEGER;
    return aRequired - bRequired;
  });

const normalizeComparableText = (value: string | null | undefined) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";

const matchesChallengeByFocus = (
  item: BadgeChallengeItem,
  focusCriterion: string | null | undefined,
  focusCriterionLabel: string | null | undefined,
) => {
  const normalizedFocusCriterion = normalizeComparableText(focusCriterion);
  const normalizedFocusCriterionLabel = normalizeComparableText(focusCriterionLabel);
  const normalizedItemCriterion = normalizeComparableText(item.criterion);
  const normalizedItemCriterionLabel = normalizeComparableText(item.criterionLabel);

  if (normalizedFocusCriterion && normalizedItemCriterion === normalizedFocusCriterion) {
    return true;
  }

  if (
    normalizedFocusCriterionLabel &&
    normalizedItemCriterionLabel === normalizedFocusCriterionLabel
  ) {
    return true;
  }

  return false;
};

const parseTrailBadgeChallenges = (
  raw: unknown,
  selectedGameId: number | null,
): ParsedTrailChallenges => {
  if (!raw || typeof raw !== "object") {
    return { all: [], pending: [] };
  }

  const parsed = raw as { badges?: unknown };
  const list = Array.isArray(parsed.badges) ? parsed.badges : [];

  const allChallenges = list
    .map((entry) => {
      const item = entry as TrailBadgeApiItem;
      const parsedGameId = asFiniteNumber(item.game_id);
      if (parsedGameId === null) return null;
      if (selectedGameId !== null && parsedGameId !== selectedGameId) return null;

      const nextTierValue = asFiniteNumber(item.next_tier);
      const nextTier =
        nextTierValue === null || nextTierValue <= 0 ? null : Math.trunc(nextTierValue);

      const criterion = asString(item.criterion) ?? "criterion";
      const criterionLabel = asString(item.criterion_label) ?? criterion;
      const gameName = asString(item.game_name) ?? "Game";
      const valueMode = asString(item.value_mode) === "percentage" ? "percentage" : "absolute";

      return {
        gameId: parsedGameId,
        gameName,
        criterion,
        criterionLabel,
        valueMode,
        nextTier,
        nextRequiredValue: asFiniteNumber(item.next_required_value),
        progressToNextPercentage: clampPercentage(
          asFiniteNumber(item.progress_to_next_percentage) ?? 0,
        ),
        nextTierImageUrl: getTierImageSrc(nextTier),
        nextTierBadgeName: getTierBadgeName(criterion, nextTier),
      } as BadgeChallengeItem;
    })
    .filter((item): item is BadgeChallengeItem => item !== null);

  const pendingChallenges = sortPendingChallenges(
    allChallenges.filter((item) => item.nextTier !== null),
  );

  return {
    all: allChallenges,
    pending: pendingChallenges,
  };
};

export default function MenuBadgesTilhas({
  gameId,
  autoOpen = false,
  focusCriterion = null,
  focusCriterionLabel = null,
}: Props) {
  const navigate = useNavigate();

  const selectedGameId = useMemo(() => {
    if (!gameId) return null;
    const parsed = Number(gameId);
    return Number.isFinite(parsed) ? parsed : null;
  }, [gameId]);

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allChallenges, setAllChallenges] = useState<BadgeChallengeItem[]>([]);
  const [challenges, setChallenges] = useState<BadgeChallengeItem[]>([]);
  const [hasAvailableChallenges, setHasAvailableChallenges] = useState(false);
  const [hasConfiguredChallenges, setHasConfiguredChallenges] = useState(false);
  const [drawerTopOffset, setDrawerTopOffset] = useState(0);

  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const hasAutoOpenedRef = useRef(false);
  const hasFocusedRequestedChallengeRef = useRef(false);

  const drawerId = useMemo(
    () =>
      selectedGameId === null
        ? "menu-badges-tilhas-drawer"
        : `menu-badges-tilhas-drawer-${selectedGameId}`,
    [selectedGameId],
  );
  const drawerTitleId = `${drawerId}-title`;
  const cardTitleId = `${drawerId}-card-title`;

  const loadChallenges = useCallback(
    async (signal?: AbortSignal) => {
      if (!gameId || selectedGameId === null) {
        setAllChallenges([]);
        setChallenges([]);
        setHasAvailableChallenges(false);
        setHasConfiguredChallenges(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(
          `${API_URL}/gamification/badges/available/?game_id=${encodeURIComponent(gameId)}`,
          {
            signal,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );

        if (response.status === 401 || response.status === 403) {
          navigate("/login", { replace: true });
          return;
        }

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const payload = await response.json();
        const parsedChallenges = parseTrailBadgeChallenges(payload, selectedGameId);

        if (signal?.aborted) return;
        setAllChallenges(parsedChallenges.all);
        setHasConfiguredChallenges(parsedChallenges.all.length > 0);
        setHasAvailableChallenges(parsedChallenges.pending.length > 0);
        setChallenges(parsedChallenges.pending);
      } catch (loadError) {
        if (
          loadError &&
          typeof loadError === "object" &&
          "name" in loadError &&
          (loadError as { name?: string }).name === "AbortError"
        ) {
          return;
        }

        const message =
          loadError instanceof Error ? loadError.message : "Não foi possível carregar desafios.";

        if (signal?.aborted) return;
        setError(message);
        setAllChallenges([]);
        setChallenges([]);
        setHasAvailableChallenges(false);
        setHasConfiguredChallenges(false);
      } finally {
        if (!signal?.aborted) {
          setIsLoading(false);
        }
      }
    },
    [gameId, navigate, selectedGameId],
  );

  useEffect(() => {
    setIsOpen(false);
    hasAutoOpenedRef.current = false;
    hasFocusedRequestedChallengeRef.current = false;
    const controller = new AbortController();
    void loadChallenges(controller.signal);
    return () => controller.abort();
  }, [loadChallenges]);

  useEffect(() => {
    hasFocusedRequestedChallengeRef.current = false;
  }, [focusCriterion, focusCriterionLabel]);

  useEffect(() => {
    if (!isOpen) return undefined;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
        return;
      }

      if (event.key !== "Tab") return;
      const drawer = drawerRef.current;
      if (!drawer) return;

      const focusables = drawer.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );

      if (focusables.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey) {
        if (active === first || !drawer.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }

      if (active === last || !drawer.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      restoreFocusRef.current?.focus();
      restoreFocusRef.current = null;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setDrawerTopOffset(0);
      return undefined;
    }

    const updateDrawerTopOffset = () => {
      if (window.innerWidth > MOBILE_DRAWER_BREAKPOINT) {
        setDrawerTopOffset(0);
        return;
      }

      const mobileTopbar = document.querySelector<HTMLElement>('[data-mobile-topbar="true"]');
      if (!mobileTopbar) {
        setDrawerTopOffset(0);
        return;
      }

      const { bottom } = mobileTopbar.getBoundingClientRect();
      setDrawerTopOffset(Math.max(0, Math.round(bottom)));
    };

    updateDrawerTopOffset();

    window.addEventListener("resize", updateDrawerTopOffset);
    window.addEventListener("scroll", updateDrawerTopOffset, { passive: true });

    return () => {
      window.removeEventListener("resize", updateDrawerTopOffset);
      window.removeEventListener("scroll", updateDrawerTopOffset);
    };
  }, [isOpen]);

  const handleOpen = () => {
    const canOpenDrawer = hasConfiguredChallenges || Boolean(error);
    if (!canOpenDrawer) return;
    setIsOpen(true);
    if (error) void loadChallenges();
  };

  const hasCompletedAllChallenges = hasConfiguredChallenges && !hasAvailableChallenges;
  const toggleState = hasCompletedAllChallenges ? "completed" : "available";
  const toggleLabel = hasCompletedAllChallenges
    ? "Ver desafios"
    : "★ Desafios disponíveis! ★";
  const canOpenDrawer = hasConfiguredChallenges || Boolean(error);
  const drawerSubtitle = hasCompletedAllChallenges
    ? "Todos os desafios desta trilha já foram concluídos."
    : "Acompanhe os desafios disponíveis desta trilha.";
  const completedChallenges = useMemo(
    () => allChallenges.filter((item) => item.nextTier === null),
    [allChallenges],
  );
  const showCompletedChallenges = hasCompletedAllChallenges && completedChallenges.length > 0;
  const defaultVisibleChallenges = showCompletedChallenges ? completedChallenges : challenges;
  const shouldShowAllToMatchFocus =
    Boolean(focusCriterion || focusCriterionLabel) &&
    allChallenges.some((item) =>
      matchesChallengeByFocus(item, focusCriterion, focusCriterionLabel),
    ) &&
    !defaultVisibleChallenges.some((item) =>
      matchesChallengeByFocus(item, focusCriterion, focusCriterionLabel),
    );
  const visibleChallenges = shouldShowAllToMatchFocus
    ? allChallenges
    : defaultVisibleChallenges;
  const drawerStyle =
    drawerTopOffset > 0
      ? {
          top: `${drawerTopOffset}px`,
          height: `calc(100dvh - ${drawerTopOffset}px)`,
        }
      : undefined;
  const backdropStyle = drawerTopOffset > 0 ? { top: `${drawerTopOffset}px` } : undefined;

  useEffect(() => {
    if (!autoOpen || hasAutoOpenedRef.current) return;
    if (isLoading || !canOpenDrawer) return;
    setIsOpen(true);
    hasAutoOpenedRef.current = true;
  }, [autoOpen, canOpenDrawer, isLoading]);

  useEffect(() => {
    if (!isOpen || hasFocusedRequestedChallengeRef.current) return;
    if (!focusCriterion && !focusCriterionLabel) return;
    if (visibleChallenges.length === 0) return;

    const drawer = drawerRef.current;
    if (!drawer) return;

    const challengeNodes = Array.from(
      drawer.querySelectorAll<HTMLElement>(".badgesDesafioItem"),
    );

    const targetNode = challengeNodes.find((node) => {
      const criterion = node.dataset.criterion ?? "";
      const criterionLabel = node.dataset.criterionLabel ?? "";
      return (
        normalizeComparableText(criterion) === normalizeComparableText(focusCriterion) ||
        normalizeComparableText(criterionLabel) ===
          normalizeComparableText(focusCriterionLabel)
      );
    });

    if (!targetNode) return;

    targetNode.classList.add("is-target");
    targetNode.scrollIntoView({ block: "center", behavior: "smooth" });
    targetNode.focus({ preventScroll: true });
    hasFocusedRequestedChallengeRef.current = true;
  }, [focusCriterion, focusCriterionLabel, isOpen, visibleChallenges]);

  if (!gameId || selectedGameId === null) return null;
  if (!isLoading && !hasConfiguredChallenges && !error) return null;

  return (
    <>
      <button
        type="button"
        className={`menuBadgesTilhasToggle is-${toggleState}`}
        aria-expanded={isOpen}
        aria-controls={drawerId}
        aria-disabled={!canOpenDrawer}
        disabled={!canOpenDrawer}
        onClick={handleOpen}
      >
        <span className="menuBadgesTilhasToggleText">{toggleLabel}</span>
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="menuBadgesTilhasBackdrop"
            style={backdropStyle}
            aria-label="Fechar painel de desafios"
            onClick={() => setIsOpen(false)}
          />

          <aside
            id={drawerId}
            ref={drawerRef}
            className="menuBadgesTilhasDrawer"
            style={drawerStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby={drawerTitleId}
          >
            <header className="menuBadgesTilhasDrawerHeader">
              <div className="menuBadgesTilhasDrawerHeaderText">
                <h2 id={drawerTitleId}>Desafios da trilha</h2>
                <p className="menuBadgesTilhasDrawerHeaderSubtitle">
                  Realize os desafios e conquiste suas badges!
                </p>
              </div>
              <button
                type="button"
                ref={closeButtonRef}
                className="menuBadgesTilhasDrawerClose"
                aria-label="Fechar desafios"
                onClick={() => setIsOpen(false)}
              >
                ×
              </button>
            </header>

            <div className="menuBadgesTilhasDrawerBody">
              <section className="menuBadgesTilhasCard" aria-labelledby={cardTitleId}>
                <header className="menuBadgesTilhasCardHeader">
                  <h2 id={cardTitleId}>Desafios de Badges</h2>
                  <p className="menuBadgesTilhasCardSubtitle" aria-live="polite">
                    {drawerSubtitle}
                  </p>
                </header>

                <div className="badgesDesafiosWrapper" role="region" aria-live="polite">
                  {isLoading ? (
                    <p className="badgesDesafiosFeedback">Carregando desafios...</p>
                  ) : error ? (
                    <p className="badgesDesafiosFeedback badgesDesafiosFeedbackError" role="alert">
                      {error}
                    </p>
                  ) : visibleChallenges.length === 0 ? (
                    <p className="badgesDesafiosFeedback">
                      {hasConfiguredChallenges
                        ? "Todos os desafios desta trilha foram concluídos."
                        : "Sem desafios disponíveis nesta trilha."}
                    </p>
                  ) : (
                    <>
                      {showCompletedChallenges && (
                        <p className="badgesDesafiosFeedback badgesDesafiosFeedbackMuted">
                          Todos os desafios desta trilha foram concluídos.
                        </p>
                      )}
                      <ul className="badgesDesafiosList">
                        {visibleChallenges.map((item) => {
                          const isCompletedItem = item.nextTier === null;
                          const nextTierLabel = isCompletedItem
                            ? "Tier 5"
                            : item.nextTier
                              ? `Tier ${item.nextTier}`
                              : "Tier";
                          const nextBadgeName = isCompletedItem
                            ? getTierBadgeName(item.criterion, 5) ?? "Desafio concluído"
                            : item.nextTierBadgeName ?? nextTierLabel;
                          const previewImageUrl = isCompletedItem
                            ? "/tier5.png"
                            : item.nextTierImageUrl;
                          const challengeText = isCompletedItem
                            ? "Você já concluiu este desafio nesta trilha."
                            : getChallengeInstruction(
                                item.criterion,
                                item.nextRequiredValue,
                                item.valueMode,
                              );

                          return (
                            <li
                              key={`${item.gameId}-${item.criterion}-${item.nextTier ?? "completed"}`}
                              className={`badgesDesafioItem ${isCompletedItem ? "is-completed" : ""}`}
                              data-criterion={item.criterion}
                              data-criterion-label={item.criterionLabel}
                              tabIndex={-1}
                            >
                              <div className="badgesDesafioTop">
                                <div className="badgesDesafioMain">
                                  <p className="badgesDesafioGame">Game: {item.gameName}</p>
                                  <p className="badgesDesafioCriterion">
                                    Desafio: {item.criterionLabel}
                                  </p>
                                </div>
                              </div>

                              <div className="badgesDesafioProgressRow">
                                <div
                                  className="badgesDesafioBar"
                                  role="progressbar"
                                  aria-valuemin={0}
                                  aria-valuemax={100}
                                  aria-valuenow={
                                    isCompletedItem ? 100 : item.progressToNextPercentage
                                  }
                                  aria-label={`Progresso da badge ${item.criterionLabel} em ${item.gameName}`}
                                >
                                  <div
                                    className="badgesDesafioBarFill"
                                    style={{
                                      width: `${isCompletedItem ? 100 : item.progressToNextPercentage}%`,
                                    }}
                                  />
                                </div>
                                {previewImageUrl && (
                                  <div className="badgesDesafioUnlockPreview">
                                    <img
                                      src={previewImageUrl}
                                      alt={nextBadgeName}
                                      loading="lazy"
                                      className="badgesDesafioUnlockImage"
                                    />
                                    <span className="badgesDesafioUnlockName">{nextBadgeName}</span>
                                    <span className="badgesDesafioUnlockTier">{nextTierLabel}</span>
                                  </div>
                                )}
                              </div>
                              <p className="badgesDesafioText">{challengeText}</p>
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  )}
                </div>
              </section>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
