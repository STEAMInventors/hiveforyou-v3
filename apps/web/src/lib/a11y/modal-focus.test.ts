import { afterEach, describe, expect, it } from "vitest";

import { handleModalTabKeyDown, listFocusableElements, safeReturnFocus } from "./modal-focus";

function mountOverlay(buttonIds: string[]): HTMLElement {
  const overlay = document.createElement("div");
  overlay.id = "overlay";
  for (const id of buttonIds) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = id;
    button.textContent = id;
    overlay.append(button);
  }
  document.body.append(overlay);
  return overlay;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("listFocusableElements", () => {
  it("includes buttons and excludes disabled controls and tabindex -1", () => {
    const root = document.createElement("div");
    const enabledA = document.createElement("button");
    enabledA.id = "a";
    const disabled = document.createElement("button");
    disabled.id = "b";
    disabled.disabled = true;
    const panel = document.createElement("div");
    panel.id = "panel";
    panel.tabIndex = -1;
    const enabledC = document.createElement("button");
    enabledC.id = "c";
    root.append(enabledA, disabled, panel, enabledC);
    document.body.append(root);

    const ids = listFocusableElements(root).map((el) => el.id);
    expect(ids).toEqual(["a", "c"]);
  });
});

describe("handleModalTabKeyDown", () => {
  it("wraps forward Tab from the last control to the first", () => {
    const overlay = mountOverlay(["first", "last"]);
    const last = document.getElementById("last") as HTMLButtonElement;
    last.focus();

    handleModalTabKeyDown(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }), overlay);

    expect(document.activeElement?.id).toBe("first");
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    const overlay = mountOverlay(["first", "last"]);
    const first = document.getElementById("first") as HTMLButtonElement;
    first.focus();

    handleModalTabKeyDown(
      new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
      overlay,
    );

    expect(document.activeElement?.id).toBe("last");
  });

  it("pulls focus back when Tab would leave the overlay", () => {
    const outside = document.createElement("button");
    outside.type = "button";
    outside.id = "outside";
    document.body.append(outside);
    const overlay = mountOverlay(["inside"]);

    outside.focus();

    handleModalTabKeyDown(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }), overlay);

    expect(document.activeElement?.id).toBe("inside");
  });
});

describe("safeReturnFocus", () => {
  it("focuses connected elements and ignores detached refs", () => {
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = "trigger";
    document.body.append(trigger);

    safeReturnFocus(trigger);
    expect(document.activeElement).toBe(trigger);

    const detached = document.createElement("button");
    expect(() => safeReturnFocus(detached)).not.toThrow();
    expect(document.activeElement).toBe(trigger);
  });
});
