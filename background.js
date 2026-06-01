const TRACKS = [
"Thriller","Library","Arcade", "Zen", "Cyberpunk",
 "Nature", "Space", "Radio", "Doom", "Lofi"
];

let audio_ctx = null;
let master_gain = null;
let active_nodes = [];
let active_track = null;
let active_domain_string = "";
let mute_list = [];
let domain_track_map = {};
let transition_lock = false;
let master_volume = 0.22;
let global_muted = false;

let offscreenCreating = null;
async function setupOffscreen() {
    try {
        const contexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT']
        });
        if (contexts.length > 0) return;
    } catch (e) {}
    if (offscreenCreating) {
        await offscreenCreating;
        return;
    }
    offscreenCreating = chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['AUDIO_PLAYBACK'],
        justification: 'ambient soundtracks for webpages'
    }).catch((err) => {
        if (!err.message.includes('Only a single offscreen document may be created')) {
            console.error(err);
        }
    }).finally(() => {
        offscreenCreating = null;
    });
    await offscreenCreating;
}

async function sendAudioMessage(type, data = {}) {
    await setupOffscreen();
    let success = false;
    for (let i = 0; i < 5; i++) {
        try {
            await chrome.runtime.sendMessage({
                target: "OFFSCREEN_AUDIO",
                type,
                volume: master_volume,
                ...data
            });
            success = true;
            break;
        } catch (err) {
            await new Promise((resolve) => setTimeout(resolve, 50));
        }
    }
}

async function bootAudio() {
    await setupOffscreen();
    await sendAudioMessage("AUDIO_INIT");
}

async function killCurrentTrack() {
    active_track = null;
    await sendAudioMessage("AUDIO_STOP");
}

async function softKillCurrentTrack(ms = 140) {
    active_track = null;
    await sendAudioMessage("AUDIO_STOP");
}

const MOOD_KEYWORDS = {
    Thriller: ["war","crisis","breaking","attack","threat","panic"],
    Library: ["study","history","wiki","archive","literatue"],
    Arcade: ["game","arcde","score","combo","pixel","retro"],
    Zen: ["meditation","calm","mindful","yoga","breath"],
    Cyberpunk: ["github","code","tech","terminal","hacker","ai"],
    Nature: ["forest","river","wildlife","mountain","eco"],
    Space: ["space","galaxy","orbit","nasa","cosmos","planet"],
    Radio: ["podcast","broadcast","newsroom","station","fm"],
    Doom: ["horror","doom","dark","demon","apocalypse"],
    Lofi: ["chill","lofi","focus","beats","vibes","late night"]
};

const DOMAIN_MOOD_HINTS = {
"wikipedia.org": "Library",
"github.com": "Cyberpunk",
"gitlab.com": "Cyberpunk",
"x.com": "Arcade",
"twitter.com": "Arcade",
"instagram.com": "Arcade",
"tiktok.com": "Arcade",
"bbc.com": "Thriller",
"cnn.com": "Thriller",
"nytimes.com": "Thriller",
"nature.com": "Nature",
"nasa.gov": "Space",
};

function pickMoodFromKeywords(rawText) {
    const text = (rawText || "").toLowerCase();
    let winner = "Lofi";
    let best = 0;
    for (const [mood, words] of Object.entries(MOOD_KEYWORDS)) {
        let score = 0;
        for (const w of words) if (text.includes(w)) score+= 1;
        if (score > best) {
            best = score;
            winner = mood;
        }
    }
    return winner;
}

function pickMoodFromDomain(domain) {
    if(!domain) return null;
    const hint = Object.entries(DOMAIN_MOOD_HINTS)
        .find(([needle]) => domain.endsWith(needle));
    return hint ? hint[1] : "";
}

function chooseMood(domain,rawText,signals={}) {
    const contentMood = pickMoodFromKeywords(rawText);
    const domainMood = pickMoodFromDomain(domain);
    if (signals.hasCode && domainMood !== "Thriller") return "Cyberpunk";
    if ((signals.articleCount || 0) > 2 && (signals.linkCount || 0) > 80) return "Library";
    if (signals.hasVideo && (signals.linkCount || 0) > 100) return "Arcade";
    if(!domainMood) return contentMood;
    if (domainMood === contentMood) return contentMood;

    const txt = (rawText || "").toLowerCase();
    const words = MOOD_KEYWORDS[contentMood] || [];
    let confidence = 0;
    for(const w of words) if(txt.includes(w)) confidence += 1;
    return confidence >=3 ? contentMood : domainMood;
}


function safeDomain(urlString) {
    try {
        return new URL(urlString).hostname.replace(/^www\./, '');
    } catch {
        return "";
    }
}

function normalizeDomainLoose(input) {
const raw = String(input || "").trim().toLowerCase();
if (!raw) return "";
if (raw.includes("/")) return safeDomain(raw.startsWith("http") ? raw : `https://${raw}`);
return raw.replace(/^www\./, '');
}

async function loadVault() {
    const data = await chrome.storage.local.get(["domainTrackMap","muteList","masterVolume","globalMuted"]);
    domain_track_map = data.domainTrackMap || {};
    mute_list = data.muteList || [];
    master_volume = typeof data.masterVolume === "number" ? data.masterVolume : 0.22;
    global_muted = !!data.globalMuted;
}

async function saveVault() {
    await chrome.storage.local.set({
        domainTrackMap: domain_track_map,
        muteList: mute_list,
        masterVolume: master_volume,
        globalMuted: global_muted
    });
}

function routeDomainMood(domain, detectedMood) {
  if(global_muted) {
  killCurrentTrack();
  return;
  }
    active_domain_string = domain || active_domain_string;
    if (!active_domain_string) return;
    if (mute_list.includes(active_domain_string)) {
        killCurrentTrack();
        return;
    }
    const forced = domain_track_map[active_domain_string];
    const finalMood = forced && TRACKS.includes(forced) ? forced : detectedMood;
    switchTrack(finalMood);
}

async function initEngine() {
    await loadVault();
    bootAudio();
chrome.alarms.create("ws-health", { periodInMinutes: 1 });
}

initEngine();

async function recheckActiveTabMood() {
const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
const  tab = tabs?.[0];
if(!tab?.url) return;
const domain = safeDomain(tab.url);
const guessText = `${tab.title || ""} ${domain}`;
const gussedMood = chooseMood(domain, guessText);
routeDomainMood(domain, gussedMood);
}

chrome.tabs.onActivated.addListener(() => {
  recheckActiveTabMood().catch(() => {});
});

chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
if (info.status !== "complete") return;
if (!tab?.active) return;
recheckActiveTabMood().catch(() => {});
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== "ws-health") return;
  if (!audio_ctx) {
    bootAudio();
    return;
  }
  if (audio_ctx.state === "closed") {
    console.log("AUDIO CONTEXT DIED REBOOTING");
    bootAudio();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
 if (command !== "toggle-domain-mute") return;
const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
const tab = tabs?.[0];
if (!tab?.url) return;
const domain = safeDomain(tab.url);
if (!domain) return;
if (mute_list.includes(domain)) {
mute_list = mute_list.filter((d) => d !== domain);
console.log("unmuted domain from shortcut", domain);
} else {
mute_list.push(domain);
console.log("muted domain from shortcut", domain);
}
await saveVault();
recheckActiveTabMood().catch(() => {});
});

function mkOsc(type, freq, gainVal, detune=0) {
    const o = audio_ctx.createOscillator();
    const g = audio_ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    g.gain.value = gainVal;
    o.connect(g).connect(master_gain);
    o.start();
    active_nodes.push(o, g);
    return {o, g};
}

function startThrillerTrack() {

    const bass = mkOsc("sawtooth", 41, 0.03, -7);
    const drone = mkOsc("triangle", 82, 0.02, 4);
    const pulse = mkOsc("square", 1.2, 0.015, 0);
    pulse.o.connect(pulse.g);
    active_track = "Thriller";
}









function startLibraryTrack() {

const noise_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate * 2, audio_ctx.sampleRate);
const out = noise_buffer.getChannelData(0);
let last = 0;
for (let i = 0; i < out.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last +(0.02 * white)) / 1.02;
    out[i] = last * 3.5;
}
const src = audio_ctx.createBufferSource();
src.buffer = noise_buffer;
src.loop = true;
const lp = audio_ctx.createBiquadFilter();
lp.type = "lowpass";
lp.frequency.value = 520;
const g = audio_ctx.createGain();
g.gain.value = 0.024;
src.connect(lp).connect(g).connect(master_gain);
src.start();
active_nodes.push(src, lp, g);
active_track = "Library";
}

function startArcadeTrack() {
    const arpA = mkOsc("square", 220, 0.02);
    const arpB = mkOsc("square", 330, 0.016, 7);
    let step = 0;
    const timer = setInterval(() => {
        if (!audio_ctx) return;
        const seq = [220, 262, 330, 392, 523, 392, 330, 262];
        const n = seq[step % seq.length];
        arpA.o.frequency.setTargetAtTime(n, audio_ctx.currentTime, 0.02);
        arpB.o.frequency.setTargetAtTime(n * 1.5, audio_ctx.currentTime, 0.02);
        step++;
    }, 260);
    active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
    active_track = "Arcade";
}









function startZenTrack() {
    const synth_thing = mkOsc("sine", 174, 0.026);
    const over = mkOsc("sine", 261.63, 0.018);
    const air = mkOsc("triangle", 348.83, 0.011);
    let drift = 0;
    const timer = setInterval(() => {
    drift += 0.35;
    const wobble = Math.sin(drift) * 8;
    synth_thing.o.detune.value = wobble;
    over.o.detune.value = wobble * 0.06;
    air.o.detune.value = wobble * 0.3;
    }, 180);
    active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
    active_track = "Zen";
}

function startCyberpunkTrack() {
    console.log("matched cyberpunk mood... injecting synth");
    const lead1 = mkOsc("sawtooth", 98, 0.02, -11);
    const lead2 = mkOsc("sawtooth", 98, 0.02, 11);
    const sub = mkOsc("square", 49, 0.015, 0);
    const hp = audio_ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 140;
    lead1.g.disconnect();
    lead2.g.disconnect();
    lead1.g.connect(hp);
    lead2.g.connect(hp);
    hp.connect(master_gain);
    active_nodes.push(hp, sub.o, sub.g);
    active_track = "Cyberpunk";
}









function startNatureTrack() {

    const noise_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate * 2, audio_ctx.sampleRate);
    const out = noise_buffer.getChannelData(0);
    for (let i = 0; i < out.length; i++) out[i] = (Math.random() * 2 - 1) * 0.2;
    const src = audio_ctx.createBufferSource();
    src.buffer = noise_buffer;
    src.loop = true;
    const bp = audio_ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 980;
    const g = audio_ctx.createGain();
    g.gain.value = 0.03;
    src.connect(bp).connect(g).connect(master_gain);
    src.start();
    const bird = mkOsc("sine", 1320, 0.004);
    active_nodes.push(src, bp, g, bird.o, bird.g);
    active_track = "Nature";
}

function startSpaceTrack() {
    const deep = mkOsc("sire", 55, 0.02);
    const mid = mkOsc("triangle", 110, 0.015);
    const shimmer = mkOsc("sine", 440, 0.007);
    let t = 0;
    const timer = setInterval(() => {
        t += 0.08;
        deep.o.frequency.value = 50 + Math.sin(t) * 6;
        mid.o.frequency.value = 100 + Math.sin(t * 0.7) * 10;
        shimmer.o.detune.value = Math.sin(t * 1.7) * 22;
    }, 120);
    active_nodes.push({ stop: () => clearInterval(timer), disconnect: () => {} });
    active_track = "Space";
}









function startRadioTrack() {
    const carrier = mkOsc("sine", 300, 0.012);
    const hiss_buffer = audio_ctx.createBuffer(1, audio_ctx.sampleRate, audio_ctx.sampleRate);
    const ch = hiss_buffer.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * 0.1;
    const hiss = audio_ctx.createBufferSource();
    hiss.buffer = hiss_buffer;
    hiss.loop = true;
    const hp = audio_ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1800;
   const g = audio_ctx.createGain();
   g.gain.value = 0.016;
   hiss.connect(hp).connect(g).connect(master_gain);
    hiss.start();
    active_nodes.push(carrier.o, carrier.g, hiss, hp, g);
    active_track = "Radio";
}

function startDoomTrack() {
    const low = mkOsc("sawtooth", 37, 0.028);
    const mid = mkOsc("square", 74, 0.018, -5);
    const lfo = mkOsc("sine", 0.4, 0.0);
    const timer = setInterval(() => {
        const amt = (Math.sin(audio_ctx.currentTime * 0.8) + 1) * 0.5;
        low.g.gain.value = 0.02 + amt  * 0.014;
        mid.g.gain.value = 0.01 + amt * 0.01;
    }, 90);
    active_nodes.push(lfo.o, lfo.g, { stop: () => clearInterval(timer), disconnect: () => {} });
    active_track = "Doom";
}









function startLofiTrack() {
    const root = mkOsc("triangle", 196, 0.018);
    const top = mkOsc("sine", 392, 0.011);
    const crackle = mkOsc("square", 12, 0.002);
    let step = 0;
    const timer = setInterval(() => {
        const seq = [196, 220, 247, 175];
        root.o.frquency.value = seq[step % seq.length];
        top.o.frequency.value = seq[step % seq.length] * 2;
        step++;
    }, 740);
    active_nodes.push(crackle.o, crackle.g, { stop: () => clearInterval(timer), disconnect: () => {} });
    active_track = "Lofi";
}

const STARTERS = {
    Thriller: startThrillerTrack,
    Library: startLibraryTrack,
    Arcade: startArcadeTrack,
    Zen: startZenTrack,
    Cyberpunk: startCyberpunkTrack,
    Nature: startNatureTrack,
    Space: startSpaceTrack,
    Radio: startRadioTrack,
    Doom: startDoomTrack,
    Lofi: startLofiTrack
};

async function switchTrack(nextTrack) {
    if (!TRACKS.includes(nextTrack)) return;
    if (active_track === nextTrack) return;
    active_track = nextTrack;
    await sendAudioMessage("AUDIO_SWITCH_TRACK", { track: nextTrack });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === "POPUP_SET_TRACK") {
        const domain = normalizeDomainLoose(msg.domain);
        if (domain) {
            domain_track_map[domain] = msg.track;
            saveVault().then(() => routeDomainMood(domain, msg.track));
        }
        return false;
    }
    if (msg?.type === "POPUP_CLEAR_TRACK") {
        const domain = normalizeDomainLoose(msg.domain);
        if (domain) {
            delete domain_track_map[domain];
            saveVault().then(() => recheckActiveTabMood().catch(() => {}));
        }
        return false;
    }
    if (msg?.type === "POPUP_SET_MUTE") {
        const domain = normalizeDomainLoose(msg.domain);
        if (domain) {
            if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
            if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
            saveVault().then(() => routeDomainMood(domain, active_track || "Lofi"));
        }
        return false;
    }
    if (msg?.type === "POPUP_QUERY_STATE") {
        const domain = normalizeDomainLoose(msg.domain);
        sendResponse({
            domain,
            forcedTrack: domain_track_map[domain] || "",
            muted: mute_list.includes(domain),
            tracks: TRACKS,
            volume: master_volume,
            globalMuted: global_muted,
            activeTrack: active_track
        });
        return false;
    }
    if (msg?.type === "POPUP_SET_VOLUME") {
        master_volume = Math.max(0, Math.min(1, Number(msg.volume || 0.22)));
        saveVault().then(() => sendAudioMessage("AUDIO_SET_VOLUME"));
        return false;
    }
    if (msg?.type === "OPTIONS_GET_ALL") {
        const keys = new Set([...Object.keys(domain_track_map), ...mute_list]);
        const rows = [...keys].map((domain) => ({
            domain,
            track: domain_track_map[domain] || "",
            muted: mute_list.includes(domain)
        }));
        sendResponse({ rows });
        return false;
    }
    if (msg?.type === "OPTIONS_SAVE_DOMAIN") {
        const domain = normalizeDomainLoose(msg.domain);
        if (domain) {
            if (msg.track) domain_track_map[domain] = msg.track;
            if (!msg.track) delete domain_track_map[domain];
            if (msg.muted && !mute_list.includes(domain)) mute_list.push(domain);
            if (!msg.muted) mute_list = mute_list.filter((d) => d !== domain);
            saveVault().then(() => {
                if (domain === active_domain_string) routeDomainMood(domain, active_track || "Lofi");
            });
        }
        return false;
    }
    if (msg?.type === "OPTIONS_REMOVE_DOMAIN") {
        const domain = normalizeDomainLoose(msg.domain);
        if (domain) {
            delete domain_track_map[domain];
            mute_list = mute_list.filter((d) => d !== domain);
            saveVault().then(() => {
                if (domain === active_domain_string) recheckActiveTabMood().catch(() => {});
            });
        }
        return false;
    }
    if (msg?.type === "POPUP_SET_GLOBAL_MUTE") {
        global_muted = !!msg.muted;
        saveVault().then(() => {
            if (global_muted) killCurrentTrack();
            else recheckActiveTabMood().catch(() => {});
        });
        return false;
    }
});