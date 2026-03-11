type GameOption = {
  id: string;
  name: string;
  category?: string;
};

type UnlockCriterion = "course_points" | "perfect_missions" | "active_days";
type CriterionValue = UnlockCriterion | "";

type CriteriaOption = {
  id: UnlockCriterion;
  label: string;
};

type Props = {
  games: GameOption[];
  selectedGameId: string;
  selectedCriterion: CriterionValue;
  selectedIsActive: boolean;
  isLoadingGames: boolean;
  isSaving: boolean;
  gamesError: string | null;
  criteriaOptions: CriteriaOption[];
  criterionHelpText: string;
  onGameChange: (gameId: string) => void;
  onCriterionChange: (criterion: CriterionValue) => void;
  onStatusChange: (isActive: boolean) => void;
};

export default function CartaoJogoCriterioBadge({
  games,
  selectedGameId,
  selectedCriterion,
  selectedIsActive,
  isLoadingGames,
  isSaving,
  gamesError,
  criteriaOptions,
  criterionHelpText,
  onGameChange,
  onCriterionChange,
  onStatusChange,
}: Props) {
  const isCriterionLocked = isSaving || !selectedGameId;
  const isStatusLocked = isSaving || !selectedGameId;
  const statusSelectValue = selectedGameId ? (selectedIsActive ? "published" : "draft") : "";

  return (
    <section className="badges-config-section">
      <h2>1. Game e criterio</h2>

      <div className="badges-config-field">
        <label htmlFor="badge-game-select">Game</label>
        <select
          id="badge-game-select"
          value={selectedGameId}
          onChange={(event) => onGameChange(event.target.value)}
          disabled={isLoadingGames || isSaving}
          required
        >
          <option value="">Selecione um game</option>
          {games.map((game) => (
            <option key={game.id} value={game.id}>
              {game.name}
              {game.category ? ` - ${game.category}` : ""}
            </option>
          ))}
        </select>
        {gamesError && <span className="badges-config-help">{gamesError}</span>}
      </div>

      <div className={`badges-config-field ${isCriterionLocked ? "is-disabled" : ""}`}>
        <label htmlFor="badge-criterion-select">Criterio de desbloqueio</label>
        <select
          id="badge-criterion-select"
          value={selectedCriterion}
          onChange={(event) => onCriterionChange(event.target.value as CriterionValue)}
          disabled={isCriterionLocked}
          required
        >
          <option value="">
            {selectedGameId ? "Selecione um criterio" : "Selecione um game primeiro"}
          </option>
          {criteriaOptions.map((criterion) => (
            <option key={criterion.id} value={criterion.id}>
              {criterion.label}
            </option>
          ))}
        </select>
        <span className="badges-config-help">{criterionHelpText}</span>
      </div>

      <div className={`badges-config-field ${isStatusLocked ? "is-disabled" : ""}`}>
        <label htmlFor="badge-status-select">Status da badge</label>
        <select
          id="badge-status-select"
          value={statusSelectValue}
          onChange={(event) => {
            const selectedStatus = event.target.value;
            // Protege contra valores inesperados vindos do DOM/testes.
            if (selectedStatus !== "published" && selectedStatus !== "draft") return;
            onStatusChange(selectedStatus === "published");
          }}
          disabled={isStatusLocked}
        >
          <option value="" disabled>
            Selecione um game primeiro
          </option>
          <option value="draft">Rascunho (nao concede para jogadores)</option>
          <option value="published">Publicado (ativo para jogadores)</option>
        </select>
        <span className="badges-config-help">
          {!selectedGameId
            ? "Selecione um game para habilitar o status da badge."
            : selectedIsActive
            ? "Publicado: jogadores podem progredir e desbloquear tiers."
            : "Rascunho: visivel para administracao, sem concessao para jogadores."}
        </span>
      </div>
    </section>
  );
}
