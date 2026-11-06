import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { RefreshCw, TrendingUp, ShoppingBag, Wallet, Clock3 } from "lucide-react";

type AnalyticsData = {
  totalOrders: number;
  paidOrders: number;
  pendingPayments: number;
  revenue: number;
  averageOrderValue: number;
  dailySales: { date: string; revenue: number; orders: number }[];
};

const money = (value: number) => new Intl.NumberFormat("en-NG", {
  style: "currency", currency: "NGN", maximumFractionDigits: 0
}).format(value || 0);

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: response, error: apiError } = await supabase.functions.invoke(
      "xtop-dashboard?action=analytics",
      { method: "GET" }
    );
    if (apiError || response?.error) {
      setError(response?.error || apiError?.message || "Could not load analytics.");
      setData(null);
    } else {
      setData(response?.data as AnalyticsData);
    }
    setLoading(false);
  }

  useEffect(() => { void load(); }, []);

  const maxRevenue = Math.max(1, ...(data?.dailySales || []).map((day) => day.revenue));

  function exportCsv() {
    if (!data) return;

    const rows: Array<Array<string | number>> = [
      ["Sabi by XTOP - Business Performance Report"],
      ["Report period", "Last 30 days"],
      ["Generated at", new Date().toISOString()],
      [],
      ["Metric", "Value"],
      ["Total orders", data.totalOrders],
      ["Paid orders", data.paidOrders],
      ["Awaiting payment", data.pendingPayments],
      ["Revenue collected (NGN)", data.revenue],
      ["Average paid order value (NGN)", data.averageOrderValue],
      [],
      ["Date", "Orders", "Revenue (NGN)"],
      ...data.dailySales.map((day) => [day.date, day.orders, day.revenue]),
    ];

    const csv = rows
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
          .join(",")
      )
      .join("\r\n");

    const blob = new Blob(["\uFEFF", csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sabi-business-report-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="analytics-page">
      <div className="analytics-toolbar">
        <div><h2>Business performance</h2><p>Order and payment activity for the last 30 days.</p></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button className="icon-action" onClick={() => void load()} title="Refresh"><RefreshCw size={17}/></button>
          <button onClick={exportCsv} disabled={!data || loading} style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 600, cursor: !data || loading ? "not-allowed" : "pointer" }}>Export CSV</button>
          <button onClick={() => window.print()} disabled={!data || loading} style={{ padding: "9px 13px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", fontWeight: 600, cursor: !data || loading ? "not-allowed" : "pointer" }}>Print / Save PDF</button>
        </div>
      </div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {loading ? <div className="panel empty-state">Loading your business analytics…</div> : !data ? <div className="panel empty-state">Analytics are not available yet.</div> :
        <>
          <div className="analytics-stats">
            <div className="stat-card"><span>Revenue collected</span><strong>{money(data.revenue)}</strong><small><Wallet size={14}/> Paid orders only</small></div>
            <div className="stat-card"><span>Total orders</span><strong>{data.totalOrders}</strong><small><ShoppingBag size={14}/> Last 30 days</small></div>
            <div className="stat-card"><span>Paid orders</span><strong>{data.paidOrders}</strong><small><TrendingUp size={14}/> Payment confirmed</small></div>
            <div className="stat-card"><span>Awaiting payment</span><strong>{data.pendingPayments}</strong><small><Clock3 size={14}/> Unpaid orders</small></div>
          </div>
          <div className="panel sales-panel">
            <div className="panel-heading"><div><h2>Daily sales</h2><p>Confirmed payment revenue by day.</p></div><strong>{money(data.averageOrderValue)} <small>average paid order</small></strong></div>
            <div className="sales-chart">
              {data.dailySales.map((day) => <div className="sales-column" key={day.date} title={`${day.date}: ${money(day.revenue)} · ${day.orders} orders`}><div className="sales-bar-wrap"><span className="sales-bar" style={{ height: `${Math.max(day.revenue > 0 ? 4 : 0, day.revenue / maxRevenue * 100)}%` }}/></div><small>{new Date(day.date + "T00:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short" })}</small></div>)}
            </div>
          </div>
        </>
      }
    </div>
  );
}
