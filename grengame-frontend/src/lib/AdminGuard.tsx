import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { canAccessAdminConsole, hasValidToken } from "../utils/auth";

type GuardProps = {
  element: ReactElement;
};

export function AdminGuard({ element }: GuardProps): ReactElement {
  if (!hasValidToken()) {
    return <Navigate to="/login" replace />;
  }

  if (!canAccessAdminConsole()) {
    return <Navigate to="/app/cursos" replace />;
  }

  return element;
}
