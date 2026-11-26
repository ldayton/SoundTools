// SPDX-License-Identifier: AGPL-3.0-or-later
// Optional research worker. No published weights are bundled or fetched.
import { planUnifiedPianoPhrase, unifiedPianoPolicyVersion } from "./unified";
import { validateParncuttWeights } from "./decode";
import type { ParncuttWeights } from "./rules";
import type {
  PianoWorkerRequest,
  PianoWorkerReply,
} from "../../src/piano-planning-service";
const scope = globalThis as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<PianoWorkerRequest>) => void,
  ): void;
  postMessage(reply: PianoWorkerReply): void;
};
scope.addEventListener("message", (event) => {
  const request = event.data;
  if (!request || !Number.isSafeInteger(request.id)) return;
  try {
    if (request.version !== unifiedPianoPolicyVersion)
      throw Error("Unified worker policy mismatch");
    const weights = request.configuration?.weights as ParncuttWeights;
    validateParncuttWeights(weights);
    const result = planUnifiedPianoPhrase(
      request.input.notes,
      weights,
      request.input.profile,
    );
    scope.postMessage({
      id: request.id,
      ok: true,
      version: unifiedPianoPolicyVersion,
      plan: result.plan,
    });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
