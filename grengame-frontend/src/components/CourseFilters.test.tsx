import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CourseFilters from "./CourseFilters";

type CourseFiltersProps = ComponentProps<typeof CourseFilters>;

const renderCourseFilters = (overrides: Partial<CourseFiltersProps> = {}) => {
  const props: CourseFiltersProps = {
    searchTerm: "jogo",
    onSearchTermChange: vi.fn(),
    categoryFilter: "todas",
    onCategoryFilterChange: vi.fn(),
    categories: ["Aventura", "Puzzle"],
    onReset: vi.fn(),
    noResults: false,
    ...overrides,
  };

  return {
    props,
    ...render(<CourseFilters {...props} />),
  };
};

describe("CourseFilters", () => {
  it("renderiza labels, campos e opções de categoria", () => {
    renderCourseFilters();

    const searchInput = screen.getByLabelText(/Buscar game/i);
    expect(searchInput).toHaveAttribute(
      "placeholder",
      "Digite o nome, tema ou categoria..."
    );
    expect(searchInput).toHaveValue("jogo");

    const categorySelect = screen.getByLabelText(/Categoria/i);
    expect(categorySelect).toHaveValue("todas");
    expect(screen.getByRole("option", { name: "Todas" })).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Aventura" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Puzzle" })
    ).toBeInTheDocument();
  });

  it("dispara onSearchTermChange ao digitar", () => {
    const { props } = renderCourseFilters();
    const searchInput = screen.getByLabelText(/Buscar game/i);

    fireEvent.change(searchInput, { target: { value: "novo" } });
    expect(props.onSearchTermChange).toHaveBeenCalledTimes(1);
    expect(props.onSearchTermChange).toHaveBeenCalledWith("novo");
  });

  it("dispara onCategoryFilterChange ao alterar categoria", () => {
    const { props } = renderCourseFilters();
    const categorySelect = screen.getByLabelText(/Categoria/i);

    fireEvent.change(categorySelect, { target: { value: "Puzzle" } });
    expect(props.onCategoryFilterChange).toHaveBeenCalledTimes(1);
    expect(props.onCategoryFilterChange).toHaveBeenCalledWith("Puzzle");
  });

  it("dispara onReset ao clicar em limpar filtros", () => {
    const { props } = renderCourseFilters();
    const button = screen.getByRole("button", { name: /Limpar filtros/i });

    fireEvent.click(button);
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("exibe mensagem de nenhum resultado e associa aria-describedby", () => {
    renderCourseFilters({ noResults: true });

    const hint = screen.getByRole("alert");
    expect(hint).toHaveTextContent(/Nenhum resultado encontrado/i);
    expect(hint).toHaveAttribute("id", "filters-hint-error");

    const searchInput = screen.getByLabelText(/Buscar game/i);
    const categorySelect = screen.getByLabelText(/Categoria/i);
    expect(searchInput).toHaveAttribute("aria-describedby", "filters-hint-error");
    expect(categorySelect).toHaveAttribute(
      "aria-describedby",
      "filters-hint-error"
    );
  });

  it("não exibe hint quando não há erro e não seta aria-describedby", () => {
    renderCourseFilters({ noResults: false });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    const searchInput = screen.getByLabelText(/Buscar game/i);
    const categorySelect = screen.getByLabelText(/Categoria/i);
    expect(searchInput).not.toHaveAttribute("aria-describedby");
    expect(categorySelect).not.toHaveAttribute("aria-describedby");
  });
});
