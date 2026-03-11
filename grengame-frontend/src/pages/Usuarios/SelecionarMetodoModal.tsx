type SelecionarMetodoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSelecionarManual: () => void;
  onSelecionarImportar: () => void;
};

export default function SelecionarMetodoModal({
  isOpen,
  onClose,
  onSelecionarManual,
  onSelecionarImportar,
}: SelecionarMetodoModalProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Adicionar usuários</h2>
            <p className="text-sm text-gray-600">Escolha uma das opções abaixo.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-md px-2 py-1 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Fechar
          </button>
        </div>

        <div className="mt-6 grid gap-4">
          <button
            type="button"
            onClick={onSelecionarManual}
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-amarelo hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amarelo"
          >
            <p className="text-base font-semibold text-gray-900">Adicionar manualmente</p>
            <p className="mt-1 text-sm text-gray-600">Cadastre um usuário por vez informando nome e e-mail.</p>
          </button>

          <button
            type="button"
            onClick={onSelecionarImportar}
            className="w-full rounded-xl border border-gray-200 bg-white px-5 py-4 text-left shadow-sm transition hover:border-amarelo hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amarelo"
          >
            <p className="text-base font-semibold text-gray-900">Importar via CSV</p>
            <p className="mt-1 text-sm text-gray-600">Suba um arquivo .csv contendo nome e e-mail dos colaboradores.</p>
          </button>
        </div>
      </div>
    </div>
  );
}
