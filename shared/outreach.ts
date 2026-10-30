export type GoogleStatus = {
  configured: boolean;
  connected: boolean;
  email?: string;
  redirectUri: string;
};
export type OutreachAction = {
  id: string;
  runId: string;
  candidateId: string;
  kind: "email" | "follow_up" | "reply" | "meeting";
  state: "prepared" | "sending" | "sent" | "uncertain" | "failed" | "cancelled";
  recipient: string;
  subject: string;
  text: string;
  createdAt: string;
  executionStartedAt?: string;
  expiresAt: string;
  threadId?: string;
  messageId?: string;
  parentId?: string;
  followUpNumber?: number;
  sentAt?: string;
  receivedReply?: boolean;
  lastReplyId?: string;
  start?: string;
  end?: string;
  timeZone?: string;
  eventId?: string;
  calendarUrl?: string;
  meetUrl?: string;
  attendance?: "needsAction" | "accepted" | "declined" | "tentative";
  error?: string;
  sender?: string;
  rfcMessageId?: string;
  replyToMessageId?: string;
  replyRfcMessageId?: string;
  terms?: OfferTerms;
  contactStopped?: boolean;
};

export type OfferTerms = {
  currency: "USD" | "GBP" | "EUR" | "NGN";
  priceMinor: number;
  minimumMinor: number;
  scope: string;
  deliveryDays: number;
};
export type ThreadMessage = {
  id: string;
  from: string;
  text: string;
  sentAt?: string;
  rfcMessageId?: string;
  truncated: boolean;
};
export type Conversation = {
  rootId: string;
  threadId: string;
  recipient: string;
  subject: string;
  messages: ThreadMessage[];
  latestIncoming?: ThreadMessage;
  canReply: boolean;
  stopped: boolean;
};
export type ReplyPlan = {
  rootId: string;
  replyToMessageId: string;
  recipient: string;
  subject: string;
  intent: "interested" | "pricing" | "question" | "meeting" | "declined" | "other";
  evidence: string;
  text: string;
  note: string;
  terms?: OfferTerms;
  meetingStart?: string;
  analysis: "model" | "local";
};
