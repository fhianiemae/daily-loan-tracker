import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  doc,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from "./firebase-init.js";
import {
  daysUntil,
  formatDate,
  formatMoney,
  interestRatePercent,
  remainingPayable,
  showError,
} from "./utils.js";

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

  const paymentsSnap = await getDocs(
    query(collection(db, "clients", clientId, "payments"), orderBy("date", "asc"))
  );
  const payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  renderSummary(clientData, payments);
  renderPayments(clientData, payments);
  content.hidden = false;
}

function renderSummary(client, payments) {
  document.getElementById("principalInterest").textContent = formatMoney(client.totalPayable);
  document.getElementById("principalBreakdown").textContent =
    `${formatMoney(client.principal)} + ${interestRatePercent(client.principal, client.interest)}%`;

  const remaining = remainingPayable(client, payments);
  document.getElementById("remainingPayable").textContent = formatMoney(remaining);
  const approvedThisCycle = payments
    .filter((p) => p.status === "approved" && (p.cycle ?? 0) === (client.cycle ?? 0))
    .reduce((sum, p) => sum + Number(p.amount), 0);
  document.getElementById("paidSub").textContent = `${formatMoney(approvedThisCycle)} paid (approved)`;

  document.getElementById("dueDate").textContent = formatDate(client.dueDate);
  const diff = daysUntil(client.dueDate);

  const banner = document.getElementById("reminderBanner");
  const dueDateSub = document.getElementById("dueDateSub");
  if (diff < 0) {
    dueDateSub.textContent = `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}`;
    banner.className = "banner danger";
    banner.textContent = `This loan is overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}.`;
    banner.hidden = false;
  } else if (diff <= 7) {
    dueDateSub.textContent = `${diff} day${diff === 1 ? "" : "s"} left`;
    banner.className = "banner warn";
    banner.textContent = `Reminder: your loan is due in ${diff} day${diff === 1 ? "" : "s"}, on ${formatDate(client.dueDate)}.`;
    banner.hidden = false;
  } else {
    dueDateSub.textContent = `${diff} days left`;
    banner.hidden = true;
  }
}

function renderPayments(client, payments) {
  const tableCard = document.getElementById("tableCard");
  const noPayments = document.getElementById("noPayments");

  if (payments.length === 0) {
    noPayments.hidden = false;
    tableCard.hidden = true;
    return;
  }

  const sorted = [...payments].sort(
    (a, b) => (a.cycle ?? 0) - (b.cycle ?? 0) || a.date.localeCompare(b.date)
  );

  let runningCycle = null;
  let running = 0;
  const rows = sorted.map((p) => {
    const cycle = p.cycle ?? 0;
    if (cycle !== runningCycle) {
      runningCycle = cycle;
      const base =
        cycle === (client.cycle ?? 0)
          ? client.totalPayable
          : client.previousCycles?.[cycle]?.totalPayable ?? client.totalPayable;
      running = Number(base);
    }
    if (p.status === "approved") running -= Number(p.amount);
    return { ...p, remainingAfter: running };
  });

  document.getElementById("paymentsBody").innerHTML = rows
    .map(
      (p) => `
      <tr>
        <td>${formatDate(p.date)}</td>
        <td>${formatMoney(p.amount)}</td>
        <td>
          ${
            p.status === "approved"
              ? formatMoney(p.remainingAfter)
              : `<span class="badge pending">Pending</span>
                 <button type="button" class="danger delete-payment-btn" data-id="${p.id}" style="margin-left:8px;">Delete</button>`
          }
        </td>
      </tr>`
    )
    .join("");

  tableCard.hidden = false;
  noPayments.hidden = true;

  document.querySelectorAll(".delete-payment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("Delete this payment entry? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "clients", clientId, "payments", btn.dataset.id));
        await loadLoan(auth.currentUser.uid);
      } catch (err) {
        btn.disabled = false;
        showError(pageError, "Could not delete this payment. Please try again.");
      }
    });
  });
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
      source: "client",
      cycle: clientData.cycle ?? 0,
      createdAt: serverTimestamp(),
    });
    paymentForm.reset();
    document.getElementById("payDate").valueAsDate = new Date();
    await loadLoan(auth.currentUser.uid);
  } catch (err) {
    showError(formError, "Could not submit payment. Please try again.");
  }
});
