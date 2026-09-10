import "./collection.css";
import * as THREE from "three";
import { createFish } from "./fish/createFish";
import type { FishSpecies } from "./fish/species";

/** Let the modal paint and input handlers run between preview captures. */
function afterPaint(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(finish, 0);
    });
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Capture models only on demand; dispose the single preview context afterwards. */
async function createThumbnails(
  entries: FishSpecies[],
  onThumbnail: (id: string, source: string) => void,
  signal: AbortSignal,
): Promise<void> {
  await afterPaint(signal);
  if (signal.aborted) return;
  let renderer: THREE.WebGLRenderer | undefined;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(720, 400);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.16;
    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight("#ffffff", 3.5));
    const aspect = 720 / 400;
    const camera = new THREE.OrthographicCamera(
      -3.1,
      3.1,
      3.1 / aspect,
      -3.1 / aspect,
      0.1,
      30,
    );
    camera.position.set(0.35, 0.06, 10);
    camera.lookAt(0.35, 0.06, 0);

    for (const entry of entries) {
      await afterPaint(signal);
      if (signal.aborted) break;
      let fish: ReturnType<typeof createFish> | undefined;
      try {
        fish = createFish(entry);
        scene.add(fish.group);
        fish.update(0);
        renderer.render(scene, camera);
        onThumbnail(entry.id, renderer.domElement.toDataURL("image/png"));
      } catch (error) {
        // A failed model preview must not prevent the other cards from loading.
        console.warn(
          `${entry.name}のプレビューを作成できませんでした。`,
          error,
        );
      } finally {
        if (fish) {
          scene.remove(fish.group);
          fish.dispose();
        }
      }
    }
  } catch (error) {
    // The aquarium remains usable if the browser cannot allocate a preview context.
    console.warn("図鑑のプレビューを作成できませんでした。", error);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function createFishCollection(
  dialog: HTMLDialogElement,
  entries: FishSpecies[],
  onSelect: (entry: FishSpecies) => void,
): {
  setSelected(id: string): void;
  prepare(): Promise<void>;
  dispose(): void;
} {
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const header = element("div", "catalogue-header");
  const heading = element("div", "catalogue-heading");
  const title = element("h2", "catalogue-title", "図鑑");
  title.id = "collection-title";
  const count = element(
    "span",
    "catalogue-count",
    `${String(entries.length).padStart(2, "0")} 種`,
  );
  heading.append(title, count);

  const close = element("button", "catalogue-close");
  close.type = "button";
  close.setAttribute("aria-label", "図鑑を閉じる");
  close.title = "閉じる";
  close.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  close.addEventListener("click", () => dialog.close(), listenerOptions);
  header.append(heading, close);

  const list = element("div", "catalogue-grid");
  list.id = "collection-list";
  const placeholders = new Map<string, HTMLElement>();
  const buttons = entries.map((entry) => {
    const button = element("button", "catalogue-card");
    button.type = "button";
    button.id = `select-${entry.id}`;
    button.setAttribute("aria-pressed", "false");

    const preview = element("span", "catalogue-preview");
    preview.setAttribute("aria-hidden", "true");
    const number = element("span", "catalogue-number", entry.number);
    const selected = element("span", "catalogue-selected", "選択中");
    const placeholder = element("span", "catalogue-placeholder", entry.kanji);
    placeholders.set(entry.id, placeholder);
    preview.append(placeholder);
    preview.append(number, selected);

    const details = element("span", "catalogue-details");
    const nameRow = element("span", "catalogue-name-row");
    const name = element("span", "catalogue-name", entry.name);
    name.id = `catalogue-name-${entry.id}`;
    button.setAttribute("aria-labelledby", name.id);
    nameRow.append(name, element("span", "catalogue-kanji", entry.kanji));
    const metadata = element("span", "catalogue-metadata");
    metadata.append(
      element("span", "catalogue-family", entry.family),
      element("span", "catalogue-length", entry.lengthLabel),
    );
    details.append(nameRow, metadata);
    button.append(preview, details);
    button.addEventListener(
      "click",
      () => {
        onSelect(entry);
        setSelected(entry.id);
        dialog.close();
      },
      listenerOptions,
    );
    list.append(button);
    return button;
  });

  dialog.setAttribute("aria-labelledby", title.id);
  dialog.removeAttribute("aria-label");
  dialog.replaceChildren(header, list);

  function setSelected(id: string) {
    buttons.forEach((button) => {
      const selected = button.id === `select-${id}`;
      button.setAttribute("aria-pressed", String(selected));
      button.autofocus = selected;
    });
  }

  let preparation: Promise<void> | undefined;
  function prepare(): Promise<void> {
    if (events.signal.aborted) return Promise.resolve();
    // Keep the same job and captured images across close/reopen and selection.
    preparation ??= createThumbnails(
      entries,
      (id, source) => {
        const image = element("img", "catalogue-image");
        image.src = source;
        image.alt = "";
        image.width = 720;
        image.height = 400;
        image.draggable = false;
        image.decoding = "async";
        placeholders.get(id)?.replaceWith(image);
        placeholders.delete(id);
      },
      events.signal,
    );
    return preparation;
  }

  function dispose() {
    if (events.signal.aborted) return;
    events.abort();
    dialog.close();
    dialog.replaceChildren();
    placeholders.clear();
  }

  return { setSelected, prepare, dispose };
}
