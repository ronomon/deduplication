var crypto = require('crypto');
var Queue = require('@ronomon/queue');

var AVERAGE_MIN = 256;
var AVERAGE_MAX = 268435456;
var MINIMUM_MIN = 64;
var MINIMUM_MAX = 67108864;
var MAXIMUM_MIN = 1024;
var MAXIMUM_MAX = 1073741824;
var INTEGER_MAX = 2147483648 - 1;

var RNG = function(seed) {
  var self = this;
  if (seed === undefined) seed = Date.now();
  if (typeof seed !== 'number' || Math.round(seed) !== seed || seed < 0) {
    throw new Error('bad seed');
  }
  self.seed = seed % Math.pow(2, 31);
  self.hash = self.seed;
};

RNG.prototype.random = function() {
  var self = this;
  self.hash = ((self.hash + 0x7ED55D16) + (self.hash << 12)) & 0xFFFFFFF;
  self.hash = ((self.hash ^ 0xC761C23C) ^ (self.hash >>> 19)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0x165667B1) + (self.hash << 5)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0xD3A2646C) ^ (self.hash << 9)) & 0xFFFFFFF;
  self.hash = ((self.hash + 0xFD7046C5) + (self.hash << 3)) & 0xFFFFFFF;
  self.hash = ((self.hash ^ 0xB55A4F09) ^ (self.hash >>> 16)) & 0xFFFFFFF;
  return (self.hash & 0xFFFFFFF) / 0x10000000;
};

var Test = {};

Test.equal = function(value, expected, namespace, description) {
  value = JSON.stringify(value) + '';
  expected = JSON.stringify(expected) + '';
  if (value === expected) {
    Test.pass(namespace, description, expected);
  } else {
    Test.fail(namespace, description, value + ' !== ' + expected);
  }
};

Test.fail = function(namespace, description, message) {
  console.log('');
  throw 'FAIL: ' + Test.message(namespace, description, message);
};

Test.message = function(namespace, description, message) {
  if ((namespace = namespace || '')) namespace += ': ';
  if ((description = description || '')) description += ': ';
  return namespace + description + (message || '');
};

Test.pass = function(namespace, description, message) {
  console.log('PASS: ' + Test.message(namespace, description, message));
};

Test.random = (function() {
  var rng = new RNG(1);
  return rng.random.bind(rng);
})();

Test.randomBytes = (function() {
  var cipher = crypto.createCipheriv(
    'AES-256-CTR',
    Buffer.alloc(32),
    Buffer.alloc(16)
  );
  return function(size) {
    return cipher.update(Buffer.alloc(size));
  };
})();

function generateSource() {
  if (Test.random() < 0.95) {
    var size = Math.floor(Test.random() * 16 * 1024 * 1024);
  } else {
    var size = 0;
  }
  if (Test.random() < 0.2) {
    // Long repeating runs of the same byte tend to hit the maximum threshold.
    // This is good for deduplication ratio (and good for bug-spotting).
    return Buffer.alloc(size, Math.floor(Test.random() * 256));
  } else {
    return Test.randomBytes(size);
  }
}

function generateTarget(test) {
  var target = {};
  target.offset = Math.floor(Test.random() * 1024);
  target.buffer = Buffer.alloc(
    target.offset + (Math.ceil(test.sourceSize / test.minimum) * (32 + 4))
  );
  target.length = target.buffer.length;
  return target;
}

function generateTest() {
  var test = {};
  test.average = AVERAGE_MIN;
  test.average += Math.floor(Test.random() * 262144);
  test.average = Math.min(test.average, AVERAGE_MAX);
  test.minimum = MINIMUM_MIN;
  test.minimum += Math.floor(Test.random() * (test.average - MINIMUM_MIN));
  test.minimum = Math.min(test.minimum, MINIMUM_MAX);
  test.maximum = Math.max(
    MAXIMUM_MIN,
    test.average + 1,
    test.minimum + test.average
  );
  test.maximum += Math.floor(Test.random() * (test.average * 8));
  test.maximum = Math.min(test.maximum, MAXIMUM_MAX);
  test.source = generateSource();
  test.sourceHash = hash(test.source);
  test.sourceOffset = Math.floor(
    Test.random() * Math.min(128, test.source.length)
  );
  test.sourceSize = Math.floor(
    Test.random() * (test.source.length - test.sourceOffset)
  );
  test.bufferSize = Math.max(
    Math.round(
      Test.random() * test.maximum * Math.round(Test.random() * 8)
    ),
    test.maximum + 1
  );
  test.sourceLength = test.sourceOffset + test.sourceSize;
  return test;
}

function hash(buffer) {
  var hash = crypto.createHash('SHA256');
  hash.update(buffer);
  return hash.digest('hex');
}

function isInt(value) {
  if (typeof value !== 'number') return 'not a number: ' + value;
  if (Math.floor(value) !== value) return 'not an integer: ' + value;
  if (value < 0) return 'not a positive integer: ' + value;
  return value;
}

var units = [
  { name: 'Javascript', binding: require('./binding.js') },
  { name: 'Native', binding: require('./binding.node') }
];

var defaults = {
  average: 65536,
  minimum: Math.round(65536 / 4),
  maximum: 65536 * 8,
  source: Buffer.alloc(1024 * 1024),
  sourceOffset: 0,
  sourceSize: 1024 * 1024,
  target: Buffer.alloc(1024 * 1024),
  targetOffset: 0,
  flags: 0,
  callback: function() {}
};
var integerError = ' must be an unsigned 31 bit integer';
var exceptions = {
  deduplicate: [
    // average:
    {
      average: null,
      error: 'average' + integerError
    },
    {
      average: 1.01,
      error: 'average' + integerError
    },
    {
      average: -1,
      error: 'average' + integerError
    },
    {
      average: INTEGER_MAX + 1,
      error: 'average' + integerError
    },
    {
      average: AVERAGE_MIN - 1,
      error: 'average < AVERAGE_MIN'
    },
    {
      average: AVERAGE_MAX + 1,
      error: 'average > AVERAGE_MAX'
    },
    // minimum:
    {
      minimum: null,
      error: 'minimum' + integerError
    },
    {
      minimum: 0.99,
      error: 'minimum' + integerError
    },
    {
      minimum: -1,
      error: 'minimum' + integerError
    },
    {
      minimum: INTEGER_MAX + 1,
      error: 'minimum' + integerError
    },
    {
      minimum: MINIMUM_MIN - 1,
      error: 'minimum < MINIMUM_MIN'
    },
    {
      minimum: MINIMUM_MAX + 1,
      error: 'minimum > MINIMUM_MAX'
    },
    {
      minimum: defaults.average,
      error: 'minimum >= average'
    },
    // maximum:
    {
      maximum: null,
      error: 'maximum' + integerError
    },
    {
      maximum: 0.99,
      error: 'maximum' + integerError
    },
    {
      maximum: -1,
      error: 'maximum' + integerError
    },
    {
      maximum: INTEGER_MAX + 1,
      error: 'maximum' + integerError
    },
    {
      maximum: MAXIMUM_MIN - 1,
      error: 'maximum < MAXIMUM_MIN'
    },
    {
      maximum: MAXIMUM_MAX + 1,
      error: 'maximum > MAXIMUM_MAX'
    },
    {
      maximum: defaults.average,
      error: 'maximum <= average'
    },
    {
      maximum: defaults.average + defaults.minimum - 1,
      error: 'maximum - minimum < average'
    },
    // source:
    {
      source: 1,
      error: 'source must be a buffer'
    },
    {
      source: [],
      error: 'source must be a buffer'
    },
    // sourceOffset:
    {
      sourceOffset: null,
      error: 'sourceOffset' + integerError
    },
    {
      sourceOffset: 0.99,
      error: 'sourceOffset' + integerError
    },
    {
      sourceOffset: -1,
      error: 'sourceOffset' + integerError
    },
    {
      sourceOffset: INTEGER_MAX + 1,
      error: 'sourceOffset' + integerError
    },
    // sourceSize:
    {
      sourceSize: null,
      error: 'sourceSize' + integerError
    },
    {
      sourceSize: 0.99,
      error: 'sourceSize' + integerError
    },
    {
      sourceSize: -1,
      error: 'sourceSize' + integerError
    },
    {
      sourceSize: INTEGER_MAX + 1,
      error: 'sourceSize' + integerError
    },
    {
      sourceOffset: 1,
      error: 'source overflow'
    },
    {
      sourceSize: defaults.source.length + 1,
      error: 'source overflow'
    },
    // target:
    {
      target: 1,
      error: 'target must be a buffer'
    },
    {
      target: [],
      error: 'target must be a buffer'
    },
    // targetOffset:
    {
      targetOffset: null,
      error: 'targetOffset' + integerError
    },
    {
      targetOffset: 0.99,
      error: 'targetOffset' + integerError
    },
    {
      targetOffset: -1,
      error: 'targetOffset' + integerError
    },
    {
      targetOffset: INTEGER_MAX + 1,
      error: 'targetOffset' + integerError
    },
    {
      targetOffset: 1 + defaults.target.length - (
        Math.ceil(defaults.sourceSize / defaults.minimum) * (32 + 4)
      ),
      error: 'target overflow'
    },
    // flags:
    {
      flags: null,
      error: 'flags' + integerError
    },
    {
      flags: 0.99,
      error: 'flags' + integerError
    },
    {
      flags: -1,
      error: 'flags' + integerError
    },
    {
      flags: INTEGER_MAX + 1,
      error: 'flags' + integerError
    },
    {
      flags: 2,
      error: 'flags has an unknown flag'
    },
    {
      sourceSize: defaults.maximum,
      flags: 0,
      error: 'sourceSize <= maximum'
    },
    // callback:
    {
      callback: {},
      error: 'callback must be a function'
    }
  ]
};
function makeArgs(test) {
  var args = {};
  for (var arg in defaults) {
    args[arg] = defaults[arg];
  }
  for (var arg in test) {
    if (arg === 'error') continue;
    if (!defaults.hasOwnProperty(arg)) {
      throw new Error('unknown test arg: ' + arg);
    }
    args[arg] = test[arg];
  }
  return [
    args.average,
    args.minimum,
    args.maximum,
    args.source,
    args.sourceOffset,
    args.sourceSize,
    args.target,
    args.targetOffset,
    args.flags,
    args.callback
  ];
}
units.forEach(
  function(unit) {
    var namespace = 'Deduplication: ' + unit.name;
    Object.keys(exceptions).forEach(
      function(method) {
        exceptions[method].forEach(
          function(test) {
            var args = makeArgs(test);
            try {
              unit.binding[method].apply(unit.binding, args);
              Test.equal('', test.error, namespace, method + ' exception');
            } catch (error) {
              Test.equal(
                error.message,
                test.error,
                namespace,
                method + ' exception'
              );
            }
          }
        );
      }
    );
  }
);

var queue = new Queue(1);
queue.onData = function(testIndex, end) {
  var targets = [];
  var test = generateTest();
  var queue = new Queue(1);
  queue.onData = function(unit, end) {
    var namespace = 'Deduplication: ' + unit.name;
    var target = generateTarget(test);
    var sourceOffsetAdvanced = -1;
    var targetOffsetAdvanced = -1;
    var calls = 0;
    function verify(sourceOffset, targetOffset) {
      Test.equal(hash(test.source), test.sourceHash, namespace, 'source');
      var sourceSize = sourceOffset - test.sourceOffset;
      Test.equal(isInt(sourceSize), test.sourceSize, namespace, 'sourceSize');
      var targetSize = targetOffset - target.offset;
      Test.equal(isInt(targetSize), targetSize, namespace, 'targetSize');
      Test.equal(
        targetSize > 0,
        test.sourceSize > 0,
        namespace,
        'targetSize > 0'
      );
      Test.equal(targetSize % (32 + 4), 0, namespace, 'targetSize % (32 + 4)');
      var chunkIndex = 0;
      var sourceSlice = test.source.slice(test.sourceOffset, sourceOffset);
      var sourceSliceIndex = 0;
      var sourceSliceLength = sourceSlice.length;
      var targetSlice = target.buffer.slice(target.offset, targetOffset);
      var targetSliceIndex = 0;
      var targetSliceLength = targetSlice.length;
      while (targetSliceIndex < targetSliceLength) {
        var chunk = 'chunk ' + chunkIndex + ': ';
        var chunkSize = targetSlice.readUInt32BE(targetSliceIndex + 32);
        Test.equal(
          chunkSize > 0,
          true,
          namespace,
          chunk + 'size(' + chunkSize + ') > 0'
        );
        Test.equal(
          (chunkSize >= test.minimum) ||
          (targetSliceIndex + (32 + 4) === targetSliceLength),
          true,
          namespace,
          chunk + 'size(' + chunkSize + ') >= minimum(' + test.minimum + ')'
        );
        Test.equal(
          chunkSize <= test.maximum,
          true,
          namespace,
          chunk + 'size(' + chunkSize + ') <= maximum(' + test.maximum + ')'
        );
        Test.equal(
          (sourceSliceIndex + chunkSize) <= sourceSliceLength,
          true,
          namespace,
          chunk + 'size(' + chunkSize + ') + ' +
          'sourceIndex(' + sourceSliceIndex + ') <= ' +
          'sourceLength(' + sourceSliceLength + ')'
        );
        Test.equal(
          hash(
            sourceSlice.slice(sourceSliceIndex, sourceSliceIndex + chunkSize)
          ),
          targetSlice.toString('hex', targetSliceIndex, targetSliceIndex + 32),
          namespace,
          chunk + 'hash'
        );
        sourceSliceIndex += chunkSize;
        targetSliceIndex += 32 + 4;
        chunkIndex++;
      }
      Test.equal(
        sourceSliceIndex === sourceSliceLength &&
        sourceSliceIndex === test.sourceSize,
        true,
        namespace,
        'sourceIndex(' + sourceSliceIndex + ') === ' +
        'sourceLength(' + sourceSliceLength + ')'
      );
      targets.push(hash(targetSlice));
      end();
    }
    function write(error, sourceOffset, targetOffset) {
      if (error) throw error;
      if (calls > 0) {
        Test.equal(isInt(calls), calls, namespace, 'calls');
        Test.equal(error, undefined, namespace, 'error');
        Test.equal(
          isInt(sourceOffset),
          sourceOffset,
          namespace,
          'sourceOffset'
        );
        Test.equal(
          sourceOffset <= test.sourceLength,
          true,
          namespace,
          'sourceOffset <= sourceLength'
        );
        Test.equal(
          sourceOffset > sourceOffsetAdvanced,
          true,
          namespace,
          'sourceOffset advanced'
        );
        sourceOffsetAdvanced = sourceOffset;
        Test.equal(
          isInt(targetOffset),
          targetOffset,
          namespace,
          'targetOffset'
        );
        Test.equal(
          targetOffset <= target.length,
          true,
          namespace,
          'targetOffset <= target.length'
        );
        Test.equal(
          targetOffset > targetOffsetAdvanced,
          true,
          namespace,
          'targetOffset advanced'
        );
        targetOffsetAdvanced = targetOffset;
        if (sourceOffset === test.sourceLength) {
          return verify(sourceOffset, targetOffset);
        }
      }
      var flags = 0;
      var remainingSize = test.sourceLength - sourceOffset;
      var bufferSize = Math.min(test.bufferSize, remainingSize);
      if (bufferSize === remainingSize) flags |= 1;
      calls++;
      unit.binding.deduplicate(
        test.average,
        test.minimum,
        test.maximum,
        test.source,
        sourceOffset,
        bufferSize,
        target.buffer,
        targetOffset,
        flags,
        write
      );
    }
    Test.equal(
      isInt(test.sourceSize),
      test.sourceSize,
      namespace,
      'sourceSize'
    );
    write(undefined, test.sourceOffset, target.offset);
  };
  queue.onEnd = function(error) {
    if (error) throw error;
    if (targets.length !== units.length * 3) {
      // We do not test this visually (this is more of a meta-test):
      throw new Error('targets.length(' + targets.length + ' !== expected)');
    }
    var targetsIndex = 0;
    var targetsLength = targets.length;
    while (targetsIndex < targetsLength) {
      Test.equal(
        targets[targetsIndex],
        targets[0],
        'Deduplication: ' + units[targetsIndex % units.length].name,
        'target'
      );
      targetsIndex++;
    }
    end();
  };
  queue.concat(units);
  queue.concat(units);
  queue.concat(units); // Run each binding three times to test determinism.
  queue.end();
};
queue.onEnd = function(error) {
  if (error) throw error;
  var names = units.map(function(unit) { return unit.name; });
  console.log('Bindings Tested: ' + names.join(', '));
  console.log('================');
  console.log('PASSED ALL TESTS');
  console.log('================');
};
for (var testIndex = 1, length = 100; testIndex <= length; testIndex++) {
  queue.push(testIndex);
}
queue.end();
