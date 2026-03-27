import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";
import { notifyUserDataUpdated } from "../utils/auth";

type MissaoWordleProps = {
  mission: {
    id: number;
    title: string;
    description: string;
    points_value: number;
    content_data: {
      word?: string;
      max_attempts?: number;
      hints?: string[] | string;
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
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const [showInstructions, setShowInstructions] = useState(!isCompleted);
  const [showVictory, setShowVictory] = useState(false);
  const [showHintsModal, setShowHintsModal] = useState(false);
  const [currentAttempt, setCurrentAttempt] = useState("");
  const [attempts, setAttempts] = useState<string[]>([]);
  const [gameWon, setGameWon] = useState(false);
  const [usedLetters, setUsedLetters] = useState<Record<string, LetterState>>({});
  const [revealedHints, setRevealedHints] = useState<Record<number, string>>({});
  const [isRevealingHintIndex, setIsRevealingHintIndex] = useState<number | null>(null);
  const [hintFeedback, setHintFeedback] = useState<string>("");
  const [hintError, setHintError] = useState<string>("");
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
  const normalizedHints = (() => {
    const rawHints = mission.content_data.hints;
    if (Array.isArray(rawHints)) {
      return rawHints
        .map((hint) => String(hint).trim())
        .filter((hint) => hint.length > 0);
    }
    if (typeof rawHints === "string") {
      return rawHints
        .split("\n")
        .map((hint) => hint.trim())
        .filter((hint) => hint.length > 0);
    }
    return [] as string[];
  })();
  const hasHints = normalizedHints.length > 0;
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
      const activeElement = document.activeElement as HTMLElement | null;
      const isTypingElement =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement instanceof HTMLSelectElement ||
        Boolean(activeElement?.isContentEditable);

      // Evita duplicar entrada quando o teclado móvel está ativo no input oculto.
      if (isTypingElement) return;

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
  }, [currentAttempt, gameWon, attempts, maxAttempts, wordLength]);

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

  const evaluateAttempt = (word: string): LetterState[] => {
    const states: LetterState[] = Array.from(
      { length: wordLength },
      () => "absent",
    );
    const remainingLetters: Record<string, number> = {};

    // Primeira passagem: marca acertos exatos e contabiliza letras restantes.
    for (let i = 0; i < wordLength; i++) {
      const attemptLetter = word[i];
      const targetLetter = targetWord[i];

      if (attemptLetter === targetLetter) {
        states[i] = "correct";
      } else {
        remainingLetters[targetLetter] = (remainingLetters[targetLetter] || 0) + 1;
      }
    }

    // Segunda passagem: marca presentes respeitando quantidade restante.
    for (let i = 0; i < wordLength; i++) {
      if (states[i] === "correct") continue;

      const attemptLetter = word[i];
      const remainingCount = remainingLetters[attemptLetter] || 0;
      if (remainingCount > 0) {
        states[i] = "present";
        remainingLetters[attemptLetter] = remainingCount - 1;
      }
    }

    return states;
  };

  const updateUsedLetters = (word: string, evaluation: LetterState[]) => {
    const newUsedLetters = { ...usedLetters };
    const priority: Record<LetterState, number> = {
      empty: 0,
      absent: 1,
      present: 2,
      correct: 3,
    };

    for (let i = 0; i < word.length; i++) {
      const letter = word[i];
      const state = evaluation[i];
      const currentState = newUsedLetters[letter] ?? "empty";

      if (priority[state] > priority[currentState]) {
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

  const handleRevealHint = async (hintIndex: number) => {
    if (isRevealingHintIndex !== null) return;
    if (revealedHints[hintIndex]) return;
    if (!hasHints) return;

    setHintError("");
    setHintFeedback("");
    setIsRevealingHintIndex(hintIndex);

    try {
      const token = localStorage.getItem("accessToken");
      const response = await fetch(
        `${API_URL}/auth/missoes/${mission.id}/wordle/hints/use/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ hint_index: hintIndex }),
        },
      );

      const payload = (await response.json().catch(() => null)) as
        | {
            error?: string;
            hint_text?: string;
            points_charged?: number;
            status?: string;
          }
        | null;

      if (!response.ok) {
        setHintError(payload?.error || "Não foi possível revelar a dica.");
        return;
      }

      const revealedText = payload?.hint_text || normalizedHints[hintIndex];
      setRevealedHints((current) => ({
        ...current,
        [hintIndex]: revealedText,
      }));

      const charged = Number(payload?.points_charged || 0);
      if (charged > 0) {
        setHintFeedback(`Dica revelada. -${charged} pontos aplicados.`);
      } else {
        setHintFeedback("Dica revelada com uso gratuito.");
      }

      notifyUserDataUpdated();
    } catch (error) {
      setHintError("Erro de conexão ao revelar a dica.");
    } finally {
      setIsRevealingHintIndex(null);
    }
  };

  const handleSubmit = async () => {
    if (currentAttempt.length !== wordLength || gameWon || isValidating) return;

    const attemptEvaluation = evaluateAttempt(currentAttempt);
    const newAttempts = [...attempts, currentAttempt];
    setAttempts(newAttempts);
    updateUsedLetters(currentAttempt, attemptEvaluation);

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
            notifyUserDataUpdated();
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
          <span style={{ fontSize: "24px" }}>{"\u26A0\uFE0F"}</span>
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
              {"\u{1F3C6}"}
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
            width: gameWon || isCompleted ? "100%" : "80%",
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
        <div
          style={{
            display: "flex",
            flexDirection: isMobile ? "row" : "column",
            justifyContent: isMobile ? "center" : "flex-start",
            alignItems: "center",
            gap: "10px",
          }}
        >
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
            aria-label="Abrir instruções"
          >
            ?
          </button>
          <button
            onClick={() => {
              setHintError("");
              setHintFeedback("");
              setShowHintsModal(true);
            }}
            disabled={!hasHints}
            style={{
              minWidth: isMobile ? "96px" : "108px",
              height: isMobile ? "44px" : "48px",
              borderRadius: "12px",
              backgroundColor: hasHints ? "#1E2875" : "#9EA5C8",
              border: "1px solid #FFC107",
              color: "#FFC107",
              cursor: hasHints ? "pointer" : "not-allowed",
              fontSize: isMobile ? "14px" : "15px",
              fontWeight: "700",
              padding: "0 14px",
              boxShadow: hasHints
                ? "0 4px 12px rgba(30, 40, 117, 0.35)"
                : "none",
            }}
            aria-label="Abrir dicas"
          >
            Dicas
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
            <input
              ref={mobileInputRef}
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={currentAttempt}
              onChange={(event) => {
                const normalized = event.target.value
                  .toUpperCase()
                  .replace(/[^A-Z]/g, "")
                  .slice(0, wordLength);
                setCurrentAttempt(normalized);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void handleSubmit();
                }
              }}
              style={{
                position: "absolute",
                opacity: 0,
                width: "1px",
                height: "1px",
                pointerEvents: "none",
              }}
              aria-hidden="true"
              tabIndex={-1}
            />
            {Array.from({ length: maxAttempts }).map((_, rowIndex) => {
              const isCurrentRow = rowIndex === attempts.length;
              const attempt = attempts[rowIndex] || (isCurrentRow ? currentAttempt : "");
              const attemptEvaluation =
                rowIndex < attempts.length ? evaluateAttempt(attempt) : [];

              return (
                <div key={rowIndex} style={{
                  display: "flex",
                  gap: `${tileGap}px`,
                  justifyContent: "center",
                  cursor: isCurrentRow && !gameWon ? "text" : "default",
                }}>
                  {Array.from({ length: wordLength }).map((_, colIndex) => {
                    const letter = attempt[colIndex] || "";
                    let backgroundColor = "#5B4CCC";

                    if (rowIndex < attempts.length) {
                      const state = attemptEvaluation[colIndex];
                      if (state === "correct") backgroundColor = "#4CAF50";
                      else if (state === "present") backgroundColor = "#FF9800";
                      else backgroundColor = "#1E2875";
                    }

                    return (
                      <div
                        key={colIndex}
                        onClick={() => {
                          if (isCurrentRow && !gameWon) {
                            mobileInputRef.current?.focus();
                          }
                        }}
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
              {"\u2190"} Voltar
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
              {"\u232B"} Backspace
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
              {"\u21B5"} Enter
            </button>
          </div>
        </div>
      </div>

      {showHintsModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(7, 13, 56, 0.62)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1100,
            padding: isMobile ? "12px" : "18px",
          }}
        >
          <div
            style={{
              width: isMobile ? "100%" : "min(620px, 100%)",
              maxHeight: "calc(100vh - 24px)",
              overflowY: "auto",
              backgroundColor: "#1E2875",
              border: "1px solid #FFC107",
              borderRadius: "16px",
              padding: isMobile ? "18px 14px" : "24px 22px",
              position: "relative",
              boxShadow: "0 18px 38px rgba(8, 14, 56, 0.45)",
            }}
          >
            <button
              onClick={() => setShowHintsModal(false)}
              aria-label="Fechar dicas"
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                border: "1px solid #FFC107",
                backgroundColor: "transparent",
                color: "#FFC107",
                fontSize: "18px",
                cursor: "pointer",
              }}
            >
              ×
            </button>

            <h2
              style={{
                margin: 0,
                marginBottom: "8px",
                color: "#FFC107",
                fontSize: isMobile ? "20px" : "24px",
                fontWeight: "800",
              }}
            >
              Dicas do Wordle
            </h2>
            <p
              style={{
                margin: 0,
                marginBottom: "14px",
                color: "#EAF0FF",
                fontSize: isMobile ? "13px" : "14px",
                lineHeight: "1.5",
              }}
            >
              1 uso de dica é gratuito nesta missão. A partir da segunda dica
              revelada, cada uso consome 10 pontos da sua pontuação geral.
            </p>

            {hintFeedback && (
              <div
                style={{
                  marginBottom: "10px",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  border: "1px solid #22C55E",
                  backgroundColor: "rgba(34, 197, 94, 0.12)",
                  color: "#D7FFE8",
                  fontSize: isMobile ? "13px" : "14px",
                }}
              >
                {hintFeedback}
              </div>
            )}

            {hintError && (
              <div
                style={{
                  marginBottom: "10px",
                  borderRadius: "10px",
                  padding: "10px 12px",
                  border: "1px solid #F87171",
                  backgroundColor: "rgba(248, 113, 113, 0.14)",
                  color: "#FFE3E3",
                  fontSize: isMobile ? "13px" : "14px",
                }}
              >
                {hintError}
              </div>
            )}

            {!hasHints ? (
              <div
                style={{
                  borderRadius: "12px",
                  border: "1px solid rgba(255, 199, 0, 0.4)",
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  padding: "12px",
                  color: "#EAF0FF",
                  fontSize: isMobile ? "13px" : "14px",
                }}
              >
                Esta missão ainda não possui dicas cadastradas.
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {normalizedHints.map((hint, index) => {
                  const revealedHint = revealedHints[index];
                  const isRevealed = typeof revealedHint === "string";
                  const canReveal = !isRevealed && isRevealingHintIndex === null;
                  const displayText = isRevealed ? revealedHint : hint;

                  return (
                    <div
                      key={`hint-${index}`}
                      style={{
                        border: "1px solid rgba(255, 199, 0, 0.45)",
                        borderRadius: "12px",
                        backgroundColor: "rgba(255, 255, 255, 0.08)",
                        padding: isMobile ? "10px 10px 12px" : "12px 12px 14px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "10px",
                          marginBottom: "8px",
                        }}
                      >
                        <span
                          style={{
                            color: "#FFC107",
                            fontSize: isMobile ? "13px" : "14px",
                            fontWeight: "700",
                          }}
                        >
                          Dica {index + 1}
                        </span>
                        <button
                          onClick={() => void handleRevealHint(index)}
                          disabled={!canReveal}
                          style={{
                            borderRadius: "8px",
                            border: "none",
                            padding: "7px 10px",
                            fontSize: isMobile ? "12px" : "13px",
                            fontWeight: "700",
                            cursor: canReveal ? "pointer" : "not-allowed",
                            backgroundColor: isRevealed ? "#22C55E" : "#FFC107",
                            color: isRevealed ? "#08210F" : "#1E2875",
                            opacity: canReveal || isRevealed ? 1 : 0.7,
                          }}
                        >
                          {isRevealed
                            ? "Revelada"
                            : isRevealingHintIndex === index
                              ? "Revelando..."
                              : "Revelar"}
                        </button>
                      </div>
                      <p
                        style={{
                          margin: 0,
                          color: "#F3F6FF",
                          fontSize: isMobile ? "13px" : "14px",
                          lineHeight: "1.45",
                          filter: isRevealed ? "none" : "blur(6px)",
                          userSelect: isRevealed ? "text" : "none",
                          transition: "filter 0.25s ease",
                        }}
                      >
                        {displayText}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

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
              X
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
              X
            </button>

            <h2 style={{
              fontSize: isMobile ? "24px" : "28px",
              fontWeight: "700",
              color: "#1E2875",
              marginBottom: "8px",
              textAlign: "center",
            }}>
              {"\u{1F389}"} Parabéns!
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
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>{"\u{1F3C6}"}</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "white", marginBottom: "4px" }}>Nível</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "white" }}>1</div>
              </div>

              <div style={{
                backgroundColor: "#FFC107",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>{"\u{1F4B0}"}</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "#1E2875", marginBottom: "4px" }}>Pontos</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "#1E2875" }}>+ {earnedPoints !== null ? earnedPoints : mission.points_value}</div>
              </div>

              <div style={{
                backgroundColor: "#FFC107",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>{"\u{1F60A}"}</div>
                <div style={{ fontSize: isMobile ? "11px" : "12px", color: "#1E2875", marginBottom: "4px" }}>Taxa de Vitória</div>
                <div style={{ fontSize: isMobile ? "22px" : "24px", fontWeight: "700", color: "#1E2875" }}>{winRate}%</div>
              </div>

              <div style={{
                backgroundColor: "#5B4CCC",
                padding: isMobile ? "14px 10px" : "20px",
                borderRadius: "8px",
                textAlign: "center",
              }}>
                <div style={{ fontSize: isMobile ? "18px" : "20px", marginBottom: "8px" }}>{"\u{1F525}"}</div>
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
                {"\u2190"} Voltar
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
                    ? `Próximo ${"\u2192"}`
                    : "Finalizar Game"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
