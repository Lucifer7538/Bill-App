import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Wifi, Store, Upload, Download, Keyboard } from "lucide-react";
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
  loyalty_points_per_gram: 1, loyalty_point_value_rs: 1,
  formula_note: "Line total = Weight x (Silver rate per gram + Making charge per gram)", logo_data_url: "", about_qr_data_url: STATIC_ABOUT_QR_URL, custom_fonts: [],
  shortcuts: [
    { id: "save_bill", action: "Save Bill", keys: "alt + s", isSystem: true },
    { id: "add_item", action: "Add new item row", keys: "alt + a", isSystem: true },
    { id: "new_bill", action: "New blank bill", keys: "alt + n", isSystem: true },
    { id: "share_wa", action: "Share via WhatsApp", keys: "alt + w", isSystem: true },
    { id: "focus_customer", action: "Jump to Customer Name", keys: "alt + c", isSystem: true },
    { id: "focus_item", action: "Jump to Item Description", keys: "alt + i", isSystem: true },
    { id: "focus_discount", action: "Jump to Discount", keys: "alt + d", isSystem: true },
    { id: "focus_redeem", action: "Jump to Redeem Points", keys: "alt + v", isSystem: true },
    { id: "focus_credit", action: "Jump to Use Credit", keys: "alt + u", isSystem: true },
    { id: "focus_payment", action: "Jump to Payment Method", keys: "alt + p", isSystem: true },
    { id: "open_ledger", action: "Open Ledger/Vaults", keys: "alt + l", isSystem: true },
    { id: "open_recent", action: "Open Recent Bills", keys: "alt + r", isSystem: true },
    { id: "download_pdf", action: "Download PDF", keys: "alt + f", isSystem: true },
    { id: "print_bill", action: "Print Bill", keys: "alt + b", isSystem: true }
  ],
  branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", location_url: "", map_url: "https://g.page/r/CVvnomQZn7zxEBE/review", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", location_url: "", map_url: "#", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }
  ]
};

const today = () => {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${d.getFullYear()}`;
};

const parseBillDate = (dStr) => {
  if (!dStr) return new Date();
  const p = dStr.split("-");
  if (p.length === 3 && p[0].length === 2) {
    return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
  }
  return new Date(dStr);
};

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
  <div className="no-print" data-html2canvas-ignore="true" style={{ marginTop: "25px", borderTop: "1px dashed #e2e8f0", paddingTop: "20px" }}>
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
export default function App() {
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
      const handleResize = () => setViewportWidth(window.innerWidth);
      window.addEventListener("resize", handleResize); 
      
      const handleBeforePrint = () => setIsPrinting(true);
      const handleAfterPrint = () => setIsPrinting(false);
      window.addEventListener("beforeprint", handleBeforePrint);
      window.addEventListener("afterprint", handleAfterPrint);

      return () => { 
        window.removeEventListener("resize", handleResize); 
        window.removeEventListener("beforeprint", handleBeforePrint);
        window.removeEventListener("afterprint", handleAfterPrint);
      };
  }, []);
  
  const isMobileSplit = viewportWidth <= 1024;

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

  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [gatewayPassed, setGatewayPassed] = useState(false);
  const [settings, setSettings] = useState(defaultSettings);
  const [globalBranchId, setGlobalBranchId] = useState("B1");
  const [billBranchId, setBillBranchId] = useState("B1");

  const [currentBillId, setCurrentBillId] = useState(null);
  const [mode, setMode] = useState("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
  const [editingDocNumber, setEditingDocNumber] = useState(null);
  const [isNumberLoading, setIsNumberLoading] = useState(false);
  const [billDate, setBillDate] = useState(today());

  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", email: "", points: 0, credit: 0 });
  const [bonusPoints, setBonusPoints] = useState("");
  
  const [suggestions, setSuggestions] = useState([]);
  const [items, setItems] = useState([createItem()]);
  
  const [discount, setDiscount] = useState("0");
  const [exchange, setExchange] = useState("0");
  const [redeemedPoints, setRedeemedPoints] = useState("");
  const [appliedCredit, setAppliedCredit] = useState("");
  const [savedCredit, setSavedCredit] = useState("");
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
  const [settingsTab, setSettingsTab] = useState("design"); 
  const [showAbout, setShowAbout] = useState(false);
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
  const [ledgerLogs, setLedgerLogs] = useState([]);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logType, setLogType] = useState("expense"); 
  const [logAmount, setLogAmount] = useState("");
  const [logReason, setLogReason] = useState("");
  const [logSourceVault, setLogSourceVault] = useState("cash");
  const [logTargetVault, setLogTargetVault] = useState("estimate_bank");
  const [submittingLog, setSubmittingLog] = useState(false);
  const [editingBalances, setEditingBalances] = useState(false);
  const [manualCash, setManualCash] = useState("");
  const [manualEstBank, setManualEstBank] = useState("");
  const [manualInvBank, setManualInvBank] = useState("");
  const [storageStats, setStorageStats] = useState({ used_bytes: 0, quota_bytes: 524288000, percentage: 0 });
  const [savingBill, setSavingBill] = useState(false);
  const [printScale, setPrintScale] = useState(getInitialPrintScale);
  const [logoUploadName, setLogoUploadName] = useState("");
  const [aboutUploadName, setAboutUploadName] = useState("");
  const [cloudStatus, setCloudStatus] = useState({ provider: "supabase", enabled: false, mode: "loading" });
  
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);

  const activeGlobalBranch = (settings.branches || []).find(b => b.id === globalBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];
  const activeBillBranch = (settings.branches || []).find(b => b.id === billBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];

  useEffect(() => {
    if (settings.custom_fonts && settings.custom_fonts.length > 0) {
      settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
    }
  }, [settings.custom_fonts]);

  const handleFontUpload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    const fontName = file.name.split('.')[0];
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result; const newFont = { name: fontName, dataUrl };
        const updatedFonts = [...(settings.custom_fonts || []), newFont];
        setSettings(prev => ({ ...prev, custom_fonts: updatedFonts }));
        localStorage.setItem("jj_custom_fonts", JSON.stringify(updatedFonts));
        registerFont(fontName, dataUrl); toast.success(`Font "${fontName}" uploaded!`);
      };
      reader.readAsDataURL(file);
    } catch { toast.error("Font upload failed."); }
  };

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
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      setShowSettings(false); setShowAbout(false); setShowRecentBills(false); setShowLedger(false); setShowFeedbackModal(false);
    };
    window.addEventListener("keydown", handleEsc); return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout, showRecentBills, showLedger, showFeedbackModal]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';

      if (e.key === "Enter" && isInput && activeTag !== 'textarea') {
          e.preventDefault();
          const formElements = Array.from(document.querySelectorAll('input, select, textarea, button:not(:disabled)'));
          const index = formElements.indexOf(document.activeElement);
          if (index > -1 && index < formElements.length - 1) {
              formElements[index + 1].focus();
          }
          return;
      }

      if (isInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
          return; 
      }

      const scList = settings.shortcuts || defaultSettings.shortcuts;
      
      const checkKey = (actionId) => {
          const sc = scList.find(s => s.id === actionId);
          if (!sc || !sc.keys) return false;
          const parts = sc.keys.toLowerCase().split('+').map(p => p.trim());
          const needsCtrl = parts.includes('ctrl') || parts.includes('cmd');
          const needsShift = parts.includes('shift');
          const needsAlt = parts.includes('alt');
          const keyPart = parts[parts.length - 1]; 
          const ctrlPressed = e.ctrlKey || e.metaKey;
          const shiftPressed = e.shiftKey;
          const altPressed = e.altKey;
          const keyFromKey = e.key ? e.key.toLowerCase() : "";
          const keyFromCode = e.code ? e.code.toLowerCase().replace("key", "").replace("digit", "") : "";
          const keyMatches = (keyFromKey === keyPart || keyFromCode === keyPart);
          return (ctrlPressed === needsCtrl) && (shiftPressed === needsShift) && (altPressed === needsAlt) && keyMatches;
      };

      if (checkKey('save_bill')) { e.preventDefault(); e.stopPropagation(); saveBill(); return; }
      if (checkKey('add_item')) { e.preventDefault(); e.stopPropagation(); setItems(prev => [...prev, createItem(settings.default_hsn)]); markDirty(); return; }
      if (checkKey('new_bill')) { e.preventDefault(); e.stopPropagation(); handleNewBillClick(); return; }
      if (checkKey('share_wa')) { e.preventDefault(); e.stopPropagation(); shareWhatsApp(); return; }
      if (checkKey('open_ledger')) { e.preventDefault(); e.stopPropagation(); setShowLedger(true); return; }
      if (checkKey('open_recent')) { e.preventDefault(); e.stopPropagation(); setShowRecentBills(true); return; }
      if (checkKey('focus_payment')) { e.preventDefault(); e.stopPropagation(); document.getElementById('paymentMethodSelect')?.focus(); return; }
      if (checkKey('focus_customer')) { e.preventDefault(); e.stopPropagation(); document.getElementById('customerNameInput')?.focus(); return; }
      if (checkKey('focus_item')) { e.preventDefault(); e.stopPropagation(); const itemInputs = document.querySelectorAll('.item-desc-input'); if(itemInputs.length > 0) itemInputs[itemInputs.length - 1].focus(); return; }
      if (checkKey('focus_discount')) { e.preventDefault(); e.stopPropagation(); document.getElementById('discountInput')?.focus(); return; }
      if (checkKey('focus_redeem')) { e.preventDefault(); e.stopPropagation(); document.getElementById('redeemedPointsInput')?.focus(); return; }
      if (checkKey('focus_credit')) { e.preventDefault(); e.stopPropagation(); document.getElementById('appliedCreditInput')?.focus(); return; }
      if (checkKey('download_pdf')) { e.preventDefault(); e.stopPropagation(); downloadPdf("bill-print-root", documentNumber || mode); return; }
      if (checkKey('print_bill')) { e.preventDefault(); e.stopPropagation(); window.print(); return; }
    };

    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }); 

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
        const billDateObj = parseBillDate(bill.date);
        const now = new Date();
        if (billDateObj.getMonth() !== now.getMonth() || billDateObj.getFullYear() !== now.getFullYear()) return false;
      } 
      else if (recentDateFilter === "LAST_MONTH") {
        const billDateObj = parseBillDate(bill.date);
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (billDateObj.getMonth() !== lastMonth.getMonth() || billDateObj.getFullYear() !== lastMonth.getFullYear()) return false;
      } 
      else if (recentDateFilter === "CUSTOM") {
        const fixBillDate = (dStr) => {
            if(!dStr) return "";
            const p = dStr.split("-");
            if (p.length === 3 && p[0].length === 2) return `${p[2]}-${p[1]}-${p[0]}`;
            return dStr;
        };
        const bDate = fixBillDate(bill.date);
        if (customStartDate && bDate < customStartDate) return false;
        if (customEndDate && bDate > customEndDate) return false;
      }
      return true;
    });
  }, [recentBillsList, recentModeFilter, recentDateFilter, customStartDate, customEndDate]);

  const handleBulkDownload = async () => {
    if ((filteredRecentBills || []).length === 0) { toast.error("No bills to download!"); return; }
    if ((filteredRecentBills || []).length > 20) { if (!window.confirm(`Generate PDF with ${filteredRecentBills.length} pages? This might take a minute.`)) return; }
    setIsBulkDownloading(true); toast.info(`Generating PDF for ${filteredRecentBills.length} bills...`);
    
    await new Promise(resolve => setTimeout(resolve, 800));

    try {
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();

      for (let i = 0; i < filteredRecentBills.length; i++) {
        const bill = filteredRecentBills[i];
        const node = document.getElementById(`bulk-bill-${bill.document_number}`);
        if (!node) continue;
        
        const canvas = await html2canvas(node, { 
          scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", windowWidth: 1024,
          onclone: (clonedDoc) => {
            const clonedNode = clonedDoc.getElementById(`bulk-bill-${bill.document_number}`);
            if (clonedNode) {
              clonedNode.style.display = "block";
              clonedNode.style.transform = "none";
              clonedNode.style.width = "800px"; clonedNode.style.minWidth = "800px"; clonedNode.style.maxWidth = "800px"; 
              clonedNode.style.padding = "20px"; clonedNode.style.boxSizing = "border-box";
              const images = clonedNode.getElementsByTagName('img'); for (let img of images) img.crossOrigin = "anonymous";
            }
          }
        });
        const imgData = canvas.toDataURL("image/png", 1.0);
        const pageHeight = (canvas.height * pageWidth) / canvas.width;
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, 0, pageWidth, pageHeight);
      }
      pdf.save(`Jalaram_Bills_Export_${today()}.pdf`); toast.success("Bulk PDF Downloaded!");
    } catch (error) { toast.error("Error generating bulk PDF."); } finally { setIsBulkDownloading(false); }
  };

  const fetchLedgerHistory = async () => {
    try { const res = await axios.get(`${API}/settings/ledger/logs?branch_id=${globalBranchId}`, { headers: authHeaders }); setLedgerLogs(res.data); } catch { toast.error("Failed to load ledger history."); }
  };

  useEffect(() => {
    if (showLedger && token && !isPublicView) {
      const fetchLedger = async () => {
        setLedgerLoading(true);
        try { await loadSettings(); const res = await axios.get(`${API}/bills/today?date=${today()}&branch_id=${globalBranchId}`, { headers: authHeaders }); setTodayBills(res.data); await fetchLedgerHistory(); } 
        catch { toast.error("Failed to load today's ledger."); } finally { setLedgerLoading(false); }
      };
      fetchLedger();
    }
  }, [showLedger, token, isPublicView, globalBranchId, authHeaders]);

  useEffect(() => {
    if (showSettings && token && !isPublicView) {
      const fetchStorageStats = async () => { try { const res = await axios.get(`${API}/system/storage`, { headers: authHeaders }); setStorageStats(res.data); } catch { console.error("Failed to load storage stats"); } };
      fetchStorageStats();
    }
  }, [showSettings, token, isPublicView, authHeaders]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    const savedAboutQr = localStorage.getItem("jj_about_qr_data_url");
    let dbData = response.data || {};
    if (!dbData.branches) dbData.branches = defaultSettings.branches;
    let localFonts = []; const localFontsRaw = localStorage.getItem("jj_custom_fonts"); if (localFontsRaw) { try { localFonts = JSON.parse(localFontsRaw); } catch (e) {} }

    let mergedShortcuts = defaultSettings.shortcuts;
    if (dbData.shortcuts && dbData.shortcuts.length > 0) {
        const customOnly = dbData.shortcuts.filter(sc => !sc.isSystem);
        const systemUpdated = defaultSettings.shortcuts.map(sys => {
            const savedSys = dbData.shortcuts.find(s => s.id === sys.id);
            return savedSys ? savedSys : sys;
        });
        mergedShortcuts = [...systemUpdated, ...customOnly];
    } else {
        mergedShortcuts = defaultSettings.shortcuts;
    }

    const newSettings = { 
      ...defaultSettings, 
      ...dbData, 
      logo_data_url: savedLogo || dbData.logo_data_url || "", 
      about_qr_data_url: savedAboutQr || dbData.about_qr_data_url || STATIC_ABOUT_QR_URL, 
      custom_fonts: dbData.custom_fonts || localFonts, 
      shortcuts: mergedShortcuts 
    };
    
    setSettings(newSettings);
    if (!(newSettings.branches || []).find(b => b.id === globalBranchId)) { setGlobalBranchId((newSettings.branches || [])[0].id); setBillBranchId((newSettings.branches || [])[0].id); }
    setItems((prev) => { if (prev.length === 1 && !prev[0].description && !prev[0].weight && !prev[0].hsn) return [{ ...prev[0], hsn: newSettings.default_hsn }]; return prev; });
    setSettingsLoaded(true);
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
    const bootstrap = async () => { if (!token) return; try { await loadSettings(); await fetchCloudStatus(); } catch { toast.error("Could not load billing settings."); } };
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
    
    const ptPerGram = num(settings.loyalty_points_per_gram !== undefined ? settings.loyalty_points_per_gram : 1);
    const rsPerPt = num(settings.loyalty_point_value_rs !== undefined ? settings.loyalty_point_value_rs : 1);

    let totalWeight = 0;

    const mapped = (items || []).map((item, index) => {
      const weight = num(item.weight);
      totalWeight += weight;
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
    
    const bonusPointsVal = num(bonusPoints);
    const earnedPoints = Math.floor(totalWeight * ptPerGram) + bonusPointsVal;
    const appliedRedeemedPoints = num(redeemedPoints);
    const appliedRedeemedValue = appliedRedeemedPoints * rsPerPt;
    const appliedCreditVal = num(appliedCredit);
    const savedCreditVal = num(savedCredit);

    const baseTotal = taxable + gstApplied + mdr - num(discount) - num(exchange) - appliedRedeemedValue - appliedCreditVal + savedCreditVal;
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = manualRoundOff === "" ? autoRound : num(manualRoundOff);
    const grandTotal = baseTotal + roundOff;
    
    return { items: mapped, baseSilverRate, subtotal, taxable, cgst, sgst, igst, mdr, roundOff, grandTotal, totalWeight, earnedPoints, redeemedPoints: appliedRedeemedPoints, redeemedValue: appliedRedeemedValue, appliedCredit: appliedCreditVal, savedCredit: savedCreditVal, bonusPoints: bonusPointsVal };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff, redeemedPoints, appliedCredit, savedCredit, bonusPoints]);

  const updateItem = (id, key, value) => { markDirty(); setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))); };

  const checkIsBlank = () => { return !customer.name.trim() && !customer.phone.trim() && !customer.address.trim() && !(items || []).some(i => i.description.trim() || i.weight.trim() || i.amount_override.trim()) && (!discount || discount === "0") && (!exchange || exchange === "0") && !paymentMethod && !advanceMethod && !advanceAmount && !splitCash; };

  const clearBill = async (nextMode = mode, nextBranch = billBranchId) => {
    setCurrentBillId(null); setEditingDocNumber(null); setItems([createItem(settings.default_hsn)]); setCustomer({ name: "", phone: "", address: "", email: "", points: 0, credit: 0 });
    setSuggestions([]); setDiscount("0"); setExchange("0"); setRedeemedPoints(""); setAppliedCredit(""); setSavedCredit(""); setBonusPoints(""); setManualRoundOff("");
    setTxType("sale"); setPaymentMethod(""); setSplitCash(""); setIsPaymentDone(false); setAdvanceAmount(""); setAdvanceMethod(""); setAdvanceSplitCash(""); setIsAdvancePaid(false); setBalanceMethod(""); setBalanceSplitCash(""); setIsBalancePaid(false); setNotes("");
    setBillDate(today()); setIsDirty(false); await reserveNumber(nextMode, nextBranch); goToBillTop();
  };

  const handleNewBillClick = async () => {
    if (currentBillId && isDirty) { if (!window.confirm("⚠️ You have unsaved edits to this saved bill! Discard edits and start a new bill?")) return; } else if (!currentBillId && !checkIsBlank()) { if (!window.confirm("⚠️ You have entered data! Are you sure you want to discard it and start a blank new bill?")) return; }
    await clearBill(mode, billBranchId);
  };

  const loadBillForEditing = (bill) => {
    setCurrentBillId(bill.id); setEditingDocNumber(bill.document_number); setMode(bill.mode); setBillBranchId(bill.branch_id || (settings.branches || [])[0].id); setDocumentNumber(bill.document_number); setBillDate(bill.date || today());
    setCustomer({ name: bill.customer_name || bill.customer?.name || "", phone: bill.customer_phone || bill.customer?.phone || "", address: bill.customer_address || bill.customer?.address || "", email: bill.customer_email || bill.customer?.email || "", points: bill.customer?.points || 0, credit: bill.customer?.credit || 0 });
    setTxType(bill.tx_type || "sale"); setPaymentMethod(bill.payment_method || ""); setSplitCash(bill.split_cash !== null && bill.split_cash !== undefined ? String(bill.split_cash) : ""); setIsPaymentDone(bill.is_payment_done || false); 
    setAdvanceAmount(bill.advance_amount ? String(bill.advance_amount) : ""); setAdvanceMethod(bill.advance_method || ""); setAdvanceSplitCash(bill.advance_split_cash ? String(bill.advance_split_cash) : ""); setIsAdvancePaid(bill.is_advance_paid || false);
    setBalanceMethod(bill.balance_method || ""); setBalanceSplitCash(bill.balance_split_cash ? String(bill.balance_split_cash) : ""); setIsBalancePaid(bill.is_balance_paid || false);
    setNotes(bill.notes || ""); setDiscount(bill.discount ? String(bill.discount) : (bill.totals?.discount ? String(bill.totals.discount) : "0")); setExchange(bill.exchange ? String(bill.exchange) : (bill.totals?.exchange ? String(bill.totals.exchange) : "0")); setManualRoundOff(bill.totals?.round_off !== null && bill.totals?.round_off !== undefined ? String(bill.totals.round_off) : "");
    setRedeemedPoints(bill.redeemed_points ? String(bill.redeemed_points) : "");
    setAppliedCredit(bill.applied_credit ? String(bill.applied_credit) : "");
    setSavedCredit(bill.saved_credit ? String(bill.saved_credit) : "");
    setBonusPoints(bill.bonus_points ? String(bill.bonus_points) : "");
    const loadedItems = (bill.items || []).map((item) => ({ id: `${Date.now()}-${Math.random()}`, description: item.description || "", hsn: item.hsn || "", weight: item.weight ? String(item.weight) : "", quantity: item.quantity ? String(item.quantity) : "1", mc_override: item.mc_override !== null && item.mc_override !== undefined ? String(item.mc_override) : "", rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "", amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "", }));
    setItems(loadedItems.length > 0 ? loadedItems : [createItem(settings.default_hsn)]); setIsDirty(false); setShowRecentBills(false); setShowLedger(false); toast.success(`Loaded ${bill.document_number} for editing`); goToBillTop();
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${bill.document_number}?`)) return;
    try { await axios.delete(`${API}/bills/${bill.document_number}`, { headers: authHeaders }); setRecentBillsList((prev) => prev.filter((b) => b.document_number !== bill.document_number)); if (currentBillId === bill.id) await clearBill(mode, billBranchId); toast.success(`${bill.document_number} deleted successfully.`); await loadSettings(); } 
    catch { toast.error("Failed to delete the bill."); }
  };

  const handleQuickPaymentToggle = async (bill) => {
    if (bill.tx_type === "booking" || bill.tx_type === "service") { toast.info("Please open the bill and click Edit to manage Booking/Service balances."); return; }
    const newStatus = !bill.is_payment_done;
    try { await axios.put(`${API}/bills/${bill.document_number}/toggle-payment`, { is_payment_done: newStatus }, { headers: authHeaders }); toast.success(`Payment marked as ${newStatus ? 'DONE ✅' : 'PENDING ⏳'}`); if (currentBillId === bill.id) { setIsPaymentDone(newStatus); } setRecentBillsList(prev => prev.map(b => b.document_number === bill.document_number ? { ...b, is_payment_done: newStatus } : b)); await loadSettings(); } 
    catch { toast.error("Failed to update payment status."); }
  };

  const handleResetCounter = async (resetMode) => {
    if (!window.confirm(`Are you SURE you want to restart the ${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} back to 0001?`)) return;
    try { await axios.post(`${API}/bills/reset-counter`, { mode: resetMode, branch_id: globalBranchId }, { headers: authHeaders }); toast.success(`${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} has been reset.`); if (mode === resetMode && billBranchId === globalBranchId) { await reserveNumber(mode, billBranchId); } } 
    catch { toast.error(`Failed to reset the ${resetMode} counter.`); }
  };

  const handleBackupBills = async () => {
    try { toast.info("Preparing backup file..."); const res = await axios.get(`${API}/bills/export`, { headers: authHeaders }); const dataStr = JSON.stringify(res.data, null, 2); const blob = new Blob([dataStr], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Jalaram_Bills_Backup_${today()}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); toast.success("Backup downloaded successfully!"); } 
    catch { toast.error("Failed to download backup."); }
  };

  const handleDeleteAllBills = async () => {
    if (!window.confirm("🚨 WARNING! This will permanently delete ALL bills. Have you downloaded your backup first?")) return;
    if (window.prompt("Type 'DELETE' to confirm wiping all bills:") !== "DELETE") { toast.error("Deletion cancelled."); return; }
    try { await axios.delete(`${API}/bills/all`, { headers: authHeaders }); toast.success("All bills wiped. (Ledger balances remain intact)"); setRecentBillsList([]); const res = await axios.get(`${API}/system/storage`, { headers: authHeaders }); setStorageStats(res.data); } 
    catch { toast.error("Failed to delete bills."); }
  };

  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    if (currentBillId) { try { const res = await axios.get(`${API}/bills/next-number?mode=${nextMode}&branch_id=${billBranchId}`, { headers: authHeaders }); setDocumentNumber(res.data.document_number); setMode(nextMode); markDirty(); toast.info(`Migrating to ${nextMode.toUpperCase()}`); } catch (err) { toast.error("Failed to fetch new number for migration."); } } 
    else { if (!checkIsBlank()) { if (!window.confirm("⚠️ You have unsaved changes! Switching modes will clear the screen. Continue?")) return; } setMode(nextMode); await clearBill(nextMode, billBranchId); }
  };

  const handleGlobalBranchChange = async (nextBranchId) => { setGlobalBranchId(nextBranchId); if (!currentBillId && checkIsBlank()) { setBillBranchId(nextBranchId); await reserveNumber(mode, nextBranchId); } };
  const updateBranch = (index, field, value) => { const updatedBranches = [...(settings.branches || [])]; updatedBranches[index] = { ...updatedBranches[index], [field]: value }; setSettings({ ...settings, branches: updatedBranches }); };
  const addBranch = () => { const newId = `B${Date.now()}`; const newBranch = { id: newId, name: `New Branch`, address: "", location_url: "", map_url: "#", invoice_upi_id: "", estimate_upi_id: "", gstin: "", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }; setSettings({ ...settings, branches: [...(settings.branches || []), newBranch] }); };
  const removeBranch = (index) => { if ((settings.branches || []).length <= 1) { toast.error("You must have at least one branch."); return; } if (!window.confirm("Remove this branch from settings?")) return; const updatedBranches = (settings.branches || []).filter((_, i) => i !== index); setSettings({ ...settings, branches: updatedBranches }); };
  const addShortcut = () => { const newSc = { id: `custom_${Date.now()}`, action: "", keys: "", isSystem: false }; setSettings(prev => ({ ...prev, shortcuts: [...(prev.shortcuts || defaultSettings.shortcuts), newSc] })); };
  const updateShortcut = (index, field, value) => { const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; list[index] = { ...list[index], [field]: value }; setSettings(prev => ({ ...prev, shortcuts: list })); };
  const removeShortcut = (index) => { const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; list.splice(index, 1); setSettings(prev => ({ ...prev, shortcuts: list })); };
  const handleLogin = async (event) => { event.preventDefault(); setLoggingIn(true); try { const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 }); localStorage.setItem("jj_auth_token", response.data.access_token); setToken(response.data.access_token); setPasscode(""); toast.success("Logged in successfully"); } catch (error) { if (error?.response?.status === 401) { toast.error("Wrong passcode."); } else { toast.error("Server is waking up. Please wait 15-20 seconds and try again."); } } finally { setLoggingIn(false); } };
  const handleLogout = () => { localStorage.removeItem("jj_auth_token"); setToken(""); setGatewayPassed(false); setSettingsLoaded(false); };
  const optimizeImageDataUrl = async (file) => { const reader = new FileReader(); const original = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; }); const ratio = Math.min(420 / image.width, 420 / image.height, 1); const targetWidth = Math.round(image.width * ratio); const targetHeight = Math.round(image.height * ratio); const canvas = document.createElement("canvas"); canvas.width = targetWidth; canvas.height = targetHeight; const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, targetWidth, targetHeight); return canvas.toDataURL("image/png", 0.92); };
  const handleLogoUpload = async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const dataUrl = await optimizeImageDataUrl(file); localStorage.setItem("jj_logo_data_url", dataUrl); setSettings((prev) => ({ ...prev, logo_data_url: dataUrl })); setLogoUploadName(file.name); toast.success("Logo uploaded successfully."); } catch { toast.error("Logo upload failed."); } };
  const handleAboutQrUpload = async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const dataUrl = await optimizeImageDataUrl(file); localStorage.setItem("jj_about_qr_data_url", dataUrl); setSettings((prev) => ({ ...prev, about_qr_data_url: dataUrl })); setAboutUploadName(file.name); toast.success("About QR updated."); } catch { toast.error("QR upload failed."); } };
  const saveSettings = async () => { try { await axios.put(`${API}/settings`, settings, { headers: authHeaders }); toast.success("Settings saved."); } catch { toast.error("Could not save settings."); } };
  const submitLedgerLog = async () => { if (!logAmount || isNaN(logAmount) || num(logAmount) <= 0) { toast.error("Please enter a valid amount."); return; } if (!logReason.trim()) { toast.error("Please enter a reason/remark."); return; } setSubmittingLog(true); try { const payload = { branch_id: globalBranchId, reason: logReason, cash_change: 0, estimate_bank_change: 0, invoice_bank_change: 0 }; const amt = num(logAmount); const keyMap = { "cash": "cash_change", "estimate_bank": "estimate_bank_change", "invoice_bank": "invoice_bank_change" }; if (logType === "expense") payload[keyMap[logSourceVault]] = -amt; else if (logType === "add") payload[keyMap[logSourceVault]] = amt; else if (logType === "exchange") { if (logSourceVault === logTargetVault) { toast.error("Cannot exchange into the same vault."); setSubmittingLog(false); return; } payload[keyMap[logSourceVault]] = -amt; payload[keyMap[logTargetVault]] = amt; } await axios.post(`${API}/settings/ledger/adjust`, payload, { headers: authHeaders }); toast.success("Transaction logged successfully!"); setShowLogForm(false); setLogAmount(""); setLogReason(""); await loadSettings(); await fetchLedgerHistory(); } catch (error) { toast.error("Ledger update failed."); } finally { setSubmittingLog(false); } };
  const saveBalances = async () => { try { const payload = { branch_id: globalBranchId, cash_balance: num(manualCash), estimate_bank_balance: num(manualEstBank), invoice_bank_balance: num(manualInvBank) }; await axios.put(`${API}/settings/balances`, payload, { headers: authHeaders }); setSettings(prev => { const updatedBranches = (prev.branches || []).map(b => b.id === globalBranchId ? { ...b, ...payload } : b); return { ...prev, branches: updatedBranches }; }); setEditingBalances(false); toast.success(`Ledger balances for ${activeGlobalBranch.name} manually updated!`); } catch { toast.error("Failed to update balances."); } };

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
        
        redeemed_points: num(redeemedPoints),
        earned_points: computed.earnedPoints,
        applied_credit: computed.appliedCredit,
        saved_credit: computed.savedCredit,
        bonus_points: computed.bonusPoints,

        items: computed.items.map((item) => ({ description: item.description, hsn: item.hsn, weight: num(item.weight), quantity: num(item.quantity), mc_override: item.mc_override === "" ? null : num(item.mc_override), rate_override: item.rate_override === "" ? null : num(item.rate_override), amount_override: item.amount_override === "" ? null : num(item.amount_override), rate: item.rate, amount: item.amount, sl_no: item.slNo })),
        totals: { grand_total: computed.grandTotal, subtotal: computed.subtotal }
      };

      if (currentBillId) { await axios.put(`${API}/bills/update-by-id/${currentBillId}`, payload, { headers: authHeaders }); toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} updated & migrated successfully.`); setIsDirty(false); setEditingDocNumber(documentNumber); } 
      else { const res = await axios.post(`${API}/bills/save`, payload, { headers: authHeaders }); toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} saved successfully.`); setIsDirty(false); setCurrentBillId(res.data.id); setEditingDocNumber(res.data.document_number); setDocumentNumber(res.data.document_number); }
      await loadSettings(); await fetchLedgerHistory();
    } catch (error) { toast.error("Failed to save bill."); } finally { setSavingBill(false); }
  };

  const downloadPdf = async (elementId, filename) => { toast.info("Preparing PDF..."); const node = document.getElementById(elementId); if (!node) return; try { const canvas = await html2canvas(node, { scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", windowWidth: 1024, onclone: (clonedDoc) => { const clonedNode = clonedDoc.getElementById(elementId); if (clonedNode) { clonedNode.style.transform = "none"; clonedNode.style.width = "800px"; clonedNode.style.maxWidth = "800px"; clonedNode.style.minWidth = "800px"; clonedNode.style.position = "absolute"; clonedNode.style.top = "0"; clonedNode.style.left = "0"; clonedNode.style.margin = "0"; clonedNode.style.padding = "20px"; clonedNode.style.boxSizing = "border-box"; const images = clonedNode.getElementsByTagName('img'); for (let img of images) img.crossOrigin = "anonymous"; } } }); const imageData = canvas.toDataURL("image/png", 1.0); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = (canvas.height * pageWidth) / canvas.width; pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight); pdf.save(`${filename}.pdf`); toast.success("PDF Downloaded Successfully"); } catch (error) { toast.error("Failed to download PDF."); } };
  const shareWhatsApp = () => { const link = `${window.location.origin}/?view=${documentNumber}`; const text = `Hello ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`; let cleanedPhone = customer.phone.replace(/\D/g, ""); if (cleanedPhone.length === 10) cleanedPhone = `91${cleanedPhone}`; window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, "_blank"); };
  const shareEmail = () => { const link = `${window.location.origin}/?view=${documentNumber}`; const subject = `${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber}`; const body = `Dear ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`; window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; };
  const goToBillTop = () => { document.getElementById("bill-print-root")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const todaysTotalCash = (todayBills || []).filter(b => b.is_payment_done).reduce((sum, b) => sum + (b.payment_method === 'Cash' ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_cash) : 0), 0);
  const todaysTotalEstBank = (todayBills || []).filter(b => b.is_payment_done && b.mode === 'estimate').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);
  const todaysTotalInvBank = (todayBills || []).filter(b => b.is_payment_done && b.mode === 'invoice').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);

  const publicComputed = useMemo(() => {
    if (!publicBill || !publicSettings) return { items: [], taxable: 0, cgst: 0, sgst: 0, igst: 0, mdr: 0, roundOff: 0, grandTotal: 0, discount: 0, exchange: 0 };
    const baseSilverRate = num(publicSettings.silver_rate_per_gram); const baseMCPerGram = num(publicSettings.making_charge_per_gram); const flatMCBelow5g = num(publicSettings.flat_mc_below_5g);
    const ptPerGram = num(publicSettings.loyalty_points_per_gram !== undefined ? publicSettings.loyalty_points_per_gram : 1);
    const rsPerPt = num(publicSettings.loyalty_point_value_rs !== undefined ? publicSettings.loyalty_point_value_rs : 1);

    let totalWeight = 0;

    const mapped = (publicBill.items || []).map((item, index) => {
      const weight = num(item.weight); totalWeight += weight;
      const quantity = Math.max(num(item.quantity || 1), 1);
      const silverRate = (item.rate_override !== undefined && item.rate_override !== null && item.rate_override !== "") ? num(item.rate_override) : baseSilverRate;
      let mcAmount = 0;
      if (item.mc_override !== undefined && item.mc_override !== null && item.mc_override !== "") { mcAmount = weight * num(item.mc_override); } 
      else if (flatMCBelow5g > 0 && weight > 0 && weight < 5) { mcAmount = flatMCBelow5g; } 
      else { mcAmount = weight * baseMCPerGram; }

      const totalItemCost = (weight * silverRate) + mcAmount;
      const formulaAmount = publicBill.mode === "estimate" ? totalItemCost * quantity : totalItemCost;
      const amount = (item.amount !== undefined && item.amount !== null && item.amount !== "") ? num(item.amount) : (item.amount_override ? num(item.amount_override) : formulaAmount);
      const { rupees, paise } = splitAmount(amount);
      const rateForPrint = weight > 0 ? (amount / (publicBill.mode === "estimate" ? quantity : 1)) / weight : 0;
      
      return { ...item, sl_no: item.sl_no || (index + 1), rate: rateForPrint, amount, rupees, paise, weight, quantity };
    });

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0); const taxable = subtotal;
    const cgst = publicBill.mode === "invoice" ? taxable * 0.015 : 0; const sgst = publicBill.mode === "invoice" ? taxable * 0.015 : 0; const igst = 0;
    const gstApplied = publicBill.mode === "invoice" ? cgst + sgst + igst : 0;
    const discount = num(publicBill.discount || publicBill.totals?.discount || 0); const exchange = num(publicBill.exchange || publicBill.totals?.exchange || 0);
    const mdr = publicBill.payment_method === "Card" ? (taxable + gstApplied) * 0.02 : 0;
    
    const bonusPointsVal = num(publicBill.bonus_points || 0);
    const earnedPoints = publicBill.earned_points !== undefined ? num(publicBill.earned_points) : (Math.floor(totalWeight * ptPerGram) + bonusPointsVal);
    const redeemedPoints = num(publicBill.redeemed_points || 0);
    const redeemedValue = redeemedPoints * rsPerPt;
    const appliedCreditVal = num(publicBill.applied_credit || 0);
    const savedCreditVal = num(publicBill.saved_credit || 0);

    const baseTotal = taxable + gstApplied + mdr - discount - exchange - redeemedValue - appliedCreditVal + savedCreditVal; 
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = publicBill.round_off !== undefined && publicBill.round_off !== null ? num(publicBill.round_off) : (publicBill.totals?.round_off !== undefined && publicBill.totals?.round_off !== null ? num(publicBill.totals?.round_off) : autoRound);
    const grandTotal = publicBill.totals?.grand_total !== undefined && publicBill.totals?.grand_total !== null ? num(publicBill.totals.grand_total) : (baseTotal + roundOff);

    return { items: mapped, taxable: publicBill.totals?.taxable_amount || publicBill.totals?.subtotal || taxable, cgst: publicBill.totals?.cgst ?? cgst, sgst: publicBill.totals?.sgst ?? sgst, igst: publicBill.totals?.igst ?? igst, mdr: publicBill.totals?.mdr ?? mdr, roundOff, grandTotal, discount, exchange, earnedPoints, redeemedPoints, redeemedValue, appliedCredit: appliedCreditVal, savedCredit: savedCreditVal };
  }, [publicBill, publicSettings]);

  const getUpiAmount = () => {
      if (txType === "sale") return paymentMethod === "Split" ? Math.max(0, computed.grandTotal - num(splitCash)) : computed.grandTotal;
      if (!isAdvancePaid && (advanceMethod === "UPI" || advanceMethod === "Split")) return advanceMethod === "Split" ? Math.max(0, num(advanceAmount) - num(advanceSplitCash)) : num(advanceAmount);
      if (isAdvancePaid && !isBalancePaid && (balanceMethod === "UPI" || balanceMethod === "Split")) { const bal = Math.max(0, computed.grandTotal - num(advanceAmount)); return balanceMethod === "Split" ? Math.max(0, bal - num(balanceSplitCash)) : bal; }
      return 0;
  };
          <div style={{ padding: "15px" }}>
            <div style={{ marginBottom: "20px" }}>
              <Button onClick={handleBulkDownload} disabled={isBulkDownloading || (filteredRecentBills || []).length === 0} style={{ width: "100%", backgroundColor: "#0f172a", height: "auto", padding: "10px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", justifyContent: "center", fontSize: "1rem", boxSizing: "border-box" }}>
                {isBulkDownloading ? "Generating PDF... Please Wait" : <><Download size={18} /> Download {(filteredRecentBills || []).length} Bills as PDF</>}
              </Button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "20px" }}>
              <Input placeholder="Search Customer Name, Phone, or Bill No..." value={billSearchQuery} onChange={(e) => setBillSearchQuery(e.target.value)} />
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <select value={recentBranchFilter} onChange={(e) => setRecentBranchFilter(e.target.value)} className="native-select" style={{ flex: 1, minWidth: "120px" }}>
                  <option value="ALL">All Branches</option>
                  {(settings.branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={recentModeFilter} onChange={(e) => setRecentModeFilter(e.target.value)} className="native-select" style={{ flex: 1, minWidth: "120px" }}>
                  <option value="ALL">All Modes</option><option value="invoice">Invoices</option><option value="estimate">Estimates</option>
                </select>
                <select value={recentDateFilter} onChange={(e) => setRecentDateFilter(e.target.value)} className="native-select" style={{ flex: 1, minWidth: "120px" }}>
                  <option value="ALL">All Time</option><option value="THIS_MONTH">This Month</option><option value="LAST_MONTH">Last Month</option><option value="CUSTOM">Custom Range</option>
                </select>
              </div>
              {recentDateFilter === "CUSTOM" && (
                <div style={{ display: "flex", gap: "10px" }}>
                  <Input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} style={{ flex: 1 }} />
                  <Input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} style={{ flex: 1 }} />
                </div>
              )}
            </div>

            {loadingRecent ? (<p style={{ textAlign: "center", padding: "20px" }}>Loading recent bills...</p>) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {(filteredRecentBills || []).length === 0 ? (<p style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>No bills found matching criteria.</p>) : (
                  (filteredRecentBills || []).map((bill) => (
                    <div key={bill.id} className="recent-bill-card" style={{ padding: "15px", border: "1px solid #cbd5e1", borderRadius: "8px", backgroundColor: "#f8fafc" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <strong style={{ fontSize: "1.1rem", color: bill.mode === "invoice" ? "#dc2626" : "#2563eb" }}>{bill.document_number}</strong>
                        <span style={{ fontSize: "0.85rem", color: "#475569" }}>{bill.date}</span>
                      </div>
                      <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>{bill.customer_name || bill.customer?.name || "Unknown Customer"}</p>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", fontSize: "0.9rem" }}>
                        <span>Total: <strong>₹{money(bill.totals?.grand_total || 0)}</strong></span>
                        <span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "0.75rem", backgroundColor: (bill.tx_type === "sale" ? bill.is_payment_done : bill.is_balance_paid) ? "#dcfce7" : "#fef3c7", color: (bill.tx_type === "sale" ? bill.is_payment_done : bill.is_balance_paid) ? "#166534" : "#b45309" }}>
                          {(bill.tx_type === "sale" ? bill.is_payment_done : bill.is_balance_paid) ? "PAID" : "PENDING"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <Button size="sm" onClick={() => loadBillForEditing(bill)} style={{ flex: 1, backgroundColor: "#0f172a" }}>Edit</Button>
                        <Button size="sm" variant="outline" onClick={() => downloadPdf(`bulk-bill-${bill.document_number}`, bill.document_number)} style={{ flex: 1 }}>PDF</Button>
                        <Button size="sm" variant="outline" onClick={() => handleQuickPaymentToggle(bill)} style={{ flex: 1 }}>{bill.is_payment_done ? "Mark Pending" : "Mark Paid"}</Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteBill(bill)} style={{ borderColor: "#ef4444", color: "#ef4444" }}>Del</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* SETTINGS DRAWER */}
      {showSettings && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", maxWidth: "600px", backgroundColor: "white", zIndex: 100, boxShadow: "-5px 0 25px rgba(0,0,0,0.2)", overflowY: "auto" }}>
          <div className="drawer-header" style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 10, paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "20px 20px 10px 20px" }}>System Settings</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowSettings(false)} style={{ marginLeft: "20px" }}><ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Close Menu</span></Button>
          </div>
          <div style={{ padding: "15px" }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", overflowX: "auto" }}>
              <Button variant={settingsTab === "design" ? "default" : "ghost"} onClick={() => setSettingsTab("design")}>Design</Button>
              <Button variant={settingsTab === "business" ? "default" : "ghost"} onClick={() => setSettingsTab("business")}>Business & Branches</Button>
              <Button variant={settingsTab === "advanced" ? "default" : "ghost"} onClick={() => setSettingsTab("advanced")}>Advanced</Button>
            </div>

            {settingsTab === "design" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <h4>Print Scale Alignment</h4>
                  <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "10px" }}>Adjust this if your printed bill cuts off or is too small. (Default 100%)</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                    <input type="range" min="98" max="102" step="0.5" value={printScale} onChange={(e) => setPrintScale(Number(e.target.value))} style={{ flex: 1 }} />
                    <strong style={{ minWidth: "50px", textAlign: "right" }}>{printScale}%</strong>
                  </div>
                </div>
                
                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <h4>Custom Fonts</h4>
                  <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "10px" }}>Upload a .ttf or .woff file to use custom fonts.</p>
                  <Input type="file" accept=".ttf,.woff,.woff2" onChange={handleFontUpload} />
                </div>

                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <h4>Logos & QR</h4>
                  <label className="select-label">Shop Logo (PNG/JPG)</label>
                  <Input type="file" accept="image/*" onChange={handleLogoUpload} style={{ marginBottom: "10px" }} />
                  {logoUploadName && <p style={{ fontSize: "0.8rem", color: "#16a34a" }}>Selected: {logoUploadName}</p>}
                  
                  <label className="select-label" style={{ marginTop: "10px" }}>About Us QR (PNG/JPG)</label>
                  <Input type="file" accept="image/*" onChange={handleAboutQrUpload} style={{ marginBottom: "10px" }} />
                  {aboutUploadName && <p style={{ fontSize: "0.8rem", color: "#16a34a" }}>Selected: {aboutUploadName}</p>}
                </div>

                <DesignSettingRow title="Shop Name" fieldPrefix="shop_name" settings={settings} setSettings={setSettings} />
                <DesignSettingRow title="Tagline" fieldPrefix="tagline" settings={settings} setSettings={setSettings} />
                <DesignSettingRow title="Phone Numbers (Comma Separated)" fieldPrefix="phone" settings={settings} setSettings={setSettings} />
                <DesignSettingRow title="Email Address" fieldPrefix="email" settings={settings} setSettings={setSettings} />
                <DesignSettingRow title="Address Style" fieldPrefix="address" settings={settings} setSettings={setSettings} />
              </div>
            )}

            {settingsTab === "business" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 15px 0" }}>Pricing Rules</h4>
                  <label className="select-label">Today's Silver Rate (₹ per gram)</label>
                  <Input type="number" value={settings.silver_rate_per_gram} onChange={(e) => setSettings({ ...settings, silver_rate_per_gram: e.target.value })} style={{ marginBottom: "10px" }} />
                  
                  <label className="select-label">Default Making Charge (₹ per gram)</label>
                  <Input type="number" value={settings.making_charge_per_gram} onChange={(e) => setSettings({ ...settings, making_charge_per_gram: e.target.value })} style={{ marginBottom: "10px" }} />
                  
                  <label className="select-label">Flat MC for Items Below 5g (₹)</label>
                  <Input type="number" value={settings.flat_mc_below_5g} onChange={(e) => setSettings({ ...settings, flat_mc_below_5g: e.target.value })} style={{ marginBottom: "10px" }} />
                  
                  <label className="select-label">Default HSN Code</label>
                  <Input value={settings.default_hsn} onChange={(e) => setSettings({ ...settings, default_hsn: e.target.value })} />
                </div>

                {/* NEW: Loyalty Points System Settings */}
                <div style={{ padding: "15px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px solid #bbf7d0" }}>
                  <h4 style={{ margin: "0 0 15px 0", color: "#16a34a" }}>Loyalty Points System</h4>
                  <label className="select-label">Points Earned Per 1 Gram</label>
                  <Input type="number" value={settings.loyalty_points_per_gram !== undefined ? settings.loyalty_points_per_gram : 1} onChange={(e) => setSettings({ ...settings, loyalty_points_per_gram: e.target.value })} style={{ marginBottom: "10px" }} />
                  
                  <label className="select-label">Rupees (₹) Discount Per 1 Point</label>
                  <Input type="number" value={settings.loyalty_point_value_rs !== undefined ? settings.loyalty_point_value_rs : 1} onChange={(e) => setSettings({ ...settings, loyalty_point_value_rs: e.target.value })} style={{ marginBottom: "10px" }} />
                </div>

                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 15px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    Branch Management
                    <Button size="sm" onClick={addBranch} style={{ backgroundColor: "#0f172a" }}>+ Add Branch</Button>
                  </h4>
                  
                  {(settings.branches || []).map((branch, index) => (
                    <div key={branch.id} style={{ marginBottom: "20px", padding: "15px", border: "1px dashed #cbd5e1", borderRadius: "8px", backgroundColor: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <strong>Branch {index + 1}</strong>
                        <Button size="sm" variant="outline" onClick={() => removeBranch(index)} style={{ borderColor: "#ef4444", color: "#ef4444" }}>Remove</Button>
                      </div>
                      <label className="select-label">Branch Name</label>
                      <Input value={branch.name} onChange={(e) => updateBranch(index, 'name', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      <label className="select-label">Branch Address</label>
                      <Input value={branch.address} onChange={(e) => updateBranch(index, 'address', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      {/* UPDATE: Added specific location URL */}
                      <label className="select-label">Google Maps Location URL (For Address Click)</label>
                      <Input value={branch.location_url || ""} onChange={(e) => updateBranch(index, 'location_url', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      {/* UPDATE: Clarified Review URL label */}
                      <label className="select-label">Google Maps Feedback/Review URL (For ⭐ Button)</label>
                      <Input value={branch.map_url} onChange={(e) => updateBranch(index, 'map_url', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      <label className="select-label">GSTIN Number (Optional)</label>
                      <Input value={branch.gstin || ""} onChange={(e) => updateBranch(index, 'gstin', e.target.value)} placeholder="Leave blank if no GST" style={{ marginBottom: "10px" }} />
                      
                      <div style={{ display: "flex", gap: "10px", marginTop: "5px" }}>
                         <div style={{ flex: 1 }}>
                           <label className="select-label">Invoice UPI ID</label>
                           <Input value={branch.invoice_upi_id} onChange={(e) => updateBranch(index, 'invoice_upi_id', e.target.value)} placeholder="name@bank" />
                         </div>
                         <div style={{ flex: 1 }}>
                           <label className="select-label">Estimate UPI ID</label>
                           <Input value={branch.estimate_upi_id} onChange={(e) => updateBranch(index, 'estimate_upi_id', e.target.value)} placeholder="name@bank" />
                         </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {settingsTab === "advanced" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ padding: "15px", backgroundColor: "#fef2f2", borderRadius: "8px", border: "1px solid #fecaca" }}>
                  <h4 style={{ color: "#991b1b", margin: "0 0 10px 0" }}>Danger Zone</h4>
                  <Button onClick={() => handleResetCounter("estimate")} style={{ width: "100%", marginBottom: "10px", backgroundColor: "#b91c1c", color: "white" }}>Reset Estimate Counter</Button>
                  <Button onClick={() => handleResetCounter("invoice")} style={{ width: "100%", marginBottom: "10px", backgroundColor: "#b91c1c", color: "white" }}>Reset Invoice Counter</Button>
                  <Button onClick={handleDeleteAllBills} style={{ width: "100%", backgroundColor: "#7f1d1d", color: "white" }}>WIPE ALL BILLS</Button>
                </div>
                
                <div style={{ padding: "15px", backgroundColor: "#f0fdfa", borderRadius: "8px", border: "1px solid #ccfbf1" }}>
                  <h4 style={{ color: "#0f766e", margin: "0 0 10px 0" }}>Data Backup & Storage</h4>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px", fontSize: "0.85rem", color: "#0f766e" }}>
                     <span>Storage Used: {(storageStats.used_bytes / 1024 / 1024).toFixed(2)} MB</span>
                     <span>Limit: {(storageStats.quota_bytes / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", backgroundColor: "#ccfbf1", borderRadius: "4px", marginBottom: "15px", overflow: "hidden" }}>
                     <div style={{ height: "100%", width: `${storageStats.percentage}%`, backgroundColor: storageStats.percentage > 80 ? "#ef4444" : "#14b8a6" }}></div>
                  </div>
                  <Button onClick={handleBackupBills} style={{ width: "100%", backgroundColor: "#0f766e", color: "white" }}><Download size={16} style={{ marginRight: "8px" }} /> Download JSON Backup</Button>
                </div>

                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
                  <h4 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "0 0 15px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}><Keyboard size={18} /> Keyboard Shortcuts</div>
                    <Button size="sm" onClick={addShortcut} style={{ backgroundColor: "#0f172a" }}><Plus size={16} style={{ marginRight: "5px" }} /> Add Shortcut</Button>
                  </h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {(settings.shortcuts || defaultSettings.shortcuts).map((sc, index) => (
                      <div key={sc.id} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                         <Input value={sc.keys} onChange={(e) => updateShortcut(index, 'keys', e.target.value)} placeholder="Keys (e.g. Alt+S)" style={{ width: "130px", fontWeight: "bold" }} />
                         <Input value={sc.action} onChange={(e) => updateShortcut(index, 'action', e.target.value)} placeholder="Action / Description" disabled={sc.isSystem} />
                         {!sc.isSystem && <Button size="sm" variant="outline" onClick={() => removeShortcut(index)} style={{ borderColor: "#ef4444", color: "#ef4444", padding: "0 8px" }}>X</Button>}
                      </div>
                    ))}
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "10px" }}>Note: System actions are locked, but you can safely change their key combinations. Add custom entries as a quick reference guide for your staff.</p>
                </div>
              </div>
            )}

            <Button onClick={saveSettings} style={{ width: "100%", marginTop: "20px", backgroundColor: "#0f172a", padding: "15px", fontSize: "1.1rem" }}>Save All Settings</Button>
          </div>
        </section>
      )}

    </div>
  );
}
