import { deriveKey } from "./crypto.js";

const input = document.getElementById("masterInput");
const msg = document.getElementById("message");

function toU8(arrLike) {
  return arrLike instanceof Uint8Array ? arrLike : Uint8Array.from(arrLike ?? []);
}

async function decryptData(key, cipher, iv) {
  const bytes = toU8(cipher);
  const ivArr = toU8(iv);
  const buf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivArr }, key, bytes);
  return JSON.parse(new TextDecoder().decode(buf));
}

// ✅ AUTO-UNLOCK ON POPUP OPEN
document.addEventListener("DOMContentLoaded", async () => {
  const { vaultKey } = await chrome.storage.session.get("vaultKey");
  if (!vaultKey) return;

  try {
    const data = await chrome.storage.local.get(["vault", "salt"]);
    if (!data.vault || !data.salt) throw new Error("No vault stored");

    const raw = new Uint8Array(vaultKey);
    const key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt", "encrypt"]
    );

    const vault = await decryptData(key, data.vault.cipher, data.vault.iv);

    sessionStorage.setItem("vaultData", JSON.stringify(vault));
    await chrome.storage.session.set({ vaultCache: JSON.stringify(vault) });

    chrome.runtime.sendMessage({ action: "rebuildMenus" });

    window.location = "vault.html";
  } catch (err) {
    await chrome.storage.session.clear();
  }
});

document.getElementById("forgotPw").onclick = () => {
  window.location = "reset_password.html";
};

// ✅ LOGIN FUNCTION
async function unlockVault(masterPassword) {
  const data = await chrome.storage.local.get(["vault", "salt"]);
  if (!data.vault || !data.salt) {
    msg.textContent = "No vault found";
    return false;
  }

  try {
    const salt = toU8(data.salt);
    const key = await deriveKey(masterPassword, salt);
    const vault = await decryptData(key, data.vault.cipher, data.vault.iv);

    sessionStorage.setItem("vaultData", JSON.stringify(vault));

    await chrome.storage.session.remove("vaultCache");          // ✅ NEW
    await chrome.storage.session.set({ vaultCache: JSON.stringify(vault) });

    const rawKey = await crypto.subtle.exportKey("raw", key);
    await chrome.storage.session.set({ vaultKey: Array.from(new Uint8Array(rawKey)) });

    chrome.runtime.sendMessage({ action: "rebuildMenus" });

    return true;
  } catch (err) {
    msg.textContent = "Wrong password or corrupted vault";
    return false;
  }
}

// ✅ BUTTONS
document.getElementById("createBtn").onclick = () => window.location = "create.html";
document.getElementById("loginBtn").onclick = async () => {
  const pw = input.value;
  if (!pw) return msg.textContent = "Enter password";
  if (await unlockVault(pw)) window.location = "vault.html";
};
