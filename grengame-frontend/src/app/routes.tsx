import { lazy } from "react";
import { createBrowserRouter, Navigate } from "react-router-dom";
import { withAdminGuard, withPrivateGuard } from "../lib/guards";
import { withSuspense } from "../lib/withSuspense";

const DashboardLayout = lazy(() => import("../layout/DashboardLayout"));
const Login = lazy(() => import("../pages/Login"));
const ListarCursos = lazy(() => import("../pages/ListarCursos"));
const Ranking = lazy(() => import("../pages/Ranking"));
const Perfil = lazy(() => import("../pages/Perfil"));
const Progresso = lazy(() => import("../pages/Progresso"));
const PaginaInicial = lazy(() => import("../pages/PaginaInicial"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const AdministrarUsuarios = lazy(() => import("../pages/AdministrarUsuarios"));
const NotFound = lazy(() => import("../pages/NotFound"));
const RecuperarSenha = lazy(
  () => import("../pages/RecuperarSenha/RecuperarSenha")
);
const NovaSenha = lazy(() => import("../pages/RecuperarSenha/NovaSenha"));
const AdministrarGames = lazy(() => import("../pages/AdministrarGames"));
const AdministrarMissoes = lazy(() => import("../pages/AdministrarMissoes"));
const AdministrarBadges = lazy(() => import("../pages/AdministrarBadges"));
const Trilhas = lazy(() => import("../pages/Trilhas"));
const Missao = lazy(() => import("../pages/Missao"));
const AcessoTemporario = lazy(() => import("../pages/AcessoTemporario"));

export const router = createBrowserRouter([
  // Rota pública - Login
  { path: "/login", element: withSuspense(<Login />) },
  { path: "/recuperar-senha", element: withSuspense(<RecuperarSenha />) },
  { path: "/nova-senha", element: withSuspense(<NovaSenha />) },
  { path: "/acesso-temporario", element: withSuspense(<AcessoTemporario />) },

  // Rota protegida - Página inicial (Menu Inicial) - requer autenticação
  {
    path: "/",
    element: withSuspense(withPrivateGuard(<PaginaInicial />)),
    handle: { breadcrumb: "Menu Inicial" },
  },

  // Rotas privadas - Requer autenticação
  {
    path: "/app",
    element: withSuspense(withPrivateGuard(<DashboardLayout />)),
    handle: { breadcrumb: { label: "Menu Inicial", to: "/" } },
    children: [
      { index: true, element: <Navigate to="cursos" replace /> },
      {
        path: "trilhas/:gameId",
        element: withSuspense(<Trilhas />),
        handle: { breadcrumb: "Trilhas" },
      },
      {
        path: "missao/:missionId",
        element: withSuspense(<Missao />),
        handle: { breadcrumb: "Missão" },
      },
      {
        path: "cursos",
        element: withSuspense(<ListarCursos />),
        handle: { breadcrumb: "Games" },
      },
      {
        path: "ranking",
        element: withSuspense(<Ranking />),
        handle: { breadcrumb: "Ranking" },
      },
      {
        path: "perfil",
        element: withSuspense(<Perfil />),
        handle: { breadcrumb: "Meu Perfil" },
      },
      {
        path: "progresso",
        element: withSuspense(<Progresso />),
        handle: { breadcrumb: "Meu Progresso" },
      },

      // Rotas administrativas - Requer role admin
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

  // Página 404 - Qualquer rota não encontrada
  { path: "*", element: withSuspense(<NotFound />) },
]);
