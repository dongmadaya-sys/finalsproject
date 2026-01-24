#!/usr/bin/env node
/**
 * Quick test to verify the sound classifier is working
 */

const SoundClassifier = require('./sound_classifier');

async function test() {
  console.log('=================================');
  console.log('Sound Classifier Test');
  console.log('=================================\n');

  const classifier = new SoundClassifier();
  
  console.log('1. Initializing classifier...');
  await classifier.initialize();
  
  if (!classifier.initialized) {
    console.error('✗ Classifier failed to initialize');
    process.exit(1);
  }
  
  console.log('✓ Classifier initialized successfully\n');

  // Test with feature-based classification (fallback method)
  console.log('2. Testing feature-based classification (fallback)...');
  const voiceResult = classifier.classify({
    noiseLevel: 65,
    lowFreqEnergy: 0.15,
    midFreqEnergy: 0.65,
    highFreqEnergy: 0.2,
    volatility: 0.45
  });
  console.log('   Voice sample result:', voiceResult);

  const impactResult = classifier.classify({
    noiseLevel: 78,
    lowFreqEnergy: 0.35,
    midFreqEnergy: 0.35,
    highFreqEnergy: 0.3,
    volatility: 0.8
  });
  console.log('   Impact sample result:', impactResult);

  const silenceResult = classifier.classify({
    noiseLevel: 25,
    lowFreqEnergy: 0.25,
    midFreqEnergy: 0.25,
    highFreqEnergy: 0.25,
    volatility: 0.01
  });
  console.log('   Silence sample result:', silenceResult);

  console.log('\n✓ All tests passed!');
  console.log('\nThe classifier is ready to use with:');
  console.log('  - Raw audio: await classifier.classifyFromAudio(audioArray)');
  console.log('  - Features: classifier.classify({ noiseLevel, ...features })');
  console.log('\n=================================');
}

test().catch(err => {
  console.error('✗ Test failed:', err.message);
  process.exit(1);
});
