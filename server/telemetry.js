const RECENT_WINDOW_MS = 15 * 60 * 1000;
const MAX_RECENT_ENTRIES = 2000;

let activeRequests = 0;
let peakConcurrentRequests = 0;
let totalRequests = 0;
let totalErrors = 0;
const recentRequests = [];

function now() {
  return Date.now();
}

function pruneRecentEntries(referenceTime = now()) {
  while (recentRequests.length && referenceTime - recentRequests[0].ts > RECENT_WINDOW_MS) {
    recentRequests.shift();
  }
  while (recentRequests.length > MAX_RECENT_ENTRIES) {
    recentRequests.shift();
  }
}

function recordRequest(durationMs, statusCode) {
  const entry = {
    ts: now(),
    durationMs: Math.max(0, Number(durationMs) || 0),
    statusCode: Number(statusCode) || 0
  };
  recentRequests.push(entry);
  if (statusCode >= 400) totalErrors += 1;
  pruneRecentEntries(entry.ts);
}

function requestTelemetryMiddleware(req, res, next) {
  const startedAt = now();
  totalRequests += 1;
  activeRequests += 1;
  if (activeRequests > peakConcurrentRequests) {
    peakConcurrentRequests = activeRequests;
  }

  res.on('finish', () => {
    activeRequests = Math.max(0, activeRequests - 1);
    recordRequest(now() - startedAt, res.statusCode);
  });

  next();
}

function summarizeWindow(windowMs, referenceTime) {
  const rows = recentRequests.filter(entry => referenceTime - entry.ts <= windowMs);
  const count = rows.length;
  if (!count) {
    return {
      count: 0,
      errors: 0,
      avgDurationMs: 0,
      p95DurationMs: 0
    };
  }

  const durations = rows.map(entry => entry.durationMs).sort((a, b) => a - b);
  const totalDuration = durations.reduce((sum, value) => sum + value, 0);
  const errors = rows.filter(entry => entry.statusCode >= 400).length;
  const p95Index = Math.min(durations.length - 1, Math.max(0, Math.ceil(durations.length * 0.95) - 1));

  return {
    count,
    errors,
    avgDurationMs: Math.round(totalDuration / count),
    p95DurationMs: durations[p95Index]
  };
}

function getTelemetrySnapshot() {
  const referenceTime = now();
  pruneRecentEntries(referenceTime);
  const minute = summarizeWindow(60 * 1000, referenceTime);
  const fiveMinutes = summarizeWindow(5 * 60 * 1000, referenceTime);
  return {
    activeRequests,
    peakConcurrentRequests,
    totalRequests,
    totalErrors,
    recent: {
      lastMinute: minute,
      lastFiveMinutes: fiveMinutes
    }
  };
}

module.exports = {
  getTelemetrySnapshot,
  requestTelemetryMiddleware
};
