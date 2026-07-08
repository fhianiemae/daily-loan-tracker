import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  collection,
  query,
  where,
  limit,
  getDocs,
  doc,
  updateDoc,
} from "./firebase-init.js";
import { usernameToEmail, pinToPassword, showError } from "./utils.js";

const tabLogin = document.getElementById("tabLogin");
const tabActivate = document.getElementById("tabActivate");
const loginForm = document.getElementById("loginForm");
const activateForm = document.getElementById("activateForm");
const formError = document.getElementById("formError");

function showTab(tab) {
  const isLogin = tab === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabActivate.classList.toggle("active", !isLogin);
  loginForm.hidden = !isLogin;
  activateForm.hidden = isLogin;
  showError(formError, "");
}
tabLogin.addEventListener("click", () => showTab("login"));
tabActivate.addEventListener("click", () => showTab("activate"));

// Only auto-redirect on the initial (page-load) auth check, i.e. an
// already-logged-in visitor landing here. Ignore later auth state changes
// caused by createUserWithEmailAndPassword() during activation below, which
// must finish linking the loan record before we navigate away.
let initialAuthChecked = false;
onAuthStateChanged(auth, (user) => {
  if (initialAuthChecked) return;
  initialAuthChecked = true;
  if (user) window.location.href = "dashboard.html";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");
  const username = document.getElementById("loginUsername").value.trim();
  const pin = document.getElementById("loginPin").value;
  try {
    await signInWithEmailAndPassword(auth, usernameToEmail(username), pinToPassword(pin));
    window.location.href = "dashboard.html";
  } catch (err) {
    showError(formError, "Incorrect username or PIN.");
  }
});

activateForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");

  const code = document.getElementById("activateCode").value.trim().toUpperCase();
  const username = document.getElementById("newUsername").value.trim();
  const pin = document.getElementById("newPin").value;

  if (!/^[0-9]{4}$/.test(pin)) {
    showError(formError, "PIN must be exactly 4 digits.");
    return;
  }

  let cred;
  try {
    // Create (and sign in as) the Firebase Auth account first: Firestore's
    // security rules require an authenticated request before we can look up
    // the activation code.
    cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), pinToPassword(pin));
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      showError(formError, "That username is already taken.");
    } else if (err.code === "auth/weak-password") {
      showError(formError, "Choose a different PIN.");
    } else {
      showError(formError, "Could not activate account. Please try again.");
    }
    return;
  }

  try {
    const q = query(
      collection(db, "clients"),
      where("code", "==", code),
      where("status", "==", "pending-link"),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      showError(formError, "Invalid or already-used activation code.");
      await deleteUser(cred.user);
      return;
    }
    const clientId = snap.docs[0].id;

    await updateDoc(doc(db, "clients", clientId), {
      authUid: cred.user.uid,
      username,
      status: "active",
    });

    window.location.href = "dashboard.html";
  } catch (err) {
    showError(formError, "Could not activate account. Please try again.");
    await deleteUser(cred.user).catch(() => {});
  }
});
