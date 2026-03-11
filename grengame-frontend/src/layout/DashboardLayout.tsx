import { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";

export default function DashboardLayout() {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const handleCollapseSidebar = () => setIsSidebarCollapsed(true);
  const handleExpandSidebar = () => setIsSidebarCollapsed(false);

  return (
    <div className="min-h-dvh flex">
      <div className="relative sticky top-0 z-30 flex-shrink-0 h-dvh">
        <div
          className={`relative h-full transition-[width] duration-300 ${
            isSidebarCollapsed ? "w-0" : "w-64"
          }`}
        >
          <Sidebar
            collapsed={isSidebarCollapsed}
            onCollapse={handleCollapseSidebar}
          />
        </div>
      </div>
      <div className="flex min-h-dvh flex-1 flex-col">
        <div className="sticky top-0 z-20">
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={handleExpandSidebar}
              aria-label="Expandir menu lateral"
              className="group fixed bottom-6 left-0 z-20 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-roxo-forte text-white shadow-[0_18px_35px_rgba(15,23,42,0.35)] transition hover:bg-roxo-forte/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 transition-transform duration-200 group-hover:scale-110"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10 6l6 6-6 6" />
              </svg>
            </button>
          )}
          <Topbar />
        </div>
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
