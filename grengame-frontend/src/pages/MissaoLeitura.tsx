import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";

type MissaoLeituraProps = {
  mission: {
    id: number;
    title: string;
    description: string;
    points_value: number;
    content_data: {
      text?: string;
      tip?: string;
      image_url?: string;
      image_alt?: string;
      min_read_time?: number;
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

export default function MissaoLeitura({ mission, onComplete, isCompleted, completion: _completion, totalMissions }: MissaoLeituraProps) {
  const navigate = useNavigate();
  const [hasReadAll, setHasReadAll] = useState(isCompleted);
  const [hasScrolledToEnd, setHasScrolledToEnd] = useState(isCompleted);
  const [timeElapsed, setTimeElapsed] = useState(0);
  const [isCompleting, setIsCompleting] = useState(false);
  const pageRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  const textContent = mission.content_data.text || "";
  const tip = mission.content_data.tip;
  const minReadTimeMinutes = mission.content_data.min_read_time || 0; // em minutos
  const minReadTimeSeconds = minReadTimeMinutes * 60; // converter para segundos
  const imageUrl = mission.content_data.image_url || "";
  const imageAlt =
    mission.content_data.image_alt || mission.title || "Imagem do conteudo";
  const rewardPoints = mission.points_value;
  const titleText = mission.title?.trim() ?? "";
  const descriptionText = mission.description?.trim() ?? "";
  const shouldShowDescription =
    descriptionText.length > 0 &&
    descriptionText.toLowerCase() !== titleText.toLowerCase();
  const isLastMission = totalMissions > 0 && mission.order >= totalMissions;

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleScroll = () => {
    if (hasScrolledToEnd || isCompleted) return;

    const scrollTop = window.scrollY;
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;

    if (scrollTop + windowHeight >= documentHeight * 0.9) {
      setHasScrolledToEnd(true);
    }
  };

  // Timer para contar tempo de leitura
  useEffect(() => {
    if (isCompleted) return;

    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setTimeElapsed(elapsed);

      // Verifica se cumpriu ambos requisitos: tempo E scroll
      if (elapsed >= minReadTimeSeconds && hasScrolledToEnd) {
        setHasReadAll(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [isCompleted, minReadTimeSeconds, hasScrolledToEnd]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [hasReadAll, isCompleted]);

  const handleNext = async () => {
    // Se já completou OU se já leu tudo
    if (isCompleted || hasReadAll) {
      // Primeiro tenta completar se ainda não completou
      if (!isCompleted && hasReadAll) {
        setIsCompleting(true);
        try {
          await onComplete();
        } catch (error) {
          console.error("Erro ao completar missão:", error);
        } finally {
          setIsCompleting(false);
        }
      }

      // Depois busca próxima missão e navega
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
          if (nextMission && nextMission.id) {
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
    }
  };

  const handleBack = () => {
    navigate(`/app/trilhas/${mission.game}`);
  };

  return (
    <div
      ref={pageRef}
      style={{
        minHeight: "calc(100vh - 24px)",
        backgroundColor: "#EEF1F5",
        borderRadius: "24px",
        margin: "12px",
        padding: "20px 16px 80px",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
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
              Você pode reler, mas não ganhará pontos extras.
            </p>
          </div>
        </div>
      )}
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 24px",
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "12px 20px",
        boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
      }}>
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
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
          marginBottom: "8px",
        }}>
          <div style={{
            width: hasReadAll ? "100%" : "50%",
            height: "100%",
            backgroundColor: "#FFC107",
            transition: "width 0.5s ease",
          }} />
        </div>

        <p style={{
          fontSize: "12px",
          color: "#666",
          margin: 0,
        }}>
          {mission.order} de {totalMissions} Conteúdos
        </p>
      </div>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 16px",
      }}>
        <h1 style={{
          fontSize: "32px",
          fontWeight: "700",
          color: "#1E2875",
          marginBottom: "8px",
          lineHeight: "1.2",
        }}>
          {mission.title || "Conteudo do Game"}
        </h1>
        {shouldShowDescription && (
          <p style={{
            fontSize: "15px",
            color: "#384457",
            lineHeight: "1.5",
            maxWidth: "800px",
          }}>
            {mission.description}
          </p>
        )}
      </div>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto",
        color: "#1F2937",
        fontSize: "15px",
        lineHeight: "1.7",
      }}>
        {imageUrl && (
          <div style={{
            marginBottom: "24px",
            borderRadius: "12px",
            overflow: "hidden",
            boxShadow: "0 6px 18px rgba(0, 0, 0, 0.2)",
          }}>
            <img
              src={imageUrl}
              alt={imageAlt}
              style={{
                width: "100%",
                display: "block",
                objectFit: "cover",
              }}
            />
          </div>
        )}
        <div style={{
          whiteSpace: "pre-wrap",
          marginBottom: "24px",
        }}>
          {textContent.split('\n\n').map((paragraph, index) => {
            if (paragraph.startsWith('# ')) {
              return (
                <h2 key={index} style={{
                  fontSize: "20px",
                  fontWeight: "700",
                  color: "#1E2875",
                  marginTop: index === 0 ? 0 : "24px",
                  marginBottom: "12px",
                }}>
                  {paragraph.replace('# ', '')}
                </h2>
              );
            }

            if (paragraph.startsWith('## ')) {
              return (
                <h3 key={index} style={{
                  fontSize: "18px",
                  fontWeight: "600",
                  color: "#1E2875",
                  marginTop: "20px",
                  marginBottom: "10px",
                }}>
                  {paragraph.replace('## ', '')}
                </h3>
              );
            }

            if (paragraph.trim().startsWith('•')) {
              const items = paragraph.split('\n').filter(line => line.trim());
              return (
                <ul key={index} style={{
                  marginTop: "12px",
                  marginBottom: "12px",
                  paddingLeft: "20px",
                  listStyle: "none",
                }}>
                  {items.map((item, i) => (
                    <li key={i} style={{
                      marginBottom: "8px",
                      paddingLeft: "8px",
                      position: "relative",
                    }}>
                      <span style={{
                        position: "absolute",
                        left: "-12px",
                      }}>•</span>
                      {item.replace('•', '').trim()}
                    </li>
                  ))}
                </ul>
              );
            }

            return (
              <p key={index} style={{
                marginTop: 0,
                marginBottom: "16px",
              }}>
                {paragraph}
              </p>
            );
          })}
        </div>

        {tip && (
          <div style={{
            padding: "16px 20px",
            backgroundColor: "#E9EDF8",
            border: "1px solid #C8D2EA",
            borderRadius: "8px",
            marginBottom: "24px",
          }}>
            <div style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "8px",
            }}>
              <span style={{ fontSize: "20px" }}>💡</span>
              <div>
                <strong style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  display: "block",
                  marginBottom: "6px",
                }}>
                  Dica prática:
                </strong>
                <p style={{
                  fontSize: "14px",
                  lineHeight: "1.6",
                  margin: 0,
                  opacity: 0.95,
                }}>
                  {tip}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {!hasReadAll && !isCompleted && (
        <div style={{
          textAlign: "center",
          color: "#374151",
          fontSize: "14px",
          marginTop: "20px",
          marginBottom: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          alignItems: "center",
        }}>
          {minReadTimeMinutes > 0 && (
            <>
              {timeElapsed < minReadTimeSeconds && (
                <div style={{
                  backgroundColor: "#E3E8F0",
                  padding: "8px 16px",
                  borderRadius: "8px",
                }}>
                  ⏱️ Tempo de leitura: {formatTime(timeElapsed)} / {formatTime(minReadTimeSeconds)}
                </div>
              )}
              {!hasScrolledToEnd && (
                <div style={{
                  color: "#4B5563",
                  fontSize: "13px",
                }}>
                  ↓ Role até o final do texto
                </div>
              )}
            </>
          )}
          {minReadTimeMinutes === 0 && !hasScrolledToEnd && (
            <div>⏱️ Role até o final para continuar</div>
          )}
        </div>
      )}

      <div style={{
        maxWidth: "1200px",
        margin: "24px auto 0",
        display: "flex",
        justifyContent: "space-between",
        gap: "16px",
      }}>
        <button
          onClick={handleBack}
          style={{
            padding: "10px 24px",
            fontSize: "14px",
            fontWeight: "600",
            backgroundColor: "#FFC107",
            color: "#1E2875",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            transition: "all 0.2s",
            boxShadow: "0 2px 6px rgba(255, 193, 7, 0.3)",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = "translateY(-2px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 193, 7, 0.4)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(255, 193, 7, 0.3)";
          }}
        >
          ← Voltar
        </button>

        <button
          onClick={handleNext}
          disabled={(!hasReadAll && !isCompleted) || isCompleting}
          style={{
            padding: "10px 24px",
            fontSize: "14px",
            fontWeight: "600",
            backgroundColor: (hasReadAll || isCompleted) && !isCompleting ? "#FFC107" : "#cccccc",
            color: "#1E2875",
            border: "none",
            borderRadius: "6px",
            cursor: (hasReadAll || isCompleted) && !isCompleting ? "pointer" : "not-allowed",
            transition: "all 0.2s",
            boxShadow: (hasReadAll || isCompleted) && !isCompleting ? "0 2px 6px rgba(255, 193, 7, 0.3)" : "none",
            opacity: (hasReadAll || isCompleted) && !isCompleting ? 1 : 0.6,
          }}
          onMouseOver={(e) => {
            if (hasReadAll || isCompleted) {
              e.currentTarget.style.transform = "translateY(-2px)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 193, 7, 0.4)";
            }
          }}
          onMouseOut={(e) => {
            if (hasReadAll || isCompleted) {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 2px 6px rgba(255, 193, 7, 0.3)";
            }
          }}
        >
          {isCompleting ? "Completando..." : isLastMission ? "Finalizar game" : "Próximo →"}
        </button>
      </div>
    </div>
  );
}
