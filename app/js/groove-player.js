// Groove player - plays backing track MP3s
// Ported from GrooveStore in the updated desktop app
import * as audio from './audio-engine.js';

const GROOVES = [
  { id: 'valsa',     name: 'Valsa',      file: 'assets/grooves/VALSA.mp3' },
  { id: 'baiao',     name: 'Baião',      file: 'assets/grooves/BAIAO.mp3' },
  { id: 'quadrilha', name: 'Quadrilha',  file: 'assets/grooves/QUADRILHA.mp3' },
  { id: 'arrastape', name: 'Arrastapé',  file: 'assets/grooves/ARRASTAPE.mp3' },
  { id: 'guarania',  name: 'Guarânia',   file: 'assets/grooves/GUARANIA.mp3' },
  { id: 'vanera',    name: 'Vanera',     file: 'assets/grooves/VANERA_OU_VANERAO.mp3' },
  { id: 'xote',      name: 'Xote',       file: 'assets/grooves/XOTE.mp3' },
];

let currentGroove = null;
let audioElement = null;
let isPlaying = false;
let onStateChangeCallback = null;

// Persiste entre play() chamadas — aluno não perde ajuste ao trocar ritmo
let currentVolume = 60;  // 0-100
let currentSpeed  = 1.0; // 0.5 - 1.5

export function getGrooves() {
  return GROOVES;
}

export function onStateChange(cb) {
  onStateChangeCallback = cb;
}

function emitState() {
  if (onStateChangeCallback) {
    onStateChangeCallback({ isPlaying, currentGroove });
  }
}

export function play(grooveId) {
  audio.init();
  audio.resume();

  const groove = GROOVES.find(g => g.id === grooveId);
  if (!groove) return;

  // Stop current if different
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }

  currentGroove = groove;
  audioElement = new Audio(groove.file);
  audioElement.loop = true;
  audioElement.volume = currentVolume / 100;
  audioElement.playbackRate = currentSpeed;
  // Preserva o pitch ao mudar velocidade (nem todos os browsers respeitam)
  audioElement.preservesPitch = true;
  audioElement.mozPreservesPitch = true;
  audioElement.webkitPreservesPitch = true;

  audioElement.play().then(() => {
    isPlaying = true;
    emitState();
  }).catch(err => {
    console.warn('Groove playback failed:', err);
  });

  audioElement.addEventListener('ended', () => {
    // Loop is set, but just in case
    isPlaying = false;
    emitState();
  });
}

export function stop() {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
  isPlaying = false;
  currentGroove = null;
  emitState();
}

export function toggle(grooveId) {
  if (isPlaying && currentGroove && currentGroove.id === grooveId) {
    stop();
  } else {
    play(grooveId);
  }
}

export function setVolume(value) {
  // value: 0-100
  currentVolume = Math.max(0, Math.min(100, value));
  if (audioElement) audioElement.volume = currentVolume / 100;
}
export function getVolume() { return currentVolume; }

export function setSpeed(value) {
  // value: 0.5 - 1.5 (0.5× = metade da velocidade, 1.5× = 50% mais rápido)
  currentSpeed = Math.max(0.5, Math.min(1.5, value));
  if (audioElement) audioElement.playbackRate = currentSpeed;
}
export function getSpeed() { return currentSpeed; }

export function getState() {
  return { isPlaying, currentGroove, volume: currentVolume, speed: currentSpeed };
}
