/**
 * injected.js — runs in the MAIN world (page context) at document_start.
 * Exposes window.getDebugInfoV2, window.getDebugInfoV2Details,
 * and window.installDebugInfoV2Tracker.
 * Network interception is installed automatically on load.
 */
(function (global) {
  'use strict';

  /* ─── utilities ─────────────────────────────────────────────────── */

  function safeParseJSON(str) {
    try { return JSON.parse(str); } catch { return null; }
  }

  /**
   * Recursively search an object tree for a property named `key`.
   * Returns { found: true, value } or { found: false }.
   */
  function deepFind(obj, key, depth) {
    if (depth > 12 || obj === null || typeof obj !== 'object') {
      return { found: false };
    }
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      return { found: true, value: obj[key] };
    }
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length; i++) {
      const res = deepFind(obj[keys[i]], key, depth + 1);
      if (res.found) return res;
    }
    return { found: false };
  }

  /* ─── in-memory cache (populated by network interceptor) ────────── */

  let _cachedValue = null;
  let _cachedSource = 'not-found';

  function storeCache(value, source) {
    _cachedValue = value;
    _cachedSource = source;
  }

  /* ─── storage search ─────────────────────────────────────────────── */

  function searchStorage() {
    const stores = [];
    try { stores.push(global.localStorage); }   catch {}
    try { stores.push(global.sessionStorage); } catch {}

    for (const store of stores) {
      if (!store) continue;
      try {
        // direct key match
        const direct = store.getItem('debugInfoV2');
        if (direct !== null) return direct;

        // search all JSON-valued keys
        for (let i = 0; i < store.length; i++) {
          const k = store.key(i);
          const raw = store.getItem(k);
          const parsed = safeParseJSON(raw);
          if (parsed && typeof parsed === 'object') {
            const res = deepFind(parsed, 'debugInfoV2', 0);
            if (res.found) return res.value;
          }
        }
      } catch {}
    }
    return null;
  }

  /* ─── public API ─────────────────────────────────────────────────── */

  global.getDebugInfoV2 = function () {
    return global.getDebugInfoV2Details().value;
  };

  global.getDebugInfoV2Details = function () {
    // 1. window global
    if (global.debugInfoV2 !== undefined) {
      return { value: global.debugInfoV2, source: 'window-global', found: true };
    }

    // 2. in-memory cache (from network interception)
    if (_cachedValue !== null) {
      return { value: _cachedValue, source: _cachedSource, found: true };
    }

    // 3. localStorage / sessionStorage
    const stored = searchStorage();
    if (stored !== null) {
      return { value: stored, source: 'storage', found: true };
    }

    return { value: null, source: 'not-found', found: false };
  };

  /* ─── network interception ───────────────────────────────────────── */

  global.installDebugInfoV2Tracker = function () {
    // ── fetch interception ──────────────────────────────────────────
    if (typeof global.fetch === 'function') {
      const _origFetch = global.fetch;

      global.fetch = async function (...args) {
        const response = await _origFetch.apply(this, args);
        try {
          let url = '';
          if (typeof args[0] === 'string') {
            url = args[0];
          } else if (args[0] instanceof URL) {
            url = args[0].href;
          } else if (args[0] && typeof args[0].url === 'string') {
            url = args[0].url;
          }

          if (url.includes('receive')) {
            const clone = response.clone();
            clone.text().then(text => {
              const parsed = safeParseJSON(text);
              if (parsed && typeof parsed === 'object') {
                if (deepFind(parsed, 'debugInfoV2', 0).found) storeCache(parsed, 'network-fetch');
              }
            }).catch(() => {});
          }
        } catch {}
        return response;
      };

      // preserve original properties that may be used by page code
      Object.defineProperty(global.fetch, 'name', { value: 'fetch', configurable: true });
    }

    // ── XHR interception ────────────────────────────────────────────
    if (typeof global.XMLHttpRequest === 'function') {
      const _origOpen = XMLHttpRequest.prototype.open;
      const _origSend = XMLHttpRequest.prototype.send;

      XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        try { this._aiseraDebugUrl = String(url || ''); } catch {}
        return _origOpen.apply(this, [method, url, ...rest]);
      };

      XMLHttpRequest.prototype.send = function (...args) {
        if (this._aiseraDebugUrl && this._aiseraDebugUrl.includes('receive')) {
          this.addEventListener('load', () => {
            try {
              const parsed = safeParseJSON(this.responseText);
              if (parsed && typeof parsed === 'object') {
                if (deepFind(parsed, 'debugInfoV2', 0).found) storeCache(parsed, 'network-xhr');
              }
            } catch {}
          });
        }
        return _origSend.apply(this, args);
      };
    }
  };

  /* ─── flow debug extractor ───────────────────────────────────────── */

  global.getFlowDebugDetails = function () {
    try {
      const detailsPanel = document.getElementById('tabpanel-1');
      if (!detailsPanel) return { value: null, found: false };

      const fiberKey = Object.keys(detailsPanel)
        .find(k => k.startsWith('__reactFiber'));
      if (!fiberKey) return { value: null, found: false };

      const queue = [{ fiber: detailsPanel[fiberKey], depth: 0 }];
      while (queue.length > 0) {
        const { fiber, depth } = queue.shift();
        if (!fiber || depth > 15) continue;
        const props = fiber.memoizedProps || {};
        if (
          props.jsonData &&
          props.jsonData.nodes !== undefined &&
          props.jsonData.executionStatus !== undefined
        ) {
          return { value: props.jsonData, found: true };
        }
        if (fiber.child)   queue.push({ fiber: fiber.child,   depth: depth + 1 });
        if (fiber.sibling) queue.push({ fiber: fiber.sibling, depth: depth + 1 });
      }
    } catch {}
    return { value: null, found: false };
  };

  /* ─── auto-install ───────────────────────────────────────────────── */
  global.installDebugInfoV2Tracker();

  /* ─── change watcher — AI Lens debug ─────────────────────────────── */
  // Polls every 2 s and dispatches a DOM custom event when the debug value
  // changes. Content scripts (isolated world) can listen on document for this
  // event — the shared DOM is the standard cross-world communication channel.
  (function startWatcher() {
    let lastStr = null;

    setInterval(() => {
      try {
        const result = global.getDebugInfoV2Details();
        if (!result.found) return;

        let str;
        try { str = JSON.stringify(result.value); } catch { return; }

        if (str !== lastStr) {
          lastStr = str;
          document.dispatchEvent(new CustomEvent('aisera-debug-v2-changed'));
        }
      } catch {}
    }, 2000);
  })();

  /* ─── change watcher — Flow Debug ────────────────────────────────── */
  (function startFlowWatcher() {
    let lastStr = null;

    setInterval(() => {
      try {
        const result = global.getFlowDebugDetails();
        if (!result.found) return;

        let str;
        try { str = JSON.stringify(result.value); } catch { return; }

        if (str !== lastStr) {
          lastStr = str;
          document.dispatchEvent(new CustomEvent('aisera-flow-debug-changed'));
        }
      } catch {}
    }, 2000);
  })();

})(window);
