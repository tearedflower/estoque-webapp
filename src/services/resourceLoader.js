export function createResourceLoader(loaders, { ttl = 30000, now = Date.now } = {}) {
  const entries = new Map()
  return {
    load(name, { force = false } = {}) {
      let entry = entries.get(name)
      if (!entry) { entry = { loadedAt: null, pending: null, generation: 0 }; entries.set(name, entry) }
      if (entry.pending) return entry.pending
      if (!force && entry.loadedAt !== null && now() - entry.loadedAt < ttl) return Promise.resolve()
      const generation = entry.generation
      entry.pending = Promise.resolve().then(() => loaders[name]()).then(() => {
        if (generation === entry.generation) entry.loadedAt = now()
      }).finally(() => { entry.pending = null })
      return entry.pending
    },
    invalidate(names = Object.keys(loaders)) {
      for (const name of names) {
        const entry = entries.get(name)
        if (entry) { entry.loadedAt = null; entry.generation++ }
      }
    },
  }
}
