# PRD — Jalaram Jewellers Billing Application

## Original Problem Statement
Build a comprehensive single-page billing app for Jalaram Jewellers with passcode login, Invoice/Estimate modes matching uploaded physical templates, editable settings, logo and About QR uploads, formula-driven calculations, dynamic UPI QR, sequential numbering, customer autosuggest, cloud-ready data strategy, and export/share options.

## User Choices Captured
- Cloud storage approach for now: **Local backend first**, cloud integration in next phase.
- Credentials approach: **Use placeholders + setup steps**.
- PDF/UI fidelity priority: **Both typography/colors and spacing together**.

## Architecture Decisions
- **Frontend:** React SPA (single-page), custom billing canvas, responsive control panel.
- **Backend:** FastAPI REST APIs for auth, settings, counters, customers, bill persistence.
- **Database:** MongoDB collections (`shop_settings`, `customers`, `bills`, `number_counters`) for local-first persistence.
- **Auth:** Passcode login (`7538`) with bearer session token.
- **Numbering:** Atomic DB counter updates for invoice/estimate uniqueness.
- **QR:** Dynamic UPI QR generated from UPI URI + final amount.
- **Export:** Browser print + PDF snapshot export using html2canvas + jsPDF.

## User Personas
1. **Shop Owner/Cashier** — Needs fast billing, reliable totals, and print/share workflow.
2. **Repeat Customer Manager** — Needs quick autofill via name/phone suggestion.
3. **Store Operator (non-technical)** — Needs editable business settings without code changes.

## Core Requirements (Static)
- Login gate before billing access.
- Invoice/Estimate mode toggle.
- Physical bill style replication.
- Editable shop metadata + rates + formula note.
- Upload logo + static About QR and persist locally.
- Auto date + sequential doc numbers.
- Formula calculations + manual override support.
- Tax + MDR handling.
- Dynamic payment QR with mode-specific UPI IDs.
- Save/print/pdf/share actions.
- Customer lookup/autosuggest from stored records.

## Implemented So Far (2026-03-16)
- Full passcode-protected app flow (login, logout, session verify).
- Invoice + Estimate single-page billing UI with template-like sections and row structures.
- Settings drawer for editable shop fields, rates, formula note, UPI IDs.
- Local logo upload + About QR upload using LocalStorage persistence.
- Auto date field and atomic sequential numbering (`INV-xxxx`, `EST-xxxx`).
- Customer autosuggest endpoint + frontend autofill.
- Add/remove item rows, formula-based amount, rate/amount override support.
- Invoice taxes + MDR math aligned between UI and API.
- Dynamic UPI QR and “Scan Here For Payment” label.
- Save bill API, print flow, download PDF, WhatsApp/email deep links.
- README updated with Supabase placeholder cloud setup guidance.
- Post-launch bug fix: logo upload reliability improved (image optimization, format validation, success/error feedback, preview in settings).
- Post-launch UX fix: mobile/tablet responsive refinements, compact bill-table mode on small screens, and improved drawer behavior.
- Visual polish pass: improved bill typography hierarchy, spacing consistency, table line-weight alignment, bottom-section structure fidelity, and better phone/tablet readability for invoice/estimate screens.
- Added Back navigation button (scroll-to-top behavior), removed passcode hint from login screen, enabled optional Supabase cloud sync with Mongo fallback, and upgraded print stylesheet to A4 portrait fill with minimal margins.
- Added Print Calibration controls in Settings: auto print scale (98%–102%) with slider, numeric input, reset button, and local persistence for device-specific printer alignment.
- Added explicit Back buttons inside Settings and About drawers for quick close/navigation from menu panels.
- Added ESC keyboard shortcut to close Settings/About drawers, optimized drawer headers for mobile with larger back icon, compacted bill contact/address block, and tightened print-specific layout styles to target single-page A4 output.
- Security and deployment hardening: moved login passcode to backend env (`AUTH_PASSCODE`), moved static About QR URL to frontend env (`REACT_APP_ABOUT_QR_URL`), and passed deployment readiness health check with no blockers.
- Supabase connection completed with live project credentials, verified cloud mode (`supabase-live`), created/validated `customers` and `number_counters` tables + RPC numbering function, and confirmed customer save/recall now reads from Supabase in-app.
- Added live Cloud Sync status badge in top header (`Live` / fallback states), including periodic status refresh for better operational visibility.

## Prioritized Backlog
### P0 (High)
- Pixel-perfect fine-tuning against exact scanned PDF geometry and line thickness.
- Supabase/Firebase live integration (credentials pending) for cloud persistence.

### P1 (Medium)
- Stronger validation rules (required customer fields, numeric guards, inline errors).
- Rich bill history/search page with reopen/edit/reprint.

### P2 (Low)
- Multi-user role separation.
- Advanced analytics (daily totals, payment mode reports, export ledger).

## Next Tasks List
1. Replace local-first persistence with live Supabase/Firebase once keys are provided.
2. Perform side-by-side visual calibration with uploaded PDFs (padding/typography micro-adjustments).
3. Add automated regression tests for bill math and PDF visual snapshots.
4. Add bill history and quick reprint workflow.
