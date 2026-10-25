const DEFAULT_VOLUME = 100;
const STEP = 25;
const MAX = 600;
const MIN = 0;

const BYPASS = { type: "highpass", frequency: 0, q: 1, gain: 0 };
const EQ_PRESETS = {
  default: [BYPASS, BYPASS],
  voice:   [{ type: "peaking",  frequency: 1500, q: 1, gain: 12 }, BYPASS],
  bass:    [{ type: "lowshelf", frequency: 350, q: 1, gain: 6 }, BYPASS],
  night:   [
    { type: "lowshelf", frequency: 300, q: 1, gain: -10 },
    { type: "peaking",  frequency: 2500, q: 0.8, gain: 10 }
  ]
};

async function getTabVolume(tabId) {
  const key = `tab:${tabId}`;
  const data = await chrome.storage.local.get({ [key]: DEFAULT_VOLUME });
  return data[key];
}

async function setTabVolume(tabId, percent) {
  const key = `tab:${tabId}`;
  await chrome.storage.local.set({ [key]: percent });
  updateBadge(tabId, percent);
  try {
    await chrome.tabs.sendMessage(tabId, { action: "setVolume", value: percent });
  } catch {}
}

async function getTabMuted(tabId) {
  const key = `mute:${tabId}`;
  const data = await chrome.storage.local.get({ [key]: false });
  return data[key];
}

async function setTabMuted(tabId, muted) {
  const key = `mute:${tabId}`;
  await chrome.storage.local.set({ [key]: muted });
  if (muted) {
    try {
      await chrome.tabs.sendMessage(tabId, { action: "setVolume", value: 0 });
    } catch {}
    updateBadge(tabId, 0, true);
  } else {
    const vol = await getTabVolume(tabId);
    try {
      await chrome.tabs.sendMessage(tabId, { action: "setVolume", value: vol });
    } catch {}
    updateBadge(tabId, vol);
  }
}

async function getTabEQ(tabId) {
  const key = `eq:${tabId}`;
  const data = await chrome.storage.local.get({ [key]: "default" });
  return data[key];
}

async function setTabEQ(tabId, presetName) {
  const key = `eq:${tabId}`;
  await chrome.storage.local.set({ [key]: presetName });
  const eq = EQ_PRESETS[presetName] || EQ_PRESETS.default;
  try {
    await chrome.tabs.sendMessage(tabId, { action: "setEQ", eq });
  } catch {}
}

async function getTabNormalize(tabId) {
  const key = `norm:${tabId}`;
  const data = await chrome.storage.local.get({ [key]: false });
  return data[key];
}

async function setTabNormalize(tabId, enabled) {
  const key = `norm:${tabId}`;
  await chrome.storage.local.set({ [key]: enabled });
  try {
    await chrome.tabs.sendMessage(tabId, { action: "setNormalize", enabled });
  } catch {}
}

async function getSiteProfile(hostname) {
  const key = `site:${hostname}`;
  const data = await chrome.storage.local.get({ [key]: null });
  return data[key];
}

async function saveSiteProfile(hostname, profile) {
  const key = `site:${hostname}`;
  await chrome.storage.local.set({ [key]: profile });
}

async function deleteSiteProfile(hostname) {
  const key = `site:${hostname}`;
  await chrome.storage.local.remove(key);
}

function updateBadge(tabId, percent, muted = false) {
  if (muted) {
    chrome.action.setBadgeText({ text: "M", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#cc3333", tabId });
    return;
  }
  if (percent === DEFAULT_VOLUME) {
    chrome.action.setBadgeText({ text: "", tabId });
    return;
  }
  const label = percent >= 100 ? `${Math.round(percent / 100)}x` : `${percent}`;
  chrome.action.setBadgeText({ text: label, tabId });
  chrome.action.setBadgeBackgroundColor({
    color: percent > 200 ? "#cc9900" : "#4488cc",
    tabId
  });
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "amplify-100", title: "Volume: 100%", contexts: ["page"] });
    chrome.contextMenus.create({ id: "amplify-200", title: "Volume: 200%", contexts: ["page"] });
    chrome.contextMenus.create({ id: "amplify-400", title: "Volume: 400%", contexts: ["page"] });
    chrome.contextMenus.create({ id: "amplify-600", title: "Volume: 600%", contexts: ["page"] });
    chrome.contextMenus.create({ id: "amplify-sep", type: "separator", contexts: ["page"] });
    chrome.contextMenus.create({ id: "amplify-mute", title: "Mute tab", contexts: ["page"] });
  });
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab) return;

  if (info.menuItemId === "amplify-mute") {
    const muted = await getTabMuted(tab.id);
    await setTabMuted(tab.id, !muted);
    return;
  }

  const match = info.menuItemId.match(/^amplify-(\d+)$/);
  if (match) {
    const vol = parseInt(match[1]);
    const muted = await getTabMuted(tab.id);
    if (muted) await setTabMuted(tab.id, false);
    await setTabVolume(tab.id, vol);
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "volume-up") {
    const muted = await getTabMuted(tab.id);
    if (muted) await setTabMuted(tab.id, false);
    const vol = await getTabVolume(tab.id);
    const next = Math.min(MAX, vol + STEP);
    await setTabVolume(tab.id, next);
  }

  if (command === "volume-down") {
    const vol = await getTabVolume(tab.id);
    const next = Math.max(MIN, vol - STEP);
    await setTabVolume(tab.id, next);
  }

  if (command === "toggle-mute") {
    const muted = await getTabMuted(tab.id);
    await setTabMuted(tab.id, !muted);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = msg.tabId || (sender.tab && sender.tab.id);

  if (msg.action === "getTabState") {
    (async () => {
      const volume = await getTabVolume(tabId);
      const muted = await getTabMuted(tabId);
      const eqPreset = await getTabEQ(tabId);
      const eq = EQ_PRESETS[eqPreset] || EQ_PRESETS.default;
      const normalize = await getTabNormalize(tabId);
      sendResponse({ volume, muted, eq, eqPreset, normalize });
    })();
    return true;
  }

  if (msg.action === "setTabVolume") {
    (async () => {
      await setTabVolume(tabId, msg.value);
      const muted = await getTabMuted(tabId);
      if (muted) await setTabMuted(tabId, false);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "toggleMute") {
    (async () => {
      const muted = await getTabMuted(tabId);
      await setTabMuted(tabId, !muted);
      sendResponse({ muted: !muted });
    })();
    return true;
  }

  if (msg.action === "setEQ") {
    (async () => {
      await setTabEQ(tabId, msg.preset);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "setNormalize") {
    (async () => {
      await setTabNormalize(tabId, msg.enabled);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "getSiteProfile") {
    (async () => {
      const profile = await getSiteProfile(msg.hostname);
      sendResponse({ profile });
    })();
    return true;
  }

  if (msg.action === "saveSiteProfile") {
    (async () => {
      await saveSiteProfile(msg.hostname, msg.profile);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "deleteSiteProfile") {
    (async () => {
      await deleteSiteProfile(msg.hostname);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "getAudioTabs") {
    (async () => {
      const tabs = await chrome.tabs.query({ audible: true });
      const results = [];
      for (const tab of tabs) {
        const vol = await getTabVolume(tab.id);
        const muted = await getTabMuted(tab.id);
        results.push({
          id: tab.id,
          title: tab.title,
          favIconUrl: tab.favIconUrl,
          volume: vol,
          muted: muted
        });
      }
      sendResponse({ tabs: results });
    })();
    return true;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.remove([
    `tab:${tabId}`, `mute:${tabId}`, `eq:${tabId}`, `norm:${tabId}`
  ]);
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const vol = await getTabVolume(activeInfo.tabId);
  const muted = await getTabMuted(activeInfo.tabId);
  updateBadge(activeInfo.tabId, vol, muted);
});


chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;
  try {
    const url = new URL(tab.url);
    const hostname = url.hostname;
    const data = await chrome.storage.local.get({ allowedSites: [] });
    if (!data.allowedSites.includes(hostname)) return;
    const profile = await getSiteProfile(hostname);
    if (profile) {
      await setTabVolume(tabId, profile.volume);
      if (profile.eq) await setTabEQ(tabId, profile.eq);
      if (profile.normalize !== undefined) await setTabNormalize(tabId, profile.normalize);
    }
  } catch {}
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.action.setBadgeTextColor({ color: "#ffffff" });
  setupContextMenus();
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    await chrome.tabs.create({ url: "onboarding.html" });
  }
});
