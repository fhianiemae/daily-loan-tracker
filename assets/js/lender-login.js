import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  doc,
  setDoc,
  serverTimestamp,
} from "./firebase-init.js";
import { showError } from "./utils.js";

const tabLogin = document.getElementById("tabLogin");
const tabSignup = document.getElementById("tabSignup");
const loginForm = document.getElementById("loginForm");
const signupForm = document.getElementById("signupForm");
const formError = document.getElementById("formError");

function showTab(tab) {
  const isLogin = tab === "login";
  tabLogin.classList.toggle("active", isLogin);
  tabSignup.classList.toggle("active", !isLogin);
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  showError(formError, "");
}
tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));

// Only auto-redirect on the initial (page-load) auth check. Later auth state
// changes are caused by createUserWithEmailAndPassword() during signup below,
// which must finish writing the lenders/{uid} profile doc before we navigate.
let initialAuthChecked = false;
onAuthStateChanged(auth, (user) => {
  if (initialAuthChecked) return;
  initialAuthChecked = true;
  if (user) window.location.href = "dashboard.html";
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value;
  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = "dashboard.html";
  } catch (err) {
    showError(formError, "Could not log in. Check your email and password.");
  }
});

signupForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  showError(formError, "");
  const email = document.getElementById("signupEmail").value.trim();
  const password = document.getElementById("signupPassword").value;
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await setDoc(doc(db, "lenders", cred.user.uid), {
      email,
      createdAt: serverTimestamp(),
    });
    window.location.href = "dashboard.html";
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      showError(formError, "An account with that email already exists. Try logging in instead.");
    } else if (err.code === "auth/weak-password") {
      showError(formError, "Password must be at least 6 characters.");
    } else {
      showError(formError, "Could not create account. Please try again.");
    }
  }
});
