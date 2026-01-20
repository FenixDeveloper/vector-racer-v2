// Centralized language strings for easy localization
// Currently Russian, can be swapped for multi-language support

export const LANG = {
  // Game title
  title: 'Векторный Гонщик',

  // Connection status
  connecting: 'Подключение...',
  connected: 'Подключено',
  disconnected: 'Отключено',
  room: 'Комната',

  // HUD
  sharpTurn: 'РЕЗКИЙ ПОВОРОТ',
  controlHint: (mode: string) => `Управление: ${mode} (Пробел для переключения)`,
  currentRating: 'Текущий рейтинг',
  speedUnit: 'км/ч',
  turnRight: 'ПРАВО',
  turnLeft: 'ЛЕВО',

  // Control modes
  modeKeyboard: 'КЛАВИАТУРА',
  modeMouse: 'МЫШЬ',
  modeJoystick: 'ДЖОЙСТИК',
  modeTilt: 'НАКЛОН',

  // Wasted screen
  wasted: 'Крушение',
  ratingReset: 'РЕЙТИНГ СБРОШЕН НА НОЛЬ',
  respawning: 'Возрождение...',

  // Start screen
  joinRace: 'Присоединиться к гонке',
  detectingDriver: 'Определение гонщика...',
  objective: 'Цель: Максимальный рейтинг',
  speedMultiplier: 'Множитель скорости: Рейтинг растёт экспоненциально со скоростью.',
  highStakes: 'Высокие ставки: При аварии',
  ratingFalls: 'РЕЙТИНГ ПАДАЕТ ДО НУЛЯ',
  controls: 'Управление',
  igniteEngine: 'Запустить двигатель',

  // Control legend (desktop)
  controlArrows: 'Стрелки / WASD',
  controlMouse: 'Мышь',
  controlSpace: 'Пробел',
  controlMove: 'Движение',
  controlSteer: 'Руление и газ',
  controlToggle: 'Переключение режима',

  // Control legend (mobile)
  controlJoystick: 'Джойстик',
  controlTilt: 'Наклон телефона',
  controlTap: 'Нажмите',

  // Leaderboard
  liveRatings: 'Рейтинг онлайн',
  topTen: 'Топ 10',
  noPlayers: 'Нет игроков',

  // Welcome
  welcome: (name: string) => `Добро пожаловать, ${name}`,

  // Random names (Russian)
  adjectives: [
    'Быстрый', 'Турбо', 'Неоновый', 'Железный', 'Кибер',
    'Дикий', 'Вершинный', 'Призрачный', 'Гипер', 'Теневой',
    'Скоростной', 'Дрифтовый', 'Электро'
  ],
  animals: [
    'Лис', 'Ястреб', 'Медведь', 'Волк', 'Тигр',
    'Орёл', 'Акула', 'Сокол', 'Кобра', 'Гадюка',
    'Барсук', 'Панда', 'Рысь'
  ],
} as const;

import { ControlMode } from './types';

// Get localized control mode name
export function getControlModeName(mode: ControlMode): string {
  switch (mode) {
    case 'keyboard': return LANG.modeKeyboard;
    case 'mouse': return LANG.modeMouse;
    case 'joystick': return LANG.modeJoystick;
    case 'tilt': return LANG.modeTilt;
  }
}
