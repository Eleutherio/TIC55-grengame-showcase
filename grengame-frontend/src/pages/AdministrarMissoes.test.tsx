import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdministrarMissoes from "./AdministrarMissoes";

const mockGames = [
  {
    id: 10,
    name: "Game A",
    category: "Categoria",
  },
];

const okResponse = (data: unknown) =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
  } as Response);

const mockFetch = () => {
  global.fetch = vi.fn((input: RequestInfo, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.url;
    const method = init?.method ?? "GET";

    if (url.includes("/auth/games/") && method === "GET") {
      return okResponse(mockGames);
    }

    if (url.includes("/auth/missoes/") && method === "GET") {
      return okResponse([]);
    }

    if (url.includes("/auth/missoes/") && method === "POST") {
      return okResponse({
        id: 99,
        order: 1,
        created_at: "2024-01-01T00:00:00Z",
      });
    }

    if (url.includes("/auth/missoes/") && method === "PATCH") {
      return okResponse({});
    }

    return okResponse([]);
  }) as any;
};

const renderPage = () =>
  render(
    <MemoryRouter>
      <AdministrarMissoes />
    </MemoryRouter>,
  );

const selectGame = async () => {
  const select = await screen.findByLabelText(/Game selecionado/i);
  fireEvent.change(select, { target: { value: "10" } });
  await screen.findByText(/Nenhuma miss.o cadastrada/i);
  return select as HTMLSelectElement;
};

const fillVideoMission = async () => {
  await selectGame();

  const videoButton = screen.getByRole("button", { name: /Video/i });
  fireEvent.click(videoButton);

  fireEvent.change(screen.getByPlaceholderText(/Desafio de reciclagem/i), {
    target: { value: "Missao 1" },
  });

  fireEvent.change(
    screen.getByPlaceholderText(/Explique rapidamente/i),
    {
      target: { value: "Descricao da missao" },
    },
  );

  fireEvent.change(screen.getByLabelText(/URL do video/i), {
    target: { value: "https://example.com/video" },
  });

  fireEvent.change(screen.getByLabelText(/Duracao/i), {
    target: { value: "5" },
  });
};

describe("AdministrarMissoes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("accessToken", "token");
    mockFetch();
  });

  it("renderiza e carrega games", async () => {
    renderPage();

    expect(
      await screen.findByRole("heading", { name: /Gerenciador de Miss/i }),
    ).toBeInTheDocument();

    expect(
      await screen.findByRole("option", { name: /Game A/i }),
    ).toBeInTheDocument();
  });

  it("adiciona uma missao local e mostra sucesso", async () => {
    renderPage();
    await fillVideoMission();

    const addButton = screen.getByRole("button", { name: /Adicionar/i });
    fireEvent.click(addButton);

    expect(
      await screen.findByText(/Miss.o adicionada com sucesso/i),
    ).toBeInTheDocument();
  });

  it("habilita salvar game quando ha missao pendente", async () => {
    renderPage();

    const saveButton = await screen.findByRole("button", {
      name: /Salvar game/i,
    });
    expect(saveButton).toBeDisabled();

    await fillVideoMission();

    fireEvent.click(screen.getByRole("button", { name: /Adicionar/i }));

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled();
    });
  });

  it("salva game e mostra modal de sucesso", async () => {
    renderPage();
    await fillVideoMission();

    fireEvent.click(screen.getByRole("button", { name: /Adicionar/i }));

    const saveButton = screen.getByRole("button", { name: /Salvar game/i });
    fireEvent.click(saveButton);

    expect(
      await screen.findByText(/Game salvo com sucesso/i),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", { name: /Ver o meu game/i }),
    ).toBeInTheDocument();
  });

  it("exibe botão de cancelar no modo edição e sai da edição ao clicar", async () => {
    renderPage();
    await fillVideoMission();

    fireEvent.click(screen.getByRole("button", { name: /Adicionar/i }));
    fireEvent.click(screen.getByRole("button", { name: /Editar/i }));

    expect(
      screen.getByRole("button", { name: /Cancelar edição/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Atualizar/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cancelar edição/i }));

    expect(await screen.findByText(/Edição cancelada/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Cancelar edição/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar/i })).toBeInTheDocument();
  });

  it("aplica validação de backend para Wordle e só libera adicionar com palavra válida", async () => {
    renderPage();
    await selectGame();

    fireEvent.click(screen.getByRole("button", { name: /Wordle/i }));

    fireEvent.change(screen.getByPlaceholderText(/Desafio de reciclagem/i), {
      target: { value: "Wordle 1" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Explique rapidamente/i), {
      target: { value: "Adivinhe a palavra secreta." },
    });

    const wordInput = screen.getByLabelText(/Palavra secreta/i);
    fireEvent.change(wordInput, { target: { value: "ECOLOGIA" } });

    expect(
      screen.getByText(/Critérios do backend: exatamente 5 letras/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/deve ter exatamente 5 letras/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Adicionar/i })).toBeDisabled();

    fireEvent.change(wordInput, { target: { value: "PRAIA" } });

    await waitFor(() => {
      expect(
        screen.queryByText(/deve ter exatamente 5 letras/i),
      ).not.toBeInTheDocument();
    });
    expect(screen.getByRole("button", { name: /Adicionar/i })).not.toBeDisabled();
  });
});
