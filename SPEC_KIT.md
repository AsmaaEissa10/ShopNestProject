# Technical Specification Kit — User Registration
## ShopNest E-Commerce Platform

**Spec Version:** 1.0
**Based on PRD Version:** 1.2
**Architect:** Senior Software Architecture Team
**Date:** May 2026
**Status:** Ready for Implementation

> This document is the engineering source of truth derived from PRD v1.2.
> It does not restate product intent — it defines the technical contract for implementation.

---

## Table of Contents

1. [System Architecture](#1-system-architecture)
2. [Frontend Structure](#2-frontend-structure)
3. [Backend Design](#3-backend-design)
4. [Database Schema](#4-database-schema)
5. [Data Flow](#5-data-flow)
6. [Business Logic](#6-business-logic)
7. [Validation Rules](#7-validation-rules)
8. [Security Implementation](#8-security-implementation)
9. [Error Handling](#9-error-handling)
10. [Edge Case Implementation](#10-edge-case-implementation)
11. [Project Folder Structure](#11-project-folder-structure)
12. [Implementation Roadmap](#12-implementation-roadmap)

---

## 1. System Architecture

### 1.1 Overview

ShopNest uses a decoupled architecture. The frontend is a Next.js SPA/SSR app deployed on Vercel. The backend is a Node.js (Express) REST API deployed on AWS ECS (Fargate). The database is PostgreSQL (RDS). Email delivery is handled asynchronously via a job queue.

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT TIER                                │
│                                                                     │
│   Browser / Mobile WebView                                          │
│   Next.js 14 (App Router)  ←→  TanStack Query  ←→  Zustand Store  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS / REST JSON
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           API TIER                                  │
│                                                                     │
│   AWS API Gateway (rate limiting, WAF)                              │
│       │                                                             │
│   Node.js / Express  ←→  Redis (rate limit cache, idempotency)     │
│       │                                                             │
│   AuthService  │  RegistrationService  │  EmailQueueService        │
└──────┬─────────────────────────────────────────────┬───────────────┘
       │ pg (node-postgres)                          │ BullMQ / Redis
       ▼                                             ▼
┌──────────────┐                         ┌──────────────────────────┐
│  PostgreSQL  │                         │  Email Worker Process    │
│  (AWS RDS)   │                         │  (SendGrid / SES)        │
└──────────────┘                         └──────────────────────────┘

         ┌──────────────────────────────────┐
         │  OAuth Providers (External)      │
         │  Google Identity  │  Apple SSO   │
         └──────────────────────────────────┘
```

### 1.2 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| Frontend framework | Next.js 14 (App Router) | SSR for SEO on `/register`, RSC for layout |
| Frontend state | Zustand + TanStack Query | Server state via TQ, form state via Zustand |
| Form management | React Hook Form + Zod | Schema-driven validation, minimal re-renders |
| Backend runtime | Node.js 20 LTS | Async I/O, compatible with existing services |
| Backend framework | Express 5 | Lightweight, well-understood, easy middleware chain |
| Database | PostgreSQL 16 | ACID compliance, UUID support, strong enum types |
| ORM / Query builder | Drizzle ORM | Type-safe, migration-native, lightweight |
| Cache / Queue | Redis 7 (Upstash) | Rate limiting, idempotency keys, BullMQ jobs |
| Job queue | BullMQ | Durable email retry with exponential backoff |
| Email delivery | SendGrid (primary) / AWS SES (fallback) | Deliverability + redundancy |
| Auth tokens | `jsonwebtoken` (JWT HS256) | Stateless session tokens |
| Password hashing | `bcrypt` (cost 12) | PRD-mandated algorithm |
| Token generation | `crypto.randomBytes` (Node built-in) | CSPRNG for verification tokens |
| OAuth | `passport.js` + `passport-google-oauth20` + `passport-apple` | Proven, extensible strategy pattern |
| Captcha | Google reCAPTCHA v3 | Bot protection, graceful challenge escalation |
| Deployment | AWS ECS Fargate (API) + Vercel (Frontend) | Stateless horizontal scaling |

### 1.3 Service Boundaries

```
RegistrationService     — Orchestrates the full sign-up flow
AuthService             — Issues/validates JWTs; manages session state
EmailVerificationService — Generates tokens, validates tokens, triggers resend
EmailQueueService       — Wraps BullMQ; enqueues email jobs; does not send directly
OAuthService            — Handles provider callbacks; maps profiles to users
RateLimiterService      — Redis-backed sliding window rate limiter
CaptchaService          — Validates reCAPTCHA v3 scores; escalates if below threshold
AuditLogService         — Writes immutable audit records; never logs sensitive fields
```

---

## 2. Frontend Structure

### 2.1 Pages

| Route | File | Rendering | Description |
|---|---|---|---|
| `/register` | `app/register/page.tsx` | SSR | Main registration page |
| `/register/confirm` | `app/register/confirm/page.tsx` | CSR | "Check your inbox" screen |
| `/register/verify` | `app/register/verify/page.tsx` | SSR | Handles verification link clicks; reads `?token=` query param |
| `/register/verify/expired` | `app/register/verify/expired/page.tsx` | CSR | Expired token state with resend CTA |

### 2.2 Component Tree

```
app/register/page.tsx
└── <RegisterPage>
    ├── <BrandHeader />                        — ShopNest logo + tagline
    ├── <RegisterCard>                         — 440px max-width centered card
    │   ├── <OAuthButtons>
    │   │   ├── <OAuthButton provider="google" />
    │   │   └── <OAuthButton provider="apple" />
    │   ├── <OrDivider />                      — "or continue with email"
    │   └── <RegisterForm>                     — React Hook Form context
    │       ├── <FloatingLabelInput name="first_name" />
    │       ├── <FloatingLabelInput name="last_name" />
    │       ├── <FloatingLabelInput name="email" type="email" />
    │       ├── <PasswordInput name="password">
    │       │   └── <PasswordStrengthMeter score={score} />
    │       ├── <ConsentSection>
    │       │   ├── <ConsentCheckbox name="tos_accepted" required />
    │       │   └── <ConsentCheckbox name="marketing_opt_in" />
    │       ├── <SubmitButton loading={isSubmitting} />
    │       └── <FormErrorToast errors={formErrors} />
    └── <SignInLink />                         — "Already have an account?"
```

### 2.3 Component Specifications

#### `<FloatingLabelInput>`
- Props: `name`, `label`, `type`, `autoComplete`, `onBlur`
- Behaviour: Label floats to top when input has value or focus
- Error state: Red border + `aria-describedby` pointing to `<FieldError>` element
- Validation trigger: `onBlur` for each individual field; all fields on submit

#### `<PasswordInput>`
- Extends `<FloatingLabelInput>` with a show/hide toggle button
- Fires `onPasswordChange(score: 0|1|2|3)` callback on every keystroke
- Score computed via `zxcvbn` library (client-side only, never sent to server)

#### `<PasswordStrengthMeter>`
- Props: `score: 0|1|2|3`
- Renders a 4-segment bar; segments fill left-to-right based on score
- Labels: `0` → "Weak", `1` → "Fair", `2` → "Strong", `3` → "Very strong"
- Colour map: `0,1` → `var(--color-danger)`, `2` → `var(--color-warning)`, `3` → `var(--color-success)`

#### `<OAuthButton>`
- Props: `provider: 'google' | 'apple'`
- On click: navigates to `/api/v1/auth/oauth/:provider` (server-initiated OAuth flow)
- Renders provider icon + "Continue with {Provider}" text
- Must conform to Google and Apple brand guidelines (logo size, button colour)

#### `<SubmitButton>`
- Props: `loading: boolean`
- When `loading=true`: renders spinner, `disabled=true`, `aria-busy="true"`
- Prevents double-click submission at the DOM level (not just state)

#### `<FormErrorToast>`
- Renders above the form when a non-field error exists (e.g., network failure, 503)
- Uses `role="alert"` and `aria-live="assertive"` for screen reader announcement
- Auto-dismissed after 8 seconds; also has manual close button

### 2.4 Form State Management

```typescript
// Shape of form state (Zod schema mirrors server validation)
const RegisterFormSchema = z.object({
  first_name: z.string().min(1).max(50).regex(/^[a-zA-Z\-']+$/),
  last_name:  z.string().min(1).max(80).regex(/^[a-zA-Z\-']+$/),
  email:      z.string().email().transform(v => v.toLowerCase()),
  password:   z.string().min(8).max(128)
               .regex(/[A-Z]/, 'Must include uppercase letter')
               .regex(/[0-9]/, 'Must include a number')
               .regex(/[!@#$%^&*]/, 'Must include a special character'),
  tos_accepted:    z.literal(true, { errorMap: () => ({ message: 'You must agree to the Terms of Service to continue.' }) }),
  marketing_opt_in: z.boolean().default(false),
})

type RegisterFormValues = z.infer<typeof RegisterFormSchema>
```

### 2.5 API Client Layer

All API calls are made via a typed `apiClient` wrapper. It:
- Attaches the CSRF token header on every mutating request
- Handles 429 responses by surfacing a "Too many attempts" message with the `retry_after_seconds` value
- Handles 503 by surfacing a generic network error toast
- Maps field-keyed error objects from 422 responses directly into React Hook Form's `setError`

```typescript
// src/lib/api/auth.ts
export async function registerUser(payload: RegisterFormValues): Promise<RegisterResponse> { ... }
export async function verifyEmail(token: string): Promise<VerifyResponse> { ... }
export async function resendVerification(email: string): Promise<void> { ... }
```

---

## 3. Backend Design

### 3.1 API Route Map

| Method | Path | Handler | Auth Required |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | `registerController` | No |
| `POST` | `/api/v1/auth/verify-email` | `verifyEmailController` | No |
| `POST` | `/api/v1/auth/resend-verification` | `resendVerificationController` | No |
| `GET` | `/api/v1/auth/oauth/:provider` | `oauthInitController` | No |
| `GET` | `/api/v1/auth/oauth/:provider/callback` | `oauthCallbackController` | No |

### 3.2 Middleware Stack (per request, in order)

```
1. helmetMiddleware          — Sets security headers (CSP, HSTS, X-Frame-Options)
2. corsMiddleware            — Restricts to shopnest.com origins
3. rateLimitMiddleware       — Redis sliding window; route-specific limits (see §8)
4. csrfMiddleware            — Validates double-submit CSRF token
5. captchaMiddleware         — Validates reCAPTCHA v3 score on /register only
6. bodyParserMiddleware      — JSON, max 10kb body limit
7. sanitiseMiddleware        — Trims strings, strips HTML entities
8. validateMiddleware(schema)— Joi/Zod schema validation; returns 422 on failure
9. [controller handler]
10. errorMiddleware          — Catches all unhandled errors; formats and logs them
```

### 3.3 Service Layer Design

#### `RegistrationService`

```
registerWithEmail(dto: RegisterEmailDto): Promise<{ userId: string }>
  1. Normalise email to lowercase
  2. Check duplicate email → throw DuplicateEmailError if exists
  3. Validate MX record asynchronously (dns.resolveMx)
  4. Hash password: bcrypt.hash(password, 12)
  5. Generate verification token: crypto.randomBytes(64).toString('hex')
  6. Hash token for storage: SHA-256(rawToken)
  7. Set verification_expires_at: now + 24h
  8. Write user record to DB (status: pending_verification, email_verified: false)
  9. Enqueue email job: EmailQueueService.enqueue('verification', { userId, rawToken })
  10. Write audit log: AuditLogService.log('REGISTER_SUCCESS', { userId, method: 'email' })
  11. Return { userId }

registerWithOAuth(profile: OAuthProfile): Promise<{ userId: string, isNew: boolean }>
  1. Check if oauth_provider + oauth_subject_id already exists → return existing user
  2. Check if email already exists as password account → throw OAuthAccountConflictError
  3. Write user record (status: active, email_verified: true if provider verified email)
  4. Write audit log: AuditLogService.log('REGISTER_SUCCESS', { userId, method: profile.provider })
  5. Return { userId, isNew: true }
```

#### `EmailVerificationService`

```
verifyToken(rawToken: string): Promise<{ userId: string }>
  1. Hash rawToken → SHA-256(rawToken)
  2. SELECT user WHERE verification_token = hash AND verification_expires_at > NOW()
  3. If not found → throw TokenNotFoundError
  4. If expired → throw TokenExpiredError  (also checked via DB query above)
  5. UPDATE user SET email_verified=true, status='active',
                     verification_token=NULL, verification_expires_at=NULL
  6. Issue JWT: AuthService.issueToken(userId)
  7. Write audit log: AuditLogService.log('EMAIL_VERIFIED', { userId })
  8. Return { userId }

resendVerification(email: string): Promise<void>
  1. Normalise email to lowercase
  2. SELECT user WHERE email = normalised AND status = 'pending_verification'
  3. If not found → return void (silent, prevent enumeration)
  4. Check resend rate limit: Redis key resend:{email} with 5min TTL
  5. If rate limited → throw ResendRateLimitError
  6. Generate new raw token + SHA-256 hash
  7. UPDATE user SET verification_token=hash, verification_expires_at=now+24h
  8. Enqueue new email job
  9. Set Redis key: SET resend:{email} 1 EX 300
```

#### `AuthService`

```
issueToken(userId: string): string
  — Signs JWT with HS256, payload { sub: userId, iat, exp: now+1h }
  — Returns signed token string

validateToken(token: string): { userId: string }
  — Verifies signature; throws if expired or invalid
```

#### `EmailQueueService`

```
enqueue(type: 'verification' | 'welcome', data: object): Promise<void>
  — Adds job to BullMQ 'email' queue
  — Job options: attempts: 3, backoff: { type: 'exponential', delay: 5000 }
  — Max retry window: ~30 minutes total across 3 attempts
```

#### `AuditLogService`

```
log(event: AuditEvent, context: Record<string, string>): void
  — Writes to audit_logs table
  — Allowed context keys: userId, method, ip, userAgent
  — Blocked context keys (never logged): password, token, email (unless explicitly permitted per event)
  — Fire-and-forget; does NOT throw on failure
```

### 3.4 OAuth Flow (Passport.js)

```
GET /api/v1/auth/oauth/google
  → passport.authenticate('google', { scope: ['profile', 'email'] })
  → Redirects to Google

GET /api/v1/auth/oauth/google/callback
  → passport.authenticate('google', { failureRedirect: '/register?error=oauth_failed' })
  → Calls OAuthService.registerWithOAuth(profile)
  → On conflict: redirects to /register?error=account_exists&email=<encoded>
  → On success: redirects to /account/dashboard with Set-Cookie: session JWT
```

---

## 4. Database Schema

### 4.1 `users` Table

```sql
CREATE TABLE users (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name              VARCHAR(50)  NOT NULL,
  last_name               VARCHAR(80)  NOT NULL,
  email                   VARCHAR(255) NOT NULL,
  password_hash           VARCHAR(60),                    -- NULL for OAuth-only
  email_verified          BOOLEAN      NOT NULL DEFAULT FALSE,
  verification_token      VARCHAR(128),                   -- SHA-256 hash; NULL after verification
  verification_expires_at TIMESTAMPTZ,
  oauth_provider          VARCHAR(20)  CHECK (oauth_provider IN ('google', 'apple')),
  oauth_subject_id        VARCHAR(255),
  tos_version             VARCHAR(10)  NOT NULL,
  tos_accepted_at         TIMESTAMPTZ  NOT NULL,
  marketing_opt_in        BOOLEAN      NOT NULL DEFAULT FALSE,
  status                  VARCHAR(30)  NOT NULL DEFAULT 'pending_verification'
                          CHECK (status IN ('pending_verification', 'active', 'suspended', 'deleted')),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE UNIQUE INDEX users_email_unique         ON users (email);
CREATE UNIQUE INDEX users_oauth_unique         ON users (oauth_provider, oauth_subject_id)
                                               WHERE oauth_provider IS NOT NULL;
CREATE INDEX        users_verification_token   ON users (verification_token)
                                               WHERE verification_token IS NOT NULL;
CREATE INDEX        users_status               ON users (status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 4.2 `audit_logs` Table

```sql
CREATE TABLE audit_logs (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event      VARCHAR(60) NOT NULL,
  user_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  ip_address INET,
  user_agent TEXT,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX audit_logs_user_id   ON audit_logs (user_id);
CREATE INDEX audit_logs_event     ON audit_logs (event);
CREATE INDEX audit_logs_created   ON audit_logs (created_at DESC);
```

### 4.3 `email_jobs` Table (BullMQ persistence — managed by Redis; Postgres mirror for audit)

```sql
CREATE TABLE email_jobs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  type        VARCHAR(40) NOT NULL,
  user_id     UUID        REFERENCES users(id) ON DELETE CASCADE,
  status      VARCHAR(20) NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued', 'sent', 'failed')),
  attempts    SMALLINT    NOT NULL DEFAULT 0,
  last_error  TEXT,
  queued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at     TIMESTAMPTZ
);
```

### 4.4 Migration Strategy

- Migrations managed by Drizzle ORM (`drizzle-kit`)
- Each migration is a timestamped SQL file committed to version control
- Run order: `001_create_users.sql` → `002_create_audit_logs.sql` → `003_create_email_jobs.sql`
- CI pipeline runs `drizzle-kit migrate` against a test database before merge
- Production migrations run via a pre-deploy step in the ECS task definition

---

## 5. Data Flow

### 5.1 Email/Password Registration Flow

```
Browser                     API Server                  PostgreSQL          Redis               Email Worker
  │                              │                           │                 │                      │
  │──POST /register ────────────►│                           │                 │                      │
  │  { first_name, last_name,    │                           │                 │                      │
  │    email, password,          │──SELECT email ───────────►│                 │                      │
  │    tos_accepted,             │◄─ exists? ────────────────│                 │                      │
  │    marketing_opt_in,         │                           │                 │                      │
  │    recaptcha_token }         │──CHECK rate limit ────────────────────────►│                      │
  │                              │◄─ allowed? ───────────────────────────────│                      │
  │                              │                           │                 │                      │
  │                              │  bcrypt.hash(password,12) │                 │                      │
  │                              │  crypto.randomBytes(64)   │                 │                      │
  │                              │  SHA-256(rawToken)        │                 │                      │
  │                              │                           │                 │                      │
  │                              │──INSERT user ────────────►│                 │                      │
  │                              │◄─ userId ─────────────────│                 │                      │
  │                              │                           │                 │                      │
  │                              │──INSERT audit_log ───────►│                 │                      │
  │                              │──ENQUEUE email job ────────────────────────►│                      │
  │                              │                           │                 │──DEQUEUE ───────────►│
  │◄─ 201 { status, userId } ───│                           │                 │                      │──SEND email
  │                              │                           │                 │◄─ ACK ───────────────│
  │                              │                           │                 │                      │
  │  [User clicks verify link]   │                           │                 │                      │
  │──POST /verify-email ────────►│                           │                 │                      │
  │  { token: rawToken }         │──SHA-256(rawToken)        │                 │                      │
  │                              │──SELECT WHERE token=hash,│                 │                      │
  │                              │   expires > NOW ─────────►│                 │                      │
  │                              │◄─ user row ───────────────│                 │                      │
  │                              │──UPDATE user.status='active'                │                      │
  │                              │   email_verified=true ───►│                 │                      │
  │                              │──issue JWT                │                 │                      │
  │◄─ 200 { access_token } ─────│                           │                 │                      │
```

### 5.2 OAuth Registration Flow

```
Browser                   API Server                 Google / Apple           PostgreSQL
  │                            │                            │                      │
  │──GET /oauth/google ───────►│                            │                      │
  │◄─ 302 redirect ────────────│───────────────────────────►│                      │
  │                            │                            │──Auth + consent      │
  │◄──────────────────────────────────────── callback ──────│                      │
  │──GET /oauth/google/callback►│                            │                      │
  │                            │──SELECT by oauth_subject ─────────────────────►  │
  │                            │◄─ not found ─────────────────────────────────────│
  │                            │──SELECT by email ──────────────────────────────► │
  │                            │◄─ conflict? ─────────────────────────────────────│
  │                            │──INSERT new user (status: active) ─────────────► │
  │                            │──issue JWT                                        │
  │◄─ 302 /account/dashboard ─│                            │                      │
  │  Set-Cookie: session        │                            │                      │
```

---

## 6. Business Logic

### 6.1 Account Status State Machine

```
                  ┌──────────────────────────────────┐
  [Registration]  │                                  │
  email/password  │    pending_verification           │
  ──────────────► │                                  │
                  └──────────┬───────────────────────┘
                             │ email verified OR
                             │ OAuth with verified email
                             ▼
                  ┌──────────────────────────────────┐
                  │           active                 │◄──── admin reinstate
                  └──────────┬───────────────────────┘
                             │ admin action                 │ admin action
                             ▼                             ▼
                  ┌─────────────────┐         ┌─────────────────────┐
                  │   suspended     │         │      deleted         │
                  └─────────────────┘         └─────────────────────┘

Transition rules:
- pending_verification → active:    EmailVerificationService.verifyToken() success
                                    OR OAuthService with provider-verified email
- active → suspended:               Admin action only (out of scope for this spec)
- active → deleted:                 Admin action or user self-deletion (out of scope)
- pending_verification is the ONLY non-login state. suspended and deleted also block login.
```

### 6.2 TOS Version Resolution

- The current TOS version string (e.g., `"2.1"`) is stored as a server-side constant in `config/legal.ts`
- At registration time, the API reads `TOS_CURRENT_VERSION` from config and writes it to `users.tos_version`
- The version string must be bumped in config whenever the ToS document changes
- A database migration is not required for version bumps — the config change is sufficient

### 6.3 Password Strength Score (Client-only)

- Computed using `zxcvbn` on the client. The score (0–3) drives the UI only.
- The score is **never sent to the server**. Server enforces explicit rule-based validation, not entropy scores.

### 6.4 MX Record Check

- Runs asynchronously server-side via `dns.promises.resolveMx(domain)`
- Called after email format validation passes
- If DNS lookup throws `ENOTFOUND` or returns an empty array, respond with field-level 422
- If DNS lookup times out (>3 seconds), **skip the check and allow the request through** to avoid blocking legitimate users on slow DNS resolvers
- Result is not cached — each registration performs a fresh lookup

### 6.5 Idempotency Key

- Client generates a `X-Idempotency-Key` header (UUID v4) on form submit
- API stores `SET idempotency:{key} userId EX 86400` in Redis after successful user creation
- On retry with the same key, return the stored `userId` with 201 status without re-inserting
- Key TTL: 24 hours

### 6.6 Marketing Opt-In Propagation

- At registration, `marketing_opt_in` is written to `users.marketing_opt_in`
- If `true`, an event is published to the internal `marketing.subscribe` event bus topic after successful account creation (async, non-blocking)
- This spec does not define the downstream consumer — that is the responsibility of the Marketing Service

---

## 7. Validation Rules

### 7.1 Shared Schema (used on both client and server)

Both client (Zod) and server (Joi or Zod) implement the same rule set. Server is authoritative.

```
Field          | Rule                                                    | HTTP Error
───────────────┼─────────────────────────────────────────────────────────┼──────────────
first_name     | required, 1–50 chars, /^[a-zA-Z\-']+$/                 | 422
last_name      | required, 1–80 chars, /^[a-zA-Z\-']+$/                 | 422
email          | required, RFC 5322 regex, normalise to lowercase,       | 422
               | MX lookup server-side                                   |
password       | required, min 8, max 128,                               | 422
               | /[A-Z]/ (uppercase), /[0-9]/ (digit),                  |
               | /[!@#$%^&*]/ (special char)                            |
tos_accepted   | must be boolean true (not truthy — literal true)        | 422
marketing_opt_in | optional boolean, default false                       | —
recaptcha_token | required on /register, min score 0.5 server-side       | 403
```

### 7.2 Server-Side Error Response Shape

```json
{
  "error": "validation_failed",
  "fields": {
    "email":    "This email address is already registered.",
    "password": "Password must include at least one uppercase letter."
  }
}
```

Field keys in the `fields` object **must exactly match** the request body field names so the API client can call `form.setError(fieldName, { message })` without transformation.

### 7.3 Validation Execution Order (Server)

1. Schema shape validation (types, required fields)
2. String trim + HTML entity strip
3. Email format regex
4. Duplicate email check (DB query)
5. MX record check (DNS, async — skipped on timeout)
6. Password complexity regex checks
7. `tos_accepted === true` literal check
8. reCAPTCHA score check (must be ≥ 0.5)

If any step fails, validation halts and returns 422 immediately (fail-fast). The exception is MX record check, which is skipped (not failed) on timeout.

---

## 8. Security Implementation

### 8.1 Rate Limiting Configuration

```
Endpoint                    | Limit                  | Key                | Response
────────────────────────────┼────────────────────────┼────────────────────┼──────────────────────
POST /auth/register         | 10 req / 15min / IP    | ratelimit:{ip}     | 429 + Retry-After
POST /auth/resend-verify    | 1 req / 5min / email   | resend:{email}     | 429 + Retry-After
POST /auth/verify-email     | 20 req / 15min / IP    | ratelimit:{ip}     | 429 + Retry-After
GET  /auth/oauth/:provider  | 20 req / 15min / IP    | ratelimit:{ip}     | 429 + Retry-After
```

Redis key structure: `ratelimit:{endpoint_slug}:{identifier}` with a sliding window TTL.

### 8.2 Password Hashing

```typescript
// Implementation contract — do not deviate
import bcrypt from 'bcrypt'
const COST_FACTOR = 12

async function hashPassword(plaintext: string): Promise<string> {
  // plaintext is cleared from memory immediately after this call
  return bcrypt.hash(plaintext, COST_FACTOR)
}

async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash)
}
```

- Cost factor 12 produces ~300ms hash time on reference hardware — acceptable for registration
- If hardware changes, re-evaluate: target 250–500ms range
- Never reduce below cost 10

### 8.3 Verification Token Lifecycle

```
1. Generate: rawToken = crypto.randomBytes(64).toString('hex')  → 128 hex chars
2. Hash:     storedToken = crypto.createHash('sha256').update(rawToken).digest('hex')
3. Store:    users.verification_token = storedToken
4. Send:     Email link contains rawToken (not the hash)
5. Verify:   Re-hash the rawToken received from the URL; compare to DB
6. Consume:  SET verification_token = NULL immediately after match
7. Expire:   DB query filters WHERE verification_expires_at > NOW()
```

### 8.4 JWT Configuration

```typescript
const JWT_CONFIG = {
  algorithm: 'HS256',
  expiresIn:  '1h',
  issuer:     'shopnest-api',
  audience:   'shopnest-client',
}
// Secret loaded from AWS Secrets Manager, not env vars in production
// Minimum secret length: 256-bit (32 bytes)
```

### 8.5 Security Headers (Helmet.js configuration)

```typescript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "https://www.google.com", "https://www.gstatic.com"],
      frameSrc:    ["https://www.google.com"],  // reCAPTCHA iframe
      connectSrc:  ["'self'"],
    }
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}))
```

### 8.6 CSRF Token Strategy

- Double-submit cookie pattern
- On page load, the server sets a `csrf_token` cookie (`SameSite=Strict; HttpOnly=false`)
- The frontend reads the cookie and sends it as a `X-CSRF-Token` request header
- The `csrfMiddleware` validates that the header value matches the cookie value
- Applied to all `POST` endpoints

### 8.7 Input Sanitisation Middleware

```typescript
function sanitiseBody(req, res, next) {
  for (const key of Object.keys(req.body)) {
    if (typeof req.body[key] === 'string') {
      req.body[key] = req.body[key]
        .trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
    }
  }
  next()
}
```

### 8.8 Audit Log — Blocked Fields

The `AuditLogService` enforces a field denylist at write time. Attempting to log any of the following throws an `AuditLogPolicyError` rather than writing:

```
password, password_hash, verification_token, access_token, credit_card, cvv, ssn
```

---

## 9. Error Handling

### 9.1 Error Class Hierarchy

```
AppError (base)
  ├── ValidationError        → HTTP 422  — field-level errors; carries `fields` map
  ├── DuplicateEmailError    → HTTP 422  — email field error; carries sign-in redirect hint
  ├── TokenNotFoundError     → HTTP 410  — expired or invalid verification token
  ├── TokenExpiredError      → HTTP 410  — token found but past expiry
  ├── OAuthAccountConflictError → HTTP 409 — OAuth email matches existing password account
  ├── ResendRateLimitError   → HTTP 429  — resend called too soon
  ├── RateLimitError         → HTTP 429  — general rate limit; carries retryAfterSeconds
  ├── CaptchaFailedError     → HTTP 403  — reCAPTCHA score below threshold
  ├── MxValidationError      → HTTP 422  — no valid MX record found
  └── ServiceUnavailableError → HTTP 503  — DB failure or unhandled upstream error
```

### 9.2 Global Error Handler Middleware

```typescript
app.use((err, req, res, next) => {
  // Log ALL errors (sanitised) to structured logger
  logger.error({
    errorType: err.constructor.name,
    message:   err.message,
    requestId: req.id,
    // No stack traces in production logs (security)
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  })

  if (err instanceof AppError) {
    return res.status(err.statusCode).json(err.toJSON())
  }

  // Unhandled errors → opaque 503
  res.status(503).json({
    error:   'service_unavailable',
    message: 'Something went wrong. Please try again.'
  })
})
```

### 9.3 HTTP Status Code Contract

| Status | Meaning in this system |
|---|---|
| `201` | User created; pending verification |
| `200` | Token verified; session issued OR resend acknowledged |
| `409` | OAuth email conflict with existing password account |
| `410` | Verification token not found or expired |
| `422` | Client-supplied data failed validation |
| `403` | reCAPTCHA check failed |
| `429` | Rate limit hit; always accompanied by `Retry-After` header |
| `503` | Internal failure; safe to retry after backoff |

### 9.4 Email Job Failure Handling

```
Attempt 1: immediate
Attempt 2: +5 seconds
Attempt 3: +25 seconds  (total window ~30s)

On all 3 failures:
  - Mark email_jobs record status = 'failed'
  - Fire alert to PagerDuty via SNS topic (email delivery failures are P2 severity)
  - User account remains in pending_verification; user can resend manually
```

### 9.5 Database Connection Failure

- API uses a pg connection pool (`max: 20, idleTimeoutMillis: 30000`)
- If pool is exhausted or connection fails, Drizzle throws `PoolExhaustedError`
- This is caught by the global error handler and returned as HTTP 503
- Liveness probe on ECS checks DB connectivity every 30s; task is replaced if probe fails 3×

---

## 10. Edge Case Implementation

| Edge Case | Detection Point | Implementation |
|---|---|---|
| Duplicate email | `RegistrationService.registerWithEmail`, step 2 | `SELECT id FROM users WHERE email = $1`; throws `DuplicateEmailError` → 422 with `fields.email` |
| Expired verification token | `EmailVerificationService.verifyToken`, step 2 | DB query includes `AND verification_expires_at > NOW()`; not found → `TokenExpiredError` → 410 |
| Token reuse | `EmailVerificationService.verifyToken`, step 5 | Token column set to NULL on first use; second call returns not-found → 410 |
| OAuth + existing password account | `RegistrationService.registerWithOAuth`, step 2 | Email lookup before OAuth insert; `OAuthAccountConflictError` → 409 → frontend redirect to `/register?error=account_exists` |
| Email service failure | `EmailQueueService.enqueue` | BullMQ retries; account created regardless; user shown confirmation screen |
| DB write failure | `RegistrationService`, INSERT step | Caught by global error handler → 503; no partial writes (single transaction) |
| Double submission | Client + Server | Client: button disabled on click. Server: idempotency key in Redis; duplicate key returns stored userId |
| Invalid MX record | `RegistrationService.registerWithEmail`, step 3 | `dns.promises.resolveMx` with 3s timeout; empty/error → `MxValidationError` → 422; timeout → skip |
| User navigates away | N/A | No server-side concern; no partial persistence by design |
| Pending account tries to log in | `AuthService.validateLogin` (login flow) | Separate login flow returns `{ error: 'email_not_verified' }` with resend link (out of scope for this spec; must be implemented in login spec) |

---

## 11. Project Folder Structure

```
shopnest/
├── apps/
│   ├── web/                              # Next.js frontend
│   │   ├── app/
│   │   │   ├── register/
│   │   │   │   ├── page.tsx              # /register route (SSR)
│   │   │   │   ├── confirm/
│   │   │   │   │   └── page.tsx          # /register/confirm (CSR)
│   │   │   │   └── verify/
│   │   │   │       ├── page.tsx          # /register/verify?token= (SSR)
│   │   │   │       └── expired/
│   │   │   │           └── page.tsx      # /register/verify/expired
│   │   │   └── layout.tsx
│   │   ├── components/
│   │   │   ├── auth/
│   │   │   │   ├── RegisterForm.tsx
│   │   │   │   ├── RegisterCard.tsx
│   │   │   │   ├── OAuthButton.tsx
│   │   │   │   ├── OAuthButtons.tsx
│   │   │   │   ├── OrDivider.tsx
│   │   │   │   ├── PasswordInput.tsx
│   │   │   │   ├── PasswordStrengthMeter.tsx
│   │   │   │   ├── ConsentSection.tsx
│   │   │   │   ├── ConsentCheckbox.tsx
│   │   │   │   └── FormErrorToast.tsx
│   │   │   └── ui/
│   │   │       ├── FloatingLabelInput.tsx
│   │   │       ├── SubmitButton.tsx
│   │   │       └── BrandHeader.tsx
│   │   ├── lib/
│   │   │   ├── api/
│   │   │   │   └── auth.ts               # Typed API client for auth endpoints
│   │   │   ├── schemas/
│   │   │   │   └── registerSchema.ts     # Zod schema (shared client validation)
│   │   │   └── utils/
│   │   │       └── passwordStrength.ts   # zxcvbn wrapper
│   │   └── public/
│   │
│   └── api/                              # Express backend
│       ├── src/
│       │   ├── controllers/
│       │   │   └── auth/
│       │   │       ├── register.controller.ts
│       │   │       ├── verifyEmail.controller.ts
│       │   │       ├── resendVerification.controller.ts
│       │   │       └── oauth.controller.ts
│       │   ├── services/
│       │   │   ├── registration.service.ts
│       │   │   ├── emailVerification.service.ts
│       │   │   ├── auth.service.ts
│       │   │   ├── emailQueue.service.ts
│       │   │   ├── oauth.service.ts
│       │   │   ├── rateLimiter.service.ts
│       │   │   ├── captcha.service.ts
│       │   │   └── auditLog.service.ts
│       │   ├── middleware/
│       │   │   ├── helmet.middleware.ts
│       │   │   ├── cors.middleware.ts
│       │   │   ├── rateLimit.middleware.ts
│       │   │   ├── csrf.middleware.ts
│       │   │   ├── captcha.middleware.ts
│       │   │   ├── sanitise.middleware.ts
│       │   │   ├── validate.middleware.ts
│       │   │   └── error.middleware.ts
│       │   ├── routes/
│       │   │   └── auth.routes.ts
│       │   ├── errors/
│       │   │   ├── AppError.ts
│       │   │   ├── ValidationError.ts
│       │   │   ├── DuplicateEmailError.ts
│       │   │   ├── TokenErrors.ts
│       │   │   ├── OAuthConflictError.ts
│       │   │   └── RateLimitError.ts
│       │   ├── workers/
│       │   │   └── email.worker.ts       # BullMQ worker process
│       │   ├── db/
│       │   │   ├── index.ts              # Drizzle client + pool config
│       │   │   └── schema/
│       │   │       ├── users.ts
│       │   │       ├── auditLogs.ts
│       │   │       └── emailJobs.ts
│       │   └── config/
│       │       ├── app.ts
│       │       ├── legal.ts              # TOS_CURRENT_VERSION constant
│       │       └── secrets.ts            # AWS Secrets Manager loader
│       └── migrations/
│           ├── 001_create_users.sql
│           ├── 002_create_audit_logs.sql
│           └── 003_create_email_jobs.sql
│
├── packages/
│   └── validation/                       # Shared Zod schemas (used by both apps)
│       ├── src/
│       │   └── auth/
│       │       └── registerSchema.ts
│       └── package.json
│
├── infra/                                # IaC (Terraform or CDK)
│   ├── ecs.tf
│   ├── rds.tf
│   ├── redis.tf
│   └── secrets.tf
│
├── .github/
│   └── workflows/
│       ├── ci.yml                        # Lint, test, build
│       └── deploy.yml                    # ECS deploy on main merge
│
└── package.json                          # pnpm workspace root
```

---

## 12. Implementation Roadmap

### Phase 1 — Foundation (Week 1–2)

**Backend:**
- [ ] Set up Express project scaffold with TypeScript
- [ ] Configure Helmet, CORS, body-parser, sanitise middleware
- [ ] Set up Drizzle ORM and PostgreSQL connection pool
- [ ] Write and run migrations: `users`, `audit_logs`, `email_jobs`
- [ ] Implement `AuditLogService` with field denylist enforcement
- [ ] Implement `RateLimiterService` with Redis sliding window

**Frontend:**
- [ ] Set up Next.js 14 project with App Router
- [ ] Create `/register` page shell with SSR metadata
- [ ] Build `<FloatingLabelInput>` and `<SubmitButton>` base components
- [ ] Wire React Hook Form + Zod schema into `<RegisterForm>`

**Shared:**
- [ ] Create `packages/validation` workspace with shared Zod schema
- [ ] Set up CI pipeline (lint, typecheck, unit test)

---

### Phase 2 — Core Registration (Week 3–4)

**Backend:**
- [ ] Implement `RegistrationService.registerWithEmail` (steps 1–11)
- [ ] Implement `EmailVerificationService.verifyToken`
- [ ] Implement `EmailVerificationService.resendVerification`
- [ ] Implement `EmailQueueService` with BullMQ + SendGrid worker
- [ ] Wire all three controllers and routes
- [ ] Add CSRF middleware and idempotency key handling
- [ ] Implement `CaptchaService` (reCAPTCHA v3 verification)

**Frontend:**
- [ ] Build `<OAuthButton>`, `<OAuthButtons>`, `<OrDivider>` components
- [ ] Build `<PasswordInput>` with show/hide toggle
- [ ] Build `<PasswordStrengthMeter>` with zxcvbn integration
- [ ] Build `<ConsentSection>` with ToS + marketing checkboxes
- [ ] Build `<FormErrorToast>` with ARIA live region
- [ ] Implement `apiClient` (`lib/api/auth.ts`) with CSRF header + error mapping
- [ ] Build `/register/confirm` page

---

### Phase 3 — OAuth + Verification Pages (Week 5)

**Backend:**
- [ ] Configure Passport.js with Google strategy
- [ ] Configure Passport.js with Apple strategy
- [ ] Implement `OAuthService.registerWithOAuth` with account-conflict detection
- [ ] Implement `oauthInitController` and `oauthCallbackController`

**Frontend:**
- [ ] Build `/register/verify` page — reads `?token=` and calls `verifyEmail` API
- [ ] Build `/register/verify/expired` page with resend CTA
- [ ] Connect OAuth buttons to server-initiated OAuth routes

---

### Phase 4 — Security Hardening + Accessibility (Week 6)

- [ ] Penetration test registration flow (OWASP Top 10 checklist)
- [ ] Run axe-core automated accessibility scan; fix all violations
- [ ] Conduct keyboard-navigation QA pass on all registration pages
- [ ] Validate all ARIA attributes and live regions with NVDA/VoiceOver
- [ ] Security review: confirm no plaintext passwords in any logs
- [ ] Load test: 1,000 concurrent registrations via k6; validate p95 < 500ms
- [ ] Review and confirm GDPR consent fields are populated correctly on all paths

---

### Phase 5 — QA, Monitoring, and Launch (Week 7)

- [ ] Write integration tests for all 3 API endpoints (happy path + all error cases)
- [ ] Write E2E tests (Playwright) for email/password and OAuth flows
- [ ] Configure Datadog dashboards: registration rate, error rate, API p95, email delivery rate
- [ ] Configure PagerDuty alerts: error rate > 5%, email delivery failure, DB connection failures
- [ ] Production deploy with feature flag (`REGISTRATION_ENABLED=true`)
- [ ] Monitor success metrics for 48 hours post-launch
- [ ] Retrospective and post-launch spec amendment if needed

---

### Dependency Map

```
Phase 1 (Foundation)
  └─► Phase 2 (Core Registration)
        ├─► Phase 3 (OAuth + Verification Pages)
        └─► Phase 4 (Security + Accessibility)
              └─► Phase 5 (QA + Launch)
```

Phase 3 and Phase 4 can run in parallel once Phase 2 is complete.

---

*End of Technical Specification Kit — ShopNest User Registration v1.0*
