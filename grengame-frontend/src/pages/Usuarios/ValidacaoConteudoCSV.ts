import type { CSVRow } from "./parseCsv";

export type ErroImportacao = {
  linha: number;
  motivo: string;
  email?: string;
};

export type ResultadoValidacaoConteudo = {
  validos: CSVRow[];
  erros: ErroImportacao[];
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const DOMINIO_PERMITIDO = "@grendene.com.br";

const isEmptyValue = (value: unknown) => {
  if (value === null || value === undefined) {
    return true;
  }

  if (typeof value === "string") {
    return value.trim() === "";
  }

  return false;
};

export function validarConteudoImportacao(rows: CSVRow[]): ResultadoValidacaoConteudo {
  const resultado: ResultadoValidacaoConteudo = {
    validos: [],
    erros: [],
  };

  rows.forEach((row, index) => {
    const linha = index + 2; // considera cabeçalho na linha 1
    const nome = typeof row.nome === "string" ? row.nome.trim() : "";
    const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";

    const isLinhaVazia = Object.values(row).every((value) => isEmptyValue(value));
    if (isLinhaVazia) {
      return;
    }

    if (!nome) {
      resultado.erros.push({
        linha,
        motivo: "Nome obrigatório.",
        email: email || undefined,
      });
      return;
    }

    if (!email) {
      resultado.erros.push({
        linha,
        motivo: "E-mail obrigatório.",
      });
      return;
    }

    if (!EMAIL_REGEX.test(email)) {
      resultado.erros.push({
        linha,
        motivo: "Formato de e-mail inválido.",
        email,
      });
      return;
    }

    if (!email.endsWith(DOMINIO_PERMITIDO)) {
      resultado.erros.push({
        linha,
        motivo: `Domínio de e-mail não permitido. Use ${DOMINIO_PERMITIDO}.`,
        email,
      });
      return;
    }

    resultado.validos.push({
      ...row,
      nome,
      email,
    });
  });

  return resultado;
}
