import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  serverTimestamp,
} from "./firebase-init.js";
import { daysUntil, formatDate, formatMoney, showError } from "./utils.js";

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => signOut(auth));

const pageError = document.getElementById("pageError");
const content = document.getElementById("content");
const formError = document.getElementById("formError");
const paymentForm = document.getElementById("paymentForm");

document.getElementById("payDate").valueAsDate = new Date();

let clientId = null;
let clientData = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadLoan(user.uid).catch((err) => {
    console.error(err);
    showError(pageError, "Could not load your loan. Please refresh and try again.");
  });
});

async function loadLoan(uid) {
  const q = query(collection(db, "clients"), where("authUid", "==", uid), limit(1));
  const snap = await getDocs(q);

  if (snap.empty) {
    showError(pageError, "We couldn't find a loan linked to your account.");
    return;
  }

  clientId = snap.docs[0].id;
  clientData = snap.docs[0].data();

  renderSummary(clientData);
  await renderPayments(clientData);
  content.hidden = false;
}

function renderSummary(client) {
  document.getElementById("principalInterest").textContent =
    `${formatMoney(client.principal)} + ${formatMoney(client.interest)}`;
  document.getElementById("totalPayable").textContent = formatMoney(client.totalPayable);
  document.getElementById("dueDate").textContent = formatDate(client.dueDate);

  const banner = document.getElementById("reminderBanner");
  const diff = daysUntil(client.dueDate);
  if (diff < 0) {
    banner.className = "banner danger";
    banner.textContent = `This loan is overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}.`;
    banner.hidden = false;
  } else if (diff <= 7) {
    banner.className = "banner warn";
    banner.textContent = `Reminder: your loan is due in ${diff} day${diff === 1 ? "" : "s"}, on ${formatDate(client.dueDate)}.`;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

async function renderPayments(client) {
  const q = query(collection(db, "clients", clientId, "payments"), orderBy("date", "asc"));
  const snap = await getDocs(q);

  const tableCard = document.getElementById("tableCard");
  const noPayments = document.getElementById("noPayments");
  const remainingPayableEl = document.getElementById("remainingPayable");

  if (snap.empty) {
    noPayments.hidden = false;
    tableCard.hidden = true;
    remainingPayableEl.textContent = formatMoney(client.totalPayable);
    return;
  }

  let running = client.totalPayable;
  const rows = snap.docs.map((d) => {
    const p = d.data();
    if (p.status === "approved") running -= Number(p.amount);
    return { ...p, remainingAfter: running };
  });

  document.getElementById("paymentsBody").innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td>${formatMoney(p.amount)}</td>
        <td>${formatMoney(p.remainingAfter)}</td>
        <td>${
          p.status === "approved"
            ? `<span class="badge approved">Approved</span>`
            : `<span class="badge pending">Pending</span>`
        }</td>
      </tr>`
    )
    .join("");

  remainingPayableEl.textContent = formatMoney(running);
  tableCard.hidden = false;
  noPayments.hidden = true;
}

paymentForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");

  const date = document.getElementById("payDate").value;
  const amount = Number(document.getElementById("payAmount").value);

  if (!date || amount <= 0) {
    showError(formError, "Enter a valid date and amount.");
    return;
  }

  try {
    await addDoc(collection(db, "clients", clientId, "payments"), {
      date,
      amount,
      status: "pending",
      createdAt: serverTimestamp(),
    });
    paymentForm.reset();
    document.getElementById("payDate").valueAsDate = new Date();
    await renderPayments(clientData);
  } catch (err) {
    showError(formError, "Could not submit payment. Please try again.");
  }
});
