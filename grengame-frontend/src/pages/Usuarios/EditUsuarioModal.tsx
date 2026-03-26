import { useEffect, useState } from "react";

export type DadosEdicaoUsuario = {
  nome: string;
  email: string;
  role: "admin" | "user";
  senha?: string;
};

type EditUsuarioModalProps = {
  isOpen: boolean;
  onClose: () => void;
  usuario: DadosEdicaoUsuario | null;
  onSalvar: (dados: DadosEdicaoUsuario) => void | Promise<void>;
  isRoleLocked?: boolean;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export default function EditUsuarioModal({
  isOpen,
  onClose,
  usuario,
  onSalvar,
  isRoleLocked = false,
}: EditUsuarioModalProps) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "user">("user");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [isSalvando, setIsSalvando] = useState(false);

  useEffect(() => {
    if (!isOpen || !usuario) {
      setNome("");
      setEmail("");
      setRole("user");
      setSenha("");
      setMostrarSenha(false);
      setErro("");
      setIsSalvando(false);
      return;
    }
    setNome(usuario.nome);
    setEmail(usuario.email);
    setRole(usuario.role);
    setSenha("");
    setMostrarSenha(false);
    setErro("");
    setIsSalvando(false);
  }, [isOpen, usuario]);

  if (!isOpen || !usuario) {
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

    if (senhaTrimmed && senhaTrimmed.length < 6) {
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
          role: isRoleLocked ? usuario.role : role,
          senha: senhaTrimmed || undefined,
        }),
      );
      onClose();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o usuário. Tente novamente.";
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
            <h2 className="text-xl font-semibold text-gray-900">Editar usuário</h2>
            <p className="text-sm text-gray-600">Atualize dados de acesso e perfil.</p>
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
          <label className="block text-sm font-medium text-gray-700" htmlFor="edit-nome">
            Nome completo
          </label>
          <input
            id="edit-nome"
            type="text"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />

          <label className="block text-sm font-medium text-gray-700" htmlFor="edit-email">
            E-mail
          </label>
          <input
            id="edit-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />

          <label className="block text-sm font-medium text-gray-700" htmlFor="edit-role">
            Perfil de acesso
          </label>
          <select
            id="edit-role"
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "user")}
            disabled={isRoleLocked}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800] disabled:cursor-not-allowed disabled:bg-gray-100"
          >
            <option value="user">Usuário</option>
            <option value="admin">Administrador</option>
          </select>
          {isRoleLocked && (
            <p className="text-xs text-gray-500">Não é possível alterar o próprio perfil de acesso.</p>
          )}

          <label className="block text-sm font-medium text-gray-700" htmlFor="edit-senha">
            Nova senha (opcional)
          </label>
          <div className="relative">
            <input
              id="edit-senha"
              type={mostrarSenha ? "text" : "password"}
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              placeholder="Deixe em branco para manter a senha atual"
              className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
            />
            <button
              type="button"
              onClick={() => setMostrarSenha((value) => !value)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-base leading-none text-gray-500 hover:text-gray-700"
              aria-label={mostrarSenha ? "Ocultar senha" : "Mostrar senha"}
              aria-pressed={mostrarSenha}
            >
              <img
                src={mostrarSenha ? "/eye-closed.png" : "/eye-open.png"}
                alt=""
                aria-hidden="true"
                className="h-4 w-4 object-contain"
              />
            </button>
          </div>

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
