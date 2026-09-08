// The User Manual, built once as shared HTML content -- the same
// approach every other document in this app already uses (one body of
// content feeding both the in-app view and the PDF export), so the two
// can never drift apart from each other. Content mirrors the
// standalone manual shared at the demo, condensed for in-app reading.

export const USER_MANUAL_TITLE = "Unitop Ops -- User Manual";

export const USER_MANUAL_SECTIONS = [
  {
    id: "getting-started",
    title: "1. Getting Started",
    html: `
      <h3>1.1 Logging in</h3>
      <p>Open the app at ops.unitoptours.com. Enter the username and password your admin has given you, and click Login.</p>
      <div class="manual-note"><strong>Fallback addresses:</strong> If ops.unitoptours.com is ever unreachable for any reason, the app is also always available at unitop-ops.vercel.app -- bookmark both.</div>
      <p>Your session stays active for 12 hours. After that, you'll be asked to log in again -- this is normal and not a sign of anything wrong.</p>
      <h3>1.2 The sidebar -- your main map of the app</h3>
      <p>Every screen in Unitop Ops is reached from the sidebar on the left. The sidebar is organised into a few natural groups:</p>
      <ul>
        <li><strong>Dashboard</strong> -- a quick snapshot of what's happening across your active queries.</li>
        <li><strong>Kanban Board</strong> -- every active query as a card, grouped by stage.</li>
        <li><strong>All Queries / Tour Files / Cancelled / Completed</strong> -- full lists, filterable.</li>
        <li><strong>Team Chat</strong> -- direct messages, group chats, and your own notifications, in one place.</li>
        <li><strong>Agents & Clients, Vendors, Series</strong> -- your master data.</li>
        <li><strong>Tour Calendar</strong> -- Gantt view, Ground View, and Movement Chart.</li>
        <li><strong>Invoices, Payments</strong> -- the money side.</li>
        <li><strong>Reports</strong> -- every report the business regularly needs, in one repository.</li>
        <li><strong>User Management, Maintenance</strong> -- admin-only.</li>
      </ul>
      <p>A small red number badge on the Chat icon means you have something unread waiting.</p>
      <h3>1.3 Search -- finding anything, fast</h3>
      <p>Press Ctrl+K from anywhere in the app. Search covers queries, clients, agents, vendors, series, your colleagues, and chat conversations all at once. Searching a colleague's name and selecting them opens a direct message with them immediately.</p>
    `
  },
  {
    id: "query-lifecycle",
    title: "2. The Query Lifecycle",
    html: `
      <p>Nearly everything in Unitop Ops revolves around a Query -- a raw enquiry that moves through a clear, visible pipeline until it's confirmed into a real tour, or closed out.</p>
      <h3>2.1 The stages, in order</h3>
      <table class="manual-table">
        <tr><th>Stage</th><th>What it means</th></tr>
        <tr><td>New Query</td><td>A fresh enquiry has come in.</td></tr>
        <tr><td>Costing</td><td>A Cost Sheet is being built with real supplier rates.</td></tr>
        <tr><td>Confirmed</td><td>A Quotation has gone to the client and they've said yes.</td></tr>
        <tr><td>Operations</td><td>The tour is confirmed and its travel dates have arrived.</td></tr>
        <tr><td>Finance</td><td>The tour has run and payments are being reconciled.</td></tr>
        <tr><td>Completed</td><td>Fully wrapped up.</td></tr>
        <tr><td>Cancelled</td><td>Didn't go ahead -- kept on record, locked from editing.</td></tr>
      </table>
      <h3>2.2 Creating a New Query</h3>
      <p>Click "+ New Query". Fill in whatever you know now -- you don't need every field to save.</p>
      <div class="manual-warn">Only an admin can move a query to an arbitrary stage out of sequence ("Move to Any Stage"). This is for genuine exceptions, not a shortcut -- skipping real steps leaves gaps in your own records.</div>
      <h3>2.3 Cancelling a query</h3>
      <p>If a query genuinely won't proceed, cancel it rather than deleting anything -- cancelled records stay fully visible and searchable, just locked from edits.</p>
    `
  },
  {
    id: "cost-sheet-quotation",
    title: "3. Cost Sheet, Quotation & Tour Info",
    html: `
      <h3>3.1 Cost Sheet</h3>
      <p>Real supplier pricing, entered day by day. Your own internal working document -- the client never sees it. Save a new version for meaningful changes rather than overwriting. Mark a version "Final" once it's genuinely ready to price a Quotation from -- everything downstream pulls from this one version.</p>
      <h3>3.2 Quotation</h3>
      <p>Generated from the Cost Sheet's final version, priced with your own margin -- raw supplier numbers are never shown to the client. If the Cost Sheet changes afterward, you'll see a banner offering to "pull latest" -- nothing is ever silently overwritten.</p>
      <h3>3.3 Tour Info (Tour Execution)</h3>
      <p>The real day-wise operational plan: route, hotel, meal plan, and notes for each day, plus Tour Facilitators and other on-ground details. Every operational document (Tour Briefing Sheet, Movement Chart, Ground View) reads from this -- keep it accurate.</p>
    `
  },
  {
    id: "documents",
    title: "4. Documents",
    html: `
      <p>Every formal document lives inside its own query. All share the same behaviour: full version history (nothing overwritten), independent letterhead toggles, and Export to PDF/Word (Excel too for Cost Sheet).</p>
      <table class="manual-table">
        <tr><th>Document</th><th>Purpose</th></tr>
        <tr><td>Quotation</td><td>The priced proposal sent to the client.</td></tr>
        <tr><td>Brief / Detailed Itinerary</td><td>The day-wise tour plan; Detailed is the photo-illustrated client brochure.</td></tr>
        <tr><td>Meal Plan</td><td>Day-by-day included meals.</td></tr>
        <tr><td>Tour Briefing Sheet</td><td>Internal operational summary for whoever's running the tour.</td></tr>
        <tr><td>Exchange Order</td><td>A service voucher to a vendor -- not a financial document.</td></tr>
        <tr><td>Proforma / Tax Invoice</td><td>Formal billing documents.</td></tr>
        <tr><td>Payment Receipt</td><td>Issued when a payment is received.</td></tr>
        <tr><td>Editor</td><td>A free-form document for anything that doesn't fit a fixed template.</td></tr>
      </table>
    `
  },
  {
    id: "payments-pl",
    title: "5. Payments & P&L",
    html: `
      <p>Record both incoming (client) and outgoing (vendor) payments in a query's Payment Tracker. Entries can be amended later -- amending keeps a full history rather than silently editing the original.</p>
      <div class="manual-note">If a client pays in a foreign currency, record what they paid, and separately enter the real INR amount credited once known. Until then, that payment won't count toward your totals -- deliberate, so nothing is counted on a guess.</div>
      <p>The P&L tab is a live, always-current view. The separate P&L Export (PDF/Word/Excel) is a frozen snapshot at the moment you exported it -- the Excel version contains real formulas that recalculate if you edit a row.</p>
    `
  },
  {
    id: "master-data",
    title: "6. Master Data",
    html: `
      <p><strong>Agents & Clients</strong> -- link a new query to a real agent record rather than retyping details, so Search can instantly show every tour that agent has sent you.</p>
      <p><strong>Vendors</strong> -- every hotel, transporter, and facilitator, including contracted rates. Each vendor's page shows their full ledger and every Exchange Order ever issued to them.</p>
      <p><strong>Series</strong> -- groups repeated departures of the same fixed tour running on multiple dates through a season.</p>
    `
  },
  {
    id: "tour-calendar",
    title: "7. Tour Calendar",
    html: `
      <p><strong>Gantt</strong> -- a visual month-by-month bar chart of every confirmed tour's dates.</p>
      <p><strong>Ground View</strong> -- pick any date and see every tour physically running that day, with facilitators and that exact day's real itinerary, pulled live from Tour Info.</p>
      <p><strong>Movement Chart</strong> -- a report-style view of tour movements across a chosen month, built for printing.</p>
    `
  },
  {
    id: "team-chat",
    title: "8. Team Chat & Discussions",
    html: `
      <p>Two deliberately different ways to communicate:</p>
      <p><strong>Discussion (inside a query)</strong> -- for anything about that particular tour. Mention a colleague, tour file, agent, vendor, or series with @ and it becomes a real, clickable link.</p>
      <p><strong>Team Chat (DMs and Groups)</strong> -- for conversations between people, independent of any specific tour. Groups have a real admin role; either person in a DM can delete it.</p>
      <div class="manual-note">Mention someone anywhere and they get a real notification waiting in their own Notifications thread, plus a live toast if they're online.</div>
      <p><em>Rule of thumb: if the conversation is about a specific tour, put it in that query's Discussion -- not a side DM. Six months from now, a decision buried in a private DM is effectively lost.</em></p>
    `
  },
  {
    id: "reports",
    title: "9. Reports",
    html: `<p>A proper repository, not a single dashboard -- every report the business regularly needs, exportable, lives here.</p>`
  },
  {
    id: "user-management",
    title: "10. User Management (Admin)",
    html: `
      <p>Only admins can access this -- staff accounts, roles, and permissions.</p>
      <table class="manual-table">
        <tr><th>Action</th><th>What it does</th><th>When to use it</th></tr>
        <tr><td>Deactivate</td><td>Blocks login. Fully reversible.</td><td>Extended leave, temporary suspension.</td></tr>
        <tr><td>Delete</td><td>Permanent. Cannot log in again -- irreversible.</td><td>Someone has genuinely left for good.</td></tr>
      </table>
      <div class="manual-warn">Delete cannot be undone. If there's any doubt, Deactivate is always the safer choice.</div>
    `
  },
  {
    id: "maintenance",
    title: "11. Maintenance (Admin)",
    html: `
      <p><strong>Backup & Export</strong> -- a full, human-readable export of every real business record, one sheet per data type, downloadable any time. Shows exactly when it was last run and by whom.</p>
      <p><strong>Health Check</strong> -- runs a real set of checks against the live data (orphaned records, incomplete payments, tours stuck past their end date, and more) and tells you plainly whether everything looks right.</p>
      <p><strong>This Manual</strong> -- exactly what you're reading now, exportable to PDF any time.</p>
    `
  },
  {
    id: "best-practices",
    title: "12. Best Practices",
    html: `
      <h3>Do</h3>
      <ul>
        <li>Save your work as you go, rather than filling in a huge amount and saving once at the end.</li>
        <li>Use a query's Discussion tab for anything specific to that tour.</li>
        <li>Link queries to real Agent, Vendor, and Series records instead of typing free text.</li>
        <li>Mark a Cost Sheet version "Final" only once it's genuinely ready to quote from.</li>
        <li>Cancel a query that won't proceed, rather than leaving it sitting active indefinitely.</li>
      </ul>
      <h3>Avoid</h3>
      <ul>
        <li>Don't use "Move to Any Stage" to skip real steps.</li>
        <li>Don't retype an agent or vendor's details if they already exist -- search first.</li>
        <li>Don't use Team Chat DMs for anything tour-specific someone else might need to find later.</li>
        <li>Don't delete a staff account if there's any chance they'll return -- deactivate instead.</li>
        <li>Don't edit the same record at the exact same time as a colleague -- whoever saves last silently overwrites the other, with no warning either way.</li>
      </ul>
    `
  },
  {
    id: "troubleshooting",
    title: "13. If Something Looks Wrong",
    html: `
      <table class="manual-table">
        <tr><th>What you're seeing</th><th>What to actually do</th></tr>
        <tr><td>The app won't load at all</td><td>Try unitop-ops.vercel.app directly.</td></tr>
        <tr><td>A number or field looks wrong</td><td>Check the document's own version history first.</td></tr>
        <tr><td>Someone can't find a conversation</td><td>Check whether it's in a query's Discussion vs. a Team Chat DM.</td></tr>
        <tr><td>A save seems to have silently failed</td><td>Refresh and check whether your change is actually there.</td></tr>
        <tr><td>Anything you genuinely can't explain</td><td>Don't guess or work around it silently -- flag it.</td></tr>
      </table>
    `
  },
];

// Builds one combined HTML string of every section, for the PDF export
// path (buildPaginatedLetterheadDocument's bodyBlocks).
export function buildManualBodyHTML() {
  return USER_MANUAL_SECTIONS.map(s => `<h2>${s.title}</h2>${s.html}`).join("\n");
}
