# Amplify

Volume boost up to 600% that works in fullscreen.

Unlike other volume extensions that use `tabCapture` (which breaks fullscreen on YouTube and other sites), Amplify uses `MediaElementAudioSourceNode` to boost audio directly from media elements. Fullscreen works normally.

## Features

- Volume boost 0-600%
- Fullscreen-safe (no `tabCapture`)
- EQ presets: Default, Voice, Bass, Night
- Auto-normalize (dynamics compressor)
- Per-site profiles with auto-save
- Per-tab volume memory
- Audio visualizer with song title display
- Tab audio list
- Dark/light theme
- Keyboard shortcuts (Alt+Shift+Up/Down/M)
- Right-click context menu
- Ko-fi support link

## Install

**Chrome Web Store:** [Install Amplify](https://chromewebstore.google.com/detail/amplify/ffcfjalcdppichdnmdoaboeenalcdbeb)

**Firefox Add-ons:** (under review)

**Manual install:**
1. Download or clone this repo
2. Go to `chrome://extensions/` (or `brave://extensions/`)
3. Enable Developer mode
4. Click "Load unpacked" and select this folder

## How It Works

Amplify creates a Web Audio API chain per media element:

```
<video>/<audio> -> GainNode -> BiquadFilter x2 -> DynamicsCompressor -> AnalyserNode -> speakers
```

Audio is only hooked when the user changes settings from default. At 100% volume with default EQ, the extension is completely passive.

## Limitations

- **DRM-protected streaming sites** (Qobuz, Tidal, Amazon Music, Netflix): Audio boost may not work. The extension shows a per-site consent prompt before modifying audio. If audio breaks, reload the page.
- This is a fundamental limitation of `MediaElementAudioSourceNode` with cross-origin or DRM-restricted audio streams. The tradeoff is fullscreen compatibility on ~95% of sites.

## Privacy

No data collection. No analytics. No external servers. All settings stored locally. See [PRIVACY.md](PRIVACY.md).

## License

MIT - see [LICENSE](LICENSE).

## Support

- Issues: https://github.com/harisathwik/amplify/issues
- Ko-fi: https://ko-fi.com/rednodestudio
