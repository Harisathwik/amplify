const slider = document.getElementById("slider");
const sliderArea = document.getElementById("sliderArea");
const display = document.getElementById("display");
const warn = document.getElementById("warn");
const resetBtn = document.getElementById("reset");
const muteBtn = document.getElementById("muteBtn");
const themeBtn = document.getElementById("themeBtn");
const normalizeToggle = document.getElementById("normalizeToggle");
const saveSiteBtn = document.getElementById("saveSite");
const clearSiteBtn = document.getElementById("clearSite");
const siteInfo = document.getElementById("siteInfo");
const vizCanvas = document.getElementById("vizCanvas");
const vizCtx = vizCanvas.getContext("2d");
const tabList = document.getElementById("tabList");
const tabListLabel = document.getElementById("tabListLabel");
const presets = document.querySelectorAll(".btn[data-val]");
const eqBtns = document.querySelectorAll(".eq-btn");

let currentTabId = null;
let currentHostname = null;
let currentTabTitle = null;
let isMuted = false;
let volumeBeforeMute = 100;
let currentEQPreset = "default";
let isNormalized = false;
let hasSiteProfile = false;
let vizAnimId = null;
let mediaTitle = null;
let mediaArtist = null;
let siteAllowed = false;

function getVolumeColor(val) {
  if (val < 100) return "#888";
  if (val <= 200) return "#4488cc";
  if (val <= 400) return "#cc9900";
  return "#cc3333";
}

function updateSliderFill(val) {
  const pct = (val / 600) * 100;
  const color = getVolumeColor(val);
  slider.style.background = `linear-gradient(to right, ${color} 0%, ${color} ${pct}%, var(--bg3) ${pct}%)`;
}

function updateUI(val, muted = false) {
  isMuted = muted;
  if (muted) {
    display.textContent = "MUTED";
    display.className = "value muted";
    muteBtn.classList.add("muted");
    muteBtn.innerHTML = "&#x1f507;";
    slider.classList.add("disabled");
  } else {
    display.textContent = val + "%";
    const level = val < 100 ? "level-low" : val <= 200 ? "level-normal" : val <= 400 ? "level-high" : "level-danger";
    display.className = `value ${level}`;
    muteBtn.classList.remove("muted");
    muteBtn.innerHTML = val === 0 ? "&#x1f507;" : "&#x1f50a;";
    slider.classList.remove("disabled");
    slider.value = val;
    updateSliderFill(val);
  }
  warn.style.display = val > 200 ? "block" : "none";
  if (val > 400) {
    warn.className = "warn level-danger";
    warn.textContent = "Very high volume — may cause distortion or hearing damage.";
  } else if (val > 200) {
    warn.className = "warn level-high";
    warn.textContent = "Values above 200% may cause distortion on some audio.";
  }
  presets.forEach(btn => {
    btn.classList.toggle("active", !muted && parseInt(btn.dataset.val) === val);
  });
}

function updateEQUI(preset) {
  currentEQPreset = preset;
  eqBtns.forEach(btn => btn.classList.toggle("active", btn.dataset.eq === preset));
}

function updateNormalizeUI(enabled) {
  isNormalized = enabled;
  normalizeToggle.classList.toggle("on", enabled);
}

function updateSiteUI(saved, hostname) {
  hasSiteProfile = saved;
  if (saved) {
    saveSiteBtn.classList.add("saved");
    saveSiteBtn.textContent = "Saved";
    siteInfo.textContent = `Auto-saving for ${hostname}`;
  } else {
    saveSiteBtn.classList.remove("saved");
    saveSiteBtn.textContent = "Save for this site";
    siteInfo.textContent = hostname || "";
  }
}

function allowSite(thenDo) {
  siteAllowed = true;
  chrome.storage.local.get({ allowedSites: [] }, (data) => {
    if (!data.allowedSites.includes(currentHostname)) {
      data.allowedSites.push(currentHostname);
      chrome.storage.local.set({ allowedSites: data.allowedSites });
    }
    warn.style.display = "none";
    if (thenDo) thenDo();
  });
}

let pendingAction = null;

function showConsent() {
  warn.style.display = "block";
  warn.className = "warn level-high";
  warn.innerHTML = 'Amplify will modify audio on this site. Some streaming sites may lose audio — reload the page to fix. <a href="#" id="consentYes" style="color:#4488cc;cursor:pointer">Enable</a>';
  setTimeout(() => {
    const btn = document.getElementById("consentYes");
    if (btn) btn.addEventListener("click", (e) => {
      e.preventDefault();
      allowSite(pendingAction);
      pendingAction = null;
    });
  }, 0);
}

function gatedAction(fn) {
  if (siteAllowed) { fn(); return; }
  pendingAction = fn;
  showConsent();
}

function buildCurrentProfile() {
  return { volume: parseInt(slider.value), eq: currentEQPreset, normalize: isNormalized };
}

function autoSaveSiteProfile() {
  if (!hasSiteProfile || !currentHostname) return;
  chrome.runtime.sendMessage({
    action: "saveSiteProfile", hostname: currentHostname, profile: buildCurrentProfile()
  });
}

function doApplyVolume(val) {
  updateUI(val, false);
  display.classList.add("flash");
  setTimeout(() => display.classList.remove("flash"), 120);
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "setTabVolume", tabId: currentTabId, value: val });
  autoSaveSiteProfile();
  setTimeout(loadAudioTabs, 100);
}

function applyVolume(val) {
  if (val === 100) { doApplyVolume(val); return; }
  gatedAction(() => doApplyVolume(val));
}

function toggleMute() {
  if (!currentTabId) return;
  if (!isMuted) volumeBeforeMute = parseInt(slider.value);
  gatedAction(() => {
    chrome.runtime.sendMessage({ action: "toggleMute", tabId: currentTabId }, (resp) => {
      updateUI(volumeBeforeMute, resp && resp.muted);
      setTimeout(loadAudioTabs, 100);
    });
  });
}

function applyEQ(preset) {
  if (preset === "default") { doApplyEQ(preset); return; }
  gatedAction(() => doApplyEQ(preset));
}

function doApplyEQ(preset) {
  updateEQUI(preset);
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "setEQ", tabId: currentTabId, preset });
  autoSaveSiteProfile();
}

function toggleNormalize() {
  gatedAction(() => {
    const enabled = !isNormalized;
    updateNormalizeUI(enabled);
    if (!currentTabId) return;
    chrome.runtime.sendMessage({ action: "setNormalize", tabId: currentTabId, enabled });
    autoSaveSiteProfile();
  });
}

function saveSiteProfile() {
  if (!currentTabId || !currentHostname) return;
  chrome.runtime.sendMessage({
    action: "saveSiteProfile", hostname: currentHostname, profile: buildCurrentProfile()
  }, () => updateSiteUI(true, currentHostname));
}

function clearSiteProfile() {
  if (!currentHostname) return;
  chrome.runtime.sendMessage({ action: "deleteSiteProfile", hostname: currentHostname },
    () => updateSiteUI(false, currentHostname));
}

function toggleTheme() {
  const html = document.documentElement;
  const current = html.getAttribute("data-theme");
  const next = current === "dark" ? "light" : "dark";
  html.setAttribute("data-theme", next);
  chrome.storage.local.set({ theme: next });
}

function drawVizText(text, sub) {
  const width = parseInt(vizCanvas.style.width) || vizCanvas.width;
  const height = parseInt(vizCanvas.style.height) || vizCanvas.height;
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  vizCtx.fillStyle = isDark ? "#222" : "#eee";
  vizCtx.fillRect(0, 0, width, height);
  vizCtx.font = "11px 'Segoe UI', system-ui, sans-serif";
  vizCtx.fillStyle = isDark ? "#888" : "#777";

  const maxW = width - 60;
  let label = text || "";
  if (vizCtx.measureText(label).width > maxW) {
    while (label.length > 0 && vizCtx.measureText(label + "...").width > maxW) {
      label = label.slice(0, -1);
    }
    label += "...";
  }
  vizCtx.fillText(label, 8, height / 2 + 4);

  if (sub) {
    vizCtx.font = "9px 'Segoe UI', system-ui, sans-serif";
    vizCtx.fillStyle = isDark ? "#555" : "#aaa";
    vizCtx.fillText(sub, width - vizCtx.measureText(sub).width - 8, height / 2 + 4);
  }
}

function fetchMediaInfo() {
  if (!currentTabId) return;
  chrome.tabs.sendMessage(currentTabId, { action: "getMediaInfo" }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;
    mediaTitle = resp.title || currentTabTitle;
    mediaArtist = resp.artist || null;
  });
}

function getDisplayTitle() {
  if (mediaTitle && mediaArtist) return `${mediaTitle} — ${mediaArtist}`;
  return mediaTitle || currentTabTitle || "Untitled";
}

function drawVisualizer() {
  if (!currentTabId) {
    drawVizText("No tab selected");
    return;
  }
  chrome.tabs.sendMessage(currentTabId, { action: "getAnalyserData" }, (data) => {
    if (chrome.runtime.lastError || !data || !data.dataArray) {
      drawVizText(getDisplayTitle(), "No audio");
      vizAnimId = requestAnimationFrame(drawVisualizer);
      return;
    }
    const { dataArray, bufferLength } = data;
    const hasSignal = dataArray.some(v => v > 2);

    if (!hasSignal) {
      drawVizText(getDisplayTitle(), "Paused");
      vizAnimId = requestAnimationFrame(drawVisualizer);
      return;
    }

    const width = parseInt(vizCanvas.style.width) || vizCanvas.width;
    const height = parseInt(vizCanvas.style.height) || vizCanvas.height;
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";

    vizCtx.fillStyle = isDark ? "#222" : "#eee";
    vizCtx.fillRect(0, 0, width, height);

    const barWidth = width / bufferLength;
    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 255;
      const barHeight = v * height;
      const hue = 210 + (i / bufferLength) * 30;
      vizCtx.fillStyle = `hsl(${hue}, 50%, ${40 + v * 30}%)`;
      vizCtx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
    }
    vizAnimId = requestAnimationFrame(drawVisualizer);
  });
}

function loadAudioTabs() {
  chrome.runtime.sendMessage({ action: "getAudioTabs" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.tabs) return;
    const tabs = resp.tabs;
    if (tabs.length === 0) {
      tabListLabel.style.display = "none";
      tabList.innerHTML = "";
      return;
    }
    tabListLabel.style.display = "block";
    tabList.innerHTML = tabs.map(t => `
      <div class="tab-item ${t.id === currentTabId ? 'current' : ''}" data-tabid="${t.id}">
        ${t.favIconUrl ? `<img class="tab-icon" src="${t.favIconUrl}" alt="">` : '<span class="tab-icon"></span>'}
        <span class="tab-title">${escapeHtml(t.title || 'Tab')}</span>
        <span class="tab-vol">${t.muted ? 'M' : t.volume + '%'}</span>
      </div>
    `).join("");

    tabList.querySelectorAll(".tab-item").forEach(el => {
      el.addEventListener("click", () => {
        const tid = parseInt(el.dataset.tabid);
        chrome.tabs.update(tid, { active: true });
      });
    });
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

slider.addEventListener("input", () => applyVolume(parseInt(slider.value)));
presets.forEach(btn => btn.addEventListener("click", () => applyVolume(parseInt(btn.dataset.val))));
eqBtns.forEach(btn => btn.addEventListener("click", () => applyEQ(btn.dataset.eq)));
normalizeToggle.addEventListener("click", toggleNormalize);
saveSiteBtn.addEventListener("click", saveSiteProfile);
clearSiteBtn.addEventListener("click", clearSiteProfile);
themeBtn.addEventListener("click", toggleTheme);
muteBtn.addEventListener("click", toggleMute);

resetBtn.addEventListener("click", () => {
  applyEQ("default");
  updateNormalizeUI(false);
  chrome.runtime.sendMessage({ action: "setNormalize", tabId: currentTabId, enabled: false });
  applyVolume(100);
});

sliderArea.addEventListener("wheel", (e) => {
  e.preventDefault();
  const current = parseInt(slider.value);
  const delta = e.deltaY < 0 ? 10 : -10;
  if (isMuted) toggleMute();
  applyVolume(Math.max(0, Math.min(600, current + delta)));
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (e.key === "m" || e.key === "M") { e.preventDefault(); toggleMute(); return; }
  const current = parseInt(slider.value);
  if (e.key === "ArrowRight" || e.key === "ArrowUp") {
    e.preventDefault();
    if (isMuted) toggleMute();
    applyVolume(Math.min(600, current + 5));
  } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
    e.preventDefault();
    applyVolume(Math.max(0, current - 5));
  }
});

chrome.storage.local.get({ theme: "dark" }, (data) => {
  document.documentElement.setAttribute("data-theme", data.theme);
});

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  if (!tabs[0]) return;
  currentTabId = tabs[0].id;
  currentTabTitle = tabs[0].title || "Untitled";
  try { currentHostname = new URL(tabs[0].url).hostname; } catch {}

  if (currentHostname) {
    chrome.storage.local.get({ allowedSites: [] }, (data) => {
      siteAllowed = data.allowedSites.includes(currentHostname);
    });
  }

  chrome.runtime.sendMessage({ action: "getTabState", tabId: currentTabId }, (resp) => {
    if (chrome.runtime.lastError || !resp) { updateUI(100); return; }
    volumeBeforeMute = resp.volume;
    updateUI(resp.volume, resp.muted);
    updateEQUI(resp.eqPreset || "default");
    updateNormalizeUI(resp.normalize || false);
  });

  if (currentHostname) {
    chrome.runtime.sendMessage({ action: "getSiteProfile", hostname: currentHostname }, (resp) => {
      if (chrome.runtime.lastError) return;
      updateSiteUI(!!(resp && resp.profile), currentHostname);
    });
  }

  const dpr = window.devicePixelRatio || 1;
  const vizW = vizCanvas.parentElement.clientWidth;
  vizCanvas.width = vizW * dpr;
  vizCanvas.height = 32 * dpr;
  vizCanvas.style.width = vizW + "px";
  vizCanvas.style.height = "32px";
  vizCtx.scale(dpr, dpr);
  fetchMediaInfo();
  setInterval(fetchMediaInfo, 2000);
  drawVisualizer();
  loadAudioTabs();
});
