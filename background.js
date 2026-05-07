'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  if (message.type === 'GET_DEBUG_INFO_V2') {
    if (!tabId) { sendResponse({ ok: false, error: 'No tab ID in sender' }); return false; }

    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          if (typeof window.getDebugInfoV2Details === 'function') {
            return window.getDebugInfoV2Details();
          }
          return { value: null, source: 'not-found', found: false };
        }
      })
      .then(results => {
        const result = results?.[0]?.result ?? { value: null, source: 'not-found', found: false };
        sendResponse({ ok: true, data: result.value, source: result.source, found: result.found });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true;
  }

  if (message.type === 'GET_FLOW_DEBUG') {
    if (!tabId) { sendResponse({ ok: false, error: 'No tab ID in sender' }); return false; }

    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          if (typeof window.getFlowDebugDetails === 'function') {
            return window.getFlowDebugDetails();
          }
          return { value: null, found: false };
        }
      })
      .then(results => {
        const result = results?.[0]?.result ?? { value: null, found: false };
        sendResponse({ ok: true, data: result.value, found: result.found });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true;
  }

  if (message.type === 'GET_NODE_DATA') {
    if (!tabId) { sendResponse({ ok: false, error: 'No tab ID in sender' }); return false; }

    chrome.scripting
      .executeScript({
        target: { tabId },
        world: 'MAIN',
        args: [message.ref, message.label],
        func: (ref, label) => {
          // Try to find node in flow debug data (populated after a debug run)
          try {
            const result = window.getFlowDebugDetails ? window.getFlowDebugDetails() : { found: false };
            if (result.found && result.value && result.value.nodes) {
              function flatten(nodes, out) {
                out = out || [];
                const items = Array.isArray(nodes) ? nodes : Object.values(nodes);
                for (const n of items) {
                  if (n && typeof n === 'object') {
                    out.push(n);
                    if (n.nodes) flatten(n.nodes, out);
                  }
                }
                return out;
              }
              const all = flatten(result.value.nodes);
              // Match by nodeId → ref
              if (ref) {
                const byId = all.find(n => {
                  const id = n.nodeId || n.node_id || n.nodeID;
                  return id !== undefined && String(id) === ref;
                });
                if (byId) return { found: true, data: byId, source: 'flowDebug' };
              }
              // Match by label
              if (label) {
                const byLabel = all.find(n => {
                  const lbl = n.label || n.title || n.displayName || '';
                  return String(lbl).trim() === label;
                });
                if (byLabel) return { found: true, data: byLabel, source: 'flowDebug' };
              }
            }
          } catch {}
          return { found: false };
        }
      })
      .then(results => {
        const result = results?.[0]?.result ?? { found: false };
        sendResponse({ ok: true, found: result.found, data: result.data });
      })
      .catch(err => sendResponse({ ok: false, error: err.message }));

    return true;
  }

  return false;
});
