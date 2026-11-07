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
    muteBtn.textContent = "\u{1f507}";
    slider.classList.add("disabled");
  } else {
    display.textContent = val + "%";
    const level = val < 100 ? "level-low" : val <= 200 ? "level-normal" : val <= 400 ? "level-high" : "level-danger";
    display.className = `value ${level}`;
    muteBtn.classList.remove("muted");
    muteBtn.textContent = val === 0 ? "\u{1f507}" : "\u{1f50a}";
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

const powerBtn = document.getElementById("powerBtn");
const powerLabel = powerBtn.querySelector(".power-label");

function setPowerUI(on) {
  siteAllowed = on;
  document.body.classList.toggle("off", !on);
  powerBtn.classList.toggle("on", on);
  powerLabel.textContent = on ? "ON" : "TURN ON";
}

function setPower(on) {
  setPowerUI(on);
  if (currentHostname) {
    chrome.storage.local.get({ allowedSites: [] }, (data) => {
      const list = data.allowedSites.filter(h => h !== currentHostname);
      if (on) list.push(currentHostname);
      chrome.storage.local.set({ allowedSites: list });
    });
  }
  if (!on) {
    applyEQ("default");
    updateNormalizeUI(false);
    chrome.runtime.sendMessage({ action: "setNormalize", tabId: currentTabId, enabled: false });
    applyVolume(100);
  }
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

function applyVolume(val) {
  updateUI(val, false);
  display.classList.add("flash");
  setTimeout(() => display.classList.remove("flash"), 120);
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "setTabVolume", tabId: currentTabId, value: val });
  autoSaveSiteProfile();
  setTimeout(loadAudioTabs, 100);
}

function toggleMute() {
  if (!currentTabId) return;
  if (!isMuted) volumeBeforeMute = parseInt(slider.value);
  chrome.runtime.sendMessage({ action: "toggleMute", tabId: currentTabId }, (resp) => {
    updateUI(volumeBeforeMute, resp && resp.muted);
    setTimeout(loadAudioTabs, 100);
  });
}

function applyEQ(preset) {
  updateEQUI(preset);
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "setEQ", tabId: currentTabId, preset });
  autoSaveSiteProfile();
}

function toggleNormalize() {
  const enabled = !isNormalized;
  updateNormalizeUI(enabled);
  if (!currentTabId) return;
  chrome.runtime.sendMessage({ action: "setNormalize", tabId: currentTabId, enabled });
  autoSaveSiteProfile();
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
      tabList.textContent = "";
      return;
    }
    tabListLabel.style.display = "block";
    tabList.textContent = "";
    tabs.forEach(t => {
      const row = document.createElement("div");
      row.className = "tab-item" + (t.id === currentTabId ? " current" : "");
      if (t.favIconUrl) {
        const icon = document.createElement("img");
        icon.className = "tab-icon";
        icon.src = t.favIconUrl;
        icon.alt = "";
        row.appendChild(icon);
      } else {
        row.appendChild(document.createElement("span")).className = "tab-icon";
      }
      const title = document.createElement("span");
      title.className = "tab-title";
      title.textContent = t.title || "Tab";
      row.appendChild(title);
      const vol = document.createElement("span");
      vol.className = "tab-vol";
      vol.textContent = t.muted ? "M" : t.volume + "%";
      row.appendChild(vol);
      row.addEventListener("click", () => chrome.tabs.update(t.id, { active: true }));
      tabList.appendChild(row);
    });
  });
}


slider.addEventListener("input", () => applyVolume(parseInt(slider.value)));
presets.forEach(btn => btn.addEventListener("click", () => applyVolume(parseInt(btn.dataset.val))));
eqBtns.forEach(btn => btn.addEventListener("click", () => applyEQ(btn.dataset.eq)));
normalizeToggle.addEventListener("click", toggleNormalize);
saveSiteBtn.addEventListener("click", saveSiteProfile);
clearSiteBtn.addEventListener("click", clearSiteProfile);
themeBtn.addEventListener("click", toggleTheme);
muteBtn.addEventListener("click", toggleMute);
powerBtn.addEventListener("click", () => setPower(!siteAllowed));

resetBtn.addEventListener("click", () => {
  applyEQ("default");
  updateNormalizeUI(false);
  chrome.runtime.sendMessage({ action: "setNormalize", tabId: currentTabId, enabled: false });
  applyVolume(100);
});

sliderArea.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (!siteAllowed) return;
  const current = parseInt(slider.value);
  const delta = e.deltaY < 0 ? 10 : -10;
  if (isMuted) toggleMute();
  applyVolume(Math.max(0, Math.min(600, current + delta)));
}, { passive: false });

document.addEventListener("keydown", (e) => {
  if (!siteAllowed) return;
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
      setPowerUI(data.allowedSites.includes(currentHostname));
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
