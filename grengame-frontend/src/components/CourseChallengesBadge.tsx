import "./CourseChallengesBadge.css";

export type CourseChallengesBadgeStatus = "available" | "completed";

type CourseChallengesBadgeProps = {
  status: CourseChallengesBadgeStatus;
};

export default function CourseChallengesBadge({
  status,
}: CourseChallengesBadgeProps) {
  const isCompleted = status === "completed";
  const label = isCompleted ? "Desafios completos" : "Desafios disponíveis";
  const ariaLabel = isCompleted
    ? "Desafios completos neste game"
    : "Desafios disponíveis neste game";

  return (
    <span
      className={`course-challenges-badge ${
        isCompleted ? "is-completed" : "is-available"
      }`}
      aria-label={ariaLabel}
      title={label}
    >
      <span className="course-challenges-badge-icon" aria-hidden="true">
        {isCompleted ? "★" : "✦"}
      </span>
      <span className="course-challenges-badge-label">{label}</span>
    </span>
  );
}
