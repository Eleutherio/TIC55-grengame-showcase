import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CourseFocus from "./CourseFocus";

type CourseFocusProps = ComponentProps<typeof CourseFocus>;
type CourseFocusOverrides = Omit<Partial<CourseFocusProps>, "course"> & {
  course?: Partial<CourseFocusProps["course"]>;
};

const baseCourse: CourseFocusProps["course"] = {
  id: 1,
  name: "Jogo A",
  description: "Descricao A",
  category: "Aventura",
  banner: "/banner.png",
  course_points: 200,
};

const renderCourseFocus = (overrides: CourseFocusOverrides = {}) => {
  const { course: courseOverride, ...restOverrides } = overrides;
  const props: CourseFocusProps = {
    course: { ...baseCourse, ...(courseOverride ?? {}) },
    progress: 55,
    bannerStyle: { backgroundImage: "url(/banner.png)" },
    lastUpdatedLabel: "01/01/2024",
    isEnrolled: false,
    onClose: vi.fn(),
    onConfirm: vi.fn(),
    ...restOverrides,
  };

  return {
    props,
    ...render(<CourseFocus {...props} />),
  };
};

describe("CourseFocus", () => {
  it("renderiza informações do curso e progresso", () => {
    renderCourseFocus();

    expect(screen.getByRole("heading", { name: /Jogo A/i })).toBeInTheDocument();
    expect(screen.getByText("Aventura")).toBeInTheDocument();
    expect(screen.getByText("Descricao A")).toBeInTheDocument();
    expect(screen.getByText("+200 pontos")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado: 01\/01\/2024/i)).toBeInTheDocument();
    expect(screen.getByText("55% concluído")).toBeInTheDocument();

    const progressbar = screen.getByRole("progressbar", {
      name: /Progresso do game Jogo A/i,
    });
    expect(progressbar).toHaveAttribute("aria-valuenow", "55");
  });

  it("exibe badge de desafios quando existir status", () => {
    renderCourseFocus({ challengesStatus: "available" });

    expect(screen.getByText(/Desafios disponíveis/i)).toBeInTheDocument();
  });

  it("aplica banner quando existe imagem", () => {
    renderCourseFocus({
      course: { banner: "/banner.png" },
      bannerStyle: { backgroundImage: "url(/banner.png)" },
    });

    const banner = screen.getByRole("img", {
      name: /Banner do game Jogo A/i,
    });
    expect(banner).toHaveClass("has-banner");
    expect(banner).toHaveStyle({ backgroundImage: "url(/banner.png)" });
  });

  it("exibe fallbacks de categoria e descrição", () => {
    renderCourseFocus({
      course: { category: undefined, description: "" },
    });

    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(
      screen.getByText(/Sem descrição disponível no momento/i)
    ).toBeInTheDocument();
  });

  it("chama onClose e onConfirm e ajusta o texto do CTA", () => {
    const { props } = renderCourseFocus();

    const closeButton = screen.getByRole("button", { name: /Voltar/i });
    fireEvent.click(closeButton);
    expect(props.onClose).toHaveBeenCalledTimes(1);

    const confirmButton = screen.getByRole("button", { name: /Quero jogar/i });
    fireEvent.click(confirmButton);
    expect(props.onConfirm).toHaveBeenCalledTimes(1);

    renderCourseFocus({ isEnrolled: true });
    expect(
      screen.getByRole("button", { name: /Continuar jogando/i })
    ).toBeInTheDocument();
  });
});
