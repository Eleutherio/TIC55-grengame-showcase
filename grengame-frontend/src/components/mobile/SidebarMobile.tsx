import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import logoutIcon from "../../assets/img/logout.svg";
import { isAdmin as isAdminFromToken } from "../../utils/auth";
import { API_URL } from "../../config/api";

type SidebarMobileProps = {
  isOpen: boolean;
  onClose: () => void;
};

type Course = {
  id: number;
  name?: string;
  category?: string;
  description?: string;
};

type NavItem = {
  label: string;
  to: string;
  exact?: boolean;
};

type UserMe = {
  email: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  username?: string;
};

const adminNavItems: NavItem[] = [
  { label: "Administrar Usuários", to: "/app/AdministrarUsuarios" },
  { label: "Administrar Games", to: "/app/AdministrarGames" },
  { label: "Administrar Missões", to: "/app/AdministrarMissoes" },
  { label: "Configurar Badges", to: "/app/AdministrarBadges" },
  { label: "Todos os Games", to: "/app/cursos" },
  { label: "Dashboard", to: "/app/Dashboard" },
  { label: "Ranking", to: "/app/ranking" },
  { label: "Meu Perfil", to: "/app/perfil" },
  { label: "Meu Progresso", to: "/app/progresso" },
];

const userNavItems: NavItem[] = [
  { label: "Menu Inicial", to: "/", exact: true },
  { label: "Jogos", to: "/app/cursos" },
  { label: "Meu Progresso", to: "/app/progresso" },
  { label: "Ranking", to: "/app/ranking" },
  { label: "Meu Perfil", to: "/app/perfil" },
];

const SEARCH_DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos


async function fetchCoursesByTerm(
  apiBaseUrl: string,
  term: string,
  limit = 6
): Promise<Course[]> {
  const normalizedBaseUrl = apiBaseUrl.replace(/\/+$/, "");
  const params = new URLSearchParams();
  if (term) params.append("search", term);
  params.append("limit", String(limit));
  const endpoint = `${normalizedBaseUrl}/auth/games/?${params.toString()}`;
  const token = localStorage.getItem("accessToken");
  const response = await fetch(endpoint, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Cursos HTTP ${response.status}`);
  }

  const payload: unknown = await response.json();
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)
      ? ((payload as { results: unknown[] }).results)
      : [];

  return source
    .map((item) => ({
      id: Number((item as { id?: number }).id) || 0,
      name: (item as { name?: string }).name || "Game sem título",
      category: (item as { category?: string }).category,
      description: (item as { description?: string }).description,
    }))
    .filter((course) => course.id > 0);
}

const baseLink =
  "flex items-center gap-3 rounded-xl px-3 py-2 text-base tracking-tight transition-colors duration-200";
const activeLink = "text-amarelo";
const idleLink = "text-white/80 hover:text-white";

export default function SidebarMobile({ isOpen, onClose }: SidebarMobileProps) {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [searchResults, setSearchResults] = useState<Course[]>([]);
  const [searchStatus, setSearchStatus] = useState<
    "idle" | "loading" | "success" | "empty" | "error"
  >("idle");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [isLoadingUser, setIsLoadingUser] = useState(true);
  const [userError, setUserError] = useState<string | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const searchCacheRef = useRef<Map<string, { timestamp: number; data: Course[] }>>(
    new Map()
  );

  const isAdmin = isAdminFromToken();
  const visibleItems = useMemo(
    () => (isAdmin ? adminNavItems : userNavItems),
    [isAdmin]
  );

  const fetchCurrentUser = useCallback(async (): Promise<UserMe> => {
    const token = localStorage.getItem("accessToken");
    if (!token) {
      throw new Error("NO_TOKEN");
    }

    const normalizedBaseUrl = API_URL.replace(/\/+$/, "");
    const response = await fetch(`${normalizedBaseUrl}/auth/me/`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`USER_HTTP_${response.status}`);
    }

    return (await response.json()) as UserMe;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingUser(true);
    setUserError(null);

    fetchCurrentUser()
      .then((data) => {
        if (cancelled) return;
        const nameParts = [data.first_name, data.last_name].filter(Boolean);
        const resolvedName =
          (nameParts.join(" ").trim() ||
            data.name ||
            data.username ||
            data.email) ??
          "";

        setUserName(resolvedName);
        setUserEmail(data.email ?? "");
        setIsLoadingUser(false);
      })
      .catch((error) => {
        void error;
        if (cancelled) return;
        setUserError("Não foi possível carregar os dados do usuário.");
        setIsLoadingUser(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchCurrentUser]);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      const accessToken = localStorage.getItem("accessToken");
      const refreshToken = localStorage.getItem("refreshToken");
      const response = await fetch(`${API_URL}/auth/logout/`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ refresh: refreshToken ?? "" }),
      });

      if (!response.ok) {
        throw new Error(`Logout HTTP ${response.status}`);
      }
    } catch (error) {
      void error;
    } finally {
      localStorage.removeItem("accessToken");
      sessionStorage.removeItem("accessToken");
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
      onClose();
    }
  };

  const nameRaw = isLoadingUser
    ? "Carregando..."
    : userName || "Dados não disponíveis";
  const nameDisplay =
    nameRaw.length > 20 ? `${nameRaw.slice(0, 20)}...` : nameRaw;
  const nameTitle =
    isLoadingUser || nameRaw === "Dados não disponíveis" ? undefined : nameRaw;

  const emailDisplay = isLoadingUser
    ? "Carregando..."
    : userEmail || userError || "Dados não disponíveis";
  const emailTitle =
    isLoadingUser || emailDisplay === "Dados não disponíveis"
      ? undefined
      : emailDisplay;

  const performSearch = useCallback(
    async (rawQuery: string) => {
      const query = rawQuery.trim();
      if (!query) {
        setSearchMessage("Digite o nome de um curso para buscar.");
        setSearchResults([]);
        setSearchStatus("idle");
        return;
      }

      if (query.length < MIN_QUERY_LENGTH) {
        setSearchMessage(
          `Digite pelo menos ${MIN_QUERY_LENGTH} caracteres para buscar.`
        );
        setSearchResults([]);
        setSearchStatus("idle");
        return;
      }

      setSearchStatus("loading");
      setSearchMessage(null);
      try {
        const cacheKey = query.toLowerCase();
        const cached = searchCacheRef.current.get(cacheKey);
        const now = Date.now();
        let results: Course[];

        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results = cached.data;
        } else {
          const remote = await fetchCoursesByTerm(API_URL, query, 12);
          results = remote
            .filter((course) => {
              const normalized = query.toLowerCase();
              const name = (course.name || "").toLowerCase();
              const category = (course.category || "").toLowerCase();
              const description = (course.description || "").toLowerCase();
              return (
                name.includes(normalized) ||
                category.includes(normalized) ||
                description.includes(normalized)
              );
            })
            .slice(0, 6);
          searchCacheRef.current.set(cacheKey, { timestamp: now, data: results });
        }

        if (results.length === 0) {
          setSearchMessage(`Game "${query}" não encontrado.`);
          setSearchResults([]);
          setSearchStatus("empty");
          return;
        }

        const preview = results.slice(0, 3).map((course) => course.name).join(", ");
        setSearchResults(results);
        setSearchStatus("success");
        setSearchMessage(
          results.length === 1
            ? `Encontramos 1 game: ${preview}`
            : `Encontramos ${results.length} games: ${preview}`
        );
      } catch (error) {
        void error;
        setSearchMessage("Não foi possível buscar agora. Tente novamente em instantes.");
        setSearchResults([]);
        setSearchStatus("error");
      }
    },
    []
  );

  const handleSearch = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    performSearch(searchQuery);
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    setSearchMessage(null);
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }

    debounceTimerRef.current = window.setTimeout(() => {
      performSearch(trimmed);
      debounceTimerRef.current = null;
    }, SEARCH_DEBOUNCE_MS);
  };

  const handleSearchBlur = (event: React.FocusEvent<HTMLInputElement>) => {
    const next = event.relatedTarget as HTMLElement | null;
    if (next && resultCardRef.current?.contains(next)) {
      return;
    }
    setSearchMessage(null);
  };

  const handleResultSelect = (course: Course) => {
    setSearchMessage(null);
    setSearchResults([]);
    setSearchStatus("idle");
    setSearchQuery("");
    navigate("/app/cursos", { state: { focusCourseId: course.id } });
    onClose();
  };

  const closeAndNavigate = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";
    const keyListener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", keyListener);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", keyListener);
    };
  }, [isOpen, onClose]);

  return (
    <>
      <div
        role="presentation"
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${isOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0"
          }`}
      />

      <aside
        aria-hidden={!isOpen}
        className={`fixed inset-y-0 left-0 z-50 flex w-[18.5rem] max-w-[90vw] flex-col overflow-y-auto bg-azul-forte pb-8 pt-[calc(env(safe-area-inset-top)+1.75rem)] text-white shadow-2xl transition-transform duration-300 lg:hidden ${isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
      >
        <div className="flex items-center justify-between px-6">
          <Link
            to="/"
            onClick={closeAndNavigate}
            className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <h1 className="text-3xl font-semibold">
              <span className="text-amarelo">G</span>
              ren
              <span className="text-vermelho-forte">G</span>
              ame
            </h1>
          </Link>
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onClose}
            className="rounded-full p-2 text-white/80 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <section className="px-6 pt-6">
          <div className="rounded-2xl bg-white/10 p-4 shadow-inner shadow-black/25">
            <p className="text-sm text-white/60">Logado como</p>
            <p
              className="mt-2 text-lg font-semibold text-white"
              style={{ fontFamily: "FonteTitulos" }}
              title={nameTitle}
            >
              {nameDisplay}
            </p>
            <p
              className="max-w-[14rem] truncate text-sm text-white/65"
              title={emailTitle}
            >
              {emailDisplay}
            </p>
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">
              <span
                className="h-2 w-2 rounded-full bg-emerald-400"
                aria-hidden="true"
              />
              {isAdmin ? "Administrador" : "Colaborador"}
            </p>
          </div>
        </section>

        <div className="px-6">
          <form onSubmit={handleSearch} className="relative mt-6">
            <label htmlFor="sidebar-mobile-search" className="sr-only">
              Buscar games
            </label>
            <input
              id="sidebar-mobile-search"
              type="search"
              placeholder="Buscar games..."
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              onBlur={handleSearchBlur}
              className="w-full rounded-xl border border-white/20 bg-white/95 px-4 py-2.5 text-sm text-azul-forte placeholder:text-azul-forte/60 focus:border-white focus:outline-none focus:ring-2 focus:ring-amarelo/70"
            />
            {(searchMessage || searchResults.length > 0) && (
              <div
                ref={resultCardRef}
                aria-live="polite"
                aria-atomic="true"
                className="mt-3 rounded-xl bg-white/95 p-4 text-sm text-azul-forte shadow-lg shadow-black/30 ring-1 ring-white/60"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold leading-5">
                    {searchMessage ?? "Resultados"}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchMessage(null);
                      setSearchResults([]);
                      setSearchStatus("idle");
                    }}
                    className="text-xs font-semibold uppercase tracking-wide text-azul-forte/60 transition hover:text-azul-forte"
                  >
                    Fechar
                  </button>
                </div>
                {searchStatus === "loading" && (
                  <p className="mt-2 text-xs text-azul-forte/70">Buscando games...</p>
                )}
                {searchStatus === "empty" && (
                  <p className="mt-2 text-xs text-azul-forte/70">
                    Nenhum game encontrado.
                  </p>
                )}
                {searchStatus === "error" && (
                  <p className="mt-2 text-xs text-azul-forte/70">
                    Não foi possível buscar agora. Tente novamente em instantes.
                  </p>
                )}
                {searchStatus === "success" && (
                  <ul className="mt-3 grid gap-2">
                    {searchResults.map((course) => (
                      <li key={course.id}>
                        <button
                          type="button"
                          className="w-full rounded-lg border border-azul-forte/15 bg-white p-3 text-left text-azul-forte transition hover:border-amarelo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/70"
                          onClick={() => handleResultSelect(course)}
                        >
                          <p className="font-semibold leading-5">{course.name}</p>
                          <p className="mt-1 text-xs text-azul-forte/70">
                            {course.category ?? "Sem categoria"}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {searchStatus === "success" && searchResults.length === 0 && (
                  <p className="mt-2 text-xs text-azul-forte/70">
                    Nenhum game encontrado.
                  </p>
                )}
              </div>
            )}
          </form>

          {isAdmin && (
            <div className="mt-6 text-sm font-semibold tracking-tight text-amarelo">
              Painel do Administrador
            </div>
          )}

          <nav className="mt-4 flex flex-col gap-1 pb-6 text-sm">
            {visibleItems.map(({ label, to, exact }, index) => (
              <div key={label + to}>
                <NavLink
                  to={to}
                  end={Boolean(exact)}
                  onClick={closeAndNavigate}
                  className={({ isActive }) =>
                    `${baseLink} ${isActive ? activeLink : idleLink}`
                  }
                >
                  <span className="line-clamp-1">{label}</span>
                </NavLink>
                {isAdmin && (index === 4 || index === 6) && (
                  <div className="my-2 h-px bg-white/10" aria-hidden="true" />
                )}
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-auto px-6">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-live="polite"
            aria-busy={isLoggingOut}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-base text-white/80 transition-all duration-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${isLoggingOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            style={{ fontFamily: "FonteSite" }}
          >
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"
              aria-hidden="true"
            >
              <img src={logoutIcon} alt="" className="h-5 w-5 filter invert" />
            </span>
            {isLoggingOut ? (
              <span>Saindo...</span>
            ) : (
              <span className="text-left">
                <span>Sair do </span>
                <span className="text-amarelo">G</span>
                <span>ren</span>
                <span className="text-vermelho-forte">G</span>
                <span>ame</span>
              </span>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}





