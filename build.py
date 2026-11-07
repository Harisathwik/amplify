"""Build and verify store zips. Usage: python build.py
Chrome and Firefox manifests differ (see README > Building); this is the only place that knowledge lives."""
import json, zipfile, copy, sys

FILES = ["background.js", "content.js", "popup.js", "popup.html", "onboarding.html",
         "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png"]
GECKO = {"id": "amplify@rednodestudio.in", "strict_min_version": "140.0",
         "data_collection_permissions": {"required": ["none"]}}

base = json.load(open("manifest.json"))
v = base["version"]

def build(name, manifest, extra=()):
    with zipfile.ZipFile(name, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("manifest.json", json.dumps(manifest, indent=2))
        for f in FILES + list(extra):
            z.write(f)

chrome = copy.deepcopy(base)
chrome.pop("browser_specific_settings", None)
chrome["background"].pop("scripts", None)
build(f"amplify-chrome-v{v}.zip", chrome)

firefox = copy.deepcopy(base)
firefox["background"]["scripts"] = ["background.js"]   # Firefox ignores service_worker
firefox["browser_specific_settings"] = {"gecko": GECKO}
firefox["icons"]["96"] = "icons/icon-96.png"
build(f"amplify-firefox-v{v}.zip", firefox, ["icons/icon-96.png"])

# ---- verify ----
fails = []
# CWS rejects declared-but-unused permissions (v2.2.0 rejection: "scripting").
_code = "".join(open(f, encoding="utf-8").read() for f in ("background.js", "content.js", "popup.js"))
for perm in base["permissions"]:
    if f"chrome.{perm}" not in _code:
        fails.append(f"permission '{perm}' declared but chrome.{perm} never used")
def check(ok, msg):
    if not ok: fails.append(msg)

def common(z, m):
    cs = m["content_scripts"][0]
    check(cs.get("all_frames") is True, "all_frames must be true (iframe players)")
    check("service_worker" in m["background"], "service_worker missing")
    check("innerHTML" not in z.read("popup.js").decode(), "innerHTML in popup.js (AMO rejects)")
    for f in ["manifest.json"] + FILES:
        check(f in z.namelist(), f"missing {f}")
    for n in z.namelist():
        check(not n.endswith((".svg", ".md", ".zip")) and n != "LICENSE", f"stray file {n}")

with zipfile.ZipFile(f"amplify-chrome-v{v}.zip") as z:
    m = json.loads(z.read("manifest.json")); common(z, m)
    check("browser_specific_settings" not in m, "chrome: browser_specific_settings present")
    check("scripts" not in m["background"], "chrome: background.scripts present (MV3 rejects)")

with zipfile.ZipFile(f"amplify-firefox-v{v}.zip") as z:
    m = json.loads(z.read("manifest.json")); common(z, m)
    g = m["browser_specific_settings"]["gecko"]
    check(m["background"].get("scripts") == ["background.js"], "firefox: background.scripts missing")
    check(g["data_collection_permissions"] == {"required": ["none"]}, "firefox: data_collection_permissions wrong")
    check(tuple(map(int, g["strict_min_version"].split("."))) >= (140, 0), "firefox: strict_min_version < 140")
    check("icons/icon-96.png" in z.namelist(), "firefox: icon-96 missing")

if fails:
    print("\n".join("FAIL " + f for f in fails)); sys.exit(1)
print(f"built + verified amplify-chrome-v{v}.zip and amplify-firefox-v{v}.zip")
