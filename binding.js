'use strict';

var crypto = require('crypto');

var AVERAGE_MIN = 256;
var AVERAGE_MAX = 268435456;
var MINIMUM_MIN = 64;
var MINIMUM_MAX = 67108864;
var MAXIMUM_MIN = 1024;
var MAXIMUM_MAX = 1073741824;
var INTEGER_MAX = 2147483648 - 1;

var TABLE = new Uint32Array([
  1553318008, 574654857,  759734804,  310648967,  1393527547, 1195718329,
  694400241,  1154184075, 1319583805, 1298164590, 122602963,  989043992,
  1918895050, 933636724,  1369634190, 1963341198, 1565176104, 1296753019,
  1105746212, 1191982839, 1195494369, 29065008,   1635524067, 722221599,
  1355059059, 564669751,  1620421856, 1100048288, 1018120624, 1087284781,
  1723604070, 1415454125, 737834957,  1854265892, 1605418437, 1697446953,
  973791659,  674750707,  1669838606, 320299026,  1130545851, 1725494449,
  939321396,  748475270,  554975894,  1651665064, 1695413559, 671470969,
  992078781,  1935142196, 1062778243, 1901125066, 1935811166, 1644847216,
  744420649,  2068980838, 1988851904, 1263854878, 1979320293, 111370182,
  817303588,  478553825,  694867320,  685227566,  345022554,  2095989693,
  1770739427, 165413158,  1322704750, 46251975,   710520147,  700507188,
  2104251000, 1350123687, 1593227923, 1756802846, 1179873910, 1629210470,
  358373501,  807118919,  751426983,  172199468,  174707988,  1951167187,
  1328704411, 2129871494, 1242495143, 1793093310, 1721521010, 306195915,
  1609230749, 1992815783, 1790818204, 234528824,  551692332,  1930351755,
  110996527,  378457918,  638641695,  743517326,  368806918,  1583529078,
  1767199029, 182158924,  1114175764, 882553770,  552467890,  1366456705,
  934589400,  1574008098, 1798094820, 1548210079, 821697741,  601807702,
  332526858,  1693310695, 136360183,  1189114632, 506273277,  397438002,
  620771032,  676183860,  1747529440, 909035644,  142389739,  1991534368,
  272707803,  1905681287, 1210958911, 596176677,  1380009185, 1153270606,
  1150188963, 1067903737, 1020928348, 978324723,  962376754,  1368724127,
  1133797255, 1367747748, 1458212849, 537933020,  1295159285, 2104731913,
  1647629177, 1691336604, 922114202,  170715530,  1608833393, 62657989,
  1140989235, 381784875,  928003604,  449509021,  1057208185, 1239816707,
  525522922,  476962140,  102897870,  132620570,  419788154,  2095057491,
  1240747817, 1271689397, 973007445,  1380110056, 1021668229, 12064370,
  1186917580, 1017163094, 597085928,  2018803520, 1795688603, 1722115921,
  2015264326, 506263638,  1002517905, 1229603330, 1376031959, 763839898,
  1970623926, 1109937345, 524780807,  1976131071, 905940439,  1313298413,
  772929676,  1578848328, 1108240025, 577439381,  1293318580, 1512203375,
  371003697,  308046041,  320070446,  1252546340, 568098497,  1341794814,
  1922466690, 480833267,  1060838440, 969079660,  1836468543, 2049091118,
  2023431210, 383830867,  2112679659, 231203270,  1551220541, 1377927987,
  275637462,  2110145570, 1700335604, 738389040,  1688841319, 1506456297,
  1243730675, 258043479,  599084776,  41093802,   792486733,  1897397356,
  28077829,   1520357900, 361516586,  1119263216, 209458355,  45979201,
  363681532,  477245280,  2107748241, 601938891,  244572459,  1689418013,
  1141711990, 1485744349, 1181066840, 1950794776, 410494836,  1445347454,
  2137242950, 852679640,  1014566730, 1999335993, 1871390758, 1736439305,
  231222289,  603972436,  783045542,  370384393,  184356284,  709706295,
  1453549767, 591603172,  768512391,  854125182
]);

function assertBuffer(key, value) {
  if (Buffer.isBuffer(value)) return;
  if (value && value.constructor.name === 'Uint8Array') return;
  throw new Error(key + ' must be a buffer');
}

function assertFunction(key, value) {
  if (typeof value !== 'function') {
    throw new Error(key + ' must be a function');
  }
}

function assertInteger(key, value) {
  if (
    typeof value !== 'number' ||
    Math.floor(value) !== value ||
    value < 0 ||
    value > INTEGER_MAX
  ) {
    throw new Error(key + ' must be an unsigned 31 bit integer');
  }
}

function centerSize(average, minimum, sourceSize) {
  var offset = minimum + Math.ceil(minimum / 2);
  if (offset > average) offset = average;
  var size = average - offset;
  if (size > sourceSize) return sourceSize;
  return size;
}

function cut(
  average,
  minimum,
  maximum,
  mask1,
  mask2,
  source,
  sourceOffset,
  sourceSize
) {
  if (sourceSize <= minimum) return sourceSize;
  if (sourceSize > maximum) sourceSize = maximum;
  var sourceStart = sourceOffset;
  var sourceBalance = average - Math.min(
    average,
    minimum + Math.ceil(minimum / 2)
  );
  var sourceLength1 = sourceOffset + centerSize(average, minimum, sourceSize);
  var sourceLength2 = sourceOffset + sourceSize;
  var hash = 0;
  sourceOffset += minimum;
  while (sourceOffset < sourceLength1) {
    hash = (hash >>> 1) + TABLE[source[sourceOffset++]];
    if (!(hash & mask1)) return sourceOffset - sourceStart;
  }
  while (sourceOffset < sourceLength2) {
    hash = (hash >>> 1) + TABLE[source[sourceOffset++]];
    if (!(hash & mask2)) return sourceOffset - sourceStart;
  }
  return sourceOffset - sourceStart;
}

function deduplicate(
  average,
  minimum,
  maximum,
  source,
  sourceOffset,
  sourceSize,
  target,
  targetOffset,
  flags,
  callback
) {
  if (callback === undefined) {
    throw new Error('bad number of arguments');
  }
  assertInteger('average', average);
  if (average < AVERAGE_MIN) throw new Error('average < AVERAGE_MIN');
  if (average > AVERAGE_MAX) throw new Error('average > AVERAGE_MAX');
  assertInteger('minimum', minimum);
  if (minimum < MINIMUM_MIN) throw new Error('minimum < MINIMUM_MIN');
  if (minimum > MINIMUM_MAX) throw new Error('minimum > MINIMUM_MAX');
  if (minimum >= average) throw new Error('minimum >= average');
  assertInteger('maximum', maximum);
  if (maximum < MAXIMUM_MIN) throw new Error('maximum < MAXIMUM_MIN');
  if (maximum > MAXIMUM_MAX) throw new Error('maximum > MAXIMUM_MAX');
  if (maximum <= average) throw new Error('maximum <= average');
  if (maximum - minimum < average) {
    throw new Error('maximum - minimum < average');
  }
  assertBuffer('source', source);
  assertInteger('sourceOffset', sourceOffset);
  assertInteger('sourceSize', sourceSize);
  var sourceLength = sourceOffset + sourceSize;
  if (sourceLength > source.length) throw new Error('source overflow');
  assertBuffer('target', target);
  assertInteger('targetOffset', targetOffset);
  var chunks = Math.ceil(sourceSize / minimum);
  var targetLength = targetOffset + (chunks * (32 + 4));
  if (targetLength > target.length) throw new Error('target overflow');
  assertInteger('flags', flags);
  if (flags !== 0 && flags !== 1) throw new Error('flags has an unknown flag');
  if (flags === 0 && sourceSize <= maximum) {
    throw new Error('sourceSize <= maximum');
  }
  assertFunction('callback', callback);
  var bits = logarithm2(average);
  assertInteger('bits', bits);
  if (bits < 8) throw new Error('average must be at least 8 bits');
  if (bits > 28) throw new Error('average must be at most 28 bits');
  var mask1 = mask(bits + 1);
  assertInteger('mask1', mask1);
  var mask2 = mask(bits - 1);
  assertInteger('mask2', mask2);
  while (sourceOffset < sourceLength) {
    var chunkSize = cut(
      average,
      minimum,
      maximum,
      mask1,
      mask2,
      source,
      sourceOffset,
      sourceLength - sourceOffset
    );
    if (chunkSize <= 0) {
      throw new Error('chunkSize <= 0');
    }
    if (chunkSize < minimum && flags === 0) {
      throw new Error('chunkSize < minimum && flags === 0');
    }
    if (chunkSize > maximum) {
      throw new Error('chunkSize > maximum');
    }
    if (sourceOffset + chunkSize > sourceLength) {
      throw new Error('sourceOffset + chunkSize > sourceLength');
    }
    if (flags === 0 && (sourceOffset + chunkSize) === sourceLength) break;
    if (targetOffset + 32 + 4 > targetLength) {
      throw new Error('target overflow');
    }
    hash(source, sourceOffset, chunkSize, target, targetOffset);
    targetOffset += 32;
    target[targetOffset + 0] = chunkSize >> 24;
    target[targetOffset + 1] = (chunkSize >> 16) & 255;
    target[targetOffset + 2] = (chunkSize >> 8) & 255;
    target[targetOffset + 3] = chunkSize & 255;
    targetOffset += 4;
    sourceOffset += chunkSize;
  }
  setImmediate(
    function() {
      callback(undefined, sourceOffset, targetOffset);
    }
  );
}

function hash(
  source,
  sourceOffset,
  sourceSize,
  target,
  targetOffset
) {
  var digest = crypto.createHash('SHA256');
  digest.update(source.slice(sourceOffset, sourceOffset + sourceSize));
  digest.digest().copy(target, targetOffset);
}

function logarithm2(integer) {
  assertInteger('integer', integer);
  if (typeof Math.LOG2E !== 'number') {
    throw new Error('Math.LOG2E !== number');
  }
  return Math.round(Math.log(integer) * Math.LOG2E);
}

function mask(bits) {
  assertInteger('bits', bits);
  if (bits < 1) throw new Error('bits < 1');
  if (bits > 31) throw new Error('bits > 31');
  return Math.pow(2, bits) - 1;
}

function targetSize(minimum, sourceSize) {
  assertInteger('minimum', minimum);
  if (minimum < MINIMUM_MIN) throw new Error('minimum < MINIMUM_MIN');
  if (minimum > MINIMUM_MAX) throw new Error('minimum > MINIMUM_MAX');
  assertInteger('sourceSize', sourceSize);
  return Math.ceil(sourceSize / minimum) * (32 + 4);
}

module.exports.deduplicate = deduplicate;

module.exports.targetSize = targetSize;

// S.D.G.
