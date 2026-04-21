import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach, vi } from "vitest"

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
})

interface StorageWithStore extends Storage {
  __store__?: Record<string, string>
}

// Mock localStorage for tests
const store: Record<string, string> = {}

const localStorageMock = Object.create(Storage.prototype)
Object.defineProperty(localStorageMock, "__store__", {
  value: store,
  writable: true,
})

// Override Storage.prototype methods with implementations that use our store
Storage.prototype.getItem = function(key: string) {
  const s = (this as StorageWithStore).__store__ || store
  return Object.prototype.hasOwnProperty.call(s, key) ? s[key] : null
}

Storage.prototype.setItem = function(key: string, value: string) {
  const s = (this as StorageWithStore).__store__ || store
  s[key] = String(value)
}

Storage.prototype.removeItem = function(key: string) {
  const s = (this as StorageWithStore).__store__ || store
  delete s[key]
}

Storage.prototype.clear = function() {
  const s = (this as StorageWithStore).__store__ || store
  for (const key in s) {
    delete s[key]
  }
}

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})
