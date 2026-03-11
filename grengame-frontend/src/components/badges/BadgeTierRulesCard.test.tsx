import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import BadgeTierRulesCard from "./BadgeTierRulesCard";

type Props = ComponentProps<typeof BadgeTierRulesCard>;

const baseTierValues: Props["tierValues"] = {
  1: 25,
  2: 45,
  3: 65,
  4: 85,
  5: 100,
};

const renderBadgeTierRulesCard = (overrides: Partial<Props> = {}) => {
  const props: Props = {
    selectedCriterion: "",
    tierValues: baseTierValues,
    tierAssets: [
      { tier: 1, image: "/tier1.png" },
      { tier: 2, image: "/tier2.png" },
    ],
    isSaving: false,
    isLoadingConfig: false,
    criterionPresetHelpText: "Preset para criterio selecionado.",
    legacyValueModeWarning: "",
    inputLabel: "Valor",
    isPercentageCriterion: true,
    onTierChange: vi.fn(),
    tierTitle: vi.fn((tier: 1 | 2 | 3 | 4 | 5) => `Titulo tier ${tier}`),
    ruleDescription: vi.fn((tier: 1 | 2 | 3 | 4 | 5) => `Regra tier ${tier}`),
    ...overrides,
  };

  return {
    props,
    ...render(<BadgeTierRulesCard {...props} />),
  };
};

describe("BadgeTierRulesCard", () => {
  it("exibe loading, ajuda de criterio e warning de modo legado", () => {
    renderBadgeTierRulesCard({
      selectedCriterion: "course_points",
      isLoadingConfig: true,
      legacyValueModeWarning: "Valores legados detectados.",
    });

    expect(
      screen.getByRole("heading", { name: /2\. Regras por tier/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Carregando configuracao atual\.\.\./i)
    ).toBeInTheDocument();
    expect(
      screen.getByText("Preset para criterio selecionado.")
    ).toBeInTheDocument();
    expect(screen.getByText("Valores legados detectados.")).toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
      expect(input).toHaveAttribute("min", "0");
      expect(input).toHaveAttribute("max", "100");
    });
  });

  it("permite editar valores e envia onTierChange no modo absoluto", () => {
    const { props } = renderBadgeTierRulesCard({
      selectedCriterion: "active_days",
      isPercentageCriterion: false,
      isSaving: false,
      isLoadingConfig: false,
    });

    const tierOneInput = screen.getByLabelText("Valor", {
      selector: "#badge-tier-1",
    });
    const tierTwoInput = screen.getByLabelText("Valor", {
      selector: "#badge-tier-2",
    });

    expect(tierOneInput).toBeEnabled();
    expect(tierOneInput).toHaveAttribute("min", "1");
    expect(tierOneInput).not.toHaveAttribute("max");

    fireEvent.change(tierOneInput, { target: { value: "7" } });
    fireEvent.change(tierTwoInput, { target: { value: "9" } });

    expect(props.onTierChange).toHaveBeenNthCalledWith(1, 1, "7");
    expect(props.onTierChange).toHaveBeenNthCalledWith(2, 2, "9");
    expect(props.tierTitle).toHaveBeenCalledWith(1);
    expect(props.tierTitle).toHaveBeenCalledWith(2);
    expect(props.ruleDescription).toHaveBeenCalledWith(1);
    expect(props.ruleDescription).toHaveBeenCalledWith(2);
  });

  it("nao mostra preset sem criterio e bloqueia inputs durante salvamento", () => {
    renderBadgeTierRulesCard({
      selectedCriterion: "",
      isSaving: true,
      legacyValueModeWarning: "",
    });

    expect(
      screen.queryByText("Preset para criterio selecionado.")
    ).not.toBeInTheDocument();

    const inputs = screen.getAllByRole("spinbutton");
    expect(inputs).toHaveLength(2);
    inputs.forEach((input) => {
      expect(input).toBeDisabled();
    });
  });
});
