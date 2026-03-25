import { Link } from "react-router-dom";
import avatarIcon from "../../assets/img/avatar.svg";
import { useEffect, useMemo, useRef, useState } from "react";
import { USER_DATA_UPDATED_EVENT } from "../../utils/auth";
import { API_URL } from "../../config/api";
import TemporaryUserBadge from "../TemporaryUserBadge";
import TemporaryProfileInfoModal from "../TemporaryProfileInfoModal";
import {
  dismissTemporaryNoticeForCurrentToken,
  getCurrentAccessToken,
  getTemporaryNoticeStorageKeyForToken,
  isTemporaryNoticeDismissedForCurrentToken,
} from "../../utils/temporaryAccess";

const API_BASE_URL = API_URL;
const API_BASE = API_BASE_URL.replace(/\/+$/, "");
const AUTH_BASE = `${API_BASE}/auth`;
const ACCESS_TOKEN_KEY = "accessToken";

type Me = {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  avatar_url?: string;
  is_temporary_account?: boolean;
  temporary_expires_at?: string | null;
};

type UserStats = {
  xp?: number;
  total_xp?: number;
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

type TopbarMobileProps = {
  onToggleSidebar: () => void;
  isSidebarOpen: boolean;
};

export default function TopbarMobile({
  onToggleSidebar,
  isSidebarOpen,
}: TopbarMobileProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [points, setPoints] = useState<number>(0);
  const [userDataVersion, setUserDataVersion] = useState(0);
  const [isTemporaryModalOpen, setIsTemporaryModalOpen] = useState(false);
  const shownTemporaryModalTokenKey = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const [meRes, statsRes] = await Promise.all([
          getMe().catch(() => null),
          getUserStats().catch(() => null),
        ]);
        if (!active) return;
        if (meRes) setMe(meRes);
        const totalValue = Number(statsRes?.total_xp ?? statsRes?.xp ?? 0);
        setPoints(Number.isFinite(totalValue) ? totalValue : 0);
      } catch {
        // mantem valores padrao sem mocks
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [userDataVersion]);

  useEffect(() => {
    const handleUserDataUpdated = () => setUserDataVersion((v) => v + 1);
    window.addEventListener(USER_DATA_UPDATED_EVENT, handleUserDataUpdated);
    return () => {
      window.removeEventListener(USER_DATA_UPDATED_EVENT, handleUserDataUpdated);
    };
  }, []);

  const firstName = useMemo(() => {
    if (!me) return "Ola";
    const first = (me.first_name || "").trim();
    return first || (me.email || "Usuario").split("@")[0];
  }, [me]);

  const avatarSrc = me?.avatar_url ? buildAvatarSrc(me.avatar_url) : "";
  const isTemporaryUser = Boolean(me?.is_temporary_account);
  const temporaryExpiresAt = me?.temporary_expires_at ?? null;

  useEffect(() => {
    if (!isTemporaryUser) {
      setIsTemporaryModalOpen(false);
      shownTemporaryModalTokenKey.current = null;
      return;
    }

    const authToken = getCurrentAccessToken();
    const tokenNoticeKey = getTemporaryNoticeStorageKeyForToken(authToken);
    if (!tokenNoticeKey) {
      setIsTemporaryModalOpen(false);
      return;
    }

    if (shownTemporaryModalTokenKey.current === tokenNoticeKey) {
      return;
    }

    shownTemporaryModalTokenKey.current = tokenNoticeKey;
    if (!isTemporaryNoticeDismissedForCurrentToken()) {
      setIsTemporaryModalOpen(true);
    }
  }, [isTemporaryUser]);

  const handleCloseTemporaryModal = (dontShowAgain: boolean) => {
    if (dontShowAgain) {
      dismissTemporaryNoticeForCurrentToken();
    }
    setIsTemporaryModalOpen(false);
  };

  return (
    <>
      <header
        data-mobile-topbar="true"
        className="sticky top-0 z-30 mx-4 mt-4 flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-azul-forte to-roxo-forte px-4 py-4 text-white shadow-lg shadow-black/25 sm:mx-6"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-col items-start gap-2">
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={isSidebarOpen ? "Fechar menu" : "Abrir menu"}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white shadow-lg shadow-black/30 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
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
                {isSidebarOpen ? (
                  <path d="M18 6L6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h10" />
                )}
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex flex-col items-end gap-1">
              <span className="text-sm text-white/60">Ola, {firstName}</span>
              {isTemporaryUser && <TemporaryUserBadge compact />}
            </div>
            <Link
              to="/app/perfil"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/10 p-0.5 shadow-inner shadow-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              aria-label="Ir para o perfil"
            >
              {avatarSrc ? (
                <img
                  src={avatarSrc}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              ) : (
                <img
                  src={avatarIcon}
                  alt=""
                  className="h-full w-full rounded-full object-cover"
                />
              )}
            </Link>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className=" text-xm flex leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
            <span className=" text-xl text-amarelo/[0.68]">G</span>
            <span className=" text-xl ">ren</span>
            <span className=" text-xl text-vermelho-forte/[0.68]">G</span>
            <span className=" text-xl ">ame</span>
          </span>
          <Link
            to="/app/progresso"
            className="flex justify-end gap-3 text-xm text-amarelo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="Ver meu progresso"
          >
            <p>{points} pontos</p>
          </Link>
        </div>
      </header>

      <TemporaryProfileInfoModal
        isOpen={isTemporaryModalOpen}
        displayName={firstName || "Usuário"}
        expiresAt={temporaryExpiresAt}
        onClose={handleCloseTemporaryModal}
      />
    </>
  );
}
