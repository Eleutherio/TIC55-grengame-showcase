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
  onSalvar: (usuario: DadosUsuarioManual) => void | Promise<void>;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function AdicionarUsuarioModal({
  isOpen,
  onClose,
  onSalvar,
}: AdicionarUsuarioModalProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [role, setRole] = useState<"admin" | "user">("user");
  const [erro, setErro] = useState("");
  const [isSalvando, setIsSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setNome("");
      setEmail("");
      setSenha("");
      setMostrarSenha(false);
      setRole("user");
      setErro("");
      setIsSalvando(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSalvar = async () => {
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

    if (!senhaTrimmed || senhaTrimmed.length < 6) {
      setErro("Senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setErro("");
    setIsSalvando(true);
    try {
      await Promise.resolve(
        onSalvar({
          nome: nomeTrimmed,
          email: emailTrimmed,
          senha: senhaTrimmed,
          role,
        }),
      );
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar o usuário. Tente novamente.";
      setErro(message);
    } finally {
      setIsSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Adicionar usuário manualmente
            </h2>
            <p className="text-sm text-gray-600">
              Informe nome e e-mail corporativo.
            </p>
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
          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor="nome-manual"
          >
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

          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor="email-manual"
          >
            E-mail corporativo
          </label>
          <input
            id="email-manual"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="nome.sobrenome@gmail.com"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />

          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor="senha-manual"
          >
            Senha provisória
          </label>
          <div className="relative">
            <input
              id="senha-manual"
              type={mostrarSenha ? "text" : "password"}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none text-gray-500 hover:text-gray-700"
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={mostrarSenha}
            >
              {mostrarSenha ? "🙈" : "👁"}
            </button>
          </div>

          <label
            className="block text-sm font-medium text-gray-700"
            htmlFor="role-manual"
          >
            Perfil de acesso
          </label>
          <select
            id="role-manual"
            value={role}
            onChange={(event) =>
              setRole(event.target.value as "admin" | "user")
            }
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
