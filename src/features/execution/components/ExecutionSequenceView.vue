<template>
  <section
    class="execution-sequence"
    :aria-label="t(isIdentity ? 'execution.identitySequence.canvasTitle' : hasLanes ? 'execution.sequenceChart.title' : 'execution.sequenceView')"
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
      <p v-if="isIdentity" class="flow-note">{{ t('execution.identitySequence.businessOrderNote') }}</p>
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
        :aria-label="t(isIdentity ? 'execution.identitySequence.canvasTitle' : hasLanes ? 'execution.sequenceChart.title' : 'execution.sequenceView')"
      >
        <div class="sequence-chart" :class="{ 'no-lanes': !hasLanes, 'identity-lanes': isIdentity }">
          <div v-if="hasLanes" class="lane-header" aria-hidden="true">
            <span class="stage-column-label">{{ t('execution.sequenceChart.stageColumn') }}</span>
            <div class="lane-area lane-axis">
              <span
                v-for="lane in visibleLanes"
                :key="lane.id"
                class="lane-heading"
                :style="{ left: `${lane.centerX}px` }"
              >
                {{ t(lane.labelKey) }}
              </span>
            </div>
          </div>

          <div
            v-if="isIdentity"
            class="sequence-row identity-relation-row"
            role="group"
            :aria-label="`${t('execution.identityTimeline.dispatchTitle')} · ${identityDispatchMeta}`"
          >
            <div class="identity-relation-copy">
              <span class="stage-index mono">1</span>
              <span class="stage-text">
                <span class="stage-label">{{ t('execution.identityTimeline.dispatchTitle') }}</span>
                <span class="stage-meta">{{ identityDispatchMeta }}</span>
              </span>
            </div>
            <div class="lane-area identity-relation-area" aria-hidden="true">
              <span
                v-for="lane in visibleLanes"
                :key="`${lane.id}-dispatch-guide`"
                class="lane-guide"
                :style="{ left: `${lane.centerX - 0.5}px` }"
              ></span>
              <svg
                v-if="identityDispatchVisible"
                class="flow-layer"
                viewBox="0 0 600 56"
                preserveAspectRatio="none"
                focusable="false"
              >
                <defs>
                  <marker
                    :id="`${uid}-identity-dispatch-arrow`"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path class="identity-dispatch-arrow" d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                  <marker
                    :id="`${uid}-identity-dispatch-confirmed`"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path class="arrow-confirmed" d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                </defs>
                <line
                  class="identity-relation dispatch"
                  :x1="identityLaneX('Admin')"
                  :x2="identityLaneX('Audit')"
                  y1="30"
                  y2="30"
                  :marker-end="`url(#${uid}-identity-dispatch-arrow)`"
                />
                <!-- One exact TaskDispatchReq rides this relation; it is not a stage. -->
                <line
                  v-if="identityDispatchPackets.length"
                  class="flow-line confirmed"
                  :class="{ cue: identityDispatchAnimation }"
                  :x1="identityLaneX('Admin')"
                  :x2="identityDispatchMarkerX"
                  y1="22"
                  y2="22"
                  :marker-end="`url(#${uid}-identity-dispatch-confirmed)`"
                />
                <line
                  v-if="identityDispatchAnimation"
                  :key="`identity-packet-trail:${animationActivityId}`"
                  class="packet-trail"
                  :class="{ 'is-looping': identityDispatchLoop }"
                  :x1="identityLaneX('Admin')"
                  :x2="identityDispatchMarkerX"
                  y1="22"
                  y2="22"
                  pathLength="100"
                  :style="identityDispatchTravelStyle"
                />
                <path
                  v-if="identityDispatchAnimation"
                  :key="`identity-packet-arrow:${animationActivityId}`"
                  class="moving-arrow packet"
                  d="M -9 -4.5 L0 0 L-9 4.5 Z"
                >
                  <animateMotion
                    :path="identityDispatchPath"
                    :dur="`${identityDispatchDurationMs}ms`"
                    :repeatCount="identityDispatchLoop ? 'indefinite' : '1'"
                    rotate="auto"
                    fill="freeze"
                  />
                </path>
                <circle
                  v-if="identityDispatchPackets.length"
                  class="packet-dot"
                  :class="{ 'cue-target': identityDispatchAnimation }"
                  :cx="identityDispatchMarkerX"
                  cy="22"
                  r="4"
                />
                <circle
                  v-if="identityDispatchAnimation && !identityDispatchLoop"
                  :key="`identity-packet-token:${animationActivityId}`"
                  class="packet-token"
                  :cx="identityLaneX('Admin')"
                  cy="22"
                  r="4.5"
                  :style="identityDispatchTravelStyle"
                />
                <text
                  v-if="identityDispatchPackets.length"
                  class="flow-label"
                  :x="(identityLaneX('Admin') + identityLaneX('Audit')) / 2"
                  y="14"
                  text-anchor="middle"
                >
                  {{ identityDispatchLabel }}
                </text>
                <text
                  v-else
                  class="identity-relation-label dispatch"
                  :x="(identityLaneX('Admin') + identityLaneX('Audit')) / 2"
                  y="23"
                  text-anchor="middle"
                >
                  {{ t('execution.identitySequence.taskDispatchRelation') }}
                </text>
              </svg>
            </div>
          </div>

          <div
            v-for="row in rows"
            :key="row.stage.id"
            class="sequence-row"
            :class="{
              selected: row.selected,
              'has-failure': row.stage.hasFailureEvidence,
              'cue-active': row.cueFocus,
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
              <span class="stage-index mono">{{ row.stage.index + (isIdentity ? 2 : 1) }}</span>
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
                v-for="lane in visibleLanes"
                :key="`${lane.id}-guide`"
                class="lane-guide"
                :style="{ left: `${lane.centerX - 0.5}px` }"
              ></span>

              <div v-for="lane in visibleLanes" :key="`${lane.id}-cell`" class="lane-cell">
                <div
                  v-if="row.lane === lane.id"
                  :key="row.animatedInternal ? animationActivityId || row.stage.id : row.stage.id"
                  class="internal-block"
                  :class="[row.internal ?? 'logical', { active: row.animatedInternal }]"
                >
                  <span class="internal-label">{{ flowLabel(row) }}</span>
                  <span v-if="row.internal" class="internal-mark">
                    {{ internalText(row.internal) }}
                  </span>
                </div>
                <div
                  v-if="row.adminConclusion && lane.id === 'Admin'"
                  class="internal-block reconstructed"
                >
                  <span class="internal-label">{{ t('execution.identitySequence.adminConclusion') }}</span>
                  <span class="internal-mark">{{ t('execution.identitySequence.reconstructed') }}</span>
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
                  <template v-if="row.fromLane && row.toLane">
                  <marker
                    :id="markerId(row, 'logic')"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path class="arrow-logic" d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                  <marker
                    :id="markerId(row, 'peer')"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path class="arrow-peer" d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                  <marker
                    :id="markerId(row, 'confirmed')"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                  >
                    <path class="arrow-confirmed" d="M0,0 L8,4 L0,8 Z" />
                  </marker>
                  </template>
                  <template v-if="row.fromLane && row.toLane">

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
                  class="flow-line confirmed"
                  :class="{ cue: row.animatedPacket }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="22"
                  y2="22"
                  :marker-end="markerUrl(row, 'confirmed')"
                />

                <!-- One observed TaskDispatchReq rides the exact confirmed line. -->
                <line
                  v-if="row.animatedPacket"
                  :key="`packet-trail:${animationActivityId}`"
                  class="packet-trail"
                  :class="{ 'is-looping': row.motionLoop }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="22"
                  y2="22"
                  pathLength="100"
                  :style="travelStyle(row)"
                />

                <!-- A soft ribbon sweeps the confirmed edge under the travelling arrowhead. -->
                <line
                  v-if="row.animatedPacket"
                  :key="`packet-ribbon:${animationActivityId}`"
                  class="flow-ribbon"
                  :class="{ 'is-looping': row.motionLoop }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="22"
                  y2="22"
                  pathLength="100"
                  :style="travelStyle(row)"
                />

                <path
                  v-if="row.animatedPacket"
                  :key="`packet-arrow:${animationActivityId}`"
                  class="moving-arrow packet"
                  d="M -9 -4.5 L0 0 L-9 4.5 Z"
                >
                  <animateMotion
                    :path="flowPath(row, 22)"
                    :dur="`${travelDurationMs(row)}ms`"
                    :repeatCount="row.motionLoop ? 'indefinite' : '1'"
                    rotate="auto"
                    fill="freeze"
                  />
                </path>

                <circle
                  v-if="row.confirmed.length"
                  class="packet-dot"
                  :class="{ 'cue-target': row.animatedPacket }"
                  :cx="targetMarkerX(row)"
                  cy="22"
                  r="4"
                />

                <circle
                  v-if="row.animatedPacket && !row.motionLoop"
                  :key="`packet-token:${animationActivityId}`"
                  class="packet-token"
                  :cx="laneX(row.fromLane)"
                  cy="22"
                  r="4.5"
                  :style="travelStyle(row)"
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
                  class="flow-line peer"
                  :class="{ cue: row.animatedPeer }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="42"
                  y2="42"
                  :marker-end="markerUrl(row, 'peer')"
                />

                <!-- A peer direction propagates as a dashed wave, never as a packet token. -->
                <line
                  v-if="row.animatedPeer"
                  :key="`peer-surge:${animationActivityId}`"
                  class="peer-surge"
                  :class="{ 'is-looping': row.motionLoop }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="42"
                  y2="42"
                  pathLength="100"
                  :style="travelStyle(row)"
                />

                <!-- A soft ribbon sweeps the peer edge under the travelling arrowhead. -->
                <line
                  v-if="row.animatedPeer"
                  :key="`peer-ribbon:${animationActivityId}`"
                  class="flow-ribbon peer"
                  :class="{ 'is-looping': row.motionLoop }"
                  :x1="laneX(row.fromLane)"
                  :x2="laneX(row.toLane)"
                  y1="42"
                  y2="42"
                  pathLength="100"
                  :style="travelStyle(row)"
                />

                <path
                  v-if="row.animatedPeer"
                  :key="`peer-arrow:${animationActivityId}`"
                  class="moving-arrow peer"
                  d="M -9 -4.5 L0 0 L-9 4.5 Z"
                >
                  <animateMotion
                    :path="flowPath(row, 42)"
                    :dur="`${travelDurationMs(row)}ms`"
                    :repeatCount="row.motionLoop ? 'indefinite' : '1'"
                    rotate="auto"
                    fill="freeze"
                  />
                </path>

                <text
                  v-if="row.directedPeers.length"
                  class="flow-label peer-label"
                  :x="midX(row)"
                  y="54"
                  text-anchor="middle"
                >
                  {{ peerLabel(row) }}
                </text>

                <circle
                  v-if="row.animatedPacket"
                  :key="`packet-accept:${animationActivityId}`"
                  class="node-accept"
                  :cx="targetMarkerX(row)"
                  cy="22"
                  r="8"
                  :style="travelStyle(row)"
                />

                <path
                  v-if="row.animatedPeer"
                  :key="`peer-accept:${animationActivityId}`"
                  class="node-accept peer"
                  :d="peerResponsePath(row)"
                  :style="travelStyle(row)"
                />
                  </template>
                </svg>
            </div>
          </div>
          <div
            v-if="isIdentity"
            class="sequence-row identity-relation-row"
            role="group"
            :aria-label="`${t('execution.identityTimeline.settlementTitle')} · ${props.identityTaskRelations?.settlementLink ? t('execution.identityTimeline.settlementPresent') : t('execution.identityTimeline.settlementUnknown')}`"
          >
            <div class="identity-relation-copy">
              <span class="stage-index mono">7</span>
              <span class="stage-text">
                <span class="stage-label">{{ t('execution.identityTimeline.settlementTitle') }}</span>
                <span class="stage-meta">{{ props.identityTaskRelations?.settlementLink ? t('execution.identityTimeline.settlementPresent') : t('execution.identityTimeline.settlementUnknown') }}</span>
              </span>
            </div>
            <div class="lane-area identity-relation-area" aria-hidden="true">
              <span
                v-for="lane in visibleLanes"
                :key="`${lane.id}-completion-guide`"
                class="lane-guide"
                :style="{ left: `${lane.centerX - 0.5}px` }"
              ></span>
              <svg
                v-if="props.identityTaskRelations?.settlementLink"
                class="flow-layer"
                viewBox="0 0 600 56"
                preserveAspectRatio="none"
                focusable="false"
              >
                <line class="identity-relation" :x1="identityLaneX('Admin')" :x2="identityLaneX('Audit')" y1="30" y2="30" />
                <text class="identity-relation-label" :x="(identityLaneX('Admin') + identityLaneX('Audit')) / 2" y="23" text-anchor="middle">
                  {{ t('execution.identitySequence.taskCompletionRelation') }}
                </text>
              </svg>
            </div>
          </div>
        </div>
      </div>


      <div v-if="unclassified.length" class="unresolved-block">
        <h3 class="evidence-title">{{ t('execution.sequenceChart.unresolvedTitle') }}</h3>
        <ul class="unresolved-list">
          <li v-for="item in unclassified" :key="item.key" class="unresolved-item">
            <span class="unresolved-kind">{{ item.kindLabel }}</span>
            <span class="unresolved-summary">{{ item.summary }}</span>
          </li>
        </ul>
      </div>

      <details v-if="technicalEvidence.length" class="technical-evidence">
        <summary>{{ t('execution.sequenceChart.technicalEvidence', { count: technicalEvidence.length }) }}</summary>
        <ul class="technical-evidence-list">
          <li v-for="item in technicalEvidence" :key="item.key" class="technical-evidence-item">
            <strong>{{ item.summary }}</strong>
            <dl class="technical-fields">
              <div v-for="field in item.fields" :key="field.key" class="technical-field">
                <dt>{{ field.label }}</dt>
                <dd>
                  <code>{{ field.value }}</code>
                  <button
                    type="button"
                    class="copy-button"
                    :disabled="!field.copyable"
                    :aria-label="t('execution.sequenceChart.copyField', { field: field.label })"
                    @click.stop="copyTechnicalValue(field)"
                  >
                    {{ copiedValue === field.value && field.copyable
                      ? t('execution.sequenceChart.copied')
                      : t('execution.sequenceChart.copy') }}
                  </button>
                </dd>
              </div>
            </dl>
          </li>
        </ul>
      </details>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import type { TraceExecutionKind } from '@/api/trace'
import type { ExecutionStage, IdentityTaskRelations } from '@/features/execution/data/executionStages'
import type { ExecutionCommunicationProjection } from '@/features/execution/data/executionCommunication'
import { useI18n } from '@/stores/i18n'
import {
  placeConfirmedDispatches,
  projectSequenceRoles,
  type SequenceLane,
} from '@/features/execution/data/executionSequence'
import {
  SEQUENCE_CHALLENGE_LANES,
  SEQUENCE_IDENTITY_LANES,
  placeSequencePeers,
  projectSequenceRows,
  sequenceDispatchGeometry,
  sequenceFlowMidX,
  sequenceFlowPath,
  sequenceLaneX,
  sequencePeerDirection,
  sequencePeerResponsePath,
  sequenceTargetMarkerX,
  sequenceTravelDistance,
  sequenceTravelDurationMs,
  sequenceTravelStyle,
  type SequenceInternalState,
  type SequenceRow,
  type SequenceTravelStyle,
} from '@/features/execution/data/executionSequenceLayout'

/**
 * Evidence-backed sequence canvas for challenge proof and identity verification.
 *
 * Challenge proof draws three role lanes and its business-stage baseline.
 * Identity verification draws only Admin and Audit lanes; its TaskBook links
 * stay labeled as relations. A solid moving token requires a confirmed protocol
 * packet, and an exact dispatch rides the fixed role route that names its stage
 * or relation row. Peer direction requires an explicit observed direction.
 * Unmapped evidence stays visible; timestamps do not define stage order.
 */

const props = withDefaults(defineProps<{
  kind: TraceExecutionKind | null
  stages: readonly ExecutionStage[]
  communication: ExecutionCommunicationProjection
  identityTaskRelations?: IdentityTaskRelations | null
  selectedStageId: string | null
  animationActivityId: string | null
  /** Activities whose stage is still executing; their edge animation loops. */
  loopActivityIds?: readonly string[]
  loading?: boolean
  error?: string | null
  interactive?: boolean
}>(), { loading: false, error: null, interactive: true, loopActivityIds: () => [], identityTaskRelations: null })

const emit = defineEmits<{
  (event: 'select-stage', stageId: string | null): void
  (event: 'manual-explore'): void
}>()

const { t } = useI18n()
const uid = `execution-sequence-${useId()}`

const inactive = computed(() => props.loading || !props.interactive)
const kindMissing = computed(() => props.kind === null)
const isIdentity = computed(() => props.kind === 'identityVerification')
const hasLanes = computed(() => props.kind === 'challengeProof' || isIdentity.value)

const CHALLENGE_LANES = SEQUENCE_CHALLENGE_LANES
const IDENTITY_LANES = SEQUENCE_IDENTITY_LANES
const visibleLanes = computed(() => isIdentity.value ? IDENTITY_LANES : CHALLENGE_LANES)
function identityLaneX(lane: 'Admin' | 'Audit') {
  return sequenceLaneX(props.kind, lane)
}

/** Roles come only from exact observed worker/peer evidence or TaskDispatchReq source semantics. */
const nodeRole = computed(() => projectSequenceRoles(props.communication))

/**
 * Exact confirmed dispatches belong to the stage or relation row named by their
 * observed role route. A missing stage observation never detaches them.
 */
const dispatchPlacement = computed(() =>
  placeConfirmedDispatches(props.kind, nodeRole.value, props.communication.confirmedPackets),
)
const identityDispatchPackets = computed(() => dispatchPlacement.value.identityDispatchPackets)

/** The dispatch relation row draws the packet only at its exact observed endpoints. */
const identityDispatchGeometry = computed(() => sequenceDispatchGeometry(props.kind))
const identityDispatchMarkerX = computed(() => identityDispatchGeometry.value.markerX)
const identityDispatchDurationMs = computed(() => identityDispatchGeometry.value.durationMs)
const identityDispatchPath = computed(() => identityDispatchGeometry.value.path)
const identityDispatchTravelStyle = computed<SequenceTravelStyle>(
  () => identityDispatchGeometry.value.travelStyle,
)
const identityDispatchActivityId = computed(() => {
  const activityId = props.animationActivityId
  return activityId && identityDispatchPackets.value.some(packet => packet.activityId === activityId)
    ? activityId
    : null
})
const identityDispatchAnimation = computed(() => identityDispatchActivityId.value !== null)
const identityDispatchLoop = computed(() => {
  const activityId = identityDispatchActivityId.value
  return activityId !== null && props.loopActivityIds.includes(activityId)
})
const identityDispatchVisible = computed(() =>
  identityDispatchPackets.value.length > 0 || props.identityTaskRelations?.dispatchLink != null,
)
const identityDispatchMeta = computed(() => {
  if (identityDispatchPackets.value.length > 0) return t('execution.identityTimeline.dispatchDelivered')
  return props.identityTaskRelations?.dispatchLink != null
    ? t('execution.identityTimeline.dispatchPresent')
    : t('execution.identityTimeline.dispatchUnknown')
})
const identityDispatchLabel = computed(() => identityDispatchPackets.value.length > 1
  ? t('execution.sequenceChart.morePackets', { count: identityDispatchPackets.value.length })
  : t('execution.sequenceChart.confirmedDispatch'))

const placedPeers = computed(() =>
  placeSequencePeers(props.communication.peerCorrelations, nodeRole.value),
)
const animatedLocalStage = computed(() => {
  const activityId = props.animationActivityId
  return activityId
    ? props.communication.localStages.find(stage => stage.activityId === activityId) ?? null
    : null
})


const rows = computed<SequenceRow[]>(() => projectSequenceRows({
  kind: props.kind,
  stages: props.stages,
  dispatchPlacement: dispatchPlacement.value,
  peers: placedPeers.value,
  animationActivityId: props.animationActivityId,
  loopActivityIds: props.loopActivityIds,
  selectedStageId: props.selectedStageId,
  activeLocalStage: animatedLocalStage.value,
}))



interface UnclassifiedItem {
  key: string
  kindLabel: string
  summary: string
}

interface TechnicalEvidenceField {
  key: string
  label: string
  value: string
  copyable: boolean
}

interface TechnicalEvidenceItem {
  key: string
  summary: string
  fields: TechnicalEvidenceField[]
}

const unclassified = computed<UnclassifiedItem[]>(() => {
  const items: UnclassifiedItem[] = []
  const placedPacketIds = dispatchPlacement.value.placedActivityIds
  for (const packet of props.communication.confirmedPackets) {
    if (placedPacketIds.has(packet.activityId)) continue
    items.push({
      key: `packet:${packet.activityId}`,
      kindLabel: t('execution.sequenceChart.confirmedStageUnresolved'),
      summary: `${packet.messageType} · ${nodeDescription(packet.fromNodeId)} → ${nodeDescription(packet.toNodeId)}`,
    })
  }

  const placedPeerIds = new Set(rows.value.flatMap(row => row.directedPeers.map(item => item.peer.activityId)))
  for (const peer of props.communication.peerCorrelations) {
    if (placedPeerIds.has(peer.activityId)) continue
    const direction = sequencePeerDirection(peer)
    const summary = direction
      ? direction.eventType === 'ProofReturnedToAudit'
        ? `${nodeDescription(direction.fromNodeId)} → ${nodeDescription(direction.toNodeId)} · ${t('execution.sequenceChart.proofAccepted')}`
        : `${nodeDescription(direction.fromNodeId)} → ${nodeDescription(direction.toNodeId)} · ${t('execution.sequenceChart.challengeDelivered')}`
      : `${nodeDescription(peer.originNodeId)} ↔ ${nodeDescription(peer.nodeId)} · ${t('execution.sequenceChart.peerDirectionPending')}`
    items.push({
      key: `peer:${peer.activityId}`,
      kindLabel: t('execution.sequenceChart.peerAssociation'),
      summary,
    })
  }

  return items
})

function technicalField(key: string, label: string, value: string | number | null): TechnicalEvidenceField {
  const present = value !== null && value !== ''
  return {
    key,
    label,
    value: present ? String(value) : t('execution.notAvailable'),
    copyable: present,
  }
}

const technicalEvidence = computed<TechnicalEvidenceItem[]>(() => {
  const items: TechnicalEvidenceItem[] = []
  for (const packet of props.communication.confirmedPackets) {
    items.push({
      key: `packet:${packet.activityId}`,
      summary: `${packet.messageType} · ${nodeDescription(packet.fromNodeId)} → ${nodeDescription(packet.toNodeId)}`,
      fields: [
        technicalField('messageType', t('execution.protocolFields.messageType'), packet.messageType),
        technicalField('fromNodeId', t('execution.protocolFields.fromNodeId'), packet.fromNodeId),
        technicalField('toNodeId', t('execution.protocolFields.toNodeId'), packet.toNodeId),
        technicalField('dispatchPacketId', t('execution.linkFields.dispatchPacketId'), packet.dispatchPacketId),
        technicalField('packetId', t('execution.protocolFields.packetId'), packet.packetId),
        technicalField('requestId', t('execution.linkFields.requestId'), packet.requestId),
        technicalField('taskId', t('execution.linkFields.taskId'), packet.taskId),
        technicalField('linkKey', t('execution.linkFields.linkKey'), packet.linkKey),
        technicalField('linkSourceRef', t('execution.linkFields.sourceRef'), packet.linkSourceRef),
        technicalField('packetSourceRef', t('execution.protocolFields.sourceRef'), packet.packetSourceRef),
        technicalField('matchBasis', t('execution.linkFields.matchBasis'), packet.matchBasis),
        technicalField('confidence', t('execution.linkFields.confidence'), packet.confidence),
        technicalField('sourceQuality', t('execution.linkFields.sourceQuality'), packet.sourceQuality),
        technicalField('observedAtMs', t('execution.linkFields.observedAtMs'), packet.observedAtMs),
        technicalField('packetTimestampMs', t('execution.protocolFields.timestampMs'), packet.packetTimestampMs),
      ],
    })
  }
  for (const peer of props.communication.peerCorrelations) {
    const direction = peer.direction
    items.push({
      key: `peer:${peer.activityId}`,
      summary: `${nodeDescription(peer.originNodeId)} ↔ ${nodeDescription(peer.nodeId)}`,
      fields: [
        technicalField('linkKind', t('execution.linkFields.linkKind'), peer.linkKind),
        technicalField('originNodeId', t('execution.linkFields.originNodeId'), peer.originNodeId),
        technicalField('nodeId', t('execution.linkFields.nodeId'), peer.nodeId),
        technicalField('linkKey', t('execution.linkFields.linkKey'), peer.linkKey),
        technicalField('linkSourceRef', t('execution.linkFields.sourceRef'), peer.linkSourceRef),
        technicalField('requestId', t('execution.linkFields.requestId'), peer.requestId),
        technicalField('peerConversationId', t('execution.linkFields.peerConversationId'), peer.peerConversationId),
        technicalField('dispatchPacketId', t('execution.linkFields.dispatchPacketId'), peer.dispatchPacketId),
        technicalField('matchBasis', t('execution.linkFields.matchBasis'), peer.matchBasis),
        technicalField('confidence', t('execution.linkFields.confidence'), peer.confidence),
        technicalField('sourceQuality', t('execution.linkFields.sourceQuality'), peer.sourceQuality),
        technicalField('eventType', t('execution.eventType'), direction?.eventType ?? null),
        technicalField('observationId', t('execution.observationDetail.observationId'), direction?.observationId ?? null),
        technicalField('fromNodeId', t('execution.protocolFields.fromNodeId'), direction?.fromNodeId ?? null),
        technicalField('toNodeId', t('execution.protocolFields.toNodeId'), direction?.toNodeId ?? null),
      ],
    })
  }
  return items
})

const copiedValue = ref<string | null>(null)

async function copyTechnicalValue(field: TechnicalEvidenceField): Promise<void> {
  if (!field.copyable) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(field.value)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = field.value
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.append(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      textarea.remove()
      if (!copied) throw new Error('Clipboard copy was refused')
    }
    copiedValue.value = field.value
  } catch {
    copiedValue.value = null
  }
}

function nodeDescription(nodeId: string): string {
  const component = nodeRole.value.get(nodeId)
  const role = component
    ? t(`execution.topology.${component.toLowerCase()}`)
    : t('execution.sequenceChart.unknownNode')
  return `${role} · ${shortId(nodeId)}`
}

function laneX(lane: SequenceLane): number {
  return sequenceLaneX(props.kind, lane)
}

function midX(row: SequenceRow): number {
  return sequenceFlowMidX(props.kind, row.fromLane, row.toLane)
}

function targetMarkerX(row: SequenceRow): number {
  return sequenceTargetMarkerX(props.kind, row.fromLane, row.toLane)
}

function travelDurationMs(row: SequenceRow): number {
  return sequenceTravelDurationMs(sequenceTravelDistance(props.kind, row.fromLane, row.toLane))
}

function flowPath(row: SequenceRow, y: number): string {
  return sequenceFlowPath(props.kind, row.fromLane, row.toLane, y)
}

function travelStyle(row: SequenceRow): SequenceTravelStyle {
  return sequenceTravelStyle(props.kind, row.fromLane, row.toLane)
}

/** Peer acceptance is drawn as a link diamond, never as a packet token. */
function peerResponsePath(row: SequenceRow): string {
  return sequencePeerResponsePath(props.kind, row.fromLane, row.toLane)
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

function flowLabel(row: SequenceRow): string {
  return row.flowLabelKey ? t(row.flowLabelKey) : ''
}

function packetLabel(row: SequenceRow): string {
  return row.confirmed.length > 1
    ? t('execution.sequenceChart.morePackets', { count: row.confirmed.length })
    : t('execution.sequenceChart.confirmedDispatch')
}

function peerLabel(row: SequenceRow): string {
  const directions = row.directedPeers.map(item => item.peer.direction)
  const proofAccepted = directions.some(direction => direction?.eventType === 'ProofReturnedToAudit')
  if (proofAccepted && directions.length === 1) return t('execution.sequenceChart.proofAccepted')
  return directions.length > 1
    ? t('execution.sequenceChart.peerDirectedCount', { count: directions.length })
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

function internalText(state: SequenceInternalState): string {
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
.sequence-chart.identity-lanes .lane-area {
  grid-template-columns: repeat(2, 300px);
}
.sequence-chart.identity-lanes .lane-axis {
  display: block;
}
.identity-relation-copy {
  display: flex;
  min-width: 0;
  min-height: 56px;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-right: 1px solid var(--apple-border);
}
.identity-relation-copy .stage-text,
.identity-relation-copy .stage-meta {
  min-width: 0;
}
.identity-relation-copy .stage-meta {
  white-space: normal;
  line-height: 1.35;
}
.identity-relation-area {
  align-self: stretch;
}
.identity-relation {
  stroke: var(--apple-gray-3);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.identity-relation-label {
  fill: var(--apple-gray-3);
  font-size: 10px;
}
.identity-dispatch-arrow {
  fill: var(--apple-gray-4);
  stroke: none;
}
.identity-relation-label.dispatch {
  font-weight: 650;
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

/* Stage focus follows the selected activity, independently of stage selection. */
.sequence-row.cue-active .stage-button {
  box-shadow: inset 2px 0 0 var(--apple-blue);
}

.sequence-row.cue-active .stage-label {
  color: var(--apple-blue);
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

/* Static emphasis only; the movement is drawn by the token and trail below. */
.flow-line.confirmed.cue {
  stroke-width: 2.4;
}

.flow-line.peer.cue {
  stroke-width: 2.2;
}

.internal-block.active {
  border-color: var(--apple-blue);
  animation: internal-node-settle 760ms var(--apple-ease-out) 1 both;
}

.packet-trail {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 2.4;
  stroke-linecap: round;
  stroke-dasharray: 16 1000;
  animation: packet-trail-travel var(--travel-duration, 1100ms) cubic-bezier(0.3, 0.6, 0.35, 1) 1 both;
}

.packet-token {
  fill: var(--apple-blue);
  stroke: var(--apple-card);
  stroke-width: 1.2;
  animation: packet-token-travel var(--travel-duration, 1100ms) cubic-bezier(0.3, 0.6, 0.35, 1) 1 both;
}

.peer-surge {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 1.6;
  stroke-dasharray: 2 7;
  animation: peer-surge-travel var(--travel-duration, 1100ms) var(--apple-ease-out) 1 both;
}
.moving-arrow {
  fill: var(--apple-blue);
  stroke: none;
}

.moving-arrow.peer {
  fill: var(--apple-blue);
}

/* One soft ribbon sweeps the active edge; it is motion, never a second fact. */
.flow-ribbon {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 8;
  stroke-linecap: round;
  stroke-dasharray: 18 100;
  opacity: 0;
  animation: flow-ribbon-travel var(--travel-duration, 1000ms) cubic-bezier(0.23, 1, 0.32, 1) 1 both;
}

.flow-ribbon.peer {
  stroke-width: 7;
  stroke-dasharray: 12 100;
}

.packet-trail.is-looping,
.flow-ribbon.is-looping,
.peer-surge.is-looping {
  animation-iteration-count: infinite;
}


.node-accept {
  fill: none;
  stroke: var(--apple-blue);
  stroke-width: 1.5;
  stroke-dasharray: 5 7;
  /* The node answers when the token arrives, not when the cue starts. */
  animation: node-accept-settle 320ms var(--apple-ease-out) var(--travel-duration, 1000ms) 1 both;
}

.node-accept.peer {
  stroke-width: 1.3;
  stroke-dasharray: 3 5;
}

@keyframes packet-token-travel {
  from { transform: translateX(0); opacity: 0; }
  10% { opacity: 1; }
  to { transform: translateX(var(--travel-distance, 0px)); opacity: 1; }
}

@keyframes packet-trail-travel {
  from { stroke-dashoffset: 0; opacity: 0; }
  10% { opacity: 1; }
  90% { opacity: 1; }
  to { stroke-dashoffset: -116; opacity: 0; }
}

@keyframes peer-surge-travel {
  from { stroke-dashoffset: 0; opacity: 0; }
  15% { opacity: 1; }
  82% { opacity: 0.9; }
  to { stroke-dashoffset: -100; opacity: 0; }
}

@keyframes flow-ribbon-travel {
  from { stroke-dashoffset: 100; opacity: 0; }
  12% { opacity: 0.34; }
  78% { opacity: 0.34; }
  to { stroke-dashoffset: -40; opacity: 0; }
}

@keyframes node-accept-settle {
  from { opacity: 0; stroke-dashoffset: 24; }
  22% { opacity: 0.95; }
  to { opacity: 0; stroke-dashoffset: 0; }
}

@keyframes internal-node-settle {
  from { box-shadow: 0 0 0 0 color-mix(in srgb, var(--apple-blue) 45%, transparent); }
  to { box-shadow: 0 0 0 5px color-mix(in srgb, var(--apple-blue) 0%, transparent); }
}


.arrow-logic {
  fill: var(--apple-gray-4);
  stroke: none;
}

.arrow-peer {
  fill: var(--apple-blue);
  stroke: none;
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

.packet-dot.cue-target {
  stroke: var(--apple-card);
  stroke-width: 1;
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
  max-height: min(40vh, 360px);
  flex-direction: column;
  gap: 4px;
  margin: 0;
  padding: 0 4px 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
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


.technical-evidence {
  padding-top: 8px;
  border-top: 1px solid var(--apple-border);
  color: var(--apple-gray-2);
  font-size: 11px;
}

.technical-evidence > summary {
  cursor: pointer;
  font-weight: 600;
}

.technical-evidence-list {
  display: flex;
  max-height: min(48vh, 480px);
  flex-direction: column;
  gap: 10px;
  margin: 8px 0 0;
  padding: 0 4px 0 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--apple-gray-5) transparent;
  list-style: none;
}

.technical-evidence-item {
  padding: 8px;
  border: 1px solid var(--apple-border);
  border-radius: var(--apple-radius-sm);
}

.technical-fields {
  display: grid;
  gap: 4px;
  margin: 6px 0 0;
}

.technical-field {
  display: grid;
  grid-template-columns: minmax(100px, 0.4fr) minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.technical-field dt {
  color: var(--apple-gray-3);
}

.technical-field dd {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
  margin: 0;
}

.technical-field code {
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--apple-gray-2);
  font: inherit;
}

.copy-button {
  flex: none;
  padding: 2px 5px;
  color: var(--apple-blue);
  font: inherit;
  font-size: 10px;
  background: transparent;
  border: 1px solid var(--apple-border);
  border-radius: 4px;
  cursor: pointer;
}

.copy-button:disabled {
  color: var(--apple-gray-4);
  cursor: default;
}

.unresolved-summary {
  overflow-wrap: anywhere;
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

  /* Only travel is removed; the confirmed fact, node response and stage focus stay. */
  .packet-token,
  .packet-trail,
  .moving-arrow,
  .flow-ribbon,
  .peer-surge {
    display: none;
  }

  .internal-block.active,
  .node-accept {
    animation: none;
  }

  .internal-block.active {
    box-shadow: inset 0 0 0 1px var(--apple-blue);
  }
}
</style>
