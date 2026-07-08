export const LOAN_DAYS = 30;
export const OVERDUE_PENALTY_RATE = 0.2;
export const RENEWAL_INTEREST_RATE = 0.2;

// Clients log in with a username + 4-digit PIN, but under the hood we still
// use real Firebase Auth accounts so Firestore security rules can trust
// request.auth.uid. These two functions map the PIN-based login the client
// sees onto an email/password Firebase Auth accepts.
export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@client.dailyloan.local`;
}
export function pinToPassword(pin) {
  return `${pin}-dlp-pin`; // fixed padding so a 4-digit pin clears Firebase's 6-char minimum
}

export function computeLoan({ principal, interest, startDate }) {
  const totalPayable = Number(principal) + Number(interest);
  const dailyDue = totalPayable / LOAN_DAYS;
  const due = new Date(`${startDate}T00:00:00`);
  due.setDate(due.getDate() + LOAN_DAYS);
  return { totalPayable, dailyDue, dueDate: due.toISOString().slice(0, 10) };
}

export function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target - today) / 86400000);
}

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function formatMoney(n) {
  // Plain "PHP" instead of the ₱ glyph: in bold/heavy fonts the Peso sign's
  // bar can visually stretch across the whole number, reading like a
  // strikethrough on the amount.
  return `PHP ${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Interest is stored as a flat amount, but the UI shows it as a rate relative
// to that cycle's principal (e.g. "₱15,000.00 + 20%").
export function interestRatePercent(principal, interest) {
  if (!principal) return 0;
  return Math.round((Number(interest) / Number(principal)) * 100);
}

// Sum of approved payments logged against the client's *current* cycle only;
// payments from a cycle that has since been renewed don't count against the
// new balance.
export function remainingPayable(client, payments) {
  const approvedThisCycle = payments
    .filter((p) => p.status === "approved" && (p.cycle ?? 0) === (client.cycle ?? 0))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  return Number(client.totalPayable) - approvedThisCycle;
}

// Returns the new totalPayable if this client just crossed its due date,
// still owes money, and hasn't already been penalized this cycle -
// otherwise null. The caller (a lender-side page, since only lenders can
// write arbitrary client fields) is responsible for persisting it.
export function computeOverduePenalty(client, remaining) {
  if (client.status !== "active") return null;
  if (client.penaltyApplied) return null;
  if (remaining <= 0) return null;
  if (daysUntil(client.dueDate) >= 0) return null;
  return Number(client.totalPayable) + remaining * OVERDUE_PENALTY_RATE;
}

// Rolls the current cycle's remaining balance into a fresh 30-day cycle:
// the old balance becomes the new principal, a new interest charge is added
// on top, and the clock resets from today.
export function computeRenewal(remaining) {
  const principal = Number(remaining);
  const interest = principal * RENEWAL_INTEREST_RATE;
  const startDate = todayStr();
  const { totalPayable, dailyDue, dueDate } = computeLoan({ principal, interest, startDate });
  return { principal, interest, totalPayable, dailyDue, startDate, dueDate };
}

export function formatDate(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function generateClientCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function showError(el, message) {
  el.textContent = message;
  el.hidden = !message;
}
