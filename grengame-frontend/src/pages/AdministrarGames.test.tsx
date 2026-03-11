import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdministrarGames from "./AdministrarGames";

const mockCourses = [
  {
    id: 1,
    name: "Game 1",
    description: "Desc 1",
    category: "Cat1",
    banner: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
  },
];

const renderPage = () => {
  const router = createMemoryRouter([{ path: "/", element: <AdministrarGames /> }], {
    initialEntries: ["/"],
  });
  return render(<RouterProvider router={router} />);
};

const mockFetch = (data: any) => {
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(data),
    } as Response)
  ) as any;
};

describe("AdministrarGames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("accessToken", "token");
    mockFetch(mockCourses);
    Element.prototype.scrollIntoView = vi.fn();
    URL.createObjectURL = vi.fn(() => "blob:mock");
    URL.revokeObjectURL = vi.fn();
  });

  it("renderiza página", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/Painel administrativo de games/i)).toBeInTheDocument();
    });
  });

  it("valida nome obrigatório", async () => {
    renderPage();
    await waitFor(() =>
      screen.getByRole("button", { name: /Salvar e prosseguir/i })
    );
    
    fireEvent.click(
      screen.getByRole("button", { name: /Salvar e prosseguir/i })
    );
    
    await waitFor(() => {
      expect(screen.getByText(/Preencha o nome do game/i)).toBeInTheDocument();
    });
  });

  it("preenche formulário", async () => {
    renderPage();
    await waitFor(() => screen.getByPlaceholderText(/Sustentabilidade na Grendene/i));

    const nameInput = screen.getByPlaceholderText(/Sustentabilidade na Grendene/i);
    fireEvent.change(nameInput, { target: { value: "Novo Game" } });

    expect(nameInput).toHaveValue("Novo Game");
  });

  it("abre modal de banner", async () => {
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /Adicionar banner principal/i }));

    fireEvent.click(screen.getByRole("button", { name: /Adicionar banner principal/i }));

    await waitFor(() => {
      expect(screen.getByText(/Arraste e solte a imagem/i)).toBeInTheDocument();
    });
  });

  it("valida banner inválido", async () => {
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /Adicionar banner principal/i }));

    fireEvent.click(screen.getByRole("button", { name: /Adicionar banner principal/i }));

    await waitFor(() => screen.getByText(/Arraste e solte/i));

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["content"], "test.txt", { type: "text/plain" });

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Selecione uma imagem válida/i)).toBeInTheDocument();
    });
  });

  it("exibe lista de games", async () => {
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /Mostrar Games cadastrados/i }));

    fireEvent.click(screen.getByRole("button", { name: /Mostrar Games cadastrados/i }));

    await waitFor(() => {
      expect(screen.getByText("Game 1")).toBeInTheDocument();
    });
  });

  it("abre modal de exclusão", async () => {
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /Mostrar Games cadastrados/i }));

    fireEvent.click(screen.getByRole("button", { name: /Mostrar Games cadastrados/i }));

    await waitFor(() => screen.getByText("Game 1"));

    const deleteBtn = screen.getByRole("button", { name: /Excluir/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText(/Essa ação não poderá ser desfeita/i)).toBeInTheDocument();
    });
  });

  it("inicia tour", async () => {
    renderPage();
    await waitFor(() => screen.getByRole("button", { name: /Não sabe por onde começar/i }));

    fireEvent.click(screen.getByRole("button", { name: /Não sabe por onde começar/i }));

    await waitFor(() => {
      expect(screen.getByText(/Tutorial/i)).toBeInTheDocument();
    });
  });
});
