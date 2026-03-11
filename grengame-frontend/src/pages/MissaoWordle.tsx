import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";

type MissaoWordleProps = {
  mission: {
    id: number;
    title: string;
    description: string;
    points_value: number;
    content_data: {
      word?: string;
      max_attempts?: number;
    };
    game: number;
    game_name?: string;
    order: number;
  };
  onComplete: () => void;
  isCompleted: boolean;
  totalMissions: number;
};

type LetterState = "correct" | "present" | "absent" | "empty";

export default function MissaoWordle({ mission, onComplete: _onComplete, isCompleted, totalMissions }: MissaoWordleProps) {
  const navigate = useNavigate();
  const [showInstructions, setShowInstructions] = useState(!isCompleted);
  const [showVictory, setShowVictory] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [gameWon, setGameWon] = useState(false);
  const [usedLetters, setUsedLetters] = useState<Record<string, LetterState>>({});
  const [isValidating, setIsValidating] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null);
  const [hasNextMission, setHasNextMission] = useState(
    totalMissions > 0 && mission.order < totalMissions,
  );
  const [isNavigatingToNext, setIsNavigatingToNext] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth : 1280,
  );

  const targetWord = (mission.content_data.word || "").toUpperCase();
  const maxAttempts = mission.content_data.max_attempts || 6;
  const wordLength = targetWord.length || 5;
  const isMobile = viewportWidth <= 768;
  const isTablet = viewportWidth <= 1024;
  const keyboardKeyWidth = isMobile ? 28 : isTablet ? 36 : 44;
  const keyboardKeyHeight = isMobile ? 42 : isTablet ? 48 : 52;
  const keyboardKeyFontSize = isMobile ? 14 : 16;
  const keyboardGap = isMobile ? 4 : 6;
  const tileSize = isMobile ? 46 : isTablet ? 52 : 56;
  const tileGap = isMobile ? 6 : 8;
  const tileFontSize = isMobile ? 20 : 24;

  const keyboard = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M"],
  ];

  const getNextMissionId = async (): Promise<number | null> => {

    const token = localStorage.getItem("accessToken");

    const trailResponse = await fetch(`${API_URL}/auth/games/${mission.game}/trilha/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!trailResponse.ok) {
      return null;
    }

    const trailData = await trailResponse.json();
    const missions = trailData.missions || [];
    const currentIndex = missions.findIndex((m: any) => m.id === mission.id);
    const nextMission = missions[currentIndex + 1];

    return nextMission?.id ?? null;
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (gameWon || attempts.length >= maxAttempts) return;

      const key = e.key.toUpperCase();

      if (key === "ENTER") {
        handleSubmit();
      } else if (key === "BACKSPACE") {
        handleBackspace();
      } else if (/^[A-Z]$/.test(key) && currentAttempt.length < wordLength) {
        handleLetterClick(key);
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentAttempt, gameWon, attempts]);

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    let isMounted = true;
    setHasNextMission(totalMissions > 0 && mission.order < totalMissions);

    const loadNextMissionStatus = async () => {
      try {
        const nextMissionId = await getNextMissionId();
        if (!isMounted) return;
        setHasNextMission(Boolean(nextMissionId));
      } catch (error) {
        console.error("Erro ao verificar próxima missão:", error);
      }
    };

    loadNextMissionStatus();

    return () => {
      isMounted = false;
    };
  }, [mission.game, mission.id, mission.order, totalMissions]);

  const getLetterState = (position: number, word: string): LetterState => {
    if (word[position] === targetWord[position]) {
      return "correct";
    }
    if (targetWord.includes(word[position])) {
      return "present";
    }
    return "absent";
  };

  const updateUsedLetters = (word: string) => {
    const newUsedLetters = { ...usedLetters };

    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const state = getLetterState(i, word);

      if (!newUsedLetters[letter] ||
        (state === "correct") ||
        (state === "present" && newUsedLetters[letter] === "absent")) {
        newUsedLetters[letter] = state;
      }
    }

    setUsedLetters(newUsedLetters);
  };

  const handleLetterClick = (letter: string) => {
    if (gameWon || attempts.length >= maxAttempts || currentAttempt.length >= wordLength) {
      return;
    }
    setCurrentAttempt(currentAttempt + letter);
  };

  const handleBackspace = () => {
    setCurrentAttempt(currentAttempt.slice(0, -1));
  };

  const handleSubmit = async () => {
    if (currentAttempt.length !== wordLength || gameWon || isValidating) return;

    const newAttempts = [...attempts, currentAttempt];
    setAttempts(newAttempts);
    updateUsedLetters(currentAttempt);

    if (currentAttempt === targetWord) {
      setGameWon(true);
      setShowVictory(true);

      if (!isCompleted) {
        setIsValidating(true);

        try {
      
          const token = localStorage.getItem("accessToken");

          const response = await fetch(`${API_URL}/auth/missoes/${mission.id}/validar/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ word: currentAttempt }),
          });

          if (response.ok) {
            const data = await response.json();
            setEarnedPoints(data.points_earned || 0);
          } else {
            console.error("Erro ao validar wordle");
          }
        } catch (error) {
          console.error("Erro ao validar wordle:", error);
        } finally {
          setIsValidating(false);
        }
      }
    }

    setCurrentAttempt("");
  };

  const handleNewGame = () => {
    if (isCompleted) {
      alert("Você já completou esta missão! Não é possível jogar novamente.");
      return;
    }
    setAttempts([]);
    setCurrentAttempt("");
    setGameWon(false);
    setShowVictory(false);
    setUsedLetters({});
  };

  const handleBack = () => {
    navigate(`/app/trilhas/${mission.game}`);
  };

  const handleAdvance = async () => {
    if (isNavigatingToNext) return;

    setIsNavigatingToNext(true);
    try {
      const nextMissionId = await getNextMissionId();
      if (nextMissionId) {
        navigate(`/app/missao/${nextMissionId}`);
        return;
      }
      navigate(`/app/trilhas/${mission.game}`);
    } catch (error) {
      console.error("Erro ao navegar para próxima missão:", error);
      navigate(`/app/trilhas/${mission.game}`);
    } finally {
      setIsNavigatingToNext(false);
    }
  };

  const getLetterColor = (letter: string): string => {
    const state = usedLetters[letter];
    if (state === "correct") return "#4CAF50";
    if (state === "present") return "#FF9800";
    if (state === "absent") return "#1E2875";
    return "#5B4CCC";
  };

  const winRate = 100;
  const streak = 2;

  return (
    <div style={{
      minHeight: isMobile ? "calc(100vh - 16px)" : "calc(100vh - 24px)",
      backgroundColor: "#EEF1F5",
      borderRadius: isMobile ? "16px" : "24px",
      margin: isMobile ? "8px" : "12px",
      padding: isMobile ? "12px 10px 16px" : "20px 16px",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      {isCompleted && (
        <div style={{
          maxWidth: "1200px",
          margin: "0 auto 20px",
          padding: isMobile ? "12px 14px" : "16px 24px",
          backgroundColor: "#FFF3CD",
          border: "2px solid #FFC107",
          borderRadius: "12px",
          display: "flex",
          alignItems: isMobile ? "flex-start" : "center",
          gap: isMobile ? "8px" : "12px",
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
              Wordle já completado!
            </p>
            <p style={{
              margin: "4px 0 0 0",
              color: "#856404",
              fontSize: "14px",
            }}>
              Você pode jogar novamente, mas não ganhará pontos extras.
            </p>
          </div>
        </div>
      )}
      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 16px",
      }}>
        <h1 style={{
          fontSize: isMobile ? "24px" : "32px",
          fontWeight: "700",
          color: "#1E2875",
          marginBottom: "0",
          lineHeight: "1.2",
          textAlign: isMobile ? "center" : "left",
        }}>
          Game: Adivinhe a palavra
        </h1>
      </div>

      <div style={{
        maxWidth: "1200px",
        margin: "0 auto 24px",
        backgroundColor: "white",
        borderRadius: "8px",
        padding: isMobile ? "10px 12px" : "12px 20px",
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
            +{earnedPoints !== null ? earnedPoints : mission.points_value}
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
            width: gameWon ? "100%" : "80%",
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
        maxWidth: isTablet ? "100%" : "1040px",
        margin: "0 auto",
        display: "flex",
        flexDirection: isMobile ? "column" : "row",
        gap: isMobile ? "14px" : "24px",
        alignItems: isMobile ? "stretch" : "flex-start",
      }}>
        <div style={{ display: "flex", justifyContent: isMobile ? "center" : "flex-start" }}>
          <button
            onClick={() => setShowInstructions(true)}
            style={{
              width: isMobile ? "44px" : "48px",
              height: isMobile ? "44px" : "48px",
              borderRadius: "50%",
              backgroundColor: "#FFC107",
              border: "none",
              cursor: "pointer",
              fontSize: isMobile ? "20px" : "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 12px rgba(255, 193, 7, 0.4)",
            }}
          >
            ❓
          </button>
        </div>

        {/* Centro - Grid e teclado */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Teclado virtual */}
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: `${keyboardGap}px`,
            marginBottom: isMobile ? "16px" : "24px",
          }}>
            {keyboard.map((row, rowIndex) => (
              <div key={rowIndex} style={{
                display: "flex",
                gap: `${keyboardGap}px`,
                justifyContent: "center",
              }}>
                {row.map((letter) => (
                  <button
                    key={letter}
                    onClick={() => handleLetterClick(letter)}
                    disabled={gameWon}
                    style={{
                      minWidth: `${keyboardKeyWidth}px`,
                      height: `${keyboardKeyHeight}px`,
                      padding: "0 6px",
                      backgroundColor: getLetterColor(letter),
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      fontSize: `${keyboardKeyFontSize}px`,
                      fontWeight: "700",
                      cursor: gameWon ? "not-allowed" : "pointer",
                      transition: "all 0.2s",
                      textTransform: "uppercase",
                    }}
                    onMouseOver={(e) => {
                      if (!gameWon) {
                        e.currentTarget.style.opacity = "0.8";
                      }
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.opacity = "1";
                    }}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: `${tileGap}px`,
            marginBottom: isMobile ? "18px" : "24px",
          }}>
            {Array.from({ length: maxAttempts }).map((_, rowIndex) => {
              const isCurrentRow = rowIndex === attempts.length;
              const attempt = attempts[rowIndex] || (isCurrentRow ? currentAttempt : "");

              return (
                <div key={rowIndex} style={{
                  display: "flex",
                  gap: `${tileGap}px`,
                  justifyContent: "center",
                }}>
                  {Array.from({ length: wordLength }).map((_, colIndex) => {
                    const letter = attempt[colIndex] || "";
                    let backgroundColor = "#5B4CCC";

                    if (rowIndex < attempts.length) {
                      const state = getLetterState(colIndex, attempt);
                      if (state === "correct") backgroundColor = "#4CAF50";
                      else if (state === "present") backgroundColor = "#FF9800";
                      else backgroundColor = "#1E2875";
                    }

                    return (
                      <div
                        key={colIndex}
                        style={{
                          width: `${tileSize}px`,
                          height: `${tileSize}px`,
                          backgroundColor,
                          border: letter && rowIndex === attempts.length ? "2px solid white" : "2px solid rgba(255, 255, 255, 0.3)",
                          borderRadius: "8px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: `${tileFontSize}px`,
                          fontWeight: "700",
                          color: "white",
                          transition: "all 0.3s",
                        }}
                      >
                        {letter}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>


          <div style={{
            display: "flex",
            gap: "12px",
            justifyContent: "center",
            marginBottom: isMobile ? "12px" : "16px",
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
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 16px rgba(255, 193, 7, 0.4)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 2px 6px rgba(255, 193, 7, 0.3)";
              }}
            >
              ← Voltar
            </button>
          </div>
          <div style={{
            display: "flex",
            flexDirection: isMobile ? "column" : "row",
            gap: "12px",
            justifyContent: "center",
            alignItems: "center",
          }}>
            <button
              onClick={handleBackspace}
              disabled={gameWon || currentAttempt.length === 0}
              style={{
                padding: isMobile ? "10px 16px" : "12px 24px",
                backgroundColor: gameWon || currentAttempt.length === 0 ? "#cccccc" : "#F44336",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: isMobile ? "13px" : "14px",
                fontWeight: "600",
                cursor: gameWon || currentAttempt.length === 0 ? "not-allowed" : "pointer",
                transition: "all 0.2s",
                minWidth: isMobile ? "200px" : "auto",
              }}
            >
              ⌫ Backspace
            </button>
            <button
              onClick={handleSubmit}
              disabled={currentAttempt.length !== wordLength || gameWon}
              style={{
                padding: isMobile ? "10px 20px" : "12px 32px",
                backgroundColor: currentAttempt.length === wordLength && !gameWon ? "#4CAF50" : "#cccccc",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: isMobile ? "13px" : "14px",
                fontWeight: "600",
                cursor: currentAttempt.length === wordLength && !gameWon ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                minWidth: isMobile ? "200px" : "auto",
              }}
            >
              ↵ Enter
            </button>
          </div>
        </div>
      </div>

      {showInstructions && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: isMobile ? "20px 14px" : "32px",
            width: isMobile ? "calc(100vw - 24px)" : "min(500px, 100%)",
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
            position: "relative",
          }}>
            <button
              onClick={() => setShowInstructions(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                backgroundColor: "transparent",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#F44336",
              }}
            >
              ×
            </button>

            <h2 style={{
              fontSize: isMobile ? "20px" : "24px",
              fontWeight: "700",
              color: "#1E2875",
              marginBottom: isMobile ? "18px" : "24px",
            }}>
              Como jogar
            </h2>

            <p style={{
              fontSize: isMobile ? "13px" : "14px",
              color: "#666",
              lineHeight: "1.6",
              marginBottom: isMobile ? "18px" : "24px",
            }}>
              Adivinhe a palavra em {maxAttempts} tentativas. Após cada tentativa, as cores das letras mudam para mostrar o quão perto você está da solução.
            </p>

            <div style={{ marginBottom: isMobile ? "18px" : "24px" }}>
              <div style={{
                display: "flex",
                alignItems: isMobile ? "flex-start" : "center",
                gap: isMobile ? "8px" : "12px",
                marginBottom: "12px",
              }}>
                <div style={{
                  width: isMobile ? "34px" : "40px",
                  height: isMobile ? "34px" : "40px",
                  backgroundColor: "#4CAF50",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "700",
                }}>
                  R
                </div>
                <span style={{ fontSize: isMobile ? "13px" : "14px", color: "#333" }}>
                  A letra <strong>R</strong> está na palavra e na posição correta.
                </span>
              </div>

              <div style={{
                display: "flex",
                alignItems: isMobile ? "flex-start" : "center",
                gap: isMobile ? "8px" : "12px",
                marginBottom: "12px",
              }}>
                <div style={{
                  width: isMobile ? "34px" : "40px",
                  height: isMobile ? "34px" : "40px",
                  backgroundColor: "#FF9800",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "700",
                }}>
                  R
                </div>
                <span style={{ fontSize: isMobile ? "13px" : "14px", color: "#333" }}>
                  A letra <strong>R</strong> está na palavra, mas não na posição correta.
                </span>
              </div>

              <div style={{
                display: "flex",
                alignItems: isMobile ? "flex-start" : "center",
                gap: isMobile ? "8px" : "12px",
              }}>
                <div style={{
                  width: isMobile ? "34px" : "40px",
                  height: isMobile ? "34px" : "40px",
                  backgroundColor: "#1E2875",
                  borderRadius: "6px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "white",
                  fontWeight: "700",
                }}>
                  E
                </div>
                <span style={{ fontSize: isMobile ? "13px" : "14px", color: "#333" }}>
                  A letra <strong>E</strong> não está na palavra.
                </span>
              </div>
            </div>

            <div style={{
              padding: isMobile ? "12px" : "16px",
              backgroundColor: "#FFF3E0",
              border: "2px solid #F44336",
              borderRadius: "8px",
            }}>
              <h3 style={{
                fontSize: isMobile ? "13px" : "14px",
                fontWeight: "600",
                color: "#1E2875",
                marginBottom: "12px",
              }}>
                Sistema de pontuação
              </h3>
              <ul style={{
                margin: 0,
                paddingLeft: "20px",
                fontSize: isMobile ? "12px" : "13px",
                color: "#666",
                lineHeight: "1.8",
              }}>
                <li>Menos tentativas = mais pontos</li>
                <li>A cada 100 pontos você sobe de nível</li>
                <li>Mantenha sua sequência de vitórias</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {showVictory && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
        }}>
          <div style={{
            backgroundColor: "white",
            borderRadius: "12px",
            padding: isMobile ? "20px 14px" : "32px",
            width: isMobile ? "calc(100vw - 24px)" : "min(500px, 100%)",
            maxHeight: "calc(100vh - 24px)",
            overflowY: "auto",
            position: "relative",
          }}>
            <button
              onClick={() => setShowVictory(false)}
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                backgroundColor: "transparent",
                border: "none",
                fontSize: "24px",
                cursor: "pointer",
                color: "#999",
              }}
            >
              ×
            </button>

            <h2 style={{
              fontSize: isMobile ? "24px" : "28px",
              fontWeight: "700",
              color: "#1E2875",
              marginBottom: "8px",
              textAlign: "center",
            }}>
              🎉 Parabéns!
            </h2>

            <p style={{
              fontSize: isMobile ? "14px" : "16px",
              color: "#666",
              textAlign: "center",
              marginBottom: isMobile ? "18px" : "24px",
            }}>
              Você acertou em {attempts.length} tentativa{attempts.length !== 1 ? "s" : ""}!
            </p>

            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: isMobile ? "8px" : "12px",
              marginBottom: isMobile ? "18px" : "24px",
            }}>
              <div style={{
                backgroundColor: "#5B4CCC",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>🏆</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "white", marginBottom: "4px" }}>Nível</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "white" }}>1</div>
              </div>

              <div style={{
                backgroundColor: "#FFC107",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>💰</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "#1E2875", marginBottom: "4px" }}>Pontos</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "#1E2875" }}>+ {earnedPoints !== null ? earnedPoints : mission.points_value}</div>
              </div>

              <div style={{
                backgroundColor: "#FFC107",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>😊</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "#1E2875", marginBottom: "4px" }}>Taxa de Vitória</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "#1E2875" }}>{winRate}%</div>
              </div>

              <div style={{
                backgroundColor: "#5B4CCC",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>🔥</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "white", marginBottom: "4px" }}>Sequência</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "white" }}>{streak}</div>
              </div>
            </div>

            <div style={{
              display: "flex",
              flexDirection: "column",
              gap: "8px",
              marginBottom: isMobile ? "18px" : "24px",
            }}>
              <div style={{
                backgroundColor: "#4CAF50",
                padding: isMobile ? "10px 12px" : "12px 16px",
                borderRadius: "6px",
                display: "flex",
                justifyContent: "space-between",
                color: "white",
                fontSize: isMobile ? "13px" : "16px",
              }}>
                <span>Jogos Jogados</span>
                <strong>2</strong>
              </div>

              <div style={{
                backgroundColor: "#4CAF50",
                padding: isMobile ? "10px 12px" : "12px 16px",
                borderRadius: "6px",
                display: "flex",
                justifyContent: "space-between",
                color: "white",
                fontSize: isMobile ? "13px" : "16px",
              }}>
                <span>Jogos Ganhos</span>
                <strong>2</strong>
              </div>

              <div style={{
                backgroundColor: "#4CAF50",
                padding: isMobile ? "10px 12px" : "12px 16px",
                borderRadius: "6px",
                display: "flex",
                justifyContent: "space-between",
                color: "white",
                fontSize: isMobile ? "13px" : "16px",
              }}>
                <span>Melhor Sequência</span>
                <strong>2</strong>
              </div>
            </div>

            <div style={{
              display: "flex",
              flexDirection: isMobile ? "column" : "row",
              gap: "12px",
              justifyContent: "center",
              alignItems: "center",
            }}>
              <button
                onClick={handleBack}
                style={{
                  padding: isMobile ? "10px 16px" : "12px 24px",
                  backgroundColor: "#FFC107",
                  color: "#1E2875",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: isMobile ? "13px" : "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                ← Voltar
              </button>

              <button
                onClick={handleNewGame}
                style={{
                  padding: isMobile ? "10px 16px" : "12px 24px",
                  backgroundColor: "#FFC107",
                  color: "#1E2875",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: isMobile ? "13px" : "14px",
                  fontWeight: "600",
                  cursor: "pointer",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                Novo Jogo
              </button>

              <button
                onClick={handleAdvance}
                disabled={isNavigatingToNext}
                style={{
                  padding: isMobile ? "10px 16px" : "12px 24px",
                  backgroundColor: isNavigatingToNext ? "#cccccc" : "#FFC107",
                  color: "#1E2875",
                  border: "none",
                  borderRadius: "8px",
                  fontSize: isMobile ? "13px" : "14px",
                  fontWeight: "600",
                  cursor: isNavigatingToNext ? "not-allowed" : "pointer",
                  width: isMobile ? "100%" : "auto",
                }}
              >
                {isNavigatingToNext
                  ? "Carregando..."
                  : hasNextMission
                    ? "Próximo →"
                    : "Finalizar Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
