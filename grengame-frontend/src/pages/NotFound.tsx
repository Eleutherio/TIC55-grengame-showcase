import { Link } from "react-router-dom";
import { hasValidToken } from "../utils/auth";

export default function NotFound() {
  const isAuthenticated = hasValidToken();

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-slate-50 px-4">
      <div className="text-center">
        <h1 className="text-9xl font-bold text-azul-forte" aria-label="Erro 404: Página não encontrada!">404</h1>
        <h2 className="mt-4 text-2xl font-semibold text-slate-800">Página não encontrada</h2>
        <p className="mt-2 text-slate-600">
          A página que você está procurando não existe ou foi removida.
        </p>
        <div className="mt-8 flex gap-4 justify-center">
          {isAuthenticated ? (
            <>
              <Link
                to="/"
                className="rounded-lg bg-azul-forte px-6 py-3 text-white transition hover:bg-azul-forte/90 focus:outline-none focus:ring-2 focus:ring-azul-forte/70"
              >
                Voltar ao Início
              </Link>
              <Link
                to="/app/cursos"
                className="rounded-lg border border-azul-forte px-6 py-3 text-azul-forte transition hover:bg-azul-forte/5 focus:outline-none focus:ring-2 focus:ring-azul-forte/70"
              >
                Ver Games
              </Link>
            </>
          ) : (
            <Link
              to="/login"
              className="rounded-lg bg-azul-forte px-6 py-3 text-white transition hover:bg-azul-forte/90 focus:outline-none focus:ring-2 focus:ring-azul-forte/70"
            >
              Fazer Login
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
