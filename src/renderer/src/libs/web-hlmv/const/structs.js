'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.animation =
  exports.mesh =
  exports.subModel =
  exports.texture =
  exports.bodyPart =
  exports.seqGroup =
  exports.seqDesc =
  exports.boundingBox =
  exports.attachment =
  exports.boneController =
  exports.bone =
  exports.header =
    void 0
var dataTypes_1 = require('../lib/dataTypes')
var constants_1 = require('./constants')
/**
 * Head of mdl-file
 */
exports.header = {
  /** Model format ID */
  id: dataTypes_1.int,
  /** Format version number */
  version: dataTypes_1.int,
  /** The internal name of the model */
  name: (0, dataTypes_1.string)(64),
  /** Data size of MDL file in bytes */
  length: dataTypes_1.int,
  /** Position of player viewpoint relative to model origin */
  eyePosition: dataTypes_1.vec3,
  /** Corner of model hull box with the least X/Y/Z values */
  max: dataTypes_1.vec3,
  /** Opposite corner of model hull box */
  min: dataTypes_1.vec3,
  /** Min position of view bounding box */
  bbmin: dataTypes_1.vec3,
  /** Max position of view bounding box */
  bbmax: dataTypes_1.vec3,
  /**
   * Binary flags in little-endian order.
   * ex (00000001, 00000000, 00000000, 11000000) means flags for position
   * 0, 30, and 31 are set. Set model flags section for more information
   */
  flags: dataTypes_1.int,
  // After this point, the header contains many references to offsets
  // within the MDL file and the number of items at those offsets.
  // Offsets are from the very beginning of the file.
  // Note that indexes/counts are not always paired and ordered consistently.
  /** Number of bones */
  numBones: dataTypes_1.int,
  /** Offset of first data section */
  boneIndex: dataTypes_1.int,
  /** Number of bone controllers */
  numBoneControllers: dataTypes_1.int,
  /** Offset of bone controllers */
  boneControllerIndex: dataTypes_1.int,
  /** Number of complex bounding boxes */
  numHitboxes: dataTypes_1.int,
  /** Offset of hit boxes */
  hitBoxIndex: dataTypes_1.int,
  /** Number of sequences */
  numSeq: dataTypes_1.int,
  /** Offset of sequences */
  seqIndex: dataTypes_1.int,
  /** Number of demand loaded sequences */
  numSeqGroups: dataTypes_1.int,
  /** Offset of demand loaded sequences */
  seqGroupIndex: dataTypes_1.int,
  /** Number of raw textures */
  numTextures: dataTypes_1.int,
  /** Offset of raw textures */
  textureIndex: dataTypes_1.int,
  /** Offset of textures data */
  textureDataIndex: dataTypes_1.int,
  /** Number of replaceable textures */
  numSkinRef: dataTypes_1.int,
  numSkinFamilies: dataTypes_1.int,
  skinIndex: dataTypes_1.int,
  /** Number of body parts */
  numBodyParts: dataTypes_1.int,
  /** Index of body parts */
  bodyPartIndex: dataTypes_1.int,
  /** Number queryable attachable points */
  numAttachments: dataTypes_1.int,
  attachmentIndex: dataTypes_1.int,
  // This seems to be obsolete.
  // Probably replaced by events that reference external sounds?
  soundTable: dataTypes_1.int,
  soundIndex: dataTypes_1.int,
  soundGroups: dataTypes_1.int,
  soundGroupIndex: dataTypes_1.int,
  /** Animation node to animation node transition graph */
  numTransitions: dataTypes_1.int,
  transitionIndex: dataTypes_1.int
}
/**
 * Bone description
 */
exports.bone = {
  /** Bone name for symbolic links */
  name: (0, dataTypes_1.string)(32),
  /** Parent bone */
  parent: dataTypes_1.int,
  /** ?? */
  flags: dataTypes_1.int,
  /** Bone controller index, -1 == none */
  boneController: (0, dataTypes_1.array)(constants_1.MAX_PER_BONE_CONTROLLERS, dataTypes_1.int),
  /** Default DoF values */
  value: (0, dataTypes_1.array)(constants_1.MAX_PER_BONE_CONTROLLERS, dataTypes_1.float),
  /** Scale for delta DoF values */
  scale: (0, dataTypes_1.array)(constants_1.MAX_PER_BONE_CONTROLLERS, dataTypes_1.float)
}
/**
 * Bone controllers
 */
exports.boneController = {
  bone: dataTypes_1.int,
  type: dataTypes_1.int,
  start: dataTypes_1.float,
  end: dataTypes_1.float,
  rest: dataTypes_1.int,
  index: dataTypes_1.int
}
/**
 * Attachment
 */
exports.attachment = {
  name: (0, dataTypes_1.string)(32),
  type: dataTypes_1.int,
  bone: dataTypes_1.int,
  /** Attachment point */
  org: dataTypes_1.vec3,
  vectors: (0, dataTypes_1.array)(3, dataTypes_1.vec3)
}
/**
 * Bounding boxes
 */
exports.boundingBox = {
  bone: dataTypes_1.int,
  /** Intersection group */
  group: dataTypes_1.int,
  /** Bounding box */
  bbmin: dataTypes_1.vec3,
  bbmax: dataTypes_1.vec3
}
/**
 * Sequence description
 */
exports.seqDesc = {
  /** Sequence label */
  label: (0, dataTypes_1.string)(32),
  /** Frames per second */
  fps: dataTypes_1.float,
  /** Looping/non-looping flags */
  flags: dataTypes_1.int,
  activity: dataTypes_1.int,
  actWeight: dataTypes_1.int,
  numEvents: dataTypes_1.int,
  eventIndex: dataTypes_1.int,
  /** Number of frames per sequence */
  numFrames: dataTypes_1.int,
  /** Number of foot pivots */
  numPivots: dataTypes_1.int,
  pivotIndex: dataTypes_1.int,
  motionType: dataTypes_1.int,
  motionBone: dataTypes_1.int,
  linearMovement: dataTypes_1.vec3,
  autoMovePosIndex: dataTypes_1.int,
  autoMoveAngleIndex: dataTypes_1.int,
  /** Per sequence bounding box */
  bbmin: dataTypes_1.vec3,
  bbmax: dataTypes_1.vec3,
  numBlends: dataTypes_1.int,
  /** "anim" pointer relative to start of sequence group data */
  animIndex: dataTypes_1.int,
  // [blend][bone][X, Y, Z, XR, YR, ZR]
  /** X, Y, Z, XR, YR, ZR */
  blendType: (0, dataTypes_1.array)(2, dataTypes_1.int),
  /** Starting value */
  blendStart: (0, dataTypes_1.array)(2, dataTypes_1.float),
  /** Ending value */
  blendEnd: (0, dataTypes_1.array)(2, dataTypes_1.float),
  blendParent: dataTypes_1.int,
  /** Sequence group for demand loading */
  seqGroup: dataTypes_1.int,
  /** Transition node at entry */
  entryNode: dataTypes_1.int,
  /** Transition node at exit */
  exitNode: dataTypes_1.int,
  /** Transition rules */
  nodeFlags: dataTypes_1.int,
  /** Auto advancing sequences */
  nextSeq: dataTypes_1.int
}
/**
 * Demand loaded sequence groups
 */
exports.seqGroup = {
  /** Textual name */
  label: (0, dataTypes_1.string)(32),
  /** File name */
  name: (0, dataTypes_1.string)(64),
  /** Was "cache" - index pointer */
  unused1: dataTypes_1.int,
  /** Was "data" - hack for group 0 */
  unused2: dataTypes_1.int
}
/**
 * Body part index
 */
exports.bodyPart = {
  name: (0, dataTypes_1.string)(64),
  numModels: dataTypes_1.int,
  base: dataTypes_1.int,
  /** Index into models array */
  modelIndex: dataTypes_1.int
}
/**
 * Texture info
 */
exports.texture = {
  /** Texture name */
  name: (0, dataTypes_1.string)(64),
  /** Flags */
  flags: dataTypes_1.int,
  /** Texture width */
  width: dataTypes_1.int,
  /** Texture height */
  height: dataTypes_1.int,
  /** Texture data offset */
  index: dataTypes_1.int
}
/**
 * Sub models
 */
exports.subModel = {
  name: (0, dataTypes_1.string)(64),
  type: dataTypes_1.int,
  boundingRadius: dataTypes_1.float,
  numMesh: dataTypes_1.int,
  meshIndex: dataTypes_1.int,
  /** Number of unique vertices */
  numVerts: dataTypes_1.int,
  /** Vertex bone info */
  vertInfoIndex: dataTypes_1.int,
  /** Vertex vec3 */
  vertIndex: dataTypes_1.int,
  /** Number of unique surface normals */
  numNorms: dataTypes_1.int,
  /** Normal bone info */
  normInfoIndex: dataTypes_1.int,
  /** Normal vec3 */
  normIndex: dataTypes_1.int,
  /** Deformation groups */
  numGroups: dataTypes_1.int,
  groupIndex: dataTypes_1.int
}
/**
 * Mesh info
 */
exports.mesh = {
  numTris: dataTypes_1.int,
  triIndex: dataTypes_1.int,
  skinRef: dataTypes_1.int,
  /** Per mesh normals */
  numNorms: dataTypes_1.int,
  /** Normal vec3_t */
  normIndex: dataTypes_1.int
}
/**
 * Animation description
 */
exports.animation = {
  offset: (0, dataTypes_1.array)(6, dataTypes_1.ushort)
}
