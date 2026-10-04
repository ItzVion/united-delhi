# United Delhi — Third-Party Notices

**Last updated:** 4 October 2026

United Delhi uses third-party software, data, maps, and infrastructure. Their licences and terms remain separate from the United Delhi Terms of Service.

## Delhi Open Transit Data

United Delhi uses transit information made available through Delhi Open Transit Data (OTD), operated by the Department of Transport, Government of NCT of Delhi, in association with IIIT-Delhi.

OTD's own Terms & Conditions apply to use of its website/content and should be reviewed before changing how OTD data is copied, transformed, redistributed, or commercialised.

Source: https://otd.delhi.gov.in/

United Delhi is an independent application and does not represent that it is operated, endorsed, or sponsored by OTD, the Department of Transport, GNCTD, DTC, or IIIT-Delhi.

## OpenStreetMap

Map data and standard tiles are provided through OpenStreetMap services.

Attribution shown in the app should remain visible:

**© OpenStreetMap contributors**

OpenStreetMap's standard tile servers have usage requirements covering attribution, identifiable application traffic, caching, and prohibition of bulk/offline tile downloading. United Delhi does not provide an offline tile-download feature.

Source and policy: https://operations.osmfoundation.org/policies/tiles/

## Leaflet

The app uses Leaflet for map rendering in the map WebViews. Leaflet is open-source software distributed under its applicable licence. The project should retain the licence notice associated with the version shipped with the app.

## React Native / Expo and other packages

United Delhi includes open-source packages listed in package.json and server/package.json. Their respective licences apply to those packages.

The repository should retain the package-lock files and package metadata so dependency versions can be audited.

## Hosting and infrastructure

The production backend uses Render for the United Delhi API, Vercel for the web client, and Neon for PostgreSQL data storage. The backend contacts Delhi OTD directly for realtime transit data; there is no separate realtime relay. Their own terms, privacy policies, security practices, and data-processing arrangements apply to their services.

## Design and feature references

United Delhi uses common transit-product interaction patterns and functions that are also present in established Delhi transit apps such as Chartr and One Delhi, including live vehicle maps, route/stop information and journey-planning workflows. This reference does not imply affiliation, endorsement, partnership, licensing, or use of their proprietary code or assets. United Delhi's branding and implementation are maintained independently.

## No government affiliation

Use of government or public transit datasets does not make United Delhi a government application. Government names, marks, logos, and other protected material must not be used in a way that suggests endorsement or affiliation without permission.