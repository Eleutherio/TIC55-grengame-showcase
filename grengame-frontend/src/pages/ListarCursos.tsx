import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import CourseFocus from "../components/CourseFocus";
import CourseFilters from "../components/CourseFilters";
import CourseHero from "../components/CourseHero";
import CoursesGrid from "../components/CoursesGrid";
import Leadboard, { type LeaderboardEntry } from "../components/Leadboard";
import type { CourseChallengesBadgeStatus } from "../components/CourseChallengesBadge";
import "./ListarCursos.css";
import { API_URL } from "../config/api";

type Course = {
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

type BadgeProgressTier = {
  tier?: number | string;
  is_achieved?: unknown;
  is_unlocked?: unknown;
};

type BadgeProgressEntry = {
  game_id?: number | string;
  tiers?: BadgeProgressTier[];
};

const API_BASE = API_URL;
const COURSES_ENDPOINT = `${API_BASE}/auth/games/`;
const PROGRESS_ENDPOINT = `${API_BASE}/auth/progress/list/`;
const BADGES_ENDPOINT = `${API_BASE}/gamification/badges/`;
const LAST_PLAYED_KEY = "lastPlayedCourseId";
const LAST_PLAYED_COURSE_KEY = "lastPlayedCourseData";
const COURSES_PAGE_SIZE = 10;
type ListarCursosLocationState = {
  focusCourseId?: number;
};

type PaginatedCoursesResponse = {
  results: Course[];
  pagination?: {
    page?: number;
    limit?: number;
    total?: number;
    total_pages?: number;
    has_next?: boolean;
    has_previous?: boolean;
  };
};

const DICAS_PROGRESSO = [
  "Complete os jogos para completar as missões e ganhar mais pontos.",
  "Games 100% concluídos rendem mais XP e ajudam no ranking.",
  "Volte todo dia: consistência acelera seu avanço de nível.",
  "Finalize atividades para desbloquear suas badges.",
];

const resolveBadgeProgressEntries = (payload: unknown): BadgeProgressEntry[] => {
  if (Array.isArray(payload)) {
    return payload as BadgeProgressEntry[];
  }

  if (payload && typeof payload === "object") {
    const parsed = payload as {
      progress?: unknown;
    };

    if (Array.isArray(parsed.progress)) {
      return parsed.progress as BadgeProgressEntry[];
    }
  }

  return [];
};

const hasTierFiveUnlocked = (tiers: BadgeProgressTier[]) =>
  tiers.some((tierItem) => {
    const tierValue =
      typeof tierItem?.tier === "number"
        ? tierItem.tier
        : Number(tierItem?.tier);
    if (!Number.isFinite(tierValue) || tierValue !== 5) {
      return false;
    }

    const isUnlocked = tierItem.is_unlocked === true;
    const isAchieved = tierItem.is_achieved === true;
    return isUnlocked || isAchieved;
  });

const buildChallengeStatusByGame = (
  payload: unknown
): Record<number, CourseChallengesBadgeStatus> => {
  const entries = resolveBadgeProgressEntries(payload);
  const groupedByGame = new Map<number, BadgeProgressEntry[]>();

  entries.forEach((entry) => {
    const gameId =
      typeof entry?.game_id === "number"
        ? entry.game_id
        : Number(entry?.game_id);
    if (!Number.isFinite(gameId)) {
      return;
    }

    const currentEntries = groupedByGame.get(gameId) ?? [];
    currentEntries.push(entry);
    groupedByGame.set(gameId, currentEntries);
  });

  const statusByGame: Record<number, CourseChallengesBadgeStatus> = {};
  groupedByGame.forEach((gameEntries, gameId) => {
    if (gameEntries.length === 0) {
      return;
    }

    const isCompletedForAllCriteria = gameEntries.every((entry) => {
      const tiers = Array.isArray(entry.tiers) ? entry.tiers : [];
      return hasTierFiveUnlocked(tiers);
    });

    statusByGame[gameId] = isCompletedForAllCriteria
      ? "completed"
      : "available";
  });

  return statusByGame;
};

const formatDate = (rawDate?: string) => {
  if (!rawDate) return "Data não informada";
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return "Data não informada";
  return parsed.toLocaleDateString("pt-BR");
};

const getBannerStyle = (banner?: string | null) => {
  if (!banner) return undefined;
  const resolved = banner.startsWith("http")
    ? banner
    : banner.startsWith("/")
      ? `${API_BASE}${banner}`
      : banner;
  return {
    backgroundImage: `url(${resolved})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
};

export default function ListarCursos() {
  const navigate = useNavigate();
  const location = useLocation();
  const focusCourseId =
    (location.state as ListarCursosLocationState | null)?.focusCourseId ?? null;
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("todas");
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const [mobilePage, setMobilePage] = useState(1);
  const [hasMoreCourses, setHasMoreCourses] = useState(false);
  const [isLoadingMoreCourses, setIsLoadingMoreCourses] = useState(false);
  const [totalCourses, setTotalCourses] = useState<number | null>(null);
  const [lastPlayedCourse, setLastPlayedCourse] = useState<Course | null>(null);
  const [forceEmptyLeaderboard, setForceEmptyLeaderboard] = useState(false);
  const [dicaIndex, setDicaIndex] = useState(0);
  const [dicaPausada, setDicaPausada] = useState(false);
  const dicaIntervalRef = useRef<number | null>(null);
  const [leaderboardEntries, setLeaderboardEntries] = useState<
    LeaderboardEntry[]
  >([]);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [challengeStatusByGame, setChallengeStatusByGame] = useState<
    Record<number, CourseChallengesBadgeStatus>
  >({});
  const [focusedCourse, setFocusedCourse] = useState<Course | null>(null);
  const [appliedFocusId, setAppliedFocusId] = useState<number | null>(null);
  const focusProgress = Math.max(
    0,
    Math.min(100, focusedCourse?.progress_percentage ?? 0)
  );
  useEffect(() => {
    if (focusedCourse) {
      document.body.classList.add("inscrever-focus-mode");
    } else {
      document.body.classList.remove("inscrever-focus-mode");
    }
    return () => {
      document.body.classList.remove("inscrever-focus-mode");
    };
  }, [focusedCourse]);

  const currentUserId = useMemo(() => {
    try {
      const token = localStorage.getItem("accessToken");
      if (token) {
        const parts = token.split(".");
        if (parts.length === 3) {
          const decoded = JSON.parse(atob(parts[1]));
          if (decoded.user_id) {
            return Number(decoded.user_id);
          }
        }
      }
    } catch (error) {
      console.error("Erro ao decodificar token:", error);
    }
    return undefined;
  }, []);

  const fetchCourses = useCallback(
    async (
      options: {
        page?: number;
        append?: boolean;
      } = {}
    ) => {
      const nextPage = Number.isFinite(options.page) ? options.page ?? 1 : 1;
      const shouldAppend = Boolean(options.append);
      if (shouldAppend) {
        setIsLoadingMoreCourses(true);
      } else {
        setIsLoading(true);
      }
      setError(null);

      try {
        const token = localStorage.getItem("accessToken");
        const headers = {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };
        const coursesUrl = (() => {
          const params = new URLSearchParams();
          params.set("page", String(nextPage));
          params.set("limit", String(COURSES_PAGE_SIZE));
          return `${COURSES_ENDPOINT}?${params.toString()}`;
        })();
        const coursesRequest = fetch(coursesUrl, { headers });
        const progressRequest = token
          ? fetch(PROGRESS_ENDPOINT, { headers })
          : Promise.resolve<Response | null>(null);

        const [response, progressResponse] = await Promise.all([
          coursesRequest,
          progressRequest,
        ]);

        if (!response.ok) {
          throw new Error(`Falha ao carregar cursos (${response.status})`);
        }

        const payload = (await response.json()) as
          | Course[]
          | PaginatedCoursesResponse;
        let data: Course[] = [];
        let pagination: PaginatedCoursesResponse["pagination"] = undefined;
        if (Array.isArray(payload)) {
          data = payload;
        } else if (payload && Array.isArray(payload.results)) {
          data = payload.results;
          pagination = payload.pagination;
        } else {
          throw new Error("Resposta inesperada ao buscar cursos.");
        }

        const progressByGame = new Map<
          number,
          {
            progress_percentage?: number;
            started_at?: string;
            updated_at?: string;
          }
        >();
        if (progressResponse) {
          try {
            if (progressResponse.ok) {
              const progressData = await progressResponse.json();
              if (Array.isArray(progressData)) {
                progressData.forEach((entry) => {
                  const rawGameId = entry?.game;
                  const gameId =
                    typeof rawGameId === "number" ? rawGameId : Number(rawGameId);
                  if (!Number.isFinite(gameId)) return;
                  const rawProgress = entry?.progress_percentage;
                  const progressPercentage =
                    typeof rawProgress === "number"
                      ? rawProgress
                      : Number(rawProgress);
                  const startedAt =
                    typeof entry?.started_at === "string"
                      ? entry.started_at
                      : undefined;
                  const updatedAt =
                    typeof entry?.updated_at === "string"
                      ? entry.updated_at
                      : undefined;
                  progressByGame.set(gameId, {
                    progress_percentage: Number.isFinite(progressPercentage)
                      ? progressPercentage
                      : undefined,
                    started_at: startedAt,
                    updated_at: updatedAt,
                  });
                });
              }
            } else {
              console.warn(
                `Falha ao carregar progresso (${progressResponse.status})`
              );
            }
          } catch (progressError) {
            console.warn("Erro ao carregar progresso", progressError);
          }
        }

        const normalizedCourses: Course[] = data.map((course) => {
          const progress = progressByGame.get(course.id);
          return {
            ...course,
            enrolled: Boolean(course.enrolled) || Boolean(progress),
            progress_percentage:
              typeof progress?.progress_percentage === "number"
                ? progress.progress_percentage
                : course.progress_percentage,
          };
        });

        let coursesSnapshot: Course[] = normalizedCourses;
        if (shouldAppend) {
          setCourses((current) => {
            const mergedById = new Map<number, Course>(
              current.map((course) => [course.id, course])
            );
            normalizedCourses.forEach((course) => {
              mergedById.set(course.id, course);
            });
            const merged = Array.from(mergedById.values());
            coursesSnapshot = merged;
            return merged;
          });
        } else {
          setCourses(normalizedCourses);
        }

        const responseLimit =
          typeof pagination?.limit === "number" && pagination.limit > 0
            ? pagination.limit
            : COURSES_PAGE_SIZE;
        const hasNext =
          typeof pagination?.has_next === "boolean"
            ? pagination.has_next
            : false;
        setMobilePage(nextPage);
        setHasMoreCourses(hasNext && data.length >= Math.min(responseLimit, COURSES_PAGE_SIZE));
        setTotalCourses(
          typeof pagination?.total === "number"
            ? pagination.total
            : coursesSnapshot.length
        );

        const lastPlayedFromProgressId = (() => {
          let latestGameId: number | null = null;
          let latestTimestamp = -1;
          progressByGame.forEach((progress, gameId) => {
            const candidate = progress.updated_at || progress.started_at;
            if (!candidate) return;
            const ts = Date.parse(candidate);
            if (Number.isNaN(ts)) return;
            if (ts > latestTimestamp) {
              latestTimestamp = ts;
              latestGameId = gameId;
            }
          });
          return latestGameId;
        })();

        const storedLastPlayedId = localStorage.getItem(LAST_PLAYED_KEY);
        const storedLastPlayedCourse = (() => {
          const rawCourse = localStorage.getItem(LAST_PLAYED_COURSE_KEY);
          if (!rawCourse) return null;
          try {
            const parsed = JSON.parse(rawCourse) as Partial<Course>;
            const parsedId =
              typeof parsed.id === "number" ? parsed.id : Number(parsed.id);
            if (!Number.isFinite(parsedId)) return null;
            return {
              ...parsed,
              id: parsedId,
              name: typeof parsed.name === "string" ? parsed.name : "",
              description:
                typeof parsed.description === "string" ? parsed.description : "",
            } as Course;
          } catch {
            return null;
          }
        })();
        const storedLastPlayedIdNumber = (() => {
          if (!storedLastPlayedId) return null;
          const parsed = Number(storedLastPlayedId);
          return Number.isFinite(parsed) ? parsed : null;
        })();
        const candidateLastPlayedId =
          lastPlayedFromProgressId ?? storedLastPlayedIdNumber;
        let nextLastPlayedCourse: Course | null = candidateLastPlayedId
          ? coursesSnapshot.find((course) => course.id === candidateLastPlayedId) ??
            null
          : null;
        let resolvedDeletedLastPlayed = false;

        if (!nextLastPlayedCourse && candidateLastPlayedId) {
          try {
            const detailResponse = await fetch(
              `${COURSES_ENDPOINT}${candidateLastPlayedId}/`,
              { headers }
            );
            if (detailResponse.ok) {
              const detailData = await detailResponse.json();
              if (detailData && typeof detailData === "object") {
                nextLastPlayedCourse = detailData as Course;
              }
            } else if (detailResponse.status === 404) {
              resolvedDeletedLastPlayed = true;
              if (storedLastPlayedIdNumber === candidateLastPlayedId) {
                localStorage.removeItem(LAST_PLAYED_KEY);
                localStorage.removeItem(LAST_PLAYED_COURSE_KEY);
              }
            }
          } catch (detailError) {
            console.warn(
              "Erro ao validar o último game jogado por id.",
              detailError
            );
          }
        }

        if (
          nextLastPlayedCourse &&
          storedLastPlayedCourse &&
          storedLastPlayedCourse.id === nextLastPlayedCourse.id
        ) {
          nextLastPlayedCourse = {
            ...nextLastPlayedCourse,
            enrolled:
              typeof storedLastPlayedCourse.enrolled === "boolean"
                ? storedLastPlayedCourse.enrolled
                : nextLastPlayedCourse.enrolled,
            progress_percentage:
              typeof storedLastPlayedCourse.progress_percentage === "number"
                ? storedLastPlayedCourse.progress_percentage
                : nextLastPlayedCourse.progress_percentage,
          };
        }

        if (!shouldAppend) {
          if (nextLastPlayedCourse) {
            const progress = progressByGame.get(nextLastPlayedCourse.id);
            const normalizedLastPlayedCourse: Course = {
              ...nextLastPlayedCourse,
              enrolled: Boolean(nextLastPlayedCourse.enrolled) || Boolean(progress),
              progress_percentage:
                typeof progress?.progress_percentage === "number"
                  ? progress.progress_percentage
                  : nextLastPlayedCourse.progress_percentage,
            };
            setLastPlayedCourse(normalizedLastPlayedCourse);
            setSelectedCourseId(normalizedLastPlayedCourse.id);
            localStorage.setItem(
              LAST_PLAYED_KEY,
              normalizedLastPlayedCourse.id.toString()
            );
            localStorage.setItem(
              LAST_PLAYED_COURSE_KEY,
              JSON.stringify(normalizedLastPlayedCourse)
            );
            setForceEmptyLeaderboard(false);
          } else {
            setLastPlayedCourse(null);
            setSelectedCourseId(null);
            localStorage.removeItem(LAST_PLAYED_KEY);
            localStorage.removeItem(LAST_PLAYED_COURSE_KEY);
            setForceEmptyLeaderboard(resolvedDeletedLastPlayed);
          }
        }
      } catch (fetchError) {
        if (shouldAppend) {
          setError("Falha ao carregar mais jogos. Tente novamente.");
        } else {
          setError(
            "Falha em carregar os jogos disponíveis. Entre em contato com o seu suporte."
          );
          setCourses([]);
          setSelectedCourseId(null);
          setHasMoreCourses(false);
        }
      } finally {
        if (shouldAppend) {
          setIsLoadingMoreCourses(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    []
  );

  const fetchBadgeChallenges = useCallback(async () => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setChallengeStatusByGame({});
      return;
    }

    try {
      const response = await fetch(BADGES_ENDPOINT, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        setChallengeStatusByGame({});
        return;
      }

      if (!response.ok) {
        throw new Error(`Falha ao carregar badges (${response.status})`);
      }

      const payload = await response.json().catch(() => null);
      setChallengeStatusByGame(buildChallengeStatusByGame(payload));
    } catch (badgeError) {
      console.warn("Erro ao carregar desafios por game", badgeError);
      setChallengeStatusByGame({});
    }
  }, []);

  useEffect(() => {
    void fetchCourses();
    void fetchBadgeChallenges();
  }, [fetchBadgeChallenges, fetchCourses]);

  useEffect(() => {
    if (DICAS_PROGRESSO.length === 0 || dicaPausada) return undefined;
    dicaIntervalRef.current = window.setInterval(() => {
      setDicaIndex((prev) => (prev + 1) % DICAS_PROGRESSO.length);
    }, 4000);
    return () => {
      if (dicaIntervalRef.current) {
        clearInterval(dicaIntervalRef.current);
      }
    };
  }, [dicaPausada]);

  const categories = useMemo(() => {
    const unique = new Set<string>();
    courses.forEach((course) => {
      if (course.category) unique.add(course.category);
    });
    return Array.from(unique);
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return courses.filter((course) => {
      const name = course.name ?? "";
      const description = course.description ?? "";
      const category = course.category ?? "";
      const matchesTerm =
        !term ||
        name.toLowerCase().includes(term) ||
        description.toLowerCase().includes(term) ||
        category.toLowerCase().includes(term);

      const matchesCategory =
        categoryFilter === "todas" || category === categoryFilter;

      return matchesTerm && matchesCategory;
    });
  }, [courses, searchTerm, categoryFilter]);

  const noResults = !isLoading && filteredCourses.length === 0;

  const selectedCourse = (() => {
    if (noResults) return null;
    if (selectedCourseId == null) {
      return filteredCourses[0] || null;
    }
    return (
      filteredCourses.find((course) => course.id === selectedCourseId) ||
      courses.find((course) => course.id === selectedCourseId) ||
      null
    );
  })();

  const activeCourse = lastPlayedCourse ?? null;

  const isCourseEnrolled = (course: Course) => Boolean(course.enrolled);

  const handleSelectCourse = useCallback((course: Course) => {
    setSelectedCourseId(course.id);
    setForceEmptyLeaderboard(false);
    setFeedbackMessage(null);
    setEnrollError(null);
  }, []);

  const handleFocusCourse = (course: Course) => {
    handleSelectCourse(course);
    setFocusedCourse(course);
  };

  const handleCloseFocus = () => {
    document.body.classList.remove("inscrever-returning");
    setFocusedCourse(null);
  };

  const persistLastPlayed = useCallback((course: Course) => {
    setLastPlayedCourse(course);
    localStorage.setItem(LAST_PLAYED_KEY, course.id.toString());
    localStorage.setItem(LAST_PLAYED_COURSE_KEY, JSON.stringify(course));
  }, []);

  useEffect(() => {
    const targetId = focusCourseId ?? null;
    if (!targetId || appliedFocusId === targetId || courses.length === 0) {
      return;
    }
    const course = courses.find((item) => item.id === targetId);
    if (!course) return;
    handleSelectCourse(course);
    setFocusedCourse(course);
    setAppliedFocusId(targetId);
  }, [appliedFocusId, courses, focusCourseId, handleSelectCourse]);

  const touchProgress = useCallback(async (courseId: number) => {
    const token = localStorage.getItem("accessToken");
    if (!token) return;
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    try {
      const listResponse = await fetch(
        `${PROGRESS_ENDPOINT}?game_id=${courseId}`,
        { headers }
      );
      if (!listResponse.ok) {
        throw new Error(`Falha ao buscar progresso (${listResponse.status})`);
      }
      const listData = await listResponse.json();
      if (!Array.isArray(listData) || listData.length === 0) return;

      const progressEntry = listData[0];
      const progressId =
        typeof progressEntry?.id === "number"
          ? progressEntry.id
          : Number(progressEntry?.id);
      if (!Number.isFinite(progressId)) return;

      const completedAt =
        typeof progressEntry?.completed_at === "string"
          ? progressEntry.completed_at
          : null;
      const rawProgress = progressEntry?.progress_percentage;
      const progressPercentage =
        typeof rawProgress === "number" ? rawProgress : Number(rawProgress);
      const shouldSendProgress =
        Number.isFinite(progressPercentage) &&
        !(completedAt && progressPercentage === 100);

      const updateResponse = await fetch(
        `${API_BASE}/auth/progress/${progressId}/`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(
            shouldSendProgress
              ? { progress_percentage: progressPercentage }
              : {}
          ),
        }
      );
      if (!updateResponse.ok) {
        throw new Error(
          `Falha ao atualizar progresso (${updateResponse.status})`
        );
      }
    } catch (touchError) {
      console.warn("Erro ao atualizar acesso ao curso", touchError);
    }
  }, []);

  const handleConfirmInscricao = async (course?: Course | null) => {
    const targetCourse = course ?? activeCourse;
    if (!targetCourse || isEnrolling) return;

    // Se já está inscrito, apenas navega para trilhas
    if (isCourseEnrolled(targetCourse)) {
      await touchProgress(targetCourse.id);
      persistLastPlayed({ ...targetCourse, enrolled: true });
      navigate(`/app/trilhas/${targetCourse.id}`);
      return;
    }

    setIsEnrolling(true);
    setEnrollError(null);
    setFeedbackMessage(null);

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${API_BASE}/auth/progress/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          game: targetCourse.id,
          progress_percentage: 0,
          game_points: 0,
        }),
      });

      if (!response.ok) {
        throw new Error(`Falha ao matricular (${response.status})`);
      }

      persistLastPlayed({
        ...targetCourse,
        enrolled: true,
        progress_percentage: targetCourse.progress_percentage ?? 0,
      });
      // Após inscrever, recarregar cursos para garantir sincronização
      await fetchCourses();
      await fetchBadgeChallenges();

      // Navegar para trilhas após criar progresso
      setTimeout(() => {
        navigate(`/app/trilhas/${targetCourse.id}`);
      }, 800);
    } catch (enrollErr) {
      console.warn("Erro ao iniciar o jogo", enrollErr);
      setEnrollError(
        "Falha ao iniciar o seu game. Tente novamente mais tarde."
      );
    } finally {
      setIsEnrolling(false);
    }
  };

  const handleAbandonar = async (courseToAbandon?: Course) => {
    const course = courseToAbandon || activeCourse;
    if (!course || isDropping) return;
    setIsDropping(true);
    setEnrollError(null);
    setFeedbackMessage(null);

    try {
      const token = localStorage.getItem("accessToken");
      // Busca o ID do progresso para deletar
      const progressResponse = await fetch(
        `${API_BASE}/auth/progress/list/?game_id=${course.id}`,
        {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      if (!progressResponse.ok) {
        throw new Error("Falha ao buscar progresso");
      }

      const progressData = await progressResponse.json();
      if (!progressData || progressData.length === 0) {
        throw new Error("Progresso não encontrado");
      }

      const progressId = progressData[0].id;
      const response = await fetch(`${API_BASE}/auth/progress/${progressId}/`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        throw new Error(`Falha ao abandonar (${response.status})`);
      }

      // Após abandonar, recarregar cursos para garantir sincronização
      await fetchCourses();
      await fetchBadgeChallenges();

      // Se o curso abandonado era o último jogado, limpar do localStorage
      const lastPlayedId = localStorage.getItem(LAST_PLAYED_KEY);
      if (lastPlayedId === course.id.toString()) {
        localStorage.removeItem(LAST_PLAYED_KEY);
        localStorage.removeItem(LAST_PLAYED_COURSE_KEY);
        setLastPlayedCourse(null);
      }
    } catch (dropErr) {
      console.warn("Erro ao abandonar o jogo", dropErr);
      setEnrollError(
        "Não foi possível abandonar o jogo agora. Tente novamente."
      );
    } finally {
      setIsDropping(false);
    }
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setCategoryFilter("todas");
    setSelectedCourseId(null);
    setFocusedCourse(null);
    setFeedbackMessage(null);
    setEnrollError(null);
  };
  const handleRetry = () => {
    void fetchCourses({ page: 1 });
    void fetchBadgeChallenges();
  };

  const handleLoadMoreCourses = () => {
    if (isLoading || isLoadingMoreCourses || !hasMoreCourses) {
      return;
    }
    void fetchCourses({ page: mobilePage + 1, append: true });
  };

  const leaderboardCourse = forceEmptyLeaderboard
    ? null
    : selectedCourse ?? activeCourse ?? courses[0] ?? null;
  const leaderboardCourseName = leaderboardCourse?.name || undefined;
  const leaderboardCourseId = leaderboardCourse?.id;
  const showUserInLeaderboard = Boolean(
    leaderboardCourse && isCourseEnrolled(leaderboardCourse)
  );
  const leaderboardEntriesForView = useMemo(() => {
    if (!currentUserId || showUserInLeaderboard) return leaderboardEntries;
    return leaderboardEntries.filter((entry) => entry.userId !== currentUserId);
  }, [currentUserId, leaderboardEntries, showUserInLeaderboard]);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      if (!leaderboardCourseId) {
        setLeaderboardEntries([]);
        setLeaderboardError(null);
        setLeaderboardLoading(false);
        return;
      }
      setLeaderboardLoading(true);
      setLeaderboardError(null);
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(
          `${API_BASE}/auth/games/${leaderboardCourseId}/ranking/`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          }
        );
        if (!response.ok) {
          throw new Error(`Falha ao carregar leaderboard (${response.status})`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Formato inesperado ao buscar leaderboard.");
        }
        const normalizedLeaderboard: LeaderboardEntry[] = data.map(
          (entry: any) => {
            const rawTier =
              typeof entry?.tier === "string"
                ? entry.tier
                : typeof entry?.nivel === "string"
                  ? entry.nivel
                  : "";
            const nivel = rawTier.trim();

            const userId =
              typeof entry?.userId === "number"
                ? entry.userId
                : typeof entry?.user_id === "number"
                  ? entry.user_id
                  : typeof entry?.user_id === "string"
                    ? Number(entry.user_id) || undefined
                    : undefined;

            const rawPoints =
              entry?.points ?? entry?.total_points ?? entry?.totalPoints ?? 0;
            const points =
              typeof rawPoints === "number"
                ? rawPoints
                : Number(rawPoints) || 0;

            return {
              ...entry,
              userId,
              nivel: nivel || undefined,
              tier: nivel || undefined,
              points,
            } as LeaderboardEntry;
          }
        );
        setLeaderboardEntries(normalizedLeaderboard);
      } catch (err) {
        console.warn("Erro ao carregar leaderboard", err);
        setLeaderboardError("Falha em consultar jogadores. Contate o suporte.");
        setLeaderboardEntries([]);
      } finally {
        setLeaderboardLoading(false);
      }
    };

    fetchLeaderboard();
  }, [leaderboardCourseId]);

  return (
    <div
      className={`inscrever-wrapper ${focusedCourse ? "is-focused" : ""}`}
      role="main"
      aria-labelledby="hero-title"
    >
      <div
        className={`inscrever-content ${focusedCourse ? "is-dimmed" : ""}`}
        aria-hidden={focusedCourse ? true : undefined}
      >
        <div className="top-grid">
          <CourseHero
            dicaText={DICAS_PROGRESSO[dicaIndex]}
            onPauseDica={() => setDicaPausada(true)}
            onResumeDica={() => setDicaPausada(false)}
            onToggleDica={() => setDicaPausada((prev) => !prev)}
            isLoading={isLoading}
            coursesCount={totalCourses ?? courses.length}
            categoriesCount={categories.length}
            activeCourse={activeCourse}
            isActiveCourseEnrolled={Boolean(
              activeCourse && isCourseEnrolled(activeCourse)
            )}
            activeCourseLastUpdatedLabel={
              activeCourse
                ? formatDate(activeCourse.updated_at ?? activeCourse.created_at)
                : ""
            }
            isEnrolling={isEnrolling}
            isDropping={isDropping}
            feedbackMessage={feedbackMessage}
            enrollError={enrollError}
            onConfirmInscricao={() => handleConfirmInscricao(activeCourse)}
            onAbandonar={() => handleAbandonar(activeCourse ?? undefined)}
          />

          <CourseFilters
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            categoryFilter={categoryFilter}
            onCategoryFilterChange={setCategoryFilter}
            categories={categories}
            onReset={handleResetFilters}
            noResults={noResults}
          />

          <div
            className="leadboard-wrapper"
            aria-labelledby="leaderboard-title"
          >
            <Leadboard
              courseName={leaderboardCourseName}
              entries={leaderboardEntriesForView}
              isLoading={leaderboardLoading}
              errorMessage={leaderboardError}
              currentUserId={showUserInLeaderboard ? currentUserId : undefined}
              trackedGameId={leaderboardCourseId}
              emptyMessage={
                leaderboardCourseId
                  ? "Nenhum jogador no ranking deste game ainda."
                  : "Escolha um game na lista para ver o ranking."
              }
            />
          </div>
        </div>

        <div className="inscrever-page">
          {error ? (
            <div className="inline-alert" role="alert">
              <span>{error}</span>{" "}
              <button
                type="button"
                className="ghost-button"
                onClick={handleRetry}
              >
                Tentar novamente
              </button>
            </div>
          ) : (
            !isLoading &&
            courses.length === 0 && (
              <div className="inline-alert info" role="status">
                Ainda não temos games cadastrados.
              </div>
            )
          )}

          <CoursesGrid
            isLoading={isLoading}
            isLoadingMore={isLoadingMoreCourses}
            filteredCourses={filteredCourses}
            selectedCourseId={selectedCourseId}
            isEnrolling={isEnrolling}
            isDropping={isDropping}
            challengeStatusByGame={challengeStatusByGame}
            onSelectCourse={handleSelectCourse}
            onOpenCourse={handleFocusCourse}
            isCourseEnrolled={isCourseEnrolled}
            getBannerStyle={getBannerStyle}
            formatDate={formatDate}
          />
          {!error && !isLoading && courses.length > 0 && (
            <div className="mobile-pagination-wrapper" aria-live="polite">
              {hasMoreCourses ? (
                <button
                  type="button"
                  className="mobile-load-more-button"
                  onClick={handleLoadMoreCourses}
                  disabled={isLoadingMoreCourses}
                >
                  {isLoadingMoreCourses ? "Carregando..." : "Carregar mais"}
                </button>
              ) : (
                <p className="mobile-pagination-end">
                  Você chegou ao fim da lista.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
      {!isLoading && focusedCourse && (
        <CourseFocus
          course={focusedCourse}
          progress={focusProgress}
          bannerStyle={getBannerStyle(focusedCourse.banner)}
          lastUpdatedLabel={formatDate(
            focusedCourse.updated_at ?? focusedCourse.created_at
          )}
          isEnrolled={isCourseEnrolled(focusedCourse)}
          challengesStatus={challengeStatusByGame[focusedCourse.id]}
          onClose={handleCloseFocus}
          onConfirm={() => handleConfirmInscricao(focusedCourse)}
        />
      )}
    </div>
  );
}
