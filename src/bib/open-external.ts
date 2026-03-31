import { FileSystemAdapter, Notice } from "obsidian";
import { spawn } from "child_process";

/**
 * Open a bib file at a specific line using an external editor command.
 *
 * The command template supports `{file}` and `{line}` placeholders:
 *   - subl {file}:{line}
 *   - code -g {file}:{line}
 *   - emacsclient +{line} {file}
 *   - vim +{line} {file}
 *
 * The command is run through the user's login shell ($SHELL -l -c ...)
 * so that GUI-launched Obsidian inherits the terminal's PATH.
 */
export function openBibFileAtLine(
    adapter: FileSystemAdapter,
    bibPath: string,
    lineNumber: number,
    commandTemplate: string
): void {
    const basePath = adapter.getBasePath();
    const absPath = `${basePath}/${bibPath}`;
    const line = lineNumber + 1; // 0-indexed → 1-indexed

    const command = commandTemplate
        .replace(/\{file\}/g, `"${absPath}"`)
        .replace(/\{line\}/g, String(line));

    const userShell = process.env.SHELL || "/bin/sh";
    const child = spawn(userShell, ["-l", "-c", command], {
        stdio: "ignore",
        detached: true,
    });

    child.on("error", (err) => {
        console.error(`[TurboRef] Failed to open editor: ${command}`, err);
        new Notice(`Failed to open editor. Check "Bib editor command" in TurboRef settings.\n\nCommand: ${command}`);
    });

    child.unref();
}
