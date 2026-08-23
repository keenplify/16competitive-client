'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.getStructLength = exports.readStructMultiple = exports.readStruct = void 0
/**
 * Parses binary buffer (wrapped to DataView) according to a structure
 * description
 * @param dataView The DataView object
 * @param struct Structure description. The structure can't contain keys
 * starting with a digit due to the peculiarities of the javascript engine.
 * Otherwise, the reading result may be corrupted.
 * @param byteOffset Offset in buffer to read, "0" by default
 * @returns The structure applying result
 */
var readStruct = function (dataView, struct, byteOffset) {
  if (byteOffset === void 0) {
    byteOffset = 0
  }
  var offset = byteOffset
  var structResult = {}
  for (var key in struct) {
    // Assert the key and value relationship to bypass TS mapped-type loop limitations
    var typedKey = key
    structResult[typedKey] = struct[key].getValue(dataView, offset)
    offset += struct[key].byteLength
  }
  return structResult
}
exports.readStruct = readStruct
/**
 * @todo Describe me
 *
 * @param dataView The DataView object
 * @param struct Structure description. The structure can't contain keys
 * starting with a digit due to the peculiarities of the javascript engine.
 * Otherwise, the reading result may be corrupted.
 * @param byteOffset Offset in buffer to read, "0" by default
 * @param times Times of structure repeating
 * @returns The array of structure applying result
 */
var readStructMultiple = function (dataView, struct, byteOffset, times) {
  if (byteOffset === void 0) {
    byteOffset = 0
  }
  if (times === void 0) {
    times = 1
  }
  var offset = byteOffset
  var result = []
  for (var i = 0; i < times; i++) {
    var structResult = {}
    for (var key in struct) {
      var typedKey = key
      structResult[typedKey] = struct[key].getValue(dataView, offset)
      offset += struct[key].byteLength
    }
    result[i] = structResult
  }
  return result
}
exports.readStructMultiple = readStructMultiple
/**
 * Returns length of a structure
 * @param struct Structure description
 */
var getStructLength = function (struct) {
  var length = 0
  for (var key in struct) {
    length += struct[key].byteLength
  }
  return length
}
exports.getStructLength = getStructLength
