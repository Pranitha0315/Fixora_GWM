# Cross-App Contracts

Task: FX13-D01-NID-1
Author: Nidhushiya
Status: Draft

## Purpose

Define the data exchanged between the customer app, mechanic app
and manager web, along with the checks needed to verify each workflow.

## Project Structure

- Fixora.Customer: Customer Flutter app
- Fixora.Mechanic: Mechanic Flutter app
- Fixora.Web: Manager Angular web
- Fixora.Api: Shared backend

## Main Repair Flow

1. Customer sends a booking request.
2. Manager reviews the request and confirms or declines it.
3. Mechanic inspects the assigned vehicle and submits findings.
4. Manager reviews the repair proposal, sets prices and sends it to the customer.
5. Customer approves or rejects individual repair items.
6. Manager releases the approved work to the mechanic.
7. Mechanic updates repair progress.
8. Manager issues the final invoice.
9. Customer views the invoice and service history.

## Contract Status

This document describes proposed contracts.
It does not confirm that the endpoints are implemented.

## Booking Contract (Proposed)

### Customer Request

- vehicleId: Vehicle selected by the customer
- workshopId: Selected workshop
- preferredSlotId: Requested booking slot
- complaint: Problem described by the customer

The backend identifies the customer from the authenticated session.

### Response

- bookingId: Unique booking reference
- status: Pending
- requestedAt: Server-generated request time

### Ownership

- Customer submits the booking request.
- Manager confirms or declines the request.
- Backend validates vehicle ownership and slot availability.

### Acceptance Checks

- An unauthenticated request is rejected.
- A customer cannot book another customer's vehicle.
- An unavailable slot cannot be confirmed.
- A new booking starts as Pending.
- Only an authorized manager of the selected workshop can confirm it.
- Confirmation creates or links exactly one job.
- Repeating confirmation does not create a duplicate job.

### Review Required

Field names and status values must be agreed with the backend
and frontend owners before implementation.

## Inspection Contract (Proposed)

### Mechanic Submission

- jobId: Assigned job reference
- findings: List of inspected items
  - findingId: Unique finding reference
  - description: Mechanic's observation
  - severity: Urgent, Recommended or OK
  - evidenceIds: References to uploaded photos or videos
  - note: Optional text or confirmed voice transcription

### Response

- inspectionId: Unique inspection reference
- jobId: Related job
- reviewStatus: PendingManagerReview
- submittedAt: Server-generated submission time

### Ownership

- Assigned mechanic records and submits findings.
- Manager reviews findings before preparing a customer proposal.
- Backend controls access to inspection data and evidence.

### Acceptance Checks

- Only the assigned, authorized mechanic can submit findings.
- Evidence must belong to the same job.
- AI-generated text remains a draft until the mechanic confirms it.
- Unconfirmed drafts are not visible to the customer.
- Submission makes the inspection available for manager review.
- Inspection submission alone does not authorize repair work.
- Customer-facing proposals pass through the manager.

### Review Required

Field names, severity values and review statuses must be agreed
with the backend and frontend owners before implementation.

## Repair Approval Contract (Proposed)

### Manager Proposal

- jobId: Related job
- inspectionId: Reviewed inspection
- proposalVersion: Version presented to the customer
- items:
  - repairItemId: Unique repair item reference
  - description: Proposed repair
  - estimatedAmount: Estimated cost for the item
- currency: Currency used for all amounts

### Customer Decision

- proposalId: Proposal being reviewed
- proposalVersion: Version reviewed by the customer
- decisions:
  - repairItemId: Item being reviewed
  - decision: Approved or Rejected
- idempotencyKey: Unique key for safely retrying the decision

### Response

- proposalId: Related proposal
- proposalVersion: Reviewed version
- decisionStatus: Recorded decision status
- recordedAt: Server-generated decision time

### Ownership

- Manager prepares prices and publishes the proposal.
- Customer approves or rejects individual repair items.
- Manager releases approved items to the assigned mechanic.
- Backend enforces decisions and permitted work items.

### Acceptance Checks

- Only the authorized workshop manager can publish a proposal.
- Only the customer who owns the job can submit a decision.
- Decisions must reference items in the published proposal.
- A decision against an outdated proposal version is rejected.
- Retrying the same decision with the same key creates no duplicate effects.
- Reusing the same key with different content is rejected.
- Rejected or undecided items cannot be released for repair.
- Customer approval reaches the mechanic through manager release.
- Changes to approved scope or prices require renewed customer approval.
- The system records who published, decided and released the work, and when.

### Review Required

Field names, monetary representation, version handling and decision
statuses must be agreed with the backend and frontend owners.

## Customer Change Request Contract (Proposed)

### Customer Request

- jobId: Related job
- message: Requested change or clarification
- idempotencyKey: Unique key for safely retrying submission

### Manager Decision

- changeRequestId: Related change request
- action: Forward or Decline
- managerNote: Instructions or reason for declining

### Mechanic Acknowledgement

- changeRequestId: Forwarded change request
- acknowledgementNote: Optional response from the assigned mechanic

### Response

- changeRequestId: Unique change request reference
- status: Current routing status
- updatedAt: Server-generated update time

### Ownership

- Customer submits a request for their own job.
- Manager reviews and forwards or declines the request.
- Assigned mechanic acknowledges a forwarded request.
- Backend enforces routing and records each action.

### Acceptance Checks

- Only the customer who owns the job can submit the request.
- A new request reaches the manager before the mechanic.
- Only the authorized workshop manager can forward or decline it.
- A declined request is not forwarded to the mechanic.
- Only the assigned mechanic can acknowledge a forwarded request.
- The customer can view the outcome of their request.
- Retrying submission does not create a duplicate request.
- Acknowledgement alone does not approve extra work or charges.
- Scope or price changes follow the repair approval workflow.
- Each routing action records the actor and server time.

### Review Required

Routing statuses, allowed job stages and notification recipients
must be agreed with the backend and frontend owners.

## Repair Completion Contract (Proposed)

### Mechanic Progress Update

- jobId: Assigned job reference
- repairItemId: Released repair item reference
- progressStatus: Proposed value ΓÇö InProgress or Completed
- note: Optional progress note
- evidenceIds: References to completion evidence

### Manager Invoice

- jobId: Related job
- invoiceItems: Charges linked to approved work
- currency: Currency used for all amounts

The backend calculates invoice totals from validated line items.

### Ownership

- Assigned mechanic updates released repair items.
- Manager reviews completion and issues the invoice.
- Customer views their invoice and published service history.
- Backend validates transitions, charges and access.

### Acceptance Checks

- Only the assigned, authorized mechanic can update repair progress.
- Only released repair items can move to InProgress or Completed.
- Completion evidence must belong to the same job.
- Completing one item does not automatically complete the whole job.
- Only the authorized workshop manager can issue the invoice.
- Charges must match the approved scope and agreed prices.
- Additional work or price changes require renewed approval.
- Retrying invoice issuance does not create a duplicate invoice.
- Only authorized users can access the invoice and service history.
- Repair completion does not automatically mark an invoice as paid.
- Published service history excludes internal notes and unpublished drafts.

### Review Required

Progress statuses, completion requirements, invoice calculation rules
and history publication timing must be agreed with the relevant owners.

## Mechanic Invitation Contract (Proposed)

### Manager Request

- email: Email of the mechanic being invited

The backend identifies the manager and workshop from authorized context.
Invitation tokens and expiry times are generated by the backend.

### Invitation Response

- invitationId: Unique invitation reference
- status: Pending
- expiresAt: Server-generated expiry, seven days after creation

The invitation token is delivered through the invitation link.
It must not appear in application logs or general invitation listings.

### Mechanic Acceptance

- token: Token received through the invitation link

The mechanic must sign in before accepting.
The backend verifies that the signed-in account matches the invited email.

### Manager Revocation

- invitationId: Pending invitation to revoke

### Ownership

- Authorized workshop manager creates or revokes invitations.
- Invited mechanic accepts the invitation.
- Backend validates the token and creates workshop membership.

### Acceptance Checks

- Only an authorized workshop manager can invite a mechanic.
- An invitation expires seven days after creation.
- Expired or revoked invitations cannot be accepted.
- A token cannot be used by an account with a different email.
- Acceptance assigns the Mechanic role for the inviting workshop.
- The accepting client cannot choose a higher-privilege role.
- Membership creation and invitation acceptance succeed together.
- Repeating acceptance does not create duplicate membership.
- An accepted invitation cannot be revoked as a pending invitation.
- Removing an existing mechanic requires a separate membership action.
- Invitation creation, acceptance and revocation record the actor and server time.

### Review Required

Confirm email verification, duplicate pending invitations,
existing membership rules, delivery retries and final status values
with the authentication and backend owners.

## Job Assignment Contract (Proposed)

### Manager Assignment

- jobId: Job to assign
- mechanicId: Mechanic selected by the manager
- expectedVersion: Job version reviewed by the manager

### Response

- jobId: Assigned job reference
- mechanicId: Assigned mechanic reference
- version: Updated job version
- assignedAt: Server-generated assignment time

### Ownership

- Authorized workshop manager assigns or reassigns the job.
- Mechanic views jobs currently assigned to them.
- Backend validates workshop membership and job access.

### Acceptance Checks

- Only an authorized manager of the job's workshop can assign it.
- The mechanic must have active membership in the same workshop.
- Assignment does not authorize unapproved repair work.
- Repeating the same assignment creates no duplicate effects.
- An outdated job version is rejected.
- Reassignment removes the previous mechanic's operational access,
  unless another explicit permission grants access.
- Existing inspection and progress records retain their original authors.
- Each assignment records the manager, previous assignee,
  new assignee and server time.
- Assignment notifications are sent only after the change is saved.
- Failure to deliver a notification does not undo a saved assignment.
- Reconnecting clients fetch the latest authorized assignment.

### Review Required

Confirm whether one or multiple mechanics can be assigned,
which job stages allow reassignment, and how active work,
workload warnings and notification delivery should be handled.

## Cross-App Rules

- The backend validates authentication, roles and workshop access.
- Clients cannot set ownership or permissions through request fields.
- Server timestamps are used for recorded workflow actions.
- Notifications do not replace the authoritative backend state.
- Reconnecting clients fetch the latest authorized state.
- Failed requests must not leave partially applied workflow changes.
- Error responses must not expose another customer's data.

## Pending Contract Review

- Confirm actual repository paths and existing implementations.
- Agree endpoint routes and request/response field names.
- Agree status values and allowed transitions.
- Agree validation errors and retry behaviour.
- Confirm event names, payloads and notification recipients.
- Confirm file ownership with the relevant team members.
- Map these checks to the project's acceptance criteria.

## Scope Note

This draft covers booking, mechanic invitations, job assignment,
inspection, repair approval, customer change requests,
repair progress and invoicing.

Other assigned workflows still require contract definitions.
This draft does not confirm implementation or acceptance-test results.

## Backend Comparison - 17 November 2026

Reference: backend restore commit 52c0bf5.
Status: Partial source review; owner agreement pending.
The proposed requirements above remain requirements, not implementation proof.

### Repository Paths

- Customer app: Fixora.Customer
- Mechanic app: FixoraRev.Mechanic
- Manager web: Fixora.web
- Shared backend: Fixora.SharedBackend
- Cross-app documentation: Doc/architecture

### Verified Request Contracts

Property names below use the API's camelCase JSON format.

BookingRequest:
- vehicleId: Guid
- serviceId: Guid
- slotStart: DateTime
- notes: nullable string
- promoCode: nullable string
- suggestionId: nullable Guid

SlotDto contains start, end and freeBays; it does not contain a slot ID.
BookingDto contains id, status, createdAt and nullable jobCardId,
along with customer, vehicle, service, scheduling and assignment details.

DecideItemsRequest:
- decisions: list of { itemId: Guid, approve: bool, version: int }
- note: nullable string

The current decision request uses item-level versions.
ProposalDto does not declare a proposalVersion property.
Idempotency behaviour requires controller/service review.

ChangeRequestCreate:
- changes: list of strings
- details: string

JobActionRequest:
- action: start | pause | resume | complete | progress
- stage: nullable string
- message: nullable string
- percent: nullable int

### Verified Route Declarations

| Workflow | Method | Route |
|---|---|---|
| Customer booking | POST | /api/v1/customer/appointments |
| Booking slots | GET | /api/v1/customer/appointments/slots |
| Manager confirmation | POST | /api/v1/manager/bookings/{id}/confirm |
| Manager assignment | POST | /api/v1/manager/jobs/{id}/assign |
| Mechanic proposal | POST | /api/v1/mechanic/jobs/{jobId}/proposals |
| Manager forwards proposal | POST | /api/v1/manager/approvals/proposals/{id}/forward |
| Customer decision | POST | /api/v1/customer/approvals/{proposalId}/decisions |
| Manager releases work | POST | /api/v1/manager/approvals/proposals/{id}/release |
| Customer change request | POST | /api/v1/customer/jobs/{jobId}/change-requests |
| Mechanic job action | POST | /api/v1/mechanic/jobs/{jobId}/actions |
| Manager issues invoice | POST | /api/v1/manager/billing/jobs/{jobId}/invoice |
| Manager invitation | POST | /api/v1/manager/mechanics/invitations |
| Manager revocation | DELETE | /api/v1/manager/mechanics/invitations/{id} |
| Mechanic accepts invitation | POST | /api/v1/mechanic/auth/invitations/accept |

Route declarations confirm endpoint presence, not all acceptance checks.

### Requirement Gaps and Remaining Review

- Booking request fields differ from the proposed contract.
- Customer decisions use item versions rather than a proposal version.
- Invitation acceptance is marked AllowAnonymous in the current controller.
  This differs from the proposed signed-in, email-bound acceptance requirement.
  Review the request and service before deciding the required change.
- Invitation expiry, account binding, token exposure and atomic acceptance
  still require service review and focused tests.
- Review assignment concurrency, duplicate writes, workflow transitions,
  event payloads, recipients and ownership with the relevant sources.
- The 22 passing tests cover their existing assertions only.
  They do not prove every acceptance check in this document.
- Task FX13-D01-NID-1 remains In Progress.
