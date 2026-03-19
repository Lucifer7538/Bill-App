import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster, toast } from "sonner";
import "@/App.css";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;
const STATIC_ABOUT_QR_URL = process.env.REACT_APP_ABOUT_QR_URL;

const createItem = () => ({
  id: `${Date.now()}-${Math.random()}`,
  description: "",
  hsn: "",
  weight: "",
  quantity: "1",
  rate_override: "",
  amount_override: "",
});

const defaultSettings = {
  shop_name: "Jalaram Jewellers",
  tagline: "The Silver Specialist",
  address:
    "Shop No.14, BMC Market Complex, Market Building, Near Petrol Pump, Unit-2 BBSR-9",
  phone_numbers: ["+91 9583221115", "+91 9776177296", "+91 7538977527"],
  email: "jalaramjewellers26@gmail.com",
  gstin: "21AAUFJ1925F1ZH",
  silver_rate_per_10g: 1200,
  making_charge_per_gram: 80,
  formula_note:
    "Line total = Weight × ((Silver rate per 10g / 10) + Making charge per gram)",
  logo_data_url: "",
  about_qr_data_url: STATIC_ABOUT_QR_URL,
  invoice_upi_id: "eazypay.0000048595@icici",
  estimate_upi_id: "7538977527@ybl",
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
  
  // --- PUBLIC VIEW STATE ---
  const [isPublicView, setIsPublicView] = useState(false);
  const [publicBill, setPublicBill] = useState(null);
  const [publicSettings, setPublicSettings] = useState(null);
  const [publicLoading, setPublicLoading] = useState(false);

  // --- AUTH & DASHBOARD STATE ---
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem("jj_auth_token") || "");
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem("jj_auth_token")));
  const [loggingIn, setLoggingIn] = useState(false);

  const [mode, setMode] = useState("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
  const [editingDocNumber, setEditingDocNumber] = useState(null);
  const [isNumberLoading, setIsNumberLoading] = useState(false);
  const [billDate, setBillDate] = useState(today());
  const [settings, setSettings] = useState(defaultSettings);

  const [customer, setCustomer] = useState({ name: "", phone: "", address: "", email: "" });
  const [suggestions, setSuggestions] = useState([]);

  const [items, setItems] = useState([createItem()]);
  const [discount, setDiscount] = useState("0");
  const [exchange, setExchange] = useState("0");
  const [manualRoundOff, setManualRoundOff] = useState("");
  
  const [paymentMethod, setPaymentMethod] = useState("Cash");
  const [splitCash, setSplitCash] = useState(""); // ✅ For Split payments
  const [isPaymentDone, setIsPaymentDone] = useState(false); 
  const [notes, setNotes] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  
  // --- RECENT BILLS STATE ---
  const [showRecentBills, setShowRecentBills] = useState(false);
  const [recentBillsList, setRecentBillsList] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [billSearchQuery, setBillSearchQuery] = useState("");

  // --- STORAGE DATA STATE ---
  const [storageStats, setStorageStats] = useState({ used_bytes: 0, quota_bytes: 524288000, percentage: 0 });
  
  const [savingBill, setSavingBill] = useState(false);
  const [printScale, setPrintScale] = useState(getInitialPrintScale);
  const [logoUploadName, setLogoUploadName] = useState("");
  const [aboutUploadName, setAboutUploadName] = useState("");
  const [cloudStatus, setCloudStatus] = useState({ provider: "supabase", enabled: false, mode: "loading" });
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

  // CHECK FOR PUBLIC LINK ON LOAD
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
          setPublicSettings(res.data.settings);
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
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout, showRecentBills]);

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
      try {
        await axios.get(`${API}/auth/verify`, { headers: authHeaders });
      } catch {
        localStorage.removeItem("jj_auth_token");
        setToken("");
      } finally {
        setCheckingSession(false);
      }
    };
    verify();
  }, [token, isPublicView]);

  useEffect(() => {
    if (showRecentBills && token && !isPublicView) {
      const fetchRecent = async () => {
        setLoadingRecent(true);
        try {
          const response = await axios.get(`${API}/bills/recent?limit=15&search=${encodeURIComponent(billSearchQuery)}`, { 
            headers: { Authorization: `Bearer ${token}` } 
          });
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
  }, [showRecentBills, token, isPublicView, billSearchQuery]); 

  useEffect(() => {
    if (showSettings && token && !isPublicView) {
      const fetchStorageStats = async () => {
        try {
          const res = await axios.get(`${API}/system/storage`, { headers: { Authorization: `Bearer ${token}` } });
          setStorageStats(res.data);
        } catch (error) {
          console.error("Failed to load storage stats");
        }
      };
      fetchStorageStats();
    }
  }, [showSettings, token, isPublicView]);

  const loadSettings = async () => {
    const response = await axios.get(`${API}/settings`, { headers: authHeaders });
    const savedLogo = localStorage.getItem("jj_logo_data_url");
    const savedAboutQr = localStorage.getItem("jj_about_qr_data_url");

    setSettings({
      ...defaultSettings,
      ...response.data,
      logo_data_url: savedLogo || response.data.logo_data_url || "",
      about_qr_data_url: savedAboutQr || response.data.about_qr_data_url || STATIC_ABOUT_QR_URL,
    });
  };

  const reserveNumber = async (activeMode) => {
    setIsNumberLoading(true);
    try {
      const response = await axios.get(`${API}/bills/next-number`, {
        headers: authHeaders,
        params: { mode: activeMode },
      });
      setDocumentNumber(response.data.document_number || "");
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
        await reserveNumber(mode);
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
        const response = await axios.get(`${API}/customers/suggest`, {
          headers: authHeaders,
          params: { query },
        });
        setSuggestions(response.data || []);
      } catch {
        setSuggestions([]);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customer.phone, customer.name, token, isPublicView]);

  const computed = useMemo(() => {
    const baseRate = num(settings.silver_rate_per_10g) / 10 + num(settings.making_charge_per_gram);

    const mapped = items.map((item, index) => {
      const rate = item.rate_override !== "" ? num(item.rate_override) : baseRate;
      const weight = num(item.weight);
      const quantity = Math.max(num(item.quantity), 1);
      const formulaAmount = mode === "estimate" ? weight * rate * quantity : weight * rate;
      const amount = item.amount_override !== "" ? num(item.amount_override) : formulaAmount;
      const rupees = Math.floor(amount);
      const paise = Math.round((amount - rupees) * 100)
        .toString()
        .padStart(2, "0");

      return {
        ...item,
        slNo: index + 1,
        rate,
        quantity,
        amount,
        rupees,
        paise,
      };
    });

    const subtotal = mapped.reduce((sum, row) => sum + row.amount, 0);
    const taxable = subtotal;
    const cgst = mode === "invoice" ? taxable * 0.015 : 0;
    const igst = mode === "invoice" ? taxable * 0.03 : 0;
    const gstApplied = mode === "invoice" ? cgst + igst : 0;
    const mdr = paymentMethod === "Card" ? (taxable + gstApplied) * 0.02 : 0;
    const baseTotal = taxable + gstApplied + mdr - num(discount) - num(exchange);
    const autoRound = Math.round(baseTotal) - baseTotal;
    const roundOff = manualRoundOff === "" ? autoRound : num(manualRoundOff);
    const grandTotal = baseTotal + roundOff;

    return {
      items: mapped,
      baseRate,
      subtotal,
      taxable,
      cgst,
      igst,
      mdr,
      roundOff,
      grandTotal,
    };
  }, [items, mode, settings, paymentMethod, discount, exchange, manualRoundOff]);

  // ✅ SMART QR LOGIC FOR DASHBOARD
  const upiAmountToPay = paymentMethod === "Split" ? Math.max(0, computed.grandTotal - num(splitCash)) : computed.grandTotal;
  const showDashboardUpi = !isPaymentDone && (paymentMethod === "UPI" || (paymentMethod === "Split" && upiAmountToPay > 0));
  
  const upiId = mode === "invoice" ? settings.invoice_upi_id : settings.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(upiAmountToPay)}&cu=INR&tn=Bill_${documentNumber || "Draft"}`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  const updateItem = (id, key, value) => {
    markDirty();
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const clearBill = async (nextMode = mode) => {
    setEditingDocNumber(null);
    setItems([createItem()]);
    setCustomer({ name: "", phone: "", address: "", email: "" });
    setSuggestions([]);
    setDiscount("0");
    setExchange("0");
    setManualRoundOff("");
    setPaymentMethod("Cash");
    setSplitCash("");
    setIsPaymentDone(false); 
    setNotes("");
    setBillDate(today());
    setIsDirty(false);
    await reserveNumber(nextMode);
  };

  const loadBillForEditing = (bill) => {
    setEditingDocNumber(bill.document_number);
    setMode(bill.mode);
    setDocumentNumber(bill.document_number);
    setBillDate(bill.date || today());

    setCustomer({
      name: bill.customer?.name || "",
      phone: bill.customer?.phone || "",
      address: bill.customer?.address || "",
      email: bill.customer?.email || "",
    });

    setPaymentMethod(bill.payment_method || "Cash");
    setSplitCash(bill.split_cash !== null && bill.split_cash !== undefined ? String(bill.split_cash) : "");
    setIsPaymentDone(bill.is_payment_done || false); 
    setNotes(bill.notes || "");
    
    setDiscount(bill.totals?.discount ? String(bill.totals.discount) : "0");
    setExchange(bill.totals?.exchange ? String(bill.totals.exchange) : "0");
    setManualRoundOff(bill.totals?.round_off !== null && bill.totals?.round_off !== undefined ? String(bill.totals.round_off) : "");

    const loadedItems = (bill.items || []).map((item) => ({
      id: `${Date.now()}-${Math.random()}`,
      description: item.description || "",
      hsn: item.hsn || "",
      weight: item.weight ? String(item.weight) : "",
      quantity: item.quantity ? String(item.quantity) : "1",
      rate_override: item.rate_override !== null && item.rate_override !== undefined ? String(item.rate_override) : "",
      amount_override: item.amount_override !== null && item.amount_override !== undefined ? String(item.amount_override) : "",
    }));

    setItems(loadedItems.length > 0 ? loadedItems : [createItem()]);

    setIsDirty(false);
    setShowRecentBills(false);
    toast.success(`Loaded ${bill.document_number} for editing`);
    goToBillTop();
  };

  const handleDeleteBill = async (bill) => {
    if (!window.confirm(`Are you sure you want to permanently delete ${bill.document_number}?`)) return;
    try {
      await axios.delete(`${API}/bills/${bill.document_number}`, { headers: { Authorization: `Bearer ${token}` } });
      setRecentBillsList((prev) => prev.filter((b) => b.document_number !== bill.document_number));
      if (editingDocNumber === bill.document_number) clearBill(mode);
      toast.success(`${bill.document_number} deleted successfully.`);
    } catch (error) {
      console.error("Delete error:", error);
      toast.error("Failed to delete the bill.");
    }
  };

  const handleQuickPaymentToggle = async (bill) => {
    const newStatus = !bill.is_payment_done;
    try {
      await axios.put(
        `${API}/bills/${bill.document_number}/toggle-payment`, 
        { is_payment_done: newStatus }, 
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      toast.success(`Payment marked as ${newStatus ? 'DONE ✅' : 'PENDING ⏳'}`);
      
      if (editingDocNumber === bill.document_number) {
        setIsPaymentDone(newStatus);
      }
      setRecentBillsList(prev => 
        prev.map(b => b.document_number === bill.document_number ? { ...b, is_payment_done: newStatus } : b)
      );
    } catch (error) {
      console.error("Toggle error:", error);
      toast.error("Failed to update payment status.");
    }
  };

  const handleResetCounter = async (resetMode) => {
    if (!window.confirm(`Are you SURE you want to restart the ${resetMode.toUpperCase()} counter back to 0001? Old bills will remain, but new ones will start from 1.`)) return;
    
    try {
      await axios.post(`${API}/bills/reset-counter`, { mode: resetMode }, { headers: { Authorization: `Bearer ${token}` } });
      toast.success(`${resetMode.toUpperCase()} counter has been reset to 0001.`);
      if (mode === resetMode) {
        await reserveNumber(mode);
      }
    } catch (error) {
      console.error("Reset error:", error);
      toast.error(`Failed to reset the ${resetMode} counter.`);
    }
  };

  const handleBackupBills = async () => {
    try {
      toast.info("Preparing backup file...");
      const res = await axios.get(`${API}/bills/export`, { headers: { Authorization: `Bearer ${token}` } });
      
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
    } catch (error) {
      console.error("Backup error:", error);
      toast.error("Failed to download backup.");
    }
  };

  const handleDeleteAllBills = async () => {
    const confirm1 = window.confirm("🚨 WARNING! This will permanently delete ALL bills from your database. Have you downloaded your backup first?");
    if (!confirm1) return;
    
    const userInput = window.prompt("Type the word 'DELETE' to confirm wiping all bills:");
    if (userInput !== "DELETE") {
      toast.error("Deletion cancelled.");
      return;
    }

    try {
      await axios.delete(`${API}/bills/all`, { headers: { Authorization: `Bearer ${token}` } });
      toast.success("All bills have been successfully wiped from the server.");
      setRecentBillsList([]);
      
      const res = await axios.get(`${API}/system/storage`, { headers: { Authorization: `Bearer ${token}` } });
      setStorageStats(res.data);
    } catch (error) {
      console.error("Delete all error:", error);
      toast.error("Failed to delete bills.");
    }
  };

  const handleModeChange = async (nextMode) => {
    if (mode === nextMode) return;
    
    if (isDirty) {
      if (!window.confirm("⚠️ You have unsaved changes!\n\nIf you switch modes now, your current data will be lost. Do you want to continue?")) {
        return; 
      }
    }
    
    setMode(nextMode);
    await clearBill(nextMode);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoggingIn(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { passcode }, { timeout: 15000 });
      localStorage.setItem("jj_auth_token", response.data.access_token);
      setToken(response.data.access_token);
      setPasscode("");
      toast.success("Logged in successfully");
    } catch (error) {
      const statusCode = error?.response?.status;
      const isNetworkOrSleep = !error?.response || error?.code === "ECONNABORTED";
      if (statusCode === 401) {
        toast.error("Wrong passcode.");
      } else if (isNetworkOrSleep) {
        toast.error("Server is waking up. Please wait 15-20 seconds and try again.");
      } else {
        toast.error("Login failed. Please try again.");
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("jj_auth_token");
    setToken("");
  };

  const fileToDataUrl = (file) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const optimizeImageDataUrl = async (file) => {
    const original = await fileToDataUrl(file);
    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = original;
    });

    const maxDimension = 420;
    const ratio = Math.min(maxDimension / image.width, maxDimension / image.height, 1);
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
      toast.error("Logo upload failed. Please use PNG/JPG/WebP/SVG.");
    }
  };

  const handleAboutQrUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await optimizeImageDataUrl(file);
      localStorage.setItem("jj_about_qr_data_url", dataUrl);
      setSettings((prev) => ({ ...prev, about_qr_data_url: dataUrl }));
      setAboutUploadName(file.name);
      toast.success("About QR updated.");
    } catch {
      toast.error("QR upload failed. Please use PNG/JPG/WebP/SVG.");
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

  const saveBill = async () => {
    setSavingBill(true);
    try {
      const payload = {
        mode,
        document_number: documentNumber,
        date: billDate,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_address: customer.address,
        customer_email: customer.email,
        payment_method: paymentMethod,
        is_payment_done: isPaymentDone,
        split_cash: num(splitCash),
        split_upi: Math.max(0, computed.grandTotal - num(splitCash)),
        discount: num(discount),
        exchange: num(exchange),
        round_off: manualRoundOff === "" ? null : num(manualRoundOff),
        notes,
        items: computed.items.map((item) => ({
          description: item.description,
          hsn: item.hsn,
          weight: num(item.weight),
          quantity: num(item.quantity),
          rate_override: item.rate_override === "" ? null : num(item.rate_override),
          amount_override: item.amount_override === "" ? null : num(item.amount_override),
        })),
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
    } catch {
      toast.error("Could not save bill. Fill customer name and at least one item.");
    } finally {
      setSavingBill(false);
    }
  };

  const downloadPdf = async (elementId, filename) => {
    const node = document.getElementById(elementId);
    if (!node) return;
    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;
    pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight);
    pdf.save(`${filename}.pdf`);
  };

  const shareWhatsApp = () => {
    const link = `${window.location.origin}/?view=${documentNumber}`;
    const text = `Hello ${customer.name || "Customer"},\n\nHere is your ${
      mode === "invoice" ? "Invoice" : "Estimate"
    } ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`;
    const cleanedPhone = customer.phone.replace(/\D/g, "");
    const url = `https://wa.me/${cleanedPhone || "91"}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const shareEmail = () => {
    const link = `${window.location.origin}/?view=${documentNumber}`;
    const subject = `${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber}`;
    const body = `Dear ${customer.name || "Customer"},\n\nHere is your ${
      mode === "invoice" ? "Invoice" : "Estimate"
    } ${documentNumber} for ₹${money(computed.grandTotal)}.\n\nYou can view and download it securely here: ${link}\n\nThank you,\n${settings.shop_name}`;
    window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const goToBillTop = () => {
    const target = document.getElementById("bill-print-root");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };


  if (isPublicView) {
    if (publicLoading) return <div className="loading-screen">Loading your bill...</div>;
    if (publicBill === "NOT_FOUND" || !publicBill) return <div className="loading-screen">Bill not found or has been deleted.</div>;

    // ✅ SMART QR LOGIC FOR PUBLIC VIEW
    const publicUpiAmountToPay = publicBill.payment_method === "Split" ? num(publicBill.split_upi) : publicBill.totals.grand_total;
    const showPublicUpi = !publicBill.is_payment_done && (publicBill.payment_method === "UPI" || (publicBill.payment_method === "Split" && publicUpiAmountToPay > 0));

    const publicUpiId = publicBill.mode === "invoice" ? publicSettings.invoice_upi_id : publicSettings.estimate_upi_id;
    const publicUpiUri = `upi://pay?pa=${publicUpiId}&pn=${encodeURIComponent(publicSettings.shop_name)}&am=${money(publicUpiAmountToPay)}&cu=INR&tn=Bill_${publicBill.document_number}`;
    const publicDynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(publicUpiUri)}&size=220`;

    const splitAmount = (amt) => {
      const rupees = Math.floor(amt);
      const paise = Math.round((amt - rupees) * 100).toString().padStart(2, "0");
      return { rupees, paise };
    };

    return (
      <div className="billing-app" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px' }}>
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
              <h2 className="sheet-shop-title">{publicSettings.shop_name}</h2>
              <p className="sheet-tagline">{publicSettings.tagline}</p>
            </div>

            <div className="contact-area">
              <p className="contact-address">{publicSettings.address}</p>
              <p className="contact-phones">{publicSettings.phone_numbers.join(" | ")}</p>
              <p>{publicSettings.email}</p>
              {publicBill.mode === "invoice" && <p>GSTIN: {publicSettings.gstin}</p>}
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
                  <div className="totals-row"><span>CGST@ 1.5%</span><strong>₹{money(publicBill.totals.cgst)}</strong></div>
                  <div className="totals-row"><span>IGST@ 3%</span><strong>₹{money(publicBill.totals.igst)}</strong></div>
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

              {/* ✅ Conditional Public QR and Button */}
              {showPublicUpi && (
                <div className="payment-qr-box">
                  <p className="scan-title">Scan Here For Payment</p>
                  <img src={publicDynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" />
                  <p className="upi-id">UPI: {publicUpiId}</p>
                  
                  <a 
                    href={publicUpiUri} 
                    style={{
                      display: "block",
                      marginTop: "15px",
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
                </div>
              )}
            </div>

            {publicBill.mode === "invoice" ? (
              <div className="declaration">
                <p className="section-title">DECLARATION</p>
                <p>We declare that this bill shows the actual price of items and all details are correct.</p>
                <div className="about-qr">
                  <p className="section-title">About Us QR</p>
                  {(publicSettings.about_qr_data_url || STATIC_ABOUT_QR_URL) && (
                    <img src={publicSettings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" />
                  )}
                </div>
              </div>
            ) : (
              <div className="policies">
                <p className="section-title">POLICIES, T&amp;C</p>
                <ul className="policies-list">
                  <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                  <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                </ul>
                <div className="about-qr">
                  <p className="section-title">About Us QR</p>
                  {(publicSettings.about_qr_data_url || STATIC_ABOUT_QR_URL) && (
                    <img src={publicSettings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="About us QR" className="about-qr-image" />
                  )}
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

  if (checkingSession) {
    return <div className="loading-screen">Loading billing dashboard...</div>;
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
        <div className="brand-block">
          <h1 className="brand-title">{settings.shop_name}</h1>
          <p className="brand-tagline">{settings.tagline}</p>
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
              <h2 className="sheet-shop-title">{settings.shop_name}</h2>
              <p className="sheet-tagline">{settings.tagline}</p>
            </div>

            <div className="contact-area">
              <p className="contact-address">{settings.address}</p>
              <p className="contact-phones">{settings.phone_numbers.join(" | ")}</p>
              <p>{settings.email}</p>
              {mode === "invoice" && <p>GSTIN: {settings.gstin}</p>}
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
                  <div className="totals-row"><span>CGST@ 1.5%</span><strong>₹{money(computed.cgst)}</strong></div>
                  <div className="totals-row"><span>IGST@ 3%</span><strong>₹{money(computed.igst)}</strong></div>
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
                  {paymentMethod === "Split" 
                    ? `Split (Cash: ₹${money(splitCash)}, UPI: ₹${money(upiAmountToPay)})` 
                    : paymentMethod}
                </strong>
              </div>

              {/* ✅ Conditional Dashboard QR */}
              {showDashboardUpi && (
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
              </div>
            ) : (
              <div className="policies">
                <p className="section-title">POLICIES, T&amp;C</p>
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
            <h3>Customer Details</h3>
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
            <Button type="button" onClick={() => { setItems((prev) => [...prev, createItem()]); markDirty(); }}>Add Item</Button>
          </div>

          <div className="control-card">
            <h3>Adjustments</h3>
            <Input value={discount} onChange={(e) => { setDiscount(e.target.value); markDirty(); }} placeholder="Discount" />
            <Input value={exchange} onChange={(e) => { setExchange(e.target.value); markDirty(); }} placeholder="Exchange" />
            <Input value={manualRoundOff} onChange={(e) => { setManualRoundOff(e.target.value); markDirty(); }} placeholder="Manual round off (optional)" />

            <label htmlFor="payment-method-select" className="select-label">Payment Method</label>
            <select id="payment-method-select" value={paymentMethod} onChange={(e) => { setPaymentMethod(e.target.value); markDirty(); }} className="native-select">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
              <option value="Split">Split (Cash + UPI)</option>
            </select>

            {/* ✅ Split Cash Input */}
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
            <Button onClick={saveBill} disabled={savingBill}>
              {savingBill ? "Saving..." : editingDocNumber ? `Update (${editingDocNumber})` : "Save Bill"}
            </Button>
            <Button onClick={() => { setShowRecentBills(true); setBillSearchQuery(""); }} variant="outline">Recent Bills</Button>
            <Button onClick={() => downloadPdf("bill-print-root", documentNumber || mode)}>Download PDF</Button>
            <Button onClick={() => window.print()}>Print</Button>
            <Button onClick={shareWhatsApp}>WhatsApp Link</Button>
            <Button onClick={shareEmail}>Email Link</Button>
            <Button onClick={() => {
              if (isDirty && !window.confirm("⚠️ You have unsaved changes. Clear screen and start a new bill anyway?")) return;
              clearBill();
            }} variant="outline">New Bill</Button>
            <Button onClick={() => setShowSettings((prev) => !prev)} variant="outline">Settings</Button>
            <Button onClick={() => setShowAbout((prev) => !prev)} variant="outline">About</Button>
          </div>
        </aside>
      </main>

      {/* RECENT BILLS DRAWER WITH SEARCH & RESET */}
      {showRecentBills && (
        <section className="side-drawer no-print">
          <div className="drawer-header">
            <h3>Recent Bills</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowRecentBills(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "15px" }}>
            
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

      {/* SETTINGS DRAWER WITH STORAGE MANAGEMENT */}
      {showSettings && (
        <section className="side-drawer no-print">
          <div className="drawer-header">
            <h3>Settings</h3>
            <Button type="button" variant="outline" className="drawer-back-btn" onClick={() => setShowSettings(false)}>
              <ArrowLeft className="drawer-back-icon" /><span>Back</span>
            </Button>
          </div>
          <Input value={settings.shop_name} onChange={(e) => setSettings((prev) => ({ ...prev, shop_name: e.target.value }))} placeholder="Shop name" />
          <Input value={settings.tagline} onChange={(e) => setSettings((prev) => ({ ...prev, tagline: e.target.value }))} placeholder="Tagline" />
          <Input value={settings.address} onChange={(e) => setSettings((prev) => ({ ...prev, address: e.target.value }))} placeholder="Address" />
          <Input value={settings.phone_numbers.join(",")} onChange={(e) => setSettings((prev) => ({ ...prev, phone_numbers: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) }))} placeholder="Phone numbers comma separated" />
          <Input value={settings.email} onChange={(e) => setSettings((prev) => ({ ...prev, email: e.target.value }))} placeholder="Email" />
          <Input value={settings.silver_rate_per_10g} onChange={(e) => setSettings((prev) => ({ ...prev, silver_rate_per_10g: num(e.target.value) }))} placeholder="Silver Rate per 10g" />
          <Input value={settings.making_charge_per_gram} onChange={(e) => setSettings((prev) => ({ ...prev, making_charge_per_gram: num(e.target.value) }))} placeholder="Making Charge per gram" />
          <Input value={settings.formula_note} onChange={(e) => setSettings((prev) => ({ ...prev, formula_note: e.target.value }))} placeholder="Formula note" />
          <Input value={settings.invoice_upi_id} onChange={(e) => setSettings((prev) => ({ ...prev, invoice_upi_id: e.target.value }))} placeholder="Invoice mode UPI" />
          <Input value={settings.estimate_upi_id} onChange={(e) => setSettings((prev) => ({ ...prev, estimate_upi_id: e.target.value }))} placeholder="Estimate mode UPI" />

          <label className="select-label" htmlFor="print-scale-range">Auto Print Scale: {printScale.toFixed(1)}%</label>
          <input id="print-scale-range" type="range" min="98" max="102" step="0.1" value={printScale} onChange={(e) => setPrintScale(clampPrintScale(Number(e.target.value)))} />
          <Input type="number" min="98" max="102" step="0.1" value={printScale} onChange={(e) => setPrintScale(clampPrintScale(Number(e.target.value)))} />
          <Button type="button" variant="outline" onClick={() => setPrintScale(100)}>Reset Print Scale (100%)</Button>

          <div style={{ marginTop: "15px", padding: "10px", border: "1px dashed #ccc", borderRadius: "8px" }}>
            <label className="file-label" htmlFor="logo-upload-input">Upload Shop Logo</label>
            <input id="logo-upload-input" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*" onChange={handleLogoUpload} />
            <p className="upload-hint">{logoUploadName ? `Selected: ${logoUploadName}` : "No logo selected yet"}</p>
            {settings.logo_data_url && <img src={settings.logo_data_url} alt="Logo preview" className="settings-logo-preview" style={{ maxWidth: "100px", marginTop: "10px" }} />}
          </div>

          <div style={{ marginTop: "15px", padding: "10px", border: "1px dashed #ccc", borderRadius: "8px", marginBottom: "15px" }}>
            <label className="file-label" htmlFor="about-qr-upload-input">Upload About Us QR</label>
            <input id="about-qr-upload-input" type="file" accept=".png,.jpg,.jpeg,.webp,.svg,image/*" onChange={handleAboutQrUpload} />
            <p className="upload-hint">{aboutUploadName ? `Selected: ${aboutUploadName}` : "No QR selected yet"}</p>
            {(settings.about_qr_data_url || STATIC_ABOUT_QR_URL) && <img src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL} alt="QR preview" className="settings-logo-preview" style={{ maxWidth: "100px", marginTop: "10px" }} />}
          </div>

          <Button onClick={saveSettings}>Save Settings</Button>

          <div style={{ marginTop: "30px", padding: "15px", border: "1px solid #e2e8f0", borderRadius: "8px", backgroundColor: "#f8fafc" }}>
            <h4 style={{ margin: "0 0 10px 0", color: "#1e293b" }}>Database Storage & Backup</h4>
            
            <div style={{ marginBottom: "15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", marginBottom: "5px", color: "#475569" }}>
                <span>Storage Used: {(storageStats.used_bytes / 1024).toFixed(2)} KB</span>
                <span>{storageStats.percentage}% of 512 MB</span>
              </div>
              <div style={{ width: "100%", backgroundColor: "#cbd5e1", borderRadius: "4px", height: "10px", overflow: "hidden" }}>
                <div style={{ 
                  width: `${storageStats.percentage}%`, 
                  backgroundColor: storageStats.percentage > 80 ? "#ef4444" : "#10b981", 
                  height: "100%", 
                  transition: "width 0.5s ease" 
                }}></div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <Button type="button" variant="outline" onClick={handleBackupBills}>
                ⬇️ Download Backup (JSON)
              </Button>
              <Button type="button" variant="destructive" style={{ backgroundColor: "#ef4444", color: "white" }} onClick={handleDeleteAllBills}>
                ⚠️ Wipe All Bills (Clear Storage)
              </Button>
            </div>
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
          
          <div className="cloud-note" style={{ marginTop: "15px" }}>
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
