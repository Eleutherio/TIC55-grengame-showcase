import { useCallback, useEffect, useRef, useState } from "react";
import {
  AUTH_CHANGE_EVENT,
  clearTokens,
  getAccessTokenExpiryMs,
  saveTokens,
} from "../utils/auth";
import { useUserActivity } from "../hooks/useUserActivity";
import { API_URL } from "../config/api";

const API_BASE_URL = API_URL;
const API_BASE = API_BASE_URL.replace(/\/+$/, "");
const AUTH_BASE = `${API_BASE}/auth`;

const IDLE_BEFORE_PROMPT_MS = 5 * 60 * 1000;
const PROMPT_TIMEOUT_MS = 2 * 60 * 1000;
const AUTO_REFRESH_THRESHOLD_MS = 60 * 1000;
const AUTO_REFRESH_COOLDOWN_MS = 30 * 1000;


export default function SessionTimeoutPrompt() {
  const [isOpen, setIsOpen] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(
    Math.ceil(PROMPT_TIMEOUT_MS / 1000),
  );
  const [isRefreshing, setIsRefreshing] = useState(false);

  const idleTimeoutRef = useRef<number | null>(null);
  const logoutTimeoutRef = useRef<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);
  const refreshInFlightRef = useRef<Promise<boolean> | null>(null);
  const lastAutoRefreshAtRef = useRef(0);

  const clearIdleTimer = useCallback(() => {
    if (idleTimeoutRef.current) {
      window.clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearPromptTimers = useCallback(() => {
    if (logoutTimeoutRef.current) {
      window.clearTimeout(logoutTimeoutRef.current);
      logoutTimeoutRef.current = null;
    }
    if (countdownIntervalRef.current) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  const performLogout = useCallback(async () => {
    clearIdleTimer();
    clearPromptTimers();
    setIsOpen(false);
    const accessToken = localStorage.getItem("accessToken");
    const refreshToken = localStorage.getItem("refreshToken");

    if (refreshToken) {
      try {
        await fetch(`${AUTH_BASE}/logout/`, {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({ refresh: refreshToken }),
        });
      } catch {
        // best-effort logout
      }
    }

    clearTokens();
    sessionStorage.removeItem("accessToken");
    if (typeof window !== "undefined") {
      window.location.assign("/login");
    }
  }, [clearIdleTimer, clearPromptTimers]);

  const openWarning = useCallback(() => {
    clearIdleTimer();
    clearPromptTimers();
    setIsOpen(true);
    setRemainingSeconds(Math.ceil(PROMPT_TIMEOUT_MS / 1000));

    countdownIntervalRef.current = window.setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);

    logoutTimeoutRef.current = window.setTimeout(() => {
      performLogout();
    }, PROMPT_TIMEOUT_MS);
  }, [clearIdleTimer, clearPromptTimers, performLogout]);

  const scheduleIdleTimer = useCallback(() => {
    clearIdleTimer();
    const token = localStorage.getItem("accessToken");
    if (!token) {
      setIsOpen(false);
      return;
    }
    idleTimeoutRef.current = window.setTimeout(
      openWarning,
      IDLE_BEFORE_PROMPT_MS,
    );
  }, [clearIdleTimer, openWarning]);

  const refreshTokens = useCallback(
    async (mode: "manual" | "auto") => {
      if (refreshInFlightRef.current) {
        return refreshInFlightRef.current;
      }

      const run = (async () => {
        const refreshToken = localStorage.getItem("refreshToken");
        if (!refreshToken) {
          const expiryMs = getAccessTokenExpiryMs();
          if (mode === "manual" || !expiryMs || expiryMs <= Date.now()) {
            await performLogout();
          }
          return false;
        }

        const response = await fetch(`${AUTH_BASE}/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: refreshToken }),
        });

        if (!response.ok) {
          const expiryMs = getAccessTokenExpiryMs();
          if (mode === "manual" || !expiryMs || expiryMs <= Date.now()) {
            await performLogout();
          }
          return false;
        }

        const data = (await response.json()) as {
          access?: string;
          refresh?: string;
        };

        if (!data.access) {
          const expiryMs = getAccessTokenExpiryMs();
          if (mode === "manual" || !expiryMs || expiryMs <= Date.now()) {
            await performLogout();
          }
          return false;
        }

        saveTokens(data.access, data.refresh ?? refreshToken);
        return true;
      })();

      refreshInFlightRef.current = run;
      const result = await run;
      refreshInFlightRef.current = null;
      return result;
    },
    [performLogout],
  );

  const handleStayLoggedIn = useCallback(async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      clearPromptTimers();
      const refreshed = await refreshTokens("manual");
      if (refreshed) {
        setIsOpen(false);
        scheduleIdleTimer();
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, clearPromptTimers, refreshTokens, scheduleIdleTimer]);

  const maybeAutoRefresh = useCallback(async () => {
    const expiryMs = getAccessTokenExpiryMs();
    if (!expiryMs) return;

    const now = Date.now();
    if (expiryMs - now > AUTO_REFRESH_THRESHOLD_MS) return;
    if (now - lastAutoRefreshAtRef.current < AUTO_REFRESH_COOLDOWN_MS) return;

    lastAutoRefreshAtRef.current = now;
    await refreshTokens("auto");
  }, [refreshTokens]);

  useEffect(() => {
    scheduleIdleTimer();

    const handleStorage = (event: StorageEvent) => {
      if (event.key === "accessToken" || event.key === "refreshToken") {
        scheduleIdleTimer();
      }
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        scheduleIdleTimer();
        void maybeAutoRefresh();
      }
    };

    window.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener(AUTH_CHANGE_EVENT, scheduleIdleTimer);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener(AUTH_CHANGE_EVENT, scheduleIdleTimer);
      window.removeEventListener("storage", handleStorage);
      clearIdleTimer();
      clearPromptTimers();
    };
  }, [
    clearIdleTimer,
    clearPromptTimers,
    scheduleIdleTimer,
    maybeAutoRefresh,
    isOpen,
  ]);

  useUserActivity({
    enabled: !isOpen,
    onActivity: () => {
      scheduleIdleTimer();
      void maybeAutoRefresh();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-md rounded-2xl border border-amarelo/60 bg-azul-forte p-6 text-white shadow-2xl">
        <h2 className="text-2xl font-semibold text-amarelo">
          Você ainda está aí?
        </h2>
        <p className="mt-3 text-sm text-white/80">
          Sua sessão vai expirar em {remainingSeconds} segundo
          {remainingSeconds === 1 ? "" : "s"}. Clique em "Sim" para continuar.
        </p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleStayLoggedIn}
            disabled={isRefreshing}
            className="rounded-lg bg-amarelo px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isRefreshing ? "Renovando..." : "Sim"}
          </button>
        </div>
      </div>
    </div>
  );
}
