# Mercado Pago: administrator sandbox

This stage is restricted to authenticated platform administrators, including the existing MFA requirement. Public plan sales continue using the current hiring flow. Production billing and automatic access activation are not implemented in this stage.

The `billing-test` Edge Function reads `MP_ACCESS_TOKEN_TEST` from server Secrets. It verifies the seller and buyer are Brazilian test accounts. Creation uses a pending hosted subscription, server-controlled price and recurrence. Browser amounts and redirect parameters cannot authorize access. Test records are isolated in `billing_test_checkouts`; the function does not write to `farm_subscriptions`.

Deploy with JWT gateway verification disabled because the function authenticates user JWTs itself, and supports notification callbacks. Every administrative action validates the JWT through Auth and the MFA-aware database RPC. Notifications use a per-checkout random 256-bit callback token, stored only as SHA-256, and are treated solely as wake-up signals. Status, price, currency and parties are fetched/validated through Mercado Pago APIs. The authenticated seller must have the test_user tag. Subscription sandbox payments may report live_mode=true; that flag alone is not used to determine whether the seller is a test account. Initial payments are also searched by the exact unique external reference because a recurring invoice can remain scheduled with no linked payment. An approved payment and a cancelled subscription are reported separately; neither changes client access. The manual Consultar resultado action provides reconciliation even when provider callbacks are unavailable. Production activation requires its own verified notification handling and subscription lifecycle; never enable real customers by swapping this test token.

No real card details or Mercado Pago account passwords are stored. Another user's public profile may omit tags and email. When private email is absent, the administrator supplies the exact buyer test email. Only @testuser.com emails are accepted; the created provider subscription must bind that email to the requested buyer ID and expected test seller before a checkout link is returned. Missing private fields are never interpreted as proof that a valid test ID is invalid. Checkout links are validated against the official Brazilian subscription checkout. Errors never include provider response bodies or credentials. Request UUIDs prevent repeated checkout creation; an uncertain create is retained for manual provider reconciliation, not automatically retried. Creation is limited to 12 attempts per administrator per 10 minutes. Result queries are limited per checkout.

Required automatic Edge Function environment variables: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY. Only the Mercado Pago test token is manually configured.

Verification:

- `node --test tests/billing-test.test.mjs` tests the real handler with fixture transports: prices, authentication, MFA denial, test identities, repeated creation, uncertain API responses, authorization vs payment, payment mismatch/live mode denial, authenticated notifications and cancellation.
- Execute `tests/billing-test-rls.sql` against the project. It runs in a rollback transaction and verifies privileges, admin checks, authoritative prices, idempotency, rate limits, result locks and unchanged real access.
- `CHROMIUM_PATH=/path/to/chromium node tests/billing-test-browser.cjs` exercises the actual admin page at desktop/mobile sizes with fixture provider transport.

Regression coverage includes the actual public-profile shape (no email/tags), explicit test email transmission, real email denial and different-buyer substitution.

Actual credential readiness was verified against Mercado Pago users/me, without printing credentials or personal account details. A real provider-hosted test checkout still needs the owner to sign in as the test buyer and use a test card. No provider-hosted payment completion is claimed by automated tests.

The service-only test table has RLS enabled and no client policies by design. Anonymous/authenticated table and mutation privileges are revoked. The security advisor's informational no-policy finding is expected for this server-only table.
