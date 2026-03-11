import type { CSSProperties } from "react";
import CourseCard from "./CourseCard";
import type { CourseChallengesBadgeStatus } from "./CourseChallengesBadge";

type CoursesGridCourse = {
  id: number;
  name: string;
  description: string;
  category?: string;
  banner?: string | null;
  created_at?: string;
  updated_at?: string;
  enrolled?: boolean;
  course_points?: number;
  progress_percentage?: number;
};

type CoursesGridProps = {
  isLoading: boolean;
  isLoadingMore?: boolean;
  loadingMoreSkeletonCount?: number;
  filteredCourses: CoursesGridCourse[];
  selectedCourseId: number | null;
  isEnrolling: boolean;
  isDropping: boolean;
  challengeStatusByGame?: Record<number, CourseChallengesBadgeStatus>;
  onSelectCourse: (course: CoursesGridCourse) => void;
  onOpenCourse: (course: CoursesGridCourse) => void;
  isCourseEnrolled: (course: CoursesGridCourse) => boolean;
  getBannerStyle: (banner?: string | null) => CSSProperties | undefined;
  formatDate: (rawDate?: string) => string;
};

export default function CoursesGrid({
  isLoading,
  isLoadingMore = false,
  loadingMoreSkeletonCount = 3,
  filteredCourses,
  selectedCourseId,
  isEnrolling,
  isDropping,
  challengeStatusByGame,
  onSelectCourse,
  onOpenCourse,
  isCourseEnrolled,
  getBannerStyle,
  formatDate,
}: CoursesGridProps) {
  return (
    <section
      className="courses-grid"
      aria-live="polite"
      aria-label="Lista de jogos disponíveis"
    >
      {isLoading &&
        Array.from({ length: 3 }).map((_, index) => (
          <article key={index} className="course-card skeleton-card">
            <div className="skeleton-line wide" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </article>
        ))}

      {!isLoading &&
        filteredCourses.map((course) => {
          const isSelected = selectedCourseId === course.id;
          const isEnrolled = isCourseEnrolled(course);
          const isMutating = isSelected && (isEnrolling || isDropping);
          const progress = Math.max(
            0,
            Math.min(100, course.progress_percentage ?? 0)
          );
          return (
            <CourseCard
              key={course.id}
              course={course}
              isSelected={isSelected}
              isEnrolled={isEnrolled}
              isMutating={isMutating}
              challengesStatus={challengeStatusByGame?.[course.id]}
              progress={progress}
              bannerStyle={getBannerStyle(course.banner)}
              lastUpdatedLabel={formatDate(
                course.updated_at ?? course.created_at
              )}
              onSelect={onSelectCourse}
              onOpen={onOpenCourse}
            />
          );
        })}

      {!isLoading &&
        isLoadingMore &&
        Array.from({ length: loadingMoreSkeletonCount }).map((_, index) => (
          <article
            key={`loading-more-${index}`}
            className="course-card skeleton-card"
          >
            <div className="skeleton-line wide" />
            <div className="skeleton-line" />
            <div className="skeleton-line short" />
            <div className="skeleton-line" />
          </article>
        ))}
    </section>
  );
}
