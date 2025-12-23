/**
 * Sequential Runner Types
 * Type definitions and interfaces for useSequentialAuditRunner hook.
 */

import type React from 'react'

import { type AuditRun, type OrchestratorSession } from '../../services/pocketbase'
import { type AvailableAudit } from '../../services/api'
import {
  type AuditProgress,
  type CampaignReadiness,
  type CampaignScore,
} from './campaignScoreUtils'

export type { AuditProgress, CampaignReadiness, CampaignScore }

export interface SequentialRunnerState {
  isRunning: boolean
  progress: AuditProgress[]
  currentIndex: number
  totalAudits: number
  completedCount: number
  score: CampaignScore | null
  readiness: CampaignReadiness | null
  showSummary: boolean
}

export interface UseSequentialAuditRunnerReturn extends SequentialRunnerState {
  startSequentialRun: (audits: AvailableAudit[]) => void
  dismissSummary: () => void
  reset: () => void
}

export interface UseSequentialAuditRunnerOptions {
  sessionId?: string | null
  pbAuditRuns?: Map<string, AuditRun>
  availableAudits?: AvailableAudit[]
}

export interface RecoveryConfig {
  sessionId: string | null
  hasLocalState: boolean
  hasAuditsLoaded: boolean
  availableAudits: AvailableAudit[]
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
  wasStartedLocallyRef: React.RefObject<boolean>
  setOrchSession: (s: OrchestratorSession | null) => void
  setPlannedAudits: (a: string[]) => void
  setIsRunning: (r: boolean) => void
}

export interface AutoCompleteConfig {
  allDone: boolean
  isRunning: boolean
  wasStartedLocally: boolean
  orchSession: OrchestratorSession | null
  onComplete: () => void
}

export interface RunnerState {
  plannedAudits: string[]
  isRunning: boolean
  showSummary: boolean
  orchSession: OrchestratorSession | null
}

export interface RunnerActions {
  setPlannedAudits: React.Dispatch<React.SetStateAction<string[]>>
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setShowSummary: React.Dispatch<React.SetStateAction<boolean>>
  setOrchSession: React.Dispatch<React.SetStateAction<OrchestratorSession | null>>
}

export interface StartRunConfig {
  sessionId: string | null
  setPlannedAudits: React.Dispatch<React.SetStateAction<string[]>>
  setIsRunning: React.Dispatch<React.SetStateAction<boolean>>
  setShowSummary: React.Dispatch<React.SetStateAction<boolean>>
  setOrchSession: React.Dispatch<React.SetStateAction<OrchestratorSession | null>>
  wasStartedLocallyRef: React.RefObject<boolean>
  pbAuditRunsRef: React.RefObject<Map<string, AuditRun>>
}
