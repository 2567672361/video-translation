const path = require('path');
const sherpa = require('sherpa-onnx');

console.log('sherpa version:', sherpa.version);
console.log('sherpa gitSha1:', sherpa.gitSha1);
console.log('sherpa gitDate:', sherpa.gitDate);
console.log('sherpa exports:', Object.keys(sherpa));

const modelDir = path.join(__dirname, '../k2transducer-zipformer-large-zh-onnx-online-yuekai-20250630');

console.log('\nModel directory:', modelDir);

const config = {
  featConfig: {
    sampleRate: 16000,
    featureDim: 80
  },
  modelConfig: {
    transducer: {
      encoder: path.join(modelDir, 'encoder.int8.onnx'),
      decoder: path.join(modelDir, 'decoder.onnx'),
      joiner: path.join(modelDir, 'joiner.int8.onnx')
    },
    tokens: path.join(modelDir, 'tokens.txt'),
    numThreads: 1,
    provider: 'cpu',
    debug: 1
  },
  decodingMethod: 'greedy_search',
  maxActivePaths: 4,
  enableEndpoint: 1,
  rule1MinTrailingSilence: 1.2,
  rule2MinTrailingSilence: 0.3,
  rule3MinUtteranceLength: 2.0
};

console.log('\nConfig:', JSON.stringify(config, null, 2));

try {
  console.log('\nTrying to create online recognizer...');
  const recognizer = sherpa.createOnlineRecognizer(config);
  console.log('✓ Recognizer created successfully!');
  
  console.log('\nCreating stream...');
  const stream = recognizer.createStream();
  console.log('✓ Stream created successfully!');
  
  console.log('\nTesting basic functionality...');
  console.log('✓ All basic checks passed!');
  
} catch (error) {
  console.error('\n✗ Error:', error.message);
  console.error('Error stack:', error.stack);
}
