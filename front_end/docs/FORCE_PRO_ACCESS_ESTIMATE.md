# Force Pro Access with Duration – Front-end Estimate

## Scope

When the back-end API provides **force Pro access with duration**, the front-end should:

- Treat the user as having Pro access for that duration (even if balance/VIP conditions are not met).
- Unlock PRO settings/buttons and PRO-only features (e.g. PRO pairs, EA settings) while the force access is valid.
- Optionally show when force Pro access expires (e.g. “Pro access until [date]”).

## Assumptions (to confirm with back-end)

- API returns something like:
  - `force_pro_access: boolean` (or equivalent)
  - `force_pro_access_until: string` (ISO date/time) **or** `force_pro_access_duration_hours: number`
- These fields are available on the **user** object (e.g. from `/api/auth/me` or login response).

## Front-end changes

| Task | Description | Est. hours |
|------|-------------|------------|
| 1. User type + AuthContext | Add optional `force_pro_access` and `force_pro_access_until` (or equivalent) to `User` and ensure they are loaded from API. | 0.5–1 |
| 2. accounts/page.tsx | In `canAccessProConfig`, if user has valid force Pro access (not expired), return `true` for PRO configs. | 0.5 |
| 3. accounts/[id]/page.tsx – `canAccessProConfig` | Same logic: if valid force Pro access, allow access to PRO config. | 0.5 |
| 4. accounts/[id]/page.tsx – `isProUser` | Include force Pro access in the check so PRO-only UI (pairs, EA settings) is shown when force access is active. | 0.5 |
| 5. Optional: “Pro access until” UI | Show a small badge/message (e.g. “Pro access until [date]”) when force Pro is active. | 0.5–1 |
| 6. Testing | Both accounts list and account detail: with/without force Pro, expiry, and normal balance/VIP logic. | 1–2 |

## Total estimate

**4–6 hours** (including buffer for API contract clarification and testing).

- **Minimum (no optional UI, straightforward API):** ~4 hours  
- **With optional “Pro access until” UI and full testing:** ~6 hours  

## Summary for client

*“Implementing force Pro access with duration on the front-end is estimated at **4–6 hours**. This covers: reading the new fields from the API, using them in the accounts page and account detail page so PRO settings and PRO-only features are unlocked when force access is valid, and testing. Showing an optional ‘Pro access until [date]’ message can be included in this estimate.”*
