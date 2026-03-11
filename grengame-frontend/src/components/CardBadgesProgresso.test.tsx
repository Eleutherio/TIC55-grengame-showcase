import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import CardBadgesProgresso, {
  type BadgeChallenge,
} from "./CardBadgesProgresso";

const baseChallenges: BadgeChallenge[] = [
  {
    id: "10",
    badgeConfigId: 10,
    sourceIndex: 0,
    gameId: 1,
    gameName: "Alpha",
    criterion: "course_points",
    criterionLabel: "Ritmo Constante",
    valueMode: "percentage",
    isCompleted: false,
    nextTier: 3,
    nextRequiredValue: 60,
    currentValue: 40,
    progressToNextPercentage: 66,
    nextTierImageUrl: "/tier3.png",
  },
  {
    id: "11",
    badgeConfigId: 11,
    sourceIndex: 1,
    gameId: 2,
    gameName: "Beta",
    criterion: "active_days",
    criterionLabel: "Presença",
    valueMode: "absolute",
    isCompleted: false,
    nextTier: 2,
    nextRequiredValue: 5,
    currentValue: 1,
    progressToNextPercentage: 20,
    nextTierImageUrl: null,
  },
  {
    id: "12",
    badgeConfigId: 12,
    sourceIndex: 2,
    gameId: 1,
    gameName: "Alpha",
    criterion: "perfect_missions",
    criterionLabel: "Precisão",
    valueMode: "absolute",
    isCompleted: true,
    nextTier: 5,
    nextRequiredValue: 0,
    currentValue: 10,
    progressToNextPercentage: 100,
    nextTierImageUrl: "/tier5.png",
  },
];

const renderCard = (
  props: Partial<ComponentProps<typeof CardBadgesProgresso>> = {},
) =>
  render(
    <CardBadgesProgresso
      challenges={baseChallenges}
      {...props}
    />,
  );

describe("CardBadgesProgresso", () => {
  it("renderiza título, lista de pendentes, seção de concluídos e instrução", () => {
    renderCard();

    expect(
      screen.getByRole("heading", { name: /Visão geral de desafios/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Game: Alpha")).toHaveLength(2);
    expect(screen.getByText("Game: Beta")).toBeInTheDocument();
    expect(screen.getByText(/Desafios concluídos:/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Conclua missões deste game e alcance 60% dos pontos totais\./i),
    ).toBeInTheDocument();
  });

  it("filtra os desafios por game", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.selectOptions(screen.getByLabelText("Game"), "2");

    expect(screen.getByText("Game: Beta")).toBeInTheDocument();
    expect(screen.queryByText("Game: Alpha")).not.toBeInTheDocument();
  });

  it("aplica filtro de status e mostra mensagem vazia por contexto", async () => {
    const user = userEvent.setup();
    renderCard();

    await user.selectOptions(screen.getByLabelText("Status"), "completed");
    expect(screen.getByText("Game: Alpha")).toBeInTheDocument();
    expect(screen.queryByText("Game: Beta")).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Game"), "2");
    expect(
      screen.getByText("Nenhum desafio concluído para os filtros selecionados."),
    ).toBeInTheDocument();
  });

  it("ordena por tier com maior progresso", async () => {
    const user = userEvent.setup();
    const orderedChallenges: BadgeChallenge[] = [
      {
        ...baseChallenges[0],
        id: "20",
        gameName: "Gamma",
        gameId: 3,
        nextTier: 4,
        progressToNextPercentage: 30,
        isCompleted: false,
      },
      {
        ...baseChallenges[1],
        id: "21",
        gameName: "Delta",
        gameId: 4,
        nextTier: 4,
        progressToNextPercentage: 90,
        isCompleted: false,
      },
      {
        ...baseChallenges[2],
        id: "22",
        gameName: "Epsilon",
        gameId: 5,
        nextTier: 2,
        progressToNextPercentage: 100,
        isCompleted: false,
      },
    ];
    const { container } = render(
      <CardBadgesProgresso challenges={orderedChallenges} />,
    );

    await user.selectOptions(
      screen.getByLabelText("Ordenar por"),
      "tier_progress",
    );

    const names = Array.from(
      container.querySelectorAll(".desafiosBadgesList .desafiosBadgesGame"),
    ).map((node) => node.textContent);

    expect(names[0]).toBe("Game: Delta");
    expect(names[1]).toBe("Game: Gamma");
    expect(names[2]).toBe("Game: Epsilon");
  });

  it("exibe estado de erro quando informado", () => {
    renderCard({ errorMessage: "Falha ao carregar desafios" });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Falha ao carregar desafios",
    );
    expect(screen.queryByText("Game: Alpha")).not.toBeInTheDocument();
  });

  it("reseta o filtro de game quando o game selecionado deixa de existir", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <CardBadgesProgresso challenges={baseChallenges} />,
    );

    const gameSelect = screen.getByLabelText("Game") as HTMLSelectElement;
    await user.selectOptions(gameSelect, "2");
    expect(gameSelect.value).toBe("2");

    rerender(
      <CardBadgesProgresso
        challenges={baseChallenges.filter((challenge) => challenge.gameId === 1)}
      />,
    );

    expect((screen.getByLabelText("Game") as HTMLSelectElement).value).toBe(
      "all",
    );
  });

  it("executa callback ao dar duplo clique em um desafio", async () => {
    const user = userEvent.setup();
    const onChallengeDoubleClick = vi.fn();
    render(
      <CardBadgesProgresso
        challenges={baseChallenges}
        onChallengeDoubleClick={onChallengeDoubleClick}
      />,
    );

    const challengeNode = screen
      .getByText("Desafio: Ritmo Constante")
      .closest("li") as HTMLLIElement | null;
    expect(challengeNode).not.toBeNull();

    await user.dblClick(challengeNode as HTMLLIElement);

    expect(onChallengeDoubleClick).toHaveBeenCalledTimes(1);
    expect(onChallengeDoubleClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "10",
        gameId: 1,
        criterionLabel: "Ritmo Constante",
      }),
    );
  });
});
