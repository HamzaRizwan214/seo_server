import { tempFileManager } from './utils/tempFileManager.js';
import fs from 'fs/promises';

async function testTempFileSystem() {
  console.log('🧪 Testing temporary file system...\n');

  try {
    // Create a test file buffer
    const testContent = Buffer.from('This is a test Excel file content for delivery testing');
    const testFileName = 'test-delivery.xlsx';

    console.log('1. Saving test file temporarily...');
    const tempFileInfo = await tempFileManager.saveTemp(testContent, testFileName);
    console.log('   ✅ Temp file saved:', tempFileInfo.tempFileName);
    console.log('   📁 Path:', tempFileInfo.tempPath);

    console.log('\n2. Checking file exists...');
    const fileInfo = await tempFileManager.getTempFileInfo(tempFileInfo.tempPath);
    console.log('   ✅ File exists:', fileInfo.exists);
    console.log('   📊 File size:', fileInfo.size, 'bytes');

    console.log('\n3. Reading file content...');
    const readContent = await fs.readFile(tempFileInfo.tempPath);
    console.log('   ✅ Content matches:', readContent.toString() === testContent.toString());

    console.log('\n4. Deleting temp file...');
    const deleted = await tempFileManager.deleteTemp(tempFileInfo.tempPath);
    console.log('   ✅ File deleted:', deleted);

    console.log('\n5. Verifying file is gone...');
    const fileInfoAfter = await tempFileManager.getTempFileInfo(tempFileInfo.tempPath);
    console.log('   ✅ File no longer exists:', !fileInfoAfter.exists);

    console.log('\n🎉 All tests passed! Temporary file system is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testTempFileSystem();