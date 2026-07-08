import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  query,
  where,
  orderBy,
  getDocs,
} from "./firebase-init.js";
import { daysUntil, formatDate, showError } from "./utils.js";

const clientList = document.getElementById("clientList");
const listCard = document.getElementById("listCard");
const emptyState = document.getElementById("emptyState");
const pageError = document.getElementById("pageError");
const logoutBtn = document.getElementById("logoutBtn");

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  loadClients(user.uid).catch((err) => {
    console.error(err);
    showError(pageError, "Could not load your clients. Please refresh and try again.");
  });
});

function statusBadge(client) {
  if (client.status === "pending-link") {
    return `<span class="badge awaiting">Awaiting activation</span>`;
  }
  const diff = daysUntil(client.dueDate);
  if (diff < 0) return `<span class="badge overdue">Overdue</span>`;
  if (diff <= 7) return `<span class="badge due-soon">Due in ${diff}d</span>`;
  return `<span class="badge on-track">On track</span>`;
}

async function pendingCount(clientId) {
  const q = query(
    collection(db, "clients", clientId, "payments"),
    where("status", "==", "pending")
  );
  const snap = await getDocs(q);
  return snap.size;
}

async function loadClients(uid) {
  const q = query(
    collection(db, "clients"),
    where("lenderId", "==", uid),
    orderBy("createdAt", "desc")
  );
  const snap = await getDocs(q);

  if (snap.empty) {
    emptyState.hidden = false;
    listCard.hidden = true;
    return;
  }

  const rows = await Promise.all(
    snap.docs.map(async (d) => {
      const client = d.data();
      const pending = client.status === "pending-link" ? 0 : await pendingCount(d.id);
      return { id: d.id, client, pending };
    })
  );

  clientList.innerHTML = rows
    .map(
      ({ id, client, pending }) => `
      <li>
        <a href="client-detail.html?id=${id}">
          <span>
            <strong>${escapeHtml(client.name)}</strong>
            <span class="muted"> &middot; due ${formatDate(client.dueDate)}</span>
          </span>
          <span class="row-actions">
            ${pending > 0 ? `<span class="badge pending">${pending} pending</span>` : ""}
            ${statusBadge(client)}
          </span>
        </a>
      </li>`
    )
    .join("");

  listCard.hidden = false;
  emptyState.hidden = true;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
