#include <assert.h>
#include <math.h>
#include <nan.h>
#include <openssl/evp.h>
#include <openssl/hmac.h>
#include <stdint.h>

uint32_t ceil_div(uint32_t x, uint32_t y) {
  return (x % y) ? (x / y) : ((x / y) + 1);
}

const uint32_t AVERAGE_MIN = 256;
const uint32_t AVERAGE_MAX = 268435456;
const uint32_t MINIMUM_MIN = 64;
const uint32_t MINIMUM_MAX = 67108864;
const uint32_t MAXIMUM_MIN = 1024;
const uint32_t MAXIMUM_MAX = 1073741824;
const uint32_t INTEGER_MAX = 2147483648 - 1;

const uint32_t TABLE[256] = {
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
};

uint32_t centerSize(
  const uint32_t average,
  const uint32_t minimum,
  const uint32_t sourceSize
) {
  uint32_t offset = minimum + ceil_div(minimum, 2);
  if (offset > average) offset = average;
  uint32_t size = average - offset;
  if (size > sourceSize) return sourceSize;
  return size;
}

int32_t cut(
  const uint32_t average,
  const uint32_t minimum,
  const uint32_t maximum,
  const uint32_t mask1,
  const uint32_t mask2,
  const unsigned char *source,
  uint32_t sourceOffset,
  uint32_t sourceSize,
  const uint32_t flags
) {
  if (sourceSize <= minimum) {
    if (flags == 0) return 0;
    return sourceSize;
  }
  if (sourceSize > maximum) sourceSize = maximum;
  const uint32_t sourceStart = sourceOffset;
  const uint32_t sourceLength1 = sourceOffset + centerSize(
    average,
    minimum,
    sourceSize
  );
  const uint32_t sourceLength2 = sourceOffset + sourceSize;
  uint32_t hash = 0;
  sourceOffset += minimum;
  while (sourceOffset < sourceLength1) {
    hash = (hash >> 1) + TABLE[source[sourceOffset++]];
    if (!(hash & mask1)) return sourceOffset - sourceStart;
  }
  while (sourceOffset < sourceLength2) {
    hash = (hash >> 1) + TABLE[source[sourceOffset++]];
    if (!(hash & mask2)) return sourceOffset - sourceStart;
  }
  if (flags == 0 && sourceSize < maximum) return 0;
  return sourceSize;
}

int hash(
  const unsigned char *source,
  uint32_t sourceOffset,
  uint32_t sourceSize,
  unsigned char *target,
  uint32_t targetOffset
) {
  const EVP_MD *digest = EVP_sha256();
  if (!digest) return 0;
  EVP_MD_CTX *ctx = EVP_MD_CTX_new();
  if (!ctx) return 0;
  if (!EVP_DigestInit_ex(ctx, digest, NULL)) {
    EVP_MD_CTX_free(ctx);
    return 0;
  }
  if (!EVP_DigestUpdate(ctx, source + sourceOffset, (size_t) sourceSize)) {
    EVP_MD_CTX_free(ctx);
    return 0;
  }
  if (!EVP_DigestFinal_ex(ctx, target + targetOffset, NULL)) {
    EVP_MD_CTX_free(ctx);
    return 0;
  }
  EVP_MD_CTX_free(ctx);
  return 1;
}

int integer(v8::Local<v8::Value> value) {
  return value->IsUint32() && value->Uint32Value() < INTEGER_MAX;
}

uint32_t logarithm2(const uint32_t integer) {
  // Input -> Output:
  // 65537 -> 16
  // 65536 -> 16
  // 65535 -> 16
  // 32769 -> 15
  // 32768 -> 15
  // 32767 -> 15
  return (uint32_t) round(log2(integer));
}

uint32_t mask(const uint32_t bits) {
  assert(bits >= 1);
  assert(bits <= 31);
  return ((uint32_t) pow(2, bits)) - 1;
}

class DeduplicateWorker : public Nan::AsyncWorker {
 public:
  DeduplicateWorker(
   const uint32_t average,
   const uint32_t minimum,
   const uint32_t maximum,
   const uint32_t mask1,
   const uint32_t mask2,
   v8::Local<v8::Object> &sourceHandle,
   uint32_t sourceOffset,
   const uint32_t sourceLength,
   v8::Local<v8::Object> &targetHandle,
   uint32_t targetOffset,
   const uint32_t targetLength,
   const uint32_t flags,
   Nan::Callback *callback
 ) : Nan::AsyncWorker(callback),
     average(average),
     minimum(minimum),
     maximum(maximum),
     mask1(mask1),
     mask2(mask2),
     sourceOffset(sourceOffset),
     sourceLength(sourceLength),
     targetOffset(targetOffset),
     targetLength(targetLength),
     flags(flags) {
       SaveToPersistent("sourceHandle", sourceHandle);
       SaveToPersistent("targetHandle", targetHandle);
       source = reinterpret_cast<const unsigned char*>(
         node::Buffer::Data(sourceHandle)
       );
       target = reinterpret_cast<unsigned char*>(
         node::Buffer::Data(targetHandle)
       );
  }

  ~DeduplicateWorker() {}

  void Execute() {
    while (sourceOffset < sourceLength) {
      const uint32_t chunkSize = cut(
        average,
        minimum,
        maximum,
        mask1,
        mask2,
        source,
        sourceOffset,
        sourceLength - sourceOffset,
        flags
      );
      if (chunkSize == 0) break;
      if (chunkSize < minimum && flags == 0) {
        return SetErrorMessage("chunkSize < minimum && flags === 0");
      }
      if (chunkSize > maximum) {
        return SetErrorMessage("chunkSize > maximum");
      }
      if (sourceOffset + chunkSize > sourceLength) {
        return SetErrorMessage("sourceOffset + chunkSize > sourceLength");
      }
      if (targetOffset + 32 + 4 > targetLength) {
        return SetErrorMessage("target overflow");
      }
      if (!hash(source, sourceOffset, chunkSize, target, targetOffset)) {
        return SetErrorMessage("hash failed");
      }
      targetOffset += 32;
      target[targetOffset + 0] = chunkSize >> 24;
      target[targetOffset + 1] = (chunkSize >> 16) & 255;
      target[targetOffset + 2] = (chunkSize >> 8) & 255;
      target[targetOffset + 3] = chunkSize & 255;
      targetOffset += 4;
      sourceOffset += chunkSize;
    }
  }

  void HandleOKCallback () {
    Nan::HandleScope scope;

    v8::Local<v8::Value> argv[] = {
      Nan::Undefined(),
      Nan::New<v8::Number>(sourceOffset),
      Nan::New<v8::Number>(targetOffset)
    };
    callback->Call(3, argv, async_resource);
  }

 private:
   const uint32_t average;
   const uint32_t minimum;
   const uint32_t maximum;
   const uint32_t mask1;
   const uint32_t mask2;
   const unsigned char *source;
   uint32_t sourceOffset;
   const uint32_t sourceLength;
   unsigned char *target;
   uint32_t targetOffset;
   const uint32_t targetLength;
   const uint32_t flags;
};

NAN_METHOD(deduplicate) {
  if (info.Length() != 10) {
    return Nan::ThrowError("bad number of arguments");
  }
  if (!integer(info[0])) {
    return Nan::ThrowError("average must be an unsigned 31 bit integer");
  }
  const uint32_t average = info[0]->Uint32Value();
  if (average < AVERAGE_MIN) return Nan::ThrowError("average < AVERAGE_MIN");
  if (average > AVERAGE_MAX) return Nan::ThrowError("average > AVERAGE_MAX");
  if (!integer(info[1])) {
    return Nan::ThrowError("minimum must be an unsigned 31 bit integer");
  }
  const uint32_t minimum = info[1]->Uint32Value();
  if (minimum < MINIMUM_MIN) return Nan::ThrowError("minimum < MINIMUM_MIN");
  if (minimum > MINIMUM_MAX) return Nan::ThrowError("minimum > MINIMUM_MAX");
  if (minimum >= average) return Nan::ThrowError("minimum >= average");
  if (!integer(info[2])) {
    return Nan::ThrowError("maximum must be an unsigned 31 bit integer");
  }
  const uint32_t maximum = info[2]->Uint32Value();
  if (maximum < MAXIMUM_MIN) return Nan::ThrowError("maximum < MAXIMUM_MIN");
  if (maximum > MAXIMUM_MAX) return Nan::ThrowError("maximum > MAXIMUM_MAX");
  if (maximum <= average) return Nan::ThrowError("maximum <= average");
  if (maximum - minimum < average) {
    return Nan::ThrowError("maximum - minimum < average");
  }
  if (!node::Buffer::HasInstance(info[3])) {
    return Nan::ThrowError("source must be a buffer");
  }
  v8::Local<v8::Object> sourceHandle = info[3].As<v8::Object>();
  if (!integer(info[4])) {
    return Nan::ThrowError("sourceOffset must be an unsigned 31 bit integer");
  }
  uint32_t sourceOffset = info[4]->Uint32Value();
  if (!integer(info[5])) {
    return Nan::ThrowError("sourceSize must be an unsigned 31 bit integer");
  }
  const uint32_t sourceSize = info[5]->Uint32Value();
  const uint32_t sourceLength = sourceOffset + sourceSize;
  if (sourceLength > node::Buffer::Length(sourceHandle)) {
    return Nan::ThrowError("source overflow");
  }
  if (!node::Buffer::HasInstance(info[6])) {
    return Nan::ThrowError("target must be a buffer");
  }
  v8::Local<v8::Object> targetHandle = info[6].As<v8::Object>();
  if (!integer(info[7])) {
    return Nan::ThrowError("targetOffset must be an unsigned 31 bit integer");
  }
  uint32_t targetOffset = info[7]->Uint32Value();
  const uint32_t chunks = ceil_div(sourceSize, minimum);
  const uint32_t targetLength = targetOffset + (chunks * (32 + 4));
  if (targetLength > node::Buffer::Length(targetHandle)) {
    return Nan::ThrowError("target overflow");
  }
  if (!integer(info[8])) {
    return Nan::ThrowError("flags must be an unsigned 31 bit integer");
  }
  const uint32_t flags = info[8]->Uint32Value();
  if (flags != 0 && flags != 1) {
    return Nan::ThrowError("flags has an unknown flag");
  }
  if (flags == 0 && sourceSize <= maximum) {
    return Nan::ThrowError("sourceSize <= maximum");
  }
  if (!info[9]->IsFunction()) {
    return Nan::ThrowError("callback must be a function");
  }
  Nan::Callback *callback = new Nan::Callback(info[9].As<v8::Function>());
  const uint32_t bits = logarithm2(average);
  if (bits < 8) return Nan::ThrowError("average must be at least 8 bits");
  if (bits > 28) return Nan::ThrowError("average must be at most 28 bits");
  const uint32_t mask1 = mask(bits + 1);
  const uint32_t mask2 = mask(bits - 1);
  Nan::AsyncQueueWorker(new DeduplicateWorker(
    average,
    minimum,
    maximum,
    mask1,
    mask2,
    sourceHandle,
    sourceOffset,
    sourceLength,
    targetHandle,
    targetOffset,
    targetLength,
    flags,
    callback
  ));
}

NAN_METHOD(targetSize) {
  if (info.Length() != 2) {
    return Nan::ThrowError("bad number of arguments");
  }
  if (!integer(info[0])) {
    return Nan::ThrowError("minimum must be an unsigned 31 bit integer");
  }
  const uint32_t minimum = info[0]->Uint32Value();
  if (minimum < MINIMUM_MIN) return Nan::ThrowError("minimum < MINIMUM_MIN");
  if (minimum > MINIMUM_MAX) return Nan::ThrowError("minimum > MINIMUM_MAX");
  if (!integer(info[1])) {
    return Nan::ThrowError("sourceSize must be an unsigned 31 bit integer");
  }
  const uint32_t sourceSize = info[1]->Uint32Value();
  const uint32_t targetSize = ceil_div(sourceSize, minimum) * (32 + 4);
  info.GetReturnValue().Set(Nan::New<v8::Number>(targetSize));
}

NAN_MODULE_INIT(Init) {
  assert(INTEGER_MAX <= INT32_MAX);
  NAN_EXPORT(target, deduplicate);
  NAN_EXPORT(target, targetSize);
}

NODE_MODULE(binding, Init)

// S.D.G.
