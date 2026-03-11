import { type ReactElement, useMemo } from "react";
import { RouterProvider } from "react-router-dom";
import { router } from "./routes";
import { routerMobile } from "./routesMobile";
import { useResponsiveViewport } from "../hooks/useResponsiveViewport";

type ResponsiveRouterMobileProps = {
  fallback?: ReactElement;
};
export default function ResponsiveRouterMobile({ fallback }: ResponsiveRouterMobileProps) {
  const isMobile = useResponsiveViewport();
  const selectedRouter = useMemo(() => (isMobile ? routerMobile : router), [isMobile]);

  if (fallback && typeof window === "undefined") {
    return fallback;
  }

  return <RouterProvider router={selectedRouter} />;
}
