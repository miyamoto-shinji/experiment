import { createFishCollection } from "./collection";
import { getElement } from "./dom";
import type { FishSpecies } from "./fish/species";
import { initializeIcons, setButtonIcon } from "./icons";
import { initializeOceanDepth } from "./oceanDepth";

interface AquariumActions {
  selectSpecies(species: FishSpecies): void;
  toggleSchool(): boolean;
  feed(): void;
  resetView(): void;
  zoom(factor: number): void;
  setDepth(depth: number): void;
}

/** UI events and labels stay independent of Three.js and the swimming simulation. */
export function createAquariumUI(
  container: HTMLElement,
  canvas: HTMLCanvasElement,
  entries: FishSpecies[],
  initialSpecies: FishSpecies,
  actions: AquariumActions,
) {
  initializeIcons();
  const events = new AbortController();
  const listenerOptions = { signal: events.signal };
  const dialog = getElement<HTMLDialogElement>("collection-dialog");
  const toastElement = getElement("toast");
  const schoolButton = getElement<HTMLButtonElement>("school");
  const feedButton = getElement<HTMLButtonElement>("feed");
  const fullscreenButton = getElement<HTMLButtonElement>("fullscreen");
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;

  function notify(message: string) {
    if (disposed) return;
    toastElement.textContent = message;
    toastElement.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(
      () => toastElement.classList.remove("visible"),
      2400,
    );
  }

  const collection = createFishCollection(
    dialog,
    entries,
    actions.selectSpecies,
  );
  getElement("species-count").textContent = String(entries.length).padStart(
    2,
    "0",
  );
  getElement("collection-open").addEventListener(
    "click",
    () => {
      dialog.showModal();
      void collection.prepare();
    },
    listenerOptions,
  );
  dialog.addEventListener(
    "click",
    (event) => {
      const bounds = dialog.getBoundingClientRect();
      if (
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom
      )
        dialog.close();
    },
    listenerOptions,
  );

  function setSpecies(entry: FishSpecies) {
    getElement("species-number").textContent = `NO. ${entry.number}`;
    getElement("species-name").textContent = entry.name;
    getElement("species-kanji").textContent = entry.kanji;
    getElement("species-family").textContent = entry.family;
    getElement("species-length").textContent = `全長 ${entry.lengthLabel}`;
    getElement("species-description").replaceChildren(
      document.createTextNode(entry.description[0]),
      document.createElement("br"),
      document.createTextNode(entry.description[1]),
    );
    canvas.setAttribute("aria-label", `${entry.name}が泳ぐ3Dビュー`);
    container.setAttribute(
      "aria-label",
      `泳ぐ${entry.name}の3D水槽。ドラッグで回転、拡大・縮小ボタンで大きさを変更できます。`,
    );
    collection.setSelected(entry.id);
  }

  function setSchoolActive(active: boolean) {
    schoolButton.setAttribute("aria-pressed", String(active));
    setButtonIcon(
      schoolButton,
      active ? "fish" : "school",
      active ? "1匹に戻す" : "群れにする",
    );
  }

  function setCanFeed(available: boolean) {
    feedButton.disabled = !available;
  }

  schoolButton.addEventListener(
    "click",
    () => setSchoolActive(actions.toggleSchool()),
    listenerOptions,
  );
  feedButton.addEventListener("click", actions.feed, listenerOptions);
  getElement("reset-view").addEventListener(
    "click",
    () => {
      actions.resetView();
      notify("もとの視点に戻しました");
    },
    listenerOptions,
  );
  getElement("zoom-in").addEventListener(
    "click",
    () => actions.zoom(0.85),
    listenerOptions,
  );
  getElement("zoom-out").addEventListener(
    "click",
    () => actions.zoom(1.18),
    listenerOptions,
  );
  fullscreenButton.addEventListener(
    "click",
    async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (document.documentElement.requestFullscreen)
          await document.documentElement.requestFullscreen();
        else notify("このブラウザでは全画面表示を利用できません");
      } catch {
        notify("全画面表示に切り替えられませんでした");
      }
    },
    listenerOptions,
  );
  document.addEventListener(
    "fullscreenchange",
    () => {
      setButtonIcon(
        fullscreenButton,
        "expand",
        document.fullscreenElement ? "全画面表示を終了" : "全画面表示",
      );
    },
    listenerOptions,
  );

  const disposeDepth = initializeOceanDepth(actions.setDepth);
  setSpecies(initialSpecies);
  setSchoolActive(false);
  setCanFeed(true);

  function dispose() {
    if (disposed) return;
    disposed = true;
    events.abort();
    clearTimeout(toastTimer);
    toastElement.classList.remove("visible");
    disposeDepth();
    collection.dispose();
  }

  return { setSpecies, setSchoolActive, setCanFeed, notify, dispose };
}
