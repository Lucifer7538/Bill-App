import { useEffect, useMemo, useState } from "react";
import axios from "axios"; import html2canvas from "html2canvas"; import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Wifi, Store, Upload, Download } from "lucide-react";
import { Button } from "@/components/ui/button"; import { Input } from "@/components/ui/input"; import { Toaster, toast } from "sonner";
import "@/App.css";

const API = `${process.env.REACT_APP_BACKEND_URL ? process.env.REACT_APP_BACKEND_URL.replace(/\/$/, '') : ""}/api`;
const STATIC_ABOUT_QR_URL = process.env.REACT_APP_ABOUT_QR_URL;
const createItem = (defaultHsn = "") => ({ id: `${Date.now()}-${Math.random()}`, description: "", hsn: defaultHsn, weight: "", quantity: "1", rate_override: "", amount_override: "", mc_override: "" });

const defaultSettings = {
  shop_name: "Jalaram Jewellers", tagline: "The Silver Specialist", phone_numbers: ["+91 9583221115", "+91 9776177296", "+91 7538977527"], email: "jalaramjewellers26@gmail.com",
  shop_name_color: "#000000", shop_name_size: 26, shop_name_font: "sans-serif", shop_name_align: "center", tagline_color: "#475569", tagline_size: 12, tagline_font: "sans-serif", tagline_align: "center",
  address_color: "#475569", address_size: 14, address_font: "sans-serif", address_align: "center", phone_color: "#475569", phone_size: 13, phone_font: "sans-serif", phone_align: "center",
  email_color: "#475569", email_size: 13, email_font: "sans-serif", email_align: "center", silver_rate_per_gram: 240, making_charge_per_gram: 15, flat_mc_below_5g: 150, default_hsn: "7113",
  formula_note: "Line total = Weight x (Silver rate per gram + Making charge per gram)", logo_data_url: "", about_qr_data_url: STATIC_ABOUT_QR_URL, custom_fonts: [], enter_as_tab: true, 
  shortcuts: [{ id: "s1", key: "s", ctrl: true, shift: false, action: "save_bill" }, { id: "s2", key: "n", ctrl: true, shift: false, action: "new_bill" }],
  branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Plot No.525, Vivekananda Marg, Old Town, BBSR-2", map_url: "#", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Shop No.14, BMC Market Complex, Unit-2, BBSR-9", map_url: "#", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }
  ]
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (v) => { if (v === null || v === undefined || v === "") return 0; const p = Number.parseFloat(v); return Number.isFinite(p) ? p : 0; };
const money = (v) => num(v).toFixed(2);
const clampPrintScale = (v) => Math.min(102, Math.max(98, v));
const getInitialPrintScale = () => { const s = Number(localStorage.getItem("jj_print_scale") || "100"); return Number.isFinite(s) ? clampPrintScale(s) : 100; };
const splitAmount = (amt) => { const v = Number.isFinite(amt) ? amt : 0; const r = Math.floor(v); const p = Math.round((v - r) * 100).toString().padStart(2, "0"); return { rupees: r, paise: p }; };
const registerFont = (name, url) => { const id = `cf-${name.replace(/\s+/g, '-').toLowerCase()}`; if (document.getElementById(id)) return; const s = document.createElement('style'); s.id = id; s.innerHTML = `@font-face { font-family: '${name}'; src: url('${url}'); }`; document.head.appendChild(s); };

const FontSelectOptions = ({ f }) => (<><option value="sans-serif">Sans-serif</option><option value="Arial">Arial</option><option value="'Times New Roman'">Times New Roman</option><option value="Georgia">Georgia</option><option value="'Brush Script MT'">Brush Script</option>{f?.map(x => (<option key={x.name} value={`'${x.name}'`}>{x.name}</option>))}</>);

const BillTable = ({ mode, items }) => (
  <table className="bill-table" style={{ width: "100%", tableLayout: "fixed", wordWrap: "break-word" }}>
    <thead>
      {mode === "invoice" ? (<tr><th style={{ width: "8%" }}>Sl.</th><th style={{ width: "32%" }}>DESCRIPTION</th><th style={{ width: "10%" }}>HSN</th><th style={{ width: "16%", whiteSpace: "normal" }}>WEIGHT (g)</th><th style={{ width: "16%", whiteSpace: "normal" }}>RATE Rs.</th><th style={{ width: "18%", whiteSpace: "normal" }}>AMOUNT</th></tr>) : (<tr><th style={{ width: "8%" }}>Sl.</th><th style={{ width: "38%" }}>Particulars</th><th style={{ width: "16%", whiteSpace: "normal" }}>Weight</th><th style={{ width: "18%", whiteSpace: "normal" }}>RATE Rs.</th><th style={{ width: "12%", whiteSpace: "normal" }}>Rs.</th><th style={{ width: "8%", whiteSpace: "normal" }}>Ps.</th></tr>)}
    </thead>
    <tbody>
      {items.map((i, idx) => {
        const rate = mode === "estimate" ? (num(i.quantity) > 0 ? num(i.amount) / num(i.quantity) : 0) : (num(i.weight) > 0 ? num(i.amount) / num(i.weight) : 0);
        return (<tr key={idx}>{mode === "invoice" ? (<><td>{i.sl_no || idx + 1}</td><td>{i.description || "-"}</td><td>{i.hsn || "-"}</td><td>{money(i.weight)}</td><td>{money(rate)}</td><td>{i.rupees}.{i.paise}</td></>) : (<><td>{i.sl_no || idx + 1}</td><td>{i.description || "-"}</td><td>{money(i.weight)}</td><td>{money(rate)}</td><td>{i.rupees}</td><td>{i.paise}</td></>)}</tr>);
      })}
    </tbody>
  </table>
);

export default function App() {
  const [isCompactView, setIsCompactView] = useState(window.innerWidth <= 520);
  const [isDirty, setIsDirty] = useState(false); const markDirty = () => setIsDirty(true);
  const [isPublicView, setIsPublicView] = useState(false); const [publicBill, setPublicBill] = useState(null); const [publicSettings, setPublicSettings] = useState(null); const [publicLoading, setPublicLoading] = useState(false);
  const [passcode, setPasscode] = useState(""); const [token, setToken] = useState(localStorage.getItem("jj_auth_token") || ""); const [checkingSession, setCheckingSession] = useState(Boolean(token)); const [loggingIn, setLoggingIn] = useState(false);
  const [settings, setSettings] = useState(defaultSettings); const [globalBranchId, setGlobalBranchId] = useState("B1"); const [billBranchId, setBillBranchId] = useState("B1");
  const [currentBillId, setCurrentBillId] = useState(null); const [mode, setMode] = useState("invoice"); const [documentNumber, setDocumentNumber] = useState(""); const [isNumberLoading, setIsNumberLoading] = useState(false); const [billDate, setBillDate] = useState(today());
  const [customer, setCustomer] = useState({ id: "", name: "", phone: "", address: "", email: "" }); const [suggestions, setSuggestions] = useState([]); const [items, setItems] = useState([]);
  const [discount, setDiscount] = useState("0"); const [exchange, setExchange] = useState("0"); const [manualRoundOff, setManualRoundOff] = useState(""); const [notes, setNotes] = useState("");
  const [txType, setTxType] = useState("sale"); const [paymentMethod, setPaymentMethod] = useState(""); const [splitCash, setSplitCash] = useState(""); const [isPaymentDone, setIsPaymentDone] = useState(false); 
  const [advanceAmount, setAdvanceAmount] = useState(""); const [advanceMethod, setAdvanceMethod] = useState(""); const [advanceSplitCash, setAdvanceSplitCash] = useState(""); const [isAdvancePaid, setIsAdvancePaid] = useState(false);
  const [balanceMethod, setBalanceMethod] = useState(""); const [balanceSplitCash, setBalanceSplitCash] = useState(""); const [isBalancePaid, setIsBalancePaid] = useState(false);
  const [showSettings, setShowSettings] = useState(false); const [settingsTab, setSettingsTab] = useState("design"); const [showRecentBills, setShowRecentBills] = useState(false); const [recentBillsList, setRecentBillsList] = useState([]);
  const [showLedger, setShowLedger] = useState(false); const [todayBills, setTodayBills] = useState([]); const [ledgerLogs, setLedgerLogs] = useState([]); const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState("expense"); const [logAmount, setLogAmount] = useState(""); const [logReason, setLogReason] = useState(""); const [logSourceVault, setLogSourceVault] = useState("cash"); const [logTargetVault, setLogTargetVault] = useState("estimate_bank");
  const [editingBalances, setEditingBalances] = useState(false); const [manualCash, setManualCash] = useState(""); const [manualEstBank, setManualEstBank] = useState(""); const [manualInvBank, setManualInvBank] = useState("");
  const [storageStats, setStorageStats] = useState({ used_bytes: 0, percentage: 0 }); const [savingBill, setSavingBill] = useState(false); const [printScale, setPrintScale] = useState(getInitialPrintScale);
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const activeGlobalBranch = settings.branches?.find(b => b.id === globalBranchId) || settings.branches?.[0] || defaultSettings.branches[0];
  const activeBillBranch = settings.branches?.find(b => b.id === billBranchId) || settings.branches?.[0] || defaultSettings.branches[0];

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!e || typeof e.key !== 'string') return; const active = document.activeElement;
      if ((settings.enter_as_tab ?? true) && e.key === 'Enter' && active && (active.tagName === 'INPUT' || active.tagName === 'SELECT') && active.type !== 'submit') {
        e.preventDefault(); const focusable = Array.from(document.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])'));
        const index = focusable.indexOf(active); if (index > -1 && index < focusable.length - 1) focusable[index + 1].focus(); return;
      }
      const matchedSc = (settings.shortcuts || []).find(sc => sc && sc.key && typeof e.key === 'string' && e.key.toLowerCase() === String(sc.key).toLowerCase() && !!sc.ctrl === (e.ctrlKey || e.metaKey) && !!sc.shift === e.shiftKey);
      if (matchedSc) {
        e.preventDefault();
        switch(matchedSc.action) {
          case 'save_bill': document.getElementById('save-bill-btn')?.click(); break;
          case 'new_bill': document.getElementById('new-bill-btn')?.click(); break;
          case 'add_item': document.getElementById('add-item-btn')?.click(); break;
          case 'open_settings': setShowSettings(true); break;
          case 'jump_customer': document.getElementById('jump-customer-name')?.focus(); break;
          case 'jump_phone': document.getElementById('jump-customer-phone')?.focus(); break;
          case 'jump_items': document.getElementById('jump-item-desc')?.focus(); break;
          case 'jump_weight': document.getElementById('jump-weight')?.focus(); break;
          case 'jump_rate': document.getElementById('jump-rate')?.focus(); break;
          case 'jump_discount': document.getElementById('jump-discount')?.focus(); break;
          case 'jump_payment': document.getElementById('jump-payment-method')?.focus(); break;
          default: break;
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown); return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settings.shortcuts, settings.enter_as_tab]);

  useEffect(() => { if (settings.custom_fonts) settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl)); }, [settings.custom_fonts]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); const viewDoc = params.get("view"); if (viewDoc) { setIsPublicView(true); setPublicLoading(true); axios.get(`${API}/bills/public/${viewDoc}`).then(res => { setPublicBill(res.data.bill); const s = { ...defaultSettings, ...res.data.settings }; if (s.custom_fonts) s.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl)); setPublicSettings(s); }).catch(() => setPublicBill("NOT_FOUND")).finally(() => setPublicLoading(false)); } }, []);
  useEffect(() => { const handleResize = () => setIsCompactView(window.innerWidth <= 520); window.addEventListener("resize", handleResize); return () => window.removeEventListener("resize", handleResize); }, []);
  useEffect(() => { localStorage.setItem("jj_print_scale", String(clampPrintScale(printScale))); }, [printScale]);
  useEffect(() => { if (!isPublicView && token) { axios.get(`${API}/auth/verify`, { headers: authHeaders }).catch(() => { localStorage.removeItem("jj_auth_token"); setToken(""); }).finally(() => setCheckingSession(false)); } }, [token, isPublicView, authHeaders]);
  useEffect(() => { if (showRecentBills && token && !isPublicView) { axios.get(`${API}/bills/recent?limit=50&branch_filter=ALL`, { headers: authHeaders }).then(res => setRecentBillsList(res.data)).catch(() => toast.error("Failed to load")); } }, [showRecentBills, token, isPublicView, authHeaders]);
  useEffect(() => { if (showLedger && token && !isPublicView) { loadSettings().then(() => axios.get(`${API}/bills/today?date=${today()}&branch_id=${globalBranchId}`, { headers: authHeaders })).then(res => setTodayBills(res.data)).then(() => axios.get(`${API}/settings/ledger/logs?branch_id=${globalBranchId}`, { headers: authHeaders })).then(res => setLedgerLogs(res.data)); } }, [showLedger, token, isPublicView, globalBranchId, authHeaders]);
  useEffect(() => { if (!token || isPublicView) return; const query = customer.phone.trim() || customer.name.trim(); if (query.length < 2) { setSuggestions([]); return; } const t = setTimeout(() => { axios.get(`${API}/customers/suggest`, { headers: authHeaders, params: { query } }).then(res => setSuggestions(res.data || [])); }, 250); return () => clearTimeout(t); }, [customer.phone, customer.name, token, isPublicView, authHeaders]);

  const loadSettings = async () => { const res = await axios.get(`${API}/settings`, { headers: authHeaders }); const logo = localStorage.getItem("jj_logo_data_url"); const s = res.data || {}; setSettings({ ...defaultSettings, ...s, logo_data_url: logo || s.logo_data_url || "" }); if (!s.branches?.find(b => b.id === globalBranchId)) { setGlobalBranchId(s.branches?.[0]?.id || "B1"); setBillBranchId(s.branches?.[0]?.id || "B1"); } };
  const reserveNumber = async (m, b) => { setIsNumberLoading(true); try { const res = await axios.get(`${API}/bills/next-number`, { headers: authHeaders, params: { mode: m, branch_id: b } }); setDocumentNumber(res.data.document_number || ""); } finally { setIsNumberLoading(false); } };
  useEffect(() => { if (isPublicView) return; if (token) { loadSettings().then(() => reserveNumber(mode, billBranchId)); } }, [token, isPublicView]);

  const computed = useMemo(() => {
    const baseSilver = Number(settings.silver_rate_per_gram) || 0; const baseMC = Number(settings.making_charge_per_gram) || 0; const flatMC = Number(settings.flat_mc_below_5g) || 0;
    const mapped = (items || []).map((item, idx) => {
      const w = num(item.weight); const q = Math.max(num(item.quantity || 1), 1); const sr = item.rate_override !== "" ? num(item.rate_override) : baseSilver;
      let mc = 0; if (item.mc_override !== "") mc = w * num(item.mc_override); else if (flatMC > 0 && w > 0 && w <= 5) mc = flatMC; else mc = w * baseMC;
      const cost = (w * sr) + mc; const fAmt = mode === "estimate" ? cost * q : cost; const amt = item.amount_override !== "" ? num(item.amount_override) : fAmt;
      const { rupees, paise } = splitAmount(amt); return { ...item, slNo: idx + 1, quantity: q, amount: amt, rupees, paise, weight: w };
    });
    const subtotal = mapped.reduce((sum, r) => sum + r.amount, 0); const cgst = mode === "invoice" ? subtotal * 0.015 : 0; const gst = cgst * 2; const mdr = paymentMethod === "Card" ? (subtotal + gst) * 0.02 : 0;
    const bt = subtotal + gst + mdr - num(discount) - num(exchange); const rOff = manualRoundOff === "" ? Math.round(bt) - bt : num(manualRoundOff);
    return { items: mapped, subtotal, cgst, sgst: cgst, igst: 0, mdr, roundOff: rOff, grandTotal: bt + rOff };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff]);

  const updateItem = (id, k, v) => { markDirty(); setItems(p => p.map(i => i.id === id ? { ...i, [k]: v } : i)); };
  const clearBill = async (m = mode, b = billBranchId) => { setCurrentBillId(null); setItems([]); setCustomer({ id: "", name: "", phone: "", address: "", email: "" }); setSuggestions([]); setDiscount("0"); setExchange("0"); setManualRoundOff(""); setTxType("sale"); setPaymentMethod(""); setSplitCash(""); setIsPaymentDone(false); setAdvanceAmount(""); setAdvanceMethod(""); setAdvanceSplitCash(""); setIsAdvancePaid(false); setBalanceMethod(""); setBalanceSplitCash(""); setIsBalancePaid(false); setNotes(""); setIsDirty(false); await reserveNumber(m, b); };
  const handleNewBill = async () => { if (currentBillId && isDirty && !window.confirm("Discard edits?")) return; await clearBill(mode, billBranchId); };
  const handleLogin = async (e) => { e.preventDefault(); setLoggingIn(true); try { const res = await axios.post(`${API}/auth/login`, { passcode }); localStorage.setItem("jj_auth_token", res.data.access_token); setToken(res.data.access_token); toast.success("Logged in"); } catch { toast.error("Wrong passcode."); } finally { setLoggingIn(false); } };
  
  const saveBill = async () => {
    setSavingBill(true);
    try {
      const payload = { mode, branch_id: billBranchId, document_number: documentNumber, date: billDate, customer_id: customer.id || null, customer_name: customer.name, customer_phone: customer.phone, customer_address: customer.address, customer_email: customer.email, tx_type: txType, payment_method: paymentMethod, is_payment_done: isPaymentDone, split_cash: num(splitCash), split_upi: Math.max(0, computed.grandTotal - num(splitCash)), advance_amount: num(advanceAmount), advance_method: advanceMethod, advance_split_cash: num(advanceSplitCash), is_advance_paid: isAdvancePaid, balance_method: balanceMethod, balance_split_cash: num(balanceSplitCash), is_balance_paid: isBalancePaid, discount: num(discount), exchange: num(exchange), round_off: manualRoundOff === "" ? null : num(manualRoundOff), notes, items: computed.items.map(i => ({ description: i.description, hsn: i.hsn, weight: num(i.weight), quantity: num(i.quantity), mc_override: i.mc_override === "" ? null : num(i.mc_override), rate_override: i.rate_override === "" ? null : num(i.rate_override), amount_override: i.amount_override === "" ? null : num(i.amount_override), rate: i.rate, amount: i.amount, sl_no: i.slNo })), totals: { grand_total: computed.grandTotal, subtotal: computed.subtotal, taxable_amount: computed.subtotal, cgst: computed.cgst, sgst: computed.sgst, igst: 0, mdr: computed.mdr, discount: num(discount), exchange: num(exchange), round_off: computed.roundOff } };
      if (currentBillId) { await axios.put(`${API}/bills/update-by-id/${currentBillId}`, payload, { headers: authHeaders }); toast.success("Updated"); } else { const res = await axios.post(`${API}/bills/save`, payload, { headers: authHeaders }); setCurrentBillId(res.data.id); toast.success("Saved"); }
      setIsDirty(false);
    } catch { toast.error("Save failed"); } finally { setSavingBill(false); }
  };

  const getUpiAmount = () => { if (txType === "sale") return paymentMethod === "Split" ? Math.max(0, computed.grandTotal - num(splitCash)) : computed.grandTotal; if (!isAdvancePaid && (advanceMethod === "UPI" || advanceMethod === "Split")) return advanceMethod === "Split" ? Math.max(0, num(advanceAmount) - num(advanceSplitCash)) : num(advanceAmount); if (isAdvancePaid && !isBalancePaid && (balanceMethod === "UPI" || balanceMethod === "Split")) return balanceMethod === "Split" ? Math.max(0, Math.max(0, computed.grandTotal - num(advanceAmount)) - num(balanceSplitCash)) : Math.max(0, computed.grandTotal - num(advanceAmount)); return 0; };
  const upiAmt = getUpiAmount(); const upiId = mode === "invoice" ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id; const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmt)}&cu=INR&tn=Bill_${documentNumber}`;

  if (isPublicView && publicBill) {
    return (
      <div className="billing-app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
        <section id="public-bill-root" className="bill-sheet" style={{ "--print-scale-factor": 1, position: 'relative', zIndex: 1 }}>
          <div className="bill-header">
            <div className="logo-area">{publicSettings?.logo_data_url && <img src={publicSettings.logo_data_url} alt="Logo" className="shop-logo" crossOrigin="anonymous" />}<h2 className="sheet-shop-title">{publicSettings?.shop_name}</h2><p className="sheet-tagline">{publicSettings?.tagline}</p></div>
            <div className="contact-area"><div className="contact-address">{publicSettings?.branches?.[0]?.address}</div><div>{publicSettings?.phone_numbers?.join(" | ")}</div></div>
          </div>
          <div className="sheet-banner">{publicBill.mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}</div>
          <div className="meta-grid"><p><strong>No:</strong> {publicBill.document_number}</p><p><strong>Date:</strong> {publicBill.date}</p></div>
          <div className="customer-box"><p><strong>Name:</strong> {publicBill.customer_name || "-"}</p><p><strong>Address:</strong> {publicBill.customer_address || "-"}</p><p><strong>Phone:</strong> {publicBill.customer_phone || "-"}</p></div>
          <BillTable mode={publicBill.mode} items={publicBill.items || []} />
          <div className="sheet-bottom-stack">
            <div className="totals">
              <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(publicBill.totals?.grand_total || 0)}</strong></div>
            </div>
            <ConnectWithUs phoneLink={publicSettings?.phone_numbers?.[0]} />
          </div>
        </section>
      </div>
    );
  }

  if (checkingSession) return <div className="loading-screen">Loading...</div>;
  if (!token) return (<div className="login-shell"><Toaster position="bottom-right" /><form className="login-card" onSubmit={handleLogin}><h1 className="login-title">Jalaram Jewellers</h1><Input type="password" value={passcode} onChange={e => setPasscode(e.target.value)} placeholder="Passcode" /><Button type="submit" disabled={loggingIn}>Login</Button></form></div>);

  return (
    <div className="billing-app">
      <style dangerouslySetInnerHTML={{ __html: `
        @media (min-width: 600px) {
          .dual-pane-container { display: flex; flex-direction: row; height: calc(100vh - 85px); overflow: hidden; gap: 20px; padding: 15px; max-width: 1600px; margin: 0 auto; box-sizing: border-box; align-items: flex-start; }
          .dual-pane-left { flex: 1.2; height: 100%; overflow-y: auto; padding-right: 10px; }
          .dual-pane-right { flex: 1; height: 100%; overflow-y: auto; padding-left: 10px; padding-bottom: 50px; }
        }
        @media (max-width: 599px) { .dual-pane-container { display: flex; flex-direction: column; gap: 20px; padding: 15px; box-sizing: border-box; } }
      `}} />
      <Toaster position="bottom-right" />
      
      <header className="top-bar no-print">
        <div className="brand-block" style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div><h1 className="brand-title">{settings.shop_name}</h1></div>
          <div style={{ paddingLeft: "15px", borderLeft: "2px solid rgba(255,255,255,0.2)" }}><select value={globalBranchId} onChange={e => handleGlobalBranchChange(e.target.value)} style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white", border: "none", padding: "6px", borderRadius: "6px", outline: "none", cursor: "pointer" }}>{(settings.branches || []).map(b => <option key={b.id} value={b.id} style={{ color: "black" }}>{b.name}</option>)}</select></div>
        </div>
        <div className="mode-toggle"><Button onClick={() => handleModeChange("invoice")} className={mode === "invoice" ? "mode-active" : "mode-inactive"}>Invoice</Button><Button onClick={() => handleModeChange("estimate")} className={mode === "estimate" ? "mode-active" : "mode-inactive"}>Estimate</Button></div>
        <div className="top-actions"><Button variant="outline" onClick={() => {localStorage.removeItem("jj_auth_token"); setToken("");}}>Logout</Button></div>
      </header>

      <main className="dual-pane-container">
        <div className="dual-pane-left">
          <section id="bill-print-root" className="bill-sheet" style={{ margin: 0, "--print-scale-factor": (printScale / 100).toFixed(3), zIndex: 1 }}>
            {(txType === "sale" ? isPaymentDone : isBalancePaid) && <div className="watermark-done">FULLY PAID</div>}
            <div className="bill-header">
              <div className="logo-area">{settings.logo_data_url ? <img src={settings.logo_data_url} alt="Shop Logo" className="shop-logo" crossOrigin="anonymous" /> : <div className="shop-logo-fallback">JJ</div>}<div style={{ width: "100%", textAlign: settings.shop_name_align || "center" }}><h2 className="sheet-shop-title" style={{ fontFamily: settings.shop_name_font || "sans-serif", color: settings.shop_name_color || "#000", fontSize: `${settings.shop_name_size}px`, margin: 0 }}>{settings.shop_name}</h2></div></div>
              <div className="contact-area"><div className="contact-address">{activeBillBranch.address}</div><div>{(settings.phone_numbers || []).join(" | ")}</div>{mode === "invoice" && activeBillBranch.gstin && <p style={{ margin: "4px 0", textAlign: "center", fontWeight: "bold" }}>GSTIN: {activeBillBranch.gstin}</p>}</div>
            </div>
            <div className="sheet-banner">{txType === "booking" ? "BOOKING RECEIPT" : txType === "service" ? "SERVICE ORDER" : mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}</div>
            <div className="meta-grid"><p><strong>{mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {documentNumber}</p><p><strong>Date:</strong> {billDate}</p></div>
            <div className="customer-box"><p><strong>Name:</strong> {customer.name || "-"}</p><p><strong>Address:</strong> {customer.address || "-"}</p><p><strong>Phone:</strong> {customer.phone || "-"}</p></div>
            
            {items.length > 0 ? (<BillTable mode={mode} items={computed.items} />) : (<div style={{ textAlign: "center", padding: "30px", border: "1px dashed #cbd5e1", margin: "20px 0", color: "#94a3b8" }}>Add items to see them on the bill</div>)}
            
            <div className="sheet-bottom-stack">
              <div className="totals">
                <div className="totals-row"><span>{mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span><strong>₹{money(computed.taxable)}</strong></div>
                {mode === "invoice" ? (<><div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(computed.cgst)}</strong></div><div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(computed.sgst)}</strong></div><div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(computed.igst)}</strong></div></>) : (<><div className="totals-row"><span>DISCOUNT</span><strong>₹{money(discount)}</strong></div><div className="totals-row"><span>EXCHANGE</span><strong>₹{money(exchange)}</strong></div></>)}
                <div className="totals-row"><span>MDR (Card 2%)</span><strong>₹{money(computed.mdr)}</strong></div><div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(computed.roundOff)}</strong></div><div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(computed.grandTotal)}</strong></div>
                {txType !== "sale" && (<><div className="totals-row" style={{ marginTop: "10px", color: "#16a34a" }}><span>ADVANCE RECEIVED</span><strong>₹{money(advanceAmount)}</strong></div><div className="totals-row" style={{ color: "#dc2626" }}><span>BALANCE DUE</span><strong>₹{money(Math.max(0, computed.grandTotal - num(advanceAmount)))}</strong></div></>)}
                {upiAmt > 0 && (<div className="payment-qr-box"><p className="scan-title">Scan Here For Payment</p><img src={dynamicQrUrl} alt="QR" className="upi-qr" crossOrigin="anonymous" /><p className="upi-id">UPI: {upiId}</p></div>)}
              </div>
            </div>
            <footer className="sheet-footer"><p>Authorised Signature</p><p>Thanking you.</p></footer>
          </section>
        </div>

        <aside className="controls no-print dual-pane-right">
          <div className="control-card">
            <h3 style={{ margin: "0 0 15px 0" }}>Bill Details</h3>
            <Input id="jump-customer-name" value={customer.name} onChange={e => { setCustomer(p => ({ ...p, name: e.target.value })); markDirty(); }} placeholder="Customer name" />
            <Input id="jump-customer-phone" inputMode="tel" value={customer.phone} onChange={e => { setCustomer(p => ({ ...p, phone: e.target.value })); markDirty(); }} placeholder="Phone" />
            <Input value={customer.address} onChange={e => { setCustomer(p => ({ ...p, address: e.target.value })); markDirty(); }} placeholder="Address" />
            {(suggestions || []).length > 0 && (<div className="suggestions">{(suggestions || []).map((entry) => (<button key={entry.id} type="button" className="suggestion-item" onClick={() => { setCustomer({ id: entry.id, name: entry.name, phone: entry.phone, address: entry.address, email: entry.email }); setSuggestions([]); markDirty(); }}>{entry.name} · {entry.phone}</button>))}</div>)}
          </div>

          <div className="control-card">
            <h3>Item Lines</h3>
            {(items || []).map((item, index) => (
              <div key={item.id} className="item-row-editor">
                <Input id={index === 0 ? "jump-item-desc" : undefined} value={item.description} onChange={e => updateItem(item.id, "description", e.target.value)} placeholder="Desc" />
                <Input id={index === 0 ? "jump-weight" : undefined} inputMode="decimal" value={item.weight} onChange={e => updateItem(item.id, "weight", e.target.value)} placeholder="Weight" />
                <Input inputMode="numeric" value={item.quantity} onChange={e => updateItem(item.id, "quantity", e.target.value)} placeholder="Qty" />
                <Input id={index === 0 ? "jump-rate" : undefined} inputMode="decimal" value={item.rate_override} onChange={e => updateItem(item.id, "rate_override", e.target.value)} placeholder="Custom Rate" />
                <Input inputMode="decimal" value={item.amount_override} onChange={e => updateItem(item.id, "amount_override", e.target.value)} placeholder="Fixed Amt" />
                <Button variant="outline" onClick={() => { setItems(p => p.filter(r => r.id !== item.id)); markDirty(); }}>Remove</Button>
              </div>
            ))}
            <Button id="add-item-btn" onClick={() => { setItems(p => [...p, createItem(settings.default_hsn)]); markDirty(); }} style={{ width: "100%", border: "2px dashed #94a3b8", backgroundColor: "#f8fafc", color: "#334155" }}>+ Add Item</Button>
          </div>

          <div className="control-card">
            <h3>Adjustments & Payment</h3>
            <Input id="jump-discount" inputMode="decimal" value={discount} onChange={e => { setDiscount(e.target.value); markDirty(); }} placeholder="Discount" />
            <Input inputMode="decimal" value={exchange} onChange={e => { setExchange(e.target.value); markDirty(); }} placeholder="Exchange" />
            
            <div style={{ display: 'flex', gap: '5px', marginTop: '15px' }}><Button variant={txType === "sale" ? "default" : "outline"} onClick={() => {setTxType("sale"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Sale</Button><Button variant={txType === "booking" ? "default" : "outline"} onClick={() => {setTxType("booking"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Booking</Button></div>
            
            {txType === "sale" && (
              <div style={{ marginTop: '15px' }}>
                <select id="jump-payment-method" value={paymentMethod} onChange={e => { setPaymentMethod(e.target.value); markDirty(); }} className="native-select"><option value="" disabled>Select Method</option><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Split">Split</option></select>
                {paymentMethod === "Split" && (<div style={{ display: "flex", gap: "10px", marginTop: "10px" }}><Input inputMode="decimal" value={splitCash} onChange={e => { setSplitCash(e.target.value); markDirty(); }} placeholder="Cash Received" /><Input value={`UPI: ₹${money(Math.max(0, computed.grandTotal - num(splitCash)))}`} disabled /></div>)}
                <div style={{ marginTop: "15px", padding: "12px", backgroundColor: isPaymentDone ? "#dcfce7" : "#fef3c7", border: `1.5px solid ${isPaymentDone ? "#22c55e" : "#f59e0b"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={() => { setIsPaymentDone(!isPaymentDone); markDirty(); }}><input type="checkbox" checked={isPaymentDone} onChange={e => { setIsPaymentDone(e.target.checked); markDirty(); }} style={{ width: "20px", height: "20px", cursor: "pointer" }} /><strong style={{ color: isPaymentDone ? "#166534" : "#b45309" }}>{isPaymentDone ? "✅ PAYMENT DONE" : "⏳ PAYMENT PENDING"}</strong></div>
              </div>
            )}
          </div>

          <div className="control-card action-grid">
            <Button id="save-bill-btn" onClick={saveBill} disabled={savingBill} style={{ backgroundColor: "#0f172a" }}>Save Bill</Button>
            <Button onClick={() => window.print()} style={{ backgroundColor: "#16a34a", color: "white" }}>Print</Button>
            <Button onClick={shareWhatsApp}>WhatsApp Link</Button>
            <Button id="new-bill-btn" onClick={handleNewBill} variant="outline">New Bill</Button>
            <Button onClick={() => setShowSettings(true)} variant="outline">Settings</Button>
          </div>
        </aside>
      </main>

      {showSettings && (
        <section className="side-drawer no-print" style={{ width: "100vw", maxWidth: "500px", boxSizing: "border-box", overflowY: "auto", right: 0 }}>
          <div className="drawer-header"><h3>Settings</h3><Button variant="outline" onClick={() => setShowSettings(false)}>Back</Button></div>
          <div style={{ padding: "0 15px 15px 15px", boxSizing: "border-box", width: "100%" }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "20px" }}><Button variant={settingsTab === "design" ? "default" : "outline"} onClick={() => setSettingsTab("design")} style={{ flex: "1 1 100px" }}>🎨 Design</Button><Button variant={settingsTab === "technical" ? "default" : "outline"} onClick={() => setSettingsTab("technical")} style={{ flex: "1 1 100px" }}>⚙️ Tech</Button><Button variant={settingsTab === "branches" ? "default" : "outline"} onClick={() => setSettingsTab("branches")} style={{ flex: "1 1 100px" }}>Branches</Button></div>

            {settingsTab === "technical" && (
              <div className="settings-technical-tab" style={{ width: "100%" }}>
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc", width: "100%", boxSizing: "border-box" }}>
                  <h4 style={{ margin: "0 0 10px 0", display: "flex", justifyContent: "space-between" }}>⌨️ Custom Keyboard Shortcuts</h4>
                  <div style={{ marginBottom: "15px" }}>
                    {(settings.shortcuts || []).map((sc, index) => (
                      <div key={sc.id} style={{ display: "flex", gap: "5px", marginBottom: "8px", alignItems: "center", flexWrap: "wrap", padding: "8px", backgroundColor: "white", borderRadius: "6px", border: "1px solid #cbd5e1" }}>
                        <select value={sc.action} onChange={e => updateShortcut(index, 'action', e.target.value)} style={{ padding: "4px", borderRadius: "4px", border: "1px solid #cbd5e1", fontSize: "0.8rem" }}>
                          <option value="save_bill">Save Bill</option><option value="new_bill">New Bill</option><option value="add_item">Add Item Line</option><option value="open_settings">Open Settings</option><option value="jump_customer">Jump to: Customer Name</option><option value="jump_phone">Jump to: Phone Number</option><option value="jump_items">Jump to: Item Details</option><option value="jump_weight">Jump to: Item Weight</option><option value="jump_rate">Jump to: Custom Silver Rate</option><option value="jump_discount">Jump to: Discount</option><option value="jump_payment">Jump to: Payment Method</option>
                        </select>
                        <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "2px" }}><input type="checkbox" checked={sc.ctrl} onChange={e => updateShortcut(index, 'ctrl', e.target.checked)} /> Ctrl</label>
                        <label style={{ fontSize: "0.8rem", display: "flex", alignItems: "center", gap: "2px" }}><input type="checkbox" checked={sc.shift} onChange={e => updateShortcut(index, 'shift', e.target.checked)} /> Shift</label>
                        <Input style={{ width: "40px", padding: "4px", textAlign: "center", height: "28px" }} maxLength={1} value={sc.key} onChange={e => updateShortcut(index, 'key', e.target.value.toLowerCase())} placeholder="Key" />
                        <Button variant="outline" size="sm" onClick={() => removeShortcut(index)} style={{ height: "28px", padding: "0 8px", color: "red", borderColor: "red" }}>X</Button>
                      </div>
                    ))}
                    <Button size="sm" variant="outline" onClick={() => setSettings(prev => ({ ...prev, shortcuts: [...(prev.shortcuts || []), { id: Date.now(), action: 'save_bill', ctrl: false, shift: false, key: '' }] }))} style={{ width: "100%", borderStyle: "dashed" }}>+ Add New Shortcut Command</Button>
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.85rem", cursor: "pointer", backgroundColor: "white", padding: "8px", border: "1px solid #cbd5e1", borderRadius: "6px" }}><input type="checkbox" checked={settings.enter_as_tab ?? true} onChange={(e) => setSettings(prev => ({ ...prev, enter_as_tab: e.target.checked }))} style={{ cursor: "pointer" }} /><strong>Use 'Enter' / 'Return' key to jump to next box</strong></label>
                </div>
                <Button onClick={saveSettings} style={{ width: "100%", marginBottom: "15px" }}>Save Technical Settings</Button>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
