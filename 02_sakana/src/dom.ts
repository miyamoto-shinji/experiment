/** Resolve required interface elements with a useful startup error. */
export function getElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Required element not found: ${id}`);
  return element as T;
}
