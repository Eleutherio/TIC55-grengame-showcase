import { useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import MissionForm, {
  type FormStatus,
  type MissionType,
  type QuizQuestion,
} from "../components/MissionForm";
import "./AdministrarMissoes.css";
import { API_URL } from "../config/api";

type GameOption = {
  id: string;
  name: string;
  category?: string;
};

type LocationState = {
  preselectedGameId?: string;
};

type FinishModalState = {
  type: "success" | "error";
  title: string;
  message: string;
};

type Mission = {
  id: string;
  gameId: string;
  type: MissionType;
  title: string;
  description: string;
  points: number;
  order: number;
  createdAt: string;
  contentData?: Record<string, unknown>;
  isPending?: boolean;
};


const GAMES_ENDPOINT = `${API_URL}/auth/games/`;
const MISSIONS_ENDPOINT = `${API_URL}/auth/missoes/`;

const fallbackGames: GameOption[] = [];

const typeOptions: { id: MissionType; label: string; helper: string }[] = [
  { id: "video", label: "Video", helper: "Experiencia audiovisual" },
  { id: "texto", label: "Texto", helper: "Leitura guiada" },
  { id: "quiz", label: "Quiz", helper: "Perguntas rapidas" },
  { id: "wordle", label: "Wordle", helper: "Desafio de palavra" },
];

const getBackendType = (type: MissionType) => {
  if (type === "texto") return "reading";
  if (type === "wordle") return "game";
  return type;
};

const getNextOrder = (list: Mission[], gameId: string) => {
  const maxOrder = list
    .filter((mission) => mission.gameId === gameId)
    .reduce((max, mission) => Math.max(max, mission.order ?? 0), 0);
  return maxOrder + 1;
};

const normalizeMissionType = (missionType?: string): MissionType => {
  if (missionType === "reading") return "texto";
  if (missionType === "game") return "wordle";
  if (missionType === "quiz") return "quiz";
  return "video";
};

const createQuizQuestion = (): QuizQuestion => ({
  id: `quiz-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  prompt: "",
  options: ["", "", "", ""],
  correctIndex: 0,
  points: 10,
});

const sanitizeContentData = (data: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );

type FieldErrorMap = Record<string, string[]>;

const WORDLE_LETTERS_ONLY_REGEX = /^\p{L}+$/u;
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const getFirstApiErrorMessage = (payload: unknown): string => {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === "string") {
        return item;
      }
      if (item && typeof item === "object") {
        const nested = getFirstApiErrorMessage(item);
        if (nested) return nested;
      }
    }
    return "";
  }
  if (typeof payload !== "object") return "";

  const parsed = payload as Record<string, unknown>;
  const direct =
    (typeof parsed.error === "string" ? parsed.error : "") ||
    (typeof parsed.detail === "string" ? parsed.detail : "");
  if (direct) return direct;

  const nonField = parsed.non_field_errors;
  if (Array.isArray(nonField)) {
    for (const item of nonField) {
      if (typeof item === "string") return item;
    }
  }

  for (const value of Object.values(parsed)) {
    if (typeof value === "string") {
      return value;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string") {
          return item;
        }
      }
    }
  }
  return "";
};

export default function AdministrarMissoes() {
  const navigate = useNavigate();
  const location = useLocation();
  const preselectedGameId = useMemo(() => {
    const state = location.state as LocationState | null;
    return state?.preselectedGameId ? String(state.preselectedGameId) : "";
  }, [location.state]);
  const [games, setGames] = useState<GameOption[]>(fallbackGames);
  const [isLoadingGames, setIsLoadingGames] = useState(true);
  const [isFinishModalOpen, setIsFinishModalOpen] = useState(false);

  const [selectedGameId, setSelectedGameId] = useState("");
  const [selectedType, setSelectedType] = useState<MissionType | "">("");
  const [missionTitle, setMissionTitle] = useState("");
  const [missionDescription, setMissionDescription] = useState("");
  const [missionPoints, setMissionPoints] = useState(150);

  const [videoUrl, setVideoUrl] = useState("");
  const [videoDuration, setVideoDuration] = useState("");
  const [videoRequireWatch, setVideoRequireWatch] = useState(true);
  const [readingText, setReadingText] = useState("");
  const [readingMinTime, setReadingMinTime] = useState("");
  const [quizItems, setQuizItems] = useState<QuizQuestion[]>([
    createQuizQuestion(),
  ]);
  const [wordleWord, setWordleWord] = useState("");
  const [wordleHints, setWordleHints] = useState("");

  const [missions, setMissions] = useState<Mission[]>([]);
  const [isLoadingMissions, setIsLoadingMissions] = useState(false);
  const [formStatus, setFormStatus] = useState<FormStatus | null>(null);
  const [showValidationFeedback, setShowValidationFeedback] = useState(false);
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [orderChangesByGame, setOrderChangesByGame] = useState<
    Record<string, boolean>
  >({});
  const [finishModalState, setFinishModalState] =
    useState<FinishModalState | null>(null);
  const [isDeletingMissionId, setIsDeletingMissionId] = useState<string | null>(
    null,
  );
  const [editingMissionId, setEditingMissionId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [pendingDeleteMissionId, setPendingDeleteMissionId] = useState<
    string | null
  >(null);
  const [draggingMissionId, setDraggingMissionId] = useState<string | null>(
    null,
  );
  const [dragOverMissionId, setDragOverMissionId] = useState<string | null>(
    null,
  );

  const selectedGame = useMemo(
    () => games.find((game) => game.id === selectedGameId) ?? null,
    [games, selectedGameId],
  );

  const missionsForGame = useMemo(
    () => missions.filter((mission) => mission.gameId === selectedGameId),
    [missions, selectedGameId],
  );

  useEffect(() => {
    let isActive = true;

    const loadGames = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(GAMES_ENDPOINT, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) {
          throw new Error("Falha ao buscar games");
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Resposta inesperada");
        }

        const normalized = data
          .map((rawGame: unknown, index: number) => {
            const game = asRecord(rawGame);
            return {
              id: String(game.id ?? game.pk ?? game.uuid ?? index + 1),
              name: String(
                game.name ?? game.titulo ?? game.title ?? `Game ${index + 1}`,
              ),
              category: String(game.category ?? game.categoria ?? ""),
            };
          })
          .filter((game: GameOption) => Boolean(game.id));

        if (isActive && normalized.length > 0) {
          setGames(normalized);
        }
      } catch {
        if (isActive) {
          setGames(fallbackGames);
        }
      } finally {
        if (isActive) {
          setIsLoadingGames(false);
        }
      }
    };

    loadGames();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!preselectedGameId || selectedGameId || games.length === 0) {
      return;
    }

    const hasGame = games.some((game) => game.id === preselectedGameId);
    if (hasGame) {
      setSelectedGameId(preselectedGameId);
    }
  }, [games, preselectedGameId, selectedGameId]);

  useEffect(() => {
    let isActive = true;

    const loadMissions = async () => {
      if (!selectedGameId) {
        setMissions([]);
        setIsLoadingMissions(false);
        return;
      }

      setIsLoadingMissions(true);
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(
          `${MISSIONS_ENDPOINT}?game=${encodeURIComponent(selectedGameId)}`,
          {
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
          },
        );

        if (!response.ok) {
          throw new Error("Falha ao buscar missões");
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Resposta inesperada de missões");
        }

        const normalized = data.map((rawMission: unknown, index: number) => {
          const mission = asRecord(rawMission);
          const missionTypeRaw =
            typeof mission.mission_type === "string"
              ? mission.mission_type
              : typeof mission.type === "string"
                ? mission.type
                : undefined;
          return {
            id: String(mission.id ?? mission.pk ?? `mission-${index}`),
            gameId: String(mission.game ?? mission.game_id ?? selectedGameId),
            type: normalizeMissionType(missionTypeRaw),
            title: String(mission.title ?? mission.name ?? `Missão ${index + 1}`),
            description: String(mission.description ?? ""),
            points: Number(mission.points_value ?? mission.points ?? 0),
            order: Number(mission.order ?? index),
            createdAt: String(mission.created_at ?? new Date().toISOString()),
            contentData: asRecord(mission.content_data),
            isPending: false,
          };
        });

        if (isActive) {
          setMissions(normalized);
        }
      } catch {
        if (isActive) {
          setMissions([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingMissions(false);
        }
      }
    };

    loadMissions();

    return () => {
      isActive = false;
    };
  }, [selectedGameId]);

  const resetForm = (keepType = false) => {
    if (!keepType) {
      setSelectedType("");
    }
    setMissionTitle("");
    setMissionDescription("");
    setMissionPoints(150);
    setVideoUrl("");
    setVideoDuration("");
    setVideoRequireWatch(true);
    setReadingText("");
    setReadingMinTime("");
    setQuizItems([createQuizQuestion()]);
    setWordleWord("");
    setWordleHints("");
    setEditingMissionId(null);
    setShowValidationFeedback(false);
  };

  const handleStartNewMission = () => {
    resetForm(false);
    setSelectedType("video");
  };

  const handleCancelEditing = () => {
    resetForm(true);
    setFormStatus({
      type: "info",
      text: "Edição cancelada.",
    });
  };

  const handleAddQuizQuestion = () => {
    setQuizItems((previous) => [...previous, createQuizQuestion()]);
  };

  const handleRemoveQuizQuestion = (questionId: string) => {
    setQuizItems((previous) =>
      previous.filter((question) => question.id !== questionId),
    );
  };

  const handleQuizPromptChange = (questionId: string, value: string) => {
    setQuizItems((previous) =>
      previous.map((question) =>
        question.id === questionId ? { ...question, prompt: value } : question,
      ),
    );
  };

  const handleQuizOptionChange = (
    questionId: string,
    optionIndex: number,
    value: string,
  ) => {
    setQuizItems((previous) =>
      previous.map((question) => {
        if (question.id !== questionId) return question;
        const options = question.options.map((option, index) =>
          index === optionIndex ? value : option,
        );
        return { ...question, options };
      }),
    );
  };

  const handleQuizCorrectSelect = (questionId: string, optionIndex: number) => {
    setQuizItems((previous) =>
      previous.map((question) =>
        question.id === questionId
          ? { ...question, correctIndex: optionIndex }
          : question,
      ),
    );
  };

  const handleQuizPointsChange = (questionId: string, value: number) => {
    setQuizItems((previous) =>
      previous.map((question) =>
        question.id === questionId
          ? { ...question, points: Number.isFinite(value) ? value : 0 }
          : question,
      ),
    );
  };

  const handleAddMissionLocal = () => {
    setFormStatus(null);
    setShowValidationFeedback(true);

    const { errors } = getValidationResult();
    if (errors.length > 0) {
      setFormStatus({
        type: "error",
        text: errors[0],
      });
      return;
    }

    if (!selectedType) {
      setFormStatus({
        type: "error",
        text: "Selecione um tipo de missão.",
      });
      return;
    }

    const durationValue = Number(videoDuration);
    const minReadTimeValue = Number(readingMinTime);
    const wordleHintsList = wordleHints
      .split(/\r?\n/)
      .map((hint) => hint.trim())
      .filter(Boolean);
    const normalizedQuiz = quizItems.map((question, index) => ({
      id: index + 1,
      question: question.prompt.trim(),
      options: question.options.map((option) => option.trim()),
      correct_answer: question.correctIndex ?? 0,
      points: Number.isFinite(question.points) ? question.points : 0,
    }));
    const contentData =
      selectedType === "video"
        ? sanitizeContentData({
            ...(videoUrl.trim() && { url: videoUrl.trim() }),
            ...(Number.isFinite(durationValue) &&
              durationValue > 0 && { duration: durationValue }),
            require_watch_to_end: videoRequireWatch,
          })
        : selectedType === "texto"
          ? sanitizeContentData({
              ...(readingText.trim() && { text: readingText.trim() }),
              ...(Number.isFinite(minReadTimeValue) &&
                minReadTimeValue > 0 && { min_read_time: minReadTimeValue }),
            })
          : selectedType === "quiz"
            ? sanitizeContentData({
                questions: normalizedQuiz,
                ...(normalizedQuiz.length > 0 && {
                  questions_total: normalizedQuiz.length,
                }),
              })
            : sanitizeContentData({
                game_type: "wordle",
                ...(wordleWord.trim() && {
                  word: wordleWord.trim().toUpperCase(),
                }),
                ...(wordleHintsList.length > 0 && { hints: wordleHintsList }),
                max_attempts: 6,
              });

    const editingMission = editingMissionId
      ? missions.find((mission) => mission.id === editingMissionId) ?? null
      : null;
    const nextOrder = getNextOrder(missions, selectedGameId);
    const orderToUse =
      editingMission && editingMission.gameId === selectedGameId
        ? editingMission.order
        : nextOrder;

    const newMission: Mission = {
      id: editingMissionId ?? `local-${Date.now()}`,
      gameId: selectedGameId,
      type: selectedType,
      title: missionTitle.trim(),
      description: missionDescription.trim(),
      points: missionPoints,
      order: orderToUse,
      createdAt: editingMission?.createdAt ?? new Date().toISOString(),
      contentData: contentData ?? {},
      isPending: true,
    };

    setMissions((previous) => {
      if (editingMissionId) {
        return previous.map((mission) =>
          mission.id === editingMissionId ? newMission : mission,
        );
      }
      return [...previous, newMission];
    });
    setFormStatus({
      type: "success",
      text: editingMissionId
        ? "Missão atualizada com sucesso."
        : "Missão adicionada com sucesso.",
    });
    setShowValidationFeedback(false);
    resetForm(true);
  };

  const getSaveErrorMessage = (status?: number | null) => {
    if (typeof status === "number") {
      return `Erro ${status}, seu game não foi salvo. Por favor, contate o suporte.`;
    }
    return "Erro de conexão, seu game não foi salvo. Por favor, contate o suporte.";
  };

  const handleSaveAllMissions = async () => {
    if (isSavingAll) {
      return;
    }

    if (!selectedGameId) {
      setFormStatus({
        type: "error",
        text: "Selecione um game antes de salvar.",
      });
      return;
    }

    const missionsForSelectedGame = missions.filter(
      (mission) => mission.gameId === selectedGameId,
    );
    const pendingMissions = missionsForSelectedGame.filter(
      (mission) => mission.isPending,
    );
    const hasOrderChanges = Boolean(orderChangesByGame[selectedGameId]);
    const existingMissions = missionsForSelectedGame.filter(
      (mission) => !mission.isPending,
    );

    if (pendingMissions.length === 0 && !hasOrderChanges) {
      return;
    }

    setIsSavingAll(true);
    setFormStatus(null);

    const orderMap = new Map<string, number>();
    missionsForSelectedGame.forEach((mission, index) => {
      orderMap.set(mission.id, index + 1);
    });

    const token = localStorage.getItem("accessToken");
    const updates = new Map<string, Mission>();
    let failures = 0;
    let firstErrorStatus: number | null = null;
    let firstErrorMessage: string | null = null;

    const missionsToCreateOrUpdate = pendingMissions;
    const missionsToReorder = hasOrderChanges ? existingMissions : [];
    const missionsToFinalOrder = hasOrderChanges ? existingMissions : [];

    if (hasOrderChanges && missionsToReorder.length > 0) {
      const tempOrderOffset = 1000 + missionsForSelectedGame.length;
      const tempUpdated: Mission[] = [];

      for (const mission of missionsToReorder) {
        const payload = {
          order: tempOrderOffset + (orderMap.get(mission.id) ?? mission.order),
          mission_type: getBackendType(mission.type),
          content_data: mission.contentData ?? {},
          is_active: true,
        };

        try {
        const response = await fetch(`${MISSIONS_ENDPOINT}${mission.id}/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const responseData = await response.json().catch(() => null);
          if (firstErrorStatus === null) {
            firstErrorStatus = response.status;
          }
          if (!firstErrorMessage) {
            const backendMessage = getFirstApiErrorMessage(responseData);
            if (backendMessage) {
              firstErrorMessage = backendMessage;
            }
          }
          throw new Error(`Falha ao preparar ordem (${response.status})`);
        }

          await response.json().catch(() => ({}));
          tempUpdated.push(mission);
      } catch {
        failures += 1;
      }
    }

    if (failures > 0) {
        for (const mission of tempUpdated) {
          try {
            await fetch(`${MISSIONS_ENDPOINT}${mission.id}/`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                order: mission.order,
                mission_type: getBackendType(mission.type),
                content_data: mission.contentData ?? {},
                is_active: true,
              }),
            });
          } catch {
            // Evita sobrescrever o erro principal com erro de rollback
          }
        }

      setFormStatus({
        type: "error",
        text:
          firstErrorMessage ||
          "Não foi possível atualizar a ordem das missões. Tente novamente.",
      });
      setFinishModalState({
        type: "error",
        title: "Não foi possível salvar o game.",
        message: firstErrorMessage || getSaveErrorMessage(firstErrorStatus),
      });
      setIsFinishModalOpen(true);
      setIsSavingAll(false);
      return;
    }
    }

    for (const mission of missionsToCreateOrUpdate) {
      const payload = {
        title: mission.title.trim(),
        description: mission.description.trim(),
        game: Number.isNaN(Number(mission.gameId))
          ? mission.gameId
          : Number(mission.gameId),
        points_value: mission.points,
        mission_type: getBackendType(mission.type),
        content_data: mission.contentData ?? {},
        order: orderMap.get(mission.id) ?? mission.order,
        is_active: true,
      };

      const isLocalMission = mission.id.startsWith("local-");
      const method = isLocalMission ? "POST" : "PATCH";
      const url = isLocalMission
        ? MISSIONS_ENDPOINT
        : `${MISSIONS_ENDPOINT}${mission.id}/`;

      try {
        const response = await fetch(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const responseData = await response.json().catch(() => null);
          if (firstErrorStatus === null) {
            firstErrorStatus = response.status;
          }
          if (!firstErrorMessage) {
            const backendMessage = getFirstApiErrorMessage(responseData);
            if (backendMessage) {
              firstErrorMessage = backendMessage;
            }
          }
          throw new Error(`Falha ao salvar missão (${response.status})`);
        }

        const data = await response.json().catch(() => ({}));
        const updatedMission: Mission = {
          ...mission,
          id: String(data.id ?? mission.id),
          order: Number(data.order ?? orderMap.get(mission.id) ?? mission.order),
          createdAt: data.created_at ?? mission.createdAt,
          isPending: false,
        };
        updates.set(mission.id, updatedMission);
      } catch {
        failures += 1;
      }
    }

    for (const mission of missionsToFinalOrder) {
      const payload = {
        order: orderMap.get(mission.id) ?? mission.order,
        mission_type: getBackendType(mission.type),
        content_data: mission.contentData ?? {},
        is_active: true,
      };

      try {
        const response = await fetch(`${MISSIONS_ENDPOINT}${mission.id}/`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const responseData = await response.json().catch(() => null);
          if (firstErrorStatus === null) {
            firstErrorStatus = response.status;
          }
          if (!firstErrorMessage) {
            const backendMessage = getFirstApiErrorMessage(responseData);
            if (backendMessage) {
              firstErrorMessage = backendMessage;
            }
          }
          throw new Error(`Falha ao atualizar ordem (${response.status})`);
        }

        await response.json().catch(() => ({}));
        updates.set(mission.id, {
          ...mission,
          order: Number(orderMap.get(mission.id) ?? mission.order),
        });
      } catch {
        failures += 1;
      }
    }

    if (updates.size > 0) {
      setMissions((previous) =>
        previous.map((mission) => {
          const updated = updates.get(mission.id);
          if (updated) {
            return updated;
          }
          if (mission.gameId === selectedGameId) {
            const nextOrder = orderMap.get(mission.id);
            if (nextOrder) {
              return { ...mission, order: nextOrder };
            }
          }
          return mission;
        }),
      );
    }

    if (failures > 0) {
      const fallbackFailureMessage =
        failures === 1
          ? "Não foi possível salvar 1 missão. Tente novamente."
          : `Não foi possível salvar ${failures} missões. Tente novamente.`;
      setFormStatus({
        type: "error",
        text: firstErrorMessage || fallbackFailureMessage,
      });
      setFinishModalState({
        type: "error",
        title: "Não foi possível salvar o game.",
        message: firstErrorMessage || getSaveErrorMessage(firstErrorStatus),
      });
      setIsFinishModalOpen(true);
    } else {
      setOrderChangesByGame((prev) => {
        if (!selectedGameId) return prev;
        const next = { ...prev };
        delete next[selectedGameId];
        return next;
      });
      setFinishModalState({
        type: "success",
        title: "Game salvo com sucesso.",
        message:
          "Você pode continuar nessa página e editar outros games ou prosseguir para ver como ficou o seu game.",
      });
      setIsFinishModalOpen(true);
    }

    setIsSavingAll(false);
  };

  const handleDeleteMission = (missionId: string) => {
    setPendingDeleteMissionId(missionId);
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDeleteMission = async () => {
    if (!pendingDeleteMissionId) {
      setIsDeleteModalOpen(false);
      return;
    }

    const missionId = pendingDeleteMissionId;
    setIsDeleteModalOpen(false);
    setPendingDeleteMissionId(null);

    if (missionId.startsWith("local-")) {
      setMissions((previous) =>
        previous.filter((mission) => mission.id !== missionId),
      );
      setFormStatus({
        type: "info",
        text: "Missão removida localmente.",
      });
      return;
    }

    setIsDeletingMissionId(missionId);
    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(`${MISSIONS_ENDPOINT}${missionId}/`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!response.ok) {
        const responseData = await response.json().catch(() => null);
        throw new Error(
          getFirstApiErrorMessage(responseData) || "Erro ao excluir missão",
        );
      }

      setMissions((previous) =>
        previous.filter((mission) => mission.id !== missionId),
      );
      setFormStatus({
        type: "success",
        text: "Missão excluída com sucesso.",
      });
    } catch (error) {
      setFormStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Erro ao excluir missão",
      });
    } finally {
      setIsDeletingMissionId(null);
    }
  };

  const handleCancelDeleteMission = () => {
    setIsDeleteModalOpen(false);
    setPendingDeleteMissionId(null);
  };

  const reorderMissions = (
    list: Mission[],
    sourceId: string,
    targetId: string,
  ) => {
    const sourceIndex = list.findIndex((mission) => mission.id === sourceId);
    const targetIndex = list.findIndex((mission) => mission.id === targetId);

    if (sourceIndex === -1 || targetIndex === -1) {
      return list;
    }

    const updated = [...list];
    const [moved] = updated.splice(sourceIndex, 1);
    updated.splice(targetIndex, 0, moved);
    return updated;
  };

  const handleDragStart = (
    event: DragEvent<HTMLDivElement>,
    missionId: string,
  ) => {
    setDraggingMissionId(missionId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", missionId);
  };

  const handleDragEnd = () => {
    setDraggingMissionId(null);
    setDragOverMissionId(null);
  };

  const handleDragOverMission = (
    event: DragEvent<HTMLDivElement>,
    missionId: string,
  ) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverMissionId(missionId);
  };

  const handleDropMission = (
    event: DragEvent<HTMLDivElement>,
    missionId: string,
  ) => {
    event.preventDefault();
    if (!draggingMissionId || draggingMissionId === missionId) {
      setDragOverMissionId(null);
      return;
    }

    setMissions((previous) =>
      reorderMissions(previous, draggingMissionId, missionId),
    );
    const draggingMission = missions.find(
      (mission) => mission.id === draggingMissionId,
    );
    const targetGameId = draggingMission?.gameId ?? selectedGameId;
    if (targetGameId) {
      setOrderChangesByGame((prev) => ({
        ...prev,
        [targetGameId]: true,
      }));
    }
    setDraggingMissionId(null);
    setDragOverMissionId(null);
  };

  const getValidationResult = useCallback(() => {
    const errors: string[] = [];
    const fieldErrors: FieldErrorMap = {};
    const addError = (fieldKey: string, message: string) => {
      errors.push(message);
      if (!fieldErrors[fieldKey]) {
        fieldErrors[fieldKey] = [];
      }
      fieldErrors[fieldKey].push(message);
    };

    if (!selectedGameId) {
      addError("selectedGameId", "Selecione um game.");
    }

    if (!selectedType) {
      addError("selectedType", "Selecione um tipo de missão.");
    }

    if (!missionTitle.trim()) {
      addError("missionTitle", "Informe o título da missão.");
    }

    if (!missionDescription.trim()) {
      addError("missionDescription", "Informe a descrição da missão.");
    }

    if (!Number.isFinite(missionPoints) || missionPoints <= 0) {
      addError("missionPoints", "Informe uma pontuação válida.");
    }

    if (selectedType === "video") {
      const trimmedUrl = videoUrl.trim();
      if (!trimmedUrl) {
        addError("videoUrl", "Informe a URL do vídeo.");
      } else if (
        !trimmedUrl.startsWith("http://") &&
        !trimmedUrl.startsWith("https://")
      ) {
        addError(
          "videoUrl",
          "A URL do vídeo deve começar com http:// ou https://."
        );
      }

      const durationValue = Number(videoDuration);
      if (!Number.isFinite(durationValue) || durationValue <= 0) {
        addError("videoDuration", "Informe a duração do vídeo em minutos.");
      }
    }

    if (selectedType === "texto") {
      if (!readingText.trim()) {
        addError("readingText", "Informe o texto base.");
      }
      const minTimeValue = Number(readingMinTime);
      if (!Number.isFinite(minTimeValue) || minTimeValue <= 0) {
        addError("readingMinTime", "Informe o tempo mínimo de leitura.");
      }
    }

    if (selectedType === "wordle") {
      const wordValue = wordleWord.trim();
      if (!wordValue) {
        addError("wordleWord", "Informe a palavra secreta.");
      } else {
        if (wordValue.length !== 5) {
          addError(
            "wordleWord",
            "A palavra do Wordle deve ter exatamente 5 letras."
          );
        }
        if (!WORDLE_LETTERS_ONLY_REGEX.test(wordValue)) {
          addError(
            "wordleWord",
            "A palavra do Wordle deve conter apenas letras."
          );
        }
      }
    }

    if (selectedType === "quiz") {
      if (quizItems.length === 0) {
        addError("quizItems", "Adicione pelo menos uma pergunta.");
      }
      quizItems.forEach((question, index) => {
        if (!question.prompt.trim()) {
          addError(
            `quiz.prompt.${question.id}`,
            `Preencha o enunciado da pergunta ${index + 1}.`
          );
        }
        if (!Number.isFinite(question.points) || question.points <= 0) {
          addError(
            `quiz.points.${question.id}`,
            `Defina os pontos da pergunta ${index + 1}.`
          );
        }
        if (
          question.correctIndex === null ||
          !Number.isInteger(question.correctIndex) ||
          question.correctIndex < 0 ||
          question.correctIndex >= question.options.length
        ) {
          addError(
            `quiz.correct.${question.id}`,
            `Selecione a resposta correta da pergunta ${index + 1}.`
          );
        }
        if (question.options.length < 2 || question.options.length > 5) {
          addError(
            "quizItems",
            `A pergunta ${index + 1} deve ter entre 2 e 5 opções.`
          );
        }
        question.options.forEach((option, optionIndex) => {
          if (!option.trim()) {
            addError(
              `quiz.option.${question.id}.${optionIndex}`,
              `Preencha a opção ${optionIndex + 1} da pergunta ${index + 1}.`
            );
          }
        });
      });
    }

    return { errors, fieldErrors };
  }, [
    missionDescription,
    missionPoints,
    missionTitle,
    quizItems,
    readingMinTime,
    readingText,
    selectedGameId,
    selectedType,
    videoDuration,
    videoUrl,
    wordleWord,
  ]);

  const getMissionOrderLabel = (index: number) => `${index + 1}º`;

  const handleEditMission = (missionId: string) => {
    const mission = missions.find((m) => m.id === missionId);
    if (!mission) return;

    setShowValidationFeedback(false);
    setSelectedGameId(mission.gameId);
    setSelectedType(mission.type);
    setMissionTitle(mission.title);
    setMissionDescription(mission.description);
    setMissionPoints(mission.points);
    setEditingMissionId(missionId);

    const applyContentData = (content: Record<string, unknown>) => {
      if (mission.type === "video") {
        setVideoUrl(String(content.url ?? ""));
        setVideoDuration(String(content.duration ?? ""));
        setVideoRequireWatch(Boolean(content.require_watch_to_end ?? false));
      } else if (mission.type === "texto") {
        setReadingText(String(content.text ?? ""));
        setReadingMinTime(String(content.min_read_time ?? ""));
      } else if (mission.type === "wordle") {
        const hints =
          Array.isArray(content.hints) && content.hints.length > 0
            ? content.hints.join("\n")
            : "";
        setWordleWord(String(content.word ?? ""));
        setWordleHints(hints);
      } else if (mission.type === "quiz") {
        const questions = Array.isArray(content.questions)
          ? content.questions
          : [];
        if (questions.length > 0) {
          setQuizItems(
            questions.map((rawQuestion: unknown, idx: number) => {
              const question = asRecord(rawQuestion);
              const rawOptions = Array.isArray(question.options)
                ? question.options
                : ["", "", "", ""];

              return {
                id: `quiz-${idx}-${Date.now()}`,
                prompt: String(question.question ?? ""),
                options: rawOptions.map((option) => String(option)),
                correctIndex: Number(question.correct_answer ?? 0),
                points: Number(question.points ?? 10),
              };
            }),
          );
        } else {
          setQuizItems([createQuizQuestion()]);
        }
      }
    };

    if (mission.isPending && mission.contentData) {
      applyContentData(mission.contentData);
      setFormStatus({
        type: "info",
        text: "Editando missão pendente. Salve para enviar.",
      });
      return;
    }

    const loadMissionDetails = async () => {
      try {
        const token = localStorage.getItem("accessToken");
        const response = await fetch(`${MISSIONS_ENDPOINT}${missionId}/`, {
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (!response.ok) return;

        const data = await response.json();
        const contentData = data.content_data || {};
        applyContentData(contentData);

        setFormStatus({
          type: "info",
          text: "Editando missão. Modifique os campos e salve.",
        });
      } catch (error) {
        console.error("Erro ao carregar detalhes da missão:", error);
      }
    };

    loadMissionDetails();
  };

  const validationResult = useMemo(
    () => getValidationResult(),
    [getValidationResult],
  );
  const validationErrors = validationResult.errors;
  const validationFieldErrors = validationResult.fieldErrors;
  const isFormDirty = useMemo(() => {
    const hasBaseData =
      missionTitle.trim() !== "" ||
      missionDescription.trim() !== "" ||
      missionPoints !== 150;

    if (selectedType === "video") {
      return (
        hasBaseData ||
        videoUrl.trim() !== "" ||
        videoDuration.trim() !== "" ||
        videoRequireWatch !== true
      );
    }

    if (selectedType === "texto") {
      return (
        hasBaseData ||
        readingText.trim() !== "" ||
        readingMinTime.trim() !== ""
      );
    }

    if (selectedType === "wordle") {
      return (
        hasBaseData ||
        wordleWord.trim() !== "" ||
        wordleHints.trim() !== ""
      );
    }

    if (selectedType === "quiz") {
      const hasQuizData =
        quizItems.length !== 1 ||
        quizItems.some(
          (question) =>
            question.prompt.trim() !== "" ||
            question.options.some((option) => option.trim() !== "") ||
            question.points !== 10 ||
            question.correctIndex !== 0,
        );
      return hasBaseData || hasQuizData;
    }

    return hasBaseData;
  }, [
    missionDescription,
    missionPoints,
    missionTitle,
    quizItems,
    readingMinTime,
    readingText,
    selectedType,
    videoDuration,
    videoRequireWatch,
    videoUrl,
    wordleHints,
    wordleWord,
  ]);
  const shouldDisplayValidationFeedback = showValidationFeedback || isFormDirty;

  const pendingMissionsForGame = useMemo(
    () =>
      missions.filter(
        (mission) => mission.gameId === selectedGameId && mission.isPending,
      ),
    [missions, selectedGameId],
  );

  const isSaveDisabled = isSavingAll || validationErrors.length > 0;
  const hasOrderChangesForGame = Boolean(
    selectedGameId && orderChangesByGame[selectedGameId],
  );

  return (
    <div className="missions-admin">
      <div className="missions-shell">
        <header className="missions-header fade-up">
          <div className="header-copy">
            <h1 className="header-title">Gerenciador de Missões</h1>
            <p className="header-subtitle">Selecione um game e crie missões.</p>
          </div>

          <div className="game-selector">
            <label className="input-label" htmlFor="game-select">
              Game selecionado
            </label>
            <div className="game-selector-row">
              <select
                id="game-select"
                className="input-field"
                value={selectedGameId}
                onChange={(event) => setSelectedGameId(event.target.value)}
                disabled={isLoadingGames}
              >
                <option value="">Selecione um game</option>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                    {game.category ? ` - ${game.category}` : ""}
                  </option>
                ))}
              </select>
            </div>
            <p className="helper-text">
              {isLoadingGames
                ? "Carregando games..."
                : "Este game será o contexto de todas as novas missões."}
            </p>
            {shouldDisplayValidationFeedback &&
              validationFieldErrors.selectedGameId?.[0] && (
              <p className="field-error">{validationFieldErrors.selectedGameId[0]}</p>
            )}
          </div>
        </header>

        <section className="missions-grid">
          <aside className="panel-left">
            <div className="card fade-up delay-1">
              <div className="card-title">
                <h2>Adicionar:</h2>
              </div>
              <div className="type-grid">
                {typeOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`type-tile ${option.id} ${
                      selectedType === option.id ? "active" : ""
                    }`}
                    onClick={() => setSelectedType(option.id)}
                  >
                    <span className="type-icon" aria-hidden="true">
                      {option.id === "video" && (
                        <svg viewBox="0 0 24 24">
                          <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
                          <path d="M15.5 10l5-3v10l-5-3z" />
                        </svg>
                      )}
                      {option.id === "texto" && (
                        <svg viewBox="0 0 24 24">
                          <path d="M6 6h12" />
                          <path d="M12 6v12" />
                          <path d="M8 18h8" />
                        </svg>
                      )}
                      {option.id === "quiz" && (
                        <svg viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="9" />
                          <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.4c-.9.4-1.5 1.1-1.5 2v.6" />
                          <circle cx="12" cy="17" r="1" />
                        </svg>
                      )}
                      {option.id === "wordle" && (
                        <svg viewBox="0 0 24 24">
                          <rect x="4" y="4" width="7" height="7" rx="1.5" />
                          <rect x="13" y="4" width="7" height="7" rx="1.5" />
                          <rect x="4" y="13" width="7" height="7" rx="1.5" />
                          <rect x="13" y="13" width="7" height="7" rx="1.5" />
                        </svg>
                      )}
                    </span>
                    <span className="type-label">{option.label}</span>
                    <span className="type-helper">{option.helper}</span>
                  </button>
                ))}
              </div>
              {shouldDisplayValidationFeedback &&
                validationFieldErrors.selectedType?.[0] && (
                <p className="field-error">{validationFieldErrors.selectedType[0]}</p>
              )}
            </div>

            <div className="card fade-up delay-2">
              <div className="card-title card-title-row">
                <h3>Missões - Arraste para organizar!</h3>
                <span className="pill">
                  {missionsForGame.length}{" "}
                  {missionsForGame.length === 1 ? "missão" : "missões"}
                </span>
              </div>
              <div className="game-list">
                {!selectedGameId ? (
                  <p className="helper-text">
                    Selecione um game para visualizar as missões.
                  </p>
                ) : isLoadingMissions ? (
                  <div
                    className="loading-state"
                    role="status"
                    aria-live="polite"
                  >
                    <span className="loading-spinner" aria-hidden="true" />
                    Carregando missões...
                  </div>
                ) : missionsForGame.length === 0 ? (
                  <p className="helper-text">Nenhuma missão cadastrada.</p>
                ) : (
                  missionsForGame.map((mission, index) => (
                    <div
                      key={mission.id}
                      className={`game-item draggable ${
                        draggingMissionId === mission.id ? "dragging" : ""
                      } ${dragOverMissionId === mission.id ? "drag-over" : ""}`}
                      draggable
                      onDragStart={(event) =>
                        handleDragStart(event, mission.id)
                      }
                      onDragEnd={handleDragEnd}
                      onDragOver={(event) =>
                        handleDragOverMission(event, mission.id)
                      }
                      onDrop={(event) => handleDropMission(event, mission.id)}
                    >
                      <div className="mission-info">
                        <span className="mission-order">
                          {getMissionOrderLabel(index)}
                        </span>
                        <div className="mission-text">
                          <strong>{mission.title}</strong>
                          <span className={`mission-meta ${mission.type}`}>
                            {mission.type.toUpperCase()} · {mission.points} pts
                          </span>
                        </div>
                      </div>
                      <div className="game-actions">
                        <button
                          type="button"
                          className="mission-edit-button"
                          onClick={() => handleEditMission(mission.id)}
                          disabled={editingMissionId === mission.id}
                        >
                          {editingMissionId === mission.id
                            ? "Editando..."
                            : "Editar"}
                        </button>
                        <button
                          type="button"
                          className="mission-delete-button"
                          onClick={() => handleDeleteMission(mission.id)}
                          disabled={isDeletingMissionId === mission.id}
                        >
                          {isDeletingMissionId === mission.id
                            ? "Excluindo..."
                            : "Excluir"}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          <main className="panel-right">
            <div className="card mission-panel fade-up delay-1">
              {!selectedType ? (
                <div className="mission-empty">
                  <div className="empty-icon" aria-hidden="true">
                    <div className="grid-icon">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <span key={index} />
                      ))}
                    </div>
                  </div>
                  <h2>Selecione um tipo de missão</h2>
                  <p>
                    Escolha um dos tipos à esquerda para iniciar a criação da
                    missão.
                  </p>
                  <div className="mission-empty-actions">
                    <button
                      type="button"
                      className="plus-button"
                      onClick={handleStartNewMission}
                      aria-label="Adicionar nova missão"
                    >
                      +
                    </button>
                    <span>Adicionar nova missão</span>
                  </div>
                </div>
              ) : (
                <MissionForm
                  missionType={selectedType}
                  typeLabel={
                    typeOptions.find((option) => option.id === selectedType)
                      ?.label ?? "Tipo"
                  }
                  selectedGameLabel={
                    selectedGame
                      ? `Game: ${selectedGame.name}`
                      : "Selecione um game antes de salvar."
                  }
                  formStatus={formStatus}
                  missionTitle={missionTitle}
                  missionPoints={missionPoints}
                  missionDescription={missionDescription}
                  videoUrl={videoUrl}
                  videoDuration={videoDuration}
                  videoRequireWatch={videoRequireWatch}
                  readingText={readingText}
                  readingMinTime={readingMinTime}
                  wordleWord={wordleWord}
                  wordleHints={wordleHints}
                  quizItems={quizItems}
                  isSaving={false}
                  isSaveDisabled={isSaveDisabled}
                  isEditing={Boolean(editingMissionId)}
                  fieldErrors={
                    shouldDisplayValidationFeedback ? validationFieldErrors : {}
                  }
                  onMissionTitleChange={setMissionTitle}
                  onMissionPointsChange={setMissionPoints}
                  onMissionDescriptionChange={setMissionDescription}
                  onVideoUrlChange={setVideoUrl}
                  onVideoDurationChange={setVideoDuration}
                  onVideoRequireWatchChange={setVideoRequireWatch}
                  onReadingTextChange={setReadingText}
                  onReadingMinTimeChange={setReadingMinTime}
                  onWordleWordChange={setWordleWord}
                  onWordleHintsChange={setWordleHints}
                  onQuizAdd={handleAddQuizQuestion}
                  onQuizPromptChange={handleQuizPromptChange}
                  onQuizOptionChange={handleQuizOptionChange}
                  onQuizCorrectSelect={handleQuizCorrectSelect}
                  onQuizPointsChange={handleQuizPointsChange}
                  onQuizRemove={handleRemoveQuizQuestion}
                  onClear={() => resetForm(true)}
                  onCancelEdit={handleCancelEditing}
                  onSave={handleAddMissionLocal}
                />
              )}
            </div>
            <div className="missions-actions missions-actions--right">
              <button
                type="button"
                className="header-button"
                onClick={handleSaveAllMissions}
                disabled={
                  isSavingAll ||
                  (pendingMissionsForGame.length === 0 &&
                    !hasOrderChangesForGame)
                }
              >
                {isSavingAll ? "Salvando..." : "Salvar game"}
              </button>
            </div>
          </main>
        </section>
      </div>

      {isDeleteModalOpen && (
        <div
          className="mission-delete-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="mission-delete-card">
            <p>Deseja excluir esta missão?</p>
            <div className="mission-delete-actions">
              <button
                type="button"
                className="mission-delete-confirm"
                onClick={handleConfirmDeleteMission}
              >
                Sim
              </button>
              <button
                type="button"
                className="mission-delete-cancel"
                onClick={handleCancelDeleteMission}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {isFinishModalOpen && (
        <div
          className="mission-delete-backdrop"
          role="dialog"
          aria-modal="true"
        >
          <div className="mission-finish-card">
            <p className="mission-finish-title">
              {finishModalState?.title ?? "Game salvo com sucesso."}
            </p>
            <p className="mission-finish-text">
              {finishModalState?.message ??
                "Você pode continuar nessa página e editar outros games ou prosseguir para ver como ficou o seu game."}
            </p>
            <div className="mission-finish-actions">
              <button
                type="button"
                className="mission-finish-secondary"
                onClick={() => setIsFinishModalOpen(false)}
              >
                Voltar
              </button>
              {finishModalState?.type !== "error" && (
                <button
                  type="button"
                  className="mission-finish-primary"
                  onClick={() => {
                    const focusId = Number(selectedGameId);
                    setIsFinishModalOpen(false);
                    navigate("/app/cursos", {
                      state: {
                        focusCourseId: Number.isFinite(focusId)
                          ? focusId
                          : undefined,
                      },
                    });
                  }}
                >
                  Ver o meu game
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
