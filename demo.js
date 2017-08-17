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
