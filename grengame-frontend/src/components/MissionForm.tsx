import { useState } from "react";

type MissionType = "video" | "texto" | "quiz" | "wordle";

type FormStatus = {
  type: "success" | "error" | "info";
  text: string;
};

type QuizQuestion = {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number | null;
  points: number;
};

type MissionFormProps = {
  missionType: MissionType;
  typeLabel: string;
  selectedGameLabel: string;
  formStatus: FormStatus | null;
  missionTitle: string;
  missionPoints: number;
  missionDescription: string;
  videoUrl: string;
  videoDuration: string;
  videoRequireWatch: boolean;
  readingText: string;
  readingMinTime: string;
  wordleWord: string;
  wordleHints: string;
  quizItems: QuizQuestion[];
  isSaving: boolean;
  isSaveDisabled: boolean;
  isEditing?: boolean;
  fieldErrors?: Record<string, string[]>;
  onMissionTitleChange: (value: string) => void;
  onMissionPointsChange: (value: number) => void;
  onMissionDescriptionChange: (value: string) => void;
  onVideoUrlChange: (value: string) => void;
  onVideoDurationChange: (value: string) => void;
  onVideoRequireWatchChange: (value: boolean) => void;
  onReadingTextChange: (value: string) => void;
  onReadingMinTimeChange: (value: string) => void;
  onWordleWordChange: (value: string) => void;
  onWordleHintsChange: (value: string) => void;
  onQuizAdd: () => void;
  onQuizPromptChange: (questionId: string, value: string) => void;
  onQuizOptionChange: (
    questionId: string,
    optionIndex: number,
    value: string
  ) => void;
  onQuizCorrectSelect: (questionId: string, optionIndex: number) => void;
  onQuizPointsChange: (questionId: string, value: number) => void;
  onQuizRemove: (questionId: string) => void;
  onClear: () => void;
  onCancelEdit?: () => void;
  onSave: () => void;
};

export type { MissionType, FormStatus, QuizQuestion };

export default function MissionForm({
  missionType,
  typeLabel,
  selectedGameLabel,
  formStatus,
  missionTitle,
  missionPoints,
  missionDescription,
  videoUrl,
  videoDuration,
  videoRequireWatch,
  readingText,
  readingMinTime,
  wordleWord,
  wordleHints,
  quizItems,
  isSaving,
  isSaveDisabled,
  isEditing = false,
  fieldErrors = {},
  onMissionTitleChange,
  onMissionPointsChange,
  onMissionDescriptionChange,
  onVideoUrlChange,
  onVideoDurationChange,
  onVideoRequireWatchChange,
  onReadingTextChange,
  onReadingMinTimeChange,
  onWordleWordChange,
  onWordleHintsChange,
  onQuizAdd,
  onQuizPromptChange,
  onQuizOptionChange,
  onQuizCorrectSelect,
  onQuizPointsChange,
  onQuizRemove,
  onClear,
  onCancelEdit,
  onSave,
}: MissionFormProps) {
  const [showReadingPreview, setShowReadingPreview] = useState(false);
  const getFieldError = (fieldKey: string) => fieldErrors[fieldKey]?.[0] ?? null;
  const getFieldErrorId = (fieldKey: string) =>
    `mission-field-error-${fieldKey.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

  return (
    <div className="mission-form">
      <div className="form-header">
        <div>
          <p className="form-eyebrow">Nova missão</p>
          <h2>{missionType.toUpperCase()}</h2>
          <p className="form-game">{selectedGameLabel}</p>
        </div>
        <span className={`type-pill ${missionType}`}>{typeLabel}</span>
      </div>

      {isSaving && (
        <div className="form-status loading" role="status" aria-live="polite">
          <span className="loading-spinner" aria-hidden="true" />
          Salvando missão...
        </div>
      )}

      {formStatus && (
        <div className={`form-status ${formStatus.type}`}>
          {formStatus.text}
        </div>
      )}

      <div className="form-grid">
        <label className="form-field">
          <span>Título da missão</span>
          {getFieldError("missionTitle") && (
            <span
              className="field-error"
              id={getFieldErrorId("missionTitle")}
            >
              {getFieldError("missionTitle")}
            </span>
          )}
          <input
            type="text"
            value={missionTitle}
            onChange={(event) => onMissionTitleChange(event.target.value)}
            placeholder="Ex: Desafio de reciclagem"
            aria-invalid={Boolean(getFieldError("missionTitle"))}
            aria-describedby={
              getFieldError("missionTitle")
                ? getFieldErrorId("missionTitle")
                : undefined
            }
          />
        </label>
        <label className="form-field">
          <span>Pontos</span>
          {getFieldError("missionPoints") && (
            <span
              className="field-error"
              id={getFieldErrorId("missionPoints")}
            >
              {getFieldError("missionPoints")}
            </span>
          )}
          <input
            type="number"
            min={1}
            value={missionPoints}
            onChange={(event) =>
              onMissionPointsChange(Number(event.target.value))
            }
            aria-invalid={Boolean(getFieldError("missionPoints"))}
            aria-describedby={
              getFieldError("missionPoints")
                ? getFieldErrorId("missionPoints")
                : undefined
            }
          />
        </label>
        <label className="form-field full">
          <span>Descricao curta</span>
          {getFieldError("missionDescription") && (
            <span
              className="field-error"
              id={getFieldErrorId("missionDescription")}
            >
              {getFieldError("missionDescription")}
            </span>
          )}
          <textarea
            rows={3}
            value={missionDescription}
            onChange={(event) => onMissionDescriptionChange(event.target.value)}
            placeholder="Explique rapidamente o que o jogador deve fazer."
            aria-invalid={Boolean(getFieldError("missionDescription"))}
            aria-describedby={
              getFieldError("missionDescription")
                ? getFieldErrorId("missionDescription")
                : undefined
            }
          />
        </label>

        {missionType === "quiz" && (
          <div className="form-field full quiz-builder">
            <div className="quiz-builder-header">
              <h3>Perguntas *</h3>
              <button
                type="button"
                className="quiz-add-button"
                onClick={onQuizAdd}
              >
                + Adicionar Pergunta
              </button>
            </div>
            {getFieldError("quizItems") && (
              <p className="field-error" id={getFieldErrorId("quizItems")}>
                {getFieldError("quizItems")}
              </p>
            )}

            <div className="quiz-list">
              {quizItems.map((question, index) => (
                <div key={question.id} className="quiz-card">
                  <button
                    type="button"
                    className="quiz-remove-button"
                    onClick={() => onQuizRemove(question.id)}
                    aria-label={`Remover pergunta ${index + 1}`}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 6h18" />
                      <path d="M8 6V4h8v2" />
                      <path d="M7 6l1 14h8l1-14" />
                      <path d="M10 10v6" />
                      <path d="M14 10v6" />
                    </svg>
                  </button>
                  <label className="quiz-label">
                    <span>Pergunta {index + 1} *</span>
                    {getFieldError(`quiz.prompt.${question.id}`) && (
                      <span
                        className="field-error"
                        id={getFieldErrorId(`quiz.prompt.${question.id}`)}
                      >
                        {getFieldError(`quiz.prompt.${question.id}`)}
                      </span>
                    )}
                    <textarea
                      rows={2}
                      value={question.prompt}
                      onChange={(event) =>
                        onQuizPromptChange(question.id, event.target.value)
                      }
                      placeholder="Digite a pergunta..."
                      aria-invalid={Boolean(
                        getFieldError(`quiz.prompt.${question.id}`)
                      )}
                      aria-describedby={
                        getFieldError(`quiz.prompt.${question.id}`)
                          ? getFieldErrorId(`quiz.prompt.${question.id}`)
                          : undefined
                      }
                    />
                  </label>

                  <label className="quiz-points">
                    <span>Pontos</span>
                    {getFieldError(`quiz.points.${question.id}`) && (
                      <span
                        className="field-error"
                        id={getFieldErrorId(`quiz.points.${question.id}`)}
                      >
                        {getFieldError(`quiz.points.${question.id}`)}
                      </span>
                    )}
                    <input
                      type="number"
                      min={0}
                      value={question.points}
                      onChange={(event) =>
                        onQuizPointsChange(
                          question.id,
                          Number(event.target.value)
                        )
                      }
                      aria-invalid={Boolean(
                        getFieldError(`quiz.points.${question.id}`)
                      )}
                      aria-describedby={
                        getFieldError(`quiz.points.${question.id}`)
                          ? getFieldErrorId(`quiz.points.${question.id}`)
                          : undefined
                      }
                    />
                  </label>

                  <div className="quiz-options">
                    <span className="quiz-label">Opcoes de Resposta *</span>
                    {getFieldError(`quiz.correct.${question.id}`) && (
                      <p
                        className="field-error"
                        id={getFieldErrorId(`quiz.correct.${question.id}`)}
                      >
                        {getFieldError(`quiz.correct.${question.id}`)}
                      </p>
                    )}
                    {question.options.map((option, optionIndex) => (
                      <label
                        key={`${question.id}-option-${optionIndex}`}
                        className="quiz-option-row"
                      >
                        <input
                          type="radio"
                          name={`quiz-correct-${question.id}`}
                          checked={question.correctIndex === optionIndex}
                          onChange={() =>
                            onQuizCorrectSelect(question.id, optionIndex)
                          }
                          aria-invalid={Boolean(
                            getFieldError(`quiz.correct.${question.id}`)
                          )}
                          aria-describedby={
                            getFieldError(`quiz.correct.${question.id}`)
                              ? getFieldErrorId(`quiz.correct.${question.id}`)
                              : undefined
                          }
                        />
                        <input
                          type="text"
                          value={option}
                          onChange={(event) =>
                            onQuizOptionChange(
                              question.id,
                              optionIndex,
                              event.target.value
                            )
                          }
                          placeholder={`Opcao ${optionIndex + 1}`}
                          aria-invalid={Boolean(
                            getFieldError(
                              `quiz.option.${question.id}.${optionIndex}`
                            )
                          )}
                          aria-describedby={
                            getFieldError(
                              `quiz.option.${question.id}.${optionIndex}`
                            )
                              ? getFieldErrorId(
                                  `quiz.option.${question.id}.${optionIndex}`
                                )
                              : undefined
                          }
                        />
                        {getFieldError(
                          `quiz.option.${question.id}.${optionIndex}`
                        ) && (
                          <span
                            className="field-error"
                            id={getFieldErrorId(
                              `quiz.option.${question.id}.${optionIndex}`
                            )}
                          >
                            {getFieldError(
                              `quiz.option.${question.id}.${optionIndex}`
                            )}
                          </span>
                        )}
                      </label>
                    ))}
                    <p className="quiz-helper">
                      Selecione a resposta correta clicando no botao de radio
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {missionType === "video" && (
          <>
            <label className="form-field full">
              <span>URL do video</span>
              {getFieldError("videoUrl") && (
                <span className="field-error" id={getFieldErrorId("videoUrl")}>
                  {getFieldError("videoUrl")}
                </span>
              )}
              <input
                type="text"
                value={videoUrl}
                onChange={(event) => onVideoUrlChange(event.target.value)}
                placeholder="https://"
                aria-invalid={Boolean(getFieldError("videoUrl"))}
                aria-describedby={
                  getFieldError("videoUrl")
                    ? getFieldErrorId("videoUrl")
                    : undefined
                }
              />
            </label>
            <label className="form-field">
              <span>Duracao (min)</span>
              {getFieldError("videoDuration") && (
                <span
                  className="field-error"
                  id={getFieldErrorId("videoDuration")}
                >
                  {getFieldError("videoDuration")}
                </span>
              )}
              <input
                type="number"
                min={1}
                value={videoDuration}
                inputMode="numeric"
                onChange={(event) => onVideoDurationChange(event.target.value)}
                aria-invalid={Boolean(getFieldError("videoDuration"))}
                aria-describedby={
                  getFieldError("videoDuration")
                    ? getFieldErrorId("videoDuration")
                    : undefined
                }
              />
            </label>
            <label className="form-field full checkbox-row">
              <input
                type="checkbox"
                checked={videoRequireWatch}
                onChange={(event) =>
                  onVideoRequireWatchChange(event.target.checked)
                }
              />
              <span>Requer assistir até o fim</span>
            </label>
          </>
        )}

        {missionType === "texto" && (
          <div className="form-field full">
            <label className="form-field full">
              <span>Texto base</span>
              {getFieldError("readingText") && (
                <span className="field-error" id={getFieldErrorId("readingText")}>
                  {getFieldError("readingText")}
                </span>
              )}
              <textarea
                rows={4}
                value={readingText}
                onChange={(event) => onReadingTextChange(event.target.value)}
                placeholder="Cole aqui o conteudo principal da leitura."
                aria-invalid={Boolean(getFieldError("readingText"))}
                aria-describedby={
                  getFieldError("readingText")
                    ? getFieldErrorId("readingText")
                    : undefined
                }
              />
            </label>
            <div className="reading-controls">
              <label className="form-field">
                <span>Tempo minimo de leitura (min)</span>
                {getFieldError("readingMinTime") && (
                  <span
                    className="field-error"
                    id={getFieldErrorId("readingMinTime")}
                  >
                    {getFieldError("readingMinTime")}
                  </span>
                )}
                <input
                  type="number"
                  min={1}
                  value={readingMinTime}
                  inputMode="numeric"
                  onChange={(event) => onReadingMinTimeChange(event.target.value)}
                  aria-invalid={Boolean(getFieldError("readingMinTime"))}
                  aria-describedby={
                    getFieldError("readingMinTime")
                      ? getFieldErrorId("readingMinTime")
                      : undefined
                  }
                />
              </label>
              <button
                type="button"
                className="btn-ghost"
                onClick={() =>
                  setShowReadingPreview((previous) => !previous)
                }
              >
                {showReadingPreview ? "Ocultar preview" : "Preview"}
              </button>
            </div>
            {showReadingPreview && (
              <div className="reading-preview">
                {readingText.trim() ? (
                  readingText
                ) : (
                  <span className="reading-preview-empty">
                    Adicione um texto para visualizar o preview.
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {missionType === "wordle" && (
          <>
            <label className="form-field">
              <span>Palavra secreta</span>
              {getFieldError("wordleWord") && (
                <span className="field-error" id={getFieldErrorId("wordleWord")}>
                  {getFieldError("wordleWord")}
                </span>
              )}
              <input
                type="text"
                maxLength={5}
                value={wordleWord}
                onChange={(event) => onWordleWordChange(event.target.value)}
                placeholder="Ex: PRAIA"
                aria-invalid={Boolean(getFieldError("wordleWord"))}
                aria-describedby={
                  getFieldError("wordleWord")
                    ? getFieldErrorId("wordleWord")
                    : undefined
                }
              />
              <span className="field-helper">
                Critérios do backend: exatamente 5 letras, sem números e sem símbolos.
              </span>
            </label>
            <label className="form-field full">
              <span>Dicas (opcional)</span>
              <textarea
                rows={3}
                value={wordleHints}
                onChange={(event) => onWordleHintsChange(event.target.value)}
                placeholder="Separe cada dica por linha."
              />
              <span className="field-helper">
                As dicas serao exibidas ao jogador durante o desafio.
              </span>
            </label>
          </>
        )}
      </div>

      <div className="form-actions">
        {isEditing && onCancelEdit && (
          <button type="button" className="btn-ghost" onClick={onCancelEdit}>
            Cancelar edição
          </button>
        )}
        <button type="button" className="btn-ghost" onClick={onClear}>
          Limpar campos
        </button>
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={isSaveDisabled}
        >
          {isSaving ? "Salvando..." : isEditing ? "Atualizar" : "Adicionar"}
        </button>
      </div>
    </div>
  );
}
