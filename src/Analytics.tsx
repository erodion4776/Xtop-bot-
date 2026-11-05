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
  return (
    <div className="analytics-page">
      <div className="analytics-toolbar"><div><h2>Business performance</h2><p>Order and payment activity for the last 30 days.</p></div><button className="icon-action" onClick={() => void load()} title="Refresh"><RefreshCw size={17}/></button></div>
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
