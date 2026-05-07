# Aisera Debug Viewer — User Guide

**Version 1.0.4**

## What Is This?

Aisera Debug Viewer is a Chrome browser extension that surfaces real-time debug data from the Aisera platform directly in your browser. When you are working on an Aisera page, the extension intercepts the platform's internal API responses and presents the debug payload in a structured, searchable side panel — without requiring you to open DevTools or dig through raw network traffic.

---

## Installation

The extension is distributed as a `.zip` file. Because it is not published to the Chrome Web Store, it must be installed manually using Chrome's "Developer Mode."

**Step 1 — Unzip the extension**

Extract the zip file to a permanent folder on your computer. Do not move or delete this folder after installation — Chrome loads the extension directly from it.

> Example location: `C:\Users\YourName\Extensions\AiseraDebug\` or `~/Extensions/AiseraDebug/`

**Step 2 — Open Chrome Extensions**

In Chrome, navigate to:

```
chrome://extensions
```

Or open the Chrome menu (⋮) → **More tools** → **Extensions**.

**Step 3 — Enable Developer Mode**

In the top-right corner of the Extensions page, toggle **Developer mode** on.

**Step 4 — Load the extension**

Click **Load unpacked**, then select the folder you extracted in Step 1 (the folder that contains `manifest.json`).

The extension will appear in your extensions list as **Aisera Debug**.

**Step 5 — Pin the extension (optional)**

Click the puzzle-piece icon in the Chrome toolbar, find **Aisera Debug**, and click the pin icon to keep it visible in the toolbar.

> **Note:** The extension only activates on pages matching `*.login.aisera.cloud`. It has no effect on other websites.

---

## How to Use It

### Opening the Debug Panel

1. Navigate to an Aisera page (any URL on `login.aisera.cloud`).
2. A **Debug** button will appear automatically in the corner of the page. You can drag it anywhere on screen if it is in the way.
3. Perform an action in the Aisera UI that triggers an AI or workflow response (e.g., send a chat message, start a flow).
4. Click the **Debug** button. The panel slides in from the right edge of the screen.

The panel updates automatically as new responses come in — you do not need to close and reopen it.

### Closing the Panel

Click the **×** button in the top-right corner of the panel, or click the **Debug** button on the page again while the panel is open.

---

## Tabs

The panel has six tabs:

### Dashboard
A customizable summary of values you care about most. Any value from the Debug or Flow Debug tab can be "pinned" to the Dashboard using the checkbox next to it. Pinned cards:
- Persist across page reloads and browser sessions.
- Are collapsed by default when first pinned. The last state the user leaves them in (collapsed or expanded) is remembered across re-renders.
- Can be reordered by dragging the ⠿ handle on each card.
- Can be removed individually with the × button, or all at once via the Debug tab's **Deselect All** button.
- Each field within a pinned card is collapsible and expandable individually.

Dashboard pins are stored separately for the AI Lens page and the workflow-details page. Cards pinned while viewing one page type do not appear when viewing the other.

### Errors
Automatically scans both the AI Lens data and the flow data for known error indicators — null values, empty strings, error/failure status codes, and warning flags. Each entry shows:
- The **field name** and a **breadcrumb path** showing exactly where in the JSON the issue was found.
- The **node label** (e.g., `3 | Action (232892691)`) in the card title when the error originates from a flow node.
- A **→ Debug** button that jumps to the top of the relevant card in the Debug or Flow Debug tab and briefly highlights it in red.

By default, only errors originating from individual flow nodes are shown. Use the **Node errors only** and **Node errors first** settings to change this behavior.

If no issues are detected, the tab shows a green checkmark.

### Debug
Displays the raw AI Lens debug payload (`debugInfoV2`) alongside the flow debug sections as individual expandable/collapsible cards. Each card's fields are individually collapsible. Complex nested values are shown as formatted property lists. Primitive values are color-coded by type (strings, numbers, booleans).

Long field values are auto-collapsed based on the **Auto-collapse character limit** setting, with a preview and a confirmation prompt before loading the full value.

At the top of the section:
- A **Select All** / **Deselect All** button pair controls which cards are pinned to the Dashboard.

### Flow Debug
Shows the workflow execution as a list of node cards. Each node card displays, in order:
- **Error** — shown in red at the top of the card only when an error indicator is detected in that node's data
- **Input** — what data entered the node
- **Output** — what the node produced
- **Conditions** — any branching conditions evaluated
- **Node ID** — the unique identifier of this node
- **Execution Time** — how long the node took to run

Node cards are collapsible. Click the card header or the ▼ button to collapse to just the title bar. Each individual field within a node card is also collapsible.

Subflow nodes are indented below their parent and labeled with hierarchical numbers (e.g., node 9 contains sub-nodes 9-1, 9-2, etc.).

A status badge at the top shows the overall flow execution status (In Progress, Completed, Error, etc.).

Configured flow debug sections (flowDebugInfo, hyperFlowExecutionDetail, error, executedFunctions) appear above or below the node list depending on their position setting. Sections that are enabled but contain no data are listed at the bottom with a badge indicating whether the key was empty or not present in the response.

### Raw JSON
Displays the complete, unmodified AI Lens API response as an interactive collapsible JSON tree. Use this tab when you need to inspect the full payload structure without any filtering or summarization.

The **Copy JSON** button copies the raw text to the clipboard.

### Settings
Persistent preferences stored across sessions. Changes take effect immediately.

**Display**

| Setting | What It Does |
|---|---|
| Push page content | Shifts the page left when the panel opens so nothing is hidden behind it. Disabled automatically on the AI Lens page. |
| Auto-fill test email | Automatically fills the User Email field in the Test Flow modal on the workflow-details page |
| Test email address | The email address inserted into the Test Flow modal |
| Auto-click OK | Automatically clicks the OK button in the Test Flow modal after filling the email |
| Auto-collapse long fields | Automatically collapses node card fields whose value exceeds the character limit |
| Auto-collapse character limit | Fields longer than this are collapsed automatically; a confirmation prompt appears before expanding |
| Truncate long values | Cuts off long strings at a configurable character limit in the Debug tab |
| Truncation character limit | Number of characters before truncation |
| Show "Other Data" section | Toggles display of extra top-level keys below the node list |
| Subflow node indent | How far subflow node cards are indented per nesting level |

**Behavior**

| Setting | What It Does |
|---|---|
| Default tab on load | Which tab is shown when the panel first opens |
| Cards collapsed by default | New cards pinned to the Dashboard start collapsed |
| Enable node highlighting | Adds a colored ◎ button to each node card header; clicking it highlights that node in the Aisera flow canvas |
| Node highlight color | The color used for the node highlight indicator |

**Error Detection**

| Setting | What It Does |
|---|---|
| Flag warnings as errors | Includes warning-type fields in the Errors tab |
| Show node errors only | Hides non-node errors from the Errors tab |
| Show node errors first | Node error cards appear before all others |
| Error preview length | Max characters shown in error card previews |
| Flash duration | How long the red highlight animation lasts when jumping to a card |

**Flow Debug Sections**

Two independent ordered section lists — one for the **AI Lens** page and one for **workflow-details** pages. Each list controls which sections appear in the Flow Debug tab for that page type, and in what order. Drag to reorder; toggle the checkbox to show or hide each section.

Sections available across both lists:

| Section | Description |
|---|---|
| AI Lens Summary | High-level AI Lens result summary |
| Executed Functions | Functions executed during the AI Lens flow |
| LLM Calls | LLM calls made during the flow |
| Nodes | Individual workflow node cards |
| flowDebugInfo | Full flow debug info block |
| hyperFlowExecutionDetail | Hyperflow-specific execution detail |
| workflowExecutionDetail | Workflow execution detail block |
| debugInfoV2 | Raw debugInfoV2 payload |
| convAiV2 | Conversation AI V2 data |
| Durations | Timing breakdown for the flow |
| error | Top-level error data from the flow execution |
| Other Data | Any top-level keys not claimed by a named section |

If a section is enabled but the key is missing or empty in the current response, it appears in a summary row at the bottom of the Flow Debug tab with a badge indicating whether the key was empty or not present in the response.

**Debug Button**

| Setting | What It Does |
|---|---|
| Background color | Fill color of the floating Debug button |
| Text color | Label color of the Debug button |
| Font size | Text size of the Debug button label |
| Width / Height | Explicit dimensions for the Debug button (accepts CSS values or "auto") |

**Appearance**

| Setting | What It Does |
|---|---|
| Accent color | Color used for buttons, active tabs, and highlights |
| String / Number / Boolean colors | Syntax highlight colors for JSON values |
| Base font size | Overall UI text size |
| Card font size | Text size inside value cards |

Click **Reset to Defaults** to restore all settings to their original values.

At the bottom of the Settings tab, a **workflow test counter** shows how many times the OK button has been clicked in the Test Flow modal. The date of the last reset is shown alongside it. Click the button next to the count to reset it to zero.

---

## Tips

- **The Debug button disappears when the panel is open.** It reappears when the panel is closed.
- **Data updates automatically.** While the panel is open, it refreshes whenever the page receives a new debug response. You do not need to click the Debug button again.
- **Pinned dashboard cards survive page reloads.** The paths are stored in Chrome's local extension storage, not the page.
- **The → Debug button in the Errors tab** scrolls to the top of the relevant card in the Debug or Flow Debug tab and briefly highlights it with a red glow.
- **Fields can be collapsed individually** by clicking the field key label inside any card. Long fields auto-collapse and show a preview; a confirmation prompt appears before the full value is loaded.
- **The panel shifts the page content** when it opens so nothing is hidden behind it. On the AI Lens page this behavior is automatically disabled to avoid layout conflicts.
- **The extension only runs on `*.login.aisera.cloud` pages.** It does not inject any code or buttons on any other website.

---

## What's New in Version 1.0.4

- **Per-page-type Dashboard Pins** — Dashboard pins are now stored separately for the AI Lens page and workflow-details pages. Cards pinned on one page type no longer appear when viewing the other.
- **Dashboard card collapse state persists** — Cards pinned to the Dashboard start collapsed by default. The last state the user leaves a card in (collapsed or expanded) is remembered and restored whenever the Dashboard re-renders, such as when a new card is pinned.
- **All Dashboard cards are collapsible** — `flowDebugInfo` and `hyperFlowExecutionDetail` cards on the Dashboard now have the same collapse/expand toggle as all other cards.
- **Debug button hidden on unsupported pages** — The floating Debug button is now only shown when on the AI Lens page or a workflow-details page. It is hidden on all other Aisera pages.
- **Node Highlighting enabled by default** — The node highlight feature (◎ button on each node card) is now on by default for new installs.

---

## What's New in Version 1.0.3

- **Per-page-type Flow Debug Sections** — The Flow Debug Sections settings are now split into two independent lists: one for the AI Lens page and one for workflow-details pages. Each list has its own default section order and enabled/disabled state. Changes to one list have no effect on the other.
- **Pin Executed Functions, LLM Calls, and Durations to the Dashboard** — These AI Lens-specific cards can now be individually pinned to the Dashboard using the checkbox on each card, matching the behavior of all other cards.
- **Page push correctly disabled on AI Lens** — The "push page content" behavior is now reliably suppressed on AI Lens pages regardless of navigation history or session state.

---

## What's New in Version 1.0.2

- **Flow Debug Sections settings** — Four named sections of flow debug data (flowDebugInfo, hyperFlowExecutionDetail, error, executedFunctions) can now be individually shown or hidden, and positioned above or below the node list in the Debug tab. Sections that are enabled but absent or empty in the current response are listed at the bottom with a status badge ("empty" or "not in response").
- **Per-field collapse/expand** — Every field in every card (Debug tab, Flow Debug tab, and Dashboard tab) can now be individually collapsed or expanded by clicking the field key. Fields that exceed the auto-collapse character limit collapse automatically and show a truncated preview; a confirmation prompt appears before loading the full content.
- **Dashboard cards with collapsible fields** — Pinned dashboard cards now use the same per-field collapsible layout as node cards.
- **Auto-fill test email** — When the Test Flow modal appears on the workflow-details page, the extension can automatically fill the User Email field with a configurable email address.
- **Auto-click OK** — Optionally clicks the OK button in the Test Flow modal automatically after filling the email.
- **Workflow test counter** — Tracks how many times the OK button has been clicked in the Test Flow modal. The count and last-reset date are shown at the bottom of the Settings tab with a reset button.
- **Debug button customization** — The floating Debug button's background color, text color, font size, width, and height are now configurable in Settings. The current measured size is shown as a live indicator.
- **Settings accessible before data loads** — The Settings tab is now shown immediately when no debug data is available yet, instead of an error state.
- **Truncation and auto-collapse apply to flow debug section cards** — Long values inside flowDebugInfo, error, and other controlled section cards are now truncated and auto-collapsed using the same settings as node cards.
