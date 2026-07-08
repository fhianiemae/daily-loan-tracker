# Daily Payment Loan Tracker

A static site for tracking 30-day daily-payment loans, with separate lender
and client dashboards. Lenders register clients and approve payments;
clients log daily payments and track their remaining balance. Data is shared
between both sides through Firebase (Auth + Firestore), so the site can be
hosted as plain static files on GitHub Pages.

## How it works

- **Lender**: creates an account with email + password, registers a client
  (name, principal, interest, start date), and gets a one-time 6-character
  activation code to hand to that client.
- **Client**: enters the activation code once to set up a username + 4-digit
  PIN. From then on they log in with just the username and PIN.
- **Payments**: a client logs a payment as *pending*; it only counts against
  their remaining balance once the lender approves it from the client's
  detail page.
- **Due date reminder**: the client dashboard shows a warning banner starting
  7 days before the due date, and an overdue banner after it passes.

## One-time setup: Firebase project

The site needs a free Firebase project for auth + database. This only needs
to be done once.

1. Go to the [Firebase console](https://console.firebase.google.com/) and
   create a new project.
2. **Authentication** → *Get started* → enable the **Email/Password**
   sign-in provider. (Both lenders and clients use Firebase Auth under the
   hood — client usernames/PINs are mapped to synthetic email/password pairs
   internally, see `assets/js/utils.js`.)
3. **Firestore Database** → *Create database* → start in production mode,
   pick a region.
4. In the Firestore **Rules** tab, paste the contents of
   [`firestore.rules`](firestore.rules) from this repo and publish.
5. Go to **Project settings** → *General* → scroll to "Your apps" → add a
   **Web app** (the `</>` icon). Copy the `firebaseConfig` object it gives
   you.
6. Paste those values into
   [`assets/js/firebase-config.js`](assets/js/firebase-config.js), replacing
   the `REPLACE_ME` placeholders.

The first time each page runs a new compound query, Firestore may log a
"query requires an index" error in the browser console with a link — click
that link to auto-create the index in one step. This is expected and only
needs to happen once per query shape.

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages**.
3. Under "Build and deployment", set **Source** to "Deploy from a branch",
   pick the `main` branch and `/ (root)` folder, then save.
4. GitHub will publish the site at
   `https://<your-username>.github.io/<repo-name>/`. It can take a minute or
   two the first time.

Because this is a fully static site (no build step), any push to `main`
updates the live site automatically.

## Local preview

Open `index.html` directly, or serve the folder locally, e.g.:

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Project structure

```
index.html                       Landing page (choose lender or client)
lender/login.html                Lender sign up / log in
lender/register-client.html      Register a new client, get activation code
lender/dashboard.html            List of clients
lender/client-detail.html        Loan summary + payment history + approvals
client/login.html                Client activate account / log in
client/dashboard.html            Loan summary + log payment + due reminder
assets/js/firebase-config.js     Your Firebase project keys (fill this in)
assets/js/firebase-init.js       Firebase SDK setup, shared exports
assets/js/utils.js               Loan math, formatting, username/PIN mapping
firestore.rules                  Firestore security rules
```
