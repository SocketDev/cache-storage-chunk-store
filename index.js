const Buffer = require('buffer').Buffer

function noop () {}

class Storage {
  constructor (chunkLength, opts = {}) {
    if (!window || !window.caches) throw new Error('Not supported on this platform')

    if (!(this instanceof Storage)) return new Storage(chunkLength, opts)

    this.chunkLength = Number(chunkLength)
    if (!this.chunkLength) { throw new Error('First argument must be a chunk length') }

    this.closed = false
    this.length = Number(opts.length) || Infinity
    this.name = opts.name || 'CacheStorageChunkStore'

    if (this.length !== Infinity) {
      this.lastChunkLength = this.length % this.chunkLength || this.chunkLength
      this.lastChunkIndex = Math.ceil(this.length / this.chunkLength) - 1
    }

    this.cachePromise = window.caches.open(this.name)
  }

  put (index, buf, cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    const isLastChunk = index === this.lastChunkIndex
    if (isLastChunk && buf.length !== this.lastChunkLength) {
      return nextTick(cb, new Error('Last chunk length must be ' + this.lastChunkLength))
    }

    if (!isLastChunk && buf.length !== this.chunkLength) {
      return nextTick(cb, new Error('Chunk length must be ' + this.chunkLength))
    }

    // Even though new Response() can take buf directly, creating a Blob first
    // is significantly faster in Chrome and Firefox
    const blob = new window.Blob([buf])

    const response = new window.Response(blob, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': buf.length
      }
    })

    this.cachePromise.then((cache) => {
      cache
        .put('/index/' + index, response)
        .then(() => cb(null), cb)
    }, cb)
  }

  get (index, opts, cb = noop) {
    if (typeof opts === 'function') {
      cb = opts
      opts = null
    }

    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.cachePromise.then((cache) => {
      cache.match('/index/' + index).then((response) => {
        if (!response) {
          const err = new Error('Chunk not found')
          err.notFound = true
          return cb(err)
        }

        response.arrayBuffer().then((arrayBuffer) => {
          const buf = Buffer.from(arrayBuffer)
          if (!opts) return cb(null, buf)

          const offset = opts.offset || 0
          const len = opts.length || (buf.length - offset)

          if (offset === 0 && len === buf.length) {
            return cb(null, buf)
          }
          return cb(null, buf.slice(offset, len + offset))
        }, cb)
      }, cb)
    }, cb)
  }

  close (cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true

    nextTick(cb, null)
  }

  destroy (cb = noop) {
    if (this.closed) return nextTick(cb, new Error('Storage is closed'))

    this.closed = true
    this.cachePromise = null

    window.caches.delete(this.name).then(() => {
      cb(null)
    }, cb)
  }
}

function nextTick (cb, err, val) {
  queueMicrotask(() => cb(err, val))
}

module.exports = Storage
