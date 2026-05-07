'use strict';

(function () {
  const POSITION_KEY  = 'aisera_debug_btn_pos';
  const SESSION_KEY   = 'aisera_debug_session';
  const FLOW_KEY      = 'aisera_flow_debug_session';
  const SETTINGS_KEY  = 'aisera_debug_settings';
  const TEST_COUNT_KEY = 'aisera_test_count';
  const SIDEBAR_W    = '460px';
  const SIDEBAR_PX   = 460; // numeric, for body margin

  /* ─── sidebar state ─────────────────────────────────────────────── */

  let sidebarFrame   = null;  // the <iframe> element
  let sidebarReady   = false; // true once iframe DOMContentLoaded has fired
  let sidebarVisible = false; // true while sidebar is slid in
  let debugBtn       = null;  // module-level ref so sidebar fns can toggle visibility
  let currentBtnBgColor  = '#24c20f'; // tracks the user's chosen button color for hover handlers
  let currentBtnOpacity  = 0.5;       // tracks the user's chosen button opacity

  function ensureSidebar() {
    if (sidebarFrame) return;

    sidebarFrame = document.createElement('iframe');
    sidebarFrame.id  = 'aisera-debug-sidebar';
    sidebarFrame.src = chrome.runtime.getURL('debugViewer.html');

    Object.assign(sidebarFrame.style, {
      position:        'fixed',
      top:             '0',
      right:           '0',
      width:           SIDEBAR_W,
      height:          '100vh',
      border:          'none',
      zIndex:          '2147483646',
      boxShadow:       '-6px 0 28px rgba(0,0,0,0.18)',
      backgroundColor: '#ffffff',
      transform:       'translateX(100%)',
      transition:      'transform 0.26s cubic-bezier(0.4, 0, 0.2, 1)',
    });

    sidebarFrame.addEventListener('load', () => {
      sidebarReady = true;
      // Tell the panel the current page type so it doesn't rely on potentially stale session storage.
      sidebarFrame.contentWindow.postMessage({ type: 'AISERA_PAGE_TYPE', pageType: getPageType() }, '*');
      // Push current button dims so the Settings tab indicator is populated immediately
      if (debugBtn) {
        const wasHidden = debugBtn.style.display === 'none';
        if (wasHidden) { debugBtn.style.visibility = 'hidden'; debugBtn.style.display = 'flex'; }
        const r = debugBtn.getBoundingClientRect();
        if (wasHidden) { debugBtn.style.display = 'none'; debugBtn.style.visibility = ''; }
        sidebarFrame.contentWindow.postMessage(
          { type: 'AISERA_BTN_DIMS_RESPONSE', width: r.width, height: r.height }, '*'
        );
      }
    });
    document.body.appendChild(sidebarFrame);
  }

  function decodePageHash() {
    try {
      const hash = window.location.hash.slice(1);
      if (!hash) return '';
      return atob(hash);
    } catch { return ''; }
  }

  function isAILensPage() {
    const h = decodePageHash();
    return h.includes('lensViews') || h.includes('klens') || h.includes('klView');
  }

  function isHyperflowDesignerPage() {
    return decodePageHash().includes('hyperflowView');
  }

  function getPageType() {
    if (isAILensPage()) return 'ai-lens';
    if (isHyperflowDesignerPage()) return 'hyperflow-designer';
    return 'workflow-details';
  }

  async function isPushEnabled() {
    if (isAILensPage() || isHyperflowDesignerPage()) return false;
    try {
      const r = await chrome.storage.local.get(SETTINGS_KEY);
      return r[SETTINGS_KEY]?.pushPageContent !== false; // default true
    } catch { return true; }
  }

  const PUSH_STYLE_ID  = 'aisera-debug-push-style';
  const PUSH_EASING    = 'cubic-bezier(0.4, 0, 0.2, 1)';
  const PUSH_DURATION  = '0.26s';

  // Selectors for position:fixed elements that must be shifted via inline JS
  // because their page CSS wins over injected stylesheet rules.
  const FIXED_SELECTORS = ['.webchat-view'];

  // Push a specific fixed element by reading its current computed right value,
  // storing it, and adding SIDEBAR_PX to it.
  function pushFixedEl(el) {
    // Only capture the original once — subsequent calls while already pushed
    // must not overwrite it with the already-shifted value.
    if (el.dataset.aiseraOrigRight === undefined) {
      el.dataset.aiseraOrigRight = parseFloat(window.getComputedStyle(el).right) || 0;
    }
    el.style.setProperty('transition', 'right ' + PUSH_DURATION + ' ' + PUSH_EASING, 'important');
    el.style.setProperty('right', (parseFloat(el.dataset.aiseraOrigRight) + SIDEBAR_PX) + 'px', 'important');
  }

  function restoreFixedEl(el) {
    const orig = el.dataset.aiseraOrigRight;
    el.style.setProperty('transition', 'right ' + PUSH_DURATION + ' ' + PUSH_EASING, 'important');
    el.style.setProperty('right', (orig !== undefined ? orig : '0') + 'px', 'important');
    // Clean up after transition
    setTimeout(() => {
      el.style.removeProperty('right');
      el.style.removeProperty('transition');
      delete el.dataset.aiseraOrigRight;
    }, 280);
  }

  function applyBodyPush(push) {
    // ── html/body push via injected stylesheet ──────────────────────
    let styleEl = document.getElementById(PUSH_STYLE_ID);
    if (push) {
      if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = PUSH_STYLE_ID;
        (document.head || document.documentElement).appendChild(styleEl);
      }
      styleEl.textContent = [
        'html {',
        '  margin-right: ' + SIDEBAR_PX + 'px !important;',
        '  width: calc(100% - ' + SIDEBAR_PX + 'px) !important;',
        '  max-width: calc(100% - ' + SIDEBAR_PX + 'px) !important;',
        '  transition: margin-right ' + PUSH_DURATION + ' ' + PUSH_EASING + ',',
        '              width ' + PUSH_DURATION + ' ' + PUSH_EASING + ',',
        '              max-width ' + PUSH_DURATION + ' ' + PUSH_EASING + ' !important;',
        '  overflow-x: hidden;',
        '}',
        'body { overflow-x: hidden; }',
      ].join('\n');
    } else if (styleEl) {
      styleEl.textContent = [
        'html {',
        '  margin-right: 0 !important;',
        '  width: 100% !important;',
        '  max-width: 100% !important;',
        '  transition: margin-right ' + PUSH_DURATION + ' ' + PUSH_EASING + ',',
        '              width ' + PUSH_DURATION + ' ' + PUSH_EASING + ',',
        '              max-width ' + PUSH_DURATION + ' ' + PUSH_EASING + ' !important;',
        '}',
      ].join('\n');
      setTimeout(() => { if (styleEl.parentNode) styleEl.parentNode.removeChild(styleEl); }, 280);
    }

    // ── directly shift fixed elements whose page CSS beats the stylesheet ──
    FIXED_SELECTORS.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        push ? pushFixedEl(el) : restoreFixedEl(el);
      });
    });
  }

  function showSidebar() {
    sidebarVisible = true;
    if (debugBtn) debugBtn.style.display = 'none';
    isPushEnabled().then(push => {
      // Double rAF gives the browser a chance to paint the off-screen state first
      requestAnimationFrame(() => requestAnimationFrame(() => {
        sidebarFrame.style.transform = 'translateX(0)';
        applyBodyPush(push);
      }));
    });
  }

  function hideSidebar() {
    sidebarVisible = false;
    if (debugBtn) debugBtn.style.display = 'flex';
    sidebarFrame.style.transform = 'translateX(100%)';
    applyBodyPush(false);
  }

  function refreshSidebar() {
    if (!sidebarReady) return; // iframe hasn't loaded yet — it will read storage on load
    sidebarFrame.contentWindow.postMessage({ type: 'AISERA_DEBUG_REFRESH', pageType: getPageType() }, '*');
  }

  // Listen for messages from inside the sidebar iframe
  window.addEventListener('message', e => {
    if (e.data?.type === 'AISERA_SIDEBAR_CLOSE') {
      removeNodeHighlight();
      hideSidebar();
    } else if (e.data?.type === 'AISERA_PUSH_CHANGED' && sidebarVisible) {
      // Setting toggled while panel is open — apply immediately (no-op on AI Lens)
      applyBodyPush(e.data.enabled && !isAILensPage());
    } else if (e.data?.type === 'AISERA_BTN_STYLE_CHANGED') {
      if (debugBtn) applyBtnStyle(e.data.style);
    } else if (e.data?.type === 'AISERA_BTN_DIMS_REQUEST') {
      if (debugBtn && sidebarFrame && sidebarReady) {
        // Button may be hidden while panel is open; reveal it briefly to measure
        const wasHidden = debugBtn.style.display === 'none';
        if (wasHidden) {
          debugBtn.style.visibility = 'hidden';
          debugBtn.style.display    = 'flex';
        }
        const r = debugBtn.getBoundingClientRect();
        if (wasHidden) {
          debugBtn.style.display    = 'none';
          debugBtn.style.visibility = '';
        }
        sidebarFrame.contentWindow.postMessage(
          { type: 'AISERA_BTN_DIMS_RESPONSE', width: r.width, height: r.height }, '*'
        );
      }
    } else if (e.data?.type === 'AISERA_AUTOFILL_CHANGED') {
      if (e.data.enabled) {
        startAutoFillObserver(e.data.email || 'test@test.com', e.data.autoClickOk);
      } else {
        autoClickOkEnabled = false;
        stopAutoFillObserver();
      }
    } else if (e.data?.type === 'AISERA_JSON_POPUP') {
      showJsonOverlay(e.data.label, e.data.data, e.data.sectionType || null);
    } else if (e.data?.type === 'AISERA_NODE_AUG_CHANGED') {
      if (e.data.enabled) startAugmentationObserver();
      else stopAugmentationObserver();
    } else if (e.data?.type === 'AISERA_HIGHLIGHT_NODE') {
      var hlLabel = e.data.label;
      var hlNodeId = e.data.nodeId;
      var isSame  = (hlLabel !== null && hlLabel === highlightedNodeLabel) ||
                    (hlNodeId !== null && hlNodeId === highlightedNodeLabel);
      removeNodeHighlight();
      if (!isSame && (hlLabel || (e.data.candidateIds && e.data.candidateIds.length))) {
        var target = findCanvasNode(hlLabel, hlNodeId, e.data.candidateIds);
        if (target) {
          applyNodeHighlight(target, e.data.color || '#f59e0b');
          target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
          highlightedCanvasNode = target;
        }
        highlightedNodeLabel = hlLabel || hlNodeId;
      }
    } else if (e.data?.type === 'AISERA_NODE_HIGHLIGHT_SETTINGS') {
      // If highlighting was disabled, clear any active highlight
      if (!e.data.enabled) removeNodeHighlight();
    } else if (e.data?.type === 'AISERA_SHORTCUT_CHANGED') {
      toggleShortcut = e.data.shortcutToggle || 'Ctrl+D';
    }
  });

  /* ─── auto-fill test email ──────────────────────────────────────── */

  let autoFillObserver  = null;
  let autoClickOkEnabled = false;

  function findOkButton(form) {
    // Walk up from the form to find the modal/dialog container, then look for
    // an OK/Confirm/Start button. Try progressively wider scopes.
    const candidates = [
      form.closest('[role="dialog"]'),
      form.closest('.modal'),
      form.closest('.dialog'),
      form.parentElement && form.parentElement.parentElement,
    ];
    for (const root of candidates) {
      if (!root) continue;
      const buttons = root.querySelectorAll('button');
      for (const btn of buttons) {
        if (/^(ok|confirm|start|submit)$/i.test(btn.textContent.trim())) return btn;
      }
    }
    // Fallback: search the full document for a visible button with matching text
    for (const btn of document.querySelectorAll('button')) {
      if (/^(ok|confirm|start|submit)$/i.test(btn.textContent.trim())) return btn;
    }
    return null;
  }

  function tryAutoFill(email) {
    const form = document.querySelector('form.fields-container');
    if (!form) return;
    let filled = false;
    form.querySelectorAll('textarea').forEach(textarea => {
      const editorContainer = textarea.closest('.field-editor-container');
      if (!editorContainer) return;
      const labelEl = editorContainer.previousElementSibling;
      if (labelEl && labelEl.textContent.includes('User Email') && textarea.value !== email) {
        textarea.value = email;
        textarea.dispatchEvent(new Event('input',  { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        filled = true;
      }
    });
    if (filled && autoClickOkEnabled) {
      // Small delay so React can process the input events before we click OK
      setTimeout(() => {
        const okBtn = findOkButton(form);
        if (okBtn) okBtn.click();
      }, 600);
    }
  }

  function startAutoFillObserver(email, clickOk) {
    autoClickOkEnabled = !!clickOk;
    stopAutoFillObserver();
    autoFillObserver = new MutationObserver(() => tryAutoFill(email));
    autoFillObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopAutoFillObserver() {
    if (autoFillObserver) {
      autoFillObserver.disconnect();
      autoFillObserver = null;
    }
  }

  function applyBtnStyle(s) {
    if (!debugBtn || !s) return;
    currentBtnBgColor         = s.bgColor   || '#24c20f';
    currentBtnOpacity         = s.opacity   != null ? s.opacity : 0.5;
    debugBtn.style.background = currentBtnBgColor;
    debugBtn.style.color      = s.textColor || '#ffffff';
    debugBtn.style.fontSize   = (s.fontSize || 12) + 'px';
    debugBtn.style.opacity    = String(currentBtnOpacity);
    debugBtn.style.width      = s.width     || '60px';
    debugBtn.style.height     = s.height    || '25px';
  }

  async function initBtnStyle() {
    try {
      const r = await chrome.storage.local.get(SETTINGS_KEY);
      const s = r[SETTINGS_KEY] || {};
      applyBtnStyle({
        bgColor:   s.btnBgColor   || '#24c20f',
        textColor: s.btnTextColor || '#ffffff',
        fontSize:  s.btnFontSize  || 12,
        opacity:   s.btnOpacity   != null ? s.btnOpacity : 0.5,
        width:     s.btnWidth     ? (typeof s.btnWidth  === 'number' ? s.btnWidth  + 'px' : s.btnWidth)  : '60px',
        height:    s.btnHeight    ? (typeof s.btnHeight === 'number' ? s.btnHeight + 'px' : s.btnHeight) : '25px',
      });
    } catch {}
  }

  async function initAutoFill() {
    try {
      const r = await chrome.storage.local.get(SETTINGS_KEY);
      const s = r[SETTINGS_KEY] || {};
      if (s.autoFillEmail !== false) {
        startAutoFillObserver(s.autoFillEmailAddress || 'test@test.com', s.autoClickOk === true);
      }
    } catch {}
  }

  // Auto-refresh: injected.js (MAIN world) dispatches this DOM event whenever
  // getDebugInfoV2Details() returns a new value. Always update storage so the
  // canvas { } buttons and highlights have fresh data; only refresh the sidebar
  // UI when it is actually visible.
  document.addEventListener('aisera-debug-v2-changed', async () => {
    try {
      const res = await sendMessage({ type: 'GET_DEBUG_INFO_V2' });
      const debugData = res?.ok && res?.found ? res.data : null;
      const source    = res?.ok && res?.found ? res.source : 'not-found';

      await chrome.storage.local.set({
        [SESSION_KEY]: { data: debugData, source, pageType: getPageType(), ts: Date.now() }
      });

      if (sidebarVisible) refreshSidebar();
    } catch (err) {}
  });

  // Auto-refresh: flow debug data changed. Always persist to storage so the
  // canvas { } buttons always reflect the latest run, not the previous one.
  document.addEventListener('aisera-flow-debug-changed', async () => {
    try {
      const res = await sendMessage({ type: 'GET_FLOW_DEBUG' });
      const flowData = res?.ok && res?.found ? res.data : null;
      await chrome.storage.local.set({
        [FLOW_KEY]: { data: flowData, ts: Date.now() }
      });
      if (sidebarVisible) refreshSidebar();
    } catch (err) {}
  });

  // When the SPA navigates (hash change), re-evaluate push, page type, and button visibility.
  window.addEventListener('hashchange', () => {
    const pt = getPageType();
    const showBtn = pt === 'ai-lens' || pt === 'workflow-details';
    if (debugBtn && !sidebarVisible) debugBtn.style.display = showBtn ? 'flex' : 'none';
    if (sidebarVisible) {
      if (!showBtn) {
        hideSidebar();
      } else {
        isPushEnabled().then(push => applyBodyPush(push));
        if (sidebarFrame) {
          sidebarFrame.contentWindow.postMessage({ type: 'AISERA_PAGE_TYPE', pageType: pt }, '*');
        }
      }
    }
  });

  /* ─── button creation ───────────────────────────────────────────── */

  function createButton() {
    const btn = document.createElement('button');
    btn.id = 'aisera-debug-btn';
    btn.setAttribute('aria-label', 'Open Aisera Debug Viewer');
    btn.textContent = 'Debug';

    Object.assign(btn.style, {
      position:     'fixed',
      zIndex:       '2147483647',
      background:   '#24c20f',
      color:        '#ffffff',
      border:       'none',
      borderRadius: '6px',
      padding:      '4px 10px',
      fontSize:     '12px',
      opacity:      '0.5',
      width:        '60px',
      height:       '25px',
      fontFamily:   '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontWeight:   '600',
      cursor:       'grab',
      boxShadow:    '0 4px 16px rgba(36,194,15,0.40)',
      userSelect:   'none',
      letterSpacing:'0.02em',
      lineHeight:   '1.4',
      outline:      'none',
      transition:   'background 0.15s, box-shadow 0.15s, transform 0.1s',
      touchAction:  'none',
      boxSizing:    'border-box',
      display:      'flex',
      alignItems:   'center',
      justifyContent: 'center',
      textAlign:    'center',
    });

    return btn;
  }

  /* ─── position helpers ──────────────────────────────────────────── */

  function loadPosition() {
    try {
      const raw = localStorage.getItem(POSITION_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return null;
  }

  function savePosition(x, y) {
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ x, y }));
    } catch {}
  }

  function applyPosition(btn, pos) {
    if (pos && typeof pos.x === 'number') {
      btn.style.left   = Math.max(0, Math.min(pos.x, window.innerWidth  - 120)) + 'px';
      btn.style.top    = Math.max(0, Math.min(pos.y, window.innerHeight -  50)) + 'px';
      btn.style.right  = 'auto';
      btn.style.bottom = 'auto';
    } else {
      btn.style.right = '20px';
      btn.style.top   = '80px';
    }
  }

  /* ─── drag logic ────────────────────────────────────────────────── */

  function makeDraggable(btn) {
    let dragging    = false;
    let hasMoved    = false;
    let startMouseX = 0, startMouseY = 0;
    let startBtnX   = 0, startBtnY   = 0;

    btn.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging  = true;
      hasMoved  = false;
      btn.style.cursor     = 'grabbing';
      btn.style.transition = 'none';
      const rect  = btn.getBoundingClientRect();
      startBtnX   = rect.left;
      startBtnY   = rect.top;
      startMouseX = e.clientX;
      startMouseY = e.clientY;
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startMouseX;
      const dy = e.clientY - startMouseY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) hasMoved = true;

      const newX = Math.max(0, Math.min(startBtnX + dx, window.innerWidth  - btn.offsetWidth));
      const newY = Math.max(0, Math.min(startBtnY + dy, window.innerHeight - btn.offsetHeight));
      btn.style.left   = newX + 'px';
      btn.style.top    = newY + 'px';
      btn.style.right  = 'auto';
      btn.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      btn.style.cursor     = 'grab';
      btn.style.transition = 'background 0.15s, box-shadow 0.15s, transform 0.1s';
      if (hasMoved) {
        const rect = btn.getBoundingClientRect();
        savePosition(rect.left, rect.top);
      }
    });

    return {
      didMove:   () => hasMoved,
      clearMove: () => { hasMoved = false; },
    };
  }

  /* ─── data retrieval ────────────────────────────────────────────── */

  function sendMessage(msg) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage(msg, response => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: 'No response' });
        }
      });
    });
  }

  /* ─── init ──────────────────────────────────────────────────────── */

  /* ─── JSON popup overlay (shown in main page, centered on screen) ── */

  const JSON_OVERLAY_ID = 'aisera-json-overlay';

  function tryUnescapeJson(val) {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if (trimmed[0] !== '{' && trimmed[0] !== '[') return val;
    try { const parsed = JSON.parse(trimmed); if (parsed !== null && typeof parsed === 'object') return parsed; } catch {}
    return val;
  }

  function buildJsonNode(val, depth) {
    val = tryUnescapeJson(val);
    if (val === null)             return mkLeaf('null',           '#a16207');
    if (val === undefined)        return mkLeaf('undefined',      '#9ca3af');
    if (typeof val === 'boolean') return mkLeaf(String(val),      '#c2410c');
    if (typeof val === 'number')  return mkLeaf(String(val),      '#1d4ed8');
    if (typeof val === 'string')  return mkLeaf('"' + val.replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '"', '#166534');
    if (Array.isArray(val))       return mkBranch(val, depth, true);
    if (typeof val === 'object')  return mkBranch(val, depth, false);
    return mkLeaf(String(val), '#374151');
  }

  function mkLeaf(text, color) {
    const s = document.createElement('span');
    s.textContent = text;
    s.style.cssText = 'color:' + color + ';';
    return s;
  }

  function mkBranch(val, depth, isArray) {
    const keys = isArray ? Object.keys(val) : Object.keys(val);
    const open  = isArray ? '[' : '{';
    const close = isArray ? ']' : '}';

    const wrap = document.createElement('span');

    if (keys.length === 0) {
      const empty = document.createElement('span');
      empty.textContent = open + close;
      empty.style.color = '#6b7280';
      wrap.appendChild(empty);
      return wrap;
    }

    let collapsed = depth >= 2;

    const arrow = document.createElement('span');
    arrow.style.cssText = 'cursor:pointer;user-select:none;font-size:9px;color:#9ca3af;display:inline-block;width:14px;transition:transform 0.1s;';

    const openBrack = document.createElement('span');
    openBrack.style.cssText = 'color:#374151;cursor:pointer;';

    const summary = document.createElement('span');
    summary.style.cssText = 'color:#9ca3af;font-size:11px;font-style:italic;';

    const children = document.createElement('div');
    children.style.marginLeft = '18px';

    keys.forEach((key, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:block;';

      const keySpan = document.createElement('span');
      keySpan.style.color = isArray ? '#6366f1' : '#9333ea';
      keySpan.textContent = isArray ? key : ('"' + key + '"');

      const colon = document.createElement('span');
      colon.textContent = ': ';
      colon.style.color = '#374151';

      const valNode = buildJsonNode(val[key], depth + 1);

      const comma = document.createElement('span');
      comma.textContent = i < keys.length - 1 ? ',' : '';
      comma.style.color = '#374151';

      row.append(keySpan, colon, valNode, comma);
      children.appendChild(row);
    });

    const closeLine = document.createElement('div');
    const closeBrack = document.createElement('span');
    closeBrack.textContent = close;
    closeBrack.style.color = '#374151';
    closeLine.appendChild(closeBrack);

    wrap.append(arrow, openBrack, summary, children, closeLine);

    function applyState() {
      if (collapsed) {
        arrow.textContent = '\u25b6';
        openBrack.textContent = open + ' ';
        summary.textContent = isArray ? keys.length + ' items ' : keys.length + ' keys ';
        children.style.display = 'none';
        closeLine.style.display = 'none';
      } else {
        arrow.textContent = '\u25bc';
        openBrack.textContent = open;
        summary.textContent = '';
        children.style.display = '';
        closeLine.style.display = '';
      }
    }
    applyState();

    function toggle(e) { e.stopPropagation(); collapsed = !collapsed; applyState(); }
    arrow.addEventListener('click', toggle);
    openBrack.addEventListener('click', toggle);

    return wrap;
  }

  /**
   * Recursively walk an object/array and parse any string values that are
   * valid JSON, replacing them with the parsed value so the copied output
   * is fully expanded rather than double-encoded.
   */
  function deepParseJsonStrings(val) {
    if (typeof val === 'string') {
      const t = val.trim();
      if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
        try { return deepParseJsonStrings(JSON.parse(t)); } catch {}
      }
      return val;
    }
    if (Array.isArray(val)) return val.map(deepParseJsonStrings);
    if (val !== null && typeof val === 'object') {
      const out = {};
      for (const k of Object.keys(val)) out[k] = deepParseJsonStrings(val[k]);
      return out;
    }
    return val;
  }

  function fallbackCopy(text, onDone) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); if (onDone) onDone(); } catch {}
    ta.remove();
  }

  /* ─── Shared node table builder ─────────────────────────────────── */

  /**
   * Builds a compact node table for workflowExecutionDetail / executedFunction panels.
   * Rows with an `error` field get a red left border and inline error text.
   * Returns the table element ready to append.
   */
  function buildNodesTable(nodes) {
    const nodeTable = document.createElement('div');
    nodeTable.style.cssText = 'border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;margin-bottom:4px;';

    const nhead = document.createElement('div');
    nhead.style.cssText = 'display:flex;gap:8px;background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:3px 8px;';
    [['#', '24px'], ['Type', '110px'], ['Label', '1'], ['Time', '50px']].forEach(([col, w]) => {
      const th = document.createElement('span');
      th.style.cssText = 'font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;' +
        (w === '1' ? 'flex:1;' : 'flex:0 0 ' + w + ';');
      th.textContent = col;
      nhead.appendChild(th);
    });
    nodeTable.appendChild(nhead);

    nodes.forEach((n, idx) => {
      const execMs   = n.executionTime ? (n.executionTime * 1000).toFixed(0) + 'ms' : '—';
      const nodeLabel = n.label || '';
      const outKeys  = n.output ? Object.keys(n.output) : [];
      const nodeError = (n.error && String(n.error).trim()) ? String(n.error) : null;
      const isErr    = !!nodeError;

      const wrap = document.createElement('div');
      const baseRowBg = idx % 2 === 1 ? 'background:#f9fafb;' : '';
      wrap.style.cssText = baseRowBg +
        (isErr ? 'border-left:3px solid #ef4444;' : '') +
        (idx < nodes.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '');

      const tr = document.createElement('div');
      const hasExpandable = outKeys.length > 0 || isErr;
      tr.style.cssText = 'display:flex;gap:8px;padding:4px 8px;align-items:baseline;' +
        (isErr ? 'background:#fff5f5;' : '') +
        'cursor:' + (hasExpandable ? 'pointer' : 'default') + ';';

      const idxEl = document.createElement('span');
      idxEl.style.cssText = 'flex:0 0 24px;font-size:10px;color:' + (isErr ? '#ef4444' : '#9ca3af') + ';font-weight:' + (isErr ? '700' : '400') + ';';
      idxEl.textContent = idx + 1;

      const typeEl = document.createElement('span');
      typeEl.style.cssText = 'flex:0 0 110px;font-size:11px;color:#374151;font-weight:500;';
      typeEl.textContent = n.type || '—';

      const labelEl = document.createElement('span');
      labelEl.style.cssText = 'flex:1;font-size:11px;color:' + (isErr ? '#b91c1c' : '#6b7280') + ';' + (isErr ? 'font-weight:600;' : '');
      labelEl.textContent = nodeLabel;

      const timeEl = document.createElement('span');
      timeEl.style.cssText = 'flex:0 0 50px;font-size:10px;color:#9ca3af;text-align:right;';
      timeEl.textContent = execMs;

      tr.append(idxEl, typeEl, labelEl, timeEl);
      wrap.appendChild(tr);

      // Expandable detail area: error text + output keys
      if (hasExpandable) {
        const outDiv = document.createElement('div');
        outDiv.style.cssText = 'display:none;padding:3px 8px 6px ' + (isErr ? '11px' : '40px') + ';background:inherit;';

        // Error row (always first if present)
        if (isErr) {
          const errRow = document.createElement('div');
          errRow.style.cssText = 'font-size:11px;color:#b91c1c;padding:3px 0 4px;font-family:Consolas,Monaco,monospace;word-break:break-word;white-space:pre-wrap;border-bottom:' + (outKeys.length ? '1px solid #fee2e2' : 'none') + ';margin-bottom:' + (outKeys.length ? '4px' : '0') + ';';
          const ERRMAXLEN = 400;
          errRow.textContent = nodeError.length > ERRMAXLEN ? nodeError.slice(0, ERRMAXLEN) + '…' : nodeError;
          if (nodeError.length > ERRMAXLEN) {
            let expErr = false;
            const togErr = document.createElement('span');
            togErr.style.cssText = 'cursor:pointer;color:#ef4444;font-size:10px;margin-left:4px;user-select:none;';
            togErr.textContent = 'show more';
            togErr.addEventListener('click', e => {
              e.stopPropagation();
              expErr = !expErr;
              errRow.textContent = expErr ? nodeError : nodeError.slice(0, ERRMAXLEN) + '…';
              errRow.appendChild(togErr);
              togErr.textContent = expErr ? 'show less' : 'show more';
            });
            errRow.appendChild(togErr);
          }
          outDiv.appendChild(errRow);
        }

        // Output key rows
        outKeys.forEach(k => {
          const v = n.output[k];
          const outRow = document.createElement('div');
          outRow.style.cssText = 'display:flex;gap:8px;font-size:11px;padding:1px 0;';
          const kEl = document.createElement('span');
          kEl.style.cssText = 'flex:0 0 100px;color:#9ca3af;';
          kEl.textContent = k;
          const vEl = document.createElement('span');
          vEl.style.cssText = 'flex:1;color:#374151;font-family:Consolas,Monaco,monospace;word-break:break-word;white-space:pre-wrap;';
          const vs = typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v);
          const PREVIEW = 120;
          vEl.textContent = vs.length > PREVIEW ? vs.slice(0, PREVIEW) + '…' : vs;
          if (vs.length > PREVIEW) {
            let exp = false;
            const tog = document.createElement('span');
            tog.style.cssText = 'cursor:pointer;color:#4f46e5;font-size:10px;margin-left:4px;user-select:none;';
            tog.textContent = 'show more';
            tog.addEventListener('click', e => { e.stopPropagation(); exp = !exp; vEl.textContent = exp ? vs : vs.slice(0, PREVIEW) + '…'; vEl.appendChild(tog); tog.textContent = exp ? 'show less' : 'show more'; });
            vEl.appendChild(tog);
          }
          outRow.append(kEl, vEl);
          outDiv.appendChild(outRow);
        });

        let open = false;
        tr.addEventListener('click', () => {
          open = !open;
          outDiv.style.display = open ? 'block' : 'none';
          timeEl.textContent = open ? '▲' : execMs;
        });

        // Auto-expand error rows so the error is immediately visible
        if (isErr) {
          open = true;
          outDiv.style.display = 'block';
          timeEl.textContent = '▲';
        }

        wrap.appendChild(outDiv);
      }

      nodeTable.appendChild(wrap);
    });

    return nodeTable;
  }

  /* ─── Flow Debug Summary (Diagnostics tab) ──────────────────────── */

  function buildFlowDebugSummary(sectionType, data) {
    const root = document.createElement('div');
    root.style.cssText = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;line-height:1.6;color:#111827;';

    function section(title) {
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #e5e7eb;';
      h.textContent = title;
      root.appendChild(h);
    }

    function row(label, value, opts) {
      if (value === undefined || value === null || value === '') return;
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;gap:10px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:flex-start;';
      const lEl = document.createElement('span');
      lEl.style.cssText = 'flex:0 0 190px;color:#6b7280;font-size:11px;padding-top:1px;';
      lEl.textContent = label;
      const vEl = document.createElement('span');
      vEl.style.cssText = 'flex:1;font-weight:600;word-break:break-word;' + (opts && opts.color ? 'color:' + opts.color + ';' : 'color:#111827;');
      if (opts && opts.pre) {
        vEl.style.fontFamily = 'Consolas,Monaco,monospace';
        vEl.style.fontWeight = '400';
        vEl.style.whiteSpace = 'pre-wrap';
      }
      vEl.textContent = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
      d.append(lEl, vEl);
      root.appendChild(d);
    }

    function statusColor(s) {
      if (!s) return null;
      const l = s.toLowerCase();
      if (l === 'finished' || l === 'success' || l === 'completed') return '#059669';
      if (l === 'failed' || l === 'error') return '#dc2626';
      return '#d97706';
    }

    function pill(text, color, bg) {
      const s = document.createElement('span');
      s.style.cssText = `display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;background:${bg};color:${color};margin-right:4px;`;
      s.textContent = text;
      return s;
    }

    // Render a structured result object: each key on its own row with a label
    // Render any value (primitive, object, or array) into container using
    // section-head + row layout. depth controls left indent for nesting.
    function renderValue(container, val, depth) {
      depth = depth || 0;
      const indent = depth * 12;

      // Expand JSON strings into structured data
      if (typeof val === 'string') val = tryUnescapeJson(val);

      if (val === null || val === undefined) {
        const el = document.createElement('span');
        el.style.cssText = 'font-size:11px;color:#9ca3af;font-style:italic;';
        el.textContent = 'null';
        container.appendChild(el);
        return;
      }

      if (Array.isArray(val)) {
        if (val.length === 0) {
          const el = document.createElement('span');
          el.style.cssText = 'font-size:11px;color:#9ca3af;';
          el.textContent = '[ ]';
          container.appendChild(el);
          return;
        }
        val.forEach((item, idx) => {
          // Shaded card per item
          const card = document.createElement('div');
          card.style.cssText = 'margin-top:6px;border-radius:6px;border:1px solid #e5e7eb;overflow:hidden;';

          // Item index header bar
          const idxEl = document.createElement('div');
          idxEl.style.cssText = 'font-size:10px;font-weight:700;letter-spacing:.05em;color:#6b7280;' +
            'background:#f3f4f6;border-bottom:1px solid #e5e7eb;padding:3px 8px;';
          idxEl.textContent = '[' + idx + ']';
          card.appendChild(idxEl);

          const itemBody = document.createElement('div');
          itemBody.style.cssText = 'padding:4px 8px;background:' + (idx % 2 === 0 ? '#ffffff' : '#fafafa') + ';';

          if (typeof item === 'object' && item !== null) {
            renderValue(itemBody, item, 0);
          } else {
            const el = document.createElement('div');
            el.style.cssText = 'font-size:11px;color:#111827;word-break:break-word;white-space:pre-wrap;';
            el.textContent = String(item);
            itemBody.appendChild(el);
          }
          card.appendChild(itemBody);
          container.appendChild(card);
        });
        return;
      }

      if (typeof val === 'object') {
        Object.entries(val).forEach(([k, v]) => {
          if (typeof v === 'object' && v !== null) {
            // Key as sub-section head
            const headEl = document.createElement('div');
            headEl.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;' +
              'margin-top:6px;margin-bottom:2px;padding-left:' + indent + 'px;';
            headEl.textContent = k;
            container.appendChild(headEl);
            renderValue(container, v, depth + 1);
          } else {
            // Primitive: key + value on same row
            const r = document.createElement('div');
            r.style.cssText = 'display:flex;gap:8px;padding:2px 0;align-items:flex-start;padding-left:' + indent + 'px;';
            const kEl = document.createElement('span');
            kEl.style.cssText = 'flex:0 0 120px;color:#6b7280;font-size:11px;padding-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
            kEl.textContent = k;
            kEl.title = k;
            const vEl = document.createElement('span');
            vEl.style.cssText = 'flex:1;font-size:11px;font-weight:500;color:#111827;word-break:break-word;overflow-wrap:anywhere;';
            if (v === null) { vEl.style.color = '#9ca3af'; vEl.style.fontStyle = 'italic'; vEl.textContent = 'null'; }
            else if (typeof v === 'boolean') { vEl.style.color = v ? '#2e7d32' : '#c62828'; vEl.textContent = String(v); }
            else if (typeof v === 'number') { vEl.style.color = '#1565c0'; vEl.textContent = String(v); }
            else { vEl.textContent = String(v); }
            r.append(kEl, vEl);
            container.appendChild(r);
          }
        });
        return;
      }

      // Plain primitive
      const el = document.createElement('div');
      el.style.cssText = 'font-size:11px;color:#111827;padding-left:' + indent + 'px;word-break:break-word;white-space:pre-wrap;';
      if (typeof val === 'boolean') { el.style.color = val ? '#2e7d32' : '#c62828'; }
      else if (typeof val === 'number') { el.style.color = '#1565c0'; }
      el.textContent = String(val);
      container.appendChild(el);
    }

    function renderResultObject(container, parsed) {
      renderValue(container, parsed, 0);
    }

    // Render executed functions section into a container element
    function renderExecutedFunctions(container, fns) {
      if (!fns.length) return;
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #e5e7eb;';
      h.textContent = 'Executed Functions (' + fns.length + ')';
      container.appendChild(h);

      fns.forEach((fn, i) => {
        const wd = fn.workflowExecutionDetail || {};
        const nodes = Array.isArray(wd.nodes) ? (Array.isArray(wd.nodes[0]) ? wd.nodes[0] : wd.nodes) : [];

        // Header row: index, name, id pill, status pill
        const fnHeader = document.createElement('div');
        fnHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:6px 0 3px;flex-wrap:wrap;';
        const idx = document.createElement('span');
        idx.style.cssText = 'color:#6b7280;font-size:11px;flex:0 0 auto;';
        idx.textContent = '[' + i + ']';
        fnHeader.appendChild(idx);
        const nameEl = document.createElement('span');
        nameEl.style.cssText = 'font-weight:700;color:#1e40af;font-size:12px;';
        nameEl.textContent = fn.functionName || ('Function ' + (i + 1));
        fnHeader.appendChild(nameEl);
        if (fn.functionId !== undefined) fnHeader.appendChild(pill('id:' + fn.functionId, '#374151', '#f3f4f6'));
        if (wd.executionStatus) fnHeader.appendChild(pill(wd.executionStatus, '#fff', statusColor(wd.executionStatus) || '#6b7280'));
        container.appendChild(fnHeader);

        // Error
        if (fn.error && String(fn.error).trim()) {
          const errEl = document.createElement('div');
          errEl.style.cssText = 'color:#dc2626;font-size:11px;padding:2px 0 4px 28px;';
          errEl.textContent = '⚠ ' + fn.error;
          container.appendChild(errEl);
        }

        // inputParams — structured rows if non-empty object
        if (fn.inputParams && typeof fn.inputParams === 'object' && Object.keys(fn.inputParams).length > 0) {
          const ipHead = document.createElement('div');
          ipHead.style.cssText = 'color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:3px 0 1px 28px;';
          ipHead.textContent = 'Input';
          container.appendChild(ipHead);
          renderResultObject(container, fn.inputParams);
        }

        // result — parse JSON if possible, render as structured rows
        const resultStr = fn.result !== undefined && fn.result !== null ? String(fn.result) : '';
        if (resultStr) {
          const resHead = document.createElement('div');
          resHead.style.cssText = 'color:#6b7280;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;padding:3px 0 1px 28px;';
          resHead.textContent = 'Result';
          container.appendChild(resHead);
          let parsed;
          try { parsed = JSON.parse(resultStr); } catch { parsed = resultStr; }
          // Special rendering for service catalog item results
          if (parsed && typeof parsed === 'object' && Array.isArray(parsed.items) && parsed.items.length > 0) {
            const table = document.createElement('div');
            table.style.cssText = 'margin:2px 0 4px 28px;border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;';
            const thead = document.createElement('div');
            thead.style.cssText = 'display:flex;background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:3px 8px;';
            ['Name', 'sys_id'].forEach(col => {
              const th = document.createElement('span');
              th.style.cssText = 'flex:1;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;';
              th.textContent = col;
              thead.appendChild(th);
            });
            table.appendChild(thead);
            parsed.items.forEach((item, idx) => {
              const row = document.createElement('div');
              row.style.cssText = 'display:flex;padding:4px 8px;align-items:baseline;' +
                (idx % 2 === 1 ? 'background:#f9fafb;' : '') +
                (idx < parsed.items.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '');
              const nameEl = document.createElement('span');
              nameEl.style.cssText = 'flex:1;font-size:11px;color:#111827;font-weight:500;';
              nameEl.textContent = item.name || '—';
              const idEl = document.createElement('span');
              idEl.style.cssText = 'flex:1;font-size:10px;color:#6b7280;font-family:Consolas,Monaco,monospace;';
              idEl.textContent = item.sys_id || '—';
              row.append(nameEl, idEl);
              table.appendChild(row);
            });
            container.appendChild(table);
          } else {
            renderResultObject(container, parsed);
          }
        }

        // Node count footer
        const nodeCountEl = document.createElement('div');
        nodeCountEl.style.cssText = 'color:#9ca3af;font-size:10px;padding:2px 0 8px 28px;';
        nodeCountEl.textContent = nodes.length + ' node' + (nodes.length === 1 ? '' : 's') + ' executed';
        container.appendChild(nodeCountEl);
      });
    }

    // Render LLM calls section into a container element
    function renderLlmCalls(container, llm) {
      if (!llm.length) return;
      const h = document.createElement('div');
      h.style.cssText = 'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin:16px 0 6px;padding-bottom:3px;border-bottom:1px solid #e5e7eb;';
      h.textContent = 'LLM Calls (' + llm.length + ')';
      container.appendChild(h);

      llm.forEach((call, i) => {
        const resp = call.response || {};
        const finish = resp.finishReason || '';
        const tok = resp.tokenUsage || {};

        const callHeader = document.createElement('div');
        callHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 0 2px;flex-wrap:wrap;';
        const idxEl = document.createElement('span');
        idxEl.style.cssText = 'color:#6b7280;font-size:11px;';
        idxEl.textContent = '[' + i + ']';
        callHeader.appendChild(idxEl);
        if (finish) callHeader.appendChild(pill(finish, finish === 'STOP' ? '#166534' : '#6b7280', finish === 'STOP' ? '#dcfce7' : '#f3f4f6'));
        if (call.latency !== undefined) callHeader.appendChild(pill(call.latency + 'ms', '#6b7280', '#f3f4f6'));
        if (tok.totalTokenCount !== undefined) {
          callHeader.appendChild(pill((tok.inputTokenCount || 0) + '→' + (tok.outputTokenCount || 0) + ' tok', '#6b7280', '#f3f4f6'));
        }
        container.appendChild(callHeader);

        // Tools called
        const msgs = call.messages || [];
        const toolCalls = [];
        msgs.forEach(msg => {
          (msg.toolExecutionRequests || msg.toolCalls || []).forEach(t => {
            toolCalls.push(t.name || (t.function && t.function.name) || '?');
          });
        });
        if (toolCalls.length) {
          const tcEl = document.createElement('div');
          tcEl.style.cssText = 'padding:1px 0 3px 28px;color:#6b7280;font-size:11px;';
          tcEl.textContent = 'Tools called: ' + toolCalls.join(', ');
          container.appendChild(tcEl);
        }

        // Tool result messages (non-INJECTED text messages after the first system prompt)
        let seenSystem = false;
        msgs.forEach(msg => {
          if (typeof msg.text !== 'string') return;
          if (msg.text.includes('INJECTED_USER_FACING_MESSAGE')) return; // handled separately
          if (!seenSystem) { seenSystem = true; return; } // skip system prompt
          const text = msg.text.trim();
          if (!text) return;
          const PREVIEW = 120;
          const needsExpand = text.length > PREVIEW;
          const trEl = document.createElement('div');
          trEl.style.cssText = 'padding:2px 0 3px 28px;font-size:11px;color:#374151;font-family:Consolas,Monaco,monospace;word-break:break-word;';
          const prefix = document.createElement('span');
          prefix.style.cssText = 'color:#9ca3af;margin-right:4px;';
          prefix.textContent = '← tool result:';
          trEl.appendChild(prefix);
          const textSpan = document.createElement('span');
          textSpan.textContent = needsExpand ? text.slice(0, PREVIEW) + '…' : text;
          trEl.appendChild(textSpan);
          if (needsExpand) {
            let expanded = false;
            const toggle = document.createElement('span');
            toggle.style.cssText = 'cursor:pointer;color:#4f46e5;font-size:10px;margin-left:6px;user-select:none;';
            toggle.textContent = 'show more';
            toggle.addEventListener('click', () => {
              expanded = !expanded;
              textSpan.textContent = expanded ? text : text.slice(0, PREVIEW) + '…';
              toggle.textContent = expanded ? 'show less' : 'show more';
            });
            trEl.appendChild(toggle);
          }
          container.appendChild(trEl);
        });

        // Injected user-facing message — truncated and collapsible
        const lastMsgs = msgs.slice().reverse();
        for (const msg of lastMsgs) {
          if (typeof msg.text === 'string' && msg.text.includes('INJECTED_USER_FACING_MESSAGE')) {
            const injectedText = msg.text.replace(/^\[INJECTED_USER_FACING_MESSAGE[^\]]*\]\s*/i, '').trim();
            const PREVIEW = 160;
            const needsExpand = injectedText.length > PREVIEW;

            const injEl = document.createElement('div');
            injEl.style.cssText = 'padding:4px 8px 5px 28px;margin:3px 0 4px;background:#f8fafc;border-left:2px solid #94a3b8;font-size:11px;color:#334155;border-radius:0 4px 4px 0;';
            const injLabel = document.createElement('span');
            injLabel.style.cssText = 'font-weight:700;display:block;margin-bottom:2px;color:#475569;';
            injLabel.textContent = 'Response to user:';
            injEl.appendChild(injLabel);

            const textSpan = document.createElement('span');
            textSpan.style.cssText = 'white-space:pre-wrap;word-break:break-word;';
            textSpan.textContent = needsExpand ? injectedText.slice(0, PREVIEW) + '…' : injectedText;
            injEl.appendChild(textSpan);

            if (needsExpand) {
              let expanded = false;
              const toggle = document.createElement('span');
              toggle.style.cssText = 'cursor:pointer;color:#64748b;font-size:10px;font-weight:600;margin-left:6px;user-select:none;display:block;margin-top:2px;';
              toggle.textContent = 'show more';
              toggle.addEventListener('click', () => {
                expanded = !expanded;
                textSpan.textContent = expanded ? injectedText : injectedText.slice(0, PREVIEW) + '…';
                toggle.textContent = expanded ? 'show less' : 'show more';
              });
              injEl.appendChild(toggle);
            }

            container.appendChild(injEl);
            break;
          }
        }
      });
    }

    if (sectionType === 'debugInfoV2') {
      const d2   = data;
      const ai   = d2.ai   || {};
      const conv = d2.conversation || {};
      const fdi  = d2.flowDebugInfo || {};
      const hf   = fdi.hyperFlowExecutionDetail || {};

      // ── Request ───────────────────────────────────────────────────
      section('Request');
      row('Request',            d2.request);
      row('Translated Request', d2.translatedRequest !== d2.request ? d2.translatedRequest : undefined);
      row('Trace ID',           d2.traceId, { pre: true });
      row('Info Only',          d2.infoOnly !== undefined ? String(d2.infoOnly) : undefined);

      // ── Routing ───────────────────────────────────────────────────
      section('Routing');
      // Latency breakdown
      const lat = conv.latencyInMS || {};
      if (Object.keys(lat).length > 0) {
        Object.entries(lat).forEach(([k, v]) => row(k === 'total' ? 'Total Latency' : k + ' latency', v + 'ms'));
      }
      // Handler
      const handlers = Object.entries(conv.handlerInfo || {});
      handlers.forEach(([name, info]) => {
        const latVal = info && info.latency !== undefined ? ' (' + info.latency + 'ms)' : '';
        row('Handler', name + latVal);
      });
      // NLU pipelines
      const pipelines = ai.executedNluPipelines;
      if (Array.isArray(pipelines) && pipelines.length > 0) row('NLU Pipelines', pipelines.join(', '));
      // AI flags — only show enabled ones
      const flagLabels = {
        isActionableAmbiguousClassifierEnabled: 'Actionable Ambiguous Classifier',
        isCasualGibberishClassifierEnabled:     'Casual/Gibberish Classifier',
        isIntentsExtractorEnabled:              'Intents Extractor',
      };
      Object.entries(flagLabels).forEach(([k, label]) => {
        if (ai[k] !== undefined) row(label, ai[k] ? 'enabled' : 'disabled', { color: ai[k] ? '#059669' : '#9ca3af' });
      });

      // ── Flow ──────────────────────────────────────────────────────
      const flowName = fdi.name || fdi.flowName;
      if (flowName || fdi.status) {
        section('Flow');
        row('Flow Name',   flowName);
        row('Status',      fdi.status, { color: statusColor(fdi.status) });
        row('Execution ID', fdi.flowExecutionId);
        const fns = hf.executedFunctions || [];
        if (fns.length > 0) {
          row('Functions Run', fns.map(f => f.functionName || '?').join(', '));
        }
        const llmCalls = hf.llmCalls || [];
        if (llmCalls.length > 0) row('LLM Calls', llmCalls.length);
      }

      // ── Search Results ────────────────────────────────────────────
      const searchAnswers  = (d2.searchInfo  || {}).answers  || [];
      const neuralAnswers  = (d2.neuralSearchInfo || {}).answers || [];
      const neuralErrors   = (d2.neuralSearchInfo || {}).errorMessages || [];
      if (searchAnswers.length > 0 || neuralAnswers.length > 0 || neuralErrors.length > 0) {
        section('Search');
        if (searchAnswers.length  > 0) row('KB Search Answers',     searchAnswers.length);
        if (neuralAnswers.length  > 0) row('Neural Search Answers', neuralAnswers.length);
        if (neuralErrors.length   > 0) row('Neural Search Errors',  neuralErrors.join('; '), { color: '#dc2626' });
      }

      // ── LLM Info ──────────────────────────────────────────────────
      const llmInfoArr = Array.isArray(ai.llmInfo) ? ai.llmInfo : (ai.llmInfo ? [ai.llmInfo] : []);
      if (llmInfoArr.length > 0) {
        section('LLM Info');
        llmInfoArr.forEach((entry, i) => {
          const ip = entry.inputParams || {};
          if (ip.BotName)  row('Bot Name',  ip.BotName);
          if (ip.Domain)   row('Domain',    ip.Domain);
          if (ip.tenantId) row('Tenant',    ip.tenantId);
          const otherInfos = entry.otherInfos || {};
          if (otherInfos.modelName) row('Model', otherInfos.modelName + (otherInfos.modelVersion ? ' ' + otherInfos.modelVersion : ''));
          if (llmInfoArr.length > 1 && i < llmInfoArr.length - 1) {
            const sep = document.createElement('div');
            sep.style.cssText = 'border-top:1px solid #f3f4f6;margin:4px 0;';
            root.appendChild(sep);
          }
        });
      }

    } else if (sectionType === 'flowDebugInfo') {
      const hf = data.hyperFlowExecutionDetail || {};

      section('Flow Identity');
      row('Flow Name', data.name || data.flowName);
      row('Flow Definition ID', data.flowDefinitionId);
      row('Flow Execution ID', data.flowExecutionId);
      row('Status', data.status, { color: statusColor(data.status) });

      section('Agent');
      row('Agent Name', hf.name);
      if (hf.modelInfo) {
        row('Model', (hf.modelInfo.modelName || '') + ' ' + (hf.modelInfo.modelVersion || ''));
        row('Provider', hf.modelInfo.modelProvider);
        row('Temperature', hf.modelInfo.temperature);
        row('Max Output Tokens', hf.modelInfo.maxOutputTokens);
      }

      section('Injection Detection');
      row('Result', hf.injectionDetectionResult !== undefined ? String(hf.injectionDetectionResult) : undefined,
        { color: hf.injectionDetectionResult ? '#dc2626' : '#059669' });
      row('Reasoning', hf.injectionDetectionReasoning);

      renderExecutedFunctions(root, hf.executedFunctions || []);
      renderLlmCalls(root, hf.llmCalls || []);

      row('Output Variables', data.outputVariables && Object.keys(data.outputVariables).length ? data.outputVariables : undefined);

      const err = hf.error;
      if (Array.isArray(err) ? err.some(e => e && e !== '[]') : (err && String(err).trim() && err !== '[]')) {
        section('Errors');
        row('hyperFlowExecutionDetail.error', err, { color: '#dc2626' });
      }

    } else if (sectionType === 'hyperFlowExecutionDetail') {
      const hf = data;

      section('Agent');
      row('Agent Name', hf.name);
      if (hf.modelInfo) {
        row('Model', (hf.modelInfo.modelName || '') + ' ' + (hf.modelInfo.modelVersion || ''));
        row('Provider', hf.modelInfo.modelProvider);
        row('Temperature', hf.modelInfo.temperature);
        row('Top P', hf.modelInfo.topP);
        row('Max Output Tokens', hf.modelInfo.maxOutputTokens);
        row('Context Window', hf.modelInfo.contextWindowLength);
        row('Base URI', hf.modelInfo.baseURI);
      }

      section('Injection Detection');
      row('Result', hf.injectionDetectionResult !== undefined ? String(hf.injectionDetectionResult) : undefined,
        { color: hf.injectionDetectionResult ? '#dc2626' : '#059669' });
      row('Reasoning', hf.injectionDetectionReasoning);

      renderExecutedFunctions(root, hf.executedFunctions || []);
      renderLlmCalls(root, hf.llmCalls || []);

      const err = hf.error;
      if (Array.isArray(err) ? err.some(e => e && e !== '[]') : (err && String(err).trim() && err !== '[]')) {
        section('Errors');
        row('error', err, { color: '#dc2626' });
      }

    } else if (sectionType === 'workflowExecutionDetail') {
      const wd = data;
      const nodes_raw = wd.nodes || [];
      const nodes = Array.isArray(nodes_raw[0]) ? nodes_raw[0] : nodes_raw;
      const attrs = wd.attributes || {};
      const hasErr = Array.isArray(wd.error) ? wd.error.some(e => e && e !== '[]') : (wd.error && String(wd.error).trim() && wd.error !== '[]');

      section('Execution');
      row('Status', wd.executionStatus, { color: statusColor(wd.executionStatus) });
      row('Nodes executed', nodes.length || '0');
      if (hasErr) row('Error', wd.error, { color: '#dc2626' });

      // Key outcome attributes
      const outcomePairs = [
        ['success',  attrs.success],
        ['keyword',  attrs.keyword],
        ['output',   attrs.output],
      ].filter(([, v]) => v !== undefined && v !== null && v !== '');
      if (outcomePairs.length) {
        section('Outcome');
        outcomePairs.forEach(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
      }

      // Catalog items table (same pattern as subflow__get_sc_items)
      if (Array.isArray(attrs.items) && attrs.items.length > 0) {
        section('Catalog Items (' + attrs.items.length + ')');
        const table = document.createElement('div');
        table.style.cssText = 'border:1px solid #e5e7eb;border-radius:5px;overflow:hidden;margin-bottom:4px;';
        const thead = document.createElement('div');
        thead.style.cssText = 'display:flex;background:#f9fafb;border-bottom:1px solid #e5e7eb;padding:3px 8px;';
        ['Name', 'sys_id'].forEach(col => {
          const th = document.createElement('span');
          th.style.cssText = 'flex:1;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;';
          th.textContent = col;
          thead.appendChild(th);
        });
        table.appendChild(thead);
        attrs.items.forEach((item, idx) => {
          const tr = document.createElement('div');
          tr.style.cssText = 'display:flex;padding:4px 8px;align-items:baseline;' +
            (idx % 2 === 1 ? 'background:#f9fafb;' : '') +
            (idx < attrs.items.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : '');
          const nameEl = document.createElement('span');
          nameEl.style.cssText = 'flex:1;font-size:11px;color:#111827;font-weight:500;';
          nameEl.textContent = item.name || '—';
          const idEl = document.createElement('span');
          idEl.style.cssText = 'flex:1;font-size:10px;color:#6b7280;font-family:Consolas,Monaco,monospace;';
          idEl.textContent = item.sys_id || '—';
          tr.append(nameEl, idEl);
          table.appendChild(tr);
        });
        root.appendChild(table);
      }

      // Session vars
      if (attrs.sessionVars && typeof attrs.sessionVars === 'object' && Object.keys(attrs.sessionVars).length > 0) {
        section('Session Variables');
        Object.entries(attrs.sessionVars).forEach(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
      }

      // Nodes table
      if (nodes.length > 0) {
        section('Nodes (' + nodes.length + ')');
        root.appendChild(buildNodesTable(nodes));
      }

    } else if (sectionType === 'convAiV2') {
      const cav = data;
      const di  = cav.debug_info || {};

      // ── Decision Engine ───────────────────────────────────────────
      const de = di.decision_engine || {};
      const deEntries = Object.entries(de);
      if (deEntries.length > 0) {
        section('Decision Engine');
        deEntries.forEach(([query, results]) => {
          const qEl = document.createElement('div');
          qEl.style.cssText = 'font-size:11px;font-weight:600;color:#374151;padding:4px 0 2px;border-bottom:1px solid #f3f4f6;';
          qEl.textContent = '\u201c' + query + '\u201d';
          root.appendChild(qEl);
          (Array.isArray(results) ? results : [results]).forEach(res => {
            const decisionColor = res.decision === 'FLOW' ? '#166534' : res.decision === 'KB' ? '#1e40af' : '#6b7280';
            const decisionBg    = res.decision === 'FLOW' ? '#dcfce7' : res.decision === 'KB' ? '#dbeafe' : '#f3f4f6';
            const resRow = document.createElement('div');
            resRow.style.cssText = 'display:flex;align-items:center;gap:8px;padding:3px 0 3px 12px;flex-wrap:wrap;';
            resRow.appendChild(pill(res.decision || '?', decisionColor, decisionBg));
            if (res.num_chunks !== undefined) resRow.appendChild(pill(res.num_chunks + ' chunks', '#6b7280', '#f3f4f6'));
            if (Array.isArray(res.doc_titles) && res.doc_titles.length > 0) {
              const titles = document.createElement('span');
              titles.style.cssText = 'font-size:11px;color:#374151;';
              titles.textContent = res.doc_titles.join(', ');
              resRow.appendChild(titles);
            }
            root.appendChild(resRow);
          });
        });
      }

      // ── Validity Check ────────────────────────────────────────────
      const vc = di.validity_check || {};
      const vcGroups = [
        { key: 'validated_full_flow_search_intentless', label: 'Validated — Full Match (Flow)',    validBadge: 'full',    color: '#166534', bg: '#dcfce7' },
        { key: 'validated_partial_flow_search_intentless', label: 'Validated — Partial Match (Flow)', validBadge: 'partial', color: '#92400e', bg: '#fef9c3' },
        { key: 'validated_full_neural_search',          label: 'Validated — Full Match (Neural)',  validBadge: 'full',    color: '#166534', bg: '#dcfce7' },
        { key: 'validated_partial_neural_search',       label: 'Validated — Partial (Neural)',     validBadge: 'partial', color: '#92400e', bg: '#fef9c3' },
        { key: 'non_validated_flow_search_intentless',  label: 'Not Validated (Flow)',             validBadge: null,      color: '#6b7280', bg: '#f3f4f6' },
        { key: 'non_validated_neural_search',           label: 'Not Validated (Neural)',           validBadge: null,      color: '#6b7280', bg: '#f3f4f6' },
      ];

      const hasVcData = vcGroups.some(g => Array.isArray(vc[g.key]) && vc[g.key].length > 0);
      if (hasVcData) {
        section('Validity Check');
        vcGroups.forEach(({ key, label, color, bg }) => {
          const items = vc[key];
          if (!Array.isArray(items) || items.length === 0) return;

          const groupHead = document.createElement('div');
          groupHead.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#9ca3af;padding:6px 0 3px;';
          groupHead.textContent = label + ' (' + items.length + ')';
          root.appendChild(groupHead);

          items.forEach(item => {
            const card = document.createElement('div');
            card.style.cssText = 'border:1px solid #e5e7eb;border-radius:5px;margin-bottom:5px;overflow:hidden;';

            // Card header — name + score + valid badge
            const cardHead = document.createElement('div');
            cardHead.style.cssText = 'display:flex;align-items:center;gap:6px;padding:5px 8px;background:#f9fafb;cursor:pointer;flex-wrap:wrap;';
            const nameSpan = document.createElement('span');
            nameSpan.style.cssText = 'flex:1;font-size:12px;font-weight:600;color:#111827;';
            nameSpan.textContent = item.name || item.object_id || '?';
            cardHead.appendChild(nameSpan);
            if (item.score !== undefined) {
              cardHead.appendChild(pill((item.score * 100).toFixed(1) + '%', '#6b7280', '#f3f4f6'));
            }
            if (item.valid) cardHead.appendChild(pill(item.valid, color, bg));
            if (item.origin_type) cardHead.appendChild(pill(item.origin_type, '#6b7280', '#f3f4f6'));
            card.appendChild(cardHead);

            // Expandable body
            const cardBody = document.createElement('div');
            cardBody.style.cssText = 'display:none;padding:6px 10px;border-top:1px solid #e5e7eb;';

            if (item.validation_explanation) {
              const expEl = document.createElement('div');
              expEl.style.cssText = 'font-size:11px;color:#374151;margin-bottom:4px;line-height:1.5;';
              expEl.textContent = item.validation_explanation;
              cardBody.appendChild(expEl);
            }
            if (item.content) {
              const PREVIEW = 160;
              const contentText = item.content.trim();
              const contentEl = document.createElement('div');
              contentEl.style.cssText = 'font-size:10px;color:#6b7280;white-space:pre-wrap;word-break:break-word;border-top:1px solid #f3f4f6;padding-top:4px;margin-top:4px;';
              contentEl.textContent = contentText.length > PREVIEW ? contentText.slice(0, PREVIEW) + '…' : contentText;
              if (contentText.length > PREVIEW) {
                let exp = false;
                const tog = document.createElement('span');
                tog.style.cssText = 'cursor:pointer;color:#4f46e5;font-size:10px;margin-left:4px;user-select:none;';
                tog.textContent = 'show more';
                tog.addEventListener('click', e => {
                  e.stopPropagation();
                  exp = !exp;
                  contentEl.textContent = exp ? contentText : contentText.slice(0, PREVIEW) + '…';
                  contentEl.appendChild(tog);
                  tog.textContent = exp ? 'show less' : 'show more';
                });
                contentEl.appendChild(tog);
              }
              cardBody.appendChild(contentEl);
            }
            card.appendChild(cardBody);

            let open = false;
            cardHead.addEventListener('click', () => {
              open = !open;
              cardBody.style.display = open ? 'block' : 'none';
            });

            root.appendChild(card);
          });
        });
      }

    } else if (sectionType === 'executedFunction') {
      const fn    = data;
      const name  = fn.functionName || label;
      const fnId  = fn.functionId;
      const error = (fn.error && String(fn.error).trim()) ? String(fn.error) : null;
      const input = fn.inputParams;
      const wd    = fn.workflowExecutionDetail || {};
      const attrs = wd.attributes || {};
      const nodes_raw = wd.nodes || [];
      const nodes = Array.isArray(nodes_raw[0]) ? nodes_raw[0] : nodes_raw;

      // Find deepest node-level error for the Summary callout
      function findFirstNodeError(nodeArr) {
        for (const n of nodeArr) {
          if (n.error && String(n.error).trim()) return { label: n.label || n.type || 'node', error: String(n.error) };
          if (Array.isArray(n.nodes)) {
            const inner = Array.isArray(n.nodes[0]) ? n.nodes[0] : n.nodes;
            const found = findFirstNodeError(inner);
            if (found) return found;
          }
        }
        return null;
      }
      const firstNodeError = nodes.length > 0 ? findFirstNodeError(nodes) : null;

      // ── Summary ──────────────────────────────────────────────────────
      section('Summary');
      row('Function', name);
      if (fnId !== undefined && fnId !== null) row('Function ID', fnId);
      if (wd.executionStatus) row('Status', wd.executionStatus, { color: statusColor(wd.executionStatus) });
      if (error) row('Error', error, { color: '#dc2626' });
      if (firstNodeError && (!error || firstNodeError.error !== error)) {
        row('Failing node', firstNodeError.label + ': ' + firstNodeError.error, { color: '#dc2626' });
      }

      // ── Input ─────────────────────────────────────────────────────────
      if (input && typeof input === 'object' && Object.keys(input).length > 0) {
        section('Input');
        Object.entries(input).forEach(([k, v]) => {
          const vs = typeof v === 'object' ? JSON.stringify(v) : String(v);
          row(k, vs);
        });
      }

      // ── Result ────────────────────────────────────────────────────────
      const resultVal = fn.result !== undefined ? fn.result : null;
      if (resultVal !== null && resultVal !== undefined) {
        section('Result');
        let parsed = resultVal;
        if (typeof resultVal === 'string') {
          try { parsed = JSON.parse(resultVal); } catch { parsed = resultVal; }
        }
        if (parsed !== null && typeof parsed === 'object') {
          renderResultObject(root, parsed);
        } else {
          row('result', String(resultVal));
        }
      }

      // ── Key Outcome Attributes ────────────────────────────────────────
      const outcomeKeys = ['success', 'keyword', 'output', 'datetime'];
      const outcomePairs = outcomeKeys
        .map(k => [k, attrs[k]])
        .filter(([, v]) => v !== undefined && v !== null && v !== '');
      if (outcomePairs.length > 0) {
        section('Outcome');
        outcomePairs.forEach(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
      }

      // ── Session Variables ─────────────────────────────────────────────
      if (attrs.sessionVars && typeof attrs.sessionVars === 'object' && Object.keys(attrs.sessionVars).length > 0) {
        section('Session Variables');
        Object.entries(attrs.sessionVars).forEach(([k, v]) => row(k, typeof v === 'object' ? JSON.stringify(v) : String(v)));
      }

      // ── Nodes ─────────────────────────────────────────────────────────
      if (nodes.length > 0) {
        section('Nodes (' + nodes.length + ')');
        root.appendChild(buildNodesTable(nodes));
      }

    } else if (sectionType === 'node') {
      const node   = data;
      const type   = (node.type || node.nodeType || node.kind || '');
      const cleanType = String(type).replace(/^'+|'+$/g, '');
      const status = node.status || node.executionStatus || node.state || '';
      const nodeId = node.nodeId || node.node_id || node.nodeID || '';
      const execTime = node.executionTime || node.execution_time || node.executionTimeMs;
      const error  = node.error || node.exception || node.errorMessage || node.errMsg || node.fault;

      function statusColor(s) {
        if (!s) return null;
        const l = String(s).toLowerCase().replace(/[\s_-]/g, '');
        if (/^(completed|success|succeeded|finished|passed|done|ok|true)$/.test(l)) return '#059669';
        if (/^(failed|failure|error|exception|fault|ko|ng|false)$/.test(l))  return '#dc2626';
        return '#d97706';
      }

      // ── Summary ──────────────────────────────────────────────────────
      section('Summary');
      if (cleanType) row('Type', cleanType);
      if (status)    row('Status', status, { color: statusColor(status) });
      if (nodeId)    row('Node ID', nodeId, { pre: true });
      if (execTime !== undefined && execTime !== null) row('Execution Time', execTime);
      if (error && String(error).trim()) row('Error', error, { color: '#dc2626' });

      // ── Action name (Action nodes) ────────────────────────────────────
      if (node.actionName) {
        section('Action');
        row('Action', node.actionName);
      }

      // ── Input ─────────────────────────────────────────────────────────
      function renderKV(k, v) {
        const unescaped = tryUnescapeJson(v);
        if (typeof unescaped === 'object' && unescaped !== null) {
          const head = document.createElement('div');
          head.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;margin-top:6px;margin-bottom:2px;';
          head.textContent = k;
          root.appendChild(head);
          renderValue(root, unescaped, 1);
        } else {
          row(k, v);
        }
      }

      const inputObj = node.input || node.inputs;
      if (inputObj && typeof inputObj === 'object' && !Array.isArray(inputObj) && Object.keys(inputObj).length > 0) {
        section('Input');
        Object.entries(inputObj).forEach(([k, v]) => renderKV(k, v));
      }

      // ── Output ────────────────────────────────────────────────────────
      const outputObj = node.output;
      if (outputObj && typeof outputObj === 'object' && !Array.isArray(outputObj) && Object.keys(outputObj).length > 0) {
        section('Output');
        Object.entries(outputObj).forEach(([k, v]) => renderKV(k, v));
      }

      // ── Conditions (Switch nodes) ─────────────────────────────────────
      if (Array.isArray(node.conditions) && node.conditions.length > 0) {
        section('Conditions');
        node.conditions.forEach((cond) => {
          const expr = cond.expression || cond.condition || cond.expr || JSON.stringify(cond);
          const matched = cond.matched === true || cond.isMatched === true;
          const d = document.createElement('div');
          d.style.cssText = 'display:flex;gap:10px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:flex-start;';
          const lEl = document.createElement('span');
          lEl.style.cssText = 'flex:1;font-size:11px;color:#374151;word-break:break-word;';
          lEl.textContent = String(expr);
          const badge = document.createElement('span');
          badge.style.cssText = 'flex:0 0 auto;font-size:10px;font-weight:600;padding:1px 8px;border-radius:10px;' +
            (matched ? 'background:#dcfce7;color:#15803d;' : 'background:#f1f5f9;color:#6b7280;');
          badge.textContent = matched ? 'matched' : 'no';
          d.append(lEl, badge);
          root.appendChild(d);
        });
      }

      // ── Subflow child nodes ───────────────────────────────────────────
      if (node.nodes) {
        const inner = Array.isArray(node.nodes[0]) ? node.nodes[0] : node.nodes;
        if (Array.isArray(inner) && inner.length > 0) {
          section('Nodes (' + inner.length + ')');
          root.appendChild(buildNodesTable(inner));
        }
      }

    } else if (sectionType === 'aiLensSummary') {
      const di   = data;
      const ai   = di.ai   || {};
      const conv = di.conversation || {};
      const fdi  = di.flowDebugInfo || {};
      const hfed = fdi.hyperFlowExecutionDetail || {};

      // ── Request ───────────────────────────────────────────────────────
      section('Request');
      row('Request', di.request);
      if (di.translatedRequest && di.translatedRequest !== di.request) row('Translated', di.translatedRequest);

      // ── Flow Execution ────────────────────────────────────────────────
      const flowName = fdi.name || fdi.flowName || '';
      if (flowName || fdi.status || fdi.flowExecutionId != null) {
        section('Flow Execution');
        if (flowName) row('Agent / Flow', flowName);
        if (fdi.flowExecutionId != null) row('Execution ID', fdi.flowExecutionId, { pre: true });
        if (fdi.status) row('Status', fdi.status, { color: statusColor(fdi.status) });
      }

      // ── Functions Called ──────────────────────────────────────────────
      const funcs = Array.isArray(hfed.executedFunctions) ? hfed.executedFunctions : [];
      if (funcs.length > 0) {
        section('Functions Called (' + funcs.length + ')');
        funcs.forEach(fn => {
          const hasErr = fn.error && String(fn.error).trim();
          const fnRow = document.createElement('div');
          fnRow.style.cssText = 'display:flex;gap:10px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:flex-start;';
          const kEl = document.createElement('span');
          kEl.style.cssText = 'flex:0 0 190px;font-size:11px;font-weight:600;color:' + (hasErr ? '#dc2626' : '#1e40af') + ';padding-top:1px;';
          kEl.textContent = fn.functionName || '?';
          const vEl = document.createElement('span');
          vEl.style.cssText = 'flex:1;font-size:11px;word-break:break-word;color:' + (hasErr ? '#dc2626' : '#6b7280') + ';';
          vEl.textContent = hasErr ? String(fn.error).slice(0, 200) : '';
          fnRow.append(kEl, vEl);
          root.appendChild(fnRow);
        });
      }

      // ── Pipeline ──────────────────────────────────────────────────────
      const executed = ai.executedNluPipelines;
      const selected = ai.policySelectedPipelines;
      if ((executed && executed.length) || (selected && selected.length)) {
        section('Pipeline');
        if (executed && executed.length) row('Executed', executed.join(', '));
        if (selected && selected.length) {
          const mismatch = JSON.stringify(executed) !== JSON.stringify(selected);
          row('Configured', selected.join(', ') + (mismatch ? ' ⚠' : ''), mismatch ? { color: '#b45309' } : {});
        }
      }

      // ── Handler ───────────────────────────────────────────────────────
      const handlers = Object.entries(conv.handlerInfo || {});
      if (handlers.length > 0) {
        section('Handler');
        handlers.forEach(([hName, hVal]) => {
          const latency = hVal && typeof hVal === 'object' ? hVal.latency : null;
          row(hName, latency != null ? latency + ' ms' : '');
        });
      }

      // ── Injection Detection ───────────────────────────────────────────
      if (hfed.injectionDetectionResult === true) {
        section('Security');
        row('Injection Detected', 'YES', { color: '#dc2626' });
        if (hfed.injectionDetectionReasoning) row('Reasoning', hfed.injectionDetectionReasoning);
      }

      // ── Model ─────────────────────────────────────────────────────────
      const mi = hfed.modelInfo;
      if (mi && typeof mi === 'object' && Object.keys(mi).length > 0) {
        section('Model');
        if (mi.modelProvider) row('Provider', mi.modelProvider);
        const modelStr = [mi.modelName, mi.modelVersion].filter(Boolean).join(' ');
        if (modelStr) row('Model', modelStr);
        if (mi.temperature != null) row('Temperature', mi.temperature);
      }

      // ── LLM Usage ─────────────────────────────────────────────────────
      const llmCalls = Array.isArray(hfed.llmCalls) ? hfed.llmCalls : [];
      if (llmCalls.length > 0) {
        let totalPrompt = 0, totalCompletion = 0, totalLatency = 0;
        llmCalls.forEach(c => {
          const tu = c.response && c.response.tokenUsage;
          if (tu) { totalPrompt += tu.inputTokenCount || 0; totalCompletion += tu.outputTokenCount || 0; }
          totalLatency += c.latency || 0;
        });
        section('LLM Usage (' + llmCalls.length + ' calls)');
        row('Total Latency', totalLatency + ' ms');
        if (totalPrompt || totalCompletion) row('Tokens In / Out', totalPrompt + ' / ' + totalCompletion);
      }

      // ── Latency ───────────────────────────────────────────────────────
      const lat = conv.latencyInMS;
      if (lat && typeof lat === 'object') {
        section('Latency');
        if (lat.total != null) row('Total', lat.total + ' ms');
        Object.entries(lat).forEach(([k, v]) => { if (k !== 'total') row(k, v + ' ms'); });
      }

      // ── Decision Engine ───────────────────────────────────────────────
      const de = (((di.ai || {}).convAiV2 || {}).debug_info || {}).decision_engine;
      if (de && typeof de === 'object') {
        section('Decision Engine');
        Object.entries(de).forEach(([query, decisions]) => {
          if (!Array.isArray(decisions) || decisions.length === 0) return;
          decisions.forEach(d => {
            const decisionColor = d.decision === 'FLOW' ? '#166534' : d.decision === 'KB' ? '#1e40af' : '#6b7280';
            const decisionBg    = d.decision === 'FLOW' ? '#dcfce7' : d.decision === 'KB' ? '#dbeafe' : '#f3f4f6';
            const dRow = document.createElement('div');
            dRow.style.cssText = 'display:flex;gap:8px;padding:3px 0;border-bottom:1px solid #f3f4f6;align-items:center;flex-wrap:wrap;';
            dRow.appendChild(pill(d.decision || '?', decisionColor, decisionBg));
            const docs = Array.isArray(d.doc_titles) && d.doc_titles.length ? d.doc_titles.join(', ') : query;
            const docEl = document.createElement('span');
            docEl.style.cssText = 'flex:1;font-size:11px;color:#374151;word-break:break-word;';
            docEl.textContent = docs;
            dRow.appendChild(docEl);
            root.appendChild(dRow);
          });
        });
      }

      // ── Warnings ──────────────────────────────────────────────────────
      const warnings = (((di.ai || {}).convAiV2 || {}).warnings);
      if (warnings && typeof warnings === 'object' && Object.keys(warnings).length > 0) {
        section('Warnings');
        Object.entries(warnings).forEach(([category, msgs]) => {
          if (!msgs || typeof msgs !== 'object') return;
          Object.entries(msgs).forEach(([wKey, wMsg]) => {
            row(category + ' / ' + wKey, String(wMsg).slice(0, 300), { color: '#b45309' });
          });
        });
      }

      // ── IDs ───────────────────────────────────────────────────────────
      if (di.traceId || di.sessionId != null) {
        section('IDs');
        if (di.traceId) row('Trace ID', di.traceId, { pre: true });
        if (di.sessionId != null) row('Session ID', di.sessionId, { pre: true });
      }

    } else if (sectionType === 'workflowSummary') {
      const fd = data;
      const execStatus = fd.executionStatus || fd.status || null;
      const flowName   = fd.flowName || fd.name || ((fd.attributes || {}).name) || '';
      const flowExecId = fd.flowExecutionId || null;
      const defId      = fd.flowDefinitionId || null;

      // ── Execution ─────────────────────────────────────────────────────
      section('Execution');
      if (flowName) row('Flow', flowName);
      if (execStatus) row('Status', execStatus, { color: statusColor(execStatus) });
      if (flowExecId != null) row('Execution ID', flowExecId, { pre: true });
      if (defId) row('Definition ID', defId, { pre: true });

      // ── Nodes ─────────────────────────────────────────────────────────
      const nodes_raw = fd.nodes || [];
      const nodes = (nodes_raw.length > 0 && Array.isArray(nodes_raw[0])) ? nodes_raw[0] : nodes_raw;
      if (nodes.length > 0) {
        const failed = nodes.filter(n => {
          const err = n.error || n.exception || n.errorMessage;
          return err && String(err).trim();
        });
        section('Nodes');
        row('Total', nodes.length);
        if (failed.length > 0) row('Failed', failed.length, { color: '#dc2626' });

        if (failed.length > 0) {
          section('Errors');
          failed.forEach(n => {
            const name = n.label || n.name || n.type || 'Node';
            const err  = n.error || n.exception || n.errorMessage || '';
            const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
            row(name, errStr.slice(0, 300), { color: '#dc2626' });
          });
        }

        section('Nodes (' + nodes.length + ')');
        root.appendChild(buildNodesTable(nodes));
      }

      // ── Output Variables ──────────────────────────────────────────────
      const outputVars = fd.outputVariables;
      if (outputVars && typeof outputVars === 'object') {
        const hasContent = Object.values(outputVars).some(v =>
          v && typeof v === 'object' ? Object.keys(v).length > 0 : (v != null && v !== '')
        );
        if (hasContent) {
          section('Output Variables');
          Object.entries(outputVars).forEach(([k, v]) => {
            row(k, typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v), { pre: typeof v === 'object' });
          });
        }
      }
    }

    return root;
  }

  function showJsonOverlay(label, data, sectionType) {
    const existing = document.getElementById(JSON_OVERLAY_ID);
    if (existing) existing.remove();

    // backdrop
    const backdrop = document.createElement('div');
    backdrop.id = JSON_OVERLAY_ID;
    backdrop.style.cssText = [
      'position:fixed;inset:0;z-index:2147483647;',
      'background:rgba(0,0,0,0.5);',
      'display:flex;align-items:center;justify-content:center;',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;',
    ].join('');

    // modal panel
    const modal = document.createElement('div');
    modal.style.cssText = [
      'background:#fff;border-radius:10px;',
      'box-shadow:0 8px 48px rgba(0,0,0,0.32);',
      'width:70vw;max-width:920px;max-height:82vh;',
      'display:flex;flex-direction:column;overflow:hidden;',
    ].join('');

    // header
    const header = document.createElement('div');
    header.style.cssText = [
      'display:flex;align-items:center;gap:10px;',
      'padding:12px 18px;border-bottom:1px solid #e5e7eb;flex-shrink:0;',
    ].join('');

    const titleEl = document.createElement('span');
    titleEl.textContent = label;
    titleEl.style.cssText = 'flex:1;font-size:13px;font-weight:600;color:#111827;font-family:Consolas,Monaco,monospace;';

    const copyBtn = document.createElement('button');
    copyBtn.textContent = 'Copy JSON';
    copyBtn.style.cssText = [
      'border:1px solid #d1d5db;background:#f9fafb;cursor:pointer;',
      'padding:3px 10px;font-size:11px;font-weight:600;color:#374151;',
      'border-radius:5px;transition:background 0.12s,color 0.12s;',
    ].join('');
    copyBtn.addEventListener('mouseenter', () => { copyBtn.style.background = '#f3f4f6'; copyBtn.style.color = '#111827'; });
    copyBtn.addEventListener('mouseleave', () => { copyBtn.style.background = '#f9fafb'; copyBtn.style.color = '#374151'; });
    copyBtn.addEventListener('click', () => {
      const jsonStr = JSON.stringify(deepParseJsonStrings(data), null, 2);
      const done = () => {
        const orig = copyBtn.textContent;
        copyBtn.textContent = 'Copied!';
        copyBtn.style.color = '#059669';
        setTimeout(() => { copyBtn.textContent = orig; copyBtn.style.color = '#374151'; }, 1500);
      };
      fallbackCopy(jsonStr, done);
    });

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = [
      'border:none;background:none;cursor:pointer;padding:2px 8px;',
      'font-size:20px;line-height:1;color:#6b7280;border-radius:4px;',
    ].join('');

    header.append(titleEl, copyBtn, closeBtn);

    const hasTabs = sectionType === 'debugInfoV2' || sectionType === 'flowDebugInfo' || sectionType === 'hyperFlowExecutionDetail' || sectionType === 'workflowExecutionDetail' || sectionType === 'convAiV2' || sectionType === 'executedFunction' || sectionType === 'node' || sectionType === 'aiLensSummary' || sectionType === 'workflowSummary';

    // tab bar (only when tabs are needed)
    let summaryBody, rawBody;

    if (hasTabs) {
      const tabBar = document.createElement('div');
      tabBar.style.cssText = [
        'display:flex;gap:0;flex-shrink:0;',
        'border-bottom:1px solid #e5e7eb;',
        'padding:0 18px;background:#fafafa;',
      ].join('');

      function makeTab(id, labelText) {
        const btn = document.createElement('button');
        btn.dataset.tabId = id;
        btn.textContent = labelText;
        btn.style.cssText = [
          'border:none;background:none;cursor:pointer;',
          'padding:8px 16px;font-size:12px;font-weight:600;',
          'border-bottom:2px solid transparent;margin-bottom:-1px;',
          'color:#6b7280;transition:color 0.1s,border-color 0.1s;',
        ].join('');
        btn.addEventListener('click', () => activateTab(id));
        return btn;
      }

      const tabSummary = makeTab('summary', 'Diagnostics');
      const tabRaw     = makeTab('raw',     'Raw JSON');
      tabBar.append(tabSummary, tabRaw);
      modal.appendChild(tabBar);

      summaryBody = document.createElement('div');
      summaryBody.style.cssText = 'flex:1;overflow:auto;padding:18px 22px;';
      summaryBody.appendChild(buildFlowDebugSummary(sectionType, data));

      rawBody = document.createElement('div');
      rawBody.style.cssText = [
        'flex:1;overflow:auto;padding:18px 22px;',
        'font-family:Consolas,Monaco,"Courier New",monospace;',
        'font-size:12px;line-height:1.75;color:#374151;',
      ].join('');
      rawBody.appendChild(buildJsonNode(data, 0));

      function activateTab(id) {
        [tabSummary, tabRaw].forEach(btn => {
          const isActive = btn.dataset.tabId === id;
          btn.style.color = isActive ? '#4f46e5' : '#6b7280';
          btn.style.borderBottomColor = isActive ? '#4f46e5' : 'transparent';
        });
        summaryBody.style.display = id === 'summary' ? 'block' : 'none';
        rawBody.style.display     = id === 'raw'     ? 'block' : 'none';
      }

      modal.append(summaryBody, rawBody);
      activateTab('summary');

    } else {
      // No tabs — plain JSON view
      const body = document.createElement('div');
      body.style.cssText = [
        'flex:1;overflow:auto;padding:18px 22px;',
        'font-family:Consolas,Monaco,"Courier New",monospace;',
        'font-size:12px;line-height:1.75;color:#374151;',
      ].join('');
      body.appendChild(buildJsonNode(data, 0));
      modal.appendChild(body);
    }

    modal.insertBefore(header, modal.firstChild);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    function close() { backdrop.remove(); }
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
    function onKey(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } }
    document.addEventListener('keydown', onKey);
  }

  /* ─── Node Augmentation (workflow designer canvas) ─────────────── */

  const AUG_BTN_CLASS  = 'aisera-node-aug-btn';
  const AUG_BTN_STYLE  = [
    'position:absolute;top:3px;right:3px;z-index:9999;',
    'padding:1px 5px;border-radius:3px;',
    'border:1px solid rgba(79,70,229,0.55);',
    'background:rgba(79,70,229,0.10);color:#4F46E5;',
    'font-size:9px;font-family:Consolas,Monaco,monospace;font-weight:700;',
    'cursor:pointer;line-height:1.5;white-space:nowrap;',
    'transition:background 0.12s,color 0.12s;',
  ].join('');

  // Recursively flatten all nodes from the flow JSON nodes structure.
  // Handles arrays-of-arrays (subflow pattern) and object-keyed node maps.
  function flattenFlowNodes(nodesVal, out) {
    out = out || [];
    if (!nodesVal || typeof nodesVal !== 'object') return out;
    const items = Array.isArray(nodesVal) ? nodesVal : Object.values(nodesVal);
    for (const n of items) {
      if (!n || typeof n !== 'object') continue;
      if (Array.isArray(n)) {
        // Inner array (subflow wrapper) — recurse without pushing the array itself
        flattenFlowNodes(n, out);
      } else {
        out.push(n);
        if (n.nodes) flattenFlowNodes(n.nodes, out);
      }
    }
    return out;
  }

  // Get the visible label text from a .node DOM element (first text node of .icon-label-label)
  function getDomNodeLabel(domNode) {
    const labelEl = domNode.querySelector('.icon-label-label');
    if (!labelEl) return null;
    for (const child of labelEl.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t) return t;
      }
    }
    return null;
  }

  // Returns true if the DOM node is an augmentable type
  function isAugmentableNode(domNode) {
    var content = domNode.querySelector('.node-content');
    if (!content) return false;
    // Action nodes
    if (content.classList.contains('flow-action')) return true;
    // JavaScriptV2 nodes
    if (content.classList.contains('flow-advanced')) return true;
    // Switch nodes
    if (content.classList.contains('flow-switch')) return true;
    // Subflow nodes (no unique content class — detected by the flaticon-flow icon)
    if (domNode.querySelector('.flaticon-flow')) return true;
    // SetVariable nodes (no unique content class — detected by the flaticon-equal icon)
    if (domNode.querySelector('.flaticon-equal')) return true;
    return false;
  }

  // Build a partial node object from DOM content when no debug data is available
  function buildDomNodeSummary(domNode) {
    var content = domNode.querySelector('.node-content');
    var label   = getDomNodeLabel(domNode);
    var type    = null;
    if (content) {
      if (content.classList.contains('flow-action'))   type = 'Action';
      else if (content.classList.contains('flow-advanced')) type = 'JavaScriptV2';
      else if (content.classList.contains('flow-switch'))   type = 'Switch';
      else if (domNode.querySelector('.flaticon-flow'))      type = 'Subflow';
      else if (domNode.querySelector('.flaticon-equal'))     type = 'SetVariable';
    }
    var inputEl  = domNode.querySelector('.input-params');
    var outputEl = domNode.querySelector('.output-params');
    var inputs   = inputEl  ? inputEl.textContent.replace(/^[→←]\s*/, '').trim() : null;
    var outputs  = outputEl ? outputEl.textContent.replace(/^[→←]\s*/, '').trim() : null;
    var obj = {};
    if (label)   obj.label   = label;
    if (type)    obj.type    = type;
    var ref = domNode.getAttribute('ref');
    if (ref)     obj.nodeId  = ref;
    if (inputs)  obj['_inputs (designer only)']  = inputs;
    if (outputs) obj['_outputs (designer only)'] = outputs;
    obj['_note'] = 'Run a debug session to see full node data (input, output, status, etc.)';
    return obj;
  }

  // Find the best-matching JSON node for a DOM node element
  async function findJsonNode(domNode) {
    var label = getDomNodeLabel(domNode);

    try {
      var r = await chrome.storage.local.get(FLOW_KEY);
      var flowData = r[FLOW_KEY] && r[FLOW_KEY].data;
      if (flowData && flowData.nodes) {
        var all = flattenFlowNodes(flowData.nodes);
        var i, n, nId, nLabel;

        // 1. Scan all DOM attributes for a long numeric value matching a nodeId.
        //    Canvas node refs are short Vue numbers; real nodeIds are 7+ digits.
        var attrs = domNode.attributes;
        for (var a = 0; a < attrs.length; a++) {
          var attrVal = attrs[a].value;
          if (/^\d{7,}$/.test(attrVal)) {
            for (i = 0; i < all.length; i++) {
              n = all[i];
              nId = String(n.nodeId || n.node_id || n.nodeID || '');
              if (nId === attrVal) return n;
            }
          }
        }

        // 2. Collect candidate labels from the DOM (visible text + title attributes).
        var labelCandidates = [];
        if (label) labelCandidates.push(label);
        var titleAttr = domNode.getAttribute('title');
        if (titleAttr && titleAttr.trim()) labelCandidates.push(titleAttr.trim());
        var innerTitle = domNode.querySelector('[title]');
        if (innerTitle) {
          var t = (innerTitle.getAttribute('title') || '').trim();
          if (t) labelCandidates.push(t);
        }

        // 3. Exact label match against any candidate.
        for (var li = 0; li < labelCandidates.length; li++) {
          var cand = labelCandidates[li];
          for (i = 0; i < all.length; i++) {
            n = all[i];
            nLabel = String(n.label || n.title || n.displayName || '').trim();
            if (nLabel === cand) return n;
          }
        }

        // 4. Partial label match — flow label starts with DOM label or vice versa
        //    (handles truncated text in the canvas).
        for (var li = 0; li < labelCandidates.length; li++) {
          var cand = labelCandidates[li];
          if (cand.length < 4) continue; // too short to be meaningful
          for (i = 0; i < all.length; i++) {
            n = all[i];
            nLabel = String(n.label || n.title || n.displayName || '').trim();
            if (nLabel.indexOf(cand) === 0 || cand.indexOf(nLabel) === 0) return n;
          }
        }
      }
    } catch(e) {}

    // Fallback: extract what we can from the DOM itself
    return buildDomNodeSummary(domNode);
  }

  async function augmentDomNode(domNode) {
    if (!isAugmentableNode(domNode)) return;
    if (domNode.querySelector('.' + AUG_BTN_CLASS)) return; // already done

    // Ensure the container is relatively positioned so we can use position:absolute
    const innerNode = domNode.querySelector('.flow-inner-node');
    const container = innerNode || domNode;
    if (getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    const btn = document.createElement('button');
    btn.className = AUG_BTN_CLASS;
    btn.setAttribute('style', AUG_BTN_STYLE);
    btn.textContent = '{ }';
    const label = getDomNodeLabel(domNode);
    btn.title = 'View node JSON' + (label ? ': ' + label : '');

    btn.addEventListener('mouseenter', () => { btn.style.background = '#4F46E5'; btn.style.color = '#fff'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(79,70,229,0.10)'; btn.style.color = '#4F46E5'; });

    btn.addEventListener('click', async e => {
      e.stopPropagation();
      e.preventDefault();
      const jsonNode = await findJsonNode(domNode);
      showJsonOverlay(label || 'Node', jsonNode, 'node');
    });

    container.appendChild(btn);
  }

  function isWorkflowTestingVisible() {
    // Look for any element whose text content is exactly "Workflow Testing" AND
    // is actually rendered on screen (not CSS-hidden).
    for (const el of document.querySelectorAll('*')) {
      if (el.children.length === 0 && el.textContent.trim() === 'Workflow Testing') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 || rect.height > 0) return true;
      }
    }
    return false;
  }

  function augmentAllDesignerNodes() {
    if (testingSuppressed || !isWorkflowTestingVisible()) return;
    document.querySelectorAll('div.node').forEach(n => augmentDomNode(n));
  }

  function removeAllAugmentation() {
    document.querySelectorAll('.' + AUG_BTN_CLASS).forEach(btn => btn.remove());
  }

  let augObserver = null;
  let lastTestingVisible = false;
  let testingSuppressed = false; // set true when Stop Test is clicked; cleared when a new test starts

  /* ─── Node Highlighting ─────────────────────────────────────────── */

  var highlightedCanvasNode = null;
  var highlightedNodeLabel  = null;

  function findCanvasNode(label, nodeId, candidateIds) {
    var nodes = document.querySelectorAll('div.node');
    var i, c, domNode, domLabel, strippedLabel, strippedDomLabel;

    // 1. Try every candidate ID (all long numeric values from the flow node) against
    //    the canvas ref attribute. One of them will be the matching canvas ref.
    candidateIds = candidateIds || [];
    if (nodeId) {
      // Always include the explicit nodeId as the first candidate
      var ids = [nodeId];
      for (c = 0; c < candidateIds.length; c++) {
        if (candidateIds[c] !== nodeId) ids.push(candidateIds[c]);
      }
      candidateIds = ids;
    }
    for (c = 0; c < candidateIds.length; c++) {
      for (i = 0; i < nodes.length; i++) {
        if (nodes[i].getAttribute('ref') === candidateIds[c]) return nodes[i];
      }
    }

    // 2. Exact label match (fallback when no candidate ID matched)
    if (label) {
      for (i = 0; i < nodes.length; i++) {
        domNode  = nodes[i];
        domLabel = getDomNodeLabel(domNode);
        if (domLabel && domLabel === label) return domNode;
      }

      // 3. Strip "Subflow: " prefix from either side and retry
      strippedLabel = label.replace(/^Subflow:\s*/i, '');
      for (i = 0; i < nodes.length; i++) {
        domNode  = nodes[i];
        domLabel = getDomNodeLabel(domNode);
        if (domLabel) {
          strippedDomLabel = domLabel.replace(/^Subflow:\s*/i, '');
          if (strippedDomLabel === strippedLabel || strippedDomLabel === label || domLabel === strippedLabel) return domNode;
        }
      }

      // 4. Partial match — handles CSS-truncated labels
      for (i = 0; i < nodes.length; i++) {
        domNode  = nodes[i];
        domLabel = getDomNodeLabel(domNode);
        if (domLabel && label.length > 3 && (domLabel.indexOf(label) === 0 || label.indexOf(domLabel) === 0)) return domNode;
      }
    }

    return null;
  }

  function applyNodeHighlight(canvasNode, color) {
    canvasNode.style.setProperty('outline', '3px solid ' + color, 'important');
    canvasNode.style.setProperty('outline-offset', '2px', 'important');
  }

  function removeNodeHighlight() {
    if (highlightedCanvasNode) {
      highlightedCanvasNode.style.removeProperty('outline');
      highlightedCanvasNode.style.removeProperty('outline-offset');
      highlightedCanvasNode = null;
    }
    highlightedNodeLabel = null;
  }

  function startAugmentationObserver() {
    if (augObserver) return;
    lastTestingVisible = isWorkflowTestingVisible();
    if (lastTestingVisible) augmentAllDesignerNodes();

    augObserver = new MutationObserver(mutations => {
      let domChanged = false;

      for (const m of mutations) {
        // Check if any removed node contained "Workflow Testing" text
        for (const removed of m.removedNodes) {
          if (removed.nodeType !== 1) continue;
          if (/Workflow Testing/.test(removed.textContent)) {
            // Panel closed — clear augmentation. Only reset testingSuppressed if
            // Stop Test wasn't clicked (i.e. panel closed some other way).
            // Leave testingSuppressed=true until the NEXT test opens; it will be
            // cleared when "Workflow Testing" appears again.
            removeAllAugmentation();
            lastTestingVisible = false;
            testingSuppressed = false; // safe to reset now that panel is fully gone
            return;
          }
          domChanged = true;
        }
        if (m.addedNodes.length) domChanged = true;
      }

      if (!domChanged) return;

      const testingVisible = isWorkflowTestingVisible();
      if (testingVisible !== lastTestingVisible) {
        lastTestingVisible = testingVisible;
        if (testingVisible) {
          testingSuppressed = false; // new test started — allow augmentation
          augmentAllDesignerNodes();
        } else {
          removeAllAugmentation();
        }
        return;
      }

      // Testing active — augment any newly added canvas nodes
      if (testingVisible && !testingSuppressed) {
        for (const m of mutations) {
          for (const added of m.addedNodes) {
            if (added.nodeType !== 1) continue;
            if (added.classList?.contains('node')) augmentDomNode(added);
            else added.querySelectorAll?.('div.node').forEach(n => augmentDomNode(n));
          }
        }
      }
    });
    augObserver.observe(document.body, { childList: true, subtree: true });
  }

  function stopAugmentationObserver() {
    if (augObserver) { augObserver.disconnect(); augObserver = null; }
    removeAllAugmentation();
    lastTestingVisible = false;
  }

  /* ─── test count tracking ───────────────────────────────────────── */

  async function incrementTestCount() {
    try {
      const r = await chrome.storage.local.get(TEST_COUNT_KEY);
      const data = r[TEST_COUNT_KEY] || { count: 0, lastReset: null };
      data.count = (data.count || 0) + 1;
      await chrome.storage.local.set({ [TEST_COUNT_KEY]: data });
      if (sidebarFrame && sidebarReady) {
        sidebarFrame.contentWindow.postMessage({ type: 'AISERA_TEST_COUNT_CHANGED', data }, '*');
      }
    } catch {}
  }

  document.addEventListener('click', e => {
    if (e.target.matches('button.ok-button')) incrementTestCount();
  });

  // Use capture so stopPropagation in the page can't block these listeners
  document.addEventListener('click', e => {
    if (e.target.closest('.flow-test-cancel-btn')) {
      testingSuppressed = true;
      removeAllAugmentation();
      // Poll until "Workflow Testing" is no longer visible (handles both DOM removal
      // and CSS-hiding), then reset state so the next test triggers re-augmentation.
      waitForTestingToEnd();
    }
  }, { capture: true });

  function waitForTestingToEnd() {
    let attempts = 0;
    function poll() {
      attempts++;
      if (!isWorkflowTestingVisible() || attempts > 150) {
        // Panel is gone — reset so the next test can be augmented
        testingSuppressed = false;
        lastTestingVisible = false;
      } else {
        setTimeout(poll, 100);
      }
    }
    // Short initial delay so the panel is still visible on the first check
    setTimeout(poll, 300);
  }

  async function init() {
    if (!document.body) {
      await new Promise(resolve => {
        const obs = new MutationObserver(() => {
          if (document.body) { obs.disconnect(); resolve(); }
        });
        obs.observe(document.documentElement, { childList: true });
      });
    }

    debugBtn = createButton();
    const btn  = debugBtn;
    const drag = makeDraggable(btn);
    applyPosition(btn, loadPosition());

    function updateBtnVisibility() {
      const pt = getPageType();
      const visible = pt === 'ai-lens' || pt === 'workflow-details';
      if (!sidebarVisible) btn.style.display = visible ? 'flex' : 'none';
    }
    updateBtnVisibility();

    btn.addEventListener('mouseenter', () => {
      btn.style.background = currentBtnBgColor;
      btn.style.boxShadow  = '0 6px 22px rgba(0,0,0,0.30)';
      btn.style.transform  = 'translateY(-1px)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = currentBtnBgColor;
      btn.style.boxShadow  = '0 4px 16px rgba(0,0,0,0.18)';
      btn.style.transform  = '';
    });

    btn.addEventListener('click', async () => {
      if (drag.didMove()) { drag.clearMove(); return; }

      btn.textContent   = '···';
      btn.style.opacity = String(Math.min(1, currentBtnOpacity + 0.25));
      btn.style.cursor  = 'wait';

      let debugData = null;
      let source    = 'not-found';

      try {
        const [res, flowRes] = await Promise.all([
          sendMessage({ type: 'GET_DEBUG_INFO_V2' }),
          sendMessage({ type: 'GET_FLOW_DEBUG' }),
        ]);

        if (res?.ok && res?.found) {
          debugData = res.data;
          source    = res.source;
        }

        const flowData = flowRes?.ok && flowRes?.found ? flowRes.data : null;

        await chrome.storage.local.set({
          [SESSION_KEY]: { data: debugData, source, pageType: getPageType(), ts: Date.now() },
          [FLOW_KEY]:    { data: flowData, ts: Date.now() },
        });

        ensureSidebar();

        if (sidebarVisible) {
          // Already open — just push fresh data
          refreshSidebar();
        } else {
          showSidebar();
          refreshSidebar(); // no-op if not ready yet; iframe reads storage on load
        }

      } catch (err) {
        console.error('[AiseraDebug] Error:', err);
      } finally {
        btn.textContent   = 'Debug';
        btn.style.opacity = String(currentBtnOpacity);
        btn.style.cursor  = 'grab';
      }
    });

    if (!isHyperflowDesignerPage()) {
      document.body.appendChild(btn);
      initBtnStyle();
    }
    initAutoFill();

    // Start node augmentation if setting is enabled (default: true)
    chrome.storage.local.get(SETTINGS_KEY).then(r => {
      if (r[SETTINGS_KEY]?.nodeAugmentationEnabled !== false) startAugmentationObserver();
    }).catch(() => { startAugmentationObserver(); });

    // Keyboard shortcut — toggle panel
    initToggleShortcut();
  }

  /* ─── keyboard toggle shortcut ───────────────────────────────────── */

  let toggleShortcut = 'Ctrl+D'; // default; overridden by stored setting

  function keyEventToShortcutString(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = e.key;
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return '';
    const keyLabel = key === '[' ? '[' : key === ']' ? ']' : key.length === 1 ? key.toUpperCase() : key;
    parts.push(keyLabel);
    return parts.join('+');
  }

  function initToggleShortcut() {
    // Load the stored shortcut, falling back to the default
    chrome.storage.local.get(SETTINGS_KEY).then(r => {
      const stored = r[SETTINGS_KEY]?.shortcutToggle;
      if (stored) toggleShortcut = stored;
    }).catch(() => {});

    document.addEventListener('keydown', e => {
      if (!toggleShortcut) return;
      if (keyEventToShortcutString(e) !== toggleShortcut) return;
      // Don't fire inside inputs on the host page
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      e.preventDefault();
      triggerToggle();
    });
  }

  async function triggerToggle() {
    ensureSidebar();
    if (sidebarVisible) {
      hideSidebar();
    } else {
      // Same flow as clicking the debug button: fetch data then show
      try {
        const [res, flowRes] = await Promise.all([
          sendMessage({ type: 'GET_DEBUG_INFO_V2' }),
          sendMessage({ type: 'GET_FLOW_DEBUG' }),
        ]);
        const debugData = res?.ok && res?.found ? res.data : null;
        const source    = res?.ok && res?.found ? res.source : 'not-found';
        const flowData  = flowRes?.ok && flowRes?.found ? flowRes.data : null;
        await chrome.storage.local.set({
          [SESSION_KEY]: { data: debugData, source, pageType: getPageType(), ts: Date.now() },
          [FLOW_KEY]:    { data: flowData, ts: Date.now() },
        });
        showSidebar();
        refreshSidebar();
      } catch (err) {
        console.error('[AiseraDebug] Toggle shortcut error:', err);
      }
    }
  }

  init();
})();
