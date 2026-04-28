// Web MIDI API manager - ported from midi_command_store.dart
import { state } from './state.js';
import { isCorvinoDevice, isBassDevice, isKeyboardDevice } from './midi-data.js';
import * as audio from './audio-engine.js';

let midiAccess = null;
let onDeviceChangeCallback = null;

export async function init() {
  if (!navigator.requestMIDIAccess) {
    console.warn('Web MIDI API not supported in this browser');
    return false;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    midiAccess.onstatechange = handleStateChange;
    // Log todos os dispositivos MIDI detectados (útil pra debug)
    console.log('[MIDI] === Dispositivos MIDI detectados ===');
    for (const [id, input] of midiAccess.inputs) {
      console.log('[MIDI] INPUT  →', JSON.stringify({
        name: input.name,
        manufacturer: input.manufacturer,
        state: input.state,
        classified: isBassDevice(input.name) ? 'BAIXO' : 'TECLADO'
      }));
    }
    if (midiAccess.inputs.size === 0) console.log('[MIDI] Nenhum dispositivo input detectado.');
    // Auto-conectar TUDO que estiver plugado
    autoConnectAll();
    return true;
  } catch (err) {
    console.error('MIDI access denied:', err);
    return false;
  }
}

// Sincroniza state com o que está realmente plugado:
// — Conecta qualquer dispositivo MIDI novo (Corvino SINCO/Arduino, Yamaha, Casio, etc.)
// — Remove do state dispositivos que foram desplugados
function autoConnectAll() {
  if (!midiAccess) return;

  // 1) Indexa o que o browser vê agora (nome → input)
  const currentlyPresent = new Map();
  for (const [, input] of midiAccess.inputs) {
    if (input.state === 'connected') {
      currentlyPresent.set(input.name || '', input);
    }
  }

  // 2) Remove do state dispositivos que sumiram (desplugados)
  const tracked = Array.from(state.getConnectedDevices().keys());
  for (const name of tracked) {
    if (!currentlyPresent.has(name)) {
      const dev = state.getConnectedDevices().get(name);
      if (dev) disconnectDevice(dev);
      else state.removeDevice(name);
      console.log('[MIDI] Desconectado:', name);
    }
  }

  // 3) Conecta dispositivos novos que apareceram
  for (const [name, input] of currentlyPresent) {
    if (state.getConnectedDevices().has(name)) continue;
    connectDevice({
      id: input.id,
      name,
      manufacturer: input.manufacturer || '',
      state: input.state,
      type: 'input',
      inputPort: input,
      outputPort: null,
      connected: false,
      _listener: null,
    });
  }

  refreshConnectionFlags();
}

// Alias para manter API antiga funcionando
const autoConnectCorvino = autoConnectAll;

function refreshConnectionFlags() {
  let kb = false, bs = false;
  for (const name of state.getConnectedDevices().keys()) {
    if (isBassDevice(name)) {
      bs = true;
    } else {
      // Qualquer outro dispositivo (Corvino SINCO, Yamaha, Casio, Roland, MIDI generic…) = teclado
      kb = true;
    }
  }
  state.setKeyboardConnected(kb);
  state.setBassConnected(bs);
}

function handleStateChange(e) {
  // Auto-reconectar/desconectar quando dispositivos mudam
  autoConnectCorvino();
  if (onDeviceChangeCallback) {
    onDeviceChangeCallback();
  }
}

export function onDeviceChange(callback) {
  onDeviceChangeCallback = callback;
}

export function getDevices() {
  if (!midiAccess) return [];

  const devices = [];
  const seen = new Set();

  // Collect inputs
  for (const [id, input] of midiAccess.inputs) {
    const key = input.name || id;
    if (!seen.has(key)) {
      seen.add(key);
      devices.push({
        id,
        name: input.name || 'Unknown Device',
        manufacturer: input.manufacturer || '',
        state: input.state,
        type: 'input',
        inputPort: input,
        outputPort: null,
        connected: false,
        _listener: null,
      });
    }
  }

  // Match outputs to inputs
  for (const [id, output] of midiAccess.outputs) {
    const existing = devices.find(d => d.name === output.name);
    if (existing) {
      existing.outputPort = output;
      existing.type = 'input/output';
    } else {
      devices.push({
        id,
        name: output.name || 'Unknown Device',
        manufacturer: output.manufacturer || '',
        state: output.state,
        type: 'output',
        inputPort: null,
        outputPort: output,
        connected: false,
        _listener: null,
      });
    }
  }

  // Mark connected devices
  for (const d of devices) {
    d.connected = state.getConnectedDevices().has(d.name);
  }

  return devices;
}

export function connectDevice(device) {
  if (!device.inputPort) return;

  // Pre-calcula se é baixo UMA vez (evita string check em cada nota tocada)
  device._isBass = isBassDevice(device.name);

  const listener = (event) => handleMidiMessage(event, device);
  device.inputPort.onmidimessage = listener;
  device._listener = listener;
  device.connected = true;
  state.addDevice(device.name, device);
  console.log('[MIDI] Auto-conectado:', device.name, device._isBass ? '(BAIXO)' : '(TECLADO)');
  refreshConnectionFlags();
}

export function disconnectDevice(device) {
  if (device.inputPort) {
    device.inputPort.onmidimessage = null;
  }
  device._listener = null;
  device.connected = false;
  state.removeDevice(device.name);
  refreshConnectionFlags();
}

function handleMidiMessage(event, device) {
  const data = event.data;
  if (!data || data.length < 3) return;

  const status = data[0] & 0xF0;
  const note = data[1];
  const velocity = data[2];
  const isBass = device._isBass;  // pré-calculado em connectDevice

  // HOT PATH: áudio primeiro, state/UI depois (outros status são ignorados)
  if (status === 0x90 && velocity > 0) {
    audio.noteOn(note, velocity, isBass);
    if (isBass) state.bassNoteOn(note); else state.pianoNoteOn(note);
    relayMidiToParent('noteOn', note, velocity, isBass);
  } else if (status === 0x80 || (status === 0x90 && velocity === 0)) {
    audio.noteOff(note, isBass);
    if (isBass) state.bassNoteOff(note); else state.pianoNoteOff(note);
    relayMidiToParent('noteOff', note, 0, isBass);
  }
}

// Relay MIDI events do Corvino real pro parent (curso). Necessário pra
// Synthesia/score-player saberem que o aluno tocou — tanto via teclado
// do computador (já tratado pelo keyboard-input.js) quanto via Corvino
// MIDI físico (que entra direto aqui sem passar pelo browser keydown).
function relayMidiToParent(evtName, midi, velocity, isBass) {
  if (!window.parent || window.parent === window) return;
  try {
    window.parent.postMessage({
      type: 'corvino:midiInput',
      evt: evtName,        // 'noteOn' | 'noteOff'
      midi,
      velocity,
      isBass,
    }, '*');
  } catch (_) {}
}

export function isSupported() {
  return !!navigator.requestMIDIAccess;
}
