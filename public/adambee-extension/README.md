# AdamBee — AuditEQ Ticket & Screen Compliance Auditor Extension

AdamBee is an autonomous browser extension for compliance officers and supervisors auditing customer support tickets, emails, and CRM screens across Freshdesk, Zendesk, Salesforce, Zoho Desk, and internal enterprise portals.

## Installation in Chrome / Brave / Edge

1. Download or copy the `adambee-extension` folder to your computer.
2. In Google Chrome or Microsoft Edge, navigate to:
   - Chrome/Brave: `chrome://extensions`
   - Edge: `edge://extensions`
3. Turn ON **Developer Mode** (top-right toggle switch).
4. Click **Load unpacked** and select the `adambee-extension` directory.
5. The **AdamBee** extension icon (🐝) will appear in your browser toolbar.

## Connecting to AuditEQ

1. Click on the AdamBee extension icon in your browser toolbar.
2. Enter your AuditEQ Server URL (e.g. `https://your-auditeq-app.run.app` or `http://localhost:3000`).
3. Enter your current AuditEQ session token (found in the AuditEQ Admin or Header menu).
4. Browse to any ticket in your CRM (Freshdesk, Zendesk, Salesforce, Zoho).
5. Click **Harvest Ticket & Ingest to AuditEQ**.
6. The ticket, client ID, risk factors, and conversation content are instantly audited and recorded in your AuditEQ database.
