type UnlockCriterion = "course_points" | "perfect_missions" | "active_days";
type CriterionValue = UnlockCriterion | "";
type TierNumber = 1 | 2 | 3 | 4 | 5;

type TierAsset = {
  tier: TierNumber;
  image: string;
};

type Props = {
  gameName: string;
  tierAssets: TierAsset[];
  criterion: CriterionValue;
  tierTitle: (criterion: CriterionValue, tier: TierNumber) => string;
  ruleDescription: (tier: TierNumber) => string;
};

export default function BadgePreviewCard({
  gameName,
  tierAssets,
  criterion,
  tierTitle,
  ruleDescription,
}: Props) {
  return (
    <section
      className="badges-config-preview"
      aria-live="polite"
      aria-label="Pre-visualizacao das badges"
    >
      <header className="badges-config-preview-header">
        <h2>Pre-visualizacao</h2>
        <p>{gameName}</p>
      </header>

      <ul className="badges-config-preview-list">
        {tierAssets.map((asset) => (
          <li key={asset.tier} className="badges-config-preview-item">
            <img src={asset.image} alt={tierTitle(criterion, asset.tier)} loading="lazy" />
            <div>
              <strong>{tierTitle(criterion, asset.tier)}</strong>
              <span>{ruleDescription(asset.tier)}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
