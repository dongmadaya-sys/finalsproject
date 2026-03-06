/**
 * Test the Human Voice Filter
 * Simulates audio classification and verifies only human voice is processed
 */

const SoundClassifier = require('./sound_classifier');

async function testVoiceFilter() {
  console.log('=================================');
  console.log('Human Voice Filter Test');
  console.log('=================================\n');

  const classifier = new SoundClassifier();
  await classifier.initialize();

  // Test cases
  const testCases = [
    { 
      name: 'Human Speech', 
      features: { noiseLevel: 60, lowFreqEnergy: 0.3, midFreqEnergy: 0.6, highFreqEnergy: 0.2, volatility: 0.25 },
      expectedResult: 'human_voice',
      shouldProcess: true
    },
    { 
      name: 'Loud Speech', 
      features: { noiseLevel: 68, lowFreqEnergy: 0.2, midFreqEnergy: 0.7, highFreqEnergy: 0.1, volatility: 0.3 },
      expectedResult: 'human_voice',
      shouldProcess: true
    },
    { 
      name: 'Raised Speech', 
      features: { noiseLevel: 57, lowFreqEnergy: 0.3, midFreqEnergy: 0.6, highFreqEnergy: 0.15, volatility: 0.25 },
      expectedResult: 'human_voice',
      shouldProcess: true
    },
    { 
      name: 'Background Noise', 
      features: { noiseLevel: 35, lowFreqEnergy: 0.4, midFreqEnergy: 0.3, highFreqEnergy: 0.3, volatility: 0.1 },
      expectedResult: 'silence',
      shouldProcess: false
    },
    { 
      name: 'Impact Noise (Chair Drag)', 
      features: { noiseLevel: 78, lowFreqEnergy: 0.55, midFreqEnergy: 0.3, highFreqEnergy: 0.65, volatility: 0.65 },
      expectedResult: 'silence',
      shouldProcess: false
    },
    { 
      name: 'Mechanical Sound (Fan)', 
      features: { noiseLevel: 80, lowFreqEnergy: 0.3, midFreqEnergy: 0.4, highFreqEnergy: 0.65, volatility: 0.2 },
      expectedResult: 'silence',
      shouldProcess: false
    },
    { 
      name: 'Silence', 
      features: { noiseLevel: 25, lowFreqEnergy: 0.1, midFreqEnergy: 0.1, highFreqEnergy: 0.1, volatility: 0.05 },
      expectedResult: 'silence',
      shouldProcess: false
    }
  ];

  console.log('Testing classifier output with voice filter logic:\n');

  let passCount = 0;
  let failCount = 0;

  for (const test of testCases) {
    const result = classifier.classify(test.features);
    const isHumanVoice = result.soundType === 'human_voice';
    const wouldPass = isHumanVoice; // Only human_voice passes the filter
    const testPassed = wouldPass === test.shouldProcess;

    const status = testPassed ? '✓ PASS' : '✗ FAIL';
    const filterStatus = wouldPass ? '→ ALLOWED' : '→ BLOCKED';

    console.log(`${status} | ${test.name}`);
    console.log(`       Classification: ${result.soundType} (${(result.confidence * 100).toFixed(0)}%)`);
    console.log(`       Filter Action: ${filterStatus}`);
    console.log();

    if (testPassed) passCount++;
    else failCount++;
  }

  console.log('=================================');
  console.log(`Results: ${passCount} passed, ${failCount} failed`);
  console.log('=================================');

  if (failCount === 0) {
    console.log('✓ All tests passed! Voice filter is working correctly.');
    console.log('  Only human voice will be processed and forwarded.');
  } else {
    console.log('✗ Some tests failed. Review the filter logic.');
  }
}

testVoiceFilter().catch(console.error);
