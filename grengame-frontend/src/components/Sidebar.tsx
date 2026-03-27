import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import logoutIcon from "../assets/img/logout.svg";
import { isAdmin as isAdminFromToken } from "../utils/auth";
import SearchField from "./SearchField";
import { API_URL } from "../config/api";

// Classes utilitárias compartilhadas pelas entradas do menu.
const base =
  "flex items-center gap-3 rounded-lg px-3 py-2 text-base font-medium tracking-tight transition-colors duration-150";
const active = "text-amarelo";
const idle = "text-white/80 hover:text-white";

type SidebarProps = {
  collapsed?: boolean;
  onCollapse: () => void;
};

type SearchStatus =
  | "idle"
  | "typing"
  | "loading"
  | "success"
  | "empty"
  | "error";

// Estrutura mínima esperada na resposta da busca de cursos.
type CourseSearchResult = {
  id: number;
  title: string;
  category?: string;
  description?: string;
};

const SEARCH_DEBOUNCE_MS = 450;
const MIN_QUERY_LENGTH = 3;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const SEARCH_OVERLAY_ID = "sidebar-search-overlay";
const SEARCH_INPUT_ID = "sidebar-search-input";

async function fetchCoursesByTerm(
  apiBaseUrl: string,
  term: string,
  limit = 6
): Promise<CourseSearchResult[]> {
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
    .map((course) => ({
      id: Number((course as { id?: number }).id) || 0,
      title: (course as { name?: string }).name || "Game sem título",
      category: (course as { category?: string }).category,
      description: (course as { description?: string }).description,
    }))
    .filter((course) => course.id > 0);
}

type NavItem = {
  label: string;
  to: string;
  exact?: boolean;
};

const adminNavItems: NavItem[] = [
  { label: "Administrar Usu\u00e1rios", to: "/app/AdministrarUsuarios" },
  { label: "Administrar Games", to: "/app/AdministrarGames" },
  { label: "Administrar Miss\u00f5es", to: "/app/AdministrarMissoes" },
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
  { label: "Ranking", to: "/app/ranking" },
  { label: "Meu Perfil", to: "/app/perfil" },
  { label: "Meu Progresso", to: "/app/progresso" },
];

// Item de navegação reutilizável para manter estilos consistentes.
const Item = ({
  to,
  label,
  exact = false,
}: {
  to: string;
  label: string;
  exact?: boolean;
}) => (
  <NavLink
    to={to}
    end={exact}
    className={({ isActive }) => `${base} ${isActive ? active : idle}`}
  >
    <span>{label}</span>
  </NavLink>
);

export default function Sidebar({
  collapsed = false,
  onCollapse,
}: SidebarProps) {
  const navigate = useNavigate();
  // Estado e refs principais do componente.
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [searchResults, setSearchResults] = useState<CourseSearchResult[]>([]);
  const [lastSearchedQuery, setLastSearchedQuery] = useState("");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchOverlayPosition, setSearchOverlayPosition] = useState<{
    top: number;
    left: number;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const searchCacheRef = useRef<
    Map<string, { timestamp: number; data: CourseSearchResult[] }>
  >(new Map());
  const isAdmin = isAdminFromToken();
  const visibleItems = isAdmin ? adminNavItems : userNavItems;

  // Fluxo de logout: tenta backend e sempre limpa tokens locais antes de redirecionar.
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
    }
  };

  // Utilitário para garantir que apenas um timeout de busca esteja ativo.
  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Reseta busca (texto, overlay e foco) respeitando o estado colapsado.
  const handleSearchClear = useCallback(
    (options: { refocus?: boolean } = {}) => {
      clearDebounceTimer();
      setSearchQuery("");
      setSearchStatus("idle");
      setSearchResults([]);
      setSearchError(null);
      setLastSearchedQuery("");
      setSearchOverlayPosition(null);
      if (options.refocus ?? true) {
        searchInputRef.current?.focus();
      }
    },
    [clearDebounceTimer]
  );

  const handleSearchInputChange = useCallback(
    (value: string) => {
      clearDebounceTimer();
      setSearchQuery(value);
      setSearchError(null);

      const trimmed = value.trim();
      if (!trimmed) {
        setSearchStatus("idle");
        setSearchResults([]);
        setLastSearchedQuery("");
        setSearchOverlayPosition(null);
        return;
      }

      if (trimmed.length < MIN_QUERY_LENGTH) {
        setSearchStatus("typing");
        setSearchResults([]);
        setLastSearchedQuery(trimmed);
      }
    },
    [clearDebounceTimer]
  );

  // Executa a busca imediatamente, validando tamanho mínimo antes de consultar API.
  const performSearch = useCallback(
    async (rawQuery: string) => {
      const trimmed = rawQuery.trim();

      if (!trimmed) {
        setSearchStatus("idle");
        setSearchResults([]);
        setSearchError(null);
        setLastSearchedQuery("");
        return;
      }

      if (trimmed.length < MIN_QUERY_LENGTH) {
        setSearchStatus("typing");
        setSearchResults([]);
        setSearchError(null);
        setLastSearchedQuery(trimmed);
        return;
      }

      setSearchStatus("loading");
      setSearchError(null);
      setLastSearchedQuery(trimmed);

      try {
        const cacheKey = trimmed.toLowerCase();
        const cached = searchCacheRef.current.get(cacheKey);
        const now = Date.now();

        let results: CourseSearchResult[];

        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          results = cached.data;
        } else {
          const remote = await fetchCoursesByTerm(API_URL, trimmed, 6);
          results = remote;
          searchCacheRef.current.set(cacheKey, {
            timestamp: now,
            data: results,
          });
        }

        setSearchResults(results);
        setSearchStatus(results.length > 0 ? "success" : "empty");
      } catch (error) {
        void error;
        setSearchStatus("error");
        setSearchError(
          "Não foi possível buscar agora. Tente novamente em instantes."
        );
      }
    },
    []
  );

  const handleResultSelect = useCallback(
    (course: CourseSearchResult) => {
      handleSearchClear({ refocus: false });
      navigate("/app/cursos", { state: { focusCourseId: course.id } });
    },
    [handleSearchClear, navigate]
  );
  // Permite submeter manualmente a busca (botão, Enter, limpar debounce).
  const triggerImmediateSearch = useCallback(() => {
    clearDebounceTimer();
    performSearch(searchQuery);
  }, [clearDebounceTimer, performSearch, searchQuery]);

  // Reexecuta a busca após o usuário parar de digitar (debounce simples).
  useEffect(() => {
    const trimmed = searchQuery.trim();

    clearDebounceTimer();

    if (!trimmed) {
      return;
    }

    const timer = window.setTimeout(() => {
      performSearch(searchQuery);
      debounceTimerRef.current = null;
    }, SEARCH_DEBOUNCE_MS);

    debounceTimerRef.current = timer;

    return () => {
      window.clearTimeout(timer);
      if (debounceTimerRef.current === timer) {
        debounceTimerRef.current = null;
      }
    };
  }, [searchQuery, performSearch, clearDebounceTimer]);

  // Se o menu recolher, limpa estado da busca para evitar overlays posicionados fora de tela.
  useEffect(() => {
    if (collapsed) {
      handleSearchClear({ refocus: false });
    }
  }, [collapsed, handleSearchClear]);

  const overlayVisible = !collapsed && searchStatus !== "idle";

  useEffect(() => {
    const input = searchInputRef.current;
    if (!input) return;
    input.id = SEARCH_INPUT_ID;
    input.setAttribute("aria-controls", SEARCH_OVERLAY_ID);
    input.setAttribute("aria-expanded", overlayVisible ? "true" : "false");
    if (overlayVisible) {
      input.setAttribute("aria-describedby", SEARCH_OVERLAY_ID);
    } else {
      input.removeAttribute("aria-describedby");
    }
  }, [overlayVisible]);

  // Mantém o cartão de resultados alinhado ao input mesmo após scroll/resize.
  useLayoutEffect(() => {
    if (!overlayVisible) {
      setSearchOverlayPosition(null);
      return;
    }

    const updatePosition = () => {
      const input = searchInputRef.current;
      if (!input) {
        return;
      }

      const rect = input.getBoundingClientRect();
      setSearchOverlayPosition({
        top: rect.bottom + 12 + window.scrollY,
        left: rect.left + window.scrollX,
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [overlayVisible, searchQuery]);

  const displayQuery = lastSearchedQuery || searchQuery.trim();

  // Títulos dinâmicos ajudam o usuário a entender o estado atual da busca.
  const overlayTitle = (() => {
    switch (searchStatus) {
      case "loading":
        return displayQuery
          ? `Buscando "${displayQuery}"...`
          : "Buscando games...";
      case "success":
        return `Resultados para "${displayQuery}"`;
      case "empty":
        return `Nenhum game encontrado para "${displayQuery}"`;
      case "error":
        return "Não foi possível buscar agora";
      case "typing":
        return `Digite pelo menos ${MIN_QUERY_LENGTH} caracteres`;
      default:
        return "";
    }
  })();

  // Corpo do overlay muda conforme o status (carregando, vazio, erro, sucesso).
  let overlayBody: ReactNode = null;

  if (searchStatus === "loading") {
    overlayBody = (
      <div className="flex items-center gap-3 text-sm text-azul-forte/70">
        <span
          className="h-4 w-4 animate-spin rounded-full border-2 border-azul-forte/30 border-t-azul-forte"
          aria-hidden="true"
        />
        <span>Buscando games...</span>
      </div>
    );
  } else if (searchStatus === "typing") {
    overlayBody = (
      <p className="text-xs text-azul-forte/70">
        Digite pelo menos {MIN_QUERY_LENGTH} caracteres para iniciar a busca.
      </p>
    );
  } else if (searchStatus === "empty") {
    overlayBody = (
      <div className="grid gap-3 text-xs text-azul-forte/70">
        <p>
          Nenhum resultado encontrado para <strong>{displayQuery}</strong>.
          Confira as sugestões abaixo.
        </p>
        <div className="grid gap-3 rounded-xl bg-azul-forte/5 p-4 text-xs text-azul-forte/80">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-azul-forte">Sugestões</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-azul-forte/70">
              visão rápida
            </span>
          </div>
          <ul className="grid gap-2">
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-1.5 w-1.5 rounded-full bg-amarelo"
                aria-hidden="true"
              />
              <p className="leading-snug">
                Busque pelo nome completo ou sigla do treinamento.
              </p>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-1.5 w-1.5 rounded-full bg-amarelo"
                aria-hidden="true"
              />
              <p className="leading-snug">
                Filtre por unidade, trilha ou habilidades correlatas.
              </p>
            </li>
            <li className="flex items-start gap-2">
              <span
                className="mt-[6px] h-1.5 w-1.5 rounded-full bg-amarelo"
                aria-hidden="true"
              />
              <p className="leading-snug">
                Confira os cursos em destaque na página inicial.
              </p>
            </li>
          </ul>
        </div>
      </div>
    );
  } else if (searchStatus === "error") {
    overlayBody = (
      <div className="grid gap-3 text-xs text-azul-forte/70">
        <p>
          {searchError ??
            "Não foi possível buscar agora. Tente novamente em instantes."}
        </p>
        <button
          type="button"
          onClick={triggerImmediateSearch}
          className="inline-flex items-center gap-2 rounded-full bg-azul-forte px-3 py-1 text-xs font-semibold text-white transition hover:bg-azul-forte/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/70"
        >
          Tentar novamente
        </button>
      </div>
    );
  } else if (searchStatus === "success") {
    overlayBody = (
      <div className="grid gap-4">
        <ul className="grid gap-2">
          {searchResults.map((course) => (
            <li key={course.id}>
              <button
                type="button"
                className="w-full rounded-xl border border-azul-forte/10 bg-white/95 p-3 text-left transition hover:border-amarelo hover:shadow-[0_12px_25px_rgba(15,23,42,0.15)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/70"
                onClick={() => handleResultSelect(course)}
                aria-label={`Abrir o game ${course.title}`}
              >
                <p className="font-semibold text-azul-forte">{course.title}</p>
                <p className="mt-1 text-xs text-azul-forte/70">
                  {course.category || "Sem categoria"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // Renderiza o cartão em um portal para evitar clipping dentro do aside.
  const searchOverlay =
    overlayVisible && searchOverlayPosition && overlayBody
      ? createPortal(
        <div
          className="pointer-events-none fixed z-[90]"
          style={{
            top: `${searchOverlayPosition.top}px`,
            left: `${searchOverlayPosition.left}px`,
            transform: "translate(0, 0)",
            maxWidth: "min(30rem, calc(100vw - 4rem))",
          }}
        >
          <div className="relative pointer-events-auto">
            <span
              aria-hidden="true"
              className="surface-overlay-arrow left-8 -top-3"
            />
            <div className="surface-overlay-card w-full min-w-[18rem]">
              <div className="flex items-start justify-between gap-4 border-b border-azul-forte/10 pb-3">
                <p className="font-semibold leading-6 text-slate-900">
                  {overlayTitle}
                </p>
                <button
                  type="button"
                  onClick={() => handleSearchClear()}
                  className="text-xs font-semibold uppercase tracking-wide text-azul-forte/60 transition hover:text-azul-forte"
                  aria-label="Fechar resultado da busca"
                >
                  Fechar
                </button>
              </div>
              <div
                id={SEARCH_OVERLAY_ID}
                className="mt-4"
                aria-live="polite"
                aria-atomic="true"
              >
                {overlayBody}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )
      : null;

  return (
    <>
      {/* Container principal do menu lateral desktop */}
      <aside
        aria-hidden={collapsed}
        className={`relative flex h-full w-full flex-col overflow-y-auto bg-azul-forte pb-6 pt-8 text-white transition-[padding,opacity] duration-300 ${collapsed ? "px-0 opacity-0" : "px-6 opacity-100"
          }`}
      >
        {!collapsed && (
          <button
            type="button"
            onClick={onCollapse}
            aria-label="recolher menu lateral"
            className="group absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"
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
        )}
        <div
          className={`space-y-4 transition-all duration-300 ${collapsed
            ? "pointer-events-none opacity-0 translate-y-4"
            : "pointer-events-auto opacity-100 translate-y-0"
            }`}
        >
          <div>
            <Link
              to="/"
              className="inline-block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <h1 className="text-3xl font-semibold">
                <span className="text-amarelo">G</span>
                ren
                <span className="text-vermelho-forte">G</span>
                ame
              </h1>
            </Link>
          </div>
          <div role="search" aria-label="Buscar games" className="relative">
            {/* Campo de busca com overlay inteligente */}
            <SearchField
              value={searchQuery}
              onValueChange={handleSearchInputChange}
              onSubmit={triggerImmediateSearch}
              onClear={() => handleSearchClear()}
              isLoading={searchStatus === "loading"}
              placeholder="Buscar games..."
              autoFocus={!collapsed}
              inputRef={searchInputRef}
            />
          </div>
          {isAdmin && (
            <div className=" text-sm font-medium tracking-tight text-amarelo">
              Painel do Administrador
            </div>
          )}
        </div>
        {/* Navegação derivada do mock de RBAC */}
        <nav
          className={`navMarginTop mt-2 flex flex-col gap-1 transition-opacity duration-300 ${collapsed ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
        >
          {visibleItems.map(({ label, to, exact }, index) => (
            <div key={label + to}>
              <Item to={to} label={label} exact={Boolean(exact)} />
              {isAdmin && (index === 4 || index === 6) && (
                <div className="my-2 h-px bg-white/10" aria-hidden="true" />
              )}
            </div>
          ))}
        </nav>
        {/* Botão de logout fixo no rodapé do menu */}
        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          aria-live="polite"
          aria-busy={isLoggingOut}
          className={`mt-auto flex items-center gap-3 rounded-md px-2 py-3 text-base text-white/70 transition-all duration-300 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${collapsed
            ? "pointer-events-none opacity-0 translate-y-4"
            : "opacity-100 translate-y-0"
            } ${isLoggingOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"
            }`}
          style={{ fontFamily: "FonteSite" }}
        >
          <span
            className="flex h-8 w-8 items-center justify-center rounded-md bg-white/5"
            aria-hidden="true"
          >
            <img src={logoutIcon} alt="" className="h-5 w-5 filter invert" />
          </span>
          {isLoggingOut ? (
            <span>Saindo...</span>
          ) : (
            <span>
              <span>Sair do </span>
              <span className="text-amarelo">G</span>
              <span>ren</span>
              <span className="text-vermelho-forte">G</span>
              <span>ame</span>
            </span>
          )}
        </button>
      </aside>
      {searchOverlay}
    </>
  );
}
