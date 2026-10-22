<template>
  <section
    class="execution-sequence"
    :aria-label="t(hasLanes ? 'execution.sequenceChart.title' : 'execution.sequenceView')"
    :aria-busy="loading || undefined"
  >
    <p v-if="error" class="state-block error" role="alert">{{ error }}</p>
    <p v-else-if="loading && !rows.length" class="state-block" role="status">
      {{ t('execution.loading') }}
    </p>

    <p v-if="!rows.length" class="state-block">
      {{ kindMissing ? t('execution.sequenceChart.unknownKind') : t('execution.sequenceChart.unavailableForKind') }}
    </p>

    <template v-else>
      <p v-if="hasLanes" class="flow-note">{{ t('execution.sequenceChart.logicalFlow') }}</p>
      <p v-if="!hasLanes" class="flow-note">{{ t('execution.sequenceChart.listFallback') }}</p>

      <ul v-if="hasLanes" class="legend" :aria-label="t('execution.sequenceChart.legend')">
        <li>
          <span class="legend-line logical" aria-hidden="true"></span>
          {{ t('execution.sequenceChart.legendLogical') }}
        </li>
        <li>
          <span class="legend-line confirmed" aria-hidden="true"></span>
          {{ t('execution.sequenceChart.confirmedPacket') }}
        </li>
        <li>
          <span class="legend-line peer" aria-hidden="true"></span>
          {{ t('execution.sequenceChart.peerDirected') }}
        </li>
        <li>
          <span class="legend-block observed" aria-hidden="true"></span>
          {{ t('execution.sequenceChart.internalObserved') }}
        </li>
        <li>
          <span class="legend-block logical" aria-hidden="true"></span>
          {{ t('execution.sequenceChart.internalComputation') }}
        </li>
      </ul>

      <div
        class="sequence-scroll"
        tabindex="0"
        role="group"
        :aria-label="t(hasLanes ? 'execution.sequenceChart.title' : 'execution.sequenceView')"
      >
        <div class="sequence-chart" :class="{ 'no-lanes': !hasLanes }">
          <div v-if="hasLanes" class="lane-header" aria-hidden="true">
            <span class="stage-column-label">{{ t('execution.sequenceChart.stageColumn') }}</span>
            <div class="lane-area lane-axis">
              <span
                v-for="lane in LANES"
                :key="lane.id"
                class="lane-heading"
                :style="{ left: `${lane.centerX}px` }"
              >
                {{ t(lane.labelKey) }}
              </span>
            </div>
          </div>

          <div
            v-for="row in rows"
            :key="row.stage.id"
            class="sequence-row"
            :class="{
              selected: row.selected,
              'has-failure': row.stage.hasFailureEvidence,
            }"
          >
            <button
              type="button"
              class="stage-button"
              :aria-pressed="row.selected"
              :aria-label="stageAria(row)"
              :disabled="inactive"
              @click="toggleStage(row)"
            >
              <span class="stage-index mono">{{ row.stage.index + 1 }}</span>
              <span class="stage-text">
                <span class="stage-label">{{ t(row.stage.labelKey) }}</span>
                <span class="stage-meta">
                  <span class="status-dot" :class="row.stage.status" aria-hidden="true"></span>
                  <span>{{ statusText(row.stage) }}</span>
                  <span v-if="row.evidenceCount" class="stage-count mono">{{ row.evidenceCount }}</span>
                  <span v-if="row.stage.hasFailureEvidence" class="stage-failure">
                    {{ t('execution.stages.failure') }}
                  </span>
                </span>
              </span>
            </button>

            <div v-if="hasLanes" class="lane-area" aria-hidden="true">
              <span
                v-for="lane in LANES"
                :key="`${lane.id}-guide`"
                class="lane-guide"
                :style="{ left: `${lane.centerX - 0.5}px` }"
              ></span>

              <div v-for="lane in LANES" :key="`${lane.id}-cell`" class="lane-cell">
                <div
                  v-if="row.lane === lane.id"
                  :key="row.animatedInternal ? animationActivityId || row.stage.id : row.stage.id"
                  class="internal-block"
                  :class="[row.internal ?? 'logical', { active: row.animatedInternal }]"
                >
                  <span class="internal-label">{{ row.flowLabel }}</span>
                  <span v-if="row.internal" class="internal-mark">
                    {{ internalText(row.internal) }}
                  </span>
                </div>
              </div>

              <svg
                v-if="row.fromLane && row.toLane"
                class="flow-layer"
                viewBox="0 0 600 56"
                preserveAspectRatio="none"
                aria-hidden="true"
                focusable="false"
              >
                <defs>
                  <marker
                    :id="markerId(row, 'logic')"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path class="arrow-logic" d="M0 0 L6 3 L0 6" />
                  </marker>
                  <marker
                    :id="markerId(row, 'peer')"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path class="arrow-peer" d="M0 0 L6 3 L0 6" />
                  </marker>
                  <marker
                    :id="markerId(row, 'confirmed')"
                    markerWidth="7"
                    markerHeight="7"
                    refX="6"
                    refY="3"
                    orient="auto"
                  >
                    <path class="arrow-confirmed" d="M0 0 L6 3 L0 6" />
                  </marker>
                </defs>

                <line
                  class="flow-line logical"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="30"
                  y2="30"
                  :marker-end="markerUrl(row, 'logic')"
                />

                <line
                  v-if="row.confirmed.length"
                  :key="`${row.stage.id}:confirmed:${animationActivityId ?? 'idle'}`"
                  class="flow-line confirmed"
                  :class="{ active: row.animatedPacket }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="22"
                  y2="22"
                  :marker-end="markerUrl(row, 'confirmed')"
                />
                <circle
                  v-if="row.confirmed.length"
                  :key="animationActivityId ?? 'packet-idle'"
                  class="packet-dot"
                  :class="{ active: row.animatedPacket }"
                  :cx="laneX(row.toLane) - directionSign(row) * 14"
                  cy="22"
                  r="4"
                />
                <text
                  v-if="row.confirmed.length"
                  class="flow-label"
                  :x="midX(row)"
                  y="14"
                  text-anchor="middle"
                >
                  {{ packetLabel(row) }}
                </text>

                <line
                  v-if="row.directedPeers.length"
                  :key="`${row.stage.id}:peer:${animationActivityId ?? 'idle'}`"
                  class="flow-line peer"
                  :class="{ active: row.animatedPeer }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="42"
                  y2="42"
                  :marker-end="markerUrl(row, 'peer')"
                />
                <text
                  v-if="row.directedPeers.length"
                  class="flow-label peer-label"
                  :x="midX(row)"
                  y="54"
                  text-anchor="middle"
                >
                  {{ peerLabel(row) }}
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>


      <div v-if="unresolved.length" class="unresolved-block">
        <h3 class="evidence-title">{{ t('execution.sequenceChart.unresolvedTitle') }}</h3>
        <ul class="unresolved-list">
          <li v-for="item in unresolved" :key="item.key" class="unresolved-item">
            <span class="unresolved-kind">{{ item.kindLabel }}</span>
            <span class="mono">{{ item.text }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, useId } from 'vue'
import type { TraceExecutionKind, TraceSourceComponent } from '@/api/trace'
import type { ExecutionStage } from '@/features/execution/data/executionStages'
import type {
  ConfirmedDispatchPacket,
  ExecutionCommunicationProjection,
  PeerCorrelationHint,
} from '@/features/execution/data/executionCommunication'
import { useI18n } from '@/stores/i18n'
import { matchesChallengeDispatchPacket, peerEventMatchesStage } from '@/features/execution/data/executionSequence'

/**
 * Challenge-proof sequence canvas.
 *
 * Three fixed node lanes and the nine presentation stages are drawn in stage
 * order. The dashed baseline is business logic only. A solid line is drawn only
 * for a confirmed protocol packet whose `fromNodeId`/`toNodeId` both resolve to
 * lanes through observation sources; a peer arrow is drawn only when the peer
 * hint carries an explicit direction. Everything else stays logical or is
 * listed as unmapped evidence. Clock columns are never used for ordering.
 */

const props = withDefaults(defineProps<{
  kind: TraceExecutionKind | null
  stages: readonly ExecutionStage[]
  communication: ExecutionCommunicationProjection
  selectedStageId: string | null
  animationActivityId: string | null
  loading?: boolean
  error?: string | null
  interactive?: boolean
}>(), { loading: false, error: null, interactive: true })

const emit = defineEmits<{
  (event: 'select-stage', stageId: string | null): void
  (event: 'manual-explore'): void
}>()

const { t } = useI18n()
const uid = `execution-sequence-${useId()}`

const inactive = computed(() => props.loading || !props.interactive)
const kindMissing = computed(() => props.kind === null)
const hasLanes = computed(() => props.kind === 'challengeProof')

type Lane = Extract<TraceSourceComponent, 'Admin' | 'Audit' | 'Storage'>

const LANES: readonly { id: Lane; centerX: number; labelKey: string }[] = [
  { id: 'Admin', centerX: 100, labelKey: 'execution.topology.admin' },
  { id: 'Audit', centerX: 300, labelKey: 'execution.topology.audit' },
  { id: 'Storage', centerX: 500, labelKey: 'execution.topology.storage' },
]
const LANE_X: Record<Lane, number> = { Admin: 100, Audit: 300, Storage: 500 }

interface RowFlow {
  from?: Lane
  to?: Lane
  lane?: Lane
  opKey: string
}

/** Business flow named by the V3 prototype; never treated as observed traffic. */
const CHALLENGE_FLOW: Record<string, RowFlow> = {
  tagRange: { from: 'Admin', to: 'Storage', opKey: 'tagRange' },
  sampling: { lane: 'Admin', opKey: 'sampling' },
  dispatch: { from: 'Admin', to: 'Audit', opKey: 'dispatch' },
  challengeGeneration: { lane: 'Audit', opKey: 'challengeGeneration' },
  challengeDelivery: { from: 'Audit', to: 'Storage', opKey: 'challengeDelivery' },
  proofGeneration: { lane: 'Storage', opKey: 'proofGeneration' },
  proofReturn: { from: 'Storage', to: 'Audit', opKey: 'proofReturn' },
  proofVerification: { lane: 'Audit', opKey: 'proofVerification' },
  settlement: { from: 'Audit', to: 'Admin', opKey: 'settlement' },
}

/** Roles come only from exact observed worker/peer evidence or TaskDispatchReq source semantics. */
const nodeRole = computed(() => {
  const votes = new Map<string, Set<Lane>>()
  const add = (nodeId: string | null, component: TraceSourceComponent | null) => {
    if (!nodeId || !component) return
    if (component !== 'Admin' && component !== 'Audit' && component !== 'Storage') return
    const bucket = votes.get(nodeId)
    if (bucket) bucket.add(component)
    else votes.set(nodeId, new Set([component]))
  }

  for (const local of props.communication.localStages) add(local.nodeId, local.component)
  for (const packet of props.communication.confirmedPackets) add(packet.fromNodeId, 'Admin')
  for (const peer of props.communication.peerCorrelations) {
    const direction = peer.direction
    if (!direction) continue
    if (direction.eventType === 'ChallengeDeliveredToStorage') {
      add(direction.fromNodeId, 'Audit')
      add(direction.toNodeId, 'Storage')
    } else {
      add(direction.fromNodeId, 'Storage')
      add(direction.toNodeId, 'Audit')
    }
  }

  const roles = new Map<string, Lane>()
  for (const [nodeId, components] of votes) {
    if (components.size !== 1) continue
    const [component] = components
    if (component) roles.set(nodeId, component)
  }
  return roles
})



function peerDirection(peer: PeerCorrelationHint) {
  const direction = peer.direction
  if (!direction || direction.fromNodeId === direction.toNodeId) return null
  return direction
}


interface PlacedPacket {
  packet: ConfirmedDispatchPacket
  from: Lane
  to: Lane
}

const placedPackets = computed<PlacedPacket[]>(() => {
  const placed: PlacedPacket[] = []
  for (const packet of props.communication.confirmedPackets) {
    const from = nodeRole.value.get(packet.fromNodeId)
    const to = nodeRole.value.get(packet.toNodeId)
    if (!from || !to || from === to) continue
    placed.push({ packet, from, to })
  }
  return placed
})

interface PlacedPeer {
  peer: PeerCorrelationHint
  from: Lane
  to: Lane
}

const placedPeers = computed<PlacedPeer[]>(() => {
  const placed: PlacedPeer[] = []
  for (const peer of props.communication.peerCorrelations) {
    const direction = peerDirection(peer)
    if (!direction) continue
    const from = nodeRole.value.get(direction.fromNodeId)
    const to = nodeRole.value.get(direction.toNodeId)
    if (!from || !to || from === to) continue
    placed.push({ peer, from, to })
  }
  return placed
})
const animatedLocalStage = computed(() => {
  const activityId = props.animationActivityId
  return activityId
    ? props.communication.localStages.find(stage => stage.activityId === activityId) ?? null
    : null
})


type InternalState = 'observed' | 'reconstructed' | 'logical'

interface SequenceRow {
  stage: ExecutionStage
  flowLabel: string
  lane: Lane | null
  fromLane: Lane | null
  toLane: Lane | null
  confirmed: ConfirmedDispatchPacket[]
  directedPeers: PlacedPeer[]
  internal: InternalState | null
  evidenceCount: number
  animatedPacket: boolean
  animatedPeer: boolean
  animatedInternal: boolean
  selected: boolean
}

const rows = computed<SequenceRow[]>(() => props.stages.map((stage) => {
  const flow = hasLanes.value ? CHALLENGE_FLOW[stage.id] : undefined
  const lane = flow?.lane ?? null
  const fromLane = flow?.from ?? null
  const toLane = flow?.to ?? null
  const confirmed = fromLane && toLane
    ? placedPackets.value
      .filter(item =>
        item.from === fromLane
        && item.to === toLane
        && matchesChallengeDispatchPacket(stage, item.packet),
      )
      .map(item => item.packet)
    : []
  const directedPeers = fromLane && toLane
    ? placedPeers.value.filter(item =>
      item.from === fromLane
      && item.to === toLane
      && item.peer.direction !== null
      && peerEventMatchesStage(stage.id, item.peer.direction.eventType),
    )
    : []


  const activeLocalStage = animatedLocalStage.value
  const animatedInternal = Boolean(
    lane
    && activeLocalStage
    && stage.evidence.some(evidence =>
      evidence.observationId === activeLocalStage.observationId
      && evidence.source.component === lane,
    ),
  )
  let internal: InternalState | null = null
  if (lane) {
    const localEvidence = stage.evidence.filter(item => item.source.component === lane)
    if (localEvidence.some(item => item.source.quality === 'observed')) internal = 'observed'
    else if (localEvidence.some(item => item.source.quality === 'reconstructed')) internal = 'reconstructed'
    else internal = 'logical'
  }

  return {
    stage,
    flowLabel: flow ? t(`execution.sequenceChart.ops.${flow.opKey}`) : '',
    lane,
    fromLane,
    toLane,
    confirmed,
    directedPeers,
    internal,
    evidenceCount: stage.evidence.length,
    animatedPacket: Boolean(props.animationActivityId
      && confirmed.some(item => item.activityId === props.animationActivityId)),
    animatedPeer: Boolean(props.animationActivityId
      && directedPeers.some(item => item.peer.activityId === props.animationActivityId)),
    animatedInternal,
    selected: stage.id === props.selectedStageId,
  }
}))



interface UnresolvedItem {
  key: string
  kindLabel: string
  text: string
}

const unresolved = computed<UnresolvedItem[]>(() => {
  const items: UnresolvedItem[] = []

  const placedPacketIds = new Set(rows.value.flatMap(row => row.confirmed.map(item => item.activityId)))
  for (const packet of props.communication.confirmedPackets) {
    if (placedPacketIds.has(packet.activityId)) continue
    items.push({
      key: `packet:${packet.activityId}`,
      kindLabel: t('execution.sequenceChart.unresolvedConfirmed'),
      text: `${packet.messageType} · ${packet.fromNodeId} → ${packet.toNodeId} · ${packet.packetId}`,
    })
  }

  const placedPeerIds = new Set(rows.value.flatMap(row => row.directedPeers.map(item => item.peer.activityId)))
  for (const peer of props.communication.peerCorrelations) {
    if (placedPeerIds.has(peer.activityId)) continue
    const direction = peerDirection(peer)
    items.push({
      key: `peer:${peer.activityId}`,
      kindLabel: t('execution.sequenceChart.unresolvedPeer'),
      text: direction
        ? `${direction.fromNodeId} → ${direction.toNodeId} · ${peer.linkKey}`
        : `${t('execution.sequenceChart.peerUndirected')} · ${peer.linkKey}`,
    })
  }

  return items
})

function laneX(lane: Lane): number {
  return LANE_X[lane]
}

function midX(row: SequenceRow): number {
  if (!row.fromLane || !row.toLane) return 0
  return (laneX(row.fromLane) + laneX(row.toLane)) / 2
}

function directionSign(row: SequenceRow): 1 | -1 {
  if (!row.fromLane || !row.toLane) return 1
  return laneX(row.toLane) > laneX(row.fromLane) ? 1 : -1
}

function markerId(row: SequenceRow, kind: 'logic' | 'peer' | 'confirmed'): string {
  return `${uid}-${row.stage.index}-${kind}`
}

function markerUrl(row: SequenceRow, kind: 'logic' | 'peer' | 'confirmed'): string {
  return `url(#${markerId(row, kind)})`
}

function shortId(value: string): string {
  return value.length > 10 ? `${value.slice(0, 8)}…` : value
}

function packetLabel(row: SequenceRow): string {
  const first = row.confirmed[0]
  if (!first) return ''
  const base = `${first.messageType} · ${shortId(first.packetId)}`
  const extra = row.confirmed.length - 1
  return extra > 0 ? `${base} · ${t('execution.sequenceChart.morePackets', { count: extra })}` : base
}

function peerLabel(row: SequenceRow): string {
  const count = row.directedPeers.length
  return count > 1
    ? `${t('execution.sequenceChart.peerDirected')} ×${count}`
    : t('execution.sequenceChart.peerDirected')
}

function statusText(stage: ExecutionStage): string {
  if (stage.status === 'notObserved') return t('execution.stages.notObserved')
  if (stage.evidence.some(evidence => evidence.source.quality === 'observed')) {
    return t('execution.sourceQuality.observed')
  }
  if (stage.evidence.some(evidence => evidence.source.quality === 'reconstructed')) {
    return t('execution.stages.reconstructed')
  }
  return t('execution.stages.qualityUnknown')
}


function stageAria(row: SequenceRow): string {
  const parts = [t(row.stage.labelKey), statusText(row.stage)]
  if (row.evidenceCount) parts.push(String(row.evidenceCount))
  return parts.join(' · ')
}

function internalText(state: InternalState): string {
  if (state === 'observed') return t('execution.sequenceChart.internalObserved')
  if (state === 'reconstructed') return t('execution.sequenceChart.internalReconstructed')
  return t('execution.sequenceChart.internalComputation')
}


function toggleStage(row: SequenceRow): void {
  emit('manual-explore')
  emit('select-stage', row.selected ? null : row.stage.id)
}

</script>

<style scoped>
.execution-sequence {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.state-block {
  margin: 0;
  padding: 8px 0;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.state-block.error {
  color: var(--apple-red, #d03050);
}

.flow-note {
  margin: 0;
  font-size: 12px;
  color: var(--apple-gray-3);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 16px;
  margin: 0;
  padding: 0;
  font-size: 11px;
  color: var(--apple-gray-3);
  list-style: none;
}

.legend li {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-line {
  display: inline-block;
  width: 22px;
  height: 0;
  border-top: 1.5px solid var(--apple-gray-4);
}

.legend-line.logical {
  border-top-style: dashed;
}

.legend-line.confirmed {
  border-top: 2px solid var(--apple-blue);
}

.legend-line.peer {
  border-top: 1.5px dashed var(--apple-blue);
}

.legend-block {
  display: inline-block;
  width: 18px;
  height: 12px;
  border: 1px dashed var(--apple-gray-4);
  border-radius: 2px;
}

.legend-block.observed {
  border-style: solid;
  border-color: var(--apple-gray-2);
  background: color-mix(in srgb, var(--apple-gray-1) 6%, var(--apple-card));
}

.sequence-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius);
  background: var(--apple-card);
}

.sequence-scroll:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: 2px;
}

.sequence-chart {
  min-width: 780px;
}

.sequence-chart.no-lanes {
  min-width: 0;
}

.lane-header,
.sequence-row {
  display: grid;
  grid-template-columns: 180px minmax(0, 600px);
}

.sequence-chart.no-lanes .lane-header,
.sequence-chart.no-lanes .sequence-row {
  grid-template-columns: minmax(0, 1fr);
}

.lane-header {
  height: 28px;
  align-items: center;
  border-bottom: 1px solid var(--apple-border);
}

.stage-column-label {
  padding: 0 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--apple-gray-3);
}

.lane-area {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 200px);
  height: 56px;
}

.lane-axis {
  display: block;
  height: 28px;
}

.lane-heading {
  position: absolute;
  top: 6px;
  transform: translateX(-50%);
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-2);
  white-space: nowrap;
}

.sequence-row {
  position: relative;
  border-bottom: 1px solid var(--apple-border);
  transition: background-color var(--apple-dur-fast) var(--apple-ease-out);
}

.sequence-row:last-child {
  border-bottom: 0;
}

.sequence-row.selected {
  background: color-mix(in srgb, var(--apple-blue) 5%, var(--apple-card));
}

.sequence-row.has-failure {
  border-left: 2px solid var(--apple-red, #d03050);
}

.stage-button {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 56px;
  padding: 0 10px;
  font: inherit;
  color: var(--apple-gray-1);
  text-align: left;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--apple-border);
  cursor: pointer;
}

.stage-button:focus-visible {
  outline: 2px solid var(--apple-blue);
  outline-offset: -2px;
}

.stage-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.stage-index {
  flex: none;
  min-width: 14px;
  color: var(--apple-gray-4);
  font-size: 11px;
}

.stage-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.stage-label {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.25;
}

.stage-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  color: var(--apple-gray-3);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--apple-gray-4);
}

.status-dot.observed {
  background: var(--apple-green);
}

.stage-count {
  padding: 0 4px;
  font-size: 10px;
  border: 1px solid var(--apple-border);
  border-radius: 999px;
}

.stage-failure {
  color: var(--apple-red, #d03050);
}

.lane-guide {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 0;
  border-left: 1px dashed var(--apple-gray-5);
  opacity: 0.7;
}

.lane-cell {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 0 8px;
}

.internal-block {
  display: flex;
  flex-direction: column;
  gap: 1px;
  width: 176px;
  padding: 5px 8px;
  font-size: 11px;
  line-height: 1.25;
  color: var(--apple-gray-2);
  background: var(--apple-card);
  border: 1px dashed var(--apple-gray-4);
  border-radius: var(--apple-radius-sm);
}

.internal-block.observed {
  color: var(--apple-gray-1);
  border-style: solid;
  border-color: var(--apple-gray-2);
  background: color-mix(in srgb, var(--apple-gray-1) 6%, var(--apple-card));
}

.internal-block.reconstructed {
  border-style: dotted;
}

.internal-label {
  font-weight: 600;
}

.internal-mark {
  font-size: 9px;
  color: var(--apple-gray-3);
}

.flow-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.flow-line {
  fill: none;
}

.flow-line.logical {
  stroke: var(--apple-gray-4);
  stroke-width: 1.2;
  stroke-dasharray: 4 4;
}

.flow-line.confirmed {
  stroke: var(--apple-blue);
  stroke-width: 2;
}

.flow-line.peer {
  stroke: var(--apple-blue);
  stroke-width: 1.4;
  stroke-dasharray: 3 3;
}
.internal-block.active {
  animation: internal-stage-pulse 520ms ease-out 1;
}

.flow-line.confirmed.active {
  animation: confirmed-packet-pulse 520ms ease-out 1;
}

.flow-line.peer.active {
  animation: peer-direction-pulse 520ms ease-out 1;
}

@keyframes internal-stage-pulse {
  0% { opacity: 0.45; }
  70%, 100% { opacity: 1; }
}

@keyframes confirmed-packet-pulse {
  0% { opacity: 0.3; }
  70%, 100% { opacity: 1; }
}

@keyframes peer-direction-pulse {
  from { stroke-dashoffset: 12; opacity: 0.3; }
  to { stroke-dashoffset: 0; opacity: 1; }
}


.arrow-logic {
  fill: none;
  stroke: var(--apple-gray-4);
  stroke-width: 1.2;
}

.arrow-peer {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 1.4;
}

.arrow-confirmed {
  fill: var(--apple-blue);
}

.flow-label {
  fill: var(--apple-gray-2);
  font-size: 10px;
  font-family: var(--apple-font-mono);
}

.peer-label {
  fill: var(--apple-gray-3);
  font-size: 9px;
}

.packet-dot {
  fill: var(--apple-blue);
}

 .packet-dot.active {
  animation: packet-pulse 520ms ease-out 1;
}

@keyframes packet-pulse {
  0% { opacity: 0.25; }
  70%, 100% { opacity: 1; }
}

 .evidence-title {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--apple-gray-2);
}

.unresolved-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.unresolved-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.unresolved-item {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 11px;
  color: var(--apple-gray-2);
}

.unresolved-kind {
  color: var(--apple-gray-3);
}

.muted {
  margin: 0;
  color: var(--apple-gray-3);
  font-size: 12px;
}

.mono {
  font-family: var(--apple-font-mono);
  font-size: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .sequence-row {
    transition: none;
  }

  .internal-block.active,
  .flow-line.confirmed.active,
  .flow-line.peer.active,
  .packet-dot.active {
    animation: none;
  }
}
</style>
