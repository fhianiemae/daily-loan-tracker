export const LOAN_DAYS = 30;

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

export function formatMoney(n) {
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
