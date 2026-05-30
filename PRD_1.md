# PRD: User Registration — ShopNest E-Commerce Platform

**Version:** 1.2
**Status:** In Review
**Author:** Platform Team
**Date:** May 2026
**Feature Branch:** `feat/user-registration`

---

## Table of Contents

1. [Feature Overview](#1-feature-overview)
2. [Problem Statement](#2-problem-statement)
3. [Goals](#3-goals)
4. [User Flow](#4-user-flow)
5. [Functional Requirements](#5-functional-requirements)
6. [Non-Functional Requirements](#6-non-functional-requirements)
7. [UI/UX Description](#7-uiux-description)
8. [Validation Rules](#8-validation-rules)
9. [Data Model](#9-data-model)
10. [API Design](#10-api-design)
11. [Security Considerations](#11-security-considerations)
12. [Edge Cases](#12-edge-cases)
13. [Success Metrics](#13-success-metrics)
14. [Acceptance Criteria](#14-acceptance-criteria)

---

## 1. Feature Overview

The User Registration feature enables first-time visitors to ShopNest to create a personal account. Once registered, users gain access to the full shopping experience — saved addresses, order tracking, wishlists, and personalised recommendations.

This feature serves as the primary onboarding gateway and is tightly coupled with the authentication system, email verification pipeline, and downstream marketing consent flows.

Registration is available as a standalone page at `/register`, and also surfaces as a modal during guest checkout when a user elects to save their information. It supports native email/password sign-up and OAuth via Google and Apple.

---

## 2. Problem Statement

ShopNest currently supports guest checkout only, meaning order data is not persisted to a user profile and customers must re-enter shipping and payment details on every visit. Retention metrics show that repeat purchase rate for guest buyers sits at 12%, compared to an industry benchmark of 35–40% for account holders.

Without a registration system, the platform cannot support personalised emails, abandoned cart recovery, or loyalty programmes — all features on the Q3 roadmap. This structural gap blocks a large class of growth initiatives.

---

## 3. Goals

- Provide a frictionless sign-up path completable in under 60 seconds
- Support both email/password and OAuth (Google, Apple) to reduce abandonment
- Enforce email verification before granting full account access
- Capture minimal required data at registration; collect enrichment data progressively post-onboarding
- Meet GDPR and CCPA requirements through explicit consent checkboxes at time of sign-up
- Achieve a registration completion rate above 70% for users who land on the page
- Lay the foundation for SSO and social login expansion in future sprints

---

## 4. User Flow

### 4.1 Email/Password Path

1. **Entry point** — User arrives via nav bar "Sign up" CTA, a post-checkout prompt, or a campaign landing link.
2. **Method selection** — User chooses to fill out the email/password form.
3. **Form completion** — User enters first name, last name, email address, and password. Real-time inline validation fires on blur for each field. A password strength indicator updates as the user types.
4. **Consent and submission** — User reviews the Terms of Service and Privacy Policy, checks the required consent checkbox, and optionally opts into marketing emails. User clicks "Create account".
5. **Server-side processing** — The API validates all inputs, checks for duplicate email, hashes the password using bcrypt, persists the user record with `email_verified: false`, and dispatches a verification email.
6. **Confirmation screen** — User is redirected to a "Check your inbox" page. No session token is issued; the account is in `pending_verification` state.
7. **Email verification** — User clicks the verification link. The token is validated server-side, the account is activated, a session JWT is issued, and the user is redirected to their account dashboard or the originally intended page.

### 4.2 OAuth Path

1. User clicks "Continue with Google" or "Continue with Apple".
2. OAuth flow is handled externally by the provider.
3. On return, if the provider supplies a verified email, the email verification step is skipped and the account is created in `active` state.
4. If the OAuth email already exists as a password account, the user is prompted to link the OAuth provider to the existing account.

---

## 5. Functional Requirements

- The system must support two registration modes: email/password and OAuth (Google, Apple).
- Email addresses must be unique across the system; a duplicate check runs server-side before account creation.
- Passwords must be hashed with bcrypt at a minimum cost factor of 12 before persistence. Plaintext passwords must never be stored or logged.
- A time-limited email verification token (24-hour expiry) must be generated and emailed on successful form submission.
- Accounts in `pending_verification` state must not be able to log in; the system returns a distinct error code for this state.
- Users must be able to request a resend of the verification email, rate-limited to one request per 5 minutes per email address.
- The Terms of Service consent checkbox is mandatory; marketing opt-in is optional and defaults to unchecked.
- GDPR consent timestamp and the version of the Terms accepted must be persisted with the user record.
- On successful OAuth registration where the provider returns a verified email, the email verification step is skipped.
- The system must log registration attempts (success and failure) for audit and fraud detection purposes, without logging any sensitive fields.

---

## 6. Non-Functional Requirements

| Category | Requirement |
|---|---|
| **Performance** | API response under 500ms at p95. Page first contentful paint under 1.5s on 4G mobile. |
| **Scalability** | Must handle 1,000 concurrent registration attempts without degradation. Stateless API design to support horizontal scaling. |
| **Availability** | 99.9% uptime SLA. Transient email service failures must not block account creation — queue and retry. |
| **Accessibility** | WCAG 2.1 AA. Full keyboard navigation. Screen reader-compatible labels and ARIA live regions for inline errors. |
| **Responsiveness** | Fully functional on viewport widths from 320px (small mobile) to 2560px (large desktop). |
| **Compliance** | GDPR Article 7 (consent records). CCPA opt-out support. CAN-SPAM compliance for marketing emails. |

---

## 7. UI/UX Description

The registration page uses a single-column centered layout with a maximum content width of 440px. On desktop, the form floats on a neutral background with ShopNest branding above the card. On mobile, the form fills the full viewport width with comfortable horizontal padding.

The page opens with two prominent OAuth buttons (Google, Apple) styled to each platform's brand guidelines, followed by a visual divider labelled "or continue with email". The email/password fields use floating labels — not placeholder-only inputs — to preserve field context after a value is entered.

A password strength meter sits directly beneath the password field, using a 4-segment bar with colour coding (red → amber → green) and a plain-language label ("Weak", "Fair", "Strong", "Very strong"). The meter is informational only and does not block submission; minimum complexity is enforced via validation rules.

The consent section is visually separated with a light border-top. The required ToS checkbox renders first, with inline links to the Terms of Service and Privacy Policy that open in a new tab. The optional marketing opt-in follows. Both checkboxes display accessible error states if the ToS box is submitted unchecked.

The primary CTA button ("Create account") spans full width. During API processing it enters a loading state — spinner replaces the label, button is disabled — to prevent double-submission. On error, a toast notification appears at the top of the form, and relevant fields are highlighted with field-level error messages beneath them.

---

## 8. Validation Rules

| Field | Rule | Error Message |
|---|---|---|
| First name | Required. 1–50 characters. Letters, hyphens, and apostrophes only. | "Please enter your first name." |
| Last name | Required. 1–80 characters. Same character set as first name. | "Please enter your last name." |
| Email | Required. RFC 5322 format. Normalised to lowercase before storage. MX record verified server-side. | "Enter a valid email address." / "This email is already registered." |
| Password | Required. Min 8 characters. Must include at least one uppercase letter, one number, and one special character (`!@#$%^&*`). Max 128 characters. | "Password must be at least 8 characters with a number, uppercase letter, and symbol." |
| ToS consent | Required. Must be explicitly checked. Cannot default to checked. | "You must agree to the Terms of Service to continue." |

Client-side validation fires on field blur and on submit attempt. Server-side validation mirrors all client rules and is treated as authoritative. Validation errors from the API return field-keyed error objects to allow precise UI mapping.

---

## 9. Data Model

### Entity: `users`

| Field | Type | Nullable | Notes |
|---|---|---|---|
| `id` | UUID v4 | No | Primary key. Generated server-side. |
| `first_name` | varchar(50) | No | Trimmed of leading/trailing whitespace. |
| `last_name` | varchar(80) | No | Trimmed of leading/trailing whitespace. |
| `email` | varchar(255) | No | Normalised to lowercase. Unique index. |
| `password_hash` | varchar(60) | Yes | Null for OAuth-only accounts. bcrypt, cost factor 12. |
| `email_verified` | boolean | No | Defaults `false`. Set `true` after verification or verified OAuth. |
| `verification_token` | varchar(128) | Yes | SHA-256 hashed token. Cleared after successful verification. |
| `verification_expires_at` | timestamptz | Yes | 24 hours from token issuance. |
| `oauth_provider` | varchar(20) | Yes | Enum: `google`, `apple`. Null for email/password accounts. |
| `oauth_subject_id` | varchar(255) | Yes | Provider-issued user ID. Unique index scoped to provider. |
| `tos_version` | varchar(10) | No | Version of ToS accepted at registration (e.g., `"2.1"`). |
| `tos_accepted_at` | timestamptz | No | UTC timestamp of consent. |
| `marketing_opt_in` | boolean | No | Defaults `false`. |
| `status` | enum | No | Values: `pending_verification`, `active`, `suspended`, `deleted`. |
| `created_at` | timestamptz | No | Auto-set on insert. UTC. |
| `updated_at` | timestamptz | No | Auto-updated on any row change. |

---

## 10. API Design

All registration endpoints are under `/api/v1/auth`. Responses follow a consistent envelope format.

### 10.1 Create Account

**`POST /api/v1/auth/register`**

**Request body:**
```json
{
  "first_name": "Sofia",
  "last_name": "Reyes",
  "email": "sofia.reyes@example.com",
  "password": "MySecure!Pass1",
  "tos_accepted": true,
  "marketing_opt_in": false
}
```

**201 Created:**
```json
{
  "status": "pending_verification",
  "message": "Account created. Check your email to verify your address.",
  "user_id": "a3f1c7d2-8b4e-4f3a-9c2d-1e0f2a3b4c5d"
}
```

**422 Validation Error:**
```json
{
  "error": "validation_failed",
  "fields": {
    "email": "This email address is already registered.",
    "password": "Password must include at least one uppercase letter."
  }
}
```

**429 Rate Limited:**
```json
{
  "error": "rate_limit_exceeded",
  "retry_after_seconds": 60
}
```

---

### 10.2 Verify Email

**`POST /api/v1/auth/verify-email`**

**Request body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**200 OK:**
```json
{
  "status": "active",
  "message": "Email verified. You are now logged in.",
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 3600
}
```

**410 Gone (expired token):**
```json
{
  "error": "token_expired",
  "message": "This verification link has expired. Request a new one."
}
```

---

### 10.3 Resend Verification Email

**`POST /api/v1/auth/resend-verification`**

**Request body:**
```json
{
  "email": "sofia.reyes@example.com"
}
```

**200 OK (always, to prevent email enumeration):**
```json
{
  "message": "If this address is registered and unverified, a new email has been sent."
}
```

---

## 11. Security Considerations

- **Password hashing** — bcrypt with cost factor 12. SHA-1 and MD5 are prohibited. Passwords must never appear in logs, error messages, or API responses at any point.
- **Email enumeration prevention** — The resend-verification endpoint always returns HTTP 200 regardless of whether the email exists. The duplicate-email error on the registration form is an intentional UX exception.
- **Rate limiting** — Registration: 10 attempts per IP per 15-minute window. Resend-verification: 1 request per email per 5 minutes. Respond with 429 and a `Retry-After` header.
- **CSRF protection** — All state-mutating endpoints require a valid CSRF token. `SameSite=Strict` cookies are used for session management.
- **Verification tokens** — Generated with a cryptographically secure RNG (128-bit entropy). Stored as SHA-256 hashes in the database. Single-use: invalidated immediately upon successful verification.
- **Transport security** — HTTPS-only. HSTS header with 1-year `max-age`. The registration page must never load over HTTP.
- **Input sanitisation** — All string inputs are trimmed and stripped of HTML entities before persistence to prevent stored XSS.
- **Bot protection** — Invisible reCAPTCHA v3 with a score threshold of 0.5. Scores below the threshold escalate to a checkbox challenge rather than a hard block, to avoid friction for legitimate users.

---

## 12. Edge Cases

| Scenario | Expected Handling |
|---|---|
| Email already registered | Return a field-level error on the email input with a "Sign in instead" link. |
| Expired verification token | Return HTTP 410. Prompt the user to request a new verification email. Do not issue a session. |
| Verification token reuse | Token is deleted after first successful use. Subsequent clicks return 410. |
| OAuth email already registered as password account | Prompt the user to link the OAuth provider to the existing account rather than creating a duplicate. |
| Email service failure | Account is created in `pending_verification` state. Email is queued for retry (exponential backoff, up to 3 attempts over 30 minutes). User sees the confirmation screen normally. |
| Database write failure | Return HTTP 503 with a generic error message. Do not expose internal error details. Log the exception for on-call alerting. |
| Double form submission | Submit button is disabled immediately on first click. An idempotency key on the API prevents duplicate records if a second request reaches the server. |
| Invalid MX record on email domain | MX lookup runs asynchronously server-side. If no valid MX record is found, return a validation error: "This email address doesn't appear to be deliverable." |
| User navigates away mid-form | No partial data is persisted. Form state is held in memory only. No draft-save mechanism is required at this stage. |

---

## 13. Success Metrics

| Metric | Target |
|---|---|
| Registration completion rate | > 70% |
| Email verification rate (within 24h) | > 80% |
| API error rate | < 1% |
| API response time (p95) | < 500ms |
| Bot rejection rate | > 95% |
| Duplicate account creation rate | < 0.5% |

---

## 14. Acceptance Criteria

- [ ] A user can register with an email and password and receives a verification email within 60 seconds of submission.
- [ ] A user can register via Google or Apple OAuth and, if the provider returns a verified email, is taken directly to their account dashboard without an additional verification step.
- [ ] Submitting the form with a duplicate email returns a clear inline error with a prompt to sign in.
- [ ] A password that fails complexity rules is rejected with a specific, actionable error message identifying the failing rule.
- [ ] An account in `pending_verification` state cannot log in; the system returns a distinct error directing the user to check their email.
- [ ] Clicking a verification link older than 24 hours returns an expired-link page with a resend option.
- [ ] The ToS consent checkbox cannot be submitted unchecked; the marketing opt-in is unchecked by default and optional.
- [ ] The registration form is fully operable by keyboard alone and passes an automated WCAG 2.1 AA axe-core scan with zero violations.
- [ ] No plain-text password appears in any server log, database column, or API response at any point in the flow.
- [ ] The `tos_version` and `tos_accepted_at` fields are correctly persisted for every new account regardless of registration method.
