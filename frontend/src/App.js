import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft, Wallet, Building2, Banknote, History, Plus, Wifi, Store } from "lucide-react";
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
  
  branches: [
    {
      id: "B1",
      name: "Branch 1 (Old Town)",
      address: "Branch- 1 : Plot No.525, Vivekananda Marg, Near Indian Bank, Old Town, BBSR-2",
      map_url: "https://g.page/r/CVvnomQZn7zxEBE/review",
      invoice_upi_id: "eazypay.0000048595@icici",
      estimate_upi_id: "7538977527@ybl",
      cash_balance: 0,
      estimate_bank_balance: 0,
      invoice_bank_balance: 0
    },
    {
      id: "B2",
      name: "Branch 2 (Unit-2)",
      address: "Branch - 2 : Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2, BBSR-9",
      map_url: "#",
      invoice_upi_id: "eazypay.0000048595@icici",
      estimate_upi_id: "7538977527@ybl",
      cash_balance: 0,
      estimate_bank_balance: 0,
      invoice_bank_balance: 0
    }
  ]
};

const today = () => new Date().toISOString().slice(0, 10);
const num = (val) => {
  const parsed = Number.parseFloat(val);
  return Number.isFinite(parsed) ? parsed : 0;
};
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
          if (!sData.branches) {
             sData.branches = defaultSettings.branches;
          }
          setPublicSettings(sData);
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

  useEffect(() => {
    const handleResize = () => setIsCompactView(window.innerWidth <= 520);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleEsc = (event) => {
      if (event.key !== "Escape") return;
      if (showSettings) setShowSettings(false);
      if (showAbout) setShowAbout(false);
      if (showRecentBills) setShowRecentBills(false);
      if (showLedger) setShowLedger(false);
      if (showFeedbackModal) setShowFeedbackModal(false);
    };
    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout, showRecentBills, showLedger, showFeedbackModal]);

  useEffect(() => {
    localStorage.setItem("jj_print_scale", String(clampPrintScale(printScale)));
  }, [printScale]);

  useEffect(() => {
    if (isPublicView) return; 
    const verify = async () => {
      if (!token) { setCheckingSession(false); return; }
      
      const slowServerTimeout = setTimeout(() => setIsWakingUp(true), 3000);

      try { await axios.get(`${API}/auth/verify`, { headers: authHeaders }); } 
      catch { localStorage.removeItem("jj_auth_token"); setToken(""); } 
      finally { 
        clearTimeout(slowServerTimeout);
        setCheckingSession(false); 
        setIsWakingUp(false);
      }
    };
    verify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isPublicView]);

  useEffect(() => {
    if (showRecentBills && token && !isPublicView) {
      const fetchRecent = async () => {
        setLoadingRecent(true);
        try {
          const response = await axios.get(`${API}/bills/recent?limit=15&branch_filter=${recentBranchFilter}&search=${encodeURIComponent(billSearchQuery)}`, { headers: authHeaders });
          setRecentBillsList(response.data);
        } catch { toast.error("Failed to load recent bills."); } 
        finally { setLoadingRecent(false); }
      };
      const timer = setTimeout(fetchRecent, 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRecentBills, token, isPublicView, billSearchQuery, recentBranchFilter]); 

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
        } catch { toast.error("Failed to load today's ledger."); }
        finally { setLedgerLoading(false); }
      };
      fetchLedger();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLedger, token, isPublicView, globalBranchId]);

  useEffect(() => {
    if (showSettings && token && !isPublicView) {
      const fetchStorageStats = async () => {
        try {
          const res = await axios.get(`${API}/system/storage`, { headers: authHeaders });
          setStorageStats(res.data);
        } catch { console.error("Failed to load storage stats"); }
      };
      fetchStorageStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSettings, token, isPublicView]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    const savedAboutQr = localStorage.getItem("jj_about_qr_data_url");
    
    let dbData = response.data;
    if (!dbData.branches) {
      dbData.branches = defaultSettings.branches;
    }

    const newSettings = {
      ...defaultSettings,
      ...dbData,
      logo_data_url: savedLogo || dbData.logo_data_url || "",
      about_qr_data_url: savedAboutQr || dbData.about_qr_data_url || STATIC_ABOUT_QR_URL,
    };
    setSettings(newSettings);

    if (!newSettings.branches.find(b => b.id === globalBranchId)) {
        setGlobalBranchId(newSettings.branches[0].id);
        setBillBranchId(newSettings.branches[0].id);
    }

    setItems((prev) => {
      if (prev.length === 1 && !prev[0].description && !prev[0].weight && !prev[0].hsn) {
        return [{ ...prev[0], hsn: newSettings.default_hsn }];
      }
      return prev;
    });
  };

  const reserveNumber = async (activeMode, activeBranch) => {
    setIsNumberLoading(true);
    try {
      const response = await axios.get(`${API}/bills/next-number`, { headers: authHeaders, params: { mode: activeMode, branch_id: activeBranch } });
      setDocumentNumber(response.data.document_number || "");
    } finally { setIsNumberLoading(false); }
  };

  const fetchCloudStatus = async () => {
    try {
      const response = await axios.get(`${API}/cloud/status`, { headers: authHeaders });
      setCloudStatus(response.data);
    } catch { setCloudStatus({ provider: "supabase", enabled: false, mode: "status-unavailable" }); }
  };

  useEffect(() => {
    if (isPublicView) return;
    const bootstrap = async () => {
      if (!token) return;
      try { 
        await loadSettings(); 
        await fetchCloudStatus(); 
        await reserveNumber(mode, billBranchId); 
      } 
      catch { toast.error("Could not load billing settings."); }
    };
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isPublicView]);

  useEffect(() => {
    if (!token || isPublicView) return;
    const interval = setInterval(() => { fetchCloudStatus(); }, 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isPublicView]);

  useEffect(() => {
    if (!token || isPublicView) return;
    const query = customer.phone.trim().length >= 2 ? customer.phone.trim() : customer.name.trim();
    if (query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get(`${API}/customers/suggest`, { headers: authHeaders, params: { query } });
        setSuggestions(response.data || []);
      } catch { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer.phone, customer.name, token, isPublicView]);

  const computed = useMemo(() => {
    const baseRate = num(settings.silver_rate_per_gram) + num(settings.making_charge_per_gram);
    
    const mapped = items.map((item, index) => {
      const rate = item.rate_override !== "" ? num(item.rate_override) : baseRate;
      const weight = num(item.weight);
      const quantity = Math.max(num(item.quantity), 1);
      const formulaAmount = mode === "estimate" ? weight * rate * quantity : weight * rate;
      const amount = item.amount_override !== "" ? num(item.amount_override) : formulaAmount;
      const rupees = Math.floor(amount);
      const paise = Math.round((amount - rupees) * 100).toString().padStart(2, "0");
      return { ...item, slNo: index + 1, rate, quantity, amount, rupees, paise };
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

    return { items: mapped, baseRate, subtotal, taxable, cgst, sgst, igst, mdr, roundOff, grandTotal };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff]);

  const upiAmountToPay = paymentMethod === "Split" ? Math.max(0, computed.grandTotal - num(splitCash)) : computed.grandTotal;
  const showDashboardUpi = !isPaymentDone && (paymentMethod === "UPI" || (paymentMethod === "Split" && upiAmountToPay > 0));
  
  const upiId = mode === "invoice" ? activeBillBranch.invoice_upi_id : activeBillBranch.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmountToPay)}&cu=INR&tn=Bill_${documentNumber || "Draft"}`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  const updateItem = (id, key, value) => { markDirty(); setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item))); };

  const clearBill = async (nextMode = mode, nextBranch = billBranchId) => {
    setEditingDocNumber(null);
    setItems([createItem(settings.default_hsn)]); 
    setCustomer({ name: "", phone: "", address: "", email: "" });
    setSuggestions([]); setDiscount("0"); setExchange("0"); setManualRoundOff("");
    setPaymentMethod(""); 
    setSplitCash(""); setIsPaymentDone(false); setNotes("");
    setBillDate(today()); setIsDirty(false);
    await reserveNumber(nextMode, nextBranch);
  };

  const loadBillForEditing = (bill) => {
    setEditingDocNumber(bill.document_number);
    setMode(bill.mode);
    setBillBranchId(bill.branch_id || settings.branches[0].id);
    setDocumentNumber(bill.document_number);
    setBillDate(bill.date || today());
    setCustomer({ name: bill.customer?.name || "", phone: bill.customer?.phone || "", address: bill.customer?.address || "", email: bill.customer?.email || "" });
    
    setPaymentMethod(bill.payment_method || "");
    
    setSplitCash(bill.split_cash !== null && bill.split_cash !== undefined ? String(bill.split_cash) : "");
    setIsPaymentDone(bill.is_payment_done || false); 
    setNotes(bill.notes || "");
    setDiscount(bill.totals?.discount ? String(bill.totals.discount) : "0");
    setExchange(bill.totals?.exchange ? String(bill.totals.exchange) : "0");
    setManualRoundOff(bill.totals?.round_off !== null && bill.totals?.round_off !== undefined ? String(bill.totals.round_off) : "");

    const loadedItems = (bill.items || []).map((item) => ({
      id: `${Date.now()}-${Math.random()}`, description: item.description || "", hsn: item.hsn || "",
      weight: item.weight ? String(item.weight) : "", quantity: item.quantity ? String(item.quantity) : "1",
      rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "",
      amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "",
    }));
    setItems(loadedItems.length > 0 ? loadedItems : [createItem(settings.default_hsn)]);
    setIsDirty(false); setShowRecentBills(false); setShowLedger(false);
    toast.success(`Loaded ${bill.document_number} for editing`);
    goToBillTop();
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${bill.document_number}?`)) return;
    try {
      await axios.delete(`${API}/bills/${bill.document_number}`, { headers: authHeaders });
      setRecentBillsList((prev) => prev.filter((b) => b.document_number !== bill.document_number));
      if (editingDocNumber === bill.document_number) clearBill(mode, billBranchId);
      toast.success(`${bill.document_number} deleted successfully.`);
      await loadSettings(); 
    } catch { toast.error("Failed to delete the bill."); }
  };

  const handleQuickPaymentToggle = async (bill) => {
    const newStatus = !bill.is_payment_done;
    try {
      await axios.put(`${API}/bills/${bill.document_number}/toggle-payment`, { is_payment_done: newStatus }, { headers: authHeaders });
      toast.success(`Payment marked as ${newStatus ? 'DONE ✅' : 'PENDING ⏳'}`);
      if (editingDocNumber === bill.document_number) { setIsPaymentDone(newStatus); }
      setRecentBillsList(prev => prev.map(b => b.document_number === bill.document_number ? { ...b, is_payment_done: newStatus } : b));
      await loadSettings(); 
    } catch { toast.error("Failed to update payment status."); }
  };

  const handleResetCounter = async (resetMode) => {
    if (!window.confirm(`Are you SURE you want to restart the ${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} back to 0001?`)) return;
    try {
      await axios.post(`${API}/bills/reset-counter`, { mode: resetMode, branch_id: globalBranchId }, { headers: authHeaders });
      toast.success(`${resetMode.toUpperCase()} counter for ${activeGlobalBranch.name} has been reset.`);
      if (mode === resetMode && billBranchId === globalBranchId) { await reserveNumber(mode, billBranchId); }
    } catch { toast.error(`Failed to reset the ${resetMode} counter.`); }
  };

  const handleBackupBills = async () => {
    try {
      toast.info("Preparing backup file...");
      const res = await axios.get(`${API}/bills/export`, { headers: authHeaders });
      const dataStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `Jalaram_Bills_Backup_${today()}.json`;
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      toast.success("Backup downloaded successfully!");
    } catch { toast.error("Failed to download backup."); }
  };

  const handleDeleteAllBills = async () => {
    if (!window.confirm("🚨 WARNING! This will permanently delete ALL bills. Have you downloaded your backup first?")) return;
    if (window.prompt("Type 'DELETE' to confirm wiping all bills:") !== "DELETE") { toast.error("Deletion cancelled."); return; }
    try {
      await axios.delete(`${API}/bills/all`, { headers: authHeaders });
      toast.success("All bills wiped. (Ledger balances remain intact)");
      setRecentBillsList([]);
      const res = await axios.get(`${API}/system/storage`, { headers: authHeaders });
      setStorageStats(res.data);
    } catch { toast.error("Failed to delete bills."); }
  };

  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    if (isDirty && !paymentMethod) {
       toast.error("Please select payment method.");
       return;
    }
    if (isDirty && !window.confirm("⚠️ You have unsaved changes!\n\nIf you switch modes now, your current data will be lost. Do you want to continue?")) return; 
    setMode(nextMode);
    await clearBill(nextMode, billBranchId);
  };

  const handleGlobalBranchChange = async (nextBranchId) => {
    setGlobalBranchId(nextBranchId);
    if (!isDirty) {
        setBillBranchId(nextBranchId);
        await reserveNumber(mode, nextBranchId);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoggingIn(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 });
      localStorage.setItem("jj_auth_token", response.data.access_token);
      setToken(response.data.access_token); setPasscode(""); toast.success("Logged in successfully");
    } catch (error) {
      if (error?.response?.status === 401) { toast.error("Wrong passcode."); } 
      else { toast.error("Server is waking up. Please wait 15-20 seconds and try again."); }
    } finally { setLoggingIn(false); }
  };

  const handleLogout = () => { localStorage.removeItem("jj_auth_token"); setToken(""); };

  const optimizeImageDataUrl = async (file) => {
    const reader = new FileReader();
    const original = await new Promise((resolve, reject) => { reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; });
    const ratio = Math.min(420 / image.width, 420 / image.height, 1);
    const targetWidth = Math.round(image.width * ratio);
    const targetHeight = Math.round(image.height * ratio);
    const canvas = document.createElement("canvas"); canvas.width = targetWidth; canvas.height = targetHeight;
    const context = canvas.getContext("2d"); context.drawImage(image, 0, 0, targetWidth, targetHeight);
    return canvas.toDataURL("image/png", 0.92);
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const dataUrl = await optimizeImageDataUrl(file); localStorage.setItem("jj_logo_data_url", dataUrl); setSettings((prev) => ({ ...prev, logo_data_url: dataUrl })); setLogoUploadName(file.name); toast.success("Logo uploaded successfully."); } 
    catch { toast.error("Logo upload failed."); }
  };

  const handleAboutQrUpload = async (event) => {
    const file = event.target.files?.[0]; if (!file) return;
    try { const dataUrl = await optimizeImageDataUrl(file); localStorage.setItem("jj_about_qr_data_url", dataUrl); setSettings((prev) => ({ ...prev, about_qr_data_url: dataUrl })); setAboutUploadName(file.name); toast.success("About QR updated."); } 
    catch { toast.error("QR upload failed."); }
  };

  const saveSettings = async () => {
    try { await axios.put(`${API}/settings`, settings, { headers: authHeaders }); toast.success("Settings saved."); } 
    catch { toast.error("Could not save settings."); }
  };

  const submitLedgerLog = async () => {
    if (!logAmount || isNaN(logAmount) || num(logAmount) <= 0) {
      toast.error("Please enter a valid amount."); return;
    }
    if (!logReason.trim()) {
      toast.error("Please enter a reason/remark."); return;
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
      const keyMap = { "cash": "cash_change", "estimate_bank": "estimate_bank_change", "invoice_bank": "invoice_bank_change" };

      if (logType === "expense") payload[keyMap[logSourceVault]] = -amt;
      else if (logType === "add") payload[keyMap[logSourceVault]] = amt;
      else if (logType === "exchange") {
        if (logSourceVault === logTargetVault) {
          toast.error("Cannot exchange into the same vault."); setSubmittingLog(false); return;
        }
        payload[keyMap[logSourceVault]] = -amt;
        payload[keyMap[logTargetVault]] = amt;
      }

      await axios.post(`${API}/settings/ledger/adjust`, payload, { headers: authHeaders });
      toast.success("Transaction logged successfully!");
      setShowLogForm(false); setLogAmount(""); setLogReason("");
      await loadSettings(); 
      await fetchLedgerHistory();
    } catch (error) { toast.error("Failed to log transaction."); } 
    finally { setSubmittingLog(false); }
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
        const updatedBranches = prev.branches.map(b => b.id === globalBranchId ? { ...b, ...payload } : b);
        return { ...prev, branches: updatedBranches };
      });
      setEditingBalances(false);
      toast.success(`Ledger balances for ${activeGlobalBranch.name} manually updated!`);
    } catch {
      toast.error("Failed to update balances.");
    }
  };

  const saveBill = async () => {
    if (!paymentMethod) {
        toast.error("Please select payment method.");
        return;
    }

    setSavingBill(true);
    try {
      const payload = {
        mode, branch_id: billBranchId, document_number: documentNumber, date: billDate,
        customer_name: customer.name, customer_phone: customer.phone, customer_address: customer.address, customer_email: customer.email,
        payment_method: paymentMethod, is_payment_done: isPaymentDone, split_cash: num(splitCash), split_upi: Math.max(0, computed.grandTotal - num(splitCash)),
        discount: num(discount), exchange: num(exchange), round_off: manualRoundOff === "" ? null : num(manualRoundOff), notes,
        items: computed.items.map((item) => ({ description: item.description, hsn: item.hsn, weight: num(item.weight), quantity: num(item.quantity), rate_override: item.rate_override === "" ? null : num(item.rate_override), amount_override: item.amount_override === "" ? null : num(item.amount_override), })),
      };

      if (editingDocNumber) {
        await axios.put(`${API}/bills/${editingDocNumber}`, payload, { headers: authHeaders });
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} updated successfully.`);
        setIsDirty(false);
      } else {
        const res = await axios.post(`${API}/bills/save`, payload, { headers: authHeaders });
        toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} saved successfully.`);
        setIsDirty(false);
        setEditingDocNumber(res.data.document_number);
        setDocumentNumber(res.data.document_number);
      }
      await loadSettings(); 
    } catch (error) { toast.error(error.response?.data?.detail || "Could not save bill."); } 
    finally { setSavingBill(false); }
  };

  const downloadPdf = async (elementId, filename) => {
    const node = document.getElementById(elementId); 
    if (!node) return;

    const originalWidth = node.style.width;
    const originalMaxWidth = node.style.maxWidth;
    const originalMargin = node.style.margin;

    node.style.width = "800px";
    node.style.maxWidth = "800px";
    node.style.margin = "0";

    try {
      await new Promise(resolve => setTimeout(resolve, 100));

      const canvas = await html2canvas(node, { 
        scale: 2, 
        useCORS: true, 
        backgroundColor: "#ffffff",
        windowWidth: 800 
      });

      const imageData = canvas.toDataURL("image/png", 1.0);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      
      const pageWidth = pdf.internal.pageSize.getWidth(); 
      const pageHeight = (canvas.height * pageWidth) / canvas.width;
      
      pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight); 
      pdf.save(`${filename}.pdf`);

    } catch (error) {
      console.error("PDF Error:", error);
      toast.error("Failed to download PDF.");
    } finally {
      node.style.width = originalWidth;
      node.style.maxWidth = originalMaxWidth;
      node.style.margin = originalMargin;
    }
  };

  const shareWhatsApp = () => {
    if (!paymentMethod) {
        toast.error("Please select payment method.");
        return;
    }
    
    const link = `${window.location.origin}/?view=${documentNumber}`;
    const text = `Hello ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`;
    
    let cleanedPhone = customer.phone.replace(/\D/g, "");
    if (cleanedPhone.length === 10) {
      cleanedPhone = `91${cleanedPhone}`;
    }

    window.open(`https://wa.me/${cleanedPhone}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const shareEmail = () => {
    if (!paymentMethod) {
        toast.error("Please select payment method.");
        return;
    }

    const link = `${window.location.origin}/?view=${documentNumber}`;
    const subject = `${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber}`;
    const body = `Dear ${customer.name || "Customer"},\n\nHere is your ${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`;
    window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const goToBillTop = () => { document.getElementById("bill-print-root")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const handleWifiClick = () => {
    navigator.clipboard.writeText("12345678").then(() => {
      toast.success("✅ Password '12345678' Copied! Go to settings and connect to 'JalaramJewellers Unlimited'.", { duration: 6000 });
    }).catch(() => {
      toast.info("Wi-Fi: JalaramJewellers Unlimited | Pass: 12345678", { duration: 6000 });
    });
  };

  const todaysTotalCash = todayBills.filter(b => b.is_payment_done).reduce((sum, b) => sum + (b.payment_method === 'Cash' ? b.totals.grand_total : b.payment_method === 'Split' ? num(b.split_cash) : 0), 0);
  const todaysTotalEstBank = todayBills.filter(b => b.is_payment_done && b.mode === 'estimate').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? b.totals.grand_total : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);
  const todaysTotalInvBank = todayBills.filter(b => b.is_payment_done && b.mode === 'invoice').reduce((sum, b) => sum + (['UPI', 'Card'].includes(b.payment_method) ? b.totals.grand_total : b.payment_method === 'Split' ? num(b.split_upi) : 0), 0);

  if (isPublicView) {
    if (publicLoading) return <div className="loading-screen">Loading your bill...</div>;
    if (publicBill === "NOT_FOUND" || !publicBill) return <div className="loading-screen">Bill not found or has been deleted.</div>;

    const publicUpiAmountToPay = publicBill.payment_method === "Split" ? num(publicBill.split_upi) : publicBill.totals.grand_total;
    const showPublicUpi = !publicBill.is_payment_done && (publicBill.payment_method === "UPI" || (publicBill.payment_method === "Split" && publicUpiAmountToPay > 0));
    
    const pbBranch = publicSettings.branches.find(b => b.id === publicBill.branch_id) || publicSettings.branches[0];
    const publicUpiId = publicBill.mode === "invoice" ? pbBranch.invoice_upi_id : pbBranch.estimate_upi_id;
    const publicUpiUri = `upi://pay?pa=${publicUpiId}&pn=${encodeURIComponent(publicSettings.shop_name)}&am=${money(publicUpiAmountToPay)}&cu=INR&tn=Bill_${publicBill.document_number}`;

    const splitAmount = (amt) => {
      const rupees = Math.floor(amt);
      const paise = Math.round((amt - rupees) * 100).toString().padStart(2, "0");
      return { rupees, paise };
    };

    return (
      <div className="billing-app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
        <Toaster position="bottom-right" />

        {!publicBill.is_payment_done && (
          <div 
            className="no-print" 
            onClick={handleWifiClick} 
            style={{ width: "100%", maxWidth: "800px", backgroundColor: "#eff6ff", border: "2px solid #3b82f6", borderRadius: "8px", padding: "12px", marginBottom: "20px", display: "flex", justifyContent: "center", alignItems: "center", gap: "10px", color: "#1d4ed8", fontWeight: "bold", cursor: "pointer", boxShadow: "0 4px 6px rgba(0,0,0,0.1)" }}
          >
            <Wifi size={20} /> Slow Internet? Tap here for Free Shop Wi-Fi
          </div>
        )}

        {showFeedbackModal && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }}>
            <div style={{ backgroundColor: "white", padding: "30px", borderRadius: "16px", width: "100%", maxWidth: "380px", textAlign: "center", boxShadow: "0 10px 25px rgba(0,0,0,0.2)" }}>
              <h3 style={{ marginTop: 0, marginBottom: "8px", color: "#0f172a" }}>Leave a Review!</h3>
              <p style={{ fontSize: "0.9rem", color: "#64748b", marginBottom: "20px" }}>Which branch did you visit today?</p>
              
              {publicSettings.branches.map(b => (
                <a key={b.id} href={b.map_url !== "#" ? b.map_url : "#"} target="_blank" rel="noopener noreferrer" style={{ display: "block", padding: "14px", backgroundColor: b.map_url !== "#" ? "#facc15" : "#e2e8f0", color: b.map_url !== "#" ? "#854d0e" : "#475569", textDecoration: "none", borderRadius: "10px", marginBottom: "12px", fontWeight: "bold", fontSize: "1.1rem" }}>
                  ⭐ {b.name}
                </a>
              ))}
              
              <Button variant="ghost" onClick={() => setShowFeedbackModal(false)} style={{ width: "100%", color: "#64748b", marginTop: "10px" }}>Cancel</Button>
            </div>
          </div>
        )}
        
        <div className="no-print" style={{ marginBottom: '20px', display: 'flex', gap: '15px' }}>
          <Button onClick={() => downloadPdf("public-bill-root", publicBill.document_number)}>
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()}>
            Print Bill
          </Button>
        </div>

        <section id="public-bill-root" className="bill-sheet" style={{ "--print-scale-factor": 1, position: 'relative', zIndex: 1 }}>
          {publicBill.is_payment_done && (
            <div className="watermark-done">
              PAYMENT DONE
            </div>
          )}

          <div className="bill-header">
            <div className="logo-area">
              {publicSettings.logo_data_url ? (
                <img src={publicSettings.logo_data_url} alt="Shop Logo" className="shop-logo" />
              ) : (
                <div className="shop-logo-fallback">JJ</div>
              )}
              
              <div style={{ width: "100%", textAlign: publicSettings.shop_name_align || "center" }}>
                <h2 className="sheet-shop-title" style={{ fontFamily: publicSettings.shop_name_font || "sans-serif", color: publicSettings.shop_name_color || "#000", fontSize: `${publicSettings.shop_name_size}px`, margin: 0 }}>
                  {publicSettings.shop_name}
                </h2>
              </div>
              
              <div style={{ width: "100%", textAlign: publicSettings.tagline_align || "center" }}>
                <p className="sheet-tagline" style={{ fontFamily: publicSettings.tagline_font || "sans-serif", color: publicSettings.tagline_color || "#475569", fontSize: `${publicSettings.tagline_size}px`, margin: "5px 0" }}>
                  {publicSettings.tagline}
                </p>
              </div>
            </div>

            <div className="contact-area">
              <div className="contact-address" style={{ fontFamily: publicSettings.address_font || "sans-serif", display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', alignItems: publicSettings.address_align === 'left' ? 'flex-start' : publicSettings.address_align === 'right' ? 'flex-end' : 'center', textAlign: publicSettings.address_align || "center" }}>
                  <a href={pbBranch.map_url !== "#" ? pbBranch.map_url : "#"} target="_blank" rel="noopener noreferrer" style={{ color: publicSettings.address_color || "#475569", fontSize: `${publicSettings.address_size || 14}px`, textDecoration: 'none' }}>
                    {pbBranch.address}
                  </a>
              </div>
              
              <div style={{ width: "100%", textAlign: publicSettings.phone_align || "center", fontFamily: publicSettings.phone_font || "sans-serif", fontSize: `${publicSettings.phone_size || 13}px`, marginBottom: "4px" }}>
                {publicSettings.phone_numbers.map((phone, idx) => (
                  <span key={idx}>
                    <a href={`tel:${phone.replace(/\s+/g, '')}`} style={{ color: publicSettings.phone_color || "#475569", textDecoration: 'none' }}>
                      {phone}
                    </a>
                    {idx < publicSettings.phone_numbers.length - 1 && " | "}
                  </span>
                ))}
              </div>

              <div style={{ width: "100%", textAlign: publicSettings.email_align || "center", fontFamily: publicSettings.email_font || "sans-serif", fontSize: `${publicSettings.email_size || 13}px`, marginBottom: "4px" }}>
                <a href={`mailto:${publicSettings.email}`} style={{ color: publicSettings.email_color || "#475569", textDecoration: 'none' }}>
                  {publicSettings.email}
                </a>
              </div>
              
              {publicBill.mode === "invoice" && <p style={{ margin: "4px 0", textAlign: "center" }}>GSTIN: {publicSettings.gstin}</p>}
            </div>
          </div>

          <div className="sheet-banner">
            {publicBill.mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}
          </div>

          <div className="meta-grid">
            <p><strong>{publicBill.mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {publicBill.document_number}</p>
            <p><strong>Date:</strong> {publicBill.date}</p>
          </div>

          <div className="customer-box">
            <p><strong>Name:</strong> {publicBill.customer?.name || "-"}</p>
            <p><strong>Address:</strong> {publicBill.customer?.address || "-"}</p>
            <p><strong>Phone:</strong> {publicBill.customer?.phone || "-"}</p>
          </div>

          <table className="bill-table">
            <thead>
              {isCompactView ? (
                <tr><th>#</th><th>Item</th><th>Wt / Rate</th><th>Amount</th></tr>
              ) : publicBill.mode === "invoice" ? (
                <tr><th>Sl. No.</th><th>DESCRIPTION</th><th>HSN</th><th>WEIGHT IN GRAMS</th><th>RATE PER GRAM Rs.</th><th>AMOUNT Ps.</th></tr>
              ) : (
                <tr><th>SI. No.</th><th>Particulars</th><th>Weight</th><th>Quantity / Rate</th><th>Amount Rupees.</th><th>PS.</th></tr>
              )}
            </thead>
            <tbody>
              {publicBill.items.map((item, idx) => {
                const { rupees, paise } = splitAmount(item.amount);
                return (
                  <tr key={idx}>
                    {isCompactView ? (
                      <>
                        <td>{item.sl_no}</td>
                        <td><strong>{item.description || "-"}</strong>{publicBill.mode === "invoice" && <div>HSN: {item.hsn || "-"}</div>}</td>
                        <td>{money(item.weight)}g × ₹{money(item.rate)}</td>
                        <td>{rupees}.{paise}</td>
                      </>
                    ) : (
                      <>
                        <td>{item.sl_no}</td>
                        <td>{item.description || "-"}</td>
                        <td>{publicBill.mode === "invoice" ? item.hsn || "-" : money(item.weight)}</td>
                        <td>{publicBill.mode === "invoice" ? money(item.weight) : `${money(item.quantity)} × ${money(item.rate)}`}</td>
                        <td>{money(item.rate)}</td>
                        <td>{rupees}.{paise}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="sheet-bottom-stack">
            <div className="totals">
              <div className="totals-row">
                <span>{publicBill.mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span>
                <strong>₹{money(publicBill.totals.taxable_amount || publicBill.totals.subtotal)}</strong>
              </div>

              {publicBill.mode === "invoice" ? (
                <>
                  <div className="totals-row"><span>CGST @ 1.5%</span><strong>₹{money(publicBill.totals.cgst)}</strong></div>
                  <div className="totals-row"><span>SGST @ 1.5%</span><strong>₹{money(publicBill.totals.sgst)}</strong></div>
                  <div className="totals-row"><span>IGST @ 0%</span><strong>₹{money(publicBill.totals.igst)}</strong></div>
                </>
              ) : (
                <>
                  <div className="totals-row"><span>DISCOUNT</span><strong>₹{money(publicBill.totals.discount)}</strong></div>
                  <div className="totals-row"><span>EXCHANGE</span><strong>₹{money(publicBill.totals.exchange)}</strong></div>
                </>
              )}

              <div className="totals-row"><span>MDR (Card 2%)</span><strong>₹{money(publicBill.totals.mdr)}</strong></div>
              <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(publicBill.totals.round_off)}</strong></div>
              <div className="totals-row total-highlight">
                <span>GRAND TOTAL</span>
                <strong>₹{money(publicBill.totals.grand_total)}</strong>
              </div>

              <div className="payment-method-view">
                <span>Payment Method:</span>
                <strong>
                  {publicBill.payment_method === "Split" 
                    ? `Split (Cash: ₹${money(publicBill.split_cash)}, UPI: ₹${money(publicUpiAmountToPay)})` 
                    : publicBill.payment_method}
                </strong>
              </div>

              {showPublicUpi && (
                <div className="payment-qr-box">
                  <p className="scan-title" style={{ marginBottom: "15px" }}>Click Below to Pay</p>
                  
                  <a 
                    href={publicUpiUri} 
                    style={{
                      display: "block",
                      padding: "12px 20px",
                      backgroundColor: "#16a34a",
                      color: "white",
                      textDecoration: "none",
                      fontWeight: "bold",
                      borderRadius: "8px",
                      textAlign: "center",
                      boxShadow: "0 4px 6px rgba(0,0,0,0.1)"
                    }}
                  >
                    📱 Pay ₹{money(publicUpiAmountToPay)} via UPI App
                  </a>

                  <div style={{ marginTop: "20px" }}>
                    <p style={{ fontSize: "0.85rem", color: "#666", marginBottom: "10px", fontWeight: "bold" }}>
                      Or select your app directly:
                    </p>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                      <a href={publicUpiUri.replace("upi://pay", "phonepe://pay")} style={{ padding: "8px 16px", backgroundColor: "#5f259f", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "0.85rem", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>PhonePe</a>
                      <a href={publicUpiUri.replace("upi://pay", "tez://upi/pay")} style={{ padding: "8px 16px", backgroundColor: "#1a73e8", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "0.85rem", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>G-Pay</a>
                      <a href={publicUpiUri.replace("upi://pay", "paytmmp://pay")} style={{ padding: "8px 16px", backgroundColor: "#00baf2", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "0.85rem", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>Paytm</a>
                      <a href={publicUpiUri.replace("upi://pay", "credpay://upi/pay")} style={{ padding: "8px 16px", backgroundColor: "#212121", color: "white", textDecoration: "none", borderRadius: "6px", fontWeight: "bold", fontSize: "0.85rem", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>CRED</a>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginTop: "25px", borderTop: "1px dashed #e2e8f0", paddingTop: "20px" }}>
              <p style={{ fontSize: "0.9rem", color: "#666", marginBottom: "10px", fontWeight: "bold", textAlign: "center" }}>
                Connect With Us:
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <a href="https://chat.whatsapp.com/FHoih8XtTXGLtPvHWx7MO6?mode=gi_t" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", backgroundColor: "#25D366", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.2rem" }}>💬</span> WhatsApp Group
                </a>
                <a href="https://www.instagram.com/jalaram_jewellers_?igsh=MWZnNmlzMTYyOWNzeA%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", background: "linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}>
                  <span style={{ fontSize: "1.2rem" }}>📸</span> Instagram
                </a>
              </div>
            </div>

            {publicBill.mode === "invoice" ? (
              <div className="declaration" style={{ marginTop: "20px" }}>
                <p className="section-title">DECLARATION</p>
                <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <div onClick={() => {
                      if(pbBranch.map_url && pbBranch.map_url !== "#") {
                          window.open(pbBranch.map_url, "_blank");
                      } else {
                          toast.info("Feedback link not set for this branch yet!");
                      }
                  }} style={{ flex: 1, padding: "12px", backgroundColor: "#facc15", color: "#854d0e", textAlign: "center", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", cursor: "pointer" }}>⭐ Leave Feedback</div>
                  <a href="https://linktr.ee/JalaramJewellers" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", backgroundColor: "#1e293b", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>ℹ️ About Us</a>
                </div>
              </div>
            ) : (
              <div className="policies" style={{ marginTop: "20px" }}>
                <p className="section-title">POLICIES, T&C</p>
                <ul className="policies-list">
                  <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                  <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                </ul>
                <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <div onClick={() => {
                      if(pbBranch.map_url && pbBranch.map_url !== "#") {
                          window.open(pbBranch.map_url, "_blank");
                      } else {
                          toast.info("Feedback link not set for this branch yet!");
                      }
                  }} style={{ flex: 1, padding: "12px", backgroundColor: "#facc15", color: "#854d0e", textAlign: "center", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", cursor: "pointer" }}>⭐ Leave Feedback</div>
                  <a href="https://linktr.ee/JalaramJewellers" target="_blank" rel="noopener noreferrer" style={{ flex: 1, padding: "12px", backgroundColor: "#1e293b", color: "white", textAlign: "center", textDecoration: "none", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)" }}>ℹ️ About Us</a>
                </div>
              </div>
            )}
          </div>

          <footer className="sheet-footer">
            <p>Authorised Signature</p>
            <p>Thanking you.</p>
          </footer>
        </section>
      </div>
    );
  }

  // ✅ UX improvement to show users that the server is waking up
  if (checkingSession) {
    return (
      <div className="loading-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: '#0f172a' }}>Loading billing dashboard...</div>
        {isWakingUp && (
          <div style={{ marginTop: '20px', textAlign: 'center', padding: '15px', backgroundColor: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', maxWidth: '320px' }}>
            <p style={{ margin: '0 0 15px 0', fontSize: '0.9rem', color: '#64748b' }}>
              The database server is currently waking up from sleep mode. This usually takes about <strong>30 to 60 seconds</strong>.
            </p>
            <Button 
              variant="outline" 
              onClick={() => { localStorage.clear(); window.location.reload(); }} 
              style={{ width: '100%', borderColor: '#ef4444', color: '#ef4444' }}
            >
              Force Quit & Clear Session
            </Button>
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
          <Button type="submit" disabled={loggingIn}>
            {loggingIn ? "Checking..." : "Login"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="billing-app">

      <Toaster position="bottom-right" />

      <header className="top-bar no-print">
        <div className="brand-block" style={{ display: "flex", alignItems: "center", gap: "15px" }}>
          <div>
            <h1 className="brand-title">{settings.shop_name}</h1>
            <p className="brand-tagline">{settings.tagline}</p>
          </div>
          
          <div style={{ paddingLeft: "15px", borderLeft: "2px solid rgba(255,255,255,0.2)" }}>
             <select 
                value={globalBranchId} 
                onChange={(e) => handleGlobalBranchChange(e.target.value)} 
                style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "white", border: "1px solid rgba(255,255,255,0.3)", padding: "6px 12px", borderRadius: "6px", fontWeight: "bold", outline: "none", cursor: "pointer" }}
             >
                {settings.branches.map(b => <option key={b.id} value={b.id} style={{ color: "black" }}>📍 {b.name}</option>)}
             </select>
          </div>
        </div>

        <div className="mode-toggle">
          <Button onClick={() => handleModeChange("invoice")} className={mode === "invoice" ? "mode-active" : "mode-inactive"}>Invoice Mode</Button>
          <Button onClick={() => handleModeChange("estimate")} className={mode === "estimate" ? "mode-active" : "mode-inactive"}>Estimate Mode</Button>
        </div>

        <div className={`cloud-badge ${cloudStatus.enabled ? "cloud-badge-live" : "cloud-badge-fallback"}`}>
          <span className="cloud-dot" />
          <span>Cloud Sync: {cloudStatus.enabled ? "Live" : "Fallback"}</span>
        </div>

        <div className="top-actions">
          <Button variant="outline" onClick={goToBillTop}>Back</Button>
          <Button variant="outline" onClick={handleLogout}>Logout</Button>
        </div>
      </header>

      <main className="main-layout">
        
        <section id="bill-print-root" className="bill-sheet" style={{ "--print-scale-factor": (printScale / 100).toFixed(3), position: 'relative', zIndex: 1 }}>
          
          {isPaymentDone && (
            <div className="watermark-done">
              PAYMENT DONE
            </div>
          )}

          <div className="bill-header">
            <div className="logo-area">
              {settings.logo_data_url ? (
                <img src={settings.logo_data_url} alt="Shop Logo" className="shop-logo" />
              ) : (
                <div className="shop-logo-fallback">JJ</div>
              )}
              
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

            <div className="contact-area">
              <div className="contact-address" style={{ fontFamily: settings.address_font || "sans-serif", display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px', alignItems: settings.address_align === 'left' ? 'flex-start' : settings.address_align === 'right' ? 'flex-end' : 'center', textAlign: settings.address_align || "center" }}>
                  <a href={activeBillBranch.map_url !== "#" ? activeBillBranch.map_url : "#"} target="_blank" rel="noopener noreferrer" style={{ color: settings.address_color || "#475569", fontSize: `${settings.address_size || 14}px`, textDecoration: 'none' }}>
                    {activeBillBranch.address}
                  </a>
              </div>
              
              <div style={{ width: "100%", textAlign: settings.phone_align || "center", fontFamily: settings.phone_font || "sans-serif", fontSize: `${settings.phone_size || 13}px`, marginBottom: "4px" }}>
                {settings.phone_numbers.map((phone, idx) => (
                  <span key={idx}>
                    <a href={`tel:${phone.replace(/\s+/g, '')}`} style={{ color: settings.phone_color || "#475569", textDecoration: 'none' }}>
                      {phone}
                    </a>
                    {idx < settings.phone_numbers.length - 1 && " | "}
                  </span>
                ))}
              </div>

              <div style={{ width: "100%", textAlign: settings.email_align || "center", fontFamily: settings.email_font || "sans-serif", fontSize: `${settings.email_size || 13}px`, marginBottom: "4px" }}>
                <a href={`mailto:${settings.email}`} style={{ color: settings.email_color || "#475569", textDecoration: 'none' }}>
                  {settings.email}
                </a>
              </div>
              
              {mode === "invoice" && <p style={{ margin: "4px 0", textAlign: "center" }}>GSTIN: {settings.gstin}</p>}
            </div>
          </div>

          <div className="sheet-banner">
            {mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}
          </div>

          <div className="meta-grid">
            <p><strong>{mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong> {isNumberLoading ? "Generating..." : documentNumber || "-"}</p>
            <p><strong>Date:</strong> {billDate}</p>
          </div>

          <div className="customer-box">
            <p><strong>Name:</strong> {customer.name || "-"}</p>
            <p><strong>Address:</strong> {customer.address || "-"}</p>
            <p><strong>Phone:</strong> {customer.phone || "-"}</p>
          </div>

          <table className="bill-table">
            <thead>
              {isCompactView ? (
                <tr><th>#</th><th>Item</th><th>Wt / Rate</th><th>Amount</th></tr>
              ) : mode === "invoice" ? (
                <tr><th>Sl. No.</th><th>DESCRIPTION</th><th>HSN</th><th>WEIGHT IN GRAMS</th><th>RATE PER GRAM Rs.</th><th>AMOUNT Ps.</th></tr>
              ) : (
                <tr><th>SI. No.</th><th>Particulars</th><th>Weight</th><th>Quantity / Rate</th><th>Amount Rupees.</th><th>PS.</th></tr>
              )}
            </thead>
            <tbody>
              {computed.items.map((item) => (
                <tr key={item.id}>
                  {isCompactView ? (
                    <>
                      <td>{item.slNo}</td>
                      <td><strong>{item.description || "-"}</strong>{mode === "invoice" && <div>HSN: {item.hsn || "-"}</div>}</td>
                      <td>{money(item.weight)}g × ₹{money(item.rate)}</td>
                      <td>{item.rupees}.{item.paise}</td>
                    </>
                  ) : (
                    <>
                      <td>{item.slNo}</td>
                      <td>{item.description || "-"}</td>
                      <td>{mode === "invoice" ? item.hsn || "-" : money(item.weight)}</td>
                      <td>{mode === "invoice" ? money(item.weight) : `${money(item.quantity)} × ${money(item.rate)}`}</td>
                      <td>{money(item.rate)}</td>
                      <td>{item.rupees}.{item.paise}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sheet-bottom-stack">
            <div className="totals">
              <div className="totals-row">
                <span>{mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span>
                <strong>₹{money(computed.taxable)}</strong>
              </div>

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

              <div className="totals-row"><span>MDR (Card 2%)</span><strong>₹{money(computed.mdr)}</strong></div>
              <div className="totals-row"><span>ROUNDED OFF</span><strong>₹{money(computed.roundOff)}</strong></div>
              <div className="totals-row total-highlight">
                <span>GRAND TOTAL</span>
                <strong>₹{money(computed.grandTotal)}</strong>
              </div>

              <div className="payment-method-view">
                <span>Payment Method:</span>
                <strong>
                  {!paymentMethod 
                    ? "NOT SELECTED"
                    : paymentMethod === "Split" 
                    ? `Split (Cash: ₹${money(splitCash)}, UPI: ₹${money(upiAmountToPay)})` 
                    : paymentMethod}
                </strong>
              </div>

              {showDashboardUpi && paymentMethod && (
                <div className="payment-qr-box">
                  <p className="scan-title">Scan Here For Payment</p>
                  <img src={dynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" />
                  <p className="upi-id">UPI: {upiId}</p>
                </div>
              )}
            </div>

            {mode === "invoice" ? (
              <div className="declaration">
                <p className="section-title">DECLARATION</p>
                <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                <div className="about-qr">
                  <p className="section-title">About Us QR</p>
                  {(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && (
                    <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" />
                  )}
                </div>
                <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <div onClick={() => {
                      if(activeBillBranch.map_url && activeBillBranch.map_url !== "#") {
                          window.open(activeBillBranch.map_url, "_blank");
                      } else {
                          toast.info("Feedback link not set for this branch yet!");
                      }
                  }} style={{ flex: 1, padding: "12px", backgroundColor: "#facc15", color: "#854d0e", textAlign: "center", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", cursor: "pointer" }}>⭐ Leave Feedback</div>
                </div>
              </div>
            ) : (
              <div className="policies">
                <p className="section-title">POLICIES, T&C</p>
                <ul className="policies-list">
                  <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                  <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                </ul>
                <div className="about-qr">
                  <p className="section-title">About Us QR</p>
                  {(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && (
                    <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" />
                  )}
                </div>
                <div className="no-print" style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                  <div onClick={() => {
                      if(activeBillBranch.map_url && activeBillBranch.map_url !== "#") {
                          window.open(activeBillBranch.map_url, "_blank");
                      } else {
                          toast.info("Feedback link not set for this branch yet!");
                      }
                  }} style={{ flex: 1, padding: "12px", backgroundColor: "#facc15", color: "#854d0e", textAlign: "center", fontWeight: "bold", borderRadius: "8px", boxShadow: "0 2px 4px rgba(0,0,0,0.1)", cursor: "pointer" }}>⭐ Leave Feedback</div>
                </div>
              </div>
            )}
          </div>

          <footer className="sheet-footer">
            <p>Authorised Signature</p>
            <p>Thanking you.</p>
          </footer>
        </section>

        <aside className="controls no-print">
          <div className="control-card">
            
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                <h3 style={{ margin: 0 }}>Bill Details</h3>
                <select 
                    value={billBranchId} 
                    onChange={async (e) => { 
                        if (isDirty && !paymentMethod) {
                            toast.error("Please select payment method.");
                            return;
                        }
                        setBillBranchId(e.target.value); 
                        markDirty(); 
                        if (!editingDocNumber) { await reserveNumber(mode, e.target.value); }
                    }} 
                    style={{ padding: "4px 8px", borderRadius: "6px", border: "1px solid #cbd5e1", fontSize: "0.85rem", outline: "none", cursor: "pointer" }}
                >
                    {settings.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
            </div>

            <div style={{ marginBottom: "15px", paddingBottom: "15px", borderBottom: "1px dashed var(--border)" }}>
              <label className="select-label" style={{ fontSize: "0.8rem", marginBottom: "4px", display: "block" }}>
                Bill Number (Editable)
              </label>
              <Input 
                value={documentNumber} 
                onChange={(e) => { setDocumentNumber(e.target.value); markDirty(); }} 
                placeholder="e.g. INV-0212" 
                disabled={!!editingDocNumber} 
                style={{ fontWeight: "bold", color: "var(--brand)", backgroundColor: editingDocNumber ? "#f1f5f9" : "white" }} 
              />
              <p style={{ fontSize: "0.75rem", color: "#666", marginTop: "4px" }}>
                {editingDocNumber ? "Cannot change number of a saved bill." : "Change this to skip the counter forward."}
              </p>
            </div>

            <Input value={customer.name} onChange={(e) => { setCustomer((prev) => ({ ...prev, name: e.target.value })); markDirty(); }} placeholder="Customer name" />
            <Input value={customer.phone} onChange={(e) => { setCustomer((prev) => ({ ...prev, phone: e.target.value })); markDirty(); }} placeholder="Phone" />
            <Input value={customer.address} onChange={(e) => { setCustomer((prev) => ({ ...prev, address: e.target.value })); markDirty(); }} placeholder="Address" />
            <Input value={customer.email} onChange={(e) => { setCustomer((prev) => ({ ...prev, email: e.target.value })); markDirty(); }} placeholder="Email" />
            <Input type="text" value={billDate} onChange={(e) => { setBillDate(e.target.value); markDirty(); }} placeholder="YYYY-MM-DD" />

            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      setCustomer({ name: entry.name, phone: entry.phone, address: entry.address, email: entry.email });
                      setSuggestions([]);
                      markDirty();
                    }}
                  >
                    {entry.name} · {entry.phone}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="control-card">
            <h3>Item Lines</h3>
            {items.map((item) => (
              <div key={item.id} className="item-row-editor">
                <Input value={item.description} onChange={(e) => updateItem(item.id, "description", e.target.value)} placeholder="Description" />
                <Input value={item.hsn} onChange={(e) => updateItem(item.id, "hsn", e.target.value)} placeholder="HSN" />
                <Input value={item.weight} onChange={(e) => updateItem(item.id, "weight", e.target.value)} placeholder="Weight" />
                <Input value={item.quantity} onChange={(e) => updateItem(item.id, "quantity", e.target.value)} placeholder="Qty" />
                <Input value={item.rate_override} onChange={(e) => updateItem(item.id, "rate_override", e.target.value)} placeholder="Rate override" />
                <Input value={item.amount_override} onChange={(e) => updateItem(item.id, "amount_override", e.target.value)} placeholder="Amount override" />
                <Button type="button" variant="outline" onClick={() => { setItems((prev) => prev.filter((row) => row.id !== item.id)); markDirty(); }} disabled={items.length === 1}>Remove</Button>
              </div>
            ))}
            <Button type="button" onClick={() => { setItems((prev) => [...prev, createItem(settings.default_hsn)]); markDirty(); }}>Add Item</Button>
          </div>

          <div className="control-card">
            <h3>Adjustments</h3>
            <Input value={discount} onChange={(e) => { setDiscount(e.target.value); markDirty(); }} placeholder="Discount" />
            <Input value={exchange} onChange={(e) => { setExchange(e.target.value); markDirty(); }} placeholder="Exchange" />
            <Input value={manualRoundOff} onChange={(e) => { setManualRoundOff(e.target.value); markDirty(); }} placeholder="Manual round off (optional)" />

            <label htmlFor="payment-method-select" className="select-label">Payment Method</label>
            <select id="payment-method-select" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); markDirty(); }} className="native-select">
              <option value="" disabled>Select Method</option>
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              {mode === "invoice" && <option value="Card">Card</option>}
              <option value="Split">Split (Cash + UPI)</option>
            </select>

            {paymentMethod === "Split" && (
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <Input value={splitCash} onChange={(e) => { setSplitCash(e.target.value); markDirty(); }} placeholder="Cash Received ₹" />
                <Input value={`UPI: ₹${money(Math.max(0, computed.grandTotal - num(splitCash)))}`} disabled style={{ backgroundColor: "#f1f5f9" }} />
              </div>
            )}

            <div 
              style={{ marginTop: "15px", padding: "12px", backgroundColor: isPaymentDone ? "#dcfce7" : "#fef3c7", border: `1.5px solid ${isPaymentDone ? "#22c55e" : "#f59e0b"}`, borderRadius: "8px", display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", transition: "all 0.2s" }} 
              onClick={() => { setIsPaymentDone(!isPaymentDone); markDirty(); }}
            >
              <input 
                type="checkbox" 
                checked={isPaymentDone} 
                onChange={(e) => { setIsPaymentDone(e.target.checked); markDirty(); }} 
                onClick={(e) => e.stopPropagation()} 
                style={{ width: "20px", height: "20px", cursor: "pointer" }} 
              />
              <strong style={{ color: isPaymentDone ? "#166534" : "#b45309", fontSize: "1.1rem" }}>
                {isPaymentDone ? "✅ PAYMENT DONE" : "⏳ PAYMENT PENDING"}
              </strong>
            </div>

            <textarea value={notes} onChange={(e) => { setNotes(e.target.value); markDirty(); }} placeholder="Notes" className="notes-box" style={{ marginTop: "15px" }} />
          </div>

          <div className="control-card action-grid">
            <Button onClick={saveBill} disabled={savingBill} style={{ backgroundColor: "#0f172a" }}>
              {savingBill ? "Saving..." : editingDocNumber ? `Update (${editingDocNumber})` : "Save Bill"}
            </Button>
            
            <Button onClick={() => setShowLedger(true)} style={{ backgroundColor: "#16a34a", color: "white" }}>Daily Sales & Ledger</Button>
            
            <Button onClick={() => { setShowRecentBills(true); setBillSearchQuery(""); setRecentBranchFilter("ALL"); }} variant="outline">Recent Bills</Button>
            <Button onClick={() => downloadPdf("bill-print-root", documentNumber || mode)}>Download PDF</Button>
            <Button onClick={() => window.print()}>Print</Button>
            <Button onClick={shareWhatsApp}>WhatsApp Link</Button>
            <Button onClick={shareEmail}>Email Link</Button>
            <Button onClick={() => {
              if (isDirty && !window.confirm("⚠️ You have unsaved changes. Clear screen and start a new bill anyway?")) return;
              clearBill(mode, billBranchId);
            }} variant="outline">New Bill</Button>
            <Button onClick={() => setShowSettings(true)} variant="outline">Settings</Button>
          </div>
        </aside>
      </main>

      {/* DAILY SALES, LEDGER & EXPENSE DRAWER */}
      {showLedger && (
        <section className="side-drawer no-print" style={{ width: "650px", overflowY: "auto" }}>
          <div className="drawer-header" style={{ backgroundColor: "#f0fdf4", borderBottom: "2px solid #bbf7d0", padding: "20px", position: "sticky", top: 0, zIndex: 10 }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "10px" }}><Banknote /> Vaults & Ledger: {activeGlobalBranch.name}</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowLedger(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>

          <div style={{ padding: "20px" }}>
            
            <div style={{ marginBottom: "25px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Live Vault Balances</h4>
              <div style={{ display: "flex", gap: "10px" }}>
                <div style={{ flex: 1, backgroundColor: "#fffbeb", border: "1px solid #fde68a", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
                  <Banknote size={24} color="#d97706" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ margin: "0 0 5px 0", fontSize: "0.85rem", color: "#92400e", fontWeight: "bold" }}>Cash Drawer</p>
                  {editingBalances ? (
                    <Input type="number" value={manualCash} onChange={(e) => setManualCash(e.target.value)} style={{ textAlign: "center", marginTop: "5px" }} />
                  ) : (
                    <h3 style={{ margin: 0, color: "#b45309", fontSize: "1.3rem" }}>₹{money(activeGlobalBranch.cash_balance)}</h3>
                  )}
                </div>

                <div style={{ flex: 1, backgroundColor: "#eff6ff", border: "1px solid #bfdbfe", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
                  <Wallet size={24} color="#2563eb" style={{ margin: "0 auto 8px auto" }} />
                  <p style={{ margin: "0 0 5px 0", fontSize: "0.85rem", color: "#1e40af", fontWeight: "bold" }}>Estimate Bank</p>
                  {editingBalances ? (
                    <Input type="number" value={manualEstBank} onChange={(e) => setManualEstBank(e.target.value)} style={{ textAlign: "center", marginTop: "5px" }} />
                  ) : (
                    <h3 style={{ margin: 0, color: "#1d4ed8", fontSize: "1.3rem" }}>₹{money(activeGlobalBranch.estimate_bank_balance)}</h3>
                  )}
                </div>

                <div style={{ flex: 1, backgroundColor: "#fef2f2", border: "1px solid #fecaca", padding: "15px", borderRadius: "10px", textAlign: "center" }}>
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
                   <Button size="sm" variant="outline" onClick={() => {
                     setManualCash(activeGlobalBranch.cash_balance || 0);
                     setManualEstBank(activeGlobalBranch.estimate_bank_balance || 0);
                     setManualInvBank(activeGlobalBranch.invoice_bank_balance || 0);
                     setEditingBalances(true);
                   }}>Manually Edit Balances</Button>
                 ) : (
                   <div style={{ display: "inline-flex", gap: "10px" }}>
                     <Button size="sm" variant="outline" onClick={() => setEditingBalances(false)}>Cancel</Button>
                     <Button size="sm" style={{ backgroundColor: "#16a34a" }} onClick={saveBalances}>Save Balances</Button>
                   </div>
                 )}
              </div>
            </div>

            <div style={{ marginBottom: "30px", padding: "15px", backgroundColor: "#f8fafc", border: "1px solid #cbd5e1", borderRadius: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h4 style={{ margin: "0" }}>Log Expenses & Vault Exchanges</h4>
                <Button size="sm" onClick={() => setShowLogForm(!showLogForm)} style={{ backgroundColor: "#0f172a" }}>
                  <Plus size={16} style={{ marginRight: "5px" }} /> New Entry
                </Button>
              </div>
              
              {showLogForm && (
                <div style={{ marginTop: "15px", paddingTop: "15px", borderTop: "1px dashed #cbd5e1" }}>
                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <label className="select-label">Transaction Type</label>
                      <select value={logType} onChange={(e) => setLogType(e.target.value)} className="native-select">
                        <option value="expense">Expense (Deduct Money)</option>
                        <option value="add">Add Funds (Add Money)</option>
                        <option value="exchange">Exchange (Move Vault to Vault)</option>
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label className="select-label">Amount (₹)</label>
                      <Input type="number" placeholder="e.g. 500" value={logAmount} onChange={(e) => setLogAmount(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                    <div style={{ flex: 1 }}>
                      <label className="select-label">{logType === "add" ? "To Vault" : "From Vault"}</label>
                      <select value={logSourceVault} onChange={(e) => setLogSourceVault(e.target.value)} className="native-select">
                        <option value="cash">Cash Drawer</option>
                        <option value="estimate_bank">Estimate Bank</option>
                        <option value="invoice_bank">GST Bank</option>
                      </select>
                    </div>
                    {logType === "exchange" && (
                      <div style={{ flex: 1 }}>
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
                    <Button onClick={submitLedgerLog} disabled={submittingLog} style={{ flex: 2, backgroundColor: "#16a34a" }}>
                      {submittingLog ? "Saving..." : "Save Transaction"}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "30px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Today's Bill Collections ({today()})</h4>
              {ledgerLoading ? (
                <p>Calculating today's sales...</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", backgroundColor: "#f8fafc", padding: "15px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                    <span style={{ color: "#475569" }}>Physical Cash Collected:</span>
                    <strong style={{ color: "#d97706" }}>+ ₹{money(todaysTotalCash)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #e2e8f0", paddingBottom: "8px" }}>
                    <span style={{ color: "#475569" }}>Estimate Bank Collected:</span>
                    <strong style={{ color: "#2563eb" }}>+ ₹{money(todaysTotalEstBank)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#475569" }}>GST Bank Collected:</span>
                    <strong style={{ color: "#dc2626" }}>+ ₹{money(todaysTotalInvBank)}</strong>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px", paddingTop: "10px", borderTop: "2px solid #cbd5e1" }}>
                    <span style={{ fontWeight: "bold", fontSize: "1.1rem" }}>Total Day Sales:</span>
                    <strong style={{ fontSize: "1.1rem" }}>₹{money(todaysTotalCash + todaysTotalEstBank + todaysTotalInvBank)}</strong>
                  </div>
                </div>
              )}
            </div>

            <div style={{ marginBottom: "30px" }}>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b", display: "flex", alignItems: "center", gap: "8px" }}><History size={18} /> Ledger History (Expenses & Exchanges)</h4>
              {ledgerLogs.length === 0 ? (
                <p style={{ color: "#666", fontStyle: "italic" }}>No manual transactions logged yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {ledgerLogs.map(log => (
                    <div key={log.id} style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "white" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                        <strong style={{ color: "#0f172a" }}>{log.reason}</strong>
                        <span style={{ fontSize: "0.75rem", color: "#94a3b8" }}>{new Date(log.date).toLocaleDateString()}</span>
                      </div>
                      <div style={{ fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "2px" }}>
                        {log.cash_change !== 0 && (
                          <span style={{ color: log.cash_change > 0 ? "#16a34a" : "#dc2626" }}>
                            Cash: {log.cash_change > 0 ? "+" : ""}₹{money(log.cash_change)}
                          </span>
                        )}
                        {log.estimate_bank_change !== 0 && (
                          <span style={{ color: log.estimate_bank_change > 0 ? "#16a34a" : "#dc2626" }}>
                            Est Bank: {log.estimate_bank_change > 0 ? "+" : ""}₹{money(log.estimate_bank_change)}
                          </span>
                        )}
                        {log.invoice_bank_change !== 0 && (
                          <span style={{ color: log.invoice_bank_change > 0 ? "#16a34a" : "#dc2626" }}>
                            GST Bank: {log.invoice_bank_change > 0 ? "+" : ""}₹{money(log.invoice_bank_change)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 style={{ margin: "0 0 15px 0", fontSize: "1.1rem", color: "#1e293b" }}>Today's Bills</h4>
              {ledgerLoading ? (
                <p>Loading bills...</p>
              ) : todayBills.length === 0 ? (
                <p style={{ color: "#666" }}>No bills generated today yet.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {todayBills.map(b => (
                    <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", border: "1px solid #e2e8f0", borderRadius: "6px", backgroundColor: "white" }}>
                      <div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px" }}>
                          <strong style={{ color: b.mode === 'invoice' ? "#dc2626" : "#2563eb" }}>{b.document_number}</strong>
                          <span style={{ fontSize: "0.75rem", padding: "2px 6px", backgroundColor: b.is_payment_done ? "#dcfce7" : "#fee2e2", color: b.is_payment_done ? "#166534" : "#991b1b", borderRadius: "4px" }}>
                            {b.is_payment_done ? "Paid" : "Pending"}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.85rem", color: "#475569" }}>{b.customer?.name || "Unknown"} • {b.payment_method}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <strong style={{ fontSize: "1.1rem" }}>₹{money(b.totals?.grand_total)}</strong>
                        {b.payment_method === 'Split' && (
                          <div style={{ fontSize: "0.7rem", color: "#666" }}>Cash: ₹{b.split_cash} | Bank: ₹{b.totals.grand_total - b.split_cash}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* RECENT BILLS DRAWER WITH FILTER */}
      {showRecentBills && (
        <section className="side-drawer no-print">
          <div className="drawer-header">
            <h3>Recent Bills</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowRecentBills(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px", padding: "0 15px 15px 15px" }}>
            
            <select 
                value={recentBranchFilter} 
                onChange={(e) => setRecentBranchFilter(e.target.value)} 
                className="native-select"
            >
                <option value="ALL">All Branches</option>
                {settings.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>

            <Input 
              placeholder="Search by Name, Phone, or Inv No..." 
              value={billSearchQuery} 
              onChange={(e) => setBillSearchQuery(e.target.value)} 
            />

            <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
              <Button size="sm" variant="outline" onClick={() => handleResetCounter("invoice")} style={{ flex: 1 }}>Reset Invoice No.</Button>
              <Button size="sm" variant="outline" onClick={() => handleResetCounter("estimate")} style={{ flex: 1 }}>Reset Estimate No.</Button>
            </div>

            {loadingRecent ? (
              <p>Loading recent bills...</p>
            ) : recentBillsList.length === 0 ? (
              <p>No recent bills found.</p>
            ) : (
              recentBillsList.map((b) => (
                <div key={b.id} style={{ border: "1px solid var(--border)", padding: "12px", borderRadius: "8px", backgroundColor: "white" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <strong style={{ color: "var(--brand)" }}>{b.document_number}</strong>
                    <span style={{ fontSize: "0.85rem", color: "#666" }}>{b.date}</span>
                  </div>
                  <div style={{ marginBottom: "8px", fontWeight: "500" }}>{b.customer?.name || "Unknown Customer"}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong>₹{b.totals?.grand_total}</strong>
                    
                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                      
                      <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "0.85rem", cursor: "pointer", marginRight: "5px", padding: "4px 8px", backgroundColor: b.is_payment_done ? "#dcfce7" : "#fef3c7", color: b.is_payment_done ? "#166534" : "#b45309", borderRadius: "5px", fontWeight: "bold" }}>
                        <input 
                          type="checkbox" 
                          checked={b.is_payment_done || false} 
                          onChange={() => handleQuickPaymentToggle(b)} 
                          style={{ cursor: "pointer" }}
                        />
                        {b.is_payment_done ? "Paid" : "Pending"}
                      </label>

                      <Button size="sm" variant="destructive" style={{ backgroundColor: "#ef4444", color: "white" }} onClick={() => handleDeleteBill(b)}>Delete</Button>
                      <Button size="sm" onClick={() => {
                        if (isDirty && !window.confirm("⚠️ You have unsaved changes. Discard them and load this old bill?")) return;
                        loadBillForEditing(b);
                      }}>Edit</Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* SETTINGS DRAWER WITH BRANCHES */}
      {showSettings && (
        <section className="side-drawer no-print" style={{ width: "500px", overflowY: "auto" }}>
          <div className="drawer-header">
            <h3>Settings</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowSettings(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>

          <div style={{ padding: "0 15px 15px 15px" }}>
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <Button variant={settingsTab === "design" ? "default" : "outline"} onClick={() => setSettingsTab("design")} style={{ flex: 1 }}>🎨 Design</Button>
              <Button variant={settingsTab === "technical" ? "default" : "outline"} onClick={() => setSettingsTab("technical")} style={{ flex: 1 }}>⚙️ Tech</Button>
              <Button variant={settingsTab === "branches" ? "default" : "outline"} onClick={() => setSettingsTab("branches")} style={{ flex: 1 }}><Store size={16} style={{marginRight:"4px"}}/> Branches</Button>
            </div>

            {settingsTab === "design" && (
              <div className="settings-design-tab">
                {/* SHOP NAME SETTINGS */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Shop Name</h4>
                  <Input value={settings.shop_name} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name: e.target.value }))} placeholder="Shop name" style={{ marginBottom: "10px" }} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="color" value={settings.shop_name_color || "#000000"} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name_color: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px" }} title="Color" />
                    <Input type="number" min="16" max="60" value={settings.shop_name_size || 26} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name_size: Number(e.target.value) }))} style={{ width: "60px", padding: "0 5px", textAlign: "center" }} title="Font Size (px)" />
                    <select value={settings.shop_name_font || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Font Style">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="'Times New Roman', Times, serif">Times New Roman</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                      <option value="'Brush Script MT', cursive">Brush Script MT (Cursive)</option>
                    </select>
                    <select value={settings.shop_name_align || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name_align: e.target.value }))} style={{ width: "80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Alignment">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                {/* TAGLINE SETTINGS */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Tagline</h4>
                  <Input value={settings.tagline} onChange={(e) => setSettings((prev) => ({ ...prev, tagline: e.target.value }))} placeholder="Tagline" style={{ marginBottom: "10px" }} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="color" value={settings.tagline_color || "#475569"} onChange={(e) => setSettings((prev) => ({ ...prev, tagline_color: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px" }} title="Color" />
                    <Input type="number" min="8" max="40" value={settings.tagline_size || 12} onChange={(e) => setSettings((prev) => ({ ...prev, tagline_size: Number(e.target.value) }))} style={{ width: "60px", padding: "0 5px", textAlign: "center" }} title="Font Size (px)" />
                    <select value={settings.tagline_font || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, tagline_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Font Style">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="'Times New Roman', Times, serif">Times New Roman</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                      <option value="'Brush Script MT', cursive">Brush Script MT (Cursive)</option>
                    </select>
                    <select value={settings.tagline_align || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, tagline_align: e.target.value }))} style={{ width: "80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Alignment">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                {/* ADDRESS DESIGN (Global) */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Address Style (Content managed in Branches Tab)</h4>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="color" value={settings.address_color || "#475569"} onChange={(e) => setSettings((prev) => ({ ...prev, address_color: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px" }} title="Color" />
                    <Input type="number" min="8" max="30" value={settings.address_size || 14} onChange={(e) => setSettings((prev) => ({ ...prev, address_size: Number(e.target.value) }))} style={{ width: "60px", padding: "0 5px", textAlign: "center" }} title="Font Size (px)" />
                    <select value={settings.address_font || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, address_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Font Style">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="'Times New Roman', Times, serif">Times New Roman</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                    </select>
                    <select value={settings.address_align || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, address_align: e.target.value }))} style={{ width: "80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Alignment">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                {/* PHONE NUMBERS SETTINGS */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Phone Numbers</h4>
                  <Input value={settings.phone_numbers.join(", ")} onChange={(e) => setSettings((prev) => ({ ...prev, phone_numbers: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="Phone numbers (comma separated)" style={{ marginBottom: "10px" }} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="color" value={settings.phone_color || "#475569"} onChange={(e) => setSettings((prev) => ({ ...prev, phone_color: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px" }} title="Color" />
                    <Input type="number" min="8" max="30" value={settings.phone_size || 13} onChange={(e) => setSettings((prev) => ({ ...prev, phone_size: Number(e.target.value) }))} style={{ width: "60px", padding: "0 5px", textAlign: "center" }} title="Font Size (px)" />
                    <select value={settings.phone_font || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, phone_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Font Style">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="'Times New Roman', Times, serif">Times New Roman</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                    </select>
                    <select value={settings.phone_align || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, phone_align: e.target.value }))} style={{ width: "80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Alignment">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                {/* EMAIL SETTINGS */}
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Email</h4>
                  <Input value={settings.email} onChange={(e) => setSettings((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" style={{ marginBottom: "10px" }} />
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <input type="color" value={settings.email_color || "#475569"} onChange={(e) => setSettings((prev) => ({ ...prev, email_color: e.target.value }))} style={{ width: "40px", height: "35px", cursor: "pointer", padding: "0", border: "1px solid #ccc", borderRadius: "4px" }} title="Color" />
                    <Input type="number" min="8" max="30" value={settings.email_size || 13} onChange={(e) => setSettings((prev) => ({ ...prev, email_size: Number(e.target.value) }))} style={{ width: "60px", padding: "0 5px", textAlign: "center" }} title="Font Size (px)" />
                    <select value={settings.email_font || "sans-serif"} onChange={(e) => setSettings((prev) => ({ ...prev, email_font: e.target.value }))} style={{ flex: 1, height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Font Style">
                      <option value="sans-serif">Sans-serif</option>
                      <option value="Arial, Helvetica, sans-serif">Arial</option>
                      <option value="'Times New Roman', Times, serif">Times New Roman</option>
                      <option value="'Courier New', Courier, monospace">Courier New</option>
                      <option value="Georgia, serif">Georgia</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                    </select>
                    <select value={settings.email_align || "center"} onChange={(e) => setSettings((prev) => ({ ...prev, email_align: e.target.value }))} style={{ width: "80px", height: "35px", border: "1px solid #ccc", borderRadius: "6px", fontSize: "0.85rem", padding: "0 5px" }} title="Alignment">
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </div>
                </div>

                <Button onClick={saveSettings} style={{ width: "100%", marginBottom: "15px" }}>Save Design Settings</Button>
              </div>
            )}

            {settingsTab === "technical" && (
              <div className="settings-technical-tab">
                
                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Math & Formulas</h4>
                  
                  <label className="select-label" style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Silver Rate (per gram)</label>
                  <Input value={settings.silver_rate_per_gram} onChange={(e) => setSettings((prev) => ({ ...prev, silver_rate_per_gram: num(e.target.value) }))} style={{ marginBottom: "2px" }} />
                  <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "10px", marginTop: "0" }}>Example: 240 (The live market price for 1 gram of silver).</p>

                  <label className="select-label" style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Making Charge (per gram)</label>
                  <Input value={settings.making_charge_per_gram} onChange={(e) => setSettings((prev) => ({ ...prev, making_charge_per_gram: num(e.target.value) }))} style={{ marginBottom: "2px" }} />
                  <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "10px", marginTop: "0" }}>Example: 15 (The labor/making cost charged per 1 gram).</p>

                  <label className="select-label" style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Default HSN Code</label>
                  <Input value={settings.default_hsn} onChange={(e) => setSettings((prev) => ({ ...prev, default_hsn: e.target.value }))} style={{ marginBottom: "2px" }} />
                  <p style={{ fontSize: "0.75rem", color: "#666", marginBottom: "10px", marginTop: "0" }}>Example: 7113 (Automatically fills in when you add a new item).</p>

                  <label className="select-label" style={{ fontSize: "0.8rem", fontWeight: "bold" }}>Formula Note (Prints on bill)</label>
                  <Input value={settings.formula_note} onChange={(e) => setSettings((prev) => ({ ...prev, formula_note: e.target.value }))} />
                </div>

                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Global Business IDs</h4>
                  <label className="select-label" style={{ fontSize: "0.8rem" }}>GSTIN</label>
                  <Input value={settings.gstin} onChange={(e) => setSettings((prev) => ({ ...prev, gstin: e.target.value }))} style={{ marginBottom: "8px" }} />
                </div>

                <div style={{ padding: "12px", border: "1px solid #e2e8f0", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                  <h4 style={{ margin: "0 0 10px 0" }}>Printing & Uploads</h4>
                  <label className="select-label" htmlFor="print-scale-range" style={{ fontSize: "0.8rem" }}>Auto Print Scale: {printScale.toFixed(1)}%</label>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "15px" }}>
                    <input id="print-scale-range" type="range" min="98" max="102" step="0.1" value={printScale} onChange={(e) => setPrintScale(clampPrintScale(Number(e.target.value)))} style={{ flex: 1 }} />
                    <Button type="button" variant="outline" size="sm" onClick={() => setPrintScale(100)}>Reset</Button>
                  </div>

                  <div style={{ marginBottom: "15px" }}>
                    <label className="file-label" htmlFor="logo-upload-input" style={{ fontSize: "0.8rem" }}>Upload Shop Logo</label>
                    <input id="logo-upload-input" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*" onChange={handleLogoUpload} style={{ display: "block", marginBottom: "5px" }} />
                    <span style={{ fontSize: "0.75rem", color: "#666" }}>{logoUploadName ? `Selected: ${logoUploadName}` : "No logo selected"}</span>
                    {settings.logo_data_url && <img src={settings.logo_data_url} alt="Logo preview" style={{ maxWidth: "80px", marginTop: "5px", display: "block" }} />}
                  </div>

                  <div>
                    <label className="file-label" htmlFor="about-qr-upload-input" style={{ fontSize: "0.8rem" }}>Upload About Us QR</label>
                    <input id="about-qr-upload-input" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*" onChange={handleAboutQrUpload} style={{ display: "block", marginBottom: "5px" }} />
                    <span style={{ fontSize: "0.75rem", color: "#666" }}>{aboutUploadName ? `Selected: ${aboutUploadName}` : "No QR selected"}</span>
                    {(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="QR preview" style={{ maxWidth: "80px", marginTop: "5px", display: "block" }} />}
                  </div>
                </div>

                <Button onClick={saveSettings} style={{ width: "100%", marginBottom: "15px" }}>Save Technical Settings</Button>

                <div style={{ marginTop: "20px", padding: "15px", border: "1px solid #ef4444", borderRadius: "8px", backgroundColor: "#fef2f2" }}>
                  <h4 style={{ margin: "0 0 10px 0", color: "#b91c1c" }}>Database & Backup</h4>
                  
                  <div style={{ marginBottom: "15px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "5px", color: "#7f1d1d" }}>
                      <span>Storage Used: {(storageStats.used_bytes / 1024).toFixed(2)} KB</span>
                      <span>{storageStats.percentage}%</span>
                    </div>
                    <div style={{ width: "100%", backgroundColor: "#fca5a5", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                      <div style={{ width: `${storageStats.percentage}%`, backgroundColor: "#dc2626", height: "100%", transition: "width 0.5s ease" }}></div>
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <Button type="button" variant="outline" onClick={handleBackupBills}>⬇️ Download Backup (JSON)</Button>
                    <Button type="button" variant="destructive" style={{ backgroundColor: "#ef4444", color: "white" }} onClick={handleDeleteAllBills}>⚠️ Wipe All Bills (Clear Storage)</Button>
                  </div>
                </div>

              </div>
            )}

            {/* ✅ NEW: BRANCHES TAB */}
            {settingsTab === "branches" && (
               <div className="settings-branches-tab">
                   <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "15px" }}>
                       <p style={{ margin: 0, fontSize: "0.9rem", color: "#475569" }}>Manage isolated branch ledgers and addresses here.</p>
                       <Button size="sm" onClick={() => {
                           const newBranch = {
                               id: `B${Date.now()}`,
                               name: "New Branch",
                               address: "",
                               map_url: "#",
                               invoice_upi_id: "",
                               estimate_upi_id: "",
                               cash_balance: 0,
                               estimate_bank_balance: 0,
                               invoice_bank_balance: 0
                           };
                           setSettings(prev => ({ ...prev, branches: [...prev.branches, newBranch] }));
                       }}>+ Add Branch</Button>
                   </div>

                   {settings.branches.map((b, index) => (
                       <div key={b.id} style={{ padding: "15px", border: "1px solid #cbd5e1", borderRadius: "8px", marginBottom: "15px", backgroundColor: "#f8fafc" }}>
                           <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                              <h4 style={{ margin: 0, color: "var(--brand)" }}>Branch: {b.name}</h4>
                              {settings.branches.length > 1 && (
                                  <Button size="sm" variant="outline" style={{ borderColor: "#ef4444", color: "#ef4444", padding: "0 8px", height: "24px" }} onClick={() => {
                                      if(window.confirm(`Delete ${b.name}?`)) {
                                          setSettings(prev => ({ ...prev, branches: prev.branches.filter(x => x.id !== b.id) }));
                                      }
                                  }}>Delete</Button>
                              )}
                           </div>

                           <label className="select-label" style={{ fontSize: "0.8rem" }}>Branch Name (Internal Use)</label>
                           <Input value={b.name} onChange={(e) => {
                               const newBranches = [...settings.branches];
                               newBranches[index].name = e.target.value;
                               setSettings(prev => ({ ...prev, branches: newBranches }));
                           }} style={{ marginBottom: "8px" }} />

                           <label className="select-label" style={{ fontSize: "0.8rem" }}>Printed Bill Address</label>
                           <Input value={b.address} onChange={(e) => {
                               const newBranches = [...settings.branches];
                               newBranches[index].address = e.target.value;
                               setSettings(prev => ({ ...prev, branches: newBranches }));
                           }} style={{ marginBottom: "8px" }} />

                           <label className="select-label" style={{ fontSize: "0.8rem" }}>Google Maps Review Link</label>
                           <Input value={b.map_url} onChange={(e) => {
                               const newBranches = [...settings.branches];
                               newBranches[index].map_url = e.target.value;
                               setSettings(prev => ({ ...prev, branches: newBranches }));
                           }} style={{ marginBottom: "8px" }} />

                           <label className="select-label" style={{ fontSize: "0.8rem" }}>Invoice UPI ID</label>
                           <Input value={b.invoice_upi_id} onChange={(e) => {
                               const newBranches = [...settings.branches];
                               newBranches[index].invoice_upi_id = e.target.value;
                               setSettings(prev => ({ ...prev, branches: newBranches }));
                           }} style={{ marginBottom: "8px" }} />

                           <label className="select-label" style={{ fontSize: "0.8rem" }}>Estimate UPI ID</label>
                           <Input value={b.estimate_upi_id} onChange={(e) => {
                               const newBranches = [...settings.branches];
                               newBranches[index].estimate_upi_id = e.target.value;
                               setSettings(prev => ({ ...prev, branches: newBranches }));
                           }} style={{ marginBottom: "8px" }} />
                       </div>
                   ))}

                   <Button onClick={saveSettings} style={{ width: "100%", marginBottom: "15px" }}>Save Branch Settings</Button>
               </div>
            )}
          </div>
        </section>
      )}

      {showAbout && (
        <section className="side-drawer no-print">
          <div className="drawer-header">
            <h3>About This App</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowAbout(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>
          
          <div className="cloud-note" style={{ marginTop: "15px", padding: "0 15px" }}>
            <h4>Cloud Database Setup</h4>
            <ol>
              <li>Create Supabase project and get project URL + service role key.</li>
              <li>Add them in backend <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>.</li>
              <li>Create <code>customers</code> and <code>number_counters</code> tables as in README.</li>
            </ol>
            <p className="cloud-status-text">Cloud status: {cloudStatus.enabled ? "Connected" : "Placeholder mode"} ({cloudStatus.mode})</p>
          </div>
        </section>
      )}
    </div>
  );
}
