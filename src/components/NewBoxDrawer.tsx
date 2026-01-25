import { useEffect, useState } from 'react';
import ItemCard from './ItemCard';
import { supabase, uploadBoxImageFile } from '../lib/supabase';
import type { TablesInsert } from '../../supabase/Supabase API';
import { enqueuePendingBoxImage } from '../lib/offlineQueue';
import { isNFCAvailable, readTagPreview, writeBoxTag } from '../lib/nfc';
import type { Box } from '../types';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated?: (box: Box) => void;
};

export default function NewBoxDrawer({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdBox, setCreatedBox] = useState<Box | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [writing, setWriting] = useState(false);
  const [previewSummary, setPreviewSummary] = useState<string | null>(null);
  const [serialNumber, setSerialNumber] = useState<string | undefined>(undefined);
  const [tagHasData, setTagHasData] = useState(false);
  const [tagHasAppUrl, setTagHasAppUrl] = useState(false);
  const [tagExistingUrl, setTagExistingUrl] = useState<string | null>(null);
  const [tagExistingBoxId, setTagExistingBoxId] = useState<string | null>(null);
  const [tagExistingBoxLabel, setTagExistingBoxLabel] = useState<string | null>(null);
  const [tagExistingBoxFound, setTagExistingBoxFound] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageCaption, setImageCaption] = useState<string>('');

  // Reset drawer state when it closes so next open starts fresh
  useEffect(() => {
    if (!open) {
      setName('');
      setCreating(false);
      setCreatedBox(null);
      setError(null);
      setInfo(null);
      setReading(false);
      setWriting(false);
      setPreviewSummary(null);
      setSerialNumber(undefined);
      setTagHasData(false);
      setTagHasAppUrl(false);
      setTagExistingUrl(null);
      setTagExistingBoxId(null);
      setTagExistingBoxLabel(null);
      setTagExistingBoxFound(false);
      setImageFile(null);
      setImagePreview(null);
      setImageCaption('');
    }
  }, [open]);

  async function createBox() {
    const label = name.trim();
    if (!label) {
      setError('Enter a box name.');
      return;
    }
    setError(null);
    setInfo(null);
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('boxes')
        .insert({ label })
        .select('*');
      if (error) throw new Error(error.message);
      const inserted = (data || [])[0] as Box | undefined;
      if (!inserted) throw new Error('Insert did not return the new box.');
      // If image selected, upload and add to box_images table
      if (imageFile) {
        if (navigator.onLine) {
          try {
            const { url } = await uploadBoxImageFile(inserted.id, imageFile);
            const { error: imgErr } = await supabase
              .from('box_images')
              .insert({ box_id: inserted.id, url, caption: imageCaption.trim() || null } as TablesInsert<'box_images'>);
            if (imgErr) {
              console.warn('Failed to insert box image:', imgErr.message);
            }
          } catch (imgErr: any) {
            console.warn('Image upload failed:', imgErr?.message || imgErr);
          }
        } else {
          // Offline: store preview data URL for later upload
          if (imagePreview) {
            enqueuePendingBoxImage(inserted.id, imagePreview, imageCaption.trim() || undefined);
          }
          setInfo('Offline: image will upload when back online.');
        }
      }
      setCreatedBox(inserted);
      setInfo(`Box created: ${inserted.label || ''} (${inserted.id})`);
      setName('');
      onCreated?.(inserted);
    } catch (e: any) {
      setError(e?.message || 'Failed to create box.');
    } finally {
      setCreating(false);
    }
  }

  async function readTag() {
    setError(null);
    setInfo(null);
    setPreviewSummary(null);
    setSerialNumber(undefined);
    setTagHasData(false);
    setTagHasAppUrl(false);
    setTagExistingUrl(null);
    setTagExistingBoxId(null);
    setTagExistingBoxLabel(null);
    setTagExistingBoxFound(false);
    if (!isNFCAvailable()) {
      setError('Web NFC not available. Use Android Chrome.');
      return;
    }
    setReading(true);
    try {
      const preview = await readTagPreview();
      setPreviewSummary(preview.summary);
      setSerialNumber(preview.serialNumber);
      const records = preview.records || [];
      const any = records.length > 0;
      const appRec = records.find((r) => r.type === 'url' && r.data && (r.data as string).includes('#/box/'));
      setTagHasData(any);
      if (appRec && appRec.data) {
        setTagHasAppUrl(true);
        const urlStr = appRec.data as string;
        setTagExistingUrl(urlStr);
        const marker = '#/box/';
        const idx = urlStr.indexOf(marker);
        const rawId = idx >= 0 ? urlStr.slice(idx + marker.length) : null;
        const decodedId = rawId ? decodeURIComponent(rawId) : null;
        if (decodedId) {
          setTagExistingBoxId(decodedId);
          try {
            const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedId);
            if (isUuid) {
              const { data: boxes, error } = await supabase
                .from('boxes')
                .select('*')
                .eq('id', decodedId)
                .limit(1);
              if (!error && boxes && boxes[0]) {
                setTagExistingBoxFound(true);
                setTagExistingBoxLabel(boxes[0].label || null);
              }
            }
          } catch {
            // ignore lookup errors for caution UI
          }
        }
      }
      setInfo('Tag read. Review contents below.');
    } catch (e: any) {
      setError(e?.message || 'Failed to read NFC tag.');
    } finally {
      setReading(false);
    }
  }

  async function assignTag() {
    if (!isNFCAvailable()) {
      setError('Web NFC not available. Use Android Chrome.');
      return;
    }
    setWriting(true);
    setError(null);
    try {
      let target = createdBox;
      if (!target) {
        const label = name.trim();
        if (!label) {
          throw new Error('Enter a box name to create before assigning.');
        }
        const { data, error } = await supabase
          .from('boxes')
          .insert({ label })
          .select('*');
        if (error) throw new Error(error.message);
        const inserted = (data || [])[0] as Box | undefined;
        if (!inserted) throw new Error('Insert did not return the new box.');
        setCreatedBox(inserted);
        onCreated?.(inserted);
        target = inserted;
        setInfo(`Box created: ${inserted.label || ''} (${inserted.id})`);
      }
      let confirmMsg = previewSummary ? `${previewSummary}\n\nWrite this box URL to the tag?` : 'Write this box URL to the tag?';
      // Additional caution when tag already contains our URL
      if (tagHasAppUrl && tagExistingBoxId) {
        const targetInfo = tagExistingBoxLabel ? `${tagExistingBoxLabel} (${tagExistingBoxId})` : tagExistingBoxId;
        confirmMsg = `Warning: Tag currently points to existing box ${targetInfo}.\n\n` + confirmMsg;
      }
      const proceed = window.confirm(confirmMsg);
      if (!proceed) {
        setInfo('Tag write cancelled.');
        return;
      }
      const { url } = await writeBoxTag(target.id);
      setInfo(`Tag written with URL → ${url}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to write NFC tag.');
    } finally {
      setWriting(false);
    }
  }

  return (
    <div className={`${open ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-50`}> 
      {/* Overlay */}
      <div
        className={`${open ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200 bg-black/60 absolute inset-0`}
        onClick={() => onClose()}
      />
      {/* Drawer */}
      <div
        className={`${open ? 'translate-y-0' : 'translate-y-full'} transition-transform duration-300 absolute inset-x-0 bottom-0 bg-[#121212] border-t border-white/10 rounded-t-2xl p-4 space-y-4`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">New Box</h2>
          <button className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm" onClick={onClose}>Close</button>
        </div>

        <ItemCard>
          <div className="flex flex-col gap-3">
            <input
              className="h-11 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent"
              placeholder="Box name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <label className="text-sm opacity-80">Attach Image (optional)</label>
              <input
                type="file"
                accept="image/*"
                className="text-xs"
                onChange={(e) => {
                  const f = e.target.files && e.target.files[0];
                  if (f) {
                    setImageFile(f);
                    const reader = new FileReader();
                    reader.onload = () => setImagePreview((reader.result as string) || null);
                    reader.readAsDataURL(f);
                  } else {
                    setImageFile(null);
                    setImagePreview(null);
                  }
                }}
              />
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Box preview"
                  className="mt-1 h-28 w-full object-cover rounded-md border border-white/10 bg-white/5"
                />
              )}
              <input
                className="h-9 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent text-sm"
                placeholder="Photo caption"
                value={imageCaption}
                onChange={(e) => setImageCaption(e.target.value)}
              />
              {!navigator.onLine && (
                <div className="text-xs opacity-70">Offline: image will upload later.</div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="h-11 px-4 rounded-lg bg-accent text-black font-semibold disabled:opacity-50"
                onClick={createBox}
                disabled={creating}
              >
                {creating ? 'Creating…' : 'Create Box'}
              </button>
              {createdBox && (
                <a href={`#/box/${createdBox.id}`} className="h-11 px-4 rounded-lg bg-white/5 border border-white/10 text-sm">Open</a>
              )}
            </div>
            {error && <div className="text-xs text-red-300">{error}</div>}
            {info && <div className="text-xs opacity-80">{info}</div>}
          </div>
        </ItemCard>

        <ItemCard>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">NFC Tag</h3>
              {!isNFCAvailable() && (
                <div className="text-xs opacity-70">Web NFC not available</div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
                onClick={readTag}
                disabled={reading || !isNFCAvailable()}
              >
                {reading ? 'Reading…' : 'Read Tag'}
              </button>
              <button
                className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
                onClick={assignTag}
                disabled={writing || (!createdBox && !name.trim()) || !isNFCAvailable()}
              >
                {writing ? 'Writing…' : 'Assign to Box'}
              </button>
            </div>
            {tagHasAppUrl && (
              <div className="text-xs rounded-md border border-red-500/40 bg-red-500/10 text-red-300 p-2">
                Warning: Tag already contains an Unpackd URL
                {tagExistingUrl && (
                  <div className="mt-1 break-all opacity-90">{tagExistingUrl}</div>
                )}
                {tagExistingBoxId && (
                  <div className="mt-1 opacity-90">
                    {tagExistingBoxFound ? (
                      <span>Points to existing box {tagExistingBoxLabel ? `${tagExistingBoxLabel} (${tagExistingBoxId})` : tagExistingBoxId}.</span>
                    ) : (
                      <span>Points to box ID {tagExistingBoxId} (not found in database).</span>
                    )}
                  </div>
                )}
              </div>
            )}
            {!tagHasAppUrl && tagHasData && (
              <div className="text-xs rounded-md border border-yellow-500/40 bg-yellow-500/10 text-yellow-300 p-2">
                Caution: Tag has existing NDEF records — writing will overwrite.
              </div>
            )}
            {previewSummary && !tagHasData && (
              <div className="text-xs rounded-md border border-green-500/40 bg-green-500/10 text-green-300 p-2">
                Tag is empty — ready to assign.
              </div>
            )}
            {serialNumber && (
              <div className="text-xs opacity-80">Tag serial: {serialNumber}</div>
            )}
            {previewSummary && (
              <pre className="text-xs whitespace-pre-wrap break-all opacity-80 bg-white/5 border border-white/10 rounded-md p-2">{previewSummary}</pre>
            )}
          </div>
        </ItemCard>
      </div>
    </div>
  );
}
