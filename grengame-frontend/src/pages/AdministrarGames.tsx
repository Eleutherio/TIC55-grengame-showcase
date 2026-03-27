import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from "react";
import { useBlocker, useNavigate } from "react-router-dom";

import "./AdministrarGames.css";
import { API_URL } from "../config/api";

type Course = {
  id: number;
  name: string;
  description: string;
  category?: string;
  banner?: string | null;
  created_at?: string;
  updated_at?: string;
};

type FieldErrors = {
  name?: string;
  description?: string;
  category?: string;
  banner?: string;
};


const COURSES_ENDPOINT = `${API_URL}/auth/games/`;
const DESCRIPTION_MAX_LENGTH = 500;
const BANNER_MAX_SIZE = 5 * 1024 * 1024;
const REDIRECT_DURATION_SECONDS = 2;

const getCourseBannerUrl = (banner?: string | null) => {
  if (!banner) return undefined;
  if (banner.startsWith("http")) return banner;
  if (banner.startsWith("/")) return `${API_URL}${banner}`;
  return banner;
};

const getFirstErrorMessage = (value: unknown) => {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === "string").join(" ");
  }
  return typeof value === "string" ? value : "";
};

const getApiErrorMessage = (payload: unknown) => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) return getFirstErrorMessage(payload);
  if (typeof payload !== "object") return "";

  const parsed = payload as Record<string, unknown>;
  return (
    getFirstErrorMessage(parsed.error) ||
    getFirstErrorMessage(parsed.detail) ||
    getFirstErrorMessage(parsed.non_field_errors) ||
    ""
  );
};

const hasFieldErrors = (errors: FieldErrors) =>
  Object.values(errors).some((value) => Boolean(value));

export default function AdministrarGames() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerFileName, setBannerFileName] = useState("");
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState("");
  const [showBannerModal, setShowBannerModal] = useState(false);
  const [tempBannerFile, setTempBannerFile] = useState<File | null>(null);
  const [tempBannerFileName, setTempBannerFileName] = useState("");
  const [tempBannerPreviewUrl, setTempBannerPreviewUrl] = useState("");
  const [bannerError, setBannerError] = useState("");
  const [isBannerDragging, setIsBannerDragging] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [, setSaveSuccess] = useState("");
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showCoursesList, setShowCoursesList] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null);
  const [selectedCourseIds, setSelectedCourseIds] = useState<number[]>([]);
  const [deleteCourseIds, setDeleteCourseIds] = useState<number[]>([]);
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [coursesSearchTerm, setCoursesSearchTerm] = useState("");
  const [coursesCategoryFilter, setCoursesCategoryFilter] = useState("todas");
  const [redirectGameId, setRedirectGameId] = useState<string | null>(null);
  const [isRedirectModalOpen, setIsRedirectModalOpen] = useState(false);
  const [redirectSeconds, setRedirectSeconds] = useState(
    REDIRECT_DURATION_SECONDS,
  );
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const coursesToggleRef = useRef<HTMLElement | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const basicInfoRef = useRef<HTMLDivElement | null>(null);
  const saveButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectAllCheckboxRef = useRef<HTMLInputElement | null>(null);
  const redirectIntervalRef = useRef<number | null>(null);
  const redirectTimeoutRef = useRef<number | null>(null);
  const blocker = useBlocker(hasUnsavedChanges);
  const [tourStep, setTourStep] = useState<number | null>(null);
  const [tourPosition, setTourPosition] = useState<{
    top: number;
    left: number;
    placement: "top" | "bottom";
  } | null>(null);

  // Carrega lista inicial apenas no mount.
  useEffect(() => {
    const fetchCourses = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(COURSES_ENDPOINT, {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Falha ao buscar games");
        }

        const data = await response.json();
        setCourses(Array.isArray(data) ? data : []);
      } catch {
        setSaveError("Nao foi possivel carregar os games.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchCourses();
  }, []);

  // Mantem o modal de saida alinhado ao estado do blocker.
  useEffect(() => {
    if (blocker.state === "blocked") {
      setShowUnsavedModal(true);
    } else if (blocker.state === "unblocked") {
      setShowUnsavedModal(false);
    }
  }, [blocker.state]);

  useEffect(() => {
    return () => {
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
    };
  }, [bannerPreviewUrl]);

  // Evita timers pendurados entre aberturas/fechamentos do modal.
  const clearRedirectTimers = () => {
    if (redirectIntervalRef.current) {
      window.clearInterval(redirectIntervalRef.current);
      redirectIntervalRef.current = null;
    }
    if (redirectTimeoutRef.current) {
      window.clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
  };

  const handleCloseRedirectModal = () => {
    clearRedirectTimers();
    setIsRedirectModalOpen(false);
    setRedirectGameId(null);
    setRedirectSeconds(REDIRECT_DURATION_SECONDS);
  };

  useEffect(() => {
    if (!isRedirectModalOpen || !redirectGameId) {
      return;
    }

    setRedirectSeconds(REDIRECT_DURATION_SECONDS);
    clearRedirectTimers();

    // Intervalo atualiza o contador, timeout executa o redirect real.
    redirectIntervalRef.current = window.setInterval(() => {
      setRedirectSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    redirectTimeoutRef.current = window.setTimeout(() => {
      navigate("/app/AdministrarMissoes", {
        state: { preselectedGameId: redirectGameId },
      });
      setIsRedirectModalOpen(false);
      setRedirectGameId(null);
    }, REDIRECT_DURATION_SECONDS * 1000);

    return () => {
      clearRedirectTimers();
    };
  }, [isRedirectModalOpen, navigate, redirectGameId]);

  const previewName = name.trim() || "Nome do game";
  const previewCategory = category.trim() || "Sem categoria";
  const previewDescription =
    description.trim() || "Sem descricao disponivel no momento.";
  const previewProgress = 0;
  const previewPoints = 0;
  const previewDate = new Date().toLocaleDateString("pt-BR");
  const previewThumbStyle = bannerPreviewUrl
    ? {
      backgroundImage: `url(${bannerPreviewUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }
    : undefined;
  const modalPreviewUrl = tempBannerPreviewUrl || bannerPreviewUrl;
  const modalPreviewThumbStyle = modalPreviewUrl
    ? {
      backgroundImage: `url(${modalPreviewUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }
    : undefined;
  const isEditing = editingCourseId !== null;
  // useMemo evita recriar as definicoes do tour a cada render.
  const tourSteps = useMemo(
    () => [
      {
        id: "courses",
        title: "Games cadastrados",
        description:
          "Aqui fica os games já cadastrados e os novos após serem criados. Utilize os filtros para procurar um game específico se precisar.",
        ref: coursesToggleRef,
      },
      {
        id: "basic",
        title: "Informações básicas do game",
        description:
          "Defina nome, descrição, categoria e o banner principal. Ao salvar, você verá um aviso de redirecionamento automático para configurar as missões.",
        ref: basicInfoRef,
      },
      {
        id: "preview",
        title: "Prévia do game",
        description:
          "Todas as mudanças vão aparecendo ali conforme são adicionadas.",
        ref: previewRef,
      },
      {
        id: "save",
        title: "Salvar e prosseguir para missões",
        description:
          "Aqui, quando você tiver preenchido as informações básicas do seu game, você irá salvar e prosseguir para a montagem das suas Missões. Lá você termina o fluxo de montagem do seu game.",
        ref: saveButtonRef,
      },
    ],
    [],
  );
  const currentTour = tourStep !== null ? tourSteps[tourStep] : null;
  const activeTourId = currentTour?.id ?? null;
  const markUnsavedChanges = () => {
    if (!hasUnsavedChanges) {
      setHasUnsavedChanges(true);
    }
  };
  const clearFieldError = (field: keyof FieldErrors) => {
    setFieldErrors((prev) =>
      prev[field] ? { ...prev, [field]: undefined } : prev,
    );
  };
  const handleStartTour = () => {
    setTourStep(0);
  };
  const handleTourNext = () => {
    setTourStep((prev) => {
      if (prev === null) return null;
      if (tourSteps[prev]?.id === "courses") {
        setShowCoursesList(false);
      }
      const nextStep = prev + 1;
      return nextStep >= tourSteps.length ? null : nextStep;
    });
  };
  const handleTourSkip = () => {
    if (activeTourId === "courses") {
      setShowCoursesList(false);
    }
    setTourStep(null);
  };
  const handleStayOnPage = () => {
    if (blocker.state === "blocked") {
      blocker.reset();
    }
    setShowUnsavedModal(false);
  };
  const handleLeavePage = () => {
    if (blocker.state !== "blocked") {
      setShowUnsavedModal(false);
      return;
    }
    setShowUnsavedModal(false);
    setHasUnsavedChanges(false);
    blocker.proceed();
  };

  const openDeleteModal = (ids: number[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (!uniqueIds.length) {
      return;
    }
    setDeleteCourseIds(uniqueIds);
    setDeleteConfirmChecked(false);
  };
  const closeDeleteModal = () => {
    setDeleteCourseIds([]);
    setDeleteConfirmChecked(false);
  };
  const toggleCourseSelection = (id: number) => {
    setSelectedCourseIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id],
    );
  };
  const confirmDeleteCourse = async () => {
    if (!deleteCourseIds.length) return;

    const idsToDelete = Array.from(new Set(deleteCourseIds));
    setSaveError("");

    const results = await Promise.all(idsToDelete.map((id) => deleteCourse(id)));
    const deletedIds = idsToDelete.filter((_, index) => results[index]);

    if (deletedIds.length > 0) {
      const deletedIdsSet = new Set(deletedIds);
      setCourses((prev) =>
        prev.filter((course) => !deletedIdsSet.has(course.id)),
      );
      setSelectedCourseIds((prev) =>
        prev.filter((id) => !deletedIdsSet.has(id)),
      );
    }

    if (deletedIds.length !== idsToDelete.length) {
      setSaveError(
        idsToDelete.length > 1
          ? "Não foi possível excluir um ou mais games selecionados. Tente novamente."
          : "Não foi possível excluir o game. Tente novamente.",
      );
    }

    closeDeleteModal();
  };

  useEffect(() => {
    if (tourStep !== null && activeTourId === "courses") {
      setShowCoursesList(true);
    }
    if (tourStep === null || !currentTour?.ref.current) {
      setTourPosition(null);
      return;
    }

    const target = currentTour.ref.current;
    const updatePosition = () => {
      const left = window.innerWidth / 2;
      const top = window.innerHeight / 2;
      setTourPosition({ top, left, placement: "top" });
    };

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    updatePosition();

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, { passive: true });

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition);
    };
  }, [tourStep, currentTour, activeTourId]);

  // Fluxo central de validacao + persistencia do game.
  const handleSaveCourse = async () => {
    const trimmedName = name.trim();
    const trimmedDescription = description.trim();
    const trimmedCategory = category.trim();

    setSaveError("");
    setFieldErrors({});

    const nextFieldErrors: FieldErrors = {};

    if (!trimmedName) {
      nextFieldErrors.name = "Preencha o nome do game antes de salvar.";
    } else if (trimmedName.length > 100) {
      nextFieldErrors.name = "Nome do game deve ter até 100 caracteres.";
    }

    if (!trimmedDescription) {
      nextFieldErrors.description =
        "Preencha a descrição do game antes de salvar.";
    } else if (trimmedDescription.length > DESCRIPTION_MAX_LENGTH) {
      nextFieldErrors.description = `Descrição deve ter no máximo ${DESCRIPTION_MAX_LENGTH} caracteres.`;
    }

    if (trimmedCategory.length > 50) {
      nextFieldErrors.category = "Categoria deve ter até 50 caracteres.";
    }

    if (hasFieldErrors(nextFieldErrors)) {
      setFieldErrors(nextFieldErrors);
      setSaveError("Corrija os campos destacados antes de salvar.");
      return;
    }

    setIsSaving(true);
    const targetCourseId = editingCourseId;
    const shouldUpdate = targetCourseId !== null;

    try {
      const token = localStorage.getItem("accessToken");
      const formData = new FormData();
      formData.append("name", trimmedName);
      formData.append("description", trimmedDescription);
      if (!shouldUpdate) {
        formData.append("is_active", "true");
      }
      if (trimmedCategory) formData.append("category", trimmedCategory);
      if (bannerFile) formData.append("banner", bannerFile);

      const response = await fetch(
        shouldUpdate
          ? `${COURSES_ENDPOINT}${targetCourseId}/`
          : COURSES_ENDPOINT,
        {
          method: shouldUpdate ? "PATCH" : "POST",
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: formData,
        },
      );

      // --- 2. Tratamento de Erros HTTP Dinâmico ---
      if (!response.ok) {
        // Log para o desenvolvedor (você)
        console.error("Erro HTTP:", response.status);

        const errorData = await response.json().catch(() => null);
        let errorMessage = "Não foi possível salvar o game. Tente novamente.";

        if (response.status === 400) {
          errorMessage = "Dados inválidos. Verifique os campos preenchidos.";

          if (errorData && typeof errorData === "object") {
            const errorMap = errorData as Record<string, unknown>;
            const nextFieldErrors: FieldErrors = {};

            const nameError = getFirstErrorMessage(errorMap.name);
            if (nameError) nextFieldErrors.name = nameError;

            const descriptionError = getFirstErrorMessage(errorMap.description);
            if (descriptionError)
              nextFieldErrors.description = descriptionError;

            const categoryError = getFirstErrorMessage(errorMap.category);
            if (categoryError) nextFieldErrors.category = categoryError;

            const bannerErrorMessage = getFirstErrorMessage(errorMap.banner);
            if (bannerErrorMessage) nextFieldErrors.banner = bannerErrorMessage;

            if (hasFieldErrors(nextFieldErrors)) {
              setFieldErrors(nextFieldErrors);
              errorMessage = "Verifique os campos destacados.";
            }

            const nonFieldError = getApiErrorMessage(errorMap);
            if (nonFieldError) {
              errorMessage = nonFieldError;
            }
          }
        } else {
          const backendMessage = getApiErrorMessage(errorData);
          if (backendMessage) {
            errorMessage = backendMessage;
          } else {
            switch (response.status) {
              case 401:
                errorMessage = "Não autenticado. Faça login novamente.";
                break;
              case 403:
                errorMessage = "Sem permissão. Contate o administrador.";
                break;
              case 413:
                errorMessage =
                  "Arquivo muito grande. Comprima o arquivo antes de enviar.";
                break;
              case 500:
                errorMessage =
                  "Erro no servidor. Espere um pouco e tente novamente.";
                break;
              default:
                errorMessage = `Erro inesperado (${response.status}). Tente novamente.`;
            }
          }
        }

        setSaveError(errorMessage);
        setIsSaving(false); // Importante parar o loading aqui
        return;
      }

      // --- 3. Sucesso ---
      const savedCourse = await response.json();
      if (shouldUpdate && targetCourseId !== null) {
        setCourses((prev) =>
          prev.map((course) =>
            course.id === targetCourseId ? savedCourse : course,
          ),
        );
      } else {
        setCourses((prev) => [...prev, savedCourse]);
      }

      setHasUnsavedChanges(false);
      setName("");
      setDescription("");
      setCategory("");
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl);
      }
      setBannerFile(null);
      setBannerFileName("");
      setBannerPreviewUrl("");
      setEditingCourseId(null);
      setFieldErrors({});

      setSaveSuccess(
        shouldUpdate
          ? "Game atualizado com sucesso!"
          : "Game salvo com sucesso!",
      );
      if (
        !shouldUpdate &&
        savedCourse?.id !== undefined &&
        savedCourse?.id !== null
      ) {
        setRedirectGameId(String(savedCourse.id));
        setIsRedirectModalOpen(true);
      }
    } catch {
      setSaveError(
        "Erro de conexão. Verifique sua internet e tente novamente.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const resetTempBanner = (options?: { revokePreview?: boolean }) => {
    const shouldRevoke = options?.revokePreview ?? true;
    if (shouldRevoke && tempBannerPreviewUrl) {
      URL.revokeObjectURL(tempBannerPreviewUrl);
    }
    setTempBannerFile(null);
    setTempBannerFileName("");
    setTempBannerPreviewUrl("");
    setBannerError("");
    setIsBannerDragging(false);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
  };

  const openBannerModal = () => {
    resetTempBanner({ revokePreview: true });
    setShowBannerModal(true);
  };

  const closeBannerModal = () => {
    resetTempBanner({ revokePreview: true });
    setShowBannerModal(false);
  };

  // Validacao de banner antes de permitir preview/salvar.
  const validateBannerFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      return "Selecione uma imagem válida (JPG, PNG ou WEBP).";
    }
    if (file.size > BANNER_MAX_SIZE) {
      return "Banner maior que 5MB não é permitido.";
    }
    return "";
  };

  const handleTempBannerFile = (file: File | null) => {
    if (!file) {
      return;
    }

    clearFieldError("banner");
    const validationError = validateBannerFile(file);
    if (validationError) {
      setBannerError(validationError);
      if (bannerInputRef.current) {
        bannerInputRef.current.value = "";
      }
      return;
    }

    if (tempBannerPreviewUrl) {
      URL.revokeObjectURL(tempBannerPreviewUrl);
    }

    setTempBannerFile(file);
    setTempBannerFileName(file.name);
    setTempBannerPreviewUrl(URL.createObjectURL(file));
    setBannerError("");
  };

  const handleBannerFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    handleTempBannerFile(file);
    event.target.value = "";
  };

  const handleBannerDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!isBannerDragging) {
      setIsBannerDragging(true);
    }
  };

  const handleBannerDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsBannerDragging(false);
  };

  const handleBannerDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsBannerDragging(false);
    const file = event.dataTransfer.files?.[0] ?? null;
    handleTempBannerFile(file);
  };

  const handleConfirmBanner = () => {
    if (!tempBannerFile || !tempBannerPreviewUrl) {
      setBannerError("Selecione uma imagem antes de salvar.");
      return;
    }

    markUnsavedChanges();
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
    }
    setBannerFile(tempBannerFile);
    setBannerFileName(tempBannerFileName || tempBannerFile.name);
    setBannerPreviewUrl(tempBannerPreviewUrl);
    setShowBannerModal(false);
    setTempBannerFile(null);
    setTempBannerFileName("");
    setTempBannerPreviewUrl("");
    setBannerError("");
    setIsBannerDragging(false);
    if (bannerInputRef.current) {
      bannerInputRef.current.value = "";
    }
  };

  const handleEditCourse = (course: Course) => {
    setName(course.name ?? "");
    setDescription(course.description ?? "");
    setCategory(course.category ?? "");
    if (bannerPreviewUrl) {
      URL.revokeObjectURL(bannerPreviewUrl);
    }
    setBannerFile(null);
    setBannerFileName("");
    setBannerPreviewUrl(getCourseBannerUrl(course.banner) ?? "");
    setBannerError("");
    setSaveError("");
    setFieldErrors({});
    setEditingCourseId(course.id);
    setHasUnsavedChanges(false);
  };

  const deleteCourse = async (id: number) => {
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${COURSES_ENDPOINT}${id}/`, {
        method: "DELETE",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  };

  const normalizedSearch = coursesSearchTerm.trim().toLowerCase();
  const listCategories = Array.from(
    new Set(
      courses
        .map((course) => course.category?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const filteredCourses = courses.filter((course) => {
    const nameValue = course.name ?? "";
    const descriptionValue = course.description ?? "";
    const categoryValue = course.category ?? "";
    const matchesSearch =
      !normalizedSearch ||
      nameValue.toLowerCase().includes(normalizedSearch) ||
      descriptionValue.toLowerCase().includes(normalizedSearch) ||
      categoryValue.toLowerCase().includes(normalizedSearch);
    const matchesCategory =
      coursesCategoryFilter === "todas" ||
      categoryValue === coursesCategoryFilter;
    return matchesSearch && matchesCategory;
  });
  const filteredCourseIds = useMemo(
    () => filteredCourses.map((course) => course.id),
    [filteredCourses],
  );
  const selectedCourseIdSet = useMemo(
    () => new Set(selectedCourseIds),
    [selectedCourseIds],
  );
  const selectedFilteredCount = filteredCourseIds.filter((id) =>
    selectedCourseIdSet.has(id),
  ).length;
  const areAllFilteredSelected =
    filteredCourseIds.length > 0 &&
    selectedFilteredCount === filteredCourseIds.length;
  const hasAnyFilteredSelected = selectedFilteredCount > 0;
  const hasAnySelectedCourses = selectedCourseIds.length > 0;
  const handleToggleSelectAllFiltered = () => {
    setSelectedCourseIds((prev) => {
      if (!filteredCourseIds.length) {
        return prev;
      }

      if (areAllFilteredSelected) {
        const filteredIdsSet = new Set(filteredCourseIds);
        return prev.filter((id) => !filteredIdsSet.has(id));
      }

      const nextSelectedIds = new Set(prev);
      filteredCourseIds.forEach((id) => {
        nextSelectedIds.add(id);
      });
      return Array.from(nextSelectedIds);
    });
  };
  const hasCourses = courses.length > 0;
  const hasFilteredCourses = filteredCourses.length > 0;
  const isBatchDelete = deleteCourseIds.length > 1;
  const deleteModalTitle = isBatchDelete ? "Excluir games" : "Excluir game";
  const deleteModalDescription = isBatchDelete
    ? `Essa ação não poderá ser desfeita. Confirme para excluir os ${deleteCourseIds.length} games selecionados.`
    : "Essa ação não poderá ser desfeita. Confirme para excluir o game.";
  const deleteModalActionLabel = isBatchDelete ? "Excluir games" : "Excluir game";

  useEffect(() => {
    const validCourseIds = new Set(courses.map((course) => course.id));
    setSelectedCourseIds((prev) => {
      const next = prev.filter((id) => validCourseIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [courses]);

  useEffect(() => {
    if (!selectAllCheckboxRef.current) {
      return;
    }
    selectAllCheckboxRef.current.indeterminate =
      hasAnyFilteredSelected && !areAllFilteredSelected;
  }, [areAllFilteredSelected, hasAnyFilteredSelected]);

  if (isLoading) {
    return (
      <div className="manage-courses-page">
        <div className="manage-card">
          <p>Carregando games...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="manage-courses-page">
      <section
        className={`courses-toggle ${activeTourId === "courses" ? "tour-highlight" : ""
          }`}
        ref={coursesToggleRef}
      >
        <div className="courses-toggle-header">
          <div className="courses-filters">
            <div className="courses-filter">
              <label htmlFor="courses-search">Filtrar games</label>
              <input
                id="courses-search"
                type="text"
                placeholder="Buscar por nome, categoria ou descricao"
                value={coursesSearchTerm}
                onChange={(event) => {
                  setCoursesSearchTerm(event.target.value);
                  if (!showCoursesList) {
                    setShowCoursesList(true);
                  }
                }}
              />
            </div>
            <div className="courses-filter">
              <label htmlFor="courses-category">Categoria</label>
              <select
                id="courses-category"
                value={coursesCategoryFilter}
                onChange={(event) => {
                  setCoursesCategoryFilter(event.target.value);
                  if (!showCoursesList) {
                    setShowCoursesList(true);
                  }
                }}
              >
                <option value="todas">Todas</option>
                {listCategories.map((categoryOption) => (
                  <option key={categoryOption} value={categoryOption}>
                    {categoryOption}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            type="button"
            className="pill-button secondary header-button"
            onClick={() => setShowCoursesList((prev) => !prev)}
          >
            {showCoursesList
              ? "Ocultar Games cadastrados"
              : "Mostrar Games cadastrados"}
          </button>
        </div>
        {showCoursesList && (
          <div className="courses-list">
            <div className="courses-list-header">
              <div className="courses-list-title-group">
                <p className="list-title">Games cadastrados</p>
                <span className="list-badge">
                  {filteredCourses.length} game(s)
                </span>
              </div>
              <button
                type="button"
                className="pill-button danger"
                onClick={() => openDeleteModal(selectedCourseIds)}
                disabled={!hasAnySelectedCourses}
              >
                Excluir selecionados ({selectedCourseIds.length})
              </button>
            </div>
            <div className="courses-selection-row">
              <label className="select-all-checkbox" htmlFor="courses-select-all">
                <input
                  id="courses-select-all"
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  checked={areAllFilteredSelected}
                  onChange={handleToggleSelectAllFiltered}
                  disabled={!hasFilteredCourses}
                />
                <span>Marcar todos</span>
              </label>
              <span className="selection-count" aria-live="polite">
                {selectedCourseIds.length} selecionado(s)
              </span>
            </div>

            {!hasCourses ? (
              <p className="empty-list">Nenhum game cadastrado ainda.</p>
            ) : !hasFilteredCourses ? (
              <p className="empty-list">
                Nenhum game encontrado com os filtros.
              </p>
            ) : (
              <ul className="course-items">
                {filteredCourses.map((course) => {
                  const courseName = course.name || "Sem nome";
                  const createdAt = course.created_at
                    ? new Date(course.created_at).toLocaleDateString("pt-BR")
                    : "";
                  const updatedAt = course.updated_at
                    ? new Date(course.updated_at).toLocaleDateString("pt-BR")
                    : "";
                  const bannerUrl = getCourseBannerUrl(course.banner);
                  const hasBanner = Boolean(bannerUrl);
                  const bannerAlt = `Banner do game ${courseName}`;

                  return (
                    <li key={course.id} className="course-item">
                      <div className="course-select">
                        <label
                          className="course-select-checkbox"
                          htmlFor={`course-select-${course.id}`}
                        >
                          <input
                            id={`course-select-${course.id}`}
                            type="checkbox"
                            checked={selectedCourseIdSet.has(course.id)}
                            onChange={() => toggleCourseSelection(course.id)}
                            aria-label={`Selecionar game ${courseName}`}
                          />
                        </label>
                      </div>
                      <div className="course-banner-frame">
                        {hasBanner ? (
                          <img
                            className="course-banner-image"
                            src={bannerUrl}
                            alt={bannerAlt}
                            loading="lazy"
                          />
                        ) : (
                          <div
                            className="course-banner-placeholder"
                            role="img"
                            aria-label="Game sem banner"
                          >
                            Game sem banner
                          </div>
                        )}
                      </div>
                      <div className="course-info">
                        <div className="course-title-row">
                          <p className="course-name">{courseName}</p>
                          <span className="course-category-badge">
                            {course.category || "Sem categoria"}
                          </span>
                        </div>
                        {(createdAt || updatedAt) && (
                          <div className="course-meta">
                            {createdAt && (
                              <>
                                <span className="course-meta-label">
                                  Criado em
                                </span>
                                <span className="course-meta-value">
                                  {createdAt}
                                </span>
                              </>
                            )}
                            {createdAt && updatedAt && (
                              <span className="course-meta-separator">|</span>
                            )}
                            {updatedAt && (
                              <>
                                <span className="course-meta-label">
                                  Atualizado em
                                </span>
                                <span className="course-meta-value">
                                  {updatedAt}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="course-actions">
                        <button
                          type="button"
                          className="pill-button secondary"
                          onClick={() => handleEditCourse(course)}
                          aria-label={`Editar game ${courseName}`}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="pill-button danger"
                          onClick={() => openDeleteModal([course.id])}
                        >
                          Excluir
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </section>
      <form
        className="manage-card"
        onSubmit={(event) => event.preventDefault()}
      >
        <div
          className={`manage-header ${activeTourId === "admin" ? "tour-highlight" : ""}`}
        >
          <h1>Painel administrativo de games</h1>
          <div className="manage-header-actions">
            <button
              type="button"
              className="pill-button secondary tour-trigger"
              onClick={handleStartTour}
            >
              Não sabe por onde começar?
            </button>
            {saveError && (
              <div
                className="status-badge error"
                role="status"
                aria-live="polite"
              >
                {saveError}
              </div>
            )}
          </div>
        </div>

        <div className="manage-form">
          <div className="manage-form-left">
            <div
              className={`form-section ${activeTourId === "basic" ? "tour-highlight" : ""}`}
              ref={basicInfoRef}
            >
              <div className="form-section-header">
                <h2>Informações básicas do game</h2>
              </div>
              <div className="form-fields">
                <div className="field">
                  <label htmlFor="course-title">Nome do game</label>
                  <input
                    id="course-title"
                    type="text"
                    placeholder="Ex.: Missão Sustentável"
                    maxLength={100}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      markUnsavedChanges();
                      clearFieldError("name");
                      if (saveError) setSaveError("");
                    }}
                    disabled={isSaving}
                  />
                  {fieldErrors.name && (
                    <p className="error-message">{fieldErrors.name}</p>
                  )}
                  <span
                    className="char-counter"
                    style={{
                      color: name.length >= 100 ? "#f43f5e" : "#64748b",
                    }}
                  >
                    {name.length}/100
                  </span>
                </div>

                <div className="field">
                  <label htmlFor="course-description">Descrição do game</label>
                  <input
                    id="course-description"
                    type="text"
                    placeholder="Ex.: Uma jornada sobre sustentabilidade"
                    maxLength={DESCRIPTION_MAX_LENGTH}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                      markUnsavedChanges();
                      clearFieldError("description");
                      if (saveError) setSaveError("");
                    }}
                    onBlur={(event) => {
                      const trimmed = event.target.value.trim();
                      if (trimmed !== event.target.value) {
                        setDescription(trimmed);
                      }
                    }}
                    disabled={isSaving}
                  />
                  <span
                    className="char-counter"
                    style={{
                      color:
                        description.length >= DESCRIPTION_MAX_LENGTH
                          ? "#f43f5e"
                          : "#64748b",
                    }}
                  >
                    {description.length}/{DESCRIPTION_MAX_LENGTH}
                  </span>
                  {fieldErrors.description && (
                    <p className="error-message">{fieldErrors.description}</p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="course-category">Categoria</label>
                  <input
                    id="course-category"
                    type="text"
                    placeholder="Sustentabilidade"
                    maxLength={50}
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      markUnsavedChanges();
                      clearFieldError("category");
                      if (saveError) setSaveError("");
                    }}
                    disabled={isSaving}
                  />
                  <span
                    className="char-counter"
                    style={{
                      color: category.length >= 50 ? "#f43f5e" : "#64748b",
                    }}
                  >
                    {category.length}/50
                  </span>
                  {fieldErrors.category && (
                    <p className="error-message">{fieldErrors.category}</p>
                  )}
                </div>

                <div className="field">
                  <label htmlFor="course-banner">Banner principal</label>
                  <div className="banner-row">
                    <button
                      type="button"
                      className="pill-button secondary"
                      onClick={openBannerModal}
                      disabled={isSaving}
                    >
                      Adicionar banner principal
                    </button>
                    {bannerFileName && (
                      <span className="banner-file-name">{bannerFileName}</span>
                    )}
                  </div>
                  {fieldErrors.banner && (
                    <p className="error-message">{fieldErrors.banner}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <section
            className={`course-preview ${activeTourId === "preview" ? "tour-highlight" : ""
              }`}
            ref={previewRef}
            aria-live="polite"
            aria-label="Prévia do game"
          >
            <div className="course-preview-header">
              <p className="course-preview-title"></p>
              <span className="course-preview-hint">
                Atualiza conforme você adiciona informações!
              </span>
            </div>
            <article
              className="course-card preview-card"
              aria-label={`Prévia do game ${previewName}`}
            >
              <div
                className={`course-thumb ${bannerPreviewUrl ? "has-banner" : ""}`}
                role="img"
                aria-label={`Banner do game ${previewName}`}
                style={previewThumbStyle}
              />
              <div
                className="course-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={previewProgress}
                aria-valuetext={`${previewProgress}% de 100% concluido`}
                aria-label={`Progresso do game ${previewName}: ${previewProgress}% de 100%`}
              >
                <div
                  className="course-progress-fill"
                  style={{ width: `${previewProgress}%` }}
                />
              </div>
              <div className="course-progress-label" aria-hidden="true">
                {previewProgress}% concluido
              </div>
              <div className="card-header">
                <div>
                  <p className="course-category">{previewCategory}</p>
                  <h3>{previewName}</h3>
                </div>
                <span className="tag">+{previewPoints}</span>
              </div>
              <p className="course-description">{previewDescription}</p>
              <div className="card-footer">
                <div className="meta">
                  <span>Atualizado: {previewDate}</span>
                </div>
                <button type="button" className="secondary-action" disabled>
                  Abrir
                </button>
              </div>
            </article>
          </section>
        </div>

        <div className="actions">
          <button
            type="button"
            className={`action-button publish ${
              activeTourId === "save" ? "tour-highlight" : ""
            }`}
            onClick={handleSaveCourse}
            disabled={isSaving || !name.trim() || !description.trim()}
            ref={saveButtonRef}
          >
            {isSaving
              ? "Salvando..."
              : isEditing
                ? "Atualizar Game"
                : "Salvar e prosseguir para missões"}
          </button>
        </div>
      </form>
      {deleteCourseIds.length > 0 && (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={closeDeleteModal}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <h2 id="delete-modal-title" className="confirm-modal-title">
                {deleteModalTitle}
              </h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeDeleteModal}
                aria-label="Fechar modal"
              >
                X
              </button>
            </div>
            <p className="confirm-modal-text">
              {deleteModalDescription}
            </p>
            <label className="confirm-checkbox">
              <input
                type="checkbox"
                checked={deleteConfirmChecked}
                onChange={(event) =>
                  setDeleteConfirmChecked(event.target.checked)
                }
              />
              <span>Confirmo que essa ação não poderá ser desfeita.</span>
            </label>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="pill-button secondary"
                onClick={closeDeleteModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="pill-button danger"
                onClick={confirmDeleteCourse}
                disabled={!deleteConfirmChecked}
              >
                {deleteModalActionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
      {showUnsavedModal && (
        <div
          className="confirm-modal-overlay"
          role="presentation"
          onClick={handleStayOnPage}
        >
          <div
            className="confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="confirm-modal-header">
              <h2 id="unsaved-modal-title" className="confirm-modal-title">
                Alterações não salvas
              </h2>
            </div>
            <p className="confirm-modal-text">
              Você tem alterações não salvas. Deseja prosseguir mesmo assim?
            </p>
            <div className="confirm-modal-actions">
              <button
                type="button"
                className="pill-button secondary"
                onClick={handleStayOnPage}
              >
                Ficar na página
              </button>
              <button
                type="button"
                className="pill-button danger"
                onClick={handleLeavePage}
              >
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
      {tourStep !== null && currentTour && tourPosition && (
        <div className="tour-overlay" role="presentation">
          <div
            className="tour-card"
            role="dialog"
            aria-label={`Tutorial: ${currentTour.title}`}
            data-placement={tourPosition.placement}
            style={{ top: tourPosition.top, left: tourPosition.left }}
          >
            <div className="tour-badge">Tutorial</div>
            <div className="tour-step">
              Missão {tourStep + 1} de {tourSteps.length}
            </div>
            <div className="tour-section">{currentTour.title}</div>
            <p className="tour-text">{currentTour.description}</p>
            <div className="tour-actions">
              <button
                type="button"
                className="tour-button ghost"
                onClick={handleTourSkip}
              >
                Pular ajuda
              </button>
              <button
                type="button"
                className="tour-button primary"
                onClick={handleTourNext}
              >
                Entendi!
              </button>
            </div>
          </div>
        </div>
      )}
      {showBannerModal && (
        <div
          className="banner-modal-overlay"
          role="presentation"
          onClick={closeBannerModal}
        >
          <div
            className="banner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="banner-modal-title"
            aria-describedby="banner-modal-description"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="banner-modal-header">
              <h2 id="banner-modal-title">Banner principal</h2>
              <button
                type="button"
                className="modal-close"
                onClick={closeBannerModal}
                aria-label="Fechar modal"
              >
                X
              </button>
            </div>
            <p id="banner-modal-description" className="banner-modal-subtitle">
              Adicione um banner para o game. A prévia mostra como ficará no
              card.
            </p>
            <div
              className={`banner-dropzone ${isBannerDragging ? "is-dragging" : ""
                }`}
              onDragEnter={handleBannerDragOver}
              onDragOver={handleBannerDragOver}
              onDragLeave={handleBannerDragLeave}
              onDrop={handleBannerDrop}
            >
              <p>Arraste e solte a imagem aqui ou clique para selecionar.</p>
              <button
                type="button"
                className="pill-button secondary"
                onClick={() => bannerInputRef.current?.click()}
                disabled={isSaving}
              >
                Selecionar arquivo
              </button>
              <input
                id="course-banner"
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden-file-input"
                onChange={handleBannerFileChange}
                disabled={isSaving}
              />
              {(tempBannerFileName || bannerFileName) && (
                <span className="banner-file-name">
                  {tempBannerFileName || bannerFileName}
                </span>
              )}
            </div>
            <p className="banner-requirements">
              Formatos aceitos: imagens (ex.: JPG, PNG, WEBP). Tamanho máximo:
              5MB. Recomendado 16:9.
            </p>
            {bannerError && (
              <p className="error-message banner-error" role="alert">
                {bannerError}
              </p>
            )}
            <div className="banner-modal-preview">
              <p className="banner-preview-title">Prévia no card</p>
              <section
                className="course-preview modal-preview"
                aria-live="polite"
              >
                <article
                  className="course-card preview-card"
                  aria-label={`Prévia do game ${previewName}`}
                >
                  <div
                    className={`course-thumb ${modalPreviewUrl ? "has-banner" : ""
                      }`}
                    role="img"
                    aria-label={`Banner do game ${previewName}`}
                    style={modalPreviewThumbStyle}
                  />
                  <div
                    className="course-progress"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={previewProgress}
                    aria-valuetext={`${previewProgress}% de 100% concluido`}
                    aria-label={`Progresso do game ${previewName}: ${previewProgress}% de 100%`}
                  >
                    <div
                      className="course-progress-fill"
                      style={{ width: `${previewProgress}%` }}
                    />
                  </div>
                  <div className="course-progress-label" aria-hidden="true">
                    {previewProgress}% concluido
                  </div>
                  <div className="card-header">
                    <div>
                      <p className="course-category">{previewCategory}</p>
                      <h3>{previewName}</h3>
                    </div>
                    <span className="tag">+{previewPoints}</span>
                  </div>
                  <p className="course-description">{previewDescription}</p>
                  <div className="card-footer">
                    <div className="meta">
                      <span>Atualizado: {previewDate}</span>
                    </div>
                    <button type="button" className="secondary-action" disabled>
                      Abrir
                    </button>
                  </div>
                </article>
              </section>
            </div>
            <div className="banner-modal-actions">
              <button
                type="button"
                className="pill-button secondary"
                onClick={closeBannerModal}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="action-button publish"
                onClick={handleConfirmBanner}
                disabled={!tempBannerFile}
              >
                Salvar banner principal
              </button>
            </div>
          </div>
        </div>
      )}
      {isRedirectModalOpen && (
        <div className="confirm-modal-overlay" role="dialog" aria-modal="true">
          <div className="confirm-modal redirect-modal" role="document">
            <div className="confirm-modal-header">
              <h2 className="confirm-modal-title">Redirecionamento</h2>
              <button
                type="button"
                className="modal-close"
                onClick={handleCloseRedirectModal}
                aria-label="Fechar modal de redirecionamento"
              >
                X
              </button>
            </div>
            <p className="confirm-modal-text">
              Estamos redirecionando você para a aba de configuração de missões.
            </p>
            <div className="redirect-progress">
              <div
                className="redirect-progress-bar"
                style={{
                  width: `${(redirectSeconds / REDIRECT_DURATION_SECONDS) * 100}%`,
                }}
              />
            </div>
            <p className="redirect-countdown">
              {redirectSeconds} segundo{redirectSeconds === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
