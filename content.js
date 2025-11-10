async function safeSendMessage(msg) {
  return new Promise(resolve => {
    try {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          // ignore: extension context invalidated or receiver not available
          resolve(null);
          return;
        }
        resolve(resp);
      });
    } catch (e) {
      // Extension context gone — ignore
      resolve(null);
    }
  });
}


// ==============================================================
// ✅ LOGIN CAPTURE LOGIC (UPDATED TO STORE loginUrl ONLY)
// ==============================================================

let lastLoginData = null;
let typedUsername = false;
let typedPassword = false;

function watchInputs() {
  const pass = document.querySelector('input[type="password"]');
  if (!pass) return;

  const form = pass.form;
  const user = form?.querySelector(
    'input[type="email"],' +
    'input[name*="user"], input[id*="user"],' +
    'input[name*="login"], input[id*="login"],' +
    'input[name*="email"], input[id*="email"],' +
    'input[name*="username"], input[id*="username"]'
  );

  function capture() {
    lastLoginData = {
      loginUrl: location.href,
      username: user?.value?.trim() || "",
      password: pass.value
    };
  }

  pass.addEventListener("keydown", () => (typedPassword = true), true);
  user?.addEventListener("keydown", () => (typedUsername = true), true);

  pass.addEventListener("input", capture, true);
  user?.addEventListener("input", capture, true);
}

function shouldSave() {
  return lastLoginData?.password && typedPassword;
}

document.addEventListener(
  "submit",
  () => {
    if (shouldSave()) safeSendMessage({ action: "capturedLogin", data: lastLoginData });

    lastLoginData = null;
    typedPassword = false;
    typedUsername = false;
  },
  true
);

document.addEventListener(
  "click",
  (e) => {
    if (!e.target.closest("button, input[type=submit]")) return;

    setTimeout(() => {
      if (shouldSave()) safeSendMessage({ action: "capturedLogin", data: lastLoginData });

      lastLoginData = null;
      typedPassword = false;
      typedUsername = false;
    }, 150);
  },
  true
);

new MutationObserver(watchInputs).observe(document, { childList: true, subtree: true });
watchInputs();

// ==============================================================
// ✅ ✅ ONE-TIME SHARE AUTOFILL (FIXED + RETRY + CONFIRM)
// ==============================================================

(async function handleSharedCredential() {
  // Retry wrapper — fixes the timing issue
  async function getSharedCredWithRetry(totalMs = 8000, intervalMs = 300) {
    const end = Date.now() + totalMs;

    while (Date.now() < end) {
      const cred = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: "REQUEST_SHARED_CRED" }, (resp) => {
          if (chrome.runtime.lastError) return resolve(null);
          resolve(resp?.cred ?? null);
        });
      });

      if (cred) return cred;
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    return null;
  }

  const cred = await getSharedCredWithRetry();
  if (!cred) return; // Background didn't provide anything

  // ---------- Utility helpers ----------

  const isVisible = (el) => {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden";
  };

  const findPasswordField = () => {
    const pw = [...document.querySelectorAll('input[type="password"]')];
    return pw.find(isVisible) || pw[0] || null;
  };

  const findUsernameField = (form) => {
    const selectors = [
      'input[autocomplete="username"]',
      'input[type="email"]',
      'input[name="username"]',
      'input[name="email"]',
      'input[id*="user"]',
      'input[name*="user"]',
      'input[id*="login"]',
      'input[name*="login"]'
    ];

    for (const sel of selectors) {
      const el = form.querySelector(sel);
      if (el && isVisible(el)) return el;
    }

    return [...form.querySelectorAll("input")].find((i) => {
      const t = (i.type || "").toLowerCase();
      return ["text", "email", "tel"].includes(t) && isVisible(i);
    });
  };

  const fillField = (el, value) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  function attemptFill() {
    const pass = findPasswordField();
    if (!pass) return false;

    const form = pass.form || pass.closest("form") || document;
    const user = findUsernameField(form);

    // ✅ Host match using loginUrl
    try {
      const targetHost = new URL(cred.loginUrl).hostname.toLowerCase();
      const currentHost = location.hostname.toLowerCase();
      if (!currentHost.includes(targetHost)) return false;
    } catch (e) {}

    if (user) fillField(user, cred.username || "");
    fillField(pass, cred.password || "");

    return true;
  }

  // ---------- Poll for fields first ----------
  const MAX_WAIT = 12000;
  const POLL_INTERVAL = 300;
  const start = Date.now();

  let filled = false;

  while (Date.now() - start < MAX_WAIT) {
    if (attemptFill()) {
      filled = true;
      break;
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }

  // ---------- MutationObserver fallback ----------
  if (!filled) {
    await new Promise((resolve) => {
      const obs = new MutationObserver(() => {
        if (attemptFill()) {
          obs.disconnect();
          resolve();
        }
      });

      obs.observe(document, { childList: true, subtree: true });

      setTimeout(() => {
        obs.disconnect();
        resolve();
      }, 8000);
    });
  }

  // ✅ Tell background: “I used the one-time credential, wipe it”
  chrome.runtime.sendMessage({ action: "SHARE_CRED_USED" }, () => {});
})();
