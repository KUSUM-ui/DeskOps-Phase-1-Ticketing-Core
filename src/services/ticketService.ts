import { Ticket, TicketEvent, TicketStatus } from "../types/ticket";
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

// In-memory data store for clean decoupling and standalone testing
class TicketRepository {
  private tickets: Map<string, Ticket> = new Map();
  private events: TicketEvent[] = [];

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

  public addEvent(event: TicketEvent): void {
    this.events.push(event);
  }

  public getEventsByTicketId(ticketId: string): TicketEvent[] {
    return this.events.filter((e) => e.ticketId === ticketId);
  }

  public clear(): void {
    this.tickets.clear();
    this.events = [];
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
}

export const ticketService = new TicketService();
