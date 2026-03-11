import "./SeloStatusDesafios.css";

export type StatusSeloDesafios = "available" | "completed" | "none";

type SeloStatusDesafiosProps = {
  status: StatusSeloDesafios;
};

const LABEL_BY_STATUS: Record<StatusSeloDesafios, string> = {
  available: "★ Desafios disponíveis! ★",
  completed: "Desafios completos",
  none: "Sem desafios",
};

export default function SeloStatusDesafios({
  status,
}: SeloStatusDesafiosProps) {
  const label = LABEL_BY_STATUS[status];

  return (
    <span
      className={`course-challenges-badge is-${status}`}
      aria-label={label}
      title={label}
    >
      <span className="course-challenges-badge-label">{label}</span>
    </span>
  );
}