import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom"
  );
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

import { MemoryRouter } from "react-router-dom";
import ListarCursos from "./ListarCursos";

type Course = {
  id: number;
  name: string;
  description: string;
  category?: string;
  banner?: string | null;
  created_at?: string;
  updated_at?: string;
  enrolled?: boolean;
  course_points?: number;
  progress_percentage?: number;
};

type LeaderboardResponse = {
  ok?: boolean;
  status?: number;
  data?: any;
};

type CoursesResponse = {
  ok?: boolean;
  status?: number;
  data?: any;
};

import { API_URL as API_BASE } from "../config/api";
const COURSES_ENDPOINT = `${API_BASE}/auth/cursos/`;
const PROGRESS_ENDPOINT = `${API_BASE}/auth/progress/list/`;
const LAST_PLAYED_KEY = "lastPlayedCourseId";
const LAST_PLAYED_COURSE_KEY = "lastPlayedCourseData";

const mockCourses: Course[] = [
  {
    id: 1,
    name: "Jogo A",
    description: "Desc A",
    category: "Ação",
    course_points: 150,
    progress_percentage: 40,
    created_at: "2024-01-01",
    updated_at: "2024-01-10",
    banner: "/banner-a.png",
  },
  {
    id: 2,
    name: "Jogo B",
    description: "Desc B",
    category: "Puzzle",
    course_points: 250,
    progress_percentage: 70,
    created_at: "2024-02-01",
    updated_at: "2024-02-10",
    banner: null,
  },
];

const makeCourse = (id: number): Course => ({
  id,
  name: `Jogo ${id}`,
  description: `Desc ${id}`,
  category: "Ação",
  course_points: id * 10,
  progress_percentage: 0,
  created_at: "2024-01-01",
  updated_at: "2024-01-10",
  banner: null,
});

const leaderboardEntries = [
  { userId: 999, name: "Você", nivel: "Prata", points: 500 },
  { userId: 2, name: "Outro", nivel: "Ouro", points: 600 },
];

const makeResponse = <T,>(data: T, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => data,
  }) as Response;

const isCoursesListUrl = (urlStr: string) => {
  try {
    const parsedUrl = new URL(urlStr);
    return `${parsedUrl.origin}${parsedUrl.pathname}` === COURSES_ENDPOINT;
  } catch {
    return false;
  }
};

const makeToken = (payload: Record<string, unknown>) => {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `header.${encoded}.signature`;
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderListarCursos = (initialEntries: any[] = ["/app/cursos"]) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <ListarCursos />
    </MemoryRouter>
  );

type FetchMockConfig = {
  courses?: Course[];
  coursesSequence?: CoursesResponse[];
  courseById?: Record<number, CoursesResponse>;
  progressList?: any[];
  progressByGame?: Record<number, any[]>;
  leaderboardByCourseId?: Record<number, LeaderboardResponse>;
  postProgressOk?: boolean;
  patchProgressOk?: boolean;
  deleteProgressOk?: boolean;
};

const createFetchMock = (config: FetchMockConfig = {}) => {
  const {
    courses = mockCourses,
    coursesSequence,
    courseById = {},
    progressList = [],
    progressByGame = {},
    leaderboardByCourseId = {},
    postProgressOk = true,
    patchProgressOk = true,
    deleteProgressOk = true,
  } = config;

  const courseResponses = coursesSequence ?? [
    { ok: true, status: 200, data: courses },
  ];
  let courseCallCount = 0;

  global.fetch = vi.fn(async (url, init) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const urlStr = String(url);

    const isCoursesListRequest = method === "GET" && isCoursesListUrl(urlStr);

    if (isCoursesListRequest) {
      const response =
        courseResponses[Math.min(courseCallCount, courseResponses.length - 1)];
      courseCallCount += 1;
      return makeResponse(
        response.data ?? [],
        response.ok ?? true,
        response.status ?? (response.ok === false ? 500 : 200)
      );
    }

    if (
      method === "GET" &&
      urlStr.startsWith(COURSES_ENDPOINT) &&
      !isCoursesListUrl(urlStr) &&
      !urlStr.endsWith("/ranking/")
    ) {
      const detailMatch = urlStr.match(/\/auth\/cursos\/(\d+)\/$/);
      if (detailMatch) {
        const courseId = Number(detailMatch[1]);
        const response = courseById[courseId] ?? {
          ok: false,
          status: 404,
          data: {},
        };
        return makeResponse(
          response.data ?? {},
          response.ok ?? true,
          response.status ?? (response.ok === false ? 404 : 200)
        );
      }
    }

    if (urlStr === PROGRESS_ENDPOINT && method === "GET") {
      return makeResponse(progressList, true, 200);
    }

    if (
      urlStr.startsWith(`${API_BASE}/auth/progress/list/`) &&
      urlStr.includes("game_id=") &&
      method === "GET"
    ) {
      const gameId = Number(new URL(urlStr).searchParams.get("game_id"));
      return makeResponse(progressByGame[gameId] ?? [], true, 200);
    }

    if (
      urlStr.startsWith(`${API_BASE}/auth/cursos/`) &&
      urlStr.endsWith("/ranking/") &&
      method === "GET"
    ) {
      const match = urlStr.match(/\/auth\/cursos\/(\d+)\/ranking\/$/);
      const courseId = match ? Number(match[1]) : NaN;
      const response = leaderboardByCourseId[courseId] ?? { ok: true, data: [] };
      return makeResponse(
        response.data ?? [],
        response.ok ?? true,
        response.status ?? (response.ok === false ? 500 : 200)
      );
    }

    if (urlStr === `${API_BASE}/auth/progress/` && method === "POST") {
      return makeResponse({}, postProgressOk, postProgressOk ? 201 : 500);
    }

    if (urlStr.startsWith(`${API_BASE}/auth/progress/`) && method === "PATCH") {
      return makeResponse({}, patchProgressOk, patchProgressOk ? 200 : 500);
    }

    if (urlStr.startsWith(`${API_BASE}/auth/progress/`) && method === "DELETE") {
      return makeResponse({}, deleteProgressOk, deleteProgressOk ? 204 : 500);
    }

    return makeResponse({}, false, 404);
  }) as unknown as typeof fetch;

  return { fetchMock: global.fetch as unknown as ReturnType<typeof vi.fn> };
};

describe("ListarCursos page", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    mockNavigate.mockReset();
  });

  afterEach(() => {
    document.body.className = "";
    vi.useRealTimers();
  });

  it("exibe skeletons e placeholders enquanto cursos carregam", async () => {
    const deferred = createDeferred<Response>();

    global.fetch = vi.fn(async (url) => {
      if (isCoursesListUrl(String(url))) {
        return deferred.promise;
      }
      if (
        String(url).startsWith(`${API_BASE}/auth/cursos/`) &&
        String(url).endsWith("/ranking/")
      ) {
        return makeResponse([]);
      }
      return makeResponse([]);
    }) as unknown as typeof fetch;

    renderListarCursos();

    expect(document.querySelectorAll(".skeleton-card")).toHaveLength(3);
    expect(screen.getAllByText("--").length).toBeGreaterThanOrEqual(2);

    deferred.resolve(makeResponse([]));

    await waitFor(() => {
      expect(
        screen.getByText(/Ainda não temos games cadastrados/i)
      ).toBeInTheDocument();
    });
  });

  it("mostra erro ao carregar e permite retry", async () => {
    createFetchMock({
      coursesSequence: [
        { ok: false, status: 500, data: {} },
        { ok: true, status: 200, data: mockCourses },
      ],
    });

    renderListarCursos();

    await waitFor(() => {
      expect(
        screen.getByText(/Falha em carregar os jogos disponíveis/i)
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Tentar novamente/i }));

    await waitFor(() => {
      expect(
        screen.getByRole("group", { name: /Selecionar curso Jogo A/i })
      ).toBeInTheDocument();
    });
  });

  it("mostra aviso quando não há games cadastrados", async () => {
    createFetchMock({ courses: [] });

    renderListarCursos();

    expect(
      await screen.findByText(/Ainda não temos games cadastrados/i)
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("group", { name: /Selecionar curso/i })
    ).not.toBeInTheDocument();
  });

  it("usa paginação com limite 10 e botão de carregar mais", async () => {
    const mobileCourses = Array.from({ length: 12 }, (_, index) =>
      makeCourse(index + 1)
    );

    const { fetchMock } = createFetchMock({
      coursesSequence: [
        {
          ok: true,
          status: 200,
          data: {
            results: mobileCourses.slice(0, 10),
            pagination: {
              page: 1,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: true,
              has_previous: false,
            },
          },
        },
        {
          ok: true,
          status: 200,
          data: {
            results: mobileCourses.slice(10),
            pagination: {
              page: 2,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: false,
              has_previous: true,
            },
          },
        },
      ],
    });

    renderListarCursos();

    expect(
      await screen.findByRole("group", { name: "Selecionar curso Jogo 1" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Selecionar curso Jogo 11" })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/i }));

    expect(
      await screen.findByRole("group", { name: "Selecionar curso Jogo 11" })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Você chegou ao fim da lista/i)
    ).toBeInTheDocument();

    const courseCalls = fetchMock.mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.startsWith(COURSES_ENDPOINT));

    expect(
      courseCalls.some((url) => url.includes("page=1") && url.includes("limit=10"))
    ).toBe(true);
    expect(
      courseCalls.some((url) => url.includes("page=2") && url.includes("limit=10"))
    ).toBe(true);
  });

  it("mantém último jogado ao iniciar game carregado por carregar mais", async () => {
    const mobileCourses = Array.from({ length: 12 }, (_, index) =>
      makeCourse(index + 1)
    );

    createFetchMock({
      coursesSequence: [
        {
          ok: true,
          status: 200,
          data: {
            results: mobileCourses.slice(0, 10),
            pagination: {
              page: 1,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: true,
              has_previous: false,
            },
          },
        },
        {
          ok: true,
          status: 200,
          data: {
            results: mobileCourses.slice(10),
            pagination: {
              page: 2,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: false,
              has_previous: true,
            },
          },
        },
        {
          ok: true,
          status: 200,
          data: {
            results: mobileCourses.slice(0, 10),
            pagination: {
              page: 1,
              limit: 10,
              total: 12,
              total_pages: 2,
              has_next: true,
              has_previous: false,
            },
          },
        },
      ],
      courseById: {
        11: {
          ok: true,
          status: 200,
          data: makeCourse(11),
        },
      },
    });

    renderListarCursos();

    await screen.findByRole("group", { name: "Selecionar curso Jogo 1" });

    fireEvent.click(screen.getByRole("button", { name: /Carregar mais/i }));
    const courseCard = await screen.findByRole("group", {
      name: "Selecionar curso Jogo 11",
    });
    fireEvent.click(within(courseCard).getByRole("button", { name: /Abrir/i }));

    const focusRegion = await screen.findByRole("region", {
      name: /Game Jogo 11 selecionado/i,
    });
    fireEvent.click(
      within(focusRegion).getByRole("button", { name: /Quero jogar/i })
    );

    await waitFor(() => {
      expect(localStorage.getItem(LAST_PLAYED_KEY)).toBe("11");
    });

    await waitFor(() => {
      expect(screen.queryByText("Nenhum")).not.toBeInTheDocument();
      expect(screen.getByText("Você está jogando")).toBeInTheDocument();
    });
  });

  it("aplica filtros de busca e categoria e permite limpar", async () => {
    createFetchMock({ courses: mockCourses });

    renderListarCursos();

    await screen.findByRole("group", { name: /Selecionar curso Jogo A/i });

    const search = screen.getByLabelText(/Buscar game/i);
    const categorySelect = screen.getByLabelText(/Categoria/i);

    await act(async () => {
      fireEvent.change(search, { target: { value: "inexistente" } });
    });

    const hint = await screen.findByText(/Nenhum resultado encontrado/i);
    expect(hint).toHaveAttribute("id", "filters-hint-error");
    expect(search).toHaveAttribute("aria-describedby", "filters-hint-error");

    await act(async () => {
      fireEvent.change(categorySelect, { target: { value: "Puzzle" } });
      fireEvent.change(search, { target: { value: "" } });
    });

    await screen.findByRole("group", { name: /Selecionar curso Jogo B/i });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Limpar filtros/i }));
    });

    expect(search).toHaveValue("");
    expect(categorySelect).toHaveValue("todas");
    expect(
      screen.queryByText(/Nenhum resultado encontrado/i)
    ).not.toBeInTheDocument();
  });

  it("prioriza progresso para definir último jogo e marca como jogando", async () => {
    localStorage.setItem("accessToken", makeToken({ user_id: 10 }));

    const progressList = [
      {
        id: 11,
        game: 2,
        progress_percentage: 80,
        started_at: "2024-03-01T00:00:00Z",
        updated_at: "2024-03-02T00:00:00Z",
      },
    ];

    createFetchMock({
      courses: mockCourses,
      progressList,
      leaderboardByCourseId: {
        2: { data: [{ userId: 2, name: "Outro", nivel: "Ouro", points: 600 }] },
      },
    });

    renderListarCursos();

    await screen.findByRole("group", { name: /Selecionar curso Jogo B/i });

    expect(screen.getByText(/Você está jogando/i)).toBeInTheDocument();

    const selectedCard = screen.getByRole("group", {
      name: /Selecionar curso Jogo B/i,
    });
    expect(selectedCard).toHaveClass("selected");
    expect(localStorage.getItem(LAST_PLAYED_KEY)).toBe("2");
  });

  it("usa lastPlayedCourseId quando não há progresso", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");

    createFetchMock({ courses: mockCourses });

    renderListarCursos();

    await screen.findByRole("group", { name: /Selecionar curso Jogo A/i });

    const selectedCard = screen.getByRole("group", {
      name: /Selecionar curso Jogo A/i,
    });
    expect(selectedCard).toHaveClass("selected");
  });

  it("abre e fecha foco do curso via botão Abrir", async () => {
    createFetchMock({ courses: mockCourses });

    renderListarCursos();

    await screen.findByRole("group", { name: /Selecionar curso Jogo A/i });

    const cardB = screen.getByRole("group", {
      name: /Selecionar curso Jogo B/i,
    });
    fireEvent.click(within(cardB).getByRole("button", { name: /Abrir/i }));

    const focusRegion = await screen.findByRole("region", {
      name: /Game Jogo B selecionado/i,
    });

    expect(document.body.classList.contains("inscrever-focus-mode")).toBe(true);

    fireEvent.click(
      within(focusRegion).getByRole("button", { name: /Voltar/i })
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("region", { name: /Game Jogo B selecionado/i })
      ).not.toBeInTheDocument();
    });

    expect(document.body.classList.contains("inscrever-focus-mode")).toBe(false);
  });

  it("abre foco automaticamente via state da rota", async () => {
    createFetchMock({ courses: mockCourses });

    renderListarCursos([
      {
        pathname: "/app/cursos",
        state: { focusCourseId: 2 },
      },
    ]);

    expect(
      await screen.findByRole("region", {
        name: /Game Jogo B selecionado/i,
      })
    ).toBeInTheDocument();
  });

  it("inscreve no game e navega após sucesso", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");

    const { fetchMock } = createFetchMock({
      coursesSequence: [
        { ok: true, status: 200, data: mockCourses },
        { ok: true, status: 200, data: mockCourses },
      ],
    });

    renderListarCursos();

    const startButton = await screen.findByRole("button", {
      name: /Começar jogo/i,
    });
    fireEvent.click(startButton);

    const postCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]) === `${API_BASE}/auth/progress/` &&
        call[1]?.method === "POST"
    );

    expect(postCall).toBeTruthy();

    await waitFor(() => { expect(mockNavigate).toHaveBeenCalledWith("/app/trilhas/1"); }, { timeout: 2000 });
  });

  it("mostra erro quando inscrição falha", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");

    createFetchMock({ postProgressOk: false });

    renderListarCursos();

    fireEvent.click(
      await screen.findByRole("button", { name: /Começar jogo/i })
    );

    expect(
      await screen.findByText(/Falha ao iniciar o seu game/i)
    ).toBeInTheDocument();
  });

  it("continua jogo inscrito, atualiza progresso e navega", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");
    localStorage.setItem("accessToken", makeToken({ user_id: 10 }));

    const enrolledCourses = mockCourses.map((course) =>
      course.id === 1 ? { ...course, enrolled: true } : course
    );

    const { fetchMock } = createFetchMock({
      courses: enrolledCourses,
      progressByGame: {
        1: [
          {
            id: 55,
            progress_percentage: 40,
            completed_at: null,
          },
        ],
      },
    });

    renderListarCursos();

    const continueButton = await screen.findByRole("button", {
      name: /Continuar jogando/i,
    });

    fireEvent.click(continueButton);

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/app/trilhas/1");
    });

    const patchCall = fetchMock.mock.calls.find(
      (call) =>
        String(call[0]).includes("/auth/progress/55/") &&
        call[1]?.method === "PATCH"
    );

    expect(patchCall).toBeTruthy();
    expect(localStorage.getItem(LAST_PLAYED_KEY)).toBe("1");
  });

  it("abandona jogo e limpa lastPlayed", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");
    localStorage.setItem("accessToken", makeToken({ user_id: 10 }));

    const enrolledCourses = mockCourses.map((course) =>
      course.id === 1 ? { ...course, enrolled: true } : course
    );

    const { fetchMock } = createFetchMock({
      coursesSequence: [
        { ok: true, status: 200, data: enrolledCourses },
        { ok: true, status: 200, data: enrolledCourses },
      ],
      progressByGame: {
        1: [{ id: 77 }],
      },
    });

    renderListarCursos();

    const abandonButton = await screen.findByRole("button", {
      name: /Abandonar jogo/i,
    });
    fireEvent.click(abandonButton);

    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (call) =>
          String(call[0]).includes("/auth/progress/77/") &&
          call[1]?.method === "DELETE"
      );
      expect(deleteCall).toBeTruthy();
    });

    await waitFor(() => {
      expect(localStorage.getItem(LAST_PLAYED_KEY)).toBeNull();
    });
  });

  it("mostra erro ao abandonar quando progresso não é encontrado", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "1");
    localStorage.setItem("accessToken", makeToken({ user_id: 10 }));

    const enrolledCourses = mockCourses.map((course) =>
      course.id === 1 ? { ...course, enrolled: true } : course
    );

    createFetchMock({
      courses: enrolledCourses,
      progressByGame: {
        1: [],
      },
    });

    renderListarCursos();

    fireEvent.click(
      await screen.findByRole("button", { name: /Abandonar jogo/i })
    );

    expect(
      await screen.findByText(/Não foi possível abandonar o jogo agora/i)
    ).toBeInTheDocument();
  });

  it("mostra estado de loading do leaderboard", async () => {
    const leaderboardDeferred = createDeferred<Response>();

    global.fetch = vi.fn(async (url) => {
      const urlStr = String(url);
      if (isCoursesListUrl(urlStr)) {
        return makeResponse(mockCourses);
      }
      if (
        urlStr.startsWith(`${API_BASE}/auth/cursos/`) &&
        urlStr.endsWith("/ranking/")
      ) {
        return leaderboardDeferred.promise;
      }
      return makeResponse([]);
    }) as unknown as typeof fetch;

    renderListarCursos();

    expect(
      await screen.findByText(/Carregando leaderboard/i)
    ).toBeInTheDocument();

    leaderboardDeferred.resolve(makeResponse([]));

    expect(
      await screen.findByText(/Escolha um game na lista/i)
    ).toBeInTheDocument();
  });

  it("mostra erro do leaderboard quando falha", async () => {
    createFetchMock({
      leaderboardByCourseId: {
        1: { ok: false, status: 500, data: {} },
      },
    });

    renderListarCursos();

    expect(
      await screen.findByText(/Falha em consultar jogadores/i)
    ).toBeInTheDocument();
  });

  it("mostra leaderboard vazio quando não há jogadores", async () => {
    createFetchMock({
      leaderboardByCourseId: {
        1: { ok: true, data: [] },
      },
    });

    renderListarCursos();

    expect(
      await screen.findByText(/Escolha um game na lista/i)
    ).toBeInTheDocument();
  });

  it("usa o último jogado como base do leaderboard quando ele não está na página atual", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "11");
    localStorage.setItem(
      LAST_PLAYED_COURSE_KEY,
      JSON.stringify({
        id: 11,
        name: "Tic55",
        description: "programa de residencia",
        category: "Residencia",
      })
    );

    createFetchMock({
      coursesSequence: [
        {
          ok: true,
          status: 200,
          data: {
            results: Array.from({ length: 10 }, (_, index) => makeCourse(index + 1)),
            pagination: {
              page: 1,
              limit: 10,
              total: 29,
              total_pages: 3,
              has_next: true,
              has_previous: false,
            },
          },
        },
      ],
      courseById: {
        11: {
          ok: true,
          status: 200,
          data: {
            id: 11,
            name: "Tic55",
            description: "programa de residencia",
            category: "Residencia",
          },
        },
      },
      leaderboardByCourseId: {
        1: { ok: true, data: [] },
        11: {
          ok: true,
          data: [{ userId: 2, name: "Outro", nivel: "Ouro", points: 600 }],
        },
      },
    });

    renderListarCursos();

    expect(
      await screen.findByRole("heading", { name: "Tic55" })
    ).toBeInTheDocument();
    expect(await screen.findByText("Outro")).toBeInTheDocument();
    expect(
      screen.queryByText(/Escolha um game na lista para ver o ranking/i)
    ).not.toBeInTheDocument();
  });

  it("limpa o card de último jogado quando o game salvo no localStorage não existe mais", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "11");
    localStorage.setItem(
      LAST_PLAYED_COURSE_KEY,
      JSON.stringify({
        id: 11,
        name: "Game removido",
        description: "Esse game foi excluído",
        category: "Arquivado",
      })
    );

    createFetchMock({
      coursesSequence: [
        {
          ok: true,
          status: 200,
          data: {
            results: Array.from({ length: 10 }, (_, index) => makeCourse(index + 1)),
            pagination: {
              page: 1,
              limit: 10,
              total: 29,
              total_pages: 3,
              has_next: true,
              has_previous: false,
            },
          },
        },
      ],
      courseById: {
        11: { ok: false, status: 404, data: { detail: "Not found." } },
      },
    });

    renderListarCursos();

    await screen.findByRole("group", { name: "Selecionar curso Jogo 1" });

    await waitFor(() => {
      expect(localStorage.getItem(LAST_PLAYED_KEY)).toBeNull();
      expect(localStorage.getItem(LAST_PLAYED_COURSE_KEY)).toBeNull();
    });

    expect(screen.getByText(/Nenhum/i)).toBeInTheDocument();
    expect(screen.queryByText("Game removido")).not.toBeInTheDocument();
  });

  it("mantém leaderboard no estado vazio quando o último jogado foi deletado", async () => {
    localStorage.setItem(LAST_PLAYED_KEY, "11");
    localStorage.setItem(
      LAST_PLAYED_COURSE_KEY,
      JSON.stringify({
        id: 11,
        name: "Game removido",
        description: "Esse game foi excluído",
        category: "Arquivado",
      })
    );

    createFetchMock({
      coursesSequence: [
        {
          ok: true,
          status: 200,
          data: {
            results: Array.from({ length: 10 }, (_, index) => makeCourse(index + 1)),
            pagination: {
              page: 1,
              limit: 10,
              total: 29,
              total_pages: 3,
              has_next: true,
              has_previous: false,
            },
          },
        },
      ],
      courseById: {
        11: { ok: false, status: 404, data: { detail: "Not found." } },
      },
      leaderboardByCourseId: {
        1: { ok: false, status: 500, data: {} },
      },
    });

    renderListarCursos();

    expect(
      await screen.findByText(/Escolha um game na lista para ver o ranking/i)
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Falha em consultar jogadores/i)
    ).not.toBeInTheDocument();
  });

  it("filtra usuário do leaderboard quando não está inscrito", async () => {
    localStorage.setItem("accessToken", makeToken({ user_id: 999 }));

    createFetchMock({
      leaderboardByCourseId: {
        1: { ok: true, data: leaderboardEntries },
      },
    });

    renderListarCursos();

    expect(await screen.findByText("Outro")).toBeInTheDocument();
    expect(screen.queryByText("Você")).not.toBeInTheDocument();
  });

  it("mostra link de progresso quando usuário está no leaderboard e inscrito", async () => {
    localStorage.setItem("accessToken", makeToken({ user_id: 999 }));

    const enrolledCourses = mockCourses.map((course) =>
      course.id === 1 ? { ...course, enrolled: true } : course
    );

    createFetchMock({
      courses: enrolledCourses,
      leaderboardByCourseId: {
        1: { ok: true, data: leaderboardEntries },
      },
    });

    renderListarCursos();

    expect(
      await screen.findByRole("link", { name: /Ver meu progresso/i })
    ).toBeInTheDocument();
  });
});



