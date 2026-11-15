// SPDX-License-Identifier: GPL-3.0-or-later
import { ControlIcon } from "@ldayton/ui/control-icon";
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
  UnstyledButton,
} from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
import { SettingsSlider } from "./settings-slider";

type View = {
  filesAvailable: boolean;
  busy: boolean;
  pauseEnabled: boolean;
  hidePause: boolean;
  startIcon: "record" | "stop" | "microphone" | "play";
  startLabel: string;
  pauseIcon: "play" | "pause";
  pauseLabel: string;
  devices: { value: string; label: string }[];
  microphone: string;
  example: boolean;
  duration: number;
  loop: boolean;
  listen: boolean;
};
type Actions = {
  openAudio(): void;
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
    filesAvailable: true,
    busy: false,
    pauseEnabled: false,
    hidePause: false,
    startIcon: "record",
    startLabel: "Start microphone",
    pauseIcon: "pause",
    pauseLabel: "Pause",
    devices: [],
    microphone: "",
    example: false,
    duration: 30,
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
          <ControlIcon name={view.startIcon} />
        </ActionIcon>
        <ActionIcon
          id="freeze"
          hidden={view.hidePause}
          variant="default"
          size="lg"
          disabled={view.busy || !view.pauseEnabled}
          aria-label={view.pauseLabel}
          title={view.pauseLabel}
          aria-keyshortcuts="Space"
          onClick={() => actions?.pause()}
        >
          <ControlIcon name={view.pauseIcon} />
        </ActionIcon>
      </Group>
    );
  }
  function WelcomeActions() {
    const view = useView();
    return (
      <Stack align="center" gap="lg">
        <UnstyledButton
          id="begin"
          className="vintage-mic"
          disabled={view.busy}
          aria-label="Start microphone"
          title="Start microphone"
          onClick={() => actions?.start()}
        >
          <svg
            viewBox="0 0 160 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <rect
              x="45"
              y="15"
              width="70"
              height="122"
              rx="35"
              stroke="currentColor"
              strokeWidth="7"
            />
            <path
              d="M48 48h64M46 65h68M46 82h68M48 99h64M55 116h50M80 19v112"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
            />
            <path
              d="M28 88v23c0 30 23 52 52 52s52-22 52-52V88M80 163v48M51 218h58"
              stroke="currentColor"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <path
              d="M38 229h84"
              stroke="currentColor"
              strokeWidth="9"
              strokeLinecap="round"
            />
          </svg>
        </UnstyledButton>
        <Button
          id="demo"
          variant="default"
          disabled={view.busy}
          aria-pressed={view.example}
          onClick={() => actions?.example()}
        >
          Play an Example
        </Button>
        <Button
          id="openAudio"
          variant="default"
          disabled={view.busy || !view.filesAvailable}
          onClick={() => actions?.openAudio()}
        >
          Open audio
        </Button>
      </Stack>
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
            <ControlIcon name="refresh" />
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
    WelcomeActions,
    Buttons,
    Microphone,
    Example,
    connect(next: Actions) {
      actions = next;
    },
    publish({ position, ...next }: Partial<View> & { position?: number }) {
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
