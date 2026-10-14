# United Delhi dependency audit

Run these commands from a checkout of `main` on a machine with npm registry access. They inspect the locked dependency trees and do not automatically update packages:

```bash
cd server && npm audit
cd ../web && npm audit
cd ../app && npm audit
```

Review all findings before enabling scheduled deployments. Record the advisory, affected package path, severity, fixed version, and whether the fix is compatible with the current manifest. Update manifests/lockfiles together, then rerun audits, typechecks, tests, and builds. Avoid `npm audit fix --force` without reviewing the breaking-change risk. An audit result reflects advisories known to the registry at the time of the scan; it is not a guarantee against every vulnerability.

The audit requires access to the npm registry. A source-only review or a successful test suite does not prove that there are no known dependency vulnerabilities.