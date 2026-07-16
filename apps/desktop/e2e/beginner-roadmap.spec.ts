import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let callbackId = 0;
    const callbacks = new Map<number, (...args: unknown[]) => void>();
    Object.assign(window, {
      __TAURI_INTERNALS__: {
        metadata: {
          currentWindow: { label: "main" },
          currentWebview: { label: "main", windowLabel: "main" },
        },
        transformCallback: (callback: (...args: unknown[]) => void) => {
          callbackId += 1;
          callbacks.set(callbackId, callback);
          return callbackId;
        },
        unregisterCallback: (id: number) => callbacks.delete(id),
        convertFileSrc: (path: string) => path,
        invoke: async (command: string) => {
          if (command.includes("get_version")) return "1.2.0";
          if (command === "detect_editors") return [];
          if (command.includes("plugin:updater")) return null;
          if (command.includes("plugin:event")) return 1;
          return null;
        },
      },
    });
    localStorage.clear();
  });
});

test("first launch offers the local Learn LaTeX project", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "New to LaTeX?" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Learn LaTeX" })).toBeVisible();
  await expect(
    page.getByText(/No account, network connection, or telemetry/),
  ).toBeVisible();
});

test("command palette remains keyboard accessible", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});
