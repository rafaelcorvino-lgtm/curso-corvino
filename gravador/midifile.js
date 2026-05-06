// Gerador de Standard MIDI File (SMF Tipo 1) — minimalista, só o que precisa
// pra exportar a gravação do Corvino e abrir no MuseScore.
//
// Tradução dos baixos do Corvino → notas reais:
//   Row 3 (fundamental)  → MIDI = pitch_class + 36  (oitava 2)
//   Row 4 (contra-baixo) → MIDI = (pitch_class + correction) + 48  (oitava 3)
//   Row 0 (acorde 7)     → tríade [3M, 5J, 7m]  (Stradella, sem fundamental) na oitava 3
//   Row 1 (acorde m)     → tríade [1, 3m, 5J]   na oitava 3
//   Row 2 (acorde M)     → tríade [1, 3M, 5J]   na oitava 3
//
// Pitch class por coluna inferida de BASS_ROWS[3] = [54,35,28,33,26,31,24,29]
//   col: Fá# | Si | Mi | Lá | Ré | Sol | Dó | Fá

import { BASS_ROWS } from '../app/js/midi-data.js';

const COL_ROOT_PC = BASS_ROWS[3].map(m => ((m % 12) + 12) % 12); // 8 colunas
const COUNTERBASS_LABEL_CORRECTION = { 55: 1 };

function colOf(midi, rowIndex) {
  const row = BASS_ROWS[rowIndex];
  if (!row) return -1;
  return row.indexOf(midi);
}

export function bassRowOf(midi) {
  for (let r = 0; r < BASS_ROWS.length; r++) {
    if (BASS_ROWS[r].includes(midi)) return r;
  }
  return -1;
}

// Converte um botão de baixo do Corvino em uma OU MAIS notas MIDI reais.
// Retorna array de pitches (vazio se não conseguir mapear).
export function bassMidiToRealNotes(midi) {
  const row = bassRowOf(midi);
  if (row === -1) return [];

  if (row === 3) {
    // Baixo fundamental
    const pc = ((midi % 12) + 12) % 12;
    return [pc + 36];
  }
  if (row === 4) {
    // Contra-baixo (com correção do soundfont)
    const corr = COUNTERBASS_LABEL_CORRECTION[midi] || 0;
    const pc = (((midi + corr) % 12) + 12) % 12;
    return [pc + 48];
  }

  // Acordes (rows 0, 1, 2) — tônica vem da coluna do botão
  const col = colOf(midi, row);
  if (col === -1 || col >= COL_ROOT_PC.length) return [];
  const root = COL_ROOT_PC[col] + 48; // oitava 3 como base do acorde

  if (row === 2) return [root, root + 4, root + 7];          // Maior
  if (row === 1) return [root, root + 3, root + 7];          // menor
  if (row === 0) return [root + 4, root + 7, root + 10];     // 7ª (3M, 5J, 7m)

  return [];
}

// =====================================================================
// SMF binary writer
// =====================================================================

function writeVarLen(value) {
  // Variable-length quantity (0..0x0FFFFFFF), 7 bits por byte, MSB=1 exceto último
  const bytes = [];
  bytes.push(value & 0x7F);
  value >>= 7;
  while (value > 0) {
    bytes.push((value & 0x7F) | 0x80);
    value >>= 7;
  }
  bytes.reverse();
  return bytes;
}

function writeStr(s) { return [...s].map(c => c.charCodeAt(0) & 0xFF); }
function writeU16(n) { return [(n >> 8) & 0xFF, n & 0xFF]; }
function writeU32(n) { return [(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]; }

function buildTrack(events /* [{tick, status, data1, data2}], em ticks absolutos */, opts = {}) {
  // Ordena por tick estável
  const sorted = events.slice().sort((a, b) => a.tick - b.tick);
  const bytes = [];

  // Meta: nome do track
  if (opts.name) {
    const nameBytes = writeStr(opts.name);
    bytes.push(...writeVarLen(0), 0xFF, 0x03, ...writeVarLen(nameBytes.length), ...nameBytes);
  }
  // Meta: tempo (microssegundos por quarter note) — só no track 0
  if (typeof opts.bpm === 'number') {
    const usPerQuarter = Math.round(60_000_000 / opts.bpm);
    bytes.push(...writeVarLen(0), 0xFF, 0x51, 0x03,
      (usPerQuarter >> 16) & 0xFF, (usPerQuarter >> 8) & 0xFF, usPerQuarter & 0xFF);
  }
  // Meta: time signature 4/4 — só no track 0
  if (opts.timeSig) {
    bytes.push(...writeVarLen(0), 0xFF, 0x58, 0x04, 4, 2, 24, 8);
  }

  let lastTick = 0;
  for (const ev of sorted) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    bytes.push(...writeVarLen(delta));
    bytes.push(ev.status, ev.data1, ev.data2);
  }
  // End of track
  bytes.push(...writeVarLen(0), 0xFF, 0x2F, 0x00);

  // Wrap em chunk MTrk
  const chunk = [];
  chunk.push(...writeStr('MTrk'));
  chunk.push(...writeU32(bytes.length));
  chunk.push(...bytes);
  return chunk;
}

/**
 * Gera um arquivo .mid (SMF Tipo 1) a partir das notas gravadas.
 *
 * @param {Array} notes — [{t: seconds, dur: seconds, midi, isBass, velocity}]
 * @param {Object} opts — { bpm, ppq?, mdName?, meName? }
 * @returns {Uint8Array}
 */
export function buildMidiFile(notes, opts = {}) {
  const bpm = opts.bpm || 120;
  const ppq = opts.ppq || 480; // pulses per quarter
  const secondsPerTick = 60 / (bpm * ppq);

  const mdEvents = []; // canal 0
  const meEvents = []; // canal 1

  for (const n of notes) {
    const startTick = Math.max(0, Math.round(n.t / secondsPerTick));
    const endTick   = Math.max(startTick + 1, Math.round((n.t + n.dur) / secondsPerTick));
    const vel       = Math.max(1, Math.min(127, n.velocity || 100));

    if (n.isBass) {
      // Traduz baixo Corvino em 1+ pitches reais
      const pitches = bassMidiToRealNotes(n.midi);
      if (pitches.length === 0) continue;
      for (const p of pitches) {
        meEvents.push({ tick: startTick, status: 0x91, data1: p, data2: vel });
        meEvents.push({ tick: endTick,   status: 0x81, data1: p, data2: 0 });
      }
    } else {
      // MD: MIDI já é nota real
      const p = Math.max(0, Math.min(127, n.midi));
      mdEvents.push({ tick: startTick, status: 0x90, data1: p, data2: vel });
      mdEvents.push({ tick: endTick,   status: 0x80, data1: p, data2: 0 });
    }
  }

  // Header MThd: format 1, 2 tracks (track 0 = meta+MD, track 1 = ME)
  // Pra simplificar usamos 3 tracks: meta, MD, ME — facilita pra MuseScore separar.
  const meta = buildTrack([], { name: 'Corvino — gravação', bpm, timeSig: true });
  const md   = buildTrack(mdEvents, { name: 'Mão direita' });
  const me   = buildTrack(meEvents, { name: 'Mão esquerda (baixo)' });

  const header = [];
  header.push(...writeStr('MThd'));
  header.push(...writeU32(6));
  header.push(...writeU16(1));   // format 1
  header.push(...writeU16(3));   // 3 tracks
  header.push(...writeU16(ppq));

  const all = new Uint8Array(header.length + meta.length + md.length + me.length);
  let off = 0;
  all.set(header, off); off += header.length;
  all.set(meta,   off); off += meta.length;
  all.set(md,     off); off += md.length;
  all.set(me,     off);
  return all;
}
