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
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from "./firebase-init.js";
import {
  daysUntil,
  formatDate,
  formatMoney,
  interestRatePercent,
  remainingPayable,
  computeOverduePenalty,
  computeRenewal,
  computeLoan,
  todayStr,
  showError,
} from "./utils.js";

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => signOut(auth));

const pageError = document.getElementById("pageError");
const content = document.getElementById("content");
const formError = document.getElementById("formError");
const paymentForm = document.getElementById("paymentForm");
const renewBtn = document.getElementById("renewBtn");
const deleteBtn = document.getElementById("deleteBtn");
const renewCard = document.getElementById("renewCard");
const renewError = document.getElementById("renewError");

document.getElementById("payDate").valueAsDate = new Date();

const clientId = new URLSearchParams(window.location.search).get("id");
const clientRef = doc(db, "clients", clientId);

let currentUid = null;
let client = null;
let payments = [];

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

  const snap = await getDoc(clientRef);
  if (!snap.exists() || snap.data().lenderId !== currentUid) {
    showError(pageError, "Client not found.");
    return;
  }
  client = snap.data();

  const paymentsSnap = await getDocs(
    query(collection(db, "clients", clientId, "payments"), orderBy("date", "asc"))
  );
  payments = paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  let remaining = remainingPayable(client, payments);
  const penalizedTotal = computeOverduePenalty(client, remaining);
  if (penalizedTotal !== null) {
    await updateDoc(clientRef, { totalPayable: penalizedTotal, penaltyApplied: true });
    client.totalPayable = penalizedTotal;
    client.penaltyApplied = true;
    remaining = remainingPayable(client, payments);
  }

  renderHero(client, remaining);
  renderLedger(client, payments);
  renderActions(remaining);
  content.hidden = false;
}

function renderHero(client, remaining) {
  document.getElementById("clientName").textContent = client.name;
  document.getElementById("clientSub").textContent =
    client.status === "pending-link" ? "Awaiting activation" : `@${client.username}`;

  document.getElementById("principalInterest").textContent = formatMoney(client.totalPayable);
  document.getElementById("principalBreakdown").textContent =
    `${formatMoney(client.principal)} + ${interestRatePercent(client.principal, client.interest)}%`;

  document.getElementById("dueDate").textContent = formatDate(client.dueDate);
  const diff = daysUntil(client.dueDate);
  let sub;
  if (diff < 0) sub = `Overdue by ${Math.abs(diff)} day${Math.abs(diff) === 1 ? "" : "s"}`;
  else if (diff === 0) sub = "Due today";
  else sub = `${diff} days left`;
  document.getElementById("dueDateSub").textContent = sub;

  document.getElementById("remainingInline").textContent = formatMoney(remaining);
}

function renderLedger(client, payments) {
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
        <td>${formatMoney(p.remainingAfter)}</td>
        <td>
          ${
            p.status === "approved"
              ? `<span class="badge approved">Approved</span>`
              : `<span class="badge pending">Pending</span>
                 <button type="button" class="secondary approve-btn" data-id="${p.id}" style="margin-left:8px;">Approve</button>`
          }
          <button type="button" class="danger delete-payment-btn" data-id="${p.id}" style="margin-left:8px;">Delete</button>
        </td>
      </tr>`
    )
    .join("");

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
        await loadClient();
      } catch (err) {
        btn.disabled = false;
        showError(pageError, "Could not approve this payment. Please try again.");
      }
    });
  });

  document.querySelectorAll(".delete-payment-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!window.confirm("Delete this payment entry? This cannot be undone.")) return;
      btn.disabled = true;
      try {
        await deleteDoc(doc(db, "clients", clientId, "payments", btn.dataset.id));
        await loadClient();
      } catch (err) {
        btn.disabled = false;
        showError(pageError, "Could not delete this payment. Please try again.");
      }
    });
  });
}

function renderActions(remaining) {
  const canManage = client.status === "active";
  if (canManage && remaining <= 0) {
    // Fully paid off: the lender decides whether the client wants another
    // cycle (Renew) or is done (Delete) - the system can't infer intent
    // from the balance alone, so offer both.
    deleteBtn.hidden = false;
    renewBtn.hidden = false;
  } else if (canManage) {
    // Still owes money: can't archive a client who hasn't paid, but they
    // can still renew (rolling the remaining balance into a new cycle).
    renewBtn.hidden = false;
    deleteBtn.hidden = true;
  } else {
    renewBtn.hidden = true;
    deleteBtn.hidden = true;
  }
}

const renewAutoSection = document.getElementById("renewAutoSection");
const renewManualSection = document.getElementById("renewManualSection");

renewBtn.addEventListener("click", () => {
  const remaining = remainingPayable(client, payments);
  showError(renewError, "");

  if (remaining > 0) {
    const renewal = computeRenewal(remaining);
    document.getElementById("renewPrincipal").textContent = formatMoney(renewal.principal);
    document.getElementById("renewInterest").textContent = formatMoney(renewal.interest);
    document.getElementById("renewDueDate").textContent = formatDate(renewal.dueDate);
    renewAutoSection.hidden = false;
    renewManualSection.hidden = true;
  } else {
    document.getElementById("renewPrincipalInput").value = "";
    document.getElementById("renewInterestInput").value = "";
    document.getElementById("renewStartDateInput").valueAsDate = new Date();
    renewAutoSection.hidden = true;
    renewManualSection.hidden = false;
  }

  renewCard.hidden = false;
});

document.getElementById("cancelRenewBtn").addEventListener("click", () => {
  renewCard.hidden = true;
});

document.getElementById("confirmRenewBtn").addEventListener("click", async (e) => {
  const btn = e.currentTarget;
  showError(renewError, "");

  const remaining = remainingPayable(client, payments);
  let renewal;
  if (remaining > 0) {
    renewal = computeRenewal(remaining);
  } else {
    const principal = Number(document.getElementById("renewPrincipalInput").value);
    const interest = Number(document.getElementById("renewInterestInput").value);
    const startDate = document.getElementById("renewStartDateInput").value;
    if (principal <= 0 || interest < 0 || !startDate) {
      showError(renewError, "Please fill in every field with valid values.");
      return;
    }
    const { totalPayable, dailyDue, dueDate } = computeLoan({ principal, interest, startDate });
    renewal = { principal, interest, totalPayable, dailyDue, startDate, dueDate };
  }

  btn.disabled = true;
  try {
    const previousCycles = [
      ...(client.previousCycles || []),
      {
        principal: client.principal,
        interest: client.interest,
        totalPayable: client.totalPayable,
        startDate: client.startDate,
        dueDate: client.dueDate,
        renewedAt: todayStr(),
      },
    ];
    await updateDoc(clientRef, {
      principal: renewal.principal,
      interest: renewal.interest,
      totalPayable: renewal.totalPayable,
      dailyDue: renewal.dailyDue,
      startDate: renewal.startDate,
      dueDate: renewal.dueDate,
      cycle: (client.cycle || 0) + 1,
      previousCycles,
      penaltyApplied: false,
    });
    renewCard.hidden = true;
    await loadClient();
  } catch (err) {
    btn.disabled = false;
    showError(renewError, "Could not renew this loan. Please try again.");
  }
});

deleteBtn.addEventListener("click", async () => {
  if (!window.confirm(`Delete ${client.name}'s record permanently? This cannot be undone.`)) {
    return;
  }
  deleteBtn.disabled = true;
  try {
    const paymentsSnap = await getDocs(collection(db, "clients", clientId, "payments"));
    await Promise.all(paymentsSnap.docs.map((d) => deleteDoc(d.ref)));
    await deleteDoc(clientRef);
    window.location.href = "dashboard.html";
  } catch (err) {
    deleteBtn.disabled = false;
    showError(pageError, "Could not delete this client. Please try again.");
  }
});

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
      status: "approved",
      source: "lender",
      cycle: client.cycle ?? 0,
      createdAt: serverTimestamp(),
      approvedAt: serverTimestamp(),
    });
    paymentForm.reset();
    document.getElementById("payDate").valueAsDate = new Date();
    await loadClient();
  } catch (err) {
    showError(formError, "Could not record this payment. Please try again.");
  }
});
