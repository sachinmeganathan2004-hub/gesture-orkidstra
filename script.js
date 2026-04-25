// ==============================
// REFINED INTERACTIVE SOUND SYSTEM
// ==============================

let audioCtx;

// Core nodes
let masterGain, convolver;
let drumGain, synthGain, ambientGain, bellGain;

// Buffers
let drumBuffer, bellBuffer;
let sound1Buffer, sound2Buffer, sound3Buffer;

// Sources
let drumSource = null;
let ambientSources = [];

// Synth
let osc = null;

// State
let started = false;
let lastX = 0, lastY = 0;
let lastBellTime = 0;

// ==============================
// INIT AUDIO
// ==============================
async function initAudio() {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.9;

    drumGain = audioCtx.createGain();
    synthGain = audioCtx.createGain();
    ambientGain = audioCtx.createGain();
    bellGain = audioCtx.createGain();

    // Improved gain staging (clear separation)
    drumGain.gain.value = 0.6;
    synthGain.gain.value = 0.08;
    ambientGain.gain.value = 0.35;
    bellGain.gain.value = 0.7;

    // Reverb (controlled)
    convolver = audioCtx.createConvolver();
    convolver.buffer = createReverbImpulse(2.0, 1.8);

    // Routing
    drumGain.connect(convolver);
    synthGain.connect(convolver);
    ambientGain.connect(convolver);
    bellGain.connect(convolver);

    convolver.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    // Load buffers safely
    [
        drumBuffer,
        bellBuffer,
        sound1Buffer,
        sound2Buffer,
        sound3Buffer
    ] = await Promise.all([
        loadAudio("sounds/drum.m4a"),
        loadAudio("sounds/bells.m4a"),
        loadAudio("sounds/sound1.m4a"),
        loadAudio("sounds/sound2.m4a"),
        loadAudio("sounds/sound3.m4a")
    ]);
}

// ==============================
// LOAD AUDIO
// ==============================
async function loadAudio(url) {
    try {
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        return await audioCtx.decodeAudioData(arr);
    } catch {
        console.warn("Failed:", url);
        return null;
    }
}

// ==============================
// DRUM LOOP
// ==============================
function startDrum() {
    if (!drumBuffer) return;

    drumSource = audioCtx.createBufferSource();
    drumSource.buffer = drumBuffer;
    drumSource.loop = true;

    drumSource.connect(drumGain);
    drumSource.start();
}

// ==============================
// AMBIENT (MULTI-LAYER CONTROLLED)
// ==============================
function startAmbient() {
    const buffers = [sound1Buffer, sound2Buffer, sound3Buffer].filter(b => b);

    // Use only 2 layers max to avoid clutter
    const selected = buffers.slice(0, 2);

    selected.forEach(buffer => {
        const src = audioCtx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;

        src.connect(ambientGain);
        src.start();

        ambientSources.push(src);
    });
}

// ==============================
// SYNTH (PLEASANT)
// ==============================
function startSynth() {
    osc = audioCtx.createOscillator();
    osc.type = "triangle"; // softer than sine in perception

    osc.connect(synthGain);
    osc.start();
}

// ==============================
// BELLS (RARE)
// ==============================
function triggerBell() {
    if (!bellBuffer) return;

    const now = performance.now();
    if (now - lastBellTime < 1500) return;

    lastBellTime = now;

    const src = audioCtx.createBufferSource();
    src.buffer = bellBuffer;

    src.connect(bellGain);
    src.start();

    src.onended = () => src.disconnect();
}

// ==============================
// REVERB IMPULSE
// ==============================
function createReverbImpulse(duration, decay) {
    const rate = audioCtx.sampleRate;
    const length = rate * duration;
    const impulse = audioCtx.createBuffer(2, length, rate);

    for (let c = 0; c < 2; c++) {
        const channel = impulse.getChannelData(c);
        for (let i = 0; i < length; i++) {
            channel[i] =
                (Math.random() * 2 - 1) *
                Math.pow(1 - i / length, decay);
        }
    }
    return impulse;
}

// ==============================
// INTERACTION
// ==============================
function handleMove(x, y) {
    if (!audioCtx) return;

    const nx = x / window.innerWidth;
    const ny = y / window.innerHeight;

    const dx = x - lastX;
    const dy = y - lastY;
    const speed = Math.sqrt(dx * dx + dy * dy);

    lastX = x;
    lastY = y;

    // ----------------------
    // DRUM (X-axis)
    // ----------------------
    drumGain.gain.value = 0.4 + nx * 0.6;

    // ----------------------
    // SYNTH (pleasant range)
    // ----------------------
    if (osc) {
        const freq = 300 + nx * 500; // 300–800 Hz
        osc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.08);
    }

    synthGain.gain.value = 0.05 + (1 - ny) * 0.1;

    // ----------------------
    // AMBIENT (FIXED AUDIBILITY)
    // ----------------------
    ambientGain.gain.value = 0.2 + (1 - ny) * 0.5;

    // ----------------------
    // BELLS (rare)
    // ----------------------
    const nearCenter =
        Math.abs(nx - 0.5) < 0.15 &&
        Math.abs(ny - 0.5) < 0.15;

    const slow = speed < 5;

    if (nearCenter && slow) {
        triggerBell();
    }
}

// ==============================
// STOP EVERYTHING (CRITICAL FIX)
// ==============================
function stopAll() {
    if (!audioCtx) return;

    // Stop drum
    if (drumSource) {
        try { drumSource.stop(); } catch {}
        drumSource.disconnect();
        drumSource = null;
    }

    // Stop ambient
    ambientSources.forEach(src => {
        try { src.stop(); } catch {}
        src.disconnect();
    });
    ambientSources = [];

    // Stop synth
    if (osc) {
        try { osc.stop(); } catch {}
        osc.disconnect();
        osc = null;
    }

    started = false;
}

// ==============================
// START SYSTEM
// ==============================
async function startSystem() {
    if (started) return;

    await initAudio();
    await audioCtx.resume();

    startDrum();
    startAmbient();
    startSynth();

    started = true;
}

// ==============================
// EVENTS
// ==============================
window.addEventListener("mousedown", async (e) => {
    await startSystem();
    handleMove(e.clientX, e.clientY);
});

window.addEventListener("mousemove", (e) => {
    if (!started) return;
    handleMove(e.clientX, e.clientY);
});

window.addEventListener("mouseup", () => {
    stopAll();
});

window.addEventListener("touchstart", async (e) => {
    const t = e.touches[0];
    await startSystem();
    handleMove(t.clientX, t.clientY);
});

window.addEventListener("touchmove", (e) => {
    const t = e.touches[0];
    handleMove(t.clientX, t.clientY);
});

window.addEventListener("touchend", () => {
    stopAll();
});

// ==============================
// VISUAL FEEDBACK (optional)
// ==============================
const cursor = document.createElement("div");
cursor.style.position = "fixed";
cursor.style.width = "18px";
cursor.style.height = "18px";
cursor.style.borderRadius = "50%";
cursor.style.background = "white";
cursor.style.pointerEvents = "none";
cursor.style.transform = "translate(-50%, -50%)";
document.body.appendChild(cursor);

window.addEventListener("mousemove", (e) => {
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
});