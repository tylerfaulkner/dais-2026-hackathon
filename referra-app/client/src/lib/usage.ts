export type UsagePage = 'genie' | 'clinics' | 'nfhs' | 'usage';

export interface UsageLogEvent {
  eventType: string;
  page?: UsagePage | string;
  targetType?: string;
  targetId?: string;
  properties?: Record<string, unknown>;
}

const usageSessionStorageKey = 'referra-usage-session-id';

function createSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function getUsageSessionId() {
  if (typeof window === 'undefined') return createSessionId();

  const existingSessionId = window.sessionStorage.getItem(usageSessionStorageKey);
  if (existingSessionId) return existingSessionId;

  const sessionId = createSessionId();
  window.sessionStorage.setItem(usageSessionStorageKey, sessionId);
  return sessionId;
}

export function logUsageAction(event: UsageLogEvent) {
  if (typeof window === 'undefined') return;

  const payload = JSON.stringify({
    sessionId: getUsageSessionId(),
    eventType: event.eventType,
    page: event.page,
    targetType: event.targetType,
    targetId: event.targetId,
    properties: event.properties ?? {},
    urlPath: `${window.location.pathname}${window.location.search}${window.location.hash}`,
  });

  const blob = new Blob([payload], { type: 'application/json' });
  if (navigator.sendBeacon && blob.size < 60_000) {
    navigator.sendBeacon('/api/usage/events', blob);
    return;
  }

  void fetch('/api/usage/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // Usage logging must not interrupt clinical workflows.
  });
}
