import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CourseCard from "./CourseCard";

type CourseCardProps = ComponentProps<typeof CourseCard>;
type CourseCardOverrides = Omit<Partial<CourseCardProps>, "course"> & {
  course?: Partial<CourseCardProps["course"]>;
};

const baseCourse: CourseCardProps["course"] = {
  id: 1,
  name: "Jogo A",
  description: "Descricao A",
  category: "Aventura",
  banner: "/banner.png",
  course_points: 120,
  progress_percentage: 40,
};

const renderCourseCard = (overrides: CourseCardOverrides = {}) => {
  const { course: courseOverride, ...restOverrides } = overrides;
  const props: CourseCardProps = {
    course: { ...baseCourse, ...(courseOverride ?? {}) },
    isSelected: false,
    isEnrolled: false,
    isMutating: false,
    progress: 40,
    bannerStyle: { backgroundImage: "url(/banner.png)" },
    lastUpdatedLabel: "Hoje",
    onSelect: vi.fn(),
    onOpen: vi.fn(),
    ...restOverrides,
  };

  return {
    props,
    ...render(<CourseCard {...props} />),
  };
};

describe("CourseCard", () => {
  it("renderiza informações principais, progresso e atualização", () => {
    renderCourseCard();

    expect(
      screen.getByRole("group", { name: /Selecionar curso Jogo A/i })
    ).toBeInTheDocument();
    expect(screen.getByText("Jogo A")).toBeInTheDocument();
    expect(screen.getByText("Aventura")).toBeInTheDocument();
    expect(screen.getByText("Descricao A")).toBeInTheDocument();
    expect(screen.getByText("+120")).toBeInTheDocument();
    expect(screen.getByText("Sem desafios")).toBeInTheDocument();
    expect(screen.getByText(/Atualizado: Hoje/i)).toBeInTheDocument();

    const progressbar = screen.getByRole("progressbar", {
      name: /Progresso do game Jogo A/i,
    });
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
    expect(progressbar).toHaveAttribute("aria-valuenow", "40");
    expect(progressbar).toHaveAttribute(
      "aria-valuetext",
      expect.stringMatching(/40%/i)
    );
    expect(screen.getByText(/40%/i)).toBeInTheDocument();
  });

  it("aplica classe de selecionado e aria-pressed", () => {
    renderCourseCard({ isSelected: true });
    const card = screen.getByRole("group", { name: /Selecionar curso Jogo A/i });
    expect(card).toHaveClass("selected");
    expect(card).toHaveAttribute("aria-pressed", "true");
  });

  it("exibe badge de jogando quando inscrito e oculta a tag de pontos", () => {
    renderCourseCard({ isEnrolled: true });
    expect(
      screen.getByText("Jogando", { selector: ".enrolled-badge" })
    ).toBeInTheDocument();
    expect(screen.queryByText("+120")).not.toBeInTheDocument();
  });

  it("exibe badge de finalizado quando inscrito e progresso chega a 100%", () => {
    renderCourseCard({ isEnrolled: true, progress: 100 });
    expect(
      screen.getByText("Finalizado", { selector: ".enrolled-badge" })
    ).toBeInTheDocument();
    expect(screen.queryByText("Jogando")).not.toBeInTheDocument();
  });

  it("renderiza badge de desafios disponíveis quando informado", () => {
    renderCourseCard({ challengesStatus: "available" });
    expect(screen.getByText("★ Desafios disponíveis! ★")).toBeInTheDocument();
  });

  it("renderiza badge de desafios completos quando informado", () => {
    renderCourseCard({ challengesStatus: "completed" });
    expect(screen.getByText("Desafios completos")).toBeInTheDocument();
  });

  it("exibe o pill de mutação quando está processando", () => {
    renderCourseCard({ isMutating: true });
    expect(screen.getByText("Processando...")).toBeInTheDocument();
  });

  it("chama onSelect ao clicar e ao usar Enter/Espaço", () => {
    const { props } = renderCourseCard();
    const card = screen.getByRole("group", { name: /Selecionar curso Jogo A/i });

    fireEvent.click(card);
    fireEvent.keyDown(card, { key: "Enter" });
    fireEvent.keyDown(card, { key: " " });

    expect(props.onSelect).toHaveBeenCalledTimes(3);
    expect(props.onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 })
    );
  });

  it("não chama onSelect em teclas irrelevantes", () => {
    const { props } = renderCourseCard();
    const card = screen.getByRole("group", { name: /Selecionar curso Jogo A/i });
    fireEvent.keyDown(card, { key: "Escape" });
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("chama onOpen no botão Abrir e evita onSelect", () => {
    const { props } = renderCourseCard();
    const button = screen.getByRole("button", { name: /Abrir/i });
    fireEvent.click(button);

    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it("abre o foco com duplo clique no card", () => {
    const { props } = renderCourseCard();
    const card = screen.getByRole("group", { name: /Selecionar curso Jogo A/i });

    fireEvent.doubleClick(card);

    expect(props.onOpen).toHaveBeenCalledTimes(1);
    expect(props.onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 })
    );
  });

  it("aplica estilo de banner e classe quando existe banner", () => {
    renderCourseCard({
      course: { banner: "/banner.png" },
      bannerStyle: { backgroundImage: "url(/banner.png)" },
    });
    const thumb = screen.getByRole("img", {
      name: /Banner do game Jogo A/i,
    });
    expect(thumb).toHaveClass("has-banner");
    expect(thumb).toHaveStyle({ backgroundImage: "url(/banner.png)" });
  });

  it("usa fallback de categoria e descrição quando vazias", () => {
    renderCourseCard({
      course: { category: undefined, description: "" },
    });
    expect(screen.getByText("Sem categoria")).toBeInTheDocument();
    expect(
      screen.getByText(/Sem descrição disponível no momento/i)
    ).toBeInTheDocument();
  });
});