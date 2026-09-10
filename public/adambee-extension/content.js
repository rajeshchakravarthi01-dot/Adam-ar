// ============================================================================
// AdamBee v2.0 — Autonomous CRM & Screen Compliance Scraper (Content Script)
// ============================================================================

(function () {
  'use strict';

  // Detect Site Profile
  function detectSiteProfile() {
    const host = window.location.hostname.toLowerCase();
    const html = document.documentElement.innerHTML.slice(0, 5000).toLowerCase();

    if (host.includes('freshdesk.com') || document.querySelector('.ticket-details, .helpdesk-ticket, [data-test-id="ticket-header"]')) {
      return 'Freshdesk';
    }
    if (host.includes('zendesk.com') || document.querySelector('[data-test-id="ticket-pane"], .ember-view.ticket-view')) {
      return 'Zendesk';
    }
    if (host.includes('salesforce.com') || host.includes('force.com') || document.querySelector('.slds-card, .forceRecordLayout, [data-record-id]')) {
      return 'Salesforce';
    }
    if (host.includes('zoho.com') || document.querySelector('#ticketView, .case-detail, .zd-ticket')) {
      return 'Zoho Desk';
    }
    if (host.includes('fundsindia.com')) {
      return 'FundsIndia Internal CRM';
    }
    return 'Generic Web / CRM';
  }

  // Extract structured elements based on detected profile
  function extractTicketData() {
    const profile = detectSiteProfile();
    const url = window.location.href;
    const title = document.title || 'Untitled Ticket';
    const bodyText = (document.body ? document.body.innerText : '') || '';

    // Ticket ID detection
    let ticketId = '';
    const urlMatch = url.match(/(?:tickets?|cases?|issues?|calls?|id)[/=_-]([A-Za-z0-9_-]+)/i);
    if (urlMatch) {
      ticketId = urlMatch[1];
    } else {
      const headingMatch = bodyText.match(/(?:Ticket|Case|Incident|Order|Reference)\s*(?:#|ID|No\.?)?\s*[:#-]?\s*([A-Za-z0-9_-]{3,20})/i);
      if (headingMatch) {
        ticketId = headingMatch[1];
      } else {
        ticketId = 'TKT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
      }
    }

    // UCC / Client Code (e.g. 6-10 alphanumeric characters)
    let clientId = '';
    const uccMatch = bodyText.match(/\b(?:UCC|Client(?:\s*Code)?|Account(?:\s*No\.?)?|Cust(?:\s*ID)?)\s*[:#-]?\s*([A-Z0-9]{6,12})\b/i);
    if (uccMatch) {
      clientId = uccMatch[1].toUpperCase();
    } else {
      const generalAlphanumeric = bodyText.match(/\b[A-Z]{3,5}[0-9]{3,6}\b/);
      if (generalAlphanumeric) {
        clientId = generalAlphanumeric[0].toUpperCase();
      }
    }

    // Phone number detection (Indian standard)
    let phoneNumber = '';
    const phoneMatch = bodyText.match(/(?:\+?91|0)?[-\s]?[6-9]\d{4}[-\s]?\d{5}\b/);
    if (phoneMatch) {
      phoneNumber = phoneMatch[0].replace(/[-\s]/g, '');
    }

    // Advisor / Agent Name detection
    let advisorName = '';
    const agentMatch = bodyText.match(/(?:Agent|Advisor|Dealer|Owner|Assigned\s*To|Representative)\s*[:#-]?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/);
    if (agentMatch) {
      advisorName = agentMatch[1];
    }

    // Stock Symbol / Asset Mention
    let tradeSymbol = '';
    const symbolMatch = bodyText.match(/\b(RELIANCE|TCS|INFY|HDFCBANK|ICICIBANK|SBIN|ITC|BHARTIARTL|KOTAKBANK|LT|NIFTY|BANKNIFTY)\b/i);
    if (symbolMatch) {
      tradeSymbol = symbolMatch[1].toUpperCase();
    }

    // Extract relevant snippet paragraphs
    const paragraphs = bodyText
      .split(/\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 25 && p.length < 500);

    const relevantSnippets = paragraphs.slice(0, 8);

    // Initial Risk Assessment heuristics
    let riskScore = 0;
    const findingsList = [];

    const lower = bodyText.toLowerCase();
    if (lower.includes('guaranteed') || lower.includes('100% profit') || lower.includes('sure return') || lower.includes('pakka return')) {
      riskScore += 5;
      findingsList.push('FATAL: Prohibited return promise or performance guarantee detected.');
    }
    if (lower.includes('without consent') || lower.includes('punched without asking') || lower.includes('unauthorized')) {
      riskScore += 4;
      findingsList.push('HIGH RISK: Allegation or mention of unauthorized order placement.');
    }
    if (lower.includes('discretionary') || lower.includes('portfolio handle') || lower.includes('you manage my funds')) {
      riskScore += 3;
      findingsList.push('WARNING: Discretionary trading discussion detected.');
    }

    let complianceStatus = 'COMPLIANT';
    if (riskScore >= 5) {
      complianceStatus = 'FATAL';
    } else if (riskScore >= 3) {
      complianceStatus = 'FLAGGED';
    }

    return {
      id: 'bee_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ticketId,
      sourceUrl: url,
      pageTitle: title,
      siteProfile: profile,
      clientId: clientId || undefined,
      advisorName: advisorName || undefined,
      phoneNumber: phoneNumber || undefined,
      tradeSymbol: tradeSymbol || undefined,
      riskScore,
      complianceStatus,
      rawSnippets: relevantSnippets,
      findings: findingsList.length > 0 ? findingsList.join(' | ') : 'Routine customer correspondence. No severe SEBI violations detected in current page elements.',
      fullContent: bodyText.slice(0, 15000),
      extractedAt: new Date().toISOString(),
    };
  }

  // SPA Mutation Observer for Dynamic Screen Changes
  let lastUrl = window.location.href;
  const observer = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      chrome.runtime?.sendMessage?.({
        event: 'PAGE_NAVIGATION_DETECTED',
        url: lastUrl,
        profile: detectSiteProfile(),
      });
    }
  });

  observer.observe(document, { subtree: true, childList: true });

  // Listen for messages from popup or background script
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (request.action === 'EXTRACT_TICKET_DATA') {
      const data = extractTicketData();
      sendResponse({ ok: true, data });
    } else if (request.action === 'PING') {
      sendResponse({ ok: true, profile: detectSiteProfile(), url: window.location.href });
    }
    return true;
  });
})();
