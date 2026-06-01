(async () => {
  const $ = (id) => document.getElementById(id);
  const tracks = ["", "Thriller", "Library", "Arcade", "Zen", "Cyberpunk", "Nature", "Space", "Radio", "Doom", "Lofi"];

   function cleanDomain(input) {
      const raw = String(input || "").trim().toLowerCase();
  if (!raw) return "";
  if (raw.includes("/")) {
 try {
     return new URL(raw.startsWith("http") ? raw : `https://${raw}`).hostname.replace(/^www\./, "");
 } catch {
   return "";
 }
}
 return raw.replace(/^www\./, '');
}
 
  for (const t of tracks) {
    const o = document.createElement("option");
    o.value = t;
    o.textContent = t || "Auto Detect";
    $("trackSelect").appendChild(o);
  }

  async function loadRows () {
   const data = await chrome.runtime.sendMessage({ type: "OPTIONS_GET_ALL" });
   const tbody = $("domainTable");
   tbody.innerHTML = "";

    for (const row of data.rows) {
      const tr = document.createElement("tr");
      const muteStatus = row.muted 
        ? `<span class="status-badge muted">Muted</span>` 
        : `<span class="status-badge active">Active</span>`;
      tr.innerHTML = `<td>${row.domain}</td>
                      <td>${row.track || "Auto Detect"}</td>
                      <td>${muteStatus}</td>
                      <td><button class="delete-btn" data-kill="${row.domain}">x</button></td>`;
      tbody.appendChild(tr);
    }

    tbody.querySelectorAll("button[data-kill]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await chrome.runtime.sendMessage({ type: "OPTIONS_REMOVE_DOMAIN", domain: btn.dataset.kill });
        $("status").textContent = `System Status: Removed ${btn.dataset.kill}`;
        loadRows();
      });
    });
  }

  $("saveBtn").addEventListener("click", async () => {
      const domain = cleanDomain($("domainInput").value.trim().toLowerCase());
      if (!domain) return;
      const track = $("trackSelect").value;
      const muted = $("muteToggle").checked;
      await chrome.runtime.sendMessage({ type: "OPTIONS_SAVE_DOMAIN", domain, track, muted });
      $("status").textContent = `saved ${domain}`;
      $("domainInput").value = "";
      $("trackSelect").value = "";
      $("muteToggle").checked = false;
      loadRows();
    });
  
    $("reloadBtn").addEventListener("click", loadRows);
    loadRows();
  })();