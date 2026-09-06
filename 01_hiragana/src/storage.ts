export const STORAGE_KEY = 'moji-no-mori:v1';
export interface Preferences { sound: boolean; rate: number; reduceMotion: boolean }
export interface Progress {
  version: 1;
  courses: Record<string, { played: string[]; stamps: number }>;
  settings: Preferences;
}
export const emptyProgress = (): Progress => ({ version: 1, courses: {}, settings: { sound: true, rate: 0.85, reduceMotion: false } });

export function parseProgress(raw: string | null): Progress {
  const defaults = emptyProgress();
  if (!raw) return defaults;
  try {
    const value = JSON.parse(raw);
    if (value?.version !== 1 || typeof value.courses !== 'object' || !value.courses) return defaults;
    for (const [key, data] of Object.entries(value.courses)) {
      const course = data as { played?: unknown; stamps?: unknown };
      if (!course || !Array.isArray(course.played) || !course.played.every(id => typeof id === 'string')) continue;
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      defaults.courses[key] = {
        played: [...new Set(course.played)] as string[],
        stamps: typeof course.stamps === 'number' && Number.isSafeInteger(course.stamps) && course.stamps >= 0 ? course.stamps : 0,
      };
    }
    const settings = value.settings;
    if (typeof settings?.sound === 'boolean') defaults.settings.sound = settings.sound;
    if ([0.7, 0.85, 1].includes(settings?.rate)) defaults.settings.rate = settings.rate;
    if (typeof settings?.reduceMotion === 'boolean') defaults.settings.reduceMotion = settings.reduceMotion;
    return defaults;
  } catch { return defaults; }
}

export class ProgressStore {
  data = emptyProgress();
  available = true;
  constructor() {
    try { this.data = parseProgress(window.localStorage.getItem(STORAGE_KEY)); }
    catch { this.available = false; }
  }
  course(id: string) { return this.data.courses[id] ??= { played: [], stamps: 0 }; }
  save() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data)); }
    catch { this.available = false; }
  }
  recordLetter(courseId: string, letterId: string) {
    const course = this.course(courseId);
    if (!course.played.includes(letterId)) course.played.push(letterId);
    this.save();
  }
  awardStamp(courseId: string) { this.course(courseId).stamps++; this.save(); }
  reset() { this.data.courses = {}; this.save(); }
}
