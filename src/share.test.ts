import { describe, expect, it } from 'vitest'
import { eventShareURL, playerShareURL, routeForSharePath, tournamentShareURL } from './share'

describe('share links', () => {
  it('builds short openboard.online links', () => {
    expect(playerShareURL('12641216')).toBe('https://openboard.online/p/12641216')
    expect(eventShareURL('202605200063', '12641216')).toBe('https://openboard.online/e/202605200063?highlight=12641216')
    expect(tournamentShareURL('/princeton-national-chess-day-open')).toBe('https://openboard.online/t/princeton-national-chess-day-open')
  })

  it('opens the matching screen from a share link', () => {
    expect(routeForSharePath('/p/12641216', '')).toBe('#/player/12641216')
    expect(routeForSharePath('/e/202605200063', '?highlight=12641216')).toBe('#/event/202605200063?highlight=12641216')
    expect(routeForSharePath('/t/princeton-national-chess-day-open', '')).toBe('#/tournament/princeton-national-chess-day-open')
    expect(routeForSharePath('/', '')).toBeUndefined()
    expect(routeForSharePath('/p/nope', '')).toBeUndefined()
  })
})
