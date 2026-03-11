type UnlockCriterion = "course_points" | "perfect_missions" | "active_days";
type CriterionValue = UnlockCriterion | "";
type TierNumber = 1 | 2 | 3 | 4 | 5;
type TierValues = Record<TierNumber, number>;

type TierAsset = {
  tier: TierNumber;
  image: string;
};

type Props = {
  selectedCriterion: CriterionValue;
  tierValues: TierValues;
  tierAssets: TierAsset[];
  isSaving: boolean;
  isLoadingConfig: boolean;
  criterionPresetHelpText: string;
  legacyValueModeWarning: string;
  inputLabel: string;
  isPercentageCriterion: boolean;
  onTierChange: (tier: TierNumber, value: string) => void;
  tierTitle: (tier: TierNumber) => string;
  ruleDescription: (tier: TierNumber) => string;
};

export default function BadgeTierRulesCard({
  selectedCriterion,
  tierValues,
  tierAssets,
  isSaving,
  isLoadingConfig,
  criterionPresetHelpText,
  legacyValueModeWarning,
  inputLabel,
  isPercentageCriterion,
  onTierChange,
  tierTitle,
  ruleDescription,
}: Props) {
  return (
    <section className="badges-config-section">
      <div className="badges-config-section-header">
        <h2>2. Regras por tier</h2>
        {isLoadingConfig && (
          <span className="badges-config-help">Carregando configuracao atual...</span>
        )}
      </div>

      {selectedCriterion && (
        <span className="badges-config-help">{criterionPresetHelpText}</span>
      )}
      {legacyValueModeWarning && (
        <span className="badges-config-help">{legacyValueModeWarning}</span>
      )}

      <div className="badges-config-tier-list">
        {tierAssets.map((asset) => (
          <div key={asset.tier} className="badges-config-tier-row">
            <div className="badges-config-tier-media">
              <img src={asset.image} alt={tierTitle(asset.tier)} loading="lazy" />
              <div className="badges-config-tier-copy">
                <strong>{tierTitle(asset.tier)}</strong>
                <span>{ruleDescription(asset.tier)}</span>
              </div>
            </div>

            <div className="badges-config-tier-input">
              <label htmlFor={`badge-tier-${asset.tier}`}>{inputLabel}</label>
              <input
                id={`badge-tier-${asset.tier}`}
                type="number"
                min={isPercentageCriterion ? 0 : 1}
                max={isPercentageCriterion ? 100 : undefined}
                step={1}
                value={tierValues[asset.tier]}
                onChange={(event) => onTierChange(asset.tier, event.target.value)}
                disabled={isSaving || isLoadingConfig}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
