// Audio engine using FluidSynth WASM with real SF2 SoundFont files
// Replaces oscillator-based synthesis with actual SoundFont playback

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

export async function init() {
  if (ready || initializing) return;
  initializing = true;

  try {
    // Wait for JSSynth (loaded via script tag)
    await JSSynth.waitForReady();

    // AudioContext com hint explícito de baixa latência
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx({
      latencyHint: 'interactive',    // prioriza latência sobre power-saving
      sampleRate: 48000,             // 48kHz padrão
    });

    // ScriptProcessor com buffer 256 samples (~5.3ms @ 48kHz)
    // 256 é o MÍNIMO permitido pela spec do navegador (BaseAudioContext.createScriptProcessor)
    // — tentativa de usar 128 falha com IndexSizeError.
    // Pra ir abaixo disso, só com AudioWorklet (requer bundling custom do libfluidsynth).
    synth = new JSSynth.Synthesizer();
    synth.init(audioCtx.sampleRate);
    audioNode = synth.createAudioNode(audioCtx, 256);
    console.log('[CorvinoAudio] Usando ScriptProcessor buffer=256 (~5.3ms, mínimo do spec)');

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
    console.log('[CorvinoAudio] Latência: buffer=~5.3ms, base=' + baseLatency + 'ms, output=' + outputLatency + 'ms, sampleRate=' + audioCtx.sampleRate + 'Hz');
  } catch (err) {
    console.error('[CorvinoAudio] Init failed:', err);
    initializing = false;
    emitLoading(null);
    throw err;
  }
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
  currentTimbre = timbreId;
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
  if (!synth) return;
  synth.midiPitchBend(BASS_CHANNEL, calcPitchBend(bassTranspose));
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
  if (!synth) {
    if (!initializing) init().catch(() => {});
    return;
  }
  synth.midiNoteOn(isBass ? BASS_CHANNEL : PIANO_CHANNEL, applyTranspose(midi, isBass), velocity || 100);
}

export function noteOff(midi, isBass) {
  if (!synth) return;
  synth.midiNoteOff(isBass ? BASS_CHANNEL : PIANO_CHANNEL, applyTranspose(midi, isBass));
}

export function setVolume(isBass, value) {
  if (!ready || !synth) return;
  // CC7 = channel volume, value 0-127
  const chan = isBass ? BASS_CHANNEL : PIANO_CHANNEL;
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
