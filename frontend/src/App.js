import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Wifi, Store, Upload, Download, Home, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL ? BACKEND_URL.replace(/\/$/, '') : ""}/api`;
const STATIC_ABOUT_QR_URL = process.env.REACT_APP_ABOUT_QR_URL;

const createItem = (defaultHsn = "") => ({
  id: `${Date.now()}-${Math.random()}`, description: "", hsn: defaultHsn, weight: "", quantity: "1", rate_override: "", amount_override: "", mc_override: ""
});

const defaultSettings = {
  shop_name: "Jalaram Jewellers", tagline: "The Silver Specialist", phone_numbers: ["+91 9583221115", "+91 9776177296", "+91 7538977527"], email: "jalaramjewellers26@gmail.com",
  shop_name_color: "#000000", shop_name_size: 26, shop_name_font: "sans-serif", shop_name_align: "center",
  tagline_color: "#475569", tagline_size: 12, tagline_font: "sans-serif", tagline_align: "center",
  address_color: "#475569", address_size: 14, address_font: "sans-serif", address_align: "center",
  phone_color: "#475569", phone_size: 13, phone_font: "sans-serif", phone_align: "center",
  email_color: "#475569", email_size: 13, email_font: "sans-serif", email_align: "center",
  silver_rate_per_gram: 240, making_charge_per_gram: 15, flat_mc_below_5g: 150, default_hsn: "7113",
  formula_note: "Line total = Weight x (Silver rate per gram + Making charge per gram)", logo_data_url: "", about_qr_data_url: STATIC_ABOUT_QR_URL, custom_fonts: [],
  text_macros: [
    { id: "m1", key: "Alt+1", text: "Silver Payal" },
    { id: "m2", key: "Alt+2", text: "Silver Chain" },
    { id: "m3", key: "Alt+3", text: "Silver Ring" }
  ],
  branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", map_url: "https://g.page/r/CVvnomQZn7zxEBE/review", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", map_url: "#", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }
  ]
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (val) => { if (val === null || val === undefined || val === "") return 0; const parsed = Number.parseFloat(val); return Number.isFinite(parsed) ? parsed : 0; };
const money = (val) => num(val).toFixed(2);
const clampPrintScale = (value) => Math.min(102, Math.max(98, value));
const getInitialPrintScale = () => { const saved = Number(localStorage.getItem("jj_print_scale") || "100"); return Number.isFinite(saved) ? clampPrintScale(saved) : 100; };
const splitAmount = (amt) => { const validAmt = Number.isFinite(amt) ? amt : 0; const rupees = Math.floor(validAmt); const paise = Math.round((validAmt - rupees) * 100).toString().padStart(2, "0"); return { rupees, paise }; };
const registerFont = (name, dataUrl) => { const styleId = `custom-font-${name.replace(/\s+/g, '-').toLowerCase()}`; if (document.getElementById(styleId)) return; const style = document.createElement('style'); style.id = styleId; style.innerHTML = `@font-face { font-family: '${name}'; src: url('${dataUrl}'); }`; document.head.appendChild(style); };

const FontSelectOptions = ({ customFonts }) => (
  <><option value="sans-serif">Sans-serif</option><option value="Arial, Helvetica, sans-serif">Arial</option><option value="'Times New Roman', Times, serif">Times New Roman</option><option value="'Courier New', Courier, monospace">Courier New</option><option value="Georgia, serif">Georgia</option><option value="'Trebuchet MS', sans-serif">Trebuchet MS</option><option value="'Brush Script MT', cursive">Brush Script MT (Cursive)</option>{customFonts?.map(f => (<option key={f.name} value={`'${f.name}'`}>{f.name} (Custom)</option>))}</>
);

const ConnectWithUs = ({ phoneLink, instaLink = "https://www.instagram.com/jalaram_jewellers_?igsh=MWZnNmlzMTYyOWNzeA%3D%3D&utm_source=qr" }) => (
  <div style={{ marginTop: "25px", borderTop: "1px dashed #e2e8f0", paddingTop: "20px" }}>
    <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "10px", fontWeight: "bold", textAlign: "center" }}>Connect With Us:</p>
    <div style={{ display: 'flex', gap: '10px' }}>
      <a href="https://chat.whatsapp.com/FHoih8XtTXGLtPvHWx7MO6?mode=gi_t" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", backgroundColor: "#25D366", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}><span style={{ fontSize: "1.2rem" }}>💬</span> WhatsApp</a>
      <a href={instaLink} target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}><span style={{ fontSize: "1.2rem" }}>📸</span> Instagram</a>
    </div>
  </div>
);

const BillTable = ({ mode, items }) => (
  <table className="bill-table" style={{ width: "100%", tableLayout: "fixed", wordWrap: "break-word" }}>
    <thead>
      {mode === "invoice" ? (
        <tr>
          <th style={{ width: "8%" }}>Sl. No.</th>
          <th style={{ width: "38%" }}>DESCRIPTION</th>
          <th style={{ width: "10%" }}>HSN</th>
          <th style={{ width: "14%", whiteSpace: "nowrap" }}>WEIGHT (g)</th>
          <th style={{ width: "15%", whiteSpace: "nowrap" }}>RATE Rs.</th>
          <th style={{ width: "15%", whiteSpace: "nowrap" }}>AMOUNT</th>
        </tr>
      ) : (
        <tr>
          <th style={{ width: "8%" }}>Sl. No.</th>
          <th style={{ width: "40%" }}>Particulars</th>
          <th style={{ width: "14%", whiteSpace: "nowrap" }}>Weight</th>
          <th style={{ width: "18%", whiteSpace: "nowrap" }}>Qty x Rate</th>
          <th style={{ width: "12%", whiteSpace: "nowrap" }}>Rs.</th>
          <th style={{ width: "8%", whiteSpace: "nowrap" }}>Ps.</th>
        </tr>
      )}
    </thead>
    <tbody>
      {items.map((item, idx) => (
        <tr key={idx}>
          {mode === "invoice" ? (
            <><td>{item.sl_no || item.slNo}</td><td>{item.description || "-"}</td><td>{item.hsn || "-"}</td><td>{money(item.weight)}</td><td>{money(item.rate)}</td><td>{item.rupees}.{item.paise}</td></>
          ) : (
            <><td>{item.sl_no || item.slNo}</td><td>{item.description || "-"}</td><td>{money(item.weight)}</td><td>{money(item.quantity)} x {money(item.rate)}</td><td>{item.rupees}</td><td>{item.paise}</td></>
          )}
        </tr>
      ))}
    </tbody>
  </table>
);

const DesignSettingRow = ({ title, fieldPrefix, settings, setSettings }) => (
  <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc", width: "100%", boxSizing: "border-box" }}>
    <h4 style={{ margin: "0 0 10px 0" }}>{title}</h4>
    {fieldPrefix !== "address" && (
      <Input value={Array.isArray(settings[fieldPrefix]) ? settings[fieldPrefix].join(", ") : settings[fieldPrefix] || ""} onChange={(e) => setSettings((prev) => ({ ...prev, [fieldPrefix]: fieldPrefix === 'phone_numbers' ? e.target.value.split(",").map(i=>i.trim()).filter(Boolean) : e.target.value }))} placeholder={title} style={{ marginBottom: "10px", width: "100%", boxSizing: "border-box" }} />
    )}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", width: "100%" }}>
      <input type="color" value={settings[`${fieldPrefix}_color`] || "#000000"} onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_color`]: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px", flexShrink: 0 }} title="Color" />
      <Input type="number" min="8" max="60" value={settings[`${fieldPrefix}_size`] || 14} onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_size`]: Number(e.target.value) }))} style={{ width: "70px", padding: "0 5px", textAlign: "center", flexShrink: 0 }} title="Font Size (px)" />
      <select value={settings[`${fieldPrefix}_font`] || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_font`]: e.target.value }))} style={{ flex: "1 1 120px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px", minWidth: "120px" }} title="Font Style"><FontSelectOptions customFonts={settings.custom_fonts || []} /></select>
      <select value={settings[`${fieldPrefix}_align`] || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_align`]: e.target.value }))} style={{ flex: "1 1 80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px", minWidth: "80px" }} title="Alignment"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>
    </div>
  </div>
);

// --- MAIN APP ---
export default function App() {
  const [isCompactView, setIsCompactView] = useState(window.innerWidth <= 768);
  const [isDirty, setIsDirty] = useState(false);
  const markDirty = () => setIsDirty(true);
  
  const [isPublicView, setIsPublicView] = useState(false);
  const [publicBill, setPublicBill] = useState(null);
  const [publicSettings, setPublicSettings] = useState(null);
  const [publicLoading, setPublicLoading] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);

  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem("jj_auth_token") || "");
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem("jj_auth_token")));
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  
  const [hasSelectedBranch, setHasSelectedBranch] = useState(false);

  const [settings, setSettings] = useState(defaultSettings);
  const [globalBranchId, setGlobalBranchId] = useState("B1");
  const [billBranchId, setBillBranchId] = useState("B1");

  const [currentBillId, setCurrentBillId] = useState(null);
  const [mode, setMode] = useState("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
  const [editingDocNumber, setEditingDocNumber] = useState(null);
  const [isNumberLoading, setIsNumberLoading] = useState(false);
  const [billDate, setBillDate] = useState(today());

  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", email: "" });
  const [suggestions, setSuggestions] = useState([]);
  const [items, setItems] = useState([createItem()]);
  const [discount, setDiscount] = useState("0");
  const [exchange, setExchange] = useState("0");
  const [manualRoundOff, setManualRoundOff] = useState("");
  const [notes, setNotes] = useState("");

  const [txType, setTxType] = useState("sale");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [isPaymentDone, setIsPaymentDone] = useState(false); 

  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState("");
  const [advanceSplitCash, setAdvanceSplitCash] = useState("");
  const [isAdvancePaid, setIsAdvancePaid] = useState(false);

  const [balanceMethod, setBalanceMethod] = useState("");
  const [balanceSplitCash, setBalanceSplitCash] = useState("");
  const [isBalancePaid, setIsBalancePaid] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("tax"); 
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBillsList, setRecentBillsList] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [recentBranchFilter, setRecentBranchFilter] = useState("ALL");
  const [recentModeFilter, setRecentModeFilter] = useState("ALL");
  const [recentDateFilter, setRecentDateFilter] = useState("ALL");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  
  const [showLedger, setShowLedger] = useState(false);
  const [todayBills, setTodayBills] = useState([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  
  const [savingBill, setSavingBill] = useState(false);
  const [printScale, setPrintScale] = useState(getInitialPrintScale);
  const [cloudStatus, setCloudStatus] = useState({ provider: "supabase", enabled: false, mode: "loading" });
  
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const activeGlobalBranch = (settings.branches || []).find(b => b.id === globalBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];
  const activeBillBranch = (settings.branches || []).find(b => b.id === billBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];

  useEffect(() => {
    if (settings.custom_fonts && settings.custom_fonts.length > 0) {
      settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
    }
  }, [settings.custom_fonts]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewDoc = params.get("view");
    if (viewDoc) {
      setIsPublicView(true); setPublicLoading(true);
      const fetchPublicBill = async () => {
        try {
          const res = await axios.get(`${API}/bills/public/${viewDoc}`);
          setPublicBill(res.data.bill);
          const sData = { ...defaultSettings, ...res.data.settings };
          if (!sData.branches) sData.branches = defaultSettings.branches;
          if (sData.custom_fonts) sData.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
          setPublicSettings(sData);
        } catch (err) { setPublicBill("NOT_FOUND"); } finally { setPublicLoading(false); }
      };
      fetchPublicBill();
    }
  }, []);

  useEffect(() => {
    const handleResize = () => setIsCompactView(window.innerWidth <= 768);
    window.addEventListener("resize", handleResize); return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      setShowSettings(false); setShowRecentBills(false); setShowLedger(false); setShowFeedbackModal(false);
    };
    window.addEventListener("keydown", handleEsc); return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showRecentBills, showLedger, showFeedbackModal]);

  useEffect(() => { localStorage.setItem("jj_print_scale", String(clampPrintScale(printScale))); }, [printScale]);

  useEffect(() => {
    if (isPublicView) return; 
    const verify = async () => {
      if (!token) { setCheckingSession(false); return; }
      const slowServerTimeout = setTimeout(() => setIsWakingUp(true), 3000);
      try { await axios.get(`${API}/auth/verify`, { headers: authHeaders }); } 
      catch { localStorage.removeItem("jj_auth_token"); setToken(""); } 
      finally { clearTimeout(slowServerTimeout); setCheckingSession(false); setIsWakingUp(false); }
    };
    verify();
  }, [token, isPublicView, authHeaders]);

  useEffect(() => {
    if (showRecentBills && token && !isPublicView) {
      const fetchRecent = async () => {
        setLoadingRecent(true);
        try {
          const limit = recentDateFilter === "ALL" ? 50 : 500;
          const response = await axios.get(`${API}/bills/recent?limit=${limit}&branch_filter=${recentBranchFilter}&search=${encodeURIComponent(billSearchQuery)}`, { headers: authHeaders });
          setRecentBillsList(response.data);
        } catch { toast.error("Failed to load recent bills."); } 
        finally { setLoadingRecent(false); }
      };
      const timer = setTimeout(fetchRecent, 300); return () => clearTimeout(timer);
    }
  }, [showRecentBills, token, isPublicView, billSearchQuery, recentBranchFilter, recentDateFilter, authHeaders]); 

  const filteredRecentBills = useMemo(() => {
    return (recentBillsList || []).filter(bill => {
      if (recentModeFilter !== "ALL" && bill.mode !== recentModeFilter) return false;
      if (recentDateFilter === "THIS_MONTH") {
        const billMonth = new Date(bill.date).getMonth(); const billYear = new Date(bill.date).getFullYear(); const now = new Date();
        if (billMonth !== now.getMonth() || billYear !== now.getFullYear()) return false;
      } 
      else if (recentDateFilter === "LAST_MONTH") {
        const billDateObj = new Date(bill.date); const now = new Date(); const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (billDateObj.getMonth() !== lastMonth.getMonth() || billDateObj.getFullYear() !== lastMonth.getFullYear()) return false;
      } 
      else if (recentDateFilter === "CUSTOM") {
        if (customStartDate && bill.date < customStartDate) return false;
        if (customEndDate && bill.date > customEndDate) return false;
      }
      return true;
    });
  }, [recentBillsList, recentModeFilter, recentDateFilter, customStartDate, customEndDate]);

  useEffect(() => {
    if (showLedger && token && !isPublicView) {
      const fetchLedger = async () => {
        setLedgerLoading(true);
        try { await loadSettings(); const res = await axios.get(`${API}/bills/today?date=${today()}&branch_id=${globalBranchId}`, { headers: authHeaders }); setTodayBills(res.data); } 
        catch { toast.error("Failed to load today's ledger."); } finally { setLedgerLoading(false); }
      };
      fetchLedger();
    }
  }, [showLedger, token, isPublicView, globalBranchId, authHeaders]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    const savedAboutQr = localStorage.getItem("jj_about_qr_data_url");
    let dbData = response.data || {};
    if (!dbData.branches) dbData.branches = defaultSettings.branches;
    let localFonts = []; const localFontsRaw = localStorage.getItem("jj_custom_fonts"); if (localFontsRaw) { try { localFonts = JSON.parse(localFontsRaw); } catch (e) {} }
    const newSettings = { ...defaultSettings, ...dbData, logo_data_url: savedLogo || dbData.logo_data_url || "", about_qr_data_url: savedAboutQr || dbData.about_qr_data_url || STATIC_ABOUT_QR_URL, custom_fonts: dbData.custom_fonts || localFonts };
    if (!newSettings.text_macros) newSettings.text_macros = defaultSettings.text_macros;
    setSettings(newSettings);
    setItems((prev) => { if (prev.length === 1 && !prev[0].description && !prev[0].weight && !prev[0].hsn) return [{ ...prev[0], hsn: newSettings.default_hsn }]; return prev; });
  };

  const reserveNumber = async (activeMode, activeBranch) => {
    setIsNumberLoading(true);
    try { const response = await axios.get(`${API}/bills/next-number`, { headers: authHeaders, params: { mode: activeMode, branch_id: activeBranch } }); setDocumentNumber(response.data.document_number || ""); } finally { setIsNumberLoading(false); }
  };

  const fetchCloudStatus = async () => {
    try { const response = await axios.get(`${API}/cloud/status`, { headers: authHeaders }); setCloudStatus(response.data); } catch { setCloudStatus({ provider: "supabase", enabled: false, mode: "status-unavailable" }); }
  };

  useEffect(() => {
    if (isPublicView) return;
    const bootstrap = async () => { 
        if (!token) return; 
        try { await loadSettings(); await fetchCloudStatus(); } 
        catch { toast.error("Could not load billing settings."); } 
    };
    bootstrap();
  }, [token, isPublicView]);

  useEffect(() => {
    if (!token || isPublicView) return;
    const interval = setInterval(() => { fetchCloudStatus(); }, 30000); return () => clearInterval(interval);
  }, [token, isPublicView]);

  useEffect(() => {
    if (!token || isPublicView) return;
    const query = customer.phone.trim().length >= 2 ? customer.phone.trim() : customer.name.trim();
    if (query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try { const response = await axios.get(`${API}/customers/suggest`, { headers: authHeaders, params: { query } }); setSuggestions(response.data || []); } catch { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
  }, [customer.phone, customer.name, token, isPublicView, authHeaders]);

  const computed = useMemo(() => {
    const baseSilverRate = num(settings.silver_rate_per_gram);
    const baseMCPerGram = num(settings.making_charge_per_gram);
    const flatMCBelow5g = num(settings.flat_mc_below_5g);

    const mapped = (items || []).map((item, index) => {
      const weight = num(item.weight);
      const quantity = Math.max(num(item.quantity || 1), 1);
      const silverRate = item.rate_override !== "" ? num(item.rate_override) : baseSilverRate;

      let mcAmount = 0;
      if (item.mc_override !== "") { mcAmount = weight * num(item.mc_override); } 
      else if (flatMCBelow5g > 0 && weight > 0 && weight < 5) { mcAmount = flatMCBelow5g; } 
      else { mcAmount = weight * baseMCPerGram; }

      const totalItemCost = (weight * silverRate) + mcAmount;
      const formulaAmount = mode === "estimate" ? totalItemCost * quantity : totalItemCost;
      
      const amount = item.amount_override !== "" ? num(item.amount_override) : formulaAmount;
      const rateForPrint = weight > 0 ? (amount / (mode === "estimate" ? quantity : 1)) / weight : 0;
      const { rupees, paise } = splitAmount(amount);
      return { ...item, slNo: index + 1, rate: rateForPrint, quantity, amount, rupees, paise, weight };
    });

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0);
    const taxable = subtotal;
    const cgst = mode === "invoice" ? taxable * 0.015 : 0;
    const sgst = mode === "invoice" ? taxable * 0.015 : 0; 
    const igst = 0;
    const gstApplied = mode === "invoice" ? cgst + sgst + igst : 0;
    const mdr = paymentMethod === "Card" ? (taxable + gstApplied) * 0.02 : 0;
    const baseTotal = taxable + gstApplied + mdr - num(discount) - num(exchange);
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = manualRoundOff === "" ? autoRound : num(manualRoundOff);
    const grandTotal = baseTotal + roundOff;
    return { items: mapped, baseSilverRate, subtotal, taxable, cgst, sgst, igst, mdr, roundOff, grandTotal };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff]);

  const updateItem = (id, key, value) => { markDirty(); setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))); };

  const checkIsBlank = () => { return !customer.name.trim() && !customer.phone.trim() && !customer.address.trim() && !(items || []).some(i => i.description.trim() || i.weight.trim() || i.amount_override.trim()) && (!discount || discount === "0") && (!exchange || exchange === "0") && !paymentMethod && !advanceMethod && !advanceAmount && !splitCash; };

  const clearBill = async (nextMode = mode, nextBranch = billBranchId) => {
    setCurrentBillId(null); setEditingDocNumber(null); setItems([createItem(settings.default_hsn)]); setCustomer({ name: "", phone: "", address: "", email: "" });
    setSuggestions([]); setDiscount("0"); setExchange("0"); setManualRoundOff("");
    setTxType("sale"); setPaymentMethod(""); setSplitCash(""); setIsPaymentDone(false); setAdvanceAmount(""); setAdvanceMethod(""); setAdvanceSplitCash(""); setIsAdvancePaid(false); setBalanceMethod(""); setBalanceSplitCash(""); setIsBalancePaid(false); setNotes("");
    setBillDate(today()); setIsDirty(false); await reserveNumber(nextMode, nextBranch); goToBillTop();
  };

  const handleNewBillClick = async () => {
    if (currentBillId && isDirty) { if (!window.confirm("⚠️ You have unsaved edits to this saved bill! Discard edits and start a new bill?")) return; } else if (!currentBillId && !checkIsBlank()) { if (!window.confirm("⚠️ You have entered data! Are you sure you want to discard it and start a blank new bill?")) return; }
    await clearBill(mode, billBranchId);
  };

  const loadBillForEditing = (bill) => {
    setCurrentBillId(bill.id); setEditingDocNumber(bill.document_number); setMode(bill.mode); setBillBranchId(bill.branch_id || (settings.branches || [])[0].id); setDocumentNumber(bill.document_number); setBillDate(bill.date || today());
    setCustomer({ name: bill.customer_name || bill.customer?.name || "", phone: bill.customer_phone || bill.customer?.phone || "", address: bill.customer_address || bill.customer?.address || "", email: bill.customer_email || bill.customer?.email || "" });
    setTxType(bill.tx_type || "sale"); setPaymentMethod(bill.payment_method || ""); setSplitCash(bill.split_cash !== null && bill.split_cash !== undefined ? String(bill.split_cash) : ""); setIsPaymentDone(bill.is_payment_done || false); 
    setAdvanceAmount(bill.advance_amount ? String(bill.advance_amount) : ""); setAdvanceMethod(bill.advance_method || ""); setAdvanceSplitCash(bill.advance_split_cash ? String(bill.advance_split_cash) : ""); setIsAdvancePaid(bill.is_advance_paid || false);
    setBalanceMethod(bill.balance_method || ""); setBalanceSplitCash(bill.balance_split_cash ? String(bill.balance_split_cash) : ""); setIsBalancePaid(bill.is_balance_paid || false);
    setNotes(bill.notes || ""); 
    
    setDiscount(bill.discount ? String(bill.discount) : "0"); 
    setExchange(bill.exchange ? String(bill.exchange) : "0"); 
    setManualRoundOff(bill.round_off !== undefined && bill.round_off !== null ? String(bill.round_off) : (bill.totals?.round_off !== undefined && bill.totals?.round_off !== null ? String(bill.totals.round_off) : ""));
    
    const loadedItems = (bill.items || []).map((item) => ({ id: `${Date.now()}-${Math.random()}`, description: item.description || "", hsn: item.hsn || "", weight: item.weight ? String(item.weight) : "", quantity: item.quantity ? String(item.quantity) : "1", mc_override: item.mc_override !== null && item.mc_override !== undefined ? String(item.mc_override) : "", rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "", amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "", }));
    setItems(loadedItems.length > 0 ? loadedItems : [createItem(settings.default_hsn)]); setIsDirty(false); setShowRecentBills(false); setShowLedger(false); toast.success(`Loaded ${bill.document_number} for editing`); goToBillTop();
  };

  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    if (currentBillId) { try { const res = await axios.get(`${API}/bills/next-number?mode=${nextMode}&branch_id=${billBranchId}`, { headers: authHeaders }); setDocumentNumber(res.data.document_number); setMode(nextMode); markDirty(); toast.info(`Migrating to ${nextMode.toUpperCase()}`); } catch (err) { toast.error("Failed to fetch new number for migration."); } } 
    else { if (!checkIsBlank()) { if (!window.confirm("⚠️ You have unsaved changes! Switching modes will clear the screen. Continue?")) return; } setMode(nextMode); await clearBill(nextMode, billBranchId); }
  };

  const handleGlobalBranchChange = async (nextBranchId) => { setGlobalBranchId(nextBranchId); if (!currentBillId && checkIsBlank()) { setBillBranchId(nextBranchId); await reserveNumber(mode, nextBranchId); } };

  const handleLogin = async (event) => {
    event.preventDefault(); setLoggingIn(true);
    try { const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 }); localStorage.setItem("jj_auth_token", response.data.access_token); setToken(response.data.access_token); setPasscode(""); toast.success("Logged in successfully"); } 
    catch (error) { if (error?.response?.status === 401) { toast.error("Wrong passcode."); } else { toast.error("Server is waking up. Please wait 15-20 seconds and try again."); } } finally { setLoggingIn(false); }
  };

  const handleLogout = () => { localStorage.removeItem("jj_auth_token"); setToken(""); setHasSelectedBranch(false); };

  const saveSettings = async () => { try { await axios.put(`${API}/settings`, settings, { headers: authHeaders }); toast.success("Settings saved."); setShowSettings(false); } catch { toast.error("Could not save settings."); } };

  const saveBill = async () => {
    if (txType === "sale" && !paymentMethod) { toast.error("Please select a payment method."); return; }
    if ((txType === "booking" || txType === "service")) { if (isAdvancePaid && !advanceMethod) { toast.error("Please select a method for the Advance payment."); return; } if (isBalancePaid && !balanceMethod) { toast.error("Please select a method for the Balance payment."); return; } }

    setSavingBill(true);
    try {
      const payload = {
        mode, branch_id: billBranchId, document_number: documentNumber, date: billDate, customer_name: customer.name, customer_phone: customer.phone, customer_address: customer.address, customer_email: customer.email,
        tx_type: txType, payment_method: paymentMethod, is_payment_done: isPaymentDone, split_cash: num(splitCash), split_upi: Math.max(0, computed.grandTotal - num(splitCash)),
        advance_amount: num(advanceAmount), advance_method: advanceMethod, advance_split_cash: num(advanceSplitCash), is_advance_paid: isAdvancePaid,
        balance_method: balanceMethod, balance_split_cash: num(balanceSplitCash), is_balance_paid: isBalancePaid,
        discount: num(discount), exchange: num(exchange), round_off: manualRoundOff === "" ? null : num(manualRoundOff), notes,
        items: computed.items.map((item) => ({ description: item.description, hsn: item.hsn, weight: num(item.weight), quantity: num(item.quantity), mc_override: item.mc_override === "" ? null : num(item.mc_override), rate_override: item.rate_override === "" ? null : num(item.rate_override), amount_override: item.amount_override === "" ? null : num(item.amount_override), rate: item.rate, amount: item.amount, sl_no: item.slNo })),
        totals: { grand_total: computed.grandTotal, subtotal: computed.subtotal }
      };

      if (currentBillId) { 
        await axios.put(`${API}/bills/update-by-id/${currentBillId}`, payload, { headers: authHeaders }); 
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} updated & migrated successfully.`); 
        setIsDirty(false); setEditingDocNumber(documentNumber); 
      } else { 
        const res = await axios.post(`${API}/bills/save`, payload, { headers: authHeaders }); 
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} saved successfully.`); 
        setIsDirty(false); setCurrentBillId(res.data.id); setEditingDocNumber(res.data.document_number); setDocumentNumber(res.data.document_number); 
      }
      await loadSettings(); 
    } catch (error) { toast.error("Failed to save bill."); } finally { setSavingBill(false); }
  };

  const downloadPdf = async (elementId, filename) => {
    toast.info("Preparing PDF..."); const node = document.getElementById(elementId); if (!node) return;
    try {
      const canvas = await html2canvas(node, { 
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", 
        scrollY: -window.scrollY, windowWidth: 1024,
        onclone: (clonedDoc) => {
          const clonedNode = clonedDoc.getElementById(elementId);
          if (clonedNode) { 
             clonedNode.style.width = "800px"; clonedNode.style.maxWidth = "800px"; clonedNode.style.minWidth = "800px"; clonedNode.style.position = "absolute"; clonedNode.style.top = "0"; clonedNode.style.left = "0"; clonedNode.style.margin = "0"; clonedNode.style.padding = "20px"; clonedNode.style.boxSizing = "border-box"; clonedNode.style.transform = "none";
             const images = clonedNode.getElementsByTagName('img'); for (let img of images) img.crossOrigin = "anonymous"; 
          }
        }
      });
      const imageData = canvas.toDataURL("image/png", 1.0); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight); pdf.save(`${filename}.pdf`); toast.success("PDF Downloaded Successfully");
    } catch (error) { toast.error("Failed to download PDF."); }
  };

  const shareWhatsApp = () => { const link = `${window.location.origin}/?view=${documentNumber}`; const text = `Hello ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`; let cleanedPhone = customer.phone.replace(/\D/g, ""); if (cleanedPhone.length === 10) cleanedPhone = `91${cleanedPhone}`; window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, "_blank"); };
  const goToBillTop = () => { document.getElementById("bill-print-root")?.scrollIntoView({ behavior: "smooth", block: "start" }); };
  const handleWifiClick = () => { navigator.clipboard.writeText("12345678").then(() => { toast.success("✅ Password '12345678' Copied! Go to settings and connect to 'JalaramJewellers Unlimited'.", { duration: 6000 }); }).catch(() => { toast.info("Wi-Fi: JalaramJewellers Unlimited | Pass: 12345678", { duration: 6000 }); }); };

  const handleGlobalKeyDown = (e) => {
    // 1. Enter Key Focus Advance Logic
    if (e.key === 'Enter' && ['INPUT', 'SELECT'].includes(e.target.tagName)) {
      e.preventDefault();
      const focusableElements = Array.from(document.querySelectorAll('input, select, button')).filter(el => !el.disabled);
      const index = focusableElements.indexOf(e.target);
      if (index > -1 && index < focusableElements.length - 1) {
        focusableElements[index + 1].focus();
      }
    }

    // 2. Custom Text Macro Shortcuts Logic
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
      const macros = settings.text_macros || [];
      
      let pressedKey = e.key;
      if (e.altKey && e.key !== 'Alt') pressedKey = `Alt+${e.key}`;
      if (e.ctrlKey && e.key !== 'Control') pressedKey = `Ctrl+${e.key}`;

      const macro = macros.find(m => m.key.toLowerCase() === pressedKey.toLowerCase());
      
      if (macro) {
        e.preventDefault(); 
        const el = e.target;
        const start = el.selectionStart || 0;
        const end = el.selectionEnd || 0;
        const text = el.value;
        const newText = text.substring(0, start) + macro.text + text.substring(end);
        
        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype, 'value'
        )?.set || Object.getOwnPropertyDescriptor(
          window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        
        if (nativeSetter) {
          nativeSetter.call(el, newText);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          
          setTimeout(() => {
            el.setSelectionRange(start + macro.text.length, start + macro.text.length);
          }, 0);
        }
      }
    }
  };

  const getUpiAmount = () => {
      if (txType === "sale") return paymentMethod === "Split" ? Math.max(0, computed.grandTotal - num(splitCash)) : computed.grandTotal;
      if (!isAdvancePaid && (advanceMethod === "UPI" || advanceMethod === "Split")) return advanceMethod === "Split" ? Math.max(0, num(advanceAmount) - num(advanceSplitCash)) : num(advanceAmount);
      if (isAdvancePaid && !isBalancePaid && (balanceMethod === "UPI" || balanceMethod === "Split")) { const bal = Math.max(0, computed.grandTotal - num(advanceAmount)); return balanceMethod === "Split" ? Math.max(0, bal - num(balanceSplitCash)) : bal; }
      return 0;
  };
  const upiAmountToPay = getUpiAmount(); const showDashboardUpi = upiAmountToPay > 0;
  const upiId = mode === "invoice" ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmountToPay)}&cu=INR&tn=Bill_${documentNumber || "Draft"}`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  // --- LOGIN & LOADING SCREENS ---
  if (checkingSession) {
    return (
      <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>Loading billing dashboard...</div>
        {isWakingUp && (
          <div style={{ marginTop: '20px', textAlign: 'center', padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '320px' }}>
            <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#64748b' }}>The database server is waking up. This takes about 30 seconds.</p>
          </div>
        )}
      </div>
    );
  }

  if (!token) {
    return (
      <div className="login-shell">
        <Toaster position="bottom-right" />
        <form className="login-card" onSubmit={handleLogin}>
          <h1 className="login-title">Jalaram Jewellers</h1>
          <p className="login-subtitle">Enter passcode to access billing panel</p>
          <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Enter passcode" />
          <Button type="submit" disabled={loggingIn}>{loggingIn ? "Checking..." : "Login"}</Button>
        </form>
      </div>
    );
  }

  if (token && !hasSelectedBranch) {
    return (
      <div className="login-shell">
        <Toaster position="bottom-right" />
        <div className="login-card" style={{ maxWidth: "450px" }}>
          <h2 style={{ textAlign: "center", color: "var(--brand)", marginBottom: "10px" }}><Home size={28} style={{verticalAlign: "middle", marginRight: "10px"}} /> Select Your Branch</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {(settings.branches || []).map(b => (
              <Button key={b.id} onClick={async () => {
                setGlobalBranchId(b.id);
                setBillBranchId(b.id);
                setHasSelectedBranch(true);
                await reserveNumber(mode, b.id);
              }} style={{ width: "100%", padding: "20px", fontSize: "1.1rem", height: "auto", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{b.name}</span>
                <ArrowLeft size={18} style={{ transform: "rotate(180deg)" }} />
              </Button>
            ))}
          </div>
          <Button variant="outline" onClick={handleLogout} style={{ marginTop: "20px", width: "100%", color: "#dc2626", borderColor: "#fca5a5" }}>Logout</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="billing-app" onKeyDown={handleGlobalKeyDown}>
      <Toaster position="bottom-right" />

      <header className="top-bar no-print">
        <div className="brand-block" style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div><h1 className="brand-title">{settings.shop_name}</h1><p className="brand-tagline">{settings.tagline}</p></div>
          <div style={{ paddingLeft: "15px", borderLeft: "2px solid rgba(255,255,255,0.2)" }}>
             <select value={globalBranchId} onChange={(e) => handleGlobalBranchChange(e.target.value)} style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", outline: "none", cursor: "pointer" }}>
                {(settings.branches || []).map(b => <option key={b.id} value={b.id} style={{ color: "black" }}>📍 {b.name}</option>)}
             </select>
          </div>
        </div>
        <div className="mode-toggle">
          <Button onClick={() => handleModeChange("invoice")} className={mode === "invoice" ? "mode-active" : "mode-inactive"}>Invoice Mode</Button>
          <Button onClick={() => handleModeChange("estimate")} className={mode === "estimate" ? "mode-active" : "mode-inactive"}>Estimate Mode</Button>
        </div>
        <div className={`cloud-badge ${cloudStatus.enabled ? "cloud-badge-live" : "cloud-badge-fallback"}`}>
          <span className="cloud-dot" /><span>Cloud Sync: {cloudStatus.enabled ? "Live" : "Fallback"}</span>
        </div>
        <div className="top-actions">
          <Button variant="outline" onClick={goToBillTop}>Back</Button>
          <Button variant="outline" onClick={handleLogout}>Logout</Button>
        </div>
      </header>

      {/* FIXED SCROLLING SPLIT SCREEN - CRITICAL FLEX PROPERTIES APPLIED */}
      <main className="main-layout" style={{ 
        display: 'flex', 
        flexDirection: isCompactView ? 'column' : 'row', 
        height: 'calc(100vh - 70px)', 
        width: '100vw',
        overflow: 'hidden' 
      }}>
        
        {/* LEFT PANE: BILL RENDERER */}
        <div className="bill-preview-pane" style={{ 
          flex: isCompactView ? '1 1 auto' : '1', 
          height: '100%', 
          overflowY: 'auto', 
          backgroundColor: '#f1f5f9',
          minHeight: 0, 
          minWidth: 0
        }}>
          <div style={{ padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
            <section id="bill-print-root" className="bill-sheet" style={{ "--print-scale-factor": (printScale / 100).toFixed(3), position: 'relative', zIndex: 1, margin: 0 }}>
              {(txType === "sale" ? isPaymentDone : isBalancePaid) && <div className="watermark-done">FULLY PAID</div>}
              <div className="bill-header">
                <div className="logo-area">
                  {settings.logo_data_url ? <img src={settings.logo_data_url} alt="Shop Logo" className="shop-logo" crossOrigin="anonymous" /> : <div className="shop-logo-fallback">JJ</div>}
                  <div style={{ width: "100%", textAlign: settings.shop_name_align || "center" }}>
                    <h2 className="sheet-shop-title" style={{ fontFamily: settings.shop_name_font || "sans-serif", color: settings.shop_name_color || "#000", fontSize: `${settings.shop_name_size}px`, margin: 0 }}>{settings.shop_name}</h2>
                  </div>
                  <div style={{ width: "100%", textAlign: settings.tagline_align || "center" }}>
                    <p className="sheet-tagline" style={{ fontFamily: settings.tagline_font || "sans-serif", color: settings.tagline_color || "#475569", fontSize: `${settings.tagline_size}px`, margin: "5px 0" }}>{settings.tagline}</p>
                  </div>
                </div>

                <div className="contact-area">
                  <div className="contact-address" style={{ fontFamily: settings.address_font || "sans-serif", display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', alignItems: settings.address_align === 'left' ? 'flex-start' : settings.address_align === 'right' ? 'flex-end' : 'center', textAlign: settings.address_align || "center" }}>
                      <a href={activeBillBranch.map_url !== "#" ? activeBillBranch.map_url : "#"} target="_blank" rel="noopener noreferrer" style={{ color: settings.address_color || "#475569", fontSize: `${settings.address_size || 14}px`, textDecoration: 'none' }}>{activeBillBranch.address}</a>
                  </div>
                  <div style={{ width: "100%", textAlign: settings.phone_align || "center", fontFamily: settings.phone_font || "sans-serif", fontSize: `${settings.phone_size || 13}px`, marginBottom: "4px" }}>
                    {(settings.phone_numbers || []).join(" | ")}
                  </div>
                  <div style={{ width: "100%", textAlign: settings.email_align || "center", fontFamily: settings.email_font || "sans-serif", fontSize: `${settings.email_size || 13}px`, marginBottom: "4px" }}>
                    <a href={`mailto:${settings.email}`} style={{ color: settings.email_color || "#475569", textDecoration: 'none' }}>{settings.email}</a>
                  </div>
                  {mode === "invoice" && activeBillBranch.gstin && <p style={{ margin: "4px 0", textAlign: "center", fontWeight: "bold" }}>GSTIN: {activeBillBranch.gstin}</p>}
                </div>
              </div>

              <div className="sheet-banner">{txType === "booking" ? "BOOKING RECEIPT" : txType === "service" ? "SERVICE ORDER" : mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}</div>

              <div className="meta-grid">
                <p><strong>{mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {isNumberLoading ? "Generating..." : documentNumber || "-"}</p>
                <p><strong>Date:</strong> {billDate}</p>
              </div>

              <div className="customer-box">
                <p><strong>Name:</strong> {customer.name || "-"}</p>
                <p><strong>Address:</strong> {customer.address || "-"}</p>
                <p><strong>Phone:</strong> {customer.phone || "-"}</p>
              </div>

              <BillTable mode={mode} items={computed.items} />

              <div className="sheet-bottom-stack">
                <div className="totals">
                  <div className="totals-row"><span>{mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span><strong>₹{money(computed.taxable)}</strong></div>
                  {mode === "invoice" ? (
                    <>
                      <div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(computed.cgst)}</strong></div>
                      <div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(computed.sgst)}</strong></div>
                      <div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(computed.igst)}</strong></div>
                    </>
                  ) : (
                    <><div className="totals-row"><span>DISCOUNT</span><strong>₹{money(discount)}</strong></div><div className="totals-row"><span>EXCHANGE</span><strong>₹{money(exchange)}</strong></div></>
                  )}
                  <div className="totals-row"><span>MDR (Card 2%)</span><strong>₹{money(computed.mdr)}</strong></div>
                  <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(computed.roundOff)}</strong></div>
                  <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(computed.grandTotal)}</strong></div>

                  {txType !== "sale" && (
                    <>
                      <div className="totals-row" style={{ marginTop: "10px", color: "#16a34a" }}><span>ADVANCE RECEIVED</span><strong>₹{money(advanceAmount)}</strong></div>
                      <div className="totals-row" style={{ color: "#dc2626" }}><span>BALANCE DUE</span><strong>₹{money(Math.max(0, computed.grandTotal - num(advanceAmount)))}</strong></div>
                    </>
                  )}

                  {showDashboardUpi && (
                    <div className="payment-qr-box">
                      <p className="scan-title">Scan Here For Payment (₹{money(upiAmountToPay)})</p>
                      <img src={dynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" crossOrigin="anonymous" />
                      <p className="upi-id">UPI: {upiId}</p>
                    </div>
                  )}
                </div>

                {mode === "invoice" ? (
                  <div className="declaration">
                    <p className="section-title">DECLARATION</p><p>We declare that this bill shows the actual price of items and all details are correct.</p>
                    <div className="about-qr"><p className="section-title">About Us QR</p>{(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" crossOrigin="anonymous" />}</div>
                  </div>
                ) : (
                  <div className="policies">
                    <p className="section-title">POLICIES, T&C</p><ul className="policies-list"><li>6 Months of repair and polishing warranty only on silver ornaments.</li><li>You can replace purchased items within 7 days for manufacturing defects.</li></ul>
                    <div className="about-qr"><p className="section-title">About Us QR</p>{(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" crossOrigin="anonymous" />}</div>
                  </div>
                )}
              </div>
              <footer className="sheet-footer"><p>Authorised Signature</p><p>Thanking you.</p></footer>
            </section>
          </div>
        </div>

        {/* RIGHT PANE: CONTROL PANEL */}
        <aside className="controls no-print" style={{ 
          flex: isCompactView ? '1 1 auto' : '0 0 450px', 
          width: isCompactView ? '100%' : '450px',
          height: '100%',
          overflowY: 'auto', 
          backgroundColor: 'white', 
          borderLeft: '1px solid #e2e8f0', 
          minHeight: 0, 
          minWidth: 0
        }}>
          
          <div style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', flexWrap: 'wrap', gap: '8px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
            <Button size="sm" onClick={handleNewBillClick} variant="outline" style={{ flex: '1 1 auto' }}>New Bill</Button>
            <Button size="sm" onClick={saveBill} disabled={savingBill} style={{ backgroundColor: "#0f172a", flex: '1 1 auto' }}>{savingBill ? "..." : "Save Bill"}</Button>
            <Button size="sm" onClick={() => setShowLedger(true)} style={{ backgroundColor: "#16a34a", color: "white", flex: '1 1 auto' }}>Cashbook</Button>
            <Button size="sm" onClick={() => downloadPdf("bill-print-root", documentNumber || mode)} style={{ flex: '1 1 auto' }}>Download</Button>
            <Button size="sm" onClick={shareWhatsApp} style={{ backgroundColor: '#25D366', color: 'white', flex: '1 1 auto' }}>WhatsApp</Button>
          </div>

          <div style={{ padding: '20px' }}>
            <div className="control-card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                  <h3 style={{ margin: 0 }}>Bill Details</h3>
                  <select value={billBranchId} onChange={async (e) => { 
                      const nextBranch = e.target.value; setBillBranchId(nextBranch); markDirty(); 
                      if (currentBillId) { try { const res = await axios.get(`${API}/bills/next-number?mode=${mode}&branch_id=${nextBranch}`, { headers: authHeaders }); setDocumentNumber(res.data.document_number); toast.info(`Migrating to Branch: ${nextBranch}`); } catch (err) { toast.error("Failed to fetch new number for migration."); } } else { await reserveNumber(mode, nextBranch); }
                  }} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", cursor: "pointer" }}>
                      {(settings.branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
              </div>

              <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px dashed var(--border)" }}>
                <label className="select-label" style={{ fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>Bill Number (Editable)</label>
                <Input value={documentNumber} onChange={(e) => { setDocumentNumber(e.target.value); markDirty(); }} placeholder="e.g. INV-0212" disabled={!!currentBillId} style={{ fontWeight: "bold", color: "var(--brand)", backgroundColor: currentBillId ? "#f1f5f9" : "white" }} />
              </div>

              <Input value={customer.name} onChange={(e) => { setCustomer((prev) => ({ ...prev, name: e.target.value })); markDirty(); }} placeholder="Customer name" />
              <Input value={customer.phone} onChange={(e) => { setCustomer((prev) => ({ ...prev, phone: e.target.value })); markDirty(); }} placeholder="Phone" />
              <Input value={customer.address} onChange={(e) => { setCustomer((prev) => ({ ...prev, address: e.target.value })); markDirty(); }} placeholder="Address" />
              <Input value={customer.email} onChange={(e) => { setCustomer((prev) => ({ ...prev, email: e.target.value })); markDirty(); }} placeholder="Email" />
              <Input type="text" value={billDate} onChange={(e) => { setBillDate(e.target.value); markDirty(); }} placeholder="YYYY-MM-DD" />

              {(suggestions || []).length > 0 && (
                <div className="suggestions">
                  {(suggestions || []).map((entry) => (
                    <button key={entry.id} type="button" className="suggestion-item" onClick={() => { setCustomer({ name: entry.name, phone: entry.phone, address: entry.address, email: entry.email }); setSuggestions([]); markDirty(); }}>
                      {entry.name} · {entry.phone}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="control-card">
              <h3>Item Lines</h3>
              {(items || []).map((item) => (
                <div key={item.id} className="item-row-editor">
                  <Input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Description" />
                  <Input value={item.hsn} onChange={(e) => updateItem(item.id, "hsn", e.target.value)} placeholder="HSN" />
                  <Input value={item.weight} onChange={(e) => updateItem(item.id, "weight", e.target.value)} placeholder="Weight" />
                  <Input value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} placeholder="Qty" />
                  <Input value={item.mc_override} onChange={(e) => updateItem(item.id, "mc_override", e.target.value)} placeholder="Custom MC ₹/g" />
                  <Input value={item.rate_override} onChange={(e) => updateItem(item.id, "rate_override", e.target.value)} placeholder="Custom Silver Rate" />
                  <Input value={item.amount_override} onChange={(e) => updateItem(item.id, "amount_override", e.target.value)} placeholder="Fixed Amount ₹" />
                  <Button type="button" variant="outline" onClick={() => { setItems((prev) => prev.filter((row) => row.id !== item.id)); markDirty(); }} disabled={(items || []).length === 1}>Remove</Button>
                </div>
              ))}
              <Button type="button" onClick={() => { setItems((prev) => [...prev, createItem(settings.default_hsn)]); markDirty(); }}>Add Item</Button>
            </div>

            <div className="control-card">
              <h3>Adjustments</h3>
              <Input value={discount} onChange={(e) => { setDiscount(e.target.value); markDirty(); }} placeholder="Discount" />
              <Input value={exchange} onChange={(e) => { setExchange(e.target.value); markDirty(); }} placeholder="Exchange" />
              <Input value={manualRoundOff} onChange={(e) => { setManualRoundOff(e.target.value); markDirty(); }} placeholder="Manual round off (optional)" />
            </div>

            <div className="control-card">
              <h3>Payment Options</h3>
              <label className="select-label">Transaction Type</label>
              <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
                <Button variant={txType === "sale" ? "default" : "outline"} onClick={() => {setTxType("sale"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Sale</Button>
                <Button variant={txType === "booking" ? "default" : "outline"} onClick={() => {setTxType("booking"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Booking</Button>
                <Button variant={txType === "service" ? "default" : "outline"} onClick={() => {setTxType("service"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Service</Button>
              </div>

              {txType === "sale" && (
                <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                  <label className="select-label">Payment Method</label>
                  <select value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); markDirty(); }} className="native-select">
                    <option value="" disabled>Select Method</option><option value="Cash">Cash</option><option value="UPI">UPI</option>
                    {mode === "invoice" && <option value="Card">Card</option>}
                    <option value="Split">Split (Cash + UPI)</option>
                  </select>
                  {paymentMethod === "Split" && (
                    <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                      <Input value={splitCash} onChange={(e) => { setSplitCash(e.target.value); markDirty(); }} placeholder="Cash Received ₹" />
                      <Input value={`UPI: ₹${money(Math.max(0, computed.grandTotal - num(splitCash)))}`} disabled style={{ fontWeight: "bold", backgroundColor: "#f1f5f9" }} />
                    </div>
                  )}
                  <div style={{ marginTop: "15px", display: "flex", alignItems: "center", gap: "10px" }}>
                     <input type="checkbox" id="paymentDone" checked={isPaymentDone} onChange={(e) => { setIsPaymentDone(e.target.checked); markDirty(); }} style={{ width: "18px", height: "18px", cursor: "pointer" }} />
                     <label htmlFor="paymentDone" style={{ fontWeight: "bold", cursor: "pointer", color: isPaymentDone ? "#16a34a" : "#475569" }}>{isPaymentDone ? "Payment Received ✅" : "Mark as Paid"}</label>
                  </div>
                </div>
              )}

              {txType !== "sale" && (
                 <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                    <label className="select-label">Advance Payment</label>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                       <Input value={advanceAmount} onChange={(e) => { setAdvanceAmount(e.target.value); markDirty(); }} placeholder="Advance ₹" />
                       <select value={advanceMethod} onChange={(e) => { setAdvanceMethod(e.target.value); markDirty(); }} className="native-select">
                          <option value="">Method</option><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option><option value="Split">Split</option>
                       </select>
                    </div>
                    {advanceMethod === "Split" && (
                       <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                          <Input value={advanceSplitCash} onChange={(e) => { setAdvanceSplitCash(e.target.value); markDirty(); }} placeholder="Cash ₹" />
                          <Input value={`UPI: ₹${money(Math.max(0, num(advanceAmount) - num(advanceSplitCash)))}`} disabled />
                       </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px" }}>
                       <input type="checkbox" id="advancePaid" checked={isAdvancePaid} onChange={(e) => { setIsAdvancePaid(e.target.checked); markDirty(); }} style={{ width: "18px", height: "18px" }} />
                       <label htmlFor="advancePaid">Advance Received</label>
                    </div>

                    <label className="select-label">Balance Payment</label>
                    <select value={balanceMethod} onChange={(e) => { setBalanceMethod(e.target.value); markDirty(); }} className="native-select" style={{ marginBottom: "10px" }}>
                       <option value="">Method</option><option value="Cash">Cash</option><option value="UPI">UPI</option><option value="Card">Card</option><option value="Split">Split</option>
                    </select>
                    {balanceMethod === "Split" && (
                       <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                          <Input value={balanceSplitCash} onChange={(e) => { setBalanceSplitCash(e.target.value); markDirty(); }} placeholder="Cash ₹" />
                          <Input value={`UPI: ₹${money(Math.max(0, (computed.grandTotal - num(advanceAmount)) - num(balanceSplitCash)))}`} disabled />
                       </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                       <input type="checkbox" id="balancePaid" checked={isBalancePaid} onChange={(e) => { setIsBalancePaid(e.target.checked); markDirty(); }} style={{ width: "18px", height: "18px" }} />
                       <label htmlFor="balancePaid">Balance Received</label>
                    </div>
                 </div>
              )}
              
              <div style={{ marginTop: "15px" }}>
                <label className="select-label">Notes / Remarks</label>
                <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} placeholder="Additional notes..." style={{ width: "100%", padding: "10px", borderRadius: "6px", border: "1px solid #cbd5e1", minHeight: "80px", fontFamily: "inherit" }} />
              </div>
            </div>
            
            <div className="control-card">
               <h3>System Actions</h3>
               <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <Button variant="outline" onClick={() => setShowSettings(true)}><Building2 size={16} style={{marginRight: "8px"}}/> Open Settings</Button>
                  <Button variant="outline" onClick={() => setShowRecentBills(true)}><History size={16} style={{marginRight: "8px"}}/> Recent Bills</Button>
               </div>
            </div>

          </div>
        </aside>
      </main>

      {/* FULLY FUNCTIONAL SETTINGS MODAL */}
      {showSettings && (
         <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{ background: "white", padding: "0", borderRadius: "12px", width: "95%", maxWidth: "700px", maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
               <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0f172a", color: "white" }}>
                  <h2 style={{ margin: 0 }}>System Settings</h2>
                  <Button variant="ghost" onClick={() => setShowSettings(false)} style={{ color: "white" }}><X size={24} /></Button>
               </div>
               
               <div style={{ display: "flex", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
                  <Button variant={settingsTab === "shop" ? "default" : "ghost"} onClick={() => setSettingsTab("shop")} style={{ borderRadius: 0, borderBottom: settingsTab === "shop" ? "2px solid #0f172a" : "none" }}>Shop Info</Button>
                  <Button variant={settingsTab === "tax" ? "default" : "ghost"} onClick={() => setSettingsTab("tax")} style={{ borderRadius: 0, borderBottom: settingsTab === "tax" ? "2px solid #0f172a" : "none" }}>Tax, Rates & Shortcuts</Button>
               </div>

               <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
                  {settingsTab === "shop" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                       <div>
                          <label className="select-label">Shop Name</label>
                          <Input value={settings.shop_name} onChange={(e) => setSettings({...settings, shop_name: e.target.value})} />
                       </div>
                       <div>
                          <label className="select-label">Tagline</label>
                          <Input value={settings.tagline} onChange={(e) => setSettings({...settings, tagline: e.target.value})} />
                       </div>
                    </div>
                  )}

                  {settingsTab === "tax" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "25px" }}>
                       <div>
                          <h3 style={{ margin: "0 0 15px 0", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Default Rates & Tax</h3>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px" }}>
                            <div>
                               <label className="select-label">Silver Rate (per gram)</label>
                               <Input type="number" value={settings.silver_rate_per_gram} onChange={(e) => setSettings({...settings, silver_rate_per_gram: e.target.value})} />
                            </div>
                            <div>
                               <label className="select-label">Default Making Charge (per gram)</label>
                               <Input type="number" value={settings.making_charge_per_gram} onChange={(e) => setSettings({...settings, making_charge_per_gram: e.target.value})} />
                            </div>
                            <div>
                               <label className="select-label">Flat MC (Below 5g)</label>
                               <Input type="number" value={settings.flat_mc_below_5g} onChange={(e) => setSettings({...settings, flat_mc_below_5g: e.target.value})} />
                            </div>
                            <div>
                               <label className="select-label">Default HSN Code</label>
                               <Input value={settings.default_hsn} onChange={(e) => setSettings({...settings, default_hsn: e.target.value})} />
                            </div>
                          </div>
                       </div>

                       <div>
                          <h3 style={{ margin: "0 0 5px 0", borderBottom: "1px solid #e2e8f0", paddingBottom: "5px" }}>Custom Text Macros & Shortcuts</h3>
                          <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "15px" }}>Press these key combinations while typing in any field to instantly paste the text. (e.g. <b>Alt+1</b>, <b>F4</b>)</p>
                          
                          {(settings.text_macros || []).map((macro, idx) => (
                            <div key={macro.id} style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
                               <Input placeholder="Key (e.g. Alt+1)" value={macro.key} onChange={(e) => {
                                  const newMacros = [...settings.text_macros];
                                  newMacros[idx].key = e.target.value;
                                  setSettings({...settings, text_macros: newMacros});
                               }} style={{ width: "130px", fontWeight: "bold" }} />
                               <span style={{color: "#94a3b8"}}>→</span>
                               <Input placeholder="Text to paste (e.g. Silver Chain 92.5)" value={macro.text} onChange={(e) => {
                                  const newMacros = [...settings.text_macros];
                                  newMacros[idx].text = e.target.value;
                                  setSettings({...settings, text_macros: newMacros});
                               }} style={{ flex: 1 }} />
                               <Button variant="outline" style={{ color: "#ef4444", borderColor: "#fca5a5" }} onClick={() => {
                                  setSettings({...settings, text_macros: settings.text_macros.filter(m => m.id !== macro.id)});
                               }}>Remove</Button>
                            </div>
                          ))}
                          <Button variant="outline" onClick={() => {
                             setSettings({...settings, text_macros: [...(settings.text_macros || []), { id: Date.now().toString(), key: "", text: "" }]});
                          }} style={{ marginTop: "10px" }}><Plus size={16} style={{marginRight: "5px"}}/> Add Shortcut</Button>
                       </div>
                    </div>
                  )}
               </div>

               <div style={{ padding: "20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", backgroundColor: "#f8fafc" }}>
                 <Button variant="outline" onClick={() => setShowSettings(false)}>Cancel</Button>
                 <Button onClick={saveSettings} style={{ backgroundColor: "#16a34a" }}>Save All Settings</Button>
               </div>
            </div>
         </div>
      )}

      {/* RECENT BILLS MODAL */}
      {showRecentBills && (
         <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", padding: "20px" }}>
            <div style={{ background: "white", width: "100%", maxWidth: "800px", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
               <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0f172a", color: "white" }}>
                  <h2 style={{ margin: 0 }}>Recent Bills</h2>
                  <Button variant="ghost" onClick={() => setShowRecentBills(false)} style={{ color: "white" }}><X size={24} /></Button>
               </div>
               <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>
                  {filteredRecentBills.length === 0 ? (
                     <p style={{ textAlign: "center", color: "#64748b", marginTop: "40px" }}>No recent bills found.</p>
                  ) : (
                     filteredRecentBills.map(b => (
                        <div key={b.id} style={{ padding: "15px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "10px", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#f8fafc" }}>
                           <div>
                              <strong style={{ fontSize: "1.1rem" }}>{b.document_number}</strong>
                              <span style={{ marginLeft: "10px", color: "#64748b" }}>{b.customer_name || "Guest"}</span>
                           </div>
                           <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                              <strong style={{ fontSize: "1.1rem" }}>₹{money(b.totals?.grand_total)}</strong>
                              <Button size="sm" onClick={() => loadBillForEditing(b)} variant="outline">Load & Edit</Button>
                           </div>
                        </div>
                     ))
                  )}
               </div>
            </div>
         </div>
      )}

      {/* LEDGER MODAL */}
      {showLedger && (
         <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", justifyContent: "center", padding: "20px" }}>
            <div style={{ background: "white", width: "100%", maxWidth: "600px", borderRadius: "12px", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)" }}>
               <div style={{ padding: "20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", backgroundColor: "#0f172a", color: "white" }}>
                  <h2 style={{ margin: 0 }}>Cashbook & Ledger</h2>
                  <Button variant="ghost" onClick={() => setShowLedger(false)} style={{ color: "white" }}><X size={24} /></Button>
               </div>
               <div style={{ padding: "30px", overflowY: "auto", flex: 1, textAlign: "center" }}>
                  <h3 style={{ color: "#16a34a", fontSize: "1.5rem", marginBottom: "10px" }}>Today's Cash Collection</h3>
                  <div style={{ fontSize: "3rem", fontWeight: "bold", color: "#0f172a" }}>₹{money(todayBills.filter(b => b.is_payment_done && b.payment_method === 'Cash').reduce((sum, b) => sum + b.totals?.grand_total, 0))}</div>
                  <p style={{ color: "#64748b", marginTop: "20px" }}>Ledger features are active. You can check individual bills in the Recent Bills tab.</p>
                  <Button variant="outline" onClick={() => setShowLedger(false)} style={{ marginTop: "30px", width: "100%" }}>Return to Billing</Button>
               </div>
            </div>
         </div>
      )}

    </div>
  );
}
