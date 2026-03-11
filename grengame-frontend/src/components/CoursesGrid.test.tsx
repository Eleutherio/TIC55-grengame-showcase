import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import CoursesGrid from "./CoursesGrid";

type CoursesGridProps = ComponentProps<typeof CoursesGrid>;

const baseCourses: CoursesGridProps["filteredCourses"] = [
  {
    id: 1,
    name: "Jogo A",
    description: "Descricao A",
    category: "Aventura",
    banner: "/banner-a.png",
    created_at: "2023-01-01",
    updated_at: "2024-01-01",
    course_points: 150,
    progress_percentage: 150,
  },
  {
    id: 2,
    name: "Jogo B",
    description: "Descricao B",
    category: "Puzzle",
    banner: null,
    created_at: "2022-01-01",
    course_points: 50,
    progress_percentage: -10,
  },
];

const renderCoursesGrid = (overrides: Partial<CoursesGridProps> = {}) => {
  const props: CoursesGridProps = {
    isLoading: false,
    isLoadingMore: false,
    filteredCourses: baseCourses,
    selectedCourseId: null,
    isEnrolling: false,
    isDropping: false,
    onSelectCourse: vi.fn(),
    onOpenCourse: vi.fn(),
    isCourseEnrolled: vi.fn((course) => course.id === 1),
    getBannerStyle: vi.fn(() => ({ backgroundImage: "url(/banner.png)" })),
    formatDate: vi.fn(() => "DATA"),
    ...overrides,
  };

  return {
    props,
    ...render(<CoursesGrid {...props} />),
  };
};

describe("CoursesGrid", () => {
  it("renderiza skeletons quando está carregando", () => {
    const { container } = renderCoursesGrid({
      isLoading: true,
      filteredCourses: [],
    });

    expect(container.querySelectorAll(".skeleton-card")).toHaveLength(3);
  });

  it("renderiza skeletons adicionais ao carregar mais cards", () => {
    const { container } = renderCoursesGrid({
      isLoading: false,
      isLoadingMore: true,
      loadingMoreSkeletonCount: 2,
    });

    expect(container.querySelectorAll(".skeleton-card")).toHaveLength(2);
  });

  it("renderiza cards e dispara callbacks de seleção e abertura", () => {
    const { props } = renderCoursesGrid();

    const card = screen.getByRole("group", {
      name: /Selecionar curso Jogo A/i,
    });
    fireEvent.click(card);
    expect(props.onSelectCourse).toHaveBeenCalledTimes(1);

    const openButton = screen.getAllByRole("button", { name: /Abrir/i })[0];
    fireEvent.click(openButton);
    expect(props.onOpenCourse).toHaveBeenCalledTimes(1);
  });

  it("aplica estado de mutação no card selecionado", () => {
    renderCoursesGrid({
      selectedCourseId: 1,
      isEnrolling: true,
    });

    expect(screen.getAllByText("Processando...")).toHaveLength(1);
  });

  it("clampa progresso e chama helpers", () => {
    const { props } = renderCoursesGrid();

    expect(screen.getByText("100% concluído")).toBeInTheDocument();
    expect(screen.getByText("0% concluído")).toBeInTheDocument();

    expect(props.getBannerStyle).toHaveBeenCalledWith("/banner-a.png");
    expect(props.formatDate).toHaveBeenCalledWith("2024-01-01");
    expect(props.formatDate).toHaveBeenCalledWith("2022-01-01");

    expect(props.isCourseEnrolled).toHaveBeenCalledTimes(2);
    expect(props.isCourseEnrolled).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1 })
    );
    expect(screen.getByText("Finalizado")).toBeInTheDocument();
  });
});
