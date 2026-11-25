import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../src/app";
import { ALLOWED_TRANSITIONS } from "../src/domain/stateMachine";
import { ticketRepository } from "../src/services/ticketService";

describe("CR-1 Duplicate Ticket Merge - Acceptance Tests", () => {
  const orgId = "greenfield-org-1";
  let originalId: string;
  let duplicateId: string;

  beforeEach(() => {
    ticketRepository.clear();

    const original = ticketRepository.createTicket({
      id: "ticket-original-1",
      title: "Water leak in basement parking",
      description: "Pipe leak near Bay 12",
      status: "IN_PROGRESS",
      organisationId: orgId
    });
    originalId = original.id;

    const duplicate = ticketRepository.createTicket({
      id: "ticket-duplicate-1",
      title: "Basement parking water leak",
      description: "Duplicate report for Bay 12 leak",
      status: "RESOLVED",
      organisationId: orgId
    });
    duplicateId = duplicate.id;
  });

  // Part 1a: Duplicate closes through state machine rules
  it("closes the duplicate ticket via state machine rules and records an audit event", async () => {
    const response = await request(app)
      .post(`/api/v1/tickets/${duplicateId}/merge`)
      .send({
        originalTicketId: originalId,
        actorId: "staff-komal-1"
      });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.duplicateTicket).toMatchObject({
      id: duplicateId,
      status: "CLOSED",
      duplicateOfId: originalId
    });
    expect(response.body.data.event).toMatchObject({
      ticketId: duplicateId,
      fromStatus: "RESOLVED",
      toStatus: "CLOSED",
      actorId: "staff-komal-1"
    });

    const updatedDuplicate = ticketRepository.findById(duplicateId);
    expect(updatedDuplicate?.status).toBe("CLOSED");
    expect(updatedDuplicate?.duplicateOfId).toBe(originalId);

    const events = ticketRepository.getEventsByTicketId(duplicateId);
    expect(events).toHaveLength(1);
    expect(events[0].toStatus).toBe("CLOSED");
    expect(events[0].actorId).toBe("staff-komal-1");
    expect(events[0].timestamp).toBeInstanceOf(Date);
  });

  // Part 1b: Closing during merge still enforces state machine rules (illegal move rejected)
  it("rejects merge with 400 when duplicate ticket cannot legally close (e.g. NEW -> CLOSED)", async () => {
    const newDuplicate = ticketRepository.createTicket({
      id: "ticket-duplicate-new",
      title: "Unresolved duplicate",
      status: "NEW",
      organisationId: orgId
    });

    ticketRepository.addComment({
      ticketId: newDuplicate.id,
      authorId: "resident-1",
      body: "Still waiting on update"
    });
    ticketRepository.addWatcher({
      ticketId: newDuplicate.id,
      userId: "resident-1"
    });

    const response = await request(app)
      .post(`/api/v1/tickets/${newDuplicate.id}/merge`)
      .send({
        originalTicketId: originalId,
        actorId: "staff-komal-1"
      });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      error: {
        code: "ILLEGAL_STATE_TRANSITION",
        details: {
          currentStatus: "NEW",
          targetStatus: "CLOSED",
          allowedTransitions: ALLOWED_TRANSITIONS["NEW"]
        }
      }
    });

    // Duplicate remains NEW and comments/watchers are not moved on rejection
    expect(ticketRepository.findById(newDuplicate.id)?.status).toBe("NEW");
    expect(ticketRepository.getCommentsByTicketId(newDuplicate.id)).toHaveLength(1);
    expect(ticketRepository.getCommentsByTicketId(originalId)).toHaveLength(0);
    expect(ticketRepository.getWatchersByTicketId(newDuplicate.id)).toHaveLength(1);
    expect(ticketRepository.getWatchersByTicketId(originalId)).toHaveLength(0);
  });

  // Part 2: Duplicate's comments move to the original ticket
  it("moves all comments from the duplicate ticket to the original ticket", async () => {
    ticketRepository.addComment({
      id: "cmt-orig-1",
      ticketId: originalId,
      authorId: "tech-1",
      body: "Inspecting Bay 12 valve",
      visibility: "PUBLIC"
    });
    ticketRepository.addComment({
      id: "cmt-dup-1",
      ticketId: duplicateId,
      authorId: "resident-2",
      body: "Water reached near elevator",
      visibility: "PUBLIC"
    });
    ticketRepository.addComment({
      id: "cmt-dup-2",
      ticketId: duplicateId,
      authorId: "staff-1",
      body: "Internal note: matches Bay 12 report",
      visibility: "INTERNAL"
    });

    const response = await request(app)
      .post(`/api/v1/tickets/${duplicateId}/merge`)
      .send({
        originalTicketId: originalId,
        actorId: "staff-komal-1"
      });

    expect(response.status).toBe(200);
    expect(response.body.data.movedCommentsCount).toBe(2);

    const duplicateComments = ticketRepository.getCommentsByTicketId(duplicateId);
    expect(duplicateComments).toHaveLength(0);

    const originalComments = ticketRepository.getCommentsByTicketId(originalId);
    expect(originalComments).toHaveLength(3);
    expect(originalComments.map((c) => c.id)).toEqual(["cmt-orig-1", "cmt-dup-1", "cmt-dup-2"]);
    expect(originalComments.every((c) => c.ticketId === originalId)).toBe(true);
  });

  // Part 3: Duplicate's watchers move to the original ticket (deduplicating existing watchers)
  it("moves watchers from the duplicate ticket to the original ticket without duplicating existing watchers", async () => {
    ticketRepository.addWatcher({ ticketId: originalId, userId: "user-shared" });
    ticketRepository.addWatcher({ ticketId: duplicateId, userId: "user-shared" });
    ticketRepository.addWatcher({ ticketId: duplicateId, userId: "user-dup-only" });

    const response = await request(app)
      .post(`/api/v1/tickets/${duplicateId}/merge`)
      .send({
        originalTicketId: originalId,
        actorId: "staff-komal-1"
      });

    expect(response.status).toBe(200);
    expect(response.body.data.movedWatchersCount).toBe(1);

    const duplicateWatchers = ticketRepository.getWatchersByTicketId(duplicateId);
    expect(duplicateWatchers).toHaveLength(0);

    const originalWatchers = ticketRepository.getWatchersByTicketId(originalId);
    expect(originalWatchers.map((w) => w.userId)).toEqual(["user-shared", "user-dup-only"]);
  });

  // Guard: Reject merging a ticket into itself or across organisations
  it("rejects merging a ticket into itself or across different organisations", async () => {
    const selfMergeRes = await request(app)
      .post(`/api/v1/tickets/${duplicateId}/merge`)
      .send({
        originalTicketId: duplicateId,
        actorId: "staff-komal-1"
      });

    expect(selfMergeRes.status).toBe(400);
    expect(selfMergeRes.body.error.code).toBe("INVALID_MERGE");

    const otherOrgTicket = ticketRepository.createTicket({
      id: "ticket-other-org",
      title: "Other org ticket",
      status: "IN_PROGRESS",
      organisationId: "other-org-99"
    });

    const crossOrgRes = await request(app)
      .post(`/api/v1/tickets/${duplicateId}/merge`)
      .send({
        originalTicketId: otherOrgTicket.id,
        actorId: "staff-komal-1"
      });

    expect(crossOrgRes.status).toBe(403);
    expect(crossOrgRes.body.error.code).toBe("TENANT_MISMATCH");
  });
});
