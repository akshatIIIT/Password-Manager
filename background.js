// const SHARE_API = "https://share.example/v1";

// function extractDisplayHost(loginUrl) {
//   try {
//     const u = new URL(loginUrl);
//     return u.hostname + u.pathname; // e.g. github.com/login
//   } catch {
//     return loginUrl;
//   }
// }


// // ✅ Load decrypted vault only from session cache
// async function getVaultCache() {
//   const { vaultCache } = await chrome.storage.session.get("vaultCache");
//   return vaultCache ? JSON.parse(vaultCache) : null;
// }

// // ✅ Build right-click menu from session vault data
// async function rebuildVaultMenu() {
//   chrome.contextMenus.removeAll();

//   chrome.contextMenus.create({
//     id: "autofillVault",
//     title: "Autofill from Vault",
//     contexts: ["editable"]
//   });

//   const vault = await getVaultCache();

//   if (!vault) {
//     chrome.contextMenus.create({
//       id: "locked",
//       parentId: "autofillVault",
//       title: "🔒 Unlock vault first",
//       enabled: false,
//       contexts: ["editable"]
//     });
//     return;
//   }

//   for (const folder of Object.keys(vault.folders ?? {})) {
//     const folderId = `f:${folder}`;

//     chrome.contextMenus.create({
//       id: folderId,
//       parentId: "autofillVault",
//       title: `📁 ${folder}`,
//       contexts: ["editable"]
//     });

//     const items = vault.folders?.[folder] ?? [];

//     if (items.length === 0) {
//       chrome.contextMenus.create({
//         id: `${folderId}:empty`,
//         parentId: folderId,
//         title: "(Empty)",
//         enabled: false,
//         contexts: ["editable"]
//       });
//       continue;
//     }

//     items.forEach((entry, i) => {
//       const label = extractDisplayHost(entry.loginUrl || entry.site || "Unknown");

//       chrome.contextMenus.create({
//         id: `${folderId}:${i}`,
//         parentId: folderId,
//         title: `${label} (${entry.username})`,
//         contexts: ["editable"]
//       });
//     });
//   }
// }


// // ✅ Autofill only password
// chrome.contextMenus.onClicked.addListener(async (info, tab) => {
//   const [prefix, folder, index] = info.menuItemId.split(":");
//   if (prefix !== "f" || !folder || index === undefined) return;

//   const vault = await getVaultCache();
//   const entry = vault?.folders?.[folder]?.[index];
//   if (!entry) return;

//   chrome.scripting.executeScript({
//     target: { tabId: tab.id },
//     func: (password) => {
//       const f = document.activeElement?.form;
//       if (!f) return;

//       const pf = f.querySelector('input[type="password"]');
//       if (pf) {
//         pf.value = password;
//         pf.dispatchEvent(new Event("input", { bubbles: true }));
//       }
//     },
//     args: [entry.password]
//   });
// });

// // ✅ Receive login capture event
// chrome.runtime.onMessage.addListener(async (msg) => {
//   if (msg.action === "capturedLogin") {
//     const newLogin = msg.data;

//     // Load vault from session storage
//     const { vaultCache } = await chrome.storage.session.get("vaultCache");
//     const vault = vaultCache ? JSON.parse(vaultCache) : null;

//     // If no vault unlocked → just show popup
//     if (!vault) {
//       await chrome.storage.session.set({ pendingSave: newLogin });
//       chrome.windows.create({
//         url: chrome.runtime.getURL("save_prompt.html"),
//         type: "popup",
//         width: 350,
//         height: 330
//       });
//       return true;
//     }

//     // ✅ Search for existing login
//     let existing;
//     for (const folder of Object.keys(vault.folders ?? {})) {
//       existing = vault.folders[folder]?.find(
//         e =>
//           e.site.toLowerCase() === newLogin.site.toLowerCase() &&
//           e.username.toLowerCase() === newLogin.username.toLowerCase()
//       );
//       if (existing) break;
//     }

//     // ✅ If password unchanged → ignore
//     if (existing && existing.password === newLogin.password) {
//       return true;
//     }

//     // ✅ New login or changed password
//     await chrome.storage.session.set({ pendingSave: newLogin });

//     chrome.windows.create({
//       url: chrome.runtime.getURL("save_prompt.html"),
//       type: "popup",
//       width: 350,
//       height: 330
//     });

//     return true;
//   }

//   if (msg.action === "rebuildMenus") {
//     rebuildVaultMenu();
//   }
// });

// // ✅ Build menus on install/startup
// chrome.runtime.onInstalled.addListener(rebuildVaultMenu);
// chrome.runtime.onStartup.addListener(rebuildVaultMenu);


// // ========================================================
// // ✅ ONE-TIME SHARE REDEMPTION LOGIC
// // ========================================================

// let incomingSharedCred = null;

// // Storage key to track redeemed tokens
// const REDEEM_DB = "redeemedTokens";

// // --- Helper to decode base64 to Uint8Array ---
// function b64ToBytes(str) {
//   return new Uint8Array([...atob(str)].map(c => c.charCodeAt(0)));
// }

// // --- AES Decrypt Shared Payload ---
// async function decryptSharedPayload(dataB64, ivB64, keyB64) {
//   const keyBytes = b64ToBytes(keyB64);
//   const iv = b64ToBytes(ivB64);
//   const ciphertext = b64ToBytes(dataB64);

//   const key = await crypto.subtle.importKey(
//     "raw",
//     keyBytes,
//     "AES-GCM",
//     false,
//     ["decrypt"]
//   );

//   const plaintext = await crypto.subtle.decrypt(
//     { name: "AES-GCM", iv },
//     key,
//     ciphertext
//   );

//   const json = JSON.parse(new TextDecoder().decode(plaintext));

//   if (Date.now() > json.expires) {
//     throw new Error("⏰ Shared password link has expired");
//   }

//   return json;
// }

// // Load redeemed token database
// async function loadRedeemedTokens() {
//   const data = await chrome.storage.local.get(REDEEM_DB);
//   return data[REDEEM_DB] || {};
// }

// // Save redeemed token database
// async function saveRedeemedTokens(db) {
//   await chrome.storage.local.set({ [REDEEM_DB]: db });
// }

// // Handle share redemption
// chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
//   if (msg.action === "REDEEM_SHARE") {
//     (async () => {
//       const { token, data, iv, key } = msg;

//       if (!token) {
//         sendResponse({ ok: false, error: "Invalid token" });
//         return;
//       }

//       // ✅ 1. Check if already redeemed
//       const redeemed = await loadRedeemedTokens();
//       if (redeemed[token]) {
//         sendResponse({
//           ok: false,
//           error: "❌ This one-time link has already been used"
//         });
//         return;
//       }

//       try {
//         // ✅ 2. Decrypt shared payload
//         incomingSharedCred = await decryptSharedPayload(data, iv, key);

//         // ✅ 3. Mark token as redeemed forever
//         redeemed[token] = Date.now();
//         await saveRedeemedTokens(redeemed);

//         // ✅ 4. Redirect to login URL
//         const loginUrl = incomingSharedCred.loginUrl;
//         if (!loginUrl) throw new Error("Missing loginUrl in shared token");

//         chrome.tabs.create({ url: loginUrl });

//         // ✅ 5. Auto-wipe credentials after 2 minutes
//         setTimeout(() => { incomingSharedCred = null; }, 120000);

//         sendResponse({ ok: true });

//       } catch (err) {
//         console.error(err);
//         sendResponse({ ok: false, error: err.message });
//       }
//     })();

//     return true;
//   }

//   if (msg.action === "REQUEST_SHARED_CRED") {

//     if (!incomingSharedCred) {
//       sendResponse({ cred: null });
//       return true;
//     }

//     const cred = incomingSharedCred;
//     incomingSharedCred = null; // wipe immediately

//     sendResponse({ cred });
//     return true;
//   }

//   // ✅ Wipe shared credential after content.js finishes autofilling
//   if (msg.action === "SHARE_CRED_USED") {
//     console.log("✅ One-time credential consumed. Clearing memory.");
//     incomingSharedCred = null;
//     sendResponse({ ok: true });
//   }

//   if (msg.action === "CREATE_SHARE_LINK") {
//     (async () => {
//       try {
//         const entryId = msg.entryId;

//         // Token used to authenticate extension → server
//         const { authToken } = await chrome.storage.local.get("authToken");
//         if (!authToken) {
//           sendResponse({ ok: false, error: "Not logged in" });
//           return;
//         }

//         const resp = await fetch(`${SHARE_API}/createShare`, {
//           method: "POST",
//           headers: {
//             "Content-Type": "application/json",
//             "Authorization": `Bearer ${authToken}`
//           },
//           body: JSON.stringify({ entryId })
//         });

//         const data = await resp.json().catch(() => ({}));

//         if (!resp.ok) {
//           sendResponse({
//             ok: false,
//             error: data.error || "Server error"
//           });
//           return;
//         }

//         sendResponse({
//           ok: true,
//           shareUrl: data.shareUrl
//         });

//       } catch (err) {
//         sendResponse({ ok: false, error: err.message });
//       }
//     })();

//     return true;
//   }
// });


// ========================================================
// Config / Globals
// ========================================================

const SHARE_API = "http://192.168.2.247:8443";
let incomingSharedCred = null;

// ========================================================
// Helpers
// ========================================================

function extractDisplayHost(loginUrlOrSite) {
  try {
    const u = new URL(loginUrlOrSite);
    return u.hostname + u.pathname;
  } catch {
    return loginUrlOrSite || "Unknown";
  }
}

async function getVaultCache() {
  const { vaultCache } = await chrome.storage.session.get("vaultCache");
  return vaultCache ? JSON.parse(vaultCache) : null;
}

function generateStrongPassword(length = 16) {
  const charset =
    "abcdefghijklmnopqrstuvwxyz" +
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ" +
    "0123456789" +
    "!@#$%^&*()-_=+[]{};:,.<>/?";

  let password = "";
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  for (let i = 0; i < length; i++) {
    password += charset[array[i] % charset.length];
  }

  return password;
}


// ========================================================
// ✅ RIGHT-CLICK MENU (final version)
// ========================================================

async function rebuildVaultMenu() {
  await chrome.contextMenus.removeAll();

  chrome.contextMenus.create({
    id: "autofillVault",
    title: "Autofill from Vault",
    contexts: ["editable"]
  });

  const vault = await getVaultCache();

  if (!vault) {
    chrome.contextMenus.create({
      id: "locked",
      parentId: "autofillVault",
      title: "🔒 Unlock vault first",
      enabled: false,
      contexts: ["editable"]
    });
    return;
  }

  chrome.contextMenus.create({
    id: "suggestPassword",
    title: "🔐 Suggest Strong Password",
    contexts: ["editable"]
  });

  for (const folder of Object.keys(vault.folders ?? {})) {
    const folderId = `f:${folder}`;

    chrome.contextMenus.create({
      id: folderId,
      parentId: "autofillVault",
      title: `📁 ${folder}`,
      contexts: ["editable"]
    });

    const entries = vault.folders?.[folder] ?? [];
    if (!entries.length) {
      chrome.contextMenus.create({
        id: `${folderId}:empty`,
        parentId: folderId,
        title: "(Empty)",
        enabled: false,
        contexts: ["editable"]
      });
      continue;
    }

    entries.forEach((entry, i) => {
      chrome.contextMenus.create({
        id: `${folderId}:${i}`,
        parentId: folderId,
        title: `${extractDisplayHost(entry.loginUrl || entry.site)} (${entry.username})`,
        contexts: ["editable"]
      });
    });
  }
}

chrome.runtime.onInstalled.addListener(rebuildVaultMenu);
chrome.runtime.onStartup.addListener(rebuildVaultMenu);


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // 1️⃣ Handle "Suggest Password"
  if (info.menuItemId === "suggestPassword") {
    const newPass = generateStrongPassword(16);

    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (pw) => {
        const el = document.activeElement;
        if (!el || el.type !== "password") return;

        el.value = pw;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));

        // 🔥 Make password visible temporarily
        const originalType = el.type;
        el.type = "text";

        // Hide again after 4 seconds
        setTimeout(() => {
          el.type = originalType;
        }, 4000);
      },
      args: [newPass]
    });

    return;
  }

  // 2️⃣ Existing vault autofill logic below:
  const [prefix, folder, index] = info.menuItemId.split(":");
  if (prefix !== "f" || index === undefined) return;

  const vault = await getVaultCache();
  const entry = vault?.folders?.[folder]?.[Number(index)];
  if (!entry) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (password) => {
      const f = document.activeElement?.form || document.activeElement?.closest?.("form");
      if (!f) return;
      const pf = f.querySelector('input[type="password"]');
      if (!pf) return;

      pf.value = password;
      pf.dispatchEvent(new Event("input", { bubbles: true }));
      pf.dispatchEvent(new Event("change", { bubbles: true }));
    },
    args: [entry.password]
  });
});


// ========================================================
// ✅ LOGIN CAPTURE
// ========================================================

chrome.runtime.onMessage.addListener(async (msg, sender, sendResponse) => {
  if (msg.action !== "capturedLogin") return;

  const newLogin = msg.data;
  const vaultStr = (await chrome.storage.session.get("vaultCache")).vaultCache;
  const vault = vaultStr ? JSON.parse(vaultStr) : null;

  if (!vault) {
    await chrome.storage.session.set({ pendingSave: newLogin });
    chrome.windows.create({
      url: chrome.runtime.getURL("save_prompt.html"),
      type: "popup",
      width: 350,
      height: 330
    });
    return true;
  }

  let exists = false;
  for (const folder of Object.keys(vault.folders ?? {})) {
    const match = vault.folders[folder]?.find(e =>
      (e.site ?? "").toLowerCase() === (newLogin.site ?? "").toLowerCase() &&
      (e.username ?? "").toLowerCase() === (newLogin.username ?? "").toLowerCase() &&
      (e.password ?? "") === (newLogin.password ?? "")
    );
    if (match) {
      exists = true;
      break;
    }
  }

  if (exists) return true;

  await chrome.storage.session.set({ pendingSave: newLogin });
  chrome.windows.create({
    url: chrome.runtime.getURL("save_prompt.html"),
    type: "popup",
    width: 350,
    height: 330
  });

  return true;
});

// UI → rebuild menu
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "rebuildMenus") rebuildVaultMenu();
});

// ========================================================
// ✅ SHARE → SERVER
// ========================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "CREATE_SHARE_LINK") return;

  (async () => {
    try {
      const resp = await fetch(`${SHARE_API}/v1/createShare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg.entry)
      });
      const data = await resp.json().catch(() => ({}));

      sendResponse(data.ok ? {
        ok: true,
        shareUrl: data.shareUrl
      } : {
        ok: false,
        error: data.error
      });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true;
});

// ========================================================
// ✅ REDEEM SHARE TOKEN (server-based)
// ========================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "REDEEM_SHARE") return;

  const token = msg.token;
  if (!token) {
    sendResponse({ ok: false, error: "Missing token" });
    return true;
  }

  (async () => {
    try {
      const r = await fetch(`${SHARE_API}/v1/redeem/${token}`);
      const data = await r.json().catch(() => ({}));

      if (!data.ok) {
        sendResponse({ ok: false, error: data.error });
        return;
      }

      incomingSharedCred = {
        loginUrl: data.loginUrl,
        username: data.username,
        password: data.password
      };

      chrome.tabs.create({ url: data.loginUrl });

      sendResponse({ ok: true });

      // wipe after 2 min
      setTimeout(() => incomingSharedCred = null, 120000);

    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();

  return true;
});

// ========================================================
// ✅ CONTENT → REQUEST_SHARED_CRED
// ========================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "REQUEST_SHARED_CRED") return;

  sendResponse({ cred: incomingSharedCred });
  incomingSharedCred = null;
});

// ========================================================
// ✅ SHARE_CRED_USED
// ========================================================

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action !== "SHARE_CRED_USED") return;

  incomingSharedCred = null;
  sendResponse({ ok: true });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "PING_FROM_LANDING") {
    sendResponse({ ok: true });
  }
});






