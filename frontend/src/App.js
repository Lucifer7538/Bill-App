import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import Barcode from "react-barcode";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Store, Download, Keyboard, Cpu, LineChart, Package, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL ? BACKEND_URL.replace(/\/$/, '') : ""}/api`;
const STATIC_ABOUT_QR_URL = process.env.REACT_APP_ABOUT_QR_URL;

const createItem = (defaultHsn = "", desc = "", wt = "", mc = "", fixedAmt = "") => ({
  id: `${Date.now()}-${Math.random()}`, 
  description: desc, 
  hsn: defaultHsn, 
  weight: wt, 
  quantity: "1", 
  rate_override: "", 
  amount_override: fixedAmt, 
  mc_override: mc
});
const defaultSettings = {
  shop_name: "Jalaram Jewellers", 
  tagline: "The Silver Specialist", 
  phone_numbers: ["+91 9583221115", "+91 9776177296", "+91 7538977527"], 
  email: "jalaramjewellers26@gmail.com",
  shop_name_color: "#000000", 
  shop_name_size: 26, 
  shop_name_font: "sans-serif", 
  shop_name_align: "center",
  tagline_color: "#475569", 
  tagline_size: 12, 
  tagline_font: "sans-serif", 
  tagline_align: "center",
  address_color: "#475569", 
  address_size: 14, 
  address_font: "sans-serif", 
  address_align: "center",
  phone_color: "#475569", 
  phone_size: 13, 
  phone_font: "sans-serif", 
  phone_align: "center",
  email_color: "#475569", 
  email_size: 13, 
  email_font: "sans-serif", 
  email_align: "center",
  silver_rate_per_gram: 240, 
  making_charge_per_gram: 15, 
  flat_mc_below_5g: 150, 
  default_hsn: "7113",
  loyalty_points_per_gram: 1, 
  loyalty_point_value_rs: 1,
  cgst_percent: 1.5,
  sgst_percent: 1.5,
  igst_percent: 0,
  mdr_debit: 0.9,
  mdr_credit: 1.5,
  mdr_gst: 18,
  admin_email: "jalaramjewellers26@gmail.com",
  formula_note: "Line total = Weight x (Silver rate per gram + Making charge per gram)", 
  show_branches_on_invoice: true,
  logo_data_url: "", 
  about_qr_data_url: STATIC_ABOUT_QR_URL, 
  custom_fonts: [],
  master_items: [], 
  inventory: [], 
  inventory_logs: [], 
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
    { id: "iot_qr", action: "Send QR to ESP32", keys: "alt + q", isSystem: true } 
  ],
 branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", location_url: "", map_url: "", whatsapp_url: "", instagram_url: "", about_url: "", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0, invoice_phone: "" },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", location_url: "", map_url: "", whatsapp_url: "", instagram_url: "", about_url: "", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", gstin: "21AAUFJ1925F1ZH", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0, invoice_phone: "" }
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

const num = (val) => { 
    if (val === null || val === undefined || val === "") return 0; 
    const parsed = Number.parseFloat(val); 
    return Number.isFinite(parsed) ? parsed : 0; 
};

const money = (val) => num(val).toFixed(2);

const clampPrintScale = (value) => Math.min(102, Math.max(98, value));

const getInitialPrintScale = () => { 
    const saved = Number(localStorage.getItem("jj_print_scale") || "100"); 
    return Number.isFinite(saved) ? clampPrintScale(saved) : 100; 
};

// --- NUMBER TO WORDS CONVERTER (INDIAN FORMAT) ---
const numberToWords = (num) => {
  const validNum = Number(num);
  if (validNum === 0 || isNaN(validNum)) return "Zero Rupees Only";
  
  const isNegative = validNum < 0;
  const absNum = Math.abs(validNum);

  const a = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const convertWhole = (n) => {
      if (n < 20) return a[n];
      if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
      if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " and " + convertWhole(n % 100) : "");
      if (n < 100000) return convertWhole(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convertWhole(n % 1000) : "");
      if (n < 10000000) return convertWhole(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + convertWhole(n % 100000) : "");
      return convertWhole(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + convertWhole(n % 10000000) : "");
  };

  const parts = String(absNum.toFixed(2)).split(".");
  const rupees = parseInt(parts[0], 10);
  const paise = parseInt(parts[1], 10);

  let res = convertWhole(rupees).trim() + " Rupees";
  if (paise > 0) {
      res += " and " + convertWhole(paise).trim() + " Paise";
  }
  return (isNegative ? "Minus " : "") + res + " Only";
};
// -------------------------------------------------

const splitAmount = (amt) => { 
    const validAmt = Number.isFinite(amt) ? amt : 0; 
    const rupees = Math.floor(validAmt); 
    const paise = Math.round((validAmt - rupees) * 100).toString().padStart(2, "0"); 
    return { rupees, paise }; 
};

const registerFont = (name, dataUrl) => { 
    const styleId = `custom-font-${name.replace(/\s+/g, '-').toLowerCase()}`; 
    if (document.getElementById(styleId)) return; 
    const style = document.createElement('style'); 
    style.id = styleId; 
    style.innerHTML = `@font-face { font-family: '${name}'; src: url('${dataUrl}'); }`; 
    document.head.appendChild(style); 
};


const FontSelectOptions = ({ customFonts }) => (
  <>
    <option value="sans-serif">Sans-serif</option>
    <option value="Arial, Helvetica, sans-serif">Arial</option>
    <option value="'Times New Roman', Times, serif">Times New Roman</option>
    <option value="'Courier New', Courier, monospace">Courier New</option>
    <option value="Georgia, serif">Georgia</option>
    <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
    <option value="'Brush Script MT', cursive">Brush Script MT (Cursive)</option>
    {customFonts?.map(f => (<option key={f.name} value={`'${f.name}'`}>{f.name} (Custom)</option>))}
  </>
);

const FooterLinksAndQRs = ({ branch, allBranches, mode, settings }) => {
  if (!branch) return null;
  
  // Show on Estimates always. Hide on Invoices if the toggle is turned off.
  const showFooterDetails = mode === "estimate" || settings?.show_branches_on_invoice !== false;

  if (!showFooterDetails) return null;

  return (
    <div style={{ marginTop: "25px", borderTop: "1px dashed #e2e8f0", paddingTop: "20px" }}>
      
      {/* ON-SCREEN BUTTONS */}
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
      
      {/* PRINTED QR CODES */}
      <div className="print-only" style={{ display: 'flex', justifyContent: 'center', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {branch.whatsapp_url && (
            <div style={{ textAlign: 'center' }}>
                <img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.whatsapp_url)}&size=100`} alt="WA QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} />
                <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>WhatsApp</p>
            </div>
        )}
        {branch.instagram_url && (
            <div style={{ textAlign: 'center' }}>
                <img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.instagram_url)}&size=100`} alt="Insta QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} />
                <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>Instagram</p>
            </div>
        )}
        {branch.map_url && (
            <div style={{ textAlign: 'center' }}>
                <img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.map_url)}&size=100`} alt="Feedback QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} />
                <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>Feedback</p>
            </div>
        )}
        {branch.about_url && (
            <div style={{ textAlign: 'center' }}>
                <img src={`https://quickchart.io/qr?text=${encodeURIComponent(branch.about_url)}&size=100`} alt="About QR" crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} />
                <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>About Us</p>
            </div>
        )}
        {(allBranches || []).map(b => b.location_url && (
            <div key={`qr-${b.id}`} style={{ textAlign: 'center' }}>
                <img src={`https://quickchart.io/qr?text=${encodeURIComponent(b.location_url)}&size=100`} alt={`${b.name} QR`} crossOrigin="anonymous" style={{ width: '70px', height: '70px', display: 'block', margin: '0 auto' }} />
                <p style={{ fontSize: '0.7rem', margin: '4px 0 0 0', fontWeight: 'bold' }}>{b.name}</p>
            </div>
        ))}
      </div>
      
    </div>
  );
};

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
            <>
                <td>{item.sl_no || item.slNo}</td>
                <td>{item.description || "-"}</td>
                <td>{item.hsn || "-"}</td>
                <td>{money(item.weight)}</td>
                <td>{money(item.rate)}</td>
                <td>{item.rupees}.{item.paise}</td>
            </>
          ) : (
            <>
                <td>{item.sl_no || item.slNo}</td>
                <td>{item.description || "-"}</td>
                <td>{money(item.weight)}</td>
                <td>{money(item.quantity)} x {money(item.rate)}</td>
                <td>{item.rupees}</td>
                <td>{item.paise}</td>
            </>
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
      <Input 
        value={Array.isArray(settings[fieldPrefix]) ? settings[fieldPrefix].join(", ") : settings[fieldPrefix] || ""} 
        onChange={(e) => setSettings((prev) => ({ ...prev, [fieldPrefix]: fieldPrefix === 'phone_numbers' ? e.target.value.split(",").map(i=>i.trim()).filter(Boolean) : e.target.value }))} 
        placeholder={title} 
        style={{ marginBottom: "10px", width: "100%", boxSizing: "border-box" }} 
      />
    )}
    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", width: "100%" }}>
      <input 
        type="color" 
        value={settings[`${fieldPrefix}_color`] || "#000000"} 
        onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_color`]: e.target.value }))} 
        style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px", flexShrink: 0 }} 
        title="Color" 
      />
      <Input 
        type="number" 
        min="8" 
        max="60" 
        value={settings[`${fieldPrefix}_size`] || 14} 
        onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_size`]: Number(e.target.value) }))} 
        style={{ width: "70px", padding: "0 5px", textAlign: "center", flexShrink: 0 }} 
        title="Font Size (px)" 
      />
      <select 
        value={settings[`${fieldPrefix}_font`] || "sans-serif"} 
        onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_font`]: e.target.value }))} 
        style={{ flex: "1 1 120px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px", minWidth: "120px" }} 
        title="Font Style"
      >
        <FontSelectOptions customFonts={settings.custom_fonts || []} />
      </select>
      <select 
        value={settings[`${fieldPrefix}_align`] || "center"} 
        onChange={(e) => setSettings((prev) => ({ ...prev, [`${fieldPrefix}_align`]: e.target.value }))} 
        style={{ flex: "1 1 80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px", minWidth: "80px" }} 
        title="Alignment"
      >
        <option value="left">Left</option>
        <option value="center">Center</option>
        <option value="right">Right</option>
      </select>
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
  const [printType, setPrintType] = useState("bill");

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
  const [isVerifyStep, setIsVerifyStep] = useState(false);
  const [loginOtpCode, setLoginOtpCode] = useState("");
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem("jj_auth_token") || "");
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem("jj_auth_token")));
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [showForgotPwd, setShowForgotPwd] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [resettingPwd, setResettingPwd] = useState(false);

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

  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", email: "", gstin: "", points: 0, credit: 0 });
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
  // --- NEW SYSTEM STATES ---
  const [showBroadcastPanel, setShowBroadcastPanel] = useState(false);
  const [broadcastMode, setBroadcastMode] = useState("web");
  const [barcodeQueue, setBarcodeQueue] = useState([]);
  const [bcInputName, setBcInputName] = useState("");
  const [bcInputWeight, setBcInputWeight] = useState("");
  const [bcSuggestFocus, setBcSuggestFocus] = useState(false);
  const [activePrintGroup, setActivePrintGroup] = useState("");
  const [printWithPrice, setPrintWithPrice] = useState(false);
  const [settingsTab, setSettingsTab] = useState("design"); 
  const [showAbout, setShowAbout] = useState(false);
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsFilter, setAnalyticsFilter] = useState("THIS_MONTH");
  const [showInventory, setShowInventory] = useState(false);
  const [showInvLogs, setShowInvLogs] = useState(false);
  const [invItemName, setInvItemName] = useState("");
  const [invWeight, setInvWeight] = useState("");
  const [invQuantity, setInvQuantity] = useState("");
  const [invUnit, setInvUnit] = useState("g");
  
  const [descFocusId, setDescFocusId] = useState(null);
  const [spellCheckOpenId, setSpellCheckOpenId] = useState(null);
  const [spellSuggestions, setSpellSuggestions] = useState({});

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

  const [iotOnline, setIotOnline] = useState(false);
  const [isMqttSending, setIsMqttSending] = useState(false);
  
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]);
  const activeGlobalBranch = (settings.branches || []).find(b => b.id === globalBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];
  const activeBillBranch = (settings.branches || []).find(b => b.id === billBranchId) || (settings.branches || [])[0] || defaultSettings.branches[0];

  // --- BARCODE SCANNER BRAIN ---
  useEffect(() => {
    if (!settings.enable_barcode_system) return;
    let barcodeBuffer = "";
    let lastKeyTime = Date.now();
    
    const handleScanner = (e) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;

      const currentTime = Date.now();
      if (currentTime - lastKeyTime > 40) barcodeBuffer = "";
      lastKeyTime = currentTime;

      if (e.key === "Enter" && barcodeBuffer.length > 3) {
        e.preventDefault();
        
        // --- FIX: Safely split only at the very last hyphen ---
        const lastDash = barcodeBuffer.lastIndexOf("-");
        if (lastDash !== -1) {
          const scName = barcodeBuffer.substring(0, lastDash);
          let scWt = barcodeBuffer.substring(lastDash + 1);
          
          // Clear the weight box if it's a fixed amount item
          if (scWt.toLowerCase() === "fixed") scWt = ""; 
          
          if (scName) {
            const masterMatch = (settings.master_items || []).find(mi => mi.name.toLowerCase() === scName.toLowerCase());
            setItems(prev => {
              const last = prev[prev.length - 1];
              const mcVal = masterMatch?.mc ? String(masterMatch.mc) : "";
              const amtVal = masterMatch?.fixed_amount ? String(masterMatch.fixed_amount) : "";
              
              if (!last.description && !last.weight) {
                 const narr = [...prev]; 
                 narr[narr.length - 1] = { ...last, description: scName, weight: scWt, mc_override: mcVal, amount_override: amtVal };
                 return narr;
              }
              return [...prev, createItem(settings.default_hsn, scName, scWt, mcVal, amtVal)];
            });
            toast.success(`Scanned: ${scName}`);
          }
        }
        barcodeBuffer = "";
      } else if (e.key.length === 1) barcodeBuffer += e.key;
    };

    window.addEventListener('keydown', handleScanner, true);
    return () => window.removeEventListener('keydown', handleScanner, true);
  }, [settings.enable_barcode_system, settings.master_items, settings.default_hsn]);
  
  // --- NEW: HYBRID INTERNET SPELL CHECKER ENGINE ---
  useEffect(() => {
    const timers = {};
    const jewelryTypos = { 
        "breclate": "Bracelet", 
        "braclet": "Bracelet", 
        "bracelete": "Bracelet", 
        "breslate": "Bracelet", 
        "braslet": "Bracelet", 
        "necklas": "Necklace", 
        "neckles": "Necklace", 
        "neclace": "Necklace", 
        "anklit": "Anklet", 
        "earings": "Earrings", 
        "pendantt": "Pendant", 
        "ringg": "Ring" 
    };

    items.forEach(item => {
      const desc = (item.description || "").trim();
      if (desc.length < 3) {
          setSpellSuggestions(prev => { 
              if(prev[item.id]) { 
                  const next = {...prev}; 
                  delete next[item.id]; 
                  return next; 
              } 
              return prev; 
          });
          return;
      }

      const words = desc.split(/\s+/).filter(Boolean);
      if (words.length === 0) return;
      const lastWord = words[words.length - 1].toLowerCase();

      if ((settings.master_items || []).some(mi => mi.name.toLowerCase().includes(lastWord))) {
         setSpellSuggestions(prev => { 
             if(prev[item.id]) { 
                 const next = {...prev}; 
                 delete next[item.id]; 
                 return next; 
             } 
             return prev; 
         });
         return;
      }

      if (jewelryTypos[lastWord]) {
         setSpellSuggestions(prev => ({...prev, [item.id]: jewelryTypos[lastWord]}));
         return;
      }

      timers[item.id] = setTimeout(async () => {
        try {
           if(lastWord.length > 2) {
               const res = await axios.get(`https://api.datamuse.com/sug?s=${lastWord}`);
               if (res.data && res.data.length > 0) {
                   const best = res.data[0].word;
                   if (best.toLowerCase() !== lastWord) {
                       setSpellSuggestions(prev => ({...prev, [item.id]: best.charAt(0).toUpperCase() + best.slice(1)}));
                   } else {
                       setSpellSuggestions(prev => { 
                           const next = {...prev}; 
                           delete next[item.id]; 
                           return next; 
                       });
                   }
               }
           }
        } catch(e) {}
      }, 600); 
    });

    return () => Object.values(timers).forEach(clearTimeout);
  }, [items, settings.master_items]);
  // ------------------------------------------------

  useEffect(() => {
    if (!token || isPublicView) return;
    const checkIot = async () => {
      try {
        const res = await axios.get(`${API}/cloud/mqtt/status`, { headers: authHeaders });
        setIotOnline(res.data.online);
      } catch (e) { 
        setIotOnline(false); 
      }
    };
    checkIot();
    const interval = setInterval(checkIot, 10000); 
    return () => clearInterval(interval);
  }, [token, isPublicView, authHeaders]);

  const sendQrToDisplay = async (amount, upiId) => {
    if (!iotOnline) { 
        toast.error("IoT Device is offline!"); 
        return; 
    }
    setIsMqttSending(true);
    try {
      await axios.post(`${API}/cloud/mqtt/publish`, {
        topic: "Jalaram/QR",
        message: JSON.stringify({ amount: String(Math.round(amount)), upi_id: upiId })
      }, { headers: authHeaders });
      toast.success("QR Code sent to shop display!");
    } catch (e) { 
        toast.error("Failed to send QR to display."); 
    } finally { 
        setIsMqttSending(false); 
    }
  };

  const sendSuccessToDisplay = async () => {
    try {
      await axios.post(`${API}/cloud/mqtt/publish`, {
        topic: "Jalaram/QR",
        message: "SUCCESS"
      }, { headers: authHeaders });
    } catch (e) { 
        console.error("MQTT Success trigger failed"); 
    }
  };

  useEffect(() => {
    if (settings.custom_fonts && settings.custom_fonts.length > 0) { 
        settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl)); 
    }
  }, [settings.custom_fonts]);

  const handleFontUpload = async (event) => {
    const file = event.target.files?.[0]; 
    if (!file) return;
    const fontName = file.name.split('.')[0];
    try {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result; 
        const newFont = { name: fontName, dataUrl };
        const updatedFonts = [...(settings.custom_fonts || []), newFont];
        setSettings(prev => ({ ...prev, custom_fonts: updatedFonts }));
        localStorage.setItem("jj_custom_fonts", JSON.stringify(updatedFonts));
        registerFont(fontName, dataUrl); 
        toast.success(`Font "${fontName}" uploaded!`);
      };
      reader.readAsDataURL(file);
    } catch { 
        toast.error("Font upload failed."); 
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewDoc = params.get("view");
    const adminParam = params.get("admin");
    
    if (adminParam === "true") {
      setIsAdminView(true);
    }

    if (viewDoc) {
      setIsPublicView(true); 
      setPublicLoading(true);
      
      const fetchPublicBill = async () => {
        try {
          const res = await axios.get(`${API}/bills/public/id/${viewDoc}`);
          setPublicBill(res.data.bill);
          const sData = { ...defaultSettings, ...res.data.settings };
          if (!sData.branches) sData.branches = defaultSettings.branches;
          if (sData.custom_fonts) sData.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
          setPublicSettings(sData);
        } catch (err) { 
            setPublicBill("NOT_FOUND"); 
        } finally { 
            setPublicLoading(false); 
        }
      };
      
      fetchPublicBill();
    }
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      setShowSettings(false); 
      setShowAbout(false); 
      setShowRecentBills(false); 
      setShowLedger(false); 
      setShowFeedbackModal(false);
      setShowAnalytics(false); 
      setShowInventory(false); 
      setSpellCheckOpenId(null);
    };
    window.addEventListener("keydown", handleEsc); 
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout, showRecentBills, showLedger, showFeedbackModal, showAnalytics, showInventory]);

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
      if (checkKey('print_bill')) { e.preventDefault(); e.stopPropagation(); setPrintType("bill"); setTimeout(() => window.print(), 100); return; }
      if (checkKey('iot_qr')) { e.preventDefault(); e.stopPropagation(); sendQrToDisplay(computed.grandTotal, mode === 'invoice' ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id); return; }
    };
    window.addEventListener('keydown', handleGlobalKeyDown, true);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown, true);
  }); 

  useEffect(() => { 
      localStorage.setItem("jj_print_scale", String(clampPrintScale(printScale))); 
  }, [printScale]);
  
  useEffect(() => {
    if (isPublicView) return; 
    const verify = async () => {
      if (!token) { 
          setCheckingSession(false); 
          return; 
      }
      const slowServerTimeout = setTimeout(() => setIsWakingUp(true), 3000);
      try { 
          await axios.get(`${API}/auth/verify`, { headers: authHeaders }); 
      } catch { 
          localStorage.removeItem("jj_auth_token"); 
          setToken(""); 
      } finally { 
          clearTimeout(slowServerTimeout); 
          setCheckingSession(false); 
          setIsWakingUp(false); 
      }
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
        } catch { 
            toast.error("Failed to load recent bills."); 
        } finally { 
            setLoadingRecent(false); 
        }
      };
      const timer = setTimeout(fetchRecent, 300); 
      return () => clearTimeout(timer);
    }
  }, [showRecentBills, token, isPublicView, billSearchQuery, recentBranchFilter, recentDateFilter, authHeaders]); 

  useEffect(() => {
    if (showAnalytics && token && !isPublicView) {
      const fetchAllForAnalytics = async () => {
        try {
          const response = await axios.get(`${API}/bills/recent?limit=1000&branch_filter=ALL&search=`, { headers: authHeaders });
          setRecentBillsList(response.data);
        } catch { 
            console.error("Failed to load analytics data."); 
        }
      };
      fetchAllForAnalytics();
    }
  }, [showAnalytics, token, isPublicView, authHeaders]);

  const filteredRecentBills = useMemo(() => {
    return (recentBillsList || []).filter(bill => {
      // --- NEW: INSTANT FRONTEND SEARCH FILTER ---
      if (billSearchQuery && billSearchQuery.trim() !== "") {
          const query = billSearchQuery.toLowerCase().trim();
          const docNum = (bill.document_number || "").toLowerCase();
          const custName = (bill.customer_name || bill.customer?.name || "").toLowerCase();
          const custPhone = (bill.customer_phone || bill.customer?.phone || "").toLowerCase();
          
          if (!docNum.includes(query) && !custName.includes(query) && !custPhone.includes(query)) {
              return false; // Skip this bill if it doesn't match the typed search
          }
      }
      // -------------------------------------------

      if (recentModeFilter !== "ALL" && bill.mode !== recentModeFilter) return false;
      
      if (recentDateFilter === "THIS_MONTH") {
        const billDateObj = parseBillDate(bill.date);
        const now = new Date();
        if (billDateObj.getMonth() !== now.getMonth() || billDateObj.getFullYear() !== now.getFullYear()) return false;
      } else if (recentDateFilter === "LAST_MONTH") {
        const billDateObj = parseBillDate(bill.date);
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        if (billDateObj.getMonth() !== lastMonth.getMonth() || billDateObj.getFullYear() !== lastMonth.getFullYear()) return false;
      } else if (recentDateFilter === "CUSTOM") {
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
  // NOTE: billSearchQuery has been added to the dependency array below so it triggers instantly!
  }, [recentBillsList, recentModeFilter, recentDateFilter, customStartDate, customEndDate, billSearchQuery]);

  const handleBulkDownload = async () => {
    if ((filteredRecentBills || []).length === 0) { 
        toast.error("No bills to download!"); 
        return; 
    }
    if ((filteredRecentBills || []).length > 20) { 
        if (!window.confirm(`Generate PDF with ${filteredRecentBills.length} pages? This might take a minute.`)) return; 
    }
    
    setIsBulkDownloading(true); 
    toast.info(`Generating PDF for ${filteredRecentBills.length} bills...`);
    await new Promise(resolve => setTimeout(resolve, 800));
    
    try {
      let pdf = null;
      const pdfWidth = 210;
      
      for (let i = 0; i < filteredRecentBills.length; i++) {
        const bill = filteredRecentBills[i];
        const node = document.getElementById(`bulk-bill-${bill.document_number}`);
        if (!node) continue;
        
        const canvas = await html2canvas(node, { 
          scale: 2, 
          useCORS: true, 
          allowTaint: true, 
          backgroundColor: "#ffffff", 
          windowWidth: 1024,
          onclone: (clonedDoc) => {
            const clonedNode = clonedDoc.getElementById(`bulk-bill-${bill.document_number}`);
            if (clonedNode) {
              clonedNode.style.display = "block"; 
              clonedNode.style.transform = "none";
              clonedNode.style.width = "800px"; 
              clonedNode.style.minWidth = "800px"; 
              clonedNode.style.maxWidth = "800px"; 
              clonedNode.style.height = "max-content";
              clonedNode.style.overflow = "visible"; // Prevents internal clipping
              clonedNode.style.padding = "20px"; 
              clonedNode.style.boxSizing = "border-box";
              
              const noPrint = clonedDoc.querySelectorAll('.no-print'); 
              noPrint.forEach(el => el.style.display = 'none');
              
              const printOnly = clonedDoc.querySelectorAll('.print-only'); 
              printOnly.forEach(el => { 
                  el.style.position = 'static'; 
                  el.style.width = '100%'; 
                  el.style.height = 'auto'; 
                  el.style.opacity = '1'; 
                  el.style.visibility = 'visible'; 
                  el.style.display = 'flex'; 
              });
            }
          }
        });
        
        const imgData = canvas.toDataURL("image/png", 1.0);
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        // FIX: Dynamically size each page based on the length of that specific bill
        const pageFormat = [pdfWidth, Math.max(297, pdfHeight)];
        
        if (!pdf) {
          pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: pageFormat });
        } else {
          pdf.addPage(pageFormat);
        }
        
        pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      }
      
      if(pdf) pdf.save(`Jalaram_Bills_Export_${today()}.pdf`); 
      toast.success("Bulk PDF Downloaded!");
    } catch (error) { 
        toast.error("Error generating bulk PDF."); 
    } finally { 
        setIsBulkDownloading(false); 
    }
  };

  const fetchLedgerHistory = async () => {
    try { 
        const res = await axios.get(`${API}/settings/ledger/logs?branch_id=${globalBranchId}`, { headers: authHeaders }); 
        setLedgerLogs(res.data); 
    } catch { 
        toast.error("Failed to load ledger history."); 
    }
  };

  useEffect(() => {
    if (showLedger && token && !isPublicView) {
      const fetchLedger = async () => {
        setLedgerLoading(true);
        try { 
            await loadSettings(); 
            const res = await axios.get(`${API}/bills/today?date=${today()}&branch_id=${globalBranchId}`, { headers: authHeaders }); 
            setTodayBills(res.data); 
            await fetchLedgerHistory(); 
        } catch { 
            toast.error("Failed to load today's ledger."); 
        } finally { 
            setLedgerLoading(false); 
        }
      };
      fetchLedger();
    }
  }, [showLedger, token, isPublicView, globalBranchId, authHeaders]);

  useEffect(() => {
    if (showSettings && token && !isPublicView) {
      const fetchStorageStats = async () => { 
          try { 
              const res = await axios.get(`${API}/system/storage`, { headers: authHeaders }); 
              setStorageStats(res.data); 
          } catch { 
              console.error("Failed to load storage stats"); 
          } 
      };
      fetchStorageStats();
    }
  }, [showSettings, token, isPublicView, authHeaders]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    let dbData = response.data || {};
    
    if (!dbData.branches) dbData.branches = defaultSettings.branches;
    if (!dbData.master_items) dbData.master_items = [];
    if (!dbData.inventory) dbData.inventory = [];
    if (!dbData.inventory_logs) dbData.inventory_logs = [];
    
    let localFonts = []; 
    const localFontsRaw = localStorage.getItem("jj_custom_fonts"); 
    if (localFontsRaw) { 
        try { 
            localFonts = JSON.parse(localFontsRaw); 
        } catch (e) {} 
    }

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
        custom_fonts: dbData.custom_fonts || localFonts, 
        shortcuts: mergedShortcuts 
    };
    
    setSettings(newSettings);
    
    if (!(newSettings.branches || []).find(b => b.id === globalBranchId)) { 
        setGlobalBranchId((newSettings.branches || [])[0].id); 
        setBillBranchId((newSettings.branches || [])[0].id); 
    }
    
    setItems((prev) => { 
        if (prev.length === 1 && !prev[0].description && !prev[0].weight && !prev[0].hsn) {
            // --- NEW: apply default description on app startup if mode is invoice ---
            const defaultDesc = mode === "invoice" ? "Silver Ornaments" : "";
            return [{ ...prev[0], hsn: newSettings.default_hsn, description: defaultDesc }]; 
        }
        return prev; 
    });
    
    setSettingsLoaded(true);
  };

  const reserveNumber = async (activeMode, activeBranch) => {
    setIsNumberLoading(true);
    try { 
        // We added `t: Date.now()` to explicitly block the browser from caching the old number!
        const response = await axios.get(`${API}/bills/next-number`, { 
            headers: authHeaders, 
            params: { mode: activeMode, branch_id: activeBranch, t: Date.now() } 
        }); 
        setDocumentNumber(response.data.document_number || ""); 
    } catch (err) {
        console.error("Failed to fetch the next bill number", err);
        toast.error("Network error: Could not fetch next bill number.");
    } finally { 
        setIsNumberLoading(false); 
    }
  };

  const fetchCloudStatus = async () => {
    try { 
        const response = await axios.get(`${API}/cloud/status`, { headers: authHeaders }); 
        setCloudStatus(response.data); 
    } catch { 
        setCloudStatus({ provider: "supabase", enabled: false, mode: "status-unavailable" }); 
    }
  };

 useEffect(() => {
    if (isPublicView) return;
    const bootstrap = async () => { 
        if (!token) return; 
        try { 
            await loadSettings(); 
            await fetchCloudStatus(); 
            
            // THIS IS THE NEW LINE YOU NEED:
            reserveNumber("invoice", "B1"); 
            
        } catch { 
            toast.error("Could not load billing settings."); 
        } 
    };
    bootstrap();
  }, [token, isPublicView]);

  useEffect(() => {
    if (!token || isPublicView) return;
    const interval = setInterval(() => { fetchCloudStatus(); }, 30000); 
    return () => clearInterval(interval);
  }, [token, isPublicView]); 

  useEffect(() => {
    if (!token || isPublicView) return;
    const query = customer.phone.trim().length >= 2 ? customer.phone.trim() : customer.name.trim();
    if (query.length < 2) { 
        setSuggestions([]); 
        return; 
    }
    const timer = setTimeout(async () => {
      try { 
          const response = await axios.get(`${API}/customers/suggest`, { headers: authHeaders, params: { query } }); 
          setSuggestions(response.data || []); 
      } catch { 
          setSuggestions([]); 
      }
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
      if (item.mc_override !== "") { 
          mcAmount = weight * num(item.mc_override); 
      } else if (flatMCBelow5g > 0 && weight > 0 && weight < 5) { 
          mcAmount = flatMCBelow5g; 
      } else { 
          mcAmount = weight * baseMCPerGram; 
      }

      const totalItemCost = (weight * silverRate) + mcAmount;
      const formulaAmount = mode === "estimate" ? totalItemCost * quantity : totalItemCost;
      const amount = item.amount_override !== "" ? num(item.amount_override) : formulaAmount;
      const rateForPrint = weight > 0 ? (amount / (mode === "estimate" ? quantity : 1)) / weight : 0;
      const { rupees, paise } = splitAmount(amount);
      
      return { ...item, slNo: index + 1, rate: rateForPrint, quantity, amount, rupees, paise, weight };
    });

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0); 
    const taxable = subtotal;
    
   const cgstPct = num(settings.cgst_percent !== undefined ? settings.cgst_percent : 1.5);
    const sgstPct = num(settings.sgst_percent !== undefined ? settings.sgst_percent : 1.5);
    const igstPct = num(settings.igst_percent !== undefined ? settings.igst_percent : 0);

    const cgst = mode === "invoice" ? taxable * (cgstPct / 100) : 0; 
    const sgst = mode === "invoice" ? taxable * (sgstPct / 100) : 0; 
    const igst = mode === "invoice" ? taxable * (igstPct / 100) : 0;
    const gstApplied = mode === "invoice" ? cgst + sgst + igst : 0;
    
    const bonusPointsVal = num(bonusPoints);
    const earnedPoints = Math.floor(totalWeight * ptPerGram) + bonusPointsVal;
    
    const appliedRedeemedPoints = num(redeemedPoints);
    const appliedRedeemedValue = appliedRedeemedPoints * rsPerPt;
    const appliedCreditVal = num(appliedCredit);
    const savedCreditVal = num(savedCredit);

    const baseTotal = taxable + gstApplied - num(discount) - num(exchange) - appliedRedeemedValue - appliedCreditVal + savedCreditVal;
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = manualRoundOff === "" ? autoRound : num(manualRoundOff);
    const grandTotal = baseTotal + roundOff;
    
    return { 
        items: mapped, 
        baseSilverRate, 
        subtotal, 
        taxable, 
        cgst, 
        sgst, 
        igst, 
        roundOff, 
        grandTotal, 
        totalWeight, 
        earnedPoints, 
        redeemedPoints: appliedRedeemedPoints, 
        redeemedValue: appliedRedeemedValue, 
        appliedCredit: appliedCreditVal, 
        savedCredit: savedCreditVal, 
        bonusPoints: bonusPointsVal 
    };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff, redeemedPoints, appliedCredit, savedCredit, bonusPoints]);
 

  const updateItem = (id, key, value) => { 
      markDirty(); 
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))); 
  };
const checkIsBlank = () => { 
      return !(customer.name || "").trim() && 
             !(customer.phone || "").trim() && 
             !(customer.address || "").trim() && 
             !(items || []).some(i => (i.description || "").trim() || (i.weight || "").trim() || (i.amount_override || "").trim()) && 
             (!discount || discount === "0") && 
             (!exchange || exchange === "0") && 
             !paymentMethod && 
             !advanceMethod && 
             !advanceAmount && 
             !splitCash; 
  };
 
  const clearBill = async (nextMode = mode, nextBranch = billBranchId) => {
    setCurrentBillId(null); 
    setEditingDocNumber(null); 
    const defaultDesc = nextMode === "invoice" ? "Silver Ornaments" : "";
    setItems([createItem(settings.default_hsn, defaultDesc)]); 
    
    
    setItems([createItem(settings.default_hsn)]); 
    setCustomer({ name: "", phone: "", address: "", email: "", points: 0, credit: 0 });
    setSuggestions([]); 
    setDiscount("0"); 
    setExchange("0"); 
    setRedeemedPoints(""); 
    setAppliedCredit(""); 
    setSavedCredit(""); 
    setBonusPoints(""); 
    setManualRoundOff("");
    setTxType("sale"); 
    setPaymentMethod(""); 
    setSplitCash(""); 
    setIsPaymentDone(false); 
    setAdvanceAmount(""); 
    setAdvanceMethod(""); 
    setAdvanceSplitCash(""); 
    setIsAdvancePaid(false); 
    setBalanceMethod(""); 
    setBalanceSplitCash(""); 
    setIsBalancePaid(false); 
    setNotes("");
    setBillDate(today()); 
    setIsDirty(false); 
    await reserveNumber(nextMode, nextBranch); 
    
   // --- NEW LOGIC: USE THE RECYCLED NUMBER IF ONE EXISTS ---
    const recycleKey = `recycled_${nextMode}_${nextBranch}`;
    if (settings[recycleKey] && settings[recycleKey] !== null) {
        setDocumentNumber(settings[recycleKey]);
        // By explicitly setting it to null, we force the database to erase it!
        const newSettings = { ...settings, [recycleKey]: null };
        setSettings(newSettings);
        axios.put(`${API}/settings`, newSettings, { headers: authHeaders }).catch(console.error);
    }
    // --------------------------------------------------------
    goToBillTop();
  };

  const handleNewBillClick = async () => {
    if (currentBillId && isDirty) { 
        if (!window.confirm("⚠️ You have unsaved edits to this saved bill! Discard edits and start a new bill?")) return; 
    } else if (!currentBillId && !checkIsBlank()) { 
        if (!window.confirm("⚠️ You have entered data! Are you sure you want to discard it and start a blank new bill?")) return; 
    }
    await clearBill(mode, billBranchId);
  };

  const loadBillForEditing = (bill) => {
    setCurrentBillId(bill.id); 
    setEditingDocNumber(bill.document_number); 
    setMode(bill.mode); 
    setBillBranchId(bill.branch_id || (settings.branches || [])[0].id); 
    setDocumentNumber(bill.document_number); 
    setBillDate(bill.date || today());
    
    setCustomer({ 
        name: bill.customer_name || bill.customer?.name || "", 
        phone: bill.customer_phone || bill.customer?.phone || "", 
        address: bill.customer_address || bill.customer?.address || "", 
        email: bill.customer_email || bill.customer?.email || "", 
        points: bill.customer?.points || 0, 
        credit: bill.customer?.credit || 0 
    });
    
    setTxType(bill.tx_type || "sale"); 
    setPaymentMethod(bill.payment_method || ""); 
    setSplitCash(bill.split_cash !== null && bill.split_cash !== undefined ? String(bill.split_cash) : ""); 
    setIsPaymentDone(bill.is_payment_done || false); 
    
    setAdvanceAmount(bill.advance_amount ? String(bill.advance_amount) : ""); 
    setAdvanceMethod(bill.advance_method || ""); 
    setAdvanceSplitCash(bill.advance_split_cash ? String(bill.advance_split_cash) : ""); 
    setIsAdvancePaid(bill.is_advance_paid || false);
    
    setBalanceMethod(bill.balance_method || ""); 
    setBalanceSplitCash(bill.balance_split_cash ? String(bill.balance_split_cash) : ""); 
    setIsBalancePaid(bill.is_balance_paid || false);
    
    setNotes(bill.notes || ""); 
    setDiscount(bill.discount ? String(bill.discount) : (bill.totals?.discount ? String(bill.totals.discount) : "0")); 
    setExchange(bill.exchange ? String(bill.exchange) : (bill.totals?.exchange ? String(bill.totals.exchange) : "0")); 
    setManualRoundOff(bill.totals?.round_off !== null && bill.totals?.round_off !== undefined ? String(bill.totals.round_off) : "");
    
    setRedeemedPoints(bill.redeemed_points ? String(bill.redeemed_points) : ""); 
    setAppliedCredit(bill.applied_credit ? String(bill.applied_credit) : ""); 
    setSavedCredit(bill.saved_credit ? String(bill.saved_credit) : ""); 
    setBonusPoints(bill.bonus_points ? String(bill.bonus_points) : "");
    
    const loadedItems = (bill.items || []).map((item) => ({ 
        id: `${Date.now()}-${Math.random()}`, 
        description: item.description || "", 
        hsn: item.hsn || "", 
        weight: item.weight ? String(item.weight) : "", 
        quantity: item.quantity ? String(item.quantity) : "1", 
        mc_override: item.mc_override !== null && item.mc_override !== undefined ? String(item.mc_override) : "", 
        rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "", 
        amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "", 
    }));
    
    setItems(loadedItems.length > 0 ? loadedItems : [createItem(settings.default_hsn)]); 
    setIsDirty(false); 
    setShowRecentBills(false); 
    setShowLedger(false); 
    toast.success(`Loaded ${bill.document_number} for editing`); 
    goToBillTop();
  };

 const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to move ${bill.document_number} to the Recycle Bin?`)) return;
    try { 
        // --- NEW: Backup to Cloud Settings (Recycle Bin) BEFORE deleting ---
        const currentDeleted = settings.deleted_bills || [];
        const updatedDeleted = [{ ...bill, deleted_at: today() }, ...currentDeleted];
        const newSettings = { ...settings, deleted_bills: updatedDeleted };
        setSettings(newSettings);
        await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
        // -------------------------------------------------------------------

        await axios.delete(`${API}/bills/${bill.document_number}`, { headers: authHeaders }); 
        setRecentBillsList((prev) => prev.filter((b) => b.document_number !== bill.document_number));
 
        
        // --- FIXED RECYCLING LOGIC ---
        const sameModeBills = recentBillsList.filter(b => b.mode === bill.mode && b.branch_id === bill.branch_id);
        const getNum = (docStr) => parseInt((docStr || "").replace(/\D/g, '')) || 0;
        const deletedNum = getNum(bill.document_number);
        const isHighest = sameModeBills.every(b => getNum(b.document_number) <= deletedNum);

        let recycledNum = null;
        if (isHighest) recycledNum = bill.document_number;

        if (currentBillId === bill.id) { 
            await clearBill(mode, billBranchId); 
            // If we deleted the open bill, immediately apply the recycled number to the screen!
            if (recycledNum) setDocumentNumber(recycledNum);
        } else if (recycledNum) {
            // If we deleted from the drawer, save the recycled number to the cloud for the next blank bill
            const recycleKey = `recycled_${bill.mode}_${bill.branch_id}`;
            const newSettings = { ...settings, [recycleKey]: recycledNum };
            setSettings(newSettings);
            await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
        }
        // -----------------------------
        
        toast.success(`${bill.document_number} deleted successfully.`); 
        await loadSettings(); 
    } catch { 
        toast.error("Failed to delete the bill."); 
    }
  };

  const handleQuickPaymentToggle = async (bill) => {
    if (bill.tx_type === "booking" || bill.tx_type === "service") { 
        toast.info("Please open the bill and click Edit to manage Booking/Service balances."); 
        return; 
    }
    const newStatus = !bill.is_payment_done;
    try { 
      await axios.put(`${API}/bills/${bill.document_number}/toggle-payment`, { is_payment_done: newStatus }, { headers: authHeaders }); 
      toast.success(`Payment marked as ${newStatus ? 'DONE ✅' : 'PENDING ⏳'}`); 
      
      if (newStatus && iotOnline) { sendSuccessToDisplay(); }

      if (currentBillId === bill.id) { setIsPaymentDone(newStatus); } 
      setRecentBillsList(prev => prev.map(b => b.document_number === bill.document_number ? { ...b, is_payment_done: newStatus } : b)); 
      await loadSettings(); 
    } catch { 
        toast.error("Failed to update payment status."); 
    }
  };

  const handleResetCounter = async (resetMode) => {
    if (!window.confirm(`Are you SURE you want to restart the ${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} back to 0001?`)) return;
    try { 
        await axios.post(`${API}/bills/reset-counter`, { mode: resetMode, branch_id: globalBranchId }, { headers: authHeaders }); 
        toast.success(`${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} has been reset.`); 
        if (mode === resetMode && billBranchId === globalBranchId) { 
            await reserveNumber(mode, billBranchId); 
        } 
    } catch { 
        toast.error(`Failed to reset the ${resetMode} counter.`); 
    }
  };

  const handleBackupBills = async () => {
    try { 
        toast.info("Preparing backup file..."); 
        const res = await axios.get(`${API}/bills/export`, { headers: authHeaders }); 
        const dataStr = JSON.stringify(res.data, null, 2); 
        const blob = new Blob([dataStr], { type: "application/json" }); 
        const url = URL.createObjectURL(blob); 
        const link = document.createElement("a"); 
        link.href = url; 
        link.download = `Jalaram_Bills_Backup_${today()}.json`; 
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
        toast.success("Backup downloaded successfully!"); 
    } catch { 
        toast.error("Failed to download backup."); 
    }
  };

  const handleDeleteAllBills = async () => {
    if (!window.confirm("🚨 WARNING! This will permanently delete ALL bills. Have you downloaded your backup first?")) return;
    if (window.prompt("Type 'DELETE' to confirm wiping all bills:") !== "DELETE") { 
        toast.error("Deletion cancelled."); 
        return; 
    }
    try { 
        await axios.delete(`${API}/bills/all`, { headers: authHeaders }); 
        toast.success("All bills wiped. (Ledger balances remain intact)"); 
        setRecentBillsList([]); 
        const res = await axios.get(`${API}/system/storage`, { headers: authHeaders }); 
        setStorageStats(res.data); 
    } catch { 
        toast.error("Failed to delete bills."); 
    }
  };

  // --- NEW LOGIC: RESTORE & EDIT DELETED BILLS ---
  const handleRestoreDeletedBill = async (bill) => {
    if (!window.confirm(`Restore ${bill.document_number} exactly as it was?`)) return;
    try {
        const { deleted_at, ...billData } = bill; 
        await axios.post(`${API}/bills/save`, billData, { headers: authHeaders });
        const updatedDeleted = (settings.deleted_bills || []).filter(b => b.id !== bill.id);
        const newSettings = { ...settings, deleted_bills: updatedDeleted };
        setSettings(newSettings);
        await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
        const updatedBills = await axios.get(`${API}/bills/recent`, { headers: authHeaders });
        setRecentBillsList(updatedBills.data);
        toast.success(`${bill.document_number} restored to active bills!`);
    } catch (error) {
        toast.error("Restoration failed. Bill number might already be in use.");
    }
  };

 const handleEditFromBin = async (bill) => {
      // 1. Load the bill data into the dashboard form
      loadBillForEditing(bill);
      
      // 2. CRITICAL FIX: We null these out so the button changes 
      // from "Update & Migrate" to "Save Bill". 
      // This allows a fresh record to be created in your database.
      setCurrentBillId(null);
      setEditingDocNumber(null);
      
      // 3. Remove this bill from the Recycle Bin immediately
      const updatedDeleted = (settings.deleted_bills || []).filter(b => b.id !== bill.id);
      const newSettings = { ...settings, deleted_bills: updatedDeleted };
      setSettings(newSettings);
      await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
      
      // 4. Close the drawers so you can see the dashboard
      setShowRecycleBin(false);
      setShowRecentBills(false);
      
      toast.info("Bill loaded from Bin. Modify if needed, then click 'Save Bill' to restore.");
  };
  const handlePermanentWipe = async (id) => {
    if (!window.confirm("Permanently delete this backup? This cannot be undone.")) return;
    const updatedDeleted = (settings.deleted_bills || []).filter(b => b.id !== id);
    const newSettings = { ...settings, deleted_bills: updatedDeleted };
    setSettings(newSettings);
    await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
    toast.success("Bill purged from bin.");
  };

  // This is your existing line below:


  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    if (currentBillId) { 
        try { 
            const res = await axios.get(`${API}/bills/next-number?mode=${nextMode}&branch_id=${billBranchId}`, { headers: authHeaders }); 
            setDocumentNumber(res.data.document_number); 
            setMode(nextMode); 
            markDirty(); 
            toast.info(`Migrating to ${nextMode.toUpperCase()}`); 
        } catch (err) { 
            toast.error("Failed to fetch new number for migration."); 
        } 
    } else { 
        if (!checkIsBlank()) { 
            if (!window.confirm("⚠️ You have unsaved changes! Switching modes will clear the screen. Continue?")) return; 
        } 
        setMode(nextMode); 
        await clearBill(nextMode, billBranchId); 
    }
  };

  const handleGlobalBranchChange = async (nextBranchId) => { 
      setGlobalBranchId(nextBranchId); 
      if (!currentBillId && checkIsBlank()) { 
          setBillBranchId(nextBranchId); 
          await reserveNumber(mode, nextBranchId); 
      } 
  };

  const updateBranch = (index, field, value) => { 
      const updatedBranches = [...(settings.branches || [])]; 
      updatedBranches[index] = { ...updatedBranches[index], [field]: value }; 
      setSettings({ ...settings, branches: updatedBranches }); 
  };

  const addBranch = () => { 
      const newId = `B${Date.now()}`; 
      const newBranch = { 
          id: newId, 
          name: `New Branch`, 
          address: "", 
          location_url: "", 
          map_url: "", 
          whatsapp_url: "", 
          instagram_url: "", 
          about_url: "", 
          invoice_upi_id: "", 
          estimate_upi_id: "", 
          gstin: "", 
          cash_balance: 0, 
          estimate_bank_balance: 0, 
          invoice_bank_balance: 0 
      }; 
      setSettings({ ...settings, branches: [...(settings.branches || []), newBranch] }); 
  };

  const removeBranch = (index) => { 
      if ((settings.branches || []).length <= 1) { 
          toast.error("You must have at least one branch."); 
          return; 
      } 
      if (!window.confirm("Remove this branch from settings?")) return; 
      const updatedBranches = (settings.branches || []).filter((_, i) => i !== index); 
      setSettings({ ...settings, branches: updatedBranches }); 
  };

  const addShortcut = () => { 
      const newSc = { id: `custom_${Date.now()}`, action: "", keys: "", isSystem: false }; 
      setSettings(prev => ({ ...prev, shortcuts: [...(prev.shortcuts || defaultSettings.shortcuts), newSc] })); 
  };

  const updateShortcut = (index, field, value) => { 
      const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; 
      list[index] = { ...list[index], [field]: value }; 
      setSettings(prev => ({ ...prev, shortcuts: list })); 
  };

  const removeShortcut = (index) => { 
      const list = [...(settings.shortcuts || defaultSettings.shortcuts)]; 
      list.splice(index, 1); 
      setSettings(prev => ({ ...prev, shortcuts: list })); 
  };

  const handleLogin = async (event) => { 
      event.preventDefault(); 
      setLoggingIn(true); 
      try { 
          const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 }); 
          if (response.data.status === "otp_sent") {
              setIsVerifyStep(true);
              toast.success("2FA Code sent to admin email!");
          }
      } catch (error) { 
          if (error?.response?.status === 401) { 
              toast.error("Wrong passcode."); 
          } else { 
              toast.error("Server is waking up. Please wait 15-20 seconds and try again."); 
          } 
      } finally { 
          setLoggingIn(false); 
      } 
  };

  const handleVerifyOtp = async (event) => {
      event.preventDefault();
      setLoggingIn(true);
      try {
          const response = await axios.post(`${API}/auth/verify-login`, { otp: loginOtpCode });
          localStorage.setItem("jj_auth_token", response.data.access_token);
          setToken(response.data.access_token);
          setIsVerifyStep(false);
          setPasscode("");
          toast.success("Securely Logged In");
      } catch (error) {
          toast.error("Invalid verification code.");
      } finally {
          setLoggingIn(false);
      }
  };
  const handleLogout = () => { 
      localStorage.removeItem("jj_auth_token"); 
      setToken(""); 
      setGatewayPassed(false); 
      setSettingsLoaded(false); 
  };

  const optimizeImageDataUrl = async (file) => { 
      const reader = new FileReader(); 
      const original = await new Promise((resolve, reject) => { 
          reader.onload = () => resolve(reader.result); 
          reader.onerror = reject; 
          reader.readAsDataURL(file); 
      }); 
      const image = new Image(); 
      await new Promise((resolve, reject) => { 
          image.onload = resolve; 
          image.onerror = reject; 
          image.src = original; 
      }); 
      const ratio = Math.min(420 / image.width, 420 / image.height, 1); 
      const targetWidth = Math.round(image.width * ratio); 
      const targetHeight = Math.round(image.height * ratio); 
      const canvas = document.createElement("canvas"); 
      canvas.width = targetWidth; 
      canvas.height = targetHeight; 
      const context = canvas.getContext("2d"); 
      context.drawImage(image, 0, 0, targetWidth, targetHeight); 
      return canvas.toDataURL("image/png", 0.92); 
  };

  const handleLogoUpload = async (event) => { 
      const file = event.target.files?.[0]; 
      if (!file) return; 
      try { 
          const dataUrl = await optimizeImageDataUrl(file); 
          localStorage.setItem("jj_logo_data_url", dataUrl); 
          setSettings((prev) => ({ ...prev, logo_data_url: dataUrl })); 
          setLogoUploadName(file.name); 
          toast.success("Logo uploaded successfully."); 
      } catch { 
          toast.error("Logo upload failed."); 
      } 
  };

  const saveSettings = async () => { 
      try { 
          await axios.put(`${API}/settings`, settings, { headers: authHeaders }); 
          toast.success("Settings saved."); 
      } catch { 
          toast.error("Could not save settings."); 
      } 
  };

  const submitLedgerLog = async () => { 
      if (!logAmount || isNaN(logAmount) || num(logAmount) <= 0) { 
          toast.error("Please enter a valid amount."); 
          return; 
      } 
      if (!logReason.trim()) { 
          toast.error("Please enter a reason/remark."); 
          return; 
      } 
      setSubmittingLog(true); 
      try { 
          const payload = { 
              branch_id: globalBranchId, 
              reason: logReason, 
              cash_change: 0, 
              estimate_bank_change: 0, 
              invoice_bank_change: 0 
          }; 
          const amt = num(logAmount); 
          const keyMap = { 
              "cash": "cash_change", 
              "estimate_bank": "estimate_bank_change", 
              "invoice_bank": "invoice_bank_change" 
          }; 
          if (logType === "expense") {
              payload[keyMap[logSourceVault]] = -amt; 
          } else if (logType === "add") {
              payload[keyMap[logSourceVault]] = amt; 
          } else if (logType === "exchange") { 
              if (logSourceVault === logTargetVault) { 
                  toast.error("Cannot exchange into the same vault."); 
                  setSubmittingLog(false); 
                  return; 
              } 
              payload[keyMap[logSourceVault]] = -amt; 
              payload[keyMap[logTargetVault]] = amt; 
          } 
          await axios.post(`${API}/settings/ledger/adjust`, payload, { headers: authHeaders }); 
          toast.success("Transaction logged successfully!"); 
          setShowLogForm(false); 
          setLogAmount(""); 
          setLogReason(""); 
          await loadSettings(); 
          await fetchLedgerHistory(); 
      } catch (error) { 
          toast.error("Ledger update failed."); 
      } finally { 
          setSubmittingLog(false); 
      } 
  };

  const saveBalances = async () => { 
      try { 
          const payload = { 
              branch_id: globalBranchId, 
              cash_balance: num(manualCash), 
              estimate_bank_balance: num(manualEstBank), 
              invoice_bank_balance: num(manualInvBank) 
          }; 
          await axios.put(`${API}/settings/balances`, payload, { headers: authHeaders }); 
          setSettings(prev => { 
              const updatedBranches = (prev.branches || []).map(b => b.id === globalBranchId ? { ...b, ...payload } : b); 
              return { ...prev, branches: updatedBranches }; 
          }); 
          setEditingBalances(false); 
          toast.success(`Ledger balances for ${activeGlobalBranch.name} manually updated!`); 
      } catch { 
          toast.error("Failed to update balances."); 
      } 
  };

 const saveBill = async () => {
   // --- NEW VALIDATION: Check Customer Details ---
    if (!customer.name.trim() || !customer.phone.trim()) {
        toast.error("⚠️ Customer details missing! Please fill in both Name and Phone.");
        document.getElementById('customerNameInput')?.focus();
        return; // Stops the function from proceeding
    }

    // --- NEW VALIDATION: Check Item Descriptions ---
    const missingDescription = computed.items.some(item => !item.description || !item.description.trim());
    if (missingDescription) {
        toast.error("⚠️ Item details missing! Please add a description for all items before saving.");
        return; // Stops the function from proceeding
    }
    if (txType === "sale" && !paymentMethod) { 
        toast.error("Please select a payment method."); 
        return; 
    }
    
    if ((txType === "booking" || txType === "service")) { 
      if (isAdvancePaid && !advanceMethod) { 
          toast.error("Please select a method for the Advance payment."); 
          return; 
      } 
      if (isBalancePaid && !balanceMethod) { 
          toast.error("Please select a method for the Balance payment."); 
          return; 
      } 
    }

    setSavingBill(true);
    try {
      const payload = {
        mode, 
        branch_id: billBranchId, 
        document_number: documentNumber, 
        date: billDate, 
        customer_name: customer.name, 
        customer_phone: customer.phone, 
        customer_address: customer.address, 
        customer_email: customer.email,
        tx_type: txType, 
        payment_method: paymentMethod, 
        is_payment_done: isPaymentDone, 
        split_cash: num(splitCash), 
        split_upi: Math.max(0, computed.grandTotal - num(splitCash)),
        advance_amount: num(advanceAmount), 
        advance_method: advanceMethod, 
        advance_split_cash: num(advanceSplitCash), 
        is_advance_paid: isAdvancePaid,
        balance_method: balanceMethod, 
        balance_split_cash: num(balanceSplitCash), 
        is_balance_paid: isBalancePaid,
        discount: num(discount), 
        exchange: num(exchange), 
        round_off: manualRoundOff === "" ? null : num(manualRoundOff), 
        notes,
        redeemed_points: num(redeemedPoints), 
        earned_points: computed.earnedPoints, 
        applied_credit: computed.appliedCredit, 
        saved_credit: computed.savedCredit, 
        bonus_points: computed.bonusPoints,
        items: computed.items.map((item) => ({ 
            description: item.description, 
            hsn: item.hsn, 
            weight: num(item.weight), 
            quantity: num(item.quantity), 
            mc_override: item.mc_override === "" ? null : num(item.mc_override), 
            rate_override: item.rate_override === "" ? null : num(item.rate_override), 
            amount_override: item.amount_override === "" ? null : num(item.amount_override), 
            rate: item.rate, 
            amount: item.amount, 
            sl_no: item.slNo 
        })),
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

        // --- AUTO-DEDUCT INVENTORY ON NEW BILL ---
        let updatedInventory = [...(settings.inventory || [])];
        let inventoryChanged = false;
        
        computed.items.forEach(item => {
           const desc = (item.description || "").trim().toLowerCase();
           // NEW: Added branch check so B1 sales don't deduct B2 stock
           const invIndex = updatedInventory.findIndex(inv => 
              (inv.name || "").trim().toLowerCase() === desc && 
              inv.branch_id === billBranchId
           );
           if (invIndex !== -1 && num(item.weight) > 0) {
              // 1. Deduct the Weight
              const totalItemWeight = num(item.weight) * num(item.quantity || 1);
              updatedInventory[invIndex].weightInGrams = Math.max(0, (updatedInventory[invIndex].weightInGrams || 0) - totalItemWeight);
              
              // 2. Deduct the Quantity (Pieces)
              const piecesSold = num(item.quantity || 1);
              updatedInventory[invIndex].quantity = Math.max(0, (updatedInventory[invIndex].quantity || 0) - piecesSold);

              inventoryChanged = true;
           }
        });

        // PUSH THE DEDUCTION TO THE DATABASE
        if (inventoryChanged) {
           try {
             await axios.put(`${API}/settings`, { inventory: updatedInventory }, { headers: authHeaders });
             await loadSettings(); 
           } catch (invError) {
             console.error("Failed to update inventory automatically:", invError);
             toast.error("Bill saved, but failed to auto-deduct inventory.");
           }
        }
      }
      
      const updatedBills = await axios.get(`${API}/bills/recent`, { headers: authHeaders });
      if (updatedBills.data) {
         setRecentBillsList(updatedBills.data);
      }

    } catch (err) {
      console.error(err);
      toast.error("Failed to save the bill.");
    } finally {
      setSavingBill(false);
    }
  };

 const downloadPdf = async (elementId, filename) => { 
    toast.info("Preparing PDF..."); 
    const node = document.getElementById(elementId); 
    if (!node) return; 
    try { 
      const canvas = await html2canvas(node, { 
        scale: 2, 
        useCORS: true, 
        allowTaint: true, 
        backgroundColor: "#ffffff", 
        windowWidth: 1024, 
        onclone: (clonedDoc) => { 
          const clonedNode = clonedDoc.getElementById(elementId); 
          if (clonedNode) { 
            clonedNode.style.transform = "none"; 
            clonedNode.style.width = "800px"; 
            clonedNode.style.maxWidth = "800px"; 
            clonedNode.style.minWidth = "800px"; 
            clonedNode.style.position = "relative"; 
            clonedNode.style.top = "auto"; 
            clonedNode.style.left = "auto"; 
            clonedNode.style.margin = "0"; 
            clonedNode.style.padding = "20px"; 
            clonedNode.style.height = "max-content"; 
            clonedNode.style.overflow = "visible"; // Prevents internal clipping
            clonedNode.style.boxSizing = "border-box"; 
            
            const noPrint = clonedNode.querySelectorAll('.no-print'); 
            noPrint.forEach(el => el.style.display = 'none');
            
            const printOnly = clonedNode.querySelectorAll('.print-only'); 
            printOnly.forEach(el => { 
                el.style.position = 'static'; 
                el.style.width = '100%'; 
                el.style.height = 'auto'; 
                el.style.opacity = '1'; 
                el.style.visibility = 'visible'; 
                el.style.display = 'flex'; 
            });
          } 
        } 
      }); 
      
      const imageData = canvas.toDataURL("image/png", 1.0); 
      const pdfWidth = 210; // Standard width in mm
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width; 
      
      // FIX: Dynamically set the PDF format so it stretches to fit the receipt
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [pdfWidth, Math.max(297, pdfHeight)] }); 
      
      pdf.addImage(imageData, "PNG", 0, 0, pdfWidth, pdfHeight); 
      pdf.save(`${filename}.pdf`); 
      toast.success("PDF Downloaded Successfully"); 
    } catch (error) { 
        toast.error("Failed to download PDF."); 
    } 
  };
  
  const shareWhatsApp = () => { 
    if (!currentBillId) {
      toast.error("Please save the bill first before sharing!");
      return;
    }
    const link = `${window.location.origin}/?view=${currentBillId}`; 
    const text = `*Hello* ${customer.name || "Customer"},\n Thank you for visiting Jalaram Jewellers\n\n Official ${mode === "invoice" ? "Invoice" : "Estimate"} Bill\n Here Is Your Bill No. ${documentNumber}\n Amount: ₹${money(computed.grandTotal)}.\n\n Here You can view and download it securely\n Link: ${link}\n\n   Thank you,\n${settings.shop_name} : The Silver Specialist\n\n  `; 
    
    let cleanedPhone = customer.phone.replace(/\D/g, ""); 
    if (cleanedPhone.length === 10) cleanedPhone = `91${cleanedPhone}`; 
    
    window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, "_blank"); 
  };
  
  const shareEmail = () => { 
      if (!currentBillId) {
        toast.error("Please save the bill first before sharing!");
        return;
      }
      const link = `${window.location.origin}/?view=${currentBillId}`; 
      const subject = `${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber}`; 
      const body = `Dear ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`; 
      window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`; 
  };
  
  const goToBillTop = () => { 
      document.getElementById("bill-print-root")?.scrollIntoView({ behavior: "smooth", block: "start" }); 
  };

  const todaysTotalCash = (todayBills || []).filter(b => b.is_payment_done).reduce((sum, b) => sum + (b.payment_method === 'Cash' ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_cash) : 0), 0);
  const todaysTotalEstBank = (todayBills || []).filter(b => b.is_payment_done && b.mode === 'estimate').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);
  const todaysTotalInvBank = (todayBills || []).filter(b => b.is_payment_done && b.mode === 'invoice').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? (b.totals?.grand_total || 0) : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);

 const publicComputed = useMemo(() => {
    if (!publicBill || !publicSettings) return { items: [], taxable: 0, cgst: 0, sgst: 0, igst: 0, roundOff: 0, grandTotal: 0, discount: 0, exchange: 0 };
    const baseSilverRate = num(publicSettings.silver_rate_per_gram); 
    const baseMCPerGram = num(publicSettings.making_charge_per_gram); 
    const flatMCBelow5g = num(publicSettings.flat_mc_below_5g);
    const ptPerGram = num(publicSettings.loyalty_points_per_gram !== undefined ? publicSettings.loyalty_points_per_gram : 1);
    const rsPerPt = num(publicSettings.loyalty_point_value_rs !== undefined ? publicSettings.loyalty_point_value_rs : 1);

    let totalWeight = 0;

    const mapped = (publicBill.items || []).map((item, index) => {
      const weight = num(item.weight); 
      totalWeight += weight;
      const quantity = Math.max(num(item.quantity || 1), 1);
      const silverRate = (item.rate_override !== undefined && item.rate_override !== null && item.rate_override !== "") ? num(item.rate_override) : baseSilverRate;
      
      let mcAmount = 0;
      if (item.mc_override !== undefined && item.mc_override !== null && item.mc_override !== "") { 
          mcAmount = weight * num(item.mc_override); 
      } else if (flatMCBelow5g > 0 && weight > 0 && weight < 5) { 
          mcAmount = flatMCBelow5g; 
      } else { 
          mcAmount = weight * baseMCPerGram; 
      }

      const totalItemCost = (weight * silverRate) + mcAmount;
      const formulaAmount = publicBill.mode === "estimate" ? totalItemCost * quantity : totalItemCost;
      const amount = (item.amount !== undefined && item.amount !== null && item.amount !== "") ? num(item.amount) : (item.amount_override ? num(item.amount_override) : formulaAmount);
      const { rupees, paise } = splitAmount(amount);
      const rateForPrint = weight > 0 ? (amount / (publicBill.mode === "estimate" ? quantity : 1)) / weight : 0;
      
      return { ...item, sl_no: item.sl_no || (index + 1), rate: rateForPrint, amount, rupees, paise, weight, quantity };
    });

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0); 
    const taxable = subtotal;
    
   const cgstPct = num(publicSettings?.cgst_percent !== undefined ? publicSettings.cgst_percent : 1.5);
    const sgstPct = num(publicSettings?.sgst_percent !== undefined ? publicSettings.sgst_percent : 1.5);
    const igstPct = num(publicSettings?.igst_percent !== undefined ? publicSettings.igst_percent : 0);

    const cgst = publicBill.mode === "invoice" ? taxable * (cgstPct / 100) : 0; 
    const sgst = publicBill.mode === "invoice" ? taxable * (sgstPct / 100) : 0; 
    const igst = publicBill.mode === "invoice" ? taxable * (igstPct / 100) : 0;
    const gstApplied = publicBill.mode === "invoice" ? cgst + sgst + igst : 0;
    
    const discount = num(publicBill.discount || publicBill.totals?.discount || 0); 
    const exchange = num(publicBill.exchange || publicBill.totals?.exchange || 0);

    const bonusPointsVal = num(publicBill.bonus_points || 0);
    const earnedPoints = publicBill.earned_points !== undefined ? num(publicBill.earned_points) : (Math.floor(totalWeight * ptPerGram) + bonusPointsVal);
    const redeemedPoints = num(publicBill.redeemed_points || 0);
    const redeemedValue = redeemedPoints * rsPerPt;
    const appliedCreditVal = num(publicBill.applied_credit || 0);
    const savedCreditVal = num(publicBill.saved_credit || 0);

    const baseTotal = taxable + gstApplied - discount - exchange - redeemedValue - appliedCreditVal + savedCreditVal; 
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = publicBill.round_off !== undefined && publicBill.round_off !== null ? num(publicBill.round_off) : (publicBill.totals?.round_off !== undefined && publicBill.totals?.round_off !== null ? num(publicBill.totals?.round_off) : autoRound);
    const grandTotal = publicBill.totals?.grand_total !== undefined && publicBill.totals?.grand_total !== null ? num(publicBill.totals.grand_total) : (baseTotal + roundOff);

    return { 
        items: mapped, 
        taxable: publicBill.totals?.taxable_amount || publicBill.totals?.subtotal || taxable, 
        cgst: publicBill.totals?.cgst ?? cgst, 
        sgst: publicBill.totals?.sgst ?? sgst, 
        igst: publicBill.totals?.igst ?? igst, 
        roundOff, 
        grandTotal, 
        discount, 
        exchange, 
        earnedPoints, 
        redeemedPoints, 
        redeemedValue, 
        appliedCredit: appliedCreditVal, 
        savedCredit: savedCreditVal 
    };

  }, [publicBill, publicSettings]);

  // ... your other code above (like publicComputed) ...

  const handleAddGroupToInventory = async (groupName, groupItems) => {
      // 1. Calculate totals from the barcode group
      const addedQty = groupItems.length;
      const totalWeightGrams = groupItems.reduce((sum, item) => sum + num(item.weight), 0);

      if (totalWeightGrams <= 0 && addedQty <= 0) {
          toast.error(`Cannot add ${groupName}. No valid weight or quantity found.`);
          return;
      }

      // 2. Fetch current inventory and logs
      let currentInv = [...(settings.inventory || [])];
      let currentLogs = [...(settings.inventory_logs || [])];

      // 3. Check if item already exists in the selected branch
      const existingIndex = currentInv.findIndex(i => i.name.toLowerCase() === groupName.toLowerCase().trim() && i.branch_id === globalBranchId);

      if (existingIndex !== -1) {
          currentInv[existingIndex].weightInGrams += totalWeightGrams;
          currentInv[existingIndex].quantity = (currentInv[existingIndex].quantity || 0) + addedQty;
      } else {
          currentInv.push({
              id: Date.now().toString(),
              name: groupName.trim(),
              weightInGrams: totalWeightGrams,
              quantity: addedQty,
              branch_id: globalBranchId
          });
      }

      // 4. Create a log entry for the history tab
      const newLog = {
          id: Date.now().toString(),
          date: today(),
          name: groupName.trim(),
          weight: String(totalWeightGrams),
          unit: "g",
          quantity: addedQty,
          branch_id: globalBranchId
      };
      
      currentLogs.unshift(newLog);

      // 5. Update state and push to the cloud
      const newSettings = { ...settings, inventory: currentInv, inventory_logs: currentLogs };
      setSettings(newSettings);

      try {
          await axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
          toast.success(`Success! Added ${addedQty} Pcs of ${groupName} (${totalWeightGrams}g) to Inventory.`);
      } catch (error) {
          toast.error("Failed to sync new stock to the cloud.");
      }
  };

  
  // ... rest of your getUpiAmount function ...

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
  
  const upiAmountToPay = getUpiAmount(); 
  const showDashboardUpi = upiAmountToPay > 0;
  const upiId = mode === "invoice" ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmountToPay)}&cu=INR&tn=Bill_${documentNumber || "Draft"}`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  if (isPublicView) {
    if (publicLoading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px', minHeight: '100dvh', backgroundColor: '#f1f5f9' }}>
      <style>{`@keyframes shimmer { 0% { background-position: -800px 0 } 100% { background-position: 800px 0 } } .skel { background: linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%); background-size: 800px 100%; animation: shimmer 1.5s infinite linear; border-radius: 6px; }`}</style>
      <div style={{ width: '100%', maxWidth: '800px', backgroundColor: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 4px 10px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
          <div className="skel" style={{ width: '80px', height: '80px', borderRadius: '50%' }}></div>
        </div>
        <div className="skel" style={{ height: '30px', width: '40%', margin: '0 auto 15px auto' }}></div>
        <div className="skel" style={{ height: '15px', width: '25%', margin: '0 auto 40px auto' }}></div>
        
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
          <div className="skel" style={{ height: '20px', width: '30%' }}></div>
          <div className="skel" style={{ height: '20px', width: '20%' }}></div>
        </div>
        
        <div className="skel" style={{ height: '40px', width: '100%', marginBottom: '10px' }}></div>
        <div className="skel" style={{ height: '40px', width: '100%', marginBottom: '10px' }}></div>
        <div className="skel" style={{ height: '40px', width: '100%', marginBottom: '30px' }}></div>
        
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '40%' }}>
             <div className="skel" style={{ height: '20px', width: '100%', marginBottom: '10px' }}></div>
             <div className="skel" style={{ height: '20px', width: '100%', marginBottom: '10px' }}></div>
             <div className="skel" style={{ height: '30px', width: '100%' }}></div>
          </div>
        </div>
      </div>
    </div>
  );
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
  {/* --- DYNAMIC PRINTER SIZE CSS --- */}
        <style>
          {`
            @media print {
              @page {
                size: ${
                  settings?.paper_size === "80mm" ? "80mm auto" : 
                  settings?.paper_size === "58mm" ? "58mm auto" : 
                  settings?.paper_size || "A4"
                };
                margin: ${settings?.paper_size === "80mm" || settings?.paper_size === "58mm" ? "2mm" : "5mm"};
              }
              
              /* Force the bill to squeeze into the selected paper size */
              ${(settings?.paper_size === "80mm" || settings?.paper_size === "58mm") ? `
                body, .billing-app, .bill-container, .bill-paper, .bill-sheet, #printable-bill {
                   width: ${settings.paper_size} !important;
                   max-width: ${settings.paper_size} !important;
                   min-width: ${settings.paper_size} !important;
                   margin: 0 auto !important;
                   padding: 2px !important;
                   box-shadow: none !important;
                }
                /* Hide things that shouldn't be on small thermal receipts */
                .no-thermal { display: none !important; }
              ` : `
                .bill-container, .bill-paper, #printable-bill {
                   width: 100% !important;
                   max-width: 100% !important;
                   box-shadow: none !important;
                   margin: 0 auto !important;
                }
              `}
            }
          `}
        </style>
        
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
          <Button variant="outline" onClick={() => { setPrintType("bill"); setTimeout(() => window.print(), 100); }}>Print Bill</Button>
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
              <div style={{ width: "100%", textAlign: publicSettings?.phone_align || "center", fontFamily: publicSettings?.phone_font || "sans-serif", fontSize: `${publicSettings?.phone_size || 13}px`, marginBottom: "4px", fontWeight: "bold" }}>
                {publicBill.mode === "invoice" && pbBranch.invoice_phone ? pbBranch.invoice_phone : (publicSettings?.phone_numbers || []).join(" | ")}
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
              <p><strong>GSTIN:</strong> {publicBill.customer_gstin || "N/A"}</p>
            </div>

          <BillTable mode={publicBill.mode} items={publicComputed.items} />

          <div className="sheet-bottom-stack">
            <div className="totals">
              <div className="totals-row"><span>{publicBill.mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span><strong>₹{money(publicComputed.taxable)}</strong></div>
              {publicBill.mode === "invoice" ? (
                <>
                  <div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(publicComputed.cgst)}</strong></div>
                  <div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(publicComputed.sgst)}</strong></div>
                  <div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(publicComputed.igst)}</strong></div>
                </>
              ) : (
                <>
                  <div className="totals-row"><span>DISCOUNT</span><strong>₹{money(publicComputed.discount)}</strong></div>
                  <div className="totals-row"><span>EXCHANGE</span><strong>₹{money(publicComputed.exchange)}</strong></div>
                </>
              )}
              {num(publicComputed.redeemedPoints) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>POINTS REDEEMED ({publicComputed.redeemedPoints} pts)</span><strong style={{color:"#16a34a"}}>- ₹{money(publicComputed.redeemedValue)}</strong></div>}
              {num(publicComputed.appliedCredit) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>STORE CREDIT APPLIED</span><strong style={{color:"#16a34a"}}>- ₹{money(publicComputed.appliedCredit)}</strong></div>}
             
              <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(publicComputed.roundOff)}</strong></div>
              {num(publicComputed.savedCredit) > 0 && <div className="totals-row"><span>STORE CREDIT SAVED</span><strong>+ ₹{money(publicComputed.savedCredit)}</strong></div>}
              <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(publicComputed.grandTotal)}</strong></div>
               {publicBill.mode === "invoice" && <div style={{ textAlign: "right", fontSize: "0.65rem", color: "#64748b", marginTop: "2px", fontWeight: "bold" }}>E. & O.E.</div>}
              {isSale ? (
                <div className="totals-row" style={{ color: isPaid ? "#16a34a" : "#b45309", marginTop: "10px" }}>
                  <span>{isPaid ? "PAID Throung" : "PAYMENT STATUS"}</span>
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

             {/* --- AMOUNT IN WORDS (PUBLIC VIEW) --- */}
            <div style={{ marginTop: "10px", padding: "8px 0", borderTop: "1px dashed #cbd5e1", borderBottom: "1px dashed #cbd5e1", textAlign: "left", fontSize: "0.9rem", color: "#334155", fontStyle: "italic", fontWeight: "500", textTransform: "capitalize" }}>
              <span style={{ color: "#64748b", fontStyle: "normal", marginRight: "5px" }}>Amount in Words:</span> 
              {numberToWords(publicComputed?.grandTotal || 0)}
            </div>

            {publicComputed.earnedPoints > 0 && (
              <div style={{ textAlign: "center", marginTop: "15px", padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px dashed #22c55e", color: "#166534", fontWeight: "bold", fontSize: "0.9rem" }}>
                🎉 You earned {publicComputed.earnedPoints} Loyalty Points on this bill!
              </div>
            )}

            <div className="declaration">
              {publicBill.mode === "invoice" ? (
                <>
                  <p className="section-title">DECLARATION</p>
                  <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                  <p className="section-title">POLICIES, T&C</p>
                  <ul className="policies-list">
                    <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                    <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                  </ul>
                </>
              ) : (
                <>
                  <p className="section-title">POLICIES, T&C</p>
                  <ul className="policies-list">
                    <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                    <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                  </ul>
                </>
              )}
            </div>
            
            <FooterLinksAndQRs branch={pbBranch} allBranches={publicSettings?.branches} mode={publicBill.mode} settings={publicSettings} />
          </div>
       
          {/* --- CLEAN SIGNATURE FOOTER START (PUBLIC) --- */}
          <footer className="sheet-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "30px", paddingTop: "20px", paddingBottom: "10px", backgroundColor: "transparent", color: "black", breakInside: "avoid" }}>
            <div style={{ textAlign: "left", paddingLeft: "10px" }}>
              <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Thanking you.</h3>
            </div>
            <div style={{ width: "250px", textAlign: "center" }}>
              <p style={{ margin: "0 0 50px 0", fontWeight: "bold", fontSize: "1rem", color: "#000", fontFamily: "sans-serif" }}>For {publicSettings?.shop_name || "JALARAM JEWELLERS"}</p>
              <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Authorised Signature</p>
            </div>
          </footer>
          {/* --- CLEAN SIGNATURE FOOTER END (PUBLIC) --- */}
        </section>
      </div>
    );
  }

 if (checkingSession) {
    return (
      <div style={{ display: 'flex', height: '100dvh', backgroundColor: '#f1f5f9', overflow: 'hidden' }}>
        <style>{`@keyframes shimmer { 0% { background-position: -1000px 0 } 100% { background-position: 1000px 0 } } .skel { background: linear-gradient(90deg, #e2e8f0 25%, #f8fafc 50%, #e2e8f0 75%); background-size: 1000px 100%; animation: shimmer 1.5s infinite linear; border-radius: 8px; }`}</style>
        
        {/* Fake Screen & Sidebar Skeleton */}
        <div style={{ flex: 3, padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
             <div className="skel" style={{ height: '50px', width: '30%' }}></div>
             <div className="skel" style={{ height: '40px', width: '15%', borderRadius: '20px' }}></div>
           </div>
           <div className="skel" style={{ flex: 1, width: '100%', borderRadius: '12px' }}></div>
        </div>

        <div style={{ flex: 2, borderLeft: '1px solid #cbd5e1', padding: '20px', backgroundColor: 'white', display: 'flex', flexDirection: 'column', gap: '15px' }}>
           <div className="skel" style={{ height: '40px', width: '100%' }}></div>
           <div className="skel" style={{ height: '60px', width: '100%' }}></div>
           <div className="skel" style={{ height: '200px', width: '100%', marginTop: '20px' }}></div>
           <div className="skel" style={{ height: '120px', width: '100%', marginTop: '20px' }}></div>
           
           {/* Pop-up for database wake-up */}
           {isWakingUp && (
              <div style={{ position: 'absolute', bottom: '30px', right: '30px', backgroundColor: 'white', padding: '20px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(0,0,0,0.15)', border: '1px solid #cbd5e1', zIndex: 100, width: '320px' }}>
                 <p style={{ margin: '0 0 10px 0', fontWeight: 'bold', color: '#0f172a', fontSize: '1.1rem' }}>Waking up database ⏳</p>
                 <p style={{ margin: '0 0 15px 0', fontSize: '0.85rem', color: '#64748b' }}>Please wait about 30 seconds for the cloud server to spin up.</p>
                 <Button variant="outline" onClick={() => { localStorage.clear(); window.location.reload(); }} style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444' }}>Force Restart App</Button>
              </div>
           )}
        </div>
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

    const handleSendOtp = async (e) => {
        e.preventDefault();
        setSendingOtp(true);
        try {
            await axios.post(`${API}/auth/forgot-password`);
            toast.success("OTP sent to admin email!");
            setOtpSent(true);
        } catch {
            toast.error("Failed to send OTP.");
        } finally {
            setSendingOtp(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setResettingPwd(true);
        try {
            await axios.post(`${API}/auth/reset-password`, { otp: otpCode, new_passcode: newPassword });
            toast.success("Password reset successfully! Please login.");
            setShowForgotPwd(false);
            setOtpSent(false);
            setPasscode(newPassword);
            setOtpCode("");
            setNewPassword("");
        } catch {
            toast.error("Invalid OTP or failed to reset.");
        } finally {
            setResettingPwd(false);
        }
    };

    return (
      <div className="login-shell">
        <Toaster position="bottom-right" />
        <div className="login-card">
          <h1 className="login-title">{settings?.shop_name || "Jalaram Jewellers"}</h1>
          
          {!showForgotPwd ? (
              !isVerifyStep ? (
                  <form onSubmit={handleLogin}>
                      <p className="login-subtitle">Enter passcode to access billing panel</p>
                      <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Enter passcode" style={{ marginBottom: "10px" }} />
                      <Button type="submit" disabled={loggingIn} style={{ width: "100%", marginBottom: "10px" }}>{loggingIn ? "Checking..." : "Login"}</Button>
                      <Button type="button" variant="ghost" onClick={() => setShowForgotPwd(true)} style={{ width: "100%", color: "#64748b" }}>Forgot Passcode?</Button>
                  </form>
              ) : (
                  <form onSubmit={handleVerifyOtp}>
                      <p className="login-subtitle">Enter the 6-digit code sent to your email</p>
                      <Input type="text" value={loginOtpCode} onChange={(e) => setLoginOtpCode(e.target.value)} placeholder="Enter OTP" style={{ marginBottom: "10px" }} required />
                      <Button type="submit" disabled={loggingIn} style={{ width: "100%", marginBottom: "10px", backgroundColor: "#16a34a" }}>{loggingIn ? "Verifying..." : "Verify & Login"}</Button>
                      <Button type="button" variant="ghost" onClick={() => setIsVerifyStep(false)} style={{ width: "100%", color: "#64748b" }}>Back to Passcode</Button>
                  </form>
              )
          ) : (
              <div>
                  <p className="login-subtitle">Reset your passcode securely</p>
                  {!otpSent ? (
                      <form onSubmit={handleSendOtp}>
                          <p style={{ fontSize: "0.85rem", color: "#475569", marginBottom: "15px" }}>An OTP will be sent to the admin email configured in settings.</p>
                          <Button type="submit" disabled={sendingOtp} style={{ width: "100%", marginBottom: "10px" }}>{sendingOtp ? "Sending..." : "Send Verification OTP"}</Button>
                          <Button type="button" variant="ghost" onClick={() => setShowForgotPwd(false)} style={{ width: "100%" }}>Cancel</Button>
                      </form>
                  ) : (
                      <form onSubmit={handleResetPassword}>
                          <Input type="text" value={otpCode} onChange={(e) => setOtpCode(e.target.value)} placeholder="Enter 6-digit OTP" style={{ marginBottom: "10px" }} required />
                          <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Enter New Passcode" style={{ marginBottom: "10px" }} required />
                          <Button type="submit" disabled={resettingPwd} style={{ width: "100%", marginBottom: "10px", backgroundColor: "#16a34a" }}>{resettingPwd ? "Resetting..." : "Verify & Save Password"}</Button>
                          <Button type="button" variant="ghost" onClick={() => { setOtpSent(false); setShowForgotPwd(false); }} style={{ width: "100%" }}>Cancel</Button>
                      </form>
                  )}
              </div>
          )}
        </div>
      </div>
    );
  }

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

  return (
    <div className="billing-app" style={isPrinting ? { height: "auto", overflow: "visible" } : { display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", backgroundColor: "#f1f5f9" }}>
      <Toaster position="bottom-right" />
      <style>{GLOBAL_PRINT_CSS}</style>
    {/* --- DYNAMIC PRINTER SIZE CSS --- */}
        <style>
          {`
            @media print {
              @page {
                size: ${
                  settings?.paper_size === "80mm" ? "80mm auto" : 
                  settings?.paper_size === "58mm" ? "58mm auto" : 
                  settings?.paper_size || "A4"
                };
                margin: ${settings?.paper_size === "80mm" || settings?.paper_size === "58mm" ? "2mm" : "5mm"};
              }
              
              /* Force the bill to squeeze into the selected paper size */
              ${(settings?.paper_size === "80mm" || settings?.paper_size === "58mm") ? `
                body, .billing-app, .bill-container, .bill-paper, .bill-sheet, #printable-bill {
                   width: ${settings.paper_size} !important;
                   max-width: ${settings.paper_size} !important;
                   min-width: ${settings.paper_size} !important;
                   margin: 0 auto !important;
                   padding: 2px !important;
                   box-shadow: none !important;
                }
                /* Hide things that shouldn't be on small thermal receipts */
                .no-thermal { display: none !important; }
              ` : `
                .bill-container, .bill-paper, #printable-bill {
                   width: 100% !important;
                   max-width: 100% !important;
                   box-shadow: none !important;
                   margin: 0 auto !important;
                }
              `}
            }
          `}
        </style>
      <div style={{ position: "absolute", zIndex: -9999, opacity: 0, pointerEvents: "none", top: 0, left: 0, height: 0, overflow: "hidden" }}>
        {(filteredRecentBills || []).map(b => {
           const billBranch = (settings.branches || []).find(br => br.id === b.branch_id) || (settings.branches || [])[0] || defaultSettings.branches[0];
           const rsPerPt = num(settings.loyalty_point_value_rs !== undefined ? settings.loyalty_point_value_rs : 1);
           
           const printedItems = (b.items || []).map((item, index) => {
             const rate = (item.rate !== undefined && item.rate !== null) ? num(item.rate) : (item.rate_override ? num(item.rate_override) : 0);
             const amount = (item.amount !== undefined && item.amount !== null) ? num(item.amount) : (item.amount_override ? num(item.amount_override) : 0);
             const { rupees, paise } = splitAmount(amount);
             return { ...item, sl_no: item.sl_no || (index + 1), rate, amount, rupees, paise };
           });

           return (
             <section key={b.id} id={`bulk-bill-${b.document_number}`} className="bill-sheet" style={{ width: "800px", maxWidth: "800px", margin: 0, "--print-scale-factor": 1 }}>
                {(b.tx_type === "sale" ? b.is_payment_done : b.is_balance_paid) && <div className="watermark-done">FULLY PAID</div>}
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
                    <div className="contact-address" style={{ fontFamily: settings.address_font || "sans-serif", textAlign: settings.address_align || "center" }}>
                        <span style={{ color: settings.address_color || "#475569", fontSize: `${settings.address_size || 14}px` }}>{billBranch.address}</span>
                    </div>
                    <div style={{ width: "100%", textAlign: settings.phone_align || "center", fontFamily: settings.phone_font || "sans-serif", fontSize: `${settings.phone_size || 13}px`, marginBottom: "4px", fontWeight: "bold" }}>
                      {b.mode === "invoice" && billBranch.invoice_phone ? billBranch.invoice_phone : (settings.phone_numbers || []).join(" | ")}
                    </div>
                    {b.mode === "invoice" && billBranch.gstin && <p style={{ margin: "4px 0", textAlign: "center", fontWeight: "bold" }}>GSTIN: {billBranch.gstin}</p>}
                  </div>
                </div>

                <div className="sheet-banner">{b.tx_type === "booking" ? "BOOKING RECEIPT" : b.tx_type === "service" ? "SERVICE ORDER" : b.mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}</div>

                <div className="meta-grid">
                  <p><strong>{b.mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {b.document_number}</p>
                  <p><strong>Date:</strong> {b.date}</p>
                </div>

              <div className="customer-box">
                  <p><strong>Name:</strong> {b.customer_name || b.customer?.name || "-"}</p>
                  <p><strong>Address:</strong> {b.customer_address || b.customer?.address || "-"}</p>
                  <p><strong>Phone:</strong> {b.customer_phone || b.customer?.phone || "-"}</p>
                  <p><strong>GSTIN:</strong> {b.customer_gstin || "N/A"}</p>
                </div>
                <BillTable mode={b.mode} items={printedItems} />

                <div className="sheet-bottom-stack">
                  <div className="totals">
                    <div className="totals-row"><span>{b.mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span><strong>₹{money(b.totals?.taxable_amount || b.totals?.subtotal || 0)}</strong></div>
                    {b.mode === "invoice" ? (
                      <>
                        <div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(b.totals?.cgst || 0)}</strong></div>
                        <div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(b.totals?.sgst || 0)}</strong></div>
                        <div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(b.totals?.igst || 0)}</strong></div>
                      </>
                    ) : (
                      <>
                        <div className="totals-row"><span>DISCOUNT</span><strong>₹{money(b.totals?.discount || 0)}</strong></div>
                        <div className="totals-row"><span>EXCHANGE</span><strong>₹{money(b.totals?.exchange || 0)}</strong></div>
                      </>
                    )}
                    {num(b.redeemed_points) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>POINTS REDEEMED ({b.redeemed_points} pts)</span><strong style={{color:"#16a34a"}}>- ₹{money(num(b.redeemed_points) * rsPerPt)}</strong></div>}
                    {num(b.applied_credit) > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>STORE CREDIT APPLIED</span><strong style={{color:"#16a34a"}}>- ₹{money(b.applied_credit)}</strong></div>}
                
                    <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(b.totals?.round_off !== undefined ? b.totals.round_off : 0)}</strong></div>
                    {num(b.saved_credit) > 0 && <div className="totals-row"><span>STORE CREDIT SAVED</span><strong>+ ₹{money(b.saved_credit)}</strong></div>}
                    <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(b.totals?.grand_total || 0)}</strong></div>
                    {b.mode === "invoice" && <div style={{ textAlign: "right", fontSize: "0.65rem", color: "#64748b", marginTop: "2px", fontWeight: "bold" }}>E. & O.E.</div>}
                    
                    {b.tx_type === "sale" || !b.tx_type ? (
                      <div className="totals-row" style={{ color: b.is_payment_done ? "#16a34a" : "#b45309", marginTop: "10px" }}>
                        <span>{b.is_payment_done ? "PAID Through" : "PAYMENT STATUS"}</span>
                        <strong>{b.is_payment_done ? (b.payment_method === "Split" ? `SPLIT (C:₹${money(b.split_cash)}, U:₹${money(Math.max(0, (b.totals?.grand_total || 0) - num(b.split_cash)))})` : (b.payment_method || "CASH").toUpperCase()) : "PENDING"}</strong>
                      </div>
                    ) : (
                      <>
                        <div className="totals-row" style={{ marginTop: "10px", color: b.is_advance_paid ? "#16a34a" : "#b45309" }}>
                          <span>ADVANCE {b.is_advance_paid ? "RECEIVED" : "PENDING"} {b.advance_method ? `(${b.advance_method === 'Split' ? `C:₹${money(b.advance_split_cash)}, U:₹${money(Math.max(0, num(b.advance_amount) - num(b.advance_split_cash)))}` : b.advance_method})` : ""}</span>
                          <strong>₹{money(b.advance_amount)}</strong>
                        </div>
                        <div className="totals-row" style={{ color: b.is_balance_paid ? "#16a34a" : "#dc2626" }}>
                          <span>BALANCE {b.is_balance_paid ? "RECEIVED" : "DUE"} {b.balance_method ? `(${b.balance_method === 'Split' ? `C:₹${money(b.balance_split_cash)}, U:₹${money(Math.max(0, ((b.totals?.grand_total || 0) - num(b.advance_amount)) - num(b.balance_split_cash)))}` : b.balance_method})` : ""}</span>
                          <strong>₹{money(Math.max(0, num(b.totals?.grand_total || 0) - num(b.advance_amount)))}</strong>
                        </div>
                      </>
                    )}
                  </div>

                    {/* --- AMOUNT IN WORDS (BULK/HIDDEN VIEW) --- */}
                  <div style={{ marginTop: "10px", padding: "8px 0", borderTop: "1px dashed #cbd5e1", borderBottom: "1px dashed #cbd5e1", textAlign: "left", fontSize: "0.9rem", color: "#334155", fontStyle: "italic", fontWeight: "500", textTransform: "capitalize" }}>
                    <span style={{ color: "#64748b", fontStyle: "normal", marginRight: "5px" }}>Amount in Words:</span> 
                    {numberToWords(b.totals?.grand_total || 0)}
                  </div>

                  {b.earned_points > 0 && (
                    <div style={{ textAlign: "center", marginTop: "15px", padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px dashed #22c55e", color: "#166534", fontWeight: "bold", fontSize: "0.9rem" }}>
                      🎉 You earned {b.earned_points} Loyalty Points on this bill!
                    </div>
                  )}
                  
                  <div className="declaration">
                    {b.mode === "invoice" ? (
                       <>
                          <p className="section-title">DECLARATION</p>
                          <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                          <p className="section-title">POLICIES, T&C</p>
                          <ul className="policies-list">
                             <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                             <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                          </ul>
                       </>
                    ) : (
                      <>
                         <p className="section-title">POLICIES, T&C</p>
                         <ul className="policies-list">
                            <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                            <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                         </ul>
                      </>
                    )}
                  </div>
                  <FooterLinksAndQRs branch={billBranch} allBranches={settings.branches} mode={b.mode} settings={settings} />
                </div>
            
                {/* --- CLEAN SIGNATURE FOOTER START (BULK) --- */}
                <footer className="sheet-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "30px", paddingTop: "20px", paddingBottom: "10px", backgroundColor: "transparent", color: "black", breakInside: "avoid" }}>
                  <div style={{ textAlign: "left", paddingLeft: "10px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Thanking you.</h3>
                  </div>
                  <div style={{ width: "250px", textAlign: "center" }}>
                    <p style={{ margin: "0 0 50px 0", fontWeight: "bold", fontSize: "1rem", color: "#000", fontFamily: "sans-serif" }}>For {settings?.shop_name || "JALARAM JEWELLERS"}</p>
                    <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Authorised Signature</p>
                  </div>
                </footer>
                {/* --- CLEAN SIGNATURE FOOTER END (BULK) --- */}
             </section>
           );
        })}
      </div>

        {/* WHATSAPP BROADCAST DASHBOARD */}
      {showBroadcastPanel && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", backgroundColor: "#f0fdf4", zIndex: 200, overflowY: "auto" }}>
          <div className="drawer-header" style={{ backgroundColor: "white", borderBottom: "1px solid #bbf7d0", padding: "20px 40px", position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#166534" }}>📢 WhatsApp Agent Dashboard</h3>
            <Button variant="outline" onClick={() => setShowBroadcastPanel(false)}>Back to Billing</Button>
          </div>
          <div style={{ padding: "40px", maxWidth: "800px", margin: "0 auto" }}>
            <div style={{ display: "flex", backgroundColor: "white", borderRadius: "12px", border: "1px solid #bbf7d0", padding: "10px", marginBottom: "25px" }}>
              <Button variant={broadcastMode === "web" ? "default" : "ghost"} onClick={() => setBroadcastMode("web")} style={{ flex: 1, backgroundColor: broadcastMode === "web" ? "#16a34a" : "transparent", color: broadcastMode === "web" ? "white" : "#475569" }}>📱 Standard WhatsApp Loop</Button>
              <Button variant={broadcastMode === "api" ? "default" : "ghost"} onClick={() => setBroadcastMode("api")} style={{ flex: 1, backgroundColor: broadcastMode === "api" ? "#0f172a" : "transparent", color: broadcastMode === "api" ? "white" : "#475569" }}>🤖 Python Background Agent</Button>
            </div>
            <div style={{ backgroundColor: "white", padding: "25px", borderRadius: "12px", border: "1px solid #bbf7d0", marginBottom: "25px" }}>
              <h4 style={{ color: "#15803d", marginTop: 0 }}>Target Audience</h4>
              <select className="native-select" style={{ width: "100%", padding: "12px", border: "2px solid #86efac", borderRadius: "8px" }}>
                <option value="all">Blast to ALL Supabase Customers</option>
                <option value="recent">Recent Customers (30 Days)</option>
              </select>
            </div>
            
          <div style={{ backgroundColor: "white", padding: "25px", borderRadius: "12px", border: "1px solid #bbf7d0", marginBottom: "25px" }}>
           <h4 style={{ color: "#15803d", marginTop: 0 }}>Upload Design Images</h4>
             <input 
               id="imageUpload" 
                type="file" 
                 accept="image/*" 
                  style={{ width: "100%", padding: "10px", border: "1px solid #cbd5e1", borderRadius: "8px", marginTop: "10px" }} 
                  />
  
               <p style={{ fontSize: "0.85rem", color: "#d97706", marginTop: "10px", marginBottom: 0 }}>
               ⚠️ In Web loop mode, images must be pasted manually into chats.
              </p>
            </div>
            <div style={{ backgroundColor: "white", padding: "25px", borderRadius: "12px", border: "1px solid #bbf7d0", marginBottom: "25px" }}>
              <h4 style={{ color: "#15803d", marginTop: 0 }}>Offer Message</h4>
              <textarea id="broadcastMessageInput" placeholder="Huge Festival Discount..." style={{ width: "100%", height: "150px", padding: "15px", border: "1px solid #cbd5e1", borderRadius: "8px" }} />
            </div>
            <Button 
              style={{ width: "100%", backgroundColor: broadcastMode === "web" ? "#25D366" : "#0f172a", color: "white", padding: "20px", fontSize: "1.2rem" }} 
              onClick={async () => {
                // Get the message (Ensure your textarea has id="broadcastMessageInput" or change this to match your state variable)
                const msg = document.getElementById("broadcastMessageInput")?.value || "";
                
                if (!msg) return alert("Please enter an offer message!");

                if (broadcastMode === "web") {
                  alert("Web Loop mode requires manual pasting of images. (Coming soon)");
                } else {
                  // --- ROUTING TO LOCAL LAPTOP AGENT ---
                  const fileInput = document.getElementById("imageUpload");
                  if (!fileInput.files || fileInput.files.length === 0) {
                      return alert("Please upload an image for the agent!");
                  }

                  const formData = new FormData();
                  formData.append("image", fileInput.files[0]);
                  formData.append("message", msg);
                  
                  try {
                    alert("Sending package to your local PC Agent...");
                    
                    // THIS IS THE MAGIC LINE: It points to your physical laptop, not Render!
                    await axios.post(`http://127.0.0.1:8000/trigger-agent`, formData, {
                        headers: { "Content-Type": "multipart/form-data" }
                    });
                    
                    alert("🤖 Agent Activated! Take your hands off the mouse.");
                  } catch (err) {
                    alert("❌ Could not reach PC. Is local_agent.py running in your terminal?");
                  }
                }
              }}
            >
              🚀 {broadcastMode === "web" ? "START WHATSAPP WEB LOOP" : "TRIGGER PYTHON SEND AGENT"}
            </Button>
          </div>
        </section>
      )}

      {/* A4 GRID FOR PRINTER */}
      <style>
        {`
          @media print {
            @page { size: A4; margin: 10mm; }
            .a4-barcode-grid { display: grid !important; grid-template-columns: repeat(3, 1fr) !important; gap: 15px !important; width: 190mm !important; margin: 0 auto !important; background: white !important; }
            .a4-label { border: 1px dashed #cccccc !important; padding: 10px !important; text-align: center !important; height: 36mm !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; background: white !important; page-break-inside: avoid !important; }
          }
        `}
      </style>
      
      {/* ADDED WRAPPER AND PRINT TYPE CHECK */}
     <div className={`print-only ${printType === "bill" ? "no-print" : ""}`} style={{ display: "none", width: "100%", justifyContent: "center" }}>
         <div className="a4-barcode-grid">
           {(barcodeQueue || []).filter(item => item.name === activePrintGroup).map(item => (
             <div key={item.id} className="a4-label">
                <p style={{ margin: "0", fontSize: "9px", fontWeight: "bold", color: "black" }}>{settings?.shop_name || "Jewellers"}</p>
                <Barcode value={`${item.name}-${item.weight || 'Fixed'}`} width={1.2} height={40} displayValue={false} margin={8} background="#ffffff" />
                <p style={{ margin: "2px 0 0 0", fontSize: "11px", fontWeight: "bold", color: "black" }}>{item.name}</p>
                
                <div style={{ display: "flex", gap: "8px", alignItems: "center", justifyContent: "center" }}>
                    {item.weight ? <p style={{ margin: "0", fontSize: "11px", color: "black" }}>Wt: {item.weight}g</p> : null}
                    {printWithPrice && item.price ? <p style={{ margin: "0", fontSize: "11px", fontWeight: "bold", color: "black" }}>₹{item.price}</p> : null}
                </div>
             </div>
           ))}
         </div>
      </div>
      <header className="top-bar no-print" style={{ zIndex: 50, position: "relative", flexShrink: 0, minHeight: "65px", height: "auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", flexWrap: "wrap", gap: "10px" }}>
        <div className="brand-block" style={{ display: "flex", alignItems: "center", gap: "15px", flexWrap: "nowrap" }}>
          <div><h1 className="brand-title" style={{ margin: 0, fontSize: "1.2rem", color: "white" }}>{settings.shop_name}</h1></div>
          
          <div style={{ paddingLeft: "15px", borderLeft: "2px solid rgba(255,255,255,0.2)" }}>
             <select value={globalBranchId} onChange={(e) => handleGlobalBranchChange(e.target.value)} style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", outline: "none", cursor: "pointer" }}>
                {(settings.branches || []).map(b => <option key={b.id} value={b.id} style={{ color: "black" }}>📍 {b.name}</option>)}
             </select>
          </div>

          <div style={{ display: "flex", gap: "6px", backgroundColor: "rgba(255,255,255,0.15)", padding: "4px", borderRadius: "8px", marginLeft: "10px" }}>
            <Button onClick={() => handleModeChange("invoice")} style={{ backgroundColor: mode === "invoice" ? "#ffffff" : "transparent", color: mode === "invoice" ? "#000000" : "white", border: "none", padding: "4px 12px", height: "auto" }}>Tax Invoice</Button>
            <Button onClick={() => handleModeChange("estimate")} style={{ backgroundColor: mode === "estimate" ? "#ffffff" : "transparent", color: mode === "estimate" ? "#000000" : "white", border: "none", padding: "4px 12px", height: "auto" }}>Estimate</Button>
          </div>
        </div>
        
        <div className="top-actions" style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: iotOnline ? "#4ade80" : "#ef4444", marginRight: "10px", padding: "4px 10px", borderRadius: "20px", border: `1px solid ${iotOnline ? "#4ade80" : "#ef4444"}` }}>
             <Cpu size={14} />
             <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: iotOnline ? "#4ade80" : "#ef4444", boxShadow: iotOnline ? "0 0 8px #4ade80" : "none" }} />
             <span>Display: {iotOnline ? "Live" : "Off"}</span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.85rem", color: cloudStatus.enabled ? "#4ade80" : "#facc15", marginRight: "10px" }}>
             <span style={{ width: "8px", height: "8px", borderRadius: "50%", backgroundColor: cloudStatus.enabled ? "#4ade80" : "#facc15" }} />
             <span>Cloud: {cloudStatus.enabled ? "Online" : "Connecting"}</span>
          </div>
          <Button variant="outline" onClick={goToBillTop} style={{ color: "black", backgroundColor: "white" }}>Back</Button>
          <Button variant="outline" onClick={handleLogout} style={{ color: "black", backgroundColor: "white" }}>Logout</Button>
        </div>
      </header>

      <main className="main-layout" style={isPrinting ? { height: "auto", overflow: "visible", display: "block" } : { flex: 1, display: "flex", flexDirection: isMobileSplit ? "column" : "row", overflowY: isMobileSplit ? "auto" : "hidden", overflowX: "hidden", backgroundColor: "#f1f5f9", minHeight: 0, paddingBottom: isMobileSplit ? "40px" : "0" }}>
        
        <section className={printType === "barcode" ? "no-print" : ""} style={isPrinting ? { padding: 0, margin: 0, overflow: "visible" } : { flex: isMobileSplit ? "none" : "3", overflow: isMobileSplit ? "visible" : "auto", padding: "20px", height: isMobileSplit ? "max-content" : "100%" }}>
          <div id="bill-print-root" className="bill-sheet" style={{ "--print-scale-factor": (printScale / 100).toFixed(3), position: 'relative', zIndex: 1, margin: "0 auto" }}>
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
                    <a href={activeBillBranch.location_url && activeBillBranch.location_url !== "#" ? activeBillBranch.location_url : "#"} target="_blank" rel="noopener noreferrer" style={{ color: settings.address_color || "#475569", fontSize: `${settings.address_size || 14}px`, textDecoration: 'none' }}>{activeBillBranch.address}</a>
                </div>
                <div style={{ width: "100%", textAlign: settings.phone_align || "center", fontFamily: settings.phone_font || "sans-serif", fontSize: `${settings.phone_size || 13}px`, marginBottom: "4px", fontWeight: "bold" }}>
                  {mode === "invoice" && activeBillBranch.invoice_phone ? activeBillBranch.invoice_phone : (settings.phone_numbers || []).join(" | ")}
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
              <p><strong>GSTIN:</strong> {customer.gstin || "N/A"}</p>
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
                  <>
                    <div className="totals-row"><span>DISCOUNT</span><strong>₹{money(discount)}</strong></div>
                    <div className="totals-row"><span>EXCHANGE</span><strong>₹{money(exchange)}</strong></div>
                  </>
                )}
                {computed.redeemedPoints > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>POINTS REDEEMED ({computed.redeemedPoints} pts)</span><strong style={{color:"#16a34a"}}>- ₹{money(computed.redeemedValue)}</strong></div>}
                {computed.appliedCredit > 0 && <div className="totals-row"><span style={{color:"#16a34a"}}>STORE CREDIT APPLIED</span><strong style={{color:"#16a34a"}}>- ₹{money(computed.appliedCredit)}</strong></div>}
                
                <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(computed.roundOff)}</strong></div>
                {computed.savedCredit > 0 && <div className="totals-row"><span>STORE CREDIT SAVED</span><strong>+ ₹{money(computed.savedCredit)}</strong></div>}
                <div className="totals-row total-highlight"><span>GRAND TOTAL</span><strong>₹{money(computed.grandTotal)}</strong></div>
                  {mode === "invoice" && <div style={{ textAlign: "right", fontSize: "0.65rem", color: "#64748b", marginTop: "2px", fontWeight: "bold" }}>E. & O.E.</div>}
                {txType === "sale" ? (
                  <div className="totals-row" style={{ color: isPaymentDone ? "#16a34a" : "#b45309", marginTop: "10px" }}>
                    <span>{isPaymentDone ? "PAID Through" : "PAYMENT STATUS"}</span>
                    <strong>{isPaymentDone ? (paymentMethod === "Split" ? `SPLIT (Cash: ₹${money(splitCash)}, UPI: ₹${money(Math.max(0, computed.grandTotal - num(splitCash)))})` : (paymentMethod || "CASH").toUpperCase()) : "PENDING"}</strong>
                  </div>
                ) : (
                  <>
                    <div className="totals-row" style={{ marginTop: "10px", color: isAdvancePaid ? "#16a34a" : "#b45309" }}>
                      <span>ADVANCE {isAdvancePaid ? "RECEIVED" : "PENDING"} {advanceMethod ? `(${advanceMethod === 'Split' ? `Cash: ₹${money(advanceSplitCash)}, UPI: ₹${money(Math.max(0, num(advanceAmount) - num(advanceSplitCash)))}` : advanceMethod})` : ""}</span>
                      <strong>₹{money(advanceAmount)}</strong>
                    </div>
                    <div className="totals-row" style={{ color: isBalancePaid ? "#16a34a" : "#dc2626" }}>
                      <span>BALANCE {isBalancePaid ? "RECEIVED" : "DUE"} {balanceMethod ? `(${balanceMethod === 'Split' ? `Cash: ₹${money(balanceSplitCash)}, UPI: ₹${money(Math.max(0, (computed.grandTotal - num(advanceAmount)) - num(balanceSplitCash)))}` : balanceMethod})` : ""}</span>
                      <strong>₹{money(Math.max(0, computed.grandTotal - num(advanceAmount)))}</strong>
                    </div>
                  </>
                )}

                {showDashboardUpi && (
                  <div className="payment-qr-box" data-html2canvas-ignore="true">
                    <p className="scan-title">Scan Here For Payment (₹{money(upiAmountToPay)})</p>
                    <img src={dynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" crossOrigin="anonymous" />
                    <p className="upi-id">UPI: {upiId}</p>
                  </div>
                )}
              </div>

            {/* --- AMOUNT IN WORDS (MAIN ADMIN/PRINT VIEW) --- */}
              <div style={{ marginTop: "10px", padding: "8px 0", borderTop: "1px dashed #cbd5e1", borderBottom: "1px dashed #cbd5e1", textAlign: "left", fontSize: "0.9rem", color: "#334155", fontStyle: "italic", fontWeight: "500", textTransform: "capitalize" }}>
                <span style={{ color: "#64748b", fontStyle: "normal", marginRight: "5px" }}>Amount in Words:</span> 
                {numberToWords(computed?.grandTotal || 0)}
              </div>

              {computed.earnedPoints > 0 && (
                <div style={{ textAlign: "center", marginTop: "15px", padding: "10px", backgroundColor: "#f0fdf4", borderRadius: "8px", border: "1px dashed #22c55e", color: "#166534", fontWeight: "bold", fontSize: "0.9rem" }}>
                  🎉 You earned {computed.earnedPoints} Loyalty Points on this bill!
                </div>
              )}

              <div className="declaration">
                {mode === "invoice" ? (
                   <>
                      <p className="section-title">DECLARATION</p>
                      <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                      <p className="section-title">POLICIES, T&C</p>
                      <ul className="policies-list">
                         <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                         <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                      </ul>
                   </>
                ) : (
                  <>
                     <p className="section-title">POLICIES, T&C</p>
                     <ul className="policies-list">
                        <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                        <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                     </ul>
                  </>
                )}
              </div>
              
              <FooterLinksAndQRs branch={activeBillBranch} allBranches={settings.branches} mode={mode} settings={settings} />

           </div>
              {/* --- CLEAN SIGNATURE FOOTER START (MAIN) --- */}
              <footer className="sheet-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "30px", paddingTop: "20px", paddingBottom: "10px", backgroundColor: "transparent", color: "black", breakInside: "avoid" }}>
                <div style={{ textAlign: "left", paddingLeft: "10px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Thanking you.</h3>
                </div>
                <div style={{ width: "250px", textAlign: "center" }}>
                  <p style={{ margin: "0 0 50px 0", fontWeight: "bold", fontSize: "1rem", color: "#000", fontFamily: "sans-serif" }}>For {settings?.shop_name || "JALARAM JEWELLERS"}</p>
                  <p style={{ margin: 0, fontSize: "0.9rem", fontWeight: "bold", color: "#000", fontFamily: "sans-serif" }}>Authorised Signature</p>
                </div>
              </footer>
              {/* --- CLEAN SIGNATURE FOOTER END (MAIN) --- */}
          </div>
        </section>

        <aside className="controls no-print" style={{ flex: isMobileSplit ? "none" : "2", overflowY: isMobileSplit ? "visible" : "auto", overflowX: "hidden", padding: "20px", backgroundColor: "white", borderLeft: isMobileSplit ? "none" : "1px solid #cbd5e1", borderTop: isMobileSplit ? "1px solid #cbd5e1" : "none", height: isMobileSplit ? "max-content" : "100%" }}>
          
          <div className="control-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h3 style={{ margin: 0 }}>Bill Details</h3>
                <select value={billBranchId} onChange={async (e) => { 
                    const nextBranch = e.target.value; setBillBranchId(nextBranch); markDirty(); 
                    if (currentBillId) { 
                        try { 
                            const res = await axios.get(`${API}/bills/next-number?mode=${mode}&branch_id=${nextBranch}`, { headers: authHeaders }); 
                            setDocumentNumber(res.data.document_number); 
                            toast.info(`Migrating to Branch: ${nextBranch}`); 
                        } catch (err) { 
                            toast.error("Failed to fetch new number for migration."); 
                        } 
                    } else { 
                        await reserveNumber(mode, nextBranch); 
                    }
                }} style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", cursor: "pointer" }}>
                    {(settings.branches || []).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px dashed var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
              <label className="select-label" style={{ fontSize: "0.8rem", margin: 0 }}>Bill Number</label>
              {currentBillId && (
                 <Button 
                   size="sm" 
                   variant="outline" 
                   onClick={(e) => { 
                     e.preventDefault(); 
                     if(window.confirm("Fetch the next available safe number to fix this duplicate?")) {
                       reserveNumber(mode, billBranchId);
                       markDirty();
                     }
                   }} 
                   style={{ height: "24px", fontSize: "0.75rem", padding: "0 8px", borderColor: "#eab308", color: "#b45309", backgroundColor: "#fefce8" }}
                 >
                   ⚠️ Fix Duplicate (Get New No.)
                 </Button>
              )}
            </div>
            <Input 
              value={isNumberLoading ? "Fetching..." : documentNumber} 
              onChange={(e) => { setDocumentNumber(e.target.value); markDirty(); }} 
              placeholder="e.g. INV-0212" 
              style={{ fontWeight: "bold", color: "var(--brand)", backgroundColor: "white" }} 
            />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "5px", color: "#16a34a", fontWeight: "bold" }}>
               <span>{customer.name ? `Loyalty Points: ${customer.points} | Store Credit: ₹${money(customer.credit)}` : ""}</span>
            </div>
            <Input id="customerNameInput" value={customer.name} onChange={(e) => { setCustomer((prev) => ({ ...prev, name: e.target.value })); markDirty(); }} placeholder="Customer name" />
            <Input value={customer.phone} onChange={(e) => { setCustomer((prev) => ({ ...prev, phone: e.target.value })); markDirty(); }} placeholder="Phone" />
            <Input value={customer.address} onChange={(e) => { setCustomer((prev) => ({ ...prev, address: e.target.value })); markDirty(); }} placeholder="Address" />
            <Input value={customer.email} onChange={(e) => { setCustomer((prev) => ({ ...prev, email: e.target.value })); markDirty(); }} placeholder="Email" />
            <Input value={customer.gstin || ""} onChange={(e) => { setCustomer((prev) => ({ ...prev, gstin: e.target.value })); markDirty(); }} placeholder="Customer GSTIN (Default: N/A)" />
            <Input type="text" value={billDate} onChange={(e) => { setBillDate(e.target.value); markDirty(); }} placeholder="DD-MM-YYYY" />
            <Input type="number" value={bonusPoints} onChange={(e) => { setBonusPoints(e.target.value); markDirty(); }} placeholder="🎁 Assign Bonus/Welcome Points (Optional)" style={{ marginTop: "5px", borderColor: "#22c55e", backgroundColor: "#f0fdf4" }} />

            {(suggestions || []).length > 0 && (
              <div className="suggestions">
                {(suggestions || []).map((entry) => (
                  <button key={entry.id} type="button" className="suggestion-item" onClick={() => { setCustomer({ name: entry.name, phone: entry.phone, address: entry.address, email: entry.email, points: entry.points || 0, credit: entry.credit || 0 }); setSuggestions([]); markDirty(); }}>
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
                <div style={{ position: "relative", flex: "1 1 150px" }}>
                  <Input 
                    className="item-desc-input" 
                    value={item.description} 
                    onFocus={() => setDescFocusId(item.id)} 
                    onBlur={() => setTimeout(() => setDescFocusId(null), 200)} 
                    onChange={(e) => updateItem(item.id, "description", e.target.value)} 
                    placeholder="Description" 
                    style={{ paddingRight: "25px" }} 
                  />
                  {(() => {
                     if (!item.description) return null;
                     const isCorrect = item.description.trim().length > 2 && !spellSuggestions[item.id];
                     const hasTypo = spellSuggestions[item.id];
                     
                     if (hasTypo) {
                         return (
                           <div style={{ position: "absolute", right: "8px", top: "10px", zIndex: 10 }}>
                             <div onClick={() => setSpellCheckOpenId(spellCheckOpenId === item.id ? null : item.id)} style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#ef4444", cursor: "pointer", boxShadow: "0 0 6px #ef4444" }} title="Typo detected! Click to fix." />
                             {spellCheckOpenId === item.id && (
                                <div style={{ position: "absolute", top: "20px", right: "0", backgroundColor: "white", border: "1px solid #ef4444", padding: "8px", borderRadius: "6px", boxShadow: "0 4px 10px rgba(0,0,0,0.2)", fontSize: "0.85rem", whiteSpace: "nowrap", zIndex: 60 }}>
                                   Did you mean: <strong style={{ cursor:"pointer", color: "#2563eb", textDecoration: "underline" }} onClick={() => { 
                                      const words = item.description.split(/\s+/);
                                      words[words.length - 1] = spellSuggestions[item.id];
                                      updateItem(item.id, "description", words.join(" ")); 
                                      setSpellCheckOpenId(null); 
                                   }}>{spellSuggestions[item.id]}</strong>?
                                </div>
                             )}
                           </div>
                         );
                     } else if (isCorrect) {
                         return <div style={{ position: "absolute", right: "8px", top: "10px", width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#22c55e", pointerEvents: "none", boxShadow: "0 0 4px #22c55e" }} title="Spelling OK" />;
                     }
                     return null;
                  })()}
                  {descFocusId === item.id && item.description.length >= 1 && (
                     <div style={{ position: "absolute", top: "100%", left: 0, width: "100%", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "6px", zIndex: 50, maxHeight: "200px", overflowY: "auto", boxShadow: "0 10px 15px rgba(0,0,0,0.1)" }}>
                        {(settings.master_items || []).filter(mi => mi.name.toLowerCase().includes(item.description.toLowerCase())).length > 0 ? (
                            (settings.master_items || []).filter(mi => mi.name.toLowerCase().includes(item.description.toLowerCase())).map(match => (
                               <div key={match.id} onMouseDown={(e) => {
                                    e.preventDefault(); 
                                    updateItem(item.id, "description", match.name);
                                    if (match.mc) updateItem(item.id, "mc_override", String(match.mc));
                                    if (match.fixed_amount) updateItem(item.id, "amount_override", String(match.fixed_amount));
                                    setDescFocusId(null);
                                }} style={{ padding: "10px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", fontSize: "0.9rem" }}>
                                   <strong style={{ color: "#0f172a" }}>{match.name}</strong> 
                                   {match.fixed_amount ? <span style={{ color: "#16a34a", fontSize: "0.8rem", marginLeft: "5px" }}>(Auto-Fixed: ₹{match.fixed_amount})</span> : (match.mc ? <span style={{ color: "#16a34a", fontSize: "0.8rem", marginLeft: "5px" }}>(Auto-MC: ₹{match.mc}/g)</span> : "")}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: "10px", fontSize: "0.85rem", color: "#64748b", fontStyle: "italic" }}>No master items match...</div>
                        )}
                     </div>
                  )}
                </div>

                <Input value={item.hsn} onChange={(e) => updateItem(item.id, "hsn", e.target.value)} placeholder="HSN" style={{ flex: "1 1 60px" }} />
                <Input value={item.weight} onChange={(e) => updateItem(item.id, "weight", e.target.value)} placeholder="Weight" style={{ flex: "1 1 70px" }} />
                <Input value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} placeholder="Qty" style={{ flex: "1 1 50px" }} />
                <Input value={item.mc_override} onChange={(e) => updateItem(item.id, "mc_override", e.target.value)} placeholder="Custom MC ₹/g" style={{ flex: "1 1 100px" }} />
                <Input value={item.rate_override} onChange={(e) => updateItem(item.id, "rate_override", e.target.value)} placeholder="Custom Silver Rate" style={{ flex: "1 1 100px" }} />
                <Input value={item.amount_override} onChange={(e) => updateItem(item.id, "amount_override", e.target.value)} placeholder="Fixed Amount ₹" style={{ flex: "1 1 100px" }} />
                <Button type="button" variant="outline" onClick={() => { setItems((prev) => prev.filter((row) => row.id !== item.id)); markDirty(); }} disabled={(items || []).length === 1}>Remove</Button>
              </div>
            ))}
            <Button 
               type="button" 
                onClick={() => { 
                const defaultDesc = mode === "invoice" ? "Silver Ornaments" : "";
                 setItems((prev) => [...prev, createItem(settings.default_hsn, defaultDesc)]); 
                 markDirty(); 
               }}
              >
             Add Item
           </Button>
          </div>

          <div className="control-card">
            <h3>Adjustments & Credits</h3>
            <Input id="appliedCreditInput" type="number" value={appliedCredit} onChange={(e) => { setAppliedCredit(e.target.value); markDirty(); }} placeholder={`Use Store Credit (Max: ₹${money(customer.credit || 0)})`} />
            <Input id="redeemedPointsInput" type="number" value={redeemedPoints} onChange={(e) => { setRedeemedPoints(e.target.value); markDirty(); }} placeholder={`Redeem Points (Max: ${customer.points || 0})`} />
            <Input id="discountInput" value={discount} onChange={(e) => { setDiscount(e.target.value); markDirty(); }} placeholder="Discount" />
            {settings.enable_exchange_field && (
              <Input value={exchange} onChange={(e) => { setExchange(e.target.value); markDirty(); }} placeholder="Exchange Amount" />
            )}
            <Input value={savedCredit} onChange={(e) => { setSavedCredit(e.target.value); markDirty(); }} placeholder="Save as Store Credit (For negative totals)" />
            <Input value={manualRoundOff} onChange={(e) => { setManualRoundOff(e.target.value); markDirty(); }} placeholder="Manual round off (optional)" />
          </div>

          <div className="control-card">
            <h3>Payment Options</h3>
            {upiAmountToPay > 0 && (
              <Button onClick={() => sendQrToDisplay(upiAmountToPay, upiId)} disabled={isMqttSending} style={{ width: "100%", marginBottom: "15px", backgroundColor: "#0f172a", color: "white", height: "50px", fontSize: "1rem", border: "2px solid #cbd5e1" }}>
                {isMqttSending ? "Processing..." : "🖥️ Show QR on Shop Display"}
              </Button>
            )}

            <label className="select-label">Transaction Type</label>
            <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
              <Button variant={txType === "sale" ? "default" : "outline"} onClick={() => {setTxType("sale"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Sale</Button>
              <Button variant={txType === "booking" ? "default" : "outline"} onClick={() => {setTxType("booking"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Booking</Button>
              <Button variant={txType === "service" ? "default" : "outline"} onClick={() => {setTxType("service"); markDirty();}} style={{flex: 1, padding: "0 5px"}}>Service</Button>
            </div>

            {txType === "sale" && (
              <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <label className="select-label">Payment Method</label>
                <select id="paymentMethodSelect" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); markDirty(); }} className="native-select">
                  <option value="" disabled>Select Method</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  {mode === "invoice" && (
                    <>
                      <option value="Debit Card">Debit Card</option>
                      <option value="Credit Card">Credit Card</option>
                    </>
                  )}
                  <option value="Split">Split (Cash + UPI)</option>
                </select>
                {paymentMethod === "Split" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Input value={splitCash} onChange={(e) => { setSplitCash(e.target.value); markDirty(); }} placeholder="Cash Received ₹" />
                    <Input value={`UPI: ₹${money(Math.max(0, computed.grandTotal - num(splitCash)))}`} disabled style={{ backgroundColor: "#f1f5f9" }} />
                  </div>
                )}
                <div style={{ marginTop: "15px", padding: "12px", backgroundColor: isPaymentDone ? "#dcfce7" : "#fef3c7", border: `1.5px solid ${isPaymentDone ? "#22c55e" : "#f59e0b"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={() => { 
                   const next = !isPaymentDone; 
                   setIsPaymentDone(next); 
                   markDirty(); 
                   if (next && iotOnline) sendSuccessToDisplay();
                }}>
                  <input type="checkbox" checked={isPaymentDone} onChange={(e) => { 
                    const next = e.target.checked; 
                    setIsPaymentDone(next); 
                    markDirty(); 
                    if (next && iotOnline) sendSuccessToDisplay();
                  }} onClick={(e) => e.stopPropagation()} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                  <strong style={{ color: isPaymentDone ? "#166534" : "#b45309", fontSize: "1.1rem" }}>{isPaymentDone ? "✅ PAYMENT DONE" : "⏳ PAYMENT PENDING"}</strong>
                </div>
              </div>
            )}

            {(txType === "booking" || txType === "service") && (
              <div style={{ backgroundColor: '#f8fafc', padding: '15px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#16a34a' }}>Advance Payment</h4>
                <Input placeholder="Advance Received ₹" value={advanceAmount} onChange={e => {setAdvanceAmount(e.target.value); markDirty();}} style={{ marginBottom: '10px' }} />
                <select value={advanceMethod} onChange={(e) => { setAdvanceMethod(e.target.value); markDirty(); }} className="native-select">
                  <option value="" disabled>Select Advance Method</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  {mode === "invoice" && (
                    <>
                      <option value="Debit Card">Debit Card</option>
                      <option value="Credit Card">Credit Card</option>
                    </>
                  )}
                  <option value="Split">Split (Cash + UPI)</option>
                </select>
                {advanceMethod === "Split" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Input value={advanceSplitCash} onChange={(e) => { setAdvanceSplitCash(e.target.value); markDirty(); }} placeholder="Cash Portion ₹" />
                    <Input value={`UPI: ₹${money(Math.max(0, num(advanceAmount) - num(advanceSplitCash)))}`} disabled style={{ backgroundColor: "#f1f5f9" }} />
                  </div>
                )}
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: isAdvancePaid ? "#dcfce7" : "#fef3c7", border: `1px solid ${isAdvancePaid ? "#22c55e" : "#f59e0b"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={() => { 
                   const next = !isAdvancePaid; 
                   setIsAdvancePaid(next); 
                   markDirty(); 
                   if (next && iotOnline) sendSuccessToDisplay();
                }}>
                  <input type="checkbox" checked={isAdvancePaid} onChange={(e) => { 
                    const next = e.target.checked; 
                    setIsAdvancePaid(next); 
                    markDirty(); 
                    if (next && iotOnline) sendSuccessToDisplay();
                  }} onClick={(e) => e.stopPropagation()} style={{ width: "16px", height: "16px" }} />
                  <strong style={{ color: isAdvancePaid ? "#166534" : "#b45309" }}>{isAdvancePaid ? "✅ ADVANCE COLLECTED" : "⏳ ADVANCE PENDING"}</strong>
                </div>

                <div style={{ borderTop: '2px dashed #cbd5e1', margin: '20px 0' }}></div>
                <h4 style={{ margin: '0 0 10px 0', color: '#dc2626', display: 'flex', justifyContent: 'space-between' }}>Balance Payment<span>Due: ₹{money(Math.max(0, computed.grandTotal - num(advanceAmount)))}</span></h4>
                <select value={balanceMethod} onChange={(e) => { setBalanceMethod(e.target.value); markDirty(); }} className="native-select">
                  <option value="" disabled>Select Balance Method</option>
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI</option>
                  {mode === "invoice" && (
                    <>
                      <option value="Debit Card">Debit Card</option>
                      <option value="Credit Card">Credit Card</option>
                    </>
                  )}
                  <option value="Split">Split (Cash + UPI)</option>
                </select>
                {balanceMethod === "Split" && (
                  <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                    <Input value={balanceSplitCash} onChange={(e) => { setBalanceSplitCash(e.target.value); markDirty(); }} placeholder="Cash Portion ₹" />
                    <Input value={`UPI: ₹${money(Math.max(0, (computed.grandTotal - num(advanceAmount)) - num(balanceSplitCash)))}`} disabled style={{ backgroundColor: "#f1f5f9" }} />
                  </div>
                )}
                <div style={{ marginTop: "15px", padding: "10px", backgroundColor: isBalancePaid ? "#dcfce7" : "#fef3c7", border: `1px solid ${isBalancePaid ? "#22c55e" : "#f59e0b"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer" }} onClick={() => { 
                   const next = !isBalancePaid; 
                   setIsBalancePaid(next); 
                   markDirty(); 
                   if (next && iotOnline) sendSuccessToDisplay();
                }}>
                  <input type="checkbox" checked={isBalancePaid} onChange={(e) => { 
                    const next = e.target.checked; 
                    setIsBalancePaid(next); 
                    markDirty(); 
                    if (next && iotOnline) sendSuccessToDisplay();
                  }} onClick={(e) => e.stopPropagation()} style={{ width: "16px", height: "16px" }} />
                  <strong style={{ color: isBalancePaid ? "#166534" : "#b45309" }}>{isBalancePaid ? "✅ BALANCE COLLECTED" : "⏳ BALANCE PENDING"}</strong>
                </div>
              </div>
            )}
            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} placeholder="Notes / Descriptions" className="notes-box" style={{ marginTop: "15px" }} />
          </div>

          <div className="control-card action-grid">
            <Button onClick={saveBill} disabled={savingBill} style={{ backgroundColor: "#0f172a" }}>{savingBill ? "Saving..." : currentBillId ? `Update & Migrate (${editingDocNumber})` : "Save Bill"}</Button>
            <Button onClick={() => setShowLedger(true)} style={{ backgroundColor: "#16a34a", color: "white" }}>Daily Sales & Ledger</Button>
            <Button onClick={() => { setShowRecentBills(true); setBillSearchQuery(""); setRecentBranchFilter("ALL"); setRecentModeFilter("ALL"); setRecentDateFilter("ALL"); }} variant="outline">Recent Bills</Button>
            <Button onClick={() => downloadPdf("bill-print-root", documentNumber || mode)}>Download PDF</Button>
            <Button onClick={() => { setPrintType("bill"); setTimeout(() => window.print(), 100); }}>Print</Button>
            <Button onClick={shareWhatsApp}>WhatsApp Link</Button>
            <Button onClick={shareEmail}>Email Link</Button>
            <Button onClick={handleNewBillClick} variant="outline">New Bill</Button>
            <Button onClick={() => setShowInventory(true)} variant="outline"><Package size={16} style={{marginRight:"5px"}}/> Inventory</Button>
            <Button onClick={() => setShowSettings(true)} variant="outline">Settings</Button>
          </div>
        </aside>
      </main>

      {/* DAILY SALES & LEDGER DRAWER */}
      {showLedger && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", maxWidth: "650px", backgroundColor: "white", zIndex: 100, boxShadow: "-5px 0 25px rgba(0,0,0,0.2)", overflowY: "auto" }}>
          <div className="drawer-header" style={{ backgroundColor: "#f0fdf4", borderBottom: "2px solid #bbf7d0", padding: "20px", position: "sticky", top: 0, zIndex: 10 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap", margin: 0 }}><Banknote /> Vaults & Ledger: {activeGlobalBranch.name}</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowLedger(false)} style={{ marginTop: "10px" }}><ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Close Menu</span></Button>
          </div>

          <div style={{ padding: "20px" }}>
            <Button onClick={() => setShowAnalytics(true)} style={{ backgroundColor: "#8b5cf6", color: "white", width: "100%", marginBottom: "20px", padding: "15px", fontSize: "1.1rem" }}><LineChart size={20} style={{ marginRight: "10px" }} /> Analyze Business Growth</Button>

            <div style={{ marginBottom: "25px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Live Vault Balances</h4>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <div style={{ flex: "1 1 140px", backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
                  <Banknote size={24} color="#d97706" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ margin: "0 0 5px 0", fontSize: "0.85rem", color: "#92400e", fontWeight: "bold" }}>Cash Drawer</p>
                  {editingBalances ? (
                      <Input type="number" value={manualCash} onChange={(e) => setManualCash(e.target.value)} style={{ textAlign: "center", marginTop: "5px" }} />
                  ) : (
                      <h3 style={{ margin: 0, color: "#b45309", fontSize: "1.3rem" }}>₹{money(activeGlobalBranch.cash_balance)}</h3>
                  )}
                </div>
                <div style={{ flex: "1 1 140px", backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
                  <Wallet size={24} color="#2563eb" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ margin: "0 0 5px 0", fontSize: "0.85rem", color: "#1e40af", fontWeight: "bold" }}>Estimate Bank</p>
                  {editingBalances ? (
                      <Input type="number" value={manualEstBank} onChange={(e) => setManualEstBank(e.target.value)} style={{ textAlign: "center", marginTop: "5px" }} />
                  ) : (
                      <h3 style={{ margin: 0, color: "#1d4ed8", fontSize: "1.3rem" }}>₹{money(activeGlobalBranch.estimate_bank_balance)}</h3>
                  )}
                </div>
                <div style={{ flex: "1 1 140px", backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
                  <Building2 size={24} color="#dc2626" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ margin: "0 0 5px 0", fontSize: "0.85rem", color: "#991b1b", fontWeight: "bold" }}>GST Bank</p>
                  {editingBalances ? (
                      <Input type="number" value={manualInvBank} onChange={(e) => setManualInvBank(e.target.value)} style={{ textAlign: "center", marginTop: "5px" }} />
                  ) : (
                      <h3 style={{ margin: 0, color: "#b91c1c", fontSize: "1.3rem" }}>₹{money(activeGlobalBranch.invoice_bank_balance)}</h3>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", marginTop: "10px" }}>
                 {!editingBalances ? (
                   <Button size="sm" variant="outline" onClick={() => { setManualCash(activeGlobalBranch.cash_balance || 0); setManualEstBank(activeGlobalBranch.estimate_bank_balance || 0); setManualInvBank(activeGlobalBranch.invoice_bank_balance || 0); setEditingBalances(true); }}>Manually Edit Balances</Button>
                 ) : (
                   <div style={{ display: "inline-flex", gap: "10px" }}>
                       <Button size="sm" variant="outline" onClick={() => setEditingBalances(false)}>Cancel</Button>
                       <Button size="sm" style={{ backgroundColor: "#16a34a" }} onClick={saveBalances}>Save Balances</Button>
                   </div>
                 )}
              </div>
            </div>

            <div style={{ marginBottom: "30px", padding: "15px", backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: "0" }}>Log Expenses & Vault Exchanges</h4>
                <Button size="sm" onClick={() => setShowLogForm(!showLogForm)} style={{ backgroundColor: "#0f172a" }}><Plus size={16} style={{ marginRight: "5px" }} /> New Entry</Button>
              </div>
              {showLogForm && (
                <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #cbd5e1" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flex: "1 1 150px" }}>
                        <label className="select-label">Transaction Type</label>
                        <select value={logType} onChange={(e) => setLogType(e.target.value)} className="native-select">
                            <option value="expense">Expense (Deduct Money)</option>
                            <option value="add">Add Funds (Add Money)</option>
                            <option value="exchange">Exchange (Move Vault to Vault)</option>
                        </select>
                    </div>
                    <div style={{ flex: "1 1 150px" }}>
                        <label className="select-label">Amount (₹)</label>
                        <Input type="number" placeholder="e.g. 500" value={logAmount} onChange={(e) => setLogAmount(e.target.value)} />
                    </div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flex: "1 1 150px" }}>
                        <label className="select-label">{logType === "add" ? "To Vault" : "From Vault"}</label>
                        <select value={logSourceVault} onChange={(e) => setLogSourceVault(e.target.value)} className="native-select">
                            <option value="cash">Cash Drawer</option>
                            <option value="estimate_bank">Estimate Bank</option>
                            <option value="invoice_bank">GST Bank</option>
                        </select>
                    </div>
                    {logType === "exchange" && (
                        <div style={{ flex: "1 1 150px" }}>
                            <label className="select-label">To Vault</label>
                            <select value={logTargetVault} onChange={(e) => setLogTargetVault(e.target.value)} className="native-select">
                                <option value="cash">Cash Drawer</option>
                                <option value="estimate_bank">Estimate Bank</option>
                                <option value="invoice_bank">GST Bank</option>
                            </select>
                        </div>
                    )}
                  </div>
                  <label className="select-label">Reason / Remark</label>
                  <Input placeholder="e.g. Paid for Lunch, Transfer to Bank..." value={logReason} onChange={(e) => setLogReason(e.target.value)} style={{ marginBottom: "15px" }} />
                  <div style={{ display: "flex", gap: "10px" }}>
                      <Button variant="outline" onClick={() => setShowLogForm(false)} style={{ flex: 1 }}>Cancel</Button>
                      <Button onClick={submitLedgerLog} disabled={submittingLog} style={{ flex: 2, backgroundColor: "#16a34a" }}>{submittingLog ? "Saving..." : "Save Transaction"}</Button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "30px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Today's Bill Collections ({today()})</h4>
              {ledgerLoading ? (<p>Calculating today's sales...</p>) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", backgroundColor: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                      <span style={{ color: "#475569" }}>Physical Cash Collected:</span>
                      <strong style={{ color: "#d97706" }}>+ ₹{money(todaysTotalCash)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                      <span style={{ color: "#475569" }}>Estimate Bank Collected:</span>
                      <strong style={{ color: "#2563eb" }}>+ ₹{money(todaysTotalEstBank)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap" }}>
                      <span style={{ color: "#475569" }}>GST Bank Collected:</span>
                      <strong style={{ color: "#dc2626" }}>+ ₹{money(todaysTotalInvBank)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", marginTop: "10px", paddingTop: "10px", borderTop: "2px solid #cbd5e1" }}>
                      <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Total Day Sales:</span>
                      <strong style={{ fontSize: "1.1rem" }}>₹{money(todaysTotalCash + todaysTotalEstBank + todaysTotalInvBank)}</strong>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "30px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}><History size={18} /> Ledger History (Expenses & Exchanges)</h4>
              {(ledgerLogs || []).length === 0 ? (<p style={{ color: "#666", fontStyle: "italic" }}>No manual transactions logged yet.</p>) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {(ledgerLogs || []).map(log => (
                    <div key={log.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                          <strong style={{ color: "#0f172a" }}>{log.reason}</strong>
                          <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{new Date(log.date).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {log.cash_change !== 0 && (<span style={{ color: log.cash_change > 0 ? "#16a34a" : "#dc2626" }}>Cash: {log.cash_change > 0 ? "+" : ""}₹{money(log.cash_change)}</span>)}
                        {log.estimate_bank_change !== 0 && (<span style={{ color: log.estimate_bank_change > 0 ? "#16a34a" : "#dc2626" }}>Est Bank: {log.estimate_bank_change > 0 ? "+" : ""}₹{money(log.estimate_bank_change)}</span>)}
                        {log.invoice_bank_change !== 0 && (<span style={{ color: log.invoice_bank_change > 0 ? "#16a34a" : "#dc2626" }}>GST Bank: {log.invoice_bank_change > 0 ? "+" : ""}₹{money(log.invoice_bank_change)}</span>)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Today's Bills</h4>
              {ledgerLoading ? (<p>Loading bills...</p>) : (todayBills || []).length === 0 ? (<p style={{ color: "#666" }}>No bills generated today yet.</p>) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {(todayBills || []).map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "white" }}>
                      <div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <strong style={{ color: b.mode === 'invoice' ? "#dc2626" : "#2563eb" }}>{b.document_number}</strong>
                          <span style={{ fontSize: "0.75rem", padding: "2px 6px", backgroundColor: (b.tx_type === "sale" ? b.is_payment_done : b.is_balance_paid) ? "#dcfce7" : "#fee2e2", color: (b.tx_type === "sale" ? b.is_payment_done : b.is_balance_paid) ? "#166534" : "#991b1b", borderRadius: "4px" }}>
                            {(b.tx_type === "sale" ? b.is_payment_done : b.is_balance_paid) ? "Paid" : "Pending"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#475569" }}>{b.customer_name || b.customer?.name || "Unknown"} • {b.tx_type || "Sale"}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: "1.1rem" }}>₹{money(b.totals?.grand_total || 0)}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

   
     {/* RECENT BILLS DRAWER */}
      {showRecentBills && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", maxWidth: "550px", backgroundColor: "white", zIndex: 100, boxShadow: "-5px 0 25px rgba(0,0,0,0.2)", overflowY: "auto" }}>
          <div className="drawer-header" style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 10, paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "20px 20px 10px 20px" }}>Recent Bills & Exports</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowRecentBills(false)} style={{ marginLeft: "20px" }}><ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Close Menu</span></Button>
          </div>

          <div style={{ padding: "15px" }}>
            {/* RECYCLE BIN TOGGLE */}
            <Button 
                variant={showRecycleBin ? "default" : "outline"} 
                style={{ width: "100%", marginBottom: "15px", backgroundColor: showRecycleBin ? "#ef4444" : "white", color: showRecycleBin ? "white" : "#ef4444", borderColor: "#ef4444" }}
                onClick={() => setShowRecycleBin(!showRecycleBin)}
            >
                🗑️ {showRecycleBin ? "Back to Active Bills" : "View Recycle Bin (Deleted Bills)"}
            </Button>

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
            </div>

            {showRecycleBin ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <h4 style={{ color: "#991b1b", marginTop: 0, marginBottom: "5px" }}>Recycle Bin</h4>
                <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: 0 }}>These bills were safely removed from your dashboard.</p>
                {(settings.deleted_bills || []).length === 0 ? (<p style={{ textAlign: "center", color: "#64748b", padding: "20px" }}>Recycle bin is empty.</p>) : (
                  (settings.deleted_bills || []).map((bill, index) => (
                    <div key={index} className="recent-bill-card" style={{ padding: "15px", border: "1px dashed #fca5a5", borderRadius: "8px", backgroundColor: "#fef2f2" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <strong style={{ fontSize: "1.1rem", color: "#991b1b", textDecoration: "line-through" }}>{bill.document_number}</strong>
                        <span style={{ fontSize: "0.85rem", color: "#ef4444", fontWeight: "bold" }}>Deleted: {bill.deleted_at}</span>
                      </div>
                      <p style={{ margin: "0 0 5px 0", fontWeight: "bold" }}>{bill.customer_name || bill.customer?.name || "Unknown Customer"}</p>
                      <p style={{ margin: "0 0 12px 0", fontSize: "0.9rem", color: "#b91c1c" }}>Total: ₹{money(bill.totals?.grand_total || 0)}</p>
                      
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <Button size="sm" style={{ flex: 1, backgroundColor: "#16a34a", color: "white" }} onClick={() => handleRestoreDeletedBill(bill)}>🔄 Restore</Button>
                        <Button size="sm" style={{ flex: 1, backgroundColor: "#0f172a", color: "white" }} onClick={() => handleEditFromBin(bill)}>✏️ Edit</Button>
                        <Button size="sm" variant="outline" style={{ borderColor: "#ef4444", color: "#ef4444", flex: "0 0 60px" }} onClick={() => handlePermanentWipe(bill.id)}>🗑️ Wipe</Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : loadingRecent ? (<p style={{ textAlign: "center", padding: "20px" }}>Loading recent bills...</p>) : (
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

    {/* INVENTORY MANAGER DRAWER */}
      {showInventory && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", maxWidth: "550px", backgroundColor: "white", zIndex: 105, boxShadow: "-5px 0 25px rgba(0,0,0,0.2)", overflowY: "auto" }}>
          <div className="drawer-header" style={{ backgroundColor: "#f8fafc", borderBottom: "1px solid #e2e8f0", padding: "20px", position: "sticky", top: 0, zIndex: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
               <h3 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0 }}><Package /> Stock & Inventory</h3>
               <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                 <Button onClick={() => setShowInvLogs(!showInvLogs)} variant={showInvLogs ? "default" : "outline"} style={{ backgroundColor: showInvLogs ? "#0f172a" : "white", color: showInvLogs ? "white" : "#0f172a" }}>
                    <Lock size={16} style={{ marginRight: "5px" }}/> {showInvLogs ? "Hide History" : "Stock History"}
                 </Button>
                 <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowInventory(false)}>
                    <ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Back</span>
                 </Button>
               </div>
            </div>
          </div>
          
          <div style={{ padding: "20px" }}>
            {showInvLogs && (
              <div style={{ marginBottom: "25px", padding: "15px", backgroundColor: "#f1f5f9", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                  <h4 style={{ margin: 0, color: "#0f172a" }}>Stock Addition History</h4>
                  <Button size="sm" onClick={() => downloadPdf("inventory-log-root", `Inventory_Log_${today()}`)} style={{ backgroundColor: "#16a34a", color: "white" }}><Download size={14} style={{ marginRight: "5px" }} /> Save PDF</Button>
                </div>
                <div id="inventory-log-root" style={{ backgroundColor: "white", padding: "15px", borderRadius: "6px", border: "1px dashed #cbd5e1", maxHeight: "400px", overflowY: "auto" }}>
                <h2 className="print-only" style={{ textAlign: "center", marginBottom: "20px" }}>{settings.shop_name} - Stock Addition Log</h2>
                  {(() => {
                    const branchLogs = (settings.inventory_logs || []).filter(log => log.branch_id === globalBranchId);
                    if (branchLogs.length === 0) return <p style={{ color: "#64748b", fontSize: "0.9rem" }}>No stock added yet for this branch.</p>;
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid #cbd5e1", textAlign: "left" }}>
                            <th style={{ padding: "8px" }}>Date</th>
                            <th style={{ padding: "8px" }}>Item Name</th>
                            <th style={{ padding: "8px" }}>Qty Added</th>
                            <th style={{ padding: "8px" }}>Weight Added</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchLogs.map(log => (
                            <tr key={log.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                              <td style={{ padding: "8px" }}>{log.date}</td>
                              <td style={{ padding: "8px", fontWeight: "bold" }}>{log.name}</td>
                              <td style={{ padding: "8px", color: "#0284c7" }}>+{log.quantity || 0} Pcs</td>
                              <td style={{ padding: "8px", color: "#16a34a" }}>+{log.weight} {log.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            )}

            <div style={{ padding: "15px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd", marginBottom: "20px" }}>
              <h4 style={{ margin: "0 0 10px 0", color: "#0369a1" }}>Add Incoming Stock</h4>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Input placeholder="Item Name (e.g. CB Payal)" value={invItemName} onChange={(e) => setInvItemName(e.target.value)} style={{ flex: "1 1 100%" }} />
                <div style={{ display: "flex", gap: "10px", width: "100%" }}>
                   <Input type="number" placeholder="Qty (Pieces)" value={invQuantity} onChange={(e) => setInvQuantity(e.target.value)} style={{ flex: 1 }} />
                   <Input type="number" placeholder="Weight" value={invWeight} onChange={(e) => setInvWeight(e.target.value)} style={{ flex: 1.5 }} />
                   <select value={invUnit} onChange={(e) => setInvUnit(e.target.value)} className="native-select" style={{ flex: 0.8 }}>
                      <option value="g">Grams</option>
                      <option value="kg">KGs</option>
                   </select>
                </div>
              </div>
              <Button style={{ width: "100%", marginTop: "15px", backgroundColor: "#0284c7" }} onClick={() => {
                 if(!invItemName || !invWeight) return toast.error("Enter item name and weight.");
                 const weightGrams = num(invWeight) * (invUnit === "kg" ? 1000 : 1);
                 const addedQty = num(invQuantity) || 0; // Default to 0 if left blank
                 
                 let currentInv = [...(settings.inventory || [])];
                 let currentLogs = [...(settings.inventory_logs || [])];

                // NEW: Tag new stock and logs with globalBranchId
                 const existingIndex = currentInv.findIndex(i => i.name.toLowerCase() === invItemName.toLowerCase().trim() && i.branch_id === globalBranchId);
                 if (existingIndex !== -1) { 
                     currentInv[existingIndex].weightInGrams += weightGrams; 
                     currentInv[existingIndex].quantity = (currentInv[existingIndex].quantity || 0) + addedQty;
                 } else { 
                     currentInv.push({ id: Date.now().toString(), name: invItemName.trim(), weightInGrams: weightGrams, quantity: addedQty, branch_id: globalBranchId }); 
                 }

                 const newLog = { id: Date.now().toString(), date: today(), name: invItemName.trim(), weight: invWeight, unit: invUnit, quantity: addedQty, branch_id: globalBranchId };

                 currentLogs.unshift(newLog); 

                 const newSettings = { ...settings, inventory: currentInv, inventory_logs: currentLogs };
                 setSettings(newSettings);
                 setInvItemName(""); 
                 setInvWeight("");
                 setInvQuantity(""); // Clear the quantity input
                 
                 axios.put(`${API}/settings`, newSettings, { headers: authHeaders })
                      .then(() => toast.success("Stock added and logged!"))
                      .catch(() => toast.error("Failed to save stock"));
              }}>+ Add to Inventory</Button>
            </div>

            <h4 style={{ margin: "0 0 15px 0" }}>Current Stock Levels</h4>
            {/* NEW: Added .filter() so you only see the stock for the branch you are currently viewing */}
            {(settings.inventory || []).filter(inv => inv.branch_id === globalBranchId).length === 0 ? <p style={{ color: "#64748b" }}>No inventory items added for this branch yet.</p> : (
               <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                 {(settings.inventory || []).filter(inv => inv.branch_id === globalBranchId).map((inv, idx) => (
                    <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid #cbd5e1", borderRadius: "8px", backgroundColor: "white" }}>
                       <strong style={{ fontSize: "1.1rem" }}>{inv.name}</strong>
                       <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                          <span style={{ fontSize: "1rem", color: "#475569", fontWeight: "600", backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: "4px" }}>
                             {inv.quantity || 0} Pcs
                          </span>
                          <span style={{ fontSize: "1.1rem", color: inv.weightInGrams > 500 ? "#16a34a" : "#b45309", fontWeight: "bold" }}>
                             {inv.weightInGrams >= 1000 ? `${(inv.weightInGrams / 1000).toFixed(3)} KG` : `${inv.weightInGrams.toFixed(2)} g`}
                          </span>
                          <Button size="sm" variant="outline" onClick={() => {
                             if(!window.confirm(`Remove ${inv.name} from inventory?`)) return;
                             const newInv = [...settings.inventory]; 
                             newInv.splice(idx, 1);
                             const newSettings = { ...settings, inventory: newInv };
                             setSettings(newSettings);
                             axios.put(`${API}/settings`, newSettings, { headers: authHeaders });
                          }} style={{ borderColor: "#ef4444", color: "#ef4444", padding: "0 8px" }}>X</Button>
                       </div>
                    </div>
                 ))}
               </div>
            )}
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginTop: "15px", lineHeight: "1.4" }}>*Stock weight and quantity are automatically deducted when bills are successfully saved for these exact item names.</p>
          </div>
        </section>
      )}
{/* ANALYTICS DASHBOARD DRAWER */}
      {showAnalytics && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", backgroundColor: "#f8fafc", zIndex: 102, overflowY: "auto" }}>
          <div className="drawer-header" style={{ backgroundColor: "white", borderBottom: "1px solid #e2e8f0", padding: "20px 40px", position: "sticky", top: 0, zIndex: 10, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px", margin: 0 }}><LineChart /> Business Analytics</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowAnalytics(false)}><ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Close Menu</span></Button>
          </div>
          
          <div style={{ padding: "40px", maxWidth: "1400px", margin: "0 auto" }}>
             <select value={analyticsFilter} onChange={(e) => setAnalyticsFilter(e.target.value)} className="native-select" style={{ width: "100%", maxWidth: "300px", marginBottom: "30px", fontSize: "1.1rem", padding: "10px" }}>
                <option value="TODAY">Current Day</option>
                <option value="THIS_WEEK">Current Week</option>
                <option value="THIS_HALF_MONTH">Current Half Month (15 Days)</option>
                <option value="THIS_MONTH">Current Month</option>
                <option value="LAST_MONTH">Previous Month</option>
                <option value="LAST_3_MONTHS">Previous 3 Months</option>
                <option value="LAST_6_MONTHS">Previous 6 Months</option>
                <option value="THIS_YEAR">Previous Year (365 Days)</option>
                <option value="ALL_TIME">Since Opening</option>
             </select>

             {(() => {
                const now = new Date();
                const parseDate = (dStr) => {
                    if (!dStr) return new Date();
                    const p = dStr.split("-");
                    if (p.length === 3 && p[0].length === 2) return new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
                    return new Date(dStr);
                };

                const filteredStats = (recentBillsList || []).filter(bill => {
                   const bDate = parseDate(bill.date);
                   const diffDays = (now - bDate) / (1000 * 60 * 60 * 24);
                   
                   switch(analyticsFilter) {
                      case "TODAY": return diffDays < 1 && bDate.getDate() === now.getDate();
                      case "THIS_WEEK": return diffDays <= 7;
                      case "THIS_HALF_MONTH": return diffDays <= 15;
                      case "THIS_MONTH": return bDate.getMonth() === now.getMonth() && bDate.getFullYear() === now.getFullYear();
                      case "LAST_MONTH": return bDate.getMonth() === (now.getMonth() === 0 ? 11 : now.getMonth() - 1) && bDate.getFullYear() === (now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear());
                      case "LAST_3_MONTHS": return diffDays <= 90;
                      case "LAST_6_MONTHS": return diffDays <= 180;
                      case "THIS_YEAR": return diffDays <= 365;
                      case "ALL_TIME": return true;
                      default: return true;
                   }
                });

                const totalRevenue = filteredStats.reduce((sum, b) => sum + num(b.totals?.grand_total), 0);
                const totalInvoices = filteredStats.filter(b => b.mode === "invoice").length;
                const totalEstimates = filteredStats.filter(b => b.mode === "estimate").length;

                const chartDataMap = {};
                filteredStats.forEach(b => {
                   const bDate = b.date;
                   if(!chartDataMap[bDate]) chartDataMap[bDate] = 0;
                   chartDataMap[bDate] += num(b.totals?.grand_total);
                });

                const sortedDates = Object.keys(chartDataMap).sort((a, b) => parseDate(a) - parseDate(b));
                const chartData = sortedDates.map(date => ({ date, amount: chartDataMap[date] }));
                const maxAmount = Math.max(...chartData.map(d => d.amount), 1); 

                return (
                   <div>
                      <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", marginBottom: "30px" }}>
                         <div style={{ flex: "1 1 300px", padding: "30px", backgroundColor: "#8b5cf6", color: "white", borderRadius: "12px", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}>
                            <p style={{ margin: "0 0 10px 0", fontSize: "1rem", opacity: 0.9 }}>Total Revenue</p>
                            <h2 style={{ margin: 0, fontSize: "2.5rem" }}>₹{money(totalRevenue)}</h2>
                         </div>
                         <div style={{ flex: "1 1 200px", padding: "30px", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "12px" }}>
                            <p style={{ margin: "0 0 10px 0", fontSize: "1rem", color: "#64748b" }}>Total Bills</p>
                            <h2 style={{ margin: 0, fontSize: "2.5rem", color: "#0f172a" }}>{filteredStats.length}</h2>
                         </div>
                      </div>

                      <div style={{ padding: "30px", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "12px", marginBottom: "30px" }}>
                         <h4 style={{ margin: "0 0 20px 0", color: "#0f172a", fontSize: "1.2rem" }}>Revenue Trend</h4>
                         {chartData.length === 0 ? (
                            <p style={{ fontSize: "1rem", color: "#64748b", textAlign: "center", padding: "40px 0" }}>No data to graph.</p>
                         ) : (
                            <div style={{ width: "100%" }}>
                               <div style={{ height: "350px", display: "flex", alignItems: "flex-end", gap: chartData.length > 20 ? "2px" : "15px", borderBottom: "2px solid #e2e8f0", paddingBottom: "5px", width: "100%", paddingTop: "50px", justifyContent: "center" }}>
                                  {chartData.map((d, i) => (
                                     <div key={i} style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", flex: 1, maxWidth: "60px", height: "100%" }}>
                                        <span style={{ fontSize: chartData.length > 20 ? "0.55rem" : "0.7rem", color: "#64748b", marginBottom: "12px", transform: "rotate(-45deg)", transformOrigin: "left bottom", whiteSpace: "nowrap" }}>₹{Math.round(d.amount)}</span>
                                        <div style={{ width: "100%", maxWidth: "45px", height: `${Math.max((d.amount / maxAmount) * 100, 2)}%`, minHeight: "5px", backgroundColor: "#8b5cf6", borderRadius: "4px 4px 0 0", transition: "height 0.3s ease" }} title={`${d.date}: ₹${money(d.amount)}`}></div>
                                        <span style={{ fontSize: chartData.length > 20 ? "0.6rem" : "0.75rem", color: "#475569", marginTop: "8px", fontWeight: "bold", whiteSpace: "nowrap" }}>{d.date.slice(0, 5)}</span>
                                     </div>
                                  ))}
                               </div>
                            </div>
                         )}
                      </div>
                      
                      <div style={{ padding: "30px", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "12px", marginBottom: "20px" }}>
                         <h4 style={{ margin: "0 0 20px 0", color: "#0f172a", fontSize: "1.2rem" }}>Bill Type Breakdown</h4>
                         <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "15px", fontSize: "1.1rem" }}>
                            <div style={{ width: "24px", height: "24px", backgroundColor: "#dc2626", borderRadius: "6px" }}></div>
                            <span style={{ flex: 1 }}>Tax Invoices ({totalInvoices})</span>
                         </div>
                         <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "1.1rem" }}>
                            <div style={{ width: "24px", height: "24px", backgroundColor: "#2563eb", borderRadius: "6px" }}></div>
                            <span style={{ flex: 1 }}>Estimates ({totalEstimates})</span>
                         </div>
                         <div style={{ width: "100%", height: "16px", display: "flex", borderRadius: "8px", overflow: "hidden", marginTop: "25px" }}>
                            <div style={{ width: `${(totalInvoices / (filteredStats.length || 1)) * 100}%`, backgroundColor: "#dc2626", transition: "width 0.5s ease" }}></div>
                            <div style={{ width: `${(totalEstimates / (filteredStats.length || 1)) * 100}%`, backgroundColor: "#2563eb", transition: "width 0.5s ease" }}></div>
                         </div>
                      </div>
                      
                      {filteredStats.length === 0 && <p style={{ textAlign: "center", color: "#64748b", marginTop: "50px", fontSize: "1.1rem" }}>No data found for this time period.</p>}
                   </div>
                );
             })()}
          </div>
        </section>
      )}
      {/* SETTINGS DRAWER */}
      {showSettings && (
        <section className="side-drawer no-print" style={{ position: "fixed", top: 0, bottom: 0, right: 0, width: "100vw", maxWidth: "100vw", backgroundColor: "white", zIndex: 100, boxShadow: "-5px 0 25px rgba(0,0,0,0.2)", overflowY: "auto" }}>
          <div className="drawer-header" style={{ position: "sticky", top: 0, backgroundColor: "white", zIndex: 10, paddingBottom: "15px", borderBottom: "1px solid #e2e8f0" }}>
            <h3 style={{ margin: "20px 20px 10px 20px" }}>System Settings</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowSettings(false)} style={{ marginLeft: "20px" }}><ArrowLeft className="drawer-back-icon" style={{ marginRight: "5px" }} /><span>Close Menu</span></Button>
          </div>
          <div style={{ padding: "15px" }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px", borderBottom: "1px solid #e2e8f0", paddingBottom: "10px", overflowX: "auto" }}>
              <Button variant={settingsTab === "design" ? "default" : "ghost"} onClick={() => setSettingsTab("design")}>Design</Button>
              <Button variant={settingsTab === "business" ? "default" : "ghost"} onClick={() => setSettingsTab("business")}>Business & Branches</Button>
              <Button variant={settingsTab === "advanced" ? "default" : "ghost"} onClick={() => setSettingsTab("advanced")}>Advanced</Button>
              <Button variant={settingsTab === "barcode" ? "default" : "ghost"} onClick={() => setSettingsTab("barcode")}>Barcode Manager</Button>
               <Button variant="outline" style={{ borderColor: "#25D366", color: "#166534", marginLeft: "auto" }} onClick={() => { setShowSettings(false); setShowBroadcastPanel(true); }}>📢 WhatsApp Broadcast</Button>
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
                  <h4>Logos</h4>
                  <label className="select-label">Shop Logo (PNG/JPG)</label>
                  <Input type="file" accept="image/*" onChange={handleLogoUpload} style={{ marginBottom: "10px" }} />
                  {logoUploadName && <p style={{ fontSize: "0.8rem", color: "#16a34a" }}>Selected: {logoUploadName}</p>}
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
             <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 15px 0" }}>Taxes</h4>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 100px" }}>
                          <label className="select-label">CGST (%)</label>
                          <Input type="number" step="0.1" value={settings.cgst_percent || 1.5} onChange={(e) => setSettings({ ...settings, cgst_percent: Number(e.target.value) })} />
                      </div>
                      <div style={{ flex: 1 }}>
                          <label className="select-label">SGST (%)</label>
                          <Input type="number" step="0.1" value={settings.sgst_percent || 1.5} onChange={(e) => setSettings({ ...settings, sgst_percent: Number(e.target.value) })} />
                      </div>
                      <div style={{ flex: "1 1 100px" }}>
                          <label className="select-label">IGST (%)</label>
                          <Input type="number" step="0.1" value={settings.igst_percent || 0} onChange={(e) => setSettings({ ...settings, igst_percent: Number(e.target.value) })} />
                      </div>
                  </div>
              </div>

                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ margin: "0 0 15px 0" }}>Security</h4>
                  <label className="select-label">Admin Email (For Password Reset OTP)</label>
                  <Input type="email" value={settings.admin_email || ""} onChange={(e) => setSettings({ ...settings, admin_email: e.target.value })} placeholder="admin@domain.com" />
                </div>

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
                      
                      <label className="select-label">Google Maps Location URL (For Address Click)</label>
                      <Input value={branch.location_url || ""} onChange={(e) => updateBranch(index, 'location_url', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      <label className="select-label">Google Maps Feedback/Review URL (For ⭐ Button & QR)</label>
                      <Input value={branch.map_url || ""} onChange={(e) => updateBranch(index, 'map_url', e.target.value)} style={{ marginBottom: "10px" }} />

                      <label className="select-label">WhatsApp Group/Chat URL (For Button & QR)</label>
                      <Input value={branch.whatsapp_url || ""} onChange={(e) => updateBranch(index, 'whatsapp_url', e.target.value)} style={{ marginBottom: "10px" }} />

                      <label className="select-label">Instagram URL (For Button & QR)</label>
                      <Input value={branch.instagram_url || ""} onChange={(e) => updateBranch(index, 'instagram_url', e.target.value)} style={{ marginBottom: "10px" }} />

                      <label className="select-label">About Us URL (For Print QR)</label>
                      <Input value={branch.about_url || ""} onChange={(e) => updateBranch(index, 'about_url', e.target.value)} style={{ marginBottom: "10px" }} />
                      
                      <label className="select-label">GSTIN Number (Optional)</label>
                      <Input value={branch.gstin || ""} onChange={(e) => updateBranch(index, 'gstin', e.target.value)} placeholder="Leave blank if no GST" style={{ marginBottom: "10px" }} />
                      <label className="select-label">Tax Invoice Phone Number (Replaces the 3 global numbers)</label>
                      <Input value={branch.invoice_phone || ""} onChange={(e) => updateBranch(index, 'invoice_phone', e.target.value)} placeholder="e.g. +91 9876543210" style={{ marginBottom: "10px" }} />
                      
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

                  <div style={{ padding: "15px", backgroundColor: "#fffbeb", borderRadius: "8px", border: "1px solid #fde68a", marginBottom: "15px" }}>
                    <h4 style={{ margin: "0 0 10px 0", color: "#92400e" }}>Billing Features</h4>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px" }}>
                       <input type="checkbox" checked={settings.enable_exchange_field || false} onChange={(e) => setSettings({ ...settings, enable_exchange_field: e.target.checked })} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                        <strong style={{ color: "#92400e" }}>Enable 'Exchange Amount' Field on Bills</strong>
                          </div>
                         <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                           <input type="checkbox" checked={settings.show_branches_on_invoice ?? true} onChange={(e) => setSettings({ ...settings, show_branches_on_invoice: e.target.checked })} style={{ width: "20px", height: "20px", cursor: "pointer" }} />
                            <strong style={{ color: "#92400e" }}>Show Marketing Footer (Branches, Socials, Feedback) on Tax Invoices</strong>
                          </div>
                             <p style={{ fontSize: "0.75rem", color: "#b45309", marginTop: "5px", marginLeft: "30px", marginBottom: 0 }}>If OFF, the entire bottom section will be hidden on Tax Invoices to keep them strictly legal (will still show on Estimates).</p>
                          </div>

               {/* --- PRINTER / PAPER SIZE SETTINGS --- */}
                <div style={{ padding: "15px", backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "15px" }}>
                  <h4 style={{ margin: "0 0 10px 0", color: "#0f172a", display: "flex", alignItems: "center", gap: "8px" }}>
                    Printer Page Format
                  </h4>
                  <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: "10px" }}>Select the paper size for your printer. The print window will automatically adjust to this size.</p>
                  <select
                     value={settings.paper_size || "A4"}
                     onChange={(e) => setSettings({ ...settings, paper_size: e.target.value })}
                     className="native-select"
                     style={{ width: "100%", padding: "10px", fontSize: "1rem", borderRadius: "6px", border: "1px solid #cbd5e1" }}
                  >
                     <option value="A4">A4 (Standard Document)</option>
                     <option value="A5">A5 (Half Size)</option>
                     <option value="A6">A6 (Quarter Size)</option>
                     <option value="letter">Letter (8.5" x 11")</option>
                     <option value="legal">Legal (8.5" x 14")</option>
                     <option value="80mm">Thermal Receipt (80mm / 3-inch)</option>
                     <option value="58mm">Thermal Receipt (58mm / 2-inch)</option>
                  </select>
                </div>
                
                {/* --- MASTER ITEMS MANAGER --- */}
                <div style={{ padding: "15px", backgroundColor: "#fefce8", borderRadius: "8px", border: "1px solid #fef08a" }}>
                  <h4 style={{ color: "#a16207", margin: "0 0 10px 0" }}>Master Item Settings (Auto-fill & MC)</h4>
                  <p style={{ fontSize: "0.85rem", color: "#854d0e", marginBottom: "15px" }}>Add your inventory names here. This builds your suggestion box and auto-fills Making Charges.</p>
                  
                  <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                     <Button size="sm" style={{ backgroundColor: "#ca8a04", color: "white" }} onClick={() => {
                        const name = prompt("Enter Item Name (e.g. Silver Coin):");
                        if (!name) return;
                        const mc = prompt("Enter default Making Charge per gram (Leave blank if not applicable):");
                        const fixedAmt = prompt("Enter Fixed Amount ₹ (Leave blank if not applicable):");
                        const newSettings = { ...settings, master_items: [...(settings.master_items || []), { id: Date.now().toString(), name, mc: mc ? Number(mc) : null, fixed_amount: fixedAmt ? Number(fixedAmt) : null }] };
                        setSettings(newSettings);
                     }}>+ Add Master Item</Button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", maxHeight: "200px", overflowY: "auto" }}>
                     {(settings.master_items || []).length === 0 ? <p style={{ fontSize: "0.85rem", color: "#a16207" }}>No master items added.</p> : 
                       (settings.master_items || []).map((mi, idx) => (
                         <div key={mi.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px", backgroundColor: "white", border: "1px solid #fde047", borderRadius: "6px" }}>
                            <strong style={{ fontSize: "0.9rem" }}>{mi.name}</strong>
                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                               <span style={{ fontSize: "0.85rem", color: "#16a34a" }}>
                                 {mi.fixed_amount ? `Fixed: ₹${mi.fixed_amount}` : (mi.mc ? `MC: ₹${mi.mc}/g` : "Default Pricing")}
                               </span>
                               <Button size="sm" variant="ghost" onClick={() => {
                                  const newList = [...settings.master_items]; 
                                  newList.splice(idx, 1);
                                  setSettings({ ...settings, master_items: newList });
                               }} style={{ color: "#ef4444", padding: "0 5px", height: "auto" }}>X</Button>
                            </div>
                         </div>
                     ))}
                  </div>
                </div>

                {/* --- IOT DISPLAY SETTINGS --- */}
                <div style={{ padding: "15px", backgroundColor: "#f0f9ff", borderRadius: "8px", border: "1px solid #bae6fd" }}>
                  <h4 style={{ color: "#0369a1", margin: "0 0 10px 0", display: "flex", alignItems: "center", gap: "8px" }}>
                    <Cpu size={18} /> Counter Display Terminal
                  </h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px", backgroundColor: "white", borderRadius: "6px", border: "1px solid #e0f2fe" }}>
                    <div style={{ position: "relative" }}>
                      <span style={{ display: "block", width: "12px", height: "12px", borderRadius: "50%", backgroundColor: iotOnline ? "#22c55e" : "#ef4444" }} />
                      {iotOnline && <span style={{ position: "absolute", top: 0, left: 0, width: "12px", height: "12px", borderRadius: "50%", backgroundColor: "#22c55e", animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite" }} />}
                    </div>
                    <div>
                      <p style={{ margin: 0, fontWeight: "bold", color: "#0c4a6e" }}>{iotOnline ? "DISPLAY ONLINE" : "DISPLAY OFFLINE"}</p>
                      <p style={{ margin: 0, fontSize: "0.75rem", color: "#64748b" }}>
                        {iotOnline ? "Ready to show QR codes and payment animations." : "Check if the shop ESP32 device is powered on."}
                      </p>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.75rem", color: "#64748b", marginTop: "10px" }}>
                    This device is synchronized with your cloud billing app to automate customer payments.
                  </p>
                </div>

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

              {settingsTab === "barcode" && (
              <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                <div style={{ padding: "20px", backgroundColor: "#faf5ff", borderRadius: "12px", border: "1px solid #d8b4fe" }}>
                  <h4 style={{ color: "#7e22ce", margin: "0 0 10px 0" }}>1. Add Items to Printing Queue</h4>
                  <div style={{ position: "relative", marginBottom: "15px" }}>
                    <label className="select-label">Item Name (Suggestions from Master Items)</label>
                    <Input value={bcInputName} onChange={(e) => setBcInputName(e.target.value)} onFocus={() => setBcSuggestFocus(true)} onBlur={() => setTimeout(() => setBcSuggestFocus(false), 200)} placeholder="e.g. CB Payal" />
                    {bcSuggestFocus && bcInputName.length >= 1 && (
                       <div style={{ position: "absolute", top: "100%", left: 0, width: "100%", backgroundColor: "white", border: "1px solid #cbd5e1", borderRadius: "6px", zIndex: 50, maxHeight: "150px", overflowY: "auto", boxShadow: "0 10px 15px rgba(0,0,0,0.1)" }}>
                          {(settings.master_items || []).filter(mi => mi.name.toLowerCase().includes(bcInputName.toLowerCase())).map(match => (
                              <div key={match.id} onMouseDown={(e) => { e.preventDefault(); setBcInputName(match.name); setBcSuggestFocus(false); }} style={{ padding: "10px", borderBottom: "1px solid #f1f5f9", cursor: "pointer", fontSize: "0.9rem" }}><strong>{match.name}</strong></div>
                          ))}
                       </div>
                    )}
                  </div>
                  <div style={{ marginBottom: "15px" }}>
                    <label className="select-label">Item Weight (Grams)</label>
                    <Input type="number" value={bcInputWeight} onChange={(e) => setBcInputWeight(e.target.value)} placeholder="e.g. 2.3" />
                  </div>
                  <Button style={{ width: "100%", backgroundColor: "#9333ea", color: "white" }} onClick={() => {
                      if (!bcInputName) return toast.error("Enter item name!");
                      
                      // Grabs ONLY the fixed_amount from Master Items
                      const masterMatch = (settings.master_items || []).find(mi => mi.name.toLowerCase() === bcInputName.toLowerCase());
                      const fixedPrice = masterMatch?.fixed_amount ? Number(masterMatch.fixed_amount) : null;

                      setBarcodeQueue([...barcodeQueue, { 
                          id: Date.now().toString(), 
                          name: bcInputName, 
                          weight: bcInputWeight || "", 
                          price: fixedPrice 
                      }]);
                      
                      setBcInputWeight(""); 
                      toast.success(`Saved ${bcInputName} to Queue`);
                    }}>+ Add to Print List</Button>
                </div>

                <div style={{ padding: "20px", backgroundColor: "#f8fafc", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
                  <h4 style={{ color: "#0f172a", margin: "0 0 15px 0" }}>2. Organized Print Dashboard</h4>
                  {barcodeQueue.length === 0 ? <p style={{ color: "#64748b", fontSize: "0.9rem" }}>Queue is empty.</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "15px" }}>
                      {Object.entries(barcodeQueue.reduce((acc, item) => {
                        if (!acc[item.name]) acc[item.name] = [];
                        acc[item.name].push(item);
                        return acc;
                      }, {})).map(([groupName, items]) => (
                        <div key={groupName} style={{ backgroundColor: "white", border: "1px solid #e2e8f0", borderRadius: "8px", padding: "15px" }}>
                         <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "2px dashed #e2e8f0", paddingBottom: "10px", marginBottom: "10px", flexWrap: "wrap", gap: "10px" }}>
                            <strong style={{ fontSize: "1.1rem" }}>📦 {groupName}</strong>
                            <div style={{ display: "flex", alignItems: "center", gap: "15px" }}>
                             <label style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "0.9rem", cursor: "pointer", color: "#475569", fontWeight: "bold" }}>
                              <input type="checkbox" checked={printWithPrice} onChange={(e) => setPrintWithPrice(e.target.checked)} style={{ width: "16px", height: "16px" }} />
                               Print with Price
                              </label>
                               <Button 
                                 size="sm" 
                                  style={{ backgroundColor: "#16a34a", color: "white" }} 
                                   onClick={() => handleAddGroupToInventory(groupName, items)}
                                   >
                                    📦 Add {items.length} Pcs to Stock
                                      </Button>
                                        <Button 
                                        size="sm" 
                                     style={{ backgroundColor: "#0f172a" }} 
                                   onClick={() => { setActivePrintGroup(groupName); setPrintType("barcode"); setTimeout(() => window.print(), 300); }}
                                 >
                               Print {items.length} Barcodes
                            </Button>
                          </div>
                          </div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {items.map((it, idx) => <span key={idx} style={{ backgroundColor: "#f1f5f9", padding: "4px 8px", borderRadius: "4px", fontSize: "0.85rem" }}>{it.weight ? `${it.weight}g` : "Fixed"}</span>)}
                          </div>
                          <Button variant="ghost" size="sm" style={{ marginTop: "10px", color: "#ef4444", height: "auto", padding: 0 }} onClick={() => setBarcodeQueue(barcodeQueue.filter(i => i.name !== groupName))}>Clear Group</Button>
                        </div>
                      ))}
                      <Button variant="outline" style={{ borderColor: "#ef4444", color: "#ef4444" }} onClick={() => setBarcodeQueue([])}>Clear Entire Queue</Button>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {settingsTab === "advanced" && (
                <div style={{ padding: "15px", backgroundColor: "#fdf4ff", borderRadius: "8px", border: "1px solid #f5d0fe", marginBottom: "15px", marginTop: "15px" }}>
                  <h4 style={{ color: "#86198f", margin: "0 0 10px 0" }}>Barcode Scanner Power</h4>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" checked={settings.enable_barcode_system || false} onChange={(e) => setSettings({ ...settings, enable_barcode_system: e.target.checked })} style={{ width: "20px", height: "20px" }} />
                    <strong>Enable Laser Scanner Listening</strong>
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
