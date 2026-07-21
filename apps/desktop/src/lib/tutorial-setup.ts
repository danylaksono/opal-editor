import { writeTextFile } from "@tauri-apps/plugin-fs";
import { exists, join } from "@/lib/tauri/fs";
import { TUTORIAL_BIB, TUTORIAL_MAIN_TEX } from "@/lib/tutorial-project";

/** Folder name of the disposable Learn LaTeX sandbox created by the picker. */
export const TUTORIAL_FOLDER_NAME = "Learn-LaTeX";

/** True when `projectPath` is the dedicated Learn LaTeX sandbox (by folder
 *  name), and therefore safe to overwrite on reset. This guards against the
 *  "Restart Learn LaTeX tutorial" command, which can point the tutorial at the
 *  user's *own* open project — we must never overwrite that. */
export function isTutorialSandbox(projectPath: string | null): boolean {
  if (!projectPath) return false;
  return projectPath.split(/[/\\]/).pop() === TUTORIAL_FOLDER_NAME;
}

/**
 * Restore the tutorial-owned files (main.tex, references.bib) to their original
 * starting content, discarding any edits. Used by the onboarding reset so the
 * learner truly begins from scratch. Only ever call this on a verified sandbox
 * path (see {@link isTutorialSandbox}). The sample image is left untouched.
 */
export async function restoreTutorialFiles(projectPath: string): Promise<void> {
  const mainPath = await join(projectPath, "main.tex");
  const bibPath = await join(projectPath, "references.bib");
  await writeTextFile(mainPath, TUTORIAL_MAIN_TEX);
  await writeTextFile(bibPath, TUTORIAL_BIB);
}

/** True when the sandbox's main.tex still matches the canonical starting
 *  content — i.e. the learner hasn't edited it. A missing file counts as
 *  pristine (nothing to lose by restoring). */
export async function isTutorialPristine(
  projectPath: string,
): Promise<boolean> {
  try {
    const mainPath = await join(projectPath, "main.tex");
    if (!(await exists(mainPath))) return true;
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const current = await readTextFile(mainPath);
    return current === TUTORIAL_MAIN_TEX;
  } catch {
    return true;
  }
}
