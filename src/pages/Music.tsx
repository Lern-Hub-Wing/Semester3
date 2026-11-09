import { useState } from 'react';
import { Plus } from 'lucide-react';
import { PageHeader } from '../components/layout/AppShell';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MusicLibrary } from '../components/music/MusicLibrary';
import { usePlayer, player } from '../store/player';
import { GlassSlider } from '../components/ui/GlassSlider';

/** Musik: gemeinsame Bibliothek (YouTube-Links) und erzeugte Klänge */
export function Music() {
  const volume = usePlayer((s) => s.volume);
  const [key, setKey] = useState(0);
  return (
    <div>
      <PageHeader
        title="Musik"
        actions={
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setKey((k) => k + 1)} data-testid="music-new">
            Neu
          </Button>
        }
      />
      <Card className="p-4 md:p-6">
        <MusicLibrary key={key} openAdd={key > 0} />
        <div className="mt-6 max-w-sm border-t border-[var(--ss-edge)] pt-4">
          <GlassSlider label="Lautstärke" value={volume} min={0} max={100} step={5} onChange={(v) => player.setVolume(v)} display={`${volume} %`} />
        </div>
      </Card>
    </div>
  );
}
