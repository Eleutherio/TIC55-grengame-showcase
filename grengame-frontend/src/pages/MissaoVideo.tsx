import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

type MissaoVideoProps = {
  mission: {
    id: number;
    title: string;
    description: string;
    points_value: number;
    content_data: {
      url?: string;
      video_url?: string;
    };
    game: number;
    game_name?: string;
    order: number;
  };
  onComplete: () => void;
  isCompleted: boolean;
  completion?: {
    completed: boolean;
    points_earned: number;
  } | null;
  totalMissions: number;
};

export default function MissaoVideo({ mission, onComplete, isCompleted, completion: _completion, totalMissions }: MissaoVideoProps) {
  const navigate = useNavigate();
  const [videoWatched, setVideoWatched] = useState(isCompleted);
  const [loadError, setLoadError] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const playerRef = useRef<any>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);

  const videoUrl = mission.content_data.url || mission.content_data.video_url || "";

  const getYouTubeId = (url: string): string => {
    if (!url) return "";

    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([A-Za-z0-9_-]{11})/,
      /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return "";
  };

  const videoId = getYouTubeId(videoUrl);
  const rewardPoints = mission.points_value;
  const titleText = mission.title?.trim() ?? "";
  const descriptionText = mission.description?.trim() ?? "";
  const shouldShowDescription =
    descriptionText.length > 0 &&
    descriptionText.toLowerCase() !== titleText.toLowerCase();
  const isLastMission = totalMissions > 0 && mission.order >= totalMissions;

  useEffect(() => {
    if (isCompleted) {
      setVideoWatched(true);
    }
  }, [isCompleted]);

  useEffect(() => {
    if (!videoId) return;

    const timeout = setTimeout(() => {
      if (!playerRef.current) setLoadError(true);
    }, 10000);

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = () => setLoadError(true);
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        createPlayer();
      };
    } else {
      createPlayer();
    }

    function createPlayer() {
      if (!playerContainerRef.current) return;

      playerRef.current = new window.YT.Player(playerContainerRef.current, {
        videoId: videoId,
        playerVars: {
          autoplay: 0,
          controls: 1,
          modestbranding: 1,
          rel: 0,
        },
        events: {
          onStateChange: (event: any) => {
            if (event.data === 0) {
              setVideoWatched(true);
            }
          },
          onReady: () => clearTimeout(timeout),
          onError: () => setLoadError(true),
        },
      });
    }

    return () => {
      clearTimeout(timeout);
      if (playerRef.current) {
        playerRef.current.destroy();
      }
    };
  }, [videoId, isCompleted]);

  const handleNext = async () => {
    if (isCompleted) {
      // Se já completou, busca próxima missão
      try {

        const token = localStorage.getItem("accessToken");

        const trailResponse = await fetch(`${API_URL}/auth/games/${mission.game}/trilha/`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (trailResponse.ok) {
          const trailData = await trailResponse.json();
          const missions = trailData.missions || [];
          const currentIndex = missions.findIndex((m: any) => m.id === mission.id);
          const nextMission = missions[currentIndex + 1];

          if (nextMission) {
            navigate(`/app/missao/${nextMission.id}`);
          } else {
            navigate(`/app/trilhas/${mission.game}`);
          }
        } else {
          navigate(`/app/trilhas/${mission.game}`);
        }
      } catch (error) {
        console.error("Erro ao buscar próxima missão:", error);
        navigate(`/app/trilhas/${mission.game}`);
      }
    } else if (videoWatched) {
      setIsCompleting(true);
      try {
        await onComplete();
      } finally {
        setIsCompleting(false);
      }
    }
  };

  const handleBack = () => {
    navigate(`/app/trilhas/${mission.game}`);
  };

  return (
    <div style={{
      minHeight: "calc(100vh - 24px)",
      backgroundColor: "#EEF1F5",
      borderRadius: "24px",
      margin: "12px",
      padding: "20px 16px",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {isCompleted && (
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto 20px",
          padding: "16px 24px",
          backgroundColor: "#FFF3CD",
          border: "2px solid #FFC107",
          borderRadius: "12px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
        }}>
          <span style={{ fontSize: "24px" }}>⚠️</span>
          <div>
            <p style={{
              margin: 0,
              color: "#856404",
              fontSize: "16px",
              fontWeight: "600",
            }}>
              Missão já completada!
            </p>
            <p style={{
              margin: "4px 0 0 0",
              color: "#856404",
              fontSize: "14px",
            }}>
              Você pode assistir novamente, mas não ganhará pontos extras.
            </p>
          </div>
        </div>
      )}

      {/* Card de Progresso */}
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 16px",
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "12px 20px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
        position: "relative",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}>
          <h3 style={{
            fontSize: "14px",
            fontWeight: "600",
            color: "#1E2875",
            margin: 0,
          }}>
            Progresso do Game
          </h3>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
            color: "#FFC107",
            fontSize: "16px",
            fontWeight: "700",
          }}>
            +{rewardPoints}
            <span role="img" aria-label="trophy" style={{ fontSize: "18px" }}>
              🏆
            </span>
          </div>
        </div>

        <div style={{
          width: "100%",
          height: "4px",
          backgroundColor: "#E0E0E0",
          borderRadius: "2px",
          overflow: "hidden",
        }}>
          <div style={{
            width: videoWatched || isCompleted ? "100%" : "60%",
            height: "100%",
            backgroundColor: "#FFC107",
            transition: "width 0.5s ease",
          }} />
        </div>

        <p style={{
          fontSize: "12px",
          color: "#666",
          marginTop: "4px",
          marginBottom: 0,
        }}>
          {mission.order} de {totalMissions} Conteúdos
        </p>
      </div>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 16px",
      }}>
        <h1 style={{
          fontSize: "24px",
          fontWeight: "700",
          color: "#1E2875",
          marginBottom: "6px",
          lineHeight: "1.2",
        }}>
          {mission.title}
        </h1>
        {shouldShowDescription && (
          <p style={{
            fontSize: "14px",
            color: "#384457",
            lineHeight: "1.4",
            maxWidth: "800px",
          }}>
            {mission.description}
          </p>
        )}
      </div>

      {loadError && (
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto 16px",
          backgroundColor: "#FFF3CD",
          borderRadius: "8px",
          padding: "16px",
          border: "1px solid #FFE69C",
        }}>
          <p style={{ margin: "0 0 8px", fontWeight: "600", color: "#856404" }}>
            ⚠️ Não foi possível carregar o vídeo
          </p>
          <p style={{ margin: "0 0 12px", fontSize: "14px", color: "#856404" }}>
            Bloqueador de anúncios ou falha na rede. Você pode continuar mesmo assim.
          </p>
          <button
            onClick={() => { setVideoWatched(true); setLoadError(false); }}
            style={{
              backgroundColor: "#5B4CCC",
              color: "white",
              border: "none",
              borderRadius: "8px",
              padding: "10px 20px",
              fontSize: "14px",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Marcar como assistido
          </button>
        </div>
      )}

      <div style={{
        maxWidth: "800px",
        margin: "0 auto 16px",
      }}>
        <div style={{
          position: "relative",
          paddingBottom: "56.25%", // 16:9 aspect ratio
          backgroundColor: "#000",
          borderRadius: "8px",
          overflow: "hidden",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
        }}>
          {videoId ? (
            <div
              ref={playerContainerRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
              }}
            />
          ) : (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              color: "white",
              textAlign: "center",
            }}>
              <p>URL de vídeo não disponível</p>
            </div>
          )}
        </div>
      </div>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto",
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
      }}>
        <button
          onClick={handleBack}
          style={{
            padding: "8px 20px",
            fontSize: "14px",
            fontWeight: "600",
            backgroundColor: "#FFC107",
            color: "#1E2875",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: "0 2px 6px rgba(255, 193, 7, 0.3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 193, 7, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 193, 7, 0.3)";
          }}
        >
          ← Voltar
        </button>

        <button
          onClick={handleNext}
          disabled={(!videoWatched && !isCompleted) || isCompleting}
          style={{
            padding: "8px 20px",
            fontSize: "14px",
            fontWeight: "600",
            backgroundColor: (videoWatched || isCompleted) && !isCompleting ? "#FFC107" : "#cccccc",
            color: "#1E2875",
            border: "none",
            borderRadius: "6px",
            cursor: (videoWatched || isCompleted) && !isCompleting ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: (videoWatched || isCompleted) && !isCompleting ? "0 2px 6px rgba(255, 193, 7, 0.3)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "8px",
            opacity: (videoWatched || isCompleted) && !isCompleting ? 1 : 0.6,
          }}
          onMouseOver={(e) => {
            if (videoWatched || isCompleted) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 193, 7, 0.4)";
            }
          }}
          onMouseOut={(e) => {
            if (videoWatched || isCompleted) {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 193, 7, 0.3)";
            }
          }}
        >
          {isCompleting ? "Completando..." : isLastMission ? "Finalizar game" : "Próximo →"}
        </button>
      </div>

      {!videoWatched && !isCompleted && (
        <p style={{
          textAlign: "center",
          color: "#4B5563",
          fontSize: "14px",
          marginTop: "20px",
        }}>
          ⏱️ Assista ao vídeo até o final para continuar
        </p>
      )}
    </div>
  );
}
