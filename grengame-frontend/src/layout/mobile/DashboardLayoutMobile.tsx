import { useCallback, useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import SidebarMobile from "../../components/mobile/SidebarMobile";
import TopbarMobile from "../../components/mobile/TopbarMobile";

export default function DashboardLayoutMobile() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen((previous) => !previous);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  useEffect(() => {
    closeSidebar();
  }, [location.pathname, closeSidebar]);

  return (
    <div className="relative min-h-dvh bg-gradient-to-b from-slate-100 to-slate-200 pb-[calc(env(safe-area-inset-bottom)+4rem)] lg:hidden">
      <SidebarMobile isOpen={isSidebarOpen} onClose={closeSidebar} />

      <TopbarMobile onToggleSidebar={toggleSidebar} isSidebarOpen={isSidebarOpen} />

      <main className="relative z-0 px-4 pb-10 pt-[calc(env(safe-area-inset-top)+9rem)] sm:px-6">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
