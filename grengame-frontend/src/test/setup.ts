import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock basico de IntersectionObserver (evita erro em componentes que observam scroll/viewport)
class IntersectionObserverMock {
  callback: IntersectionObserverCallback;

  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
  }

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
}

// Disponibiliza globalmente para os testes
if (typeof window !== "undefined") {
  // @ts-expect-error mock de teste
  window.IntersectionObserver = IntersectionObserverMock;
}
