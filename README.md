# deduplication

Fast multi-threaded content-dependent chunking deduplication for Buffers in C++ with a reference implementation in Javascript. Ships with extensive tests, a fuzz test and a benchmark.

## Installation

```
npm install @ronomon/deduplication
```

## Fast

`@ronomon/deduplication` is an adaptation of [FastCDC](https://www.usenix.org/system/files/conference/atc16/atc16-paper-xia.pdf) written for Node.js as a native addon in C++.

> FastCDC is about 10× faster than the best of open-source Rabin-based CDC, and about 3× faster
than the state-of-the-art Gear- and AE-based CDC, while achieving nearly the same deduplication ratio as the classic Rabin-based approach.

`@ronomon/deduplication` achieves chunking speeds comparable to FastCDC, while the benchmark and performance results shown here also include the overhead of SHA-256 hashing:

```
           CPU: Intel(R) Xeon(R) CPU E3-1230 V2 @ 3.30GHz
         Cores: 8
       Threads: 8
         Files: 64 x 4194304 Bytes

============================================================

         Chunk: 2048 Bytes (+1.42% E)
         Ratio: 97.96%
    Javascript: Latency: 196.375ms, Throughput: 160.36 MB/s
        Native: Latency: 30.911ms, Throughput: 1028.49 MB/s

         Chunk: 4096 Bytes (+7.57% E)
         Ratio: 97.40%
    Javascript: Latency: 164.572ms, Throughput: 192.70 MB/s
        Native: Latency: 30.058ms, Throughput: 1073.74 MB/s

         Chunk: 8192 Bytes (-1.76% E)
         Ratio: 96.75%
    Javascript: Latency: 150.184ms, Throughput: 211.03 MB/s
        Native: Latency: 29.742ms, Throughput: 1086.78 MB/s

         Chunk: 16384 Bytes (-4.88% E)
         Ratio: 95.19%
    Javascript: Latency: 142.566ms, Throughput: 222.58 MB/s
        Native: Latency: 29.792ms, Throughput: 1091.20 MB/s

         Chunk: 32768 Bytes (+20.57% E)
         Ratio: 89.73%
    Javascript: Latency: 139.043ms, Throughput: 227.68 MB/s
        Native: Latency: 29.426ms, Throughput: 1104.67 MB/s

         Chunk: 65536 Bytes (+3.61% E)
         Ratio: 84.11%
    Javascript: Latency: 138.047ms, Throughput: 229.63 MB/s
        Native: Latency: 29.470ms, Throughput: 1100.15 MB/s

         Chunk: 131072 Bytes (-16.45% E)
         Ratio: 75.44%
    Javascript: Latency: 135.161ms, Throughput: 233.42 MB/s
        Native: Latency: 29.472ms, Throughput: 1100.15 MB/s
```

## Multi-threaded

All chunking and hashing algorithms are executed asynchronously in the Node.js threadpool for multi-core throughput, without blocking the event loop. This effectively treats the event loop as the *control plane* and the threadpool as the *data plane*. Multiple `source` buffers can be deduplicated across multiple threads by simply calling `deduplicate()` concurrently from the event loop. The number of `deduplicate()` calls in flight will be limited by the size of the threadpool, and further calls to `deduplicate()` will wait for these to finish before executing. Please see the [crypto-async](https://github.com/ronomon/crypto-async#adjust-threadpool-size-and-control-concurrency) module for advice on increasing the size of the Node.js threadpool.

## Content-dependent chunking

Compared to fixed size chunking, which fails to detect most of the same chunk cut-points when file content is shifted slightly, variable size content-dependent chunking can find most chunk cut-points no matter how the chunks move around. You can tune the absolute `minimum` and `maximum` chunk sizes required, as well as the expected `average` chunk size required.

While content-dependent chunking is more CPU-intensive than fixed size chunking, the chunking algorithm of `@ronomon/deduplication` can detect chunks at a rate of more than 1.5 GB per second per CPU core. This is significantly faster than the SHA-256 hashing algorithm, which is 2.5× slower by way of contrast.

The following optimizations and variations on FastCDC are involved in the chunking algorithm:

* 31 bit integers to avoid 64 bit integers for the sake of the Javascript reference implementation.

* A right shift instead of a left shift to remove the need for an additional modulus operator, which would otherwise have been necessary to prevent overflow.

* Masks are no longer zero-padded since a right shift is used instead of a left shift.

* A more adaptive threshold based on a combination of `average` and `minimum` chunk size (rather than just `average` chunk size) to decide the pivot point at which to switch masks. A larger `minimum` chunk size now switches from the strict mask to the eager mask earlier.

* Masks use 1 bit of chunk size normalization instead of 2 bits of chunk size normalization.

## Deduplication

The 32 byte SHA-256 hash followed by the 4 byte `UInt32BE` size of each consecutive chunk will be written into the `target` buffer provided. You can use the SHA-256 hash combined with your own indexing scheme to determine whether a chunk should be stored on disk or transmitted across the network, and so reduce storage and bandwidth costs. You should apply deduplication before you apply compression.

## Compression and average chunk size

Compression and deduplication work in tension. Larger average chunk sizes achieve better compression ratios, while smaller average chunk sizes achieve better deduplication ratios. An `average` chunk size of 64 KB is recommended for optimal end-to-end deduplication and compression efficiency, according to the recommendations of [`Primary Data Deduplication - Large Scale Study and System Design`](https://www.usenix.org/system/files/conference/atc12/atc12-final293.pdf) by Microsoft. An `average` chunk size of 64 KB will not only maximize the combined savings from deduplication and compression, but will also minimize metadata overhead through reducing the average number of chunks considerably compared to typical `average` chunk sizes of 4 KB and 8 KB.

## Invariants

Most of these invariants are enforced with exceptions rather than asynchronous errors since they represent contract error rather than operational error:

* `@ronomon/deduplication` will ensure that all chunks meet your `minimum` and `maximum` chunk size requirements (except for the last chunk in the last `source` buffer, which you can indicate by `flags=1`), and that the actual average chunk size is within ±20% of your expected `average` chunk size.

* When tuning `average`, `minimum` and `maximum` chunk sizes, please ensure that the `(maximum - minimum > average)` invariant holds so that cut-points are not artificially forced instead of being content-dependent.

* Please ensure that `average`, `minimum` and `maximum` chunk sizes are within the reasonable and inclusive bounds determined by the respective `_MIN` and `_MAX` constants defined in the Javascript reference and C++ implementations.

* All integers, offsets and sizes must be at most 31 bits (2 GB) to avoid overflow and to optimize the Javascript reference implementation. Note that this does not place a limit on the size of file which can be deduplicated, since a file can be deduplicated in streaming fashion through multiple calls to `deduplicate()` (setting `flags=1` when the last `source` buffer is provided).

* When deduplicating a file in streaming fashion through multiple calls to `deduplicate()`, please ensure that your `source` buffer is larger than the `maximum` chunk size required until such time as you set `flags=1` to indicate that the last `source` buffer has been provided (when it can be smaller).

## Usage

Please try out the included demo (`node demo.js file`):

```javascript
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Deduplication = require(path.join(module.filename, '..', 'binding.node'));

var file = process.argv[2];
if (!file) {
  console.error('usage: node demo.js file');
  return;
}
var fd = fs.openSync(file, 'r');
var fileOffset = 0;
var fileSize = fs.fstatSync(fd).size;

// Recommended average, minimum and maximum chunk size constants:
var average = 65536;
var minimum = Math.round(average / 4);
var maximum = average * 8;

var source = Buffer.alloc(4 * 1024 * 1024);
var target = Buffer.alloc(Deduplication.targetSize(minimum, source.length));

function close(error) {
  fs.closeSync(fd);
  if (error) throw error;
}

function read() {
  var length = Math.min(source.length, fileSize - fileOffset);
  assert(length >= 0);
  if (length === 0) return close();
  var sourceSize = fs.readSync(fd, source, 0, length, fileOffset);
  if (sourceSize === 0) return close();
  write(sourceSize);
}

function write(sourceSize) {
  assert(fileOffset + sourceSize <= fileSize);
  var flags = 0;
  // We set flags = 1 to indicate if this is the last source buffer:
  if (fileOffset + sourceSize === fileSize) flags |= 1;
  Deduplication.deduplicate(
    average,
    minimum,
    maximum,
    source,
    0,
    sourceSize,
    target,
    0,
    flags,
    function(error, sourceOffset, targetOffset) {
      if (error) return close(error);
      assert(sourceOffset <= sourceSize);
      assert(sourceOffset <= source.length);
      assert(targetOffset <= target.length);
      var offset = 0;
      while (offset < targetOffset) {
        var hash = target.toString('hex', offset, offset + 32);
        offset += 32;
        var size = target.readUInt32BE(offset);
        offset += 4;
        console.log('hash=' + hash + ' offset=' + fileOffset + ' size=' + size);
        fileOffset += size;
      }
      assert(offset === targetOffset);
      if (flags === 1) assert(fileOffset === fileSize);
      read();
    }
  );
}

read();
```

## Tests

To test the native and Javascript bindings:

```
node test.js
```

## Benchmark

To benchmark the native and Javascript bindings:

```
node benchmark.js
```
