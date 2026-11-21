import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { isValidTransition, ALLOWED_TRANSITIONS } from "../src/domain/stateMachine";
import { ticketRepository } from "../src/services/ticketService";

describe("Ticket State Machine - Pure Logic Tests", () => {
  it("allows legal transitions according to the state transitions table", () => {
    expect(isValidTransition("NEW", "TRIAGED")).toBe(true);
    expect(isValidTransition("TRIAGED", "ASSIGNED")).toBe(true);
    expect(isValidTransition("ASSIGNED", "IN_PROGRESS")).toBe(true);
    expect(isValidTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(isValidTransition("RESOLVED", "CLOSED")).toBe(true);
  });

  it("rejects illegal transitions according to the state transitions table", () => {
    // Direct leap from NEW to CLOSED is illegal
    expect(isValidTransition("NEW", "CLOSED")).toBe(false);
    expect(isValidTransition("NEW", "IN_PROGRESS")).toBe(false);
    expect(isValidTransition("CLOSED", "NEW")).toBe(false);
    expect(isValidTransition("CLOSED", "IN_PROGRESS")).toBe(false);
    // Same state transition is rejected
    expect(isValidTransition("NEW", "NEW")).toBe(false);
  });
});

describe("Ticket State Machine - API Acceptance Tests", () => {
  let ticketId: string;

  beforeEach(() => {
    ticketRepository.clear();
    const created = ticketRepository.createTicket({
      id: "ticket-acceptance-test-1",
      title: "Elevator power failure in Block B",
      description: "Main passenger elevator stuck on floor 3",
      status: "NEW",
      organisationId: "greenfield-org-1",
      assignedTo: undefined
    });
    ticketId = created.id;
  });

  // Acceptance Criterion 1: Illegal transition returns 4xx error with uniform error format
  it("rejects illegal transition (NEW to CLOSED) with 400 and uniform error format", async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .send({
        status: "CLOSED",
        actorId: "staff-member-007"
      });

    // Must return 4xx status code
    expect(response.status).toBe(400);

    // Uniform error format check (PRD NFR-04)
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ILLEGAL_STATE_TRANSITION",
        message: expect.stringContaining("Cannot move ticket from 'NEW' to 'CLOSED'"),
        details: {
          currentStatus: "NEW",
          targetStatus: "CLOSED",
          allowedTransitions: ALLOWED_TRANSITIONS["NEW"]
        }
      }
    });

    // Ensure ticket status remains untouched
    const currentTicket = ticketRepository.findById(ticketId);
    expect(currentTicket?.status).toBe("NEW");

    // Ensure no event was created for the illegal attempt
    const events = ticketRepository.getEventsByTicketId(ticketId);
    expect(events.length).toBe(0);
  });

  // Acceptance Criterion 2: Legal transition creates one event row with actor ID and timestamp
  it("allows legal transition (NEW to TRIAGED) and creates one event row with actorId and timestamp", async () => {
    const response = await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .send({
        status: "TRIAGED",
        actorId: "technician-raj-42"
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);

    // Check updated ticket payload
    expect(response.body.data.ticket).toMatchObject({
      id: ticketId,
      status: "TRIAGED"
    });

    // Check event row payload
    expect(response.body.data.event).toMatchObject({
      ticketId: ticketId,
      fromStatus: "NEW",
      toStatus: "TRIAGED",
      actorId: "technician-raj-42"
    });
    expect(response.body.data.event.timestamp).toBeDefined();

    // Verify stored event row in audit trail
    const storedEvents = ticketRepository.getEventsByTicketId(ticketId);
    expect(storedEvents.length).toBe(1);
    expect(storedEvents[0].fromStatus).toBe("NEW");
    expect(storedEvents[0].toStatus).toBe("TRIAGED");
    expect(storedEvents[0].actorId).toBe("technician-raj-42");
    expect(storedEvents[0].timestamp).toBeInstanceOf(Date);
  });

  it("allows subsequent legal transitions and logs full audit trail events", async () => {
    // 1. NEW -> TRIAGED
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .send({ status: "TRIAGED", actorId: "operator-1" });

    // 2. TRIAGED -> ASSIGNED
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .send({ status: "ASSIGNED", actorId: "manager-lead" });

    // 3. ASSIGNED -> IN_PROGRESS
    await request(app)
      .patch(`/api/v1/tickets/${ticketId}/status`)
      .send({ status: "IN_PROGRESS", actorId: "technician-raj-42" });

    const events = ticketRepository.getEventsByTicketId(ticketId);
    expect(events.length).toBe(3);
    expect(events[0].toStatus).toBe("TRIAGED");
    expect(events[1].toStatus).toBe("ASSIGNED");
    expect(events[2].toStatus).toBe("IN_PROGRESS");
  });
});
