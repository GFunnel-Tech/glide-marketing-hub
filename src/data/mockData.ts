export interface Client {
  id: number;
  name: string;
  brand: string;
  status: "GREEN" | "YELLOW" | "RED" | "BLOCKED";
  bmType: "Own BM" | "Agency BM";
  cpl: number;
  cpm: number;
  leads: number;
  spend: number;
  formCvr: number;
  frequency: number;
  plaiConnected: boolean;
  doubleCount: boolean;
  trueCpl: number;
  reportedLeads: number;
  trueLeads: number;
  lastAudit: string;
}

export const clients: Client[] = [
  { id: 1, name: "Joseph Bui", brand: "Open House Finance", status: "GREEN", bmType: "Own BM", cpl: 23.84, cpm: 142.36, leads: 210, spend: 5005, formCvr: 18.5, frequency: 1.87, plaiConnected: true, doubleCount: false, trueCpl: 23.84, reportedLeads: 210, trueLeads: 210, lastAudit: "Mar 20" },
  { id: 2, name: "Matt Tixier", brand: "True Mortgage", status: "RED", bmType: "Agency BM", cpl: 57.00, cpm: 125.27, leads: 8, spend: 399, formCvr: 9.3, frequency: 1.25, plaiConnected: false, doubleCount: true, trueCpl: 83.70, reportedLeads: 8, trueLeads: 5, lastAudit: "Mar 25" },
  { id: 3, name: "Richard Weinberg", brand: "Rich Capital", status: "RED", bmType: "Own BM", cpl: 50.07, cpm: 152.71, leads: 5, spend: 3532, formCvr: 3.92, frequency: 1.31, plaiConnected: true, doubleCount: true, trueCpl: 50.07, reportedLeads: 96, trueLeads: 67, lastAudit: "Mar 25" },
  { id: 4, name: "John Flanders", brand: "Karpata Finance", status: "YELLOW", bmType: "Agency BM", cpl: 74.45, cpm: 172.95, leads: 11, spend: 819, formCvr: 9.23, frequency: 1.30, plaiConnected: false, doubleCount: true, trueCpl: 94.11, reportedLeads: 11, trueLeads: 9, lastAudit: "Mar 22" },
  { id: 5, name: "Matthew Silva", brand: "Woodlands", status: "RED", bmType: "Agency BM", cpl: 35.63, cpm: 110.35, leads: 12, spend: 428, formCvr: 18.0, frequency: 1.21, plaiConnected: false, doubleCount: false, trueCpl: 35.63, reportedLeads: 12, trueLeads: 12, lastAudit: "Mar 18" },
  { id: 6, name: "Derek Schaffer", brand: "Investor Capital Loans NJ", status: "YELLOW", bmType: "Own BM", cpl: 69.10, cpm: 140.62, leads: 48, spend: 3316, formCvr: 10.5, frequency: 1.31, plaiConnected: true, doubleCount: false, trueCpl: 69.10, reportedLeads: 48, trueLeads: 48, lastAudit: "Mar 20" },
  { id: 7, name: "Paul Healey", brand: "Spectrum One Mortgage", status: "BLOCKED", bmType: "Agency BM", cpl: 152.78, cpm: 157.62, leads: 3, spend: 458, formCvr: 0, frequency: 1.27, plaiConnected: true, doubleCount: false, trueCpl: 152.78, reportedLeads: 3, trueLeads: 3, lastAudit: "Mar 15" },
  { id: 8, name: "Jason Gilmore", brand: "James Paxton Mortgages", status: "GREEN", bmType: "Agency BM", cpl: 13.83, cpm: 55.07, leads: 112, spend: 1549, formCvr: 17.9, frequency: 2.17, plaiConnected: false, doubleCount: true, trueCpl: 32.05, reportedLeads: 112, trueLeads: 47, lastAudit: "Mar 25" },
  { id: 9, name: "Dan Nguyen", brand: "Win Capital LLC", status: "GREEN", bmType: "Own BM", cpl: 8.10, cpm: 57.38, leads: 582, spend: 4713, formCvr: 25.77, frequency: 3.50, plaiConnected: true, doubleCount: false, trueCpl: 8.10, reportedLeads: 582, trueLeads: 582, lastAudit: "Mar 23" },
  { id: 10, name: "Chad", brand: "Canada Mortgage Direct", status: "GREEN", bmType: "Own BM", cpl: 10.72, cpm: 17.32, leads: 812, spend: 8704, formCvr: 22.0, frequency: 4.47, plaiConnected: true, doubleCount: false, trueCpl: 10.72, reportedLeads: 812, trueLeads: 812, lastAudit: "Mar 22" },
  { id: 11, name: "Kelto", brand: "Quebec Refinance", status: "GREEN", bmType: "Own BM", cpl: 10.02, cpm: 18.50, leads: 457, spend: 4577, formCvr: 20.5, frequency: 3.03, plaiConnected: true, doubleCount: false, trueCpl: 10.02, reportedLeads: 457, trueLeads: 457, lastAudit: "Mar 20" },
  { id: 12, name: "Shaun Woods", brand: "Opus Grenero", status: "YELLOW", bmType: "Agency BM", cpl: 107.77, cpm: 173.46, leads: 4, spend: 431, formCvr: 2.70, frequency: 1.16, plaiConnected: false, doubleCount: false, trueCpl: 107.77, reportedLeads: 4, trueLeads: 4, lastAudit: "Mar 18" },
  { id: 13, name: "Dean Onwumere", brand: "Part 2 Lending", status: "YELLOW", bmType: "Agency BM", cpl: 72.96, cpm: 150.05, leads: 9, spend: 657, formCvr: 2.04, frequency: 1.46, plaiConnected: false, doubleCount: false, trueCpl: 72.96, reportedLeads: 9, trueLeads: 9, lastAudit: "Mar 15" },
  { id: 14, name: "Benjamin Gerritsen", brand: "Mortgage Miracles", status: "BLOCKED", bmType: "Agency BM", cpl: 56.35, cpm: 122.37, leads: 8, spend: 451, formCvr: 6.82, frequency: 1.79, plaiConnected: false, doubleCount: false, trueCpl: 56.35, reportedLeads: 8, trueLeads: 8, lastAudit: "Mar 12" },
  { id: 15, name: "Natalie x Brian", brand: "NB Capital", status: "YELLOW", bmType: "Own BM", cpl: 325.38, cpm: 111.85, leads: 1, spend: 325, formCvr: 8.82, frequency: 1.24, plaiConnected: false, doubleCount: false, trueCpl: 325.38, reportedLeads: 1, trueLeads: 1, lastAudit: "Mar 10" },
];

export const clientPortalData = {
  clientName: "Jason Gilmore",
  brand: "James Paxton Mortgages",
  month: "March 2026",
  kpis: {
    newLeads: { value: 112, delta: 18, deltaType: "positive" as const },
    appointmentsSet: { value: 24, delta: 30, deltaType: "positive" as const },
    applications: { value: 33, delta: 23, deltaType: "positive" as const },
    closedDeals: { value: 21, delta: 16, deltaType: "positive" as const },
  },
  pipeline: [
    { stage: "Leads", count: 112 },
    { stage: "Conversations", count: 74 },
    { stage: "Appointments", count: 24 },
    { stage: "Applications", count: 33 },
    { stage: "Closed", count: 21 },
  ],
  performance: {
    cpl: 13.83,
    cplTarget: 50,
    adSpend: 1549,
    adBudget: 1550,
    estimatedPipelineValue: 315000,
  },
  recentLeads: [
    { name: "James Patterson", date: "Mar 25", stage: "Appointment Set", phone: "(555) 000-0001", status: "Active" },
    { name: "Maria Chen", date: "Mar 24", stage: "Application", phone: "(555) 000-0002", status: "Active" },
    { name: "Robert Williams", date: "Mar 23", stage: "Closed", phone: "(555) 000-0003", status: "Won" },
    { name: "Sarah Johnson", date: "Mar 22", stage: "Conversation", phone: "(555) 000-0004", status: "Active" },
    { name: "David Kim", date: "Mar 21", stage: "New Lead", phone: "(555) 000-0005", status: "New" },
  ],
};

export const portfolioKPIs = {
  totalActiveClients: 32,
  totalLeadsThisMonth: { value: 2283, delta: 22.1 },
  blendedCPL: { value: 38.42, delta: -12.3 },
  totalAdSpend: { value: 35364, delta: 8.5 },
  closedDeals: { value: 21, delta: 16 },
};

export const campaigns = [
  { id: 1, name: "FB Lead Gen - Purchase", spend: 820, leads: 58, cpl: 14.14, status: "active" as const },
  { id: 2, name: "FB Lead Gen - Refinance", spend: 490, leads: 35, cpl: 14.0, status: "active" as const },
  { id: 3, name: "IG Stories - Rate Drop", spend: 239, leads: 19, cpl: 12.58, status: "paused" as const },
];

export const notes = [
  { id: 1, timestamp: "Mar 24, 2026 3:45 PM", author: "Sarah K.", text: "Scaled budget by 20% after strong CPL performance this week." },
  { id: 2, timestamp: "Mar 20, 2026 10:12 AM", author: "Mike R.", text: "Swapped lead form to V3 — shorter form, expect higher CVR." },
  { id: 3, timestamp: "Mar 15, 2026 2:30 PM", author: "Sarah K.", text: "Client approved new creative batch. Launching Monday." },
];

export const campaignData = [
  { id: "c1", clientId: "1", name: "Open House Finance | Lead Form | ABO - Mar 14", status: "active" as const, spend: 1250, leads: 52, trueLeads: 52, cpl: 24.03, trueCpl: 24.03, cpm: 142.36, frequency: 1.87, adSets: 2, ads: 3, doubleCount: false },
  { id: "c2", clientId: "3", name: "Rich Capital | Lead Form | ABO - Mar 17", status: "active" as const, spend: 3532, leads: 96, trueLeads: 67, cpl: 36.80, trueCpl: 50.07, cpm: 152.71, frequency: 1.31, adSets: 2, ads: 4, doubleCount: true },
  { id: "c3", clientId: "8", name: "Jason Gilmore - Jan 24 - CBO Dynamic Ads", status: "active" as const, spend: 1549, leads: 112, trueLeads: 47, cpl: 13.83, trueCpl: 32.05, cpm: 55.07, frequency: 2.17, adSets: 1, ads: 1, doubleCount: true },
  { id: "c4", clientId: "9", name: "Win Capital LLC | Lead Form | ABO - Feb 20", status: "active" as const, spend: 4713, leads: 582, trueLeads: 582, cpl: 8.10, trueCpl: 8.10, cpm: 57.38, frequency: 3.50, adSets: 3, ads: 4, doubleCount: false },
  { id: "c5", clientId: "2", name: "True Mortgage | Lead Form | ABO - Mar 18", status: "active" as const, spend: 399, leads: 8, trueLeads: 5, cpl: 49.84, trueCpl: 83.70, cpm: 125.27, frequency: 1.25, adSets: 4, ads: 6, doubleCount: true },
  { id: "c6", clientId: "10", name: "Canada Mortgage Direct | Main Campaign", status: "active" as const, spend: 8704, leads: 812, trueLeads: 812, cpl: 10.72, trueCpl: 10.72, cpm: 17.32, frequency: 4.47, adSets: 2, ads: 3, doubleCount: false },
  { id: "c7", clientId: "4", name: "Karpata Finance | Lead Form | DSCR ABO", status: "active" as const, spend: 819, leads: 11, trueLeads: 9, cpl: 74.45, trueCpl: 94.11, cpm: 172.95, frequency: 1.30, adSets: 4, ads: 4, doubleCount: true },
];

export const pipelineData = [
  { clientId: "8", stages: [
    { name: "Leads", count: 112, color: "#f97316" },
    { name: "Conversations", count: 74, color: "#ea6f10" },
    { name: "Appointments", count: 24, color: "#db5b00" },
    { name: "Applications", count: 33, color: "#c74f00" },
    { name: "Closed", count: 21, color: "#b34400" },
  ]},
  { clientId: "9", stages: [
    { name: "Leads", count: 582, color: "#f97316" },
    { name: "Conversations", count: 320, color: "#ea6f10" },
    { name: "Appointments", count: 87, color: "#db5b00" },
    { name: "Applications", count: 34, color: "#c74f00" },
    { name: "Closed", count: 12, color: "#b34400" },
  ]},
];

export const cplTrendData = [
  { date: "Mar 1",  reported: 38.2, true: 38.2 },
  { date: "Mar 5",  reported: 37.8, true: 44.1 },
  { date: "Mar 10", reported: 37.1, true: 52.3 },
  { date: "Mar 15", reported: 36.9, true: 58.7 },
  { date: "Mar 20", reported: 37.2, true: 61.4 },
  { date: "Mar 25", reported: 36.95, true: 60.92 },
];

export const activityLog = [
  { id: "a1", clientId: "3", timestamp: "Mar 25, 2026 2:32 PM", author: "Cam", action: "Manus audit triggered", result: "RED status confirmed — form CVR 3.92%", type: "audit" },
  { id: "a2", clientId: "3", timestamp: "Mar 24, 2026 11:15 AM", author: "Danish", action: "Tracking audit started", result: "PageView duplication confirmed in Events Manager", type: "tracking" },
  { id: "a3", clientId: "9", timestamp: "Mar 23, 2026 9:00 AM", author: "Zach", action: "Budget scaled 20%", result: "Daily budget from $50 to $60", type: "budget" },
  { id: "a4", clientId: "10", timestamp: "Mar 22, 2026 3:45 PM", author: "Zach", action: "Retargeting activated", result: "3 audiences created", type: "campaign" },
];

export const auditResults = [
  {
    id: "au1", clientId: "3", date: "2026-03-25", status: "RED" as const,
    trueCpl: 36.80, reportedCpl: 50.07, doubleCount: true, activeAds: 4, formCvr: 3.92,
    conflicts: [
      "Form CVR 3.92% — disqualifier form blocking qualified leads",
      "Credit exit logic broken — sub-640 leads passing through",
      "Landing page pixel missing Lead event",
      "2 leads missing from GHL (March 17)",
    ],
    priorityActions: [
      { text: "Fix double-counting: remove Lead pixel from redirect page", owner: "Danish", status: "pending" as const },
      { text: "Swap to simplified 3-question form", owner: "Zach", status: "pending" as const },
      { text: "Install Lead event on landing page thank-you", owner: "Danish", status: "pending" as const },
      { text: "Build 4 GHL CAPI workflows with unique tokens", owner: "Danish", status: "pending" as const },
    ],
    pathToGreen: "CPL below $30. Form CVR above 15%. Simplified form live. All 4 CAPI workflows running.",
    estimatedTimeline: "14–21 days",
  },
];

export const onboardingClients = [
  { id: "ob1", clientId: "14", name: "Sean Bristol", brand: "Vertex Capital", phase: 1, daysInPhase: 5, owner: "Maru", blockers: ["GFunnel partner access pending", "No Instagram account"] },
  { id: "ob2", clientId: "15", name: "Natalie x Brian", brand: "NB Capital", phase: 3, daysInPhase: 12, owner: "Zach", blockers: [] },
  { id: "ob3", clientId: "7", name: "Paul Healey", brand: "Spectrum One", phase: 1, daysInPhase: 3, owner: "Tim", blockers: ["New BM creation pending", "Remove banned account from agency BM"] },
];

export const mockLeads = [
  { id: "l1", clientId: "8", name: "James Patterson", date: "Mar 25", stage: "Appointment Set", phone: "(555)000-0001", status: "active" },
  { id: "l2", clientId: "8", name: "Maria Chen", date: "Mar 24", stage: "Application", phone: "(555)000-0002", status: "active" },
  { id: "l3", clientId: "8", name: "Robert Williams", date: "Mar 23", stage: "Closed Won", phone: "(555)000-0003", status: "closed" },
  { id: "l4", clientId: "8", name: "Sarah Johnson", date: "Mar 22", stage: "Conversation", phone: "(555)000-0004", status: "active" },
  { id: "l5", clientId: "8", name: "David Kim", date: "Mar 21", stage: "New Lead", phone: "(555)000-0005", status: "new" },
  { id: "l6", clientId: "9", name: "Lisa Chen", date: "Mar 25", stage: "Application", phone: "(555)000-0006", status: "active" },
  { id: "l7", clientId: "9", name: "Michael Torres", date: "Mar 24", stage: "Closed Won", phone: "(555)000-0007", status: "closed" },
];

export const monthlyReports = [
  { id: "r1", clientId: "8", clientName: "Jason Gilmore", brand: "James Paxton Mortgages", month: "March 2026", status: "delivered" as const, deliveredDate: "Mar 11", clientReviewed: true, metrics: { spend: 1549, leads: 47, cpl: 32.05, appointments: 24, applications: 33, closedDeals: 21, pipelineValue: 315000 } },
  { id: "r2", clientId: "9", clientName: "Dan Nguyen", brand: "Win Capital LLC", month: "March 2026", status: "delivered" as const, deliveredDate: "Mar 11", clientReviewed: false, metrics: { spend: 4713, leads: 582, cpl: 8.10, appointments: 87, applications: 34, closedDeals: 12, pipelineValue: 180000 } },
  { id: "r3", clientId: "10", clientName: "Chad", brand: "Canada Mortgage Direct", month: "March 2026", status: "ready" as const, deliveredDate: null, clientReviewed: false, metrics: { spend: 8704, leads: 812, cpl: 10.72, appointments: 120, applications: 45, closedDeals: 18, pipelineValue: 270000 } },
  { id: "r4", clientId: "3", clientName: "Richard Weinberg", brand: "Rich Capital", month: "March 2026", status: "draft" as const, deliveredDate: null, clientReviewed: false, metrics: { spend: 3532, leads: 67, cpl: 50.07, appointments: 8, applications: 3, closedDeals: 1, pipelineValue: 15000 } },
];

export const teamMembers = [
  { id: "t1", name: "Cam Mitchell", role: "Admin", accessLevel: "Full Access", status: "active" as const },
  { id: "t2", name: "Zach", role: "Media Buyer", accessLevel: "Campaigns + Reports", status: "active" as const },
  { id: "t3", name: "Danish", role: "Tech", accessLevel: "Tracking + Integrations", status: "active" as const },
  { id: "t4", name: "Maru", role: "Onboarding", accessLevel: "Onboarding + Clients", status: "active" as const },
  { id: "t5", name: "Tim", role: "Agency Owner", accessLevel: "Approvals + Reports", status: "active" as const },
  { id: "t6", name: "Dawn", role: "Sales", accessLevel: "Reports Only", status: "active" as const },
];
