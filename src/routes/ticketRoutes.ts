import { Router } from "express";
import {
  handleCreateTicket,
  handleTransitionStatus,
  handleMergeTicket,
  handleGetTicketEvents
} from "../controllers/ticketController";

const router = Router();

router.post("/", handleCreateTicket);
router.patch("/:id/status", handleTransitionStatus);
router.put("/:id/status", handleTransitionStatus);
router.post("/:id/merge", handleMergeTicket);
router.get("/:id/events", handleGetTicketEvents);

export default router;
