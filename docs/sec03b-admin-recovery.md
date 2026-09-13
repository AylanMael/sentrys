# SEC03B — Legacy admin recovery and read side effects

Legacy admin routes still require their existing `rôles` token claims and
`allowedRoles` restrictions. They additionally call `requireTenantUser` for
current active membership and the main suspension policy.

- `global_admin` and `support` require current `super_admin` membership in
  `platform`. Claims alone do not grant recovery access.
- Tenant administrators require current agency `owner`, `admin`, or
  `super_admin` membership, the same tenant in token claims, and an explicit
  matching target. Commercial suspension permits reads, not writes; security
  suspension denies both.
- Support targeting another tenant still requires `allowSupportCrossTenant`.
  No-target platform list routes retain their `allowedRoles` checks.
- `/api/admin/bootstrap` intentionally requires an already provisioned, active
  platform super-admin with the `global_admin` claim. It no longer provides
  initial self-bootstrap. Initial provisioning must use a separately authorized
  server operation; this change does not perform one.

Notifications GET and compliance-summary GET skip reminder generation during
commercial suspension and continue reading existing records. Security suspension
is rejected by the main guard before those reads. This is request-time policy;
it does not make existing reminder generation transactional with a later
suspension transition.

No deployment, production data access or account provisioning is part of this patch.
