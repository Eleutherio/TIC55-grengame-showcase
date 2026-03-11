import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CartaoBadgesSalvas from "./CartaoBadgesSalvas";

type Props = ComponentProps<typeof CartaoBadgesSalvas>;
type SavedConfig = Props["groupedSavedConfigs"][number]["criteria"][number];

const buildTierValues = (base: number) => ({
  1: base,
  2: base + 10,
  3: base + 20,
  4: base + 30,
  5: base + 40,
});

const publishedConfig: SavedConfig = {
  gameId: "1",
  gameName: "Game A",
  criterion: "course_points",
  valueMode: "percentage",
  isActive: true,
  tierValues: buildTierValues(20),
  updatedAt: "2026-02-11T17:20:23Z",
};

const draftConfig: SavedConfig = {
  gameId: "1",
  gameName: "Game A",
  criterion: "active_days",
  valueMode: "absolute",
  isActive: false,
  tierValues: buildTierValues(2),
};

const gameBConfig: SavedConfig = {
  gameId: "2",
  gameName: "Game B",
  criterion: "perfect_missions",
  valueMode: "percentage",
  isActive: true,
  tierValues: buildTierValues(30),
};

const groupedSavedConfigs: Props["groupedSavedConfigs"] = [
  {
    gameId: "1",
    gameName: "Game A",
    criteria: [publishedConfig, draftConfig],
  },
  {
    gameId: "2",
    gameName: "Game B",
    criteria: [gameBConfig],
  },
];

const tierAssets: Props["tierAssets"] = [
  { tier: 1, image: "/tier1.png" },
  { tier: 2, image: "/tier2.png" },
  { tier: 3, image: "/tier3.png" },
  { tier: 4, image: "/tier4.png" },
  { tier: 5, image: "/tier5.png" },
];

const renderCartaoBadgesSalvas = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    isLoadingSavedConfigs: false,
    savedConfigsError: null,
    groupedSavedConfigs,
    visibleGroupedSavedConfigs: groupedSavedConfigs,
    selectedSavedGroup: groupedSavedConfigs[0],
    savedGameFilterId: "",
    isDeletingConfigKey: null,
    savedGamesPage: 1,
    savedGamesTotalPages: 4,
    savedGamesHasPrevious: false,
    savedGamesHasNext: true,
    tierAssets,
    onSavedGameFilterChange: vi.fn(),
    onSavedGamesPagePrevious: vi.fn(),
    onSavedGamesPageNext: vi.fn(),
    onSelectSavedGame: vi.fn(),
    onEditSaved: vi.fn(),
    onDeleteSaved: vi.fn(),
    configKey: vi.fn(
      (gameId: string, criterion: SavedConfig["criterion"]) =>
        `${gameId}-${criterion}`
    ),
    criterionLabel: vi.fn(
      (criterion: SavedConfig["criterion"]) => `Criterio ${criterion}`
    ),
    tierTitle: vi.fn(
      (criterion: SavedConfig["criterion"], tier: 1 | 2 | 3 | 4 | 5) =>
        `${criterion} tier ${tier}`
    ),
    ruleDescription: vi.fn(
      (
        criterion: SavedConfig["criterion"],
        value: number,
        valueMode: SavedConfig["valueMode"]
      ) => `${criterion} ${value} ${valueMode}`
    ),
    publicationStatusLabel: vi.fn((isActive: boolean) =>
      isActive ? "Publicado" : "Rascunho"
    ),
    formatDate: vi.fn(() => "11/02/2026, 17:20:23"),
    ...overrides,
  };

  return {
    props,
    ...render(<CartaoBadgesSalvas {...props} />),
  };
};

describe("CartaoBadgesSalvas", () => {
  it("exibe estado de carregamento e desabilita filtro", () => {
    renderCartaoBadgesSalvas({
      isLoadingSavedConfigs: true,
      visibleGroupedSavedConfigs: [],
      selectedSavedGroup: null,
    });

    expect(
      screen.getByText(/Carregando badges salvas\.\.\./i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Buscar game/i)).toBeDisabled();
  });

  it("exibe mensagem de vazio quando houver erro de carregamento", () => {
    renderCartaoBadgesSalvas({
      visibleGroupedSavedConfigs: [],
      selectedSavedGroup: null,
      savedConfigsError: "Falha ao carregar badges.",
    });

    expect(screen.getByText("Falha ao carregar badges.")).toBeInTheDocument();
  });

  it("exibe mensagem padrao quando nao houver registros no filtro", () => {
    renderCartaoBadgesSalvas({
      visibleGroupedSavedConfigs: [],
      selectedSavedGroup: null,
      savedConfigsError: null,
    });

    expect(
      screen.getByText(/Nenhuma configuracao encontrada para o filtro selecionado\./i)
    ).toBeInTheDocument();
  });

  it("renderiza lista por game/criterio e dispara callbacks de filtro, selecao e acoes", () => {
    const { props, container } = renderCartaoBadgesSalvas({
      savedGameFilterId: "1",
    });

    const filterSelect = screen.getByLabelText(/Buscar game/i);
    fireEvent.change(filterSelect, { target: { value: "2" } });
    expect(props.onSavedGameFilterChange).toHaveBeenCalledWith("2");
    expect(screen.getByText("Pagina 1 de 4")).toBeInTheDocument();

    const gameBButton = screen.getByRole("button", { name: /Game B/i });
    fireEvent.click(gameBButton);
    expect(props.onSelectSavedGame).toHaveBeenCalledWith("2");
    fireEvent.click(screen.getByRole("button", { name: /Proxima/i }));
    expect(props.onSavedGamesPageNext).toHaveBeenCalledTimes(1);

    const gameAButton = screen.getByRole("button", { name: /Game A/i });
    expect(gameAButton).toHaveClass("active");
    expect(gameAButton).toHaveAttribute("aria-pressed", "true");

    expect(screen.getByText("Criterio course_points")).toBeInTheDocument();
    expect(screen.getByText("Criterio active_days")).toBeInTheDocument();
    expect(screen.getByText("Game A", { selector: ".badges-saved-selected-game" })).toBeInTheDocument();
    expect(screen.getByText("Percentual")).toBeInTheDocument();
    expect(screen.getByText("Absoluto")).toBeInTheDocument();
    expect(screen.getByText("Publicado")).toBeInTheDocument();
    expect(screen.getByText("Rascunho")).toBeInTheDocument();
    expect(
      screen.getByText(/Atualizado em: 11\/02\/2026, 17:20:23/i)
    ).toBeInTheDocument();

    const items = container.querySelectorAll(".badges-saved-item");
    expect(items).toHaveLength(2);
    expect(props.ruleDescription).toHaveBeenCalledTimes(10);

    const firstItem = items[0] as HTMLElement;
    fireEvent.click(within(firstItem).getByRole("button", { name: /Editar/i }));
    fireEvent.click(within(firstItem).getByRole("button", { name: /Excluir/i }));
    expect(props.onEditSaved).toHaveBeenCalledWith(publishedConfig);
    expect(props.onDeleteSaved).toHaveBeenCalledWith(publishedConfig);

    const secondItem = items[1] as HTMLElement;
    expect(
      within(secondItem).queryByText(/Atualizado em:/i)
    ).not.toBeInTheDocument();
  });

  it("aplica estado de exclusao e exibe warning quando ha erro parcial", () => {
    const deletingKey = "1-course_points";
    const { container } = renderCartaoBadgesSalvas({
      isDeletingConfigKey: deletingKey,
      savedConfigsError: "Erro parcial de sincronizacao.",
      savedGamesHasPrevious: true,
      savedGamesHasNext: false,
    });

    const firstItem = container.querySelectorAll(".badges-saved-item")[0] as HTMLElement;
    const firstEdit = within(firstItem).getByRole("button", { name: /Editar/i });
    const firstDelete = within(firstItem).getByRole("button", {
      name: /Excluindo\.\.\./i,
    });

    expect(firstEdit).toBeDisabled();
    expect(firstDelete).toBeDisabled();

    expect(
      screen.getByText("Erro parcial de sincronizacao.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Proxima/i })).toBeDisabled();
  });

  it("mostra orientacao quando nao ha game selecionado com dados visiveis", () => {
    renderCartaoBadgesSalvas({
      selectedSavedGroup: null,
      visibleGroupedSavedConfigs: groupedSavedConfigs,
    });

    expect(
      screen.getByText(/Selecione um game para visualizar\./i)
    ).toBeInTheDocument();
  });

  it("desabilita a paginacao quando nao ha paginas disponiveis", () => {
    renderCartaoBadgesSalvas({
      visibleGroupedSavedConfigs: [],
      selectedSavedGroup: null,
      savedGamesPage: 1,
      savedGamesTotalPages: 0,
      savedGamesHasPrevious: false,
      savedGamesHasNext: false,
    });

    expect(screen.getByText("Pagina 0 de 0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Anterior/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Proxima/i })).toBeDisabled();
  });
});
