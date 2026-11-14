# DESKOPS
## Technical Design Document — Phase 1: Ticketing Core

**Project:** DeskOps — Service Desk Platform  
**Client:** Greenfield Facilities  
**Document Version:** 1.0  
**Date:** 14 November 2026  
**Phase Duration:** 7 November – 7 December 2026  
**Release:** v1.0.0

---

## 1. Introduction

DeskOps is a multi-tenant service desk platform designed to manage maintenance requests across multiple properties.

The system will allow residents to submit maintenance tickets, staff to manage and assign requests, and technicians to update and resolve assigned work.

The main objective of Phase 1 is to develop a functional ticketing system with secure organisation-level data separation, ticket tracking and activity history.

## 2. Project Scope

**Included in Phase 1:**
- Organisation, property and unit management.
- User authentication and role-based access.
- Ticket creation, assignment and management.
- Ticket status transitions and event history.
- Public and internal comments.
- Image and PDF attachments.
- Email-to-ticket integration.
- Real-time ticket updates.
- Duplicate-ticket merging (CR-1).
- Client-specific requirement.

**Out of scope:** Maintenance-fee billing, visitor management, native mobile applications and Phase 2 SLA automation.

## 3. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js 22, Express, TypeScript |
| Database | PostgreSQL, Prisma |
| Cache and Queues | Redis, BullMQ |
| Real-time | Socket.io |
| File Storage | Cloudflare R2 / AWS S3 |
| Testing | Vitest, Supertest, Playwright |
| Deployment | Docker, GitHub Actions, Render |

*Note: MongoDB and Mongoose are proposed alternatives only. Written mentor approval is required before changing the official PostgreSQL and Prisma stack.*

## 4. System Architecture

DeskOps will use a monorepo structure containing separate frontend, backend and documentation directories.

```text
deskops/
├── client/
├── server/
│   ├── src/
│   ├── prisma/
│   └── tests/
├── docs/
│   ├── adr/
│   └── technical-design.md
├── .github/
├── docker-compose.yml
├── .env.example
├── README.md
└── CHANGELOG.md
```

The React frontend will communicate with the Express backend through REST APIs. The backend will handle authentication, permissions, business logic and database operations.

PostgreSQL will store application data, Redis and BullMQ will process background jobs, and Socket.io will provide real-time updates.

## 5. Database Design

The database will contain the following main entities:

- Organization
- User
- Property
- Unit
- Resident
- Technician
- Ticket
- TicketEvent
- Comment
- Attachment
- Watcher
- AuditLog

Each organisation will have access only to its own records. Tenant isolation will be enforced through backend authentication and organisation-scoped database queries.

Prisma migrations will manage database schema changes.

## 6. Roles and Permissions

The proposed user roles are:

| Role | Main Responsibility |
|---|---|
| Resident | Create and view permitted maintenance tickets |
| Staff | Review, triage and assign tickets |
| Technician | Manage assigned maintenance work |
| Organisation Admin | Manage organisation-level users and records |

The final role and permission matrix will be confirmed with the mentor.

## 7. Ticket Management

The ticket module is the core functionality of DeskOps.

The system will support ticket creation, listing, filtering, assignment and status management.

The required ticket statuses are:

`New → Triaged → Assigned → In Progress → On Hold / Resolved → Closed`

The backend will validate all status transitions and reject invalid changes.

Every successful transition will be recorded with the actor, previous status, new status and timestamp. Tickets can be reopened within the approved reopening window.

## 8. Additional Functionalities

**Technician Assignment:** Assignment will use an atomic database operation to prevent multiple simultaneous requests from assigning the same ticket. The system must pass the 20-parallel-request acceptance test.

**Comments:** Public comments will be visible to residents, while internal comments will only be accessible to authorised staff.

**Attachments:** Images and PDFs will be uploaded through presigned URLs and processed through background workers.

**Email Integration:** Inbound emails will create new tickets or be added to existing tickets using ticket-specific reply tokens.

**Real-Time Updates:** Socket.io will notify authorised users about ticket changes without requiring a page refresh.

**CR-1 Duplicate Merge:** Duplicate tickets will be closed, while their comments and watchers will be moved to the original ticket. The operation will be protected and tested.

**Client-Specific Rule:** The assigned client rule will be implemented once confirmed by the team and mentor.

## 9. Security and Testing

The application will implement:

- Password hashing and secure authentication.
- Role-based access control.
- Organisation-level data isolation.
- Backend request validation.
- Secure file upload validation.
- Environment-based secret management.
- Structured logging and error monitoring.

Testing will cover ticket workflows, permissions, tenant isolation, assignment concurrency, comment visibility, attachments and duplicate merging.

The project requires at least 70% service test coverage and automated testing of the client-specific rule.

## 10. Deployment

The application will use Docker for consistent environments and GitHub Actions for automated testing and build checks.

Staging deployment will be completed before production release.

The final release will include the deployed application, source code, API documentation, test evidence, release notes and project documentation.

## 11. Team Responsibilities

| Engineer | Product Module | Platform Responsibility |
|---|---|---|
| Engineer A | Identity and Authentication | Security |
| Engineer B | Tickets and Request Portal | Data |
| Engineer C | Email, Attachments and Real-Time Updates | Async Processing |
| Engineer D | Analytics, Notifications and Settings | Delivery |

**Engineer B responsibilities:**
- Ticket creation and management.
- Ticket lifecycle and event history.
- Technician assignment.
- Comments and visibility.
- Duplicate-ticket merging.
- Database schema, migrations, indexes and seed data.

## 12. Project Milestones

| Milestone | Deadline |
|---|---|
| Technical Design Approval | 14 November 2026 |
| Walking Skeleton on Staging | 16 November 2026 |
| Core Flows on Staging | 20 November 2026 |
| CR-1 Implementation | Before final release |
| Submission Opens | 2 December 2026 |
| Final Release v1.0.0 | 7 December 2026 |

## 13. Pending Confirmations

The following details require confirmation before final implementation:

- Final database technology.
- Role and permission matrix.
- Exact ticket transition rules and reopening period.
- Assigned client-specific rule.
- Attachment size and format limits.
- Email provider and configuration.

## 14. Conclusion

DeskOps Phase 1 will deliver a secure, multi-tenant ticketing platform that centralises maintenance requests and tracks them throughout their lifecycle.

The development will prioritise authentication, tenant isolation, ticket management, assignment and event history, followed by supporting functionalities such as attachments, email integration, real-time updates and duplicate-ticket merging.

The system will be tested against the official acceptance criteria before the v1.0.0 production release.

---

**Document Status:** Draft — Pending Mentor Approval
