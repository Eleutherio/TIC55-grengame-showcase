function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Token JWT malformado: estrutura inválida');
  }

  // Ajusta base64url para base64 (atob não aceita -/_ sem padding)
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const json = atob(padded);
  return JSON.parse(json);
}

const asString = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const AUTH_CHANGE_EVENT = 'auth:changed';
export const USER_DATA_UPDATED_EVENT = 'user:data-updated';

const notifyAuthChange = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
};

export const notifyUserDataUpdated = (): void => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(USER_DATA_UPDATED_EVENT));
};

/**
 * Verifica se existe um token de acesso válido
 */
export function hasValidToken(): boolean {
  const accessToken = localStorage.getItem('accessToken');

  if (!accessToken) {
    return false;
  }

  try {
    const payload = decodeJwtPayload(accessToken);

    // Verifica se o token expirou
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === 'number' && payload.exp < now) {
      clearTokens();
      return false;
    }

    return true;
  } catch (error) {
    clearTokens();
    return false;
  }
}

export function getAccessTokenExpiryMs(): number | null {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) {
    return null;
  }

  try {
    const payload = decodeJwtPayload(accessToken);
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch (error) {
    return null;
  }
}

export function getUserRoles(): string[] {
  const accessToken = localStorage.getItem('accessToken');

  if (!accessToken) {
    return [];
  }

  try {
    const payload = decodeJwtPayload(accessToken);
    return Array.isArray(payload.roles) ? (payload.roles as string[]) : [];
  } catch (error) {
    return [];
  }
}

export function getUserInfo(): {
  displayName: string;
  points: number;
  rankingLevel: string;
  rankingProgress: string;
} {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) {
    return {
      displayName: 'Usuário',
      points: 0,
      rankingLevel: 'Bronze',
      rankingProgress: '0% para o próximo nível',
    };
  }

  try {
    const payload = decodeJwtPayload(accessToken);
    const emailPrefix = (() => {
      const email = asString(payload.email);
      return email ? email.split('@')[0] : null;
    })();

    const displayName =
      asString(payload.name) ??
      asString(payload.full_name) ??
      asString(payload.username) ??
      emailPrefix ??
      'Usuário';

    const points = asNumber(payload.points) ?? 0;
    const rankingLevel = asString(payload.rankingLevel) ?? 'Bronze';
    const rankingProgress = asString(payload.rankingProgress) ?? '0% para o próximo nível';

    return { displayName, points, rankingLevel, rankingProgress };
  } catch {
    return {
      displayName: 'Usuário',
      points: 0,
      rankingLevel: 'Bronze',
      rankingProgress: '0% para o próximo nível',
    };
  }
}

export function hasRole(role: string): boolean {
  const roles = getUserRoles();
  return roles.includes(role);
}

export function getCurrentUserId(): number | null {
  const accessToken = localStorage.getItem('accessToken');
  if (!accessToken) {
    return null;
  }
  try {
    const payload = decodeJwtPayload(accessToken);
    const idFromToken = payload.user_id ?? payload.userId ?? null;
    return typeof idFromToken === 'number' ? idFromToken : Number(idFromToken) || null;
  } catch (error) {
    return null;
  }
}

export function isAdmin(): boolean {
  return hasRole('admin');
}

export function clearTokens(): void {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
  notifyAuthChange();
}

export function saveTokens(accessToken: string, refreshToken: string): void {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  notifyAuthChange();
}




