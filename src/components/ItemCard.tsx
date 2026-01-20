import { ReactNode } from 'react';

export default function ItemCard({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 rounded-xl bg-white/5 backdrop-blur border border-white/10 shadow-sm">
      {children}
    </div>
  );
}
