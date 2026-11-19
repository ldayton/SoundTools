import { Accordion, Button, Group, Slider, Stack, Text } from "@mantine/core";
import { useId, useSyncExternalStore } from "react";
import { backingMixerControls } from "./backing-mixer";
import type { BackingTrackPlayer } from "./backing-track-audio";
import type { BackingStyle } from "./backing-track-model";

export function BackingMixerSettings({
  player,
  style,
}: {
  player: BackingTrackPlayer;
  style: BackingStyle;
}) {
  const levels = useSyncExternalStore(
    player.balance.subscribe,
    player.balance.getSnapshot,
  );
  const id = useId();
  const controls = backingMixerControls(style);
  return (
    <Accordion
      className="backing-track-mixer"
      styles={{
        item: { border: 0 },
        control: { padding: 0, color: "var(--backing-text)" },
        label: { fontSize: "inherit" },
        content: { padding: 0 },
      }}
    >
      <Accordion.Item value="mixer">
        <Accordion.Control>Mixer</Accordion.Control>
        <Accordion.Panel>
          <Stack gap="sm">
            <Text id={`${id}-hint`} size="xs" c="var(--backing-muted)">
              100% = genre default
            </Text>
            {controls.map(({ id: channel, label }) => (
              <Stack key={channel} gap={4}>
                <Group justify="space-between" gap="xs">
                  <Text
                    component="label"
                    htmlFor={`${id}-${channel}`}
                    size="sm"
                  >
                    {label}
                  </Text>
                  <Text
                    component="output"
                    htmlFor={`${id}-${channel}`}
                    size="xs"
                    c="var(--backing-muted)"
                  >
                    {levels[channel] === 0 ? "Muted" : `${levels[channel]}%`}
                  </Text>
                </Group>
                <Slider
                  thumbProps={{
                    id: `${id}-${channel}`,
                    "aria-describedby": `${id}-hint`,
                  }}
                  thumbLabel={`${label} balance`}
                  thumbValueText={(value) =>
                    value === 0 ? "Muted" : `${value} percent of genre default`
                  }
                  min={0}
                  max={200}
                  step={1}
                  value={levels[channel]}
                  onChange={(value) => player.setMixerLevel(channel, value)}
                  label={null}
                  color="var(--backing-accent)"
                />
              </Stack>
            ))}
            <Button
              variant="subtle"
              size="compact-sm"
              color="var(--backing-accent)"
              className="backing-mixer-reset"
              disabled={controls.every(({ id }) => levels[id] === 100)}
              onClick={() => player.resetMixer()}
            >
              Reset to genre default
            </Button>
          </Stack>
        </Accordion.Panel>
      </Accordion.Item>
    </Accordion>
  );
}
