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
          if (!sData.branches) { sData.branches = defaultSettings.branches; }
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
      try { await axios.get(`${API}/auth/verify`, { headers: authHeaders }); } 
      catch { localStorage.removeItem("jj_auth_token"); setToken(""); } 
      finally { setCheckingSession(false); }
    };
    verify();
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
  }, [showRecentBills, token, isPublicView, billSearchQuery, recentBranchFilter]); 

  const fetchLedgerHistory = async () => {
    try {
      const res = await axios.get(`${API}/settings/ledger/logs?branch_id=${globalBranchId}`, { headers: authHeaders });
      setLedgerLogs(res.data);
    } catch { toast.error("Failed to load ledger history."); }
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
  }, [showSettings, token, isPublicView]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    const savedAboutQr = localStorage.getItem("jj_about_qr_data_url");
    let dbData = response.data;
    if (!dbData.branches) { dbData.branches = defaultSettings.branches; }
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
      try { await loadSettings(); await fetchCloudStatus(); await reserveNumber(mode, billBranchId); } 
      catch { toast.error("Could not load billing settings."); }
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
    if (query.length < 2) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const response = await axios.get(`${API}/customers/suggest`, { headers: authHeaders, params: { query } });
        setSuggestions(response.data || []);
      } catch { setSuggestions([]); }
    }, 250);
    return () => clearTimeout(timer);
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
    const cgst = mode === "invoice" ? taxable * 0.015
