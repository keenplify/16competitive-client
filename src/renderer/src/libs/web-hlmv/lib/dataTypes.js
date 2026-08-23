'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.skip =
  exports.vec3 =
  exports.array =
  exports.string =
  exports.double =
  exports.float64 =
  exports.float =
  exports.float32 =
  exports.uint =
  exports.uint32 =
  exports.int =
  exports.int32 =
  exports.ushort =
  exports.uint16 =
  exports.short =
  exports.int16 =
  exports.ubyte =
  exports.uint8 =
  exports.byte =
  exports.int8 =
    void 0
/**
 * Creates reader of the Int8 value at the specified byte offset from the
 * start of the DataView object. It has a minimum value of -128 and a
 * maximum value of 127 (inclusive).
 */
exports.int8 = {
  byteLength: 1,
  getValue: function (dataView, offset) {
    return dataView.getInt8(offset)
  },
  arrayConstructor: Int8Array
}
/**
 * Alias for int8. Creates reader of the Int8 value at the specified byte
 * offset from the start of the DataView object. It has a minimum value of
 * -128 and a maximum value of 127 (inclusive).
 */
exports.byte = exports.int8
/**
 * Creates reader of the Uint8 value at the specified byte offset from the
 * start of the DataView object. It has a minimum value of 0 and a
 * maximum value of 255 (inclusive).
 */
exports.uint8 = {
  byteLength: 1,
  getValue: function (dataView, offset) {
    return dataView.getUint8(offset)
  },
  arrayConstructor: Uint8Array
}
/**
 * Alias for uint8. Creates reader of the Uint8 value at the specified byte
 * offset from the start of the DataView object. It has a minimum value of 0
 * and a maximum value of 255 (inclusive).
 */
exports.ubyte = exports.uint8
/**
 * Creates reader of the Int16 value at the specified byte offset from the
 * start of the DataView object. It has a minimum value of -32 768 and a
 * maximum value of 32 767 (inclusive).
 */
exports.int16 = {
  byteLength: 2,
  getValue: function (dataView, offset) {
    return dataView.getInt16(offset, true)
  },
  arrayConstructor: Int16Array
}
/**
 * Alias for uint16. Creates reader of the Int16 value at the specified byte
 * offset from the start of the DataView object. It has a minimum value of
 * -32 768 and a maximum value of 32 767 (inclusive).
 */
exports.short = exports.int16
/**
 * Creates reader of the Uint16 value at the specified byte offset from the
 * start of the DataView object.
 */
exports.uint16 = {
  byteLength: 2,
  getValue: function (dataView, offset) {
    return dataView.getUint16(offset, true)
  },
  arrayConstructor: Uint16Array
}
/**
 * Alias for uint16. Creates reader of the Uint16 value at the specified byte
 * offset from the start of the DataView object.
 */
exports.ushort = exports.uint16
/**
 * Creates reader of the Int32 value at the specified byte offset from the
 * start of the DataView object.
 */
exports.int32 = {
  byteLength: 4,
  getValue: function (dataView, offset) {
    return dataView.getInt32(offset, true)
  },
  arrayConstructor: Int32Array
}
/**
 * Alias for int32. Creates reader of the Int32 value at the specified byte
 * offset from the start of the DataView object.
 */
exports.int = exports.int32
/**
 * Creates reader of the Uint32 value at the specified byte offset from the
 * start of the DataView object.
 */
exports.uint32 = {
  byteLength: 4,
  getValue: function (dataView, offset) {
    return dataView.getUint32(offset, true)
  },
  arrayConstructor: Uint32Array
}
/**
 * Alias for uint32. Creates reader of the Uint32 value at the specified byte
 * offset from the start of the DataView object.
 */
exports.uint = exports.uint32
/**
 * Creates reader of the Float32 value at the specified byte offset from the
 * start of the DataView object.
 */
exports.float32 = {
  byteLength: 4,
  getValue: function (dataView, offset) {
    return dataView.getFloat32(offset, true)
  },
  arrayConstructor: Float32Array
}
/**
 * Alias for float32. Creates reader of the Float32 value at the specified
 * byte offset from the start of the DataView object.
 */
exports.float = exports.float32
/**
 * Creates reader of the Float64 value at the specified byte offset from the
 * start of the DataView object.
 */
exports.float64 = {
  byteLength: 8,
  getValue: function (dataView, offset) {
    return dataView.getFloat64(offset, true)
  },
  arrayConstructor: Float64Array
}
/**
 * Alias for float64. Creates reader of the Float64 value at the specified
 * byte offset from the start of the DataView object.
 */
exports.double = exports.float64
/**
 * Creates reader of the String value at the specified byte offset from the
 * start of the DataView object.
 * @param length Length of the string
 */
var string = function (length) {
  return {
    byteLength: length,
    getValue: function (dataView, offset) {
      var result = ''
      for (var i = 0; i < length; i += exports.uint8.byteLength) {
        var charCode = exports.uint8.getValue(dataView, offset + i)
        // End of the string
        if (charCode === 0) {
          break
        }
        result += String.fromCharCode(charCode)
      }
      return result
    }
  }
}
exports.string = string
/**
 * Creates reader of the array of the specified type values at the specified
 * byte offset from the start of the DataView object.
 */
var array = function (arrayLength, structType) {
  return {
    byteLength: structType.byteLength * arrayLength,
    getValue: function (dataView, byteOffset) {
      var TypedArrayConstructor = structType.arrayConstructor
      var out = TypedArrayConstructor
        ? new TypedArrayConstructor(arrayLength)
        : new Array(arrayLength)
      for (var i = 0; i < arrayLength; i++) {
        var itemByteLength = i * structType.byteLength
        var value = structType.getValue(
          dataView,
          byteOffset + itemByteLength,
          structType.byteLength
        )
        out[i] = value
      }
      return out
    }
  }
}
exports.array = array
/**
 * Alias for float32-vector with 3 elements
 */
exports.vec3 = (0, exports.array)(3, exports.float)
/**
 * Creates an element to skip a specified number of bytes or number of bytes in
 * accordance with the specified data type.
 * @param lengthOrDataType Length in bytes to skip or data type
 */
var skip = function (lengthOrDataType) {
  return {
    byteLength:
      typeof lengthOrDataType === 'number' ? lengthOrDataType : lengthOrDataType.byteLength,
    getValue: function () {
      return undefined
    }
  }
}
exports.skip = skip
