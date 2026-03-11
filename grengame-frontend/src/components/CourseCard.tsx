import type { CSSProperties } from "react";
import SeloStatusDesafios, {
  type StatusSeloDesafios,
} from "./SeloStatusDesafios";

type CourseCardCourse = {
  id: number;
  name: string;
  description: string;
  category?: string;
  banner?: string | null;
  course_points?: number;
  progress_percentage?: number;
};

type CourseCardProps = {
  course: CourseCardCourse;
  isSelected: boolean;
  isEnrolled: boolean;
  isMutating: boolean;
  challengesStatus?: StatusSeloDesafios;
  progress: number;
  bannerStyle?: CSSProperties;
  lastUpdatedLabel: string;
  onSelect: (course: CourseCardCourse) => void;
  onOpen: (course: CourseCardCourse) => void;
};

export default function CourseCard({
  course,
  isSelected,
  isEnrolled,
  isMutating,
  challengesStatus,
  progress,
  bannerStyle,
  lastUpdatedLabel,
  onSelect,
  onOpen,
}: CourseCardProps) {
  const isCompleted = progress >= 100;
  const resolvedChallengesStatus = challengesStatus ?? "none";
  const enrolledBadgeLabel = isCompleted
    ? "Usuário finalizou este game"
    : "Usuário já jogando este game";
  const enrolledBadgeText = isCompleted ? "Finalizado" : "Jogando";

  return (
    <article
      className={`course-card ${isSelected ? "selected" : ""}`}
      onClick={() => onSelect(course)}
      onDoubleClick={() => onOpen(course)}
      role="group"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(course);
        }
      }}
      aria-pressed={isSelected}
      aria-label={`Selecionar curso ${course.name}`}
    >
      <div
        className={`course-thumb ${course.banner ? "has-banner" : ""}`}
        role="img"
        aria-label={`Banner do game ${course.name}. Progresso ${progress}% de 100%. Recompensa +${course.course_points ?? 0} pontos.`}
        style={bannerStyle}
      />
      <div
        className="course-progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
        aria-valuetext={`${progress}% de 100% concluído`}
        aria-label={`Progresso do game ${course.name}: ${progress}% de 100%`}
      >
        <div
          className="course-progress-fill"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="course-progress-label" aria-hidden="true">
        {progress}% concluído
      </div>
      <div className="card-header">
        <div>
          <p className="course-category">{course.category ?? "Sem categoria"}</p>
          <h3>{course.name}</h3>
        </div>
        <div className="course-status-stack">
          <SeloStatusDesafios status={resolvedChallengesStatus} />
          {isEnrolled ? (
            <span className="enrolled-badge" aria-label={enrolledBadgeLabel}>
              {enrolledBadgeText}
            </span>
          ) : (
            <span className="tag">+{course.course_points ?? 0}</span>
          )}
          {isMutating && <span className="mutating-pill">Processando...</span>}
        </div>
      </div>
      <p className="course-description">
        {course.description || "Sem descrição disponível no momento."}
      </p>
      <div className="card-footer">
        <div className="meta">
          <span>Atualizado: {lastUpdatedLabel}</span>
        </div>
        <button
          type="button"
          className="secondary-action"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(course);
          }}
        >
          Abrir
        </button>
      </div>
    </article>
  );
}