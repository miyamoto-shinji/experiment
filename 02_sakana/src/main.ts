import "./style.css";
import { createAquariumFish } from "./aquariumFish";
import { createAquariumUI } from "./aquariumUI";
import { createAquariumView } from "./aquariumView";
import { getElement } from "./dom";
import { species } from "./fish/species";
import { createOceanEnvironment } from "./oceanEnvironment";
import { createOceanParticles } from "./oceanParticles";

let disposeActiveAquarium: (() => void) | undefined;

/** Assemble the aquarium and own its frame loop and lifetime. */
export async function startAquarium(): Promise<void> {
  disposeActiveAquarium?.();
  const events = new AbortController();
  const cleanups: Array<() => void> = [];
  let frame = 0;
  let disposed = false;
  let contextLost = false;
  let elapsed = 0;
  let previous = performance.now();

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    events.abort();
    cleanups.reverse().forEach((cleanup) => cleanup());
    if (disposeActiveAquarium === dispose) disposeActiveAquarium = undefined;
  }

  try {
    const container = getElement("aquarium");
    const view = createAquariumView(container);
    cleanups.push(view.dispose);
    const environment = createOceanEnvironment(view.scene);
    cleanups.push(environment.dispose);
    const fish = createAquariumFish(view.scene, environment, species.aji);
    cleanups.push(fish.dispose);
    const particles = createOceanParticles(
      view.scene,
      view.renderer.getPixelRatio(),
    );
    cleanups.push(particles.dispose);

    function resize() {
      const { mobile } = view.resize(fish.schoolActive);
      environment.resize(mobile);
      fish.setLayout(mobile);
    }

    const ui = createAquariumUI(
      container,
      view.renderer.domElement,
      Object.values(species),
      fish.selectedSpecies,
      {
        selectSpecies(entry) {
          if (!fish.selectSpecies(entry)) return;
          elapsed = 0;
          resize();
          ui.setSpecies(fish.selectedSpecies);
        },
        toggleSchool() {
          const active = fish.toggleSchool();
          resize();
          return active;
        },
        feed: () => {
          fish.feed(view.camera);
        },
        resetView: view.reset,
        zoom: view.zoom,
        setDepth: environment.setDepth,
      },
    );
    cleanups.push(ui.dispose);
    const resizeObserver = new ResizeObserver(resize);
    cleanups.push(() => resizeObserver.disconnect());
    resizeObserver.observe(container);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    function animate(now: number) {
      if (disposed || contextLost) return;
      const delta = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      if (!reducedMotion.matches) elapsed += delta;
      environment.update(elapsed, delta);
      fish.update(delta, elapsed, reducedMotion.matches);
      particles.update(elapsed);
      ui.setCanFeed(fish.canFeed);
      view.update();
      view.render();
      frame = requestAnimationFrame(animate);
    }

    document.addEventListener(
      "visibilitychange",
      () => {
        cancelAnimationFrame(frame);
        if (!document.hidden && !contextLost) {
          previous = performance.now();
          frame = requestAnimationFrame(animate);
        }
      },
      { signal: events.signal },
    );
    view.renderer.domElement.addEventListener(
      "webglcontextlost",
      (event) => {
        event.preventDefault();
        contextLost = true;
        cancelAnimationFrame(frame);
        fish.resetFeeding();
        ui.setCanFeed(false);
        ui.notify(
          "水槽の表示が中断されました。ページを再読み込みしてください。",
        );
      },
      { signal: events.signal },
    );

    disposeActiveAquarium = dispose;
    previous = performance.now();
    // Draw and compile the first frame before the bootstrap removes the loader.
    animate(previous);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  } catch (error) {
    dispose();
    throw error;
  }
}

// Release the previous scene and subscriptions during development reloads.
import.meta.hot?.dispose(() => disposeActiveAquarium?.());
