import { useState, type CSSProperties } from "react";
import CourseChallengesBadge, {
  type CourseChallengesBadgeStatus,
} from "./CourseChallengesBadge";

type CourseFocusCourse = {
  id: number;
  name: string;
  description: string;
  category?: string;
  banner?: string | null;
  created_at?: string;
  updated_at?: string;
  course_points?: number;
  progress_percentage?: number;
  enrolled?: boolean;
};

type CourseFocusProps = {
  course: CourseFocusCourse;
  progress: number;
  bannerStyle?: CSSProperties;
  lastUpdatedLabel: string;
  isEnrolled: boolean;
  challengesStatus?: CourseChallengesBadgeStatus;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
};

export default function CourseFocus({
  course,
  progress,
  bannerStyle,
  lastUpdatedLabel,
  isEnrolled,
  challengesStatus,
  onClose,
  onConfirm,
}: CourseFocusProps) {
  const [isLoadingTrail, setIsLoadingTrail] = useState(false);

  const handleConfirmClick = async () => {
    if (isLoadingTrail) return;
    setIsLoadingTrail(true);
    try {
      await Promise.resolve(onConfirm());
    } finally {
      setIsLoadingTrail(false);
    }
  };

  return (
    <div
      className="course-focus-wrapper"
      role="region"
      aria-label={`Game ${course.name} selecionado`}
    >
      <article className="course-focus-card">
        <div
          className={`course-thumb focus ${course.banner ? "has-banner" : ""}`}
          role="img"
          aria-label={`Banner do game ${course.name}`}
          style={bannerStyle}
        />
        <div className="focus-progress-section">
          <div
            className="course-progress focus"
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
          <div className="focus-progress-meta">
            <div className="focus-progress-meta-left">
              <span className="course-progress-label focus">{progress}% concluído</span>
              <span className="tag focus-tag">+{course.course_points ?? 0} pontos</span>
            </div>
            {challengesStatus ? (
              <div className="focus-progress-meta-right">
                <CourseChallengesBadge status={challengesStatus} />
              </div>
            ) : null}
          </div>
        </div>
        <h3>{course.name}</h3>
        <p className="course-category">{course.category ?? "Sem categoria"}</p>
        <p className="course-description">
          {course.description || "Sem descrição disponível no momento."}
        </p>
        <div className="meta">
          <span>Atualizado: {lastUpdatedLabel}</span>
        </div>
        <div className="focus-actions">
          <button type="button" className="focus-back" onClick={onClose}>
            Voltar
          </button>
          <button
            type="button"
            className="primary-action focus-cta"
            onClick={() => {
              void handleConfirmClick();
            }}
            disabled={isLoadingTrail}
            aria-busy={isLoadingTrail}
          >
            {isLoadingTrail
              ? "Carregando trilha..."
              : isEnrolled
                ? "Continuar jogando"
                : "Quero jogar"}
          </button>
        </div>
      </article>
    </div>
  );
}
