// SPDX-License-Identifier: MIT
import {
  BrowserClient,
  Scope,
  defaultStackParser,
  makeFetchTransport,
  logger,
  metrics,
} from "@sentry/browser";

import { makeOfflineTransport } from "@sentry/core";
import { createOfflineStore } from "./offline-store.mjs";

const codePattern = /^[a-z][a-z0-9_.-]{0,79}$/;
const MAX_AGE_SECONDS = 86400;

// Envelopes can contain errors, logs or metrics. sent_at changes on retry, so
// expiry must inspect original item timestamps, including batched containers.
export function freshEnvelope(envelope, now = Date.now() / 1000) {
  if (!Array.isArray(envelope?.[1]) || !envelope[1].length) return false;
  return envelope[1].every((item) => {
    if (!Array.isArray(item)) return false;
    const [header, payload] = item;
    if (!header || !payload || typeof payload !== "object") return false;
    if (!["event", "log", "trace_metric"].includes(header.type)) return false;
    const items = payload.items || [payload];
    if (!Array.isArray(items)) return false;
    return (
      items.length > 0 &&
      items.every(
        (item) =>
          Number.isFinite(item?.timestamp) &&
          now - item.timestamp <= MAX_AGE_SECONDS &&
          item.timestamp <= now + 60,
      )
    );
  });
}

export function create({
  app,
  release,
  dsn,
  dbName,
  enabled,
  environment = "production",
  fields = {},
}) {
  const releaseName = app + "@" + release;
  let closed = false;
  const active = () => !closed && enabled();
  function attributes(input = {}) {
    const safe = {
      app,
      "sentry.release": releaseName,
      "sentry.environment": environment,
    };
    for (const [name, type] of Object.entries(fields)) {
      const value = input[name];
      if (
        (type === "number" && Number.isFinite(value)) ||
        (type === "boolean" && typeof value === "boolean") ||
        (Array.isArray(type) && type.includes(value))
      )
        safe[name] = value;
    }
    return safe;
  }
  const gated = (options) => {
    const transport = makeFetchTransport(options);
    return {
      ...transport,
      send(envelope) {
        if (!active() || !freshEnvelope(envelope))
          return Promise.resolve({ statusCode: 200 });
        return transport.send(envelope);
      },
    };
  };
  const store = createOfflineStore({ dbName, maxQueueSize: 30 });
  let offlineTransport;
  const transport = (options) => {
    offlineTransport = makeOfflineTransport(gated)({
      ...options,
      createStore: () => store,
    });
    return offlineTransport;
  };
  const online = () => {
    void offlineTransport?.flush().catch(() => {});
  };
  globalThis.addEventListener("online", online);
  // An isolated client/scope avoids taking over another app's SDK or inheriting
  // global user data. No console, network, DOM, replay or tracing integrations.
  const client = new BrowserClient({
    dsn,
    release: releaseName,
    environment,
    integrations: [],
    stackParser: defaultStackParser,
    sendClientReports: false,
    maxBreadcrumbs: 0,
    normalizeDepth: 8,
    normalizeMaxBreadth: 200,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
    },
    transport,
    transportOptions: {
      dbName,
      maxQueueSize: 30,
      flushAtStartup: true,
      shouldStore: (envelope) => active() && freshEnvelope(envelope),
    },
    beforeSend: (event) =>
      active()
        ? {
            event_id: event.event_id,
            timestamp: event.timestamp,
            platform: "javascript",
            release: releaseName,
            environment,
            level: "error",
            fingerprint: event.fingerprint,
            exception: event.exception,
            tags: { app },
            contexts: { diagnostics: event.contexts?.diagnostics },
          }
        : null,
    beforeSendLog: (log) =>
      active() && codePattern.test(log.message)
        ? {
            level: "info",
            message: log.message,
            attributes: attributes(log.attributes),
          }
        : null,
    beforeSendMetric: (metric) =>
      active() && codePattern.test(metric.name) && Number.isFinite(metric.value)
        ? {
            name: metric.name,
            value: metric.value,
            type: metric.type,
            unit: metric.unit,
            attributes: attributes(metric.attributes),
          }
        : null,
  });
  const scope = new Scope();
  scope.setClient(client);
  client.init();
  return {
    capture(error, report) {
      if (!active()) return;
      scope.captureEvent({
        level: "error",
        exception: {
          values: [
            {
              type: error.name,
              value: error.code,
              stacktrace: {
                frames: error.frames
                  .slice()
                  .reverse()
                  .map((frame) => ({ ...frame, in_app: true })),
              },
            },
          ],
        },
        contexts: { diagnostics: report },
        fingerprint: [
          app,
          error.code,
          error.name,
          error.frames[0]?.filename || "",
          String(error.frames[0]?.lineno || 0),
        ],
      });
    },
    summary(batch) {
      if (!active()) return;
      const options = { scope, attributes: attributes(batch.context) };
      for (const [code, count] of Object.entries(batch.counts))
        metrics.count(code, count, options);
      for (const [name, delta] of Object.entries(batch.metrics)) {
        // Counts/totals are deltas, never cumulative session values. This makes
        // weighted averages correct across sessions with different frame rates.
        metrics.count(name + ".count", delta.count, options);
        metrics.count(name + ".total", delta.sum, options);
        metrics.gauge(name + ".max", delta.max, options);
      }
      if (batch.elapsedMs > 0)
        metrics.count("session.elapsed_ms", batch.elapsedMs, options);
      for (const entry of batch.logs)
        logger.info(
          entry.code,
          attributes({ ...batch.context, ...entry.details }),
          { scope },
        );
    },
    flush: () => client.flush(1000),
    close: async () => {
      try {
        return await client.close(1000);
      } finally {
        closed = true;
        globalThis.removeEventListener("online", online);
        store.close();
      }
    },
  };
}
