import { Suspense, type ReactElement } from "react";

const defaultFallback = (
  <div className="flex min-h-[200px] items-center justify-center text-sm text-slate-500">Carregando...</div>
);

export function withSuspense(element: ReactElement, fallback: ReactElement = defaultFallback): ReactElement {
  return <Suspense fallback={fallback}>{element}</Suspense>;
}
