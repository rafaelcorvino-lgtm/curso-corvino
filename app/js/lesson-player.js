// Lesson system - interactive lessons with visual note guidance
// Ported from lessons feature in the updated desktop app
import { state } from './state.js';
import * as audio from './audio-engine.js';

const LESSONS = [
  { id: 'baiao_basico',     file: 'assets/lessons/baiao_basico.json' },
  { id: 'escala_do_maior',  file: 'assets/lessons/escala_do_maior.json' },
  { id: 'forrozinho',       file: 'assets/lessons/forrozinho.json' },
];

let lessonData = null;
let isPlaying = false;
let currentBeat = 0;
let timerId = null;
let onStateChangeCallback = null;
let onNoteCallback = null;
let loadedLessons = new Map();

export function onStateChange(cb) { onStateChangeCallback = cb; }
export function onNote(cb) { onNoteCallback = cb; }

function emitState() {
  if (onStateChangeCallback) {
    onStateChangeCallback({ isPlaying, lessonData, currentBeat });
  }
}

export async function loadLesson(lessonId) {
  if (loadedLessons.has(lessonId)) {
    lessonData = loadedLessons.get(lessonId);
    emitState();
    return lessonData;
  }

  const lesson = LESSONS.find(l => l.id === lessonId);
  if (!lesson) return null;

  try {
    const resp = await fetch(lesson.file);
    lessonData = await resp.json();
    loadedLessons.set(lessonId, lessonData);
    emitState();
    return lessonData;
  } catch (err) {
    console.error('Failed to load lesson:', err);
    return null;
  }
}

export async function getLessonList() {
  // Load all lesson metadata
  const list = [];
  for (const l of LESSONS) {
    try {
      if (loadedLessons.has(l.id)) {
        const data = loadedLessons.get(l.id);
        list.push({ id: l.id, name: data.name, category: data.category, bpm: data.bpm, difficulty: data.difficulty });
      } else {
        const resp = await fetch(l.file);
        const data = await resp.json();
        loadedLessons.set(l.id, data);
        list.push({ id: l.id, name: data.name, category: data.category, bpm: data.bpm, difficulty: data.difficulty });
      }
    } catch (e) {
      console.warn('Could not load lesson', l.id, e);
    }
  }
  return list;
}

export function play() {
  if (!lessonData || isPlaying) return;

  audio.init();
  audio.resume();
  isPlaying = true;
  currentBeat = 0;

  const bpm = lessonData.bpm || 120;
  const msPerBeat = 60000 / bpm;
  const notes = lessonData.notes;
  const totalBeats = Math.max(...notes.map(n => n.startBeat + n.duration)) + 1;

  // Schedule all notes
  const startTime = performance.now();

  function tick() {
    const elapsed = performance.now() - startTime;
    currentBeat = elapsed / msPerBeat;

    if (currentBeat >= totalBeats) {
      stop();
      return;
    }

    emitState();
    timerId = requestAnimationFrame(tick);
  }

  // Schedule note events using setTimeout for precise timing
  notes.forEach(note => {
    const noteStartMs = note.startBeat * msPerBeat;
    const noteDurationMs = note.duration * msPerBeat;
    const isBass = note.channel === 1;

    setTimeout(() => {
      if (!isPlaying) return;
      audio.noteOn(note.midi, 100, isBass);
      if (isBass) {
        state.bassNoteOn(note.midi);
      } else {
        state.pianoNoteOn(note.midi);
      }
      if (onNoteCallback) onNoteCallback({ ...note, on: true });

      setTimeout(() => {
        audio.noteOff(note.midi, isBass);
        if (isBass) {
          state.bassNoteOff(note.midi);
        } else {
          state.pianoNoteOff(note.midi);
        }
        if (onNoteCallback) onNoteCallback({ ...note, on: false });
      }, noteDurationMs);
    }, noteStartMs);
  });

  tick();
  emitState();
}

export function stop() {
  isPlaying = false;
  currentBeat = 0;
  if (timerId) {
    cancelAnimationFrame(timerId);
    timerId = null;
  }
  emitState();
}

export function getState() {
  return { isPlaying, lessonData, currentBeat };
}

export function getLessons() {
  return LESSONS;
}
