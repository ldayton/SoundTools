import {
  AccountDataError,
  checkSchema,
  type Json,
  type Records,
} from "@ldayton/account/model";
import type {
  SpectrogramValues,
  PitchValues,
  WorkspaceState,
} from "./settings-contracts";
export type AudioReference = {
  fingerprint: string;
  name: string;
  duration: number;
  bytes: number;
};
export type Bookmark = {
  id: string;
  name: string;
  file: AudioReference;
  selection: { start: number; end: number };
  viewStart: number;
  viewSpan: number;
  feature: "pitch" | "spectrogram";
  speed: number;
  addedAt: number;
};
export type SoundglowSettings = {
  spectrogram: {
    values: SpectrogramValues;
    selected: string;
    presets: { id: string; name: string; settings: SpectrogramValues }[];
  };
  workspace: WorkspaceState;
  playback: { volume: number; speed: number };
  bookmarks: Bookmark[];
};
export type Models = {
  spectrogram(
    values: SpectrogramValues,
    selected: string,
  ): { values: SpectrogramValues; selected: string };
  pitch(input: PitchValues): PitchValues;
};
const invalid = () => {
  throw new AccountDataError(
    "Invalid Soundglow settings. Your cloud data is preserved.",
  );
};
const savedId = (id: unknown): id is string =>
  typeof id === "string" && /^saved-[a-zA-Z0-9-]+$/.test(id);
const name = (value: unknown, limit: number): value is string =>
  typeof value === "string" && !!value.trim() && value.length <= limit;
export function validBookmark(b: Bookmark) {
  return (
    !!b &&
    name(b.id, 80) &&
    name(b.name, 80) &&
    b.file &&
    /^sha256-tree-v1:[a-f0-9]{64}$/.test(b.file.fingerprint) &&
    name(b.file.name, 255) &&
    Number.isSafeInteger(b.file.bytes) &&
    b.file.bytes > 0 &&
    Number.isFinite(b.file.duration) &&
    b.file.duration > 0 &&
    b.selection &&
    [
      b.selection.start,
      b.selection.end,
      b.viewStart,
      b.viewSpan,
      b.addedAt,
    ].every(Number.isFinite) &&
    b.selection.start >= 0 &&
    b.selection.end > b.selection.start &&
    b.selection.end <= b.file.duration &&
    b.viewStart >= 0 &&
    b.viewSpan > 0 &&
    b.viewStart + b.viewSpan <= b.file.duration + 1e-6 &&
    ["pitch", "spectrogram"].includes(b.feature) &&
    [0.5, 0.75, 1, 1.25, 1.5].includes(b.speed)
  );
}
/** Explicit allowlist: media, microphone identity, analysis and consent never enter a record. */
export function soundglowRecords(s: SoundglowSettings): Records {
  const records: Records = {
    schema: 1,
    spectrogram: {
      values: s.spectrogram.values,
      selected: s.spectrogram.selected,
    },
    pitch: {
      values: s.workspace.pitch,
      selected: s.workspace.selected,
    } as unknown as Json,
    view: s.workspace.active,
    playback: s.playback,
  };
  for (const p of s.spectrogram.presets)
    records["spectrogram-preset:" + p.id] = {
      id: p.id,
      name: p.name,
      settings: p.settings,
    };
  for (const p of s.workspace.presets)
    records["pitch-preset:" + p.id] = {
      id: p.id,
      name: p.name,
      settings: p.settings,
    } as unknown as Json;
  for (const b of s.bookmarks)
    records["bookmark:" + b.id] = {
      id: b.id,
      name: b.name,
      file: {
        fingerprint: b.file.fingerprint,
        name: b.file.name,
        duration: b.file.duration,
        bytes: b.file.bytes,
      },
      selection: { start: b.selection.start, end: b.selection.end },
      viewStart: b.viewStart,
      viewSpan: b.viewSpan,
      feature: b.feature,
      speed: b.speed,
      addedAt: b.addedAt,
    };
  return records;
}
export function restoreSoundglowRecords(
  records: Records,
  models: Models,
): SoundglowSettings {
  checkSchema(records);
  try {
    const spectrum =
      records.spectrogram as unknown as SoundglowSettings["spectrogram"];
    const pitch = records.pitch as unknown as {
      values: PitchValues;
      selected: string;
    };
    if (
      !spectrum ||
      !pitch ||
      !["pitch", "spectrogram"].includes(String(records.view))
    )
      return invalid();
    const spectrogram = {
      ...models.spectrogram(spectrum.values, spectrum.selected),
      presets: [] as SoundglowSettings["spectrogram"]["presets"],
    };
    const workspace: WorkspaceState = {
      active: records.view as WorkspaceState["active"],
      pitch: models.pitch(pitch.values),
      selected: pitch.selected,
      presets: [],
    };
    const bookmarks: Bookmark[] = [];
    for (const [key, value] of Object.entries(records)) {
      if (value === null) continue;
      if (
        key.startsWith("spectrogram-preset:") ||
        key.startsWith("pitch-preset:")
      ) {
        const p = value as any;
        if (
          !savedId(p.id) ||
          !key.endsWith(":" + p.id) ||
          !name(p.name, 60) ||
          p.name.includes("*")
        )
          return invalid();
        if (key.startsWith("spectrogram-"))
          spectrogram.presets.push({
            id: p.id,
            name: p.name,
            settings: models.spectrogram(p.settings, p.id).values,
          });
        else
          workspace.presets.push({
            id: p.id,
            name: p.name,
            settings: models.pitch(p.settings),
          });
      } else if (key.startsWith("bookmark:")) {
        const b = value as unknown as Bookmark;
        if (!validBookmark(b) || key !== "bookmark:" + b.id) return invalid();
        bookmarks.push(structuredClone(b));
      } else if (
        !["schema", "spectrogram", "pitch", "view", "playback"].includes(key)
      )
        return invalid();
    }
    // Deleting a preset on another device can leave its former selection. Keep
    // its actual values as a custom setting, rather than rejecting the snapshot.
    if (
      !["soundglow", "praat", "voice", "custom"].includes(
        spectrogram.selected,
      ) &&
      !spectrogram.presets.some((p) => p.id === spectrogram.selected)
    )
      spectrogram.selected = "custom";
    if (
      !["soundglow", "praat", "custom"].includes(workspace.selected) &&
      !workspace.presets.some((p) => p.id === workspace.selected)
    )
      workspace.selected = "custom";
    if (typeof workspace.selected !== "string") return invalid();
    const playback =
      records.playback as unknown as SoundglowSettings["playback"];
    if (
      !playback ||
      !Number.isFinite(playback.volume) ||
      playback.volume < 0 ||
      playback.volume > 1 ||
      ![0.5, 0.75, 1, 1.25, 1.5].includes(playback.speed)
    )
      return invalid();
    return {
      spectrogram,
      workspace,
      bookmarks: bookmarks.sort((a, b) => a.addedAt - b.addedAt),
      playback: { volume: playback.volume, speed: playback.speed },
    };
  } catch (error) {
    if (error instanceof AccountDataError) throw error;
    return invalid();
  }
}
/** Bounded-memory, content-based identity. No file bytes leave the browser. */
export async function audioFingerprint(blob: Blob): Promise<string> {
  const chunk = 1024 * 1024,
    leaves: Uint8Array[] = [];
  for (let start = 0; start < blob.size; start += chunk)
    leaves.push(
      new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          await blob.slice(start, start + chunk).arrayBuffer(),
        ),
      ),
    );
  const root = new Uint8Array(leaves.length * 32 + 8);
  new DataView(root.buffer).setBigUint64(0, BigInt(blob.size));
  leaves.forEach((leaf, i) => root.set(leaf, 8 + i * 32));
  return (
    "sha256-tree-v1:" +
    Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", root)),
      (b) => b.toString(16).padStart(2, "0"),
    ).join("")
  );
}
