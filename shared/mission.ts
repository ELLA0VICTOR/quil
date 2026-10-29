export type AgentId = "quil" | "pip" | "milo" | "iris" | "wren";
export type RunMode = "fixture" | "live";
export type RunStatus =
  "queued" | "running" | "paused" | "completed" | "cancelled" | "failed";
export type Brief = {
  request: string;
  category: string;
  location: string;
  service: string;
  limit: number;
};
export type BriefField = "category" | "location" | "service";
export type PreparedBrief = {
  context: Partial<Brief>;
  missing: BriefField[];
  question?: string;
  questionField?: BriefField;
  brief?: Brief;
};
export type Source = {
  id: string;
  url: string;
  title: string;
  observation: string;
  observedAt: string;
  fictional: boolean;
  kind?: "search_snippet" | "website_reference" | "website_page" | "fixture";
};
export type Candidate = {
  id: string;
  name: string;
  website: string | null;
  sourceIds: string[];
};
export type Finding = {
  candidateId: string;
  summary: string;
  sourceIds: string[];
};
export type Decision = {
  candidateId: string;
  verdict: "opportunity" | "uncertain" | "ruled_out";
  reason: string;
  sourceIds: string[];
  evidenceQuote?: string;
};
export type WebsiteCheck = {
  candidateId: string;
  url: string | null;
  status: "reachable" | "unreachable" | "inconclusive" | "not_listed";
  checkedAt: string;
  httpStatus?: number;
  bookingLinks: string[];
  contactEmails?: string[];
  reason: string;
};
export type Draft = {
  candidateId: string;
  text: string;
  sourceIds: string[];
  offer?: string;
  followUps?: { afterDays: number; text: string }[];
  meetingAgenda?: string[];
};
export type Outcome = {
  text: string;
  candidates: Candidate[];
  findings: Finding[];
  decisions: Decision[];
  drafts: Draft[];
  sources: Source[];
  websiteChecks?: WebsiteCheck[];
};
export type RunEvent = {
  id: number;
  runId: string;
  at: string;
  type: string;
  agent?: AgentId;
  data: Record<string, unknown>;
};
export type RunSnapshot = {
  id: string;
  mode: RunMode;
  status: RunStatus;
  brief: Brief;
  createdAt: string;
  updatedAt: string;
  outcome?: Outcome;
  error?: string;
};
export type CreatedRun = {
  run: RunSnapshot;
  accessToken: string;
  eventsUrl: string;
};
