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
  const [passcode, setPasscode] = useState("");
  const [token, setToken] = useState(localStorage.getItem("jj_auth_token") || "");
  const [checkingSession, setCheckingSession] = useState(Boolean(localStorage.getItem("jj_auth_token")));
  const [loggingIn, setLoggingIn] = useState(false);

  const [mode, setMode] = useState("invoice");
  const [documentNumber, setDocumentNumber] = useState("");
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
  const [notes, setNotes] = useState("");

  const [showSettings, setShowSettings] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [savingBill, setSavingBill] = useState(false);
  const [printScale, setPrintScale] = useState(getInitialPrintScale);
  const [logoUploadName, setLogoUploadName] = useState("");
  const [aboutUploadName, setAboutUploadName] = useState("");
  const [cloudStatus, setCloudStatus] = useState({ provider: "supabase", enabled: false, mode: "loading" });
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {};

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
    };

    window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [showSettings, showAbout]);

  useEffect(() => {
    localStorage.setItem("jj_print_scale", String(clampPrintScale(printScale)));
  }, [printScale]);

  useEffect(() => {
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
  }, [token]);

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
  }, [token]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      fetchCloudStatus();
    }, 30000);

    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    if (!token) return;
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
  }, [customer.phone, customer.name, token]);

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

  const upiId = mode === "invoice" ? settings.invoice_upi_id : settings.estimate_upi_id;
  const upiUri = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(settings.shop_name)}&am=${money(
    computed.grandTotal,
  )}&cu=INR`;
  const dynamicQrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(upiUri)}&size=220`;

  const updateItem = (id, key, value) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [key]: value } : item)));
  };

  const clearBill = async (nextMode = mode) => {
    setItems([createItem()]);
    setCustomer({ name: "", phone: "", address: "", email: "" });
    setSuggestions([]);
    setDiscount("0");
    setExchange("0");
    setManualRoundOff("");
    setPaymentMethod("Cash");
    setNotes("");
    setBillDate(today());
    await reserveNumber(nextMode);
  };

  const handleModeChange = async (nextMode) => {
    setMode(nextMode);
    await clearBill(nextMode);
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setLoggingIn(true);
    try {
      const response = await axios.post(`${API}/auth/login`, { passcode });
      localStorage.setItem("jj_auth_token", response.data.access_token);
      setToken(response.data.access_token);
      setPasscode("");
      toast.success("Logged in successfully");
    } catch {
      toast.error("Wrong passcode.");
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

      await axios.post(`${API}/bills/save`, payload, { headers: authHeaders });
      toast.success(`${mode === "invoice" ? "Invoice" : "Estimate"} saved successfully.`);
      await reserveNumber(mode);
    } catch {
      toast.error("Could not save bill. Fill customer name and at least one item.");
    } finally {
      setSavingBill(false);
    }
  };

  const downloadPdf = async () => {
    const node = document.getElementById("bill-print-root");
    if (!node) return;

    const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: "#ffffff" });
    const imageData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = (canvas.height * pageWidth) / canvas.width;
    pdf.addImage(imageData, "PNG", 0, 0, pageWidth, pageHeight);
    pdf.save(`${documentNumber || mode}-bill.pdf`);
  };

  const printBill = () => window.print();

  const shareWhatsApp = () => {
    const text = `Hello ${customer.name || "Customer"}, ${
      mode === "invoice" ? "Invoice" : "Estimate"
    } ${documentNumber} amount is ₹${money(computed.grandTotal)}. Thank you - ${settings.shop_name}`;
    const cleanedPhone = customer.phone.replace(/\D/g, "");
    const url = `https://wa.me/${cleanedPhone || "91"}?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  const shareEmail = () => {
    const subject = `${mode === "invoice" ? "Invoice" : "Estimate"} ${documentNumber}`;
    const body = `Dear ${customer.name || "Customer"},\n\nAmount: ₹${money(
      computed.grandTotal,
    )}\nDocument: ${documentNumber}\n\nThank you,\n${settings.shop_name}`;
    window.location.href = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const goToBillTop = () => {
    const target = document.getElementById("bill-print-root");
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (checkingSession) {
    return <div className="loading-screen" data-testid="session-checking-state">Loading billing dashboard...</div>;
  }

  if (!token) {
    return (
      <div className="login-shell">
        <Toaster position="bottom-right" />
        <form className="login-card" onSubmit={handleLogin} data-testid="login-form">
          <h1 className="login-title" data-testid="login-title">Jalaram Jewellers</h1>
          <p className="login-subtitle" data-testid="login-subtitle">Enter passcode to access billing panel</p>
          <Input
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            placeholder="Enter passcode"
            data-testid="login-passcode-input"
          />
          <Button type="submit" disabled={loggingIn} data-testid="login-submit-button">
            {loggingIn ? "Checking..." : "Login"}
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="billing-app">
      <Toaster position="bottom-right" />

      <header className="top-bar no-print" data-testid="app-top-bar">
        <div className="brand-block">
          <h1 className="brand-title" data-testid="shop-name-display">{settings.shop_name}</h1>
          <p className="brand-tagline" data-testid="shop-tagline-display">{settings.tagline}</p>
        </div>

        <div className="mode-toggle" data-testid="mode-toggle-container">
          <Button
            onClick={() => handleModeChange("invoice")}
            className={mode === "invoice" ? "mode-active" : "mode-inactive"}
            data-testid="invoice-mode-button"
          >
            Invoice Mode
          </Button>
          <Button
            onClick={() => handleModeChange("estimate")}
            className={mode === "estimate" ? "mode-active" : "mode-inactive"}
            data-testid="estimate-mode-button"
          >
            Estimate Mode
          </Button>
        </div>

        <div
          className={`cloud-badge ${cloudStatus.enabled ? "cloud-badge-live" : "cloud-badge-fallback"}`}
          data-testid="cloud-sync-status-badge"
        >
          <span className="cloud-dot" data-testid="cloud-sync-status-dot" />
          <span data-testid="cloud-sync-status-text">
            Cloud Sync: {cloudStatus.enabled ? "Live" : "Fallback"}
          </span>
        </div>

        <div className="top-actions" data-testid="top-actions-group">
          <Button variant="outline" onClick={goToBillTop} data-testid="back-to-top-button">
            Back
          </Button>
          <Button variant="outline" onClick={handleLogout} data-testid="logout-button">
            Logout
          </Button>
        </div>
      </header>

      <main className="main-layout">
        <section
          id="bill-print-root"
          className="bill-sheet"
          data-testid="bill-preview-container"
          style={{ "--print-scale-factor": (printScale / 100).toFixed(3) }}
        >
          <div className="bill-header">
            <div className="logo-area" data-testid="logo-display-area">
              {settings.logo_data_url ? (
                <img src={settings.logo_data_url} alt="Shop Logo" className="shop-logo" data-testid="shop-logo-image" />
              ) : (
                <div className="shop-logo-fallback" data-testid="shop-logo-fallback">JJ</div>
              )}
              <h2 className="sheet-shop-title" data-testid="sheet-shop-title">{settings.shop_name}</h2>
              <p className="sheet-tagline" data-testid="sheet-tagline">{settings.tagline}</p>
            </div>

            <div className="contact-area">
              <p className="contact-address" data-testid="sheet-address">{settings.address}</p>
              <p className="contact-phones" data-testid="sheet-phone-list">{settings.phone_numbers.join(" | ")}</p>
              <p data-testid="sheet-email">{settings.email}</p>
              {mode === "invoice" ? <p data-testid="sheet-gstin">GSTIN: {settings.gstin}</p> : null}
            </div>
          </div>

          <div className="sheet-banner" data-testid="sheet-mode-banner">
            {mode === "invoice" ? "TAX INVOICE" : "ESTIMATE"}
          </div>

          <div className="meta-grid">
            <p data-testid="document-number-display">
              <strong>{mode === "invoice" ? "Invoice No" : "Estimate No"}:</strong>{" "}
              {isNumberLoading ? "Generating..." : documentNumber || "-"}
            </p>
            <p data-testid="document-date-display">
              <strong>Date:</strong> {billDate}
            </p>
          </div>

          <div className="customer-box" data-testid="customer-info-display-box">
            <p data-testid="customer-name-display"><strong>Name:</strong> {customer.name || "-"}</p>
            <p data-testid="customer-address-display"><strong>Address:</strong> {customer.address || "-"}</p>
            <p data-testid="customer-phone-display"><strong>Phone:</strong> {customer.phone || "-"}</p>
          </div>

          <table className="bill-table" data-testid="bill-items-table">
            <thead>
              {isCompactView ? (
                <tr>
                  <th data-testid="compact-col-sl">#</th>
                  <th data-testid="compact-col-item">Item</th>
                  <th data-testid="compact-col-weight-rate">Wt / Rate</th>
                  <th data-testid="compact-col-amount">Amount</th>
                </tr>
              ) : mode === "invoice" ? (
                <tr>
                  <th data-testid="invoice-col-sl">Sl. No.</th>
                  <th data-testid="invoice-col-description">DESCRIPTION</th>
                  <th data-testid="invoice-col-hsn">HSN</th>
                  <th data-testid="invoice-col-weight">WEIGHT IN GRAMS</th>
                  <th data-testid="invoice-col-rate">RATE PER GRAM Rs.</th>
                  <th data-testid="invoice-col-amount">AMOUNT Ps.</th>
                </tr>
              ) : (
                <tr>
                  <th data-testid="estimate-col-sl">SI. No.</th>
                  <th data-testid="estimate-col-particulars">Particulars</th>
                  <th data-testid="estimate-col-weight">Weight</th>
                  <th data-testid="estimate-col-quantity-rate">Quantity / Rate</th>
                  <th data-testid="estimate-col-amount">Amount Rupees.</th>
                  <th data-testid="estimate-col-ps">PS.</th>
                </tr>
              )}
            </thead>

            <tbody>
              {computed.items.map((item) => (
                <tr key={item.id} data-testid={`bill-row-${item.slNo}`}>
                  {isCompactView ? (
                    <>
                      <td data-testid={`bill-row-sl-${item.slNo}`}>{item.slNo}</td>
                      <td data-testid={`bill-row-description-${item.slNo}`}>
                        <strong>{item.description || "-"}</strong>
                        {mode === "invoice" ? <div>HSN: {item.hsn || "-"}</div> : null}
                      </td>
                      <td data-testid={`bill-row-weight-${item.slNo}`}>
                        {money(item.weight)}g × ₹{money(item.rate)}
                      </td>
                      <td data-testid={`bill-row-amount-${item.slNo}`}>{item.rupees}.{item.paise}</td>
                    </>
                  ) : (
                    <>
                      <td data-testid={`bill-row-sl-${item.slNo}`}>{item.slNo}</td>
                      <td data-testid={`bill-row-description-${item.slNo}`}>{item.description || "-"}</td>
                      <td data-testid={`bill-row-hsn-${item.slNo}`}>{mode === "invoice" ? item.hsn || "-" : money(item.weight)}</td>
                      <td data-testid={`bill-row-weight-${item.slNo}`}>
                        {mode === "invoice" ? money(item.weight) : `${money(item.quantity)} × ${money(item.rate)}`}
                      </td>
                      <td data-testid={`bill-row-rate-${item.slNo}`}>{money(item.rate)}</td>
                      <td data-testid={`bill-row-amount-${item.slNo}`}>{item.rupees}.{item.paise}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>

          <div className="sheet-bottom-stack">
            <div className="totals" data-testid="totals-section">
              <div className="totals-row" data-testid="subtotal-row">
                <span>{mode === "invoice" ? "Taxable Amt." : "TOTAL"}</span>
                <strong>₹{money(computed.taxable)}</strong>
              </div>

              {mode === "invoice" ? (
                <>
                  <div className="totals-row" data-testid="cgst-row">
                    <span>CGST@ 1.5%</span>
                    <strong>₹{money(computed.cgst)}</strong>
                  </div>
                  <div className="totals-row" data-testid="igst-row">
                    <span>IGST@ 3%</span>
                    <strong>₹{money(computed.igst)}</strong>
                  </div>
                </>
              ) : (
                <>
                  <div className="totals-row" data-testid="discount-row">
                    <span>DISCOUNT</span>
                    <strong>₹{money(discount)}</strong>
                  </div>
                  <div className="totals-row" data-testid="exchange-row">
                    <span>EXCHANGE</span>
                    <strong>₹{money(exchange)}</strong>
                  </div>
                </>
              )}

              <div className="totals-row" data-testid="mdr-row">
                <span>MDR (Card 2%)</span>
                <strong>₹{money(computed.mdr)}</strong>
              </div>
              <div className="totals-row" data-testid="round-off-row">
                <span>ROUNDED OFF</span>
                <strong>₹{money(computed.roundOff)}</strong>
              </div>
              <div className="totals-row total-highlight" data-testid="grand-total-row">
                <span>GRAND TOTAL</span>
                <strong data-testid="grand-total-value">₹{money(computed.grandTotal)}</strong>
              </div>

              <div className="payment-method-view" data-testid="payment-method-display">
                <span>Payment Method:</span>
                <strong>{paymentMethod}</strong>
              </div>

              <div className="payment-qr-box" data-testid="dynamic-upi-qr-section">
                <p className="scan-title" data-testid="scan-here-text">Scan Here For Payment</p>
                <img src={dynamicQrUrl} alt="Dynamic payment QR" className="upi-qr" data-testid="dynamic-upi-qr-image" />
                <p className="upi-id" data-testid="active-upi-id">UPI: {upiId}</p>
              </div>
            </div>

            {mode === "invoice" ? (
              <div className="declaration" data-testid="declaration-section">
                <p className="section-title">DECLARATION</p>
                <p>We declare that this bill shows the actual price of items and all details are correct.</p>

                <div className="about-qr" data-testid="about-qr-display-container">
                  <p className="section-title">About Us QR</p>
                  <img
                    src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL}
                    alt="About us QR"
                    className="about-qr-image"
                    data-testid="about-static-qr-image"
                  />
                </div>
              </div>
            ) : (
              <div className="policies" data-testid="policies-section">
                <p className="section-title">POLICIES, T&amp;C</p>
                <ul className="policies-list" data-testid="policies-list">
                  <li>6 Months of repair and polishing warranty only on silver ornaments.</li>
                  <li>You can replace purchased items within 7 days for manufacturing defects.</li>
                </ul>

                <div className="about-qr" data-testid="about-qr-display-container">
                  <p className="section-title">About Us QR</p>
                  <img
                    src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL}
                    alt="About us QR"
                    className="about-qr-image"
                    data-testid="about-static-qr-image"
                  />
                </div>
              </div>
            )}
          </div>

          <footer className="sheet-footer" data-testid="sheet-footer">
            <p data-testid="signature-placeholder">Authorised Signature</p>
            <p data-testid="thanks-note">Thanking you.</p>
          </footer>
        </section>

        <aside className="controls no-print" data-testid="control-panel">
          <div className="control-card" data-testid="customer-form-section">
            <h3>Customer Details</h3>
            <Input
              value={customer.name}
              onChange={(event) => setCustomer((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="Customer name"
              data-testid="customer-name-input"
            />
            <Input
              value={customer.phone}
              onChange={(event) => setCustomer((prev) => ({ ...prev, phone: event.target.value }))}
              placeholder="Phone"
              data-testid="customer-phone-input"
            />
            <Input
              value={customer.address}
              onChange={(event) => setCustomer((prev) => ({ ...prev, address: event.target.value }))}
              placeholder="Address"
              data-testid="customer-address-input"
            />
            <Input
              value={customer.email}
              onChange={(event) => setCustomer((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="Email"
              data-testid="customer-email-input"
            />
            <Input
              type="text"
              value={billDate}
              onChange={(event) => setBillDate(event.target.value)}
              placeholder="YYYY-MM-DD"
              data-testid="bill-date-input"
            />

            {suggestions.length > 0 ? (
              <div className="suggestions" data-testid="customer-suggestions-list">
                {suggestions.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="suggestion-item"
                    onClick={() => {
                      setCustomer({
                        name: entry.name,
                        phone: entry.phone,
                        address: entry.address,
                        email: entry.email,
                      });
                      setSuggestions([]);
                    }}
                    data-testid={`customer-suggestion-${entry.id}`}
                  >
                    {entry.name} · {entry.phone}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <div className="control-card" data-testid="item-editor-section">
            <h3>Item Lines</h3>
            {items.map((item, index) => (
              <div key={item.id} className="item-row-editor" data-testid={`item-editor-row-${index + 1}`}>
                <Input
                  value={item.description}
                  onChange={(event) => updateItem(item.id, "description", event.target.value)}
                  placeholder="Description"
                  data-testid={`item-description-input-${index + 1}`}
                />
                <Input
                  value={item.hsn}
                  onChange={(event) => updateItem(item.id, "hsn", event.target.value)}
                  placeholder="HSN"
                  data-testid={`item-hsn-input-${index + 1}`}
                />
                <Input
                  value={item.weight}
                  onChange={(event) => updateItem(item.id, "weight", event.target.value)}
                  placeholder="Weight"
                  data-testid={`item-weight-input-${index + 1}`}
                />
                <Input
                  value={item.quantity}
                  onChange={(event) => updateItem(item.id, "quantity", event.target.value)}
                  placeholder="Qty"
                  data-testid={`item-quantity-input-${index + 1}`}
                />
                <Input
                  value={item.rate_override}
                  onChange={(event) => updateItem(item.id, "rate_override", event.target.value)}
                  placeholder="Rate override"
                  data-testid={`item-rate-override-input-${index + 1}`}
                />
                <Input
                  value={item.amount_override}
                  onChange={(event) => updateItem(item.id, "amount_override", event.target.value)}
                  placeholder="Amount override"
                  data-testid={`item-amount-override-input-${index + 1}`}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setItems((prev) => prev.filter((row) => row.id !== item.id))}
                  disabled={items.length === 1}
                  data-testid={`remove-item-button-${index + 1}`}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button
              type="button"
              onClick={() => setItems((prev) => [...prev, createItem()])}
              data-testid="add-item-button"
            >
              Add Item
            </Button>
          </div>

          <div className="control-card" data-testid="adjustments-section">
            <h3>Adjustments</h3>
            <Input
              value={discount}
              onChange={(event) => setDiscount(event.target.value)}
              placeholder="Discount"
              data-testid="discount-input"
            />
            <Input
              value={exchange}
              onChange={(event) => setExchange(event.target.value)}
              placeholder="Exchange"
              data-testid="exchange-input"
            />
            <Input
              value={manualRoundOff}
              onChange={(event) => setManualRoundOff(event.target.value)}
              placeholder="Manual round off (optional)"
              data-testid="round-off-input"
            />

            <label htmlFor="payment-method-select" className="select-label">Payment Method</label>
            <select
              id="payment-method-select"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value)}
              className="native-select"
              data-testid="payment-method-select"
            >
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>

            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Notes"
              className="notes-box"
              data-testid="notes-textarea"
            />
          </div>

          <div className="control-card action-grid" data-testid="action-buttons-section">
            <Button onClick={saveBill} disabled={savingBill} data-testid="save-bill-button">
              {savingBill ? "Saving..." : "Save Bill"}
            </Button>
            <Button onClick={downloadPdf} data-testid="download-pdf-button">Download PDF</Button>
            <Button onClick={printBill} data-testid="print-bill-button">Print</Button>
            <Button onClick={shareWhatsApp} data-testid="share-whatsapp-button">WhatsApp</Button>
            <Button onClick={shareEmail} data-testid="share-email-button">Email</Button>
            <Button onClick={() => clearBill()} variant="outline" data-testid="new-bill-button">New Bill</Button>
            <Button onClick={() => setShowSettings((prev) => !prev)} variant="outline" data-testid="toggle-settings-button">
              Settings
            </Button>
            <Button onClick={() => setShowAbout((prev) => !prev)} variant="outline" data-testid="toggle-about-button">
              About
            </Button>
          </div>
        </aside>
      </main>

      {showSettings ? (
        <section className="side-drawer no-print" data-testid="settings-drawer">
          <div className="drawer-header" data-testid="settings-drawer-header">
            <h3>Settings</h3>
            <Button
              type="button"
              variant="outline"
              className="drawer-back-btn"
              onClick={() => setShowSettings(false)}
              data-testid="settings-back-button"
            >
              <ArrowLeft className="drawer-back-icon" />
              <span>Back</span>
            </Button>
          </div>
          <Input
            value={settings.shop_name}
            onChange={(event) => setSettings((prev) => ({ ...prev, shop_name: event.target.value }))}
            placeholder="Shop name"
            data-testid="settings-shop-name-input"
          />
          <Input
            value={settings.tagline}
            onChange={(event) => setSettings((prev) => ({ ...prev, tagline: event.target.value }))}
            placeholder="Tagline"
            data-testid="settings-tagline-input"
          />
          <Input
            value={settings.address}
            onChange={(event) => setSettings((prev) => ({ ...prev, address: event.target.value }))}
            placeholder="Address"
            data-testid="settings-address-input"
          />
          <Input
            value={settings.phone_numbers.join(",")}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                phone_numbers: event.target.value
                  .split(",")
                  .map((item) => item.trim())
                  .filter(Boolean),
              }))
            }
            placeholder="Phone numbers comma separated"
            data-testid="settings-phone-input"
          />
          <Input
            value={settings.email}
            onChange={(event) => setSettings((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="Email"
            data-testid="settings-email-input"
          />
          <Input
            value={settings.silver_rate_per_10g}
            onChange={(event) => setSettings((prev) => ({ ...prev, silver_rate_per_10g: num(event.target.value) }))}
            placeholder="Silver Rate per 10g"
            data-testid="settings-silver-rate-input"
          />
          <Input
            value={settings.making_charge_per_gram}
            onChange={(event) => setSettings((prev) => ({ ...prev, making_charge_per_gram: num(event.target.value) }))}
            placeholder="Making Charge per gram"
            data-testid="settings-making-charge-input"
          />
          <Input
            value={settings.formula_note}
            onChange={(event) => setSettings((prev) => ({ ...prev, formula_note: event.target.value }))}
            placeholder="Formula note"
            data-testid="settings-formula-note-input"
          />
          <Input
            value={settings.invoice_upi_id}
            onChange={(event) => setSettings((prev) => ({ ...prev, invoice_upi_id: event.target.value }))}
            placeholder="Invoice mode UPI"
            data-testid="settings-invoice-upi-input"
          />
          <Input
            value={settings.estimate_upi_id}
            onChange={(event) => setSettings((prev) => ({ ...prev, estimate_upi_id: event.target.value }))}
            placeholder="Estimate mode UPI"
            data-testid="settings-estimate-upi-input"
          />

          <label className="select-label" htmlFor="print-scale-range">
            Auto Print Scale: {printScale.toFixed(1)}%
          </label>
          <input
            id="print-scale-range"
            type="range"
            min="98"
            max="102"
            step="0.1"
            value={printScale}
            onChange={(event) => setPrintScale(clampPrintScale(Number(event.target.value)))}
            data-testid="print-scale-range-input"
          />
          <Input
            type="number"
            min="98"
            max="102"
            step="0.1"
            value={printScale}
            onChange={(event) => setPrintScale(clampPrintScale(Number(event.target.value)))}
            data-testid="print-scale-number-input"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => setPrintScale(100)}
            data-testid="print-scale-reset-button"
          >
            Reset Print Scale (100%)
          </Button>

          <label className="file-label" htmlFor="logo-upload-input">Upload Logo</label>
          <input
            id="logo-upload-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
            onChange={handleLogoUpload}
            data-testid="settings-logo-upload-input"
          />
          <p className="upload-hint" data-testid="logo-upload-filename">
            {logoUploadName ? `Selected: ${logoUploadName}` : "No logo selected yet"}
          </p>
          {settings.logo_data_url ? (
            <img
              src={settings.logo_data_url}
              alt="Logo preview"
              className="settings-logo-preview"
              data-testid="settings-logo-preview"
            />
          ) : null}

          <Button onClick={saveSettings} data-testid="settings-save-button">Save Settings</Button>
        </section>
      ) : null}

      {showAbout ? (
        <section className="side-drawer no-print" data-testid="about-drawer">
          <div className="drawer-header" data-testid="about-drawer-header">
            <h3>About & QR</h3>
            <Button
              type="button"
              variant="outline"
              className="drawer-back-btn"
              onClick={() => setShowAbout(false)}
              data-testid="about-back-button"
            >
              <ArrowLeft className="drawer-back-icon" />
              <span>Back</span>
            </Button>
          </div>
          <p data-testid="about-text-content">
            This app stores your logo and About QR in local storage so they remain available on every bill.
          </p>
          <img
            src={settings.about_qr_data_url || STATIC_ABOUT_QR_URL}
            alt="Static About QR"
            className="about-preview"
            data-testid="about-qr-preview-image"
          />
          <label className="file-label" htmlFor="about-qr-upload-input">Upload About QR</label>
          <input
            id="about-qr-upload-input"
            type="file"
            accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
            onChange={handleAboutQrUpload}
            data-testid="about-qr-upload-input"
          />
          <p className="upload-hint" data-testid="about-qr-upload-filename">
            {aboutUploadName ? `Selected: ${aboutUploadName}` : "No QR selected yet"}
          </p>

          <div className="cloud-note" data-testid="cloud-setup-note">
            <h4>Cloud Database Setup (Next Phase)</h4>
            <ol>
              <li>Create Supabase project and get project URL + service role key.</li>
              <li>Add them in backend <code>SUPABASE_URL</code> and <code>SUPABASE_SERVICE_ROLE_KEY</code>.</li>
              <li>Create <code>customers</code> and <code>number_counters</code> tables as in README.</li>
            </ol>
            <p className="cloud-status-text" data-testid="cloud-status-text">
              Cloud status: {cloudStatus.enabled ? "Connected" : "Placeholder mode"} ({cloudStatus.mode})
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
