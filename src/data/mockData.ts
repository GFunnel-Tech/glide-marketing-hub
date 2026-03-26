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
}

export const clients: Client[] = [
  { id: 1, name: "Joseph Bui", brand: "Open House Finance", status: "GREEN", bmType: "Own BM", cpl: 23.84, cpm: 142.36, leads: 210, spend: 5005, formCvr: 18.5, frequency: 1.87, plaiConnected: true },
  { id: 2, name: "Matt Tixier", brand: "True Mortgage", status: "RED", bmType: "Agency BM", cpl: 57.00, cpm: 125.27, leads: 8, spend: 399, formCvr: 9.3, frequency: 1.25, plaiConnected: false },
  { id: 3, name: "Richard Weinberg", brand: "Rich Capital", status: "RED", bmType: "Own BM", cpl: 50.07, cpm: 152.71, leads: 5, spend: 3532, formCvr: 3.92, frequency: 1.31, plaiConnected: true },
  { id: 4, name: "John Flanders", brand: "Karpata Finance", status: "YELLOW", bmType: "Agency BM", cpl: 74.45, cpm: 172.95, leads: 11, spend: 819, formCvr: 9.23, frequency: 1.30, plaiConnected: false },
  { id: 5, name: "Matthew Silva", brand: "Woodlands", status: "RED", bmType: "Agency BM", cpl: 35.63, cpm: 110.35, leads: 12, spend: 428, formCvr: 18.0, frequency: 1.21, plaiConnected: false },
  { id: 6, name: "Derek Schaffer", brand: "Investor Capital Loans NJ", status: "YELLOW", bmType: "Own BM", cpl: 69.10, cpm: 140.62, leads: 48, spend: 3316, formCvr: 10.5, frequency: 1.31, plaiConnected: true },
  { id: 7, name: "Paul Healey", brand: "Spectrum One Mortgage", status: "BLOCKED", bmType: "Agency BM", cpl: 152.78, cpm: 157.62, leads: 3, spend: 458, formCvr: 0, frequency: 1.27, plaiConnected: true },
  { id: 8, name: "Jason Gilmore", brand: "James Paxton Mortgages", status: "GREEN", bmType: "Agency BM", cpl: 13.83, cpm: 55.07, leads: 112, spend: 1549, formCvr: 17.9, frequency: 2.17, plaiConnected: false },
  { id: 9, name: "Dan Nguyen", brand: "Win Capital LLC", status: "GREEN", bmType: "Own BM", cpl: 8.10, cpm: 57.38, leads: 582, spend: 4713, formCvr: 25.77, frequency: 3.50, plaiConnected: true },
  { id: 10, name: "Chad", brand: "Canada Mortgage Direct", status: "GREEN", bmType: "Own BM", cpl: 10.72, cpm: 17.32, leads: 812, spend: 8704, formCvr: 22.0, frequency: 4.47, plaiConnected: true },
  { id: 11, name: "Kelto", brand: "Quebec Refinance", status: "GREEN", bmType: "Own BM", cpl: 10.02, cpm: 18.50, leads: 457, spend: 4577, formCvr: 20.5, frequency: 3.03, plaiConnected: true },
  { id: 12, name: "Shaun Woods", brand: "Opus Grenero", status: "YELLOW", bmType: "Agency BM", cpl: 107.77, cpm: 173.46, leads: 4, spend: 431, formCvr: 2.70, frequency: 1.16, plaiConnected: false },
  { id: 13, name: "Dean Onwumere", brand: "Part 2 Lending", status: "YELLOW", bmType: "Agency BM", cpl: 72.96, cpm: 150.05, leads: 9, spend: 657, formCvr: 2.04, frequency: 1.46, plaiConnected: false },
  { id: 14, name: "Benjamin Gerritsen", brand: "Mortgage Miracles", status: "BLOCKED", bmType: "Agency BM", cpl: 56.35, cpm: 122.37, leads: 8, spend: 451, formCvr: 6.82, frequency: 1.79, plaiConnected: false },
  { id: 15, name: "Natalie x Brian", brand: "NB Capital", status: "YELLOW", bmType: "Own BM", cpl: 325.38, cpm: 111.85, leads: 1, spend: 325, formCvr: 8.82, frequency: 1.24, plaiConnected: false },
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
