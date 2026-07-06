// BLE-MIDI: conecta teclados MIDI via Web Bluetooth API
// (M-VAVE SMK-25 Mini do RC2, Worlde Easykey, ou qualquer teclado BLE-MIDI padrão).
//
// Suporte:
//   Chrome/Edge no Windows/Mac/Linux/Android — SIM
//   Safari (macOS/iOS) — NÃO (não implementa Web Bluetooth)
//   Firefox — NÃO
//
// Alternativa pra Safari/iOS: parear via Sistema Operacional (Bluetooth do OS)
// e o teclado aparece como dispositivo MIDI USB normal no Web MIDI API.

// UUIDs oficiais do MIDI over BLE (spec da MMA)
const MIDI_SERVICE = '03b80e5a-ede8-4b33-a751-6ce34ec4c700';
const MIDI_CHARACTERISTIC = '7772e5db-3868-4112-a1a9-f2669d106bf3';

export function isBluetoothMIDISupported() {
  return typeof navigator !== 'undefined'
    && !!navigator.bluetooth
    && typeof navigator.bluetooth.requestDevice === 'function';
}

// Conecta ao teclado BLE-MIDI que o usuário escolher no popup do sistema.
// onMessage(midiData: Uint8Array) — chamado a cada mensagem MIDI recebida.
// onDisconnect(device) — chamado quando o link cair.
// Retorna { deviceName, disconnect() }.
export async function connectBluetoothMIDI(onMessage, onDisconnect) {
  if (!isBluetoothMIDISupported()) {
    throw new Error('Web Bluetooth não suportado — use Chrome ou Edge (no Safari, pareie pelo sistema)');
  }

  const btDevice = await navigator.bluetooth.requestDevice({
    filters: [{ services: [MIDI_SERVICE] }],
    optionalServices: []
  });

  btDevice.addEventListener('gattserverdisconnected', () => {
    if (onDisconnect) onDisconnect(btDevice);
  });

  const server = await btDevice.gatt.connect();
  const service = await server.getPrimaryService(MIDI_SERVICE);
  const characteristic = await service.getCharacteristic(MIDI_CHARACTERISTIC);

  await characteristic.startNotifications();
  characteristic.addEventListener('characteristicvaluechanged', (e) => {
    const view = e.target.value;
    const data = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    parseBleMidiPacket(data, onMessage);
  });

  return {
    deviceName: btDevice.name || 'Teclado Bluetooth MIDI',
    device: btDevice,
    disconnect() {
      try { btDevice.gatt?.disconnect(); } catch (_) {}
    }
  };
}

// Parse pacote BLE-MIDI. Formato (spec Apple/MMA):
//
//   [Header]      = 10hhhhhh  — bit 7 = 1, timestampHigh 6 bits
//   [TimestampL]  = 1lllllll  — bit 7 = 1, timestampLow 7 bits
//   [MIDI msg]    = status + data (mesmo formato USB MIDI)
//   [TimestampL2] [MIDI msg2] ...  — mais mensagens no mesmo pacote
//
// Running status: mensagens subsequentes podem OMITIR o status byte
// (o receptor reusa o último status).
function parseBleMidiPacket(data, onMessage) {
  if (data.length < 3) return;
  if (!(data[0] & 0x80)) return;  // header inválido

  let i = 1;
  let runningStatus = 0;

  // A primeira mensagem sempre tem timestamp byte + status
  while (i < data.length) {
    // Se byte atual tem bit 7 = 1, é um TimestampLow (delimitador de mensagem)
    if (data[i] & 0x80) {
      i++;
      if (i >= data.length) break;
    }
    // Próximo byte pode ser status novo OU data (running status)
    let status = runningStatus;
    if (data[i] & 0x80) {
      status = data[i];
      runningStatus = status;
      i++;
    }
    if (!(status & 0x80)) break;  // sem status válido, descarta

    // System Realtime (0xF8-0xFF): 1 byte, sem data
    if (status >= 0xF8) {
      onMessage(new Uint8Array([status]));
      continue;
    }

    const kind = status & 0xF0;
    let dataBytes = 2;
    if (kind === 0xC0 || kind === 0xD0) dataBytes = 1;
    // System Common (0xF0-0xF7): tratamos como noop (raro no teclado padrão)
    if (status >= 0xF0 && status < 0xF8) {
      // Skip SysEx e outros; sem parser completo — evita corromper stream
      break;
    }

    if (i + dataBytes > data.length) break;
    const msg = new Uint8Array(1 + dataBytes);
    msg[0] = status;
    for (let j = 0; j < dataBytes; j++) msg[1 + j] = data[i + j];
    i += dataBytes;
    onMessage(msg);
  }
}
