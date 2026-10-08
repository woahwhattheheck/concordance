'use strict'

const fastDiff = require('fast-diff')

const MATCH_TOKEN = /[\p{ID_Continue}]+|[^\p{ID_Continue}]/gu
const IDEOGRAPHIC = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const MARK = /\p{Mark}/u
const MAX_WORD_LENGTH = 30

function tokenize (string) {
  const tokens = []

  function emitWord (word) {
    if (!word) return
    const characters = Array.from(word)
    if (characters.length > MAX_WORD_LENGTH) {
      // Long identifier runs retain character-sensitive edits.
      for (const character of characters) tokens.push(character)
    } else {
      tokens.push(word)
    }
  }

  for (const token of string.match(MATCH_TOKEN) || []) {
    if (!IDEOGRAPHIC.test(token)) {
      emitWord(token)
      continue
    }

    // Unlike space-delimited Latin words, short CJK sentences normally have
    // no word separators. Treat each ideograph/syllable as an atom rather than
    // deleting the entire sentence when one character changes. Preserve
    // adjacent Latin words and attach combining marks to the preceding atom.
    let word = ''
    for (const character of Array.from(token)) {
      if (IDEOGRAPHIC.test(character)) {
        emitWord(word)
        word = ''
        tokens.push(character)
      } else if (MARK.test(character) && !word && tokens.length &&
                 IDEOGRAPHIC.test(tokens[tokens.length - 1])) {
        tokens[tokens.length - 1] += character
      } else {
        word += character
      }
    }
    emitWord(word)
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
