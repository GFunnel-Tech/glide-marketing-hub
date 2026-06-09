import { useEffect } from "react";

/**
 * Safety net for a known Radix UI bug: when a modal overlay (Dialog,
 * AlertDialog, DropdownMenu, Select, modal Popover) opens it sets
 * `document.body.style.pointerEvents = "none"` and is supposed to restore it on
 * close. If two overlays open/close in quick succession the restore can be
 * skipped, leaving the *entire page* unclickable — every button silently does
 * nothing. This watches the body and clears the stuck value whenever no overlay
 * is actually open.
 *
 * It only ever clears `pointer-events` (never sets it), and only when there is
 * no open modal-type Radix layer in the DOM, so it can't break a legitimately
 * open dialog.
 */
export function usePointerEventsGuard() {
  useEffect(() => {
    if (typeof document === "undefined") return;

    // Open modal layers carry one of these roles / wrappers in the DOM.
    const OPEN_LAYER_SELECTOR =
      '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"],[data-radix-popper-content-wrapper]';

    const unstick = () => {
      const body = document.body;
      if (body.style.pointerEvents !== "none") return;
      if (document.querySelector(OPEN_LAYER_SELECTOR)) return; // a real overlay is open
      body.style.pointerEvents = "";
    };

    const observer = new MutationObserver(unstick);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["style"],
    });

    // Also re-check shortly after any pointer interaction, in case a layer just
    // unmounted but left the style behind.
    const onPointer = () => window.setTimeout(unstick, 0);
    window.addEventListener("pointerdown", onPointer, true);

    unstick();

    return () => {
      observer.disconnect();
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
}
