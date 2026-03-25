import { useEffect, useMemo, useState } from "react";
import {
  formatTemporaryExpiration,
  formatTemporaryRemainingTime,
} from "../utils/temporaryAccess";

type TemporaryProfileInfoModalProps = {
  isOpen: boolean;
  displayName: string;
  expiresAt?: string | null;
  onClose: (dontShowAgain: boolean) => void;
};

const getRemainingMs = (expiresAt?: string | null): number => {
  if (!expiresAt) return 0;
  const parsed = new Date(expiresAt);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime() - Date.now();
};

export default function TemporaryProfileInfoModal({
  isOpen,
  displayName,
  expiresAt,
  onClose,
}: TemporaryProfileInfoModalProps) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [remainingMs, setRemainingMs] = useState(() => getRemainingMs(expiresAt));

  useEffect(() => {
    if (!isOpen) {
      setDontShowAgain(false);
      return;
    }

    setRemainingMs(getRemainingMs(expiresAt));
    const timer = window.setInterval(() => {
      setRemainingMs(getRemainingMs(expiresAt));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [expiresAt, isOpen]);

  const remainingLabel = useMemo(
    () => formatTemporaryRemainingTime(remainingMs),
    [remainingMs],
  );

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/55 px-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="temporary-profile-modal-title"
        className="w-full max-w-2xl rounded-2xl border border-white/15 bg-roxo-forte p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
      >
        <h2
          id="temporary-profile-modal-title"
          className="text-xl font-bold text-amarelo"
        >
          Bem-vindo(a), {displayName}!
        </h2>
        <p className="mt-3 text-sm text-white/90">
          Esse é o seu perfil temporário na plataforma. Nele, você terá liberdade
          para navegar e testar as funcionalidades.
        </p>

        <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-4">
          <p className="text-sm font-semibold text-amarelo">Você pode:</p>
          <ul className="mt-2 space-y-2 text-sm text-white/90">
            <li>
              Administrar somente usuários criados por você, limitado a 2
              usuários.
            </li>
            <li>
              Administrar somente games criados por você, limitado a 1 game.
            </li>
            <li>
              Administrar somente missões criadas por você, limitado a 10 missões.
            </li>
            <li>
              Administrar somente badges criadas por você, limitado a 3 critérios
              de desbloqueio diferentes do game criado por você.
            </li>
          </ul>
        </div>

        <div className="mt-4 rounded-xl border border-amarelo/40 bg-amarelo/10 p-4">
          <p className="text-sm text-white/95">
            Prazo do perfil temporário: <strong>{formatTemporaryExpiration(expiresAt)}</strong>
          </p>
          <p className="mt-1 text-sm text-white/95">
            Tempo restante: <strong>{remainingLabel}</strong>
          </p>
        </div>

        <label className="mt-4 flex items-center gap-2 text-sm text-white/90">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(event) => setDontShowAgain(event.target.checked)}
            className="h-4 w-4 rounded border-white/30 bg-transparent text-amarelo focus:ring-amarelo"
          />
          Não mostrar novamente nessa seção
        </label>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => onClose(dontShowAgain)}
            className="rounded-lg bg-amarelo px-4 py-2 text-sm font-semibold text-roxo-forte transition hover:bg-[#e6b300]"
          >
            Entendi
          </button>
        </div>
      </section>
    </div>
  );
}
