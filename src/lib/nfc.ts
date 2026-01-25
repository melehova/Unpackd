// Minimal Web NFC helpers for assigning URL-encoded NTAG tags

export function isNFCAvailable(): boolean {
    return typeof (window as any).NDEFReader !== 'undefined';
}

// Format plain hex serials as MAC-like AA:BB:CC:DD:EE:FF for readability
export function formatSerialAsMac(serial: string): string {
    const hex = (serial || '').replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    if (hex.length === 0) return serial || '';
    const parts: string[] = [];
    for (let i = 0; i < hex.length; i += 2) {
        const seg = hex.slice(i, i + 2);
        parts.push(seg);
    }
    return parts.join(':');
}

// Convert colon-hex serial string to Postgres bytea hex format ("\\x...")
export function serialStringToByteaHex(serial: string): string {
    const hex = (serial || '').replace(/[^a-fA-F0-9]/g, '').toLowerCase();
    if (!hex) return '';
    return `\\x${hex}`;
}

function bytesToMac(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
        parts.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
    }
    return parts.join(':');
}

// Decode stored Postgres bytea string (hex or base64) to a human serial
export function byteaToSerialString(value: string): string {
    if (!value) return '';
    try {
        // Handle PG hex format: "\\x..."
        const hexMatch = value.match(/^\\x([0-9a-fA-F]+)$/);
        if (hexMatch) {
            const hex = hexMatch[1];
            const bytes = new Uint8Array(hex.length / 2);
            for (let i = 0; i < hex.length; i += 2) {
                bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
            }
            // Try decoding as text (if original stored ASCII like "04:68:...")
            const txt = new TextDecoder().decode(bytes);
            if (/^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){1,}$/.test(txt)) {
                return txt.toUpperCase();
            }
            return bytesToMac(bytes);
        }
        // Handle base64 form
        if (/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
            const bin = atob(value);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const txt = new TextDecoder().decode(bytes);
            if (/^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){1,}$/.test(txt)) {
                return txt.toUpperCase();
            }
            return bytesToMac(bytes);
        }
        // Otherwise assume it's a plain string already
        const cleaned = value.trim();
        if (/^[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){1,}$/.test(cleaned)) {
            return cleaned.toUpperCase();
        }
        const hex = cleaned.replace(/[^a-fA-F0-9]/g, '');
        if (hex.length >= 14 && hex.length % 2 === 0) {
            return formatSerialAsMac(hex);
        }
        return cleaned;
    } catch {
        return value;
    }
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

// add to string method of dataview
DataView.prototype.toString = function() {
    const decoder = new TextDecoder();
    return decoder.decode(this);
}

/**
 * Scans a tag once and returns a human-readable summary of existing NDEF records.
 * Useful before overwriting with a new URL to confirm user intent.
 */
export async function readTagPreview(): Promise<{ serialNumber?: string; summary: string; records: Array<{ type: string; data?: string; mediaType?: string }> }> {
    if (!isNFCAvailable()) {
        throw new Error('Web NFC is not supported on this device/browser. Try Android Chrome.');
    }
    const NDEFReaderCtor = (window as any).NDEFReader;
    const ndef = new NDEFReaderCtor();
    await ndef.scan();
    return new Promise((resolve, reject) => {
        (ndef as any).onreadingerror = () => reject(new Error('Failed to read NFC tag. Try again.'));
        (ndef as any).onreading = (event: any) => {
            try {
                const serialNumber: string | undefined = event?.serialNumber || undefined;
                const records = Array.from(event?.message?.records || []);
                const parsed: Array<{ type: string; data?: string; mediaType?: string }> = records.map((rec: any) => {
                    const type = rec?.recordType || 'unknown';
                    const raw: any = rec?.data;
                    let dataStr: string | undefined = undefined;
                    // Decode DataView payloads into text
                    if (raw && typeof raw === 'object' && typeof raw.byteLength === 'number') {
                        try {
                            dataStr = new TextDecoder().decode(raw as DataView);
                        } catch {
                            dataStr = undefined;
                        }
                    } else if (typeof raw === 'string') {
                        dataStr = raw;
                    }
                    return { type, data: dataStr, mediaType: rec?.mediaType };
                });
                const parts: string[] = [];
                if (serialNumber) parts.push(`Tag serial: ${formatSerialAsMac(serialNumber)}`);
                if (parsed.length === 0) {
                    parts.push('No NDEF records found.');
                } else {
                    parts.push('Existing records:');
                    parsed.forEach((p, i) => {
                        const label = p.type;
                        const value = p.data || p.mediaType || '';
                        parts.push(`• [${i + 1}] ${label}${value ? ` → ${value.toString()}` : ''}`);
                    });
                }
                resolve({ serialNumber, summary: parts.join('\n'), records: parsed });
            } catch (e) {
                reject(e instanceof Error ? e : new Error('Failed to parse NFC tag.'));
            }
        };
    });
}
