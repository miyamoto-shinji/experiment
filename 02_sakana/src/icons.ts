const fishPath =
  '<path d="M2 12c5-8 12-8 16 0-4 8-11 8-16 0Zm16 0 5-5v10l-5-5Z"/><circle cx="7" cy="11" r=".8" fill="currentColor" stroke="none"/>';

const paths = {
  grid: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  fish: fishPath,
  school: `<g transform="translate(2 0) scale(.6)">${fishPath}</g><g transform="translate(7 10) scale(.6)">${fishPath}</g>`,
  shrimp: '<path d="M16 7c-4-2-9 0-10 4s2 8 6 8c3 0 5-2 5-4-3 2-6 1-6-1s2-3 5-2l3-3-3-2ZM7 9l4 3m-5 1 5 1m-4 3 5-1m0 3 1-3m3-9c0-3 2-4 5-4m-4 5c2-1 4-1 5 0M17 15l4 1-3 3-2-2M11 11l-1-4"/><circle cx="15.5" cy="9" r=".75" fill="currentColor" stroke="none"/>',
};

type IconName = keyof typeof paths;

function renderIcon(name: IconName): string {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}

export function initializeIcons(): void {
  document.querySelectorAll<HTMLElement>("[data-icon]").forEach((element) => {
    const name = element.dataset.icon;
    if (!name || !Object.hasOwn(paths, name))
      throw new Error(`Unknown icon: ${name}`);
    element.innerHTML = renderIcon(name as IconName);
  });
}

/** Keep the visible icon, hover label and accessible name in sync. */
export function setButtonIcon(
  button: HTMLButtonElement,
  name: IconName,
  label: string,
): void {
  button.innerHTML = renderIcon(name);
  button.title = label;
  button.setAttribute("aria-label", label);
}
