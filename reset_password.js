import { deriveKey } from "./crypto.js";
import { saveEncryptedVault } from "./vault_core.js";

const msg = document.getElementById("resetMsg");
const strength = document.getElementById("strength");
const pw1Input = document.getElementById("newPw");

// -------------------------------------------------------
// 🔥 Live password strength checker (same as create.js)
// -------------------------------------------------------
pw1Input.addEventListener("input", () => {
  const val = pw1Input.value;

  if (!val) {
    strength.textContent = "";
    return;
  }

  let s = "Weak ❌";
  if (val.length >= 8 && /\d/.test(val) && /[A-Z]/.test(val)) {
    s = "Strong ✅";
  }

  strength.textContent = "Password strength: " + s;
});

// -------------------------------------------------------

document.getElementById("backBtn").onclick = () => {
  window.location = "login.html";
};

document.getElementById("resetBtn").onclick = async () => {
  const pw1 = document.getElementById("newPw").value;
  const pw2 = document.getElementById("confirmPw").value;

  if (!pw1 || !pw2) {
    msg.textContent = "Enter both fields.";
    return;
  }

  if (pw1 !== pw2) {
    msg.textContent = "Passwords do not match.";
    return;
  }

  // CREATE NEW BLANK VAULT
  const vault = { folders: {} };

  try {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await deriveKey(pw1, salt);

    await saveEncryptedVault(vault, key, salt);

    await chrome.storage.session.clear();

    msg.style.color = "green";
    msg.textContent = "Password reset successful! Redirecting...";

    setTimeout(() => window.location = "login.html", 1200);

  } catch (e) {
    msg.textContent = "Error resetting vault.";
  }
};
