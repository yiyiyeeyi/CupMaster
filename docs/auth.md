# Authentication and Local Mode

Cloud 2 adds optional Supabase email/password authentication without changing the Local MVP data source. `AuthRepository` isolates the SDK, `AuthService` validates and maps errors, `AuthSessionController` owns recovery/subscription, and `AuthProvider` exposes UI state.

The browser client requires `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Next.js browser bundling requires the complete static references `process.env.NEXT_PUBLIC_SUPABASE_URL` and `process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; passing the whole `process.env` object or using dynamic lookup is unsupported. Missing configuration produces a recoverable unavailable state while Local Mode continues.

Statuses are `loading`, `local`, `authenticated`, and recoverable `error`. Initial client load restores with `getSession()` and exactly one `onAuthStateChange` listener; cleanup unsubscribes. Missing environment or network failure never blocks local routes.

Signing in does not upload LocalStorage. Signing out clears only the Supabase session and never clears CupMaster storage. Onboarding, Brew, Journal, Profile, and Suggested Plans remain local. Cloud 4 is reserved for explicit migration and Cloud 5 for synchronization/conflicts.

After authentication, a narrow bootstrap service reads the current Auth user and ensures a minimal `public.profiles` row. It accepts no user id parameter and relies on RLS. Defaults are email local-part (or `Coffee Brewer`), beginner, no needs, and incomplete onboarding. Local onboarding is not copied.

Not implemented: OAuth, account deletion, complete password reset, remote repositories, migration, synchronization, Realtime, or real AI.

## Signup confirmation state

Signup without a session enters a transient `confirmation_sent` UI. It states that the account was created, displays only the submitted email, and removes password fields from state. Back to Sign in and Change email preserve the email while restoring empty password fields. Refresh may return to the normal Auth page; this UI state is never persisted or placed in a URL.

Resend confirmation uses `supabase.auth.resend({ type: "signup", email })`. Loading prevents duplicate requests; accepted, rate-limited, network, and safe unknown-error states remain on the confirmation screen. Continue locally remains available. Authentication still does not mean synchronization, and Cloud 3 has not started.
