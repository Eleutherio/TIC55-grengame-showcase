import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CartaoJogoCriterioBadge from "./CartaoJogoCriterioBadge";

type Props = ComponentProps<typeof CartaoJogoCriterioBadge>;

const renderCartaoJogoCriterioBadge = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    games: [
      { id: "1", name: "Game A", category: "Ambiental" },
      { id: "2", name: "Game B" },
    ],
    selectedGameId: "",
    selectedCriterion: "",
    selectedIsActive: false,
    isLoadingGames: false,
    isSaving: false,
    gamesError: null,
    criteriaOptions: [
      { id: "course_points", label: "Conquistador do Curso" },
      { id: "perfect_missions", label: "Perfeccionista" },
      { id: "active_days", label: "Ritmo Constante" },
    ],
    criterionHelpText: "Ajuda do criterio.",
    onGameChange: vi.fn(),
    onCriterionChange: vi.fn(),
    onStatusChange: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<CartaoJogoCriterioBadge {...props} />),
  };
};

describe("CartaoJogoCriterioBadge", () => {
  it("renderiza campos obrigatorios, opcoes e estados iniciais", () => {
    renderCartaoJogoCriterioBadge();

    expect(
      screen.getByRole("heading", { name: /1\. Game e criterio/i })
    ).toBeInTheDocument();

    const gameSelect = screen.getByLabelText(/Game/i);
    const criterionSelect = screen.getByLabelText(/Criterio de desbloqueio/i);
    const statusSelect = screen.getByLabelText(/Status da badge/i);

    expect(gameSelect).toBeRequired();
    expect(criterionSelect).toBeRequired();
    expect(criterionSelect).toBeDisabled();
    expect(statusSelect).toBeDisabled();

    expect(
      screen.getAllByRole("option", { name: /Selecione um game primeiro/i })
    ).toHaveLength(2);
    expect(
      screen.getByRole("option", { name: /Game A - Ambiental/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Ajuda do criterio.")).toBeInTheDocument();
    expect(screen.queryByText(/Pagina \d+ de \d+/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Selecione um game para habilitar o status da badge\./i
      )
    ).toBeInTheDocument();
  });

  it("habilita selects e dispara callbacks ao alterar game, criterio e status", () => {
    const { props } = renderCartaoJogoCriterioBadge({
      selectedGameId: "1",
      selectedCriterion: "course_points",
      selectedIsActive: false,
    });

    const gameSelect = screen.getByLabelText(/Game/i);
    const criterionSelect = screen.getByLabelText(/Criterio de desbloqueio/i);
    const statusSelect = screen.getByLabelText(/Status da badge/i);

    expect(criterionSelect).toBeEnabled();
    expect(statusSelect).toBeEnabled();

    fireEvent.change(gameSelect, { target: { value: "2" } });
    fireEvent.change(criterionSelect, { target: { value: "perfect_missions" } });
    fireEvent.change(statusSelect, { target: { value: "published" } });
    fireEvent.change(statusSelect, { target: { value: "draft" } });

    expect(props.onGameChange).toHaveBeenCalledWith("2");
    expect(props.onCriterionChange).toHaveBeenCalledWith("perfect_missions");
    expect(props.onStatusChange).toHaveBeenNthCalledWith(1, true);
    expect(props.onStatusChange).toHaveBeenNthCalledWith(2, false);
  });

  it("aplica bloqueios de loading/saving, mostra erro e texto de status publicado", () => {
    renderCartaoJogoCriterioBadge({
      selectedGameId: "1",
      selectedCriterion: "course_points",
      selectedIsActive: true,
      isLoadingGames: true,
      isSaving: true,
      gamesError: "Falha ao carregar games.",
    });

    const gameSelect = screen.getByLabelText(/Game/i);
    const criterionSelect = screen.getByLabelText(/Criterio de desbloqueio/i);
    const statusSelect = screen.getByLabelText(/Status da badge/i);

    expect(gameSelect).toBeDisabled();
    expect(criterionSelect).toBeDisabled();
    expect(statusSelect).toBeDisabled();

    expect(screen.getByText("Falha ao carregar games.")).toBeInTheDocument();
    expect(
      screen.getByText(/Publicado: jogadores podem progredir e desbloquear tiers\./i)
    ).toBeInTheDocument();
  });

  it("ajusta placeholder do criterio quando game ja foi selecionado", () => {
    renderCartaoJogoCriterioBadge({
      selectedGameId: "1",
      selectedCriterion: "",
    });

    expect(
      screen.getByRole("option", { name: /Selecione um criterio/i })
    ).toBeInTheDocument();
  });

  it("ignora mudanca invalida de status para proteger estado", () => {
    const { props } = renderCartaoJogoCriterioBadge({
      selectedGameId: "1",
      selectedCriterion: "course_points",
      selectedIsActive: false,
    });

    const statusSelect = screen.getByLabelText(/Status da badge/i);
    fireEvent.change(statusSelect, { target: { value: "" } });

    expect(props.onStatusChange).not.toHaveBeenCalled();
  });
});
