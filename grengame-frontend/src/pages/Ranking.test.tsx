import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ranking from "./Ranking";
import { API_URL } from "../config/api";

vi.mock("../components/badges/UserHighestBadge", () => ({
  default: ({
    badges,
    scopedGameId,
  }: {
    badges?: unknown;
    scopedGameId?: number | null;
  }) => {
    const count = Array.isArray(badges) ? badges.length : 0;
    return (
      <span
        data-testid="highest-badge"
        data-badge-count={String(count)}
        data-game-id={String(scopedGameId ?? "null")}
      >
        badge
      </span>
    );
  },
}));

type MockResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

type EndpointQueues = {
  ranking?: Array<MockResponse | Error>;
  me?: Array<MockResponse | Error>;
};

const originalFetch = globalThis.fetch;

const makeResponse = (body: unknown, status = 200): MockResponse => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const createJwt = (payload: Record<string, unknown>) => {
  const encodedPayload = window.btoa(JSON.stringify(payload));
  return `header.${encodedPayload}.signature`;
};

const createFetchMock = (queues: EndpointQueues) => {
  const rankingQueue = [...(queues.ranking ?? [])];
  const meQueue = [...(queues.me ?? [])];

  return vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.endsWith("/auth/ranking/")) {
      const next = rankingQueue.shift();
      if (!next) throw new Error("Sem mock para /auth/ranking/");
      if (next instanceof Error) throw next;
      return next as unknown as Response;
    }

    if (url.endsWith("/auth/me/")) {
      const next = meQueue.shift();
      if (!next) throw new Error("Sem mock para /auth/me/");
      if (next instanceof Error) throw next;
      return next as unknown as Response;
    }

    throw new Error(`URL não mockada: ${url}`);
  });
};

const baseEntries = [
  {
    user_id: 7,
    name: "Juliana Ferreira",
    position: 1,
    total_points: 64320,
    badges: ["/badge-1.png"],
    game_id: 10,
  },
  {
    user_id: 1,
    name: "Ana Maria dos Santos Carvalho",
    position: 2,
    totalPoints: 53010,
    badges: [],
    game_id: 10,
    avatar_url: "/avatars/ana.png",
  },
  {
    user_id: 2,
    name: "Carlos Santos",
    rank: "3",
    points: 42000,
    badges: [],
    game_id: 10,
    avatar_url: "/avatars/carlos.png",
  },
  {
    user_id: 3,
    name: "Maria Clara",
    position: 4,
    points: -50,
    badges: [],
    game_id: 10,
  },
];

const renderRanking = () => render(<Ranking />);

const waitForRankingReady = async () => {
  await screen.findByText("Juliana");
};

describe("Ranking Page", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch as typeof fetch;
    localStorage.clear();
  });

  it("exibe estado de carregamento enquanto o ranking está pendente", async () => {
    let resolveRanking!: (value: MockResponse) => void;
    const rankingPromise = new Promise<MockResponse>((resolve) => {
      resolveRanking = resolve;
    });

    const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/auth/ranking/")) {
        return rankingPromise as unknown as Promise<Response>;
      }
      throw new Error(`URL não mockada: ${url}`);
    });

    globalThis.fetch = fetchMock as unknown as typeof fetch;
    renderRanking();

    expect(screen.getByText(/Carregando ranking, avatars e badges/i)).toBeInTheDocument();

    resolveRanking(makeResponse([]));
    expect(await screen.findByText("Nenhum jogador no ranking ainda.")).toBeInTheDocument();
  });

  it("renderiza ranking de sucesso com medalhas do top 3 e pontos normalizados", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    await waitForRankingReady();

    const listRows = document.querySelectorAll(".ranking-scroll .ranking-item");
    expect(listRows.length).toBe(4);

    expect(within(listRows[0] as HTMLElement).getByLabelText(/Ouro/i)).toHaveTextContent("🥇");
    expect(within(listRows[1] as HTMLElement).getByLabelText(/Prata/i)).toHaveTextContent("🥈");
    expect(within(listRows[2] as HTMLElement).getByLabelText(/Bronze/i)).toHaveTextContent("🥉");

    expect(screen.getByText("Juliana")).toBeInTheDocument();
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Carlos")).toBeInTheDocument();
    expect(screen.getByText("Maria")).toBeInTheDocument();

    const mariaRow = screen.getByText("Maria").closest(".ranking-item") as HTMLElement;
    expect(within(mariaRow).getByText("0")).toBeInTheDocument();
  });

  it("aceita resposta paginada com results", async () => {
    const fetchMock = createFetchMock({
      ranking: [
        makeResponse({
          results: [
            {
              user_id: 99,
              name: "Pedro Almeida",
              position: 1,
              points: 700,
              badges: [],
            },
          ],
        }),
      ],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    expect(await screen.findByText("Pedro")).toBeInTheDocument();
  });

  it("exibe estado vazio quando não há jogadores", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse([])],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    expect(await screen.findByText("Nenhum jogador no ranking ainda.")).toBeInTheDocument();
  });

  it("exibe erro e permite retry com sucesso", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse({ detail: "erro" }, 500), makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    renderRanking();

    expect(await screen.findByText(/Erro ao carregar ranking/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Juliana")).toBeInTheDocument();

    const rankingCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/auth/ranking/"),
    );
    expect(rankingCalls).toHaveLength(2);
  });

  it("filtra por busca válida e mostra mensagem quando não encontra", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    renderRanking();
    await waitForRankingReady();

    const input = screen.getByPlaceholderText("Nome completo");
    await user.type(input, "Ana Maria");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Carlos")).not.toBeInTheDocument();

    await user.clear(input);
    await user.type(input, "Inexistente");
    expect(await screen.findByText("Nenhum jogador encontrado para essa busca.")).toBeInTheDocument();
  });

  it("mostra erro de validação para busca inválida e mantém lista sem filtrar", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const user = userEvent.setup();
    renderRanking();
    await waitForRankingReady();

    const input = screen.getByPlaceholderText("Nome completo");
    await user.type(input, "123");

    expect(await screen.findByRole("alert")).toHaveTextContent(/Use um nome entre 2 e 80 caracteres/i);
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("Carlos")).toBeInTheDocument();
  });

  it("não renderiza card de destaque quando não há usuário logado", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    await waitForRankingReady();

    expect(screen.queryByRole("group", { name: /Destaque de/i })).not.toBeInTheDocument();
  });

  it("renderiza destaque do usuário logado e usa avatar de /auth/me", async () => {
    const token = createJwt({ user_id: 7 });
    localStorage.setItem("accessToken", token);

    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
      me: [makeResponse({ avatar_url: "/avatars/me.png" })],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    const highlight = await screen.findByRole("group", { name: /Destaque de Juliana Ferreira/i });

    const highlightAvatar = within(highlight).getByAltText(/Juliana Ferreira/i);
    expect(highlightAvatar.getAttribute("src")).toContain(`${API_URL}/avatars/me.png`);

    const rankingCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/ranking/"),
    );
    const meCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/auth/me/"),
    );

    expect(rankingCall?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
    expect(meCall?.[1]?.headers).toMatchObject({
      Authorization: `Bearer ${token}`,
    });
  });

  it("faz fallback para iniciais quando o avatar da lista falha", async () => {
    const fetchMock = createFetchMock({
      ranking: [makeResponse(baseEntries)],
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    renderRanking();
    await waitForRankingReady();

    const carlosRow = screen.getByText("Carlos").closest(".ranking-item") as HTMLElement;
    const carlosAvatar = within(carlosRow).getByAltText(/Carlos Santos/i);

    fireEvent.error(carlosAvatar);

    await waitFor(() => {
      expect(within(carlosRow).getByText("CS")).toBeInTheDocument();
    });
  });
});
