// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore } from "react";
import {
  Accordion,
  ActionIcon,
  Anchor,
  Box,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
import { SettingsSlider } from "./settings-slider";

type View = {
  busy: boolean;
  running: boolean;
  pauseEnabled: boolean;
  startIcon: string;
  startLabel: string;
  pauseIcon: string;
  pauseLabel: string;
  devices: { value: string; label: string }[];
  microphone: string;
  example: boolean;
  duration: number;
  position: number;
  loop: boolean;
  listen: boolean;
};
type Actions = {
  start(): void;
  pause(): void;
  example(): void;
  refresh(): void;
  microphone(id: string): void;
  seek(time: number): void;
  restart(): void;
  loop(value: boolean): void;
  listen(value: boolean): void;
};
const time = (n: number) =>
  `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, "0")}`;
export function createTransportControls() {
  const model = createViewState<View>({
    busy: false,
    running: false,
    pauseEnabled: false,
    startIcon: "●",
    startLabel: "Start microphone",
    pauseIcon: "⏸",
    pauseLabel: "Pause",
    devices: [],
    microphone: "",
    example: false,
    duration: 30,
    position: 0,
    loop: true,
    listen: false,
  });
  const progress = createViewState(0);
  let actions: Actions | undefined;
  const useView = () =>
    useSyncExternalStore(model.subscribe, model.getSnapshot);
  function Buttons() {
    const view = useView();
    return (
      <Group gap="xs" wrap="nowrap" className="soundtools-ui">
        <ActionIcon
          id="start"
          variant="filled"
          size="lg"
          disabled={view.busy}
          aria-label={view.startLabel}
          title={view.startLabel}
          onClick={() => actions?.start()}
        >
          {view.startIcon}
        </ActionIcon>
        <ActionIcon
          id="freeze"
          variant="default"
          size="lg"
          disabled={view.busy || !view.pauseEnabled}
          aria-label={view.pauseLabel}
          title={view.pauseLabel}
          aria-keyshortcuts="Space"
          onClick={() => actions?.pause()}
        >
          {view.pauseIcon}
        </ActionIcon>
      </Group>
    );
  }
  function Microphone() {
    const view = useView();
    return (
      <Stack gap="sm">
        <Title order={3} size="sm">
          Audio input
        </Title>
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <NativeSelect
            id="microphone"
            label="Microphone"
            value={view.microphone}
            disabled={view.busy}
            style={{ flex: 1, minWidth: 0 }}
            onChange={(event) => actions?.microphone(event.currentTarget.value)}
            data={[{ value: "", label: "System default" }, ...view.devices]}
          />
          <ActionIcon
            id="refreshMic"
            variant="default"
            size="input-sm"
            disabled={view.busy}
            aria-label="Refresh microphones"
            title="Refresh microphones"
            onClick={() => actions?.refresh()}
          >
            ↻
          </ActionIcon>
        </Group>
        <Text id="microphoneScope" size="xs" c="dimmed" hidden={!view.example}>
          Microphone selection applies when you start microphone input.
        </Text>
      </Stack>
    );
  }
  function Playback({ duration }: { duration: number }) {
    const position = useSyncExternalStore(
      progress.subscribe,
      progress.getSnapshot,
    );
    return (
      <SettingsSlider
        id="seek"
        label="Playback"
        min={0}
        max={Math.max(0.1, duration)}
        step={0.1}
        value={position}
        outputId="position"
        format={(value) => `${time(value)} / ${time(Math.ceil(duration))}`}
        change={(value) => actions?.seek(value)}
      />
    );
  }
  function Example() {
    const view = useView();
    return (
      <Box id="testControls" hidden={!view.example} mt="lg">
        <Stack gap="md">
          <Title order={3} size="sm">
            Example playback
          </Title>
          <Text size="sm" c="dimmed">
            Alice Waters speaking in an English-language interview.
          </Text>
          <Playback duration={view.duration} />
          <Checkbox
            id="loop"
            label="Loop recording"
            checked={view.loop}
            onChange={(event) => actions?.loop(event.currentTarget.checked)}
          />
          <Checkbox
            id="listen"
            label="Hear recording"
            checked={view.listen}
            onChange={(event) => actions?.listen(event.currentTarget.checked)}
          />
          <Button
            id="restart"
            variant="default"
            onClick={() => actions?.restart()}
          >
            Restart recording
          </Button>
          <Accordion variant="default">
            <Accordion.Item value="credits">
              <Accordion.Control>Recording credits</Accordion.Control>
              <Accordion.Panel>
                <Text size="sm">
                  Alice Waters on BBC Radio 4’s <em>The Food Programme</em>. ©
                  BBC,{" "}
                  <Anchor
                    href="https://creativecommons.org/licenses/by/3.0/"
                    target="_blank"
                    rel="noopener"
                  >
                    CC BY 3.0
                  </Anchor>
                  . Converted to mono AAC.{" "}
                  <Anchor
                    href="audio/CREDITS.txt"
                    target="_blank"
                    rel="noopener"
                  >
                    Source &amp; recording credits
                  </Anchor>
                </Text>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        </Stack>
      </Box>
    );
  }
  return {
    Buttons,
    Microphone,
    Example,
    connect(next: Actions) {
      actions = next;
    },
    publish({ position, ...next }: Partial<View>) {
      if (position !== undefined && position !== progress.getSnapshot())
        progress.set(position);
      const previous = model.getSnapshot();
      if (
        Object.entries(next).some(
          ([key, value]) => previous[key as keyof View] !== value,
        )
      )
        model.set({ ...previous, ...next });
    },
  };
}
