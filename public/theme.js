// Apply the saved appearance before first paint (dark by default, like the app).
// A separate file rather than inline, so the Content-Security-Policy can forbid inline scripts.
;(() => {
  let a = 'dark'
  try {
    const saved = localStorage.getItem('appearance')
    if (['dark', 'light', 'system'].includes(saved)) a = saved
  } catch {}
  if (a !== 'system') document.documentElement.dataset.theme = a
  // The status bar (Home Screen app) and browser chrome follow the app's theme,
  // not just the phone's, since the app defaults to dark.
  const dark = a === 'dark' || (a === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0B0E13' : '#F2F4F8')
})()
