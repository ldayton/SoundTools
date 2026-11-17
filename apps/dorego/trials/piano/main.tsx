import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Alert,
  Anchor,
  Button,
  Checkbox,
  Container,
  Group,
  Paper,
  Select,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { SoundToolsProvider } from '@ldayton/ui';
import { VolumeControl } from '@ldayton/ui/volume-control';
import { TrialPlayer, type Manifest, type Profile } from './player';

function Trial() {
  const [manifest, setManifest] = useState<Manifest>();
  const [midi, setMidi] = useState('75');
  const [layer, setLayer] = useState('12');
  const [phrase, setPhrase] = useState(false);
  const [match, setMatch] = useState(true);
  const [volume, setVolume] = useState(50);
  const [active, setActive] = useState<Profile>();
  const [error, setError] = useState('');
  const [decoded, setDecoded] = useState<Record<string, { sampleRate: number; bytes: number }>>({});
  const player = useRef<TrialPlayer | null>(null);
  const request = useRef(0);
  const clip = manifest?.clips.find((c) => c.midi === Number(midi) && c.layer === Number(layer));

  function stop() {
    ++request.current;
    player.current?.stop();
    setActive(undefined);
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/manifest.json', { signal: controller.signal, cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error('Could not load the trial bank. Reload to retry.');
        return r.json();
      })
      .then(setManifest)
      .catch((e) => {
        if (!controller.signal.aborted) setError(String(e.message));
      });
    const engine = (player.current = new TrialPlayer(() => setActive(undefined)));
    const hidden = () => {
      if (document.hidden) stop();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', stop);
    return () => {
      controller.abort();
      engine.dispose();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', stop);
    };
  }, []);
  useEffect(() => {
    player.current?.setVolume(volume / 100);
  }, [volume]);

  async function play(profile: Profile) {
    if (!clip || !player.current) return;
    stop();
    const id = request.current;
    setError('');
    const pending = player.current.play(clip, profile, match, phrase);
    setActive(profile);
    try {
      const info = await pending;
      if (id === request.current && info)
        setDecoded((old) => ({ ...old, [clip.variants[profile].url]: info }));
    } catch (e) {
      if (id !== request.current) return;
      stop();
      setError(
        e instanceof Error && e.name !== 'AbortError' ? e.message : 'Loading timed out. Try again.'
      );
    }
  }

  return (
    <Container size="sm" py="xl">
      <Stack gap="lg">
        <Group justify="space-between">
          <Title order={1} size="h2">
            Piano sound trial
          </Title>
          <Anchor href="http://localhost:4317/" size="sm">
            DoReGo
          </Anchor>
        </Group>
        <Text c="dimmed" size="sm">
          Compare the same recording through four channel treatments. The shipped piano is
          unchanged.
        </Text>
        <Group grow align="end">
          <Select
            label="Note"
            value={midi}
            allowDeselect={false}
            data={
              manifest?.clips
                .filter((c) => c.layer === 12)
                .map((c) => ({ value: String(c.midi), label: c.label })) ?? []
            }
            onChange={(v) => {
              stop();
              if (v) setMidi(v);
            }}
          />
          <Select
            label="Recording"
            value={layer}
            allowDeselect={false}
            data={[
              { value: '12', label: 'Melody' },
              { value: '11', label: 'Starting chord layer' },
            ]}
            onChange={(v) => {
              stop();
              if (v) setLayer(v);
            }}
          />
        </Group>
        <Group justify="space-between">
          <Checkbox
            label="Three-note phrase"
            checked={phrase}
            onChange={(e) => {
              stop();
              setPhrase(e.currentTarget.checked);
            }}
          />
          <div style={{ width: 160 }}>
            <VolumeControl id="trial-volume" value={volume} onChange={setVolume} />
          </div>
        </Group>
        <Checkbox
          label="Match loudness"
          description="Turn off to hear the natural level differences."
          checked={match}
          onChange={(e) => {
            stop();
            setMatch(e.currentTarget.checked);
          }}
        />
        {error && (
          <Alert color="red" title="Could not play">
            {error}
          </Alert>
        )}
        <Stack gap="sm">
          {clip &&
            (Object.entries(clip.variants) as [Profile, typeof clip.variants.stereo][]).map(
              ([profile, v]) => {
                const info = decoded[v.url];
                return (
                  <Paper
                    key={profile}
                    withBorder
                    p="md"
                    style={{
                      borderColor: active === profile ? 'var(--mantine-color-green-6)' : undefined,
                    }}
                  >
                    <Group wrap="nowrap" justify="space-between" gap="xs">
                      <Stack gap={2} style={{ minWidth: 0 }}>
                        <Text fw={600}>{v.name}</Text>
                        <Text size="xs" c="dimmed">
                          {Math.round(v.bytes / 1024)} KiB download ·{' '}
                          {v.channels === 2 ? 'Stereo' : 'Mono'}
                          {info
                            ? ` · ${Math.round(info.bytes / 1024)} KiB decoded at ${info.sampleRate / 1000} kHz`
                            : ''}
                        </Text>
                      </Stack>
                      <Button
                        miw={72}
                        variant={active === profile ? 'filled' : 'light'}
                        disabled={!clip}
                        onClick={() => (active === profile ? stop() : void play(profile))}
                        aria-label={`${active === profile ? 'Stop' : 'Play'} ${v.name}`}
                      >
                        {active === profile ? 'Stop' : 'Play'}
                      </Button>
                    </Group>
                  </Paper>
                );
              }
            )}
        </Stack>
        <Text size="xs" c="dimmed">
          All files: 44.1 kHz / 16-bit FLAC. Identical timing and fades. No EQ or denoising. Try D♯5
          and F♯6, then C4 as a comparison. Use your usual headphones and speakers.
        </Text>
        <Text size="xs" c="dimmed">
          Recordings: Villalta / Wang / Trueman,{' '}
          <Anchor size="xs" href="https://bitklavier.com/the-bitklavier-grand/">
            bitKlavier Grand
          </Anchor>{' '}
          ·{' '}
          <Anchor size="xs" href="https://creativecommons.org/licenses/by/4.0/">
            CC BY 4.0
          </Anchor>
          . Mono versions adapted for this trial.
        </Text>
      </Stack>
    </Container>
  );
}

createRoot(document.getElementById('root')!).render(
  <SoundToolsProvider primaryColor="green">
    <Trial />
  </SoundToolsProvider>
);
