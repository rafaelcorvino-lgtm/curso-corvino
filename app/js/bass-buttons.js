// Bass button grid - ported from home_screen.dart _buildLow()
import { BASS_ROWS, RED_MARKERS, ROW_OFFSETS_PHONE } from './midi-data.js';
import { state } from './state.js';
import * as audio from './audio-engine.js';

const bassElements = new Map(); // midi+row -> DOM element

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

// Correção de semitons para labels de contra-baixo (row 4) onde o MIDI do
// soundfont não corresponde à nota real do Stradella.
// (do home_screen.dart: _counterbassLabelCorrection = {55: 1})
const COUNTERBASS_LABEL_CORRECTION = { 55: 1 };

// Convenção do app Flutter (home_screen.dart _bassNoteNameWithRow):
//   row 0 = acordes com 7ª  → label "7" (FIXO, não muda com transpose)
//   row 1 = acordes menores → label "m" (FIXO)
//   row 2 = acordes maiores → label "M" (FIXO)
//   row 3 = baixos          → nome da nota com bass transpose
//   row 4 = contra-baixos   → nome da nota com bass transpose + correção
function bassLabel(midi, rowIndex) {
  const tr = audio.getTranspose(true); // bass transpose
  switch (rowIndex) {
    case 0: return '7';
    case 1: return 'm';
    case 2: return 'M';
    case 3: {
      const n = midi + tr;
      return NOTE_NAMES[((n % 12) + 12) % 12];
    }
    case 4: {
      const correction = COUNTERBASS_LABEL_CORRECTION[midi] ?? 0;
      const n = midi + tr + correction;
      return NOTE_NAMES[((n % 12) + 12) % 12];
    }
    default: return NOTE_NAMES[((midi % 12) + 12) % 12];
  }
}

// Re-aplica os labels em todos os botões de baixo (chamado quando transpose muda)
export function refreshLabels() {
  for (const [key, el] of bassElements) {
    const midi = parseInt(el.dataset.midi);
    const row = parseInt(el.dataset.row);
    el.textContent = bassLabel(midi, row);
  }
}

export function render(container) {
  container.innerHTML = '';

  // Scale offsets based on screen width
  const screenW = window.innerWidth;
  const scaleFactor = screenW / 1280;

  BASS_ROWS.forEach((row, rowIndex) => {
    const rowDiv = document.createElement('div');
    rowDiv.className = 'bass-row';
    rowDiv.dataset.row = rowIndex;

    // Apply diagonal offset scaled to screen
    const offsets = ROW_OFFSETS_PHONE[rowIndex];
    rowDiv.style.marginLeft = `${offsets.left * scaleFactor * 0.5}px`;

    row.forEach((midi) => {
      const btn = document.createElement('button');
      btn.className = 'bass-btn';
      btn.dataset.midi = midi;
      btn.dataset.row = rowIndex;
      btn.textContent = bassLabel(midi, rowIndex);

      // Red markers on row 3 for MIDI 28 and 24 (Dó e Mi de referência)
      if (rowIndex === RED_MARKERS.row && RED_MARKERS.midis.includes(midi)) {
        btn.classList.add('red-marker');
      }

      // Touch/pointer events — HOT PATH: áudio primeiro, resto depois
      btn.addEventListener('pointerdown', (e) => {
        // 1º: dispara áudio imediato (prioridade absoluta)
        audio.noteOn(midi, 100, true);
        // 2º: overhead de UI/state depois (não afeta latência percebida)
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        state.bassNoteOn(midi);
      }, { passive: false });

      btn.addEventListener('pointerup', (e) => {
        // Áudio primeiro
        audio.noteOff(midi, true);
        e.preventDefault();
        state.bassNoteOff(midi);
      }, { passive: false });

      btn.addEventListener('pointercancel', () => {
        audio.noteOff(midi, true);
        state.bassNoteOff(midi);
      });

      btn.addEventListener('pointerleave', () => {
        if (state.isBassActive(midi)) {
          audio.noteOff(midi, true);
          state.bassNoteOff(midi);
        }
      });

      // Store reference for reactive updates
      const key = `${midi}-${rowIndex}`;
      bassElements.set(key, btn);

      rowDiv.appendChild(btn);
    });

    container.appendChild(rowDiv);
  });

  // Listen for state changes to update visual
  state.on('bass', ({ midi, on }) => {
    // Update all buttons with this MIDI value
    BASS_ROWS.forEach((row, rowIndex) => {
      row.forEach((m) => {
        if (m === midi) {
          const key = `${m}-${rowIndex}`;
          const el = bassElements.get(key);
          if (el) {
            el.classList.toggle('active', on);
          }
        }
      });
    });
  });
}
