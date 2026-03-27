import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";

import { validarArquivoCSV } from "./ValidacaoCSV";
import { parseCsv, type CSVRow } from "./parseCsv";

type ImportarCSVModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onImport: (rows: CSVRow[]) => void;
};

export default function ImportarCSVModal({ isOpen, onClose, onImport }: ImportarCSVModalProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedCSVName, setSelectedCSVName] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedFile(null);
      setSelectedCSVName("");
      setUploadError("");
      setIsParsing(false);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;

    if (!file) {
      setSelectedFile(null);
      setSelectedCSVName("");
      setUploadError("");
      return;
    }

    const error = validarArquivoCSV(file);
    if (error) {
      setUploadError(error);
      setSelectedFile(null);
      setSelectedCSVName("");
      event.target.value = "";
      return;
    }

    setUploadError("");
    setSelectedFile(file);
    setSelectedCSVName(file.name);
  };

  const handleConfirmImport = async () => {
    if (!selectedFile) {
      setUploadError("Selecione um arquivo CSV antes de continuar.");
      return;
    }

    setIsParsing(true);
    try {
      const parsedData = await parseCsv(selectedFile);
      onImport(parsedData);
    } catch (error) {
      setUploadError("Não foi possível ler o CSV. Tente novamente.");
    } finally {
      setIsParsing(false);
    }
  };

  const isImportDisabled = !selectedFile || Boolean(uploadError) || isParsing;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Importar usuários via CSV</h2>
            <p className="text-sm text-gray-600">Envie um arquivo .csv válido (máximo 5MB).</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="mt-5 space-y-3">
          <label className="block text-sm font-medium text-gray-700" htmlFor="upload-csv">
            Arquivo CSV
          </label>
          <input
            id="upload-csv"
            type="file"
            accept=".csv,text/csv,application/vnd.ms-excel"
            onChange={handleFileChange}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-[#ffc800] focus:outline-none focus:ring-2 focus:ring-[#ffc800]"
          />
          <p className="text-xs text-gray-500">Apenas arquivos .csv são aceitos.</p>
          {selectedCSVName && !uploadError && (
            <p className="text-sm font-medium text-green-600">Arquivo selecionado: {selectedCSVName}</p>
          )}
          {uploadError && <p className="text-sm font-medium text-red-600">{uploadError}</p>}
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
            onClick={handleConfirmImport}
            disabled={isImportDisabled}
            className="cursor-pointer rounded-md bg-amarelo px-4 py-2 text-sm font-semibold text-[#2f2574] transition hover:bg-[#e6b300] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f2574] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isParsing ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}





