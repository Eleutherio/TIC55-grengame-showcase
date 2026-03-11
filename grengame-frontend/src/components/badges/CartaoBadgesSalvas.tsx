type UnlockCriterion = "course_points" | "perfect_missions" | "active_days";
type ValueMode = "percentage" | "absolute";
type TierNumber = 1 | 2 | 3 | 4 | 5;
type TierValues = Record<TierNumber, number>;

type SavedBadgeConfig = {
  gameId: string;
  gameName: string;
  criterion: UnlockCriterion;
  valueMode: ValueMode;
  isActive: boolean;
  tierValues: TierValues;
  updatedAt?: string;
};

type GroupedSavedConfig = {
  gameId: string;
  gameName: string;
  criteria: SavedBadgeConfig[];
};

type TierAsset = {
  tier: TierNumber;
  image: string;
};

type Props = {
  isLoadingSavedConfigs: boolean;
  savedConfigsError: string | null;
  groupedSavedConfigs: GroupedSavedConfig[];
  visibleGroupedSavedConfigs: GroupedSavedConfig[];
  selectedSavedGroup: GroupedSavedConfig | null;
  savedGameFilterId: string;
  isDeletingConfigKey: string | null;
  savedGamesPage: number;
  savedGamesTotalPages: number;
  savedGamesHasPrevious: boolean;
  savedGamesHasNext: boolean;
  tierAssets: TierAsset[];
  onSavedGameFilterChange: (gameId: string) => void;
  onSavedGamesPagePrevious: () => void;
  onSavedGamesPageNext: () => void;
  onSelectSavedGame: (gameId: string) => void;
  onEditSaved: (config: SavedBadgeConfig) => void;
  onDeleteSaved: (config: SavedBadgeConfig) => void;
  configKey: (gameId: string, criterion: UnlockCriterion) => string;
  criterionLabel: (criterion: UnlockCriterion) => string;
  tierTitle: (criterion: UnlockCriterion, tier: TierNumber) => string;
  ruleDescription: (criterion: UnlockCriterion, value: number, valueMode: ValueMode) => string;
  publicationStatusLabel: (isActive: boolean) => string;
  formatDate: (value?: string) => string;
};

export default function CartaoBadgesSalvas({
  isLoadingSavedConfigs,
  savedConfigsError,
  groupedSavedConfigs,
  visibleGroupedSavedConfigs,
  selectedSavedGroup,
  savedGameFilterId,
  isDeletingConfigKey,
  savedGamesPage,
  savedGamesTotalPages,
  savedGamesHasPrevious,
  savedGamesHasNext,
  tierAssets,
  onSavedGameFilterChange,
  onSavedGamesPagePrevious,
  onSavedGamesPageNext,
  onSelectSavedGame,
  onEditSaved,
  onDeleteSaved,
  configKey,
  criterionLabel,
  tierTitle,
  ruleDescription,
  publicationStatusLabel,
  formatDate,
}: Props) {
  const savedGamesDisplayPage = savedGamesTotalPages > 0 ? savedGamesPage : 0;
  const isSavedGamesPaginationDisabled =
    isLoadingSavedConfigs || savedGamesTotalPages <= 0;

  return (
    <section className="badges-saved-section" aria-label="Badges salvas">
      <div className="badges-saved-header">
        <div>
          <h2>Badges salvas</h2>
          <p>Selecione o game para visualizar os criterios ja cadastrados.</p>
        </div>
        <div className="badges-saved-filter">
          <label htmlFor="saved-game-filter-select">Buscar game</label>
          <select
            id="saved-game-filter-select"
            value={savedGameFilterId}
            onChange={(event) => onSavedGameFilterChange(event.target.value)}
            disabled={isLoadingSavedConfigs}
          >
            <option value="">Todos os games com badges</option>
            {groupedSavedConfigs.map((group) => (
              <option key={group.gameId} value={group.gameId}>
                {group.gameName}
              </option>
            ))}
          </select>
        </div>
        <div className="badges-saved-pagination" aria-live="polite">
          <button
            type="button"
            onClick={onSavedGamesPagePrevious}
            disabled={isSavedGamesPaginationDisabled || !savedGamesHasPrevious}
          >
            Anterior
          </button>
          <span>
            Pagina {savedGamesDisplayPage} de {savedGamesTotalPages}
          </span>
          <button
            type="button"
            onClick={onSavedGamesPageNext}
            disabled={isSavedGamesPaginationDisabled || !savedGamesHasNext}
          >
            Proxima
          </button>
        </div>
      </div>

      {isLoadingSavedConfigs ? (
        <p className="badges-saved-feedback">Carregando badges salvas...</p>
      ) : visibleGroupedSavedConfigs.length === 0 ? (
        <p className="badges-saved-feedback">
          {savedConfigsError || "Nenhuma configuracao encontrada para o filtro selecionado."}
        </p>
      ) : (
        <div className="badges-saved-layout">
          <nav className="badges-saved-games-column" aria-label="Games com badges">
            <ul className="badges-saved-game-list">
              {visibleGroupedSavedConfigs.map((group) => {
                const isActive = selectedSavedGroup?.gameId === group.gameId;
                const activeCount = group.criteria.filter((item) => item.isActive).length;
                const draftCount = group.criteria.length - activeCount;
                return (
                  <li key={group.gameId}>
                    <button
                      type="button"
                      className={`badges-saved-game-button ${isActive ? "active" : ""}`}
                      aria-pressed={isActive}
                      onClick={() => onSelectSavedGame(group.gameId)}
                    >
                      <span>{group.gameName}</span>
                      <small>
                        {group.criteria.length} criterio(s) • {activeCount} publicado(s) •{" "}
                        {draftCount} rascunho(s)
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="badges-saved-criteria-column">
            {selectedSavedGroup ? (
              <>
                <p className="badges-saved-selected-game">{selectedSavedGroup.gameName}</p>
                <div className="badges-saved-list">
                  {selectedSavedGroup.criteria.map((config) => {
                    const key = configKey(config.gameId, config.criterion);
                    const deleting = isDeletingConfigKey === key;

                    return (
                      <article key={key} className="badges-saved-item">
                        <div className="badges-saved-main">
                          <div className="badges-saved-meta">
                            <h4>{criterionLabel(config.criterion)}</h4>
                            <span className="badges-saved-meta-mode">
                              {config.valueMode === "percentage" ? "Percentual" : "Absoluto"}
                            </span>
                            <span
                              className={`badges-saved-status ${
                                config.isActive ? "published" : "draft"
                              }`}
                            >
                              {publicationStatusLabel(config.isActive)}
                            </span>
                          </div>

                          <ul className="badges-saved-rules">
                            {tierAssets.map((asset) => (
                              <li key={`${key}-${asset.tier}`}>
                                <strong>{tierTitle(config.criterion, asset.tier)}</strong>
                                <span>
                                  {ruleDescription(
                                    config.criterion,
                                    config.tierValues[asset.tier],
                                    config.valueMode,
                                  )}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {config.updatedAt && (
                            <p className="badges-saved-updated">
                              Atualizado em: {formatDate(config.updatedAt)}
                            </p>
                          )}
                        </div>

                        <div className="badges-saved-actions-row">
                          <button
                            type="button"
                            className="badges-saved-button secondary"
                            onClick={() => onEditSaved(config)}
                            disabled={deleting}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="badges-saved-button danger"
                            onClick={() => onDeleteSaved(config)}
                            disabled={deleting}
                          >
                            {deleting ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="badges-saved-feedback">Selecione um game para visualizar.</p>
            )}
          </div>
        </div>
      )}

      {!isLoadingSavedConfigs && savedConfigsError && visibleGroupedSavedConfigs.length > 0 && (
        <p className="badges-saved-feedback warning">{savedConfigsError}</p>
      )}
    </section>
  );
}
