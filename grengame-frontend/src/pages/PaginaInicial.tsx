import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import playIcon from "../assets/img/play.svg";
import userIcon from "../assets/img/user.svg";
import medalIcon from "../assets/img/medal.svg";
import logoutIcon from "../assets/img/logout.svg";
import stepsIcon from "../assets/img/steps.svg";
import trophyIcon from "../assets/img/trophy.svg";
import avatarIcon from "../assets/img/avatar.svg";
import {
  AUTH_CHANGE_EVENT,
  USER_DATA_UPDATED_EVENT,
  getUserRoles,
} from "../utils/auth";
import "./PaginaInicial.css";
import { API_URL } from "../config/api";

const API_BASE_URL = API_URL;
const API_BASE = API_BASE_URL.replace(/\/+$/, "");
const AUTH_BASE = `${API_BASE}/auth`;
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

type Me = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
};

type UserStats = {
  xp?: number;
  total_xp?: number;
};

type RankingEntry = {
  user_id?: number;
  position?: number;
};

const getAuthHeaders = (): HeadersInit => {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return (await response.json()) as T;
};

const getMe = () => fetchJson<Me>(`${AUTH_BASE}/me/`);

const getUserStats = async (): Promise<UserStats | null> => {
  const data = await fetchJson<unknown>(`${AUTH_BASE}/me/stats/`);
  if (!data || typeof data !== "object") return null;
  return data as UserStats;
};

const getRanking = async (limit: number): Promise<RankingEntry[]> => {
  const url = new URL(`${AUTH_BASE}/ranking/`);
  if (Number.isFinite(limit)) {
    url.searchParams.set("limit", String(limit));
  }
  const data = await fetchJson<unknown>(url.toString());
  return Array.isArray(data) ? (data as RankingEntry[]) : [];
};

const buildAvatarSrc = (value?: string) => {
  if (!value) return "";
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${API_BASE}${value}`;
  }
  if (value.includes("/")) {
    return `${API_BASE}/${value}`;
  }
  return `${API_BASE}/media/${value}`;
};

export default function PaginaInicial() {
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [rankingLevel, setRankingLevel] = useState<string>("");
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY)
  );
  const [userDataVersion, setUserDataVersion] = useState(0);
  const [roles, setRoles] = useState<string[]>(() => getUserRoles());
  const apiBaseUrl = API_BASE_URL;

  useEffect(() => {
    const syncAuthToken = () => {
      setAuthToken(localStorage.getItem(ACCESS_TOKEN_KEY));
      setRoles(getUserRoles());
    };

    syncAuthToken();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACCESS_TOKEN_KEY || event.key === REFRESH_TOKEN_KEY) {
        syncAuthToken();
      }
    };
    const handleUserDataUpdated = () => setUserDataVersion((v) => v + 1);

    window.addEventListener(AUTH_CHANGE_EVENT, syncAuthToken);
    window.addEventListener("storage", handleStorage);
    window.addEventListener(USER_DATA_UPDATED_EVENT, handleUserDataUpdated);
    return () => {
      window.removeEventListener(AUTH_CHANGE_EVENT, syncAuthToken);
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(
        USER_DATA_UPDATED_EVENT,
        handleUserDataUpdated
      );
    };
  }, []);

  useEffect(() => {
    let active = true;

    if (!authToken) {
      setMe(null);
      setPoints(null);
      setRankingLevel("");
      setRoles([]);
      return () => {
        active = false;
      };
    }

    const load = async () => {
      const [meRes, statsRes] = await Promise.all([
        getMe().catch(() => null),
        getUserStats().catch(() => null),
      ]);
      if (!active) return;
      if (meRes) setMe(meRes);
      const totalValue = Number(statsRes?.total_xp ?? statsRes?.xp ?? 0);
      setPoints(Number.isFinite(totalValue) ? totalValue : 0);
    };

    load().catch((err: unknown) => {
      if (!active) return;
      const message = (err as Error)?.message ?? "";
      const match = /HTTP[_ ](\d{3})/.exec(message);
      const code = match?.[1] ?? (message === "UNAUTHORIZED" ? "401" : "");
      setRankingLevel(`Falha ${code || "erro"}`);
    });

    return () => {
      active = false;
    };
  }, [authToken, userDataVersion]);

  useEffect(() => {
    let active = true;

    const loadRanking = async () => {
      try {
        const data = await getRanking(50);
        if (!active) return;
        if (!Array.isArray(data) || data.length === 0) {
          setRankingLevel("Bronze");
          return;
        }

        const entry = data.find((item) => item.user_id === me?.id) ?? null;

        if (!entry || !entry.position) {
          setRankingLevel("Bronze");
          return;
        }

        const tier =
          entry.position <= 3
            ? "Ouro"
            : entry.position <= 10
              ? "Prata"
              : "Bronze";
        setRankingLevel(tier);
      } catch (err) {
        if (!active) return;
        const message = (err as Error)?.message ?? "";
        const match =
          /HTTP[_ ](\d{3})/.exec(message) || /HTTP (\d{3})/.exec(message);
        const code = match?.[1] ?? (message === "UNAUTHORIZED" ? "401" : "");
        setRankingLevel(`Falha ${code || "erro"}`);
      }
    };

    if (me) {
      loadRanking();
    } else {
      setRankingLevel("");
    }

    return () => {
      active = false;
    };
  }, [me]);

  const userDisplayName = (() => {
    if (!me) return "";
    const first = (me.first_name || "").trim();
    const last = (me.last_name || "").trim();
    const full = [first, last].filter(Boolean).join(" ");
    if (full) return full;
    const email = (me.email || "").split("@")[0];
    return email || "";
  })();
  const avatarSrc = me?.avatar_url ? buildAvatarSrc(me.avatar_url) : "";

  const isAdmin = roles.includes("admin");

  const menuLetters = "Menu Inicial".split("");

  const menuButtons = isAdmin
    ? [
        {
          to: "/app/cursos",
          title: "Games Disponíveis",
          subtitle: "Visualize todos os games",
          icon: playIcon,
          ariaLabel: "Ir para Games Disponíveis",
        },
        {
          to: "/app/AdministrarGames",
          title: "Administrar Games",
          subtitle: "Gerencie os games disponíveis",
          icon: playIcon,
          ariaLabel: "Ir para Administrar Games",
        },
        {
          to: "/app/AdministrarMissoes",
          title: "Administrar Missões",
          subtitle: "Organize missões e desafios",
          icon: medalIcon,
          ariaLabel: "Ir para Administrar Missões",
        },
        {
          to: "/app/AdministrarUsuarios",
          title: "Administrar Usuários",
          subtitle: "Gerencie contas e permissões",
          icon: userIcon,
          ariaLabel: "Ir para Administrar Usuários",
        },
      ]
    : [
      {
        to: "/app",
        title: "Jogar",
        subtitle: "Continue sua trajetória",
        icon: playIcon,
        ariaLabel: "Ir para Jogar",
      },
      {
        to: "/app/progresso",
        title: "Progresso",
        subtitle: "Acompanhe seus cursos e pontuação",
        icon: playIcon,
        ariaLabel: "Ir para Progresso",
      },
      {
        to: "/app/perfil",
        title: "Perfil",
        subtitle: "Gerencie seu perfil",
        icon: userIcon,
        ariaLabel: "Ir para Perfil",
      },
    ];
  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);

    try {
      const accessToken = localStorage.getItem("accessToken");
      const refreshToken = localStorage.getItem("refreshToken");
      const response = await fetch(`${apiBaseUrl}/auth/logout/`, {
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
      console.warn(
        "Falha ao chamar o logout do backend; aplicando fallback local.",
        error
      );
    } finally {
      localStorage.removeItem("accessToken");
      sessionStorage.removeItem("accessToken");
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  };

  return (
    // Fundo Main.
    <div className="relative flex min-h-screen items-center justify-center text-white home-animated-bg">
      <aside
        className="absolute top-6 right-6 hidden items-center gap-6 rounded-2xl border-2 border-amarelo px-6 py-3 text-white/[0.85] backdrop-blur lg:flex"
        aria-label="mini menu do usuário"
      >
        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/progresso"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amarelo/70">
            <img
              src={stepsIcon}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-110"
            />
          </div>
          <div className="text-left leading-tight">
            <p className="text-lg font-semibold text-amarelo">{points}</p>
            <p className="text-xs text-white/70">Pontos</p>
          </div>
        </Link>

        <span className="h-10 w-px bg-amarelo" aria-hidden="true" />

        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/ranking"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-yellow-400/70">
            <img
              src={trophyIcon}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-110"
            />
          </div>
          <div className="text-left leading-tight">
            <p className="text-lg font-semibold text-amarelo">{rankingLevel}</p>
            <p className="text-xs text-white/70">Nível</p>
          </div>
        </Link>

        <span className="h-10 w-px bg-amarelo" aria-hidden="true" />

        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/perfil"
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-yellow-400/80">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
                aria-hidden="true"
              />
            ) : (
              <img
                src={avatarIcon}
                className="h-full w-full object-cover transition-transform duration-200 ease-out group-hover:scale-105"
                aria-hidden="true"
              />
            )}
          </div>
          <div className="text-left leading-tight">
            <p
              className="text-lg font-semibold text-white max-w-[180px] truncate"
              style={{
                fontFamily: "FonteTitulos",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {userDisplayName}
            </p>
          </div>
        </Link>
      </aside>

      <main
        className="w-full max-w-3xl px-6"
        aria-label="Conteúdo principal da página inicial"
      >
        <header className="mb-8 text-center">
          <h1 className="text-6xl tracking-tight">
            <span
              className="text-amarelo"
              style={{ fontFamily: "FonteTitulos", fontWeight: 800 }}
            >
              G
            </span>
            <span
              className="text-white"
              style={{ fontFamily: "FonteTitulos", fontWeight: 600 }}
            >
              ren
            </span>
            <span
              className="text-vermelho-forte"
              style={{ fontFamily: "FonteTitulos", fontWeight: 800 }}
            >
              G
            </span>
            <span
              className="text-white"
              style={{ fontFamily: "FonteTitulos", fontWeight: 600 }}
            >
              ame
            </span>
          </h1>
          <p
            className="mt-3 text-base text-amarelo"
            style={{ fontFamily: "Fonte Menu Inicial" }}
            aria-label="Menu Inicial"
          >
            {menuLetters.map((letter, index) =>
              letter === " " ? (
                <span
                  key={`space-${index}`}
                  className="inline-block w-3"
                  aria-hidden="true"
                >
                  &nbsp;
                </span>
              ) : (
                <span
                  key={`letter-${index}`}
                  className="menu-letter"
                  aria-hidden="true"
                  style={{ animationDelay: `${index * 0.15}s` }}
                >
                  {letter}
                </span>
              )
            )}
          </p>
        </header>

        <nav className="space-y-5 sm:space-y-6" aria-label="Menu Inicial - Botões">
          {menuButtons.map(({ to, title, subtitle, icon, ariaLabel }) => (
            <Link
              key={to}
              to={to}
              className="menu-button flex w-full items-center justify-between gap-3 rounded-lg border-2 border-yellow-400 bg-transparent p-4 sm:gap-4 sm:p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
              aria-label={ariaLabel}
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-md bg-amarelo sm:h-14 sm:w-14">
                  <img
                    src={icon}
                    alt=""
                    aria-hidden="true"
                    className="h-6 w-6"
                  />
                </div>
                <div className="text-left">
                  <p className="text-xl font-semibold text-amarelo sm:text-2xl">
                    {title}
                  </p>
                  <p className="text-xs text-amarelo sm:text-sm">{subtitle}</p>
                </div>
              </div>

              <div
                className="flex h-8 w-8 items-center justify-center rounded bg-amarelo text-black sm:h-9 sm:w-9"
                aria-hidden="true"
              >
                <div className="flex h-3 w-3 items-center justify-center rounded-md bg-amarelo sm:h-4 sm:w-4">
                  <img
                    src={icon}
                    alt=""
                    aria-hidden="true"
                    className="h-3 w-3 sm:h-4 sm:w-4"
                  />
                </div>
              </div>
            </Link>
          ))}
        </nav>

        <footer
          className="mt-8 flex items-center justify-center text-sm"
          aria-label="Footer e logout"
        >
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            aria-live="polite"
            aria-busy={isLoggingOut}
            className={`group flex items-center justify-center text-base text-white/[0.68] transition-colors duration-150 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amarelo/80 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent ${isLoggingOut ? "cursor-not-allowed opacity-60" : "cursor-pointer"
              }`}
            style={{ fontFamily: "FonteSite" }}
          >
            <span
              className="flex h-8 w-8 items-center justify-center rounded-md opacity-[0.68] transition-opacity duration-150 group-hover:opacity-80"
              aria-hidden="true"
            >
              <img src={logoutIcon} alt="" className="h-6 w-6 invert" />
            </span>
            {isLoggingOut ? (
              <span>Saindo...</span>
            ) : (
              <span>
                <span>Sair do </span>
                <span className="text-amarelo/[0.68]">G</span>
                <span>ren</span>
                <span className="text-vermelho-forte/[0.68]">G</span>
                <span>ame</span>
              </span>
            )}
          </button>
        </footer>
      </main>
    </div>
  );
}








