import { useEffect, useRef, useState } from "react";
import type { MouseEvent, TouchEvent } from "react";
import { useNavigate } from "react-router-dom";
import "./Perfil.css";
import { notifyUserDataUpdated } from "../utils/auth";
import { API_URL } from "../config/api";

type UserMe = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  avatar?: string;
  avatar_url?: string;
};

type Badge = {
  id: string | number;
  badgeConfigId?: number | null;
  name: string;
  emoji?: string;
  icon?: string;
  earned?: boolean;
  gameName?: string;
  criterion?: string;
  criterionLabel?: string;
  tier?: number | null;
  unlockedAt?: string | null;
  valueMode?: string | null;
  requiredValue?: number | null;
  description?: string | null;
};

type BadgeGroup = {
  id: string;
  title: string;
  gameName?: string | null;
  items: Badge[];
};

const ACCESS_TOKEN_KEY = "accessToken"; 

const PREVIEW_SIZE = 220;
const OUTPUT_SIZE = 400;
const BADGE_SIMULATION_STORAGE_KEY = "gg_badges_simulation";
type BadgeCriterion = "course_points" | "perfect_missions" | "active_days";
type BadgeTierNumber = 1 | 2 | 3 | 4 | 5;

const BADGE_TITLES: Record<BadgeCriterion, Record<BadgeTierNumber, string>> = {
  course_points: {
    1: "Explorador de Pontos",
    2: "Rumo ao Topo",
    3: "Domínio da Trilha",
    4: "Mestre da Jornada",
    5: "Conquistador do Curso",
  },
  perfect_missions: {
    1: "Acerto Afinado",
    2: "Olho Clínico",
    3: "Execução Precisa",
    4: "Mestre Perfeccionista",
    5: "Perfeccionista Supremo",
  },
  active_days: {
    1: "Presença em Campo",
    2: "Ritmo de Treino",
    3: "Constância Tática",
    4: "Compromisso de Elite",
    5: "Ritmo Constante",
  },
};

const isRemoteIcon = (value?: string) =>
  !!value &&
  (value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("/") ||
    value.startsWith("data:"));

const getBadgeFallback = (badge?: Badge | null) => {
  if (!badge) return null;
  if (badge.emoji) return badge.emoji;
  return badge.name?.trim()?.[0]?.toUpperCase() ?? null;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const asFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const isBadgeCriterion = (value: string): value is BadgeCriterion =>
  value === "course_points" ||
  value === "perfect_missions" ||
  value === "active_days";

const asBadgeTierNumber = (value: number | null): BadgeTierNumber | null => {
  if (value === null) return null;
  if (value < 1 || value > 5) return null;
  return value as BadgeTierNumber;
};

const normalizeBadgeIconUrl = (rawUrl: string | null): string | null => {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  const tierMatch = trimmed.match(/\/?(tier[1-5]\.png)$/i);
  if (tierMatch?.[1]) {
    return `/${tierMatch[1]}`;
  }

  return trimmed;
};

const getBadgeDisplayTitle = (
  name: string | null,
  criterionLabel: string | null,
  criterion: string | null,
  tier: number | null
) => {
  const trimmedName = name?.trim() ?? "";
  if (trimmedName) {
    if (tier && !/tier\s*\d+/i.test(trimmedName)) {
      return `${trimmedName} - Tier ${tier}`;
    }
    return trimmedName;
  }

  const tierValue = asBadgeTierNumber(tier);
  if (criterion && tierValue && isBadgeCriterion(criterion)) {
    return `${BADGE_TITLES[criterion][tierValue]} - Tier ${tierValue}`;
  }

  const base = criterionLabel || "Badge";
  if (tier && !/tier\s*\d+/i.test(base)) {
    return `${base} - Tier ${tier}`;
  }
  return base;
};

const formatBadgeDate = (rawDate?: string | null) => {
  if (!rawDate) return null;
  const parsed = new Date(rawDate);
  if (Number.isNaN(parsed.getTime())) return rawDate;

  const date = parsed.toLocaleDateString("pt-BR");
  const time = parsed.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} às ${time}`;
};

const getBadgeRule = (badge: Badge) => {
  if (badge.description) return badge.description;
  if (!badge.criterion) return null;
  const requiredValue =
    typeof badge.requiredValue === "number"
      ? Math.max(0, badge.requiredValue)
      : null;
  if (requiredValue === null) return null;

  const mode = badge.valueMode === "percentage" ? "percentage" : "absolute";

  if (badge.criterion === "course_points") {
    if (mode === "percentage") {
      return `Atingir ${requiredValue}% dos pontos totais do game.`;
    }
    return `Atingir ${requiredValue} pontos totais no game.`;
  }

  if (badge.criterion === "perfect_missions") {
    if (mode === "percentage") {
      return `Concluir ${requiredValue}% das missões com pontuação máxima.`;
    }
    return `Concluir ${requiredValue} missões com pontuação máxima.`;
  }

  if (badge.criterion === "active_days") {
    return `Concluir missões em ${requiredValue} dias diferentes no game.`;
  }

  return null;
};

const parseBadgeSimulation = () => {
  if (!import.meta.env.DEV) return null;
  const raw = localStorage.getItem(BADGE_SIMULATION_STORAGE_KEY);
  if (!raw) return null;
  const match = raw.match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
  if (!match) return null;
  const earned = Number(match[1]);
  const total = Number(match[2]);
  if (!Number.isFinite(earned) || !Number.isFinite(total) || total <= 0) {
    return null;
  }
  return {
    earned: Math.max(0, Math.min(earned, total)),
    total: Math.max(1, total),
  };
};

const createSimulatedBadges = (items: Badge[], target: number): Badge[] => {
  if (!Number.isFinite(target) || target <= 0) return items;
  if (items.length >= target) return items.slice(0, target);
  const filled = [...items];
  for (let i = items.length; i < target; i += 1) {
    filled.push({
      id: `sim-${i + 1}`,
      name: `Badge simulada ${i + 1}`,
      emoji: "★",
      earned: true,
      gameName: "Game",
      criterionLabel: "Simulação",
      tier: (i % 5) + 1,
      unlockedAt: new Date().toISOString(),
    });
  }
  return filled;
};

const getBadgeGroupTitle = (badge: Badge) => {
  return badge.name;
};

const getBadgeGroupKey = (badge: Badge) => {
  return `badge-${badge.id}`;
};

const sortBadgeItems = (items: Badge[]) =>
  [...items].sort((a, b) => {
    const tierA = a.tier ?? 0;
    const tierB = b.tier ?? 0;
    if (tierA !== tierB) return tierA - tierB;
    return String(a.name).localeCompare(String(b.name));
  });

const getBadgeDetailId = (badgeId: string | number) =>
  `badge-detail-${String(badgeId).replace(/[^a-zA-Z0-9_-]/g, "")}`;

const normalizeAvatarUrl = (value?: string | null) => {
  if (!value) return null;
  if (
    value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:")
  ) {
    return value;
  }
  if (value.startsWith("/")) {
    return `${API_URL}${value}`;
  }
  if (value.includes("/")) {
    return `${API_URL}/${value}`;
  }
  return `${API_URL}/media/${value}`;
};

async function fetchCurrentUser(): Promise<UserMe> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const response = await fetch(`${API_URL}/auth/me/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error("REQUEST_FAILED");
  }

  return (await response.json()) as UserMe;
}

async function uploadAvatarToApi(blob: Blob): Promise<string> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const formData = new FormData();
  formData.append("avatar", blob, "avatar.png");

  const response = await fetch(`${API_URL}/auth/update/`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "AVATAR_UPLOAD_FAILED");
  }

  const data = await response.json().catch(() => ({}));
  const avatar = data?.avatar_url ?? data?.avatar;
  if (!avatar) {
    throw new Error("AVATAR_UPLOAD_FAILED");
  }
  return avatar;
}

type UpdateNameResponse = {
  first_name: string;
  last_name: string;
};

type Progress = {
  level: string | number;
  xp: number;
  xpToNext: number | null;
};

async function updateUserNameApi(
  fullName: string
): Promise<UpdateNameResponse> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");

  const response = await fetch(`${API_URL}/auth/update/`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      first_name: firstName,
      last_name: lastName,
    }),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error("NAME_UPDATE_FAILED");
  }

  const data = await response.json().catch(() => null);
  if (data?.first_name && data?.last_name) {
    return { first_name: data.first_name, last_name: data.last_name };
  }

  return { first_name: firstName, last_name: lastName };
}

async function fetchUserProgress(): Promise<Progress> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const response = await fetch(`${API_URL}/auth/me/stats/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error("REQUEST_FAILED");
  }

  const data = await response.json().catch(() => null);
  const xp = Number(data?.xp);
  if (!Number.isFinite(xp)) {
    throw new Error("REQUEST_FAILED");
  }
  const rawXpToNext = data?.xpToNext;
  const xpToNext =
    rawXpToNext === null || rawXpToNext === undefined
      ? null
      : Number(rawXpToNext);
  if (xpToNext !== null && !Number.isFinite(xpToNext)) {
    throw new Error("REQUEST_FAILED");
  }
  const rawLevel = data?.level;
  let level: string | number = "Indefinido";
  if (typeof rawLevel === "string" && rawLevel.trim()) {
    level = rawLevel;
  } else if (typeof rawLevel === "number" && Number.isFinite(rawLevel)) {
    level = rawLevel;
  }
  return { level, xp, xpToNext };
}

const normalizeBadgeEarned = (value: unknown) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.toLowerCase();
    if (["earned", "conquistada", "conquistado", "completed"].includes(normalized)) {
      return true;
    }
    if (["locked", "bloqueada", "bloqueado"].includes(normalized)) {
      return false;
    }
  }
  return undefined;
};

async function fetchUserBadges(): Promise<{
  earnedBadges: Badge[];
  totalBadges: number;
}> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) {
    throw new Error("NO_TOKEN");
  }

  const response = await fetch(`${API_URL}/gamification/badges/`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error("UNAUTHORIZED");
  }

  if (!response.ok) {
    throw new Error("REQUEST_FAILED");
  }

  const data = await response.json().catch(() => null);
  let badgeItems: unknown[] = [];
  let progressItems: unknown[] = [];
  let totalBadges = 0;

  if (Array.isArray(data)) {
    badgeItems = data;
    totalBadges = data.length;
  } else if (data && typeof data === "object") {
    const parsed = data as {
      results?: unknown;
      badges?: unknown;
      unlocked?: unknown;
      progress?: unknown;
      count?: unknown;
      total?: unknown;
      total_badges?: unknown;
    };

    if (Array.isArray(parsed.unlocked)) {
      badgeItems = parsed.unlocked;
    } else if (Array.isArray(parsed.results)) {
      badgeItems = parsed.results;
      if (typeof parsed.count === "number") {
        totalBadges = parsed.count;
      }
    } else if (Array.isArray(parsed.badges)) {
      badgeItems = parsed.badges;
      if (typeof parsed.total === "number") {
        totalBadges = parsed.total;
      } else if (typeof parsed.total_badges === "number") {
        totalBadges = parsed.total_badges;
      }
    }

    if (Array.isArray(parsed.progress)) {
      progressItems = parsed.progress;
    }

    if (typeof parsed.total === "number") {
      totalBadges = parsed.total;
    } else if (typeof parsed.total_badges === "number") {
      totalBadges = parsed.total_badges;
    }
  }

  const progressMap = new Map<
    number,
    {
      gameName: string | null;
      criterion: string | null;
      criterionLabel: string | null;
      valueMode: string | null;
      tiers: Map<number, { requiredValue: number | null; imageUrl: string | null }>;
    }
  >();
  let totalTiersFromProgress = 0;

  progressItems.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as {
      badge_config_id?: unknown;
      badgeConfigId?: unknown;
      game_name?: unknown;
      gameName?: unknown;
      criterion?: unknown;
      criterion_label?: unknown;
      criterionLabel?: unknown;
      value_mode?: unknown;
      valueMode?: unknown;
      tiers?: unknown;
    };
    const configId = asFiniteNumber(item.badge_config_id ?? item.badgeConfigId);
    if (configId === null) return;

    const tiersMap = new Map<
      number,
      { requiredValue: number | null; imageUrl: string | null }
    >();
    const tiersList = Array.isArray(item.tiers) ? item.tiers : [];
    tiersList.forEach((tierEntry) => {
      if (!tierEntry || typeof tierEntry !== "object") return;
      const tierItem = tierEntry as {
        tier?: unknown;
        required_value?: unknown;
        requiredValue?: unknown;
        image_url?: unknown;
        imageUrl?: unknown;
      };
      const tierNumber = asFiniteNumber(tierItem.tier);
      if (tierNumber === null || tierNumber <= 0) return;
      const requiredValue = asFiniteNumber(
        tierItem.required_value ?? tierItem.requiredValue
      );
      const imageUrl = normalizeBadgeIconUrl(
        asNonEmptyString(tierItem.image_url ?? tierItem.imageUrl)
      );
      tiersMap.set(tierNumber, { requiredValue, imageUrl });
    });

    totalTiersFromProgress += tiersMap.size;
    progressMap.set(configId, {
      gameName: asNonEmptyString(item.game_name ?? item.gameName),
      criterion: asNonEmptyString(item.criterion),
      criterionLabel: asNonEmptyString(item.criterion_label ?? item.criterionLabel),
      valueMode: asNonEmptyString(item.value_mode ?? item.valueMode),
      tiers: tiersMap,
    });
  });

  if (totalBadges === 0 && totalTiersFromProgress > 0) {
    totalBadges = totalTiersFromProgress;
  }

  const normalizedBadges = badgeItems
    .map((item: unknown, index: number) => {
      if (!item || typeof item !== "object") return null;
      const maybeBadge = item as {
        id?: string | number;
        badge_config_id?: unknown;
        badgeConfigId?: unknown;
        config_id?: unknown;
        name?: string;
        nome?: string;
        titulo?: string;
        emoji?: string;
        icon?: string;
        image_url?: unknown;
        imageUrl?: unknown;
        game_name?: unknown;
        gameName?: unknown;
        game?: unknown;
        criterion?: unknown;
        criterion_label?: unknown;
        criterionLabel?: unknown;
        tier?: unknown;
        level?: unknown;
        unlocked_at?: unknown;
        unlockedAt?: unknown;
        earned_at?: unknown;
        earnedAt?: unknown;
        achieved_at?: unknown;
        achievedAt?: unknown;
        conquistada_em?: unknown;
        conquistadaEm?: unknown;
        created_at?: unknown;
        createdAt?: unknown;
        value_mode?: unknown;
        valueMode?: unknown;
        required_value?: unknown;
        requiredValue?: unknown;
        description?: unknown;
        descricao?: unknown;
        rule?: unknown;
        detail?: unknown;
        detalhes?: unknown;
        earned?: unknown;
        is_earned?: unknown;
        isEarned?: unknown;
        conquistada?: unknown;
        unlocked?: unknown;
        is_unlocked?: unknown;
        achieved?: unknown;
        completed?: unknown;
        status?: unknown;
      };

      const badgeConfigId =
        asFiniteNumber(
          maybeBadge.badge_config_id ??
            maybeBadge.badgeConfigId ??
            maybeBadge.config_id
        ) ?? null;
      const parsedTier = asFiniteNumber(maybeBadge.tier ?? maybeBadge.level);
      const tier = parsedTier !== null && parsedTier > 0 ? parsedTier : null;
      const progressEntry =
        badgeConfigId !== null ? progressMap.get(badgeConfigId) : undefined;

      const criterion =
        asNonEmptyString(maybeBadge.criterion) ?? progressEntry?.criterion ?? null;
      const criterionLabel =
        asNonEmptyString(maybeBadge.criterion_label ?? maybeBadge.criterionLabel) ??
        progressEntry?.criterionLabel ??
        null;
      const name = getBadgeDisplayTitle(
        asNonEmptyString(maybeBadge.name ?? maybeBadge.nome ?? maybeBadge.titulo),
        criterionLabel,
        criterion,
        tier
      );

      const description = asNonEmptyString(
        maybeBadge.description ??
          maybeBadge.descricao ??
          maybeBadge.rule ??
          maybeBadge.detail ??
          maybeBadge.detalhes
      );

      const gameNameRaw =
        asNonEmptyString(maybeBadge.game_name ?? maybeBadge.gameName) ??
        (typeof maybeBadge.game === "string"
          ? asNonEmptyString(maybeBadge.game)
          : asNonEmptyString(
              (maybeBadge.game as { name?: unknown; titulo?: unknown })?.name ??
                (maybeBadge.game as { name?: unknown; titulo?: unknown })?.titulo
            ));

      const gameName = gameNameRaw ?? progressEntry?.gameName ?? null;

      const unlockedAt = asNonEmptyString(
        maybeBadge.unlocked_at ??
          maybeBadge.unlockedAt ??
          maybeBadge.earned_at ??
          maybeBadge.earnedAt ??
          maybeBadge.achieved_at ??
          maybeBadge.achievedAt ??
          maybeBadge.conquistada_em ??
          maybeBadge.conquistadaEm ??
          maybeBadge.created_at ??
          maybeBadge.createdAt
      );

      const iconRaw = asNonEmptyString(
        maybeBadge.icon ??
          maybeBadge.image_url ??
          maybeBadge.imageUrl
      );
      const icon =
        normalizeBadgeIconUrl(iconRaw) ??
        (tier !== null ? progressEntry?.tiers.get(tier)?.imageUrl ?? null : null);

      const requiredValue =
        asFiniteNumber(maybeBadge.required_value ?? maybeBadge.requiredValue) ??
        (tier !== null ? progressEntry?.tiers.get(tier)?.requiredValue ?? null : null);

      const valueMode =
        asNonEmptyString(maybeBadge.value_mode ?? maybeBadge.valueMode) ??
        progressEntry?.valueMode ??
        null;

      const earned =
        normalizeBadgeEarned(maybeBadge.earned) ??
        normalizeBadgeEarned(maybeBadge.is_earned) ??
        normalizeBadgeEarned(maybeBadge.isEarned) ??
        normalizeBadgeEarned(maybeBadge.conquistada) ??
        normalizeBadgeEarned(maybeBadge.unlocked) ??
        normalizeBadgeEarned(maybeBadge.is_unlocked) ??
        normalizeBadgeEarned(maybeBadge.achieved) ??
        normalizeBadgeEarned(maybeBadge.completed) ??
        normalizeBadgeEarned(maybeBadge.status) ??
        (unlockedAt ? true : undefined);

      return {
        id:
          maybeBadge.id ??
          `${badgeConfigId ?? "badge"}-${tier ?? index}`,
        badgeConfigId,
        name,
        emoji: maybeBadge.emoji,
        icon: icon ?? undefined,
        earned,
        gameName,
        criterion,
        criterionLabel,
        tier,
        unlockedAt,
        valueMode,
        requiredValue,
        description,
      };
    })
    .filter(Boolean) as Badge[];

  const hasEarnedFlag = normalizedBadges.some(
    (badge) => typeof badge.earned === "boolean"
  );
  const earnedBadges = hasEarnedFlag
    ? normalizedBadges.filter((badge) => badge.earned)
    : normalizedBadges;

  const totalBadgesSafe =
    totalBadges > 0 ? totalBadges : normalizedBadges.length;

  // fallback vazio para nao renderizar mock quando nao ha badges
  return { earnedBadges, totalBadges: totalBadgesSafe };
}

export default function Perfil() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserMe | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [previewSrc, setPreviewSrc] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [minScale, setMinScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragState, setDragState] = useState({
    active: false,
    lastX: 0,
    lastY: 0,
  });
  const [imageDimensions, setImageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isNameModalOpen, setIsNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [badgesError, setBadgesError] = useState<string | null>(null);
  const [badgesLoading, setBadgesLoading] = useState(false);
  const [totalBadges, setTotalBadges] = useState<number | null>(null);
  const [activeBadgeId, setActiveBadgeId] = useState<string | number | null>(
    null
  );

  const getMaxScale = () => Math.max(3, minScale + 1);

  useEffect(() => {
    let isMounted = true;

    const carregarDados = async () => {
      try {
        const userData = await fetchCurrentUser();
        if (!isMounted) return;
        setUser(userData);
        // Carregar avatar se existir
        const resolvedAvatar = normalizeAvatarUrl(
          userData.avatar ?? userData.avatar_url ?? null
        );
        if (resolvedAvatar) {
          setAvatarUrl(resolvedAvatar);
        }
        setIsLoading(false);
      } catch (err) {
        if (!isMounted) return;
        const message = err instanceof Error ? err.message : "REQUEST_FAILED";
        if (message === "NO_TOKEN" || message === "UNAUTHORIZED") {
          navigate("/login", { replace: true });
          return;
        }
        setErrorCode(message);
        setIsLoading(false);
      }
    };

    carregarDados();

    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    fetchUserProgress()
      .then((data) => {
        if (!isMounted) return;
        setProgress(data);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        if (err.message === "UNAUTHORIZED") {
          navigate("/login", { replace: true });
          return;
        }
                setProgressError("Não foi possível carregar o progresso.");
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, user]);

  useEffect(() => {
    let isMounted = true;
    if (!user) return;

    setBadgesLoading(true);
    fetchUserBadges()
      .then(({ earnedBadges, totalBadges: totalCount }) => {
        if (!isMounted) return;
        setBadges(earnedBadges);
        setTotalBadges(totalCount);
        setActiveBadgeId(null);
      })
      .catch((err: Error) => {
        if (!isMounted) return;
        if (err.message === "UNAUTHORIZED") {
          navigate("/login", { replace: true });
          return;
        }
                setBadgesError("Não foi possível carregar as badges.");
      })
      .finally(() => {
        if (isMounted) setBadgesLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [navigate, user]);

  if (isLoading) {
    return (
      <div className="profilePage">
        <div className="profileContainer">
          <p>Carregando perfil...</p>
        </div>
      </div>
    );
  }

  if (errorCode || !user) {
    if (errorCode) {
    }

    return (
      <div className="profilePage">
        <div className="profileContainer">
                    <p>Não foi possível carregar os dados do perfil.</p>
          <button
            className="btnYellow"
            type="button"
            onClick={() => navigate("/login")}
          >
            Ir para o login
          </button>
        </div>
      </div>
    );
  }

  const fullName = `${user.first_name} ${user.last_name}`;

  const clampPosition = (
    x: number,
    y: number,
    nextScale = scale,
    dims = imageDimensions
  ) => {
    if (!dims) return { x, y };
    const scaledWidth = dims.width * nextScale;
    const scaledHeight = dims.height * nextScale;
    const limitX = Math.max(0, (scaledWidth - PREVIEW_SIZE) / 2);
    const limitY = Math.max(0, (scaledHeight - PREVIEW_SIZE) / 2);
    return {
      x: Math.min(limitX, Math.max(-limitX, x)),
      y: Math.min(limitY, Math.max(-limitY, y)),
    };
  };

  const resetAvatarFlow = () => {
    setUploadError(null);
    setSaveError(null);
    setPreviewSrc(null);
    setPosition({ x: 0, y: 0 });
    setScale(1);
    setMinScale(1);
    setImageDimensions(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleChangeAvatar = () => {
    resetAvatarFlow();
    setIsAvatarModalOpen(true);
  };

  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type.toLowerCase())) {
      setUploadError("Formatos aceitos: JPG, JPEG, PNG ou WEBP.");
      return;
    }

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      setUploadError("A imagem deve ter no máximo 2MB.");
      return;
    }

    setUploadError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const image = new Image();
      image.onload = () => {
        const computedMinScale = Math.max(
          PREVIEW_SIZE / image.width,
          PREVIEW_SIZE / image.height
        );
        const initialScale = computedMinScale;
        setImageDimensions({ width: image.width, height: image.height });
        setMinScale(computedMinScale);
        setScale(initialScale);
        setPosition(
          clampPosition(0, 0, initialScale, {
            width: image.width,
            height: image.height,
          })
        );
        setPreviewSrc(result);
      };
      image.src = result;
    };

    reader.readAsDataURL(file);
  };

  const handleScaleChange = (value: number) => {
    if (!imageDimensions) return;
    const nextScale = Math.min(getMaxScale(), Math.max(minScale, value));
    const clamped = clampPosition(
      position.x,
      position.y,
      nextScale,
      imageDimensions
    );
    setScale(nextScale);
    setPosition(clamped);
  };

  const getPoint = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e) {
      const touch = e.touches[0] ?? e.changedTouches[0];
      return { x: touch?.clientX ?? 0, y: touch?.clientY ?? 0 };
    }
    return { x: e.clientX, y: e.clientY };
  };

  const handlePointerDown = (e: MouseEvent | TouchEvent) => {
    if (!previewSrc || isSaving) return;
    const point = getPoint(e);
    setDragState({ active: true, lastX: point.x, lastY: point.y });
  };

  const handlePointerMove = (e: MouseEvent | TouchEvent) => {
    if (!dragState.active || !imageDimensions) return;
    e.preventDefault();
    const point = getPoint(e);
    const deltaX = point.x - dragState.lastX;
    const deltaY = point.y - dragState.lastY;
    setDragState({ active: true, lastX: point.x, lastY: point.y });
    setPosition((prev) =>
      clampPosition(prev.x + deltaX, prev.y + deltaY, scale, imageDimensions)
    );
  };

  const handlePointerUp = () => {
    setDragState({ active: false, lastX: 0, lastY: 0 });
  };

  const handleCancelAvatar = () => {
    if (isSaving) return;
    resetAvatarFlow();
    setIsAvatarModalOpen(false);
  };

  const handleSaveAvatar = async () => {
    if (!previewSrc || !imageDimensions) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = new Image();
    image.onload = () => {
      const scaledWidth = imageDimensions.width * scale;
      const scaledHeight = imageDimensions.height * scale;
      const offsetX = PREVIEW_SIZE / 2 - scaledWidth / 2 + position.x;
      const offsetY = PREVIEW_SIZE / 2 - scaledHeight / 2 + position.y;
      const factor = OUTPUT_SIZE / PREVIEW_SIZE;

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.save();
      ctx.beginPath();
      ctx.arc(
        OUTPUT_SIZE / 2,
        OUTPUT_SIZE / 2,
        OUTPUT_SIZE / 2,
        0,
        Math.PI * 2
      );
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(
        image,
        offsetX * factor,
        offsetY * factor,
        scaledWidth * factor,
        scaledHeight * factor
      );
      ctx.restore();
      setIsSaving(true);
      setSaveError(null);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            setIsSaving(false);
            setSaveError("Não foi possível processar a imagem.");
            return;
          }

          (async () => {
            try {
              const uploadedUrl = await uploadAvatarToApi(blob);
              const resolvedUrl = normalizeAvatarUrl(uploadedUrl);
              setAvatarUrl(resolvedUrl);
              notifyUserDataUpdated();
              setIsAvatarModalOpen(false);
              resetAvatarFlow();
            } catch (err) {
              if ((err as Error).message === "UNAUTHORIZED") {
                navigate("/login", { replace: true });
                return;
              }
              setSaveError("Não foi possível enviar a foto. Tente novamente.");
            } finally {
              setIsSaving(false);
            }
          })();
        },
        "image/png"
      );
    };
    image.src = previewSrc;
  };

  const validateName = (value: string) => {
    const trimmed = value.trim();
    // Permite letras Unicode, espacos, hifen e apostrofo, com 2 a 100 caracteres
    const nameRegex = /^(?=.{2,100}$)[\p{L}][\p{L}' -]*$/u;

    if (!nameRegex.test(trimmed)) {
      return "Use um nome entre 2 e 100 caracteres, apenas letras, espaços, hífen ou apóstrofo.";
    }

    return null;
  };

  const handleOpenNameModal = () => {
    setNameInput(fullName);
    setNameError(null);
    setNameSuccess(null);
    setIsNameModalOpen(true);
  };

  const handleCancelName = () => {
    if (isSavingName) return;
    setIsNameModalOpen(false);
    setNameError(null);
    setNameSuccess(null);
  };

  const handleSaveName = async () => {
    const error = validateName(nameInput);
    if (error) {
      setNameError(error);
      return;
    }

    setIsSavingName(true);
    setNameError(null);
    setNameSuccess(null);

    try {
      const { first_name, last_name } = await updateUserNameApi(
        nameInput.trim()
      );
      setUser((prev) => (prev ? { ...prev, first_name, last_name } : prev));
      notifyUserDataUpdated();
      setNameSuccess("Nome atualizado com sucesso.");
      setIsNameModalOpen(false);
    } catch (err) {
      if ((err as Error).message === "UNAUTHORIZED") {
        navigate("/login", { replace: true });
        return;
      }
            setNameError("Não foi possível atualizar o nome. Tente novamente.");
    } finally {
      setIsSavingName(false);
    }
  };

  const progressLevelLabel = progress?.level ?? "-";
  const xpValue = progress?.xp ?? 0;
  const xpRemaining = progress?.xpToNext;
  const xpMax =
    xpRemaining === null
      ? 100
      : typeof xpRemaining === "number"
      ? xpValue + xpRemaining
      : 0;
  const xpPercent =
    xpRemaining === null ? 100 : xpMax > 0 ? (xpValue / xpMax) * 100 : 0;
  const badgeSimulation = parseBadgeSimulation();
  const displayBadges = badgeSimulation
    ? createSimulatedBadges(badges, badgeSimulation.earned)
    : badges;
  const earnedBadgesCount = displayBadges.length;
  const totalBadgesLabel =
    badgeSimulation?.total ??
    (totalBadges === null ? earnedBadgesCount : totalBadges);

  const badgeGroupsMap = new Map<string, BadgeGroup>();
  displayBadges.forEach((badge) => {
    const groupKey = getBadgeGroupKey(badge);
    const existing = badgeGroupsMap.get(groupKey);
    if (existing) {
      existing.items.push(badge);
      return;
    }
    badgeGroupsMap.set(groupKey, {
      id: groupKey,
      title: getBadgeGroupTitle(badge),
      gameName: badge.gameName ?? null,
      items: [badge],
    });
  });
  const badgeGroups = Array.from(badgeGroupsMap.values()).map((group) => ({
    ...group,
    items: sortBadgeItems(group.items),
  }));

  const activeBadge =
    activeBadgeId === null
      ? null
      : displayBadges.find(
          (badge) => String(badge.id) === String(activeBadgeId)
        ) ?? null;
  const activeBadgeGroupKey = activeBadge ? getBadgeGroupKey(activeBadge) : null;
  const activeBadgeRule = activeBadge ? getBadgeRule(activeBadge) : null;
  const activeBadgeDate = activeBadge
    ? formatBadgeDate(activeBadge.unlockedAt ?? undefined)
    : null;

  return (
    <>
      <div className="profilePage">
        <div className="profileContainer">
          <div className="pageHeader">
            <h1 className="pageTitle">Meu Perfil</h1>
          </div>

          <div className="centerWrapper">
            {/* Card Branco Central */}
            <div className="profileCard">
                            {/* Circulo do Avatar com icone SVG */}
              <div className="avatarPlaceholder">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={`Foto de ${fullName}`}
                    className="avatarImage"
                  />
                ) : (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    height="40"
                    width="40"
                    viewBox="0 0 448 512"
                    fill="currentColor"
                  >
                                        {/* path do icone de usuario (FontAwesome style) */}
                    <path d="M224 256A128 128 0 1 0 224 0a128 128 0 1 0 0 256zm-45.7 48C79.8 304 0 383.8 0 482.3C0 498.7 13.3 512 29.7 512H418.3c16.4 0 29.7-13.3 29.7-29.7C448 383.8 368.2 304 269.7 304H178.3z" />
                  </svg>
                )}
                <div className="avatarLevelBadge">
                  <span>Nível</span>
                  <strong>{progressLevelLabel}</strong>
                </div>
              </div>

              <div className="userDetails">
                <div className="infoRow infoRow--name">
                  <span className="infoLabel">Nome:</span>
                  <span className="infoValue">{fullName}</span>
                </div>
                <div className="infoRow infoRow--email">
                  <span className="infoLabel">E-mail:</span>
                  <span className="infoValue">{user.email}</span>
                </div>
              </div>

              <div className="levelCard" aria-label="Nível atual e progresso">
                <div className="levelHeader">
                  <span className="levelLabel">Nível</span>
                  <span className="levelPill">
                    {progress?.level ?? "Indefinido"}
                  </span>
                </div>
                <div className="xpInfo">
                  <span>{xpValue} XP</span>
                  <span>
                    Próximo nível:{" "}
                    {xpRemaining === null
                      ? "Nível máximo"
                      : xpRemaining !== undefined
                      ? `${xpRemaining} XP`
                      : "Indefinido"}
                  </span>
                </div>
                <div
                  className="xpBar"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={xpMax}
                  aria-valuenow={xpRemaining === null ? 100 : xpValue}
                  aria-label="Progresso para o próximo nível"
                >
                  <div
                    className="xpBarFill"
                    style={{
                      width: `${Math.min(
                        100,
                        xpPercent
                      )}%`,
                    }}
                  />
                </div>
                {progressError && (
                  <p className="uploadError">{progressError}</p>
                )}
              </div>

              <div className="actionButtons">
                <button
                  className="btnYellow"
                  type="button"
                  onClick={handleChangeAvatar}
                >
                  Trocar foto
                </button>
                <button
                  className="btnSecondary"
                  type="button"
                  onClick={handleOpenNameModal}
                >
                  Trocar nome
                </button>
              </div>
            </div>

            {/* --- NOVO CONTAINER DE BADGES --- */}
            <div className="badgesCard">
              <div className="badgesHeader">
                <div className="badgesIcon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 2h12a1 1 0 0 1 1 1v3a5 5 0 0 1-4 4.9V13l2 2v2H7v-2l2-2V10.9A5 5 0 0 1 5 6V3a1 1 0 0 1 1-1zm1 4a3 3 0 0 0 3 3h4a3 3 0 0 0 3-3V4H7v2zM9 21v-2h6v2H9z" />
                  </svg>
                </div>
                <h3 className="badgesTitle">Badges</h3>
              </div>

              {badgesLoading && (
                <p className="badgesLoading">Carregando badges...</p>
              )}

              {!badgesLoading &&
                badgeGroups.length === 0 &&
                !badgesError && (
                  <p className="badgesEmpty">
                    Nenhuma badge conquistada ainda.
                  </p>
                )}

              <div className="badgesBoard">
                {badgeGroups.map((group) => (
                  <div key={group.id} className="badgeOverviewItem">
                    <div className="badgeOverviewHeader">
                      <h4 className="badgeOverviewTitle">{group.title}</h4>
                      {group.gameName && (
                        <span className="badgeOverviewGame">
                          {group.gameName}
                        </span>
                      )}
                    </div>

                    <div className="badgeOverviewIcons">
                      {group.items.map((badge) => {
                        const isActive =
                          activeBadgeId !== null &&
                          String(activeBadgeId) === String(badge.id);
                        const fallbackIcon = getBadgeFallback(badge);
                        const detailId = getBadgeDetailId(badge.id);

                        return (
                          <button
                            key={badge.id}
                            type="button"
                            className={`badgeOverviewIconButton ${
                              isActive ? "is-active" : ""
                            }`}
                            onClick={() =>
                              setActiveBadgeId(isActive ? null : badge.id)
                            }
                            aria-expanded={isActive}
                            aria-controls={detailId}
                            aria-label={badge.name}
                          >
                            <span className="badgeOverviewIcon">
                              {badge.icon && isRemoteIcon(badge.icon) ? (
                                <img src={badge.icon} alt="" aria-hidden="true" />
                              ) : fallbackIcon ? (
                                <span aria-hidden="true">{fallbackIcon}</span>
                              ) : (
                                <svg viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2l2.1 4.8 5.2.5-3.9 3.3 1.2 5-4.6-2.6-4.6 2.6 1.2-5L4.7 7.3l5.2-.5L12 2z" />
                                </svg>
                              )}
                            </span>
                            {badge.tier ? (
                              <span className="badgeOverviewTier">
                                Tier {badge.tier}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>

                    {activeBadge &&
                      activeBadgeGroupKey === group.id && (
                        <div
                          id={getBadgeDetailId(activeBadge.id)}
                          className="badgeOverviewDetail"
                          role="region"
                          aria-label={`Detalhes da badge ${activeBadge.name}`}
                        >
                          <p className="badgeDetailTitle">
                            {activeBadge.name}
                          </p>
                          {activeBadgeRule && (
                            <p className="badgeDetailText">
                              {activeBadgeRule}
                            </p>
                          )}
                          {activeBadge.gameName && (
                            <p className="badgeDetailMeta">
                              Game: {activeBadge.gameName}
                            </p>
                          )}
                          <p className="badgeDetailMeta">
                            Conquistada em:{" "}
                            {activeBadgeDate ?? "Data não informada"}
                          </p>
                        </div>
                      )}
                  </div>
                ))}
              </div>

              {badgesError && <p className="uploadError">{badgesError}</p>}

              <div className="badgesFooter">
                <p className="badgesCount">
                  Badges Conquistadas{" "}
                  <span>
                    {earnedBadgesCount}/{totalBadgesLabel}
                  </span>
                </p>
              </div>
            </div>
            {/* --- FIM CONTAINER BADGES --- */}
          </div>

        </div>
      </div>

      {isAvatarModalOpen && (
        <div className="avatarModalOverlay">
          <div className="avatarModal">
            <div className="avatarModalHeader">
              <h3>Trocar foto</h3>
              <p>Selecione uma imagem (JPG, JPEG, PNG ou WEBP) de até 2MB.</p>
            </div>

            <div className="avatarModalBody">
              <div
                className={`avatarPreviewCircle ${
                  dragState.active ? "dragging" : ""
                } ${isSaving ? "disabled" : ""}`}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onMouseLeave={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              >
                {previewSrc ? (
                  <img
                    src={previewSrc}
                    alt="Pré-visualização do avatar"
                    className="avatarPreviewImage"
                    style={{
                      transform: `translate(-50%, -50%) translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    }}
                    draggable={false}
                  />
                ) : (
                  <div
                    className="avatarPreviewPlaceholder"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (isSaving) return;
                      fileInputRef.current?.click();
                    }}
                    onKeyDown={(e) => {
                      if (isSaving) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        fileInputRef.current?.click();
                      }
                    }}
                  >
                    Selecione uma imagem para visualizar
                  </div>
                )}
              </div>

              <div className="avatarControls">
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  ref={fileInputRef}
                  onChange={handleFileSelected}
                  hidden
                />
                <button
                  className="btnYellow"
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving}
                >
                  Selecionar imagem
                </button>

                {previewSrc && (
                  <div className="zoomControl">
                    <label htmlFor="zoomRange">Ajuste de zoom</label>
                    <input
                      id="zoomRange"
                      type="range"
                      min={minScale}
                      max={getMaxScale()}
                      step={0.01}
                      value={scale}
                      onChange={(e) =>
                        handleScaleChange(parseFloat(e.target.value))
                      }
                      disabled={isSaving}
                    />
                  </div>
                )}

                {uploadError && <p className="uploadError">{uploadError}</p>}
                {saveError && <p className="uploadError">{saveError}</p>}
              </div>
            </div>

            <div className="avatarModalActions">
              <button
                type="button"
                className="btnSecondary"
                onClick={handleCancelAvatar}
                disabled={isSaving}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btnYellow"
                onClick={handleSaveAvatar}
                disabled={!previewSrc || isSaving}
              >
                {isSaving ? "Salvando..." : "Salvar foto"}
                {isSaving && <span className="btnSpinner" aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
      )}
      {isNameModalOpen && (
        <div className="avatarModalOverlay">
          <div className="avatarModal">
            <div className="avatarModalHeader">
              <h3>Trocar nome</h3>
              <p>
                Informe seu nome completo. Apenas letras e espaços, mínimo 4
                caracteres.
              </p>
            </div>

            <div className="avatarModalBody nameModalBody">
              <div className="avatarControls nameControls">
                <label htmlFor="nameInput" className="inputLabel">
                  Nome completo
                </label>
                <input
                  id="nameInput"
                  type="text"
                  className="textField"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  disabled={isSavingName}
                  maxLength={80}
                  aria-invalid={!!nameError}
                />
                {nameError && <p className="uploadError">{nameError}</p>}
                {nameSuccess && <p className="successMessage">{nameSuccess}</p>}
              </div>
            </div>

            <div className="avatarModalActions">
              <button
                type="button"
                className="btnSecondary"
                onClick={handleCancelName}
                disabled={isSavingName}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btnYellow"
                onClick={handleSaveName}
                disabled={isSavingName}
              >
                {isSavingName ? "Salvando..." : "Salvar nome"}
                {isSavingName && (
                  <span className="btnSpinner" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}














