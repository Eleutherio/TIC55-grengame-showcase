import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL } from "../config/api";

type Question = {
  question: string;
  options: string[];
  correct_answer: number;
};

type MissaoQuizProps = {
  mission: {
    id: number;
    title: string;
    description: string;
    points_value: number;
    content_data: {
      questions?: Question[];
    };
    game: number;
    game_name?: string;
    order: number;
  };
  onComplete: () => void;
  isCompleted: boolean;
  totalMissions: number;
};

export default function MissaoQuiz({ mission, onComplete: _onComplete, isCompleted, totalMissions }: MissaoQuizProps) {
  const navigate = useNavigate();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [hasAnswered, setHasAnswered] = useState(isCompleted);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [allAnswers, setAllAnswers] = useState<number[]>([]);
  const [quizFinished, setQuizFinished] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number | null>(null);

  const questions = mission.content_data.questions || [];
  const currentQuestion = questions[currentQuestionIndex];
  const isLastMission = totalMissions > 0 && mission.order >= totalMissions;

  const handleSubmit = async () => {
    if (selectedOption === null || isSubmitting) return;

    const correct = selectedOption === currentQuestion.correct_answer;
    setIsCorrect(correct);
    setShowResult(true);

    const updatedAnswers = [...allAnswers, selectedOption];
    setAllAnswers(updatedAnswers);

    // Aguarda 800ms para mostrar o resultado antes de avançar
    setTimeout(() => {
      if (currentQuestionIndex === questions.length - 1) {
        // Última questão - valida o quiz
        if (!isCompleted) {
          setHasAnswered(true);
          setIsSubmitting(true);


          const token = localStorage.getItem("accessToken");

          fetch(`${API_URL}/auth/missoes/${mission.id}/validar/`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ answers: updatedAnswers }),
          })
            .then(response => response.ok ? response.json() : Promise.reject())
            .then(data => {
              setEarnedPoints(data.points_earned || 0);
            })
            .catch(error => {
              console.error("Erro ao validar quiz:", error);
            })
            .finally(() => {
              setIsSubmitting(false);
              setQuizFinished(true);
            });
        } else {
          setQuizFinished(true);
        }
      } else {
        // Não é a última questão - avança para próxima independente de acertar ou errar
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedOption(null);
        setShowResult(false);
      }
    }, 800);
  };

  const handleBack = () => {
    navigate(`/app/trilhas/${mission.game}`);
  };

  const handleNext = async () => {
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
  };

  if (!currentQuestion) {
    return (
      <div style={{
        minHeight: "calc(100vh - 24px)",
        backgroundColor: "#EEF1F5",
        borderRadius: "24px",
        margin: "12px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#1E2875",
      }}>
        <p>Nenhuma questão disponível</p>
      </div>
    );
  }

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
              Quiz já completado!
            </p>
            <p style={{
              margin: "4px 0 0 0",
              color: "#856404",
              fontSize: "14px",
            }}>
              Você pode revisar as questões, mas não ganhará pontos extras.
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
            width: hasAnswered ? "100%" : `${((currentQuestionIndex + 1) / questions.length) * 75}%`,
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
        maxWidth: "900px",
        margin: "0 auto",
        paddingTop: "40px",
      }}>
        <h2 style={{
          fontSize: "28px",
          fontWeight: "700",
          color: "#1E2875",
          textAlign: "center",
          marginBottom: "48px",
          lineHeight: "1.3",
        }}>
          {currentQuestion.question}
        </h2>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "1rem",
          marginBottom: "3rem",
          maxWidth: "700px",
          margin: "0 auto 3rem",
        }}>
          {currentQuestion.options.map((option, index) => {
            const isSelected = selectedOption === index;
            const showCorrect = showResult && index === currentQuestion.correct_answer;
            const showWrong = showResult && isSelected && !isCorrect;

            return (
              <button
                key={index}
                onClick={() => !showResult && setSelectedOption(index)}
                disabled={showResult}
                style={{
                  backgroundColor: showCorrect ? "#4CAF50" : showWrong ? "#F44336" : isSelected ? "#E8E4FF" : "white",
                  color: showCorrect || showWrong ? "white" : "#1E2875",
                  border: isSelected && !showResult ? "3px solid #5B4CCC" : "none",
                  borderRadius: "12px",
                  padding: "24px",
                  fontSize: "16px",
                  fontWeight: isSelected ? "600" : "500",
                  cursor: showResult ? "not-allowed" : "pointer",
                  transition: "all 0.2s",
                  textAlign: "center",
                  lineHeight: "1.4",
                  minHeight: "100px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: isSelected ? "0 4px 12px rgba(91, 76, 204, 0.3)" : "0 2px 8px rgba(0, 0, 0, 0.1)",
                }}
                onMouseOver={(e) => {
                  if (!showResult && !isSelected) {
                    e.currentTarget.style.transform = "translateY(-4px)";
                    e.currentTarget.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.15)";
                  }
                }}
                onMouseOut={(e) => {
                  if (!showResult && !isSelected) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(0, 0, 0, 0.1)";
                  }
                }}
              >
                {option}
              </button>
            );
          })}
        </div>

        {showResult && (
          <div style={{
            textAlign: "center",
            marginBottom: "32px",
          }}>
            {isCorrect ? (
              <p style={{
                color: "#4CAF50",
                fontSize: "18px",
                fontWeight: "600",
                margin: 0,
              }}>
                ✓ Resposta correta!
              </p>
            ) : (
              <div>
                <p style={{
                  color: "#F44336",
                  fontSize: "18px",
                  fontWeight: "600",
                  margin: "0 0 8px 0",
                }}>
                  ✗ Resposta incorreta
                </p>
                <p style={{
                  color: "#374151",
                  fontSize: "14px",
                  margin: 0,
                }}>
                  A resposta correta é: {currentQuestion.options[currentQuestion.correct_answer]}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Botões de navegação */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          gap: "16px",
          marginTop: "48px",
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

          {quizFinished ? (
            <button
              onClick={handleNext}
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
              {isLastMission ? "Finalizar game" : "Próximo →"}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={selectedOption === null || showResult || isSubmitting}
              style={{
                padding: "10px 24px",
                fontSize: "14px",
                fontWeight: "600",
                backgroundColor: selectedOption !== null && !showResult && !isSubmitting ? "#FFC107" : "#cccccc",
                color: "#1E2875",
                border: "none",
                borderRadius: "6px",
                cursor: selectedOption !== null && !showResult && !isSubmitting ? "pointer" : "not-allowed",
                transition: "all 0.2s",
                boxShadow: selectedOption !== null && !showResult && !isSubmitting ? "0 2px 6px rgba(255, 193, 7, 0.3)" : "none",
                opacity: selectedOption !== null && !showResult && !isSubmitting ? 1 : 0.6,
              }}
              onMouseOver={(e) => {
                if (selectedOption !== null && !showResult && !isSubmitting) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow = "0 4px 12px rgba(255, 193, 7, 0.4)";
                }
              }}
              onMouseOut={(e) => {
                if (selectedOption !== null && !showResult && !isSubmitting) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 6px rgba(255, 193, 7, 0.3)";
                }
              }}
            >
              {isSubmitting ? "Validando..." : "Enviar resposta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
