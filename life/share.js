import { el } from './dom.js';

/**
 * Handing a generated file to the OS: the Web Share API where there is one —
 * on an iPhone that's "Save to Files", AirDrop, Mail, or a matching app like
 * Calendar for a `.ics` — falling back to a plain download otherwise (e.g. a
 * desktop browser). Shared by Backup and any section that generates its own
 * file (Tasks' calendar export), since the iOS constraints are identical:
 * sharing must start straight from the tap, or it silently fails.
 *
 * Returns 'shared', 'downloaded' or 'cancelled'.
 */
export async function shareOrDownload(file, shareTitle) {
    if (navigator.canShare?.({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: shareTitle });
            return 'shared';
        } catch (error) {
            if (error?.name === 'AbortError') return 'cancelled';
            // Sharing refused for some other reason — fall back to a download.
        }
    }

    const url = URL.createObjectURL(file);
    const link = el('a', { href: url, download: file.name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return 'downloaded';
}
