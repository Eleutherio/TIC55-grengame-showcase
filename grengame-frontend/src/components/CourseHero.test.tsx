import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CourseHero from "./CourseHero";

type CourseHeroProps = ComponentProps<typeof CourseHero>;

const baseCourse: NonNullable<CourseHeroProps["activeCourse"]> = {
  id: 1,
  name: "Jogo A",
  description: "Descricao A",
  category: "Aventura",
  created_at: "2024-01-01",
  updated_at: "2024-02-01",
};

const renderCourseHero = (overrides: Partial<CourseHeroProps> = {}) => {
  const props: CourseHeroProps = {
    dicaText: "Dica legal",
    onPauseDica: vi.fn(),
    onResumeDica: vi.fn(),
    onToggleDica: vi.fn(),
    isLoading: false,
    coursesCount: 5,
    categoriesCount: 2,
    activeCourse: baseCourse,
    isActiveCourseEnrolled: false,
    activeCourseLastUpdatedLabel: "10/10/2024",
    isEnrolling: false,
    isDropping: false,
    feedbackMessage: null,
    enrollError: null,
    onConfirmInscricao: vi.fn(),
    onAbandonar: vi.fn(),
    ...overrides,
  };

  return {
    props,
    ...render(<CourseHero {...props} />),
  };
};

describe("CourseHero", () => {
  it("dispara handlers de dica em hover, foco e teclado", () => {
    const { props } = renderCourseHero();
    const callout = screen.getByRole("button", { name: /Dica legal/i });

    fireEvent.mouseEnter(callout);
    fireEvent.mouseLeave(callout);
    fireEvent.focus(callout);
    fireEvent.blur(callout);
    fireEvent.keyDown(callout, { key: "Enter" });
    fireEvent.keyDown(callout, { key: " " });
    fireEvent.keyDown(callout, { key: "Escape" });

    expect(props.onPauseDica).toHaveBeenCalledTimes(2);
    expect(props.onResumeDica).toHaveBeenCalledTimes(2);
    expect(props.onToggleDica).toHaveBeenCalledTimes(2);
  });

  it("mostra contagens formatadas e placeholders quando carregando", () => {
    renderCourseHero({ isLoading: false, coursesCount: 5, categoriesCount: 2 });
    expect(screen.getByText("05")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();

    renderCourseHero({ isLoading: true });
    expect(screen.getAllByText("--").length).toBeGreaterThan(0);
  });

  it("renderiza curso ativo, status e ações quando inscrito", () => {
    const { props } = renderCourseHero({
      isActiveCourseEnrolled: true,
      feedbackMessage: "Tudo certo",
      enrollError: "Erro ao iniciar",
    });

    expect(screen.getByText(/Pronto para jogar/i)).toBeInTheDocument();
    expect(screen.getByText("Jogo A")).toBeInTheDocument();
    expect(screen.getByText("Aventura")).toBeInTheDocument();
    expect(screen.getByText("Descricao A")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado em 10\/10\/2024/i)).toBeInTheDocument();
    expect(screen.getByText(/Você está jogando/i)).toBeInTheDocument();
    expect(screen.getByText("Tudo certo")).toBeInTheDocument();
    expect(screen.getByText("Erro ao iniciar")).toBeInTheDocument();

    const confirmButton = screen.getByRole("button", {
      name: /Continuar jogando/i,
    });
    fireEvent.click(confirmButton);
    expect(props.onConfirmInscricao).toHaveBeenCalledTimes(1);

    const abandonButton = screen.getByRole("button", {
      name: /Abandonar jogo/i,
    });
    fireEvent.click(abandonButton);
    expect(props.onAbandonar).toHaveBeenCalledTimes(1);
  });

  it("mostra estado de carregamento no botão e aviso de saída", () => {
    renderCourseHero({
      isActiveCourseEnrolled: true,
      isEnrolling: true,
      isDropping: true,
    });

    expect(
      screen.getByRole("button", { name: /Iniciando/i })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Saindo/i })
    ).toBeInTheDocument();
  });

  it("renderiza estado sem curso ativo", () => {
    renderCourseHero({
      activeCourse: null,
      isActiveCourseEnrolled: false,
    });

    expect(screen.getByText(/Nenhum/i)).toBeInTheDocument();
    expect(screen.getByText(/Você ainda não jogou/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Continuar jogando/i })
    ).not.toBeInTheDocument();
  });
});
