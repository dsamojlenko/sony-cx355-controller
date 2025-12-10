import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { NowPlaying } from '@/components/NowPlaying';
import { DiscGrid } from '@/components/DiscGrid';
import { DiscDetail } from '@/components/DiscDetail';
import { StatsPage } from '@/components/StatsPage';
import { SettingsPage } from '@/components/SettingsPage';
import { Screensaver } from '@/components/Screensaver';
import { useIdleDetection } from '@/hooks/useIdleDetection';
import { useScreensaverSettings } from '@/hooks/useScreensaverSettings';
import { Button } from '@/components/ui/button';
import { Disc as DiscIcon, BarChart3, Settings, Monitor } from 'lucide-react';
import type { Disc } from '@/types';

function App() {
  const [selectedDisc, setSelectedDisc] = useState<Disc | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [manualScreensaver, setManualScreensaver] = useState(false);

  const { settings } = useScreensaverSettings();
  const { isIdle, resetIdle } = useIdleDetection({
    timeoutMinutes: settings.idleTimeoutMinutes,
    enabled: settings.enabled,
  });

  const screensaverActive = isIdle || manualScreensaver;

  const handleScreensaverExit = () => {
    resetIdle();
    setManualScreensaver(false);
  };

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
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <DiscIcon className="w-6 h-6" />
            CD Jukebox
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setManualScreensaver(true)}
            title="Start screensaver"
          >
            <Monitor className="w-5 h-5" />
          </Button>
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
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="browse">
            <DiscGrid onDiscSelect={handleDiscSelect} />
          </TabsContent>

          <TabsContent value="stats">
            <StatsPage onDiscSelect={handleDiscSelect} />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsPage />
          </TabsContent>
        </Tabs>
      </main>

      {/* Now Playing Bar */}
      <NowPlaying onDiscClick={handleDiscSelect} />

      {/* Disc Detail Modal */}
      <DiscDetail
        disc={selectedDisc}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
      />

      {/* Screensaver */}
      <Screensaver
        isActive={screensaverActive}
        onExit={handleScreensaverExit}
        animationStyle={settings.animationStyle}
      />
    </div>
  );
}

export default App;
