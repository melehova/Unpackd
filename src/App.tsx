import { Routes, Route, Link } from 'react-router-dom';
import Box from './routes/Box';

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

function Home() {
  return (
    <div className="min-h-[60vh] grid place-items-center">
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold">Unpackd is ready</h1>
        <p className="opacity-80">Use a hash route like <span className="font-mono">#/box/DEMO-BOX</span> to get started.</p>
        <a
          href="#/box/DEMO-BOX"
          className="inline-block h-11 px-4 rounded-lg bg-accent text-black font-semibold"
        >
          Open Demo Box
        </a>
      </div>
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
