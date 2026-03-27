type TemporaryUserBadgeProps = {
  className?: string;
  compact?: boolean;
  label?: string;
};

export default function TemporaryUserBadge({
  className = "",
  compact = false,
  label = "Usuário temporário",
}: TemporaryUserBadgeProps) {
  const sizeClasses = compact
    ? "px-2 py-0.5 text-[10px]"
    : "px-2.5 py-1 text-xs";

  return (
    <span
      className={`inline-flex items-center rounded-full border border-amarelo/55 bg-amarelo/10 font-semibold uppercase tracking-wide text-amarelo ${sizeClasses} ${className}`.trim()}
    >
      {label}
    </span>
  );
}
