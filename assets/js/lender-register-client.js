import {
  auth,
  db,
  onAuthStateChanged,
  signOut,
  collection,
  addDoc,
  serverTimestamp,
} from "./firebase-init.js";
import { computeLoan, generateClientCode, showError } from "./utils.js";

const logoutBtn = document.getElementById("logoutBtn");
logoutBtn.addEventListener("click", () => signOut(auth));

let currentUid = null;
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }
  currentUid = user.uid;
});

document.getElementById("startDate").valueAsDate = new Date();

const formError = document.getElementById("formError");
const registerForm = document.getElementById("registerForm");
const formCard = document.getElementById("formCard");
const successCard = document.getElementById("successCard");

registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");

  const name = document.getElementById("name").value.trim();
  const principal = Number(document.getElementById("principal").value);
  const interest = Number(document.getElementById("interest").value);
  const startDate = document.getElementById("startDate").value;

  if (!name || principal <= 0 || interest < 0 || !startDate) {
    showError(formError, "Please fill in every field with valid values.");
    return;
  }

  const { totalPayable, dailyDue, dueDate } = computeLoan({ principal, interest, startDate });
  const code = generateClientCode();

  try {
    await addDoc(collection(db, "clients"), {
      lenderId: currentUid,
      name,
      principal,
      interest,
      startDate,
      dueDate,
      totalPayable,
      dailyDue,
      code,
      status: "pending-link",
      authUid: null,
      username: null,
      cycle: 0,
      previousCycles: [],
      penaltyApplied: false,
      createdAt: serverTimestamp(),
    });

    document.getElementById("clientNameOut").textContent = name;
    document.getElementById("codeOut").textContent = code;
    formCard.hidden = true;
    successCard.hidden = false;
  } catch (err) {
    showError(formError, "Could not register client. Please try again.");
  }
});

document.getElementById("registerAnotherBtn").addEventListener("click", () => {
  registerForm.reset();
  document.getElementById("startDate").valueAsDate = new Date();
  successCard.hidden = true;
  formCard.hidden = false;
});
