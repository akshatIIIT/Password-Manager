const SHARE_API = "https://share.example/v1";

function extractDisplayHost(loginUrl) {
  try {
    const u = new URL(loginUrl);
    return u.hostname + u.pathname; // e.g. github.com/login
  } catch {
    return loginUrl;
  }
}


// ✅ Load decrypted vault only from session cache
async function getVaultCache() {
  const { vaultCache } = await chrome.storage.session.get("vaultCache");
  return vaultCache ? JSON.parse(vaultCache) : null;
}

// ✅ Build right-click menu from session vault data
async function rebuildVaultMenu() {
  chrome.contextMenus.removeAll();

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

  for (const folder of Object.keys(vault.folders ?? {})) {
    const folderId = `f:${folder}`;

    chrome.contextMenus.create({
      id: folderId,
      parentId: "autofillVault",
      title: `📁 ${folder}`,
      contexts: ["editable"]
    });

    const items = vault.folders?.[folder] ?? [];

    if (items.length === 0) {
      chrome.contextMenus.create({
        id: `${folderId}:empty`,
        parentId: folderId,
        title: "(Empty)",
        enabled: false,
        contexts: ["editable"]
      });
      continue;
    }

    items.forEach((entry, i) => {
      const label = extractDisplayHost(entry.loginUrl || entry.site || "Unknown");

      chrome.contextMenus.create({
        id: `${folderId}:${i}`,
        parentId: folderId,
        title: `${label} (${entry.username})`,
        contexts: ["editable"]
      });
    });
  }
}


// ✅ Autofill only password
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const [prefix, folder, index] = info.menuItemId.split(":");
  if (prefix !== "f" || !folder || index === undefined) return;

  const vault = await getVaultCache();
  const entry = vault?.folders?.[folder]?.[index];
  if (!entry) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (password) => {
      const f = document.activeElement?.form;
      if (!f) return;

      const pf = f.querySelector('input[type="password"]');
      if (pf) {
        pf.value = password;
        pf.dispatchEvent(new Event("input", { bubbles: true }));
      }
    },
    args: [entry.password]
  });
});

// ✅ Receive login capture event
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg.action === "capturedLogin") {
    const newLogin = msg.data;

    // Load vault from session storage
    const { vaultCache } = await chrome.storage.session.get("vaultCache");
    const vault = vaultCache ? JSON.parse(vaultCache) : null;

    // If no vault unlocked → just show popup
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

    // ✅ Search for existing login
    let existing;
    for (const folder of Object.keys(vault.folders ?? {})) {
      existing = vault.folders[folder]?.find(
        e =>
          e.site.toLowerCase() === newLogin.site.toLowerCase() &&
          e.username.toLowerCase() === newLogin.username.toLowerCase()
      );
      if (existing) break;
    }

    // ✅ If password unchanged → ignore
    if (existing && existing.password === newLogin.password) {
      return true;
    }

    // ✅ New login or changed password
    await chrome.storage.session.set({ pendingSave: newLogin });

    chrome.windows.create({
      url: chrome.runtime.getURL("save_prompt.html"),
      type: "popup",
      width: 350,
      height: 330
    });

    return true;
  }

  if (msg.action === "rebuildMenus") {
    rebuildVaultMenu();
  }
});

// ✅ Build menus on install/startup
chrome.runtime.onInstalled.addListener(rebuildVaultMenu);
chrome.runtime.onStartup.addListener(rebuildVaultMenu);


// ========================================================
// ✅ ONE-TIME SHARE REDEMPTION LOGIC
// ========================================================

let incomingSharedCred = null;

// Storage key to track redeemed tokens
const REDEEM_DB = "redeemedTokens";

// --- Helper to decode base64 to Uint8Array ---
function b64ToBytes(str) {
  return new Uint8Array([...atob(str)].map(c => c.charCodeAt(0)));
}

// --- AES Decrypt Shared Payload ---
async function decryptSharedPayload(dataB64, ivB64, keyB64) {
  const keyBytes = b64ToBytes(keyB64);
  const iv = b64ToBytes(ivB64);
  const ciphertext = b64ToBytes(dataB64);

  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["decrypt"]
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  const json = JSON.parse(new TextDecoder().decode(plaintext));

  if (Date.now() > json.expires) {
    throw new Error("⏰ Shared password link has expired");
  }

  return json;
}

// Load redeemed token database
async function loadRedeemedTokens() {
  const data = await chrome.storage.local.get(REDEEM_DB);
  return data[REDEEM_DB] || {};
}

// Save redeemed token database
async function saveRedeemedTokens(db) {
  await chrome.storage.local.set({ [REDEEM_DB]: db });
}

// Handle share redemption
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "REDEEM_SHARE") {
    (async () => {
      const { token, data, iv, key } = msg;

      if (!token) {
        sendResponse({ ok: false, error: "Invalid token" });
        return;
      }

      // ✅ 1. Check if already redeemed
      const redeemed = await loadRedeemedTokens();
      if (redeemed[token]) {
        sendResponse({
          ok: false,
          error: "❌ This one-time link has already been used"
        });
        return;
      }

      try {
        // ✅ 2. Decrypt shared payload
        incomingSharedCred = await decryptSharedPayload(data, iv, key);

        // ✅ 3. Mark token as redeemed forever
        redeemed[token] = Date.now();
        await saveRedeemedTokens(redeemed);

        // ✅ 4. Redirect to login URL
        const loginUrl = incomingSharedCred.loginUrl;
        if (!loginUrl) throw new Error("Missing loginUrl in shared token");

        chrome.tabs.create({ url: loginUrl });

        // ✅ 5. Auto-wipe credentials after 2 minutes
        setTimeout(() => { incomingSharedCred = null; }, 120000);

        sendResponse({ ok: true });

      } catch (err) {
        console.error(err);
        sendResponse({ ok: false, error: err.message });
      }
    })();

    return true;
  }

  if (msg.action === "REQUEST_SHARED_CRED") {

    if (!incomingSharedCred) {
      sendResponse({ cred: null });
      return true;
    }

    const cred = incomingSharedCred;
    incomingSharedCred = null; // wipe immediately

    sendResponse({ cred });
    return true;
  }

  // ✅ Wipe shared credential after content.js finishes autofilling
  if (msg.action === "SHARE_CRED_USED") {
    console.log("✅ One-time credential consumed. Clearing memory.");
    incomingSharedCred = null;
    sendResponse({ ok: true });
  }
});


