// Tipos para respostas do Dashboard API

export interface UsuariosAtivosResponse {
  usuarios_ativos_semana: number;
  usuarios_ativos_mes: number;
}

export interface TempoMedioResponse {
  tempo_medio_minutos: number;
  tempo_medio_horas: string;
}

export interface TaxaConclusaoResponse {
  taxa_conclusao: number;
}

export interface XpMedioResponse {
  xp_medio: number;
}

export interface MissoesConcluidasResponse {
  missoes_concluidas_semana: number;
  missoes_concluidas_mes: number;
  missoes_concluidas_ano: number;
}

export interface ColaboradorRanking {
  posicao: number;
  usuario_id: number;
  nome: string;
  email: string;
  xp_total: number;
  avatar_url?: string;
}

export interface RankingColaboradoresResponse {
  ranking: ColaboradorRanking[];
}

export interface TimeRanking {
  posicao: number;
  time_id: number;
  nome_time: string;
  xp_total: number;
  membros_count: number;
}

export interface RankingTimesResponse {
  ranking: TimeRanking[];
}

export interface DashboardData {
  usuariosAtivos: UsuariosAtivosResponse | null;
  tempoMedio: TempoMedioResponse | null;
  taxaConclusao: TaxaConclusaoResponse | null;
  xpMedio: XpMedioResponse | null;
  missoesCompletas: MissoesConcluidasResponse | null;
  rankingColaboradores: RankingColaboradoresResponse | null;
  rankingTimes: RankingTimesResponse | null;
}
