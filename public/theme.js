// Apply the saved appearance before first paint (dark by default, like the app).
// A separate file rather than inline, so the Content-Security-Policy can forbid inline scripts.
;(() => {
  let a = 'dark'
  try {
    const saved = localStorage.getItem('appearance')
    if (['dark', 'light', 'system'].includes(saved)) a = saved
  } catch {}
  if (a !== 'system') document.documentElement.dataset.theme = a
})()
