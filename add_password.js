import { saveEncryptedVault } from "./vault_core.js";

async function getVault() {
  const { vaultCache } = await chrome.storage.session.get("vaultCache");
  return vaultCache ? JSON.parse(vaultCache) : null;
}

async function saveVault(vault) {
  await chrome.storage.session.set({ vaultCache: JSON.stringify(vault) });
  await saveEncryptedVault(vault);
  chrome.runtime.sendMessage({ action: "rebuildMenus" });
}

document.addEventListener("DOMContentLoaded", async () => {
  const vault = await getVault();
  if (!vault) {
    window.location = "login.html";
    return;
  }

  const folderSelect = document.getElementById("folderSelect");
  const folders = Object.keys(vault.folders ?? {});

  // Add folders to dropdown
  folders.forEach(name => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    folderSelect.appendChild(opt);
  });

  // Save button
  document.getElementById("savePasswordBtn").onclick = async () => {
    const folder = folderSelect.value;
    const loginUrl = document.getElementById("loginUrlInput").value.trim();
    const username = document.getElementById("usernameInput").value.trim();
    const password = document.getElementById("passwordInput").value.trim();

    if (!folder || !loginUrl || !username || !password) {
      alert("All fields are required.");
      return;
    }

    vault.folders[folder].push({ loginUrl, username, password });

    await saveVault(vault);

    alert("✅ Password saved!");
    window.location = "vault.html";
  };

  // Back button
  document.getElementById("backBtn").onclick = () => {
    window.location = "vault.html";
  };
});
