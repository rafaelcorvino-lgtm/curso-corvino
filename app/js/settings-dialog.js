// Settings dialog - ported from list_devices_midi_screen.dart
import * as midi from './midi-manager.js';
import * as audio from './audio-engine.js';
import { state } from './state.js';
import { isCorvinoDevice } from './midi-data.js';

let dialogEl = null;
let deviceListEl = null;
let statusEl = null;

export function init() {
  dialogEl = document.getElementById('settings-dialog');
  deviceListEl = document.getElementById('device-list');
  statusEl = document.getElementById('midi-status');

  // btn-settings foi removido — MIDI conecta automático no app novo
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    refreshDeviceList();
    dialogEl?.showModal();
  });

  document.getElementById('btn-close-dialog')?.addEventListener('click', () => {
    dialogEl?.close();
  });

  dialogEl?.addEventListener('click', (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });

  // Refresh when devices change
  midi.onDeviceChange(() => {
    if (dialogEl.open) {
      refreshDeviceList();
    }
  });
}

function refreshDeviceList() {
  const devices = midi.getDevices();

  if (!midi.isSupported()) {
    deviceListEl.innerHTML = '<p class="no-devices">Web MIDI API não suportada neste navegador.<br>Use Chrome, Edge ou Opera.</p>';
    statusEl.textContent = '';
    return;
  }

  if (devices.length === 0) {
    deviceListEl.innerHTML = '<p class="no-devices">Nenhum dispositivo MIDI encontrado.<br>Conecte um dispositivo e tente novamente.</p>';
    statusEl.textContent = 'Web MIDI API ativa';
    return;
  }

  deviceListEl.innerHTML = '';
  statusEl.textContent = `${devices.length} dispositivo(s) encontrado(s)`;

  devices.forEach((device) => {
    const item = document.createElement('div');
    item.className = 'device-item';

    const header = document.createElement('div');
    header.className = 'device-header';

    const info = document.createElement('div');
    info.innerHTML = `
      <div class="device-name">${device.name}</div>
      <div class="device-info">${device.type} | ${device.manufacturer || 'N/A'} | ${device.state}</div>
    `;

    const btn = document.createElement('button');
    btn.className = `btn-connect ${device.connected ? 'connected' : ''}`;
    btn.textContent = device.connected ? 'Desconectar' : 'Conectar';
    btn.addEventListener('click', () => {
      if (device.connected) {
        midi.disconnectDevice(device);
      } else {
        midi.connectDevice(device);
      }
      refreshDeviceList();
    });

    header.appendChild(info);
    header.appendChild(btn);
    item.appendChild(header);

    // Volume slider when connected
    if (device.connected) {
      const vol = state.getVolume(device.name);
      const volumeDiv = document.createElement('div');
      volumeDiv.className = 'volume-control';

      const label = document.createElement('label');
      label.textContent = 'Volume:';

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '0';
      slider.max = '127';
      slider.value = vol.value;

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'volume-value';
      valueDisplay.textContent = vol.value;

      slider.addEventListener('input', () => {
        const v = parseInt(slider.value);
        valueDisplay.textContent = v;
        const isPiano = !isCorvinoDevice(device.name);
        state.setVolume(device.name, v, isPiano);
        audio.setVolume(!isPiano, v);
      });

      volumeDiv.appendChild(label);
      volumeDiv.appendChild(slider);
      volumeDiv.appendChild(valueDisplay);
      item.appendChild(volumeDiv);
    }

    deviceListEl.appendChild(item);
  });
}
