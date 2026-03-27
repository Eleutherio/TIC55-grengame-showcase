import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdministrarBadges from "./AdministrarBadges";
import { API_URL } from "../config/api";

const captured = vi.hoisted(() => ({
  jogoProps: [] as Array<Record<string, unknown>>,
  salvasProps: [] as Array<Record<string, unknown>>,
}));

vi.mock("../components/badges/CartaoJogoCriterioBadge", () => ({
  default: (props: Record<string, unknown>) => {
    captured.jogoProps.push(props);
    const games = Array.isArray(props.games) ? props.games : [];
    return (
      <section data-testid="cartao-jogo-criterio-badge">
        <p>games-no-seletor:{games.length}</p>
        {typeof props.gamesError === "string" && props.gamesError ? (
          <p>erro-games:{props.gamesError}</p>
        ) : null}
      </section>
    );
  },
}));

vi.mock("../components/badges/BadgeTierRulesCard", () => ({
  default: () => <section data-testid="cartao-regras-tier">regras tier</section>,
}));

vi.mock("../components/badges/BadgePreviewCard", () => ({
  default: () => <section data-testid="cartao-preview-badge">preview badge</section>,
}));

vi.mock("../components/badges/CartaoBadgesSalvas", () => ({
  default: (props: Record<string, unknown>) => {
    captured.salvasProps.push(props);
    return (
      <section data-testid="cartao-badges-salvas">
        <p>
          pagina-salvas:{String(props.savedGamesPage)} de {String(props.savedGamesTotalPages)}
        </p>
        <button
          type="button"
          onClick={() =>
            (props.onSavedGamesPagePrevious as (() => void) | undefined)?.()
          }
        >
          pagina-salvas-anterior
        </button>
        <button
          type="button"
          onClick={() => (props.onSavedGamesPageNext as (() => void) | undefined)?.()}
        >
          pagina-salvas-proxima
        </button>
      </section>
    );
  },
}));

const mockJsonResponse = (payload: unknown, status = 200) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }) as Response;

describe("AdministrarBadges", () => {
  beforeEach(() => {
    captured.jogoProps = [];
    captured.salvasProps = [];
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("carrega seletor de games sem paginacao e usa paginacao apenas em badges salvas", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === `${API_URL}/auth/games/`) {
        return Promise.resolve(
          mockJsonResponse([
            { id: 1, name: "Game A" },
            { id: 2, name: "Game B" },
          ]),
        );
      }

      if (url.includes("/auth/games/?page=1&limit=10")) {
        return Promise.resolve(
          mockJsonResponse({
            results: [{ id: 10, name: "Game Salvo A" }],
            pagination: {
              page: 1,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: true,
              has_previous: false,
            },
          }),
        );
      }

      if (url.includes("/auth/games/10/badge-config/")) {
        return Promise.resolve(mockJsonResponse([]));
      }

      return Promise.resolve(mockJsonResponse([]));
    });

    render(<AdministrarBadges />);

    await waitFor(() => {
      expect(screen.getByText("games-no-seletor:2")).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/games/`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_URL}/auth/games/?page=1&limit=10`,
      expect.objectContaining({ headers: expect.any(Object) }),
    );

    const lastJogoProps = captured.jogoProps[captured.jogoProps.length - 1];
    expect(lastJogoProps).toBeTruthy();
    expect("gamesPage" in lastJogoProps).toBe(false);
    expect("gamesTotalPages" in lastJogoProps).toBe(false);
  });

  it("avanca a pagina de badges salvas e busca pagina 2 no backend", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === `${API_URL}/auth/games/`) {
        return Promise.resolve(mockJsonResponse([{ id: 1, name: "Game A" }]));
      }

      if (url.includes("/auth/games/?page=1&limit=10")) {
        return Promise.resolve(
          mockJsonResponse({
            results: [{ id: 10, name: "Game Salvo A" }],
            pagination: {
              page: 1,
              limit: 10,
              total: 11,
              total_pages: 2,
              has_next: true,
              has_previous: false,
            },
          }),
        );
      }

      if (url.includes("/auth/games/?page=2&limit=10")) {
        return Promise.resolve(
          mockJsonResponse({
            results: [{ id: 11, name: "Game Salvo B" }],
            pagination: {
              page: 2,
              limit: 10,
              total: 11,
              total_pages: 2,
              has_next: false,
              has_previous: true,
            },
          }),
        );
      }

      if (url.includes("/auth/games/10/badge-config/") || url.includes("/auth/games/11/badge-config/")) {
        return Promise.resolve(mockJsonResponse([]));
      }

      return Promise.resolve(mockJsonResponse([]));
    });

    render(<AdministrarBadges />);

    await waitFor(() => {
      expect(screen.getByText(/pagina-salvas:1 de 2/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /pagina-salvas-proxima/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_URL}/auth/games/?page=2&limit=10`,
        expect.objectContaining({ headers: expect.any(Object) }),
      );
    });
  });

  it("propaga erro quando falha no carregamento de games do seletor", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
      const url = String(input);

      if (url === `${API_URL}/auth/games/`) {
        return Promise.resolve(mockJsonResponse({ detail: "erro" }, 500));
      }

      if (url.includes("/auth/games/?page=1&limit=10")) {
        return Promise.resolve(
          mockJsonResponse({
            results: [],
            pagination: {
              page: 1,
              limit: 10,
              total: 0,
              total_pages: 0,
              has_next: false,
              has_previous: false,
            },
          }),
        );
      }

      return Promise.resolve(mockJsonResponse([]));
    });

    render(<AdministrarBadges />);

    await waitFor(() => {
      expect(
        screen.getByText(/erro-games:Não foi possível carregar os games\./i),
      ).toBeInTheDocument();
    });
  });
});
