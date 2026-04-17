import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Store, Upload, Download, Keyboard, Cpu, Wifi, CheckCircle2, BarChart3 } from "lucide-react"; // Added BarChart3 for Analytics
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
    { id: "print_bill", action: "Print Bill", keys: "alt + b", isSystem: true },
    { id: "iot_qr", action: "Send QR to ESP32", keys: "alt + q", isSystem: true } // Added Shortcut
  ],
  branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", location_url: "", map_url: "", whatsapp_url: "", instagram_url: "", about_url: "", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", location_url: "", map_url: "", whatsapp_url: "", instagram_url: "", about_url: "", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }
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
  if (p.length === 3 && p[0].length === 2) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
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

const FooterLinksAndQRs = ({ branch, allBranches }) => {
  if (!branch) return null;
  return (
    <div style={{ marginTop: "25px", borderTop: "1px dashed #e2e8f0", paddingTop: "20px" }}>
      <div className="no-print" data-html2canvas-ignore="true">
        <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "10px", fontWeight: "bold", textAlign: "center" }}>Connect & Review:</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '15px' }}>
          {branch.whatsapp_url && (<a href={branch.whatsapp_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 120px', padding: "10px", backgroundColor: "#25D366", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px" }}>💬 WhatsApp</a>)}
          {branch.instagram_url && (<a href={branch.instagram_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 120px', padding: "10px", background: "linear-gradient(45deg, #f09433 0%, #dc2743 50%, #bc1888 100%)", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px" }}>📸 Instagram</a>)}
          {branch.map_url && (<a href={branch.map_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 120px', padding: "10px", backgroundColor: "#facc15", color: "#854d0e", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px" }}>⭐ Feedback</a>)}
          {branch.about_url && (<a href={branch.about_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 120px', padding: "10px", backgroundColor: "#3b82f6", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px" }}>ℹ️ About Us</a>)}
        </div>
        
        <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "10px", fontWeight: "bold", textAlign: "center" }}>Visit Our Branches:</p>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
          {(allBranches || []).map(b => b.location_url && (
            <a key={b.id} href={b.location_url} target="_blank" rel="noopener noreferrer" style={{ flex: '1 1 120px', padding: "10px", backgroundColor: "#0f172a", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px" }}>📍 {b.name}</a>
          ))}
        </div>
      </div>
      
      <div className="print-only" style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {branch.whatsapp_url && (<div style={{ textAlign: 'center' }}><img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.whatsapp_url)}&size=100`} alt="WA QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} /><p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>WhatsApp</p></div>)}
        {branch.instagram_url && (<div style={{ textAlign: 'center' }}><img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.instagram_url)}&size=100`} alt="Insta QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} /><p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>Instagram</p></div>)}
        {branch.map_url && (<div style={{ textAlign: 'center' }}><img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.map_url)}&size=100`} alt="Feedback QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} /><p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>Feedback</p></div>)}
        {branch.about_url && (<div style={{ textAlign: 'center' }}><img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.about_url)}&size=100`} alt="About QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} /><p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>About Us</p></div>)}
        {(allBranches || []).map(b => b.location_url && (
            <div key={`qr-${b.id}`} style={{ textAlign: 'center' }}><img src={`https://quickchart.io/qr?text=${encodeURIComponent(b.location_url)}&size=100`} alt={`${b.name} QR`} crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} /><p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>{b.name}</p></div>
        ))}
      </div>
    </div>
  );
};

const BillTable = ({ mode, items }) => (
  <table className="bill-table" style={{ width: "100%", tableLayout: "fixed", wordWrap: "break-word" }}>
    <thead>
      {mode === "invoice" ? (
        <tr><th style={{ width: "8%" }}>Sl. No.</th><th style={{ width: "38%" }}>DESCRIPTION</th><th style={{ width: "10%" }}>HSN</th><th style={{ width: "14%", whiteSpace: "nowrap" }}>WEIGHT (g)</th><th style={{ width: "15%", whiteSpace: "nowrap" }}>RATE Rs.</th><th style={{ width: "15%", whiteSpace: "nowrap" }}>AMOUNT</th></tr>
      ) : (
        <tr><th style={{ width: "8%" }}>Sl. No.</th><th style={{ width: "40%" }}>Particulars</th><th style={{ width: "14%", whiteSpace: "nowrap" }}>Weight</th><th style={{ width: "18%", whiteSpace: "nowrap" }}>Qty x Rate</th><th style={{ width: "12%", whiteSpace: "nowrap" }}>Rs.</th><th style={{ width: "8%", whiteSpace: "nowrap" }}>Ps.</th></tr>
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

const GLOBAL_PRINT_CSS = `
.print-only { position: absolute !important; width: 1px !important; height: 1px !important; opacity: 0.01 !important; overflow: hidden !important; pointer-events: none !important; }
@media print {
  .print-only { position: static !important; width: 100% !important; height: auto !important; opacity: 1 !important; visibility: visible !important; overflow: visible !important; display: flex !important; }
  .no-print { display: none !important; }
}
`;

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
  const [isAdminView, setIsAdminView] = useState(false);
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

  // --- NEW IOT & MQTT STATE ---
  const [iotOnline, setIotOnline] = useState(false);
  const [isMqttSending, setIsMqttSending] = useState(false);

  // --- NEW SALES ANALYTICS & SPELL CHECKER STATE ---
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsFilter, setAnalyticsFilter] = useState("THIS_MONTH");
  const [spellCheckResults, setSpellCheckResults] = useState({});
  const [activeSpellRow, setActiveSpellRow] = useState(null);
  const [activeSuggestionRow, setActiveSuggestionRow] = useState(null);
  
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const activeGlobalBranch = (settings.branches || []).find(b => b.id === globalBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];
  const activeBillBranch = (settings.branches || []).find(b => b.id === billBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];
  // --- NEW IOT HEARTBEAT MONITOR ---
  useEffect(() => {
    if (!token || isPublicView) return;
    const checkIot = async () => {
      try {
        const res = await axios.get(`${API}/cloud/mqtt/status`, { headers: authHeaders });
        setIotOnline(res.data.online);
      } catch (e) { setIotOnline(false); }
    };
    checkIot();
    const interval = setInterval(checkIot, 10000); // Check every 10 seconds
    return () => clearInterval(interval);
  }, [token, isPublicView, authHeaders]);

  // --- NEW IOT COMMUNICATION FUNCTIONS ---
  const sendQrToDisplay = async (amount, upiId) => {
    if (!iotOnline) { toast.error("IoT Device is offline!"); return; }
    setIsMqttSending(true);
    try {
      await axios.post(`${API}/cloud/mqtt/publish`, {
        topic: "Jalaram/QR",
        message: JSON.stringify({ amount: String(Math.round(amount)), upi_id: upiId })
      }, { headers: authHeaders });
      toast.success("QR Code sent to shop display!");
    } catch (e) { toast.error("Failed to send QR to display."); }
    finally { setIsMqttSending(false); }
  };

  const sendSuccessToDisplay = async () => {
    try {
      await axios.post(`${API}/cloud/mqtt/publish`, {
        topic: "Jalaram/QR",
        message: "SUCCESS"
      }, { headers: authHeaders });
    } catch (e) { console.error("MQTT Success trigger failed"); }
  };

  // --- NEW FEATURE 1: INVENTORY MEMORY FOR AUTO-SUGGESTION ---
  const inventoryMemory = useMemo(() => {
    const memory = new Set();
    // Scan recent bills to build an inventory of previously billed items
    (recentBillsList || []).forEach(bill => {
      (bill.items || []).forEach(item => {
        if (item.description && item.description.trim() !== "") {
          memory.add(item.description.trim());
        }
      });
    });
    return Array.from(memory);
  }, [recentBillsList]);

  // --- NEW FEATURE 2: API SPELL CHECKER LOGIC ---
  useEffect(() => {
    const checkSpelling = async () => {
      const newResults = { ...spellCheckResults };
      let updated = false;

      for (const item of items) {
        if (!item.description || item.description.trim() === "") continue;
        
        const words = item.description.trim().split(/\s+/);
        const lastWord = words[words.length - 1]; 

        // Skip checking if it's mostly numbers (like "92.5")
        if (lastWord.match(/\d/)) continue;
        
        // Skip if already checked and valid
        if (newResults[item.id] && newResults[item.id].word === item.description && newResults[item.id].valid) continue;

        try {
          // Free Dictionary API call
          const res = await axios.get(`https://api.datamuse.com/words?sp=${lastWord}&max=4`);
          const suggestions = res.data.map(d => d.word);
          
          if (suggestions.length > 0 && suggestions[0].toLowerCase() !== lastWord.toLowerCase()) {
            newResults[item.id] = { word: item.description, valid: false, suggestions: suggestions, targetWord: lastWord };
            updated = true;
          } else {
            newResults[item.id] = { word: item.description, valid: true };
            updated = true;
          }
        } catch (e) {
          console.error("Spell check API failed", e);
        }
      }
      if (updated) setSpellCheckResults(newResults);
    };

    // Debounce timer: wait 800ms after typing stops before pinging the internet
    const debounceTimer = setTimeout(() => {
      if (items.some(i => i.description)) checkSpelling();
    }, 800);

    return () => clearTimeout(debounceTimer);
  }, [items]);

  const applySpellCorrection = (itemId, originalDesc, targetWord, correction) => {
    const regex = new RegExp(targetWord + '$', 'i');
    const newDesc = originalDesc.replace(regex, correction);
    updateItem(itemId, "description", newDesc);
    setSpellCheckResults(prev => ({ ...prev, [itemId]: { word: newDesc, valid: true } }));
    setActiveSpellRow(null);
  };

  useEffect(() => {
    if (settings.custom_fonts && settings.custom_fonts.length > 0) { settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl)); }
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
    const adminParam = params.get("admin");
    
    if (adminParam === "true") {
      setIsAdminView(true);
    }

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
      setShowSettings(false); setShowAbout(false); setShowRecentBills(false); setShowLedger(false); setShowFeedbackModal(false); setShowAnalytics(false);
    };
    window.addEventListener("keydown", handleEsc); return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout, showRecentBills, showLedger, showFeedbackModal, showAnalytics]);

  useEffect(() => {
    const handleGlobalKeyDown = (e) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInput = activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select';
      if (e.key === "Enter" && isInput && activeTag !== 'textarea') {
          e.preventDefault();
          const formElements = Array.from(document.querySelectorAll('input, select, textarea, button:not(:disabled)'));
          const index = formElements.indexOf(document.activeElement);
          if (index > -1 && index < formElements.length - 1) { formElements[index + 1].focus(); }
          return;
      }
      if (isInput && !e.ctrlKey && !e.metaKey && !e.altKey) return; 

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
          return (ctrlPressed === needsCtrl) && (shiftPressed === needsShift) && (altPressed === needsAlt) && (keyFromKey === keyPart || keyFromCode === keyPart);
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
      if (checkKey('iot_qr')) { e.preventDefault(); e.stopPropagation(); sendQrToDisplay(computed.grandTotal, mode === 'invoice' ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id); return; }
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
    if (showRecentBills || showAnalytics) { 
      if (token && !isPublicView) {
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
    }
  }, [showRecentBills, showAnalytics, token, isPublicView, billSearchQuery, recentBranchFilter, recentDateFilter, authHeaders]); 

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
                  clonedNode.style.display = "block"; clonedNode.style.transform = "none";
                  clonedNode.style.width = "800px"; clonedNode.style.minWidth = "800px"; clonedNode.style.maxWidth = "800px"; 
                  clonedNode.style.height = "max-content";
                  clonedNode.style.padding = "20px"; clonedNode.style.boxSizing = "border-box";
                  const noPrint = clonedDoc.querySelectorAll('.no-print'); noPrint.forEach(el => el.style.display = 'none');
                  const printOnly = clonedDoc.querySelectorAll('.print-only'); printOnly.forEach(el => { el.style.position = 'static'; el.style.width = '100%'; el.style.height = 'auto'; el.style.opacity = '1'; el.style.visibility = 'visible'; el.style.display = 'flex'; });
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
    } else { mergedShortcuts = defaultSettings.shortcuts; }

    const newSettings = { ...defaultSettings, ...dbData, logo_data_url: savedLogo || dbData.logo_data_url || "", custom_fonts: dbData.custom_fonts || localFonts, shortcuts: mergedShortcuts };
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
      const weight = num(item.weight); totalWeight += weight;
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

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0); const taxable = subtotal;
    const cgst = mode === "invoice" ? taxable * 0.015 : 0; const sgst = mode === "invoice" ? taxable * 0.015 : 0; const igst = 0;
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
    setRedeemedPoints(bill.redeemed_points ? String(bill.redeemed_points) : ""); setAppliedCredit(bill.applied_credit ? String(bill.applied_credit) : ""); setSavedCredit(bill.saved_credit ? String(bill.saved_credit) : ""); setBonusPoints(bill.bonus_points ? String(bill.bonus_points) : "");
    const loadedItems = (bill.items || []).map((item) => ({ id: `${Date.now()}-${Math.random()}`, description: item.description || "", hsn: item.hsn || "", weight: item.weight ? String(item.weight) : "", quantity: item.quantity ? String(item.quantity) : "1", mc_override: item.mc_override !== null && item.mc_override !== undefined ? String(item.mc_override) : "", rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "", amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "", }));
    setItems(loadedItems.length > 0 ? loadedItems : [createItem(settings.default_hsn)]); setIsDirty(false); setShowRecentBills(false); setShowLedger(false); setShowAnalytics(false); toast.success(`Loaded ${bill.document_number} for editing`); goToBillTop();
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${bill.document_number}?`)) return;
    try { await axios.delete(`${API}/bills/${bill.document_number}`, { headers: authHeaders }); setRecentBillsList((prev) => prev.filter((b) => b.document_number !== bill.document_number)); if (currentBillId === bill.id) await clearBill(mode, billBranchId); toast.success(`${bill.document_number} deleted successfully.`); await loadSettings(); } 
    catch { toast.error("Failed to delete the bill."); }
  };

  const handleQuickPaymentToggle = async (bill) => {
    if (bill.tx_type === "booking" || bill.tx_type === "service") { toast.info("Please open the bill and click Edit to manage Booking/Service balances."); return; }
    const newStatus = !bill.is_payment_done;
    try { 
      await axios.put(`${API}/bills/${bill.document_number}/toggle-payment`, { is_payment_done: newStatus }, { headers: authHeaders }); 
      toast.success(`Payment marked as ${newStatus ? 'DONE ✅' : 'PENDING ⏳'}`); 
      
      if (newStatus && iotOnline) {
        sendSuccessToDisplay();
      }

      if (currentBillId === bill.id) { setIsPaymentDone(newStatus); } 
      setRecentBillsList(prev => prev.map(b => b.document_number === bill.document_number ? { ...b, is_payment_done: newStatus } : b)); 
      await loadSettings(); 
    } 
    catch { toast.error("Failed to update payment status."); }
  };

  const handleResetCounter = async (resetMode) => {
    if (!window.confirm(`Are you SURE you want to restart the ${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} back to 0001?`)) return;
    try { await axios.post(`${API}/bills/reset-counter`, { mode: resetMode, branch_id: globalBranchId }, { headers: authHeaders }); toast.success(`${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} has been reset.`); if (mode === resetMode && billBranchId === globalBranchId) { await reserveNumber(mode, billBranchId); } } catch { toast.error(`Failed to reset the ${resetMode} counter.`); }
  };

  const handleBackupBills = async () => {
    try { toast.info("Preparing backup file..."); const res = await axios.get(`${API}/bills/export`, { headers: authHeaders }); const dataStr = JSON.stringify(res.data, null, 2); const blob = new Blob([dataStr], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `Jalaram_Bills_Backup_${today()}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); toast.success("Backup downloaded successfully!"); } catch { toast.error("Failed to download backup."); }
  };

  const handleDeleteAllBills = async () => {
    if (!window.confirm("🚨 WARNING! This will permanently delete ALL bills. Have you downloaded your backup first?")) return;
    if (window.prompt("Type 'DELETE' to confirm wiping all bills:") !== "DELETE") { toast.error("Deletion cancelled."); return; }
    try { await axios.delete(`${API}/bills/all`, { headers: authHeaders }); toast.success("All bills wiped. (Ledger balances remain intact)"); setRecentBillsList([]); const res = await axios.get(`${API}/system/storage`, { headers: authHeaders }); setStorageStats(res.data); } catch { toast.error("Failed to delete bills."); }
  };

  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    if (currentBillId) { try { const res = await axios.get(`${API}/bills/next-number?mode=${nextMode}&branch_id=${billBranchId}`, { headers: authHeaders }); setDocumentNumber(res.data.document_number); setMode(nextMode); markDirty(); toast.info(`Migrating to ${nextMode.toUpperCase()}`); } catch (err) { toast.error("Failed to fetch new number for migration."); } } 
    else { if (!checkIsBlank()) { if (!window.confirm("⚠️ You have unsaved changes! Switching modes will clear the screen. Continue?")) return; } setMode(nextMode); await clearBill(nextMode, billBranchId); }
  };

  const handleGlobalBranchChange = async (nextBranchId) => { setGlobalBranchId(nextBranchId); if (!currentBillId && checkIsBlank()) { setBillBranchId(nextBranchId); await reserveNumber(mode, nextBranchId); } };
  const updateBranch = (index, field, value) => { const updatedBranches = [...(settings.branches || [])]; updatedBranches[index] = { ...updatedBranches[index], [field]: value }; setSettings({ ...settings, branches: updatedBranches }); };
  const addBranch = () => { const newId = `B${Date.now()}`; const newBranch = { id: newId, name: `New Branch`, address: "", location_url: "", map_url: "", whatsapp_url: "", instagram_url: "", about_url: "", invoice_upi_id: "", estimate_upi_id: "", gstin: "", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }; setSettings({ ...settings, branches: [...(settings.branches || []), newBranch] }); };
  const removeBranch = (index) => { if ((settings.branches || []).length <= 1) { toast.error("You must have at least one branch."); return; } if (!window.confirm("Remove this branch from settings?")) return; const updatedBranches = (settings.branches || []).filter((_, i) => i !== index); setSettings({ ...settings, branches: updatedBranches }); };
  const addShortcut = () => { const newSc = { id: `custom_${Date.now()}`, action: "", keys: "", isSystem: false }; setSettings(prev => ({ ...prev, shortcuts: [...(prev.shortcuts || defaultSettings.shortcuts), newSc] })); };
  const updateShortcut = (index, field, value) => { const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; list[index] = { ...list[index], [field]: value }; setSettings(prev => ({ ...prev, shortcuts: list })); };
  const removeShortcut = (index) => { const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; list.splice(index, 1); setSettings(prev => ({ ...prev, shortcuts: list })); };
  const handleLogin = async (event) => { event.preventDefault(); setLoggingIn(true); try { const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 }); localStorage.setItem("jj_auth_token", response.data.access_token); setToken(response.data.access_token); setPasscode(""); toast.success("Logged in successfully"); } catch (error) { if (error?.response?.status === 401) { toast.error("Wrong passcode."); } else { toast.error("Server is waking up. Please wait 15-20 seconds and try again."); } } finally { setLoggingIn(false); } };
  const handleLogout = () => { localStorage.removeItem("jj_auth_token"); setToken(""); setGatewayPassed(false); setSettingsLoaded(false); };
  const optimizeImageDataUrl = async (file) => { const reader = new FileReader(); const original = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; }); const ratio = Math.min(420 / image.width, 420 / image.height, 1); const targetWidth = Math.round(image.width * ratio); const targetHeight = Math.round(image.height * ratio); const canvas = document.createElement("canvas"); canvas.width = targetWidth; canvas.height = targetHeight; const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, targetWidth, targetHeight); return canvas.toDataURL("image/png", 0.92); };
  const handleLogoUpload = async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const dataUrl = await optimizeImageDataUrl(file); localStorage.setItem("jj_logo_data_url", dataUrl); setSettings((prev) => ({ ...prev, logo_data_url: dataUrl })); setLogoUploadName(file.name); toast.success("Logo uploaded successfully."); } catch { toast.error("Logo upload failed."); } };
  const saveSettings = async () => { try { await axios.put(`${API}/settings`, settings, { headers: authHeaders }); toast.success("Settings saved."); } catch { toast.error("Could not save settings."); } };
  const submitLedgerLog = async () => { if (!logAmount || isNaN(logAmount) || num(logAmount) <= 0) { toast.error("Please enter a valid amount."); return; } if (!logReason.trim()) { toast.error("Please enter a reason/remark."); return; } setSubmittingLog(true); try { const payload = { branch_id: globalBranchId, reason: logReason, cash_change: 0, estimate_bank_change: 0, invoice_bank_change: 0 }; const amt = num(logAmount); const keyMap = { "cash": "cash_change", "estimate_bank": "estimate_bank_change", "invoice_bank": "invoice_bank_change" }; if (logType === "expense") payload[keyMap[logSourceVault]] = -amt; else if (logType === "add") payload[keyMap[logSourceVault]] = amt; else if (logType === "exchange") { if (logSourceVault === logTargetVault) { toast.error("Cannot exchange into the same vault."); setSubmittingLog(false); return; } payload[keyMap[logSourceVault]] = -amt; payload[keyMap[logTargetVault]] = amt; } await axios.post(`${API}/settings/ledger/adjust`, payload, { headers: authHeaders }); toast.success("Transaction logged successfully!"); setShowLogForm(false); setLogAmount(""); setLogReason(""); await loadSettings(); await fetchLedgerHistory(); } catch (error) { toast.error("Ledger update failed."); } finally { setSubmittingLog(false); } };
  const saveBalances = async () => { try { const payload = { branch_id: globalBranchId, cash_balance: num(manualCash), estimate_bank_balance: num(manualEstBank), invoice_bank_balance: num(manualInvBank) }; await axios.put(`${API}/settings/balances`, payload, { headers: authHeaders }); setSettings(prev => { const updatedBranches = (prev.branches || []).map(b => b.id === globalBranchId ? { ...b, ...payload } : b); return { ...prev, branches: updatedBranches }; }); setEditingBalances(false); toast.success(`Ledger balances for ${activeGlobalBranch.name} manually updated!`); } catch { toast.error("Failed to update balances."); } };
  const saveBill = async () => {
    if (txType === "sale" && !paymentMethod) { toast.error("Please select a payment method."); return; }
    
    // 🐛 FIXED TYPO HERE: Changed tx_type back to txType
    if ((txType === "booking" || txType === "service")) { 
      if (isAdvancePaid && !advanceMethod) { toast.error("Please select a method for the Advance payment."); return; } 
      if (isBalancePaid && !balanceMethod) { toast.error("Please select a method for the Balance payment."); return; } 
    }

    setSavingBill(true);
    try {
      const payload = {
        mode, branch_id: billBranchId, document_number: documentNumber, date: billDate, customer_name: customer.name, customer_phone: customer.phone, customer_address: customer.address, customer_email: customer.email,
        tx_type: txType, payment_method: paymentMethod, is_payment_done: isPaymentDone, split_cash: num(splitCash), split_upi: Math.max(0, computed.grandTotal - num(splitCash)),
        advance_amount: num(advanceAmount), advance_method: advanceMethod, advance_split_cash: num(advanceSplitCash), is_advance_paid: isAdvancePaid,
        balance_method: balanceMethod, balance_split_cash: num(balanceSplitCash), is_balance_paid: isBalancePaid,
        discount: num(discount), exchange: num(exchange), round_off: manualRoundOff === "" ? null : num(manualRoundOff), notes,
        
        redeemed_points: num(redeemedPoints), earned_points: computed.earnedPoints, applied_credit: computed.appliedCredit, saved_credit: computed.savedCredit, bonus_points: computed.bonusPoints,

        items: computed.items.map((item) => ({ description: item.description, hsn: item.hsn, weight: num(item.weight), quantity: num(item.quantity), mc_override: item.mc_override === "" ? null : num(item.mc_override), rate_override: item.rate_override === "" ? null : num(item.rate_override), amount_override: item.amount_override === "" ? null : num(item.amount_override), rate: item.rate, amount: item.amount, sl_no: item.slNo })),
        totals: { grand_total: computed.grandTotal, subtotal: computed.subtotal }
      };

      if (currentBillId) { 
        await axios.put(`${API}/bills/update-by-id/${currentBillId}`, payload, { headers: authHeaders }); 
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} updated & migrated successfully.`); 
        setIsDirty(false); 
        setEditingDocNumber(documentNumber); 
      } else { 
        const res = await axios.post(`${API}/bills/save`, payload, { headers: authHeaders }); 
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} saved successfully.`); 
        setIsDirty(false); 
        setCurrentBillId(res.data.id); 
        setEditingDocNumber(res.data.document_number); 
        setDocumentNumber(res.data.document_number); 
      }
      
      // --- IOT TRIGGER ---
      if (isPaymentDone && iotOnline) {
        sendSuccessToDisplay();
      }
      // -----------------------

      await loadSettings(); 
      await fetchLedgerHistory();
    } catch (error) { 
      toast.error("Failed to save bill."); 
    } finally { 
      setSavingBill(false); 
    }
  };
     
  const downloadPdf = async (elementId, filename) => { 
    toast.info("Preparing PDF..."); const node = document.getElementById(elementId); if (!node) return; 
    try { 
      const canvas = await html2canvas(node, { 
        scale: 2, useCORS: true, allowTaint: true, backgroundColor: "#ffffff", windowWidth: 1024, 
        onclone: (clonedDoc) => { 
          const clonedNode = clonedDoc.getElementById(elementId); 
          if (clonedNode) { 
            clonedNode.style.transform = "none"; clonedNode.style.width = "800px"; clonedNode.style.maxWidth = "800px"; clonedNode.style.minWidth = "800px"; 
            clonedNode.style.position = "relative"; clonedNode.style.top = "auto"; clonedNode.style.left = "auto"; 
            clonedNode.style.margin = "0"; clonedNode.style.padding = "20px"; clonedNode.style.height = "max-content"; clonedNode.style.boxSizing = "border-box"; 
            const noPrint = clonedNode.querySelectorAll('.no-print'); noPrint.forEach(el => el.style.display = 'none');
            const printOnly = clonedNode.querySelectorAll('.print-only'); printOnly.forEach(el => { el.style.position = 'static'; el.style.width = '100%'; el.style.height = 'auto'; el.style.opacity = '1'; el.style.visibility = 'visible'; el.style.display = 'flex'; });
          } 
        } 
      }); 
      const imageData = canvas.toDataURL("image/png", 1.0); const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" }); const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = (canvas.height * pageWidth) / canvas.width; pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight); pdf.save(`${filename}.pdf`); toast.success("PDF Downloaded Successfully"); 
    } catch (error) { toast.error("Failed to download PDF."); } 
  };
  
  const shareWhatsApp = () => { 
    const link = `${window.location.origin}/?view=${documentNumber}`; 
    const text = `*Hello* ${customer.name || "Customer"},\n Thank you for visiting Jalaram Jewellers\n\n Official ${mode === "invoice" ? "Invoice" : "Estimate"} Bill\n Here Is Your Bill No. ${documentNumber}\n Amount: ₹${money(computed.grandTotal)}.\n\n Here You can view and download it securely\n Link: ${link}\n\n *Stay Connected With us*\n WhatsApp Group\n Link (https://bit.ly/Jalaram-Group-WP)\n Instagram\n Link (https://bit.ly/Jalaram-IG)\n\n*We value Your Feedback*\n Dear ${customer.name || "Customer"}, Please Give us a minute to Rate our Behaviour and Service. Give us your Valuable Feedback so we can make your experience even better:\n ${activeBillBranch.map_url}\n\n   Thank you,\n${settings.shop_name} : The Silver Specialist\n\n  `; 
    let cleanedPhone = customer.phone.replace(/\D/g, ""); if (cleanedPhone.length === 10) cleanedPhone = `91${cleanedPhone}`; window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, "_blank"); 
  };
  
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
      if (txType === "sale") {
          if (isPaymentDone) return 0;
          if (paymentMethod === "UPI") return computed.grandTotal;
          if (paymentMethod === "Split") return Math.max(0, computed.grandTotal - num(splitCash));
          return 0;
      }
      if (txType === "booking" || txType === "service") {
          if (!isAdvancePaid) {
              if (advanceMethod === "UPI") return num(advanceAmount);
              if (advanceMethod === "Split") return Math.max(0, num(advanceAmount) - num(advanceSplitCash));
              return 0;
          }
          if (!isBalancePaid) {
              const bal = Math.max(0, computed.grandTotal - num(advanceAmount));
              if (balanceMethod === "UPI") return bal;
              if (balanceMethod === "Split") return Math.max(0, bal - num(balanceSplitCash));
              return 0;
          }
      }
      return 0;
  };
  const upiAmountToPay = getUpiAmount(); const showDashboardUpi = upiAmountToPay > 0;
  const upiId = mode === "invoice" ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmountToPay)}&cu=INR&tn=Bill_${documentNumber || "Draft"}`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  if (isPublicView) {
    if (publicLoading) return <div className="loading-screen">Loading your bill...</div>;
    if (publicBill === "NOT_FOUND" || !publicBill) return <div className="loading-screen">Bill not found or has been deleted.</div>;

    const isSale = publicBill.tx_type === "sale" || !publicBill.tx_type;
    const isPaid = isSale ? (publicBill.is_payment_done === true || publicBill.is_payment_done === 1 || String(publicBill.is_payment_done).toLowerCase() === "true") : (publicBill.is_balance_paid === true || publicBill.is_balance_paid === 1 || String(publicBill.is_balance_paid).toLowerCase() === "true");
    const pbBranch = (publicSettings?.branches || []).find(b => b.id === publicBill.branch_id) || (publicSettings?.branches || [])[0] || defaultSettings.branches[0];

    let publicUpiAmountToPay = 0;
    if (!isPaid) {
      if (isSale) {
         if (publicBill.payment_method === "UPI") publicUpiAmountToPay = publicComputed.grandTotal;
         else if (publicBill.payment_method === "Split") publicUpiAmountToPay = Math.max(0, publicComputed.grandTotal - num(publicBill.split_cash));
      } else {
         if (!publicBill.is_advance_paid) {
            if (publicBill.advance_method === "UPI") publicUpiAmountToPay = num(publicBill.advance_amount) || publicComputed.grandTotal;
            else if (publicBill.advance_method === "Split") publicUpiAmountToPay = Math.max(0, num(publicBill.advance_amount) - num(publicBill.advance_split_cash));
         } else if (!publicBill.is_balance_paid) {
            const bal = Math.max(0, publicComputed.grandTotal - num(publicBill.advance_amount));
            if (publicBill.balance_method === "UPI") publicUpiAmountToPay = bal;
            else if (publicBill.balance_method === "Split") publicUpiAmountToPay = Math.max(0, bal - num(publicBill.balance_split_cash));
         }
      }
    }
    const publicUpiId = publicBill.mode === "invoice" ? pbBranch.invoice_upi_id : pbBranch.estimate_upi_id;
    const publicUpiUri = `upi://pay?pa=${publicUpiId}&pn=${encodeURIComponent(publicSettings?.shop_name || "Shop")}&am=${money(publicUpiAmountToPay)}&cu=INR&tn=Bill_${publicBill.document_number}`;
    const publicDynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(publicUpiUri)}&size=220`;

    return (
      <div className="billing-app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', minHeight: '100dvh', height: 'max-content', backgroundColor: '#f1f5f9', overflowX: 'hidden', paddingBottom: '40px' }}>
        <Toaster position="bottom-right" />
        <style>{GLOBAL_PRINT_CSS}</style>
        {showFeedbackModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div style={{ backgroundColor: "white", padding: "30px", borderRadius: "16px", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px", color: "#0f172a" }}>Leave a Review!</h3>
              <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "20px" }}>Which branch did you visit today?</p>
              {(publicSettings?.branches || []).map(b => (
                <a key={b.id} href={b.map_url && b.map_url !== "#" ? b.map_url : "#"} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "14px", backgroundColor: b.map_url && b.map_url !== "#" ? "#facc15" : "#e2e8f0", color: b.map_url && b.map_url !== "#" ? "#854d0e" : "#475569", textDecoration: "none", borderRadius: "10px", marginBottom: "12px", fontWeight: "bold", fontSize: "1.1rem" }}>⭐ {b.name}</a>
              ))}
              <Button variant="ghost" onClick={() => setShowFeedbackModal(false)} style={{ width: "100%", color: "#64748b", marginTop: "10px" }}>Cancel</Button>
            </div>
          </div>
        )}
        <div className="no-print" style={{ marginBottom: '20px', display: 'flex', gap: '15px' }}>
          <Button onClick={() => downloadPdf("public-bill-root", publicBill.document_number)}>Download PDF</Button>
          <Button variant="outline" onClick={() => window.print()}>Print Bill</Button>
        </div>

        <section id="public-bill-root" className="bill-sheet" style={{ "--print-scale-factor": 1, position: 'relative', zIndex: 1 }}>
          {isPaid && <div className="watermark-done">FULLY PAID</div>}

          <div className="bill-header">
            <div className="logo-area">
              {publicSettings?.logo_data_url ? <img src={publicSettings.logo_data_url} alt="Shop Logo" className="shop-logo" crossOrigin="anonymous" /> : <div className="shop-logo-fallback">JJ</div>}
              <div style={{ width: "100%", textAlign: publicSettings?.shop_name_align || "center" }}>
                <h2 className="sheet-shop-title" style={{ fontFamily: publicSettings?.shop_name_font || "sans-serif", color: publicSettings?.shop_name_color || "#000", fontSize: `${publicSettings?.shop_name_size}px`, margin: 0 }}>{publicSettings?.shop_name}</h2>
              </div>
              <div style={{ width: "100%", textAlign: publicSettings?.tagline_align || "center" }}>
                <p className="sheet-tagline" style={{ fontFamily: publicSettings?.tagline_font || "sans-serif", color: publicSettings?.tagline_color || "#475569", fontSize: `${publicSettings?.tagline_size}px`, margin: "5px 0" }}>{publicSettings?.tagline}</p>
              </div>
            </div>

            <div className="contact-area">
              <div className="contact-address" style={{ fontFamily: publicSettings?.address_font || "sans-serif", display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', alignItems: publicSettings?.address_align === 'left' ? 'flex-start' : publicSettings?.address_align === 'right' ? 'flex-end' : 'center', textAlign: publicSettings?.address_align || "center" }}>
                  <a href={pbBranch.location_url && pbBranch.location_url !== "#" ? pbBranch.location_url : "#"} target="_blank" rel="noopener noreferrer" style={{ color: publicSettings?.address_color || "#475569", fontSize: `${publicSettings?.address_size || 14}px`, textDecoration: 'none' }}>{pbBranch.address}</a>
              </div>
              <div style={{ width: "100%", textAlign: publicSettings?.phone_align || "center", fontFamily: publicSettings?.phone_font || "sans-serif", fontSize: `${publicSettings?.phone_size || 13}px`, marginBottom: "4px" }}>
                {(publicSettings?.phone_numbers || []).join(" | ")}
              </div>
              <div style={{ width: "100%", textAlign: publicSettings?.email_align || "center", fontFamily: publicSettings?.email_font || "sans-serif", fontSize: `${publicSettings?.email_size || 13}px`, marginBottom: "4px" }}>
                <a href={`mailto:${publicSettings?.email}`} style={{ color: publicSettings?.email_color || "#475569", textDecoration: 'none' }}>{publicSettings?.email}</a>
              </div>
              {publicBill.mode === "invoice" && pbBranch.gstin && <p style={{ margin: "4px 0", textAlign: "center", fontWeight: "bold" }}>GSTIN: {pbBranch.gstin}</p>}
            </div>
          </div>

          <div className="sheet-banner">{publicBill.tx_type === "booking" ? "BOOKING RECEIPT" : publicBill.tx_type === "service" ? "SERVICE ORDER" : publicBill.mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}</div>

          <div className="meta-grid">
            <p><strong>{publicBill.mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {publicBill.document_number}</p>
            <p><strong>Date:</strong> {publicBill.date}</p>
          </div>

          <div className="customer-box">
            <p><strong>Name:</strong> {publicBill.customer_name || publicBill.customer?.name || "-"}</p>
            <p><strong>Address:</strong> {publicBill.customer_address || publicBill.customer?.address || "-"}</p>
            <p><strong>Phone:</strong> {publicBill.customer_phone || publicBill.customer?.phone || "-"}</p>
          </div>

          <BillTable mode={publicBill.mode} items={publicComputed.items} />

          <div className="sheet-bottom-stack">
            <div className="totals">
              <div className="totals-row"><span>{publicBill.mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span><strong>₹{money(publicComputed.taxable)}</strong></div>
              {publicBill.mode === "invoice" ? (
                <>
                  <div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(publicComputed.cgst)}</strong></div><div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(publicComputed.sgst)}</strong></div><div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(publicComputed.igst)}</strong></div>
                </>
              ) : (
                <><div className="totals-row"><span>DISCOUNT</span><strong>₹{money(publicComputed.discount)}</strong></div><div className="totals-row"><span>EXCHANGE</span><strong>₹{money(publicComputed.exchange)}</strong></div></>
              )}
              {num(publicComputed.redeemedPoints) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>POINTS REDEEMED ({publicComputed.redeemedPoints} pts)</span><strong style={{color:"#16a34a"}}>- ₹{money(publicComputed.redeemedValue)}</strong></div>}
              {num(publicComputed.appliedCredit) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>STORE CREDIT APPLIED</span><strong style={{color:"#16a34a"}}>- ₹{money(publicComputed.appliedCredit)}</strong></div>}
              <div className="totals-row"><span>MDR (Card 2%)</span><strong>₹{money(publicComputed.mdr)}</strong></div>
              <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(publicComputed.roundOff)}</strong></div>
              {num(publicComputed.savedCredit) > 0 && <div className="totals-row"><span>STORE CREDIT SAVED</span><strong>+ ₹{money(publicComputed.savedCredit)}</strong></div>}
              <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(publicComputed.grandTotal)}</strong></div>

              {isSale ? (
                <div className="totals-row" style={{ color: isPaid ? "#16a34a" : "#b45309", marginTop: "10px" }}>
                  <span>{isPaid ? "PAID VIA" : "PAYMENT STATUS"}</span>
                  <strong>{isPaid ? (publicBill.payment_method === "Split" ? `SPLIT (C:₹${money(publicBill.split_cash)}, U:₹${money(Math.max(0, publicComputed.grandTotal - num(publicBill.split_cash)))})` : (publicBill.payment_method || "CASH").toUpperCase()) : "PENDING"}</strong>
                </div>
              ) : (
                <>
                  <div className="totals-row" style={{ marginTop: "10px", color: publicBill.is_advance_paid ? "#16a34a" : "#b45309" }}>
                    <span>ADVANCE {publicBill.is_advance_paid ? "RECEIVED" : "PENDING"} {publicBill.advance_method ? `(${publicBill.advance_method === 'Split' ? `C:₹${money(publicBill.advance_split_cash)}, U:₹${money(Math.max(0, num(publicBill.advance_amount) - num(publicBill.advance_split_cash)))}` : publicBill.advance_method})` : ""}</span>
                    <strong>₹{money(publicBill.advance_amount)}</strong>
                  </div>
                  <div className="totals-row" style={{ color: publicBill.is_balance_paid ? "#16a34a" : "#dc2626" }}>
                    <span>BALANCE {publicBill.is_balance_paid ? "RECEIVED" : "DUE"} {publicBill.balance_method ? `(${publicBill.balance_method === 'Split' ? `C:₹${money(publicBill.balance_split_cash)}, U:₹${money(Math.max(0, (publicComputed.grandTotal - num(publicBill.advance_amount)) - num(publicBill.balance_split_cash)))}` : publicBill.balance_method})` : ""}</span>
                    <strong>₹{money(Math.max(0, publicComputed.grandTotal - num(publicBill.advance_amount)))}</strong>
                  </div>
                </>
              )}

              {!isPaid && publicUpiAmountToPay > 0 && (
                <div className="payment-qr-box" data-html2canvas-ignore="true" style={{ textAlign: "center", marginTop: "20px", padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px dashed #cbd5e1" }}>
                  <p className="scan-title" style={{ fontWeight: "bold", margin: "0 0 10px 0", color: "#0f172a", fontSize: "1.1rem" }}>Scan Here For Payment (₹{money(publicUpiAmountToPay)})</p>
                  <img src={publicDynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" style={{ width: "200px", height: "200px", margin: "0 auto", display: "block" }} crossOrigin="anonymous" />
                  <p className="upi-id" style={{ fontSize: "0.9rem", color: "#64748b", margin: "10px 0 0 0", fontWeight: "bold" }}>UPI: {publicUpiId}</p>
                </div>
              )}
            </div>

            {publicComputed.earnedPoints > 0 && (
              <div style={{ textAlign: "center", marginTop: "15px", padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px dashed #22c55e", color: "#166534", fontWeight: "bold", fontSize: "0.9rem" }}>
                🎉 You earned {publicComputed.earnedPoints} Loyalty Points on this bill!
              </div>
            )}

            <div className="declaration">
              {publicBill.mode === "invoice" ? (
                <><p className="section-title">DECLARATION</p><p>We declare that this bill shows the actual price of items and all details are correct.</p>
              <p className="section-title">POLICIES, T&C</p><ul className="policies-list"><li>6 Months of repair and polishing warranty only on silver ornaments.</li><li>You can replace purchased items within 7 days for manufacturing defects.</li></ul></>
              ) : (
                <><p className="section-title">POLICIES, T&C</p><ul className="policies-list"><li>6 Months of repair and polishing warranty only on silver ornaments.</li><li>You can replace purchased items within 7 days for manufacturing defects.</li></ul></>
              )}
            </div>
            
            <FooterLinksAndQRs branch={pbBranch} allBranches={publicSettings?.branches} />
          </div>
          <footer className="sheet-footer"><p>Authorised Signature</p><p>Thanking you.</p></footer>
        </section>
      </div>
    );
  }

  if (checkingSession) {
    return (
      <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>Loading billing dashboard...</div>
        {isWakingUp && (
          <div style={{ marginTop: '20px', textAlign: 'center', padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '320px' }}>
            <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#64748b' }}>The database server is currently waking up from sleep mode. This usually takes about <strong>30 to 60 seconds</strong>.</p>
            <Button variant="outline" onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444' }}>Force Quit & Clear Session</Button>
          </div>
        )}
      </div>
    );
  }

  if (!token) {
    if (!isAdminView && !isPublicView) {
      return (
        <div className="login-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', height: '100dvh', padding: '20px', textAlign: 'center' }}>
          <Store size={64} color="#0f172a" style={{ marginBottom: '20px' }} />
          <h1 style={{ color: '#0f172a', marginBottom: '10px' }}>Welcome to {settings?.shop_name || "Jalaram Jewellers"}</h1>
          <p style={{ color: '#475569', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6' }}>
            Please use the secure link provided in your WhatsApp or Email message to securely view your official bill.
          </p>
        </div>
      );
    }
// If they USED the secret parameter (/?admin=true), show the actual login form
    return (
      <div className="login-shell">
        <Toaster position="bottom-right" />
        <form className="login-card" onSubmit={handleLogin}>
          <h1 className="login-title">{settings?.shop_name || "Jalaram Jewellers"}</h1>
          <p className="login-subtitle">Enter passcode to access billing panel</p>
          <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Enter passcode" />
          <Button type="submit" disabled={loggingIn}>{loggingIn ? "Checking..." : "Login"}</Button>
        </form>
      </div>
    );
  }
  // --------------------------------

  if (token && settingsLoaded && !isPublicView && !gatewayPassed) {
     return (
        <div className="login-shell" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f1f5f9', height: '100vh' }}>
           <div className="login-card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', backgroundColor: 'white', padding: '30px', borderRadius: '12px', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}>
              <Store size={48} color="#0f172a" style={{ margin: '0 auto 15px auto' }} />
              <h2 style={{ marginBottom: '10px', color: '#0f172a' }}>Select Branch</h2>
              <p style={{ color: '#64748b', marginBottom: '25px', fontSize: '0.9rem' }}>Which branch are you working in today?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                 {(settings.branches || []).map(b => (
                    <Button key={b.id} onClick={() => { setGlobalBranchId(b.id); setBillBranchId(b.id); reserveNumber(mode, b.id); setGatewayPassed(true); }} style={{ padding: '15px', height: 'auto', fontSize: '1.1rem', backgroundColor: '#f8fafc', color: '#0f172a', border: '1px solid #cbd5e1', justifyContent: 'flex-start', textAlign: 'left' }} variant="outline">
                       📍 {b.name}
                    </Button>
                 ))}
              </div>
           </div>
        </div>
     );
  }
