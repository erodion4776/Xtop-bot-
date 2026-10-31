
import { useCallback, useEffect, useState } from "react";
import {
  Wallet as WalletIcon,
  RefreshCw,
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  ShieldCheck,
  Clock
} from "lucide-react";
import { supabase } from "./lib/supabase";

type WalletRecord = {
  id: string;
  tenant_id: string;
  balance: number | string;
  status: string;
  low_balance_threshold: number | string | null;
};

type Transaction = {
  id: string;
  transaction_type: string;
  status: string;
  amount: number | string;
  balance_before: number | string | null;
  balance_after: number | string | null;
  reference: string | null;
  description: string | null;
  created_at: string;
};

const MIN_TOPUP = 500;
const MAX_TOPUP = 5000000;

const formatMoney = (value: number | string | null | undefined) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2
  }).format(Number(value || 0));

const formatDate = (value: string) =>
  new Date(value).toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short"
  });

function readableType(value: string) {
  const type = (value || "").toUpperCase();

  if (type.includes("TOPUP") || type.includes("CREDIT")) return "Wallet top-up";
  if (type.includes("COMMISSION") || type.includes("ORDER_FEE")) return "Order commission";
  if (type.includes("REFUND")) return "Refund";
  if (type.includes("DEBIT")) return "Wallet debit";

  return type.replaceAll("_", " ") || "Wallet transaction";
}

export default function Wallet({ tenantId }: { tenantId: string }) {
  const [wallet, setWallet] = useState<WalletRecord | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [authorizationUrl, setAuthorizationUrl] = useState("");
  const [pendingReference, setPendingReference] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pendingStorageKey = `sabi-wallet-pending-${tenantId}`;

  const loadWallet = useCallback(async (quiet = false) => {
    if (!tenantId) return;

    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError("");

    try {
      const { data: walletData, error: walletError } = await supabase
        .from("tenant_wallets")
        .select("id,tenant_id,balance,status,low_balance_threshold")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (walletError) throw walletError;

      if (!walletData) {
        setWallet(null);
        setTransactions([]);
        setError("Your merchant wallet could not be found. Please contact support.");
        return;
      }

      setWallet(walletData);

      const { data: transactionData, error: transactionError } = await supabase
        .from("tenant_wallet_transactions")
        .select(
          "id,transaction_type,status,amount,balance_before,balance_after,reference,description,created_at"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (transactionError) throw transactionError;

      setTransactions(transactionData || []);
    } catch (err: any) {
      setError(err?.message || "Unable to load your wallet.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadWallet();

    if (!tenantId) return;

    const params = new URLSearchParams(window.location.search);
    const returnedReference =
      params.get("reference") || params.get("trxref");

    if (returnedReference) {
      localStorage.setItem(pendingStorageKey, returnedReference);
      setPendingReference(returnedReference);
      setNotice("Payment return detected. Verify the payment to update your wallet.");
    } else {
      const savedReference = localStorage.getItem(pendingStorageKey);

      if (savedReference) {
        setPendingReference(savedReference);
      }
    }
  }, [tenantId, pendingStorageKey, loadWallet]);

  async function initializeTopup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const numericAmount = Number(amount);

    if (
      !Number.isSafeInteger(numericAmount) ||
      numericAmount < MIN_TOPUP ||
      numericAmount > MAX_TOPUP
    ) {
      setError("Enter a whole-number amount between ₦500 and ₦5,000,000.");
      return;
    }

    if (wallet?.status === "PAUSED") {
      setError("Your wallet is paused. Please contact support.");
      return;
    }

    setProcessing(true);
    setError("");
    setNotice("");
    setAuthorizationUrl("");

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "wallet-api?action=initialize",
        {
          body: {
            tenant_id: tenantId,
            amount: numericAmount
          }
        }
      );

      if (functionError) throw functionError;
      if (!data?.success || !data?.authorization_url || !data?.reference) {
        throw new Error(data?.error || "Could not initialize your payment.");
      }

      localStorage.setItem(pendingStorageKey, data.reference);
      setPendingReference(data.reference);
      setAuthorizationUrl(data.authorization_url);
      setAmount("");
      setNotice("Your Paystack payment has been prepared. Continue securely to complete it.");
    } catch (err: any) {
      setError(
        err?.message || "Unable to start wallet top-up. Please try again."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function verifyTopup() {
    if (!pendingReference) return;

    setVerifying(true);
    setError("");
    setNotice("");

    try {
      const { data, error: functionError } = await supabase.functions.invoke(
        "wallet-api?action=verify",
        {
          body: {
            tenant_id: tenantId,
            reference: pendingReference
          }
        }
      );

      if (functionError) throw functionError;

      if (!data?.success) {
        setNotice(
          data?.message ||
          "Payment is not confirmed yet. If you have just paid, wait briefly and verify again."
        );
        return;
      }

      localStorage.removeItem(pendingStorageKey);
      setPendingReference("");
      setAuthorizationUrl("");
      setNotice("Payment verified. Your wallet has been credited.");
      await loadWallet(true);
    } catch (err: any) {
      setError(
        err?.message || "Payment verification failed. Please retry."
      );
    } finally {
      setVerifying(false);
    }
  }

  const balance = Number(wallet?.balance || 0);
  const threshold = Number(wallet?.low_balance_threshold || 500);
  const walletStatus = (wallet?.status || "").toUpperCase();

  const statusClass =
    walletStatus === "ACTIVE"
      ? "wallet-status-active"
      : walletStatus === "LOW_BALANCE"
      ? "wallet-status-low"
      : "wallet-status-paused";

  if (loading) {
    return (
      <div className="wallet-page">
        <div className="wallet-loading">
          <RefreshCw size={22} className="wallet-spin" />
          <p>Loading your wallet...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-page">
      <div className="wallet-toolbar">
        <div>
          <h2>Merchant wallet</h2>
          <p>Manage your balance, top-ups and transaction history.</p>
        </div>

        <button
          className="wallet-refresh"
          onClick={() => loadWallet(true)}
          disabled={refreshing}
        >
          <RefreshCw size={15} className={refreshing ? "wallet-spin" : ""} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="wallet-alert wallet-alert-error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="wallet-alert wallet-alert-success" role="status">
          {notice}
        </div>
      )}

      {wallet && (
        <>
          <div className="wallet-overview-grid">
            <div className="wallet-balance-card">
              <div className="wallet-balance-heading">
                <span>Available wallet balance</span>
                <span className="wallet-icon-circle">
                  <WalletIcon size={20} />
                </span>
              </div>

              <strong>{formatMoney(balance)}</strong>

              <div className="wallet-balance-footer">
                <span className={`wallet-status ${statusClass}`}>
                  <span />
                  {walletStatus.replaceAll("_", " ")}
                </span>
                <small>Merchant wallet</small>
              </div>
            </div>

            <div className="wallet-info-card">
              <div className="wallet-info-icon">
                <ShieldCheck size={19} />
              </div>
              <span>Low balance alert</span>
              <strong>{formatMoney(threshold)}</strong>
              <small>Default alert threshold</small>
            </div>

            <div className="wallet-info-card">
              <div className="wallet-info-icon">
                <Clock size={19} />
              </div>
              <span>Transaction records</span>
              <strong>{transactions.length}</strong>
              <small>Latest 50 transactions</small>
            </div>
          </div>

          <div className="wallet-content-grid">
            <section className="wallet-panel">
              <div className="wallet-panel-heading">
                <div className="wallet-panel-icon">
                  <CreditCard size={19} />
                </div>
                <div>
                  <h3>Fund your wallet</h3>
                  <p>Secure payments powered by Paystack.</p>
                </div>
              </div>

              <form onSubmit={initializeTopup} className="wallet-topup-form">
                <label htmlFor="wallet-topup-amount">
                  Amount in naira
                </label>

                <div className="wallet-amount-input">
                  <span>₦</span>
                  <input
                    id="wallet-topup-amount"
                    type="number"
                    min={MIN_TOPUP}
                    max={MAX_TOPUP}
                    step="1"
                    inputMode="numeric"
                    placeholder="Enter amount"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={processing || walletStatus === "PAUSED"}
                    required
                  />
                </div>

                <small>
                  Minimum ₦500 · Maximum ₦5,000,000
                </small>

                <div className="wallet-quick-amounts">
                  {[500, 1000, 2000, 5000, 10000].map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setAmount(String(value))}
                      className={amount === String(value) ? "selected" : ""}
                    >
                      ₦{value.toLocaleString("en-NG")}
                    </button>
                  ))}
                </div>

                <button
                  type="submit"
                  className="wallet-primary-btn"
                  disabled={processing || walletStatus === "PAUSED"}
                >
                  {processing ? "Preparing payment..." : "Continue to payment"}
                </button>
              </form>

              {authorizationUrl && (
                <div className="wallet-payment-next">
                  <strong>Payment request created</strong>
                  <p>
                    Reference: <span>{pendingReference}</span>
                  </p>
                  <a
                    href={authorizationUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open secure Paystack payment
                  </a>
                </div>
              )}

              {pendingReference && (
                <div className="wallet-pending-payment">
                  <p>
                    Have you completed a previous wallet payment?
                  </p>
                  <small>Reference: {pendingReference}</small>
                  <button
                    type="button"
                    onClick={verifyTopup}
                    disabled={verifying}
                  >
                    {verifying ? "Verifying payment..." : "Verify payment"}
                  </button>
                </div>
              )}

              <div className="wallet-secure-note">
                <ShieldCheck size={15} />
                Payments are verified with Paystack before your wallet is credited.
              </div>
            </section>

            <section className="wallet-panel wallet-fees-panel">
              <h3>How Sabi commissions work</h3>
              <p>
                A commission is deducted once when an order is successfully
                completed. It is calculated from the product subtotal,
                excluding shipping.
              </p>

              <div className="wallet-fee-row">
                <span>Product subtotal below ₦1,000</span>
                <strong>₦20</strong>
              </div>

              <div className="wallet-fee-row">
                <span>₦1,000 – ₦2,500</span>
                <strong>₦70</strong>
              </div>

              <div className="wallet-fee-row">
                <span>Above ₦2,500 – below ₦10,000</span>
                <strong>₦130</strong>
              </div>

              <div className="wallet-fee-row">
                <span>₦10,000 and above</span>
                <strong>₦250</strong>
              </div>

              <div className="wallet-fee-note">
                <ShieldCheck size={16} />
                Commission deductions are handled securely by the order system,
                not by this dashboard page.
              </div>
            </section>
          </div>

          <section className="wallet-panel wallet-history-panel">
            <div className="wallet-history-heading">
              <div>
                <h3>Transaction history</h3>
                <p>Your latest wallet credits and deductions.</p>
              </div>
              <span>{transactions.length} records</span>
            </div>

            {transactions.length === 0 ? (
              <div className="wallet-empty">
                <WalletIcon size={30} />
                <strong>No transactions yet</strong>
                <p>Your wallet activity will appear here.</p>
              </div>
            ) : (
              <div className="wallet-table-wrap">
                <table className="wallet-table">
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Reference / Details</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((transaction) => {
                      const type = (transaction.transaction_type || "").toUpperCase();
                      const isCredit =
                        type.includes("CREDIT") ||
                        type.includes("TOPUP") ||
                        type.includes("REFUND");

                      return (
                        <tr key={transaction.id}>
                          <td>
                            <div className="wallet-transaction-type">
                              <span className={isCredit ? "credit" : "debit"}>
                                {isCredit ? (
                                  <ArrowDownCircle size={17} />
                                ) : (
                                  <ArrowUpCircle size={17} />
                                )}
                              </span>
                              <strong>
                                {readableType(transaction.transaction_type)}
                              </strong>
                            </div>
                          </td>
                          <td>
                            <span className="wallet-reference">
                              {transaction.description ||
                                transaction.reference ||
                                "Wallet activity"}
                            </span>
                            {transaction.reference && transaction.description && (
                              <small>{transaction.reference}</small>
                            )}
                          </td>
                          <td>
                            <strong className={isCredit ? "wallet-credit-amount" : ""}>
                              {isCredit ? "+" : "−"}
                              {formatMoney(Math.abs(Number(transaction.amount || 0)))}
                            </strong>
                          </td>
                          <td>
                            <span
                              className={`wallet-transaction-status ${
                                (transaction.status || "").toUpperCase() === "COMPLETED" ||
                                (transaction.status || "").toUpperCase() === "SUCCESS"
                                  ? "success"
                                  : "other"
                              }`}
                            >
                              {(transaction.status || "UNKNOWN").replaceAll("_", " ")}
                            </span>
                          </td>
                          <td>{formatDate(transaction.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
