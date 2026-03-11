import type { ReactElement } from "react";
import { PrivateGuard } from "./PrivateGuard";
import { AdminGuard } from "./AdminGuard";

// Avaliam o token no momento do render, evitando captura de estado inicial sem login.
export function withPrivateGuard(element: ReactElement): ReactElement {
  return <PrivateGuard element={element} />;
}

export function withAdminGuard(element: ReactElement): ReactElement {
  return <AdminGuard element={element} />;
}
