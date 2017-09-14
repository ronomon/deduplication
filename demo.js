var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Deduplication = require(path.join(module.filename, '..', 'binding.node'));

var file = process.argv[2];
if (!file) {
  console.error('usage: node demo.js <file>');
  return;
}
var fd = fs.openSync(file, 'r');
var fileOffset = 0;
var chunkOffset = 0;

// Recommended average, minimum and maximum chunk size constants:
var average = 65536;
var minimum = Math.round(average / 4);
var maximum = average * 8;

var source = Buffer.alloc(4 * 1024 * 1024);
var target = Buffer.alloc(Deduplication.targetSize(minimum, source.length));

function close(error) {
  fs.closeSync(fd);
  if (error) throw error;
  assert(chunkOffset === fileOffset);
}

function read(sourceStart) {
  var length = source.length - sourceStart;
  assert(length > 0);
  var bytesRead = fs.readSync(fd, source, sourceStart, length, fileOffset);
  fileOffset += bytesRead;
  var flags = (bytesRead < length) ? 1 : 0;
  write(sourceStart + bytesRead, flags);
}

function write(sourceSize, flags) {
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
        console.log(
          'hash=' + hash + ' offset=' + chunkOffset + ' size=' + size
        );
        chunkOffset += size;
      }
      assert(offset === targetOffset);
      // Anything remaining in the source buffer should be moved to the
      // beginning of the source buffer, and become the sourceStart for the
      // next read so that we do not read data we have already read:
      var remaining = sourceSize - sourceOffset;
      if (remaining > 0) {
        // Assert that we can copy directly within the source buffer:
        assert(remaining < sourceOffset);
        source.copy(source, 0, sourceOffset, sourceOffset + remaining);
      }
      if (flags === 1) {
        assert(remaining === 0);
        close();
      } else {
        read(remaining);
      }
    }
  );
}

read(0);
