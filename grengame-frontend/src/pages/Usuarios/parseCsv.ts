import Papa from "papaparse";

export type CSVRow = {
  nome: string;
  email: string;
  funcao: string;
  cursosCompletos: string; 
};

export function parseCsv(file: File): Promise<CSVRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<CSVRow>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error) => {
        reject(error);
      },
    });
  });
}
  