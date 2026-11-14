import { createViewState } from '@ldayton/ui/view-state';
export const offlineState = createViewState({
  status: 'Preparing offline support…',
  ready: false,
  downloadHidden: false,
  downloadDisabled: true,
  downloadLabel: 'Download for offline use',
  updateHidden: true,
  release: undefined as string | undefined,
  progressHidden: true,
  progressMax: 1,
  progressValue: 0,
});
export function setOffline(patch: Partial<ReturnType<typeof offlineState.getSnapshot>>) {
  offlineState.set({ ...offlineState.getSnapshot(), ...patch });
}
export const offlineActions = { download() {}, update() {} };
