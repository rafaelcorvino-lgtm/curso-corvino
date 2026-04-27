// Audio engine:
// - Em navegador: FluidSynth WASM (via js-synthesizer)
// - Em Tauri (desktop): corvino_audio.dll nativa via Tauri commands (latência baixíssima)
// Detecta no startup e roteia chamadas.

const IS_TAURI = typeof window !== 'undefined' && !!window.__TAURI_INTERNALS__;
const tauriInvoke = IS_TAURI ? window.__TAURI_INTERNALS__.invoke : null;

let synth = null;
let audioCtx = null;
let audioNode = null;
let masterGain = null;   // GainNode pra boost da saída (volume 125 → mais alto)
let ready = false;
let initializing = false;

// Boost padrão da saída — multiplica o volume do FluidSynth
// 3.0 = +9.5dB de ganho. Ajustável via setMasterGain() se quiser.
const DEFAULT_MASTER_GAIN = 3.0;

// Keyboard SF2 ID and Bass SF2 ID (FluidSynth internal IDs)
let keyboardSfId = -1;
let bassSfId = -1;
let currentTimbreSfId = -1;

// Loading state callbacks
let onLoadingCallback = null;

// Channel assignments (matching the Flutter app)
const PIANO_CHANNEL = 0;
const BASS_CHANNEL = 1;

// Available timbres with their SF2 files
// octaveShift: soundfonts de instrumentos orquestrais (bass/oboe/organ/violin)
// não têm samples nas notas graves abaixo de ~C3. As primeiras 5 teclas do
// Corvino RC2 começam em MIDI 48 (C3) e ficam mudas nesses timbres.
// Solução: transpor +12 semitons quando o timbre é um desses → a nota que
// toca fica numa região coberta pelos samples.
export const TIMBRES = [
  { id: 'basson',    name: 'Basson',              file: 'assets/soundfonts/basson.sf2',           icon: '🎵', octaveShift: 12 },
  { id: 'giulietti', name: 'Giulietti Acordeon',  file: 'assets/soundfonts/giulietti.sf2',        icon: '🎹', octaveShift: 0 },
  { id: 'oboe',      name: 'Oboe',                file: 'assets/soundfonts/oboe.sf2',             icon: '🎶', octaveShift: 12 },
  { id: 'organ',     name: 'Organ',               file: 'assets/soundfonts/organ.sf2',            icon: '⛪', octaveShift: 12 },
  { id: 'violin',    name: 'Violin',              file: 'assets/soundfonts/violin.sf2',           icon: '🎻', octaveShift: 12 },
  { id: 'accordion', name: 'Accordion',           file: 'assets/soundfonts/accordion.sf2',        icon: '🪗', octaveShift: 0 },
];

const BASS_SF2 = 'assets/soundfonts/corvino_baixo.sf2';

let currentTimbre = 'basson';
let keyboardTranspose = 0;
let bassTranspose = 0;

// Cache loaded SF2 ArrayBuffers to avoid re-downloading
const sfCache = new Map();

export function onLoading(cb) {
  onLoadingCallback = cb;
}

function emitLoading(msg) {
  if (onLoadingCallback) onLoadingCallback(msg);
}

async function fetchSf2(url) {
  if (sfCache.has(url)) return sfCache.get(url);
  emitLoading(`Carregando ${url.split('/').pop()}...`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Failed to fetch ${url}: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  sfCache.set(url, buf);
  return buf;
}

const WORKLET_LIBFLUIDSYNTH = 'https://cdn.jsdelivr.net/npm/js-synthesizer@1.11.0/externals/libfluidsynth-2.4.6.js';
const WORKLET_SYNTHESIZER  = 'https://cdn.jsdelivr.net/npm/js-synthesizer@1.11.0/dist/js-synthesizer.worklet.js';

let usedWorklet = false;

async function tryInitWorklet() {
  // AudioWorklet exige loadar libfluidsynth E o worklet entry no contexto isolado.
  if (!audioCtx.audioWorklet) throw new Error('AudioWorklet não suportado');
  if (typeof JSSynth.AudioWorkletNodeSynthesizer !== 'function')
    throw new Error('AudioWorkletNodeSynthesizer não disponível');

  await audioCtx.audioWorklet.addModule(WORKLET_LIBFLUIDSYNTH);
  await audioCtx.audioWorklet.addModule(WORKLET_SYNTHESIZER);

  const worklet = new JSSynth.AudioWorkletNodeSynthesizer();
  worklet.init(audioCtx.sampleRate);
  const node = worklet.createAudioNode(audioCtx);
  return { synth: worklet, audioNode: node };
}

export async function init() {
  if (ready || initializing) return;
  initializing = true;

  // === PATH NATIVO (Tauri) === — usa corvino_audio.dll, latência mínima
  if (IS_TAURI) {
    try {
      const msg = await tauriInvoke('audio_init', { sampleRate: 48000, bufferSize: 128 });
      console.log('[CorvinoAudio/Native]', msg);
      ready = true;
      initializing = false;
      return;
    } catch (err) {
      console.error('[CorvinoAudio] init nativo falhou, caindo pro WASM:', err);
      // continua pro path WASM abaixo
    }
  }

  try {
    // Wait for JSSynth (loaded via script tag)
    await JSSynth.waitForReady();

    // AudioContext: deixa o navegador escolher o sampleRate nativo da placa de som
    // (evita resample desnecessário — algumas placas são 44.1k, outras 48k)
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx({
      latencyHint: 'interactive',
    });

    // === Tenta AudioWorklet primeiro (latência muito menor) ===
    try {
      const w = await tryInitWorklet();
      synth = w.synth;
      audioNode = w.audioNode;
      usedWorklet = true;
      console.log('[CorvinoAudio] Usando AudioWorklet (thread dedicada, ~2-3ms de buffer)');
    } catch (e) {
      console.warn('[CorvinoAudio] AudioWorklet falhou, usando ScriptProcessor:', e.message);
      // Fallback: ScriptProcessor buffer 256 samples (~5.3ms @ 48kHz)
      synth = new JSSynth.Synthesizer();
      synth.init(audioCtx.sampleRate);
      audioNode = synth.createAudioNode(audioCtx, 256);
      usedWorklet = false;
      console.log('[CorvinoAudio] Usando ScriptProcessor buffer=256 (~5.3ms)');
    }

    // Pipeline: synth → masterGain → destination
    masterGain = audioCtx.createGain();
    masterGain.gain.value = DEFAULT_MASTER_GAIN;
    audioNode.connect(masterGain);
    masterGain.connect(audioCtx.destination);

    // FluidSynth gain interno — padrão 0.2 é baixo. 0.8 dá bom headroom.
    if (typeof synth.setGain === 'function') {
      try { synth.setGain(0.8); } catch (e) { /* opcional */ }
    }

    // Load bass SF2 (always loaded)
    emitLoading('Carregando baixo...');
    const bassBuf = await fetchSf2(BASS_SF2);
    bassSfId = await synth.loadSFont(bassBuf);

    // Load default keyboard SF2
    await loadTimbreSf2(currentTimbre);

    // Explicitly assign each SoundFont to its channel
    assignChannels();

    // === PRE-WARM: tocar uma nota silenciosa pra inicializar voices/buffers
    // Elimina delay "cold start" na primeira nota tocada pelo usuário.
    try {
      synth.midiControl(PIANO_CHANNEL, 7, 0);   // volume 0
      synth.midiControl(BASS_CHANNEL, 7, 0);
      synth.midiNoteOn(PIANO_CHANNEL, 60, 1);
      synth.midiNoteOn(BASS_CHANNEL, 36, 1);
      await new Promise(r => setTimeout(r, 30));
      synth.midiNoteOff(PIANO_CHANNEL, 60);
      synth.midiNoteOff(BASS_CHANNEL, 36);
      // Restaura volumes
      synth.midiControl(PIANO_CHANNEL, 7, 100);
      synth.midiControl(BASS_CHANNEL, 7, 100);
    } catch (e) { /* ignore */ }

    ready = true;
    initializing = false;
    emitLoading(null);
    const baseLatency = audioCtx.baseLatency ? (audioCtx.baseLatency * 1000).toFixed(1) : '?';
    const outputLatency = audioCtx.outputLatency ? (audioCtx.outputLatency * 1000).toFixed(1) : '?';
    console.log('[CorvinoAudio] FluidSynth ready. Bass SF:', bassSfId, 'Keyboard SF:', keyboardSfId);
    const bufMs = usedWorklet ? '~2.7ms (AudioWorklet)' : '~5.3ms (ScriptProcessor 256)';
    console.log('[CorvinoAudio] Latência: buffer=' + bufMs + ', base=' + baseLatency + 'ms, output=' + outputLatency + 'ms, sampleRate=' + audioCtx.sampleRate + 'Hz');
  } catch (err) {
    console.error('[CorvinoAudio] Init failed:', err);
    initializing = false;
    emitLoading(null);
    throw err;
  }
}

// Força attack imediato e mata cauda reverb/chorus que pode dar sensação de lentidão
// CC 73 = Attack Time (0 = instantâneo)
// CC 72 = Release Time (menor = nota termina rápido)
// CC 74 = Brightness / Filter (127 = brilhante, ataque mais definido)
// CC 75 = Decay Time (0 = decai rápido, pouco sustain)
// CC 91 = Reverb Send (0 = seco, sem cauda)
// CC 93 = Chorus Send (0 = sem modulação)
// CC 64 = Sustain Pedal (0 = off, nota não segura ao soltar)
function forceFastAttack() {
  if (!synth) return;
  try {
    // Piano
    synth.midiControl(PIANO_CHANNEL, 73, 0);    // attack mínimo
    synth.midiControl(PIANO_CHANNEL, 72, 40);   // release curto
    synth.midiControl(PIANO_CHANNEL, 74, 127);  // brilho máximo (ataque nítido)
    synth.midiControl(PIANO_CHANNEL, 91, 0);    // sem reverb
    synth.midiControl(PIANO_CHANNEL, 93, 0);    // sem chorus
    synth.midiControl(PIANO_CHANNEL, 64, 0);    // sustain off

    // Baixo — mesmos ajustes, ainda mais agressivo no release
    synth.midiControl(BASS_CHANNEL, 73, 0);     // attack mínimo
    synth.midiControl(BASS_CHANNEL, 72, 20);    // release ainda mais curto
    synth.midiControl(BASS_CHANNEL, 74, 127);   // brilho máximo
    synth.midiControl(BASS_CHANNEL, 75, 0);     // decay rápido
    synth.midiControl(BASS_CHANNEL, 91, 0);     // sem reverb (acordeon não tem)
    synth.midiControl(BASS_CHANNEL, 93, 0);     // sem chorus
    synth.midiControl(BASS_CHANNEL, 64, 0);     // sustain off
  } catch (e) { /* opcional */ }
}

// Explicitly bind each SoundFont to its channel using fluid_synth_program_select
function assignChannels() {
  if (!synth) return;
  // midiProgramSelect(channel, sfontId, bank, program) - the ONLY reliable way
  // to force a specific SoundFont on a specific channel in FluidSynth
  synth.midiProgramSelect(BASS_CHANNEL, bassSfId, 0, 0);
  synth.midiProgramSelect(PIANO_CHANNEL, keyboardSfId, 0, 0);
  // Configura pitch bend range pra ±12 semitons em ambos os canais
  setPitchBendRange(BASS_CHANNEL, PITCH_BEND_RANGE_SEMITONES);
  setPitchBendRange(PIANO_CHANNEL, PITCH_BEND_RANGE_SEMITONES);
  // Aplica attack mínimo (CC73=0) depois de trocar programa
  forceFastAttack();
  console.log('[CorvinoAudio] Channels assigned via programSelect: piano=SF' + keyboardSfId + ', bass=SF' + bassSfId);
}

async function loadTimbreSf2(timbreId) {
  const timbre = TIMBRES.find(t => t.id === timbreId);
  if (!timbre) return;

  emitLoading(`Carregando ${timbre.name}...`);
  const buf = await fetchSf2(timbre.file);

  // Unload previous keyboard SF if different
  if (currentTimbreSfId >= 0 && currentTimbreSfId !== bassSfId) {
    try { synth.unloadSFont(currentTimbreSfId); } catch (e) { /* ignore */ }
  }

  keyboardSfId = await synth.loadSFont(buf);
  currentTimbreSfId = keyboardSfId;

  // Reassign both channels after loading new SF
  assignChannels();

  emitLoading(null);
  console.log('[CorvinoAudio] Loaded timbre:', timbre.name, 'SF ID:', keyboardSfId);
}

export function resume() {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

export async function setTimbre(timbreId) {
  if (timbreId === currentTimbre) return;
  const timbre = TIMBRES.find(t => t.id === timbreId);
  if (!timbre) return;
  currentTimbre = timbreId;
  if (IS_TAURI) {
    try {
      await tauriInvoke('audio_switch_keyboard_timbre', { file: timbre.file });
    } catch (e) { console.error('Troca de timbre (Tauri) falhou:', e); }
    return;
  }
  if (ready && synth) {
    await loadTimbreSf2(timbreId);
  }
}

export function getTimbre() {
  return currentTimbre;
}

// Import dinâmico evita ciclo entre audio-engine e midi-data
import { isBaixoMidi } from './midi-data.js';

// === PITCH BEND para transpose do baixo ===
// Os MIDIs do soundfont Corvino misturam baixos e acordes na mesma faixa
// (ex: 24=baixo Dó, 25=acorde Dó M). Mudar a nota MIDI quebra o som.
// Solução: usar Pitch Bend no canal — não muda a nota disparada, mas
// desloca a frequência de saída. Funciona pra qualquer sample (baixo OU acorde).
const PITCH_BEND_CENTER = 8192;          // valor neutro (sem bend)
const PITCH_BEND_RANGE_SEMITONES = 12;   // ±12 semitons (configurado via RPN no init)

function calcPitchBend(semitones) {
  // 16384 / (2 * range) = unidades por semitom
  const unitsPerSemi = 8192 / PITCH_BEND_RANGE_SEMITONES;
  const bend = PITCH_BEND_CENTER + Math.round(semitones * unitsPerSemi);
  return Math.max(0, Math.min(16383, bend));
}

// Configura o range do pitch bend de um canal (RPN 0 = Pitch Bend Sensitivity)
function setPitchBendRange(channel, semitones) {
  if (!synth) return;
  // Selecionar RPN 0 (Pitch Bend Range)
  synth.midiControl(channel, 101, 0);   // RPN MSB = 0
  synth.midiControl(channel, 100, 0);   // RPN LSB = 0
  // Data Entry — semitons (MSB) e cents (LSB)
  synth.midiControl(channel, 6, semitones);  // semitons
  synth.midiControl(channel, 38, 0);          // 0 cents
  // Reset RPN para 127/127 (boa prática)
  synth.midiControl(channel, 101, 127);
  synth.midiControl(channel, 100, 127);
}

function applyBassPitchBend() {
  const bend = calcPitchBend(bassTranspose);
  if (IS_TAURI) {
    tauriInvoke('audio_set_pitch_bend', { channel: BASS_CHANNEL, bend });
    return;
  }
  if (!synth) return;
  synth.midiPitchBend(BASS_CHANNEL, bend);
}

function getTimbreOctaveShift() {
  const t = TIMBRES.find(x => x.id === currentTimbre);
  return t && typeof t.octaveShift === 'number' ? t.octaveShift : 0;
}

function applyTranspose(midi, isBass) {
  // Baixo NÃO altera MIDI da nota — usa pitch bend via canal (ver setTranspose).
  if (isBass) return midi;
  // Teclado: transpose do usuário + octave shift do timbre atual
  // (timbres orquestrais sem samples graves precisam do shift pra evitar notas mudas)
  const shifted = midi + keyboardTranspose + getTimbreOctaveShift();
  return Math.max(0, Math.min(127, shifted));
}

// HOT PATH — mantido o mais curto possível (sem await, sem resume redundante)
export function noteOn(midi, velocity, isBass) {
  const ch = isBass ? BASS_CHANNEL : PIANO_CHANNEL;
  const key = applyTranspose(midi, isBass);
  const vel = velocity || 100;
  if (IS_TAURI) {
    // Fire-and-forget (async mas não aguarda)
    tauriInvoke('audio_note_on', { channel: ch, key, velocity: vel });
    return;
  }
  if (!synth) {
    if (!initializing) init().catch(() => {});
    return;
  }
  synth.midiNoteOn(ch, key, vel);
}

export function noteOff(midi, isBass) {
  const ch = isBass ? BASS_CHANNEL : PIANO_CHANNEL;
  const key = applyTranspose(midi, isBass);
  if (IS_TAURI) {
    tauriInvoke('audio_note_off', { channel: ch, key });
    return;
  }
  if (!synth) return;
  synth.midiNoteOff(ch, key);
}

export function setVolume(isBass, value) {
  const chan = isBass ? BASS_CHANNEL : PIANO_CHANNEL;
  if (IS_TAURI) {
    tauriInvoke('audio_set_volume', { channel: chan, volume: value });
    return;
  }
  if (!ready || !synth) return;
  synth.midiControl(chan, 7, value);
}

export function setTranspose(isBass, semitones) {
  const clamped = Math.max(-12, Math.min(12, semitones));
  if (isBass) {
    bassTranspose = clamped;
    // Aplica pitch bend no canal do baixo (afeta baixos E acordes igualmente)
    applyBassPitchBend();
  } else {
    keyboardTranspose = clamped;
  }
}

export function getTranspose(isBass) {
  return isBass ? bassTranspose : keyboardTranspose;
}

export function getContext() {
  return audioCtx;
}

// Permite ajuste fino do volume mestre em runtime
export function setMasterGain(value) {
  if (!masterGain) return;
  masterGain.gain.value = Math.max(0, Math.min(10, value));
}
export function getMasterGain() {
  return masterGain ? masterGain.gain.value : DEFAULT_MASTER_GAIN;
}

export function isReady() {
  return ready;
}
