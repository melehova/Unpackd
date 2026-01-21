import type { Database } from '../supabase/Supabase API';

export type Box = Database['public']['Tables']['boxes']['Row'];
export type Item = Database['public']['Tables']['items']['Row'];

// Derived helper types
export type ItemActivity = Pick<Item, 'box_id' | 'created_at'>;
export type WithBoxId<T extends { box_id: string | null }> = T & { box_id: string };

// Generic type guard to narrow box_id from string|null to string
export function hasBoxId<T extends { box_id: string | null }>(obj: T): obj is T & { box_id: string } {
	return typeof obj.box_id === 'string';
}
