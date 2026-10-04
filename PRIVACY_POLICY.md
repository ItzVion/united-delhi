# United Delhi Privacy Policy

**Effective date:** 4 October 2026  
**Last updated:** 4 October 2026

United Delhi ("United Delhi", "we", "us", or "our") is a Delhi public-transit information application and website. This Privacy Policy explains what information the current implementation processes, why it is processed, and how you can make a privacy request.

**Privacy and legal contact:** Use **vion4712@gmail.com** for privacy requests.

## 1. What United Delhi currently collects

United Delhi is designed to work without a user account. We do not currently ask users for their name, phone number, email address, contacts, photos, microphone, camera, advertising identifier, or payment information.

### Location

Location is optional.

After the Terms/Privacy consent screen, the client may request foreground location permission to support map centering and nearby DTC stop discovery. When location is allowed, the mobile client sends a reduced-precision latitude/longitude to the United Delhi API so the server can calculate nearby DTC stops. The web client may store the last successful map/location coordinates in your browser's local storage so it can restore the previous map area; this local browser storage is not the United Delhi database.

Core route and stop search does not require location permission.

### Search and journey planning

When you search for a route or stop, or ask the journey planner for a trip, the text needed to perform that request is sent to the United Delhi API. We use it to return transit information and do not intentionally create a user profile from those searches.

### Technical information

The app and its infrastructure necessarily involve ordinary network and security information such as IP addresses, timestamps, request metadata, operating-system/network information, and error information at the hosting, CDN, operating-system, or network layers. Some of this information may be processed by infrastructure providers even when United Delhi does not intentionally store it in its application database.

United Delhi does not currently use advertising SDKs, analytics SDKs, crash-reporting services, or behavioral-tracking SDKs.

## 2. Third-party services

United Delhi currently uses or may rely on:
- **Delhi Open Transit Data (OTD):** transit route, stop and realtime vehicle data.
- **OpenStreetMap:** map data and standard map tiles.
- **Render:** hosting for the United Delhi API.
- **Vercel:** hosting for the web client. The backend contacts Delhi OTD directly; there is no separate realtime relay.
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

## 4. Consent and applicable law

The first-launch screen asks users to review the Terms of Service and Privacy Policy before continuing.

Where consent or another legal basis is required by applicable law, United Delhi will use the legally appropriate basis and safeguards for the relevant processing. Location permission is also controlled by the operating system/browser.

The Digital Personal Data Protection Act, 2023 and the Digital Personal Data Protection Rules, 2025 contain requirements concerning notice, consent, security safeguards, children's data, correction, erasure and grievance redressal, with phased commencement dates. This policy should be updated as applicable provisions become effective and as the implementation changes.

## 5. Children

United Delhi does not require an age-based 18+ gate. The current design minimizes personal-data collection and does not require an account or phone number. The mobile app and website do use a first-launch consent screen that asks the user to review the Terms of Service and Privacy Policy before continuing.

If applicable law requires additional safeguards for children or another category of user, United Delhi will implement those safeguards before relying on the relevant processing. A parent or legal guardian may contact the service regarding a child's personal data.

## 6. Retention

United Delhi follows data minimisation.
- Nearby location sent to the API is processed for the requested result and is not intentionally inserted into the transit database.
- Search and journey-planning inputs are not intentionally stored as user profiles.
- Realtime vehicle-position data is operational transit data and may be retained in the backend database for service functionality, debugging, and data-quality purposes.
- Security and infrastructure logs may be retained for periods required by applicable law, security operations, hosting-provider requirements, or incident investigation.
- When personal data is no longer needed for the purpose for which it was collected, we will delete or anonymise it unless retention is required by law.

Because technical logs can be maintained by infrastructure providers, deletion requests may not remove information that a provider must independently retain under law or legitimate security obligations.

## 7. Your rights

Subject to applicable law and its commencement, you may have rights including:
- access to information about personal data processed about you;
- correction, completion, or updating of inaccurate data;
- erasure of personal data where legally applicable;
- withdrawal of consent where consent is the processing basis;
- grievance redressal; and
- other rights provided by applicable law.

To make a request, contact ****vion4712@gmail.com**** with the subject line **Privacy Request — United Delhi**. We may need reasonable information to verify that a request concerns the person making it and to prevent unauthorized disclosure.

## 8. Security

We use technical and organisational measures intended to protect information, including HTTPS for production API traffic, input validation, rate limiting, access controls, database constraints, Row Level Security, dependency auditing, and security-focused response headers.

No internet service can guarantee absolute security. If a security incident occurs, United Delhi will respond and provide notifications required by applicable law.

Security vulnerabilities should be reported privately. See SECURITY.md.

## 9. International and third-party processing

Infrastructure providers may process technical information in locations outside India depending on their service architecture and applicable contracts. Any such processing remains subject to applicable law and the provider's contractual and privacy obligations.

## 10. Changes

We may update this policy when the app, infrastructure, data practices, or applicable law changes. The effective date at the top will be updated when material changes are made.

## 11. Contact

**Privacy and legal contact:** **vion4712@gmail.com**

Please do not send passwords, API keys, database credentials, or other secrets in a privacy request.

## 12. Important legal note

This policy describes the current United Delhi implementation and is not legal advice. If this project is commercially launched, especially while the operator is a minor, a parent/guardian and qualified Indian lawyer should review the final operator identity, contracts, privacy compliance, and publishing setup before launch.
