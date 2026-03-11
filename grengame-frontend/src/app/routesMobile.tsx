import { lazy } from "react";
import { Navigate, createBrowserRouter } from "react-router-dom";
import { withAdminGuard, withPrivateGuard } from "../lib/guards";
import { withSuspense } from "../lib/withSuspense";

const DashboardLayoutMobile = lazy(() => import("../layout/mobile/DashboardLayoutMobile"));
const PaginaInicial = lazy(() => import("../pages/PaginaInicial"));
const ListarCursos = lazy(() => import("../pages/ListarCursos"));
const Ranking = lazy(() => import("../pages/Ranking"));
const Perfil = lazy(() => import("../pages/Perfil"));
const Progresso = lazy(() => import("../pages/Progresso"));
const Dashboard = lazy(() => import("../pages/Dashboard"));
const AdministrarUsuarios = lazy(() => import("../pages/AdministrarUsuarios"));
const AdministrarGames = lazy(() => import("../pages/AdministrarGames"));
const AdministrarMissoes = lazy(() => import("../pages/AdministrarMissoes"));
const AdministrarBadges = lazy(() => import("../pages/AdministrarBadges"));
const Login = lazy(() => import("../pages/Login"));
const RecuperarSenha = lazy(
  () => import("../pages/RecuperarSenha/RecuperarSenha")
);
const NovaSenha = lazy(() => import("../pages/RecuperarSenha/NovaSenha"));
const NotFound = lazy(() => import("../pages/NotFound"));
const Trilhas = lazy(() => import("../pages/Trilhas"));
const Missao = lazy(() => import("../pages/Missao"));

export const routerMobile = createBrowserRouter([
  { path: "/login", element: withSuspense(<Login />) },
  { path: "/recuperar-senha", element: withSuspense(<RecuperarSenha />) },
  { path: "/nova-senha", element: withSuspense(<NovaSenha />) },

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
