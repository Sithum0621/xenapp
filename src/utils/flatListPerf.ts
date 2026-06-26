import { NATIVE_FLUID_LIST_PROPS } from '@/src/utils/nativeFluidList';

/** Shared FlatList tuning for primary (scrollable) lists. */
export const FLAT_LIST_PERF_SCROLLABLE = {
  ...NATIVE_FLUID_LIST_PROPS,
  initialNumToRender: 12,
  maxToRenderPerBatch: 12,
  windowSize: 7,
  updateCellsBatchingPeriod: 50,
} as const;
