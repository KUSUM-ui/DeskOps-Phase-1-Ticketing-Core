import {
  Comment,
  CommentVisibility,
  Ticket,
  TicketEvent,
  TicketStatus,
  Watcher
} from "../types/ticket";
import { isValidTransition } from "../domain/stateMachine";

export class IllegalTransitionError extends Error {
  public readonly currentStatus: string;
  public readonly targetStatus: string;

  constructor(currentStatus: string, targetStatus: string) {
    super(`Illegal transition from '${currentStatus}' to '${targetStatus}'.`);
    this.name = "IllegalTransitionError";
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
  }
}

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Ticket with ID '${id}' not found.`);
    this.name = "TicketNotFoundError";
  }
}

export class InvalidMergeError extends Error {
  public readonly code: "INVALID_MERGE" | "TENANT_MISMATCH";
  public readonly statusCode: number;

  constructor(
    message: string,
    code: "INVALID_MERGE" | "TENANT_MISMATCH" = "INVALID_MERGE",
    statusCode = 400
  ) {
    super(message);
    this.name = "InvalidMergeError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// In-memory data store for clean decoupling and standalone testing
class TicketRepository {
  private tickets: Map<string, Ticket> = new Map();
  private events: TicketEvent[] = [];
  private comments: Comment[] = [];
  private watchers: Watcher[] = [];

  public createTicket(data: {
    id?: string;
    title: string;
    description?: string;
    status?: TicketStatus;
    organisationId: string;
    assignedTo?: string;
  }): Ticket {
    const id = data.id || `ticket-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const ticket: Ticket = {
      id,
      title: data.title,
      description: data.description,
      status: data.status || "NEW",
      organisationId: data.organisationId,
      assignedTo: data.assignedTo,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.tickets.set(id, ticket);
    return ticket;
  }

  public findById(id: string): Ticket | undefined {
    return this.tickets.get(id);
  }

  public updateStatus(id: string, newStatus: TicketStatus): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.status = newStatus;
    ticket.updatedAt = new Date();
    this.tickets.set(id, ticket);
    return ticket;
  }

  public setDuplicateOf(id: string, originalTicketId: string): Ticket | undefined {
    const ticket = this.tickets.get(id);
    if (!ticket) return undefined;
    ticket.duplicateOfId = originalTicketId;
    ticket.updatedAt = new Date();
    this.tickets.set(id, ticket);
    return ticket;
  }

  public addEvent(event: TicketEvent): void {
    this.events.push(event);
  }

  public getEventsByTicketId(ticketId: string): TicketEvent[] {
    return this.events.filter((e) => e.ticketId === ticketId);
  }

  public addComment(data: {
    id?: string;
    ticketId: string;
    authorId: string;
    body: string;
    visibility?: CommentVisibility;
  }): Comment {
    const now = new Date();
    const comment: Comment = {
      id: data.id || `cmt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ticketId: data.ticketId,
      authorId: data.authorId,
      body: data.body,
      visibility: data.visibility || "PUBLIC",
      createdAt: now,
      updatedAt: now
    };
    this.comments.push(comment);
    return comment;
  }

  public getCommentsByTicketId(ticketId: string): Comment[] {
    return this.comments.filter((c) => c.ticketId === ticketId);
  }

  public moveComments(fromTicketId: string, toTicketId: string): number {
    let movedCount = 0;
    const now = new Date();
    for (const comment of this.comments) {
      if (comment.ticketId === fromTicketId) {
        comment.ticketId = toTicketId;
        comment.updatedAt = now;
        movedCount += 1;
      }
    }
    return movedCount;
  }

  public addWatcher(data: { ticketId: string; userId: string }): Watcher {
    const existing = this.watchers.find(
      (w) => w.ticketId === data.ticketId && w.userId === data.userId
    );
    if (existing) {
      return existing;
    }
    const watcher: Watcher = {
      ticketId: data.ticketId,
      userId: data.userId,
      createdAt: new Date()
    };
    this.watchers.push(watcher);
    return watcher;
  }

  public getWatchersByTicketId(ticketId: string): Watcher[] {
    return this.watchers.filter((w) => w.ticketId === ticketId);
  }

  public moveWatchers(fromTicketId: string, toTicketId: string): number {
    const existingTargetUsers = new Set(
      this.watchers.filter((w) => w.ticketId === toTicketId).map((w) => w.userId)
    );
    let movedCount = 0;

    // Reassign unique watchers from duplicate to original; drop already-present duplicates
    this.watchers = this.watchers.filter((watcher) => {
      if (watcher.ticketId !== fromTicketId) {
        return true;
      }
      if (existingTargetUsers.has(watcher.userId)) {
        return false;
      }
      watcher.ticketId = toTicketId;
      existingTargetUsers.add(watcher.userId);
      movedCount += 1;
      return true;
    });

    return movedCount;
  }

  public clear(): void {
    this.tickets.clear();
    this.events = [];
    this.comments = [];
    this.watchers = [];
  }
}

export const ticketRepository = new TicketRepository();

export class TicketService {
  /**
   * Transitions ticket status. Rejects illegal transitions with IllegalTransitionError.
   * On legal transition, creates an event row with actorId and timestamp.
   */
  public transitionStatus(params: {
    ticketId: string;
    targetStatus: TicketStatus;
    actorId: string;
  }): { ticket: Ticket; event: TicketEvent } {
    const { ticketId, targetStatus, actorId } = params;

    const ticket = ticketRepository.findById(ticketId);
    if (!ticket) {
      throw new TicketNotFoundError(ticketId);
    }

    const currentStatus = ticket.status;

    // Validate transition via state machine rules
    if (!isValidTransition(currentStatus, targetStatus)) {
      throw new IllegalTransitionError(currentStatus, targetStatus);
    }

    // Execute state transition
    const updatedTicket = ticketRepository.updateStatus(ticketId, targetStatus)!;

    // Record audit event row
    const event: TicketEvent = {
      id: `evt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      ticketId,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      actorId: actorId || "System",
      timestamp: new Date()
    };

    ticketRepository.addEvent(event);

    return { ticket: updatedTicket, event };
  }

  public getTicketEvents(ticketId: string): TicketEvent[] {
    return ticketRepository.getEventsByTicketId(ticketId);
  }

  public getTicket(ticketId: string): Ticket | undefined {
    return ticketRepository.findById(ticketId);
  }

  public createTicket(data: {
    id?: string;
    title: string;
    description?: string;
    status?: TicketStatus;
    organisationId: string;
    assignedTo?: string;
  }): Ticket {
    return ticketRepository.createTicket(data);
  }

  /**
   * Merges a duplicate ticket into an original ticket (CR-1):
   * 1. Closes the duplicate through state machine rules (rejecting illegal moves).
   * 2. Links duplicateOfId to originalTicketId.
   * 3. Moves comments and watchers from the duplicate to the original ticket.
   */
  public mergeDuplicateTicket(params: {
    duplicateTicketId: string;
    originalTicketId: string;
    actorId: string;
  }): {
    duplicateTicket: Ticket;
    originalTicket: Ticket;
    event: TicketEvent;
    movedCommentsCount: number;
    movedWatchersCount: number;
  } {
    const { duplicateTicketId, originalTicketId, actorId } = params;

    if (duplicateTicketId === originalTicketId) {
      throw new InvalidMergeError("Cannot merge a ticket into itself.");
    }

    const duplicateTicket = ticketRepository.findById(duplicateTicketId);
    if (!duplicateTicket) {
      throw new TicketNotFoundError(duplicateTicketId);
    }

    const originalTicket = ticketRepository.findById(originalTicketId);
    if (!originalTicket) {
      throw new TicketNotFoundError(originalTicketId);
    }

    if (duplicateTicket.organisationId !== originalTicket.organisationId) {
      throw new InvalidMergeError(
        "Cannot merge tickets across different organisations.",
        "TENANT_MISMATCH",
        403
      );
    }

    // Close duplicate using the same state machine rules before moving related records
    const { event } = this.transitionStatus({
      ticketId: duplicateTicketId,
      targetStatus: "CLOSED",
      actorId
    });

    const linkedDuplicate = ticketRepository.setDuplicateOf(duplicateTicketId, originalTicketId)!;
    const movedCommentsCount = ticketRepository.moveComments(duplicateTicketId, originalTicketId);
    const movedWatchersCount = ticketRepository.moveWatchers(duplicateTicketId, originalTicketId);

    return {
      duplicateTicket: linkedDuplicate,
      originalTicket,
      event,
      movedCommentsCount,
      movedWatchersCount
    };
  }
}

export const ticketService = new TicketService();
