// ============================================================================
// AdamBee v2.0 — Background Service Worker
// ============================================================================

chrome.runtime.onInstalled.addListener(() => {
  console.log('[AdamBee] Extension installed successfully.');
  chrome.storage.local.set({
    serverUrl: 'http://localhost:3000',
    authToken: '',
    autoSync: false,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.event === 'PAGE_NAVIGATION_DETECTED') {
    chrome.action.setBadgeText({ text: 'CRM' });
    chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
  }

  if (message.action === 'DISPATCH_TO_SERVER') {
    const { serverUrl, authToken, payload } = message;
    fetch(`${serverUrl.replace(/\/$/, '')}/api/adambee/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then((data) => {
        chrome.action.setBadgeText({ text: '✓' });
        chrome.action.setBadgeBackgroundColor({ color: '#10b981' });
        sendResponse({ ok: true, data });
      })
      .catch((err) => {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
        sendResponse({ ok: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }
});
