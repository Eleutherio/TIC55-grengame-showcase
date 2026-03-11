import { Link, useMatches } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import stepsIcon from "../assets/img/steps.svg";
import trophyIcon from "../assets/img/trophy.svg";
import avatarIcon from "../assets/img/avatar.svg";
import { AUTH_CHANGE_EVENT, USER_DATA_UPDATED_EVENT } from "../utils/auth";
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

type BreadcrumbValue =
  | string
  | {
      label: string;
      to?: string;
    };

type BreadcrumbHandle =
  | {
      breadcrumb?:
        | BreadcrumbValue
        | ((context: {
            params: Record<string, string | undefined>;
            pathname: string;
          }) => BreadcrumbValue);
    }
  | undefined;

export default function Topbar() {
  const [isVisible, setIsVisible] = useState(true);
  const [me, setMe] = useState<Me | null>(null);
  const [points, setPoints] = useState<number | null>(null);
  const [rankingLevel, setRankingLevel] = useState<string>("");
  const [authToken, setAuthToken] = useState<string | null>(() =>
    localStorage.getItem(ACCESS_TOKEN_KEY)
  );
  const [userDataVersion, setUserDataVersion] = useState(0);
  const lastScrollY = useRef(0);

  const matches = useMatches();
  const breadcrumbs = matches
    .map((match) => {
      const handle = match.handle as BreadcrumbHandle;
      if (!handle?.breadcrumb) {
        return null;
      }

      const pathname =
        match.pathname ??
        (match as { pathnameBase?: string }).pathnameBase ??
        "/";
      const rawValue =
        typeof handle.breadcrumb === "function"
          ? handle.breadcrumb({ params: match.params, pathname })
          : handle.breadcrumb;

      const value =
        typeof rawValue === "string"
          ? { label: rawValue, to: undefined }
          : { label: rawValue.label, to: rawValue.to };

      return { label: value.label, path: value.to ?? pathname };
    })
    .filter((crumb): crumb is { label: string; path: string } =>
      Boolean(crumb)
    );

  useEffect(() => {
    const syncAuthToken = () => {
      setAuthToken(localStorage.getItem(ACCESS_TOKEN_KEY));
    };

    syncAuthToken();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === ACCESS_TOKEN_KEY || event.key === REFRESH_TOKEN_KEY) {
        syncAuthToken();
      }
    };
    const handleUserDataUpdated = () => {
      setUserDataVersion((v) => v + 1);
    };

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
      const message = (err as Error)?.message ?? "";
      const match = /HTTP[_ ](\d{3})/.exec(message);
      const code = match?.[1] ?? (message === "UNAUTHORIZED" ? "401" : "");
      if (!active) return;
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

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      if (currentScrollY < 50) {
        setIsVisible(true);
      } else if (currentScrollY > lastScrollY.current) {
        // Scrolling down
        setIsVisible(false);
      } else if (currentScrollY < lastScrollY.current) {
        // Scrolling up
        setIsVisible(true);
      }

      lastScrollY.current = currentScrollY;
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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

  return (
    <header
      className={`mx-6 mt-6 flex items-center gap-4 rounded-2xl bg-roxo-forte pl-4 text-white shadow-lg shadow-black/25 transition-transform duration-300 ease-in-out ${
        isVisible ? "translate-y-0" : "-translate-y-[calc(100%+3rem)]"
      }`}
    >
      <nav
        aria-label="caminho da página"
        className="hidden h-full flex-1 items-center justify-start pl-2 text-xs text-white/85 lg:flex lg:whitespace-nowrap xl:text-sm"
      >
        {breadcrumbs.length === 0 ? (
          <span className="text-white/70">Menu Inicial</span>
        ) : (
          <ol className="flex flex-nowrap items-center gap-1.5 xl:gap-2">
            {breadcrumbs.map((crumb, index) => {
              const isLast = index === breadcrumbs.length - 1;
              return (
                <li
                  key={`${crumb.path}-${index}`}
                  className="flex items-center gap-2"
                >
                  {index > 0 && <span className="text-white/50">/</span>}
                  <Link
                    to={crumb.path}
                    aria-current={isLast ? "page" : undefined}
                    className={`text-white/80 transition-colors hover:text-white ${
                      isLast ? "font-semibold text-white" : ""
                    }`}
                  >
                    {crumb.label}
                  </Link>
                </li>
              );
            })}
          </ol>
        )}
      </nav>
      <aside
        className="ml-auto hidden h-15 items-center gap-5 rounded-2xl bg-azul-forte/95 px-5 text-white/85 shadow-[0_12px_30px_rgba(0,0,0,0.25)] backdrop-blur lg:flex"
        aria-label="mini menu do usuário"
      >
        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/progresso"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amarelo bg-white/5">
            <img
              src={stepsIcon}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-110"
            />
          </div>
          <div className="text-left leading-tight">
            <p className="text-amarelo">{points}</p>
            <p className="text-xs text-white/70">Pontos</p>
          </div>
        </Link>

        <span className="h-10 w-px bg-white/20" aria-hidden="true" />

        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/ranking"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-amarelo bg-white/5">
            <img
              src={trophyIcon}
              alt=""
              aria-hidden="true"
              className="h-5 w-5 transition-transform duration-200 ease-out group-hover:scale-110"
            />
          </div>
          <div className="text-left leading-tight">
            <p className="text-amarelo">{rankingLevel}</p>
            <p className="text-xs text-white/70">Nível</p>
          </div>
        </Link>

        <span className="h-10 w-px bg-white/20" aria-hidden="true" />

        <Link
          className="group flex cursor-pointer items-center gap-3"
          to="/app/perfil"
        >
          <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-full border border-amarelo bg-white/5">
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
              className="text-white max-w-[180px] truncate" // aumenta a largura máxima e aplica truncamento
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
    </header>
  );
}

