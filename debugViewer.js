'use strict';

(function () {
  /* ─── constants ──────────────────────────────────────────────────── */
  const SESSION_KEY  = 'aisera_debug_session';
  const FLOW_KEY     = 'aisera_flow_debug_session';
  const PINS_KEY          = 'aisera_dashboard_pins';        // legacy — migrated on first load
  const PINS_KEY_AI_LENS  = 'aisera_dashboard_pins_ailens';
  const PINS_KEY_WORKFLOW = 'aisera_dashboard_pins_workflow';
  const SETTINGS_KEY   = 'aisera_debug_settings';   // user preferences
  const TEST_COUNT_KEY = 'aisera_test_count';        // workflow test run counter

  const PIN_AI_LENS_SUMMARY   = 'flow::__aiLensSummary';
  const PIN_WORKFLOW_SUMMARY  = 'flow::__workflowSummary';
  const PIN_PREFIX_EXEC_FN    = 'flow::__execFn.';   // + index
  const PIN_PREFIX_LLM_CALL   = 'flow::__llmCall.';  // + index
  const PIN_DURATIONS         = 'flow::__durations';

  const SETTINGS_DEFAULTS = {
    // behavior
    defaultTab:          'dashboard',
    truncateEnabled:     true,
    truncateLimit:       20,
    itemSizeLimitEnabled: true,
    itemSizeLimit:        3000,
    warningsAsErrors:    true,
    nodesOnly:           true,
    nodesFirst:          true,
    subflowIndent:             20,
    autoCollapseEnabled:       true,
    requestCollapseThreshold:  500,
    cardsCollapsedByDefault:   true,
    nodeAugmentationEnabled:   true,
    nodeHighlightEnabled:      true,
    nodeHighlightColor:        '#f59e0b',
    errorPreviewLength:  800,
    flashDuration:       3000,
    pushPageContent:     true,
    autoFillEmail:       true,
    autoFillEmailAddress:'test@test.com',
    autoClickOk:         false,
    // debug button
    btnBgColor:          '#24c20f',
    btnTextColor:        '#ffffff',
    btnFontSize:         12,
    btnOpacity:          0.5,
    btnWidth:            60,
    btnHeight:           25,
    // flow debug sections — two independent ordered arrays, one per page type
    flowSectionsAiLens: [
      { id: 'aiLensSummary',            enabled: true  },
      { id: 'executedFunctions',        enabled: true  },
      { id: 'llmCalls',                 enabled: true  },
      { id: 'hyperFlowExecutionDetail', enabled: true  },
      { id: 'flowDebugInfo',            enabled: true  },
      { id: 'durations',                enabled: true  },
      { id: 'workflowExecutionDetail',  enabled: false },
      { id: 'debugInfoV2',              enabled: false },
      { id: 'convAiV2',                 enabled: false },
      { id: 'error',                    enabled: false },
      { id: 'nodes',                    enabled: false },
      { id: 'other',                    enabled: false },
    ],
    flowSectionsWorkflow: [
      { id: 'nodes',                    enabled: true  },
      { id: 'flowDebugInfo',            enabled: true  },
      { id: 'workflowExecutionDetail',  enabled: true  },
      { id: 'debugInfoV2',              enabled: false },
      { id: 'hyperFlowExecutionDetail', enabled: false },
      { id: 'convAiV2',                 enabled: false },
      { id: 'error',                    enabled: false },
      { id: 'executedFunctions',        enabled: false },
      { id: 'llmCalls',                 enabled: false },
      { id: 'durations',                enabled: false },
      { id: 'other',                    enabled: false },
    ],
    // keyboard shortcuts
    shortcutToggle:   'Ctrl+D',
    shortcutPrevTab:  'Ctrl+[',
    shortcutNextTab:  'Ctrl+]',
    // appearance
    accentColor:         '#4F46E5',
    cvStrColor:          '#2e7d32',
    cvNumColor:          '#1565c0',
    cvTrueColor:         '#2e7d32',
    cvFalseColor:        '#c62828',
    baseFontSize:        14,
    cardFontSize:        12,
  };

  /* ─── flow debug section descriptors ───────────────────────────── */
  // Static per-section descriptor. renderer(notShown, pos) is called during renderFlowDebug.
  // Sections with jsonPaths use the generic card renderer; dedicated sections supply their own.
  const FLOW_SECTION_DEFS = {
    aiLensSummary: {
      label: 'AI Lens Summary',
      dedicated: true,
    },
    workflowSummary: {
      label: 'Workflow Summary',
      dedicated: true,
    },
    debugInfoV2: {
      label: 'debugInfoV2',
      jsonPaths: ['debugInfoV2'],
    },
    flowDebugInfo: {
      label: 'flowDebugInfo',
      jsonPaths: ['debugInfoV2.flowDebugInfo', 'flowDebugInfo'],
    },
    hyperFlowExecutionDetail: {
      label: 'hyperFlowExecutionDetail',
      jsonPaths: ['debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail', 'flowDebugInfo.hyperFlowExecutionDetail'],
    },
    workflowExecutionDetail: {
      label: 'workflowExecutionDetail',
      jsonPaths: [
        'debugInfoV2.flowDebugInfo.workflowExecutionDetail',
        'flowDebugInfo.workflowExecutionDetail',
        'debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail.executedFunctions.0.workflowExecutionDetail',
        'flowDebugInfo.hyperFlowExecutionDetail.executedFunctions.0.workflowExecutionDetail',
        'workflowExecutionDetail',
      ],
    },
    convAiV2: {
      label: 'convAiV2',
      jsonPaths: ['debugInfoV2.ai.convAiV2', 'ai.convAiV2'],
    },
    error: {
      label: 'error',
      jsonPaths: ['error'],
    },
    executedFunctions: {
      label: 'executedFunctions',
      dedicated: true,   // rendered by renderExecutedFunctionsIfNeeded
    },
    llmCalls: {
      label: 'LLM Calls',
      dedicated: true,   // rendered by renderLlmCallsIfNeeded
    },
    durations: {
      label: 'Durations',
      dedicated: true,
    },
    nodes: {
      label: 'Nodes',
      dedicated: true,
    },
    other: {
      label: 'Other Data',
      dedicated: true,
    },
  };

  // Leaf key names used to suppress these from the treejsonContainer card list
  const FLOW_CONTROLLED_KEYS = new Set(['debugInfoV2', 'flowDebugInfo', 'hyperFlowExecutionDetail', 'workflowExecutionDetail', 'convAiV2', 'error', 'executedFunctions']);

  /* ─── module state ───────────────────────────────────────────────── */
  let currentPageType = null;   // 'ai-lens' | 'workflow-details' | 'other' | null
  let currentJsonData = null;   // parsed JSON from latest session
  let currentFlowData = null;   // parsed JSON from latest flow debug session
  let currentPins     = [];     // ordered array of dot-path strings
  let dashCardState = new Map(); // path → true (expanded) | false (collapsed) | undefined (new, default collapsed)
  let currentSettings   = { ...SETTINGS_DEFAULTS };
  let currentTab        = 'dashboard';
  let firstRender     = true;
  let dragSrcPath     = null;
  let currentHlBtn    = null;   // the currently active ◎ highlight button element
  let currentFunctionGroups = []; // [{name, nodes, flowData}] populated on AI Lens page
  let nodeWorkflowNameMap   = new Map(); // 1-based top-level node index → workflow/function name
  let currentFlowSessionData = null; // raw flowSession.data — used for workflow name resolution

  /* ─── DOM refs (set in DOMContentLoaded) ────────────────────────── */
  let loadingEl, tabSection, plainSection, errorSection;
  let sourceBadge, closeBtn;
  let treejsonContainer, dashboardContainer, errorsContainer, rawJsonTree, copyBtn;
  let flowdebugContainer, flowdebugStatusBadge, flowdebugStatusLabel;

  /* ─── section helpers ────────────────────────────────────────────── */

  function showSection(id) {
    [tabSection, plainSection, errorSection].forEach(el => el.classList.remove('visible'));
    document.getElementById(id).classList.add('visible');
    loadingEl.style.display = 'none';
  }

  function resetSections() {
    [tabSection, plainSection, errorSection].forEach(el => el.classList.remove('visible'));
    loadingEl.style.display = 'flex';
    treejsonContainer.innerHTML  = '';
    errorsContainer.innerHTML    = '';
    flowdebugContainer.innerHTML = '';
    flowdebugStatusLabel.style.display = 'none';
    flowdebugStatusBadge.style.display = 'none';
    rawJsonTree.innerHTML        = '';
    document.getElementById('plain-pre').textContent = '';
    sourceBadge.textContent      = 'Source: —';
    updateErrorBadge(0);
  }

  /* ─── tab management ─────────────────────────────────────────────── */

  function activateTab(name) {
    currentTab = name;
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
  }

  function initTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => activateTab(btn.dataset.tab));
    });
  }

  /* ─── keyboard shortcuts ─────────────────────────────────────────── */

  const TAB_ORDER = ['dashboard', 'debug', 'errors', 'rawjson', 'settings'];

  /** Convert a KeyboardEvent to a canonical shortcut string like "Ctrl+Shift+D" */
  function keyEventToString(e) {
    const parts = [];
    if (e.ctrlKey  || e.metaKey) parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const key = e.key;
    // Ignore bare modifier presses
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) return '';
    // Normalize bracket keys
    const keyLabel = key === '[' ? '[' : key === ']' ? ']' : key.length === 1 ? key.toUpperCase() : key;
    parts.push(keyLabel);
    return parts.join('+');
  }

  /** Return true if the event matches the given shortcut string */
  function matchesShortcut(e, shortcut) {
    if (!shortcut) return false;
    return keyEventToString(e) === shortcut;
  }

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      // Don't fire shortcuts when typing in a regular input / textarea
      // (but DO allow them when a shortcut-capture input is not actively recording)
      const tag = e.target?.tagName;
      if (tag === 'TEXTAREA' || e.target?.isContentEditable) return;
      if (tag === 'INPUT' && !e.target.classList.contains('shortcut-capture')) return;

      const s = currentSettings;

      if (matchesShortcut(e, s.shortcutNextTab)) {
        e.preventDefault();
        const idx = TAB_ORDER.indexOf(currentTab);
        activateTab(TAB_ORDER[(idx + 1) % TAB_ORDER.length]);
        return;
      }
      if (matchesShortcut(e, s.shortcutPrevTab)) {
        e.preventDefault();
        const idx = TAB_ORDER.indexOf(currentTab);
        activateTab(TAB_ORDER[(idx - 1 + TAB_ORDER.length) % TAB_ORDER.length]);
        return;
      }
    });
  }

  /**
   * Wire a shortcut-capture <input> so clicking it enters record mode:
   * the next key combo pressed becomes the shortcut value.
   * Press Escape to cancel. The input is read-only; value is stored in data-shortcut.
   */
  function initShortcutInput(id, onChange) {
    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener('click', () => {
      if (input.dataset.recording === 'true') return;
      input.dataset.recording = 'true';
      input.classList.add('shortcut-recording');
      input.value = 'Press keys…';

      const onKey = e => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          // Cancel — restore previous value
          input.value = input.dataset.shortcut || '';
        } else {
          const combo = keyEventToString(e);
          if (!combo) return; // bare modifier, keep waiting
          input.dataset.shortcut = combo;
          input.value = combo;
        }
        input.dataset.recording = 'false';
        input.classList.remove('shortcut-recording');
        document.removeEventListener('keydown', onKey, true);
        onChange();
      };
      document.addEventListener('keydown', onKey, true);
    });
  }

  function setShortcutInputValue(id, value) {
    const input = document.getElementById(id);
    if (!input) return;
    input.dataset.shortcut = value;
    input.value = value;
  }

  function getShortcutInputValue(id) {
    const input = document.getElementById(id);
    return input ? (input.dataset.shortcut || input.value) : '';
  }

  /* ─── copy button ────────────────────────────────────────────────── */

  function initCopyButton(rawStr) {
    const fresh = copyBtn.cloneNode(true);
    copyBtn.parentNode.replaceChild(fresh, copyBtn);
    copyBtn = fresh;

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(rawStr);
      } catch {
        const ta = document.createElement('textarea');
        ta.value = rawStr;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0;';
        document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
      }
      copyBtn.textContent = 'Copied!';
      copyBtn.classList.add('copied');
      setTimeout(() => { copyBtn.textContent = 'Copy JSON'; copyBtn.classList.remove('copied'); }, 2000);
    });
  }

  /* ─── pin persistence ────────────────────────────────────────────── */

  function pinsStorageKey(pageType) {
    return pageType === 'workflow-details' ? PINS_KEY_WORKFLOW : PINS_KEY_AI_LENS;
  }

  async function loadPins(pageType) {
    try {
      const key = pinsStorageKey(pageType);
      const r = await chrome.storage.local.get([key, PINS_KEY, PINS_KEY_AI_LENS, PINS_KEY_WORKFLOW, '_pinsMigrated']);
      // Force-reset both per-type keys if migration hasn't been stamped at version 2.
      // This clears any cross-contaminated data from the previous (broken) migration.
      if (r['_pinsMigrated'] !== 2) {
        await chrome.storage.local.remove([PINS_KEY, PINS_KEY_AI_LENS, PINS_KEY_WORKFLOW]);
        await chrome.storage.local.set({ '_pinsMigrated': 2 });
        return null; // triggers defaultPinsForPageType in caller
      }
      return Array.isArray(r[key]) ? r[key] : null;
    } catch { return null; }
  }

  function defaultPinsForPageType(pageType) {
    return pageType === 'workflow-details' ? [] : [PIN_AI_LENS_SUMMARY];
  }

  async function savePins(pins) {
    try { await chrome.storage.local.set({ [pinsStorageKey(currentPageType)]: pins }); } catch {}
  }

  async function loadTestCount() {
    try {
      const r = await chrome.storage.local.get(TEST_COUNT_KEY);
      return r[TEST_COUNT_KEY] || { count: 0, lastReset: null };
    } catch { return { count: 0, lastReset: null }; }
  }

  async function resetTestCount() {
    const data = { count: 0, lastReset: new Date().toISOString() };
    try { await chrome.storage.local.set({ [TEST_COUNT_KEY]: data }); } catch {}
    return data;
  }

  function updateTestCountDisplay(data) {
    const el = document.getElementById('test-count-display');
    const dateEl = document.getElementById('test-count-reset-date');
    if (!el || !dateEl) return;
    el.textContent = data.count;
    if (data.lastReset) {
      const d = new Date(data.lastReset);
      dateEl.textContent = 'Reset ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } else {
      dateEl.textContent = 'Never reset';
    }
  }

  async function loadSettings() {
    try {
      const r = await chrome.storage.local.get(SETTINGS_KEY);
      const saved = r[SETTINGS_KEY] || {};
      // Migration v1: discard old single flowSections (and any arrays already
      // migrated from it) so each page type gets clean per-type defaults.
      if (saved.flowSections || saved._flowSectionsMigrated !== 2) {
        delete saved.flowSections;
        delete saved.flowSectionsAiLens;
        delete saved.flowSectionsWorkflow;
        saved._flowSectionsMigrated = 2;
      }
      currentSettings = { ...SETTINGS_DEFAULTS, ...saved };
    } catch { currentSettings = { ...SETTINGS_DEFAULTS }; }
  }

  async function saveSettings() {
    try { await chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings }); } catch {}
  }

  function hexToRgba(hex, alpha) {
    try {
      const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
      if (!m) return null;
      return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
    } catch { return null; }
  }

  function applyTheme(s) {
    const root = document.documentElement;
    root.style.setProperty('--accent',         s.accentColor);
    root.style.setProperty('--accent-light',   hexToRgba(s.accentColor, 0.12) || 'rgba(79,70,229,0.12)');
    root.style.setProperty('--cv-str',         s.cvStrColor);
    root.style.setProperty('--cv-num',         s.cvNumColor);
    root.style.setProperty('--cv-true',         s.cvTrueColor);
    root.style.setProperty('--cv-false',        s.cvFalseColor);
    root.style.setProperty('--base-font-size', s.baseFontSize + 'px');
    root.style.setProperty('--card-font-size',  s.cardFontSize + 'px');
    root.style.setProperty('--flash-duration',  (s.flashDuration || 3000) + 'ms');
  }

  /* ─── path value lookup ──────────────────────────────────────────── */

  function getValueAtPath(obj, path) {
    if (!path) return obj;
    return path.split('.').reduce((cur, part) => {
      if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
      return cur[part];
    }, obj);
  }

  /** Walk the hierarchical node tree using a label like "9", "9-1", "9-1-2".
   *  Each segment is 1-based; navigates into node.nodes for subflows. */
  function resolveNodeByLabel(nodes, label) {
    const parts = label.split('-');
    let current = nodes;
    let node = null;
    for (let i = 0; i < parts.length; i++) {
      const idx = parseInt(parts[i], 10) - 1;
      if (!Array.isArray(current) || idx < 0 || idx >= current.length) return undefined;
      node = current[idx];
      if (!node) return undefined;
      if (i < parts.length - 1) {
        const sub = node.nodes;
        current = sub ? (Array.isArray(sub[0]) ? sub[0] : sub) : null;
      }
    }
    return node;
  }

  /** Resolve a pin path against the correct dataset.
   *  Flow pins are prefixed with "flow::" and read from currentFlowData.
   *  Node pins (flow::nodes.N or flow::nodes.N-M) use resolveNodeByLabel. */
  function resolvePin(path) {
    if (path === PIN_AI_LENS_SUMMARY || path === PIN_WORKFLOW_SUMMARY) return '__summary__';
    if (path.startsWith('flow::')) {
      const flowPath = path.slice(6);
      const nodeMatch = flowPath.match(/^nodes\.(.+)$/);
      if (nodeMatch && currentFlowData?.nodes) {
        return resolveNodeByLabel(currentFlowData.nodes, nodeMatch[1]);
      }
      // Check if this is a controlled section label — use its jsonPaths to find the value
      const controlled = Object.values(FLOW_SECTION_DEFS).find(s => s.label === flowPath);
      if (controlled) {
        for (const p of controlled.jsonPaths) {
          let val = getValueAtPath(currentFlowData, p);
          if (val !== undefined && val !== null) return val;
          val = getValueAtPath(currentJsonData, p);
          if (val !== undefined && val !== null) return val;
        }
        return undefined;
      }
      return getValueAtPath(currentFlowData, flowPath);
    }
    return getValueAtPath(currentJsonData, path);
  }

  /* ─── flow fields key tree ──────────────────────────────────────── */

  /** Strip the "flow::" prefix for display purposes. */
  function displayPath(path) {
    return path.startsWith('flow::') ? path.slice(6) : path;
  }

  /* ─── card value display ─────────────────────────────────────────── */

  /**
   * If val is a string that parses as a JSON object or array, return the parsed
   * value instead. Handles double-escaped strings (e.g. "{\"key\":\"val\"}").
   * Otherwise returns val unchanged.
   */
  function tryUnescapeJson(val) {
    if (typeof val !== 'string') return val;
    const trimmed = val.trim();
    if ((trimmed[0] === '{' || trimmed[0] === '[') === false) return val;
    try { const parsed = JSON.parse(trimmed); if (parsed !== null && typeof parsed === 'object') return parsed; } catch {}
    return val;
  }

  function primitiveClass(val) {
    if (val === null || val === undefined) return 'cv-null';
    switch (typeof val) {
      case 'boolean': return val ? 'cv-true' : 'cv-false';
      case 'number':  return 'cv-num';
      case 'string':  return 'cv-str';
      default:        return 'cv-null';
    }
  }

  function primitiveText(val) {
    if (val === undefined) return '(key no longer present)';
    if (val === null)      return 'null';
    return String(val); // strings shown without quotes; booleans/numbers as-is
  }

  /* ─── JSON popup modal ──────────────────────────────────────────── */

  function openJsonPopup(label, data, sectionType) {
    window.parent.postMessage({ type: 'AISERA_JSON_POPUP', label, data, sectionType: sectionType || null }, '*');
  }

  /**
   * If displayKey is "input" or "output" and val is a non-null object/array,
   * append a small popup button to keyEl.
   */
  function maybeAddJsonPopupBtn(keyEl, displayKey, val) {
    if (val === null || val === undefined) return;
    if (typeof val !== 'object') return;
    const k = displayKey.toLowerCase();
    if (k !== 'input' && k !== 'output') return;
    const btn = document.createElement('button');
    btn.className = 'json-popup-btn';
    btn.textContent = '{ }';
    btn.title = 'View ' + displayKey + ' JSON';
    btn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(displayKey, val); });
    keyEl.appendChild(btn);
  }

  /** Render a primitive span into parent. */
  function appendPrimitive(parent, val) {
    const s = document.createElement('span');
    s.className = primitiveClass(val);
    s.textContent = primitiveText(val);
    parent.appendChild(s);
  }

  /** Render object as two-column key/value rows.
   *  Primitives: key left, value right on same row.
   *  Objects/arrays: key on top, value indented below. */
  function renderObjProps(parent, obj, depth) {
    const list = document.createElement('div');
    list.className = 'cv-prop-list';
    Object.keys(obj).forEach(k => {
      const v = tryUnescapeJson(obj[k]);
      const isPrimitive = v === null || v === undefined || typeof v !== 'object';

      if (isPrimitive) {
        // Two-column row: muted key on left, colored value on right
        const row = document.createElement('div');
        row.className = 'cv-prop-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'cv-prop-key';
        keyEl.textContent = k;
        const valEl = document.createElement('span');
        appendPrimitive(valEl, v);
        row.append(keyEl, valEl);
        list.appendChild(row);
      } else {
        // Key as a small section label, value indented below
        const keyEl = document.createElement('div');
        keyEl.className = 'cv-obj-key';
        keyEl.textContent = k;
        list.appendChild(keyEl);
        const nested = document.createElement('div');
        nested.className = 'cv-prop-nested';
        renderCardValue(nested, v, depth + 1);
        list.appendChild(nested);
      }
    });
    parent.appendChild(list);
  }

  /**
   * Render a clickable expand button for a truncated sentinel value.
   * On click, removes the button and renders the full value in its place.
   */
  function appendTruncatedPlaceholder(container, sentinel, depth) {
    var kb = (sentinel.__charCount / 1000).toFixed(1);
    var btn = document.createElement('button');
    btn.className = 'truncated-expand-btn';
    btn.textContent = '\u25b6 ' + sentinel.__charCount.toLocaleString() + ' chars (' + kb + ' KB) \u2014 click to expand';
    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      container.removeChild(btn);
      renderCardValue(container, sentinel.__originalValue, depth);
    });
    container.appendChild(btn);
  }

  /**
   * Recursively render a value into `container`.
   * Fully expands all nested objects and arrays.
   */
  function renderCardValue(container, val, depth) {
    depth = depth || 0;
    val = tryUnescapeJson(val);

    // Truncated sentinel: render expand button instead of the full value
    if (val && typeof val === 'object' && val.__aisera_truncated) {
      appendTruncatedPlaceholder(container, val, depth);
      return;
    }

    // Primitive
    if (val === null || val === undefined || typeof val !== 'object') {
      appendPrimitive(container, val);
      return;
    }

    const isArr = Array.isArray(val);

    if (isArr) {
      const allPrimitive = val.every(item => item === null || typeof item !== 'object');

      if (allPrimitive) {
        // Primitives: simple bulleted list
        const wrap = document.createElement('div');
        wrap.className = 'cv-arr-block';
        val.forEach(item => {
          const row = document.createElement('div');
          row.className = 'cv-arr-row';
          const dot = document.createElement('span');
          dot.className = 'cv-list-dot';
          dot.textContent = '•\u2009';
          const valSpan = document.createElement('span');
          appendPrimitive(valSpan, item);
          row.append(dot, valSpan);
          wrap.appendChild(row);
        });
        container.appendChild(wrap);
      } else {
        // Objects/mixed array.
        // "Deep" = any item has at least one object-valued property → expand fully.
        // "Shallow" = all item properties are primitives → compact inline.
        const isDeep = val.some(item =>
          item && typeof item === 'object' && !Array.isArray(item) &&
          Object.values(item).some(v => v !== null && typeof v === 'object')
        );

        const wrap = document.createElement('div');
        wrap.className = 'cv-arr-block';
        val.forEach((item, idx) => {
          if (item === null || item === undefined || typeof item !== 'object') {
            const row = document.createElement('div');
            row.className = 'cv-arr-row';
            appendPrimitive(row, item);
            wrap.appendChild(row);
          } else if (Array.isArray(item)) {
            const row = document.createElement('div');
            row.className = 'cv-arr-row';
            renderCardValue(row, item, depth + 1);
            wrap.appendChild(row);
          } else if (isDeep) {
            // Render as a labelled block with full property expansion
            if (idx > 0) {
              const sep = document.createElement('div');
              sep.className = 'cv-arr-sep';
              wrap.appendChild(sep);
            }
            const block = document.createElement('div');
            block.className = 'cv-arr-obj-block';
            renderObjProps(block, item, depth + 1);
            wrap.appendChild(block);
          } else {
            // Shallow object in array: render as stacked label-above-value rows
            const block = document.createElement('div');
            block.className = 'cv-arr-obj-block';
            renderObjProps(block, item, depth + 1);
            wrap.appendChild(block);
          }
        });
        container.appendChild(wrap);
      }
    } else {
      renderObjProps(container, val, depth);
    }
  }

  /* ─── unified card body helpers ─────────────────────────────────── */

  /**
   * Append a section head (label + trailing hairline rule) to `container`.
   * variant: null (default) | 'error' | 'warning'
   */
  function renderSectionHead(container, labelText, variant) {
    const head = document.createElement('div');
    head.className = 'card-section-head' + (variant ? ' ' + variant + '-section' : '');
    const label = document.createElement('span');
    label.className = 'card-section-label';
    label.textContent = labelText;
    const rule = document.createElement('div');
    rule.className = 'card-section-rule';
    head.append(label, rule);
    container.appendChild(head);
  }

  /**
   * Append a single key/value row to `container`.
   * Primitives: muted key left, colored value right (same line).
   * Objects/arrays: key label above (cv-obj-key style), value indented below.
   * Large objects/arrays are rendered via appendFieldRow-style collapsible row when
   * their JSON exceeds the collapse threshold.
   * opts.errorStyle — apply red color to value
   */
  function renderPropRow(container, key, val, opts) {
    val = tryUnescapeJson(val);
    opts = opts || {};

    const isPrimitive = val === null || val === undefined || typeof val !== 'object';
    const LIMIT = currentSettings.requestCollapseThreshold || 500;

    if (isPrimitive) {
      if (opts.stacked) {
        // Key on its own line, value below — avoids wide indentation for long values
        if (key) {
          const keyEl = document.createElement('div');
          keyEl.className = 'card-prop-key card-prop-key-stacked';
          keyEl.textContent = key;
          container.appendChild(keyEl);
        }
        const valEl = document.createElement('div');
        valEl.className = 'card-prop-val card-prop-val-stacked';
        if (opts.errorStyle) valEl.style.color = '#b91c1c';
        appendPrimitive(valEl, val);
        container.appendChild(valEl);
      } else {
        const row = document.createElement('div');
        row.className = 'card-prop-row';
        const keyEl = document.createElement('span');
        keyEl.className = 'card-prop-key';
        keyEl.textContent = key;
        const valEl = document.createElement('span');
        valEl.className = 'card-prop-val';
        if (opts.errorStyle) valEl.style.color = '#b91c1c';
        appendPrimitive(valEl, val);
        row.append(keyEl, valEl);
        container.appendChild(row);
      }
      return;
    }

    // Complex value: check size
    let valStr = '';
    try { valStr = JSON.stringify(val); } catch {}

    if (valStr.length > LIMIT) {
      // Large: use collapsible appendFieldRow-style inline, appended to a temp .flow-node-props div
      // We reuse buildFieldRow which appends to a table element
      const tempTable = document.createElement('div');
      tempTable.className = 'flow-node-props';
      buildFieldRow(tempTable, key, val);
      // Move the generated row into container directly
      while (tempTable.firstChild) container.appendChild(tempTable.firstChild);
      return;
    }

    // Small complex: when stacked, render key as a sub-section head then rows indented below it
    if (opts.stacked) {
      renderSectionHead(container, key, opts.variant || null);
      const indent = document.createElement('div');
      indent.className = 'card-stacked-indent';
      renderCardSection(indent, null, val, opts);
      container.appendChild(indent);
      return;
    }

    // Small complex: key as uppercase section-style label, value indented below
    const keyEl = document.createElement('div');
    keyEl.className = 'cv-obj-key';
    keyEl.textContent = key;
    maybeAddJsonPopupBtn(keyEl, key, val);
    container.appendChild(keyEl);
    const nested = document.createElement('div');
    nested.className = 'cv-prop-nested';
    nested.style.marginLeft = '0';
    renderCardValue(nested, val, 0);
    container.appendChild(nested);
  }

  /**
   * Render a section (head + rows) for an object into `container`.
   * Skips if obj is empty/falsy. Returns true if anything was rendered.
   * opts.variant: null | 'error' | 'warning'
   */
  function renderCardSection(container, labelText, obj, opts) {
    opts = opts || {};
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    const entries = Object.entries(obj);
    if (entries.length === 0) return false;
    if (labelText != null) renderSectionHead(container, labelText, opts.variant || null);
    entries.forEach(([k, v]) => renderPropRow(container, k, v, opts));
    return true;
  }

  /* ─── dashboard rendering ────────────────────────────────────────── */

  function renderDashboard() {
    // Snapshot current collapse state from live card elements before wiping.
    // Only read direct card elements (dash-card, flow-node-card) — not nested
    // elements like checkboxes which also carry data-path but are never collapsed.
    dashboardContainer.querySelectorAll('.dash-card[data-path], .flow-node-card[data-path]').forEach(el => {
      const expanded = !el.classList.contains('collapsed');
      dashCardState.set(el.dataset.path, expanded);
    });

    dashboardContainer.innerHTML = '';

    if (currentPins.length === 0) {
      dashboardContainer.innerHTML =
        '<div class="dash-empty">' +
          '<div class="dash-empty-icon">&#9776;</div>' +
          'No keys pinned yet.<br>' +
          'Check keys in the <strong>Debug</strong> tab to track them here.' +
        '</div>';
      return;
    }

    currentPins.forEach(path => {
      const card = createCard(path, resolvePin(path));
      if (card) {
        // New pins (not yet in dashCardState) default to collapsed.
        // Existing pins restore their last known state.
        const expanded = dashCardState.has(path) ? dashCardState.get(path) : false;
        if (!expanded) {
          card.classList.add('collapsed');
          const btn = card.querySelector('.card-collapse-btn');
          if (btn) { btn.innerHTML = '&#9654;'; btn.setAttribute('aria-expanded', 'false'); }
        } else {
          card.classList.remove('collapsed');
          const btn = card.querySelector('.card-collapse-btn');
          if (btn) { btn.innerHTML = '&#9660;'; btn.setAttribute('aria-expanded', 'true'); }
        }
        // After the toggle fires, the class has already changed — read the new state.
        const toggleBtn = card.querySelector('.card-collapse-btn');
        if (toggleBtn) {
          toggleBtn.addEventListener('click', () => {
            dashCardState.set(path, !card.classList.contains('collapsed'));
          });
        }
        const clickableHeader = card.querySelector('.flow-node-header') || card.querySelector('.card-header');
        if (clickableHeader) {
          clickableHeader.addEventListener('click', e => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
            dashCardState.set(path, !card.classList.contains('collapsed'));
          });
        }
        dashboardContainer.appendChild(card);
      }
    });

    // Allow dropping on empty space below cards → move to end
    dashboardContainer.addEventListener('dragover', e => e.preventDefault(), { once: false });
    dashboardContainer.addEventListener('drop', async e => {
      if (!dragSrcPath) return;
      if (e.target.closest('.dash-card')) return; // handled by card
      e.preventDefault();
      const idx = currentPins.indexOf(dragSrcPath);
      if (idx === -1) return;
      currentPins.splice(idx, 1);
      currentPins.push(dragSrcPath);
      await savePins(currentPins);
      renderDashboard();
    });
  }

  function wrapSummaryCardForDashboard(path, innerCard, title) {
    if (!innerCard) return null;
    innerCard.classList.add('dash-card');
    innerCard.draggable = false;
    innerCard.dataset.path = path;

    const header = innerCard.querySelector('.flow-node-header');
    if (header) {
      const handle = document.createElement('span');
      handle.className = 'card-drag-handle';
      handle.innerHTML = '&#8942;&#8942;';
      handle.title = 'Drag to reorder';
      header.insertBefore(handle, header.firstChild);

      const pinCb = header.querySelector('.flow-pin-cb');
      const removeBtn = document.createElement('button');
      removeBtn.className = 'card-remove';
      removeBtn.title = 'Remove pin';
      removeBtn.innerHTML = '&#x2715;';
      removeBtn.addEventListener('click', e => { e.stopPropagation(); removePin(path); });
      if (pinCb) header.replaceChild(removeBtn, pinCb);
      else header.appendChild(removeBtn);
    }

    setupCardDnD(innerCard);
    return innerCard;
  }

  function getExecFuncs() {
    const paths = [
      'debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail.executedFunctions',
      'flowDebugInfo.hyperFlowExecutionDetail.executedFunctions',
    ];
    for (const p of paths) {
      const v = getValueAtPath(currentJsonData, p);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    return null;
  }

  function getLlmCalls() {
    const paths = [
      'debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail.llmCalls',
      'flowDebugInfo.hyperFlowExecutionDetail.llmCalls',
    ];
    for (const p of paths) {
      const v = getValueAtPath(currentJsonData, p);
      if (Array.isArray(v) && v.length > 0) return v;
    }
    return null;
  }

  function getDurations() {
    const paths = [
      'debugInfoV2.ai.convAiV2.durations',
      'ai.convAiV2.durations',
    ];
    for (const p of paths) {
      const v = getValueAtPath(currentJsonData, p);
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) return v;
    }
    return null;
  }

  function createCard(path, val) {
    if (path === PIN_AI_LENS_SUMMARY) {
      if (currentPageType === 'workflow-details') return null;
      const inner = buildAiLensSummaryCard(true);
      return wrapSummaryCardForDashboard(path, inner, 'AI Lens Summary');
    }
    if (path === PIN_WORKFLOW_SUMMARY) {
      const inner = buildWorkflowSummaryCard(true);
      return wrapSummaryCardForDashboard(path, inner, 'Workflow Summary');
    }
    if (path.startsWith(PIN_PREFIX_EXEC_FN)) {
      const idx = parseInt(path.slice(PIN_PREFIX_EXEC_FN.length), 10);
      const funcs = getExecFuncs();
      if (!funcs || !funcs[idx]) return null;
      const inner = createExecutedFunctionCard(funcs[idx], idx);
      return wrapSummaryCardForDashboard(path, inner, funcs[idx].functionName || ('Function ' + (idx + 1)));
    }
    if (path.startsWith(PIN_PREFIX_LLM_CALL)) {
      const idx = parseInt(path.slice(PIN_PREFIX_LLM_CALL.length), 10);
      const calls = getLlmCalls();
      if (!calls || !calls[idx]) return null;
      const inner = createLlmCallCard(calls[idx], idx);
      return wrapSummaryCardForDashboard(path, inner, 'LLM Call ' + (idx + 1));
    }
    if (path === PIN_DURATIONS) {
      const durations = getDurations();
      if (!durations) return null;
      // Build a standalone card (not appended to flowdebugContainer)
      const inner = buildDurationsCard(durations);
      return wrapSummaryCardForDashboard(path, inner, 'Durations');
    }

    const isFlow = path.startsWith('flow::');
    const dPath  = displayPath(path);

    // Whole-node pins (flow::nodes.N or flow::nodes.N-M) — reuse the debug-tab card
    if (isFlow && /^nodes\./.test(dPath) && currentFlowData && currentFlowData.nodes) {
      const labelPart = dPath.replace(/^nodes\./, '');
      const node = resolveNodeByLabel(currentFlowData.nodes, labelPart);
      if (node) return createDashboardNodeCard(path, node, labelPart);
    }

    // Scalar / field pin — simplified card without path label or Flow badge
    const keyName = dPath.split('.').pop();

    const card = document.createElement('div');
    card.className = 'dash-card';
    card.draggable = false;
    card.dataset.path = path;

    const header = document.createElement('div');
    header.className = 'card-header';

    const handle = document.createElement('span');
    handle.className = 'card-drag-handle';
    handle.innerHTML = '&#8942;&#8942;';
    handle.title = 'Drag to reorder';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'card-name-wrap';
    const keyEl = document.createElement('span');
    keyEl.className = 'card-key';
    keyEl.textContent = keyName;
    nameWrap.appendChild(keyEl);

    const collapseBtn = document.createElement('button');
    collapseBtn.className = 'card-collapse-btn';
    collapseBtn.title = 'Collapse / expand';
    collapseBtn.innerHTML = '&#9660;'; // ▼ open (renderDashboard will override to ▶ if needed)
    collapseBtn.setAttribute('aria-expanded', 'true');

    const removeBtn = document.createElement('button');
    removeBtn.className = 'card-remove';
    removeBtn.title = 'Remove pin';
    removeBtn.innerHTML = '&#x2715;';
    removeBtn.addEventListener('click', e => { e.stopPropagation(); removePin(path); });

    header.append(handle, collapseBtn, nameWrap, removeBtn);

    const body = document.createElement('div');
    body.className = 'card-body';
    const table = document.createElement('div');
    table.className = 'flow-node-props';
    if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
      Object.keys(val).forEach(k => buildFieldRow(table, k, val[k]));
    } else {
      buildFieldRow(table, keyName, val);
    }
    body.appendChild(table);
    card.append(header, body);

    function toggleDashCard() {
      const collapsed = card.classList.toggle('collapsed');
      collapseBtn.innerHTML = collapsed ? '&#9654;' : '&#9660;';
      collapseBtn.setAttribute('aria-expanded', String(!collapsed));
    }
    collapseBtn.addEventListener('click', e => { e.stopPropagation(); toggleDashCard(); });
    header.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      toggleDashCard();
    });

    setupCardDnD(card);
    return card;
  }

  // Whole-node dashboard card: reuses createNodeCard then adds drag+remove controls.
  function createDashboardNodeCard(path, node, indexLabel) {
    var workflowName = getWorkflowNameForIndex(indexLabel);
    const card = createNodeCard(node, indexLabel, 0, workflowName);
    if (!card) return null;

    // Add dash-card class so DnD selectors still work
    card.classList.add('dash-card');
    card.draggable = false;
    card.dataset.path = path;

    const header = card.querySelector('.flow-node-header');
    if (header) {
      // Prepend drag handle before the collapse toggle
      const handle = document.createElement('span');
      handle.className = 'card-drag-handle';
      handle.innerHTML = '&#8942;&#8942;';
      handle.title = 'Drag to reorder';
      header.insertBefore(handle, header.firstChild);

      // Replace pin checkbox with a remove button
      const pinCb = header.querySelector('.flow-pin-cb');
      const removeBtn = document.createElement('button');
      removeBtn.className = 'card-remove';
      removeBtn.title = 'Remove pin';
      removeBtn.innerHTML = '&#x2715;';
      removeBtn.addEventListener('click', e => { e.stopPropagation(); removePin(path); });
      if (pinCb) {
        header.replaceChild(removeBtn, pinCb);
      } else {
        header.appendChild(removeBtn);
      }
    }

    setupCardDnD(card);
    return card;
  }

  /* ─── drag-and-drop ──────────────────────────────────────────────── */

  function clearDragIndicators() {
    dashboardContainer.querySelectorAll('.insert-before, .insert-after').forEach(el => {
      el.classList.remove('insert-before', 'insert-after');
    });
  }

  function setupCardDnD(card) {
    // Only allow drag to start when the user mousedowns on the drag handle
    const handle = card.querySelector('.card-drag-handle');
    if (handle) {
      handle.addEventListener('mousedown', () => { card.draggable = true; });
      handle.addEventListener('mouseup',   () => { card.draggable = false; });
    }

    card.addEventListener('dragstart', e => {
      dragSrcPath = card.dataset.path;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', card.dataset.path);
    });

    card.addEventListener('dragend', () => {
      card.draggable = false;
      card.classList.remove('dragging');
      dragSrcPath = null;
      clearDragIndicators();
    });

    card.addEventListener('dragover', e => {
      if (!dragSrcPath || dragSrcPath === card.dataset.path) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      clearDragIndicators();
      const rect = card.getBoundingClientRect();
      card.classList.add(e.clientY < rect.top + rect.height / 2 ? 'insert-before' : 'insert-after');
    });

    card.addEventListener('dragleave', e => {
      if (!card.contains(e.relatedTarget)) {
        card.classList.remove('insert-before', 'insert-after');
      }
    });

    card.addEventListener('drop', async e => {
      e.preventDefault();
      const insertBefore = card.classList.contains('insert-before');
      clearDragIndicators();

      const src = dragSrcPath;
      const tgt = card.dataset.path;
      if (!src || src === tgt) return;

      const srcIdx = currentPins.indexOf(src);
      if (srcIdx === -1) return;
      currentPins.splice(srcIdx, 1);

      const tgtIdx = currentPins.indexOf(tgt);
      currentPins.splice(insertBefore ? tgtIdx : tgtIdx + 1, 0, src);

      await savePins(currentPins);
      renderDashboard();
    });
  }

  /* ─── pin actions ────────────────────────────────────────────────── */

  async function handlePinToggle(path, isChecked) {
    if (isChecked) {
      if (!currentPins.includes(path)) currentPins.push(path);
    } else {
      currentPins = currentPins.filter(p => p !== path);
    }
    await savePins(currentPins);
    renderDashboard();
  }

  async function removePin(path) {
    currentPins = currentPins.filter(p => p !== path);
    dashCardState.delete(path);
    await savePins(currentPins);
    renderDashboard();
    if (path.startsWith('flow::')) {
      // Try to uncheck a scalar flow checkbox (has full path in data-path)
      // Node-level checkboxes store the full path in data-path — direct uncheck
      const flowCb = flowdebugContainer.querySelector(`input.flow-pin-cb[data-path="${path}"]`);
      if (flowCb) {
        flowCb.checked = false;
      } else {
        // "Other Data" TreeJSONLib checkbox — re-render to sync
        renderFlowDebug(currentFlowData);
      }
    } else {
      const cb = treejsonContainer.querySelector(`input.tj-pin-cb[data-path="${path}"]`);
      if (cb) cb.checked = false;
    }
  }

  /* ─── error detection ───────────────────────────────────────────── */

  // Key name patterns that suggest an error field.
  // Uses exact-match for short/ambiguous terms; substring for longer ones.
  const ERROR_EXACT       = /^(err|fail|fault|deny|denied|invalid|timeout|timedout|rejected|forbidden|unauthorized|unauthenticated|critical|fatal)$/i;
  // Word-boundary match so "failureReason" or "errorHandler" are not caught,
  // but "error", "myError", "isFailure" (ending on a boundary) still are.
  const ERROR_SUBSTR_BASE = /(?<![a-z])error(?![a-z])|(?<![a-z])exception(?![a-z])|(?<![a-z])failure(?![a-z])|(?<![a-z])stacktrace(?![a-z])|(?<![a-z])stack_trace(?![a-z])|(?<![a-z])traceback(?![a-z])/i;

  function isErrorKey(key) {
    if (ERROR_EXACT.test(key)) return true;
    if (ERROR_SUBSTR_BASE.test(key)) return true;
    if (currentSettings.warningsAsErrors && /warning/i.test(key)) return true;
    return false;
  }

  // Semantic checks: value implies an error regardless of key name.
  function isErrorByValue(key, value) {
    const k = key.toLowerCase();
    // success / ok / isValid === false
    if (/^(success|ok|issuccess|isok|isvalid|succeeded)$/.test(k) && value === false) return true;
    // numeric HTTP/status codes ≥ 400
    if (/^(status|statuscode|httpstatus|responsecode|code|errorcode|http_status|http_code)$/.test(k)
        && typeof value === 'number' && value >= 400) return true;
    // string status that reads as an error
    if (/^(status|result|state)$/.test(k) && typeof value === 'string'
        && /^(error|fail|failed|failure|exception|ko|ng)$/i.test(value.trim())) return true;
    return false;
  }

  // Strings that represent serialized empty structures — not real content.
  var EMPTY_SERIALIZED = /^\s*(\[\]|\{\}|null|undefined|false|0)\s*$/i;

  // A value must have actual content to be worth surfacing.
  function hasErrorContent(val) {
    if (val === null || val === undefined || val === false || val === 0) return false;
    if (typeof val === 'string') {
      if (val.trim() === '') return false;
      if (EMPTY_SERIALIZED.test(val.trim())) return false;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return false;
      // Array where every element is an empty-equivalent string (e.g. ["[]"])
      var allEmpty = true;
      for (var i = 0; i < val.length; i++) {
        var el = val[i];
        if (typeof el === 'string' && (el.trim() === '' || EMPTY_SERIALIZED.test(el.trim()))) continue;
        allEmpty = false;
        break;
      }
      if (allEmpty) return false;
    }
    if (val !== null && typeof val === 'object' && !Array.isArray(val)
        && Object.keys(val).length === 0) return false;
    return true;
  }

  /**
   * Recursively walk `obj` and collect entries that look like errors.
   * Returns array of { path, key, value, reason } objects.
   */
  function findErrors(obj, path = '', depth = 0, results = []) {
    if (depth > 20 || obj === null || typeof obj !== 'object') return results;

    const isArr = Array.isArray(obj);
    const keys  = isArr ? [...obj.keys()] : Object.keys(obj);

    for (const key of keys) {
      const val      = obj[key];
      const fullPath = path ? path + '.' + String(key) : String(key);
      const keyStr   = String(key);

      let reason = null;
      if (!isArr && isErrorKey(keyStr) && hasErrorContent(val)) {
        reason = 'key name';
      } else if (isErrorByValue(keyStr, val)) {
        reason = 'value';
      }

      if (reason) {
        // Avoid exact duplicates (same path shouldn't appear twice)
        if (!results.some(r => r.path === fullPath)) {
          results.push({ path: fullPath, key: keyStr, value: val, reason });
        }
      }

      // Always recurse into nested structures.
      // Normalize array-of-arrays on "nodes" keys (subflow wrapper artifact)
      // so paths read "nodes.7.nodes.15.output" instead of "nodes.7.nodes.0.15.output".
      if (val !== null && typeof val === 'object') {
        let recurseVal = val;
        if (keyStr === 'nodes' && Array.isArray(val) && val.length > 0 && Array.isArray(val[0])) {
          recurseVal = val[0];
        }
        findErrors(recurseVal, fullPath, depth + 1, results);
      }
    }

    return results;
  }

  /* ─── node title lookup for error cards ─────────────────────────── */

  /**
   * Given a flow error path like "nodes.2.status" or "nodes.0.nodes.1.error",
   * walk currentFlowData using resolveNodeByLabel-style logic to find the
   * deepest node whose label we can show as the error card title.
   * Returns a string like "3 | AgentResponse", or null if path isn't node-based.
   */
  function nodeTitleForFlowPath(path) {
    if (!currentFlowData?.nodes) return null;

    // Build the hierarchical label by consuming "nodes.N" segments one at a time
    const parts = path.split('.');
    let nodeArr = currentFlowData.nodes;
    let label   = null;
    let i = 0;

    while (i < parts.length) {
      if (parts[i] !== 'nodes') break;
      i++;
      const idx = parseInt(parts[i], 10);
      if (isNaN(idx)) break;
      i++;

      const node = nodeArr[idx];
      if (!node || typeof node !== 'object') break;

      // Build the same "N | Label" string createNodeCard uses, plus nodeId
      const [, nodeName] = getNodeField(node, 'label', 'title', 'displayName');
      const [, nodeType] = getNodeField(node, 'type', 'nodeType', 'kind');
      const [, nodeId]   = getNodeField(node, 'nodeId', 'node_id', 'nodeID');
      const humanIdx = idx + 1;
      // Build hierarchical index string: "8" → "8-16" (not "16-16")
      const indexStr = label ? label.split(' | ')[0] + '-' + humanIdx : String(humanIdx);
      const nameStr  = nodeName ? String(nodeName) : (nodeType ? String(nodeType) : 'Node');
      label = indexStr + ' | ' + nameStr;

      // Descend into subflow if the path continues with another "nodes.N"
      if (parts[i] === 'nodes' && node.nodes) {
        const inner = Array.isArray(node.nodes[0]) ? node.nodes[0] : node.nodes;
        nodeArr = Array.isArray(inner) ? inner : [];
      } else {
        break;
      }
    }

    return label;
  }

  /* ─── error rendering ────────────────────────────────────────────── */

  /**
   * Walk currentFlowData.nodes following "nodes.N" pairs in `path` and return
   * the deepest node object.  Returns null if the path isn't node-based or the
   * node can't be found.
   */
  function resolveNodeFromPath(path) {
    if (!currentFlowData?.nodes) return null;
    const parts = path.split('.');
    let nodeArr = currentFlowData.nodes;
    let node = null;
    let i = 0;
    while (i < parts.length) {
      if (parts[i] !== 'nodes') break;
      i++;
      const idx = parseInt(parts[i], 10);
      if (isNaN(idx)) break;
      i++;
      const candidate = nodeArr[idx];
      if (!candidate || typeof candidate !== 'object') break;
      node = candidate;
      // Descend into subflow if the path continues
      if (parts[i] === 'nodes' && node.nodes) {
        const inner = Array.isArray(node.nodes[0]) ? node.nodes[0] : node.nodes;
        nodeArr = Array.isArray(inner) ? inner : [];
      } else {
        break;
      }
    }
    return node;
  }

  function updateErrorBadge(count) {
    const badge = document.getElementById('error-count-badge');
    if (!badge) return;
    if (count > 0) {
      badge.textContent    = count;
      badge.style.display  = 'inline-flex';
    } else {
      badge.style.display  = 'none';
    }
  }

  function renderErrors() {
    errorsContainer.innerHTML = '';

    const debugEntries = currentJsonData ? findErrors(currentJsonData) : [];
    const flowEntries  = currentFlowData ? findErrors(currentFlowData) : [];
    const isWarning    = e => currentSettings.warningsAsErrors && /warning/i.test(e.key);
    const nodeCount    = flowEntries.filter(e => e.path.startsWith('nodes.')).length;
    const warningCount = [...debugEntries, ...flowEntries].filter(e => isWarning(e) && !e.path.startsWith('nodes.')).length;
    const visibleCount = currentSettings.nodesOnly
      ? nodeCount + warningCount
      : debugEntries.length + flowEntries.length;
    updateErrorBadge(visibleCount);

    if (debugEntries.length === 0 && flowEntries.length === 0) {
      errorsContainer.innerHTML =
        '<div class="errors-empty">' +
          '<div class="errors-empty-icon">&#10003;</div>' +
          'No error indicators detected in the current data.' +
        '</div>';
      return;
    }

    function buildEntry(path, value, isFlow) {
      // Determine if this is a warning entry
      const entryKey = path.split('.').pop();
      const isWarnEntry = currentSettings.warningsAsErrors && /warning/i.test(entryKey);

      // Resolve the node object this error belongs to (for node-based flow errors)
      const errNode = isFlow ? resolveNodeFromPath(path) : null;

      let display;
      if (value === null)          display = 'null';
      else if (typeof value === 'boolean' || typeof value === 'number') display = String(value);
      else if (typeof value === 'string')  display = value;
      else {
        try   { display = JSON.stringify(value, null, 2); }
        catch { display = '[object]'; }
        const previewLen = currentSettings.errorPreviewLength;
        if (display.length > previewLen) display = display.slice(0, previewLen - 3) + '\u2026';
      }

      // Same card structure as debug cards — .err-entry modifier applies red theme
      const entry = document.createElement('div');
      entry.className = 'flow-node-card err-entry' + (isWarnEntry ? ' warning-card' : '');

      const header = document.createElement('div');
      header.className = 'flow-node-header';

      // Name wrap: last path segment as bold title, full breadcrumb below
      const nameWrap = document.createElement('div');
      nameWrap.className = 'flow-node-name-wrap';

      const segs = path.split('.');
      const titleEl = document.createElement('span');
      titleEl.className = 'flow-node-name';
      // For flow errors rooted in a node, show the same "N | Label" title the debug card uses.
      // For everything else fall back to the top-level key name.
      titleEl.textContent = (isFlow && nodeTitleForFlowPath(path)) || segs[0];
      titleEl.title = titleEl.textContent;
      nameWrap.appendChild(titleEl);

      const breadcrumb = document.createElement('div');
      breadcrumb.className = 'err-entry-breadcrumb';
      breadcrumb.title = path;
      segs.forEach((seg, i, arr) => {
        if (i > 0) {
          const sep = document.createElement('span');
          sep.className = 'err-breadcrumb-sep';
          sep.textContent = ' › ';
          breadcrumb.appendChild(sep);
        }
        const segEl = document.createElement('span');
        segEl.className = i === arr.length - 1 ? 'err-breadcrumb-last' : 'err-breadcrumb-seg';
        segEl.textContent = seg;
        breadcrumb.appendChild(segEl);
      });
      nameWrap.appendChild(breadcrumb);
      header.appendChild(nameWrap);

      // Status badge — same as node cards (type is already in the title label)
      if (errNode) {
        const [, errStatus] = getNodeField(errNode, 'status', 'executionStatus', 'state');
        if (errStatus) {
          const statusKey   = flowStatusKey(errStatus);
          const statusStyle = FLOW_STATUS_STYLES[statusKey];
          const badge = document.createElement('span');
          badge.className = 'flow-node-status';
          badge.textContent = String(errStatus);
          badge.style.background = statusStyle.bg;
          badge.style.color      = statusStyle.color;
          header.appendChild(badge);
        }
      }

      // { } button — opens data panel for the error value
      if (value !== null && value !== undefined && typeof value === 'object') {
        const augBtn = document.createElement('button');
        augBtn.className = 'node-aug-btn';
        augBtn.textContent = '{ }';
        augBtn.title = 'View JSON';
        augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(titleEl.textContent, value); });
        header.appendChild(augBtn);
      }

      const goBtn = document.createElement('button');
      goBtn.className = 'err-goto-btn';
      goBtn.textContent = '→ Debug';
      goBtn.title = 'Jump to this key in the Debug tab';
      goBtn.addEventListener('click', e => { e.stopPropagation(); jumpToDebug(path, isFlow); });
      header.appendChild(goBtn);

      entry.appendChild(header);

      const body = document.createElement('div');
      body.className = 'flow-node-body';

      if (isWarnEntry) {
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          renderCardSection(body, entryKey, value, { variant: 'warning', stacked: true });
        } else if (Array.isArray(value)) {
          renderSectionHead(body, entryKey, 'warning');
          renderCardValue(body, value, 0);
        } else {
          renderSectionHead(body, entryKey, 'warning');
          const valEl = document.createElement('pre');
          valEl.className = 'card-warn-val';
          valEl.textContent = display;
          body.appendChild(valEl);
        }
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        // Object value: render with unified section/prop rows
        renderCardSection(body, entryKey, value, { errorStyle: true, stacked: true });
      } else if (Array.isArray(value)) {
        // Array: render with unified card value renderer
        renderCardValue(body, value, 0);
      } else {
        // String / primitive: try to parse Aisera exception chain first
        const chain = (typeof value === 'string') ? parseErrorChain(value) : null;
        if (chain) {
          chain.forEach((seg, i) => {
            const segEl = document.createElement('div');
            segEl.style.cssText = 'display:flex;gap:8px;align-items:flex-start;' +
              (i < chain.length - 1 ? 'margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid #fee2e2;' : '');
            if (i > 0) {
              const arrow = document.createElement('span');
              arrow.style.cssText = 'flex-shrink:0;color:#dc2626;font-size:11px;margin-top:2px;';
              arrow.textContent = '↳';
              segEl.appendChild(arrow);
            } else {
              const spacer = document.createElement('span');
              spacer.style.cssText = 'flex-shrink:0;width:14px;';
              segEl.appendChild(spacer);
            }
            const textEl = document.createElement('span');
            textEl.style.cssText = 'font-size:11px;color:#7f1d1d;font-family:Consolas,Monaco,monospace;word-break:break-word;white-space:pre-wrap;line-height:1.5;';
            textEl.textContent = seg;
            segEl.appendChild(textEl);
            body.appendChild(segEl);
          });
        } else {
          const valEl = document.createElement('pre');
          valEl.className = 'err-entry-value';
          valEl.textContent = display;
          body.appendChild(valEl);
        }
      }

      // Node context sections: same info as node cards, shown after the error
      if (errNode) {
        // Action name (Action nodes)
        if (nodeType(errNode) === 'Action' && errNode.actionName) {
          renderSectionHead(body, 'Action');
          renderPropRow(body, 'name', String(errNode.actionName));
        }
        // Input / Output
        renderCardSection(body, 'Input',  errNode.input  || errNode.inputs);
        renderCardSection(body, 'Output', errNode.output);
        // Conditions (Switch nodes)
        const conditions = errNode.conditions;
        if (conditions && typeof conditions === 'object') {
          renderSectionHead(body, 'Conditions');
          if (Array.isArray(conditions)) {
            conditions.forEach(cond => {
              const expr = (cond && (cond.expression || cond.condition || cond.expr || JSON.stringify(cond))) || '';
              const matched = cond && (cond.matched === true || cond.isMatched === true);
              const row = document.createElement('div');
              row.className = 'card-prop-row';
              row.style.paddingLeft = '8px';
              const exprEl = document.createElement('span');
              exprEl.className = 'card-prop-val';
              exprEl.style.flex = '1';
              exprEl.textContent = String(expr);
              const badge = document.createElement('span');
              badge.style.cssText = 'font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;flex-shrink:0;' +
                (matched ? 'background:#dcfce7;color:#15803d;' : 'background:#f1f5f9;color:#6b7280;');
              badge.textContent = matched ? 'matched' : 'no';
              row.append(exprEl, badge);
              body.appendChild(row);
            });
          } else {
            renderCardSection(body, '', conditions);
          }
        }
        // Node ID and Execution Time
        for (const [displayKey, , ...candidates] of NODE_CARD_FIELDS) {
          if (['Error', 'Input', 'Output', 'Conditions'].includes(displayKey)) continue;
          let foundKey = null;
          for (const cand of candidates) {
            if (Object.prototype.hasOwnProperty.call(errNode, cand)) { foundKey = cand; break; }
            const ci = Object.keys(errNode).find(nk => nk.toLowerCase() === cand.toLowerCase());
            if (ci) { foundKey = ci; break; }
          }
          if (foundKey === null) continue;
          const val = errNode[foundKey];
          if (val !== undefined && val !== null && val !== '') {
            renderPropRow(body, displayKey, val);
          }
        }
      }

      entry.appendChild(body);
      addCollapseToggle(entry, header);
      return entry;
    }

    // Try to parse nested Aisera exception chains into readable segments.
    function parseErrorChain(str) {
      if (typeof str !== 'string') return null;
      const segments = [];
      let remaining = str;
      const splitter = /'\s*,\s*(?:and nodeId:\s*'[^']*'\s*,\s*)?with error message:\s*'/i;
      while (remaining) {
        const match = splitter.exec(remaining);
        if (!match) { segments.push(remaining.replace(/'$/, '').trim()); break; }
        const before = remaining.slice(0, match.index + 1).trim();
        if (before) segments.push(before);
        remaining = remaining.slice(match.index + match[0].length);
      }
      return segments.length > 1 ? segments : null;
    }

    // Node-based flow entries (path starts with "nodes.") vs other flow entries
    const nodeEntries  = flowEntries.filter(e => e.path.startsWith('nodes.'));
    const otherFlow    = flowEntries.filter(e => !e.path.startsWith('nodes.'));

    // When nodesOnly is on, suppress debug entries and non-node flow entries —
    // except warnings, which always show when warningsAsErrors is enabled.
    const isWarningEntry = e => currentSettings.warningsAsErrors && /warning/i.test(e.key);
    const visibleDebug     = currentSettings.nodesOnly ? debugEntries.filter(isWarningEntry)    : debugEntries;
    const visibleOtherFlow = currentSettings.nodesOnly ? otherFlow.filter(isWarningEntry) : otherFlow;

    const orderedPairs = currentSettings.nodesFirst
      ? [
          ...nodeEntries.map(e => ({ ...e, isFlow: true })),
          ...visibleDebug.map(e => ({ ...e, isFlow: false })),
          ...visibleOtherFlow.map(e => ({ ...e, isFlow: true })),
        ]
      : [
          ...visibleDebug.map(e => ({ ...e, isFlow: false })),
          ...nodeEntries.map(e => ({ ...e, isFlow: true })),
          ...visibleOtherFlow.map(e => ({ ...e, isFlow: true })),
        ];

    orderedPairs.forEach(({ path, value, isFlow }) => {
      errorsContainer.appendChild(buildEntry(path, value, isFlow));
    });
  }

  /* ─── flow debug rendering ───────────────────────────────────────── */

  const FLOW_STATUS_STYLES = {
    success:  { bg: '#dcfce7', color: '#166534', border: '#16a34a' },
    error:    { bg: '#fee2e2', color: '#991b1b', border: '#dc2626' },
    running:  { bg: '#dbeafe', color: '#1e40af', border: '#2563eb' },
    timeout:  { bg: '#fef3c7', color: '#92400e', border: '#d97706' },
    pending:  { bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' },
  };

  function flowStatusKey(status) {
    if (!status) return 'pending';
    const s = String(status).toLowerCase().replace(/[\s_-]/g, '');
    if (/^(completed|success|succeeded|passed|done|ok|true)$/.test(s)) return 'success';
    if (/^(failed|failure|error|exception|fault|ko|ng|false)$/.test(s))  return 'error';
    if (/^(inprogress|running|active|executing|started)$/.test(s))       return 'running';
    if (/^(timeout|timedout)$/.test(s))                                   return 'timeout';
    return 'pending';
  }

  function getNodeField(node, ...keys) {
    for (const k of keys) {
      if (node[k] !== undefined && node[k] !== null && node[k] !== '') return [k, node[k]];
      const ci = Object.keys(node).find(nk => nk.toLowerCase() === k.toLowerCase());
      if (ci && node[ci] !== undefined && node[ci] !== null && node[ci] !== '') return [ci, node[ci]];
    }
    return [null, null];
  }

  // Strip surrounding single quotes the platform wraps type values in: "'Subflow'" → "Subflow"
  function nodeType(node) {
    const [, t] = getNodeField(node, 'type', 'nodeType', 'kind');
    return t ? String(t).replace(/^'+|'+$/g, '') : null;
  }

  // [displayLabel, alwaysShow, ...candidateKeys]
  // alwaysShow=true: row appears even when the key is absent from the node
  const NODE_CARD_FIELDS = [
    ['Error',          false, 'error',          'exception',     'errorMessage', 'errMsg', 'fault', 'faultString'],
    ['Label',          false, 'label',          'title',         'displayName',  'name'],
    ['Input',          true,  'input',          'inputs'],
    ['Output',         true,  'output'],
    ['Conditions',     false, 'conditions'],
    ['Node ID',        false, 'nodeId',         'node_id',       'nodeID'],
    ['Execution Time', false, 'executionTime',  'execution_time', 'executionTimeMs'],
  ];

  /** Prepend a ▾/▸ collapse toggle to a card's header and wire click behaviour.
   *  Clicking the header (anywhere except interactive children) toggles the body. */
  function addCollapseToggle(card, header, forceExpanded) {
    const startCollapsed = forceExpanded ? false : currentSettings.cardsCollapsedByDefault;
    const btn = document.createElement('button');
    btn.className = 'card-collapse-btn';
    btn.title = 'Collapse / expand';
    if (startCollapsed) {
      card.classList.add('collapsed');
      btn.setAttribute('aria-expanded', 'false');
      btn.innerHTML = '&#9654;'; // ▶ closed
    } else {
      btn.setAttribute('aria-expanded', 'true');
      btn.innerHTML = '&#9660;'; // ▼ open
    }
    btn.addEventListener('click', e => { e.stopPropagation(); toggle(); });
    header.insertBefore(btn, header.firstChild);

    header.addEventListener('click', e => {
      // Ignore clicks on checkboxes or other interactive elements
      if (e.target === btn || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
      toggle();
    });

    function toggle() {
      const collapsed = card.classList.toggle('collapsed');
      btn.innerHTML = collapsed ? '&#9654;' : '&#9660;'; // ▶ closed / ▼ open
      btn.setAttribute('aria-expanded', String(!collapsed));
    }
  }

  function createNodeCard(node, indexLabel, indentLevel, workflowName) {
    if (!node || typeof node !== 'object') return null;

    const [, label]  = getNodeField(node, 'label', 'title', 'displayName');
    const type = nodeType(node);
    const [, status] = getNodeField(node, 'status', 'executionStatus', 'state');

    const statusKey   = flowStatusKey(status);
    const statusStyle = FLOW_STATUS_STYLES[statusKey];

    /* ── card shell ── */
    const card = document.createElement('div');
    card.className = 'flow-node-card';
    card.style.borderLeftColor = statusStyle.border;
    if (indentLevel > 0) {
      card.style.marginLeft = (indentLevel * currentSettings.subflowIndent) + 'px';
    }

    /* ── header ── */
    const header = document.createElement('div');
    header.className = 'flow-node-header';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';

    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = indexLabel + ' | ' + (label ? String(label) : (type ? String(type) : 'Node'));
    titleEl.title = titleEl.textContent;
    nameWrap.appendChild(titleEl);

    if (workflowName) {
      const wfEl = document.createElement('span');
      wfEl.className = 'flow-node-workflow';
      wfEl.textContent = workflowName;
      wfEl.title = 'Workflow: ' + workflowName;
      nameWrap.appendChild(wfEl);
    }

    header.appendChild(nameWrap);

    // Type: right-justified between title and status/checkbox (same line as title)
    if (type) {
      const typeEl = document.createElement('span');
      typeEl.className = 'flow-node-type';
      typeEl.textContent = String(type);
      typeEl.title = String(type);
      header.appendChild(typeEl);
    }

    if (status) {
      const badge = document.createElement('span');
      badge.className = 'flow-node-status';
      badge.textContent = String(status);
      badge.style.background = statusStyle.bg;
      badge.style.color      = statusStyle.color;
      header.appendChild(badge);
    }

    const nodePinPath = 'flow::nodes.' + indexLabel;
    const pinCb = document.createElement('input');
    pinCb.type = 'checkbox';
    pinCb.className = 'flow-pin-cb';
    pinCb.dataset.path = nodePinPath;
    pinCb.title = 'Pin node to dashboard';
    pinCb.checked = currentPins.includes(nodePinPath);
    pinCb.addEventListener('click', e => e.stopPropagation());
    pinCb.addEventListener('change', () => handlePinToggle(nodePinPath, pinCb.checked));

    // Node Augmentation: JSON popup button on every node card
    if (currentSettings.nodeAugmentationEnabled) {
      const augBtn = document.createElement('button');
      augBtn.className = 'node-aug-btn';
      augBtn.textContent = '{ }';
      augBtn.title = 'View node JSON';
      augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(indexLabel + ' | ' + (label || type), node, 'node'); });
      header.appendChild(augBtn);
    }

    // Node Highlighting: outline the matching canvas node
    if (currentSettings.nodeHighlightEnabled) {
      // Collect every long numeric value in the node object as a candidate canvas ref.
      // The canvas node's ref attribute matches one of these but we don't know which field.
      const candidateIds = [];
      Object.keys(node).forEach(k => {
        const v = node[k];
        const s = String(v);
        if ((typeof v === 'number' || typeof v === 'string') && /^\d{7,}$/.test(s)) {
          candidateIds.push(s);
        }
      });

      const [, nodeId] = getNodeField(node, 'nodeId', 'node_id', 'nodeID');
      const hlBtn = document.createElement('button');
      hlBtn.className = 'node-hl-btn';
      hlBtn.textContent = '◎';
      hlBtn.title = 'Highlight node in designer';
      hlBtn.style.setProperty('--hl-color', currentSettings.nodeHighlightColor);
      hlBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isActive = hlBtn.classList.contains('hl-active');
        // Deactivate any previously active button
        if (currentHlBtn && currentHlBtn !== hlBtn) {
          currentHlBtn.classList.remove('hl-active');
        }
        if (isActive) {
          hlBtn.classList.remove('hl-active');
          currentHlBtn = null;
          window.parent.postMessage({ type: 'AISERA_HIGHLIGHT_NODE', label: null, nodeId: null, candidateIds: [] }, '*');
        } else {
          hlBtn.classList.add('hl-active');
          currentHlBtn = hlBtn;
          window.parent.postMessage({
            type:         'AISERA_HIGHLIGHT_NODE',
            label:        label ? String(label) : null,
            nodeId:       nodeId ? String(nodeId) : null,
            candidateIds: candidateIds,
            color:        currentSettings.nodeHighlightColor,
          }, '*');
        }
      });
      header.appendChild(hlBtn);
    }

    // Checkbox is always the rightmost item
    header.appendChild(pinCb);

    card.appendChild(header);

    /* ── body ── */
    const body = document.createElement('div');
    body.className = 'flow-node-body';
    let hasContent = false;
    let errorBlockAdded = false;

    function addErrorBlock(text) {
      const block = document.createElement('div');
      block.className = 'card-error-block';
      block.textContent = text;
      // Insert before everything else in body
      body.insertBefore(block, body.firstChild);
      errorBlockAdded = true;
      hasContent = true;
    }

    // Action: show actionName badge row above input/output
    if (type === 'Action' && node.actionName) {
      renderSectionHead(body, 'Action');
      renderPropRow(body, 'name', String(node.actionName));
      hasContent = true;
    }

    // Input / Output sections
    const inputObj  = node.input  || node.inputs;
    const outputObj = node.output;

    // SetVariable: render each output entry as a "Set" row (key → value) without Input section
    if (type === 'SetVariable' && outputObj && typeof outputObj === 'object' && !Array.isArray(outputObj)) {
      const entries = Object.entries(outputObj);
      if (entries.length > 0) {
        renderSectionHead(body, 'Set');
        entries.forEach(([k, v]) => renderPropRow(body, k, v, { stacked: true }));
        hasContent = true;
      }
    } else {
      if (renderCardSection(body, 'Input',  inputObj))  hasContent = true;
      if (renderCardSection(body, 'Output', outputObj)) hasContent = true;
    }

    // Conditions (Switch node)
    const conditions = node.conditions;
    if (conditions && typeof conditions === 'object') {
      renderSectionHead(body, 'Conditions');
      if (Array.isArray(conditions)) {
        conditions.forEach((cond, i) => {
          const expr = (cond && (cond.expression || cond.condition || cond.expr || JSON.stringify(cond))) || String(i + 1);
          const matched = cond && (cond.matched === true || cond.isMatched === true);
          const row = document.createElement('div');
          row.className = 'card-prop-row';
          row.style.paddingLeft = '8px';
          const exprEl = document.createElement('span');
          exprEl.className = 'card-prop-val';
          exprEl.style.flex = '1';
          exprEl.textContent = String(expr);
          const badge = document.createElement('span');
          badge.style.cssText = 'font-size:10px;font-weight:600;padding:1px 7px;border-radius:20px;flex-shrink:0;' +
            (matched ? 'background:#dcfce7;color:#15803d;' : 'background:#f1f5f9;color:#6b7280;');
          badge.textContent = matched ? 'matched' : 'no';
          row.append(exprEl, badge);
          body.appendChild(row);
        });
      } else {
        renderCardSection(body, '', conditions);
      }
      hasContent = true;
    }

    // Other node-card fields: Node ID, Execution Time
    for (const [displayKey, alwaysShow, ...candidates] of NODE_CARD_FIELDS) {
      if (displayKey === 'Input' || displayKey === 'Output' || displayKey === 'Conditions') continue;

      let foundKey = null;
      for (const cand of candidates) {
        if (Object.prototype.hasOwnProperty.call(node, cand)) { foundKey = cand; break; }
        const ci = Object.keys(node).find(nk => nk.toLowerCase() === cand.toLowerCase());
        if (ci) { foundKey = ci; break; }
      }
      if (foundKey === null && !alwaysShow) continue;

      const val = foundKey !== null ? node[foundKey] : undefined;

      if (displayKey === 'Error') {
        if (hasErrorContent(val)) {
          const errText = typeof val === 'object' ? JSON.stringify(val, null, 2) : String(val);
          addErrorBlock(errText);
        }
        continue;
      }

      // Node ID and Execution Time: show as a small info row (no section head)
      if (val !== undefined && val !== null && val !== '') {
        renderPropRow(body, displayKey, val);
        hasContent = true;
      }
    }

    // Fallback error detection via semantic signals (e.g. output.success = false)
    if (!errorBlockAdded) {
      const nodeErrors = findErrors(node, '', 0, []);
      if (nodeErrors.length > 0) {
        const summary = nodeErrors
          .map(e => e.path + ' = ' + (e.value === null ? 'null' : String(e.value)))
          .join('\n');
        addErrorBlock(summary);
      }
    }

    if (hasContent) {
      card.appendChild(body);
      addCollapseToggle(card, header);
    }

    return card;
  }

  /**
   * Build a per-field-collapsible row and append it to `table`.
   * Extracted from createNodeCard so it can be reused by createSectionCard.
   */
  function buildFieldRow(table, displayKey, val) {
    val = tryUnescapeJson(val);

    // Truncated sentinel: render a minimal row with an expand button
    if (val && typeof val === 'object' && val.__aisera_truncated) {
      var sentinelRow = document.createElement('div');
      sentinelRow.className = 'flow-node-prop';
      var sentinelKey = document.createElement('span');
      sentinelKey.className = 'flow-node-prop-key';
      sentinelKey.textContent = displayKey;
      sentinelRow.appendChild(sentinelKey);
      var sentinelVal = document.createElement('div');
      sentinelVal.className = 'flow-node-prop-val';
      appendTruncatedPlaceholder(sentinelVal, val, 0);
      sentinelRow.appendChild(sentinelVal);
      table.appendChild(sentinelRow);
      return;
    }

    // Scalars: plain two-column row, no toggle needed
    const isScalar = val === null || val === undefined || typeof val !== 'object';
    if (isScalar) {
      const row = document.createElement('div');
      row.className = 'flow-node-prop';
      const keyEl = document.createElement('span');
      keyEl.className = 'flow-node-prop-key';
      keyEl.textContent = displayKey;
      const valEl = document.createElement('div');
      valEl.className = 'flow-node-prop-val';
      appendPrimitive(valEl, val);
      row.append(keyEl, valEl);
      table.appendChild(row);
      return;
    }

    const row = document.createElement('div');
    row.className = 'flow-node-prop';

    let valStr = '';
    try {
      valStr = JSON.stringify(val, null, 2);
    } catch {}

    const collapseThreshold = currentSettings.requestCollapseThreshold;
    const previewLen        = currentSettings.truncateLimit;
    const autoCollapse      = currentSettings.autoCollapseEnabled && valStr.length > collapseThreshold;

    const keyEl = document.createElement('span');
    keyEl.className = 'flow-node-prop-key flow-field-toggle';
    const icon = document.createElement('span');
    icon.className   = 'field-toggle-icon';
    icon.textContent = autoCollapse ? '\u25b6' : '\u25bc';
    keyEl.appendChild(icon);
    keyEl.appendChild(document.createTextNode('\u00a0' + displayKey));
    maybeAddJsonPopupBtn(keyEl, displayKey, val);

    const previewEl = document.createElement('div');
    previewEl.className = 'flow-node-prop-val field-preview';
    previewEl.textContent = valStr.length > previewLen ? valStr.slice(0, previewLen) + '\u2026' : valStr;
    previewEl.style.display = autoCollapse ? '' : 'none';

    const fullEl = document.createElement('div');
    fullEl.className = 'flow-node-prop-val';
    fullEl.style.display = autoCollapse ? 'none' : '';
    if (val !== null && val !== undefined && val !== '') {
      if (typeof val === 'object') renderCardValue(fullEl, val, 0);
      else appendPrimitive(fullEl, val);
    }

    const confirmEl = document.createElement('div');
    confirmEl.className = 'field-expand-confirm';
    confirmEl.style.display = 'none';
    confirmEl.innerHTML = '<span class="field-expand-confirm-msg">This field contains ' + valStr.length.toLocaleString() + ' characters. Load the full value?</span>';
    const yesBtn = document.createElement('button');
    yesBtn.className = 'field-expand-yes';
    yesBtn.textContent = 'Yes, load it';
    const noBtn = document.createElement('button');
    noBtn.className = 'field-expand-no';
    noBtn.textContent = 'Cancel';
    confirmEl.append(yesBtn, noBtn);
    row.appendChild(confirmEl);

    function doExpand()   { confirmEl.style.display = 'none'; previewEl.style.display = 'none'; fullEl.style.display = '';    icon.textContent = '\u25bc'; }
    function doCollapse() { fullEl.style.display = 'none'; confirmEl.style.display = 'none'; previewEl.style.display = autoCollapse ? '' : 'none'; icon.textContent = '\u25b6'; }

    yesBtn.addEventListener('click', e => { e.stopPropagation(); doExpand(); });
    noBtn.addEventListener('click',  e => { e.stopPropagation(); doCollapse(); });

    keyEl.addEventListener('click', () => {
      const isExpanded   = fullEl.style.display !== 'none';
      const isConfirming = confirmEl.style.display !== 'none';
      if (isExpanded)        doCollapse();
      else if (isConfirming) doCollapse();
      else if (autoCollapse) { previewEl.style.display = 'none'; confirmEl.style.display = ''; icon.textContent = '\u25bc'; }
      else                   { fullEl.style.display = ''; icon.textContent = '\u25bc'; }
    });

    row.append(keyEl, previewEl, fullEl);
    table.appendChild(row);
  }

  /**
   * Card for a controlled flow debug section (flowDebugInfo, error, etc.).
   * Renders each top-level key as a unified prop row.
   */
  function createSectionCard(label, value, pinPath, rawValue, sectionType) {
    const card = document.createElement('div');
    card.className = 'flow-node-card';
    card.style.borderLeftColor = '#d1d5db';

    const header = document.createElement('div');
    header.className = 'flow-node-header';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = label;
    titleEl.title = label;
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    const augBtn = document.createElement('button');
    augBtn.className = 'node-aug-btn';
    augBtn.textContent = '{ }';
    augBtn.title = 'View JSON';
    augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(label, rawValue !== undefined ? rawValue : value, sectionType || null); });
    header.appendChild(augBtn);

    const pinCb = document.createElement('input');
    pinCb.type = 'checkbox';
    pinCb.className = 'flow-pin-cb';
    pinCb.dataset.path = pinPath;
    pinCb.title = 'Pin to dashboard';
    pinCb.checked = currentPins.includes(pinPath);
    pinCb.addEventListener('click', e => e.stopPropagation());
    pinCb.addEventListener('change', () => handlePinToggle(pinPath, pinCb.checked));
    header.appendChild(pinCb);

    card.appendChild(header);

    if (value !== null && value !== undefined) {
      const body = document.createElement('div');
      body.className = 'flow-node-body';
      let hasContent = false;

      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach(k => { renderPropRow(body, k, value[k]); hasContent = true; });
      } else {
        // Array or primitive: render directly
        renderCardValue(body, value, 0);
        hasContent = true;
      }

      if (hasContent) {
        card.appendChild(body);
        addCollapseToggle(card, header);
      }
    }

    return card;
  }

  /**
   * Generic data card used by both Flow Debug (Other Data) and Debug Info.
   * Renders key as the title and value using unified prop rows.
   * pinPath is the string stored in currentPins.
   */
  function createDataCard(key, value, pinPath) {
    const card = document.createElement('div');
    card.className = 'flow-node-card';
    card.style.borderLeftColor = '#d1d5db';

    /* ── header ── */
    const header = document.createElement('div');
    header.className = 'flow-node-header';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = key;
    titleEl.title = key;
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    const augBtn = document.createElement('button');
    augBtn.className = 'node-aug-btn';
    augBtn.textContent = '{ }';
    augBtn.title = 'View JSON';
    augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(key, value); });
    header.appendChild(augBtn);

    const pinCb = document.createElement('input');
    pinCb.type = 'checkbox';
    pinCb.className = 'flow-pin-cb';
    pinCb.dataset.path = pinPath;
    pinCb.title = 'Pin to dashboard';
    pinCb.checked = currentPins.includes(pinPath);
    pinCb.addEventListener('click', e => e.stopPropagation());
    pinCb.addEventListener('change', () => handlePinToggle(pinPath, pinCb.checked));
    header.appendChild(pinCb);

    card.appendChild(header);

    /* ── body ── */
    if (value !== null && value !== undefined) {
      const body = document.createElement('div');
      body.className = 'flow-node-body';
      if (typeof value === 'object' && !Array.isArray(value)) {
        Object.keys(value).forEach(k => renderPropRow(body, k, value[k]));
      } else {
        renderCardValue(body, value, 0);
      }
      card.appendChild(body);
      addCollapseToggle(card, header);
    }

    return card;
  }

  /* ─── flow data extraction & subflow flattening ─────────────────── */

  /** Render nodes as hierarchical cards into container.
   *  parentLabel: null for top-level, or e.g. "9" for subflow → children become "9-1", "9-2"...
   *  indentLevel: 0 for top-level, increments for nested subflows. */
  function renderNodeHierarchy(container, nodes, parentLabel, indentLevel, subflowName) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach(function(node, i) {
      if (!node || typeof node !== 'object') return;
      var label = parentLabel ? parentLabel + '-' + (i + 1) : String(i + 1);
      // Top-level nodes: badge from AI Lens function groups (if present).
      // Sub-nodes: badge from the parent subflow's name passed down.
      var workflowName = subflowName || (parentLabel ? null : getWorkflowNameForIndex(label));
      var card = createNodeCard(node, label, indentLevel, workflowName);
      if (card) container.appendChild(card);
      // Recurse into child nodes. Only propagate a subflow name badge when we are
      // in multi-workflow mode (nodeWorkflowNameMap has 2+ distinct names). In
      // single-workflow responses the badge is suppressed entirely.
      if (node.nodes) {
        var inner = Array.isArray(node.nodes[0]) ? node.nodes[0] : node.nodes;
        if (Array.isArray(inner) && inner.length > 0) {
          var distinctNames = new Set(nodeWorkflowNameMap.values());
          var multiWorkflow = distinctNames.size >= 2;
          var childSubflowName = multiWorkflow ? (workflowName || null) : null;
          renderNodeHierarchy(container, inner, label, indentLevel + 1, childSubflowName);
        }
      }
    });
  }

  /** Count the top-level nodes in a workflowExecutionDetail-like object. */
  function topLevelNodeCount(flowObj) {
    if (!Array.isArray(flowObj.nodes) || flowObj.nodes.length === 0) return 0;
    const inner = Array.isArray(flowObj.nodes[0]) ? flowObj.nodes[0] : flowObj.nodes;
    return Array.isArray(inner) ? inner.length : 0;
  }

  /**
   * Extract executedFunctions from AI Lens JSON.
   * Returns [{name, nodes, flowData}] or [] if not present.
   */
  function buildFunctionGroups(jsonData) {
    if (!jsonData || typeof jsonData !== 'object') return [];
    var paths = [
      ['debugInfoV2', 'flowDebugInfo', 'hyperFlowExecutionDetail', 'executedFunctions'],
      ['flowDebugInfo', 'hyperFlowExecutionDetail', 'executedFunctions']
    ];
    var groups = [];
    for (var p = 0; p < paths.length; p++) {
      var obj = jsonData;
      var path = paths[p];
      var i;
      for (i = 0; i < path.length; i++) {
        if (!obj || typeof obj !== 'object') { obj = null; break; }
        obj = obj[path[i]];
      }
      if (!Array.isArray(obj) || obj.length === 0) continue;
      for (var j = 0; j < obj.length; j++) {
        var fn = obj[j];
        if (!fn || typeof fn !== 'object') continue;
        var name = fn.functionName || ('Function ' + (j + 1));
        var wd = fn.workflowExecutionDetail;
        if (!wd || typeof wd !== 'object') continue;
        var nodes = wd.nodes;
        if (Array.isArray(nodes) && nodes.length > 0 && Array.isArray(nodes[0])) {
          nodes = nodes[0];
        }
        if (!Array.isArray(nodes)) nodes = [];
        groups.push({ name: name, nodes: nodes, flowData: wd });
      }
      if (groups.length > 0) break;
    }
    return groups;
  }

  /**
   * Given a top-level node index label (e.g. "3" or "3-2"), return the workflow
   * name from currentFunctionGroups by counting cumulative node offsets.
   * Returns null when not in multi-function mode or label cannot be resolved.
   */
  function getWorkflowNameForIndex(indexLabel) {
    if (!nodeWorkflowNameMap.size) return null;
    // Only show workflow name badges when there are multiple distinct workflow names.
    // If all nodes map to the same name (single-workflow response), suppress the badge.
    var distinctNames = new Set(nodeWorkflowNameMap.values());
    if (distinctNames.size < 2) return null;
    var topIndex = parseInt(String(indexLabel).split('-')[0], 10);
    if (isNaN(topIndex) || topIndex < 1) return null;
    return nodeWorkflowNameMap.get(topIndex) || null;
  }

  /**
   * Build nodeWorkflowNameMap from the full session JSON.
   * Must be called before any renderFlowDebug() call so node cards can show workflow names.
   */
  function buildNodeWorkflowNameMap(jsonData, flowData) {
    nodeWorkflowNameMap = new Map();

    // AI Lens: executedFunctions live in flowData (the GET_FLOW_DEBUG result).
    // Try flowData first, then fall back to jsonData.
    var groups = [];
    if (flowData && typeof flowData === 'object') groups = buildFunctionGroups(flowData);
    if (groups.length === 0 && jsonData && typeof jsonData === 'object') groups = buildFunctionGroups(jsonData);

    if (groups.length > 0) {
      var idx = 0;
      for (var g = 0; g < groups.length; g++) {
        for (var n = 0; n < groups[g].nodes.length; n++) {
          nodeWorkflowNameMap.set(++idx, groups[g].name);
        }
      }
      return;
    }

    // Workflow-details / normal response: resolve the flow name then map all top-level nodes to it.
    // Search both jsonData and flowData for the name.
    var flowName = null;
    var namePaths = [
      ['debugInfoV2', 'flowDebugInfo', 'flowName'],
      ['flowDebugInfo', 'flowName'],
      ['debugInfoV2', 'flowDebugInfo', 'hyperFlowExecutionDetail', 'executedFunctions', 0, 'functionName'],
      ['flowDebugInfo', 'hyperFlowExecutionDetail', 'executedFunctions', 0, 'functionName'],
    ];
    var searchSources = [jsonData, flowData].filter(Boolean);
    outer: for (var s = 0; s < searchSources.length; s++) {
      for (var p = 0; p < namePaths.length; p++) {
        var val = searchSources[s];
        for (var k = 0; k < namePaths[p].length; k++) {
          val = val != null && typeof val === 'object' ? val[namePaths[p][k]] : undefined;
        }
        if (val && typeof val === 'string') { flowName = val; break outer; }
      }
    }

    if (flowName) {
      var srcForNodes = flowData || jsonData;
      var extracted = extractFlowDataFromJson(srcForNodes, 0);
      if (!extracted) extracted = extractFlowDataFromJson(jsonData, 0);
      if (extracted && extracted.nodes) {
        var nodeCount = Array.isArray(extracted.nodes[0]) ? extracted.nodes[0].length : extracted.nodes.length;
        for (var ni = 1; ni <= nodeCount; ni++) nodeWorkflowNameMap.set(ni, flowName);
      }
    }
  }

  /** Walk the full XHR JSON tree and return the workflowExecutionDetail
   *  (object with both "nodes" and "executionStatus") that has the most
   *  top-level nodes. Used on AI Lens where no React fiber data is available. */
  function extractFlowDataFromJson(obj, depth) {
    if ((depth || 0) > 12 || !obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
      let best = null;
      for (const item of obj) {
        const r = extractFlowDataFromJson(item, (depth || 0) + 1);
        if (r && (!best || topLevelNodeCount(r) > topLevelNodeCount(best))) best = r;
      }
      return best;
    }
    if (obj.nodes !== undefined && obj.executionStatus !== undefined) return obj;
    let best = null;
    for (const val of Object.values(obj)) {
      const r = extractFlowDataFromJson(val, (depth || 0) + 1);
      if (r && (!best || topLevelNodeCount(r) > topLevelNodeCount(best))) best = r;
    }
    return best;
  }

  /* ─── Executed Functions renderer ───────────────────────────────── */

  function createExecutedFunctionCard(fn, index, pinPath) {
    const name   = fn.functionName || ('Function ' + (index + 1));
    const fnId   = fn.functionId;
    const error  = (fn.error && String(fn.error).trim()) ? String(fn.error) : null;
    const input  = fn.inputParams;
    const result = fn.result !== undefined ? fn.result : null;
    const wd     = fn.workflowExecutionDetail || {};
    const status = wd.executionStatus || null;

    const statusKey   = flowStatusKey(status);
    const statusStyle = FLOW_STATUS_STYLES[statusKey];

    const card = document.createElement('div');
    card.className = 'flow-node-card exec-fn-card';
    card.style.borderLeftColor = error ? '#b91c1c' : statusStyle.border;

    /* header */
    const header = document.createElement('div');
    header.className = 'flow-node-header';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = name;
    titleEl.title = name;
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    if (fnId !== undefined && fnId !== null) {
      const idEl = document.createElement('span');
      idEl.className = 'flow-node-type';
      idEl.textContent = 'id:' + fnId;
      idEl.title = 'id:' + fnId;
      header.appendChild(idEl);
    }

    if (status) {
      const badge = document.createElement('span');
      badge.className = 'flow-node-status';
      badge.textContent = status;
      badge.style.background = statusStyle.bg;
      badge.style.color      = statusStyle.color;
      header.appendChild(badge);
    }

    if (error) {
      const errBadge = document.createElement('span');
      errBadge.className = 'flow-node-status';
      errBadge.textContent = 'error';
      errBadge.style.background = '#fef2f2';
      errBadge.style.color      = '#b91c1c';
      header.appendChild(errBadge);
    }

    const augBtnFn = document.createElement('button');
    augBtnFn.className = 'node-aug-btn';
    augBtnFn.textContent = '{ }';
    augBtnFn.title = 'View JSON';
    augBtnFn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup(name, fn, 'executedFunction'); });
    header.appendChild(augBtnFn);

    if (pinPath) {
      const pinCb = document.createElement('input');
      pinCb.type = 'checkbox';
      pinCb.className = 'flow-pin-cb';
      pinCb.dataset.path = pinPath;
      pinCb.title = 'Pin to dashboard';
      pinCb.checked = currentPins.includes(pinPath);
      pinCb.addEventListener('click', e => e.stopPropagation());
      pinCb.addEventListener('change', () => handlePinToggle(pinPath, pinCb.checked));
      header.appendChild(pinCb);
    }

    card.appendChild(header);

    /* body */
    const body = document.createElement('div');
    body.className = 'flow-node-body exec-fn-body';

    // Input section
    renderCardSection(body, 'Input', input);

    // Output section
    if (result !== null && result !== undefined && result !== '') {
      const obj = (typeof result === 'object' && !Array.isArray(result)) ? result : { result };
      renderCardSection(body, 'Output', obj);
    }

    // Error block
    if (error) {
      renderSectionHead(body, 'Error', 'error');
      const block = document.createElement('div');
      block.className = 'card-error-block';
      block.textContent = error;
      body.appendChild(block);
    }

    if (body.children.length > 0) {
      card.appendChild(body);
      addCollapseToggle(card, header);
    }

    return card;
  }

  /* ─── LLM Calls card builder ────────────────────────────────────── */

  const LLM_FINISH_STYLES = {
    'stop':           { bg: '#dcfce7', color: '#15803d', border: '#15803d' },
    'tool_execution': { bg: '#eff6ff', color: '#1d4ed8', border: '#1d4ed8' },
    'max_tokens':     { bg: '#fef9c3', color: '#a16207', border: '#d97706' },
    'error':          { bg: '#fef2f2', color: '#b91c1c', border: '#b91c1c' },
  };

  function llmFinishStyle(reason) {
    const key = (reason || '').toLowerCase().replace(/_/g, '_');
    return LLM_FINISH_STYLES[key] || { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' };
  }

  function createLlmCallCard(call, index, pinPath) {
    const latency     = call.latency;
    const response    = call.response || {};
    const finishReason = response.finishReason || '';
    const tokenUsage  = response.tokenUsage || {};
    const responseText = (response.content && typeof response.content.text === 'string') ? response.content.text : '';
    const messages    = Array.isArray(call.messages) ? call.messages : [];
    const style       = llmFinishStyle(finishReason);

    const card = document.createElement('div');
    card.className = 'flow-node-card llm-call-card';
    card.style.borderLeftColor = style.border;

    /* header */
    const header = document.createElement('div');
    header.className = 'flow-node-header';

    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = 'LLM Call ' + (index + 1);
    titleEl.title = titleEl.textContent;
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    if (finishReason) {
      const frBadge = document.createElement('span');
      frBadge.className = 'llm-finish-badge';
      frBadge.textContent = finishReason;
      frBadge.style.background = style.bg;
      frBadge.style.color      = style.color;
      header.appendChild(frBadge);
    }

    if (latency !== undefined && latency !== null) {
      const latEl = document.createElement('span');
      latEl.className = 'llm-stat';
      latEl.textContent = latency + 'ms';
      latEl.title = 'Latency';
      header.appendChild(latEl);
    }

    if (tokenUsage.totalTokenCount !== undefined) {
      const tokEl = document.createElement('span');
      tokEl.className = 'llm-stat';
      tokEl.textContent = (tokenUsage.inputTokenCount || 0) + '\u2192' + (tokenUsage.outputTokenCount || 0) + ' tok';
      tokEl.title = 'Input: ' + (tokenUsage.inputTokenCount || 0) + ' | Output: ' + (tokenUsage.outputTokenCount || 0) + ' | Total: ' + (tokenUsage.totalTokenCount || 0);
      header.appendChild(tokEl);
    }

    card.appendChild(header);

    /* body: messages */
    const body = document.createElement('div');
    body.className = 'flow-node-body llm-call-body';

    let seenSystem = false;

    messages.forEach((msg) => {
      /* Tool call: LLM requested a function */
      const toolReqs = msg.toolExecutionRequests || msg.toolCalls || [];
      if (Array.isArray(toolReqs) && toolReqs.length > 0) {
        toolReqs.forEach(req => {
          const fnName = req.name || (req.function && req.function.name) || '?';
          const args   = req.arguments || req.args || (req.function && req.function.arguments);
          const row = document.createElement('div');
          row.className = 'llm-msg llm-msg-tool-call';
          const icon = document.createElement('span');
          icon.className = 'llm-msg-icon';
          icon.textContent = '\u2192';
          const nameEl = document.createElement('span');
          nameEl.className = 'llm-fn-name';
          nameEl.textContent = fnName;
          row.appendChild(icon);
          row.appendChild(nameEl);
          if (args) {
            const argsStr = typeof args === 'string' ? args : JSON.stringify(args);
            if (argsStr.length <= 200) {
              const argsEl = document.createElement('span');
              argsEl.className = 'llm-fn-args';
              argsEl.textContent = '(' + argsStr + ')';
              row.appendChild(argsEl);
            }
          }
          body.appendChild(row);
        });
        return;
      }

      /* User message: has contents array */
      if (Array.isArray(msg.contents) && msg.contents.length > 0) {
        const text = msg.contents.map(c => c.text || '').join(' ').trim();
        const row = document.createElement('div');
        row.className = 'llm-msg llm-msg-user';
        const icon = document.createElement('span');
        icon.className = 'llm-msg-icon';
        icon.textContent = '\ud83d\udc64';
        const textEl = document.createElement('span');
        textEl.className = 'llm-msg-text';
        textEl.textContent = text.length > 300 ? text.slice(0, 300) + '\u2026' : text;
        row.appendChild(icon);
        row.appendChild(textEl);
        body.appendChild(row);
        return;
      }

      /* Text-only messages: first = system prompt, rest = tool results */
      if (msg.text !== undefined && msg.text !== null) {
        const text = String(msg.text);
        if (!seenSystem) {
          seenSystem = true;
          const row = document.createElement('div');
          row.className = 'llm-msg llm-msg-system';
          const icon = document.createElement('span');
          icon.className = 'llm-msg-icon';
          icon.textContent = '\u2699';
          row.appendChild(icon);
          const container = document.createElement('span');
          container.className = 'llm-msg-text';
          if (text.length > currentSettings.itemSizeLimit) {
            appendTruncatedPlaceholder(container, { __aisera_truncated: true, __charCount: text.length, __originalValue: text }, 0);
          } else {
            container.textContent = text.length > 300 ? text.slice(0, 300) + '\u2026' : text;
          }
          row.appendChild(container);
          body.appendChild(row);
        } else {
          const row = document.createElement('div');
          row.className = 'llm-msg llm-msg-tool-result';
          const icon = document.createElement('span');
          icon.className = 'llm-msg-icon';
          icon.textContent = '\u2190';
          const textEl = document.createElement('span');
          textEl.className = 'llm-msg-text';
          textEl.textContent = text.length > 200 ? text.slice(0, 200) + '\u2026' : text;
          row.appendChild(icon);
          row.appendChild(textEl);
          body.appendChild(row);
        }
      }
    });

    /* LLM final response text */
    if (responseText) {
      const row = document.createElement('div');
      row.className = 'llm-msg llm-msg-response';
      const icon = document.createElement('span');
      icon.className = 'llm-msg-icon';
      icon.textContent = '\ud83e\udd16';
      const textEl = document.createElement('span');
      textEl.className = 'llm-msg-text';
      textEl.textContent = responseText.length > 400 ? responseText.slice(0, 400) + '\u2026' : responseText;
      row.appendChild(icon);
      row.appendChild(textEl);
      body.appendChild(row);
    }

    const augBtnLlm = document.createElement('button');
    augBtnLlm.className = 'node-aug-btn';
    augBtnLlm.textContent = '{ }';
    augBtnLlm.title = 'View JSON';
    augBtnLlm.addEventListener('click', e => { e.stopPropagation(); openJsonPopup('LLM Call ' + (index + 1), call); });
    header.appendChild(augBtnLlm);

    if (pinPath) {
      const pinCb = document.createElement('input');
      pinCb.type = 'checkbox';
      pinCb.className = 'flow-pin-cb';
      pinCb.dataset.path = pinPath;
      pinCb.title = 'Pin to dashboard';
      pinCb.checked = currentPins.includes(pinPath);
      pinCb.addEventListener('click', e => e.stopPropagation());
      pinCb.addEventListener('change', () => handlePinToggle(pinPath, pinCb.checked));
      header.appendChild(pinCb);
    }

    if (body.children.length > 0) {
      card.appendChild(body);
      addCollapseToggle(card, header);
    }

    return card;
  }

  /* ─── Durations renderer ─────────────────────────────────────────── */

  // Build the durations card DOM. Does not append anything to the document.
  function buildDurationsCard(durations) {
    const card = document.createElement('div');
    card.className = 'flow-node-card';

    const header = document.createElement('div');
    header.className = 'flow-node-header';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = 'Durations';
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    const augBtnDur = document.createElement('button');
    augBtnDur.className = 'node-aug-btn';
    augBtnDur.textContent = '{ }';
    augBtnDur.title = 'View JSON';
    augBtnDur.addEventListener('click', e => { e.stopPropagation(); openJsonPopup('Durations', durations); });
    header.appendChild(augBtnDur);

    const pinCbDur = document.createElement('input');
    pinCbDur.type = 'checkbox';
    pinCbDur.className = 'flow-pin-cb';
    pinCbDur.dataset.path = PIN_DURATIONS;
    pinCbDur.title = 'Pin to dashboard';
    pinCbDur.checked = currentPins.includes(PIN_DURATIONS);
    pinCbDur.addEventListener('click', e => e.stopPropagation());
    pinCbDur.addEventListener('change', () => handlePinToggle(PIN_DURATIONS, pinCbDur.checked));
    header.appendChild(pinCbDur);

    // Use flow-node-body so .flow-node-card.collapsed hides it correctly.
    // Do NOT set display via inline style — the CSS collapse rule uses display:none
    // and an inline display:block would win on specificity.
    const body = document.createElement('div');
    body.className = 'flow-node-body';
    body.style.padding = '8px 10px';

    let firstSection = true;

    // decision_engine: {query: value} — single row
    if (durations.decision_engine && typeof durations.decision_engine === 'object') {
      const deKeys = Object.keys(durations.decision_engine);
      if (deKeys.length > 0) {
        appendDurHeading(body, 'Decision Engine', firstSection);
        firstSection = false;
        appendDurRow(body, 'duration', durations.decision_engine[deKeys[0]]);
      }
    }

    // search: {search_type: {query: {metric: value}}} — skip query level
    if (durations.search && typeof durations.search === 'object') {
      appendDurHeading(body, 'Search', firstSection);
      firstSection = false;
      for (const sType of Object.keys(durations.search)) {
        const sTypeVal = durations.search[sType];
        if (!sTypeVal || typeof sTypeVal !== 'object') continue;
        const queryKeys = Object.keys(sTypeVal);
        if (queryKeys.length === 0) continue;
        const metrics = sTypeVal[queryKeys[0]];
        if (!metrics || typeof metrics !== 'object') continue;
        for (const mKey of Object.keys(metrics)) {
          const label = sType.replace(/_/g, ' ') + '  ' + mKey.replace(/_/g, ' ');
          appendDurRow(body, label, metrics[mKey]);
        }
      }
    }

    card.appendChild(header);
    card.appendChild(body);
    addCollapseToggle(card, header);
    return card;
  }

  // Build and append the durations card to flowdebugContainer.
  function renderDurationsCard(durations) {
    const card = buildDurationsCard(durations);
    const secTitle = document.createElement('div');
    secTitle.className = 'flow-section-title';
    secTitle.textContent = 'Durations';
    flowdebugContainer.appendChild(secTitle);
    flowdebugContainer.appendChild(card);
  }

  function appendDurHeading(body, text, isFirst) {
    const el = document.createElement('div');
    el.style.cssText = 'font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--text-muted); margin:' + (isFirst ? '2px' : '10px') + ' 0 4px;';
    el.textContent = text;
    body.appendChild(el);
  }

  function appendDurRow(body, labelText, val) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; justify-content:space-between; align-items:baseline; padding:2px 0; border-bottom:1px solid var(--border-light, #f3f4f6); font-size:12px; gap:8px;';

    const labelEl = document.createElement('span');
    labelEl.style.cssText = 'color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;';
    labelEl.textContent = labelText;

    const valEl = document.createElement('span');
    valEl.style.cssText = 'font-variant-numeric:tabular-nums; font-weight:600; white-space:nowrap; color:var(--text);';
    valEl.textContent = typeof val === 'number' ? val.toFixed(3) + ' s' : String(val);

    row.appendChild(labelEl);
    row.appendChild(valEl);
    body.appendChild(row);
  }

  /* ─── AI Lens Summary card ───────────────────────────────────────── */

  function buildAiLensSummaryCard(forceExpanded) {
    const di = getValueAtPath(currentJsonData, 'debugInfoV2');
    if (!di || typeof di !== 'object') return null;

    const card = document.createElement('div');
    card.className = 'flow-node-card';
    card.style.borderLeftColor = '#4f46e5';

    const header = document.createElement('div');
    header.className = 'flow-node-header';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = 'AI Lens Summary';
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    const augBtn = document.createElement('button');
    augBtn.className = 'node-aug-btn';
    augBtn.textContent = '{ }';
    augBtn.title = 'View JSON';
    augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup('AI Lens Summary', di, 'aiLensSummary'); });
    header.appendChild(augBtn);

    const pinCbAls = document.createElement('input');
    pinCbAls.type = 'checkbox';
    pinCbAls.className = 'flow-pin-cb';
    pinCbAls.dataset.path = PIN_AI_LENS_SUMMARY;
    pinCbAls.title = 'Pin to dashboard';
    pinCbAls.checked = currentPins.includes(PIN_AI_LENS_SUMMARY);
    pinCbAls.addEventListener('click', e => e.stopPropagation());
    pinCbAls.addEventListener('change', () => handlePinToggle(PIN_AI_LENS_SUMMARY, pinCbAls.checked));
    header.appendChild(pinCbAls);

    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'flow-node-body';
    body.style.padding = '8px 10px';

    // ── Request ──────────────────────────────────────────────────────
    renderSectionHead(body, 'Request');
    const req = di.request || '';
    const trans = di.translatedRequest || '';
    renderPropRow(body, '', req, { stacked: true });
    if (trans && trans !== req) renderPropRow(body, 'Translated', trans, { stacked: true });

    // ── Flow Execution ───────────────────────────────────────────────
    const fdi = di.flowDebugInfo;
    if (fdi && typeof fdi === 'object') {
      renderSectionHead(body, 'Flow Execution');
      const flowName = fdi.name || fdi.flowName || '';
      if (flowName) renderPropRow(body, 'Agent / Flow', flowName, { stacked: true });
      if (fdi.flowExecutionId != null) renderPropRow(body, 'Execution ID', fdi.flowExecutionId, { stacked: true });
      if (fdi.status) {
        const sk2 = flowStatusKey(fdi.status);
        const ss  = FLOW_STATUS_STYLES[sk2];
        const row = document.createElement('div');
        row.className = 'card-prop-row';
        const kEl = document.createElement('span');
        kEl.className = 'card-prop-key';
        kEl.textContent = 'Status';
        const badge = document.createElement('span');
        badge.className = 'flow-node-status';
        badge.textContent = fdi.status;
        badge.style.background = ss.bg;
        badge.style.color      = ss.color;
        row.append(kEl, badge);
        body.appendChild(row);
      }
    }

    // ── Functions Called ─────────────────────────────────────────────
    const hfed = fdi && typeof fdi === 'object' ? fdi.hyperFlowExecutionDetail : null;
    if (hfed && typeof hfed === 'object') {
      const funcs = Array.isArray(hfed.executedFunctions) ? hfed.executedFunctions : [];
      if (funcs.length > 0) {
        renderSectionHead(body, 'Functions Called');
        funcs.forEach(fn => {
          const errStr = fn.error && String(fn.error).trim() ? String(fn.error) : null;
          if (errStr) {
            renderPropRow(body, fn.functionName || '?', errStr, { stacked: true, errorStyle: true });
          } else {
            renderPropRow(body, fn.functionName || '?', '', {});
          }
        });
      }
    }

    // ── Pipeline ─────────────────────────────────────────────────────
    const aiBlock = di.ai || {};
    const executed = aiBlock.executedNluPipelines;
    const selected = aiBlock.policySelectedPipelines;
    if ((executed && executed.length) || (selected && selected.length)) {
      renderSectionHead(body, 'Pipeline');
      if (executed && executed.length) renderPropRow(body, 'Executed', executed.join(', '), { stacked: true });
      if (selected && selected.length) {
        const mismatch = JSON.stringify(executed) !== JSON.stringify(selected);
        const configuredText = selected.join(', ') + (mismatch ? ' ⚠' : '');
        renderPropRow(body, 'Configured', configuredText, { stacked: true, ...(mismatch ? { warnStyle: true } : {}) });
        if (mismatch) {
          const lastChild = body.lastElementChild;
          const valEl = lastChild && lastChild.querySelector('.card-prop-val');
          if (valEl) valEl.style.color = '#b45309';
        }
      }
    }

    // ── Handler ──────────────────────────────────────────────────────
    const conv = di.conversation || {};
    const handlerInfo = conv.handlerInfo;
    if (handlerInfo && typeof handlerInfo === 'object') {
      renderSectionHead(body, 'Handler');
      Object.entries(handlerInfo).forEach(([hName, hVal]) => {
        const latency = hVal && typeof hVal === 'object' ? hVal.latency : null;
        renderPropRow(body, hName, latency != null ? latency + ' ms' : '', { stacked: true });
      });
    }

    // ── Decision Engine ──────────────────────────────────────────────
    const de = getValueAtPath(di, 'ai.convAiV2.debug_info.decision_engine');
    if (de && typeof de === 'object') {
      renderSectionHead(body, 'Decision Engine');
      Object.entries(de).forEach(([query, decisions]) => {
        if (!Array.isArray(decisions) || decisions.length === 0) return;
        decisions.forEach(d => {
          const docs = Array.isArray(d.doc_titles) ? d.doc_titles.join(', ') : '';
          renderPropRow(body, d.decision || '?', docs || query, { stacked: true });
        });
      });
    }

    if (hfed && typeof hfed === 'object') {
      // Prompt injection
      if (hfed.injectionDetectionResult === true) {
        renderSectionHead(body, 'Security', 'error');
        renderPropRow(body, 'Injection Detected', 'YES', { errorStyle: true });
        if (hfed.injectionDetectionReasoning) {
          renderPropRow(body, 'Reasoning', hfed.injectionDetectionReasoning, { stacked: true });
        }
      }

      // Model info
      const mi = hfed.modelInfo;
      if (mi && typeof mi === 'object' && Object.keys(mi).length > 0) {
        renderSectionHead(body, 'Model');
        if (mi.modelProvider) renderPropRow(body, 'Provider', mi.modelProvider, { stacked: true });
        const modelStr = [mi.modelName, mi.modelVersion].filter(Boolean).join(' ');
        if (modelStr) renderPropRow(body, 'Model', modelStr, { stacked: true });
        if (mi.temperature != null) renderPropRow(body, 'Temperature', mi.temperature, { stacked: true });
      }

      // LLM token usage summary across all llmCalls
      const llmCalls = Array.isArray(hfed.llmCalls) ? hfed.llmCalls : [];
      if (llmCalls.length > 0) {
        let totalPrompt = 0, totalCompletion = 0, totalLatency = 0;
        llmCalls.forEach(c => {
          const tu = c.response && c.response.tokenUsage;
          if (tu) {
            totalPrompt     += tu.inputTokenCount  || 0;
            totalCompletion += tu.outputTokenCount || 0;
          }
          totalLatency += c.latency || 0;
        });
        renderSectionHead(body, 'LLM Usage (' + llmCalls.length + ' calls)');
        renderPropRow(body, 'Total Latency', totalLatency + ' ms', { stacked: true });
        if (totalPrompt || totalCompletion) {
          renderPropRow(body, 'Tokens In / Out', totalPrompt + ' / ' + totalCompletion, { stacked: true });
        }
      }
    }

    // ── latencyInMS ──────────────────────────────────────────────────
    const lat = conv.latencyInMS;
    if (lat && typeof lat === 'object') {
      renderSectionHead(body, 'Latency');
      const total = lat.total;
      if (total != null) renderPropRow(body, 'Total', total + ' ms', { stacked: true });
      Object.entries(lat).forEach(([k, v]) => {
        if (k === 'total') return;
        renderPropRow(body, k, v + ' ms', { stacked: true });
      });
    }

    // ── Warnings ─────────────────────────────────────────────────────
    const warnings = getValueAtPath(di, 'ai.convAiV2.warnings');
    if (warnings && typeof warnings === 'object' && Object.keys(warnings).length > 0) {
      renderSectionHead(body, 'Warnings', 'warning');
      Object.entries(warnings).forEach(([category, msgs]) => {
        if (!msgs || typeof msgs !== 'object') return;
        Object.entries(msgs).forEach(([wKey, wMsg]) => {
          const row = document.createElement('div');
          row.style.cssText = 'padding:3px 0; border-bottom:1px solid var(--border-light,#fef3c7);';
          const kEl = document.createElement('div');
          kEl.style.cssText = 'font-size:10px; font-weight:700; color:#b45309; text-transform:uppercase; margin-bottom:1px;';
          kEl.textContent = wKey;
          const vEl = document.createElement('div');
          vEl.style.cssText = 'font-size:11px; color:#92400e; word-break:break-word; white-space:pre-wrap;';
          vEl.textContent = String(wMsg).slice(0, 300) + (String(wMsg).length > 300 ? '…' : '');
          row.append(kEl, vEl);
          body.appendChild(row);
        });
      });
    }

    // ── IDs ───────────────────────────────────────────────────────────
    const sessionId = getValueAtPath(currentJsonData, 'sessionId');
    const hasIds = di.traceId || sessionId != null;
    if (hasIds) {
      renderSectionHead(body, 'IDs');
      if (di.traceId) renderPropRow(body, 'Trace ID', di.traceId, { stacked: true });
      if (sessionId != null) renderPropRow(body, 'Session ID', sessionId, { stacked: true });
    }

    if (body.children.length > 0) {
      card.appendChild(body);
      addCollapseToggle(card, header, forceExpanded);
    }

    return card;
  }

  function renderAiLensSummaryCard() {
    const card = buildAiLensSummaryCard();
    if (!card) return false;
    const secTitle = document.createElement('div');
    secTitle.className = 'flow-section-title';
    secTitle.textContent = 'AI Lens Summary';
    flowdebugContainer.appendChild(secTitle);
    flowdebugContainer.appendChild(card);
    return true;
  }

  /* ─── Workflow Summary card ──────────────────────────────────────── */

  function buildWorkflowSummaryCard(forceExpanded) {
    // On workflow-details pages the execution detail lives inside the main JSON;
    // currentFlowData is null. Fall back to debugInfoV2.flowDebugInfo.workflowExecutionDetail.
    let fd = currentFlowData;
    let flowName   = '';
    let flowExecId = null;
    let defId      = null;

    if (!fd || typeof fd !== 'object') {
      const wd = getValueAtPath(currentJsonData, 'debugInfoV2.flowDebugInfo.workflowExecutionDetail');
      if (!wd || typeof wd !== 'object') return null;
      fd = wd;
      flowName   = getValueAtPath(currentJsonData, 'debugInfoV2.flowDebugInfo.flowName') || '';
      flowExecId = currentJsonData && currentJsonData.flowExecutionId != null ? currentJsonData.flowExecutionId : null;
      defId      = getValueAtPath(currentJsonData, 'debugInfoV2.flowDebugInfo.flowDefinitionId') || null;
    } else {
      flowName   = fd.flowName || fd.name || getValueAtPath(fd, 'attributes.name') || '';
      flowExecId = fd.flowExecutionId || null;
      defId      = fd.flowDefinitionId || null;
    }

    const nodes = Array.isArray(fd.nodes) ? fd.nodes : [];
    const execStatus = fd.executionStatus || fd.status || null;
    if (!execStatus && nodes.length === 0 && !flowName) return null;

    const sk    = flowStatusKey(execStatus);
    const ss    = FLOW_STATUS_STYLES[sk];

    const card = document.createElement('div');
    card.className = 'flow-node-card';
    card.style.borderLeftColor = ss.border;

    const header = document.createElement('div');
    header.className = 'flow-node-header';
    const nameWrap = document.createElement('div');
    nameWrap.className = 'flow-node-name-wrap';
    const titleEl = document.createElement('span');
    titleEl.className = 'flow-node-name';
    titleEl.textContent = 'Workflow Summary';
    nameWrap.appendChild(titleEl);
    header.appendChild(nameWrap);

    if (execStatus) {
      const badge = document.createElement('span');
      badge.className = 'flow-node-status';
      badge.textContent = execStatus;
      badge.style.background = ss.bg;
      badge.style.color      = ss.color;
      header.appendChild(badge);
    }

    const augBtn = document.createElement('button');
    augBtn.className = 'node-aug-btn';
    augBtn.textContent = '{ }';
    augBtn.title = 'View JSON';
    augBtn.addEventListener('click', e => { e.stopPropagation(); openJsonPopup('Workflow Summary', fd, 'workflowSummary'); });
    header.appendChild(augBtn);

    const pinCbWfs = document.createElement('input');
    pinCbWfs.type = 'checkbox';
    pinCbWfs.className = 'flow-pin-cb';
    pinCbWfs.dataset.path = PIN_WORKFLOW_SUMMARY;
    pinCbWfs.title = 'Pin to dashboard';
    pinCbWfs.checked = currentPins.includes(PIN_WORKFLOW_SUMMARY);
    pinCbWfs.addEventListener('click', e => e.stopPropagation());
    pinCbWfs.addEventListener('change', () => handlePinToggle(PIN_WORKFLOW_SUMMARY, pinCbWfs.checked));
    header.appendChild(pinCbWfs);

    card.appendChild(header);

    const body = document.createElement('div');
    body.className = 'flow-node-body';
    body.style.padding = '8px 10px';

    // ── Identity ─────────────────────────────────────────────────────
    renderSectionHead(body, 'Execution');
    if (flowName) renderPropRow(body, 'Flow', flowName, { stacked: true });
    if (execStatus) {
      const sk2 = flowStatusKey(execStatus);
      const ss2  = FLOW_STATUS_STYLES[sk2];
      const row = document.createElement('div');
      row.className = 'card-prop-row';
      const kEl = document.createElement('span');
      kEl.className = 'card-prop-key';
      kEl.textContent = 'Status';
      const badge = document.createElement('span');
      badge.className = 'flow-node-status';
      badge.textContent = execStatus;
      badge.style.background = ss2.bg;
      badge.style.color      = ss2.color;
      row.append(kEl, badge);
      body.appendChild(row);
    }
    if (flowExecId != null) renderPropRow(body, 'Execution ID', flowExecId, { stacked: true });
    if (defId) renderPropRow(body, 'Definition ID', defId, { stacked: true });

    // ── Node stats ───────────────────────────────────────────────────
    if (nodes.length > 0) {
      // Flatten all nodes (skip subflows for counting)
      function flattenNodes(arr) {
        let out = [];
        const normalized = (arr.length > 0 && Array.isArray(arr[0])) ? arr[0] : arr;
        normalized.forEach(n => {
          if (!n || typeof n !== 'object') return;
          out.push(n);
        });
        return out;
      }
      const flat = flattenNodes(nodes);
      const failed = flat.filter(n => {
        const err = n.error || n.exception || n.errorMessage;
        return err && String(err).trim();
      });

      renderSectionHead(body, 'Nodes');
      renderPropRow(body, 'Total', flat.length, { stacked: true });
      if (failed.length > 0) {
        const fRow = document.createElement('div');
        fRow.className = 'card-prop-row';
        const fk = document.createElement('span');
        fk.className = 'card-prop-key';
        fk.textContent = 'Failed';
        const fv = document.createElement('span');
        fv.className = 'card-prop-val';
        fv.style.color = '#b91c1c';
        fv.style.fontWeight = '700';
        fv.textContent = String(failed.length);
        fRow.append(fk, fv);
        body.appendChild(fRow);
      }

      // ── Failed node details ─────────────────────────────────────────
      if (failed.length > 0) {
        renderSectionHead(body, 'Errors', 'error');
        failed.forEach((n, i) => {
          const err  = n.error || n.exception || n.errorMessage || '';
          const name = n.label || n.name || n.type || ('Node ' + (i + 1));
          const kEl = document.createElement('div');
          kEl.style.cssText = 'font-size:11px; font-weight:700; color:#b91c1c; margin-top:' + (i > 0 ? '6px' : '2px') + ';';
          kEl.textContent = name;
          body.appendChild(kEl);
          const vEl = document.createElement('div');
          vEl.style.cssText = 'font-size:11px; color:#7f1d1d; word-break:break-word; white-space:pre-wrap; margin-bottom:2px;';
          const errStr = typeof err === 'object' ? JSON.stringify(err) : String(err);
          vEl.textContent = errStr.slice(0, 300) + (errStr.length > 300 ? '…' : '');
          body.appendChild(vEl);
        });
      }
    }

    // ── Output Variables ─────────────────────────────────────────────
    // outputVariables is present on AI Lens flow data; on workflow-details the
    // outcome lives in attributes. Show whichever is available.
    const outputVars = fd.outputVariables || null;
    const attrs = fd.attributes || null;
    if (outputVars && typeof outputVars === 'object') {
      const hasContent = Object.values(outputVars).some(v =>
        v && typeof v === 'object' ? Object.keys(v).length > 0 : v != null && v !== ''
      );
      if (hasContent) {
        renderSectionHead(body, 'Output Variables');
        Object.entries(outputVars).forEach(([k, v]) => renderPropRow(body, k, v, { stacked: true }));
      }
    } else if (attrs && typeof attrs === 'object') {
      const SKIP_ATTR = new Set(['channelCapabilities', 'conversationContext', 'flowUser', 'sessionVars']);
      const attrEntries = Object.entries(attrs).filter(([k, v]) =>
        !SKIP_ATTR.has(k) && v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
      );
      if (attrEntries.length > 0) {
        renderSectionHead(body, 'Output');
        attrEntries.forEach(([k, v]) => renderPropRow(body, k, v, { stacked: true }));
      }
    }

    if (body.children.length > 0) {
      card.appendChild(body);
      addCollapseToggle(card, header, forceExpanded);
    }

    return card;
  }

  function renderWorkflowSummaryCard() {
    const card = buildWorkflowSummaryCard();
    if (!card) return false;
    const secTitle = document.createElement('div');
    secTitle.className = 'flow-section-title';
    secTitle.textContent = 'Workflow Summary';
    flowdebugContainer.appendChild(secTitle);
    flowdebugContainer.appendChild(card);
    return true;
  }

  // Dispatch dedicated section renderers; push to notShown if data isn't found.
  function renderDedicatedSection(id, notShown, label) {
    if (id === 'aiLensSummary') {
      if (currentPageType === 'workflow-details') {
        notShown.push({ label, status: 'hidden' });
      } else if (!renderAiLensSummaryCard()) {
        notShown.push({ label, status: 'missing' });
      }
      return;
    } else if (id === 'workflowSummary') {
      notShown.push({ label, status: 'hidden' });
      return;
    } else if (id === 'executedFunctions') {
      const fnPaths = [
        'debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail.executedFunctions',
        'flowDebugInfo.hyperFlowExecutionDetail.executedFunctions',
      ];
      let funcs = null;
      for (const p of fnPaths) {
        const v = getValueAtPath(currentJsonData, p);
        if (Array.isArray(v) && v.length > 0) { funcs = v; break; }
      }
      if (!funcs) { notShown.push({ label, status: 'missing' }); return; }

      // Count total including nested subflows for the section title
      function countSubflowsInNodes(nodesRaw) {
        const nodes = (Array.isArray(nodesRaw) && nodesRaw.length > 0 && Array.isArray(nodesRaw[0])) ? nodesRaw[0] : nodesRaw;
        if (!Array.isArray(nodes)) return 0;
        let count = 0;
        for (const n of nodes) {
          if (!n || typeof n !== 'object') continue;
          if (nodeType(n) === 'Subflow' && n.nodes) {
            count++;
            count += countSubflowsInNodes(n.nodes);
          }
        }
        return count;
      }
      const totalSubflows = funcs.reduce((acc, fn) => {
        const wd = fn.workflowExecutionDetail;
        return acc + (wd && wd.nodes ? countSubflowsInNodes(wd.nodes) : 0);
      }, 0);
      const totalCards = funcs.length + totalSubflows;

      const secTitle = document.createElement('div');
      secTitle.className = 'flow-section-title';
      secTitle.textContent = 'Executed Functions (' + totalCards + ')';
      flowdebugContainer.appendChild(secTitle);

      // Recursively render subflow node cards indented under their parent.
      // parentFnName: the functionName of the enclosing executedFunctions entry,
      // used as the display name for direct Subflow children that have no label.
      function renderSubflowNodes(nodesRaw, indentLevel, parentFnName) {
        const nodes = (Array.isArray(nodesRaw) && nodesRaw.length > 0 && Array.isArray(nodesRaw[0])) ? nodesRaw[0] : nodesRaw;
        if (!Array.isArray(nodes)) return;
        nodes.forEach(n => {
          if (!n || typeof n !== 'object' || nodeType(n) !== 'Subflow' || !n.nodes) return;
          // Use node's own label first, then the parent function name (for direct
          // children), then fall back to nodeId for deeper subflows.
          const sfName = (n.label && String(n.label).trim()) || null;
          // Build a pseudo-function object so createExecutedFunctionCard can render it
          const pseudoFn = {
            functionName: sfName || parentFnName || ('Subflow ' + String(n.nodeId || '?')),
            functionId:   n.nodeId,
            inputParams:  n.input || {},
            result:       (n.output && Object.keys(n.output).length > 0) ? n.output : null,
            error:        n.error || null,
            workflowExecutionDetail: {
              executionStatus: n.error ? 'Failed' : 'Succeeded',
              nodes: n.nodes,
              attributes: {},
              error: n.error ? [n.error] : [],
            },
          };
          const card = createExecutedFunctionCard(pseudoFn, 0);
          if (card) {
            card.style.marginLeft = (indentLevel * 16) + 'px';
            card.style.borderLeftStyle = 'dashed';
            flowdebugContainer.appendChild(card);
          }
          // Recurse into this subflow's own Subflow children (no inherited name — deeper subflows use nodeId)
          renderSubflowNodes(n.nodes, indentLevel + 1, null);
        });
      }

      funcs.forEach((fn, i) => {
        const card = createExecutedFunctionCard(fn, i, PIN_PREFIX_EXEC_FN + i);
        if (card) flowdebugContainer.appendChild(card);
        // Render nested Subflow nodes as sub-cards (no pin — not individually addressable)
        const wd = fn.workflowExecutionDetail;
        if (wd && wd.nodes) renderSubflowNodes(wd.nodes, 1, fn.functionName || null);
      });

    } else if (id === 'llmCalls') {
      const llmPaths = [
        'debugInfoV2.flowDebugInfo.hyperFlowExecutionDetail.llmCalls',
        'flowDebugInfo.hyperFlowExecutionDetail.llmCalls',
      ];
      let calls = null;
      for (const p of llmPaths) {
        const v = getValueAtPath(currentJsonData, p);
        if (Array.isArray(v) && v.length > 0) { calls = v; break; }
      }
      if (!calls) { notShown.push({ label, status: 'missing' }); return; }
      const secTitle = document.createElement('div');
      secTitle.className = 'flow-section-title';
      secTitle.textContent = 'LLM Calls (' + calls.length + ')';
      flowdebugContainer.appendChild(secTitle);
      calls.forEach((call, i) => {
        const card = createLlmCallCard(call, i, PIN_PREFIX_LLM_CALL + i);
        if (card) flowdebugContainer.appendChild(card);
      });

    } else if (id === 'durations') {
      const durPaths = [
        'debugInfoV2.ai.convAiV2.durations',
        'ai.convAiV2.durations',
      ];
      let durations = null;
      for (const p of durPaths) {
        const v = getValueAtPath(currentJsonData, p);
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
          durations = v; break;
        }
      }
      if (!durations) { notShown.push({ label, status: 'missing' }); return; }
      renderDurationsCard(durations);

    } else if (id === 'other') {
      const otherKeys = getOtherKeys();
      if (otherKeys.length === 0) { notShown.push({ label, status: 'missing' }); return; }
      const secTitle = document.createElement('div');
      secTitle.className = 'flow-section-title';
      secTitle.textContent = 'Other Data';
      flowdebugContainer.appendChild(secTitle);
      otherKeys.forEach(k => {
        const src = (currentFlowData && k in currentFlowData) ? currentFlowData : currentJsonData;
        flowdebugContainer.appendChild(createDataCard(k, src[k], 'flow::' + k));
      });
    }
  }

  /**
   * Returns the set of keys that belong to the "Other Data" section:
   * all top-level currentJsonData keys not explicitly owned by a named section,
   * plus any extra currentFlowData keys not in FLOW_CONTROLLED_KEYS.
   */
  function getOtherKeys() {
    const seen = new Set(FLOW_CONTROLLED_KEYS);
    // nodes and executionStatus live in flow data but are rendered by the nodes section
    seen.add('nodes');
    seen.add('executionStatus');
    const keys = [];
    if (currentJsonData) {
      Object.keys(currentJsonData).forEach(k => {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      });
    }
    if (currentFlowData) {
      Object.keys(currentFlowData).forEach(k => {
        if (!seen.has(k)) { seen.add(k); keys.push(k); }
      });
    }
    return keys;
  }

  function renderFlowDebug(flowData) {
    currentFlowData = flowData && typeof flowData === 'object' ? flowData : null;

    // Normalize array-of-arrays: nodes: [[n0, n1, ...]] → nodes: [n0, n1, ...]
    // This ensures pin paths like "flow::nodes.0.field" resolve correctly via
    // getValueAtPath, which traverses currentFlowData directly.
    if (currentFlowData &&
        Array.isArray(currentFlowData.nodes) &&
        currentFlowData.nodes.length > 0 &&
        Array.isArray(currentFlowData.nodes[0])) {
      currentFlowData = { ...currentFlowData, nodes: currentFlowData.nodes[0] };
    }

    flowdebugContainer.innerHTML = '';
    flowdebugStatusLabel.style.display = 'none';
    flowdebugStatusBadge.style.display = 'none';

    // Status label + badge (only when flow data present)
    if (currentFlowData && currentFlowData.executionStatus) {
      const sk    = flowStatusKey(currentFlowData.executionStatus);
      const style = FLOW_STATUS_STYLES[sk];
      flowdebugStatusBadge.textContent      = String(currentFlowData.executionStatus);
      flowdebugStatusBadge.style.background = style.bg;
      flowdebugStatusBadge.style.color      = style.color;
      flowdebugStatusLabel.style.display    = '';
      flowdebugStatusBadge.style.display    = '';
    }

    // Resolve a generic (jsonPaths-based) section's value.
    // Returns { val, status } where status is 'shown', 'empty', or 'missing'.
    function resolveSection({ jsonPaths }) {
      function isEmpty(v) {
        if (v === null || v === undefined) return true;
        if (typeof v === 'string')  return v.trim() === '';
        if (Array.isArray(v))       return v.length === 0;
        if (typeof v === 'object')  return Object.keys(v).length === 0;
        return false;
      }
      let val;
      for (const p of jsonPaths) {
        if (currentFlowData) val = getValueAtPath(currentFlowData, p);
        if (val !== undefined && val !== null) break;
        if (currentJsonData) val = getValueAtPath(currentJsonData, p);
        if (val !== undefined && val !== null) break;
      }
      if (val === undefined || val === null) return { val: null, status: 'missing' };
      if (isEmpty(val))                      return { val,       status: 'empty'   };
      return { val, status: 'shown' };
    }

    // Render the nodes section.
    function renderNodes() {
      if (!currentFlowData) return false;
      const nodes = currentFlowData.nodes;
      if (!Array.isArray(nodes) || nodes.length === 0) return false;
      const secTitle = document.createElement('div');
      secTitle.className = 'flow-section-title';
      secTitle.textContent = 'Nodes (' + nodes.length + ')';
      flowdebugContainer.appendChild(secTitle);
      renderNodeHierarchy(flowdebugContainer, nodes, null, 0);
      return true;
    }

    // Render one section. Returns true if something was appended.
    function renderSection(secCfg, notShown) {
      if (!secCfg.enabled) return false;
      const def = FLOW_SECTION_DEFS[secCfg.id];
      if (!def) return false;

      if (secCfg.id === 'nodes') {
        return renderNodes();
      } else if (def.dedicated) {
        const before = flowdebugContainer.children.length;
        renderDedicatedSection(secCfg.id, notShown, def.label);
        return flowdebugContainer.children.length > before;
      } else {
        const { val, status } = resolveSection(def);
        if (status === 'shown') {
          const secTitle = document.createElement('div');
          secTitle.className = 'flow-section-title';
          secTitle.textContent = def.label;
          flowdebugContainer.appendChild(secTitle);
          const displayVal = truncateForDisplay(val, []);
          const secType = (secCfg.id === 'debugInfoV2' || secCfg.id === 'flowDebugInfo' || secCfg.id === 'hyperFlowExecutionDetail' || secCfg.id === 'workflowExecutionDetail' || secCfg.id === 'convAiV2') ? secCfg.id : null;
          flowdebugContainer.appendChild(createSectionCard(def.label, displayVal, 'flow::' + def.label, val, secType));
          return true;
        }
        notShown.push({ label: def.label, status });
        return false;
      }
    }

    // Track enabled sections that couldn't be shown, for the summary row at the bottom.
    const notShown = []; // { label, status }

    const isWorkflow = currentPageType === 'workflow-details';
    const sections = isWorkflow
      ? (currentSettings.flowSectionsWorkflow || SETTINGS_DEFAULTS.flowSectionsWorkflow)
      : (currentSettings.flowSectionsAiLens   || SETTINGS_DEFAULTS.flowSectionsAiLens);

    // Render all sections in user-defined order.
    // If no flow data, skip the nodes entry silently.
    for (const sec of sections) renderSection(sec, notShown);

    appendNotShownSummary(notShown);
  }

  /** Append a compact summary row listing enabled sections that had no renderable value. */
  function appendNotShownSummary(items) {
    if (!items.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'flow-not-shown-summary';
    items.forEach(({ label, status }) => {
      const row = document.createElement('div');
      row.className = 'flow-not-shown-row';
      const nameEl = document.createElement('span');
      nameEl.className = 'flow-not-shown-label';
      nameEl.textContent = label;
      const statusEl = document.createElement('span');
      statusEl.className = 'flow-not-shown-status flow-not-shown-' + status;
      statusEl.textContent = status === 'empty' ? 'empty' : status === 'hidden' ? 'hidden (wrong page)' : 'not in response';
      row.append(nameEl, statusEl);
      wrap.appendChild(row);
    });
    flowdebugContainer.appendChild(wrap);
  }

  /* ─── display truncation ─────────────────────────────────────────── */

  const TRUNCATE_FIELD_KEYS   = new Set(['content', 'chunk_content', 'augmented_content', 'highlight']);
  const TRUNCATE_CONTEXT_KEYS = new Set(['search', 'validity_check']);

  function truncateForDisplay(obj, ancestorKeys) {
    if (!currentSettings.truncateEnabled) return obj;
    if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(function(item) { return truncateForDisplay(item, ancestorKeys); });

    const limit     = currentSettings.truncateLimit;
    const inContext = ancestorKeys.some(k => TRUNCATE_CONTEXT_KEYS.has(k));
    const result    = {};

    for (const key of Object.keys(obj)) {
      const val = obj[key];

      // Item size limit: if the serialized JSON of a value exceeds the threshold,
      // store a sentinel so the renderer can show a clickable expand button.
      if (currentSettings.itemSizeLimitEnabled && val !== null && val !== undefined) {
        try {
          const serialized = JSON.stringify(val);
          if (serialized && serialized.length > currentSettings.itemSizeLimit) {
            result[key] = { __aisera_truncated: true, __charCount: serialized.length, __originalValue: val };
            continue;
          }
        } catch (e) {}
      }

      if (typeof val === 'string' && val.length > limit) {
        if (inContext && TRUNCATE_FIELD_KEYS.has(key)) {
          result[key] = val.slice(0, limit) + '\u2026';
          continue;
        }
        if (key === 'text' && ancestorKeys.includes('messages') && ancestorKeys.includes('llmCalls')) {
          result[key] = val.slice(0, limit) + '\u2026';
          continue;
        }
      }
      result[key] = truncateForDisplay(val, [...ancestorKeys, key]);
    }

    return result;
  }

  /* ─── renderers ──────────────────────────────────────────────────── */

  function renderJson(jsonData, rawStr) {
    currentJsonData = jsonData;

    // Detect AI Lens multi-function mode (executedFunctions present).
    // Merge all functions' nodes into one flowData so pin paths work normally.
    // Each node card is annotated with its source workflow name via getWorkflowNameForIndex.
    var groups = buildFunctionGroups(jsonData);
    currentFunctionGroups = groups;
    // nodeWorkflowNameMap was already built by loadAndRender before renderFlowDebug was called.
    // Rebuild here too in case renderJson is called from a path other than loadAndRender.
    buildNodeWorkflowNameMap(jsonData, currentFlowSessionData);
    var extracted;
    if (groups.length > 0) {
      var mergedNodes = [];
      var lastStatus = null;
      for (var gi = 0; gi < groups.length; gi++) {
        for (var ni = 0; ni < groups[gi].nodes.length; ni++) {
          mergedNodes.push(groups[gi].nodes[ni]);
        }
        lastStatus = groups[gi].flowData.executionStatus || lastStatus;
      }
      extracted = { nodes: mergedNodes, executionStatus: lastStatus };
    } else {
      extracted = extractFlowDataFromJson(jsonData, 0);
    }
    if (extracted) renderFlowDebug(extracted);

    // Tab 1 — Dashboard
    renderDashboard();

    // Tab 2 — Errors (auto-scanned from both sources)
    renderErrors();

    // Debug tab — one card per top-level key (values truncated for display only).
    // Skip keys owned by Flow Debug Sections (shown in flowdebugContainer instead).
    // Also skip keys that will be rendered by the "Other Data" flow section.
    treejsonContainer.innerHTML = '';
    treejsonContainer.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
    const otherSectionKeys = new Set(getOtherKeys());
    const displayData = truncateForDisplay(jsonData, []);
    Object.keys(displayData).forEach(k => {
      if (FLOW_CONTROLLED_KEYS.has(k)) return;
      if (otherSectionKeys.has(k)) return;
      treejsonContainer.appendChild(createDataCard(k, displayData[k], k));
    });

    // Tab 4 — Raw JSON (collapsible tree via TreeJSONLib)
    rawJsonTree.innerHTML = '';
    TreeJSONLib.render(rawJsonTree, jsonData, 2);
    initCopyButton(rawStr);

    showSection('tab-section');
    // On first render switch to Dashboard; on auto-refresh stay on current tab
    activateTab(firstRender ? currentSettings.defaultTab : currentTab);
    firstRender = false;
  }

  function renderPlainText(text) {
    document.getElementById('plain-pre').textContent = text;
    showSection('plain-section');
    firstRender = false;
  }

  /* ─── main load ──────────────────────────────────────────────────── */

  async function loadAndRender() {
    resetSections();

    let session, flowSession;
    try {
      const [sessionRes, flowRes] = await Promise.all([
        chrome.storage.local.get(SESSION_KEY),
        chrome.storage.local.get(FLOW_KEY),
      ]);
      session      = sessionRes[SESSION_KEY];
      flowSession  = flowRes[FLOW_KEY];
      // Only fall back to session.pageType if content.js hasn't told us the type directly.
      if (currentPageType === null) currentPageType = session?.pageType ?? null;
      // Load pins for the now-known page type.
      const pinsRes = await loadPins(currentPageType);
      // If no pins saved, apply the page-type default.
      const savedPins = pinsRes ?? [];
      const isStaleDefault = savedPins.length === 1 && savedPins[0] === PIN_WORKFLOW_SUMMARY;
      currentPins = (pinsRes === null || isStaleDefault)
        ? defaultPinsForPageType(currentPageType)
        : savedPins;
    } catch {
      showSection('error-section');
      return;
    }

    // Build the workflow name map from the full session JSON before any renderFlowDebug call,
    // so node cards can display their workflow/function names immediately.
    let jsonDataForMap = null;
    if (session?.data) {
      if (typeof session.data === 'string') {
        try { jsonDataForMap = JSON.parse(session.data); } catch {}
      } else if (typeof session.data === 'object') {
        jsonDataForMap = session.data;
      }
    }
    // Store flowSession.data so renderJson can use it for workflow name resolution.
    // On AI Lens, flowSession.data contains executedFunctions with functionName.
    currentFlowSessionData = flowSession?.data ?? null;
    let flowJsonForMap = currentFlowSessionData;
    if (jsonDataForMap) buildNodeWorkflowNameMap(jsonDataForMap, flowJsonForMap);
    else if (flowJsonForMap) buildNodeWorkflowNameMap(null, flowJsonForMap);

    // Always render flow debug first (sets currentFlowData)
    renderFlowDebug(flowSession?.data ?? null);

    const hasFlowData = currentFlowData !== null;

    if (!session || session.data === null || session.data === undefined) {
      if (hasFlowData) {
        // Flow data only — show tab section focused on Flow Debug
        currentJsonData = null;
        renderDashboard();
        renderErrors();
        treejsonContainer.innerHTML = '';
        rawJsonTree.innerHTML = '';
        sourceBadge.textContent = 'Source: flow only';
        showSection('tab-section');
        activateTab(firstRender ? currentSettings.defaultTab : currentTab);
        firstRender = false;
      } else {
        // No data yet — still show tabs so the user can access Settings
        currentJsonData = null;
        renderDashboard();
        renderErrors();
        sourceBadge.textContent = 'Source: —';
        showSection('tab-section');
        activateTab('settings');
        firstRender = false;
      }
      return;
    }

    sourceBadge.textContent = 'Source: ' + (session.source || 'unknown');

    let jsonData = null;
    let rawStr   = '';

    if (typeof session.data === 'string') {
      rawStr = session.data;
      try { jsonData = JSON.parse(session.data); } catch {}
    } else if (typeof session.data === 'object') {
      jsonData = session.data;
      try { rawStr = JSON.stringify(session.data, null, 2); } catch { rawStr = String(session.data); }
    }

    if (jsonData !== null && typeof jsonData === 'object') {
      renderJson(jsonData, rawStr);
    } else if (rawStr.trim()) {
      renderPlainText(rawStr);
    } else {
      showSection('error-section');
    }
  }

  /* ─── error → debug navigation ──────────────────────────────────── */

  function jumpToDebug(path, isFlow) {
    activateTab('debug');

    // Derive the pin-path that the target card's checkbox carries, so we can
    // find the card regardless of where it sits in the DOM.
    //
    // For flow node paths ("nodes.7.nodes.15.output.success") we reconstruct
    // the hierarchical label ("8-16") and look for data-path="flow::nodes.8-16".
    // For other flow paths ("attributes.foo") we look for data-path="flow::attributes".
    // For debug paths ("debugInfoV2.ai.models") we look for data-path="debugInfoV2".
    function resolveTargetPath() {
      if (!isFlow) {
        // Debug card — keyed by top-level key
        return { container: treejsonContainer, pinPath: path.split('.')[0] };
      }

      // Flow path — check if it's node-based
      const parts = path.split('.');
      if (parts[0] === 'nodes') {
        // Reconstruct hierarchical label by consuming "nodes.N" pairs
        let indexStr = null;
        let i = 0;
        while (i < parts.length && parts[i] === 'nodes') {
          i++; // skip "nodes"
          const idx = parseInt(parts[i], 10);
          if (isNaN(idx)) break;
          i++; // skip the index
          const humanIdx = idx + 1;
          indexStr = indexStr ? indexStr + '-' + humanIdx : String(humanIdx);
        }
        if (indexStr) {
          return { container: flowdebugContainer, pinPath: 'flow::nodes.' + indexStr };
        }
      }

      // Non-node flow path — keyed by top-level key
      return { container: flowdebugContainer, pinPath: 'flow::' + parts[0] };
    }

    requestAnimationFrame(() => requestAnimationFrame(() => {
      const { container, pinPath } = resolveTargetPath();
      const cb   = container.querySelector(`[data-path="${CSS.escape(pinPath)}"]`);
      const card = cb ? cb.closest('.flow-node-card') : null;
      if (card) {
        const scrollParent = document.getElementById('debug-body') || container.closest('.tab-panel') || container.parentElement;
        const offset = 70; // ~2 collapsed card heights below top
        const cardRect   = card.getBoundingClientRect();
        const parentRect = scrollParent.getBoundingClientRect();
        const newScrollTop = scrollParent.scrollTop + (cardRect.top - parentRect.top) - offset;
        scrollParent.scrollTo({ top: newScrollTop, behavior: 'smooth' });
        card.classList.remove('card-highlight');
        void card.offsetWidth;
        card.classList.add('card-highlight');
        setTimeout(() => card.classList.remove('card-highlight'), currentSettings.flashDuration || 3000);
      }
    }));
  }

  function requestBtnDims() {
    window.parent.postMessage({ type: 'AISERA_BTN_DIMS_REQUEST' }, '*');
  }
  /* ─── settings panel ────────────────────────────────────────────── */

  function initSettingsPanel() {
    function applyToControls(s) {
      document.getElementById('setting-truncate-enabled').checked     = s.truncateEnabled;
      document.getElementById('setting-truncate-limit').value         = s.truncateLimit;
      document.getElementById('setting-item-size-limit-enabled').checked = s.itemSizeLimitEnabled;
      document.getElementById('setting-item-size-limit').value            = s.itemSizeLimit;
      document.getElementById('setting-subflow-indent').value              = s.subflowIndent;
      document.getElementById('subflow-indent-val').value                  = s.subflowIndent;
      document.getElementById('setting-cards-collapsed-by-default').checked = s.cardsCollapsedByDefault;
      document.getElementById('setting-node-augmentation-enabled').checked  = s.nodeAugmentationEnabled;
      document.getElementById('setting-node-highlight-enabled').checked     = s.nodeHighlightEnabled;
      document.getElementById('setting-node-highlight-color').value         = s.nodeHighlightColor || '#f59e0b';
      document.getElementById('setting-auto-collapse-enabled').checked     = s.autoCollapseEnabled;
      document.getElementById('setting-request-collapse-threshold').value  = s.requestCollapseThreshold;
      setAutoCollapseThresholdEnabled(s.autoCollapseEnabled);
      document.getElementById('setting-default-tab').value          = s.defaultTab;
      document.getElementById('setting-warnings-as-errors').checked  = s.warningsAsErrors;
      document.getElementById('setting-nodes-only').checked          = s.nodesOnly;
      document.getElementById('setting-nodes-first').checked         = s.nodesFirst;
      document.getElementById('setting-error-preview-length').value  = s.errorPreviewLength;
      document.getElementById('setting-flash-duration').value        = s.flashDuration;
      document.getElementById('flash-duration-val').value            = (s.flashDuration / 1000).toFixed(1);
      document.getElementById('setting-push-page-content').checked   = s.pushPageContent;
      document.getElementById('setting-auto-fill-email').checked          = s.autoFillEmail !== false;
      document.getElementById('setting-auto-fill-email-address').value    = s.autoFillEmailAddress || 'test@test.com';
      document.getElementById('setting-auto-click-ok').checked            = s.autoClickOk === true;
      // debug button
      document.getElementById('setting-btn-bg-color').value          = s.btnBgColor;
      document.getElementById('setting-btn-text-color').value        = s.btnTextColor;
      document.getElementById('setting-btn-font-size').value         = s.btnFontSize;
      document.getElementById('btn-font-size-val').value             = s.btnFontSize;
      document.getElementById('setting-btn-opacity').value           = Math.round((s.btnOpacity ?? 0.5) * 100);
      document.getElementById('btn-opacity-val').value               = Math.round((s.btnOpacity ?? 0.5) * 100);
      document.getElementById('setting-btn-width').value             = s.btnWidth  ?? 60;
      document.getElementById('btn-width-val').value                 = s.btnWidth  ?? 60;
      document.getElementById('setting-btn-height').value            = s.btnHeight ?? 25;
      document.getElementById('btn-height-val').value                = s.btnHeight ?? 25;
      // appearance
      document.getElementById('setting-accent-color').value          = s.accentColor;
      document.getElementById('setting-cv-str-color').value          = s.cvStrColor;
      document.getElementById('setting-cv-num-color').value          = s.cvNumColor;
      document.getElementById('setting-cv-true-color').value          = s.cvTrueColor;
      document.getElementById('setting-cv-false-color').value         = s.cvFalseColor;
      document.getElementById('setting-base-font-size').value        = s.baseFontSize;
      document.getElementById('base-font-size-val').value            = s.baseFontSize;
      document.getElementById('setting-card-font-size').value        = s.cardFontSize;
      document.getElementById('card-font-size-val').value            = s.cardFontSize;
      // keyboard shortcuts
      setShortcutInputValue('setting-shortcut-toggle',   s.shortcutToggle  || SETTINGS_DEFAULTS.shortcutToggle);
      setShortcutInputValue('setting-shortcut-prev-tab', s.shortcutPrevTab || SETTINGS_DEFAULTS.shortcutPrevTab);
      setShortcutInputValue('setting-shortcut-next-tab', s.shortcutNextTab || SETTINGS_DEFAULTS.shortcutNextTab);
      // flow debug sections — rebuild both drag lists, merging saved order with any new defaults
      function mergeWithDefaults(saved, defaults) {
        const savedIds = new Set(saved.map(sec => sec.id));
        return [...saved, ...defaults.filter(sec => !savedIds.has(sec.id))];
      }
      const savedAiLens   = s.flowSectionsAiLens   || SETTINGS_DEFAULTS.flowSectionsAiLens;
      const savedWorkflow = s.flowSectionsWorkflow  || SETTINGS_DEFAULTS.flowSectionsWorkflow;
      buildFlowSectionsList(mergeWithDefaults(savedAiLens,   SETTINGS_DEFAULTS.flowSectionsAiLens),   'flow-sections-list-ai-lens');
      buildFlowSectionsList(mergeWithDefaults(savedWorkflow, SETTINGS_DEFAULTS.flowSectionsWorkflow), 'flow-sections-list-workflow');
      setTruncateLimitEnabled(s.truncateEnabled);
      setItemSizeLimitEnabled(s.itemSizeLimitEnabled !== false);
      setAutoFillEmailEnabled(s.autoFillEmail !== false);
    }

    function setAutoCollapseThresholdEnabled(on) {
      const row = document.getElementById('row-auto-collapse-threshold');
      row.style.opacity = on ? '1' : '0.4';
      row.querySelector('input').disabled = !on;
    }

    function setAutoFillEmailEnabled(on) {
      const row = document.getElementById('row-auto-fill-email-address');
      row.style.opacity = on ? '1' : '0.4';
      row.querySelector('input').disabled = !on;
    }

    function setTruncateLimitEnabled(on) {
      const row = document.getElementById('row-truncate-limit');
      row.style.opacity = on ? '1' : '0.4';
      row.querySelector('input').disabled = !on;
    }

    function setItemSizeLimitEnabled(on) {
      const row = document.getElementById('row-item-size-limit');
      row.style.opacity = on ? '1' : '0.4';
      row.querySelector('input').disabled = !on;
    }

    function showSavedBadge() {
      const el = document.getElementById('settings-saved-indicator');
      el.classList.add('visible');
      setTimeout(() => el.classList.remove('visible'), 1800);
    }

    async function onAnyChange() {
      currentSettings.truncateEnabled     = document.getElementById('setting-truncate-enabled').checked;
      currentSettings.truncateLimit       = Math.max(5, parseInt(document.getElementById('setting-truncate-limit').value, 10) || 20);
      currentSettings.itemSizeLimitEnabled = document.getElementById('setting-item-size-limit-enabled').checked;
      currentSettings.itemSizeLimit        = Math.max(500, parseInt(document.getElementById('setting-item-size-limit').value, 10) || 3000);
      setItemSizeLimitEnabled(currentSettings.itemSizeLimitEnabled);
      currentSettings.subflowIndent             = parseInt(document.getElementById('setting-subflow-indent').value, 10) || 20;
      currentSettings.cardsCollapsedByDefault   = document.getElementById('setting-cards-collapsed-by-default').checked;
      currentSettings.nodeAugmentationEnabled   = document.getElementById('setting-node-augmentation-enabled').checked;
      window.parent.postMessage({ type: 'AISERA_NODE_AUG_CHANGED', enabled: currentSettings.nodeAugmentationEnabled }, '*');
      currentSettings.nodeHighlightEnabled      = document.getElementById('setting-node-highlight-enabled').checked;
      currentSettings.nodeHighlightColor        = document.getElementById('setting-node-highlight-color').value;
      window.parent.postMessage({ type: 'AISERA_NODE_HIGHLIGHT_SETTINGS', enabled: currentSettings.nodeHighlightEnabled, color: currentSettings.nodeHighlightColor }, '*');
      currentSettings.autoCollapseEnabled       = document.getElementById('setting-auto-collapse-enabled').checked;
      currentSettings.requestCollapseThreshold  = Math.max(1, parseInt(document.getElementById('setting-request-collapse-threshold').value, 10) || 500);
      setAutoCollapseThresholdEnabled(currentSettings.autoCollapseEnabled);
      currentSettings.defaultTab         = document.getElementById('setting-default-tab').value;
      currentSettings.warningsAsErrors   = document.getElementById('setting-warnings-as-errors').checked;
      currentSettings.nodesOnly          = document.getElementById('setting-nodes-only').checked;
      currentSettings.nodesFirst         = document.getElementById('setting-nodes-first').checked;
      currentSettings.errorPreviewLength = Math.max(100, parseInt(document.getElementById('setting-error-preview-length').value, 10) || 800);
      currentSettings.flashDuration      = Math.max(500, parseInt(document.getElementById('setting-flash-duration').value, 10) || 3000);
      currentSettings.pushPageContent    = document.getElementById('setting-push-page-content').checked;
      // Notify the host page immediately so it can adjust body margin while panel is open
      window.parent.postMessage({ type: 'AISERA_PUSH_CHANGED', enabled: currentSettings.pushPageContent }, '*');
      currentSettings.autoFillEmail        = document.getElementById('setting-auto-fill-email').checked;
      currentSettings.autoFillEmailAddress = document.getElementById('setting-auto-fill-email-address').value.trim() || 'test@test.com';
      currentSettings.autoClickOk          = document.getElementById('setting-auto-click-ok').checked;
      window.parent.postMessage({ type: 'AISERA_AUTOFILL_CHANGED', enabled: currentSettings.autoFillEmail, email: currentSettings.autoFillEmailAddress, autoClickOk: currentSettings.autoClickOk }, '*');
      currentSettings.btnBgColor   = document.getElementById('setting-btn-bg-color').value;
      currentSettings.btnTextColor = document.getElementById('setting-btn-text-color').value;
      currentSettings.btnFontSize  = parseInt(document.getElementById('setting-btn-font-size').value, 10) || 12;
      currentSettings.btnOpacity   = (parseInt(document.getElementById('setting-btn-opacity').value, 10) || 50) / 100;
      currentSettings.btnWidth     = parseInt(document.getElementById('setting-btn-width').value, 10)  || 60;
      currentSettings.btnHeight    = parseInt(document.getElementById('setting-btn-height').value, 10) || 25;
      window.parent.postMessage({ type: 'AISERA_BTN_STYLE_CHANGED', style: {
        bgColor: currentSettings.btnBgColor, textColor: currentSettings.btnTextColor,
        fontSize: currentSettings.btnFontSize, opacity: currentSettings.btnOpacity,
        width: currentSettings.btnWidth + 'px', height: currentSettings.btnHeight + 'px',
      }}, '*');
      setTimeout(requestBtnDims, 80); // allow reflow before measuring
      setAutoFillEmailEnabled(currentSettings.autoFillEmail);
      // keyboard shortcuts — read from capture inputs
      currentSettings.shortcutToggle  = getShortcutInputValue('setting-shortcut-toggle')  || SETTINGS_DEFAULTS.shortcutToggle;
      currentSettings.shortcutPrevTab = getShortcutInputValue('setting-shortcut-prev-tab') || SETTINGS_DEFAULTS.shortcutPrevTab;
      currentSettings.shortcutNextTab = getShortcutInputValue('setting-shortcut-next-tab') || SETTINGS_DEFAULTS.shortcutNextTab;
      window.parent.postMessage({ type: 'AISERA_SHORTCUT_CHANGED', shortcutToggle: currentSettings.shortcutToggle }, '*');
      // flow debug sections — read order + state from both live drag lists
      currentSettings.flowSectionsAiLens   = readFlowSectionsFromList('flow-sections-list-ai-lens');
      currentSettings.flowSectionsWorkflow = readFlowSectionsFromList('flow-sections-list-workflow');
      currentSettings.accentColor        = document.getElementById('setting-accent-color').value;
      currentSettings.cvStrColor         = document.getElementById('setting-cv-str-color').value;
      currentSettings.cvNumColor         = document.getElementById('setting-cv-num-color').value;
      currentSettings.cvTrueColor         = document.getElementById('setting-cv-true-color').value;
      currentSettings.cvFalseColor        = document.getElementById('setting-cv-false-color').value;
      currentSettings.baseFontSize       = parseInt(document.getElementById('setting-base-font-size').value, 10) || 14;
      currentSettings.cardFontSize       = parseInt(document.getElementById('setting-card-font-size').value, 10) || 12;
      setTruncateLimitEnabled(currentSettings.truncateEnabled);
      applyTheme(currentSettings);
      renderErrors();   // re-scan with updated warningsAsErrors / nodesFirst / nodesOnly
      if (currentFlowData || currentJsonData) renderFlowDebug(currentFlowData); // re-render for showOtherData / subflowIndent / flow sections
      await saveSettings();
      showSavedBadge();
    }

    // Build the draggable list from a flowSections array.
    function buildFlowSectionsList(sections, listId) {
      const list = document.getElementById(listId || 'flow-sections-list-ai-lens');
      if (!list) return;
      list.innerHTML = '';
      sections.forEach(sec => {
        if (sec.id === 'workflowSummary') return;
        const def = FLOW_SECTION_DEFS[sec.id];
        if (!def) return;
        const li = document.createElement('li');
        li.className = 'flow-sec-item';
        li.draggable = true;
        li.dataset.id = sec.id;

        const handle = document.createElement('span');
        handle.className = 'flow-sec-handle';
        handle.textContent = '⠿';
        handle.title = 'Drag to reorder';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'flow-sec-cb';
        cb.checked = sec.enabled !== false;
        cb.addEventListener('change', onAnyChange);

        const label = document.createElement('span');
        label.className = 'flow-sec-label';
        label.textContent = def.label;

        li.append(handle, cb, label);

        // Drag-and-drop events
        li.addEventListener('dragstart', e => {
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', sec.id);
          li.classList.add('flow-sec-dragging');
        });
        li.addEventListener('dragend', () => {
          li.classList.remove('flow-sec-dragging');
          list.querySelectorAll('.flow-sec-item').forEach(el => el.classList.remove('flow-sec-over'));
        });
        li.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          list.querySelectorAll('.flow-sec-item').forEach(el => el.classList.remove('flow-sec-over'));
          li.classList.add('flow-sec-over');
        });
        li.addEventListener('drop', e => {
          e.preventDefault();
          const fromId = e.dataTransfer.getData('text/plain');
          const fromEl = list.querySelector('[data-id="' + fromId + '"]');
          if (fromEl && fromEl !== li) {
            // Insert before or after depending on drag direction
            const rect = li.getBoundingClientRect();
            const mid  = rect.top + rect.height / 2;
            if (e.clientY < mid) {
              list.insertBefore(fromEl, li);
            } else {
              list.insertBefore(fromEl, li.nextSibling);
            }
          }
          list.querySelectorAll('.flow-sec-item').forEach(el => el.classList.remove('flow-sec-over'));
          onAnyChange();
        });

        list.appendChild(li);
      });
    }

    // Read current order + state from the live drag list DOM.
    function readFlowSectionsFromList(listId) {
      const list = document.getElementById(listId);
      if (!list) {
        if (listId === 'flow-sections-list-workflow') return currentSettings.flowSectionsWorkflow || SETTINGS_DEFAULTS.flowSectionsWorkflow;
        return currentSettings.flowSectionsAiLens || SETTINGS_DEFAULTS.flowSectionsAiLens;
      }
      return Array.from(list.querySelectorAll('.flow-sec-item')).map(li => ({
        id:      li.dataset.id,
        enabled: li.querySelector('.flow-sec-cb').checked,
      }));
    }



    // Live range ↔ number-input two-way sync helpers
    function syncRangeToNum(rangeId, numId, transform) {
      const range = document.getElementById(rangeId);
      const num   = document.getElementById(numId);
      range.addEventListener('input', () => { num.value = transform ? transform(range.value) : range.value; });
      num.addEventListener('change', () => {
        const v = parseFloat(num.value);
        if (!isNaN(v)) { range.value = v; }
        num.value = transform ? transform(range.value) : range.value; // clamp to range bounds
        onAnyChange();
      });
    }
    syncRangeToNum('setting-subflow-indent',  'subflow-indent-val');
    syncRangeToNum('setting-base-font-size',  'base-font-size-val');
    syncRangeToNum('setting-card-font-size',  'card-font-size-val');
    syncRangeToNum('setting-btn-font-size',   'btn-font-size-val');
    syncRangeToNum('setting-btn-width',       'btn-width-val');
    syncRangeToNum('setting-btn-height',      'btn-height-val');
    syncRangeToNum('setting-btn-opacity',     'btn-opacity-val');
    // flash-duration: range in ms, display in seconds with 1 decimal
    document.getElementById('setting-flash-duration').addEventListener('input', () => {
      document.getElementById('flash-duration-val').value =
        (document.getElementById('setting-flash-duration').value / 1000).toFixed(1);
    });
    document.getElementById('flash-duration-val').addEventListener('change', () => {
      const secs = parseFloat(document.getElementById('flash-duration-val').value);
      if (!isNaN(secs)) {
        const ms = Math.round(Math.max(0.5, Math.min(8, secs)) * 1000);
        document.getElementById('setting-flash-duration').value = ms;
        document.getElementById('flash-duration-val').value = (ms / 1000).toFixed(1);
      }
      onAnyChange();
    });

    // Wire all controls to the single save handler
    ['setting-truncate-enabled', 'setting-truncate-limit', 'setting-item-size-limit-enabled', 'setting-item-size-limit',
     'setting-subflow-indent', 'setting-auto-collapse-enabled', 'setting-request-collapse-threshold', 'setting-default-tab', 'setting-warnings-as-errors',
     'setting-nodes-only', 'setting-nodes-first', 'setting-error-preview-length', 'setting-flash-duration',
     'setting-push-page-content',
     'setting-cards-collapsed-by-default', 'setting-node-augmentation-enabled',
     'setting-node-highlight-enabled', 'setting-node-highlight-color',
     'setting-auto-fill-email', 'setting-auto-fill-email-address', 'setting-auto-click-ok',
     'setting-btn-bg-color', 'setting-btn-text-color', 'setting-btn-font-size',
     'setting-btn-opacity', 'setting-btn-width', 'setting-btn-height',
     'setting-accent-color', 'setting-cv-str-color', 'setting-cv-num-color',
     'setting-cv-true-color', 'setting-cv-false-color', 'setting-base-font-size', 'setting-card-font-size',
    ].forEach(id => {
      document.getElementById(id).addEventListener('change', onAnyChange);
    });

    // Dedicated handler for auto-click-ok: reads checked state from the event to
    // avoid any timing gap between click and the change event firing.
    document.getElementById('setting-auto-click-ok').addEventListener('click', async e => {
      currentSettings.autoClickOk = e.target.checked;
      window.parent.postMessage({ type: 'AISERA_AUTOFILL_CHANGED', enabled: currentSettings.autoFillEmail, email: currentSettings.autoFillEmailAddress, autoClickOk: currentSettings.autoClickOk }, '*');
      await saveSettings();
      showSavedBadge();
    });

    // Reset to defaults
    document.getElementById('settings-reset-btn').addEventListener('click', async () => {
      currentSettings = { ...SETTINGS_DEFAULTS };
      applyTheme(currentSettings);
      applyToControls(currentSettings);
      await saveSettings();
      showSavedBadge();
    });

    document.getElementById('test-count-reset-btn').addEventListener('click', async () => {
      const data = await resetTestCount();
      updateTestCountDisplay(data);
    });

    applyToControls(currentSettings);

    // Wire shortcut capture inputs
    ['setting-shortcut-toggle', 'setting-shortcut-prev-tab', 'setting-shortcut-next-tab'].forEach(id => {
      initShortcutInput(id, onAnyChange);
    });
  }

  /* ─── bootstrap ──────────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', () => {
    loadingEl         = document.getElementById('loading');
    tabSection        = document.getElementById('tab-section');
    plainSection      = document.getElementById('plain-section');
    errorSection      = document.getElementById('error-section');
    sourceBadge       = document.getElementById('source-badge');
    closeBtn          = document.getElementById('close-btn');
    treejsonContainer    = document.getElementById('treejson-container');
    dashboardContainer   = document.getElementById('dashboard-container');
    errorsContainer      = document.getElementById('errors-container');
    flowdebugContainer   = document.getElementById('flowdebug-container');
    flowdebugStatusBadge = document.getElementById('flowdebug-status-badge');
    flowdebugStatusLabel = document.getElementById('flowdebug-status-label');
    rawJsonTree          = document.getElementById('raw-json-tree');
    copyBtn              = document.getElementById('copy-btn');

    closeBtn.addEventListener('click', () => {
      window.parent.postMessage({ type: 'AISERA_SIDEBAR_CLOSE' }, '*');
    });

    document.getElementById('dashboard-collapse-all').addEventListener('click', () => {
      document.querySelectorAll('#dashboard-container .flow-node-card:not(.collapsed)').forEach(card => {
        const btn = card.querySelector(':scope > .flow-node-header .card-collapse-btn');
        if (btn) btn.click();
      });
      document.querySelectorAll('#dashboard-container .flow-field-toggle').forEach(toggle => {
        const icon = toggle.querySelector('.field-toggle-icon');
        if (icon && icon.textContent === '\u25bc') toggle.click();
      });
    });

    document.getElementById('dashboard-expand-all').addEventListener('click', () => {
      document.querySelectorAll('#dashboard-container .flow-node-card.collapsed').forEach(card => {
        const btn = card.querySelector(':scope > .flow-node-header .card-collapse-btn');
        if (btn) btn.click();
      });
      document.querySelectorAll('#dashboard-container .flow-field-toggle').forEach(toggle => {
        const icon = toggle.querySelector('.field-toggle-icon');
        if (icon && icon.textContent === '\u25b6') {
          toggle.click();
          const confirmEl = toggle.parentElement?.querySelector('.field-expand-confirm');
          if (confirmEl && confirmEl.style.display !== 'none') {
            confirmEl.querySelector('.field-expand-yes')?.click();
          }
        }
      });
    });

    document.getElementById('errors-expand-all').addEventListener('click', () => {
      errorsContainer.querySelectorAll('.err-entry').forEach(card => {
        const btn = card.querySelector('.card-collapse-btn');
        card.classList.remove('collapsed');
        if (btn) { btn.innerHTML = '&#9660;'; btn.setAttribute('aria-expanded', 'true'); }
      });
    });

    document.getElementById('errors-collapse-all').addEventListener('click', () => {
      errorsContainer.querySelectorAll('.err-entry').forEach(card => {
        const btn = card.querySelector('.card-collapse-btn');
        card.classList.add('collapsed');
        if (btn) { btn.innerHTML = '&#9654;'; btn.setAttribute('aria-expanded', 'false'); }
      });
    });

    document.getElementById('debug-select-all').addEventListener('click', async () => {
      const cbs = document.querySelectorAll('#tab-debug .flow-pin-cb');
      cbs.forEach(cb => {
        if (!cb.checked) {
          cb.checked = true;
          if (!currentPins.includes(cb.dataset.path)) currentPins.push(cb.dataset.path);
        }
      });
      await savePins(currentPins);
      renderDashboard();
    });

    document.getElementById('debug-deselect-all').addEventListener('click', async () => {
      const cbs = document.querySelectorAll('#tab-debug .flow-pin-cb');
      const paths = new Set(Array.from(cbs).map(cb => cb.dataset.path));
      cbs.forEach(cb => { cb.checked = false; });
      currentPins = currentPins.filter(p => !paths.has(p));
      paths.forEach(p => dashCardState.delete(p));
      await savePins(currentPins);
      renderDashboard();
    });

    document.getElementById('debug-collapse-all').addEventListener('click', () => {
      // Collapse all cards
      document.querySelectorAll('#debug-body .flow-node-card:not(.collapsed)').forEach(card => {
        const btn = card.querySelector(':scope > .flow-node-header .card-collapse-btn');
        if (btn) btn.click();
      });
      // Collapse all expanded fields
      document.querySelectorAll('#debug-body .flow-field-toggle').forEach(toggle => {
        const icon = toggle.querySelector('.field-toggle-icon');
        if (icon && icon.textContent === '\u25bc') toggle.click();
      });
    });

    document.getElementById('debug-expand-all').addEventListener('click', () => {
      // Expand all collapsed cards
      document.querySelectorAll('#debug-body .flow-node-card.collapsed').forEach(card => {
        const btn = card.querySelector(':scope > .flow-node-header .card-collapse-btn');
        if (btn) btn.click();
      });
      // Expand all collapsed fields
      document.querySelectorAll('#debug-body .flow-field-toggle').forEach(toggle => {
        const icon = toggle.querySelector('.field-toggle-icon');
        if (icon && icon.textContent === '\u25b6') {
          toggle.click();
          // If a confirm dialog appeared (large auto-collapsed field), auto-accept it
          const confirmEl = toggle.parentElement?.querySelector('.field-expand-confirm');
          if (confirmEl && confirmEl.style.display !== 'none') {
            confirmEl.querySelector('.field-expand-yes')?.click();
          }
        }
      });
    });

    initTabs();
    initKeyboardShortcuts();

    // Refresh the field-selection tree whenever the user switches to Settings
    document.querySelector('.tab-btn[data-tab="settings"]').addEventListener('click', () => {
      requestBtnDims();
    });

    function updateBtnDimsDisplay(w, h) {
      document.getElementById('btn-dims-value').textContent = Math.round(w) + 'px × ' + Math.round(h) + 'px';
    }

    window.addEventListener('message', e => {
      if (e.data?.type === 'AISERA_PAGE_TYPE') { currentPageType = e.data.pageType ?? null; dashCardState.clear(); loadAndRender(); }
      if (e.data?.type === 'AISERA_DEBUG_REFRESH') { if (e.data.pageType !== undefined) { if (e.data.pageType !== currentPageType) dashCardState.clear(); currentPageType = e.data.pageType; } loadAndRender(); }
      if (e.data?.type === 'AISERA_BTN_DIMS_RESPONSE') updateBtnDimsDisplay(e.data.width, e.data.height);
      if (e.data?.type === 'AISERA_TEST_COUNT_CHANGED') updateTestCountDisplay(e.data.data);
    });

    // Load persisted settings + test count first, then render
    Promise.all([loadSettings(), loadTestCount()]).then(([, countData]) => {
      applyTheme(currentSettings);
      initSettingsPanel();
      updateTestCountDisplay(countData);
      loadAndRender();
    });
  });
})();
