# PlantUML Diagram Scripts — Report 4 (Software Design Document)

Each `.puml` file in this folder is a plain-text UML script you can paste into a diagram tool to render an image, then drop that image into the corresponding `[Insert ... here]` placeholder in [`Report4-Software-Design-Document.md`](../Report4-Software-Design-Document.md).

## How to render

1. **PlantUML online server** (fastest, no install): https://www.plantuml.com/plantuml/uml/ — paste the file content, copy the rendered PNG/SVG.
2. **VS Code**: install the "PlantUML" extension (jebbs.plantuml), open the `.puml` file, `Alt+D` to preview, export as PNG/SVG.
3. **IntelliJ / WebStorm**: "PlantUML integration" plugin, same workflow.
4. **draw.io / diagrams.net**: `Extras > Edit Diagram`, switch to PlantUML format, paste the script.

## Current sprint scope (§3.1–§3.4 of the report)

These diagrams are **grounded in the real code** (`frontend-web`/`mobile-app` service files, actual endpoints, actual enum values) — not just the capstone register.

| Script | Report section |
|---|---|
| `3.2-class-tenant-onboarding.puml` | 3.1.1 Class Diagram — Tenant Onboarding |
| `3.2-sequence-create-draft-assign.puml` | 3.1.2 Create Draft Contract & Assign Manager |
| `3.2-sequence-capture-room-condition.puml` | 3.1.3 Capture Room Condition & Initial Meter Reading (target design — not yet built) |
| `3.2-sequence-onboard-activate.puml` | 3.1.4 Deposit Payment, OTP & Activation |
| `3.3-class-billing.puml` | 3.2.1 Class Diagram — Billing |
| `3.4-class-payment.puml` | 3.2.1 Class Diagram — Payment |
| `3.3-sequence-billing.puml` | 3.2.2 Manager Creates Utility Invoice |
| `3.3-sequence-rent-invoice.puml` | 3.2.3 Manager Creates Rent Invoice |
| `3.4-sequence-payment.puml` | 3.2.4 Tenant Pays via PayOS |
| `3.4-sequence-manager-verify-payment.puml` | 3.2.5 Manager Verifies Manual Payment / Marks Cash Paid |
| `3.5-class-maintenance.puml` | 3.3.1 Class Diagram — Maintenance |
| `3.6-class-equipment.puml` | 3.3.1 Class Diagram — Equipment |
| `3.5-sequence-maintenance.puml` | 3.3.2 Submit, Schedule & Resolve Maintenance Request |
| `3.6-sequence-equipment.puml` | 3.3.3 Equipment Lifecycle Update |
| `propimport-class.puml` | 3.4.1 Class Diagram — Property Import & Activation |
| `propimport-sequence-bulk-import.puml` | 3.4.2 Bulk Import House via Excel |
| `propimport-sequence-host-review-activation.puml` | 3.4.3 Host Reviews Pricing & Confirms Activation |
| `propimport-sequence-renovation-supplement.puml` | 3.4.4 Supplement Renovation on an Active Property |

## System Design & Database (§1–§2)

| Script | Report section |
|---|---|
| `1.1-system-architecture.puml` | 1.1 System Architecture |
| `1.2-component-diagram.puml` | 1.2 Component Diagram |
| `1.3-package-diagram-web.puml` / `-mobile.puml` / `-backend.puml` | 1.3 Package Diagram |
| `1.4-state-property.puml` | 1.4 State Diagram — Property (new: `PropertyStatus` enum) |
| `1.4-state-room.puml` | 1.4 State Diagram — Room (corrected: `DRAFT/AVAILABLE/RENTED/MAINTENANCE`) |
| `1.4-state-tenant-contract.puml` | 1.4 State Diagram — TenantContract (corrected: `DRAFT/PENDING/ACTIVE/EXPIRED/TERMINATED`) |
| `1.4-state-invoice.puml` | 1.4 State Diagram — Invoice |
| `1.4-state-maintenance-request.puml` | 1.4 State Diagram — MaintenanceRequest |
| `1.4-state-payment.puml` | 1.4 State Diagram — Payment |
| `1.4-state-equipment.puml` | 1.4 State Diagram — Equipment |
| `1.5-flowchart-billing-cycle.puml` | 1.5 Flowchart |
| `2-er-diagram.puml` | 2. Database Design (ERD) — **not yet updated** for `inbound_contract`/`renovation_line`/`equipment_manifest_item`; text table in the report already lists them, diagram still pending |

## Appendix B — supplementary / backlog (not in current sprint)

These were drafted before the team scoped the report down to 4 core flows. Not re-verified against real endpoints; kept for later.

| Script | Old topic |
|---|---|
| `3.1-class-property-setup.puml` / `3.1-sequence-property-setup.puml` | Manual property/room setup (single property) |
| `3.7-class-cashflow.puml` / `3.7-sequence-cashflow.puml` | Cash flow reconciliation & financial reporting |
| `3.8-class-auth.puml` / `3.8-sequence-auth.puml` | Authentication / first-time password change |
| `3.9-class-scheduler.puml`, `3.9-sequence-payment-reminder.puml`, `3.9-sequence-room-status-update.puml` | Automated system-handler flows |
| `3.10-class-view-history.puml` / `3.10-sequence-view-history.puml` | Tenant views room/contract/payment history |

## Before you render

- Class/method names for §3.1–§3.4 are **grounded in real FE service files** (endpoint paths, DTO field names, enum values) as of this report — still verify against the actual Spring Boot backend once/if it diverges.
- A few billing endpoints (`rent-invoices`, `manager/invoices`, `manager/payments`, `tenant/me/invoices/*`) are marked "BE TODO" in the FE source comments — FE calls them already, but confirm they exist on the backend before treating these diagrams as "as-built."
- Appendix B diagrams are lower-confidence (written before this codebase audit) — treat them as a starting sketch, not verified design.
