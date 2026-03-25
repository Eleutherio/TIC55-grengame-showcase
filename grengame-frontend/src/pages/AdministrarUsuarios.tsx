import { useCallback, useEffect, useState } from "react";

import SearchField from "../components/SearchField";
import { getCurrentUserId } from "../utils/auth";
import ImportarCSVModal from "./Usuarios/ImportarCSVModal";
import type { CSVRow } from "./Usuarios/parseCsv";
import ResumoImportacaoModal from "./Usuarios/ResumoImportacaoModal";
import {
  type ResultadoValidacaoConteudo,
  type ErroImportacao,
  validarConteudoImportacao,
} from "./Usuarios/ValidacaoConteudoCSV";
import AdicionarUsuarioModal, { type DadosUsuarioManual } from "./Usuarios/AdicionarUsuarioModal";
import SelecionarMetodoModal from "./Usuarios/SelecionarMetodoModal";
import EditUsuarioModal, { type DadosEdicaoUsuario } from "./Usuarios/EditUsuarioModal";
import { API_URL } from "../config/api";

type Usuario = {
  id?: number;
  nome: string;
  email: string;
  cursosCompletos: number;
  role?: "admin" | "user";
  can_manage?: boolean;
};

const API_BASE_URL = API_URL.replace(/\/+$/, "");

function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const accessToken = localStorage.getItem("accessToken");
  const authHeader: Record<string, string> = accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
  return {
    ...authHeader,
    ...extra,
  };
}

function getFirstStringMessage(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        return item;
      }
    }
  }
  return "";
}

function getApiErrorMessage(payload: unknown): string {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) return getFirstStringMessage(payload);
  if (typeof payload !== "object") return "";

  const parsed = payload as Record<string, unknown>;
  return (
    getFirstStringMessage(parsed.error) ||
    getFirstStringMessage(parsed.detail) ||
    getFirstStringMessage(parsed.non_field_errors) ||
    ""
  );
}

async function importarColaboradoresEmLote(colaboradores: CSVRow[]) {
  const payload = colaboradores.map(({ nome, email }) => ({ nome, email }));
  const response = await fetch(`${API_BASE_URL}/auth/usuarios/importacao/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    credentials: "include",
    body: JSON.stringify({ usuarios: payload }),
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as
      | {
          error?: unknown;
          detail?: unknown;
          non_field_errors?: unknown;
          errors?: Array<{ linha?: number; email?: string; motivo?: string }>;
        }
      | null;

    if (response.status === 409) {
      const backendErrors = data?.errors?.map((e) => ({
        linha: e.linha ?? null,
        email: e.email ?? undefined,
        motivo: e.motivo ?? "Conflito na importação",
      }));
      const err = new Error("Conflitos na importação");
      (err as Error & { backendErrors?: typeof backendErrors }).backendErrors = backendErrors;
      throw err;
    }

    throw new Error(
      getApiErrorMessage(data) || `Falha na importação (${response.status})`,
    );
  }
}

async function buscarUsuarios(): Promise<Usuario[]> {
  const response = await fetch(`${API_BASE_URL}/auth/usuarios/`, {
    method: "GET",
    headers: getAuthHeaders(),
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Falha ao buscar usuários (${response.status})`);
  }

  const data: unknown = await response.json();
  if (!Array.isArray(data)) {
    throw new Error("Resposta inesperada ao buscar usuários");
  }

  return data as Usuario[];
}

async function removerColaborador(email: string) {
  const response = await fetch(`${API_BASE_URL}/auth/usuarios/remover/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    credentials: "include",
    body: JSON.stringify({ email }),
  });

  if (!response.ok) {
    throw new Error(`Falha ao remover usuário (${response.status})`);
  }
}

async function criarUsuarioManual(usuario: DadosUsuarioManual) {
  const response = await fetch(`${API_BASE_URL}/auth/usuarios/criar/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    credentials: "include",
    body: JSON.stringify({
      nome: usuario.nome,
      email: usuario.email,
      password: usuario.senha,
      role: usuario.role,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message =
      getApiErrorMessage(errorPayload) ||
      `Falha ao criar usuário (${response.status})`;
    throw new Error(message);
  }
}

async function atualizarUsuario(usuario: DadosEdicaoUsuario) {
  const response = await fetch(`${API_BASE_URL}/auth/usuarios/atualizar/`, {
    method: "POST",
    headers: getAuthHeaders({
      "Content-Type": "application/json",
    }),
    credentials: "include",
    body: JSON.stringify({
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role,
      password: usuario.senha,
    }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    const message =
      getApiErrorMessage(errorPayload) ||
      `Falha ao atualizar usuário (${response.status})`;
    throw new Error(message);
  }
}

export default function AdministrarUsuarios() {
  const currentUserId = getCurrentUserId();
  const [visibleCount, setVisibleCount] = useState(6);
  const [hasExpanded, setHasExpanded] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSelecaoModalOpen, setIsSelecaoModalOpen] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [importPreview, setImportPreview] = useState<ResultadoValidacaoConteudo | null>(null);
  const [isResumoOpen, setIsResumoOpen] = useState(false);
  const [isImportando, setIsImportando] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [isRemovingSelecionados, setIsRemovingSelecionados] = useState(false);
  const [isRemoveConfirmOpen, setIsRemoveConfirmOpen] = useState(false);
  const [removeConfirmChecked, setRemoveConfirmChecked] = useState(false);
  const [feedbackMensagem, setFeedbackMensagem] = useState<string | null>(null);
  const [resultadoImportacao, setResultadoImportacao] = useState<{
    importados: number;
    descartados: ErroImportacao[];
  } | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [usuarioEdicao, setUsuarioEdicao] = useState<DadosEdicaoUsuario | null>(null);
  const [usuarioEdicaoId, setUsuarioEdicaoId] = useState<number | null>(null);
  const [sortOption, setSortOption] = useState<"alfabetica-asc" | "alfabetica-desc" | "recente-desc" | "recente-asc">(
    "alfabetica-asc"
  );

  const normalizedQuery = searchValue.trim().toLowerCase();
  const usuariosFiltrados =
    normalizedQuery.length > 0
      ? usuarios.filter(
        (usuario) =>
          usuario.nome.toLowerCase().includes(normalizedQuery) ||
          usuario.email.toLowerCase().includes(normalizedQuery)
      )
      : usuarios;

  const isFiltering = normalizedQuery.length > 0;
  const shouldPaginate = !isFiltering;
  const usuariosOrdenados = [...usuariosFiltrados].sort((a, b) => {
    // Sempre prioriza o usuário logado
    if (currentUserId !== null) {
      if (a.id === currentUserId) return -1;
      if (b.id === currentUserId) return 1;
    }

    if (sortOption === "alfabetica-asc") {
      return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    }
    if (sortOption === "alfabetica-desc") {
      return b.nome.localeCompare(a.nome, "pt-BR", { sensitivity: "base" });
    }

    // Usa id como aproximação de "ordem de criação" (maior id = mais recente)
    const idA = typeof a.id === "number" ? a.id : 0;
    const idB = typeof b.id === "number" ? b.id : 0;

    if (sortOption === "recente-desc") {
      if (idA !== idB) return idB - idA;
    } else if (sortOption === "recente-asc") {
      if (idA !== idB) return idA - idB;
    }

    return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
  });

  const visibleUsuarios = shouldPaginate ? usuariosOrdenados.slice(0, visibleCount) : usuariosOrdenados;
  const hasMore = shouldPaginate && usuariosOrdenados.length > visibleCount;
  const semResultados = normalizedQuery.length > 0 && usuariosFiltrados.length === 0;
  const emailsSelecionaveis = usuariosFiltrados
    .filter(
      (u) =>
        Boolean(u.can_manage) &&
        (currentUserId !== null ? u.id !== currentUserId : true)
    )
    .map((u) => u.email);

  const carregarUsuarios = useCallback(async () => {
    try {
      const atualizados = await buscarUsuarios();
      if (atualizados.length > 0) {
        setUsuarios(
          atualizados.map((u) => ({
            ...u,
            role: (u as Usuario).role ?? "user",
            can_manage: (u as Usuario).can_manage ?? true,
          }))
        );
        return;
      }
    } catch (error) {
      console.warn("Falha ao buscar usuários no backend. Mantendo lista mock.", error);
    }
    setUsuarios([]);
  }, []);

  useEffect(() => {
    void carregarUsuarios();
  }, [carregarUsuarios]);

  useEffect(() => {
    if (!isRemoveConfirmOpen) {
      return;
    }

    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflowOriginal;
    };
  }, [isRemoveConfirmOpen]);

  const handleLoadMore = () => {
    setVisibleCount((current) => current + 6);
    setHasExpanded(true);
  };

  const handleCollapseList = () => {
    setVisibleCount(6);
    setHasExpanded(false);
  };

  const handleOpenUploadModal = () => {
    setImportPreview(null);
    setIsResumoOpen(false);
    setIsSelecaoModalOpen(false);
    setIsUploadModalOpen(true);
  };

  const handleCloseUploadModal = () => {
    setIsUploadModalOpen(false);
  };

  const handleOpenSelecaoModal = () => {
    setIsSelecaoModalOpen(true);
  };

  const handleCloseSelecaoModal = () => {
    setIsSelecaoModalOpen(false);
  };

  const handleOpenManualModal = () => {
    setIsSelecaoModalOpen(false);
    setIsManualModalOpen(true);
  };

  const handleCloseManualModal = () => {
    setIsManualModalOpen(false);
  };

  const handleCSVImported = (parsedRows: CSVRow[]) => {
    const resultado = validarConteudoImportacao(parsedRows);
    setImportPreview(resultado);
    setIsUploadModalOpen(false);
    setIsResumoOpen(true);
  };

  const handleAdicionarManual = async (usuario: DadosUsuarioManual) => {
    try {
      await criarUsuarioManual(usuario);
      await carregarUsuarios();
      setFeedbackMensagem(`Usuário ${usuario.nome} criado com sucesso.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível adicionar o usuário. Tente novamente.";
      throw new Error(message);
    }
  };

  const handleCloseResumo = () => {
    setIsResumoOpen(false);
    setImportPreview(null);
  };

  const handleCloseResultadoImportacao = () => {
    setResultadoImportacao(null);
  };

  const handleConfirmImportacao = async (validos: CSVRow[]) => {
    if (isImportando || validos.length === 0) {
      return;
    }

    setIsImportando(true);
    try {
      const descartados = importPreview?.erros ?? [];
      await importarColaboradoresEmLote(validos);
      await carregarUsuarios();
      handleCloseResumo();
      setResultadoImportacao({
        importados: validos.length,
        descartados,
      });
      setFeedbackMensagem(null);
    } catch (error) {
      const backendErrors = (error as { backendErrors?: Array<{ linha: number | null; email?: string; motivo: string }> })
        .backendErrors;
      if (backendErrors?.length) {
        setImportPreview({
          validos,
          erros: backendErrors.map((e, index) => ({
            linha: e.linha ?? index + 1,
            email: e.email,
            motivo: e.motivo,
          })),
        });
        setIsResumoOpen(true);
      } else {
        const message =
          error instanceof Error
            ? error.message
            : "Não foi possível concluir a importação. Tente novamente em instantes.";
        window.alert(message);
      }
    } finally {
      setIsImportando(false);
    }
  };

  const handleToggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      if (prev) {
        setSelectedEmails([]);
      }
      return !prev;
    });
  };

  const handleToggleUsuarioSelecionado = (email: string) => {
    // impede seleção do próprio usuário
    const usuario = usuarios.find((u) => u.email === email);
    if (usuario && currentUserId !== null && usuario.id === currentUserId) {
      return;
    }
    setSelectedEmails((current) => {
      if (current.includes(email)) {
        return current.filter((item) => item !== email);
      }
      return [...current, email];
    });
  };

  const handleAbrirConfirmacaoRemocao = () => {
    if (!selectedEmails.length || isRemovingSelecionados) {
      return;
    }
    setRemoveConfirmChecked(false);
    setIsRemoveConfirmOpen(true);
  };

  const handleFecharConfirmacaoRemocao = () => {
    if (isRemovingSelecionados) {
      return;
    }
    setIsRemoveConfirmOpen(false);
    setRemoveConfirmChecked(false);
  };

  const handleConfirmarRemocaoSelecionados = async () => {
    if (!selectedEmails.length || !removeConfirmChecked || isRemovingSelecionados) {
      return;
    }

    const emailsSelecionados = [...selectedEmails];
    const totalSelecionados = emailsSelecionados.length;
    const nomeSelecionado =
      totalSelecionados === 1
        ? usuarios.find((usuario) => usuario.email === emailsSelecionados[0])?.nome
        : null;

    setIsRemovingSelecionados(true);
    try {
      const emailsComFalha: string[] = [];

      for (const email of emailsSelecionados) {
        try {
          await removerColaborador(email);
        } catch {
          emailsComFalha.push(email);
        }
      }

      const totalRemovidos = totalSelecionados - emailsComFalha.length;
      await carregarUsuarios();

      if (emailsComFalha.length === 0) {
        setSelectedEmails([]);
        setIsSelectionMode(false);
      } else {
        setSelectedEmails(emailsComFalha);
      }

      const mensagem = emailsComFalha.length
        ? `${totalRemovidos} de ${totalSelecionados} usuários removidos. ${emailsComFalha.length} falharam: ${emailsComFalha.join(", ")}`
        : totalSelecionados === 1
          ? nomeSelecionado
            ? `Usuário ${nomeSelecionado} removido com sucesso.`
            : "Usuário selecionado removido com sucesso."
          : `${totalSelecionados} usuários removidos com sucesso.`;
      setFeedbackMensagem(mensagem);
      setIsRemoveConfirmOpen(false);
      setRemoveConfirmChecked(false);
    } finally {
      setIsRemovingSelecionados(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    setVisibleCount(6);
    setHasExpanded(false);
  };

  const handleSearchSubmit = () => {
    setSearchValue((current) => current.trim());
    setVisibleCount(6);
    setHasExpanded(false);
  };

  const handleSearchClear = () => {
    setSearchValue("");
    setVisibleCount(6);
    setHasExpanded(false);
  };

  const handleToggleSelecionarTodos = () => {
    const allSelected = emailsSelecionaveis.length > 0 && emailsSelecionaveis.every((email) => selectedEmails.includes(email));
    if (allSelected) {
      setSelectedEmails((prev) => prev.filter((email) => !emailsSelecionaveis.includes(email)));
      return;
    }
    setSelectedEmails((prev) => Array.from(new Set([...prev, ...emailsSelecionaveis])));
  };

  const handleAbrirEdicao = (usuario: Usuario) => {
    if (!usuario.can_manage) {
      setFeedbackMensagem(
        "Este usuário está disponível apenas para visualização neste perfil."
      );
      return;
    }
    setUsuarioEdicao({
      nome: usuario.nome,
      email: usuario.email,
      role: usuario.role ?? "user",
    });
    setUsuarioEdicaoId(usuario.id ?? null);
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setUsuarioEdicao(null);
    setUsuarioEdicaoId(null);
  };

  const handleSalvarEdicao = async (dados: DadosEdicaoUsuario) => {
    try {
      await atualizarUsuario(dados);
      await carregarUsuarios();
      setFeedbackMensagem(`Usuário ${dados.nome} atualizado com sucesso.`);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o usuário. Tente novamente.";
      throw new Error(message);
    }
  };

  return (
    <>
      <main className=" px-3 py-8 text-gray-900 sm:px-4 md:px-6">
        <section className="mx-auto w-full rounded-2xl bg-roxo-forte px-4 py-6 shadow-2xl sm:px-6 lg:px-7">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h1 className="text-2xl font-bold text-white md:text-3xl">Gestão de Usuários</h1>
              <div className="flex items-center gap-2">
                <label htmlFor="filtro-usuarios" className="text-sm font-semibold text-white/90">
                  Ordenar por:
                </label>
                <select
                  id="filtro-usuarios"
                  value={sortOption}
                  onChange={(event) =>
                    setSortOption(event.target.value as "alfabetica-asc" | "alfabetica-desc" | "recente-desc" | "recente-asc")
                  }
                  className="rounded-md border border-white/40 bg-white/90 px-3 py-2 text-sm font-semibold text-[#2f2574] shadow-sm outline-none transition hover:bg-white focus:border-[#ffc800] focus:ring-2 focus:ring-[#ffc800]"
                >
                  <option value="alfabetica-asc">A-Z</option>
                  <option value="alfabetica-desc">Z-A</option>
                  <option value="recente-desc">Último adicionado</option>
                  <option value="recente-asc">Primeiros adicionados</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div className="flex-1">
                <SearchField
                  value={searchValue}
                  onValueChange={handleSearchChange}
                  onSubmit={handleSearchSubmit}
                  onClear={handleSearchClear}
                  placeholder="Buscar por nome ou e-mail..."
                  ariaLabel="Buscar usuários por nome ou e-mail"
                />
              </div>

              <div className="flex flex-col gap-2 self-center sm:flex-row lg:self-start">
                <button
                  type="button"
                  onClick={handleOpenSelecaoModal}
                  className="cursor-pointer min-w-[130px] rounded-md bg-amarelo px-4 py-3 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                  Adicionar usuários
                </button>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={handleToggleSelectionMode}
                    className="cursor-pointer min-w-[130px] rounded-md bg-amarelo px-4 py-3 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                  >
                    {isSelectionMode ? "Cancelar seleção" : "Remover usuários"}
                  </button>
                  {isSelectionMode && (
                    <button
                      type="button"
                      onClick={handleAbrirConfirmacaoRemocao}
                      disabled={selectedEmails.length === 0 || isRemovingSelecionados}
                      className="cursor-pointer rounded-md border border-red-200 bg-red-500/90 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isRemovingSelecionados ? "Removendo..." : `Remover selecionado${selectedEmails.length > 1 ? "s" : ""}`}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-white/40 bg-white shadow">
              {/* Desktop / tablet table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="min-w-full border-collapse">
                  <thead>
                    <tr className="bg-roxo-forte text-white">
                      <th scope="col" className="px-6 py-3 text-left text-sm font-semibold uppercase tracking-wide md:px-8">
                        Nome
                      </th>
                      <th scope="col" className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wide md:px-8">
                        E-mail
                      </th>
                      <th scope="col" className="px-4 py-3 text-center text-sm font-semibold uppercase tracking-wide">
                        Games completos
                      </th>
                      <th scope="col" className="px-4 py-3 text-right text-sm font-semibold uppercase tracking-wide md:px-6">
                        <div className="flex items-center justify-end gap-3">
                          <span>Ações</span>
                          {isSelectionMode && (
                            <label className="flex items-center gap-2 text-xs font-semibold text-white">
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-white/70 bg-white/20 text-amarelo focus:ring-[#ffc800]"
                                aria-label="Selecionar todos os usuários visíveis"
                                onChange={handleToggleSelecionarTodos}
                                checked={
                                  emailsSelecionaveis.length > 0 &&
                                  emailsSelecionaveis.every((email) => selectedEmails.includes(email))
                                }
                              />
                              Selecionar todos
                            </label>
                          )}
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {semResultados ? (
                      <tr>
                        <td colSpan={4} className="px-6 py-6 text-center text-sm text-gray-600">
                          Nenhum usuário encontrado para <strong>{searchValue}</strong>. Ajuste sua busca e tente novamente.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {visibleUsuarios.map((usuario) => {
                          const selecionado = selectedEmails.includes(usuario.email);
                          const isSelf = currentUserId !== null && usuario.id === currentUserId;
                          const canManage = Boolean(usuario.can_manage);
                          const rowClass = isSelf ? "bg-roxo-forte/10" : "bg-white";
                          return (
                            <tr key={usuario.email} className={`border-t border-[#4b40cb]/30 text-gray-900 ${rowClass}`}>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex items-center gap-2">
                                  <span>{usuario.nome}</span>
                                  {isSelf && (
                                    <span className="inline-flex items-center rounded-full bg-[#2f2574]/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2f2574]">
                                      Você
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm">{usuario.email}</td>
                              <td className="px-4 py-3 text-sm text-center">{usuario.cursosCompletos}</td>
                              <td className="px-4 py-3 text-sm">
                                <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                  {canManage ? (
                                    <button
                                      type="button"
                                      onClick={() => handleAbrirEdicao(usuario)}
                                      className="w-full cursor-pointer rounded-md bg-amarelo px-3 py-2 font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574] sm:w-auto"
                                      aria-label={`Editar ${usuario.nome}`}
                                    >
                                      Editar
                                    </button>
                                  ) : (
                                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-600">
                                      Somente leitura
                                    </span>
                                  )}
                                  {isSelectionMode && !isSelf && canManage && (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4 rounded border-gray-300 text-roxo-forte focus:ring-[#ffc800]"
                                        aria-label={`Selecionar ${usuario.nome}`}
                                        checked={selecionado}
                                        onChange={() => handleToggleUsuarioSelecionado(usuario.email)}
                                      />
                                      Selecionar
                                    </label>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="flex flex-col gap-3 p-4 lg:hidden">
                {isSelectionMode && (
                  <div className="flex justify-end">
                    <label className="flex items-center gap-2 text-xs font-semibold text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-roxo-forte focus:ring-[#ffc800]"
                        aria-label="Selecionar todos os usuários"
                        onChange={handleToggleSelecionarTodos}
                        checked={
                          emailsSelecionaveis.length > 0 &&
                          emailsSelecionaveis.every((email) => selectedEmails.includes(email))
                        }
                      />
                      Selecionar todos
                    </label>
                  </div>
                )}
                {semResultados ? (
                  <p className="rounded-xl border border-[#4b40cb]/20 bg-white/90 p-4 text-center text-sm text-gray-600">
                    Nenhum usuário encontrado para <strong>{searchValue}</strong>.
                  </p>
                ) : (
                  visibleUsuarios.map((usuario) => {
                    const selecionado = selectedEmails.includes(usuario.email);
                    const isSelf = currentUserId !== null && usuario.id === currentUserId;
                    const canManage = Boolean(usuario.can_manage);
                    return (
                      <article
                        key={usuario.email}
                        className={`rounded-xl border border-[#4b40cb]/20 p-4 shadow-sm shadow-[#4b40cb]/10 ${isSelf ? "bg-roxo-forte/10" : "bg-white/90"}`}
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center gap-2">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Nome</p>
                                <p className="text-base font-semibold text-gray-900">{usuario.nome}</p>
                              </div>
                              {isSelf && (
                                <span className="inline-flex items-center rounded-full bg-[#2f2574]/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[#2f2574]">
                                  Você
                                </span>
                              )}
                            </div>
                            <span className="inline-flex h-8 items-center justify-center rounded-full bg-roxo-forte/10 px-3 text-xs font-semibold text-roxo-forte">
                              {usuario.cursosCompletos} curso{usuario.cursosCompletos !== 1 ? "s" : ""}
                            </span>
                          </div>

                          <div className="flex flex-col gap-1">
                            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">E-mail</p>
                            <p className="text-sm break-words text-gray-900">{usuario.email}</p>
                          </div>

                          <div aria-label="Ações" className="flex flex-col gap-2">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => handleAbrirEdicao(usuario)}
                                className="w-full cursor-pointer rounded-md bg-[#ffc800] px-3 py-3 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574]"
                                aria-label={`Editar ${usuario.nome}`}
                              >
                                Editar
                              </button>
                            ) : (
                              <span className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600">
                                Somente leitura
                              </span>
                            )}
                            {isSelectionMode && !isSelf && canManage && (
                              <label className="flex items-center gap-2 text-xs font-semibold text-gray-600">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-gray-300 text-roxo-forte focus:ring-[#ffc800]"
                                  aria-label={`Selecionar ${usuario.nome}`}
                                  checked={selecionado}
                                  onChange={() => handleToggleUsuarioSelecionado(usuario.email)}
                                />
                                Selecionar
                              </label>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
              {shouldPaginate && (hasMore || hasExpanded) && (
                <div className="flex justify-center gap-3 px-4 pb-4 lg:px-6">
                  {hasMore && (
                    <button
                      type="button"
                      onClick={handleLoadMore}
                      className="cursor-pointer rounded-lg bg-white/90 px-5 py-2 text-sm font-semibold text-roxo-forte shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amarelo"
                    >
                      Expandir
                    </button>
                  )}
                  {hasExpanded && (
                    <button
                      type="button"
                      onClick={handleCollapseList}
                      className="cursor-pointer rounded-lg bg-white/90 px-5 py-2 text-sm font-semibold text-roxo-forte shadow hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amarelo"
                    >
                      Recolher
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
      <SelecionarMetodoModal
        isOpen={isSelecaoModalOpen}
        onClose={handleCloseSelecaoModal}
        onSelecionarManual={handleOpenManualModal}
        onSelecionarImportar={handleOpenUploadModal}
      />
      <AdicionarUsuarioModal isOpen={isManualModalOpen} onClose={handleCloseManualModal} onSalvar={handleAdicionarManual} />
      <ImportarCSVModal isOpen={isUploadModalOpen} onClose={handleCloseUploadModal} onImport={handleCSVImported} />
      <EditUsuarioModal
        isOpen={isEditModalOpen}
        onClose={handleCloseEditModal}
        usuario={usuarioEdicao}
        isRoleLocked={currentUserId !== null && usuarioEdicaoId !== null && usuarioEdicaoId === currentUserId}
        onSalvar={handleSalvarEdicao}
      />
      {importPreview && (
        <ResumoImportacaoModal
          isOpen={isResumoOpen}
          onClose={handleCloseResumo}
          resultado={importPreview}
          onConfirm={handleConfirmImportacao}
        />
      )}
      {resultadoImportacao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Importação concluída</h3>
                <p className="text-sm font-semibold text-emerald-700">
                  {resultadoImportacao.importados} registro{resultadoImportacao.importados === 1 ? "" : "s"} importado
                  {resultadoImportacao.importados === 1 ? "" : "s"} com sucesso.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseResultadoImportacao}
                className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              {resultadoImportacao.descartados.length === 0 ? (
                <p className="text-sm text-emerald-700">
                  Todos os registros do arquivo foram importados. Nenhuma linha descartada.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    <span className="text-red-600">
                      {resultadoImportacao.descartados.length}
                    </span>{" "}
                    registro{resultadoImportacao.descartados.length === 1 ? "" : "s"} não
                    importado{resultadoImportacao.descartados.length === 1 ? "" : "s"}:
                  </p>
                  <div className="max-h-64 overflow-y-auto rounded-lg border border-gray-200 bg-gray-50/70">
                    <table className="min-w-full divide-y divide-gray-100 text-sm">
                      <thead className="bg-gray-50/60 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                        <tr>
                          <th className="px-4 py-2">Linha</th>
                          <th className="px-4 py-2">E-mail</th>
                          <th className="px-4 py-2">Motivo</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 text-gray-800">
                        {resultadoImportacao.descartados.map((erro) => (
                          <tr key={`${erro.linha}-${erro.email ?? "sem-email"}-${erro.motivo}`}>
                            <td className="px-4 py-2 font-medium text-gray-900">{erro.linha}</td>
                            <td className="px-4 py-2">{erro.email ?? "—"}</td>
                            <td className="px-4 py-2">{erro.motivo}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <p className="text-xs text-red-600">
                Os usuários importados recebem uma senha provisória aleatória. Lembre-se de orientar a redefinição de senha ou
                realizar o reset de senha pelo painel de administração.
              </p>
            </div>
          </div>
        </div>
      )}
      {isRemoveConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" role="dialog" aria-modal="true">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            aria-labelledby="confirmacao-remocao-titulo"
            aria-describedby="confirmacao-remocao-descricao"
          >
            <div className="flex items-start justify-between border-b border-gray-100 pb-4">
              <div>
                <h3 id="confirmacao-remocao-titulo" className="text-xl font-semibold text-gray-900">
                  Confirmar remoção
                </h3>
                <p id="confirmacao-remocao-descricao" className="text-sm text-gray-700">
                  Deseja remover {selectedEmails.length} usuário{selectedEmails.length > 1 ? "s" : ""}?
                </p>
              </div>
              <button
                type="button"
                onClick={handleFecharConfirmacaoRemocao}
                className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar confirmação"
              >
                Fechar
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                Essa ação é permanente e não pode ser desfeita.
              </div>
              <label className="flex items-start gap-3 text-sm text-gray-700" htmlFor="confirmacao-remocao-checkbox">
                <input
                  id="confirmacao-remocao-checkbox"
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-roxo-forte focus:ring-[#ffc800]"
                  checked={removeConfirmChecked}
                  onChange={(event) => setRemoveConfirmChecked(event.target.checked)}
                />
                Entendo que essa ação não pode ser desfeita.
              </label>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleFecharConfirmacaoRemocao}
                  className="cursor-pointer rounded-md border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-300"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmarRemocaoSelecionados}
                  disabled={!removeConfirmChecked || isRemovingSelecionados}
                  className="cursor-pointer rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isRemovingSelecionados ? "Removendo..." : "Remover usuários"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {feedbackMensagem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <p className="text-base font-semibold text-gray-900">{feedbackMensagem}</p>
            <button
              type="button"
              onClick={() => setFeedbackMensagem(null)}
              className="mt-4 inline-flex justify-center rounded-md bg-amarelo px-4 py-2 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574]"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </>
  );
}





