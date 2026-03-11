import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { describe, expect, it } from "vitest";
import Leadboard, { type LeaderboardEntry } from "./Leadboard";
import { API_URL } from "../../config/api";

const baseEntries: LeaderboardEntry[] = [
  {
    userId: 1,
    name: "Alice Souza",
    tier: "Ouro",
    position: 1,
    game_id: 10,
    avatar_url: "/avatars/alice.png",
    badges: [],
  },
  {
    userId: 2,
    name: "Carlos Santos",
    nivel: "Prata",
    rank: "2",
    game_id: 10,
    avatar_url: "/avatars/carlos.png",
    badges: [],
  },
];

const renderLeadboard = (props: Partial<ComponentProps<typeof Leadboard>> = {}) =>
  render(
    <Leadboard
      courseName="Top jogadores"
      entries={baseEntries}
      trackedGameId={10}
      {...props}
    />,
  );

describe("Leadboard", () => {
  it("exibe estado de loading", () => {
    renderLeadboard({ isLoading: true });
    expect(screen.getByText("Carregando leaderboard...")).toBeInTheDocument();
  });

  it("exibe estado de erro com mensagem da API", () => {
    renderLeadboard({ errorMessage: "Erro de conexão" });
    expect(screen.getByText("Erro de conexão")).toBeInTheDocument();
  });

  it("exibe mensagem de vazio padrão quando não há entradas", () => {
    renderLeadboard({ entries: [] });
    expect(
      screen.getByText("Nenhum jogador no ranking deste game ainda."),
    ).toBeInTheDocument();
  });

  it("exibe mensagem de vazio contextual quando fornecida", () => {
    renderLeadboard({
      entries: [],
      emptyMessage: "Nenhum jogador no ranking desta trilha ainda.",
    });
    expect(
      screen.getByText("Nenhum jogador no ranking desta trilha ainda."),
    ).toBeInTheDocument();
  });

  it("renderiza lista com nome, nível e posição", () => {
    renderLeadboard();

    expect(screen.getByText("Alice Souza")).toBeInTheDocument();
    expect(screen.getByText("Jogador Ouro")).toBeInTheDocument();
    expect(screen.getByText("Carlos Santos")).toBeInTheDocument();
    expect(screen.getByText("Jogador Prata")).toBeInTheDocument();

    const positions = screen.getAllByText(/^(1|2)$/);
    expect(positions).toHaveLength(2);
  });

  it("destaca o usuário atual quando ele está no ranking", () => {
    renderLeadboard({ currentUserId: 1 });

    const highlight = screen.getByRole("group", {
      name: /Seu destaque no leaderboard/i,
    });

    expect(within(highlight).getByText("Alice Souza")).toBeInTheDocument();
    expect(within(highlight).getByText("Jogador Ouro")).toBeInTheDocument();
    expect(within(highlight).getByText("1")).toBeInTheDocument();
  });

  it("mostra placeholder 'Você' no destaque quando usuário não está no ranking", () => {
    renderLeadboard({ currentUserId: 999, trackedGameId: 55 });

    const highlight = screen.getByRole("group", {
      name: /Seu destaque no leaderboard/i,
    });

    expect(within(highlight).getByText("Você")).toBeInTheDocument();
    expect(within(highlight).getByText("Jogador")).toBeInTheDocument();
    expect(within(highlight).getByText("-")).toBeInTheDocument();

    expect(screen.getAllByText("Você")).toHaveLength(1);
  });

  it("faz fallback de avatar para iniciais quando imagem falha", async () => {
    renderLeadboard({ entries: [baseEntries[1]] });

    const row = screen.getByText("Carlos Santos").closest(".leaderboard-item") as HTMLElement;
    const avatarImage = row.querySelector('img[alt="Carlos Santos"]') as HTMLImageElement;
    fireEvent.error(avatarImage);

    await waitFor(() => {
      expect(within(row).getByText("CS")).toBeInTheDocument();
    });
  });

  it("exibe a maior badge conquistada no game rastreado", () => {
    renderLeadboard({
      entries: [
        {
          userId: 1,
          name: "Alice",
          tier: "Bronze",
          position: 1,
          game_id: 10,
          badges: [
            {
              game_id: 10,
              tier: 2,
              image_url: "https://cdn.example.com/tier2.png",
              unlocked_at: "2026-01-01T10:00:00Z",
            },
            {
              game_id: 10,
              tier: 4,
              image_url: "https://cdn.example.com/tier4.png",
              criterion: "course_points",
              value_mode: "percentage",
              required_value: 65,
              unlocked_at: "2026-01-02T10:00:00Z",
            },
            {
              game_id: 11,
              tier: 5,
              image_url: "https://cdn.example.com/tier5-outro-game.png",
              unlocked_at: "2026-01-03T10:00:00Z",
            },
          ],
        },
      ],
      trackedGameId: 10,
    });

    const image = screen.getByRole("img", {
      name: /Maior badge conquistada no game, tier 4/i,
    });
    expect(image).toHaveAttribute("src", "https://cdn.example.com/tier4.png");
  });

  it("não exibe badge quando usuário não tem badge no game rastreado", () => {
    renderLeadboard({
      entries: [
        {
          userId: 1,
          name: "Alice",
          tier: "Bronze",
          position: 1,
          game_id: 10,
          badges: [
            {
              game_id: 11,
              tier: 5,
              image_url: "https://cdn.example.com/tier5-outro-game.png",
              unlocked_at: "2026-01-03T10:00:00Z",
            },
          ],
        },
      ],
      trackedGameId: 10,
    });

    expect(
      screen.queryByRole("img", { name: /Maior badge conquistada no game/i }),
    ).not.toBeInTheDocument();
  });

  it("renderiza tooltip da badge com conteúdo esperado", () => {
    renderLeadboard({
      entries: [
        {
          userId: 1,
          name: "Guilherme",
          tier: "Ouro",
          position: 1,
          game_id: 75,
          badges: [
            {
              game_id: 75,
              tier: 1,
              image_url: "https://cdn.example.com/tier1.png",
              criterion: "course_points",
              value_mode: "percentage",
              required_value: 25,
              unlocked_at: "2026-02-12T20:30:00Z",
            },
          ],
        },
      ],
      trackedGameId: 75,
    });

    expect(screen.getByText("Jogador Ouro")).toBeInTheDocument();

    const badgeWrapper = screen.getByLabelText(/Maior badge do game: tier 1/i);
    fireEvent.mouseOver(badgeWrapper);

    expect(screen.getByText(/Explorador de Pontos - Tier 1/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Atingir 25% dos pontos totais do game\./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Conquistada em:/i)).toBeInTheDocument();
  });

  it("normaliza imagem de tier do backend para host do frontend", () => {
    renderLeadboard({
      entries: [
        {
          userId: 1,
          name: "Guilherme",
          tier: "Ouro",
          position: 1,
          game_id: 75,
          badges: [
            {
              game_id: 75,
              tier: 5,
              image_url: `${API_URL}/tier5.png`,
              criterion: "course_points",
              value_mode: "percentage",
              required_value: 100,
              unlocked_at: "2026-02-12T20:30:00Z",
            },
          ],
        },
      ],
      trackedGameId: 75,
    });

    const image = screen.getByRole("img", {
      name: /Maior badge conquistada no game, tier 5/i,
    });

    expect(image.getAttribute("src")).toContain("/tier5.png");
    expect(image.getAttribute("src")).not.toContain(":8000");
  });

  it("mantém classe base do card (smoke para evitar colisão de variante)", () => {
    const { container } = renderLeadboard();

    const card = container.querySelector(".leaderboard-card") as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card).not.toHaveClass("leaderboard-card--trilhas");
  });
});
