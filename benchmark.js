var crypto = require('crypto');
var Queue = require('@ronomon/queue');

var cpus = require('os').cpus();
var cpu = cpus[0].model;
var cores = cpus.length;
var threads = cores;

var units = [
  {
    name: 'Javascript',
    binding: require('./binding.js')
  },
  {
    name: 'Native',
    binding: require('./binding.node')
  }
];

function benchmark(unit, average, end) {
  var minimum = Math.round(average / 4);
  var maximum = average * 8;
  var sourceOffset = 0;
  var sourceSize = sources[0].length;
  var targetSize = Math.ceil(sourceSize / minimum) * (32 + 4);
  var flags = 1;
  var now = Date.now();
  var read = 0;
  var time = 0;
  var targets = [];
  var queue = new Queue(threads);
  queue.onData = function(source, end) {
    var target = Buffer.alloc(targetSize);
    var targetOffset = 0;
    var hrtime = process.hrtime();
    unit.binding.deduplicate(
      average,
      minimum,
      maximum,
      source,
      sourceOffset,
      sourceSize,
      target,
      targetOffset,
      flags,
      function(error, sourceOffset, targetOffset) {
        if (error) return end(error);
        var difference = process.hrtime(hrtime);
        var ns = (difference[0] * 1e9) + difference[1];
        read += sourceSize;
        time += ns;
        targets.push(target.slice(0, targetOffset));
        end();
      }
    );
  };
  queue.onEnd = function(error) {
    if (error) return end(error);
    var elapsed = Date.now() - now;
    var latency = (time / targets.length) / 1000000;
    var throughput = (read / elapsed) / 1000;
    var hashes = {};
    var chunks = 0;
    var logical = 0;
    var physical = 0;
    targets.forEach(
      function(target) {
        var targetIndex = 0;
        var targetLength = target.length;
        while (targetIndex < targetLength) {
          var hash = target.toString('hex', targetIndex, targetIndex + 32);
          var size = target.readUInt32BE(targetIndex + 32);
          if (!hashes.hasOwnProperty(hash)) {
            hashes[hash] = 1;
            logical += size;
            chunks++;
          }
          physical += size;
          targetIndex += (32 + 4);
        }
      }
    );
    var averageActual = Math.ceil(logical / chunks);
    var averageError = ((averageActual - average) / average * 100).toFixed(2);
    var ratio = (Math.abs(physical - logical) / physical * 100).toFixed(2);
    if (unit.name === 'Javascript') {
      display([
        'Chunk:',
        average + ' Bytes',
        '(' + (averageError >= 0 ? '+' : '') + averageError + '% E)'
      ]);
      display([ 'Ratio:', ratio + '%' ]);
    }
    display([
      unit.name + ':',
      'Latency:',
      latency.toFixed(3) + 'ms,',
      'Throughput:',
      throughput.toFixed(2) + ' MB/s'
    ]);
    end();
  };
  queue.concat(sources);
  queue.end();
}

function display(columns) {
  var string = columns[0];
  while (string.length < 15) string = ' ' + string;
  string += ' ' + columns.slice(1).join(' ');
  console.log(string);
}

function generateSource(cipher, source, index) {
  var sourceSize = source.length;
  var bufferSize = Math.ceil(sourceSize / 8);
  var buffers = [];
  var offset = 0;
  while (offset < sourceSize) {
    buffers.push(cipher.update(Buffer.alloc(index + 16)));
    buffers.push(source.slice(offset, offset += bufferSize));
  }
  return Buffer.concat(buffers).slice(0, sourceSize);
}

function generateSources() {
  var cipher = crypto.createCipheriv(
    'AES-256-CTR',
    Buffer.alloc(32),
    Buffer.alloc(16)
  );
  var sources = [];
  var master = cipher.update(Buffer.alloc(4 * 1024 * 1024));
  for (var index = 0, length = 64; index < length; index++) {
    sources.push(generateSource(cipher, master, index));
  }
  cipher.final();
  return sources;
}

var sources = generateSources();

console.log('');
display([ 'CPU:', cpu ]);
display([ 'Cores:', cores ]);
display([ 'Threads:', threads ]);
display([ 'Files:', sources.length + ' x ' + sources[0].length + ' Bytes' ]);
console.log('');
console.log('============================================================');
var queue = new Queue();
queue.onData = function(average, end) {
  console.log('');
  var queue = new Queue();
  queue.onData = function(unit, end) {
    benchmark(unit, average, end);
  };
  queue.onEnd = end;
  queue.concat(units);
  queue.end();
};
queue.onEnd = function(error) {
  if (error) throw error;
  console.log('');
};
queue.concat([
  2048,
  4096,
  8192,
  16384,
  32768,
  65536,
  131072
]);
queue.end();
