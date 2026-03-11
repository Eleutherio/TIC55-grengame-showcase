import type {
  UsuariosAtivosResponse,
  TempoMedioResponse,
  TaxaConclusaoResponse,
  XpMedioResponse,
  MissoesConcluidasResponse,
  RankingColaboradoresResponse,
  RankingTimesResponse,
} from "../types/dashboard";
import { API_URL } from "../config/api";

const ACCESS_TOKEN_KEY = "accessToken";

class DashboardServiceError extends Error {
  statusCode?: number;
  endpoint?: string;

  constructor(message: string, statusCode?: number, endpoint?: string) {
    super(message);
    this.name = "DashboardServiceError";
    this.statusCode = statusCode;
    this.endpoint = endpoint;
  }
}

async function fetchWithAuth<T>(endpoint: string): Promise<T> {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  if (!token) {
    throw new DashboardServiceError(
      "Token de autenticação não encontrado",
      401,
      endpoint
    );
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      throw new DashboardServiceError(
        "Sessão expirada. Faça login novamente.",
        401,
        endpoint
      );
    }

    if (response.status === 403) {
      throw new DashboardServiceError(
        "Acesso negado. Apenas administradores podem acessar o dashboard.",
        403,
        endpoint
      );
    }

    if (!response.ok) {
      throw new DashboardServiceError(
        `Erro ao buscar dados: ${response.statusText}`,
        response.status,
        endpoint
      );
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof DashboardServiceError) {
      throw error;
    }

    // Erro de rede ou outro erro não tratado
    throw new DashboardServiceError(
      `Erro de conexão: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
      undefined,
      endpoint
    );
  }
}

export const dashboardService = {
  async getUsuariosAtivos(): Promise<UsuariosAtivosResponse> {
    return fetchWithAuth<UsuariosAtivosResponse>(
      "/auth/dashboard/usuarios-ativos/"
    );
  },

  async getTempoMedio(): Promise<TempoMedioResponse> {
    return fetchWithAuth<TempoMedioResponse>("/auth/dashboard/tempo-medio/");
  },

  async getTaxaConclusao(): Promise<TaxaConclusaoResponse> {
    return fetchWithAuth<TaxaConclusaoResponse>(
      "/auth/dashboard/taxa-conclusao/"
    );
  },

  async getXpMedio(): Promise<XpMedioResponse> {
    return fetchWithAuth<XpMedioResponse>("/auth/dashboard/xp-medio/");
  },

  async getMissoesCompletas(): Promise<MissoesConcluidasResponse> {
    return fetchWithAuth<MissoesConcluidasResponse>(
      "/auth/dashboard/missoes-concluidas/"
    );
  },

  async getRankingColaboradores(): Promise<RankingColaboradoresResponse> {
    return fetchWithAuth<RankingColaboradoresResponse>(
      "/auth/dashboard/ranking-colaboradores/"
    );
  },

  async getRankingTimes(): Promise<RankingTimesResponse> {
    return fetchWithAuth<RankingTimesResponse>(
      "/auth/dashboard/ranking-times/"
    );
  },

  async getAllDashboardData() {
    const [
      usuariosAtivos,
      tempoMedio,
      taxaConclusao,
      xpMedio,
      missoesCompletas,
      rankingColaboradores,
      rankingTimes,
    ] = await Promise.allSettled([
      this.getUsuariosAtivos(),
      this.getTempoMedio(),
      this.getTaxaConclusao(),
      this.getXpMedio(),
      this.getMissoesCompletas(),
      this.getRankingColaboradores(),
      this.getRankingTimes(),
    ]);

    return {
      usuariosAtivos:
        usuariosAtivos.status === "fulfilled" ? usuariosAtivos.value : null,
      tempoMedio: tempoMedio.status === "fulfilled" ? tempoMedio.value : null,
      taxaConclusao:
        taxaConclusao.status === "fulfilled" ? taxaConclusao.value : null,
      xpMedio: xpMedio.status === "fulfilled" ? xpMedio.value : null,
      missoesCompletas:
        missoesCompletas.status === "fulfilled" ? missoesCompletas.value : null,
      rankingColaboradores:
        rankingColaboradores.status === "fulfilled"
          ? rankingColaboradores.value
          : null,
      rankingTimes:
        rankingTimes.status === "fulfilled" ? rankingTimes.value : null,
      errors: [
        usuariosAtivos.status === "rejected" ? usuariosAtivos.reason : null,
        tempoMedio.status === "rejected" ? tempoMedio.reason : null,
        taxaConclusao.status === "rejected" ? taxaConclusao.reason : null,
        xpMedio.status === "rejected" ? xpMedio.reason : null,
        missoesCompletas.status === "rejected" ? missoesCompletas.reason : null,
        rankingColaboradores.status === "rejected"
          ? rankingColaboradores.reason
          : null,
        rankingTimes.status === "rejected" ? rankingTimes.reason : null,
      ].filter(Boolean),
    };
  },
};

export { DashboardServiceError };
