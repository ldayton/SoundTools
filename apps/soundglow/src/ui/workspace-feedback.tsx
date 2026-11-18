// SPDX-License-Identifier: GPL-3.0-or-later
import { useSyncExternalStore, type ReactNode } from "react";
import { Alert, Badge, Box, Button, Stack, Text, Title } from "@mantine/core";
import { createViewState } from "@ldayton/ui/view-state";
type View = {
  state: string;
  live: boolean;
  device: string;
  resolution: string;
  notice: string;
  welcome: boolean;
  libraryStatus: string;
  empty: boolean;
  cloudFiles: boolean;
  importing: boolean;
  storageAvailable: boolean;
  bookmarks: boolean;
  fileTitle: string;
  analysisStatus: string;
};
export function createWorkspaceFeedback() {
  const model = createViewState<View>({
    state: "MIC OFF",
    live: false,
    device: "MICROPHONE",
    resolution: "AUDIO STAYS ON THIS DEVICE",
    notice: "",
    welcome: true,
    libraryStatus: "",
    empty: true,
    cloudFiles: false,
    importing: false,
    storageAvailable: true,
    bookmarks: false,
    fileTitle: "",
    analysisStatus: "",
  });
  let files: { open(): void; import(files: File[]): void } | undefined;
  const useView = () =>
    useSyncExternalStore(model.subscribe, model.getSnapshot);
  function State() {
    const view = useView();
    return (
      <Badge
        id="state"
        className={view.live ? "live" : undefined}
        variant="outline"
        color={view.live ? "green" : "gray"}
      >
        {view.state}
      </Badge>
    );
  }
  function Notice() {
    const view = useView();
    return (
      <Alert id="notice" role="status" color="orange" hidden={!view.notice}>
        {view.notice}
      </Alert>
    );
  }
  function Footer() {
    const view = useView();
    return (
      <Box component="footer">
        <Text id="device" span inherit>
          {view.device}
        </Text>
        <Text id="resolution" span inherit>
          {view.resolution}
        </Text>
      </Box>
    );
  }
  function Welcome({ children }: { children: ReactNode }) {
    const view = useView();
    return (
      <Box id="welcome" hidden={!view.welcome}>
        {children}
      </Box>
    );
  }
  function LibraryHeader() {
    const view = useView();
    return (
      <Stack gap="sm">
        <input
          id="audioFileInput"
          type="file"
          accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac,.aiff,.webm"
          multiple
          hidden
          onChange={(event) => {
            files?.import([...(event.currentTarget.files || [])]);
            event.currentTarget.value = "";
          }}
        />
        <Button
          id="importAudio"
          variant="default"
          disabled={view.importing || !view.storageAvailable}
          onClick={() => files?.open()}
        >
          Open audio files
        </Button>
        <Text id="audioEmpty" size="sm" c="dimmed" hidden={!view.empty}>
          Open files or drop them here.{" "}
          {view.cloudFiles
            ? "Imported files sync privately."
            : "Files stay on this device until you log in."}
        </Text>
        <Text id="audioLibraryStatus" size="sm" role="status">
          {view.libraryStatus}
        </Text>
      </Stack>
    );
  }
  function Bookmarks() {
    const view = useView();
    return (
      <Box
        component="section"
        id="audioBookmarks"
        aria-labelledby="bookmarksHeading"
        hidden={!view.bookmarks}
      >
        <Title id="bookmarksHeading" order={3} size="sm">
          Bookmarks
        </Title>
        <Box id="audioBookmarkList" />
      </Box>
    );
  }
  function FileTitle() {
    const view = useView();
    return (
      <Text component="strong" id="fileTitle" size="sm" fw={600}>
        {view.fileTitle}
      </Text>
    );
  }
  function AnalysisStatus() {
    const view = useView();
    return (
      <Text component="output" id="fileAnalysisStatus" size="xs" role="status">
        {view.analysisStatus}
      </Text>
    );
  }
  return {
    State,
    Notice,
    Footer,
    Welcome,
    LibraryHeader,
    Bookmarks,
    FileTitle,
    AnalysisStatus,
    connectLibrary(actions: NonNullable<typeof files>) {
      files = actions;
    },
    publish(next: Partial<View>) {
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
