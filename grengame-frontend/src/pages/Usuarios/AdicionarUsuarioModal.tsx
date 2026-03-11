import { useEffect, useState } from "react";

export type DadosUsuarioManual = {
  nome: string;
  email: string;
  senha: string;
  role: "admin" | "user";
};

type AdicionarUsuarioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSalvar: (usuario: DadosUsuarioManual) => void;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const ALLOWED_EMAIL_DOMAIN = "grendene.com.br";

function getEmailDomainError(rawEmail: string): string | null {
  const trimmed = rawEmail.trim().toLowerCase();
  if (!trimmed.includes("@")) {
    return null;
  }
  const parts = trimmed.split("@");
  const domain = parts[1] ?? "";
  if (!domain) {
    return null;
  }
  if (domain !== ALLOWED_EMAIL_DOMAIN) {
    return `Somente e-mails @${ALLOWED_EMAIL_DOMAIN} são permitidos.`;
  }
  return null;
}

export default function AdicionarUsuarioModal({ isOpen, onClose, onSalvar }: AdicionarUsuarioModalProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [erro, setErro] = useState("");
  const [isSalvando, setIsSalvando] = useState(false);
  const emailDomainError = getEmailDomainError(email);

  useEffect(() => {
    if (!isOpen) {
      setNome("");
      setEmail("");
      setSenha("");
      setRole("user");
      setErro("");
      setIsSalvando(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSalvar = () => {
    const nomeTrimmed = nome.trim();
    const emailTrimmed = email.trim().toLowerCase();
    const senhaTrimmed = senha.trim();

    if (!nomeTrimmed) {
      setErro("Nome é obrigatório.");
      return;
    }

    if (!emailTrimmed || !EMAIL_REGEX.test(emailTrimmed)) {
      setErro("Informe um e-mail válido.");
      return;
    }

    const domainError = getEmailDomainError(emailTrimmed);
    if (domainError) {
      setErro(domainError);
      return;
    }

    if (!senhaTrimmed || senhaTrimmed.length < 6) {
      setErro("Senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setErro("");
    setIsSalvando(true);
    try {
      onSalvar({ nome: nomeTrimmed, email: emailTrimmed, senha: senhaTrimmed, role });
      onClose();
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Adicionar usuário manualmente</h2>
            <p className="text-sm text-gray-600">Informe nome e e-mail corporativo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <label className="block text-sm font-medium text-gray-700" htmlFor="nome-manual">
            Nome completo
          </label>
          <input
            id="nome-manual"
            type="text"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Maria Silva"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />

          <label className="block text-sm font-medium text-gray-700" htmlFor="email-manual">
            E-mail corporativo
          </label>
          <input
            id="email-manual"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome.sobrenome@grendene.com.br"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />
          {emailDomainError && (
            <p className="mt-1 text-xs font-medium text-red-600">{emailDomainError}</p>
          )}

          <label className="block text-sm font-medium text-gray-700" htmlFor="senha-manual">
            Senha provisória
          </label>
          <input
            id="senha-manual"
            type="password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
            placeholder="Mínimo 6 caracteres"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />

          <label className="block text-sm font-medium text-gray-700" htmlFor="role-manual">
            Perfil de acesso
          </label>
          <select
            id="role-manual"
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "user")}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          >
            <option value="user">Usuário</option>
            <option value="admin">Administrador</option>
          </select>

          {erro && <p className="text-sm font-medium text-red-600">{erro}</p>}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSalvar}
            disabled={isSalvando}
            className="cursor-pointer rounded-md bg-amarelo px-4 py-2 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSalvando ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
