type CourseFiltersProps = {
  searchTerm: string;
  onSearchTermChange: (value: string) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categories: string[];
  onReset: () => void;
  noResults: boolean;
};

export default function CourseFilters({
  searchTerm,
  onSearchTermChange,
  categoryFilter,
  onCategoryFilterChange,
  categories,
  onReset,
  noResults,
}: CourseFiltersProps) {
  return (
    <section className="filters" aria-labelledby="filters-title">
      <h2 id="filters-title" className="sr-only">
        Filtros de busca
      </h2>
      <div className="filter-group">
        <label htmlFor="search-course">Buscar game</label>
        <input
          id="search-course"
          type="text"
          placeholder="Digite o nome, tema ou categoria..."
          value={searchTerm}
          aria-describedby={noResults ? "filters-hint-error" : undefined}
          onChange={(event) => onSearchTermChange(event.target.value)}
        />
      </div>
      <div className="filter-group">
        <label htmlFor="category-select">Categoria</label>
        <select
          id="category-select"
          value={categoryFilter}
          aria-describedby={noResults ? "filters-hint-error" : undefined}
          onChange={(event) => onCategoryFilterChange(event.target.value)}
        >
          <option value="todas">Todas</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      <button type="button" className="ghost-button" onClick={onReset}>
        Limpar filtros
      </button>
      {noResults && (
        <p className="filter-hint-error" role="alert" id="filters-hint-error">
          Nenhum resultado encontrado. Tente buscar pelo título, categoria ou
          palavra-chave.
        </p>
      )}
    </section>
  );
}
