const sharp = require('sharp');

sharp({
  create: {
    width: 1,
    height: 1,
    channels: 3,
    background: '#fff',
  },
})
  .png()
  .toBuffer()
  .then(buffer => console.log('sharp-ok', buffer.length))
  .catch(error => {
    console.error(error.message);
    process.exit(1);
  });
