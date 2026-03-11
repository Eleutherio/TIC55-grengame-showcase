import { render, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, afterEach, beforeEach, describe, expect, it } from "vitest";
import Perfil from "./Perfil";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

type FetchResponse = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};

const originalGlobals = {
  fetch: globalThis.fetch,
  FileReader: globalThis.FileReader,
  Image: globalThis.Image,
  localStorage: globalThis.localStorage,
  HTMLCanvasElement: globalThis.HTMLCanvasElement,
};

class MockFileReader {
  public result: string | ArrayBuffer | null = null;
  public onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null;

  readAsDataURL(file: Blob) {
    this.result = `data:${file.type};base64,mock-data`;
    setTimeout(() => {
      this.onload?.call(this as unknown as FileReader, {
        target: { result: this.result },
      } as ProgressEvent<FileReader>);
    }, 0);
  }
}

class MockImage {
  public onload: (() => void) | null = null;
  public _src = "";
  public width = 400;
  public height = 400;

  set src(value: string) {
    this._src = value;
    setTimeout(() => {
      this.onload?.();
    }, 0);
  }

  get src() {
    return this._src;
  }
}

const createLocalStorageMock = () => {
  let store: Record<string, string> = { accessToken: "test-token" };
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
};

const createFetchMock = (avatarUrl = "https://cdn.example.com/avatar.png") => {
  const userResponse: FetchResponse = {
    ok: true,
    json: async () => ({
      id: 1,
      email: "john@doe.com",
      first_name: "John",
      last_name: "Doe",
      pontos: 100,
      nivel: "NÃ­vel 1",
    }),
  };

  const uploadResponse: FetchResponse = {
    ok: true,
    json: async () => ({ avatar_url: avatarUrl }),
  };

  const nameResponse: FetchResponse = {
    ok: true,
    json: async () => ({ first_name: "Jane", last_name: "Doe" }),
  };

  const progressResponse: FetchResponse = {
    ok: true,
    json: async () => ({ level: "Bronze", xp: 120, xpToNext: 500 }),
  };

  const badgesResponse: FetchResponse = {
    ok: true,
    json: async () => [
      { id: 1, name: "Mestre do game" },
      { id: 2, name: "Segurança Digital"},
      { id: 3, name: "Inovação Verde" },
    ],
  };

  return vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    void init;
    const urlString = typeof url === "string" ? url : url.toString();
    if (urlString.includes("/auth/me/stats/")) {
      return Promise.resolve(progressResponse);
    }
    if (urlString.includes("/gamification/badges/")) {
      return Promise.resolve(badgesResponse);
    }
    if (urlString.includes("/auth/me/name/")) {
      return Promise.resolve(nameResponse);
    }
    if (urlString.includes("/auth/me/avatar/")) {
      return Promise.resolve(uploadResponse);
    }
    if (urlString.includes("/auth/me/")) {
      return Promise.resolve(userResponse);
    }
    return Promise.reject(new Error(`Unhandled fetch url: ${urlString}`));
  });
};

const mockCanvasContext = {
  clearRect: vi.fn(),
  save: vi.fn(),
  beginPath: vi.fn(),
  arc: vi.fn(),
  closePath: vi.fn(),
  clip: vi.fn(),
  drawImage: vi.fn(),
  restore: vi.fn(),
};

describe("Perfil upload de avatar", () => {
  let fetchMock: ReturnType<typeof createFetchMock>;
  let toDataURLSpy: ReturnType<typeof vi.spyOn>;
  let getContextSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = createFetchMock();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    globalThis.localStorage = createLocalStorageMock() as unknown as Storage;
    globalThis.FileReader = MockFileReader as unknown as typeof FileReader;
    globalThis.Image = MockImage as unknown as typeof Image;
    if (!globalThis.HTMLCanvasElement) {
      globalThis.HTMLCanvasElement = class {} as unknown as typeof HTMLCanvasElement;
    }
    const canvasProto = (globalThis.HTMLCanvasElement as unknown as { prototype: Record<string, unknown> }).prototype;
    if (!("getContext" in canvasProto)) {
      canvasProto.getContext = () => null;
    }
    if (!("toDataURL" in canvasProto)) {
      canvasProto.toDataURL = () => "data:image/png;base64,placeholder";
    }

    getContextSpy = vi
      .spyOn(canvasProto as unknown as HTMLCanvasElement, "getContext")
      .mockReturnValue(mockCanvasContext as unknown as CanvasRenderingContext2D) as unknown as ReturnType<typeof vi.spyOn>;
    toDataURLSpy = vi
      .spyOn(canvasProto as unknown as HTMLCanvasElement, "toDataURL")
      .mockReturnValue("data:image/png;base64,cropped") as unknown as ReturnType<typeof vi.spyOn>;

    mockNavigate.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
    globalThis.fetch = originalGlobals.fetch as typeof fetch;
    globalThis.FileReader = originalGlobals.FileReader as typeof FileReader;
    globalThis.Image = originalGlobals.Image as typeof Image;
    globalThis.localStorage = originalGlobals.localStorage as Storage;
    if (originalGlobals.HTMLCanvasElement) {
      globalThis.HTMLCanvasElement = originalGlobals.HTMLCanvasElement;
    } else {
      delete (globalThis as { HTMLCanvasElement?: typeof HTMLCanvasElement }).HTMLCanvasElement;
    }
  });

  it("faz upload e atualiza o avatar exibido", async () => {
    const user = userEvent.setup();
    const renderResult = render(<Perfil />);

    await renderResult.findByText("Meu Perfil");
    await user.click(renderResult.getByRole("button", { name: /trocar foto/i }));

    const fileInput = renderResult.container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["avatar"], "avatar.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await renderResult.findByAltText("Pré-visualização do avatar");

    await user.click(renderResult.getByRole("button", { name: /salvar foto/i }));

    await waitFor(() => {
      const avatarCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/auth/me/avatar/")
      );
      expect(avatarCalls.length).toBe(1);
      expect(avatarCalls[0]?.[1]).toMatchObject({ method: "POST" });
    });

    await waitFor(() => {
      expect(renderResult.getByAltText(/Foto de John Doe/i)).toBeTruthy();
    });

    expect(renderResult.queryByText(/Salvar foto/i)).toBeNull();
    expect(getContextSpy).toHaveBeenCalled();
    expect(toDataURLSpy).toHaveBeenCalled();
  });

  it("exibe erro ao selecionar formato inválido", async () => {
    const user = userEvent.setup();
    const renderResult = render(<Perfil />);

    await renderResult.findByText("Meu Perfil");
    await user.click(renderResult.getByRole("button", { name: /trocar foto/i }));

    const fileInput = renderResult.container.querySelector('input[type="file"]') as HTMLInputElement;
    const invalid = new File(["text"], "notes.txt", { type: "text/plain" });
    fireEvent.change(fileInput, { target: { files: [invalid] } });

    expect(await renderResult.findByText(/Formatos aceitos/i)).toBeTruthy();
    await waitFor(() => {
      const avatarCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/auth/me/avatar/")
      );
      expect(avatarCalls.length).toBe(0);
    });
  });

  it("troca o nome com sucesso e atualiza a interface", async () => {
    const user = userEvent.setup();
    const renderResult = render(<Perfil />);

    await renderResult.findByText("Meu Perfil");
    await user.click(renderResult.getByRole("button", { name: /trocar nome/i }));

    const input = renderResult.getByLabelText(/nome completo/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "Jane Doe");

    await user.click(renderResult.getByRole("button", { name: /salvar nome/i }));

    await waitFor(() => {
      const nameCalls = fetchMock.mock.calls.filter(([url]) =>
        url.toString().includes("/auth/me/name/")
      );
      expect(nameCalls.length).toBe(1);
      expect(nameCalls[0]?.[1]).toMatchObject({ method: "PUT" });
    });

    await waitFor(() => {
      expect(renderResult.getByText("Jane Doe")).toBeTruthy();
    });
    expect(renderResult.queryByRole("button", { name: /salvar nome/i })).toBeNull();
  });

  it("mostra erro de validação e não chama API para nome inválido", async () => {
    const user = userEvent.setup();
    const renderResult = render(<Perfil />);

    await renderResult.findByText("Meu Perfil");
    await user.click(renderResult.getByRole("button", { name: /trocar nome/i }));

    const input = renderResult.getByLabelText(/nome completo/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "John1");

    await user.click(renderResult.getByRole("button", { name: /salvar nome/i }));

    expect(
      await renderResult.findByText(/Use um nome entre 2 e 100 caracteres/)
    ).toBeTruthy();
    const nameCalls = fetchMock.mock.calls.filter(([url]) =>
      url.toString().includes("/auth/me/name/")
    );
    expect(nameCalls.length).toBe(0);
  });

  it("redireciona para login em 401 ao salvar nome", async () => {
    const user = userEvent.setup();

    const userResponse: FetchResponse = {
      ok: true,
      json: async () => ({
        id: 1,
        email: "john@doe.com",
        first_name: "John",
        last_name: "Doe",
        pontos: 100,
        nivel: "NÃ­vel 1",
      }),
    };
    const uploadResponse: FetchResponse = {
      ok: true,
      json: async () => ({ avatar_url: "https://cdn.example.com/avatar.png" }),
    };
    const unauthorized: FetchResponse = {
      ok: false,
      status: 401,
      json: async () => ({}),
    };

    fetchMock.mockImplementation((url: RequestInfo | URL) => {
      const urlString = typeof url === "string" ? url : url.toString();
      if (urlString.includes("/auth/me/name/")) {
        return Promise.resolve(unauthorized);
      }
      if (urlString.includes("/gamification/badges/")) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      if (urlString.includes("/auth/me/avatar/")) {
        return Promise.resolve(uploadResponse);
      }
      if (urlString.includes("/auth/me/")) {
        return Promise.resolve(userResponse);
      }
      return Promise.reject(new Error(`Unhandled fetch url: ${urlString}`));
    });

    const renderResult = render(<Perfil />);

    await renderResult.findByText("Meu Perfil");
    await user.click(renderResult.getByRole("button", { name: /trocar nome/i }));

    const input = renderResult.getByLabelText(/nome completo/i) as HTMLInputElement;
    await user.clear(input);
    await user.type(input, "Jane Doe");

    await user.click(renderResult.getByRole("button", { name: /salvar nome/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/login", { replace: true });
    });
  });
});

