import { useEffect, useState } from "react";
import { Users, Clock, Target, Award, TrendingUp } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import DashboardCard from "../components/DashboardCard";
import { dashboardService, DashboardServiceError } from "../services/dashboardService";
import type { DashboardData } from "../types/dashboard";
import "./Dashboard.css";

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    usuariosAtivos: null,
    tempoMedio: null,
    taxaConclusao: null,
    xpMedio: null,
    missoesCompletas: null,
    rankingColaboradores: null,
    rankingTimes: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [usuariosPeriod, setUsuariosPeriod] = useState<"semana" | "mes">("semana");
  const [selectedPeriod, setSelectedPeriod] = useState<"semana" | "mes" | "ano">("semana");

  // Componente customizado para labels do XAxis com quebra de linha
  const CustomXAxisTick = (props: any) => {
    const { x, y, payload } = props;
    const lines = payload.value.split('\n');
    
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={10}
          textAnchor="middle"
          fill="#666"
          fontSize={12}
        >
          {lines.map((line: string, index: number) => (
            <tspan key={index} x={0} dy={index === 0 ? 0 : 14}>
              {line}
            </tspan>
          ))}
        </text>
      </g>
    );
  };

  // Configuração do gráfico de missões
  const chartConfig = {
    missoes: {
      label: "Missões",
      color: "#18217b",
    },
  } satisfies ChartConfig;

  // Configuração do gráfico de ranking
  const rankingChartConfig = {
    xp: {
      label: "XP Total",
      color: "#18217b",
    },
  } satisfies ChartConfig;

  // Dados do ranking vindos da API (com cores para medalhas)
  const rankingData = dashboardData.rankingColaboradores?.ranking.map((item, index) => {
    let fill = "#18217b"; // Cor padrão
    if (index === 0) fill = "#FFD700"; // 🥇 Ouro
    else if (index === 1) fill = "#C0C0C0"; // 🥈 Prata
    else if (index === 2) fill = "#CD7F32"; // 🥉 Bronze
    
    return {
      nome: item.nome,
      xp: item.xp_total,
      fill,
    };
  }) || [];

  // Datas para os labels do gráfico
  const hoje = new Date();
  const formatarData = (data: Date) => {
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };
  const anoAtual = hoje.getFullYear();

  // Calcular os últimos 7 dias (para gráfico de semana)
  const seisDiasAtras = new Date(hoje);
  seisDiasAtras.setDate(hoje.getDate() - 6);

  // Calcular domingo da última semana completa (não incluir a semana atual)
  const diaDaSemana = hoje.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diasAteDomingoAnterior = diaDaSemana === 0 ? -7 : -(diaDaSemana);
  const ultimoDomingoCompleto = new Date(hoje);
  ultimoDomingoCompleto.setDate(hoje.getDate() + diasAteDomingoAnterior);

  // Calcular datas das últimas 4 semanas completas (seg a dom)
  const calcularSemanasDoMes = () => {
    const semanas = [];
    for (let i = 3; i >= 0; i--) {
      const domingoSemana = new Date(ultimoDomingoCompleto);
      domingoSemana.setDate(ultimoDomingoCompleto.getDate() - (i * 7));
      const segundaSemana = new Date(domingoSemana);
      segundaSemana.setDate(domingoSemana.getDate() - 6);
      
      semanas.push({
        label: `Sem ${4 - i}\n${formatarData(segundaSemana)} - ${formatarData(domingoSemana)}`,
        missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_mes || 0) * [0.22, 0.26, 0.24, 0.28][3 - i]),
      });
    }
    return semanas;
  };

  // Calcular os últimos 7 dias com os nomes corretos
  const calcularUltimos7Dias = () => {
    const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const percentuais = [0.12, 0.18, 0.14, 0.16, 0.15, 0.13, 0.12];
    const dias = [];
    
    for (let i = 6; i >= 0; i--) {
      const data = new Date(hoje);
      data.setDate(hoje.getDate() - i);
      const nomeDia = diasSemana[data.getDay()];
      
      dias.push({
        label: nomeDia,
        missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_semana || 0) * percentuais[6 - i]),
      });
    }
    
    return dias;
  };

  // Dados detalhados por período
  const periodData = {
    semana: calcularUltimos7Dias(),
    mes: calcularSemanasDoMes(),
    ano: [
      { label: 'Jan', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.095) },
      { label: 'Fev', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.078) },
      { label: 'Mar', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.088) },
      { label: 'Abr', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.082) },
      { label: 'Mai', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.091) },
      { label: 'Jun', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.085) },
      { label: 'Jul', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.089) },
      { label: 'Ago', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.093) },
      { label: 'Set', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.086) },
      { label: 'Out', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.090) },
      { label: 'Nov', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.084) },
      { label: 'Dez', missoes: Math.floor((dashboardData.missoesCompletas?.missoes_concluidas_ano || 0) * 0.076) },
    ],
  };

  const chartData = periodData[selectedPeriod];
  
  // Descrição do período selecionado
  const getPeriodDescription = () => {
    if (selectedPeriod === 'semana') {
      return `${formatarData(seisDiasAtras)} - ${formatarData(hoje)}`;
    } else if (selectedPeriod === 'mes') {
      // Calcular período das 4 semanas completas
      const primeiraSegunda = new Date(ultimoDomingoCompleto);
      primeiraSegunda.setDate(ultimoDomingoCompleto.getDate() - 27); // 4 semanas = 28 dias - 1
      return `${formatarData(primeiraSegunda)} - ${formatarData(ultimoDomingoCompleto)}`;
    } else {
      return `Ano ${anoAtual}`;
    }
  };

  useEffect(() => {
    const loadDashboardData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const data = await dashboardService.getAllDashboardData();

        // Verifica se houve erro 403 (acesso negado)
        if (data.errors && data.errors.length > 0) {
          const forbiddenError = data.errors.find(
            (err) => err instanceof DashboardServiceError && err.statusCode === 403
          );

          if (forbiddenError) {
            window.location.href = "/app";
            return;
          }
        }

        setDashboardData(data as DashboardData);
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
        if (error instanceof DashboardServiceError && error.statusCode === 403) {
          window.location.href = "/app";
          return;
        }
        setError("Erro ao carregar dados do dashboard. Tente novamente.");
      } finally {
        setIsLoading(false);
      }
    };

    loadDashboardData();

    // Atualização automática a cada 5 minutos
    const interval = setInterval(loadDashboardData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Formatação de números
  const formatNumber = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return "0";
    return new Intl.NumberFormat("pt-BR").format(num);
  };

  const formatPercentage = (num: number | null | undefined): string => {
    if (num === null || num === undefined) return "0%";
    return `${num.toFixed(1)}%`;
  };

  return (
    <div className="dashboard-container">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-title">Dashboard Administrativo</h1>
          <p className="dashboard-subtitle">
            Visão geral de métricas e indicadores da plataforma
          </p>
        </div>
      </header>

      {error && (
        <div className="dashboard-error">
          <p className="dashboard-error-title">⚠️ {error}</p>
          <button
            className="dashboard-retry-btn"
            onClick={() => window.location.reload()}
          >
            Tentar novamente
          </button>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="dashboard-card">
          <div className="dashboard-card-header">
            <div
              className="dashboard-card-icon"
              style={{ background: "#10b981" }}
              aria-hidden="true"
            >
              <Users size={24} strokeWidth={2.5} />
            </div>
            <div className="dashboard-card-title-wrapper">
              <h3 className="dashboard-card-title">Usuários Ativos</h3>
            </div>
          </div>
          <div className="dashboard-card-body">
            {isLoading ? (
              <>
                <div className="skeleton skeleton-text skeleton-value" />
                <div className="skeleton skeleton-text" style={{ width: "80%" }} />
              </>
            ) : (
              <>
                <p className="dashboard-card-value">
                  {formatNumber(
                    usuariosPeriod === "semana"
                      ? dashboardData.usuariosAtivos?.usuarios_ativos_semana
                      : dashboardData.usuariosAtivos?.usuarios_ativos_mes
                  )}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => setUsuariosPeriod("semana")}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      usuariosPeriod === "semana"
                        ? "bg-[#10b981] text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Semana
                  </button>
                  <button
                    onClick={() => setUsuariosPeriod("mes")}
                    className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
                      usuariosPeriod === "mes"
                        ? "bg-[#10b981] text-white"
                        : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                    }`}
                  >
                    Mês
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <DashboardCard
          title="Tempo Médio"
          value={dashboardData.tempoMedio?.tempo_medio_horas || "0h"}
          icon={Clock}
          color="#3b82f6"
          subtitle="Tempo de uso"
          isLoading={isLoading}
        />

        <DashboardCard
          title="Taxa de Conclusão"
          value={formatPercentage(dashboardData.taxaConclusao?.taxa_conclusao)}
          icon={Target}
          color="#f59e0b"
          subtitle="Games concluídos"
          isLoading={isLoading}
        />

        <DashboardCard
          title="XP Médio"
          value={formatNumber(dashboardData.xpMedio?.xp_medio)}
          icon={Award}
          color="#8b5cf6"
          subtitle="Por usuário"
          isLoading={isLoading}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Missões Concluídas</CardTitle>
              <CardDescription>
                {selectedPeriod === "semana" && "Missões da última semana"}
                {selectedPeriod === "mes" && "Missões do último mês"}
                {selectedPeriod === "ano" && "Missões do ano"}
                {" - "}
                {getPeriodDescription()}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelectedPeriod("semana")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedPeriod === "semana"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Semana
              </button>
              <button
                onClick={() => setSelectedPeriod("mes")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedPeriod === "mes"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Mês
              </button>
              <button
                onClick={() => setSelectedPeriod("ano")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedPeriod === "ano"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                Ano
              </button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] w-full animate-pulse rounded-lg bg-muted" />
          ) : (
            <ChartContainer config={chartConfig} className="h-[350px] w-full">
              <BarChart
                accessibilityLayer
                data={chartData}
                margin={{ top: 20, bottom: selectedPeriod === 'mes' ? 60 : 50 }}
              >
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  tick={selectedPeriod === 'mes' ? <CustomXAxisTick /> : undefined}
                />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Bar dataKey="missoes" fill="var(--color-missoes)" radius={8} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
        <CardFooter className="flex-col items-start gap-2 text-sm">
          <div className="flex gap-2 font-medium leading-none">
            Total de {chartData.reduce((acc, item) => acc + item.missoes, 0)} missões
            <TrendingUp className="h-4 w-4" />
          </div>
          <div className="leading-none text-muted-foreground">
            Exibindo missões concluídas no período selecionado
          </div>
        </CardFooter>
      </Card>

      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Top 10 Colaboradores</CardTitle>
          <CardDescription>Ranking dos colaboradores com maior XP</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[400px] w-full animate-pulse rounded-lg bg-muted" />
          ) : (
            <ChartContainer config={rankingChartConfig} className="h-[400px] w-full">
              <BarChart
                accessibilityLayer
                data={rankingData}
                layout="vertical"
                margin={{ left: 100 }}
              >
                <YAxis
                  dataKey="nome"
                  type="category"
                  tickLine={false}
                  tickMargin={10}
                  axisLine={false}
                  width={90}
                  tick={{ fontSize: 12 }}
                />
                <XAxis dataKey="xp" type="number" hide />
                <ChartTooltip
                  cursor={false}
                  content={<ChartTooltipContent hideLabel />}
                />
                <Bar dataKey="xp" layout="vertical" radius={5} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      <section className="dashboard-section mt-8">
        <h2 className="dashboard-section-title">Ranking de Times</h2>
        <div style={{ textAlign: "center", padding: "2rem", opacity: 0.7 }}>
          <p>🚧 Em breve</p>
          <p style={{ fontSize: "0.9rem", marginTop: "0.5rem" }}>
            Funcionalidade em desenvolvimento
          </p>
        </div>
      </section>
    </div>
  );
}
