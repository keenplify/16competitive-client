'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.parseModel =
  exports.parseAnimValues =
  exports.parseAnimations =
  exports.parseTriangles =
  exports.parseVertBoneBuffer =
  exports.parseVertices =
  exports.parseMeshes =
  exports.parseSubModel =
  exports.parseSkinRef =
  exports.parseTextures =
  exports.parseBodyParts =
  exports.parseSequenceGroups =
  exports.parseSequences =
  exports.parseHitboxes =
  exports.parseAttachments =
  exports.parseBoneControllers =
  exports.parseBones =
  exports.parseHeader =
    void 0
var FastDataView = require('fast-dataview')
var MultiArrayView = require('multi-array-view')
var structs = require('../const/structs')
var constants_1 = require('../const/constants')
var BinaryReader = require('./binaryReader')
var dataTypes_1 = require('./dataTypes')
/**
 * Creates multiple reader
 * @internal
 */
var createMultipleParser = function (struct) {
  return function (dataView, offsetIndex, number) {
    return BinaryReader.readStructMultiple(dataView, struct, offsetIndex, number)
  }
}
/** Parses header of the MDL file */
var parseHeader = function (dataView) {
  return BinaryReader.readStruct(dataView, structs.header)
}
exports.parseHeader = parseHeader
/** Parses bones */
exports.parseBones = createMultipleParser(structs.bone)
/** Parses bone controllers */
exports.parseBoneControllers = createMultipleParser(structs.boneController)
/** Parses attachments */
exports.parseAttachments = createMultipleParser(structs.attachment)
/** Parses bounding boxes */
exports.parseHitboxes = createMultipleParser(structs.boundingBox)
/** Parses sequences */
exports.parseSequences = createMultipleParser(structs.seqDesc)
/** Parses sequence groups */
exports.parseSequenceGroups = createMultipleParser(structs.seqGroup)
/** Parses body parts */
exports.parseBodyParts = createMultipleParser(structs.bodyPart)
/** Parses textures info */
exports.parseTextures = createMultipleParser(structs.texture)
/** Parses skin references */
var parseSkinRef = function (buffer, skinRefOffset, numSkinRef) {
  return new Int16Array(buffer, skinRefOffset, numSkinRef)
}
exports.parseSkinRef = parseSkinRef
/**
 * Parses sub model
 * @todo make shorter
 */
var parseSubModel = function (dataView, bodyParts) {
  return bodyParts.map(function (bodyPart) {
    return BinaryReader.readStructMultiple(
      dataView,
      structs.subModel,
      bodyPart.modelIndex,
      bodyPart.numModels
    )
  })
}
exports.parseSubModel = parseSubModel
/**
 * Parses meshes
 * @todo make shorter
 */
var parseMeshes = function (dataView, subModels) {
  return subModels.map(function (bodyPart) {
    return bodyPart.map(function (subModel) {
      return BinaryReader.readStructMultiple(
        dataView,
        structs.mesh,
        subModel.meshIndex,
        subModel.numMesh
      )
    })
  })
}
exports.parseMeshes = parseMeshes
/**
 * Parses submodels vertices.
 * Path: vertices[bodyPartIndex][subModelIndex]
 */
var parseVertices = function (buffer, subModels) {
  return subModels.map(function (bodyPart) {
    return bodyPart.map(function (subModel) {
      return new Float32Array(buffer, subModel.vertIndex, subModel.numVerts * 3)
    })
  })
}
exports.parseVertices = parseVertices
/**
 * Parses ones vertices buffer.
 * Path: vertBoneBuffer[bodyPartIndex][subModelIndex]
 */
var parseVertBoneBuffer = function (buffer, subModels) {
  return subModels.map(function (bodyPart) {
    return bodyPart.map(function (subModel) {
      return new Uint8Array(buffer, subModel.vertInfoIndex, subModel.numVerts)
    })
  })
}
exports.parseVertBoneBuffer = parseVertBoneBuffer
/**
 * Parses meshes triangles.
 * Path: meshes[bodyPartIndex][subModelIndex][meshIndex]
 */
var parseTriangles = function (buffer, meshes, headerLength) {
  return meshes.map(function (bodyPart) {
    return bodyPart.map(function (subModel) {
      return subModel.map(function (mesh) {
        return new Int16Array(buffer, mesh.triIndex, Math.floor((headerLength - mesh.triIndex) / 2))
      })
    })
  })
}
exports.parseTriangles = parseTriangles
/**
 * Parses bone animations
 * @todo make shorter
 */
var parseAnimations = function (dataView, sequences, numBones) {
  return sequences.map(function (sequence) {
    return BinaryReader.readStructMultiple(
      dataView,
      structs.animation,
      sequence.animIndex,
      numBones
    )
  })
}
exports.parseAnimations = parseAnimations
/**
 * Parses animation values
 */
var parseAnimValues = function (dataView, sequences, animations, numBones) {
  var animStructLength = BinaryReader.getStructLength(structs.animation)
  // Create frames values array
  var animValues = MultiArrayView.create(
    [sequences.length, numBones, constants_1.AXLES_NUM, constants_1.MAX_SRCBONES, 3],
    Int16Array
  )
  for (var i = 0; i < sequences.length; i++) {
    for (var j = 0; j < numBones; j++) {
      var animationIndex = /* seqGroup.data + */ sequences[i].animIndex + j * animStructLength
      for (var axis = 0; axis < constants_1.AXLES_NUM; axis++) {
        for (var v = 0; v < constants_1.MAX_SRCBONES; v++) {
          var offset =
            animationIndex +
            animations[i][j].offset[axis + constants_1.AXLES_NUM] +
            v * dataTypes_1.short.byteLength
          // Using the "method" instead of applying a structure is an optimization of reading
          var value = dataTypes_1.short.getValue(dataView, offset)
          var valid = dataTypes_1.ubyte.getValue(dataView, offset)
          var total = dataTypes_1.ubyte.getValue(dataView, offset + dataTypes_1.ubyte.byteLength)
          animValues.set(value, i, j, axis, v, 0 /* ANIM_VALUE.VALUE */)
          animValues.set(valid, i, j, axis, v, 1 /* ANIM_VALUE.VALID */)
          animValues.set(total, i, j, axis, v, 2 /* ANIM_VALUE.TOTAL */)
        }
      }
    }
  }
  return animValues
}
exports.parseAnimValues = parseAnimValues
/**
 * Returns parsed data of MDL file. A MDL file is a binary buffer divided in
 * two part: header and data. Information about the data and their position is
 * in the header.
 * @param modelBuffer The MDL file buffer
 * @returns {ModelDataParser}
 */
var parseModel = function (modelBuffer) {
  // Create the DataView object from buffer of a MDL file for parsing
  var dataView = new FastDataView(modelBuffer)
  // Reading header of the model
  var header = (0, exports.parseHeader)(dataView)
  // Checking version of MDL file
  if (header.version !== constants_1.VERSION) {
    throw new Error('Unsupported version of the MDL file')
  }
  // Checking textures of the model
  // TODO: Handle model without textures
  if (!header.textureIndex || !header.numTextures) {
    throw new Error('No textures in the MDL file')
  }
  /// The data below will be used to obtain another data
  // Body parts info
  var bodyParts = (0, exports.parseBodyParts)(dataView, header.bodyPartIndex, header.numBodyParts)
  // Submodels info
  var subModels = (0, exports.parseSubModel)(dataView, bodyParts)
  // Meshes info
  var meshes = (0, exports.parseMeshes)(dataView, subModels)
  //  Model sequences info
  var sequences = (0, exports.parseSequences)(dataView, header.seqIndex, header.numSeq)
  // Bones animations
  var animations = (0, exports.parseAnimations)(dataView, sequences, header.numBones)
  // Animation frames
  var animValues = (0, exports.parseAnimValues)(dataView, sequences, animations, header.numBones)
  var modelData = {
    /** The header of the MDL file */
    header: header,
    // Main data that was obtained directly from the MDL file header
    /** Bones info */
    bones: (0, exports.parseBones)(dataView, header.boneIndex, header.numBones),
    /** Bone controllers */
    boneControllers: (0, exports.parseBoneControllers)(
      dataView,
      header.boneControllerIndex,
      header.numBoneControllers
    ),
    /** Model attachments */
    attachments: (0, exports.parseAttachments)(
      dataView,
      header.attachmentIndex,
      header.numAttachments
    ),
    /** Model hitboxes */
    hitBoxes: (0, exports.parseHitboxes)(dataView, header.hitBoxIndex, header.numHitboxes),
    /** Model sequences info */
    sequences: sequences,
    /** Sequences groups */
    sequenceGroups: (0, exports.parseSequenceGroups)(
      dataView,
      header.seqGroupIndex,
      header.numSeqGroups
    ),
    /** Body parts info */
    bodyParts: bodyParts,
    /** Textures info */
    textures: (0, exports.parseTextures)(dataView, header.textureIndex, header.numTextures),
    /** Skins references */
    skinRef: (0, exports.parseSkinRef)(dataView.buffer, header.skinIndex, header.numSkinRef),
    // Sub models data. This data was obtained by parsing data from body parts
    /** Submodels info */
    subModels: subModels,
    /** Meshes info. Path: meshes[bodyPartIndex][subModelIndex][meshIndex] */
    meshes: meshes,
    /** Submodels vertices. Path: vertices[bodyPartIndex][subModelIndex] */
    vertices: (0, exports.parseVertices)(dataView.buffer, subModels),
    /** Bones vertices buffer. Path: vertBoneBuffer[bodyPartIndex][subModelIndex] */
    vertBoneBuffer: (0, exports.parseVertBoneBuffer)(dataView.buffer, subModels),
    /** Mesh triangles. Path: meshes[bodyPartIndex][subModelIndex][meshIndex] */
    triangles: (0, exports.parseTriangles)(dataView.buffer, meshes, header.length),
    // Sequences data
    /** Bones animations */
    animations: animations,
    /** Animation frames */
    animValues: animValues
  }
  return modelData
}
exports.parseModel = parseModel
