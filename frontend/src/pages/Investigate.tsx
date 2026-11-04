import { useState } from "react";
import { api } from "../api";
import { formatRWF, type Difference } from "../products";

const REASONS = [
  "Unrecorded sale",
  "Damaged or expired",
  "Theft",
  "Counting mistake",
  "Supplier delivered less",
];

function loadDifferences(): Difference[] {
  try {
    return JSON.parse(sessionStorage.getItem("lastCountDifferences") ?? "[]");
  } catch {
    return [];
  }
}

export default function Investigate() {
  const [differences] = useState<Difference[]>(loadDifferences);
  const [index, setIndex] = useState(0);
  const [reason, setReason] = useState(REASONS[0]);
  const [finding, setFinding] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (differences.length === 0) {
    return <p className="hint center">No differences from the last stock count. Do a count first.</p>;
  }

  const d = differences[Math.min(index, differences.length - 1)];

  async function send() {
    setError("");
    setMessage("");
    try {
      // There is no investigations endpoint on the backend yet (routes/discrepancies.py is empty).
      await api("/api/investigations", {
        method: "POST",
        body: JSON.stringify({ discrepancy_id: d.discrepancy_id, product_id: d.product_id, reason, finding }),
      });
      setMessage("Sent to the owner for approval.");
    } catch {
      setError("Not saved: the investigations API is still in progress.");
    }
  }

  return (
    <>
      {differences.length > 1 && (
        <label className="field">
          <span>Difference</span>
          <select className="input" value={index} onChange={(e) => { setIndex(Number(e.target.value)); setMessage(""); setError(""); }}>
            {differences.map((x, i) => <option key={x.product_id} value={i}>{x.name} ({x.variance > 0 ? "+" : ""}{x.variance})</option>)}
          </select>
        </label>
      )}

      <div className={d.variance < 0 ? "summary bad" : "summary warn"}>
        <div className="row-title">{d.name}</div>
        <div className="summary-line"><span>Expected</span><b>{d.expected} units</b></div>
        <div className="summary-line"><span>Counted</span><b>{d.counted} units</b></div>
        <div className="summary-line"><span>Variance</span>
          <b>{d.variance > 0 ? "+" : ""}{d.variance} units{d.unit_cost > 0 && ` (${d.variance > 0 ? "+" : "−"}${formatRWF(Math.abs(d.variance * d.unit_cost))})`}</b>
        </div>
      </div>

      <div className="field">
        <span>What most likely happened?</span>
        <div className="choices">
          {REASONS.map((r) => (
            <label key={r} className={reason === r ? "choice active" : "choice"}>
              <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} />
              {r}
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        <span>What did you find?</span>
        <textarea className="input" rows={3} value={finding} onChange={(e) => setFinding(e.target.value)}
          placeholder="e.g. Sold 2 bags on credit on Saturday" />
      </label>

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}

      <button className="btn btn-primary" onClick={send}>Send to owner for approval</button>
    </>
  );
}