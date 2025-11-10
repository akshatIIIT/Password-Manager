export async function saveEncryptedVault(vault) {
  const { vaultKey } = await chrome.storage.session.get("vaultKey");
  if (!vaultKey) throw new Error("No key in session");

  const raw = new Uint8Array(vaultKey);
  const key = await crypto.subtle.importKey(
    "raw",
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(vault));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);

  await chrome.storage.local.set({
    vault: {
      cipher: Array.from(new Uint8Array(cipher)),
      iv: Array.from(iv)
    }
  });
}