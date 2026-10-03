import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environmentOptions: {
      // Tests feed hostile HTML on purpose; never let the test DOM fetch from it.
      happyDOM: { settings: { disableIframePageLoading: true, disableJavaScriptFileLoading: true, disableCSSFileLoading: true } },
    },
  },
})
