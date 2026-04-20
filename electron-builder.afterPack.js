const path = require('path');
const fs = require('fs');
const { rcedit } = require('rcedit');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);
  const iconPath = path.join(context.packager.projectDir, 'electron', 'icon.ico');

  if (!fs.existsSync(exePath)) {
    return;
  }

  await rcedit(exePath, {
    icon: iconPath,
    'file-version': context.packager.appInfo.version,
    'product-version': context.packager.appInfo.version,
    'version-string': {
      CompanyName: 'Pretty Policy Analyzer',
      FileDescription: 'Pretty Policy Analyzer',
      ProductName: 'Pretty Policy Analyzer',
      InternalName: 'Pretty Policy Analyzer',
      OriginalFilename: exeName,
    },
  });
};
