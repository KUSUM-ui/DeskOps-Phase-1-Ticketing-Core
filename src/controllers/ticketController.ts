import { Request, Response } from "express";
import { z } from "zod";
import {
  ticketService,
  IllegalTransitionError,
  InvalidMergeError,
  TicketNotFoundError
} from "../services/ticketService";
import { createIllegalTransitionError } from "../domain/stateMachine";
import { TICKET_STATUSES, TicketStatus } from "../types/ticket";

const TransitionRequestSchema = z.object({
  status: z.enum(TICKET_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${TICKET_STATUSES.join(", ")}` })
  }),
  actorId: z.string().min(1, "actorId is required")
});

const CreateTicketSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  organisationId: z.string().min(1, "organisationId is required"),
  assignedTo: z.string().optional()
});

const MergeTicketSchema = z.object({
  originalTicketId: z.string().min(1, "originalTicketId is required"),
  actorId: z.string().min(1, "actorId is required")
});

function handleTicketError(res: Response, error: any, fallbackMessage = "Validation failed") {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: error.errors[0]?.message || fallbackMessage,
        details: error.flatten()
      }
    });
  }

  if (error instanceof IllegalTransitionError) {
    // Returns 4xx error with the uniform error format as specified
    return res.status(400).json(
      createIllegalTransitionError(error.currentStatus, error.targetStatus)
    );
  }

  if (error instanceof InvalidMergeError) {
    return res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    });
  }

  if (error instanceof TicketNotFoundError) {
    return res.status(404).json({
      success: false,
      error: {
        code: "TICKET_NOT_FOUND",
        message: error.message
      }
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: error.message || "An unexpected error occurred"
    }
  });
}

export async function handleCreateTicket(req: Request, res: Response) {
  try {
    const validated = CreateTicketSchema.parse(req.body);
    const ticket = ticketService.createTicket({
      ...validated,
      status: (validated.status as TicketStatus) || "NEW"
    });

    return res.status(201).json({
      success: true,
      data: ticket
    });
  } catch (error: any) {
    return handleTicketError(res, error, "Validation failed");
  }
}

export async function handleTransitionStatus(req: Request, res: Response) {
  try {
    const ticketId = req.params.id;
    const validated = TransitionRequestSchema.parse(req.body);

    const result = ticketService.transitionStatus({
      ticketId,
      targetStatus: validated.status as TicketStatus,
      actorId: validated.actorId
    });

    return res.status(200).json({
      success: true,
      data: {
        ticket: result.ticket,
        event: result.event
      }
    });
  } catch (error: any) {
    return handleTicketError(res, error, "Invalid input payload");
  }
}

export async function handleMergeTicket(req: Request, res: Response) {
  try {
    const duplicateTicketId = req.params.id;
    const validated = MergeTicketSchema.parse(req.body);

    const result = ticketService.mergeDuplicateTicket({
      duplicateTicketId,
      originalTicketId: validated.originalTicketId,
      actorId: validated.actorId
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return handleTicketError(res, error, "Invalid merge payload");
  }
}

export async function handleGetTicketEvents(req: Request, res: Response) {
  try {
    const ticketId = req.params.id;
    const ticket = ticketService.getTicket(ticketId);
    if (!ticket) {
      return res.status(404).json({
        success: false,
        error: { code: "TICKET_NOT_FOUND", message: `Ticket '${ticketId}' not found.` }
      });
    }

    const events = ticketService.getTicketEvents(ticketId);
    return res.status(200).json({
      success: true,
      data: events
    });
  } catch (error: any) {
    return handleTicketError(res, error);
  }
}
