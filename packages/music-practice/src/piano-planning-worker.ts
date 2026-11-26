import {
  pianoPlanningVersion,
  planPianoInput,
  type PianoWorkerRequest,
  type PianoWorkerReply,
} from "./piano-planning-service";
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
    if (request.version !== pianoPlanningVersion)
      throw Error("Piano worker policy mismatch");
    scope.postMessage({
      id: request.id,
      ok: true,
      version: pianoPlanningVersion,
      plan: planPianoInput(request.input),
    });
  } catch (error) {
    scope.postMessage({
      id: request.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
