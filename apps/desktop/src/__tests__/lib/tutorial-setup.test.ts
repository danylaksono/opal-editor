import { describe, expect, it } from "vitest";
import { isTutorialSandbox, TUTORIAL_FOLDER_NAME } from "@/lib/tutorial-setup";

describe("isTutorialSandbox", () => {
  it("accepts the dedicated Learn-LaTeX sandbox on both path styles", () => {
    expect(isTutorialSandbox(`/Users/me/Documents/Opal/${TUTORIAL_FOLDER_NAME}`)).toBe(
      true,
    );
    expect(
      isTutorialSandbox(`C:\\Users\\me\\Documents\\Opal\\${TUTORIAL_FOLDER_NAME}`),
    ).toBe(true);
  });

  it("rejects a real project so reset never overwrites the user's own work", () => {
    // "Restart Learn LaTeX tutorial" can point the tutorial at the current
    // project — that must never be treated as the disposable sandbox.
    expect(isTutorialSandbox("/Users/me/Documents/my-thesis")).toBe(false);
    expect(isTutorialSandbox("/Users/me/Learn-LaTeX-notes")).toBe(false);
    expect(isTutorialSandbox(null)).toBe(false);
    expect(isTutorialSandbox("")).toBe(false);
  });
});
