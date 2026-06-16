import { useEffect, useState } from 'react';
import { Badge, Card, CardContent, CardHeader, CardTitle, ScrollArea, Skeleton } from '@databricks/appkit-ui/react';
import { Activity, BarChart3, Clock3, MousePointerClick, UsersRound } from 'lucide-react';

interface UsageSummary {
  totalEvents: number;
  totalSessions: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
}

interface UsageActionRow {
  eventType: string;
  events: number;
  sessions: number;
  lastSeenAt: string;
}

interface UsagePageRow {
  page: string;
  events: number;
  sessions: number;
}

interface UsageSessionRow {
  sessionId: string;
  userEmail: string | null;
  startedAt: string;
  lastSeenAt: string;
  events: number;
}

interface UsageEventRow {
  id: string;
  sessionId: string;
  eventType: string;
  page: string | null;
  targetType: string | null;
  targetId: string | null;
  properties: Record<string, unknown>;
  userEmail: string | null;
  urlPath: string | null;
  createdAt: string;
}

interface UsageAnalyticsResponse {
  summary: UsageSummary;
  actions: UsageActionRow[];
  pages: UsagePageRow[];
  sessions: UsageSessionRow[];
  recentEvents: UsageEventRow[];
}

const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not logged';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}

function formatProperties(properties: Record<string, unknown>) {
  const entries = Object.entries(properties).filter(([, value]) => value !== null && value !== undefined && value !== '');
  if (entries.length === 0) return 'No metadata';

  return entries
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' | ');
}

function StatCard({
  title,
  value,
  detail,
  icon: Icon,
}: {
  title: string;
  value: string;
  detail: string;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div>
          <div className="text-sm text-muted-foreground">{title}</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
          <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </div>
      </CardContent>
    </Card>
  );
}

export function UsagePage() {
  const [data, setData] = useState<UsageAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadUsage() {
      setLoading(true);
      setError('');

      const response = await fetch('/api/usage/analytics', { signal: controller.signal });
      const payload = (await response.json().catch(() => null)) as UsageAnalyticsResponse | { message?: string } | null;

      if (!response.ok) {
        throw new Error(payload && 'message' in payload && payload.message ? payload.message : 'Usage analytics are unavailable.');
      }

      setData(payload as UsageAnalyticsResponse);
    }

    void loadUsage()
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Usage analytics are unavailable.');
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  const summary = data?.summary ?? {
    totalEvents: 0,
    totalSessions: 0,
    firstEventAt: null,
    lastEventAt: null,
  };

  return (
    <div className="grid h-[calc(100vh-170px)] min-h-0 gap-3 overflow-hidden">
      <section className="min-h-0 overflow-hidden rounded-lg border bg-background">
        <div className="border-b px-3 py-4 md:px-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Usage Analytics</h2>
              <p className="text-sm text-muted-foreground">Lakebase-backed log of app sessions and user actions.</p>
            </div>
            <Badge variant="outline">Session-level telemetry</Badge>
          </div>
        </div>

        <div className="grid gap-4 p-3">
          <div className="grid gap-3 md:grid-cols-4">
            <StatCard
              title="Events"
              value={numberFormatter.format(summary.totalEvents)}
              detail={`Since ${formatDate(summary.firstEventAt)}`}
              icon={MousePointerClick}
            />
            <StatCard
              title="Sessions"
              value={numberFormatter.format(summary.totalSessions)}
              detail="Browser session UUIDs"
              icon={UsersRound}
            />
            <StatCard
              title="Last event"
              value={formatDate(summary.lastEventAt)}
              detail="Most recent logged action"
              icon={Clock3}
            />
            <StatCard
              title="Action types"
              value={numberFormatter.format(data?.actions.length ?? 0)}
              detail="Distinct event names"
              icon={BarChart3}
            />
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-2">
            <Card className="min-h-0">
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="text-base">Actions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="overflow-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Action</th>
                        <th className="py-2 pr-3 font-medium">Events</th>
                        <th className="py-2 pr-3 font-medium">Sessions</th>
                        <th className="py-2 font-medium">Last seen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(data?.actions ?? []).map((row) => (
                        <tr className="border-b last:border-0" key={row.eventType}>
                          <td className="py-2 pr-3 font-medium">{row.eventType}</td>
                          <td className="py-2 pr-3 tabular-nums">{numberFormatter.format(row.events)}</td>
                          <td className="py-2 pr-3 tabular-nums">{numberFormatter.format(row.sessions)}</td>
                          <td className="py-2 text-xs text-muted-foreground">{formatDate(row.lastSeenAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="text-base">Pages</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid gap-2">
                  {(data?.pages ?? []).map((row) => (
                    <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm" key={row.page}>
                      <div className="font-medium">{row.page}</div>
                      <div className="text-muted-foreground">{numberFormatter.format(row.events)} events</div>
                      <div className="text-muted-foreground">{numberFormatter.format(row.sessions)} sessions</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
            <Card className="min-h-0">
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="text-base">Recent Events</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ScrollArea className="h-[300px] rounded-md border">
                  <div className="divide-y">
                    {(data?.recentEvents ?? []).map((event) => (
                      <div className="grid gap-1 p-3 text-sm" key={event.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium">{event.eventType}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(event.createdAt)}</div>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {[event.page, event.targetType, event.targetId].filter(Boolean).join(' | ') || 'No target'}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{formatProperties(event.properties)}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="px-4 pb-2 pt-3">
                <CardTitle className="text-base">Recent Sessions</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="grid gap-2">
                  {(data?.sessions ?? []).slice(0, 8).map((session) => (
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm" key={session.sessionId}>
                      <div className="truncate font-medium">{session.sessionId}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{session.userEmail ?? 'Unknown user'}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {numberFormatter.format(session.events)} events | Last {formatDate(session.lastSeenAt)}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </div>
  );
}
