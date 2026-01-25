import { useState } from 'react';
import { isNFCAvailable, writeBoxTag, readTagPreview } from '../lib/nfc';
import type { Box as BoxType } from '../types';

type Props = {
  box: BoxType;
  boxId: string;
};

export default function BoxHeader({ box, boxId }: Props) {
  const [writingNfc, setWritingNfc] = useState(false);
  const [nfcMessage, setNfcMessage] = useState<string | null>(null);

  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-bold">{box.label || box.id}</h1>
      <p className="opacity-70 font-mono">{box.id}</p>
      <div className="flex items-center gap-3 mt-2">
        <button
          className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
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
              const proceed = window.confirm(`${preview.summary}\n\nWrite this box URL to the tag?`);
              if (proceed) {
                const { url } = await writeBoxTag(boxId);
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
    </header>
  );
}
