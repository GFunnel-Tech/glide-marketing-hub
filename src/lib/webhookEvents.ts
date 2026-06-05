// Catalog of events a webhook endpoint can subscribe to. The catalog is built
// dynamically per workspace so it always reflects the configured status phases
// (indicators) and custom KPIs (custom programmed signals).

export interface WebhookEvent {
  key: string;
  label: string;
  description: string;
}

export interface WebhookEventGroup {
  group: string;
  hint: string;
  events: WebhookEvent[];
}

// The wildcard subscribes an endpoint to everything, including future events.
export const ALL_EVENTS_KEY = "*";

// Signals are the in-app notification stream. Each one mirrors a notification
// `type`, so subscribing fires whenever that signal is raised for anyone.
export const SIGNAL_EVENTS: WebhookEvent[] = [
  { key: "lead_received", label: "Meta lead received", description: "A new lead is captured from a Meta lead form." },
  { key: "new_message", label: "New direct message", description: "A teammate sends a message in a conversation." },
  { key: "custom_kpi_alert", label: "Custom KPI alert", description: "A custom KPI breaches a threshold or trend rule." },
  { key: "guarantee_status_changed", label: "Guarantee status changed", description: "A guarantee moves between On Track, At Risk, Met, or Failed." },
  { key: "ai_action_queued", label: "AI action queued", description: "The AI agent queues an action for approval." },
  { key: "ai_action_executed", label: "AI action executed", description: "The AI agent executes an action on Meta." },
  { key: "payment_failed", label: "Payment failed", description: "A client charge fails in Stripe." },
  { key: "info", label: "General announcement", description: "System updates and informational notices." },
];

interface StatusPhaseLite {
  status_key: string;
  label: string;
}

interface CustomKpiLite {
  id: string;
  name: string;
}

/**
 * Build the full grouped event catalog for a workspace.
 *  - Indicators: one event per configured status phase (status.RED, …) plus a
 *    generic "any status change" event.
 *  - Signals: the notification stream.
 *  - Custom KPIs: each custom KPI's dedicated alert channel.
 */
export function buildWebhookEventCatalog(
  phases: StatusPhaseLite[],
  customKpis: CustomKpiLite[],
): WebhookEventGroup[] {
  const indicatorEvents: WebhookEvent[] = [
    { key: "status.changed", label: "Any status change", description: "Fires on every client status transition." },
    ...phases.map(p => ({
      key: `status.${p.status_key}`,
      label: `Entered “${p.label}”`,
      description: `A client enters the ${p.label} (${p.status_key}) phase.`,
    })),
  ];

  const customEvents: WebhookEvent[] = customKpis.map(k => ({
    key: `custom_kpi.${k.id}`,
    label: k.name,
    description: `This specific custom KPI fires an alert.`,
  }));

  const groups: WebhookEventGroup[] = [
    {
      group: "Indicators",
      hint: "Client status / health transitions (Red, Yellow, Green and lifecycle phases).",
      events: indicatorEvents,
    },
    {
      group: "Signals",
      hint: "Operational events from across the workspace.",
      events: SIGNAL_EVENTS,
    },
  ];

  if (customEvents.length > 0) {
    groups.push({
      group: "Custom KPIs",
      hint: "Your custom-programmed metrics. Each fires when its alert rule trips.",
      events: customEvents,
    });
  }

  return groups;
}

/** Human label for an event key, falling back to the raw key for custom ones. */
export function labelForEventKey(key: string, groups: WebhookEventGroup[]): string {
  if (key === ALL_EVENTS_KEY) return "All events";
  for (const g of groups) {
    const found = g.events.find(e => e.key === key);
    if (found) return found.label;
  }
  return key;
}
