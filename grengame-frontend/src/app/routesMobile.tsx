import { Navigate, createBrowserRouter } from "react-router-dom";
import { withAdminGuard, withPrivateGuard } from "../lib/guards";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { withSuspense } from "../lib/withSuspense";

const DashboardLayoutMobile = lazyWithRetry(() => import("../layout/mobile/DashboardLayoutMobile"));
const PaginaInicial = lazyWithRetry(() => import("../pages/PaginaInicial"));
const ListarCursos = lazyWithRetry(() => import("../pages/ListarCursos"));
const Ranking = lazyWithRetry(() => import("../pages/Ranking"));
const Perfil = lazyWithRetry(() => import("../pages/Perfil"));
const Progresso = lazyWithRetry(() => import("../pages/Progresso"));
const Dashboard = lazyWithRetry(() => import("../pages/Dashboard"));
const AdministrarUsuarios = lazyWithRetry(() => import("../pages/AdministrarUsuarios"));
const AdministrarGames = lazyWithRetry(() => import("../pages/AdministrarGames"));
const AdministrarMissoes = lazyWithRetry(() => import("../pages/AdministrarMissoes"));
const AdministrarBadges = lazyWithRetry(() => import("../pages/AdministrarBadges"));
const Login = lazyWithRetry(() => import("../pages/Login"));
const RecuperarSenha = lazyWithRetry(
  () => import("../pages/RecuperarSenha/RecuperarSenha")
);
const NovaSenha = lazyWithRetry(() => import("../pages/RecuperarSenha/NovaSenha"));
const NotFound = lazyWithRetry(() => import("../pages/NotFound"));
const Trilhas = lazyWithRetry(() => import("../pages/Trilhas"));
const Missao = lazyWithRetry(() => import("../pages/Missao"));
const AcessoTemporario = lazyWithRetry(() => import("../pages/AcessoTemporario"));

export const routerMobile = createBrowserRouter([
  { path: "/login", element: withSuspense(<Login />) },
  { path: "/recuperar-senha", element: withSuspense(<RecuperarSenha />) },
  { path: "/nova-senha", element: withSuspense(<NovaSenha />) },
  { path: "/acesso-temporario", element: withSuspense(<AcessoTemporario />) },

  {
    path: "/",
    element: withSuspense(withPrivateGuard(<PaginaInicial />)),
    handle: { breadcrumb: "Menu Inicial" }
  },

  {
    path: "/app",
    element: withSuspense(withPrivateGuard(<DashboardLayoutMobile />)),
    handle: { breadcrumb: { label: "Menu Inicial", to: "/" } },
    children: [
      { index: true, element: <Navigate to="cursos" replace /> },
      { path: "trilhas/:gameId", element: withSuspense(<Trilhas />), handle: { breadcrumb: "Trilhas" } },
      { path: "missao/:missionId", element: withSuspense(<Missao />), handle: { breadcrumb: "Missão" } },
      { path: "cursos", element: withSuspense(<ListarCursos />), handle: { breadcrumb: "Games" } },
      { path: "ranking", element: withSuspense(<Ranking />), handle: { breadcrumb: "Ranking" } },
      { path: "perfil", element: withSuspense(<Perfil />), handle: { breadcrumb: "Meu Perfil" } },
      { path: "progresso", element: withSuspense(<Progresso />), handle: { breadcrumb: "Meu Progresso" } },

      {
        path: "Dashboard",
        element: withSuspense(withAdminGuard(<Dashboard />)),
        handle: { breadcrumb: "Dashboard" },
      },
      {
        path: "AdministrarUsuarios",
        element: withSuspense(withAdminGuard(<AdministrarUsuarios />)),
        handle: { breadcrumb: "Administrar Usuários" },
      },
      {
        path: "AdministrarGames",
        element: withSuspense(withAdminGuard(<AdministrarGames />)),
        handle: { breadcrumb: "Administrar Games" },
      },
      {
        path: "AdministrarMissoes",
        element: withSuspense(withAdminGuard(<AdministrarMissoes />)),
        handle: { breadcrumb: "Administrar Missões" },
      },
      {
        path: "AdministrarBadges",
        element: withSuspense(withAdminGuard(<AdministrarBadges />)),
        handle: { breadcrumb: "Configurar Badges" },
      },
    ],
  },

  { path: "*", element: withSuspense(<NotFound />) },
]);
