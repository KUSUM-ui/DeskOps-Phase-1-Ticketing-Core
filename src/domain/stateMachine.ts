import { TicketStatus, UniformErrorResponse } from "../types/ticket";

/**
 * State Transition Table based on DeskOps Technical Design Document Section 7 & PRD FR-1.02.
 * Defines the allowed target states for any given current state.
 */
export const ALLOWED_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  NEW: ["TRIAGED", "CANCELLED"],
  TRIAGED: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "TRIAGED", "CANCELLED"],
  IN_PROGRESS: ["ON_HOLD", "RESOLVED", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
  RESOLVED: ["CLOSED", "IN_PROGRESS"], // 'IN_PROGRESS' permits reopening within configurable window
  CLOSED: [],    // Terminal state
  CANCELLED: []  // Terminal state
};

/**
 * Pure state transition validator with no database calls.
 * Returns true if transition from `currentStatus` to `targetStatus` is permitted.
 */
export function isValidTransition(
  currentStatus: TicketStatus,
  targetStatus: TicketStatus
): boolean {
  if (currentStatus === targetStatus) {
    return false;
  }
  const allowed = ALLOWED_TRANSITIONS[currentStatus] || [];
  return allowed.includes(targetStatus);
}

/**
 * Helper to retrieve allowed next states for a given status.
 */
export function getAllowedNextStates(currentStatus: TicketStatus): TicketStatus[] {
  return ALLOWED_TRANSITIONS[currentStatus] || [];
}

/**
 * Formats illegal transition error adhering to DeskOps uniform error format (PRD NFR-04).
 */
export function createIllegalTransitionError(
  currentStatus: string,
  targetStatus: string
): UniformErrorResponse {
  const allowed = ALLOWED_TRANSITIONS[currentStatus as TicketStatus] || [];
  return {
    success: false,
    error: {
      code: "ILLEGAL_STATE_TRANSITION",
      message: `Illegal transition: Cannot move ticket from '${currentStatus}' to '${targetStatus}'.`,
      details: {
        currentStatus,
        targetStatus,
        allowedTransitions: allowed
      }
    }
  };
}
