import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/Supabase API';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient<Database>(url, key);

// Storage bucket used for box images
const BOX_IMAGES_BUCKET = 'box-images';

function sanitizeFileName(name: string) {
	return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function uploadBoxImageFile(boxId: string, file: File) {
	const ext = file.name.includes('.') ? file.name.split('.').pop() : undefined;
	const base = file.name ? file.name.replace(/\.[^.]+$/, '') : 'image';
	const safeName = sanitizeFileName(`${base}.${ext || 'jpg'}`);
	const path = `${boxId}/${Date.now()}_${safeName}`;
	const { data, error } = await supabase.storage
		.from(BOX_IMAGES_BUCKET)
		.upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg', cacheControl: '3600' });
	if (error) throw new Error(error.message);
	const publicUrl = supabase.storage.from(BOX_IMAGES_BUCKET).getPublicUrl(data?.path || path).data.publicUrl;
	return { path: data?.path || path, url: publicUrl };
}

export async function uploadBoxImageDataUrl(boxId: string, dataUrl: string) {
	const match = dataUrl.match(/^data:(.*?);base64,(.*)$/);
	if (!match) throw new Error('Invalid data URL');
	const mime = match[1] || 'image/jpeg';
	const base64 = match[2];
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const blob = new Blob([bytes], { type: mime });
	const path = `${boxId}/${Date.now()}_image.${mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg'}`;
	const { data, error } = await supabase.storage
		.from(BOX_IMAGES_BUCKET)
		.upload(path, blob, { upsert: true, contentType: mime, cacheControl: '3600' });
	if (error) throw new Error(error.message);
	const publicUrl = supabase.storage.from(BOX_IMAGES_BUCKET).getPublicUrl(data?.path || path).data.publicUrl;
	return { path: data?.path || path, url: publicUrl };
}
