export type AudioChannels = 'stereo' | 'mono';
export const AUDIO_CHANNELS_KEY = 'dorego.audioChannels';

export function readAudioChannels(): AudioChannels {
  try {
    return localStorage.getItem(AUDIO_CHANNELS_KEY) === 'mono' ? 'mono' : 'stereo';
  } catch {
    return 'stereo';
  }
}

export function saveAudioChannels(channels: AudioChannels) {
  try {
    localStorage.setItem(AUDIO_CHANNELS_KEY, channels);
  } catch {
    // The selection still works for this visit when browser storage is unavailable.
  }
}

/** Web Audio's speakers rule averages stereo as (L + R) / 2 before both outputs. */
export function configureChannelMix(
  node: Pick<AudioNode, 'channelCount' | 'channelCountMode' | 'channelInterpretation'>,
  channels: AudioChannels
) {
  node.channelInterpretation = 'speakers';
  node.channelCountMode = 'explicit';
  node.channelCount = channels === 'mono' ? 1 : 2;
}
