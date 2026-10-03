# United Delhi — Legal & Compliance Checklist

**Review date:** 25 September 2026

This file is an internal engineering/compliance checklist. It is not legal advice.

## Current implementation
- No user account.
- No advertising SDK.
- No analytics SDK.
- No crash-reporting SDK.
- No external automated model-processing service.
- Foreground location only.
- Location is requested only for transit features.
- Nearby requests are transient API requests and are not intentionally stored as user location history.
- Production API traffic uses HTTPS.
- Database credentials and the OTD realtime key remain server-side.
- Security controls are documented in SECURITY_AUDIT.md.
- Third-party notices are documented in THIRD_PARTY_NOTICES.md.

## India legal framework reviewed

The project should be maintained with reference to:
1. Digital Personal Data Protection Act, 2023.
2. Digital Personal Data Protection Rules, 2025, including their phased commencement dates.
3. Information Technology Act, 2000 and applicable subordinate rules/directions.
4. CERT-In Cyber Security Directions issued under section 70B of the IT Act, where applicable.
5. Indian Contract Act, 1872 and Majority Act, 1875 for contractual capacity.
6. Consumer Protection Act, 2019, where the Service falls within its scope.
7. Copyright Act, 1957 and applicable trademark/intellectual-property law.
8. Applicable platform rules for Google Play and Apple App Store.
9. Third-party data/service terms, especially Delhi Open Transit Data and OpenStreetMap.

## Privacy controls

Before release:
- publish the Privacy Policy at a stable public HTTPS URL;
- put the same policy URL in the app store listing;
- make the policy accessible inside the app;
- replace [LEGAL CONTACT EMAIL] everywhere;
- provide a monitored privacy/grievance contact;
- keep a process for access, correction, erasure, consent withdrawal, and complaints;
- document retention periods for every personal-data category;
- maintain an incident-response procedure;
- maintain a processor/vendor inventory;
- review cross-border processing by infrastructure vendors;
- verify that the final app-store Data Safety / privacy declarations exactly match the shipped binary.

## Children's data

The current client does not perform age verification. Before public release, the operator must choose and document the intended age audience and align the app, policy, and store disclosures with that decision.

If the service is later opened to users under 18, do not rely on a simple checkbox saying "my parent agrees". Implement a legally appropriate parental-consent mechanism and review the DPDP Act/Rules and app-store child-safety requirements before collecting children's personal data.

## Location

Keep location access:
- foreground only;
- permission-gated;
- feature-specific;
- as low-precision as practical;
- out of permanent user-history storage unless a future feature genuinely requires it and the policy is updated.

## Third-party services

Review the current terms/policies of every provider before release and whenever the provider changes its terms.

For OpenStreetMap standard tiles, comply with attribution, identifiable application traffic, caching, and no-bulk-download requirements.

For Delhi Open Transit Data, comply with its Terms & Conditions and any permissions associated with realtime API access.

## Legal documents

Required before public release:
- PRIVACY_POLICY.md
- TERMS_OF_SERVICE.md
- THIRD_PARTY_NOTICES.md
- SECURITY.md
- a working privacy/legal contact
- an in-app legal entry point
- a stable public HTTPS policy URL

## Operator identity

The public legal documents should identify the actual operator accurately. Do not invent a company, address, GST number, registered office, or legal entity that does not exist.

If the project becomes commercial or processes meaningful personal data, obtain professional legal advice about the operator structure, contracts, tax registrations, consumer obligations, and DPDP compliance.

## Incident response

Maintain:
1. a private security-reporting channel;
2. an incident log;
3. a list of affected data categories;
4. a method for identifying affected users when legally necessary;
5. a breach-notification procedure;
6. a provider escalation list;
7. restoration and credential-rotation procedures.

## Release rule

Do not treat publication of legal documents as a substitute for actual privacy/security controls. The app's implementation, store declarations, vendor settings, and policy text must remain consistent.
