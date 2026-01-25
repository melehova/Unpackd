import { useEffect, useState } from 'react';
import { isNFCAvailable, writeBoxTag, readTagPreview, byteaToSerialString, serialStringToByteaHex } from '../lib/nfc';
import { supabase } from '../lib/supabase';
import type { Box as BoxType } from '../types';

type Props = {
  box: BoxType;
  boxId: string;
};

export default function BoxHeader({ box, boxId }: Props) {
  const [writingNfc, setWritingNfc] = useState(false);
  const [nfcMessage, setNfcMessage] = useState<string | null>(null);
  const [serials, setSerials] = useState<string[]>(Array.isArray(box.nfc_serials) ? (box.nfc_serials as string[]) : []);

  useEffect(() => {
    setSerials(Array.isArray(box.nfc_serials) ? (box.nfc_serials as string[]) : []);
  }, [box.nfc_serials]);

  function parseExistingBoxIdFromPreview(preview: { records: Array<{ type: string; data?: string }> }): string | null {
    const appRec = preview.records.find((r) => r.type === 'url' && r.data && (r.data as string).includes('#/box/'));
    if (appRec && appRec.data) {
      const urlStr = appRec.data as string;
      const marker = '#/box/';
      const idx = urlStr.indexOf(marker);
      const rawId = idx >= 0 ? urlStr.slice(idx + marker.length) : null;
      const decodedId = rawId ? decodeURIComponent(rawId) : null;
      return decodedId || null;
    }
    return null;
  }

  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">{box.label || box.id}</h1>
      <p className="opacity-70 font-mono">{box.id}</p>
      <div className="flex items-center gap-3 mt-2">
        <button
          className="inline-flex items-center justify-center text-center h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
          onClick={async () => {
            setNfcMessage(null);
            if (!isNFCAvailable()) {
              setNfcMessage('Web NFC not available. Use Android Chrome.');
              return;
            }
            try {
              setWritingNfc(true);
              setNfcMessage('Tap a tag to read current contents…');
              const preview = await readTagPreview();
              const existingBoxId = parseExistingBoxIdFromPreview(preview);
              const warning = existingBoxId && existingBoxId !== boxId
                ? `\n\nWarning: Tag appears assigned to another box (${existingBoxId}). Continuing will reassign it and remove the serial from that box.`
                : '';
              const proceed = window.confirm(`${preview.summary}\n\nWrite this box URL to the tag?${warning}`);
              if (proceed) {
                const { url } = await writeBoxTag(boxId);
                const serial = (preview.serialNumber || '').trim();
                if (serial) {
                  try {
                    // Add serial to this box (unique)
                    const stored = serialStringToByteaHex(serial);
                    const next = Array.from(new Set([...(serials || []), stored]));
                    const { error: updErr } = await supabase
                      .from('boxes')
                      .update({ nfc_serials: next } as any)
                      .eq('id', boxId);
                    if (!updErr) {
                      setSerials(next);
                    }
                  } catch {}
                  // If tag was assigned to another box, remove there
                  if (existingBoxId && existingBoxId !== boxId) {
                    try {
                      const { data: otherBox } = await supabase
                        .from('boxes')
                        .select('*')
                        .eq('id', existingBoxId)
                        .limit(1)
                        .returns<BoxType[]>();
                      const ob = otherBox && otherBox[0] ? otherBox[0] : null;
                      const arr: string[] = Array.isArray((ob as any)?.nfc_serials) ? ((ob as any).nfc_serials as string[]) : [];
                      const stored = serialStringToByteaHex(serial);
                      const filtered = arr.filter((s) => s !== stored);
                      await supabase
                        .from('boxes')
                        .update({ nfc_serials: filtered } as any)
                        .eq('id', existingBoxId);
                    } catch {}
                  }
                }
                setNfcMessage(`Tag written with URL → ${url}`);
              } else {
                setNfcMessage('Tag write cancelled.');
              }
            } catch (e: any) {
              setNfcMessage(e?.message || 'Failed to read/write NFC tag.');
            } finally {
              setWritingNfc(false);
            }
          }}
          disabled={writingNfc}
          aria-label="Assign NFC Tag"
        >
          {writingNfc ? 'Working…' : 'Assign NFC Tag'}
        </button>
        {nfcMessage && (
          <span className="text-xs opacity-80">{nfcMessage}</span>
        )}
      </div>
      <div className="mt-3 space-y-2">
        <h3 className="text-lg font-medium">Assigned NFC Tags</h3>
        {serials && serials.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {serials.map((s) => (
              <span key={s} className="px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs font-mono">{byteaToSerialString(s)}</span>
            ))}
          </div>
        ) : (
          <div className="text-xs opacity-70">No NFC tags assigned.</div>
        )}
      </div>
    </header>
  );
}
