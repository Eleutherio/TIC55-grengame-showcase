export const TEMPORARY_NOTICE_STORAGE_PREFIX = "gg:temporary-notice:hidden:token:";
const ACCESS_TOKEN_KEY = "accessToken";

const hashToken = (token: string): string => {
  let hash = 0;
  for (let i = 0; i < token.length; i += 1) {
    hash = (hash * 31 + token.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
};

export const getTemporaryNoticeStorageKeyForToken = (
  token: string | null | undefined
): string | null => {
  const normalizedToken = (token || "").trim();
  if (!normalizedToken) return null;
  return `${TEMPORARY_NOTICE_STORAGE_PREFIX}${hashToken(normalizedToken)}`;
};

export const getCurrentAccessToken = (): string =>
  localStorage.getItem(ACCESS_TOKEN_KEY) ?? "";

export const isTemporaryNoticeDismissedForCurrentToken = (): boolean => {
  const key = getTemporaryNoticeStorageKeyForToken(getCurrentAccessToken());
  return Boolean(key && localStorage.getItem(key) === "1");
};

export const dismissTemporaryNoticeForCurrentToken = (): void => {
  const key = getTemporaryNoticeStorageKeyForToken(getCurrentAccessToken());
  if (!key) return;
  localStorage.setItem(key, "1");
};

export const formatTemporaryRemainingTime = (remainingMs: number): string => {
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return "Expirado";
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours}h ${minutes}m ${seconds}s`;
};

export const formatTemporaryExpiration = (expiresAt: string | null | undefined): string => {
  if (!expiresAt) return "--";
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return "--";
  return parsed.toLocaleString("pt-BR");
};
