import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import type { Box as BoxType } from '../types';
import { isNFCAvailable } from '../lib/nfc';
import type { TablesInsert } from '../../supabase/Supabase API';
import BoxHeader from '../components/BoxHeader';
import BoxPhotos from '../components/BoxPhotos';
import ItemsSection from '../components/ItemsSection';

export default function Box() {
    const { id } = useParams();
    const boxId = id || '';
    const [box, setBox] = useState<BoxType | null>(null);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);


    useEffect(() => {
        let ignore = false;
        async function load() {
            setLoading(true);
            const { data: boxes, error } = await supabase
                .from('boxes')
                .select('*')
                .eq('id', boxId)
                .limit(1)
                .returns<BoxType[]>();
            if (ignore) return;
            if (error) {
                console.error(error);
            }
            const boxData = boxes && boxes[0] ? boxes[0] : null;
            setBox(boxData);
            setLoading(false);
            if (boxData) {
                // Items and photos managed in child components
            }
        }
        load();
        return () => { ignore = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [boxId]);



    async function initializeBox() {
        setCreating(true);
        const boxPayload: TablesInsert<'boxes'> = { id: boxId, label: `Box ${boxId}` };
        const { data, error } = await supabase
            .from('boxes')
            .insert(boxPayload)
            .select('*')
            .returns<BoxType[]>();
        if (error) {
            console.error(error);
        } else {
            const inserted = data && data[0] ? data[0] : null;
            setBox(inserted);
        }
        setCreating(false);
    }




    if (loading) {
        return <div>Loading box...</div>;
    }

    if (!box) {
        return (
            <div className="space-y-4">
                <h1 className="text-2xl font-bold">New Box Found</h1>
                <p className="opacity-80">Initialize box <span className="font-mono">{boxId}</span> in the database.</p>
                <button
                    className="h-11 px-4 rounded-lg bg-accent text-black font-semibold disabled:opacity-50"
                    onClick={initializeBox}
                    disabled={creating}
                >
                    {creating ? 'Creating...' : 'Create Box'}
                </button>
                {!isNFCAvailable() && (
                    <div className="text-xs opacity-70">
                        Web NFC not available. Try Android Chrome for tag writing.
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <BoxHeader box={box} boxId={boxId} />
            <BoxPhotos boxId={boxId} />

            <ItemsSection boxId={boxId} />


        </div>
    );
}
