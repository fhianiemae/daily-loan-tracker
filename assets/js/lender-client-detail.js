import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "./firebase-init.js";
import { daysUntil, formatDate, formatMoney, showError } from "./utils.js";

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => signOut(auth));

const pageError = document.getElementById("pageError");
const content = document.getElementById("content");

const clientId = new URLSearchParams(window.location.search).get("id");

let currentUid = null;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUid = user.uid;
  loadClient().catch((err) => {
    console.error(err);
    showError(pageError, "Could not load this client. Please refresh and try again.");
  });
});

async function loadClient() {
  if (!clientId) {
    showError(pageError, "No client specified.");
    return;
  }

  const clientRef = doc(db, "clients", clientId);
  const snap = await getDoc(clientRef);

  if (!snap.exists() || snap.data().lenderId !== currentUid) {
    showError(pageError, "Client not found.");
    return;
  }

  const client = snap.data();
  renderSummary(client);
  await renderPayments(client);
  content.hidden = false;
}

function renderSummary(client) {
  document.getElementById("clientName").textContent = client.name;
  document.getElementById("principalInterest").textContent =
    `${formatMoney(client.principal)} + ${formatMoney(client.interest)}`;
  document.getElementById("totalPayable").textContent = formatMoney(client.totalPayable);
  document.getElementById("dueDate").textContent = formatDate(client.dueDate);

  const badge = document.getElementById("statusBadge");
  if (client.status === "pending-link") {
    badge.innerHTML = `<span class="badge awaiting">Awaiting activation</span>`;
    return;
  }
  const diff = daysUntil(client.dueDate);
  if (diff < 0) badge.innerHTML = `<span class="badge overdue">Overdue</span>`;
  else if (diff <= 7) badge.innerHTML = `<span class="badge due-soon">Due in ${diff}d</span>`;
  else badge.innerHTML = `<span class="badge on-track">On track</span>`;
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
    return { id: d.id, ...p, remainingAfter: running };
  });

  document.getElementById("paymentsBody").innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td>${formatMoney(p.amount)}</td>
        <td>${formatMoney(p.remainingAfter)}</td>
        <td>
          ${
            p.status === "approved"
              ? `<span class="badge approved">Approved</span>`
              : `<span class="badge pending">Pending</span>
                 <button type="button" class="secondary approve-btn" data-id="${p.id}" style="margin-left:8px;">Approve</button>`
          }
        </td>
      </tr>`
    )
    .join("");

  remainingPayableEl.textContent = formatMoney(running);
  tableCard.hidden = false;
  noPayments.hidden = true;

  document.querySelectorAll(".approve-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await updateDoc(doc(db, "clients", clientId, "payments", btn.dataset.id), {
          status: "approved",
          approvedAt: serverTimestamp(),
        });
        await renderPayments(client);
      } catch (err) {
        btn.disabled = false;
        showError(pageError, "Could not approve this payment. Please try again.");
      }
    });
  });
}
