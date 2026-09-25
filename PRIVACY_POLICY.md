# United Delhi Privacy Policy

**Effective date:** 25 September 2026  
**Last updated:** 25 September 2026

United Delhi ("United Delhi", "we", "us", or "our") is a Delhi public-transit information application. This Privacy Policy explains what information the app processes, why it is processed, where it is sent, how long it is retained, and how you can make a privacy request.

**Important contact placeholder:** Before public release, replace **[LEGAL CONTACT EMAIL]** below with an email address that you control and actively monitor for privacy and legal requests. Do not publish the placeholder.

## 1. What United Delhi currently collects

United Delhi is designed to work without a user account. We do not currently ask users for their name, phone number, email address, contacts, photos, microphone, camera, advertising identifier, or payment information.

### Location

If you grant foreground location permission, the app can use device location for:
- finding nearby DTC bus stops;
- centering the map around you; and
- Smart Leave, which estimates walking time to a selected stop.

For the **Nearby** stop request, the app sends a reduced-precision location to the United Delhi API so the server can calculate nearby stops. The app does not intentionally store that location in the United Delhi database.

For **Smart Leave**, the current implementation calculates the user's walking distance on the device and does not send the user's current coordinates to the United Delhi API for that calculation.

You can deny or revoke location permission in your device settings. Core route and stop search does not require location permission.

### Search and journey planning

When you search for a route or stop, or ask the journey planner for a trip, the text needed to perform that request is sent to the United Delhi API. We use it only to return transit information and do not intentionally create a user profile from those searches.

### Technical information

The app and its infrastructure necessarily involve ordinary network and security information such as IP addresses, timestamps, request metadata, operating-system/network information, and error information at the hosting, CDN, operating-system, or network layers. Some of this information may be processed by infrastructure providers even when United Delhi does not intentionally store it in its application database.

United Delhi does not currently use advertising SDKs, analytics SDKs, crash-reporting services, or behavioral-tracking SDKs.

## 2. Third-party services

United Delhi currently uses or may rely on:
- **Delhi Open Transit Data (OTD):** transit route, stop and realtime vehicle data. OTD is operated by the Department of Transport, Government of NCT of Delhi, in association with IIIT-Delhi.
- **OpenStreetMap:** map data and standard map tiles. OpenStreetMap's own services have their own policies and may receive network information needed to serve map tiles.
- **Render:** application hosting for the United Delhi API.
- **Neon:** PostgreSQL database hosting for transit data and realtime vehicle-position records.
- **GitHub:** source-code hosting and project infrastructure.

Third-party services are governed by their own terms and privacy policies. United Delhi does not control their independent processing.

## 3. What we do not do

Unless this policy is changed and users are informed as required by applicable law, United Delhi does not:
- sell personal data;
- use location data for advertising;
- use location data to build behavioral profiles;
- use advertising identifiers for tracking;
- run personalized advertising;
- intentionally collect precise location in the background;
- intentionally store a user's personal location history in the transit database;
- use external automated model services to process user data.

## 4. Legal basis and consent

Where consent is required by applicable law, we will request it before the relevant processing. Location permission is controlled by the operating system, and the app explains the purpose before requesting permission.

The Digital Personal Data Protection Act, 2023 (DPDP Act) establishes requirements concerning notice, consent, security safeguards, children's data, correction, erasure and grievance redressal. The DPDP Act and the Digital Personal Data Protection Rules, 2025 have phased commencement dates, so this policy is intended to be maintained as the applicable provisions become effective.

## 5. Children

Until a legally appropriate parental-consent system is implemented, United Delhi is intended for users **18 years of age or older** and does not knowingly seek to process personal data from children.

If you are under 18, do not use the production service. A parent or legal guardian may contact us if they believe a child has provided personal data.

If United Delhi later supports users under 18, the service will be redesigned to address applicable child-data requirements, including legally required parental consent where applicable.

## 6. Retention

United Delhi follows data minimisation.
- Nearby location sent to the API is processed for the requested result and is not intentionally inserted into the transit database.
- Search and journey-planning inputs are not intentionally stored as user profiles.
- Realtime vehicle-position data is operational transit data and may be retained in the backend database for service functionality, debugging, and data-quality purposes.
- Security and infrastructure logs may be retained for periods required by applicable law, security operations, hosting-provider requirements, or incident investigation.
- When personal data is no longer needed for the purpose for which it was collected, we will delete or anonymise it unless retention is required by law.

Because technical logs can be maintained by infrastructure providers, deletion requests may not remove information that a provider must independently retain under law or its own legitimate security obligations.

## 7. Your rights

Subject to applicable law and its commencement, you may have rights including:
- access to information about personal data processed about you;
- correction, completion, or updating of inaccurate data;
- erasure of personal data where legally applicable;
- withdrawal of consent where consent is the processing basis;
- grievance redressal; and
- other rights provided by applicable law.

To make a request, contact **[LEGAL CONTACT EMAIL]** with the subject line **Privacy Request — United Delhi**. We may need reasonable information to verify that a request concerns the person making it and to prevent unauthorized disclosure.

## 8. Security

We use technical and organisational measures intended to protect information, including HTTPS for production API traffic, input validation, rate limiting, access controls, database constraints, Row Level Security, dependency auditing, and security-focused response headers.

No internet service can guarantee absolute security. If a security incident occurs, United Delhi will respond and provide notifications required by applicable law.

Security vulnerabilities should be reported privately. See SECURITY.md.

## 9. International and third-party processing

Infrastructure providers may process technical information in locations outside India depending on their service architecture and applicable contracts. Any such processing remains subject to applicable law and the provider's contractual and privacy obligations.

## 10. Changes

We may update this policy when the app, infrastructure, data practices, or applicable law changes. The effective date at the top will be updated when material changes are made.

## 11. Contact

**Privacy and legal contact:** [LEGAL CONTACT EMAIL]

Please do not send passwords, API keys, database credentials, or other secrets in a privacy request.

## 12. Important legal note

This policy describes the current United Delhi implementation and is not a promise that third-party services will never process technical information. It is not legal advice and does not replace advice from a qualified lawyer. If this project is commercially launched, especially while the operator is a minor, a parent/guardian and qualified Indian lawyer should review the final operator identity, contracts, privacy compliance, and publishing setup before launch.