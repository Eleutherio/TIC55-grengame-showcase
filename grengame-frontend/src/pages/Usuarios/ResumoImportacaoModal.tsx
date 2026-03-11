import { useMemo, useState } from "react";

import type { CSVRow } from "./parseCsv";
import type { ResultadoValidacaoConteudo } from "./ValidacaoConteudoCSV";

type ResumoImportacaoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  resultado: ResultadoValidacaoConteudo;
  onConfirm: (validos: CSVRow[]) => void;
};

export default function ResumoImportacaoModal({
  isOpen,
  onClose,
  resultado,
  onConfirm,
}: ResumoImportacaoModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const validos = resultado.validos;
  const erros = resultado.erros;
  const totalValidos = validos.length;
  const totalErros = erros.length;

  const resumo = useMemo(
    () => `${totalValidos} registro${totalValidos === 1 ? "" : "s"} válido${totalValidos === 1 ? "" : "s"} — ${totalErros} registro${totalErros === 1 ? "" : "s"} com erro`,
    [totalValidos, totalErros]
  );

  if (!isOpen) {
    return null;
  }

  const handleConfirmClick = () => {
    if (!totalValidos || isConfirming) {
      return;
    }

    setIsConfirming(true);
    Promise.resolve(onConfirm(validos))
      .catch(() => undefined)
      .finally(() => {
        setIsConfirming(false);
      });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col gap-2 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Resumo da importação</h2>
            <p className="text-sm text-gray-600">{resumo}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Registros válidos</h3>
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700">
                {totalValidos}
              </span>
            </div>
            {totalValidos === 0 ? (
              <p className="mt-4 text-sm text-gray-600">Nenhuma linha válida encontrada no arquivo.</p>
            ) : (
              <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-white/70 bg-white">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50/60 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Nome</th>
                      <th className="px-4 py-2">E-mail</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {validos.map((row, index) => (
                      <tr key={`${row.email}-${index}`}>
                        <td className="px-4 py-2">{row.nome}</td>
                        <td className="px-4 py-2">{row.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900">Erros detectados</h3>
              <span className="rounded-full bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-700">
                {totalErros}
              </span>
            </div>
            {totalErros === 0 ? (
              <p className="mt-4 text-sm text-gray-600">Nenhum erro identificado.</p>
            ) : (
              <div className="mt-4 max-h-60 overflow-y-auto rounded-lg border border-white/70 bg-white">
                <table className="min-w-full divide-y divide-gray-100 text-sm">
                  <thead className="bg-gray-50/60 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-4 py-2">Linha</th>
                      <th className="px-4 py-2">E-mail</th>
                      <th className="px-4 py-2">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-800">
                    {erros.map((erro) => (
                      <tr key={`${erro.linha}-${erro.email ?? "sem-email"}-${erro.motivo}`}>
                        <td className="px-4 py-2 font-medium text-gray-900">{erro.linha}</td>
                        <td className="px-4 py-2">{erro.email ?? "—"}</td>
                        <td className="px-4 py-2">{erro.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="mt-6 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={totalValidos === 0 || isConfirming}
            className="cursor-pointer rounded-md bg-amarelo px-4 py-2 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isConfirming ? "Importando..." : "Confirmar importação"}
          </button>
        </div>
      </div>
    </div>
  );
}
