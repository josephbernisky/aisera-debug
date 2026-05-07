/**
 * lib/treejson.js
 * Self-contained JSON tree renderer with optional pin-to-dashboard checkboxes.
 *
 * Public API:
 *   TreeJSONLib.render(container, data, maxOpenDepth, options?)
 *
 *   options: {
 *     pinnedPaths : Set<string>          — paths pre-checked on load
 *     onToggle    : (path, checked) => void  — called when checkbox changes
 *   }
 *
 * Path format: dot-notation, e.g.  "user.name"  |  "roles.0"  |  "stats"
 */
(function (global) {
  'use strict';

  /* ─── styles ────────────────────────────────────────────────────── */

  var STYLE_ID = 'treejson-lib-css';

  var CSS = [
    '.tj-root{font-family:Consolas,Monaco,"Courier New",monospace;font-size:13px;',
      'line-height:1.8;color:#24292e;overflow-x:auto;}',

    /* every row is a flex row */
    '.tj-node{display:block;}',
    '.tj-header{display:flex;align-items:center;}',

    /* toggle arrow / alignment placeholder */
    '.tj-toggle{flex-shrink:0;width:16px;min-width:16px;height:16px;',
      'display:inline-flex;align-items:center;justify-content:center;',
      'cursor:pointer;user-select:none;border-radius:3px;',
      'font-size:9px;color:#888;margin-right:2px;line-height:1;}',
    '.tj-toggle:hover{background:rgba(0,0,0,.08);color:#333;}',
    '.tj-noop{flex-shrink:0;width:16px;min-width:16px;margin-right:2px;display:inline-block;}',

    /* pin checkbox */
    '.tj-pin-cb{width:13px;height:13px;margin:0 6px 0 0;cursor:pointer;',
      'accent-color:#4F46E5;flex-shrink:0;}',
    '.tj-pin-ph{width:13px;height:13px;margin:0 6px 0 0;flex-shrink:0;display:inline-block;}',

    /* value colours */
    '.tj-key{color:#9c27b0;}',
    '.tj-sep{color:#555;margin:0 3px;}',
    '.tj-str{color:#2e7d32;}',
    '.tj-num{color:#1565c0;}',
    '.tj-bool{color:#e65100;}',
    '.tj-null{color:#c62828;}',
    '.tj-brace{color:#555;font-weight:600;}',

    /* collapse hint (shown when closed) */
    '.tj-hint{color:#aaa;font-style:italic;margin-left:6px;pointer-events:none;display:none;}',
    '.tj-open  > .tj-hint{display:none;}',
    '.tj-closed > .tj-children{display:none;}',
    '.tj-closed > .tj-hint{display:inline;}',

    /* children indent */
    '.tj-children{margin-left:12px;border-left:1px dotted #d0d0d0;padding-left:12px;}',
  ].join('');

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var el = document.createElement('style');
    el.id = STYLE_ID;
    el.textContent = CSS;
    (document.head || document.documentElement).appendChild(el);
  }

  /* ─── helpers ────────────────────────────────────────────────────── */

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function primitiveHtml(val) {
    if (val === null)          return '<span class="tj-null">null</span>';
    switch (typeof val) {
      case 'string':  return '<span class="tj-str">"'  + esc(val) + '"</span>';
      case 'number':  return '<span class="tj-num">'   + esc(String(val)) + '</span>';
      case 'boolean': return '<span class="tj-bool">'  + esc(String(val)) + '</span>';
      default:        return '<span>' + esc(JSON.stringify(val)) + '</span>';
    }
  }

  function hintText(val) {
    if (Array.isArray(val)) return ' [\u2026] (' + val.length + ' items)';
    var n = Object.keys(val).length;
    return ' {\u2026} (' + n + (n === 1 ? ' key' : ' keys') + ')';
  }

  function makeSpacer(cls) {
    var el = document.createElement('span');
    el.className = cls;
    return el;
  }

  /** Returns an <input type=checkbox> or a same-size placeholder. */
  function makeCheckbox(path, options) {
    if (!options || !options.onToggle) {
      return makeSpacer('tj-pin-ph');
    }
    var cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tj-pin-cb';
    cb.dataset.path = path;
    cb.title = 'Pin to dashboard';
    cb.checked = !!(options.pinnedPaths && options.pinnedPaths.has(path));
    cb.addEventListener('click', function (e) { e.stopPropagation(); });
    cb.addEventListener('change', function () {
      if (options.onToggle) options.onToggle(path, cb.checked);
    });
    return cb;
  }

  function childPath(parentPath, key) {
    return parentPath === '' ? String(key) : parentPath + '.' + String(key);
  }

  /* ─── renderer ───────────────────────────────────────────────────── */

  function renderNode(parent, val, key, depth, maxOpen, path, options) {
    var isArr = Array.isArray(val);
    var isObj = val !== null && typeof val === 'object';
    var hasKey = key !== null;  // false only for the root call

    /* ── primitive leaf ─────────────────────────────────────────────── */
    if (!isObj) {
      var row = document.createElement('div');
      row.className = 'tj-node';

      var hdr = document.createElement('div');
      hdr.className = 'tj-header';

      hdr.appendChild(makeSpacer('tj-noop'));

      if (hasKey) {
        hdr.appendChild(makeCheckbox(path, options));
        if (typeof key === 'string') {
          var kspan = document.createElement('span');
          kspan.innerHTML = '<span class="tj-key">"' + esc(key) + '"</span>' +
                            '<span class="tj-sep">:</span>';
          hdr.appendChild(kspan);
        }
      }

      var vspan = document.createElement('span');
      vspan.innerHTML = primitiveHtml(val);
      hdr.appendChild(vspan);

      row.appendChild(hdr);
      parent.appendChild(row);
      return;
    }

    /* ── object / array ─────────────────────────────────────────────── */
    var keys   = isArr ? null : Object.keys(val);
    var len    = isArr ? val.length : keys.length;
    var oB     = isArr ? '[' : '{';
    var cB     = isArr ? ']' : '}';
    var isOpen = depth < maxOpen;

    /* empty container — render inline */
    if (len === 0) {
      var erow = document.createElement('div');
      erow.className = 'tj-node';
      var ehdr = document.createElement('div');
      ehdr.className = 'tj-header';
      ehdr.appendChild(makeSpacer('tj-noop'));
      if (hasKey) {
        ehdr.appendChild(makeCheckbox(path, options));
        if (typeof key === 'string') {
          var ekspan = document.createElement('span');
          ekspan.innerHTML = '<span class="tj-key">"' + esc(key) + '"</span>' +
                             '<span class="tj-sep">:</span>';
          ehdr.appendChild(ekspan);
        }
      }
      var ebrace = document.createElement('span');
      ebrace.className = 'tj-brace';
      ebrace.textContent = oB + '\u00a0' + cB;
      ehdr.appendChild(ebrace);
      erow.appendChild(ehdr);
      parent.appendChild(erow);
      return;
    }

    /* expandable container */
    var node = document.createElement('div');
    node.className = 'tj-node ' + (isOpen ? 'tj-open' : 'tj-closed');

    var header = document.createElement('div');
    header.className = 'tj-header';

    var toggle = document.createElement('span');
    toggle.className = 'tj-toggle';
    toggle.textContent = isOpen ? '\u25be' : '\u25b8'; /* ▾ ▸ */
    header.appendChild(toggle);

    if (hasKey) {
      header.appendChild(makeCheckbox(path, options));
      if (typeof key === 'string') {
        var keyEl = document.createElement('span');
        keyEl.innerHTML = '<span class="tj-key">"' + esc(key) + '"</span>' +
                          '<span class="tj-sep">:</span>';
        header.appendChild(keyEl);
      }
    }

    var obEl = document.createElement('span');
    obEl.className = 'tj-brace';
    obEl.textContent = oB;
    header.appendChild(obEl);

    var hint = document.createElement('span');
    hint.className = 'tj-hint';
    hint.textContent = hintText(val);
    header.appendChild(hint);

    node.appendChild(header);

    /* children */
    var childrenDiv = document.createElement('div');
    childrenDiv.className = 'tj-children';

    if (isArr) {
      for (var i = 0; i < len; i++) {
        renderNode(childrenDiv, val[i], i, depth + 1, maxOpen, childPath(path, i), options);
      }
    } else {
      for (var j = 0; j < keys.length; j++) {
        renderNode(childrenDiv, val[keys[j]], keys[j], depth + 1, maxOpen,
                   childPath(path, keys[j]), options);
      }
    }

    /* closing brace (inside children so it scrolls with them) */
    var crow = document.createElement('div');
    crow.className = 'tj-node';
    var chdr = document.createElement('div');
    chdr.className = 'tj-header';
    chdr.appendChild(makeSpacer('tj-noop'));
    var cbrace = document.createElement('span');
    cbrace.className = 'tj-brace';
    cbrace.textContent = cB;
    chdr.appendChild(cbrace);
    crow.appendChild(chdr);
    childrenDiv.appendChild(crow);

    node.appendChild(childrenDiv);

    /* toggle click */
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = node.classList.contains('tj-open');
      node.classList.replace(open ? 'tj-open' : 'tj-closed',
                             open ? 'tj-closed' : 'tj-open');
      toggle.textContent = open ? '\u25b8' : '\u25be';
    });

    parent.appendChild(node);
  }

  /* ─── public API ─────────────────────────────────────────────────── */

  global.TreeJSONLib = {
    /**
     * @param {Element} container
     * @param {*}       data
     * @param {number}  [maxOpen=1]   levels to expand initially
     * @param {object}  [options]     { pinnedPaths: Set, onToggle: fn }
     */
    render: function (container, data, maxOpen, options) {
      injectStyles();
      container.innerHTML = '';
      var root = document.createElement('div');
      root.className = 'tj-root';
      renderNode(root, data, null, 0, typeof maxOpen === 'number' ? maxOpen : 1, '', options || {});
      container.appendChild(root);
    }
  };

})(window);
