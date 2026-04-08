import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { hasValidToken, isGlobalAdmin } from "../utils/auth";

type GuardProps = {
  element: ReactElement;
};

export function GlobalAdminGuard({ element }: GuardProps): ReactElement {
  if (!hasValidToken()) {
    return <Navigate to="/login" replace />;
  }

  if (!isGlobalAdmin()) {
    return <Navigate to="/app/cursos" replace />;
  }

  return element;
}
