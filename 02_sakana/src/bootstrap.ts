import { disableTouchZoom } from "./mobileGestures";

async function bootstrap(): Promise<void> {
  try {
    disableTouchZoom();
    // Let the critical HTML loader paint before fetching or evaluating Three.js.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const { startAquarium } = await import("./main");
    await startAquarium();
    window.dispatchEvent(new Event("aquarium:ready"));
  } catch (error) {
    console.error("水槽の起動に失敗しました。", error);
    window.dispatchEvent(new Event("aquarium:startup-error"));
  }
}

void bootstrap();
