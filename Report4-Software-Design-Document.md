# Capstone Project Report

## Report 4 – Software Design Document

**Project:** Sub-leasing Management System (SU26SE096_SUB_LEASING_MANAGEMENT_SYSTEM)
**Supervisor:** Kiều Trọng Khánh
**Group members:** Nguyễn Hoàng Ngọc Sơn (Leader), Phạm Ngọc Trung Nhân, Nguyễn Hoàng Long, Thái Tấn Tiến

*– Ho Chi Minh City, [Month, Year] –*

*This document follows the structure of the Report 4 template and the more detailed Software Design Document section of the HSMS capstone reference document, adapted to the Sub-leasing Management System.*

**Scope note:** the team's current sprint focuses on four flows: **Tenant Onboarding (Reception)**, **Monthly Billing & Payment**, **Equipment Maintenance**, and **Property Import & Activation into the system** (the last one is explicitly what "sub-leasing" in the project name refers to — bringing a master-leased house into the platform before it can be sub-let). Section 3 (Detailed Design) is organized around exactly these four flows and is grounded in the real API calls already present in `frontend-web`/`mobile-app` service files, not just the capstone register. Other screens that exist in the codebase (Host financial dashboards, Zone management, Guest search, Checkout/move-out, admin monitoring screens, etc.) are **out of current scope** and intentionally not diagrammed — see **Appendix B** for a short list and the earlier design sketches that are not being actively built right now.

---

## Table of Contents

- I. Record of Changes
- Definitions and Acronyms
- II. Software Design Document
  1. System Design
     - 1.1 System Architecture
     - 1.2 Component Diagram
     - 1.3 Package Diagram
     - 1.4 State Diagram
     - 1.5 Flowchart
  2. Database Design
  3. Detailed Design
     - 3.1 Tenant Onboarding (Reception)
     - 3.2 Monthly Billing & Payment
     - 3.3 Equipment Maintenance
     - 3.4 Property Import & Activation into the System
  - Appendix A: Class Specification format
  - Appendix B: Supplementary / backlog flows (not in current sprint scope)

---

## I. Record of Changes

| Date | A* / M / D | In charge | Change Description |
|---|---|---|---|
|  |  |  |  |
|  |  |  |  |
|  |  |  |  |

*A - Added, M - Modified, D - Deleted*

---

## Definitions and Acronyms

| Acronym | Definition |
|---|---|
| SDD | Software Design Description |
| ERD | Entity Relationship Diagram |
| JWT | JSON Web Token |
| OTP | One-Time Password, used to confirm tenant contract activation |
| PayOS | Third-party payment/QR provider used for invoice payment (tenant side) |
| OCR | Optical Character Recognition — auto-extracts contract text / meter photo readings |
| Host | Property owner (`ROLE_OWNER`) — reviews and approves pricing before a property goes live |
| Inbound contract | The master lease the operator signs with the property owner (as opposed to the tenant sub-lease contract) |
| Renovation session | One round of renovation work + purchased equipment recorded against a property; a property can have multiple sessions over time (v2+ = supplement renovation after the property is already ACTIVE) |
| MVC2 | Model-View-Controller 2 design pattern (as required by the capstone register) |

*Add any additional term used in the report the first time it appears.*

---

## II. Software Design Document

### 1. System Design

#### 1.1 System Architecture

*[Insert the overall architecture diagram here — 3-tier: Client / Server / Database, plus external systems and the connections between them. See `diagrams/1.1-system-architecture.puml`.]*

**Suggested components:**

- **Client tier**
  - Web Admin Portal (React + Vite / TypeScript) — used by System Admin (property import/activation, tenant draft & billing oversight) and Host (`ROLE_OWNER`, pricing review — see Appendix B).
  - Mobile App (React Native / Expo) — used by Operations Managers (onboarding, meter reading/billing, maintenance) and Tenants (invoices, payments, maintenance requests).
- **Server tier**
  - Backend API (Java Spring Boot, 3-tier + MVC2 pattern) exposing REST endpoints consumed by both clients.
- **Database tier**
  - Relational DBMS (e.g., MySQL/PostgreSQL) storing property, contract, billing, and maintenance data.
- **External systems**
  - **PayOS** — generates payment checkout links/QR codes for tenant invoices and confirms payment status (webhook + polling fallback via `payment/check`).
  - **Cloudinary** — stores uploaded files/images (draft contract files, room condition photos, meter photos, maintenance before/after photos, property images).
  - **Push Notification service (Expo Push)** — delivers notifications (e.g., `CUSTOMER_ASSIGNED`, invoice created, maintenance resolved, host review pending) to the mobile app.
  - **OCR service** — `POST /api/v1/ocr/meter` extracts electricity/water meter readings from photos; `pdfExtract.ts` (client-side) extracts contract text from uploaded DOCX/PDF files.

**System Architecture Description Table**

| No | Component | Description |
|---|---|---|
| 01 | Web Admin Portal | React/Vite SPA: property import/activation, draft contract oversight, billing/host review |
| 02 | Mobile App | React Native app for Operations Manager (onboarding, billing, maintenance) and Tenant (invoices, payment, maintenance requests) |
| 03 | Backend API | Spring Boot REST services implementing business logic and data access |
| 04 | Database | Relational database storing all persistent entities |
| 05 | PayOS | External payment gateway generating checkout/QR and confirming payment status |
| 06 | Cloudinary | External file/image storage service |
| 07 | Push Notification Service | Expo push service delivering mobile notifications |
| 08 | OCR Service | Extracts structured data from contract documents and meter photos |

#### 1.2 Component Diagram

*[Insert a component diagram showing the three main components — Front-end Web, Front-end Mobile, Back-end — and how they communicate (REST/HTTPS, JWT auth). See `diagrams/1.2-component-diagram.puml`.]*

**Component Descriptions**

| No | Component | Description |
|---|---|---|
| 01 | Front-end Web | Handles UI/UX and calls Backend REST APIs (JWT-authenticated) |
| 02 | Front-end Mobile | Handles UI/UX for manager & tenant roles, calls the same Backend REST APIs |
| 03 | Back-end | Exposes REST controllers, contains services/business rules, persists data via repositories |

#### 1.3 Package Diagram

*[Insert package diagrams for each sub-system below, then fill the description tables. See `diagrams/1.3-package-diagram-*.puml`.]*

**Front-end Web Package Descriptions**

| No | Package | Description |
|---|---|---|
| 01 | `pages/onboarding` | Draft contract creation/listing & manager assignment screens |
| 02 | `pages/tenants` | Tenant list & tenant contract management screens |
| 03 | `pages/super-admin/nha-thue` | Property import wizard: `NhaThueLanding`, `CauHinhKhaiThacPage`, `LeaseImportPanel`, `RenovationImportPanel`, `SupplementImportPanel`, `HandoverEquipmentSection`, `OperationalEquipmentPanel` |
| 04 | `pages/host` | Host pricing review (`HostPropertyReview`) |
| 05 | `pages/maintenance`, `pages/equipments` | Maintenance list & equipment CRUD/QR screens |
| 06 | `services` | API client modules (`tenant.service.ts`, `property.service.ts`, `import.service.ts`, `inbound-contract.service.ts`, `activation.service.ts`, `maintenance.service.ts`, `equipment.service.ts`, `host.service.ts`) |
| 07 | `layouts` | Role-based layout shells (e.g., `SuperAdminLayout`) |
| 08 | `utils` | Shared helpers (e.g., `pdfExtract.ts` for contract data extraction) |
| 09 | `types` | Shared TypeScript type/interface definitions (`api.types.ts`) |

**Front-end Mobile Package Descriptions**

| No | Package | Description |
|---|---|---|
| 01 | `screens/auth` | Login, first-time password change |
| 02 | `screens/manager` | Onboarding/reception (`ResumeContractScreen`), billing (`RentInvoiceScreen`, `UtilityBillingScreen`, `BillingManagementScreen`), maintenance (`MaintenanceManagerScreen`) |
| 03 | `screens/tenant` | Invoices, payment, maintenance request/history screens |
| 04 | `services` | API client modules (`tenantService.real.ts`, `managerInvoiceService.real.ts`, `tenantBillingService.real.ts`, `maintenanceService.real.ts`, `equipmentService.real.ts`) |
| 05 | `hooks` | Cross-cutting hooks (e.g., `useAuth.tsx`) |
| 06 | `navigation` | Root/stack navigators, deep-link handling for notifications |

**Back-end Package Description**

| No | Package | Description |
|---|---|---|
| 01 | `controller` | REST controllers per domain (property, import, tenant-contract, maintenance, equipment, invoice, payment, auth, notification) |
| 02 | `service` | Business logic layer |
| 03 | `repository` | Data access layer (Spring Data JPA) |
| 04 | `entity` | JPA entities mapped to database tables |
| 05 | `dto` | Request/response payload objects |
| 06 | `config` / `security` | JWT authentication, CORS, and application configuration |

#### 1.4 State Diagram

*[Insert one state diagram per entity below. All values are taken directly from `frontend-web/src/types/api.types.ts` enums — see `diagrams/1.4-state-*.puml`.]*

- **Property State Diagram** (`PropertyStatus`): `DRAFT → UNDER_RENOVATION → RENOVATION_COMPLETED → PENDING_HOST_REVIEW → ACTIVE → RENTED`, with `ACTIVE ⇄ DISABLED` and `ACTIVE → UNDER_RENOVATION` (supplement renovation) as side branches.
- **Room State Diagram** (`RoomStatus`): `DRAFT → AVAILABLE → RENTED → AVAILABLE`, with `AVAILABLE ⇄ MAINTENANCE`.
- **TenantContract State Diagram** (`ContractStatus`): `DRAFT → PENDING → ACTIVE → EXPIRED`, with `TERMINATED` reachable from `DRAFT`/`PENDING` (cancel) or `ACTIVE` (terminate).
- **Invoice State Diagram** (`TenantInvoiceStatus`): `PENDING → PAID` / `PENDING → OVERDUE → PAID` / `PENDING → PARTIAL → PAID`, with `CANCELLED` as an alternate terminal state.
- **MaintenanceRequest State Diagram**: `PENDING → IN_PROGRESS → RESOLVED`.
- **Payment State Diagram** (manual/bank-transfer payments): `PENDING_VERIFY → VERIFIED` / `PENDING_VERIFY → REJECTED`.
- **Equipment State Diagram** (`EquipmentStatus`): `NEW/GOOD → DAMAGED → GOOD` (repaired) / `DAMAGED → BROKEN`; separately, `EquipmentOperationalStatus`: `ACTIVE ⇄ DISABLED`.

#### 1.5 Flowchart

*[Insert a flowchart for one end-to-end business cycle, e.g., the monthly billing cycle: Manager creates utility/rent invoice → Notification sent → Tenant pays via PayOS → Webhook/poll confirms → Invoice marked PAID. See `diagrams/1.5-flowchart-billing-cycle.puml`.]*

---

### 2. Database Design

*[Insert the full ER diagram here — see `diagrams/2-er-diagram.puml` — then complete the table descriptions below.]*

**Table Descriptions**

| No | Table | Description |
|---|---|---|
| 01 | `users` | Login credentials and role (`ROLE_ADMIN` / `ROLE_OWNER` / `ROLE_MANAGER` / `ROLE_TENANT`); `is_first_login` flag<br>- Primary keys: `id`<br>- Foreign keys: — |
| 02 | `property` | Master-leased property/house; `status` per `PropertyStatus` enum (`DRAFT…RENTED/DISABLED`), `type` (`INDIVIDUAL_ROOM`/`WHOLE_HOUSE`), `assigned_manager_id`<br>- Primary keys: `id`<br>- Foreign keys: `owner_id` → `users.id`, `assigned_manager_id` → `users.id` |
| 03 | `room` | Sub-divided rooms belonging to a property; `status` per `RoomStatus` enum<br>- Primary keys: `id`<br>- Foreign keys: `property_id` → `property.id` |
| 04 | `inbound_contract` | Master lease signed with the property owner (`POST /properties/{id}/inbound-contract`)<br>- Primary keys: `id`<br>- Foreign keys: `property_id` → `property.id` |
| 05 | `renovation_line` | One line item of a renovation session (category, cost); grouped by `session_number`<br>- Primary keys: `id`<br>- Foreign keys: `property_id` → `property.id` |
| 06 | `equipment_manifest_item` | Equipment declared at handover (`INITIAL_HANDOVER`) or purchased during renovation (`PURCHASED`)<br>- Primary keys: `id`<br>- Foreign keys: `property_id` → `property.id`, `room_id` → `room.id` (nullable) |
| 07 | `equipment` | Operational equipment inventory with lifecycle status (`NEW/GOOD/DAMAGED/BROKEN`) and `operationalStatus` (`ACTIVE/DISABLED`)<br>- Primary keys: `id`<br>- Foreign keys: `room_id` → `room.id` |
| 08 | `equipment_maintenance_history` | History entries appended when a maintenance request affecting this equipment is resolved<br>- Primary keys: `id`<br>- Foreign keys: `equipment_id` → `equipment.id`, `maintenance_request_id` → `maintenance_request.id` |
| 09 | `tenant_contract` | Lease contract between tenant and room/whole-house; `status` per `ContractStatus` enum, `assigned_manager_id`, `draft_contract_file_url`, `expected_reception_date`, initial meter/handover fields<br>- Primary keys: `id`<br>- Foreign keys: `room_id` → `room.id` (nullable for whole-house), `tenant_id` → `users.id`, `assigned_manager_id` → `users.id` |
| 10 | `household_member` | Additional occupants linked to a tenant contract<br>- Primary keys: `id`<br>- Foreign keys: `tenant_contract_id` → `tenant_contract.id` |
| 11 | `invoice` | Billing document; `type` (`RENT/ELECTRICITY/WATER/SERVICE/OTHER`), `status` (`PENDING/PAID/OVERDUE/PARTIAL/CANCELLED`), PayOS fields (`payos_checkout_url`, `payos_qr_code`, `payos_order_code`)<br>- Primary keys: `id`<br>- Foreign keys: `tenant_contract_id` → `tenant_contract.id`, `room_id` → `room.id` (nullable) |
| 12 | `payment` | Payment/deposit transactions; `method` (`QR/BANK_TRANSFER/CASH/EWALLET/OTHER`), `status` (`PENDING_VERIFY/VERIFIED/REJECTED`)<br>- Primary keys: `id`<br>- Foreign keys: `invoice_id` → `invoice.id` (nullable), `tenant_contract_id` → `tenant_contract.id` (nullable, for deposits) |
| 13 | `maintenance_request` | Tenant-submitted issue reports; `status` (`PENDING/IN_PROGRESS/RESOLVED`), `repair_cost`, before/after photo URLs<br>- Primary keys: `id`<br>- Foreign keys: `room_id` → `room.id`, `tenant_id` → `users.id`, `equipment_id` → `equipment.id` (nullable) |
| 14 | `notification` | In-app/push notifications (e.g., `CUSTOMER_ASSIGNED`, invoice created, request resolved, host review pending)<br>- Primary keys: `id`<br>- Foreign keys: `recipient_id` → `users.id` |
| 15 | `expense` | Costs recorded against a property (lease, maintenance repair cost, etc.)<br>- Primary keys: `id`<br>- Foreign keys: `property_id` → `property.id` |

*Add/adjust tables as the backend schema is finalized; keep this table in sync with the migration scripts. `renovation_line`, `equipment_manifest_item`, and `inbound_contract` are inferred from FE service calls — the real backend may model them differently (e.g., as JSON columns on `property`); confirm against actual entity classes once available.*

---

### 3. Detailed Design

*For features that share the same class/sequence structure, diagram them once and reference that diagram from other features instead of duplicating. Every Class Diagram subsection should also include a Class Specification table — see **Appendix A** for the format.*

#### 3.1 Tenant Onboarding (Reception)
*Traceability: capstone register – "Tenant Onboarding (Operations Manager & Tenant)" workflow. Grounded in `frontend-web/src/services/tenant.service.ts` and `mobile-app/src/services/tenantService.real.ts` (real endpoints).*

##### 3.1.1 Class Diagram
*[Insert class diagram — see `diagrams/3.2-class-tenant-onboarding.puml`: `TenantContractController` → `TenantContractService` → `TenantContractRepository` → `TenantContract`, `HouseholdMember`, `User`.]*
*(Add a Class Specification table here, in the format described in Appendix A, for `TenantContract`, `HouseholdMember`, `User`.)*

##### 3.1.2 Sequence Diagram – Create Draft Contract & Assign Manager
*[Admin uploads/enters contract data (`pdfExtract.ts` OCR or manual) → `POST /properties/{id}/rooms/{roomId}/tenant-contract` or `POST /properties/{id}/tenant-contract` with `draft=true` → `PATCH /tenant-contracts/{id}/assign-manager` → notification sent. See `diagrams/3.2-sequence-create-draft-assign.puml`.]*

##### 3.1.3 Sequence Diagram – Capture Room Condition & Initial Utility Meter Reading
*[Manager captures room photos + meter photos → `POST /api/v1/ocr/meter` extracts readings → `PUT /tenant-contracts/{id}` (updateDraft) saves `roomConditionUrls`, `initialElectricReading`, `initialWaterReading`, `householdMembers`. See `diagrams/3.2-sequence-capture-room-condition.puml`. Note: as of this report this step is not yet implemented in `ResumeContractScreen` — the fields already exist in `OnboardTenantRequest`/`TenantContractResponse`, so this is the target design, not current behavior.]*

##### 3.1.4 Sequence Diagram – Deposit Payment, OTP & Activation
*[Manager collects deposit (`POST /tenant-contracts/{id}/deposit-payment`) → sends OTP (`POST .../send-otp`) → tenant confirms (`POST .../confirm`) → contract becomes `ACTIVE` → tenant account created (username = phone, `isFirstLogin=true`). See `diagrams/3.2-sequence-onboard-activate.puml`.]*

#### 3.2 Monthly Billing & Payment
*Traceability: capstone register – "Monthly Billing & Payment" workflow. Grounded in `mobile-app/src/services/managerInvoiceService.real.ts` and `tenantBillingService.real.ts`. Real model: no separate `MeterReading` entity — readings are fields directly on a utility-type `Invoice`. Some endpoints below are marked "BE TODO" in the source code comments as of this report — FE already calls them; confirm they are implemented before relying on this design.*

##### 3.2.1 Class Diagram
*[Insert class diagram — see `diagrams/3.3-class-billing.puml` and `diagrams/3.4-class-payment.puml`: `UtilityInvoiceController`/`RentInvoiceController`/`ManagerInvoiceController`/`TenantInvoiceController`/`ManagerPaymentController` → `InvoiceService`/`PaymentService` → `Invoice`, `Payment`, external `PayOS Gateway`.]*
*(Add a Class Specification table here, in the format described in Appendix A, for `Invoice` and `Payment`.)*

##### 3.2.2 Sequence Diagram – Manager Creates Utility Invoice (Electricity/Water)
*[`POST /properties/{id}/rooms/{roomId}/utility-invoices` with `prevReading`/`newReading`/`unitPrice`/`amount` → notification to tenant. See `diagrams/3.3-sequence-billing.puml`.]*

##### 3.2.3 Sequence Diagram – Manager Creates Rent Invoice
*[`POST /properties/{id}/rooms/{roomId}/rent-invoices` → notification to tenant. See `diagrams/3.3-sequence-rent-invoice.puml`.]*

##### 3.2.4 Sequence Diagram – Tenant Pays via PayOS
*[`POST /tenant/me/invoices/{id}/payment` creates PayOS checkout → tenant pays → PayOS webhook (server-to-server) marks invoice `PAID` → app calls `POST .../payment/check` as a polling fallback. See `diagrams/3.4-sequence-payment.puml`.]*

##### 3.2.5 Sequence Diagram – Manager Verifies Manual Payment / Marks Cash Paid
*[Manager reviews `GET /manager/payments?status=PENDING_VERIFY`, then `POST .../verify` or `POST .../reject`; or directly `POST /manager/invoices/{id}/mark-paid` for cash. See `diagrams/3.4-sequence-manager-verify-payment.puml`.]*

#### 3.3 Equipment Maintenance
*Traceability: capstone register – "Maintenance & Equipment Management" workflow. Grounded in `mobile-app/src/services/maintenanceService.real.ts` and `frontend-web/src/services/equipment.service.ts` (real endpoints).*

##### 3.3.1 Class Diagram
*[Insert class diagram — see `diagrams/3.5-class-maintenance.puml` and `diagrams/3.6-class-equipment.puml`: `MaintenanceController` → `MaintenanceService` → `MaintenanceRequest`; `EquipmentController` → `EquipmentService` → `Equipment`, `MaintenanceHistoryEntry`.]*
*(Add a Class Specification table here, in the format described in Appendix A, for `MaintenanceRequest` and `Equipment`.)*

##### 3.3.2 Sequence Diagram – Submit, Schedule & Resolve Maintenance Request
*[Tenant `POST /maintenance` → manager `PUT /maintenance/{id}/status` (schedule) → `POST /maintenance/{id}/photos` (before/after) → `PUT /maintenance/{id}/resolve` (repair cost) → backend creates an `expense` and appends equipment maintenance history. See `diagrams/3.5-sequence-maintenance.puml`.]*

##### 3.3.3 Sequence Diagram – Equipment Lifecycle Update
*[Triggered by a resolved maintenance request: `updateLifecycleStatus` moves the equipment between `GOOD`/`DAMAGED`/`BROKEN`; `GET /equipment/{id}/maintenance-history` shows the full repair trail. See `diagrams/3.6-sequence-equipment.puml`.]*

#### 3.4 Property Import & Activation into the System
*Traceability: this is the "sub-leasing" step in the project name — bringing a master-leased house into the platform (2-step: "Khởi tạo nhà" then "Cấu hình khai thác") before rooms can be published and tenants onboarded. Grounded in `frontend-web/src/services/import.service.ts`, `property.service.ts`, `inbound-contract.service.ts`, `activation.service.ts`, and `pages/host/HostPropertyReview.tsx`.*

##### 3.4.1 Class Diagram
*[Insert class diagram — see `diagrams/propimport-class.puml`: `ImportController`/`PropertyController`/`InboundContractController`/`ActivationController` → `ImportService`/`PropertyService`/`ActivationService` → `Property`, `Room`, `InboundContract`, `RenovationLine`, `EquipmentManifestItem`, `PricingCalculation`.]*
*(Add a Class Specification table here, in the format described in Appendix A, for `Property` and `InboundContract`.)*

##### 3.4.2 Sequence Diagram – Bulk Import House via Excel ("Khởi tạo nhà" + "Cấu hình khai thác")
*[Step 1: `POST /import/lease-excel` (dry-run then real) creates `Property` + `Room`s + handover equipment (display only), then `POST /import/property-images-zip` attaches photos. Step 2: `POST /import/renovation-excel` matches by lease contract code, imports renovation lines, and the backend auto-submits to Host (`PENDING_HOST_REVIEW`). See `diagrams/propimport-sequence-bulk-import.puml`. A manual alternative exists for single properties (`POST /properties/draft` + `PUT .../structure` + `POST .../rooms` + `PUT .../equipment-manifest` — see Appendix B, old §3.1) but bulk Excel import is the primary path being built.]*

##### 3.4.3 Sequence Diagram – Host Reviews Pricing & Confirms Activation
*[Host opens `GET /properties/{id}/onboarding-summary`, runs `POST .../pricing/calculate` (FORWARD/REVERSE mode), then `POST .../host-confirm`. Admin then calls `POST .../activation/confirm` → property becomes `ACTIVE`, rooms become `AVAILABLE`. See `diagrams/propimport-sequence-host-review-activation.puml`.]*

##### 3.4.4 Sequence Diagram – Supplement Renovation on an Already-Active Property
*[`POST /properties/{id}/renovation/start` reopens a renovation session on an `ACTIVE` property → `POST /import/renovation-supplement-excel` adds cost/equipment → `POST .../renovation/complete` recalculates pricing and resubmits to Host (`PENDING_HOST_REVIEW` again). See `diagrams/propimport-sequence-renovation-supplement.puml`.]*

---

## Appendix A: Class Specification format

Every Class Diagram subsection in §3 should be followed by a Class Specification table like this one:

| Class | Attribute | Type | Description |
|---|---|---|---|
| `Property` | `id` | Long | Primary key |
| | `address` | String | Physical address of the master-leased house |
| | `status` | Enum | See `PropertyStatus` in §1.4 |
| **Method** | `submitToHost()` | — | Transitions the property to `PENDING_HOST_REVIEW` |

Repeat one such table per class shown in the corresponding diagram (attributes first, methods last), for each of §3.1–§3.4.

---

## Appendix B: Supplementary / backlog flows (not in current sprint scope)

These were sketched in an earlier draft of this report before the team confirmed the current 4-flow priority. They are **not being actively built right now** — kept here so the work isn't lost, and to be promoted into §3 once the team picks them up. Diagrams for these are simplified/speculative and were not re-verified against real endpoints the way §3.1–§3.4 were.

| Flow | Diagram files | Note |
|---|---|---|
| Manual Property/Room Setup (single property, no Excel import) | `diagrams/3.1-class-property-setup.puml`, `diagrams/3.1-sequence-property-setup.puml` | Superseded for bulk cases by §3.4; still relevant as the manual fallback path (`POST /properties/draft`) |
| Cash Flow Reconciliation & Financial Reporting | `diagrams/3.7-class-cashflow.puml`, `diagrams/3.7-sequence-cashflow.puml` | Real code has a much richer Host finance module (`host.service.ts`: dashboard, PnL, receivables aging, deposit ledger) not reflected here |
| Authentication / First-time Password Change | `diagrams/3.8-class-auth.puml`, `diagrams/3.8-sequence-auth.puml` | Still accurate, just not a "core" flow the team is actively iterating on |
| Automated System-Handler Flows (payment reminder, room status auto-update) | `diagrams/3.9-class-scheduler.puml`, `diagrams/3.9-sequence-payment-reminder.puml`, `diagrams/3.9-sequence-room-status-update.puml` | Speculative — no scheduler code found in the current FE/BE |
| View Room, Contract & Payment History (Tenant) | `diagrams/3.10-class-view-history.puml`, `diagrams/3.10-sequence-view-history.puml` | Simple read-only screen, low design risk |

Also noted but **not diagrammed at all**: Host portal (dashboard/finance/master-lease/contract approval), Guest property search (public web + mobile), Zone management, Equipment QR code & depreciation, Tenant checkout/move-out. See the diagrams/README.md history or ask the team lead if/when one of these becomes a current-sprint flow.

---

## Notes for the team

- Replace every `[Insert ... here]` placeholder with an actual diagram exported from your UML tool (draw.io, PlantUML, or Visual Paradigm) and reference the figure number/caption, matching the numbering style used in the HSMS example (`Figure X - <Name>`, `Table X - <Name>`).
- Keep the **Database Design** table in sync with the actual backend migration scripts once implemented — several tables here (`inbound_contract`, `renovation_line`, `equipment_manifest_item`) are inferred from FE service calls, not confirmed backend entities.
- Several endpoints referenced in §3.2 (billing/payment) are marked "BE TODO" in the FE source code comments as of this report (`doc/BE-TODO-rent-invoice-2026-06-29.md`, `doc/BE-TODO-tenant-portal-2026-06-29.md`) — confirm these exist on the backend before treating the diagrams as "as-built" rather than "as-designed".
- §3.1.3 (capture room condition & initial meter reading) documents a step that is **not yet implemented in the mobile app** (`ResumeContractScreen`) — treat this diagram as the target design to implement, not a description of current behavior.
