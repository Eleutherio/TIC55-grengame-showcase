// Tipos de roles disponíveis no sistema (mock)
export type MockRole = "admin" | "user";

// Dados do usuário logado (mock)
type MockUser = {
  name: string;
  email: string;
  displayName: string;
};

// Estatísticas do usuário (mock)
type MockStats = {
  points: number;
  rankingLevel: string;
  rankingProgress: string;
};

// TODO: substituir por dados reais do backend quando a autenticação estiver pronta.
export type MockSession = {
  user: MockUser;
  stats: MockStats;
  role: MockRole;
};

export const mockSession: MockSession = {
  user: {
    name: "João da Silva",
    email: "joao.silva@gmail.com",
    displayName: "João da Silva",
  },
  stats: {
    points: 120,
    rankingLevel: "Bronze",
    rankingProgress: "63% para Prata",
  },
  role: "admin", // altere para "admin" para testar a interface de administrador
};

export const isMockAdmin = (): boolean => mockSession.role === "admin";

// Navegação baseada em roles (mock)
export type MockNavItem = {
  label: string;
  to: string;
  exact?: boolean;
};

export const getVisibleNavItems = (): MockNavItem[] => {
  const userRole = mockSession.role;

  if (userRole === "admin") {
    return [
      { label: "Administrar Usuários", to: "/app/AdministrarUsuarios" },
      { label: "Administrar Games", to: "/app/AdministrarGames" },
      { label: "Administrar Missões", to: "/app/AdministrarMissoes" },
      { label: "Todos os Games", to: "/app/cursos" },
      { label: "Dashboard", to: "/app/Dashboard" },
      { label: "Ranking", to: "/app/ranking" },
      { label: "Meu Perfil", to: "/app/perfil" },
      { label: "Meu Progresso", to: "/app/progresso" },
    ];
  }

  return [
    { label: "Menu Inicial", to: "/", exact: true },
    { label: "Jogos", to: "/app/cursos" },
    { label: "Meu Progresso", to: "/app/progresso" },
    { label: "Ranking", to: "/app/ranking" },
    { label: "Meu Perfil", to: "/app/perfil" },
  ];
};

