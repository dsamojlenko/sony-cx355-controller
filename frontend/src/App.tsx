import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NowPlaying } from '@/components/NowPlaying';
import { DiscGrid } from '@/components/DiscGrid';
import { DiscDetail } from '@/components/DiscDetail';
import { StatsPage } from '@/components/StatsPage';
import { Disc as DiscIcon, BarChart3 } from 'lucide-react';
import type { Disc } from '@/types';

function App() {
  const [selectedDisc, setSelectedDisc] = useState<Disc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Apply dark mode by default
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleDiscSelect = (disc: Disc) => {
    setSelectedDisc(disc);
    setDetailOpen(true);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DiscIcon className="w-6 h-6" />
            CD Jukebox
          </h1>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <Tabs defaultValue="browse" className="space-y-6">
          <TabsList>
            <TabsTrigger value="browse" className="flex items-center gap-2">
              <DiscIcon className="w-4 h-4" />
              Browse
            </TabsTrigger>
            <TabsTrigger value="stats" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Stats
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse">
            <DiscGrid onDiscSelect={handleDiscSelect} />
          </TabsContent>

          <TabsContent value="stats">
            <StatsPage onDiscSelect={handleDiscSelect} />
          </TabsContent>
        </Tabs>
      </main>

      {/* Now Playing Bar */}
      <NowPlaying />

      {/* Disc Detail Modal */}
      <DiscDetail
        disc={selectedDisc}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />
    </div>
  );
}

export default App;
