const fs = require('fs');
const path = require('path');

function imageToBase64(imagePath) {
  try {
    const buffer = fs.readFileSync(imagePath);
    const base64 = buffer.toString('base64');
    
    // Detect MIME type from extension
    const ext = path.extname(imagePath).toLowerCase();
    let mimeType = 'image/png';
    if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.gif') mimeType = 'image/gif';
    else if (ext === '.webp') mimeType = 'image/webp';
    
    return {
      raw: base64,
      dataUrl: `data:${mimeType};base64,${base64}`,
      length: base64.length
    };
  } catch (error) {
    console.error(`Error reading file: ${error.message}`);
    process.exit(1);
  }
}

function formatForYaml(base64String, width = 80) {
  // Split into lines of specified width for readability
  const lines = [];
  for (let i = 0; i < base64String.length; i += width) {
    lines.push(base64String.slice(i, i + width));
  }
  return lines.join('\n    ');
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log(`
Usage: node convert-image-to-base64.js <image-file> [options]

Options:
  --yaml          Format output for YAML (with indentation)
  --width=N       Line width for YAML format (default: 80)
  --data-url      Include data URL prefix

Examples:
  node convert-image-to-base64.js button.png
  node convert-image-to-base64.js button.png --yaml
  node convert-image-to-base64.js button.png --yaml --width=60
    `);
    process.exit(0);
  }
  
  const imagePath = args[0];
  const useYaml = args.includes('--yaml');
  const useDataUrl = args.includes('--data-url');
  const widthArg = args.find(arg => arg.startsWith('--width='));
  const width = widthArg ? parseInt(widthArg.split('=')[1]) : 80;
  
  if (!fs.existsSync(imagePath)) {
    console.error(`File not found: ${imagePath}`);
    process.exit(1);
  }
  
  const result = imageToBase64(imagePath);
  
  console.log('\n=== Base64 Output ===\n');
  
  if (useDataUrl) {
    console.log('Data URL format (for HTML/CSS):');
    console.log(result.dataUrl.slice(0, 100) + '...\n');
  }
  
  if (useYaml) {
    console.log('YAML format (copy this to your flow file):');
    console.log('template_data: |');
    console.log('    ' + formatForYaml(result.raw, width));
  } else {
    console.log('Raw base64 (one line):');
    console.log(result.raw.slice(0, 100) + '...\n');
    console.log(`Total length: ${result.length} characters`);
  }
  
  console.log('\n=== Usage in Flow YAML ===\n');
  console.log('Direct inline:');
  console.log(`  template_data: "${result.raw.slice(0, 50)}..."`);
  console.log('\nWith YAML anchor (define once, reuse):');
  console.log(`  my_template: &my_template`);
  console.log(`    ${formatForYaml(result.raw, width)}`);
  console.log(`  template_data: *my_template`);
}

module.exports = { imageToBase64, formatForYaml };
