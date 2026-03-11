import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import BadgePreviewCard from "./BadgePreviewCard";

type Props = ComponentProps<typeof BadgePreviewCard>;

const renderBadgePreviewCard = (overrides: Partial<Props> = {}) => {
  const tierTitle = vi.fn(
    (criterion: Props["criterion"], tier: 1 | 2 | 3 | 4 | 5) =>
      `Titulo ${criterion ?? "none"} ${tier}`
  );
  const ruleDescription = vi.fn(
    (tier: 1 | 2 | 3 | 4 | 5) => `Regra do tier ${tier}`
  );

  const props: Props = {
    gameName: "Game de Teste",
    tierAssets: [
      { tier: 1, image: "/tier1.png" },
      { tier: 2, image: "/tier2.png" },
    ],
    criterion: "course_points",
    tierTitle,
    ruleDescription,
    ...overrides,
  };

  return {
    props,
    ...render(<BadgePreviewCard {...props} />),
  };
};

describe("BadgePreviewCard", () => {
  it("renderiza cabecalho, lista de tiers e textos calculados", () => {
    const { props } = renderBadgePreviewCard();

    expect(
      screen.getByRole("region", { name: /Pre-visualizacao das badges/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /Pre-visualizacao/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Game de Teste")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    expect(screen.getByAltText("Titulo course_points 1")).toBeInTheDocument();
    expect(screen.getByAltText("Titulo course_points 2")).toBeInTheDocument();
    expect(screen.getByText("Regra do tier 1")).toBeInTheDocument();
    expect(screen.getByText("Regra do tier 2")).toBeInTheDocument();

    expect(props.tierTitle).toHaveBeenCalledWith("course_points", 1);
    expect(props.tierTitle).toHaveBeenCalledWith("course_points", 2);
    expect(props.tierTitle).toHaveBeenCalledTimes(4);
    expect(props.ruleDescription).toHaveBeenCalledTimes(2);
    expect(props.ruleDescription).toHaveBeenNthCalledWith(1, 1);
    expect(props.ruleDescription).toHaveBeenNthCalledWith(2, 2);
  });

  it("nao renderiza itens quando nao ha assets", () => {
    const { props } = renderBadgePreviewCard({ tierAssets: [] });

    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(props.tierTitle).not.toHaveBeenCalled();
    expect(props.ruleDescription).not.toHaveBeenCalled();
  });
});
