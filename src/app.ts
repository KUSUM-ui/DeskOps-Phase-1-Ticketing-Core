import express from "express";
import cors from "cors";
import ticketRoutes from "./routes/ticketRoutes";

const app = express();

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => res.json({ status: "OK", timestamp: new Date() }));
app.get("/ready", (req, res) => res.json({ status: "READY", timestamp: new Date() }));

// API version 1 routes (PRD NFR-04)
app.use("/api/v1/tickets", ticketRoutes);

export default app;
