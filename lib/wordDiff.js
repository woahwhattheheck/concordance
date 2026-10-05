'use strict'

const fastDiff = require('fast-diff')

const MATCH_TOKEN = /[\p{ID_Continue}]+|[^\p{ID_Continue}]/gu
const MAX_WORD_LENGTH = 30

function tokenize (string) {
  const tokens = []
  for (const token of string.match(MATCH_TOKEN) || []) {
    const characters = Array.from(token)
    if (characters.length > MAX_WORD_LENGTH) {
      // Refine long words before diffing, including when adjacent punctuation
      // or whitespace changes in the same edit. Short words remain indivisible.
      for (const character of characters) tokens.push(character)
    } else {
      tokens.push(token)
    }
  }
  return tokens
}

module.exports = function wordDiff (actual, expected) {
  if (actual === expected) return fastDiff(actual, expected)

  const markers = new Map()
  const tokens = []
  let nextMarker = 1

  function encode (string) {
    let encoded = ''
    for (const token of tokenize(string)) {
      let marker = markers.get(token)
      if (marker === undefined) {
        // fast-diff operates on UTF-16: never encode an atom as a surrogate.
        if (nextMarker === 0xD800) nextMarker = 0xE000
        if (nextMarker > 0xFFFF) return null
        marker = String.fromCharCode(nextMarker++)
        markers.set(token, marker)
        tokens[marker.charCodeAt(0)] = token
      }
      encoded += marker
    }
    return encoded
  }

  const encodedActual = encode(actual)
  const encodedExpected = encode(expected)
  // Preserve a valid diff even when a line exhausts the single-unit alphabet.
  if (encodedActual === null || encodedExpected === null) return fastDiff(actual, expected)

  return fastDiff(encodedActual, encodedExpected).map(([operation, encoded]) => {
    let decoded = ''
    for (const marker of encoded) decoded += tokens[marker.charCodeAt(0)]
    return [operation, decoded]
  })
}
