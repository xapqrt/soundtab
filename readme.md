# SoundTab
Dynamic procedural ambient soundtracks that adapt to your browsing mood.

SoundTab is da extension for carnival

 Features
Mood Based Soundscapes: Automatically detects the vibe of a page. Whether you are on a technical documentation site (Cyberpunk), a news portal (Thriller), or a wiki (Library), the audio adapts.

Procedural Audio Engine: Instead of just playing boring static loops on repeat, SoundTab uses the Web Audio API to synthesize sounds on the fly so you never hear the exact same thing twice.

Seamless Transitions: Smoothly crossfades between tracks when you switch tabs or when the page content changes.

Domain Control:

Overrides: Force a specific mood for any domain.

Mute List: Completely block audio for specific websites.

Volume Persistence: Remembers your preferred volume levels so you do not have to reset them every time you open your browser.

Quick Controls: Change the volume, override tracks, or toggle mute directly from the extension popup.

Keyboard Shortcut: Quickly mute or unmute a domain using Alt+Shift+M.

 How it Works
Content Analysis: A content script reads the page text, metadata like keywords and descriptions, and structural elements like code blocks or video players.

Mood Classification: The extension automatically sorts the page into a matching vibe cluster like Zen, Space, Arcade, or Lofi.

Offscreen Synthesis: Audio is generated in an offscreen document to keep playback stable and smooth without breaking Manifest V3 rules.

 Installation
Clone or download this repo.

Open Chrome and go to chrome://extensions/.

Turn on Developer mode in the top right corner.

Click Load unpacked and select the folder with these files.

 Current Mood Clusters
Cyberpunk: For tech docs, coding, and terminal-heavy pages.

Nature: For blogs about gardens, wildlife, and earth-related content.

Library: For deep archives, history wikis, and reference materials.

Zen: For meditation, mindfulness, and calm reading.

Space: For cosmos, astronomy, and science sites.

Thriller: For breaking news and high-tension content.

Arcade: For retro gaming and pixel art.

Lofi: The default chill vibe for everything else.