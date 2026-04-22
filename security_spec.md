# Firestore Security Specification

## Data Invariants
1. A user can always read and write their own profile and sub-collections (healthLogs, appointments, trustedContacts, chatHistory).
2. Caregivers can read the profiles and records of their assigned patients.
3. Admins have full read/write access to all collections for management (except where strictly prohibited).
4. All IDs must be valid (alphanumeric, underscores, hyphens).
5. All writes must be validated for schema integrity and size limits.
6. Identity spoofing is prevented by matching `request.auth.uid` with the document fields.

## The "Dirty Dozen" Payloads (Deny Test Cases)
1. **Self-Promotion to Admin**: User k3qL attempts to update their role to 'admin'.
2. **Identity Spoofing**: User A attempts to create user B's profile.
3. **Orphaned Health Log**: User A attempts to create a health log with a `userId` that is NOT User A.
4. **Invalid ID Poisoning**: User A attempts to create a document with a 1KB string as an ID.
5. **PII Leak**: Authenticated User B attempts to 'get' User A's private data.
6. **State Shortcutting**: User A attempts to update a terminal 'status' of an appointment.
7. **Resource Poisoning**: User A attempts to save a 1MB string in the 'notes' field.
8. **Unauthorized Caregiver Access**: User B (not an assigned caregiver) attempts to 'list' User A's health logs.
9. **Email verification bypass**: (Optional/Mandatory check) Unverified user attempting a protected write if mandated.
10. **Shadow Update**: User A attempts to add an extra 'isAdmin' field to their profile.
11. **Relational Sync Break**: User A attempts to create a joinedCircle entry for a circle that does not exist.
12. **Blanket Read Request**: User A attempts to 'list' all users without any filters.

## Test Runner
Verified via `firestore.rules.test.ts`. 
