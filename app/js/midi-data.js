// Bass button MIDI mappings - ported from low.dart
// 5 rows of 8 buttons each, arranged diagonally like a real accordion
export const BASS_ROWS = [
  [21, 52, 53, 46, 39, 44, 37, 42],  // Row 1
  [22, 47, 40, 45, 38, 43, 36, 41],  // Row 2
  [23, 50, 48, 34, 27, 32, 25, 30],  // Row 3
  [54, 35, 28, 33, 26, 31, 24, 29],  // Row 4 (has red markers: 28, 24)
  [20, 51, 55, 49, 54, 35, 28, 33],  // Row 5
];

// Red marker buttons: row index 3, MIDI values 28 and 24
export const RED_MARKERS = { row: 3, midis: [28, 24] };

// MIDIs que são baixos (rows 3 e 4) — o transpose só se aplica a estes,
// porque os MIDIs dos acordes (rows 0,1,2) seguem outra lógica no soundfont
// e somar +1 semitom a um acorde MIDI quebra o mapeamento.
const BAIXO_MIDIS = new Set([
  ...BASS_ROWS[3], // baixo fundamental
  ...BASS_ROWS[4], // contra-baixo
]);
export function isBaixoMidi(midi) { return BAIXO_MIDIS.has(midi); }

// Row offsets in pixels (phone) - staggered diagonal layout
// Ported from getPaddingLow() in home_screen.dart
export const ROW_OFFSETS_PHONE = [
  { left: 0,   right: 80 },   // Row 0: shifted left
  { left: 60,  right: 100 },  // Row 1
  { left: 120, right: 120 },  // Row 2: centered
  { left: 180, right: 140 },  // Row 3
  { left: 240, right: 160 },  // Row 4: shifted most right
];

// Piano key layout - ported from piano.dart
// Standard chromatic scale pattern for one octave
const OCTAVE_PATTERN = [
  { offset: 0,  accidental: false }, // C
  { offset: 1,  accidental: true  }, // C#
  { offset: 2,  accidental: false }, // D
  { offset: 3,  accidental: true  }, // D#
  { offset: 4,  accidental: false }, // E
  { offset: 5,  accidental: false }, // F
  { offset: 6,  accidental: true  }, // F#
  { offset: 7,  accidental: false }, // G
  { offset: 8,  accidental: true  }, // G#
  { offset: 9,  accidental: false }, // A
  { offset: 10, accidental: true  }, // A#
  { offset: 11, accidental: false }, // B
];

// Note names for display
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Generate piano keys from MIDI 48 (C4) to MIDI 84 (C7) - 3 octaves
export function generatePianoKeys(startMidi = 48, endMidi = 84) {
  const keys = [];
  for (let midi = startMidi; midi <= endMidi; midi++) {
    const noteIndex = midi % 12;
    keys.push({
      midi,
      accidental: OCTAVE_PATTERN[noteIndex].accidental,
      name: NOTE_NAMES[noteIndex] + Math.floor(midi / 12 - 1),
    });
  }
  return keys;
}

// Check if a device name corresponds to the Corvino accordion (bass controller)
// Padrões reais observados nos diagnósticos:
//   "Arduino LLC Corvino Acordeon Midi" → baixo
//   "Jieli Technology SINCO"            → teclado
export function isCorvinoDevice(name) {
  const n = (name || '').toLowerCase();
  return n.includes('corvino') || n.includes('arduino') || n.includes('sinco') || n.includes('jieli');
}

// Identifica especificamente o BAIXO (40 botões) — Arduino-based
export function isBassDevice(name) {
  const n = (name || '').toLowerCase();
  return n.includes('arduino') || n.includes('corvino');
}

// Identifica especificamente o TECLADO — chip Jieli/SINCO
export function isKeyboardDevice(name) {
  const n = (name || '').toLowerCase();
  return n.includes('sinco') || n.includes('jieli');
}
