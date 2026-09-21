/// <reference types="vite/client" />

import type { DevflowDesktopBridge } from './lib/desktopBridge'

declare module '*.css' {
  const content: string
  export default content
}

declare global {
  interface Window {
    devflow?: DevflowDesktopBridge
  }
}

export {}
