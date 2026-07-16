import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnboardingPrompt } from "@/components/onboarding-prompt";
import { TableEditor } from "@/components/workspace/table-editor";

describe("beginner editing dialogs", () => {
  it("offers an accessible first-launch tutorial action", async () => {
    const learn = vi.fn();
    render(
      <OnboardingPrompt
        open
        isCreating={false}
        onLearn={learn}
        onSkip={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Learn LaTeX" }));
    expect(learn).toHaveBeenCalledOnce();
  });

  it("supports keyboard-reachable table cells and row insertion", async () => {
    render(<TableEditor open onOpenChange={vi.fn()} onInsert={vi.fn()} />);
    expect(screen.getByRole("grid", { name: "Table cells" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Row" }));
    expect(
      screen.getByRole("textbox", { name: "Row 4, column 1" }),
    ).toBeTruthy();
  });
});
