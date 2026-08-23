'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.INITIAL_UI_BACKGROUND =
  exports.RLOOP =
  exports.MOTION_Z =
  exports.MOTION_Y =
  exports.MOTION_X =
  exports.TRIANGLE_STRIP =
  exports.TRIANGLE_FAN =
  exports.AXLES_NUM =
  exports.MAX_SRCBONES =
  exports.PALETTE_ALPHA_INDEX =
  exports.PALETTE_SIZE =
  exports.RGBA_SIZE =
  exports.RGB_SIZE =
  exports.PALETTE_ENTRIES =
  exports.NF_MASKED =
  exports.MAX_PER_BONE_CONTROLLERS =
  exports.VERSION =
    void 0
/** Supported model format version */
exports.VERSION = 10
/** Maximum number of bone controllers per bone */
exports.MAX_PER_BONE_CONTROLLERS = 6
/** Flag of texture masking */
exports.NF_MASKED = 0x0040
/** Number of colors */
exports.PALETTE_ENTRIES = 256
/** Number of channels for RGB color. Was "PALETTE_CHANNELS" */
exports.RGB_SIZE = 3
/** Number of channels for RGBA color. Was "PALETTE_CHANNELS_ALPHA" */
exports.RGBA_SIZE = 4
/** Total size of a palette, in bytes. */
exports.PALETTE_SIZE = exports.PALETTE_ENTRIES * exports.RGB_SIZE
/** The index in a palette where the alpha color is stored. Used for transparent textures. */
exports.PALETTE_ALPHA_INDEX = 255 * exports.RGB_SIZE
/** Number of bones allowed at source movement */
exports.MAX_SRCBONES = 512
/** Number of axles in 3d space */
exports.AXLES_NUM = 3
/** Triangle fan type */
exports.TRIANGLE_FAN = 0
/** Triangle strip type */
exports.TRIANGLE_STRIP = 1
/** Motion flag X */
exports.MOTION_X = 0x0001
/** Motion flag Y */
exports.MOTION_Y = 0x0002
/** Motion flag Z */
exports.MOTION_Z = 0x0004
/** Controller that wraps shortest distance */
exports.RLOOP = 0x8000
/** Default interface background color */
exports.INITIAL_UI_BACKGROUND = '#4d7f7e'
