import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { hasValidToken, isAdmin } from "../utils/auth";

type GuardProps = {
  element: ReactElement;
};

export function AdminGuard({ element }: GuardProps): ReactElement {
  if (!hasValidToken()) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin()) {
    return <Navigate to="/app/cursos" replace />;
  }

  return element;
}