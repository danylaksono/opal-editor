import { GraduationCapIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface OnboardingPromptProps {
  open: boolean;
  isCreating: boolean;
  onLearn: () => void;
  onSkip: () => void;
}

export function OnboardingPrompt({
  open,
  isCreating,
  onLearn,
  onSkip,
}: OnboardingPromptProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onSkip()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GraduationCapIcon className="size-5 text-primary" />
            New to LaTeX?
          </DialogTitle>
          <DialogDescription>
            Create a local learning project and complete seven small tasks in
            about five minutes. No account, network connection, or telemetry is
            used.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onSkip}>
            Skip
          </Button>
          <Button disabled={isCreating} onClick={onLearn}>
            {isCreating ? "Creating…" : "Learn LaTeX"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
