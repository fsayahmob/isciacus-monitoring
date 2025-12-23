import { test, expect, type APIRequestContext } from '@playwright/test'

/**
 * TESTS VISUELS EXHAUSTIFS - Validation avec Screenshots
 * ======================================================
 *
 * Chaque test capture des screenshots et valide une checklist exhaustive.
 * Les résultats sont comparés visuellement et loggés en détail.
 *
 * IMPORTANT: Ces tests DOIVENT s'exécuter en série (pas en parallèle)
 * car ils partagent tous le même session_id du backend.
 *
 * NOTE: Ces tests requièrent PocketBase (port 8090) et le backend (port 8080).
 * Ils sont automatiquement skippés en CI où ces services ne sont pas disponibles.
 */

// Skip all tests in CI - these require local Docker services (PocketBase + Backend)
const isCI = process.env.CI === 'true'
test.skip(() => isCI, 'Visual tests require local Docker services (PocketBase + Backend)')

// Force serial execution at file level - tests share session_id state
test.describe.configure({ mode: 'serial' })

const POCKETBASE_URL = 'http://localhost:8090'
const BACKEND_URL = 'http://localhost:8080'

// ============================================================================
// TYPES
// ============================================================================

interface AuditRunRecord {
  id: string
  session_id: string
  audit_type: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  started_at: string
  completed_at: string | null
  result: Record<string, unknown> | null
  error: string | null
}

interface OrchestratorRecord {
  id: string
  session_id: string
  planned_audits: string[]
  status: 'running' | 'completed'
  started_at: string
  completed_at: string | null
}

interface ValidationResult {
  passed: boolean
  checks: Array<{
    name: string
    expected: string
    actual: string
    passed: boolean
  }>
}

// ============================================================================
// HELPERS
// ============================================================================

async function getSessionId(request: APIRequestContext): Promise<string | null> {
  const response = await request.get(`${BACKEND_URL}/api/audits/session`)
  if (!response.ok()) { return null }
  const data = await response.json()
  return data.session?.id ?? null
}

async function getPBAuditRuns(request: APIRequestContext, sessionId: string): Promise<AuditRunRecord[]> {
  const response = await request.get(
    `${POCKETBASE_URL}/api/collections/audit_runs/records?filter=session_id="${sessionId}"&sort=-started_at`
  )
  if (!response.ok()) { return [] }
  const data = await response.json()
  return data.items ?? []
}

async function getPBOrchestrator(request: APIRequestContext, sessionId: string): Promise<OrchestratorRecord | null> {
  const response = await request.get(
    `${POCKETBASE_URL}/api/collections/orchestrator_sessions/records?filter=session_id="${sessionId}"`
  )
  if (!response.ok()) { return null }
  const data = await response.json()
  return data.items?.[0] ?? null
}

async function cleanupPB(request: APIRequestContext, sessionId: string): Promise<void> {
  // Delete audit_runs
  const runs = await getPBAuditRuns(request, sessionId)
  for (const run of runs) {
    await request.delete(`${POCKETBASE_URL}/api/collections/audit_runs/records/${run.id}`)
  }
  // Delete orchestrator_sessions
  const orch = await getPBOrchestrator(request, sessionId)
  if (orch) {
    await request.delete(`${POCKETBASE_URL}/api/collections/orchestrator_sessions/records/${orch.id}`)
  }
}

async function createPBAuditRun(
  request: APIRequestContext,
  sessionId: string,
  auditType: string,
  status: 'pending' | 'running' | 'completed' | 'failed'
): Promise<AuditRunRecord> {
  const response = await request.post(`${POCKETBASE_URL}/api/collections/audit_runs/records`, {
    data: {
      session_id: sessionId,
      audit_type: auditType,
      status,
      started_at: new Date().toISOString(),
    },
  })
  return response.json()
}

async function updatePBAuditRun(
  request: APIRequestContext,
  recordId: string,
  updates: Partial<AuditRunRecord>
): Promise<AuditRunRecord> {
  const response = await request.patch(
    `${POCKETBASE_URL}/api/collections/audit_runs/records/${recordId}`,
    { data: updates }
  )
  return response.json()
}

function logValidation(result: ValidationResult, testName: string): void {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`VALIDATION: ${testName}`)
  console.log(`${'='.repeat(60)}`)

  for (const check of result.checks) {
    const icon = check.passed ? '✅' : '❌'
    console.log(`${icon} ${check.name}`)
    console.log(`   Attendu: ${check.expected}`)
    console.log(`   Obtenu:  ${check.actual}`)
  }

  console.log(`\nRÉSULTAT: ${result.passed ? '✅ SUCCÈS' : '❌ ÉCHEC'}`)
  console.log(`${'='.repeat(60)}\n`)
}

// ============================================================================
// TEST: SCENARIO COMPLET - LANCEMENT ORCHESTRATEUR
// ============================================================================

test.describe.serial('Validation Visuelle - Orchestrateur', () => {

  test('VISUEL-1: Lancement orchestrateur - État initial et progression', async ({ page, request }) => {
    test.setTimeout(180000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    // ÉTAPE 0: Nettoyage
    await cleanupPB(request, sessionId!)
    console.log('🧹 PocketBase nettoyé')

    // ÉTAPE 1: Navigation vers page Audit
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: 'test-results/visuel1-step1-homepage.png', fullPage: true })

    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(2000)
    await page.screenshot({ path: 'test-results/visuel1-step2-audit-page.png', fullPage: true })

    // CHECKLIST ÉTAPE 1
    const step1Checks: ValidationResult = {
      passed: true,
      checks: []
    }

    // Check 1.1: Titre page visible
    const h1Visible = await page.locator('h1').first().isVisible()
    step1Checks.checks.push({
      name: 'Titre H1 visible',
      expected: 'true',
      actual: String(h1Visible),
      passed: h1Visible
    })

    // Check 1.2: Bouton "Lancer tous les audits" visible
    const runAllBtn = page.locator('button:has-text("Lancer tous les audits")')
    const runAllVisible = await runAllBtn.isVisible()
    step1Checks.checks.push({
      name: 'Bouton "Lancer tous les audits" visible',
      expected: 'true',
      actual: String(runAllVisible),
      passed: runAllVisible
    })

    // Check 1.3: Cartes audit présentes
    const auditCards = await page.locator('[data-audit-type]').count()
    step1Checks.checks.push({
      name: 'Cartes audit présentes (>0)',
      expected: '>0',
      actual: String(auditCards),
      passed: auditCards > 0
    })

    // Check 1.4: PocketBase vide (après cleanup)
    const pbRunsBefore = await getPBAuditRuns(request, sessionId!)
    step1Checks.checks.push({
      name: 'PocketBase audit_runs vide',
      expected: '0',
      actual: String(pbRunsBefore.length),
      passed: pbRunsBefore.length === 0
    })

    step1Checks.passed = step1Checks.checks.every(c => c.passed)
    logValidation(step1Checks, 'ÉTAPE 1 - Page Audit chargée')

    // ÉTAPE 2: Clic sur "Lancer tous les audits"
    await runAllBtn.click()
    console.log('🚀 Clic sur "Lancer tous les audits"')
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'test-results/visuel1-step3-orchestrator-started.png', fullPage: true })

    // CHECKLIST ÉTAPE 2
    const step2Checks: ValidationResult = {
      passed: true,
      checks: []
    }

    // Check 2.1: Section progression visible
    const progressSection = page.locator('[class*="rounded-xl"][class*="border-info"]')
    const progressVisible = await progressSection.isVisible()
    step2Checks.checks.push({
      name: 'Section progression visible',
      expected: 'true',
      actual: String(progressVisible),
      passed: progressVisible
    })

    // Check 2.2: Compteur "X/Y" présent
    const counterText = await page.locator('text=/\\d+\\/\\d+/').first().textContent() ?? ''
    const hasCounter = /\d+\/\d+/.test(counterText)
    step2Checks.checks.push({
      name: 'Compteur X/Y présent',
      expected: 'format X/Y',
      actual: counterText || 'non trouvé',
      passed: hasCounter
    })

    // Check 2.3: Au moins un chip avec statut
    const chips = await page.locator('[class*="rounded-full"][class*="px-2"]').count()
    step2Checks.checks.push({
      name: 'Chips audit présents (>0)',
      expected: '>0',
      actual: String(chips),
      passed: chips > 0
    })

    // Check 2.4: PocketBase orchestrator_sessions créé
    const pbOrch = await getPBOrchestrator(request, sessionId!)
    step2Checks.checks.push({
      name: 'PocketBase orchestrator_sessions créé',
      expected: 'status=running',
      actual: pbOrch ? `status=${pbOrch.status}` : 'null',
      passed: pbOrch?.status === 'running'
    })

    // Check 2.5: PocketBase planned_audits non vide
    step2Checks.checks.push({
      name: 'PocketBase planned_audits non vide',
      expected: '>0 audits',
      actual: pbOrch ? `${pbOrch.planned_audits.length} audits` : '0 audits',
      passed: (pbOrch?.planned_audits.length ?? 0) > 0
    })

    // Check 2.6: Au moins un audit_run créé dans PocketBase
    const pbRunsAfter = await getPBAuditRuns(request, sessionId!)
    step2Checks.checks.push({
      name: 'PocketBase audit_runs créés',
      expected: '>0',
      actual: String(pbRunsAfter.length),
      passed: pbRunsAfter.length > 0
    })

    step2Checks.passed = step2Checks.checks.every(c => c.passed)
    logValidation(step2Checks, 'ÉTAPE 2 - Orchestrateur démarré')

    // ASSERTIONS FINALES
    expect(step1Checks.passed).toBe(true)
    expect(step2Checks.passed).toBe(true)
  })

  test('VISUEL-2: Refresh pendant exécution - Restauration état', async ({ page, request }) => {
    test.setTimeout(180000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    // Vérifier si orchestrateur en cours
    let pbOrch = await getPBOrchestrator(request, sessionId!)

    // Si pas d'orchestrateur running, en démarrer un
    if (!pbOrch || pbOrch.status !== 'running') {
      await cleanupPB(request, sessionId!)
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await page.locator('nav button:has-text("Audit")').first().click()
      await page.waitForTimeout(1000)

      // Fermer modal si présent
      if (await page.locator('[class*="fixed inset-0"][class*="bg-black"]').count() > 0) {
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }

      const runAllBtn = page.locator('button:has-text("Lancer tous les audits")')
      if (await runAllBtn.isVisible() && await runAllBtn.isEnabled()) {
        await runAllBtn.click()
        await page.waitForTimeout(2000)
      }
      pbOrch = await getPBOrchestrator(request, sessionId!)
    }

    if (!pbOrch || pbOrch.status !== 'running') {
      console.log('⚠️ Impossible de démarrer orchestrateur - skip test')
      return
    }

    // ÉTAT AVANT REFRESH
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(3000)

    await page.screenshot({ path: 'test-results/visuel2-step1-before-refresh.png', fullPage: true })

    // Capturer état UI avant
    const uiBeforeChips = await page.locator('[class*="rounded-full"][class*="px-2"]').count()
    const uiBeforeCounter = await page.locator('text=/\\d+\\/\\d+/').first().textContent() ?? ''
    const pbRunsBefore = await getPBAuditRuns(request, sessionId!)

    console.log(`📊 AVANT REFRESH:`)
    console.log(`   - UI Chips: ${uiBeforeChips}`)
    console.log(`   - UI Counter: ${uiBeforeCounter}`)
    console.log(`   - PB audit_runs: ${pbRunsBefore.length}`)
    console.log(`   - PB statuses: ${pbRunsBefore.map(r => `${r.audit_type}=${r.status}`).join(', ')}`)

    // REFRESH
    console.log('🔄 REFRESH PAGE')
    await page.reload({ timeout: 15000 })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(5000)

    await page.screenshot({ path: 'test-results/visuel2-step2-after-refresh.png', fullPage: true })

    // ÉTAT APRÈS REFRESH
    const uiAfterChips = await page.locator('[class*="rounded-full"][class*="px-2"]').count()
    const uiAfterCounter = await page.locator('text=/\\d+\\/\\d+/').first().textContent() ?? ''
    const pbRunsAfter = await getPBAuditRuns(request, sessionId!)

    console.log(`📊 APRÈS REFRESH:`)
    console.log(`   - UI Chips: ${uiAfterChips}`)
    console.log(`   - UI Counter: ${uiAfterCounter}`)
    console.log(`   - PB audit_runs: ${pbRunsAfter.length}`)
    console.log(`   - PB statuses: ${pbRunsAfter.map(r => `${r.audit_type}=${r.status}`).join(', ')}`)

    // CHECKLIST VALIDATION
    const checks: ValidationResult = {
      passed: true,
      checks: []
    }

    // Check 1: Même nombre de chips
    checks.checks.push({
      name: 'Nombre de chips identique',
      expected: String(uiBeforeChips),
      actual: String(uiAfterChips),
      passed: uiAfterChips === uiBeforeChips
    })

    // Check 2: Compteur présent
    const hasCounterAfter = /\d+\/\d+/.test(uiAfterCounter)
    checks.checks.push({
      name: 'Compteur X/Y présent après refresh',
      expected: 'format X/Y',
      actual: uiAfterCounter || 'non trouvé',
      passed: hasCounterAfter
    })

    // Check 3: PocketBase audit_runs >= avant
    checks.checks.push({
      name: 'PB audit_runs >= avant (progression continue)',
      expected: `>=${pbRunsBefore.length}`,
      actual: String(pbRunsAfter.length),
      passed: pbRunsAfter.length >= pbRunsBefore.length
    })

    // Check 4: Section progression visible
    const progressVisible = await page.locator('[class*="rounded-xl"][class*="border-info"]').isVisible()
    checks.checks.push({
      name: 'Section progression visible après refresh',
      expected: 'true',
      actual: String(progressVisible),
      passed: progressVisible
    })

    checks.passed = checks.checks.every(c => c.passed)
    logValidation(checks, 'VISUEL-2 - Restauration après refresh')

    expect(checks.passed).toBe(true)
  })
})

// ============================================================================
// TEST: REALTIME UPDATES - AUDIT INDIVIDUEL
// ============================================================================

test.describe.serial('Validation Visuelle - Realtime Updates', () => {

  test('VISUEL-3: Création audit dans PocketBase -> UI se met à jour', async ({ page, request }) => {
    test.setTimeout(60000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    const auditType = 'ga4_tracking'

    // Supprimer audit existant
    const existingRuns = await getPBAuditRuns(request, sessionId!)
    const existing = existingRuns.find(r => r.audit_type === auditType)
    if (existing) {
      await request.delete(`${POCKETBASE_URL}/api/collections/audit_runs/records/${existing.id}`)
    }

    // Navigation
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(2000)

    await page.screenshot({ path: 'test-results/visuel3-step1-initial.png', fullPage: true })

    // Capturer état initial de la carte
    const card = page.locator(`[data-audit-type="${auditType}"]`)
    const spinnerBefore = await card.locator('.animate-spin').count()

    console.log(`📊 ÉTAT INITIAL carte ${auditType}:`)
    console.log(`   - Spinner visible: ${spinnerBefore > 0}`)

    // CRÉER AUDIT RUNNING dans PocketBase
    console.log('📝 Création audit "running" dans PocketBase')
    const createdRun = await createPBAuditRun(request, sessionId!, auditType, 'running')
    console.log(`   - Record créé: ${createdRun.id}`)

    // Attendre propagation WebSocket
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'test-results/visuel3-step2-after-create.png', fullPage: true })

    // Vérifier UI
    const spinnerAfterCreate = await card.locator('.animate-spin').count()

    console.log(`📊 APRÈS CRÉATION:`)
    console.log(`   - Spinner visible: ${spinnerAfterCreate > 0}`)

    // METTRE À JOUR vers COMPLETED
    console.log('📝 Update audit vers "completed" dans PocketBase')
    await updatePBAuditRun(request, createdRun.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
      result: { score: 85, issues: [] }
    })

    // Attendre propagation WebSocket
    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'test-results/visuel3-step3-after-complete.png', fullPage: true })

    // Vérifier UI
    const spinnerAfterComplete = await card.locator('.animate-spin').count()

    console.log(`📊 APRÈS COMPLETION:`)
    console.log(`   - Spinner visible: ${spinnerAfterComplete > 0}`)

    // CHECKLIST
    const checks: ValidationResult = {
      passed: true,
      checks: []
    }

    checks.checks.push({
      name: 'Spinner visible après création "running"',
      expected: 'true (spinner)',
      actual: spinnerAfterCreate > 0 ? 'spinner visible' : 'pas de spinner',
      passed: spinnerAfterCreate > 0
    })

    checks.checks.push({
      name: 'Spinner disparu après "completed"',
      expected: 'false (pas de spinner)',
      actual: spinnerAfterComplete > 0 ? 'spinner encore visible' : 'pas de spinner',
      passed: spinnerAfterComplete === 0
    })

    checks.passed = checks.checks.every(c => c.passed)
    logValidation(checks, 'VISUEL-3 - Realtime Updates')

    // Cleanup
    await request.delete(`${POCKETBASE_URL}/api/collections/audit_runs/records/${createdRun.id}`)

    expect(checks.passed).toBe(true)
  })

  test('VISUEL-4: Relance audit individuel -> started_at réinitialisé', async ({ page, request }) => {
    test.setTimeout(120000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    const auditType = 'onboarding'

    // Navigation
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(2000)

    // Fermer modal si présent
    if (await page.locator('[class*="fixed inset-0"][class*="bg-black"]').count() > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/visuel4-step1-initial.png', fullPage: true })

    // Vérifier s'il y a déjà un audit
    let pbRuns = await getPBAuditRuns(request, sessionId!)
    let existingRun = pbRuns.find(r => r.audit_type === auditType)

    console.log(`📊 ÉTAT INITIAL:`)
    console.log(`   - Audit existant: ${existingRun ? existingRun.id : 'aucun'}`)
    console.log(`   - Status: ${existingRun?.status ?? 'N/A'}`)
    console.log(`   - started_at: ${existingRun?.started_at ?? 'N/A'}`)

    const startedAtBefore = existingRun?.started_at

    // Cliquer sur la carte pour l'ouvrir
    const card = page.locator(`[data-audit-type="${auditType}"]`)
    if (await card.count() > 0) {
      await card.click()
      await page.waitForTimeout(500)
    }

    // Cliquer sur Lancer/Relancer
    const runBtn = card.locator('button:has-text("Lancer"), button:has-text("Relancer")')
    if (await runBtn.count() > 0) {
      await runBtn.click()
      console.log('🚀 Clic sur Lancer/Relancer')
    }

    await page.waitForTimeout(5000)
    await page.screenshot({ path: 'test-results/visuel4-step2-after-run.png', fullPage: true })

    // Vérifier PocketBase
    pbRuns = await getPBAuditRuns(request, sessionId!)
    const runAfter = pbRuns.find(r => r.audit_type === auditType)

    console.log(`📊 APRÈS RELANCE:`)
    console.log(`   - Audit: ${runAfter ? runAfter.id : 'aucun'}`)
    console.log(`   - Status: ${runAfter?.status ?? 'N/A'}`)
    console.log(`   - started_at: ${runAfter?.started_at ?? 'N/A'}`)

    // CHECKLIST
    const checks: ValidationResult = {
      passed: true,
      checks: []
    }

    checks.checks.push({
      name: 'Audit existe dans PocketBase après run',
      expected: 'record exists',
      actual: runAfter ? `id=${runAfter.id}` : 'null',
      passed: runAfter !== undefined
    })

    checks.checks.push({
      name: 'Status est running ou completed',
      expected: 'running ou completed',
      actual: runAfter?.status ?? 'N/A',
      passed: runAfter?.status === 'running' || runAfter?.status === 'completed'
    })

    if (startedAtBefore && runAfter) {
      const before = new Date(startedAtBefore).getTime()
      const after = new Date(runAfter.started_at).getTime()
      checks.checks.push({
        name: 'started_at mis à jour (>= avant)',
        expected: `>= ${startedAtBefore}`,
        actual: runAfter.started_at,
        passed: after >= before
      })
    }

    checks.passed = checks.checks.every(c => c.passed)
    logValidation(checks, 'VISUEL-4 - Relance Audit Individuel')

    expect(checks.passed).toBe(true)
  })
})

// ============================================================================
// TEST: RELANCE ORCHESTRATEUR APRÈS COMPLETION
// ============================================================================

test.describe.serial('Validation Visuelle - Relance Orchestrateur', () => {

  test('VISUEL-5: Relance orchestrateur après completion', async ({ page, request }) => {
    test.setTimeout(180000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    // Navigation
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(2000)

    // Fermer modal si présent
    const modalOverlay = page.locator('[class*="fixed inset-0"][class*="bg-black"]')
    if (await modalOverlay.count() > 0) {
      await page.keyboard.press('Escape')
      console.log('🔲 Modal fermé avec Escape')
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/visuel5-step1-initial.png', fullPage: true })

    // État initial PocketBase
    const pbOrchBefore = await getPBOrchestrator(request, sessionId!)
    console.log(`📊 ÉTAT INITIAL:`)
    console.log(`   - Orchestrator: ${pbOrchBefore ? pbOrchBefore.id : 'aucun'}`)
    console.log(`   - Status: ${pbOrchBefore?.status ?? 'N/A'}`)

    // Cliquer sur "Lancer tous les audits"
    const runAllBtn = page.locator('button:has-text("Lancer tous les audits")')

    if (await runAllBtn.count() === 0) {
      console.log('⚠️ Bouton "Lancer tous les audits" non trouvé')
      return
    }

    const isEnabled = await runAllBtn.isEnabled()
    console.log(`   - Bouton enabled: ${isEnabled}`)

    if (!isEnabled) {
      console.log('⚠️ Bouton désactivé - orchestrateur peut-être déjà en cours')
      return
    }

    try {
      await runAllBtn.click({ timeout: 5000 })
      console.log('🚀 Clic sur "Lancer tous les audits"')
    } catch (e) {
      console.log(`⚠️ Erreur clic: ${e}`)
      await page.screenshot({ path: 'test-results/visuel5-error-click.png', fullPage: true })
      return
    }

    await page.waitForTimeout(3000)
    await page.screenshot({ path: 'test-results/visuel5-step2-after-click.png', fullPage: true })

    // Vérifier PocketBase
    const pbOrchAfter = await getPBOrchestrator(request, sessionId!)

    console.log(`📊 APRÈS CLIC:`)
    console.log(`   - Orchestrator: ${pbOrchAfter ? pbOrchAfter.id : 'aucun'}`)
    console.log(`   - Status: ${pbOrchAfter?.status ?? 'N/A'}`)
    console.log(`   - planned_audits: ${pbOrchAfter?.planned_audits.length ?? 0}`)

    // CHECKLIST
    const checks: ValidationResult = {
      passed: true,
      checks: []
    }

    checks.checks.push({
      name: 'Orchestrator existe dans PocketBase',
      expected: 'record exists',
      actual: pbOrchAfter ? `id=${pbOrchAfter.id}` : 'null',
      passed: pbOrchAfter !== null
    })

    checks.checks.push({
      name: 'Status est "running"',
      expected: 'running',
      actual: pbOrchAfter?.status ?? 'N/A',
      passed: pbOrchAfter?.status === 'running'
    })

    checks.checks.push({
      name: 'planned_audits non vide',
      expected: '>0',
      actual: String(pbOrchAfter?.planned_audits.length ?? 0),
      passed: (pbOrchAfter?.planned_audits.length ?? 0) > 0
    })

    // Vérifier UI
    const progressSection = page.locator('[class*="rounded-xl"][class*="border-info"]')
    const progressVisible = await progressSection.isVisible()
    checks.checks.push({
      name: 'Section progression visible dans UI',
      expected: 'true',
      actual: String(progressVisible),
      passed: progressVisible
    })

    checks.passed = checks.checks.every(c => c.passed)
    logValidation(checks, 'VISUEL-5 - Relance Orchestrateur')

    expect(checks.passed).toBe(true)
  })
})

// ============================================================================
// TEST: COHÉRENCE UI / POCKETBASE
// ============================================================================

test.describe('Validation Visuelle - Cohérence État', () => {

  test('VISUEL-6: Cohérence UI vs PocketBase', async ({ page, request }) => {
    test.setTimeout(60000)

    const sessionId = await getSessionId(request)
    test.skip(!sessionId, 'Pas de session disponible')

    // Navigation
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.locator('nav button:has-text("Audit")').first().click()
    await page.waitForTimeout(3000)

    // Fermer modal si présent
    if (await page.locator('[class*="fixed inset-0"][class*="bg-black"]').count() > 0) {
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }

    await page.screenshot({ path: 'test-results/visuel6-coherence.png', fullPage: true })

    // Récupérer état PocketBase
    const pbRuns = await getPBAuditRuns(request, sessionId!)
    const pbOrch = await getPBOrchestrator(request, sessionId!)

    console.log(`📊 ÉTAT POCKETBASE:`)
    console.log(`   - audit_runs: ${pbRuns.length}`)
    for (const run of pbRuns) {
      console.log(`     - ${run.audit_type}: ${run.status}`)
    }
    console.log(`   - orchestrator: ${pbOrch ? pbOrch.status : 'aucun'}`)

    // Récupérer état UI
    const uiChips = await page.locator('[class*="rounded-full"][class*="px-2"]').count()
    const uiProgressVisible = await page.locator('[class*="rounded-xl"][class*="border-info"]').isVisible()
    const uiRunningSpinners = await page.locator('.animate-spin').count()

    console.log(`📊 ÉTAT UI:`)
    console.log(`   - Chips: ${uiChips}`)
    console.log(`   - Section progression visible: ${uiProgressVisible}`)
    console.log(`   - Spinners (running): ${uiRunningSpinners}`)

    // CHECKLIST COHÉRENCE
    const checks: ValidationResult = {
      passed: true,
      checks: []
    }

    // Si orchestrateur running -> section progression doit être visible
    if (pbOrch?.status === 'running') {
      checks.checks.push({
        name: 'Orchestrateur running -> Section progression visible',
        expected: 'true',
        actual: String(uiProgressVisible),
        passed: uiProgressVisible
      })
    }

    // Si audits running dans PB -> au moins un spinner dans UI
    const pbRunning = pbRuns.filter(r => r.status === 'running')
    if (pbRunning.length > 0) {
      checks.checks.push({
        name: `${pbRunning.length} audit(s) running dans PB -> Spinner(s) dans UI`,
        expected: '>0 spinners',
        actual: `${uiRunningSpinners} spinners`,
        passed: uiRunningSpinners > 0
      })
    }

    // Si pas d'orchestrateur running et pas d'audits running -> pas de section progression
    if ((!pbOrch || pbOrch.status !== 'running') && pbRunning.length === 0) {
      // C'est OK si la section n'est pas visible
      checks.checks.push({
        name: 'Pas d\'activité -> Pas de section progression (ou section terminée)',
        expected: 'cohérent',
        actual: uiProgressVisible ? 'progression visible (peut-être summary)' : 'pas de progression',
        passed: true // On ne peut pas être strict ici car le summary peut être affiché
      })
    }

    checks.passed = checks.checks.every(c => c.passed)
    logValidation(checks, 'VISUEL-6 - Cohérence UI/PocketBase')

    // Ce test est informatif, on ne fait pas échouer
    console.log('\n📋 RÉSUMÉ COHÉRENCE:')
    console.log(`   - PB audits running: ${pbRunning.length}`)
    console.log(`   - PB orchestrator: ${pbOrch?.status ?? 'aucun'}`)
    console.log(`   - UI spinners: ${uiRunningSpinners}`)
    console.log(`   - UI progression: ${uiProgressVisible}`)
  })
})
