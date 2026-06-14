import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendFeature,
  clearFeatureTimeline,
  featureRecords,
  featureTimelineCount,
  getTimelineMarker,
  setTimelineMarker,
  suppressedBodyIds,
  timelineActiveCount,
} from '../../src/feature-timeline';

beforeEach(() => clearFeatureTimeline());

describe('feature-timeline rollback marker (#30 Phase 1)', () => {
  it('keeps the marker at the end as features are appended (all active)', () => {
    appendFeature({ kind: 'extrude', label: 'E1', bodyId: 'b1' });
    appendFeature({ kind: 'revolve', label: 'R1', bodyId: 'b2' });
    expect(featureTimelineCount()).toBe(2);
    expect(getTimelineMarker()).toBe(2);
    expect(timelineActiveCount()).toBe(2);
    expect(suppressedBodyIds()).toEqual([]);
  });

  it('rolling the marker back suppresses the trailing features’ bodies', () => {
    appendFeature({ kind: 'extrude', label: 'E1', bodyId: 'b1' });
    appendFeature({ kind: 'revolve', label: 'R1', bodyId: 'b2' });
    appendFeature({ kind: 'loft', label: 'L1', bodyId: 'b3' });
    expect(setTimelineMarker(1)).toBe(1);
    expect(timelineActiveCount()).toBe(1);
    expect(suppressedBodyIds()).toEqual(['b2', 'b3']);
  });

  it('clamps the marker to [0, count]', () => {
    appendFeature({ kind: 'extrude', label: 'E', bodyId: 'b1' });
    appendFeature({ kind: 'extrude', label: 'E', bodyId: 'b2' });
    expect(setTimelineMarker(99)).toBe(2);
    expect(setTimelineMarker(-5)).toBe(0);
    expect(suppressedBodyIds()).toEqual(['b1', 'b2']); // marker 0 -> all suppressed
  });

  it('ignores records without a bodyId when listing suppressed bodies', () => {
    appendFeature({ kind: 'subtract', label: 'S' }); // mutating feature, no new body
    appendFeature({ kind: 'extrude', label: 'E', bodyId: 'b9' });
    setTimelineMarker(0);
    expect(suppressedBodyIds()).toEqual(['b9']);
  });

  it('clear resets records and marker', () => {
    appendFeature({ kind: 'extrude', label: 'E', bodyId: 'b1' });
    setTimelineMarker(0);
    clearFeatureTimeline();
    expect(featureTimelineCount()).toBe(0);
    expect(getTimelineMarker()).toBe(0);
    expect(suppressedBodyIds()).toEqual([]);
  });

  it('appending after a rollback re-activates the timeline to the end', () => {
    appendFeature({ kind: 'extrude', label: 'E1', bodyId: 'b1' });
    appendFeature({ kind: 'extrude', label: 'E2', bodyId: 'b2' });
    setTimelineMarker(0);
    expect(suppressedBodyIds()).toEqual(['b1', 'b2']);
    appendFeature({ kind: 'extrude', label: 'E3', bodyId: 'b3' });
    expect(getTimelineMarker()).toBe(3);
    expect(suppressedBodyIds()).toEqual([]);
  });

  it('featureRecords exposes a readonly snapshot in order', () => {
    appendFeature({ kind: 'extrude', label: 'E1', bodyId: 'b1' });
    appendFeature({ kind: 'mirror', label: 'M1', bodyId: 'b2' });
    const recs = featureRecords();
    expect(recs.map((r) => r.label)).toEqual(['E1', 'M1']);
    expect(recs.map((r) => r.bodyId)).toEqual(['b1', 'b2']);
  });
});
