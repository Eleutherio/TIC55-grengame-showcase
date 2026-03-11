import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { hasValidToken } from "../utils/auth";

type GuardProps = {
  element: ReactElement;
};

export function PrivateGuard({ element }: GuardProps): ReactElement {
  if (!hasValidToken()) {
    return <Navigate to="/login" replace />;
  }
  return element;
}