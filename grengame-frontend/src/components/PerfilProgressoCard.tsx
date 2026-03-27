import { type KeyboardEvent } from "react";
import "./PerfilProgressoCard.css";

type PerfilProgressoCardProps = {
  fullName: string;
  level: string | number | null;
  xp: number;
  xpToNext: number | null;
  totalXp?: number | null;
  gamesCompletedForLevel?: number | null;
  gamesRequiredForNext?: number | null;
  isNextLevelLocked?: boolean;
  activeGames?: number | null;
  completedGames?: number | null;
  isLoading: boolean;
  error?: string | null;
  avatarUrl?: string;
  onActivate?: () => void;
  ariaLabel?: string;
  clickable?: boolean;
};

export default function PerfilProgressoCard({
  fullName,
  level,
  xp,
  xpToNext,
  totalXp = null,
  gamesCompletedForLevel = null,
  gamesRequiredForNext = null,
  isNextLevelLocked = false,
  activeGames = null,
  completedGames = null,
  isLoading,
  error,
  avatarUrl,
  onActivate,
  ariaLabel = "Progresso do nível",
  clickable = true,
}: PerfilProgressoCardProps) {
  const xpMax =
    xpToNext === null
      ? 100
      : typeof xpToNext === "number"
        ? xp + xpToNext
        : 0;
  const progressPercent =
    xpToNext === null
      ? 100
      : xpMax > 0
        ? Math.min(100, Math.max(0, (xp / xpMax) * 100))
        : 0;
  const xpLabel =
    xpToNext === null
      ? `${xp} XP no nível máximo`
      : `${xp}/${xpMax || "Indefinido"} XP para o próximo nível`;
  const displayedTotalXp =
    totalXp === null || Number.isNaN(totalXp) ? xp : Number(totalXp);
  const initial = fullName?.trim()?.charAt(0)?.toUpperCase() || "?";
  const activeLabel =
    activeGames === null || Number.isNaN(activeGames) ? "--" : String(activeGames);
  const completedGamesForLevelValue =
    gamesCompletedForLevel === null || Number.isNaN(gamesCompletedForLevel)
      ? completedGames === null || Number.isNaN(completedGames)
        ? 0
        : Number(completedGames)
      : Number(gamesCompletedForLevel);
  const completedLabel =
    completedGames === null || Number.isNaN(completedGames)
      ? "--"
      : String(completedGames);
  const gamesMissingForNext =
    gamesRequiredForNext === null || Number.isNaN(gamesRequiredForNext)
      ? 0
      : Math.max(0, Number(gamesRequiredForNext) - completedGamesForLevelValue);
  const shouldShowNextLevelLockNote =
    Boolean(isNextLevelLocked) &&
    gamesRequiredForNext !== null &&
    !Number.isNaN(gamesRequiredForNext) &&
    gamesMissingForNext > 0;

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onActivate) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onActivate();
    }
  };

  return (
    <section
      className={`perfilProgressoCard ${clickable && onActivate ? "clickable" : ""}`}
      aria-label={ariaLabel}
      role={onActivate ? "button" : undefined}
      tabIndex={onActivate ? 0 : -1}
      onClick={onActivate}
      onKeyDown={handleKeyDown}
    >
      {isLoading ? (
        <div className="perfilSkeleton">
          <div className="perfilHeader">
            <div className="avatarMock skeleton" aria-hidden="true" />
            <div className="perfilTexto">
              <div className="skeleton skeleton-line" />
              <div className="skeleton skeleton-line short" />
            </div>
          </div>
          <div className="perfilProgressBar skeleton">
            <div className="perfilProgressFill" style={{ width: "0%" }} />
          </div>
          <div className="perfilStatsGrid">
            <div className="perfilStatCard skeleton" />
            <div className="perfilStatCard skeleton" />
            <div className="perfilStatCard skeleton" />
          </div>
        </div>
      ) : (
        <>
          <div className="perfilHeader">
            <div className="avatarRing">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`Avatar de ${fullName}`}
                  className="avatarImage"
                />
              ) : (
                <div className="avatarInitial" aria-hidden="true">
                  {initial}
                </div>
              )}
            </div>
            <p className="perfilNome">{fullName}</p>
            <span className="perfilNivelBadge">
              Nível {level ?? "Indefinido"}
            </span>
            <p className="perfilXp">{xpLabel}</p>
          </div>
          <div
            className="perfilProgressBar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={xpMax}
            aria-valuenow={xpToNext === null ? 100 : xp}
          >
            <div className="perfilProgressFill" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="perfilProgressMeta">
            <span>Progresso do Nível</span>
            <strong>{Math.round(progressPercent)}%</strong>
          </div>
          {shouldShowNextLevelLockNote && (
            <p className="perfilNextLevelLock">
              Faltam {gamesMissingForNext} games completos para o próximo nível.
            </p>
          )}
          <div className="perfilDivider" aria-hidden="true" />
          <div className="perfilStatsGrid">
            <div className="perfilStatCard">
              <span className="statIcon">★</span>
              <div className="statValue">{displayedTotalXp}</div>
              <div className="statLabel">XP Total</div>
            </div>
            <div className="perfilStatCard">
              <span className="statIcon target">◍</span>
              <div className="statValue">{activeLabel}</div>
              <div className="statLabel">Games Ativos</div>
            </div>
            <div className="perfilStatCard">
              <span className="statIcon success">✓</span>
              <div className="statValue">{completedLabel}</div>
              <div className="statLabel">Completos</div>
            </div>
          </div>
        </>
      )}
      {error && (
        <p className="errorText" aria-live="polite">
          {error}
        </p>
      )}
    </section>
  );
}
