/** Block page zoom gestures without consuming a single-finger drag or scroll. */
export function disableTouchZoom(): void {
  const preventMultiTouch = (event: TouchEvent) => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  };
  document.addEventListener("touchstart", preventMultiTouch, {
    passive: false,
  });
  document.addEventListener("touchmove", preventMultiTouch, { passive: false });

  // Safari exposes pinch gestures separately and may ignore viewport scale limits.
  document.addEventListener(
    "gesturestart",
    (event) => {
      if (event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
  document.addEventListener(
    "gesturechange",
    (event) => {
      if (event.cancelable) event.preventDefault();
    },
    { passive: false },
  );
}
