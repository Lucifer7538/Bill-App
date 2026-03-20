import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Wifi, Store, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STATIC_ABOUT_QR_URL = process.env.REACT_APP_ABOUT_QR_URL;

const createItem = (defaultHsn = "") => ({
  id: `${Date.now()}-${Math.random()}`,
  description: "",
  hsn: defaultHsn,
  weight: "",
  quantity: "1",
  rate_override: "",
  amount_override: "",
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
  gstin: "21AAUFJ1925F1ZH",
  silver_rate_per_gram: 240,
  making_charge_per_gram: 15,
  default_hsn: "7113",
  formula_note: "Line total = Weight × (Silver rate per gram + Making charge per gram)",
  logo_data_url: "",
  about_qr_data_url: STATIC_ABOUT_QR_URL,
  custom_fonts: [], // Array to store { name, dataUrl }
  branches: [
    { id: "B1", name: "Branch 1 (Old Town)", address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2", map_url: "https://g.page/r/CVvnomQZn7zxEBE/review", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 },
    { id: "B2", name: "Branch 2 (Unit-2)", address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9", map_url: "#", invoice_upi_id: "eazypay.0000048595@icici", estimate_upi_id: "7538977527@ybl", cash_balance: 0, estimate_bank_balance: 0, invoice_bank_balance: 0 }
  ]
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (val) => { const parsed = Number.parseFloat(val); return Number.isFinite(parsed) ? parsed : 0; };
const money = (val) => num(val).toFixed(2);
const clampPrintScale = (value) => Math.min(102, Math.max(98, value));

const getInitialPrintScale = () => {
  const saved = Number(localStorage.getItem("jj_print_scale") || "100");
  if (!Number.isFinite(saved)) return 100;
  return clampPrintScale(saved);
};

export default function App() {
  const [isCompactView, setIsCompactView] = useState(window.innerWidth <= 520);
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
  const [settings, setSettings] = useState(defaultSettings);
  const [globalBranchId, setGlobalBranchId] = useState("B1");
  const [billBranchId, setBillBranchId] = useState("B1");
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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [splitCash, setSplitCash] = useState("");
  const [isPaymentDone, setIsPaymentDone] = useState(false);
  const [notes, setNotes] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("design");
  const [showAbout, setShowAbout] = useState(false);
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBillsList, setRecentBillsList] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");
  const [recentBranchFilter, setRecentBranchFilter] = useState("ALL");
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

  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const activeGlobalBranch = settings.branches.find(b => b.id === globalBranchId) || settings.branches[0];
  const activeBillBranch = settings.branches.find(b => b.id === billBranchId) || settings.branches[0];

  // Helper to register custom fonts into the document
  const registerFont = (name, dataUrl) => {
    const styleId = `custom-font-${name.replace(/\s+/g, '-').toLowerCase()}`;
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
      @font-face {
        font-family: '${name}';
        src: url('${dataUrl}');
      }
    `;
    document.head.appendChild(style);
  };

  // Load custom fonts on mount or settings change
  useEffect(() => {
    if (settings.custom_fonts && settings.custom_fonts.length > 0) {
      settings.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
    }
    // Also check localStorage for local-only backups
    const localFontsRaw = localStorage.getItem("jj_custom_fonts");
    if (localFontsRaw) {
      try {
        const localFonts = JSON.parse(localFontsRaw);
        localFonts.forEach(f => registerFont(f.name, f.dataUrl));
      } catch (e) { console.error("Font Load Error", e); }
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
        
        // Update local state
        const updatedFonts = [...(settings.custom_fonts || []), newFont];
        setSettings(prev => ({ ...prev, custom_fonts: updatedFonts }));
        
        // Persist to localStorage
        localStorage.setItem("jj_custom_fonts", JSON.stringify(updatedFonts));
        
        // Register immediately
        registerFont(fontName, dataUrl);
        toast.success(`Font "${fontName}" uploaded and registered!`);
      };
      reader.readAsDataURL(file);
    } catch {
      toast.error("Font upload failed.");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const viewDoc = params.get("view");
    if (viewDoc) {
      setIsPublicView(true);
      setPublicLoading(true);
      const fetchPublicBill = async () => {
        try {
          const res = await axios.get(`${API}/bills/public/${viewDoc}`);
          setPublicBill(res.data.bill);
          const sData = { ...defaultSettings, ...res.data.settings };
          if (!sData.branches) { sData.branches = defaultSettings.branches; }
          setPublicSettings(sData);
          // Register public fonts if any
          if (sData.custom_fonts) {
            sData.custom_fonts.forEach(f => registerFont(f.name, f.dataUrl));
          }
        } catch (err) {
          console.error("Error fetching public bill:", err);
          setPublicBill("NOT_FOUND");
        } finally {
          setPublicLoading(false);
        }
      };
      fetchPublicBill();
    }
  }, []);

  // ... (Rest of your existing useEffects and functions like verify, fetchRecent, loadSettings, etc.) ...
  // Keep all your original functions from the provided code here.
  // Including: handleResize, handleEsc, reserveNumber, fetchCloudStatus, etc.

  // NOTE: Below I include the updated UI parts (Settings & Billing Sheet) for brevity.
  // Ensure you include all your original logic functions between here and the return statement.

  const saveSettings = async () => {
    try {
      await axios.put(`${API}/settings`, settings, { headers: authHeaders });
      toast.success("Settings saved.");
    } catch {
      toast.error("Could not save settings.");
    }
  };

  // ... (Keep your original saveBill, downloadPdf, shareWhatsApp functions) ...

  const FontSelectOptions = () => (
    <>
      <option value="sans-serif">Sans-serif</option>
      <option value="Arial, Helvetica, sans-serif">Arial</option>
      <option value="'Times New Roman', Times, serif">Times New Roman</option>
      <option value="'Courier New', Courier, monospace">Courier New</option>
      <option value="Georgia, serif">Georgia</option>
      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
      <option value="'Brush Script MT', cursive">Brush Script MT (Cursive)</option>
      {/* Dynamic Custom Fonts */}
      {settings.custom_fonts?.map(f => (
        <option key={f.name} value={`'${f.name}'`}>{f.name} (Custom)</option>
      ))}
    </>
  );

  // --------------------------------------------------------------------------
  // RENDER LOGIC
  // --------------------------------------------------------------------------

  // ... (Keep your original public view logic) ...

  if (checkingSession) {
    return (
      <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>Loading billing dashboard...</div>
        {isWakingUp && (
          <div style={{ marginTop: '20px', textAlign: 'center', padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '320px' }}>
            <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#64748b' }}> The database server is currently waking up. </p>
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
          <Input type="password" value={passcode} onChange={(e) => setPasscode(e.target.value)} placeholder="Enter passcode" />
          <Button type="submit" disabled={loggingIn}> {loggingIn ? "Checking..." : "Login"} </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="billing-app">
      <Toaster position="bottom-right" />
      <header className="top-bar no-print">
         {/* ... Header content ... */}
      </header>
      
      <main className="main-layout">
        <section id="bill-print-root" className="bill-sheet" style={{ "--print-scale-factor": (printScale / 100).toFixed(3), position: 'relative', zIndex: 1 }}>
          {isPaymentDone && <div className="watermark-done"> PAYMENT DONE </div>}
          <div className="bill-header">
            <div className="logo-area">
              {settings.logo_data_url ? <img src={settings.logo_data_url} alt="Shop Logo" className="shop-logo" /> : <div className="shop-logo-fallback">JJ</div>}
              <div style={{ width: "100%", textAlign: settings.shop_name_align || "center" }}>
                <h2 className="sheet-shop-title" style={{ fontFamily: settings.shop_name_font || "sans-serif", color: settings.shop_name_color || "#000", fontSize: `${settings.shop_name_size}px`, margin: 0 }}>
                  {settings.shop_name}
                </h2>
              </div>
              <div style={{ width: "100%", textAlign: settings.tagline_align || "center" }}>
                <p className="sheet-tagline" style={{ fontFamily: settings.tagline_font || "sans-serif", color: settings.tagline_color || "#475569", fontSize: `${settings.tagline_size}px`, margin: "5px 0" }}>
                  {settings.tagline}
                </p>
              </div>
            </div>
            {/* ... Address/Contact Area ... */}
          </div>
          {/* ... Bill Meta, Table, Totals, QR ... */}
        </section>

        <aside className="controls no-print">
          {/* ... Bill Details, Item Lines, Adjustments ... */}
        </aside>
      </main>

      {/* SETTINGS DRAWER */}
      {showSettings && (
        <section className="side-drawer no-print" style={{ width: "500px", overflowY: "auto" }}>
          <div className="drawer-header">
            <h3>Settings</h3>
            <Button type="button" variant="outline" onClick={() => setShowSettings(false)}><ArrowLeft size={16} /> Back</Button>
          </div>
          
          <div style={{ padding: "0 15px 15px 15px" }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <Button variant={settingsTab === "design" ? "default" : "outline"} onClick={() => setSettingsTab("design")} style={{ flex: 1 }}>🎨 Design</Button>
              <Button variant={settingsTab === "technical" ? "default" : "outline"} onClick={() => setSettingsTab("technical")} style={{ flex: 1 }}>⚙️ Tech</Button>
              <Button variant={settingsTab === "branches" ? "default" : "outline"} onClick={() => setSettingsTab("branches")} style={{ flex: 1 }}><Store size={16} /> Branches</Button>
            </div>

            {settingsTab === "design" && (
              <div className="settings-design-tab">
                {/* Updated Shop Name Font Select */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4>Shop Name Design</h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
                    <select value={settings.shop_name_font || "sans-serif"} onChange={(e) => setSettings(prev => ({ ...prev, shop_name_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px" }}>
                      <FontSelectOptions />
                    </select>
                  </div>
                </div>

                {/* Updated Tagline Font Select */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4>Tagline Design</h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "10px" }}>
                    <select value={settings.tagline_font || "sans-serif"} onChange={(e) => setSettings(prev => ({ ...prev, tagline_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px" }}>
                      <FontSelectOptions />
                    </select>
                  </div>
                </div>
                
                <Button onClick={saveSettings} style={{ width: "100%" }}>Save Design</Button>
              </div>
            )}

            {settingsTab === "technical" && (
              <div className="settings-technical-tab">
                {/* FONT UPLOAD SECTION */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f0fdf4" }}>
                  <h4 style={{ margin: "0 0 10px 0", color: "#166534" }}>Upload Custom Font</h4>
                  <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "10px" }}>Upload a .ttf or .otf file to use it in your bill design.</p>
                  <label style={{ display: "flex", alignItems: "center", gap: "10px", padding: "10px", border: "2px dashed #16a34a", borderRadius: "8px", cursor: "pointer", backgroundColor: "white" }}>
                    <Upload size={18} />
                    <span style={{ fontSize: "0.85rem", fontWeight: "bold" }}>Choose Font File</span>
                    <input type="file" accept=".ttf,.otf,.woff,.woff2" onChange={handleFontUpload} style={{ display: "none" }} />
                  </label>
                  {settings.custom_fonts?.length > 0 && (
                    <div style={{ marginTop: "10px" }}>
                      <p style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Uploaded Fonts:</p>
                      <ul style={{ fontSize: "0.75rem", margin: "5px 0", paddingLeft: "15px" }}>
                        {settings.custom_fonts.map(f => <li key={f.name}>{f.name}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
                {/* ... Rest of Tech settings (Scale, Logo, DB) ... */}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
