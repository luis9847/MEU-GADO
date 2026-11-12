# Production subscriptions

Implemented, with new real sales disabled by default. Mercado Pago production checkout must be enabled explicitly by an MFA-authorized platform administrator after setting `MP_ACCESS_TOKEN_PROD` in Edge Function Secrets. The test token and test ledger are never used to grant real access. No real payment was made or production seller credential entered during implementation.

## Customer flow

Homepage plan buttons carry the plan/period choice into `/app`. The owner signs in or registers the farm, opens Meu plano, sees the resources, amount, recurring schedule and cancellation conditions, enters a billing email and explicitly accepts the recurring charge. A pending subscription checkout is created with server prices. Only its Mercado Pago hosted checkout handles card/payment details. The return URL merely triggers authenticated reconciliation; it never proves payment.

The app owner portal shows contract status, paid validity, pending checkout, manual refresh and renewal cancellation. Members cannot purchase or cancel another owner's subscription. The existing billing_owner RPC validates owner identity and MFA when configured, without trusting user_metadata. Blocked owners can still call cancellation but cannot create contracts. Contracts, charges, settings, audit and job secret are service-only; clients cannot write them through REST/RPC.

## Access lifecycle

Server reconciliation verifies the production seller (Brazilian account, full tags present, not test_user), subscription identity/reference/parties/currency/price/recurrence and payment live mode, exact amount and unique linkage. Initial payments can be found through the exact unique external reference, recurring charges through their authenticated invoice association. Known approved payments within the active window are re-read for refunds/chargebacks.

The service-only billing_apply RPC locks the contract and access row, deduplicates by provider payment ID, rejects cross-contract payment reuse and old snapshots, and recomputes paid validity deterministically from approved timestamps plus one/12 local calendar months. Repeated events never append another month. No payment or failed renewal means no extension. Cancellation preserves paid validity. Refunds, partial refunds or chargebacks remove the corresponding payment's entitlement. The existing access guard blocks writes at expiry while preserving customer data and reading.

An admin decision made after checkout creation wins: a late payment is marked for review and future charges are stopped, without overwriting free/manual access. Essential activation is refused for a herd exceeding 150 active animals. An existing live recurring contract must be cancelled before an administrator replaces access with a free/manual grant. Such replacement detaches the old billing source; later notifications cannot overwrite it.

Plan/period changes during a paid period are intentionally not prorated: cancel renewal and contract a new plan after current paid validity expires. The portal explains this before payment. Existing free tests never turn into a charge without an explicit purchase.

## Notifications and recovery

Each contract has a random 256-bit notification capability; only its SHA-256 is stored. The callback is a wake-up signal and all financial facts are re-read from the authenticated provider API. A database cron wakes a reconciliation worker every minute when contracts exist; the worker visits up to 20 oldest due contracts in batches of three, with a five-minute minimum polling interval and per-contract lease. Missing callbacks therefore do not permanently prevent reconciliation. Provider delivery of callbacks was not assumed or claimed tested.

pg_net queues can be readable by database roles in this project despite a REVOKE (extension ownership). The follow-up billing_signed_jobs migration replaces the initial job request with a short-lived HMAC signed envelope and replay claim. No provider credential, Supabase service key or job signing secret is queued. The worker validates freshness, signature and one-time monotonic timestamp before reading due contracts. The job secret stays in a service-only private table. Disabling new sales does not stop reconciliation or existing recurring charges; cancellation is explicit per contract.

Creation request UUIDs and a per-farm unique open-contract index prevent duplicate subscriptions. Unknown creation outcomes are recovered by the exact external reference; no blind POST retry is performed. Owner action and server limits prevent repeated checkout creation. Concurrent refreshes use a lease; uncertain records remain visible for support instead of pretending payment failed.

## Operational setup

1. Deploy both production migrations, including billing_signed_jobs, before enabling sales; deploy `billing` with verify_jwt=false because it validates user JWTs and callback/job credentials itself.
2. Set `MP_ACCESS_TOKEN_PROD` using the Mercado Pago production account which receives payments. Never send it in chat or commit it.
3. Admin → Planos → Contratação automática → Verificar configuração.
4. After the account is verified, Ativar contratação online enables new purchases. The public pricing note and account portal reflect availability.
5. Inspect the first real contracted account and reconciliation logs. Real payment/renewal/provider notification completion still needs operational verification with the production merchant account. No automatic real charge is triggered just by activating checkout.

## Verification evidence

- 13 production handler tests: prices, owner authentication, explicit recurring consent, production gate, idempotency, test payment denial, amount/identity substitution, provider-based confirmation, callback forgery denial, MFA admin gate signed job freshness/replay and admin review resolution.
- SQL rollback integration: owner/cross-tenant/anonymous permissions, service-only mutation and job secret, authoritative monthly/annual prices, checkout/lease serialization, pending authorization, first activation, duplicate delivery, renewal, refund, old snapshot rejection, cancellation retaining paid validity, protected admin free grants, late payment conflicts and unchanged real customer access.
- Chromium actual app/admin/landing/legal pages with fixture provider transport at desktop/mobile sizes: checkbox, yearly totals, checkout link, pending/approved distinction, access validity, cancellation, unavailable production state, public plan routing and Terms modal.
- 45 existing tests (sandbox, plans, feeding and weighing) passed after the change.
- Three real farms preserved, no production contracts/payments created and no fixture farms left. Security advisor added only expected informational no-policy notices for service-only tables; no new publicly callable definer APIs.

Limitations: external processor outages, contested/partially refunded payments and changed admin decisions may require support review. Review records stop further recurring charges; automatic refunds are not performed. After resolving access or refund externally, the administrator can acknowledge a cancelled contract review without changing customer access. Historical already-activated cancelled sources do not block future checkout merely because an admin replaced them. Production credential acceptance and real payment/renewal delivery cannot be claimed until the owner configures the merchant account and observes those transactions.

## Private real purchase pilot

Admin → Planos → Compra piloto grants one selected farm/owner a 48-hour
Completo monthly offer at R$5. The public catalogue stays unchanged.
The service-only reservation checks the offer again atomically and only
one pilot contract per farm is allowed. Removing the offer does not cancel
an existing subscription. The pilot uses the normal production payment,
access, cancellation and financial ledger. After checking the first charge,
cancel renewal in Meu plano to avoid the next charge. Use a real buyer
account distinct from the seller, not a Mercado Pago sandbox account.

`tests/billing-pilot-rls.sql` uses temporary fixtures and rolls back;
no provider is called. The browser and handler suites use simulated provider responses.
