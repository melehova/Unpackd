import { useEffect, useMemo, useRef, useState } from 'react';
import ItemCard from './ItemCard';
import { supabase, uploadBoxImageFile, uploadBoxImageDataUrl } from '../lib/supabase';
import { getPendingBoxImages, clearPendingBoxImages, enqueuePendingBoxImage } from '../lib/offlineQueue';
import type { BoxImage } from '../types';
import type { TablesInsert } from '../../supabase/Supabase API';

type Props = {
  boxId: string;
};

export default function BoxPhotos({ boxId }: Props) {
  const [images, setImages] = useState<BoxImage[]>([]);
  const [photoCaption, setPhotoCaption] = useState<string>('');
  const [selectedPhotoFile, setSelectedPhotoFile] = useState<File | null>(null);
  const [selectedPhotoPreview, setSelectedPhotoPreview] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const currentImage = viewerIndex != null && images[viewerIndex] ? images[viewerIndex] : null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (viewerIndex == null) return;
      if (e.key === 'Escape') {
        setViewerIndex(null);
      } else if (e.key === 'ArrowRight') {
        setViewerIndex((idx) => (idx == null ? null : Math.min(images.length - 1, idx + 1)));
      } else if (e.key === 'ArrowLeft') {
        setViewerIndex((idx) => (idx == null ? null : Math.max(0, idx - 1)));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewerIndex, images.length]);

  useEffect(() => {
    let ignore = false;
    async function loadImages() {
      const { data: imgs } = await supabase
        .from('box_images')
        .select('*')
        .eq('box_id', boxId)
        .order('created_at', { ascending: false })
        .returns<BoxImage[]>();
      if (!ignore) setImages(imgs || []);
      if (navigator.onLine) {
        const pendingList = getPendingBoxImages(boxId);
        for (const item of pendingList) {
          try {
            const { url } = await uploadBoxImageDataUrl(boxId, item.dataUrl);
            await supabase.from('box_images').insert({ box_id: boxId, url, caption: item.caption ?? null } as TablesInsert<'box_images'>);
          } catch {
            // keep pending for later
          }
        }
        clearPendingBoxImages(boxId);
      }
    }
    loadImages();
    return () => { ignore = true; };
  }, [boxId]);

  useEffect(() => {
    if (!boxId) return;
    const ch = supabase.channel('box-image-updates');
    ch.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'box_images', filter: `box_id=eq.${boxId}` },
      (payload: any) => {
        const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';
        const isImgRow = (v: any): v is BoxImage => v && typeof v.id === 'string' && typeof v.box_id === 'string' && typeof v.url === 'string';
        if (ev === 'INSERT' && isImgRow(payload.new)) {
          const inserted = payload.new;
          setImages((prev) => [inserted, ...prev.filter((i) => i.id !== inserted.id)]);
        } else if (ev === 'UPDATE' && isImgRow(payload.new)) {
          const updated = payload.new;
          setImages((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
        } else if (ev === 'DELETE' && isImgRow(payload.old)) {
          const removed = payload.old;
          setImages((prev) => prev.filter((i) => i.id !== removed.id));
        }
      }
    ).subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [boxId]);

  return (
    <section className="mt-3 space-y-3">
      <h2 className="text-xl font-semibold">Box Photos</h2>
      <div className="grid grid-cols-3 gap-2">
        {images.map((img) => (
          <button
            key={img.id}
            className="space-y-1 text-left"
            onClick={() => {
              const idx = images.findIndex((i) => i.id === img.id);
              setViewerIndex(idx >= 0 ? idx : 0);
            }}
          >
            <img src={img.url} alt="Box item group" className="h-24 w-full object-cover rounded-md border border-white/10 bg-white/5" />
            {img.caption && <div className="text-xs opacity-70 truncate">{img.caption}</div>}
          </button>
        ))}
        {images.length === 0 && (
          <div className="col-span-3 text-xs opacity-70">No photos yet.</div>
        )}
      </div>
      <ItemCard>
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <button
              className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose Photo
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                setSelectedPhotoFile(f);
                setPhotoError(null);
                const reader = new FileReader();
                reader.onload = () => setSelectedPhotoPreview(reader.result as string);
                reader.readAsDataURL(f);
              }}
            />
            <input
              className="h-9 px-3 rounded-md bg-white/5 border border-white/10 outline-none focus:border-accent text-sm flex-1"
              placeholder="Photo caption"
              value={photoCaption}
              onChange={(e) => setPhotoCaption(e.target.value)}
            />
            <button
              className="h-9 px-3 rounded-md bg-accent text-black font-semibold disabled:opacity-50"
              disabled={!selectedPhotoFile || uploadingPhoto}
              onClick={async () => {
                if (!selectedPhotoFile) return;
                setUploadingPhoto(true);
                setPhotoError(null);
                try {
                  if (navigator.onLine) {
                    const { url } = await uploadBoxImageFile(boxId, selectedPhotoFile);
                    const { data, error } = await supabase
                      .from('box_images')
                      .insert({ box_id: boxId, url, caption: photoCaption.trim() || null } as TablesInsert<'box_images'>)
                      .select('*')
                      .returns<BoxImage[]>();
                    if (error) throw new Error(error.message);
                    if (data && data[0]) {
                      setImages((prev) => [data[0], ...prev]);
                    }
                  } else {
                    if (selectedPhotoPreview) {
                      enqueuePendingBoxImage(boxId, selectedPhotoPreview, photoCaption.trim() || undefined);
                    }
                  }
                  setSelectedPhotoFile(null);
                  setSelectedPhotoPreview(null);
                  setPhotoCaption('');
                } catch (err: any) {
                  setPhotoError(err?.message || 'Failed to add photo.');
                } finally {
                  setUploadingPhoto(false);
                }
              }}
            >
              {uploadingPhoto ? 'Uploading…' : 'Upload'}
            </button>
          </div>
          {selectedPhotoPreview && (
            <img src={selectedPhotoPreview} alt="Preview" className="h-28 w-full object-cover rounded-md border border-white/10 bg-white/5" />
          )}
          {photoError && (
            <div className="text-xs text-red-300">{photoError}</div>
          )}
          {!navigator.onLine && (
            <div className="text-xs opacity-70">Offline: photo will upload later.</div>
          )}
        </div>
      </ItemCard>

      {/* Image Viewer Overlay */}
      <div className={`${viewerIndex != null ? 'pointer-events-auto' : 'pointer-events-none'} fixed inset-0 z-50`}>
        <div
          className={`${viewerIndex != null ? 'opacity-100' : 'opacity-0'} transition-opacity duration-200 bg-black/80 absolute inset-0`}
          onClick={() => setViewerIndex(null)}
        />
        {currentImage && (
          <div className={`${viewerIndex != null ? 'translate-y-0' : 'translate-y-full'} transition-transform duration-300 absolute inset-x-0 bottom-0 bg-[#121212] border-t border-white/10 rounded-t-2xl p-4 space-y-3`}
            role="dialog" aria-modal="true" aria-label="Photo viewer">
            <div className="flex items-center justify-between">
              <div className="text-sm opacity-70 font-mono">{currentImage.created_at}</div>
              <div className="flex items-center gap-2">
                <button
                  className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm"
                  onClick={() => setViewerIndex(null)}
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
                onClick={() => setViewerIndex((idx) => (idx == null ? null : Math.max(0, idx - 1)))}
                disabled={!images.length || viewerIndex === 0}
              >
                Prev
              </button>
              <button
                className="h-9 px-3 rounded-md bg-white/5 border border-white/10 text-sm disabled:opacity-50"
                onClick={() => setViewerIndex((idx) => (idx == null ? null : Math.min(images.length - 1, idx + 1)))}
                disabled={!images.length || viewerIndex === images.length - 1}
              >
                Next
              </button>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-2">
              <img src={currentImage.url} alt={currentImage.caption ?? 'Photo'} className="w-full max-h-[60vh] object-contain rounded-md" />
            </div>
            {currentImage.caption && (
              <div className="text-sm opacity-80">{currentImage.caption}</div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
