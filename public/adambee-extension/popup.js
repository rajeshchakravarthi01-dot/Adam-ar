// ============================================================================
// AdamBee v2.0 — Popup Controller
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  const serverUrlInput = document.getElementById('serverUrl');
  const authTokenInput = document.getElementById('authToken');
  const captureBtn = document.getElementById('captureBtn');
  const statusBox = document.getElementById('statusBox');
  const siteProfileBadge = document.getElementById('siteProfileBadge');
  const activeUrlSpan = document.getElementById('activeUrl');
  const activeProfileSpan = document.getElementById('activeProfile');

  // Load saved configurations
  chrome.storage.local.get(['serverUrl', 'authToken'], (res) => {
    if (res.serverUrl) serverUrlInput.value = res.serverUrl;
    if (res.authToken) authTokenInput.value = res.authToken;
  });

  // Query active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.id) {
    activeUrlSpan.textContent = tab.url || 'Unknown';

    chrome.tabs.sendMessage(tab.id, { action: 'PING' }, (response) => {
      if (chrome.runtime.lastError || !response) {
        siteProfileBadge.textContent = 'Generic Web';
        activeProfileSpan.textContent = 'Standard HTML Page';
      } else {
        siteProfileBadge.textContent = response.profile || 'CRM';
        activeProfileSpan.textContent = response.profile || 'CRM';
      }
    });
  }

  // Handle Capture & Send
  captureBtn.addEventListener('click', async () => {
    const serverUrl = serverUrlInput.value.trim();
    const authToken = authTokenInput.value.trim();

    if (!serverUrl) {
      showStatus('Please specify AuditEQ Server URL.', false);
      return;
    }

    // Save to storage
    chrome.storage.local.set({ serverUrl, authToken });

    captureBtn.disabled = true;
    captureBtn.innerHTML = '<span>⏳</span><span>Harvesting DOM & Elements...</span>';

    try {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!currentTab || !currentTab.id) {
        throw new Error('No active browser tab found.');
      }

      chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_TICKET_DATA' }, async (response) => {
        if (chrome.runtime.lastError || !response || !response.ok) {
          showStatus('Failed to read page content. Refresh the target tab and try again.', false);
          resetButton();
          return;
        }

        const ticketData = response.data;
        captureBtn.innerHTML = '<span>🚀</span><span>Dispatching to AuditEQ...</span>';

        chrome.runtime.sendMessage(
          {
            action: 'DISPATCH_TO_SERVER',
            serverUrl,
            authToken,
            payload: ticketData,
          },
          (dispatchRes) => {
            resetButton();
            if (dispatchRes && dispatchRes.ok) {
              showStatus(`✓ Ticket #${ticketData.ticketId} saved to AuditEQ! Risk: ${ticketData.complianceStatus}`, true);
            } else {
              showStatus(`Error: ${dispatchRes?.error || 'Failed to dispatch ticket.'}`, false);
            }
          }
        );
      });
    } catch (err) {
      resetButton();
      showStatus(`Capture error: ${err.message}`, false);
    }
  });

  function showStatus(text, isSuccess) {
    statusBox.textContent = text;
    statusBox.className = 'status-msg ' + (isSuccess ? 'status-success' : 'status-error');
  }

  function resetButton() {
    captureBtn.disabled = false;
    captureBtn.innerHTML = '<span>⚡</span><span>Harvest Ticket & Ingest to AuditEQ</span>';
  }
});
