// Thin wrapper around YouTube's IFrame Player API — loaded on demand, once, and reused by
// every player instance on the page.

export interface YTPlayer {
  getCurrentTime(): number
  getDuration(): number
  getPlayerState(): number
  seekTo(seconds: number, allowSeekAhead: boolean): void
  playVideo(): void
  pauseVideo(): void
  loadModule(module: string): void
  unloadModule(module: string): void
  setOption(module: string, option: string, value: unknown): void
  destroy(): void
}

interface YTPlayerEvent {
  target: YTPlayer
}

interface YTStateChangeEvent extends YTPlayerEvent {
  data: number
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string
      // Privacy-enhanced mode — the embed loads from youtube-nocookie.com instead of youtube.com,
      // so playback doesn't tie into (or get personalized by) whatever Google/YouTube account the
      // viewer happens to be signed into in that browser.
      host?: string
      playerVars?: Record<string, unknown>
      events?: {
        onReady?: (e: YTPlayerEvent) => void
        onStateChange?: (e: YTStateChangeEvent) => void
      }
    },
  ) => YTPlayer
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number; BUFFERING: number; CUED: number }
}

declare global {
  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<void> | null = null

export function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}
