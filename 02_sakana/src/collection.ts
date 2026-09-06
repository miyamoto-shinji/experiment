import "./collection.css";
import * as THREE from "three";
import { createFish } from "./fish/createFish";
import type { FishSpecies } from "./fish/species";

/** Capture the actual models once; the catalogue keeps no extra WebGL contexts. */
function createThumbnails(entries: FishSpecies[]): Map<string, string> {
  const thumbnails = new Map<string, string>();
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
    const camera = new THREE.OrthographicCamera(-3.1, 3.1, 3.1 / aspect, -3.1 / aspect, 0.1, 30);
    camera.position.set(0.35, 0.06, 10);
    camera.lookAt(0.35, 0.06, 0);

    for (const entry of entries) {
      const fish = createFish(entry);
      try {
        scene.add(fish.group);
        fish.update(0);
        renderer.render(scene, camera);
        thumbnails.set(entry.id, renderer.domElement.toDataURL("image/png"));
      } finally {
        scene.remove(fish.group);
        fish.dispose();
      }
    }
  } catch (error) {
    // The aquarium remains usable if the browser cannot allocate a preview context.
    console.warn("図鑑のプレビューを作成できませんでした。", error);
  } finally {
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
  return thumbnails;
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
): { setSelected(id: string): void } {
  const header = element("div", "catalogue-header");
  const heading = element("div", "catalogue-heading");
  const title = element("h2", "catalogue-title", "図鑑");
  title.id = "collection-title";
  const count = element("span", "catalogue-count", `${String(entries.length).padStart(2, "0")} 種`);
  heading.append(title, count);

  const close = element("button", "catalogue-close");
  close.type = "button";
  close.setAttribute("aria-label", "図鑑を閉じる");
  close.title = "閉じる";
  close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  close.addEventListener("click", () => dialog.close());
  header.append(heading, close);

  const list = element("div", "catalogue-grid");
  list.id = "collection-list";
  const thumbnails = createThumbnails(entries);
  const buttons = entries.map((entry) => {
    const button = element("button", "catalogue-card");
    button.type = "button";
    button.id = `select-${entry.id}`;
    button.setAttribute("aria-pressed", "false");

    const preview = element("span", "catalogue-preview");
    preview.setAttribute("aria-hidden", "true");
    const number = element("span", "catalogue-number", entry.number);
    const selected = element("span", "catalogue-selected", "選択中");
    const source = thumbnails.get(entry.id);
    if (source) {
      const image = element("img", "catalogue-image");
      image.src = source;
      image.alt = "";
      image.width = 720;
      image.height = 400;
      image.draggable = false;
      preview.append(image);
    } else {
      preview.append(element("span", "catalogue-placeholder", entry.kanji));
    }
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
    button.addEventListener("click", () => {
      onSelect(entry);
      setSelected(entry.id);
      dialog.close();
    });
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
  return { setSelected };
}
