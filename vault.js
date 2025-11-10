import { saveEncryptedVault } from "./vault_core.js";

// ✅ Load decrypted vault from chrome.session storage
async function getVault() {
  const { vaultCache } = await chrome.storage.session.get("vaultCache");
  if (!vaultCache) return null;
  return JSON.parse(vaultCache);
}

async function getDerivedKey() {
  const session = await chrome.storage.session.get("vaultKey");
  if (!session.vaultKey) return null;

  const raw = new Uint8Array(session.vaultKey);
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ✅ Save vault back to storage
async function saveVault(vault) {
  await chrome.storage.session.set({ vaultCache: JSON.stringify(vault) });
  await saveEncryptedVault(vault);
  chrome.runtime.sendMessage({ action: "rebuildMenus" });
}

// ==============================================================
// ✅ UI FUNCTIONS
// ==============================================================

function extractDisplayHost(loginUrl) {
  try {
    const url = new URL(loginUrl);
    return url.hostname + url.pathname;
  } catch {
    return loginUrl;
  }
}

function renderFolders(vault) {
  const div = document.getElementById("folders");
  div.innerHTML = "";

  vault.folders ??= {};

  Object.keys(vault.folders).forEach(folder => {
    const btn = document.createElement("button");
    btn.textContent = folder;
    btn.onclick = () => renderPasswords(folder, vault);
    div.appendChild(btn);
  });
}

function renderPasswords(folder, vault) {
  const list = document.getElementById("passwordList");
  const entries = vault.folders?.[folder] ?? [];

  list.innerHTML = `<h3>${folder}</h3>`;

  entries.forEach((entry, i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.margin = "5px 0";

    const masked = "•".repeat((entry.password ?? "").length);

    const displayText = extractDisplayHost(entry.loginUrl || "");

    const text = document.createElement("span");
    text.textContent = `${displayText} — ${masked}`;
    row.appendChild(text);

    const btn = document.createElement("button");
    btn.textContent = "Share";
    btn.style.marginLeft = "12px";
    btn.onclick = async () => {
      await createShareToken(entry);
    };
    row.appendChild(btn);

    list.appendChild(row);
  });
}

// ==============================================================
// ✅ BUTTON HANDLERS + STARTUP
// ==============================================================

document.getElementById("newFolderBtn").onclick = async () => {
  const name = prompt("Folder Name");
  if (!name) return;

  const vault = await getVault();
  vault.folders ??= {};
  vault.folders[name] = [];

  await saveVault(vault);
  renderFolders(vault);
};

document.getElementById("logout").onclick = async () => {
  await chrome.storage.session.remove("vaultCache");
  await chrome.storage.session.remove("vaultKey");

  chrome.runtime.sendMessage({ action: "rebuildMenus" });
  window.location = "login.html";
};

document.addEventListener("DOMContentLoaded", async () => {
  const key = await getDerivedKey();
  if (!key) {
    window.location = "login.html";
    return;
  }

  const vault = await getVault();
  if (!vault) {
    window.location = "login.html";
    return;
  }

  renderFolders(vault);
});

// ==============================================================
// ✅ UPDATED SHARE TOKEN (loginUrl ONLY + ONE-TIME TOKEN ID)
// ==============================================================

async function createShareToken(entry, ttlSeconds = 300) {
  // ✅ Unique one-time token identifier
  const tokenId = crypto.getRandomValues(new Uint8Array(8))
    .reduce((a, b) => a + b.toString(16).padStart(2, "0"), "");

  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    "AES-GCM",
    false,
    ["encrypt"]
  );

  const loginUrl = entry.loginUrl || "";

  const payload = JSON.stringify({
    loginUrl,
    username: entry.username,
    password: entry.password,
    created: Date.now(),
    expires: Date.now() + ttlSeconds * 1000
  });

  const encoded = new TextEncoder().encode(payload);

  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    cryptoKey,
    encoded
  );

  const b64 = arr => btoa(String.fromCharCode(...new Uint8Array(arr)));

  const url =
    `chrome-extension://${chrome.runtime.id}/share.html` +
    `?token=${tokenId}` +                             // ✅ tokenId
    `&data=${encodeURIComponent(b64(ciphertext))}` +
    `&iv=${encodeURIComponent(b64(iv))}` +
    `&key=${encodeURIComponent(b64(keyBytes))}`;

  try {
    await navigator.clipboard.writeText(url);
    alert("✅ One-time login link copied!\n(Expires in 5 minutes)");
  } catch {
    prompt("Copy your one-time login link:", url);
  }

  return url;
}
