import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import MissaoVideo from "./MissaoVideo";
import MissaoLeitura from "./MissaoLeitura";
import MissaoQuiz from "./MissaoQuiz";
import MissaoWordle from "./MissaoWordle";
import "./Missao.css";
import { API_URL } from "../config/api";
import { notifyUserDataUpdated } from "../utils/auth";

type MissionType = "video" | "reading" | "quiz" | "game";

type Mission = {
  id: number;
  title: string;
  description: string;
  mission_type: MissionType;
  points_value: number;
  content_data: {
    url?: string;
    video_url?: string;
    text?: string;
    tip?: string;
    questions?: Array<{
      question: string;
      options: string[];
      correct_answer: number;
    }>;
    word?: string;
    max_attempts?: number;
  };
  game: number;
  game_name?: string;
  order: number;
};

type MissionCompletion = {
  completed: boolean;
  points_earned: number;
  stars_earned: number;
  completed_at: string | null;
};

export default function Missao() {
  const { missionId } = useParams<{ missionId: string }>();
  const navigate = useNavigate();

  const [mission, setMission] = useState<Mission | null>(null);
  const [completion, setCompletion] = useState<MissionCompletion | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [pointsEarned, setPointsEarned] = useState(0);
  const [totalMissions, setTotalMissions] = useState(0);

  useEffect(() => {
    let isMounted = true;

    const loadMission = async () => {
      if (!missionId) {
        setError("ID da missão não fornecido");
        setIsLoading(false);
        return;
      }

      try {
  
        const token = localStorage.getItem("accessToken");

        const response = await fetch(`${API_URL}/auth/missoes/${missionId}/`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`Erro ao carregar missão: ${response.status}`);
        }

        const data = await response.json();

        if (!isMounted) return;

        setMission(data);
        setCompletion(data.completion || null);
        setError(null);

        if (data.game) {
          const trailResponse = await fetch(`${API_URL}/auth/games/${data.game}/trilha/`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
          if (trailResponse.ok) {
            const trailData = await trailResponse.json();
            if (isMounted) {
              setTotalMissions(trailData.missions?.length || 0);
            }
          } else {
            console.warn(`Falha ao carregar trilha do game ${data.game}: status ${trailResponse.status}`);
          }
        }

        if (!data.completion) {
          try {
            const startResponse = await fetch(`${API_URL}/auth/missoes/${missionId}/iniciar/`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
              },
            });

            if (startResponse.ok) {
              await startResponse.json();
              if (isMounted) {
                setCompletion({
                  completed: false,
                  points_earned: 0,
                  stars_earned: 0,
                  completed_at: null,
                });
              }
            }
          } catch (startErr) {
            console.warn("Erro ao iniciar missão (pode já estar iniciada):", startErr);
          }
        }
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "Erro desconhecido";
        setError(message);
        console.error("Erro ao carregar missão:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadMission();

    return () => {
      isMounted = false;
    };
  }, [missionId]);

  const handleBack = () => {
    const gameId = mission?.game;

    if (gameId) {
      navigate(`/app/trilhas/${gameId}`);
    } else {
      console.error("game não encontrado na missão:", mission);
      navigate("/app/cursos");
    }
  };

  const handleComplete = async () => {
    if (!missionId) return;

    try {

      const token = localStorage.getItem("accessToken");

      const response = await fetch(`${API_URL}/auth/missoes/${missionId}/completar/`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Erro ao completar missão: ${response.status}`);
      }

      const data = await response.json();

      const earned = data.points_awarded || mission?.points_value || 0;
      setPointsEarned(earned);
      setShowCompletionModal(true);

      setCompletion({
        completed: true,
        points_earned: earned,
        stars_earned: 3,
        completed_at: new Date().toISOString(),
      });
      notifyUserDataUpdated();

      const trailResponse = await fetch(`${API_URL}/auth/games/${mission?.game}/trilha/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (trailResponse.ok) {
        const trailData = await trailResponse.json();
        const missions = trailData.missions || [];

        const currentIndex = missions.findIndex((m: any) => m.id === mission?.id);
        const nextMission = missions[currentIndex + 1];

        setShowCompletionModal(false);
        if (nextMission) {
          navigate(`/app/missao/${nextMission.id}`);
        } else {
          navigate(`/app/trilhas/${mission?.game}`);
        }
      } else {
        setShowCompletionModal(false);
        navigate(`/app/trilhas/${mission?.game}`);
      }
    } catch (err) {
      console.error("Erro ao completar missão:", err);

      // Remove o modal se estava aparecendo
      setShowCompletionModal(false);

      // Navega de volta para a trilha em caso de erro
      navigate(`/app/trilhas/${mission?.game}`);
    }
  };

  if (isLoading) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p>Carregando missão...</p>
      </div>
    );
  }

  if (error || !mission) {
    return (
      <div style={{ padding: "40px", textAlign: "center" }}>
        <p style={{ color: "#e74c3c", marginBottom: "20px" }}>
          {error || "Missão não encontrada"}
        </p>
        <button
          onClick={handleBack}
          style={{
            padding: "10px 20px",
            backgroundColor: "#3498db",
            color: "white",
            border: "none",
            borderRadius: "8px",
            cursor: "pointer",
          }}
        >
          ← Voltar para Trilhas
        </button>
      </div>
    );
  }

  if (mission.mission_type === "video") {
    return (
      <>
        {showCompletionModal && (
          <div className="completion-modal-overlay">
            <div className="completion-modal-card">
              <div className="completion-modal-emoji">🎉</div>
              <h2 className="completion-modal-title">
                Missão Completada!
              </h2>
              <p className="completion-modal-points">
                Você ganhou <strong>+{pointsEarned}</strong> pontos!
              </p>
              <div className="completion-modal-loading">
                <span>Carregando próxima missão</span>
                <span className="loading-dots">...</span>
              </div>
            </div>
          </div>
        )}
        <MissaoVideo
          mission={mission}
          onComplete={handleComplete}
          isCompleted={completion?.completed || false}
          completion={completion}
          totalMissions={totalMissions}
        />
      </>
    );
  }
  if (mission.mission_type === "reading") {
    return (
      <>
        {showCompletionModal && (
          <div className="completion-modal-overlay">
            <div className="completion-modal-card">
              <div className="completion-modal-emoji">🎉</div>
              <h2 className="completion-modal-title">
                Missão Completada!
              </h2>
              <p className="completion-modal-points">
                Você ganhou <strong>+{pointsEarned}</strong> pontos!
              </p>
              <div className="completion-modal-loading">
                <span>Carregando próxima missão</span>
                <span className="loading-dots">...</span>
              </div>
            </div>
          </div>
        )}
        <MissaoLeitura
          mission={mission}
          onComplete={handleComplete}
          isCompleted={completion?.completed || false}
          completion={completion}
          totalMissions={totalMissions}
        />
      </>
    );
  }

  if (mission.mission_type === "quiz") {
    return (
      <>
        {showCompletionModal && (
          <div className="completion-modal-overlay">
            <div className="completion-modal-card">
              <div className="completion-modal-emoji">🎉</div>
              <h2 className="completion-modal-title">
                Missão Completada!
              </h2>
              <p className="completion-modal-points">
                Você ganhou <strong>+{pointsEarned}</strong> pontos!
              </p>
              <div className="completion-modal-loading">
                <span>Carregando próxima missão</span>
                <span className="loading-dots">...</span>
              </div>
            </div>
          </div>
        )}
        <MissaoQuiz
          mission={mission}
          onComplete={handleComplete}
          isCompleted={completion?.completed || false}
          totalMissions={totalMissions}
        />
      </>
    );
  }

  if (mission.mission_type === "game") {
    return (
      <>
        {showCompletionModal && (
          <div className="completion-modal-overlay">
            <div className="completion-modal-card">
              <div className="completion-modal-emoji">🎉</div>
              <h2 className="completion-modal-title">
                Missão Completada!
              </h2>
              <p className="completion-modal-points">
                Você ganhou <strong>+{pointsEarned}</strong> pontos!
              </p>
              <div className="completion-modal-loading">
                <span>Carregando próxima missão</span>
                <span className="loading-dots">...</span>
              </div>
            </div>
          </div>
        )}
        <MissaoWordle
          mission={mission}
          onComplete={handleComplete}
          isCompleted={completion?.completed || false}
          totalMissions={totalMissions}
        />
      </>
    );
  }

  return (
    <div style={{ padding: "40px", textAlign: "center" }}>
      <p>Tipo de missão não implementado: {mission.mission_type}</p>
      <button
        onClick={handleBack}
        style={{
          padding: "10px 20px",
          backgroundColor: "#3498db",
          color: "white",
          border: "none",
          borderRadius: "8px",
          cursor: "pointer",
          marginTop: "20px",
        }}
      >
        ← Voltar
      </button>
    </div>
  );
}
