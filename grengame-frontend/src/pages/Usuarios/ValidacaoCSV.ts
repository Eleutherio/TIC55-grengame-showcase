const ALLOWED_EXTENSIONS = ["csv"];
const ALLOWED_MIME_TYPES = ["text/csv", "application/vnd.ms-excel"];

export const MAX_CSV_SIZE = 5 * 1024 * 1024;

export function validarArquivoCSV(file: File): string | null {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !ALLOWED_EXTENSIONS.includes(extension)) {
    return "Formato inválido. Envie um CSV.";
  }

  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return "Formato inválido. Envie um CSV.";
  }

  if (file.size === 0) {
    return "Arquivo vazio. Selecione outro CSV.";
  }

  if (file.size > MAX_CSV_SIZE) {
    return "Arquivo muito grande. Limite máximo é 5MB.";
  }

  return null;
}
