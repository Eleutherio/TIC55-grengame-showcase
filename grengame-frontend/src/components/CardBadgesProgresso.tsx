import { useEffect, useMemo, useState, type KeyboardEvent } from "react";

export type BadgeChallenge = {
  id: string;
  badgeConfigId: number;
  sourceIndex: number;
  gameId: number;
  gameName: string;
  criterion: string;
  criterionLabel: string;
  valueMode: "percentage" | "absolute";
  isCompleted: boolean;
  nextTier: number;
  nextRequiredValue: number;
  currentValue: number;
  progressToNextPercentage: number;
  nextTierImageUrl: string | null;
};

type BadgeChallengeGameFilter = {
  id: string;
  label: string;
};

type BadgeChallengeStatusFilter = "all" | "pending" | "completed";
type BadgeChallengeSortMode = "completed_last" | "tier_progress" | "latest";

type CardBadgesProgressoProps = {
  challenges: BadgeChallenge[];
  errorMessage?: string | null;
  onChallengeDoubleClick?: (challenge: BadgeChallenge) => void;
};

const getChallengeInstruction = (challenge: BadgeChallenge) => {
  if (challenge.isCompleted) {
    return "Desafio concluído neste game.";
  }

  if (challenge.criterion === "course_points") {
    if (challenge.valueMode === "percentage") {
      return `Conclua missões deste game e alcance ${challenge.nextRequiredValue}% dos pontos totais.`;
    }
    return `Conclua missões deste game até alcançar ${challenge.nextRequiredValue} ponto(s).`;
  }

  if (challenge.criterion === "perfect_missions") {
    if (challenge.valueMode === "percentage") {
      return `Conclua missões com pontuação máxima até atingir ${challenge.nextRequiredValue}% das missões do game.`;
    }
    return `Conclua ${challenge.nextRequiredValue} missão(ões) com pontuação máxima.`;
  }

  if (challenge.criterion === "active_days") {
    return `Conclua missões em ${challenge.nextRequiredValue} dia(s) diferentes neste game.`;
  }

  return "Continue concluindo missões neste game para avançar.";
};

export default function CardBadgesProgresso({
  challenges,
  errorMessage,
  onChallengeDoubleClick,
}: CardBadgesProgressoProps) {
  const [selectedGameFilter, setSelectedGameFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] =
    useState<BadgeChallengeStatusFilter>("all");
  const [sortMode, setSortMode] =
    useState<BadgeChallengeSortMode>("completed_last");

  const badgeChallengeGames = useMemo<BadgeChallengeGameFilter[]>(() => {
    const uniqueMap = new Map<string, string>();
    challenges.forEach((challenge) => {
      const key = String(challenge.gameId);
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, challenge.gameName);
      }
    });

    return Array.from(uniqueMap.entries())
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [challenges]);

  const visibleBadgeChallenges = useMemo(() => {
    const filteredByGame =
      selectedGameFilter === "all"
        ? challenges
        : challenges.filter(
            (challenge) => String(challenge.gameId) === selectedGameFilter,
          );
    const filteredByStatus = filteredByGame.filter((challenge) => {
      if (statusFilter === "pending") return !challenge.isCompleted;
      if (statusFilter === "completed") return challenge.isCompleted;
      return true;
    });

    const ordered = [...filteredByStatus];

    // Mantém desafios pendentes no topo apenas quando status está em "Todos".
    const compareCompletedLast = (a: BadgeChallenge, b: BadgeChallenge) => {
      if (statusFilter !== "all") return 0;
      if (a.isCompleted !== b.isCompleted) {
        return a.isCompleted ? 1 : -1;
      }
      return 0;
    };

    if (sortMode === "tier_progress") {
      ordered.sort((a, b) => {
        const completedOrder = compareCompletedLast(a, b);
        if (completedOrder !== 0) return completedOrder;
        if (b.nextTier !== a.nextTier) return b.nextTier - a.nextTier;
        if (b.progressToNextPercentage !== a.progressToNextPercentage) {
          return b.progressToNextPercentage - a.progressToNextPercentage;
        }
        return a.gameName.localeCompare(b.gameName, "pt-BR");
      });
      return ordered;
    }

    if (sortMode === "latest") {
      ordered.sort((a, b) => {
        const completedOrder = compareCompletedLast(a, b);
        if (completedOrder !== 0) return completedOrder;
        if (b.badgeConfigId !== a.badgeConfigId) {
          return b.badgeConfigId - a.badgeConfigId;
        }
        return b.sourceIndex - a.sourceIndex;
      });
      return ordered;
    }

    ordered.sort((a, b) => {
      const completedOrder = compareCompletedLast(a, b);
      if (completedOrder !== 0) return completedOrder;
      if (a.gameName !== b.gameName) {
        return a.gameName.localeCompare(b.gameName, "pt-BR");
      }
      return a.criterionLabel.localeCompare(b.criterionLabel, "pt-BR");
    });

    return ordered;
  }, [challenges, selectedGameFilter, sortMode, statusFilter]);

  const pendingBadgeChallenges = useMemo(
    () => visibleBadgeChallenges.filter((challenge) => !challenge.isCompleted),
    [visibleBadgeChallenges],
  );
  const completedBadgeChallenges = useMemo(
    () => visibleBadgeChallenges.filter((challenge) => challenge.isCompleted),
    [visibleBadgeChallenges],
  );
  const emptyMessage = useMemo(() => {
    if (statusFilter === "completed") {
      return "Nenhum desafio concluído para os filtros selecionados.";
    }
    if (statusFilter === "pending") {
      return "Nenhum desafio pendente para os filtros selecionados.";
    }
    return "Nenhum desafio encontrado para os filtros selecionados.";
  }, [statusFilter]);

  const isChallengeInteractionEnabled =
    typeof onChallengeDoubleClick === "function";

  const handleChallengeDoubleClick = (challenge: BadgeChallenge) => {
    if (!onChallengeDoubleClick) return;
    onChallengeDoubleClick(challenge);
  };

  const handleChallengeKeyDown = (
    event: KeyboardEvent<HTMLLIElement>,
    challenge: BadgeChallenge,
  ) => {
    if (!onChallengeDoubleClick) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onChallengeDoubleClick(challenge);
  };

  useEffect(() => {
    if (selectedGameFilter === "all") return;
    const hasSelectedGame = badgeChallengeGames.some(
      (game) => game.id === selectedGameFilter,
    );
    if (!hasSelectedGame) {
      setSelectedGameFilter("all");
    }
  }, [badgeChallengeGames, selectedGameFilter]);

  return (
    <section
      className="cardProgresso cardDesafiosPendentes"
      aria-labelledby="titulo-desafios-badges"
    >
      <header className="cardHeader">
        <h2 id="titulo-desafios-badges">Visão geral de desafios</h2>
        <p className="cardSubtitle" aria-live="polite">
          Acompanhe seus desafios e conquiste badges únicas em cada game.
        </p>
        <div className="desafiosBadgesFilters">
          <div className="desafiosBadgesFilterGroup">
            <label htmlFor="filtro-game-desafios">Game</label>
            <select
              id="filtro-game-desafios"
              value={selectedGameFilter}
              onChange={(event) => setSelectedGameFilter(event.target.value)}
            >
              <option value="all">Todos os games com desafios</option>
              {badgeChallengeGames.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.label}
                </option>
              ))}
            </select>
          </div>

          <div className="desafiosBadgesFilterGroup">
            <label htmlFor="filtro-status-desafios">Status</label>
            <select
              id="filtro-status-desafios"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as BadgeChallengeStatusFilter)
              }
            >
              <option value="all">Todos</option>
              <option value="pending">Pendentes</option>
              <option value="completed">Concluídos</option>
            </select>
          </div>

          <div className="desafiosBadgesFilterGroup">
            <label htmlFor="filtro-ordem-desafios">Ordenar por</label>
            <select
              id="filtro-ordem-desafios"
              value={sortMode}
              onChange={(event) =>
                setSortMode(event.target.value as BadgeChallengeSortMode)
              }
            >
              <option value="completed_last">Concluídos por último</option>
              <option value="tier_progress">Tier com maior progresso</option>
              <option value="latest">Último desafio adicionado</option>
            </select>
          </div>
        </div>
      </header>

      <div className="desafiosBadgesWrapper" role="region" aria-live="polite">
        {errorMessage ? (
          <p className="desafiosBadgesFeedback desafiosBadgesFeedbackError" role="alert">
            {errorMessage}
          </p>
        ) : visibleBadgeChallenges.length === 0 ? (
          <p className="desafiosBadgesFeedback">{emptyMessage}</p>
        ) : (
          <div className="desafiosBadgesGroups">
            {pendingBadgeChallenges.length > 0 && (
              <ul className="desafiosBadgesList">
                {pendingBadgeChallenges.map((challenge) => (
                  <li
                    key={`${challenge.id}-${challenge.gameId}-${challenge.criterion}`}
                    className={`desafiosBadgesItem${challenge.isCompleted ? " desafiosBadgesItemCompleted" : ""}${isChallengeInteractionEnabled ? " desafiosBadgesItemInteractive" : ""}`}
                    onDoubleClick={() => handleChallengeDoubleClick(challenge)}
                    onKeyDown={(event) => handleChallengeKeyDown(event, challenge)}
                    role={isChallengeInteractionEnabled ? "button" : undefined}
                    tabIndex={isChallengeInteractionEnabled ? 0 : undefined}
                    aria-label={
                      isChallengeInteractionEnabled
                        ? `Abrir desafios da trilha de ${challenge.gameName}: ${challenge.criterionLabel}`
                        : undefined
                    }
                  >
                    <div className="desafiosBadgesTop">
                      <div className="desafiosBadgesMeta">
                        <p className="desafiosBadgesGame">Game: {challenge.gameName}</p>
                        <p className="desafiosBadgesCriterion">
                          Desafio: {challenge.criterionLabel}
                        </p>
                      </div>
                      <span className="desafiosBadgesTier">Tier {challenge.nextTier}</span>
                    </div>

                    <div className="desafiosBadgesProgressRow">
                      <div
                        className="desafiosBadgesProgress"
                        role="progressbar"
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={challenge.progressToNextPercentage}
                        aria-label={`Progresso para o tier ${challenge.nextTier} de ${challenge.criterionLabel}`}
                      >
                        <div
                          className="desafiosBadgesProgressFill"
                          style={{ width: `${challenge.progressToNextPercentage}%` }}
                        />
                      </div>
                      {challenge.nextTierImageUrl && (
                        <img
                          src={challenge.nextTierImageUrl}
                          alt={`Badge Tier ${challenge.nextTier}`}
                          className="desafiosBadgesImage"
                          loading="lazy"
                          decoding="async"
                        />
                      )}
                    </div>

                    <p className="desafiosBadgesInstruction">
                      {getChallengeInstruction(challenge)}
                    </p>
                  </li>
                ))}
              </ul>
            )}

            {completedBadgeChallenges.length > 0 && (
              <>
                <p
                  className={`desafiosBadgesSectionTitle${pendingBadgeChallenges.length > 0 ? " desafiosBadgesSectionTitleSeparated" : ""}`}
                >
                  Desafios concluídos:
                </p>
                <ul className="desafiosBadgesList desafiosBadgesListCompleted">
                  {completedBadgeChallenges.map((challenge) => (
                    <li
                      key={`${challenge.id}-${challenge.gameId}-${challenge.criterion}`}
                      className={`desafiosBadgesItem desafiosBadgesItemCompleted${isChallengeInteractionEnabled ? " desafiosBadgesItemInteractive" : ""}`}
                      onDoubleClick={() => handleChallengeDoubleClick(challenge)}
                      onKeyDown={(event) => handleChallengeKeyDown(event, challenge)}
                      role={isChallengeInteractionEnabled ? "button" : undefined}
                      tabIndex={isChallengeInteractionEnabled ? 0 : undefined}
                      aria-label={
                        isChallengeInteractionEnabled
                          ? `Abrir desafios da trilha de ${challenge.gameName}: ${challenge.criterionLabel}`
                          : undefined
                      }
                    >
                      <div className="desafiosBadgesTop">
                        <div className="desafiosBadgesMeta">
                          <p className="desafiosBadgesGame">Game: {challenge.gameName}</p>
                          <p className="desafiosBadgesCriterion">
                            Desafio: {challenge.criterionLabel}
                          </p>
                        </div>
                        <span className="desafiosBadgesTier desafiosBadgesTierCompleted">
                          Concluído • Tier {challenge.nextTier}
                        </span>
                      </div>

                      <div className="desafiosBadgesProgressRow">
                        <div
                          className="desafiosBadgesProgress"
                          role="progressbar"
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={challenge.progressToNextPercentage}
                          aria-label={`Progresso para o tier ${challenge.nextTier} de ${challenge.criterionLabel}`}
                        >
                          <div
                            className="desafiosBadgesProgressFill desafiosBadgesProgressFillCompleted"
                            style={{ width: `${challenge.progressToNextPercentage}%` }}
                          />
                        </div>
                        {challenge.nextTierImageUrl && (
                          <img
                            src={challenge.nextTierImageUrl}
                            alt={`Badge Tier ${challenge.nextTier}`}
                            className="desafiosBadgesImage"
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                      </div>

                      <p className="desafiosBadgesInstruction">
                        {getChallengeInstruction(challenge)}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
