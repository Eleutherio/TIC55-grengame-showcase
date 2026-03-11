type CourseHeroCourse = {
  id: number;
  name: string;
  description: string;
  category?: string;
  created_at?: string;
  updated_at?: string;
};

type CourseHeroProps = {
  dicaText: string;
  onPauseDica: () => void;
  onResumeDica: () => void;
  onToggleDica: () => void;
  isLoading: boolean;
  coursesCount: number;
  categoriesCount: number;
  activeCourse: CourseHeroCourse | null;
  isActiveCourseEnrolled: boolean;
  activeCourseLastUpdatedLabel: string;
  isEnrolling: boolean;
  isDropping: boolean;
  feedbackMessage: string | null;
  enrollError: string | null;
  onConfirmInscricao: () => void;
  onAbandonar: () => void;
};

export default function CourseHero({
  dicaText,
  onPauseDica,
  onResumeDica,
  onToggleDica,
  isLoading,
  coursesCount,
  categoriesCount,
  activeCourse,
  isActiveCourseEnrolled,
  activeCourseLastUpdatedLabel,
  isEnrolling,
  isDropping,
  feedbackMessage,
  enrollError,
  onConfirmInscricao,
  onAbandonar,
}: CourseHeroProps) {
  return (
    <header className="inscrever-hero">
      <div className="hero-text">
        <div className="calloutWrapper">
          <div
            className="callout"
            aria-live="polite"
            role="button"
            tabIndex={0}
            onMouseEnter={onPauseDica}
            onMouseLeave={onResumeDica}
            onFocus={onPauseDica}
            onBlur={onResumeDica}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onToggleDica();
              }
            }}
          >
            <span role="img" aria-label="estrela">
              ⭐
            </span>
            <span>{dicaText}</span>
          </div>
        </div>
        <h1 id="hero-title">Escolha o jogo ideal para você</h1>
        <p className="hero-subtitle">
          Explore os jogos disponíveis, compare seus pontos no ranking e comece
          a jogar agora.
        </p>
        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-number">
              {isLoading ? "--" : coursesCount.toString().padStart(2, "0")}
            </span>
            <span className="stat-label">Jogos disponíveis</span>
          </div>
          <div className="stat-card">
            <span className="stat-number">
              {isLoading ? "--" : categoriesCount.toString().padStart(2, "0")}
            </span>
            <span className="stat-label">Categorias</span>
          </div>
        </div>
      </div>

      <div className="hero-selection">
        <div className="selection-header">
          <p className="selection-label">Jogado por último:</p>
          <span
            className={`selection-status ${activeCourse ? "" : "status-empty"}`}
          >
            {activeCourse ? "Pronto para jogar" : "Nenhum"}
          </span>
        </div>
        {activeCourse ? (
          <div className="selection-body">
            <h2>{activeCourse.name}</h2>
            <p className="selection-category">
              {activeCourse.category ? activeCourse.category : "Sem categoria"}
            </p>
            <p className="selection-description">
              {activeCourse.description || "Sem descrição disponível no momento."}
            </p>
            <div className="selection-meta">
              <span>Atualizado em {activeCourseLastUpdatedLabel}</span>
              {isActiveCourseEnrolled && (
                <span className="enrolled-pill">Você está jogando</span>
              )}
            </div>
            <div className="selection-actions">
              <button
                type="button"
                className="primary-action"
                onClick={onConfirmInscricao}
                disabled={isEnrolling}
              >
                {isEnrolling
                  ? "Iniciando..."
                  : isActiveCourseEnrolled
                    ? "Continuar jogando"
                    : "Começar jogo"}
              </button>
              {isActiveCourseEnrolled && (
                <button
                  type="button"
                  className="danger-action"
                  onClick={onAbandonar}
                  disabled={isDropping}
                >
                  {isDropping ? "Saindo..." : "Abandonar jogo"}
                </button>
              )}
            </div>
            {feedbackMessage && (
              <p className="confirmation-text">{feedbackMessage}</p>
            )}
            {enrollError && <p className="selection-error">{enrollError}</p>}
          </div>
        ) : (
          <div className="selection-empty">
            <p>
              Você ainda não jogou.
              <br />
              <br />
              Comece agora sua jornada de aprendizado selecionando um dos
              treinamentos gamificados abaixo!
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
