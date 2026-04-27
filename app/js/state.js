// Simple reactive state management (replaces MobX from Flutter app)

class State {
  constructor() {
    this._activeBass = new Set();
    this._activePiano = new Set();
    this._volumes = new Map(); // deviceName -> { value, isPiano }
    this._connectedDevices = new Map(); // id -> MIDIPort
    this._listeners = new Map();
    this._keyboardConnected = false;
    this._bassConnected = false;
  }

  // Connection flags (Teclado / Baixo)
  setKeyboardConnected(v) {
    if (this._keyboardConnected === v) return;
    this._keyboardConnected = v;
    this._emit('keyboardConnected', v);
  }
  setBassConnected(v) {
    if (this._bassConnected === v) return;
    this._bassConnected = v;
    this._emit('bassConnected', v);
  }
  isKeyboardConnected() { return this._keyboardConnected; }
  isBassConnected() { return this._bassConnected; }

  // Event system
  on(event, callback) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    this._listeners.get(event).push(callback);
  }

  _emit(event, data) {
    const cbs = this._listeners.get(event) || [];
    cbs.forEach(cb => cb(data));
  }

  // Bass notes
  bassNoteOn(midi) {
    this._activeBass.add(midi);
    this._emit('bass', { midi, on: true });
  }

  bassNoteOff(midi) {
    this._activeBass.delete(midi);
    this._emit('bass', { midi, on: false });
  }

  isBassActive(midi) {
    return this._activeBass.has(midi);
  }

  // Piano notes
  pianoNoteOn(midi) {
    this._activePiano.add(midi);
    this._emit('piano', { midi, on: true });
  }

  pianoNoteOff(midi) {
    this._activePiano.delete(midi);
    this._emit('piano', { midi, on: false });
  }

  isPianoActive(midi) {
    return this._activePiano.has(midi);
  }

  // Volume
  setVolume(deviceName, value, isPiano) {
    this._volumes.set(deviceName, { value, isPiano });
    this._emit('volume', { deviceName, value, isPiano });
  }

  getVolume(deviceName) {
    return this._volumes.get(deviceName) || { value: 110, isPiano: true };
  }

  // Devices
  addDevice(id, port) {
    this._connectedDevices.set(id, port);
    this._emit('devices', { action: 'add', id, port });
  }

  removeDevice(id) {
    this._connectedDevices.delete(id);
    this._emit('devices', { action: 'remove', id });
  }

  getConnectedDevices() {
    return this._connectedDevices;
  }
}

export const state = new State();
