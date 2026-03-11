import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Progresso from "./Progresso";

type MockResponse = {
  status: number;
  body: unknown;
};

const navigateMock = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    __esModule: true,
  };
});

const buildFetchQueue = (responses: MockResponse[]) => {
  let call = 0;

  return vi.fn().mockImplementation(async () => {
    const current = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return {
      ok: current.status >= 200 && current.status < 300,
      status: current.status,
      json: async () => current.body,
    };
  });
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <Progresso />
    </MemoryRouter>,
  );

describe("Progresso page", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("accessToken", "token-123");
    navigateMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renderiza perfil, card de games e card de desafios", async () => {
    const mockFetch = buildFetchQueue([
      {
        status: 200,
        body: { first_name: "Ana", last_name: "Silva", avatar_url: "/avatar.png" },
      },
      {
        status: 200,
        body: { level: 2, xp: 150, xpToNext: 350 },
      },
      {
        status: 200,
        body: [
          {
            id: 1,
            game: 88,
            game_name: "Segurança Digital",
            game_category: "Onboarding",
            game_points: 250,
            progress_percentage: 100,
            started_at: "2025-01-02",
            completed_at: "2025-01-15",
          },
        ],
      },
      {
        status: 200,
        body: { progress: [] },
      },
    ]);

    vi.spyOn(global, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    renderPage();

    expect(screen.getByText(/Carregando progresso/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Ana Silva")).toBeInTheDocument();
    });

    expect(screen.getByRole("heading", { name: "Games" })).toBeInTheDocument();
    expect(screen.getByText("Segurança Digital")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Visão geral de desafios/i }),
    ).toBeInTheDocument();
  });

  it("mostra estado vazio para games quando lista vem sem itens", async () => {
    const mockFetch = buildFetchQueue([
      {
        status: 200,
        body: { first_name: "João", last_name: "Teste" },
      },
      {
        status: 200,
        body: { level: 1, xp: 0, xpToNext: 500 },
      },
      {
        status: 200,
        body: [],
      },
      {
        status: 200,
        body: { progress: [] },
      },
    ]);
    vi.spyOn(global, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    renderPage();

    await waitFor(() => {
      expect(screen.getByText("Nenhum game iniciado.")).toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: "Jogar" })).toBeInTheDocument();
  });

  it("redireciona para login quando API retorna 401/403", async () => {
    const mockFetch = buildFetchQueue([
      { status: 401, body: {} },
      { status: 401, body: {} },
      { status: 401, body: {} },
      { status: 401, body: {} },
    ]);
    vi.spyOn(global, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/login", { replace: true });
    });
  });

  it("mantém aria-busy durante carregamento e desativa ao finalizar", async () => {
    const mockFetch = buildFetchQueue([
      {
        status: 200,
        body: { first_name: "Lia", last_name: "Souza" },
      },
      {
        status: 200,
        body: { level: 1, xp: 10, xpToNext: 490 },
      },
      {
        status: 200,
        body: [],
      },
      {
        status: 200,
        body: { progress: [] },
      },
    ]);
    vi.spyOn(global, "fetch").mockImplementation(mockFetch as unknown as typeof fetch);

    const { container } = renderPage();
    const root = container.querySelector(".progressoContainer");
    expect(root?.getAttribute("aria-busy")).toBe("true");

    await waitFor(() => {
      expect(screen.getByText("Lia Souza")).toBeInTheDocument();
    });

    expect(root?.getAttribute("aria-busy")).toBe("false");
  });
});

