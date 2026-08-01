import { create } from 'zustand'
import { temporal } from 'zundo'
import { emptyDesign, type Design } from '../model/types'

interface DesignState {
  design: Design
  setDesign: (design: Design) => void
}

/**
 * Document store wrapped in zundo's temporal middleware — every `design`
 * mutation is recorded and exposed via useDesignStore.temporal
 * (undo / redo / clear).
 */
export const useDesignStore = create<DesignState>()(
  temporal(
    (set) => ({
      design: emptyDesign(),
      setDesign: (design) => set({ design }),
    }),
    { partialize: (state) => ({ design: state.design }) },
  ),
)
