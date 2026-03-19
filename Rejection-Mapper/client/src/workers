/**
 * importPoller.worker.ts
 *
 * Web Worker that polls /api/import-entries/:id/progress on a fixed interval.
 * Because this runs in a Worker thread (not the main tab), the browser does NOT
 * throttle it when the tab is backgrounded, the screen locks, or the user switches apps.
 *
 * Messages IN  (main → worker):
 *   { type: "START",  importId: string, pollInterval: number }
 *   { type: "STOP" }
 *
 * Messages OUT (worker → main):
 *   { type: "PROGRESS", data: ProgressPayload }
 *   { type: "DONE",     data: ProgressPayload }
 *   { type: "ERROR",    message: string }
 */

interface ProgressPayload {
  importId: string;
  status: "pending" | "running" | "done" | "failed" | "cancelled";
  totalRows: number;
  processedRows: number;
  successfulImports: number;
  failedRows: number;
  message: string;
  result?: Record<string, any>;
}

let intervalId: ReturnType<typeof setInterval> | null = null;
let currentImportId: string | null = null;
let pollInterval = 2500;
let consecutiveErrors = 0;
const MAX_ERRORS = 10; // give up after 10 consecutive network failures

function stopPolling() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  currentImportId = null;
  consecutiveErrors = 0;
}

async function poll() {
  if (!currentImportId) return;

  try {
    const res = await fetch(`/api/import-entries/${currentImportId}/progress`, {
      credentials: "include",
    });

    if (!res.ok) {
      consecutiveErrors++;
      if (consecutiveErrors >= MAX_ERRORS) {
        stopPolling();
        self.postMessage({ type: "ERROR", message: "Lost contact with server after multiple retries." });
      }
      return;
    }

    consecutiveErrors = 0; // reset on success
    const data: ProgressPayload = await res.json();

    if (data.status === "running" || data.status === "pending") {
      self.postMessage({ type: "PROGRESS", data });
    } else {
      // Import finished — send final status and stop polling
      stopPolling();
      self.postMessage({ type: "DONE", data });
    }
  } catch {
    consecutiveErrors++;
    if (consecutiveErrors >= MAX_ERRORS) {
      stopPolling();
      self.postMessage({ type: "ERROR", message: "Network error — lost contact with server." });
    }
    // Otherwise silently retry next tick
  }
}

self.onmessage = (e: MessageEvent<{ type: string; importId?: string; pollInterval?: number }>) => {
  const { type, importId, pollInterval: interval } = e.data;

  if (type === "START" && importId) {
    stopPolling(); // clear any previous poll
    currentImportId = importId;
    pollInterval = interval ?? 2500;
    consecutiveErrors = 0;

    // Poll immediately, then on interval
    poll();
    intervalId = setInterval(poll, pollInterval);

  } else if (type === "STOP") {
    stopPolling();
  }
};
