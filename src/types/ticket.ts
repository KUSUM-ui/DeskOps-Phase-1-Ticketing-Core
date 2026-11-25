export const TICKET_STATUSES = [
  "NEW",
  "TRIAGED",
  "ASSIGNED",
  "IN_PROGRESS",
  "ON_HOLD",
  "RESOLVED",
  "CLOSED",
  "CANCELLED"
] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];

export interface Ticket {
  id: string;
  title: string;
  description?: string;
  status: TicketStatus;
  organisationId: string;
  assignedTo?: string;
  duplicateOfId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type CommentVisibility = "PUBLIC" | "INTERNAL";

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  visibility: CommentVisibility;
  createdAt: Date;
  updatedAt: Date;
}

export interface Watcher {
  ticketId: string;
  userId: string;
  createdAt: Date;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  fromStatus: TicketStatus;
  toStatus: TicketStatus;
  actorId: string;
  timestamp: Date;
}

export interface UniformErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
