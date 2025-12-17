/**
 * Constants - ISCIACUS Monitoring Dashboard
 * ==========================================
 * Centralized constants to avoid magic numbers
 */

// API Configuration
export const API_BASE_URL = 'http://localhost:8080'
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200

// Stock Level Thresholds
export const STOCK_THRESHOLDS = {
  RUPTURE: 0,
  FAIBLE_MAX: 2,
  MOYEN_MAX: 5,
} as const

// Margin Thresholds (percentage)
export const MARGIN_THRESHOLDS = {
  HIGH: 50,
  LOW: 30,
} as const

// UI Constants
export const SIDEBAR_WIDTH = 240
export const TOAST_DURATION_MS = 3000
export const SEARCH_DEBOUNCE_MS = 300

// Stock Level Labels
export const STOCK_LEVEL_LABELS = {
  en_stock: '✅ En stock (>0)',
  rupture: '🔴 Rupture (0)',
  faible: '🟠 Faible (1-2)',
  moyen: '🟡 Moyen (3-5)',
  ok: '🟢 OK (6+)',
} as const

// Stock Level Colors
export const STOCK_LEVEL_COLORS = {
  rupture: {
    bg: 'bg-red-100',
    text: 'text-red-800',
    icon: '🔴',
  },
  faible: {
    bg: 'bg-orange-100',
    text: 'text-orange-800',
    icon: '🟠',
  },
  moyen: {
    bg: 'bg-yellow-100',
    text: 'text-yellow-800',
    icon: '🟡',
  },
  ok: {
    bg: 'bg-green-100',
    text: 'text-green-800',
    icon: '🟢',
  },
} as const

// Navigation Pages
export const PAGES = {
  PRODUCTS: 'products',
  ANALYTICS: 'analytics',
  BENCHMARKS: 'benchmarks',
  AUDIT: 'audit',
  SETTINGS: 'settings',
} as const

export type PageKey = (typeof PAGES)[keyof typeof PAGES]

// View Modes
export const VIEW_MODES = {
  LIST: 'list',
  GRID: 'grid',
} as const

export type ViewMode = (typeof VIEW_MODES)[keyof typeof VIEW_MODES]
