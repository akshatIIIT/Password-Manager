import { saveEncryptedVault } from "./vault_core.js";

// ✅ Extract a clean display for loginUrl
function extractDisplayHost(loginUrl) {
  try {
    const u = new URL(loginUrl);
    return u.hostname + u.pathname; // e.g. github.com/login
  } catch {
    return loginUrl;
  }
}

// ✅ Load pending captured login info (show loginUrl + masked password)
async function loadPending() {
  const { pendingSave } = await chrome.storage.session.get("pendingSave");
  if (!pendingSave) return;

  // ✅ Use loginUrl instead of site
  const siteEl = document.getElementById("site");
  const display = extractDisplayHost(pendingSave.loginUrl || "");
  siteEl.value = display;
  siteEl.disabled = true;

  // Username input (masked view only)
  const userEl = document.getElementById("username");
  userEl.value = "";
  userEl.placeholder = "(captured)";
  userEl.disabled = true;

  // Masked password display
  const passEl = document.getElementById("password");
  const realPasswordLength = (pendingSave.password || "").length;

  passEl.type = "password";
  passEl.value = "•".repeat(Math.max(1, realPasswordLength));
  passEl.disabled = true;
}

// ✅ Load folders into dropdown
async function loadFolders() {
  const { vaultCache } = await chrome.storage.session.get("vaultCache");
  const select = document.getElementById("folderSelect");

  select.innerHTML = "";

  if (!vaultCache) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "⚠️ Unlock vault to save";
    select.appendChild(opt);
    document.getElementById("saveBtn").disabled = true;
    return;
  }

  const vault = JSON.parse(vaultCache);
  const folders = vault.folders ?? {};

  Object.keys(folders).forEach(folder => {
    const opt = document.createElement("option");
    opt.value = folder;
    opt.textContent = folder;
    select.appendChild(opt);
  });

  if (Object.keys(folders).length === 0) {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "⚠️ No folders — open vault to add one";
    select.appendChild(opt);
    document.getElementById("saveBtn").disabled = true;
  }
}

// ✅ Cancel button
document.getElementById("cancelBtn").onclick = async () => {
  await chrome.storage.session.remove("pendingSave");
  window.close();
};

// ✅ Save credentials to selected folder
document.getElementById("saveBtn").onclick = async () => {
  const folder = document.getElementById("folderSelect").value;

  let { pendingSave } = await chrome.storage.session.get("pendingSave");
  let { vaultCache } = await chrome.storage.session.get("vaultCache");

  if (!pendingSave || !vaultCache) {
    window.close();
    return;
  }

  const vault = JSON.parse(vaultCache);
  vault.folders ??= {};
  vault.folders[folder] ??= [];

  // ✅ Look for existing entry by loginUrl + username
  const existing = vault.folders[folder].find(
    e => e.loginUrl === pendingSave.loginUrl && e.username === pendingSave.username
  );

  if (existing) {
    existing.password = pendingSave.password;           // ✅ update password
    existing.loginUrl = pendingSave.loginUrl;           // ✅ update login endpoint
  } else {
    vault.folders[folder].push({
      loginUrl: pendingSave.loginUrl,  // ✅ store authentication URL
      username: pendingSave.username,
      password: pendingSave.password
    });
  }

  // ✅ Persist new cache
  await chrome.storage.session.set({ vaultCache: JSON.stringify(vault) });

  // ✅ Encrypt + rewrite vault
  await saveEncryptedVault(vault);

  chrome.runtime.sendMessage({ action: "rebuildMenus" });

  await chrome.storage.session.remove("pendingSave");
  window.close();
};

// ✅ Initialize UI
await loadPending();
await loadFolders();
