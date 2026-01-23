// Minimal Web NFC helpers for assigning URL-encoded NTAG tags

export function isNFCAvailable(): boolean {
    return typeof (window as any).NDEFReader !== 'undefined';
}

/**
 * Writes a URL record pointing to the given box route onto an NFC tag.
 * The browser will prompt the user to tap a tag to complete the write.
 *
 * Returns the URL that was written for optional display.
 */
export async function writeBoxTag(boxId: string): Promise<{ url: string }> {
    if (!isNFCAvailable()) {
        throw new Error('Web NFC is not supported on this device/browser. Try Android Chrome.');
    }

    const base = window.location.origin + window.location.pathname;
    const url = `${base}#/box/${encodeURIComponent(boxId)}`;

    const NDEFReaderCtor = (window as any).NDEFReader;
    const ndef = new NDEFReaderCtor();
    // Write a single URL record so scanning opens the box route
    await ndef.write({ records: [{ recordType: 'url', data: url }] });
    return { url };
}
