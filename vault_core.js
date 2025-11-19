export async function saveEncryptedVault(vault, overrideKey = null, overrideSalt = null) {

  let key;

  // ----------------------------------------------------
  // 1️⃣ If override key provided → use it (reset password)
  // ----------------------------------------------------
  if (overrideKey) {
    key = overrideKey;

    // Save new salt if provided
    if (overrideSalt) {
      await chrome.storage.local.set({ salt: Array.from(overrideSalt) });
    }

  } else {
    // ----------------------------------------------------
    // 2️⃣ Normal usage → load the key from session
    // ----------------------------------------------------
    const { vaultKey } = await chrome.storage.session.get("vaultKey");
    if (!vaultKey) throw new Error("No key in session");

    const raw = new Uint8Array(vaultKey);

    key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  // ----------------------------------------------------
  // Encrypt vault normally
  // ----------------------------------------------------
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(vault));

  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );

  // ----------------------------------------------------
  // Save encrypted data
  // ----------------------------------------------------
  await chrome.storage.local.set({
    vault: {
      cipher: Array.from(new Uint8Array(cipher)),
      iv: Array.from(iv)
    }
  });
}
