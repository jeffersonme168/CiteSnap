# Privacy Policy - CiteSnap

**Last updated:** 2026-06-10

## Overview

CiteSnap is a browser extension that extracts search keywords and citation links from AI search engine pages. We are committed to protecting your privacy.

## Data Collection

**CiteSnap does NOT collect, store, transmit, or share any user data.**

Specifically:

- No personal information is collected
- No browsing history is tracked
- No data is sent to any external server
- No analytics or telemetry is implemented
- No cookies are set
- No user accounts are required

## How It Works

- CiteSnap only activates on supported AI search engine pages (Doubao, DeepSeek, Perplexity, Kimi, Metaso)
- All data extraction and processing happens **locally in your browser**
- Extracted data is temporarily stored in browser session storage and is cleared when the tab is closed
- Exported files (CSV/JSON/Markdown) are saved directly to your local device

## Permissions Used

| Permission | Purpose |
|------------|---------|
| `activeTab` | Access the current tab's page content for extraction |
| `storage` | Temporarily cache extraction results within the browser session |

## Host Permissions

CiteSnap requests access to specific AI search engine domains solely to inject content scripts that read the page DOM for citation extraction. No data from these pages is transmitted externally.

## Third-Party Services

CiteSnap does not integrate with or send data to any third-party services.

## Open Source

CiteSnap is fully open source. You can review the complete source code at:
https://github.com/jeffersonme168/CiteSnap

## Changes to This Policy

Any changes to this privacy policy will be posted in the GitHub repository.

## Contact

If you have questions about this privacy policy, please open an issue at:
https://github.com/jeffersonme168/CiteSnap/issues
