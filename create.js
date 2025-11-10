const p1 = document.getElementById("master1");
const p2 = document.getElementById("master2");
const msg = document.getElementById("msg");
const strength = document.getElementById("strength");

// simple strength check
p1.addEventListener("input", () => {
  const val = p1.value;
  let s = "Weak ❌";
  if (val.length >= 8 && /\d/.test(val) && /[A-Z]/.test(val)) s = "Strong ✅";
  strength.textContent = "Password strength: " + s;
});

// ---- crypto utils ----
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 200000,        // good for password hashing
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(key, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(data));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  return {
    cipher: Array.from(new Uint8Array(cipher)),
    iv: Array.from(iv)
  };
}

// ---- main logic ----
document.getElementById("createVaultBtn").onclick = async () => {
  if (!p1.value || !p2.value) {
    msg.textContent = "Enter and confirm password";
    return;
  }
  if (p1.value !== p2.value) {
    msg.textContent = "Passwords do not match";
    return;
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derivedKey = await deriveKey(p1.value, salt);

  const emptyVault = { entries: [], folders: {} };
  const encrypted = await encryptData(derivedKey, emptyVault);

  await chrome.storage.local.set({
    vault: encrypted,
    salt: Array.from(salt),
    // we do NOT store the password — only derived key in memory
  });

  msg.textContent = "Vault created ✅ Redirecting...";
  setTimeout(() => {
    window.location = "vault.html";
  }, 700);
};

document.getElementById("backBtn").onclick = () => {
  window.location = "login.html";
};
