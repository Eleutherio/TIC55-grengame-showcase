import type { Icon } from "lucide-react";
import "./DashboardCard.css";

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: Icon;
  color?: string;
  subtitle?: string;
  isLoading?: boolean;
}

export default function DashboardCard({
  title,
  value,
  icon: Icon,
  color = "#667eea",
  subtitle,
  isLoading = false,
}: DashboardCardProps) {
  if (isLoading) {
    return (
      <div className="dashboard-card">
        <div className="dashboard-card-header">
          <div className="dashboard-card-icon skeleton" style={{ background: color }} />
          <div className="dashboard-card-title-wrapper">
            <div className="skeleton skeleton-text" style={{ width: "60%" }} />
          </div>
        </div>
        <div className="dashboard-card-body">
          <div className="skeleton skeleton-text skeleton-value" />
          {subtitle && <div className="skeleton skeleton-text" style={{ width: "80%" }} />}
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="dashboard-card-header">
        <div
          className="dashboard-card-icon"
          style={{ background: color }}
          aria-hidden="true"
        >
          <Icon size={24} strokeWidth={2.5} />
        </div>
        <div className="dashboard-card-title-wrapper">
          <h3 className="dashboard-card-title">{title}</h3>
        </div>
      </div>
      <div className="dashboard-card-body">
        <p className="dashboard-card-value">{value}</p>
        {subtitle && <p className="dashboard-card-subtitle">{subtitle}</p>}
      </div>
    </div>
  );
}
