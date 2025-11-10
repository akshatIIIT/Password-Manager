(async () => {
  const params = new URLSearchParams(location.search);

  const token = params.get("token");   // ✅ one-time token ID
  const data = params.get("data");
  const iv = params.get("iv");
  const key = params.get("key");

  const statusEl = document.getElementById("status");

  if (!token || !data || !iv || !key) {
    document.body.innerHTML = "<h3>❌ Invalid share link</h3>";
    return;
  }

  statusEl.innerText = "Decrypting...";

  chrome.runtime.sendMessage(
    {
      action: "REDEEM_SHARE",
      token,
      data,
      iv,
      key
    },
    response => {
      if (!response) {
        statusEl.innerHTML = "<h3>❌ Extension did not respond</h3>";
        return;
      }

      if (!response.ok) {
        statusEl.innerHTML = `<h3>${response.error}</h3>`;
        return;
      }

      statusEl.innerHTML = "<h3>✅ Opening login page...</h3>";
    }
  );
})();
