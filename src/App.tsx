import { Routes, Route, Link } from 'react-router-dom';
import Box from './routes/Box';
import Home from './routes/Home';

export default function App() {
  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-10 bg-black/40 backdrop-blur border-b border-white/10">
        <div className="max-w-xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold">Unpackd</Link>
          <nav className="flex gap-3">
            <a href="#/" className="text-sm opacity-80 hover:opacity-100">Home</a>
          </nav>
        </div>
      </header>
      <main className="max-w-xl mx-auto px-4 py-4">
        <SetupNotice />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/box/:id" element={<Box />} />
        </Routes>
      </main>
    </div>
  );
}

function SetupNotice() {
  const hasEnv = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
  if (hasEnv) return null;
  return (
    <div className="mb-4 p-3 rounded-lg bg-yellow-500/20 border border-yellow-500/30 text-yellow-200 text-sm">
      Supabase isn’t configured yet. Copy values into <span className="font-mono">.env.local</span> using the template in <span className="font-mono">.env.example</span>.
    </div>
  );
}
